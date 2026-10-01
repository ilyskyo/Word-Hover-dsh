/**
 * 渲染结构测试：验证浮层里到底出现了什么，以及"提示文案里提到的按钮必须真的存在"。
 *
 * 这是用户实际踩到的 bug：底部写着「点击 🔊 朗读」，但浮层里根本没有那个按钮。
 * 根因是 CSS/查询用的类名（.head）与渲染出的类名（.dsh-wh-head）不一致，
 * 导致 mountHeaderActions 静默 return。这个测试就是为了让这类不一致无法再溜过去。
 *
 * 用法： node scripts/test-render.mjs
 */

import {
  renderDictionaryBody,
  renderLoadingBody,
  normalizeWordInfo,
  translatePos,
  stripTags,
} from '../src/client/render.js';
import { OVERLAY_CSS } from '../src/client/styles.js';
import { defaultHintText } from '../src/client/overlay.js';

const P = 'dsh-wh-';

let failures = 0;
let checks = 0;
function check(label, condition, detail = '') {
  checks += 1;
  if (condition) console.log(`  ✓ ${label}`);
  else { failures += 1; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

// ── 够用的 DOM 桩 ─────────────────────────────────────────────────
class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.style = {};
    this._className = '';
    this.textContent = '';
    this.listeners = new Map();
  }
  get className() { return this._className; }
  set className(v) { this._className = String(v); }
  matches(sel) {
    const s = sel.trim();
    // class 选择器
    if (s.startsWith('.')) return this._className.split(/\s+/).includes(s.slice(1));
    // 纯属性选择器，如 [role="menuitemradio"]
    if (s.startsWith('[')) {
      const m = /^\[([\w-]+)(?:=["']?([^"'\]]*)["']?)?\]$/.exec(s);
      if (!m) return false;
      const [, key, expected] = m;
      const actual = this.attributes[key] ?? this.dataset[key];
      if (actual === undefined) return false;
      return expected === undefined || String(actual) === expected;
    }
    // tag[attr] / tag[attr="v"]
    if (s.includes('[')) {
      const idx = s.indexOf('[');
      const tag = s.slice(0, idx);
      if (this.tagName !== tag.toUpperCase()) return false;
      return this.matches(s.slice(idx));
    }
    return this.tagName === s.toUpperCase();
  }
  append(...nodes) {
    for (const n of nodes) {
      if (n && n.__frag) { this.append(...n.children); continue; }
      this.children.push(n);
    }
  }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k] ?? null; }
  remove() { this.__removed = true; }
  addEventListener(t, h) { if (!this.listeners.has(t)) this.listeners.set(t, new Set()); this.listeners.get(t).add(h); }
  click() { for (const h of this.listeners.get('click') || []) h({ preventDefault() {}, stopPropagation() {} }); }
  querySelector(sel) {
    const parts = sel.split(/\s+/).filter(Boolean);
    return this.#find(parts);
  }
  #find(parts) {
    for (const child of this.children) {
      if (child.matches?.(parts[0])) {
        if (parts.length === 1) return child;
        const rest = child.#find(parts.slice(1));
        if (rest) return rest;
      }
      const deep = child.#find?.(parts);
      if (deep) return deep;
    }
    return null;
  }
  querySelectorAll(sel) {
    const parts = sel.split(/\s+/).filter(Boolean);
    const out = [];
    const walk = (el, idx) => {
      for (const child of el.children) {
        let next = idx;
        if (child.matches?.(parts[idx])) next = idx + 1;
        else if (idx > 0) next = 0;
        if (next === parts.length) out.push(child);
        walk(child, next === parts.length ? idx : next);
      }
    };
    walk(this, 0);
    return out;
  }
  get text() {
    let s = this.textContent || '';
    for (const c of this.children) s += c.text ?? '';
    return s;
  }
}

const doc = {
  createElement: (tag) => new El(tag),
  createDocumentFragment: () => { const f = new El('#fragment'); f.__frag = true; return f; },
  // 菜单会给 document / window 挂监听，这里给出最小实现
  listeners: new Map(),
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  },
  removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); },
  defaultView: { innerWidth: 1280, innerHeight: 800, addEventListener() {}, removeEventListener() {} },
};

const allText = (node) => (node.textContent || '') + (node.children || []).map(allText).join('');
const opts = { showPartOfSpeech: true, showPhonetic: 'us', showDefinition: true, showExample: true, showSource: true };

console.log('浮层渲染结构测试\n');

console.log('[1] 正常词条');
const info = normalizeWordInfo({
  word: 'invocation',
  phonetic: 'ˌɪnvəˈkeɪʃn',
  meanings: [{ partOfSpeech: 'n.', translation: '调用；祈求', definition: 'the act of invoking', example: 'an invocation of the API' }],
  source: 'youdao',
});
check('normalizeWordInfo 成功', Boolean(info));
check('释义保留', info?.meanings?.[0]?.translation === '调用；祈求', String(info?.meanings?.[0]?.translation));

const body = renderDictionaryBody(doc, info, opts);
check(`渲染出 .${P}head（操作栏挂载点）`, Boolean(body.querySelector(`.${P}head`)), '没有 head → 按钮无处挂载');
check(`渲染出 .${P}word`, body.querySelector(`.${P}word`)?.textContent === 'invocation', String(body.querySelector(`.${P}word`)?.textContent));
check(`渲染出 .${P}phonetic`, Boolean(body.querySelector(`.${P}phonetic`)));
check(`渲染出 .${P}pos`, Boolean(body.querySelector(`.${P}pos`)));
check(`渲染出 .${P}translation`, Boolean(body.querySelector(`.${P}translation`)));
check(`渲染出 .${P}definition`, Boolean(body.querySelector(`.${P}definition`)));
check(`渲染出 .${P}example`, Boolean(body.querySelector(`.${P}example`)));
check(`渲染出 .${P}foot`, Boolean(body.querySelector(`.${P}foot`)));
check('文本含单词与释义', /invocation/.test(allText(body)) && /调用/.test(allText(body)));

console.log('\n[2] 错误态与空值态');
const errBody = renderDictionaryBody(doc, normalizeWordInfo({ word: 'zzzz', meanings: [], source: 'error', error: '暂无释义' }), opts);
check(`错误态有 .${P}error`, Boolean(errBody.querySelector(`.${P}error`)));
check(`错误态仍有 .${P}head`, Boolean(errBody.querySelector(`.${P}head`)), '错误态缺 head → 无法挂载任何操作');
check('错误态显示中文提示', /暂无释义/.test(allText(errBody)), allText(errBody));

const blank = renderDictionaryBody(doc, normalizeWordInfo({ word: 'zzzz', meanings: [], source: 'youdao' }), opts);
check('空释义也给出可读反馈（非空白）', allText(blank).trim().length > 0, '渲染结果为空');
check(`空释义有 .${P}error`, Boolean(blank.querySelector(`.${P}error`)));

console.log('\n[3] 加载态');
const loading = renderLoadingBody(doc, 'invocation');
check(`加载态有 .${P}head`, Boolean(loading.querySelector(`.${P}head`)));
check(`加载态有 .${P}word`, loading.querySelector(`.${P}word`)?.textContent === 'invocation');
check(`加载态有骨架屏`, Boolean(loading.querySelector(`.${P}loading`)));

console.log('\n[4] 样式与渲染的类名必须完全对齐（本次 bug 的根因）');
// 把 CSS 里所有 .dsh-wh-xxx 类名抽出来，与渲染实际产出的类名集合比对
const cssClasses = new Set([...OVERLAY_CSS.matchAll(/\.(dsh-wh-[a-z0-9-]+)/g)].map((m) => m[1]));
const domClasses = new Set();
const collect = (el) => {
  for (const c of String(el.className || '').split(/\s+/).filter(Boolean)) domClasses.add(c);
  for (const child of el.children || []) collect(child);
};
collect(body);
collect(loading);

const domNotInCss = [...domClasses].filter((c) => !cssClasses.has(c));
check('渲染出的每个类名都在 CSS 里有定义', domNotInCss.length === 0, `未定义: ${domNotInCss.join(', ')}`);

// 反向：CSS 里声明但从不出现的类允许存在（如 hl / tip / panel 由 overlay.js 创建），
// 但要确保关键类名没有写成无前缀形式
const unprefixed = [...OVERLAY_CSS.matchAll(/^\s*\.([a-z][a-z0-9-]*)\s*[,{]/gm)]
  .map((m) => m[1])
  .filter((c) => !c.startsWith('dsh-wh-') && c !== 'tip' && c !== 'hl');
check('CSS 中没有遗留的无前缀类名', unprefixed.length === 0, `发现: ${unprefixed.slice(0, 8).join(', ')}`);
check('高亮类名带前缀', cssClasses.has('dsh-wh-hl') && cssClasses.has('dsh-wh-tip'));

console.log('\n[5] 纯函数');
check('translatePos 收录缩写转中文', translatePos('n.') === '名词', translatePos('n.'));
check('translatePos 柯林斯 V-T → 及物动词', translatePos('V-T') === '及物动词', translatePos('V-T'));
check('translatePos 柯林斯 V-T/V-I 拆成两个词性', translatePos('V-T/V-I') === '及物动词/不及物动词', translatePos('V-T/V-I'));
check('translatePos 连字符标记不被切碎（n-count）', translatePos('n-count') === '可数名词', translatePos('n-count'));
check('translatePos 多词性斜杠分隔', translatePos('n./v.') === '名词/动词', translatePos('n./v.'));
check('translatePos 完全未收录时返回空串', translatePos('zzz') === '', translatePos('zzz'));
check('stripTags 清理 <b>', stripTags('say <b>hi</b>') === 'say hi', stripTags('say <b>hi</b>'));

console.log('\n[6] 提示文案不再指向按钮（历史 bug：提示了不存在的发音按钮）');
check('无按钮指路文案', !/点击\s*🔊|点击喇叭/.test(OVERLAY_CSS + defaultHintText({})),
  defaultHintText({}));
check('锁定时提示如何解除', /Esc/.test(defaultHintText({ locked: true })), defaultHintText({ locked: true }));
check('未锁定时提示可锁定', /锁定/.test(defaultHintText({ locked: false })), defaultHintText({ locked: false }));

console.log('\n[7] 音标显示模式');
{
  const dualInfo = {
    word: 'bug',
    phonetic: 'bʌɡ',
    usPhonetic: 'bʌɡ',
    ukPhonetic: 'bʌɡ',
    meanings: [{ translation: '虫子' }],
    source: 'youdao',
  };
  const twoDiff = { ...dualInfo, ukPhonetic: 'bʌg' };

  const usOnly = renderDictionaryBody(doc, dualInfo, { showPhonetic: 'us' });
  check('只显示美音时只有一个音标', usOnly.querySelectorAll(`.${P}phonetic`).length === 1,
    String(usOnly.querySelectorAll(`.${P}phonetic`).length));

  const both = renderDictionaryBody(doc, twoDiff, { showPhonetic: 'both' });
  check('英美都显示时有两个音标', both.querySelectorAll(`.${P}phonetic`).length === 2,
    String(both.querySelectorAll(`.${P}phonetic`).length));

  const noPhon = renderDictionaryBody(doc, dualInfo, { showPhonetic: 'no' });
  check('不显示音标时没有音标节点', noPhon.querySelectorAll(`.${P}phonetic`).length === 0,
    String(noPhon.querySelectorAll(`.${P}phonetic`).length));

  // 英美音标相同时不重复显示两条
  const sameBoth = renderDictionaryBody(doc, dualInfo, { showPhonetic: 'both' });
  check('英美音标相同时合并为一条', sameBoth.querySelectorAll(`.${P}phonetic`).length === 1,
    String(sameBoth.querySelectorAll(`.${P}phonetic`).length));

  const info = normalizeWordInfo({ ...dualInfo, tags: ['CET4', '考研'] });
  check('normalizeWordInfo 保留 tags', info.tags.length === 2, JSON.stringify(info.tags));
  const withTags = renderDictionaryBody(doc, info, opts);
  check('话题 · 标签单独成行', Boolean(withTags.querySelector(`.${P}tags`)), '缺少 tags 行');
  check('标签行有标题', /话题/.test(allText(withTags)), allText(withTags).slice(0, 60));
  check('标签内容都在', /CET4/.test(allText(withTags)) && /考研/.test(allText(withTags)), allText(withTags).slice(0, 80));
  const noTags = renderDictionaryBody(doc, info, { ...opts, showTags: false });
  check('showTags=false 时不渲染标签行', !noTags.querySelector(`.${P}tags`), '仍然渲染了 tags 行');

  // 标签必须排在释义之前（单独一行，不混进释义文本）
  const transNode = withTags.querySelector(`.${P}translation`);
  check('标签不与释义混在一起', !/CET4/.test(allText(transNode || new El('div'))), allText(transNode || new El('div')));
}

console.log('\n[8] 纵向溢出菜单');
{
  const { OverflowMenu } = await import('../src/client/menu.js');
  const menu = new OverflowMenu({ append() {} }, doc);
  const trigger = menu.createTrigger('更多设置');
  check('触发器是竖三点', trigger.textContent === '⋮', trigger.textContent);
  check('触发器带 aria-haspopup', trigger.getAttribute('aria-haspopup') === 'menu');
  check('初始 aria-expanded 为 false', trigger.getAttribute('aria-expanded') === 'false');

  const picked = [];
  const items = [
    { type: 'group', label: '发音' },
    {
      id: 'accent', type: 'radio', label: '默认发音', value: 'us',
      options: [{ value: 'us', label: '美音（默认）' }, { value: 'uk', label: '英音' }],
    },
    { id: 'showExample', type: 'checkbox', label: '显示例句', value: true },
  ];
  // 用真实挂载点：把 shadow 换成可记录 append 的桩
  let appended = null;
  menu.shadow = { append(node) { appended = node; } };
  menu.setItems(items, (id, value) => picked.push([id, value]));
  menu.show(trigger);

  check('菜单已渲染', Boolean(appended));
  check('菜单 role=menu', appended?.getAttribute('role') === 'menu');
  const radios = appended.querySelectorAll('[role="menuitemradio"]');
  check('渲染出两个口音选项', radios.length === 2, String(radios.length));
  check('当前口音被勾选', radios[0].getAttribute('aria-checked') === 'true' && radios[1].getAttribute('aria-checked') === 'false',
    radios.map((r) => r.getAttribute('aria-checked')).join(','));
  check('有分组标题', /发音/.test(allText(appended)), allText(appended).slice(0, 40));

  // 点第二项 → 回调 + 就地更新勾选
  radios[1].click();
  check('选择回调收到 id 与值', picked.length === 1 && picked[0][0] === 'accent' && picked[0][1] === 'uk',
    JSON.stringify(picked));
  check('勾选已就地切换', radios[1].getAttribute('aria-checked') === 'true' && radios[0].getAttribute('aria-checked') === 'false',
    radios.map((r) => r.getAttribute('aria-checked')).join(','));

  const checks = appended.querySelectorAll('[role="menuitemcheckbox"]');
  check('渲染出显示开关', checks.length === 1, String(checks.length));
  checks[0].click();
  check('勾选框回调为取反后的值', picked[1]?.[1] === false, JSON.stringify(picked[1]));

  menu.close();
  check('关闭后 aria-expanded 复位', trigger.getAttribute('aria-expanded') === 'false');
}

console.log(`\n结果：${checks - failures}/${checks} 通过`);
if (failures > 0) { console.log(`失败 ${failures} 项`); process.exitCode = 1; } else { console.log('全部通过 ✓'); }
