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
    if (s.startsWith('.')) return this._className.split(/\s+/).includes(s.slice(1));
    if (s.includes('[')) {
      const [tag, attr] = s.split('[');
      const key = attr.replace(/\]$/, '').split('=')[0];
      return this.tagName === tag.toUpperCase() && (key in this.attributes || key in this.dataset);
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
};

const allText = (node) => (node.textContent || '') + (node.children || []).map(allText).join('');
const opts = { showPartOfSpeech: true, showPhonetic: true, showDefinition: true, showExample: true, showSource: true };

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
check('离线缓存态有标识', /缓存/.test(defaultHintText({ stale: true })), defaultHintText({ stale: true }));

console.log(`\n结果：${checks - failures}/${checks} 通过`);
if (failures > 0) { console.log(`失败 ${failures} 项`); process.exitCode = 1; } else { console.log('全部通过 ✓'); }
