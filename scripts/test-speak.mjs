/**
 * 发音逻辑测试。
 *
 * 覆盖的是「点击朗读没反应」那类回归：
 *   1. 语音合成可用 → 用语音，并把状态报成 speaking；
 *   2. 语音列表为空 → **不能**给 utterance 赋空 voice（Electron 下会静默失败）；
 *   3. 语音报错 → 回落到词典音频；
 *   4. 语音「什么都不报」→ 超时后仍要回落音频，并最终报 failed；
 *   5. 无音视频资源时必须报 failed，而不是静默成功。
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
 * 每个用例都重新加载一次模块，因为它内部缓存了 voice / audioEl / warmUp 标志。
 */
async function freshSpeak({ voices = [], speakBehaviour = 'start' } = {}) {
  const moduleUrl = new URL('../src/client/speak.js', import.meta.url).href
    + `?t=${Math.random()}`;
  const log = { spoken: [], cancelled: 0, played: [], utterance: null, voices: voices.length };

  globalThis.speechSynthesis = {
    getVoices: () => voices,
    cancel() { log.cancelled += 1; },
    speak(u) {
      log.utterance = u;
      log.spoken.push(u.text);
      if (speakBehaviour === 'start') setTimeout(() => u.onstart?.(), 0);
      else if (speakBehaviour === 'error') setTimeout(() => u.onerror?.(), 0);
      // 'silent'：既不回调 onstart 也不回调 onerror —— 模拟 Electron 静默失败
    },
    addEventListener() {},
  };
  class FakeUtterance {
    constructor(text) { this.text = text; this.onstart = null; this.onerror = null; this.onend = null; }
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
function waitFor(fn, timeoutMs = 1500) {
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

console.log('发音逻辑测试\n');

console.log('[1] 语音合成可用');
{
  const { mod, log } = await freshSpeak({ voices: [{ lang: 'en-US', name: 'Test US' }], speakBehaviour: 'start' });
  const statuses = [];
  globalThis.speechSynthesis.getVoices();
  mod.warmUpVoices();
  const ok = mod.speak('bug', 'https://example.com/bug.mp3', { onStatus: (s) => statuses.push(s) });
  check('speak 返回 true', ok === true);
  check('调用了 speechSynthesis.speak', log.spoken.length === 1, JSON.stringify(log.spoken));
  check('朗读文本正确', log.spoken[0] === 'bug', String(log.spoken[0]));
  check('设置了英语 lang', log.utterance?.lang === 'en-US', String(log.utterance?.lang));
  check('绑定了英语嗓音', Boolean(log.utterance?.voice), '未绑定 voice');
  check('先 cancel 再 speak', log.cancelled >= 1, `cancel 次数 ${log.cancelled}`);
  check('状态报为 speaking', await waitFor(() => statuses.includes('speaking')), JSON.stringify(statuses));
}

console.log('\n[2] 语音列表为空（Electron 首帧常见）');
{
  const { mod, log } = await freshSpeak({ voices: [], speakBehaviour: 'start' });
  const statuses = [];
  mod.speak('bug', 'https://example.com/bug.mp3', { onStatus: (s) => statuses.push(s) });
  check('仍然尝试了语音合成', log.spoken.length === 1, JSON.stringify(log.spoken));
  check('未给 utterance 赋空 voice（关键）', log.utterance?.voice === undefined, String(log.utterance?.voice));
  check('列表为空时不误报 failed', await waitFor(() => statuses.includes('speaking')), JSON.stringify(statuses));
}

console.log('\n[3] 语音报错 → 回落音频');
{
  const { mod, log } = await freshSpeak({ voices: [{ lang: 'en-US' }], speakBehaviour: 'error' });
  const statuses = [];
  mod.speak('bug', 'https://example.com/bug.mp3', { onStatus: (s) => statuses.push(s) });
  check('回落到音频播放', await waitFor(() => log.played.length > 0), JSON.stringify(log.played));
  check('播放的是词典音频地址', log.played[0] === 'https://example.com/bug.mp3', String(log.played[0]));
  check('状态报为 audio', statuses.includes('audio'), JSON.stringify(statuses));
}

console.log('\n[4] 语音静默失败（不回任何回调）→ 超时回落');
{
  const { mod, log } = await freshSpeak({ voices: [{ lang: 'en-US' }], speakBehaviour: 'silent' });
  const statuses = [];
  mod.speak('bug', 'https://example.com/bug.mp3', { onStatus: (s) => statuses.push(s) });
  const fellBack = await waitFor(() => log.played.length > 0, 2000);
  check('超时后回落音频（不再无限静默）', fellBack, '未回落到音频');
  check('状态报为 audio', statuses.includes('audio'), JSON.stringify(statuses));
}

console.log('\n[5] 无任何可用资源 → 必须报 failed');
{
  const { mod, log } = await freshSpeak({ voices: [{ lang: 'en-US' }], speakBehaviour: 'silent' });
  const statuses = [];
  mod.speak('bug', '', { onStatus: (s) => statuses.push(s) }); // 没有音频地址
  check('报 failed 而不是静默', await waitFor(() => statuses.includes('failed'), 2000), JSON.stringify(statuses));
  check('没有音频可播', log.played.length === 0, JSON.stringify(log.played));
}

console.log('\n[6] 环境完全不支持语音合成');
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
  const ok = mod.speak('bug', 'https://example.com/bug.mp3', { onStatus: (s) => statuses.push(s) });
  check('speak 不抛异常', ok === true);
  check('直接走音频', log.played.length === 1, JSON.stringify(log.played));
  check('状态报为 audio', statuses.includes('audio'), JSON.stringify(statuses));
}

console.log('\n[7] 空单词');
{
  const { mod, log } = await freshSpeak({ voices: [] });
  const statuses = [];
  const ok = mod.speak('', 'https://example.com/x.mp3', { onStatus: (s) => statuses.push(s) });
  check('空单词返回 false', ok === false);
  check('空单词不发声', log.spoken.length === 0 && log.played.length === 0);
  check('空单词报 failed', statuses.includes('failed'), JSON.stringify(statuses));
}

console.log(`\n结果：${checks - failures}/${checks} 通过`);
if (failures > 0) { console.log(`失败 ${failures} 项`); process.exitCode = 1; } else { console.log('全部通过 ✓'); }
