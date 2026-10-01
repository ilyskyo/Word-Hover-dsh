/**
 * 显示层的纯函数：把统一的 WordInfo 渲染成 DOM 节点。
 * 抽出来是为了让 scripts/verify.mjs 能在没有浏览器的 Node 里断言渲染结果。
 *
 * ⚠️ 本文件**不得**引用 document/window；只用调用方传入的 doc 来创建节点。
 */

/** 词性缩写 → 中文。DSH 的消息正文是英文，所以这里覆盖常见缩写。 */
const POS_ZH = Object.freeze({
  n: '名词', noun: '名词', v: '动词', verb: '动词', vi: '不及物动词', vt: '及物动词',
  adj: '形容词', adjective: '形容词', adv: '副词', adverb: '副词', prep: '介词',
  preposition: '介词', conj: '连词', conjunction: '连词', pron: '代词', pronoun: '代词',
  num: '数词', art: '冠词', article: '冠词', int: '感叹词', interj: '感叹词',
  interjection: '感叹词', aux: '助动词', modal: '情态动词', det: '限定词',
  determiner: '限定词', abbr: '缩写', phrase: '短语', idiom: '习语',
  convention: '习惯表达', exclamation: '感叹词', linker: '连接词',
  'n-count': '可数名词', 'n-uncount': '不可数名词', 'n-var': '可变名词',
  'n-sing': '单数名词', 'n-plural': '复数名词', 'n-proper': '专有名词',
  'adj-graded': '形容词（分级）', 'adj-classif': '形容词（分类）',
  'adj-compar': '形容词比较级', 'adv-graded': '副词（分级）',
  'phrasal-verb': '动词短语', 'phr-v': '动词短语', 'modal-verb': '情态动词',
  'ordinal-number': '序数词', 'cardinal-number': '基数词', concordance: '索引词',
  // 柯林斯的及物/不及物标记（"V-T"、"V-T/V-I" 这类会出现在词性栏）
  'v-t': '及物动词', 'v-i': '不及物动词',
  'aux-v': '助动词', 'linking-v': '系动词',
});

/**
 * 把词性字符串翻译成中文。
 * 支持 "int."、"/n./v."、"n-count"、多词性混合（"n./v."、多行）。
 *
 * ⚠️ 分隔符**不能**包含连字符：柯林斯的 "V-T"（及物动词）、"n-count"（可数名词）
 *    都是连字符复合标记，按连字符切会把它们切碎，导致词性显示为空或显示成
 *    「动词/未知」。早期版本就在这里踩过坑（用户看到的 V-T 被错误处理）。
 *
 * 返回空串表示无法识别（调用方会显示原始值）。
 */
export function translatePos(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  const parts = raw
    .split(/[/\uFF0F,;|\n]+/)
    .map((s) => s.trim().replace(/^\.+|\.+$/g, '').toLowerCase())
    .filter(Boolean);
  const out = [];
  for (const part of parts) {
    const key = part.replace(/\s+/g, '-');
    const zh = POS_ZH[part] || POS_ZH[key];
    if (zh && !out.includes(zh)) out.push(zh);
  }
  return out.join('/');
}

/** 把释义里的 <b>xxx</b> 等标签去掉（有道返回里含 <b>、<非正式> 这类标记）。 */
export function stripTags(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/<[^>]{0,40}>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 逐条清洗释义字段。 */
export function normalizeWordInfo(info) {
  if (!info || typeof info !== 'object') return null;
  const word = typeof info.word === 'string' ? info.word.trim() : '';
  if (!word) return null;
  const meanings = Array.isArray(info.meanings)
    ? info.meanings
      .map((m) => (m && typeof m === 'object' ? {
        partOfSpeech: stripTags(String(m.partOfSpeech ?? '')),
        translation: stripTags(String(m.translation ?? '')),
        definition: stripTags(String(m.definition ?? '')),
        example: stripTags(String(m.example ?? '')),
      } : null))
      .filter((m) => m && (m.translation || m.definition))
      .slice(0, 8)
    : [];
  return {
    word,
    phonetic: stripTags(String(info.phonetic ?? '')),
    meanings,
    source: typeof info.source === 'string' ? info.source : 'unknown',
    audio: typeof info.audio === 'string' ? info.audio : '',
    error: typeof info.error === 'string' ? info.error : '',
  };
}

/**
 * 渲染释义区。
 * @param {Document} doc
 * @param {object} info         已规范化的 WordInfo
 * @param {object} options      { showPartOfSpeech, showPhonetic, showDefinition, showExample, showSource }
 * @returns {DocumentFragment}
 */
export function renderDictionaryBody(doc, info, options = {}) {
  const frag = doc.createDocumentFragment();
  const opt = {
    showPartOfSpeech: true,
    showPhonetic: true,
    showDefinition: true,
    showExample: true,
    showSource: true,
    ...options,
  };

  // ── 头部：单词 + 音标 ────────────────────────────────────────────
  const head = doc.createElement('div');
  head.className = 'dsh-wh-head';

  const title = doc.createElement('span');
  title.className = 'dsh-wh-word';
  title.textContent = info.word;
  head.append(title);

  if (opt.showPhonetic && info.phonetic) {
    const phon = doc.createElement('span');
    phon.className = 'dsh-wh-phonetic';
    phon.textContent = /^[/[]/.test(info.phonetic) ? info.phonetic : `/${info.phonetic}/`;
    head.append(phon);
  }
  frag.append(head);

  // ── 错误态 ─────────────────────────────────────────────────────
  if (info.error || info.meanings.length === 0) {
    const err = doc.createElement('div');
    err.className = 'dsh-wh-error';
    err.textContent = info.error || '暂无释义';
    frag.append(err);
    if (opt.showSource && info.source) frag.append(renderFooter(doc, info, opt));
    return frag;
  }

  // ── 释义列表 ───────────────────────────────────────────────────
  const list = doc.createElement('div');
  list.className = 'dsh-wh-meanings';

  for (const meaning of info.meanings) {
    const item = doc.createElement('div');
    item.className = 'dsh-wh-meaning';

    if (opt.showPartOfSpeech && meaning.partOfSpeech) {
      const pos = doc.createElement('span');
      pos.className = 'dsh-wh-pos';
      const zh = translatePos(meaning.partOfSpeech);
      pos.textContent = zh || meaning.partOfSpeech;
      if (zh && zh !== meaning.partOfSpeech) pos.title = meaning.partOfSpeech;
      item.append(pos);
    }

    const textWrap = doc.createElement('div');
    textWrap.className = 'dsh-wh-texts';

    if (meaning.translation) {
      const tr = doc.createElement('div');
      tr.className = 'dsh-wh-translation';
      tr.textContent = meaning.translation;
      textWrap.append(tr);
    }
    if (opt.showDefinition && meaning.definition) {
      const de = doc.createElement('div');
      de.className = 'dsh-wh-definition';
      de.textContent = meaning.definition;
      textWrap.append(de);
    }
    if (opt.showExample && meaning.example) {
      const ex = doc.createElement('div');
      ex.className = 'dsh-wh-example';
      ex.textContent = meaning.example;
      textWrap.append(ex);
    }
    item.append(textWrap);
    list.append(item);
  }
  frag.append(list);

  if (opt.showSource && info.source) frag.append(renderFooter(doc, info, opt));
  return frag;
}

/** 底部：来源标识（本插件不缓存，所以没有「缓存」标记）。 */
function renderFooter(doc, info, opt) {
  const foot = doc.createElement('div');
  foot.className = 'dsh-wh-foot';

  if (opt.showSource) {
    const src = doc.createElement('span');
    src.className = 'dsh-wh-source';
    src.textContent = SOURCE_LABELS[info.source] || info.source;
    foot.append(src);
  }
  return foot;
}

/** 来源标识的中文名。 */
export const SOURCE_LABELS = Object.freeze({
  youdao: '有道词典',
  'youdao-suggest': '有道（简版）',
  freedict: 'Free Dictionary',
  custom: '自定义后端',
  cache: '缓存',
  error: '暂无',
  unknown: '未知来源',
  'direct-fallback': '直连降级',
});

/** 构造一个「加载中…」占位体。 */
export function renderLoadingBody(doc, word) {
  const frag = doc.createDocumentFragment();
  const head = doc.createElement('div');
  head.className = 'dsh-wh-head';
  const title = doc.createElement('span');
  title.className = 'dsh-wh-word';
  title.textContent = word;
  head.append(title);
  frag.append(head);

  const box = doc.createElement('div');
  box.className = 'dsh-wh-loading';
  box.setAttribute('aria-live', 'polite');
  for (let i = 0; i < 2; i += 1) {
    const bar = doc.createElement('span');
    bar.className = 'dsh-wh-skeleton';
    box.append(bar);
  }
  frag.append(box);
  return frag;
}
