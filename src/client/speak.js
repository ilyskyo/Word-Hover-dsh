/**
 * 发音。
 *
 * 优先用 Web Speech API（speechSynthesis）：离线、零网络请求、不泄露任何数据。
 * 失败时回落到词典返回的 mp3 地址；两条路都不行就明确告诉用户，而不是静默无声。
 *
 * ⚠️ 这里踩过三个真实的坑（Electron/Chromium 下都成立）：
 *   1. `speechSynthesis.cancel()` 紧接 `speak()` 时，Chromium 可能把刚排队的
 *      utterance 一并丢弃 → 必须先创建 utterance、再 cancel、最后 speak；
 *   2. `getVoices()` 首次调用常常返回空数组（语音列表异步加载）。
 *      此时**绝不能**给 utterance 赋 `voice = undefined`，某些构建会因此静默失败，
 *      应当直接不设 voice，让引擎用默认英语嗓音；
 *   3. `speak()` 不报错不代表真的发声 —— 必须用 onstart/onerror + 超时双重判定，
 *      确认失败后回落到音频。
 */

let cachedVoice = null;
let voicesWarmed = false;

function getVoices() {
  try {
    return speechSynthesis?.getVoices?.() || [];
  } catch {
    return [];
  }
}

/** 挑一个英语嗓音；列表为空时返回 null（表示「不指定，用引擎默认」）。 */
function pickEnglishVoice() {
  if (cachedVoice) return cachedVoice;
  const voices = getVoices();
  if (voices.length === 0) return null;
  cachedVoice = voices.find((v) => /^en[-_]US/i.test(v.lang))
    || voices.find((v) => /^en[-_]GB/i.test(v.lang))
    || voices.find((v) => /^en/i.test(v.lang))
    || null;
  return cachedVoice;
}

/** 语音列表是异步加载的，提前订阅一次，加载完就清掉缓存重新挑。 */
export function warmUpVoices() {
  if (voicesWarmed) return;
  voicesWarmed = true;
  if (typeof speechSynthesis === 'undefined') return;
  try {
    getVoices();
    speechSynthesis.addEventListener?.('voiceschanged', () => {
      cachedVoice = null;
      pickEnglishVoice();
    }, { once: true });
  } catch { /* 不支持就算了 */ }
}

let audioEl = null;

/** 播放 mp3 兜底。成功返回 true。 */
function playUrl(url, onFail) {
  if (!url) { onFail?.('no-url'); return false; }
  try {
    if (!audioEl) {
      audioEl = new Audio();
      audioEl.preload = 'auto';
    }
    audioEl.pause();
    audioEl.src = url;
    audioEl.currentTime = 0;
    const promise = audioEl.play();
    if (promise && typeof promise.catch === 'function') {
      promise.catch((error) => onFail?.(error?.name || 'play-rejected'));
    }
    return true;
  } catch (error) {
    onFail?.(error?.name || 'play-threw');
    return false;
  }
}

/** 允许注入以便单测（默认用真实实现）。 */
let ttsOverride = null;
let audioOverride = null;
export function __setSpeakImplForTest(impl) {
  ttsOverride = impl?.tts ?? null;
  audioOverride = impl?.audio ?? null;
}

/**
 * 朗读一个单词。
 *
 * @param {string} word
 * @param {string} [audioUrl] 词典返回的音频地址（可空）
 * @param {{onStatus?:(status:string)=>void}} [options]
 *        onStatus 会收到 'speaking' | 'audio' | 'failed'，供 UI 反馈。
 * @returns {boolean} 是否已尝试发声（不代表一定成功，成功与否看 onStatus）
 */
export function speak(word, audioUrl, options = {}) {
  const onStatus = typeof options.onStatus === 'function' ? options.onStatus : () => {};
  if (typeof word !== 'string' || !word.trim()) { onStatus('failed'); return false; }

  if (audioOverride) { audioOverride(word, audioUrl, onStatus); return true; }
  warmUpVoices();

  const canTts = typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance === 'function';

  /** 语音失败 → 回落音频；音频也失败 → 报告 failed。 */
  const fallbackToAudio = (reason) => {
    const audioUrlFinal = audioUrl;
    if (!audioUrlFinal) { onStatus('failed'); return; }
    if (!playUrl(audioUrlFinal, () => onStatus('failed'))) onStatus('failed');
    else onStatus('audio');
    void reason;
  };

  if (canTts || ttsOverride) {
    try {
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = 'en-US';
      utterance.rate = 0.95;
      // 关键：列表为空时**不要**赋 voice，交给引擎选默认英语嗓音
      const voice = pickEnglishVoice();
      if (voice) utterance.voice = voice;

      let settled = false;
      let started = false;

      utterance.onstart = () => {
        started = true;
        if (!settled) { settled = true; onStatus('speaking'); }
      };
      utterance.onend = () => { started = true; };
      utterance.onerror = () => {
        if (settled) return;
        settled = true;
        fallbackToAudio('tts-error');
      };

      // 超时判定：没报错但也没开始朗读（Electron 上确实会发生）→ 回落音频。
      // 注意：这里不 clearTimeout，交给 onstart/onerror 里的判定，
      // 否则「静默失败」这条路径会被自己清掉。
      const timer = setTimeout(() => {
        clearTimeout(timer);
        if (started || settled) return;
        settled = true;
        fallbackToAudio('tts-silent');
      }, 700);

      // 顺序不能颠倒：先建 utterance，再 cancel 上一次，最后 speak。
      // 反过来的话 Chromium 可能把刚排队的 utterance 一起丢掉。
      try { speechSynthesis.cancel(); } catch { /* 忽略 */ }
      speechSynthesis.speak(utterance);
      return true;
    } catch { /* 直接落到音频兜底 */ }
  }

  fallbackToAudio('tts-unavailable');
  return true;
}

/** 停止当前朗读（关闭浮层时调用）。 */
export function stopSpeaking() {
  try { speechSynthesis?.cancel?.(); } catch { /* 忽略 */ }
  try { audioEl?.pause?.(); } catch { /* 忽略 */ }
}
