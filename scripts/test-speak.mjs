/**
 * 发音逻辑测试。
 *
 * 覆盖的是「点击朗读没反应」与「一次读两下」这两类回归：
 *
 *   1. 语音合成可用 → 用语音，状态报 speaking；
 *   2. 语音列表为空 → **不能**给 utterance 赋空 voice（Electron 下会静默失败）；
 *   3. 语音报错 → 回落到词典音频；
 *   4. 语音「什么都不报」→ 超时后回落音频，最终报 failed（无音频时）；
 *   5. ★ 语音**已经出声但没触发 onstart**（部分平台如此）→ 超时**不得**再放 mp3，
 *      否则听感就是「一次读两下」；
 *   6. 连点两次 → 第二次被去抖忽略，不叠加朗读；
 *   7. 口音：美音/英音分别选对应嗓音与对应录音。
 *
 * 用法： node scripts/test-speak.mjs
 */

let failures = 0;
let checks = 0;
function check(label, condition, detail = '') {
  checks += 1;
  if (condition) console.log(`  ✓ ${label}`);
  else { failures += 1; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

/**
 * 每个用例都重新加载一次模块，因为它内部保存了 voice 选择与调用时间戳。
 * @param {object} options
 *   voices           可用的语音列表
 *   speakBehaviour   'start' 正常出 onstart | 'error' 报错 | 'silent' 什么都不报
 *   boundary        是否触发 onboundary（模拟「已出声但没 onstart」）
 */
async function freshSpeak({ voices = [], speakBehaviour = 'start', boundary = false } = {}) {
  const moduleUrl = new URL('../src/client/speak.js', import.meta.url).href
    + `?t=${Math.random()}`;
  const log = { spoken: [], cancelled: 0, played: [], utterance: null };

  globalThis.speechSynthesis = {
    getVoices: () => voices,
    cancel() { log.cancelled += 1; },
    speak(u) {
      log.utterance = u;
      log.spoken.push(u.text);
      if (speakBehaviour === 'start') setTimeout(() => u.onstart?.(), 0);
      else if (speakBehaviour === 'error') setTimeout(() => u.onerror?.(), 0);
      else if (boundary) setTimeout(() => u.onboundary?.(), 0);
      // 'silent'：既不回调 onstart 也不回调 onerror —— 模拟「没有任何回调」
    },
    addEventListener() {},
  };
  class FakeUtterance {
    constructor(text) {
      this.text = text;
      this.lang = '';
      this.rate = 1;
      this.voice = null;
      this.onstart = null;
      this.onerror = null;
      this.onend = null;
      this.onboundary = null;
    }
    addEventListener() {}
  }
  globalThis.SpeechSynthesisUtterance = FakeUtterance;

  globalThis.Audio = class {
    constructor() { this.paused = true; }
    pause() { this.paused = true; }
    play() {
      log.played.push(this.src);
      if (log.playRejects) return Promise.reject(new Error('NotAllowedError'));
      return Promise.resolve();
    }
    set src(v) { this._src = v; }
    get src() { return this._src; }
  };

  const mod = await import(moduleUrl);
  return { mod, log };
}

/** 等到某个条件成立（或超时）。 */
function waitFor(fn, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (fn()) { resolve(true); return; }
      if (Date.now() - started > timeoutMs) { resolve(false); return; }
      setTimeout(tick, 20);
    };
    tick();
  });
}

/** 等一小段固定时间（用于确认「不该发生的事」确实没发生）。 */
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const AUDIO = { us: 'https://example.com/bug-us.mp3', uk: 'https://example.com/bug-uk.mp3' };
const US_VOICE = [{ lang: 'en-US', name: 'Test US' }];
const UK_VOICE = [{ lang: 'en-GB', name: 'Test UK' }];

console.log('发音逻辑测试\n');

console.log('[1] 语音合成可用');
{
  const { mod, log } = await freshSpeak({ voices: US_VOICE, speakBehaviour: 'start' });
  const statuses = [];
  // 模块内部有最小调用间隔去抖，每个用例都是全新模块，不受影响
  const ok = mod.speak('bug', { audio: AUDIO, accent: 'us', onStatus: (s) => statuses.push(s) });
  check('speak 返回 true', ok === true);
  check('调用了 speechSynthesis.speak', log.spoken.length === 1, JSON.stringify(log.spoken));
  check('朗读文本正确', log.spoken[0] === 'bug', String(log.spoken[0]));
  check('美音 lang 为 en-US', log.utterance?.lang === 'en-US', String(log.utterance?.lang));
  check('绑定了英语嗓音', Boolean(log.utterance?.voice), '未绑定 voice');
  check('先 cancel 再 speak', log.cancelled >= 1, `cancel 次数 ${log.cancelled}`);
  check('状态报为 speaking', await waitFor(() => statuses.includes('speaking')), JSON.stringify(statuses));
  await delay(1200);
  check('★ 语音正常时不会额外播 mp3（不读两下）', log.played.length === 0, JSON.stringify(log.played));
}

console.log('\n[2] 英音');
{
  const { mod, log } = await freshSpeak({ voices: UK_VOICE, speakBehaviour: 'start' });
  mod.speak('bug', { audio: AUDIO, accent: 'uk', onStatus: () => {} });
  check('英音 lang 为 en-GB', log.utterance?.lang === 'en-GB', String(log.utterance?.lang));
  check('选到英音嗓音', /en-GB/i.test(log.utterance?.voice?.lang || ''), String(log.utterance?.voice?.lang));
}

console.log('\n[3] 语音列表为空（Electron 首帧常见）');
{
  const { mod, log } = await freshSpeak({ voices: [], speakBehaviour: 'start' });
  const statuses = [];
  mod.speak('bug', { audio: AUDIO, onStatus: (s) => statuses.push(s) });
  check('仍然尝试了语音合成', log.spoken.length === 1, JSON.stringify(log.spoken));
  check('未给 utterance 赋空 voice', log.utterance?.voice === null, String(log.utterance?.voice));
  check('列表为空时不误报 failed', await waitFor(() => statuses.includes('speaking')), JSON.stringify(statuses));
}

console.log('\n[4] 语音报错 → 回落音频');
{
  const { mod, log } = await freshSpeak({ voices: US_VOICE, speakBehaviour: 'error' });
  const statuses = [];
  mod.speak('bug', { audio: AUDIO, onStatus: (s) => statuses.push(s) });
  check('回落到音频播放', await waitFor(() => log.played.length > 0), JSON.stringify(log.played));
  check('播放的是美音录音', log.played[0] === AUDIO.us, String(log.played[0]));
  check('状态报为 audio', statuses.includes('audio'), JSON.stringify(statuses));
}

console.log('\n[5] ★ 已出声但没触发 onstart → 不得再播 mp3');
{
  const { mod, log } = await freshSpeak({ voices: US_VOICE, speakBehaviour: 'silent', boundary: true });
  const statuses = [];
  mod.speak('bug', { audio: AUDIO, onStatus: (s) => statuses.push(s) });
  await delay(1500); // 超过内部 1000ms 超时
  check('观察到音频活动后不再回落 mp3', log.played.length === 0, JSON.stringify(log.played));
  check('状态报为 speaking（确实出声了）', statuses.includes('speaking'), JSON.stringify(statuses));
}

console.log('\n[6] 语音完全静默（无任何回调）→ 超时回落');
{
  const { mod, log } = await freshSpeak({ voices: US_VOICE, speakBehaviour: 'silent' });
  const statuses = [];
  mod.speak('bug', { audio: AUDIO, onStatus: (s) => statuses.push(s) });
  check('超时后回落音频', await waitFor(() => log.played.length > 0), '未回落到音频');
  check('状态报为 audio', statuses.includes('audio'), JSON.stringify(statuses));
}

console.log('\n[7] 无任何可用资源 → 必须报 failed');
{
  const { mod, log } = await freshSpeak({ voices: US_VOICE, speakBehaviour: 'silent' });
  const statuses = [];
  mod.speak('bug', { audio: {}, onStatus: (s) => statuses.push(s) });
  check('报 failed 而不是静默', await waitFor(() => statuses.includes('failed')), JSON.stringify(statuses));
  check('没有音频可播', log.played.length === 0, JSON.stringify(log.played));
}

console.log('\n[8] 环境完全不支持语音合成');
{
  const moduleUrl = new URL('../src/client/speak.js', import.meta.url).href + `?t=${Math.random()}`;
  delete globalThis.speechSynthesis;
  delete globalThis.SpeechSynthesisUtterance;
  const log = { played: [] };
  globalThis.Audio = class {
    pause() {}
    play() { log.played.push(this.src); return Promise.resolve(); }
    set src(v) { this._src = v; }
    get src() { return this._src; }
  };
  const mod = await import(moduleUrl);
  const statuses = [];
  const ok = mod.speak('bug', { audio: AUDIO, onStatus: (s) => statuses.push(s) });
  check('speak 不抛异常', ok === true);
  check('直接走音频', log.played.length === 1, JSON.stringify(log.played));
  check('状态报为 audio', statuses.includes('audio'), JSON.stringify(statuses));
}

console.log('\n[9] 连点两次 → 去抖，不叠加');
{
  const { mod, log } = await freshSpeak({ voices: US_VOICE, speakBehaviour: 'start' });
  mod.speak('bug', { audio: AUDIO, onStatus: () => {} });
  mod.speak('bug', { audio: AUDIO, onStatus: () => {} }); // 立刻再来一次
  check('只朗读了一次', log.spoken.length === 1, `实际 ${log.spoken.length} 次`);
}

console.log('\n[10] 空单词');
{
  const { mod, log } = await freshSpeak({ voices: [] });
  const statuses = [];
  const ok = mod.speak('', { audio: AUDIO, onStatus: (s) => statuses.push(s) });
  check('空单词返回 false', ok === false);
  check('空单词不发声', log.spoken.length === 0 && log.played.length === 0);
  check('空单词报 failed', statuses.includes('failed'), JSON.stringify(statuses));
}

console.log(`\n结果：${checks - failures}/${checks} 通过`);
if (failures > 0) { console.log(`失败 ${failures} 项`); process.exitCode = 1; } else { console.log('全部通过 ✓'); }
