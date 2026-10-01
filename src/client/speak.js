/**
 * 发音。
 *
 * 优先用 Web Speech API（speechSynthesis）：离线、零网络请求、不泄露任何数据。
 * 失败时回落到词典提供的 mp3；两条路都不行就明确告诉用户，而不是静默无声。
 *
 * ⚠️ 这里踩过四个真实的坑（Electron/Chromium 下都成立）：
 *
 *   1. `speechSynthesis.cancel()` 紧接 `speak()` 时，Chromium 可能把刚排队的
 *      utterance 一并丢弃 → 必须先创建 utterance、再 cancel、最后 speak。
 *
 *   2. `getVoices()` 首次调用常返回空数组（语音列表异步加载）。此时**绝不能**
 *      给 utterance 赋 `voice = undefined`，某些构建会因此静默失败 ——
 *      应当直接不设 voice，让引擎用默认英语嗓音。
 *
 *   3. **「读两下」的根因**：语音合成没有 onstart/onerror 回调时，需要用超时
 *      兜底去回落 mp3；但部分平台上 `onstart` 根本不触发，而声音其实已经出来了。
 *      这样超时一到就又播一遍 mp3，听感就是「一次读两下」。
 *      → 现在改用**音频活动检测**：只要在这一轮里观察到任何 Web Speech 活动
 *        （onstart / onboundary / onend），就认为语音已经出声，超时不再回落。
 *        同时超时延长到 1000ms，给慢启动留余量。
 *
 *   4. 连点两次时 `cancel()` 是异步生效的，两次朗读会叠在一起。
 *      → 加了「最小调用间隔」去抖：太近的重复调用直接忽略。
 */

/** 语音启动的最长等待时间；超时且**全程没有任何音频活动**才回落 mp3。 */
const TTS_START_TIMEOUT_MS = 1000;
/** 两次发音之间的最小间隔；期间内的重复调用被忽略（防止连点导致叠加朗读）。 */
const MIN_GAP_MS = 400;

let cachedVoice = null;
let voicesWarmed = false;
let lastSpeakAt = 0;

function getVoices() {
  try {
    return speechSynthesis?.getVoices?.() || [];
  } catch {
    return [];
  }
}

/**
 * 挑一个英语嗓音。
 * @param {'us'|'uk'} accent
 * @returns {SpeechSynthesisVoice|null} null 表示「不指定，用引擎默认」
 */
function pickEnglishVoice(accent = 'us') {
  const voices = getVoices();
  if (voices.length === 0) return null;

  const want = accent === 'uk' ? /^en[-_]GB/i : /^en[-_]US/i;
  const other = accent === 'uk' ? /^en[-_]US/i : /^en[-_]GB/i;

  if (cachedVoice && want.test(cachedVoice.lang || '')) return cachedVoice;

  const found = voices.find((v) => want.test(v.lang || ''))
    || voices.find((v) => other.test(v.lang || '')) // 没有目标口音就退而求其次
    || voices.find((v) => /^en/i.test(v.lang || ''))
    || null;
  cachedVoice = found;
  return found;
}

/** 语音列表是异步加载的，提前订阅一次，加载完就清掉选择重新挑。 */
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
/** 最近一次播放的音频上下文，用于互斥与状态判定。 */
let audioToken = 0;
/** Web Speech 发声成功后记录时间，用于抑制紧随其后的音频回落。 */
let lastTtsAudioAt = 0;
/** 判定「TTS 已经出过声」的窗口。 */
const TTS_AUDIO_WINDOW_MS = 2500;

function isTtsAudioRecent() {
  return Date.now() - lastTtsAudioAt < TTS_AUDIO_WINDOW_MS;
}

/** 播放 mp3 兜底。成功返回 true。 */
function playUrl(url, onFail) {
  if (!url) { onFail?.('no-url'); return false; }
  try {
    if (!audioEl) {
      audioEl = new Audio();
      audioEl.preload = 'auto';
    }
    audioToken += 1;
    const token = audioToken;
    audioEl.pause();
    audioEl.src = url;
    audioEl.currentTime = 0;
    const promise = audioEl.play();
    if (promise && typeof promise.catch === 'function') {
      promise.catch((error) => {
        if (token !== audioToken) return; // 已被后续调用取代，不再报告
        onFail?.(error?.name || 'play-rejected');
      });
    }
    return true;
  } catch (error) {
    onFail?.(error?.name || 'play-threw');
    return false;
  }
}

/** 允许注入以便单测（默认用真实实现）。 */
let audioOverride = null;
export function __setSpeakImplForTest(impl) {
  audioOverride = impl?.audio ?? null;
}
/** 单测用：重置模块内部的时间状态。 */
export function __resetSpeakStateForTest() {
  lastSpeakAt = 0;
  cachedVoice = null;
  voicesWarmed = false;
  audioToken += 1;
}

/**
 * 朗读一个单词。
 *
 * @param {string} word
 * @param {{audio?: {us?:string, uk?:string}, accent?: 'us'|'uk',
 *          onStatus?:(status:string)=>void}} [options]
 *        audio  词典返回的音频地址（按口音区分，可只给一个）
 *        accent 'us' 美音（默认）| 'uk' 英音
 *        onStatus 收到 'speaking' | 'audio' | 'failed'，供 UI 反馈
 * @returns {boolean} 是否已尝试发声（成功与否看 onStatus）
 */
export function speak(word, options = {}) {
  const onStatus = typeof options.onStatus === 'function' ? options.onStatus : () => {};
  if (typeof word !== 'string' || !word.trim()) { onStatus('failed'); return false; }

  const accent = options.accent === 'uk' ? 'uk' : 'us';
  const audioUrl = options.audio?.[accent] || options.audio?.us || options.audio?.uk || '';

  if (audioOverride) { audioOverride(word, audioUrl, onStatus, accent); return true; }

  // 去抖：太近的重复调用直接忽略，避免 cancel() 未生效时两次朗读叠加
  const now = Date.now();
  if (now - lastSpeakAt < MIN_GAP_MS) return true;
  lastSpeakAt = now;

  warmUpVoices();
  const canTts = typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance === 'function';

  /** 语音失败 → 回落音频；音频也失败 → 报告 failed。 */
  const fallbackToAudio = (reason) => {
    // 关键：如果这一轮已经听到过语音，就不要再放 mp3 —— 那正是「读两下」的来源
    if (isTtsAudioRecent()) { onStatus('speaking'); return; }
    if (!audioUrl) { onStatus('failed'); return; }
    if (!playUrl(audioUrl, () => onStatus('failed'))) onStatus('failed');
    else onStatus('audio');
    void reason;
  };

  if (canTts) {
    try {
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = accent === 'uk' ? 'en-GB' : 'en-US';
      utterance.rate = 0.95;
      // 列表为空时不要赋 voice，交给引擎选默认英语嗓音
      const voice = pickEnglishVoice(accent);
      if (voice) utterance.voice = voice;

      let settled = false;

      /**
       * 观测到「确实出声」的唯一入口。
       *
       * onstart / onboundary / onend 三者中任意一个触发都算出声 ——
       * 部分平台不触发 onstart 但会触发 onboundary（逐词边界事件）。
       * 同时把状态推进到 speaking，避免底部提示一直停在「点击朗读」。
       */
      const markHeard = () => {
        lastTtsAudioAt = Date.now();
        if (settled) return;
        settled = true;
        onStatus('speaking');
      };

      utterance.onstart = markHeard;
      utterance.onboundary = markHeard;
      utterance.onend = markHeard;
      utterance.onerror = () => {
        if (settled) return;
        settled = true;
        fallbackToAudio('tts-error');
      };

      // 兜底：等待 TTS_START_TIMEOUT_MS，只有「全程没有任何音频活动」才回落音频。
      // 这是修复「读两下」的关键 —— 以前只看 onstart，而它在部分平台不触发。
      const timer = setTimeout(() => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        fallbackToAudio('tts-silent');
      }, TTS_START_TIMEOUT_MS);

      // 顺序不能颠倒：先建 utterance，再 cancel 上一次，最后 speak
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
