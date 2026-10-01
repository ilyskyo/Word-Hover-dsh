/**
 * 有道 suggest 轻量接口：响应只有约 200 字节，做「主源失败时的兜底」最合适。
 * 代价：释义被截断、没有音标、没有例句，只能给出一行「词性 + 中文释义」。
 *
 * 实测（2026-10）：
 *   GET https://dict.youdao.com/suggest?q=hello&num=5&doctype=json
 *   → {"result":{"code":200},"data":{"entries":[{"entry":"hello","explain":"int. 喂，你好…"}]}}
 * ⚠️ 漏掉 doctype=json 会返回 XML。
 */

import { cleanText, httpFetch, posToZh, readJson } from './common.js';

export const id = 'suggest';

const ENDPOINT = 'https://dict.youdao.com/suggest';

export async function lookupWord(word, { timeoutMs = 8000, signal } = {}) {
  const url = `${ENDPOINT}?q=${encodeURIComponent(word)}&num=3&doctype=json`;
  let response;
  try {
    response = await httpFetch(url, { timeoutMs, signal });
  } catch (error) {
    return failure(word, error?.name === 'AbortError' ? '查询超时' : '网络错误');
  }
  if (!response.ok) return failure(word, `HTTP ${response.status}`);
  const payload = await readJson(response);
  const entries = payload?.data?.entries;
  if (!Array.isArray(entries) || entries.length === 0) return failure(word, '暂无释义');

  // 优先取与查询词完全一致的那条
  const entry = entries.find((e) => String(e?.entry || '').toLowerCase() === word) || entries[0];
  const explain = cleanText(entry?.explain, 400);
  if (!explain) return failure(word, '暂无释义');

  const { pos, rest } = splitPosPrefix(explain);
  return {
    word,
    phonetic: '',
    meanings: [{ partOfSpeech: posToZh(pos) || pos, translation: rest || explain }],
    source: 'youdao-suggest',
  };
}

function failure(word, error) {
  return { word, phonetic: '', meanings: [], source: 'youdao-suggest', error };
}

function splitPosPrefix(text) {
  const match = text.match(/^([a-zA-Z]{1,12}(?:\.[a-zA-Z]{1,12})*)\.?\s+([\s\S]+)$/);
  if (!match) return { pos: '', rest: text };
  return { pos: match[1], rest: match[2].trim() };
}
