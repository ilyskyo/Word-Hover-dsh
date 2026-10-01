/**
 * 有道词典公开网页接口（非官方、无需 Key、无需签名）。
 *
 * ⚠️ 重要合规提示：
 *   1. 这是有道词典网页版使用的公开接口，**不是**官方开放平台 API，没有 SLA，
 *      随时可能变更或限制。已按「可降级」设计，失败会自动切到下一个 provider。
 *   2. 这是非官方接口，请自行评估使用风险；本项目仅供个人学习使用，
 *      请勿用于商业分发或批量抓取。详见仓库根目录 THIRD-PARTY-NOTICES.md。
 *      如需商用，请把 provider 改成 custom，指向你自有的合规后端。
 *
 * 一手字段路径（实测 2026-10，见 dict-api-research.md）：
 *   音标        simple.word[0].usphone / ukphone
 *   柯林斯音标  collins.collins_entries[0].phonetic
 *   发音音频    collins_primary.gramcat[0].audiourl
 *   词性+中文   ec.word[0].trs[*].tr[*].l.i[*]        （一行式，含词性前缀）
 *   按词性中文  expand_ec.word[*].pos + transList[*].trans
 *   英文释义    collins.collins_entries[0].entries.entry[*].tran_entry[*].tran
 *   英汉例句    blng_sents_part.sentence-pair[*].sentence-eng / sentence-translation
 *   词形变化    ec.word[0].wfs[*].wf
 *   考试标签    ec.exam_type[]
 */

import { cleanText, httpFetch, posToZh, readJson } from './common.js';

export const id = 'youdao';

const ENDPOINT = 'https://dict.youdao.com/jsonapi';

export async function lookupWord(word, { timeoutMs = 8000, signal } = {}) {
  const url = `${ENDPOINT}?q=${encodeURIComponent(word)}`;
  // 网络层异常必须转成错误态返回，绝不能冒泡——否则降级链会在第一个 provider 就中断
  let response;
  try {
    response = await httpFetch(url, { timeoutMs, signal });
  } catch (error) {
    return failure(word, error?.name === 'AbortError' ? '查询超时' : '网络错误');
  }
  if (!response.ok) {
    return failure(word, `HTTP ${response.status}`);
  }
  const payload = await readJson(response);
  if (!payload || typeof payload !== 'object') return failure(word, '响应无法解析');
  return normalize(word, payload);
}

function failure(word, error) {
  return { word, phonetic: '', meanings: [], source: 'youdao', error };
}

/**
 * 把有道响应映射成统一 WordInfo。
 * 导出以便单测：正则/路径一旦因接口变更而失配，测试会立刻发现。
 */
export function normalize(word, payload) {
  const simple = payload.simple?.word?.[0] ?? {};
  const ecWord = payload.ec?.word?.[0] ?? {};
  const expand = Array.isArray(payload.expand_ec?.word) ? payload.expand_ec.word : [];
  const collinsEntry = payload.collins?.collins_entries?.[0] ?? {};
  const collinsPhonetic = cleanText(collinsEntry.phonetic, 64);

  // 美/英音标分别保留，交给显示层决定展示哪个（或都展示）
  const usPhonetic = cleanText(simple.usphone, 64) || '';
  const ukPhonetic = cleanText(simple.ukphone, 64) || '';
  const phonetic = usPhonetic || ukPhonetic || collinsPhonetic;

  // 音频按口音区分：有道的 speech 字段是「单词&type=1/2」，
  // 1 = 英音、2 = 美音，需要拼成完整的发音地址。
  const audio = {
    us: buildSpeechUrl(simple.usspeech) || cleanText(payload.collins_primary?.gramcat?.[0]?.audiourl, 512),
    uk: buildSpeechUrl(simple.ukspeech),
  };

  const meanings = [];

  // ① 柯林斯：英文释义 + 英汉对照例句（质量最高，放在最前）
  const entries = collinsEntry.entries?.entry;
  if (Array.isArray(entries)) {
    for (const entry of entries.slice(0, 6)) {
      const tranEntries = Array.isArray(entry?.tran_entry) ? entry.tran_entry : [];
      for (const tran of tranEntries.slice(0, 3)) {
        const definition = cleanText(tran?.tran, 400);
        if (!definition) continue;
        const sent = tran?.exam_sents?.sent?.[0];
        meanings.push({
          partOfSpeech: posToZh(tran?.pos_entry?.pos),
          definition,
          example: buildExample(sent?.eng_sent, sent?.chn_sent),
        });
      }
    }
  }

  // ② expand_ec：按词性分组的中文释义
  for (const item of expand) {
    const pos = posToZh(item?.pos);
    const transList = Array.isArray(item?.transList) ? item.transList : [];
    for (const trans of transList.slice(0, 6)) {
      const translation = cleanText(trans?.trans, 400);
      if (!translation) continue;
      const sent = trans?.content?.sents?.[0];
      meanings.push({
        partOfSpeech: pos,
        translation,
        example: buildExample(sent?.sentOrig, sent?.sentTrans),
      });
    }
  }

  // ③ ec：一行式中文释义（形如 "int. 喂，你好…"），放在最后作为补充
  const trs = Array.isArray(ecWord.trs) ? ecWord.trs : [];
  for (const tr of trs.slice(0, 4)) {
    const items = tr?.tr?.[0]?.l?.i;
    if (!Array.isArray(items)) continue;
    for (const line of items) {
      const text = cleanText(line, 400);
      if (!text) continue;
      const { pos, rest } = splitPosPrefix(text);
      meanings.push({ partOfSpeech: pos, translation: rest });
    }
  }

  // ④ 双语例句（如果上面都没带例句，这里补齐）
  if (!meanings.some((m) => m.example)) {
    const pairs = payload.blng_sents_part?.['sentence-pair'];
    if (Array.isArray(pairs)) {
      for (const pair of pairs.slice(0, 2)) {
        const example = buildExample(pair?.['sentence-eng'], pair?.['sentence-translation']);
        if (!example) continue;
        meanings.push({ example, definition: '' });
      }
    }
  }

  const deduped = dedupeMeanings(meanings);

  // 词形变化留在释义里（它是词的属性），但「标签」单独成行，
  // 由显示层决定要不要展示 —— 因此这里把两者分开返回。
  const wfs = Array.isArray(ecWord.wfs) ? ecWord.wfs : [];
  const inflections = wfs
    .map((w) => `${cleanText(w?.wf?.name, 16)} ${cleanText(w?.wf?.value, 32)}`.trim())
    .filter((s) => s.length > 1)
    .slice(0, 6);
  if (inflections.length > 0 && deduped.length > 0) {
    deduped[0].definition = [deduped[0].definition, `变形：${inflections.join('、')}`]
      .filter(Boolean).join(' · ');
  }
  const tags = Array.isArray(payload.ec?.exam_type)
    ? payload.ec.exam_type.filter((t) => typeof t === 'string' && t.trim()).slice(0, 8)
    : [];

  if (deduped.length === 0) {
    return { word, phonetic, usPhonetic, ukPhonetic, tags, meanings: [], source: 'youdao', audio, error: '暂无释义' };
  }
  return { word, phonetic, usPhonetic, ukPhonetic, tags, meanings: deduped, source: 'youdao', audio };
}

/**
 * 把有道的 `usspeech` / `ukspeech` 字段拼成可播放的发音地址。
 *
 * 字段值形如 `hello&type=2`（美音）/ `hello&type=1`（英音）。
 * 它本身就是一串查询参数，所以**必须原样拼进 URL**，
 * 不能整体 encodeURIComponent —— 那会把 & 和 = 也编码掉，
 * 服务端收到 `audio=hello%26type%3D2` 会返回 500。
 *
 * 实测：
 *   https://dict.youdao.com/dictvoice?audio=hello&type=2  → 200 audio/mpeg（美音）
 *   https://dict.youdao.com/dictvoice?audio=hello&type=1  → 200 audio/mpeg（英音）
 */
function buildSpeechUrl(speech) {
  const raw = cleanText(speech, 128);
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;

  // 拆成「单词 + 其余参数」，只对单词部分做转义
  const [wordPart, ...rest] = raw.split('&');
  const query = [`audio=${encodeURIComponent(wordPart)}`, ...rest].join('&');
  return `https://dict.youdao.com/dictvoice?${query}`;
}

/** 把中英例句拼成 "英文 — 中文"。 */
function buildExample(eng, chn) {
  const e = cleanText(eng, 300);
  const c = cleanText(chn, 300);
  if (e && c) return `${e} — ${c}`;
  return e || c || '';
}

/** 拆出 "int. 喂，你好" 里的词性前缀。 */
function splitPosPrefix(text) {
  const match = text.match(/^([a-zA-Z]{1,12}(?:\.[a-zA-Z]{1,12})*)\.?\s+([\s\S]+)$/);
  if (!match) return { pos: '', rest: text };
  const pos = posToZh(match[1]);
  return { pos, rest: match[2].trim() };
}

/** 合并重复释义，保留更完整的那条。 */
export function dedupeMeanings(meanings) {
  const seen = new Map();
  for (const meaning of meanings) {
    const key = `${meaning.partOfSpeech || ''}|${(meaning.translation || meaning.definition || '').slice(0, 60)}`;
    const existing = seen.get(key);
    if (!existing) { seen.set(key, { ...meaning }); continue; }
    if (!existing.example && meaning.example) existing.example = meaning.example;
    if (!existing.definition && meaning.definition) existing.definition = meaning.definition;
    if (!existing.translation && meaning.translation) existing.translation = meaning.translation;
  }
  return [...seen.values()].filter((m) => m.translation || m.definition || m.example).slice(0, 8);
}
