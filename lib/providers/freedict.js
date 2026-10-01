/**
 * Free Dictionary API（api.dictionaryapi.dev）—— 只提供英文释义、音标、例句与发音音频。
 *
 * 用途：
 *   1. 作为主源缺例句时的补充；
 *   2. 作为「不想用非官方接口」时的合规替代（数据来源为 Wiktionary，CC BY-SA 3.0）。
 *
 * ⚠️ 实测该接口稳定性一般（多次出现 Cloudflare 522），所以只作降级项，不作主源。
 * ⚠️ 不要加 ?callback= 参数（会触发 522）。
 *
 * 字段路径（实测）：
 *   [0].phonetics[*].text     音标
 *   [0].phonetics[*].audio    发音 mp3
 *   [0].meanings[*].partOfSpeech
 *   [0].meanings[*].definitions[*].definition / .example（example 可能缺失）
 */

import { cleanText, httpFetch, posToZh, readJson } from './common.js';

export const id = 'freedict';

const ENDPOINT = 'https://api.dictionaryapi.dev/api/v2/entries/en';

export async function lookupWord(word, { timeoutMs = 8000, signal } = {}) {
  let response;
  try {
    response = await httpFetch(`${ENDPOINT}/${encodeURIComponent(word)}`, { timeoutMs, signal });
  } catch (error) {
    return failure(word, error?.name === 'AbortError' ? '查询超时' : '网络错误');
  }
  if (response.status === 404) return failure(word, '暂无释义');
  if (!response.ok) return failure(word, `HTTP ${response.status}`);

  const payload = await readJson(response);
  if (!Array.isArray(payload) || payload.length === 0) return failure(word, '响应无法解析');

  // 有些词会返回同根的多条（例如 "run" 返回 running），挑完全匹配的
  const entry = payload.find((item) => String(item?.word || '').toLowerCase() === word) || payload[0];
  const phonetics = Array.isArray(entry.phonetics) ? entry.phonetics : [];
  const phonetic = cleanText(phonetics.map((p) => p?.text).find(Boolean), 64);
  // 音频按文件名里的地区后缀区分口音，例如 hello-uk.mp3 / hello-us.mp3
  const audioUrl = cleanText(phonetics.map((p) => p?.audio).find(Boolean), 512);
  const audio = {
    us: /-us\.mp3/i.test(audioUrl) ? audioUrl : '',
    uk: /-uk\.mp3/i.test(audioUrl) ? audioUrl : '',
  };
  // 无法判定口音时，两种口音都用同一个地址兜底
  if (!audio.us && !audio.uk && audioUrl) { audio.us = audioUrl; audio.uk = audioUrl; }

  const meanings = [];
  const rawMeanings = Array.isArray(entry.meanings) ? entry.meanings : [];
  for (const meaning of rawMeanings.slice(0, 6)) {
    const definitions = Array.isArray(meaning?.definitions) ? meaning.definitions : [];
    const examples = definitions.map((d) => cleanText(d?.example, 300)).filter(Boolean);
    for (const definition of definitions.slice(0, 3)) {
      const text = cleanText(definition?.definition, 400);
      if (!text) continue;
      meanings.push({
        partOfSpeech: posToZh(meaning?.partOfSpeech) || cleanText(meaning?.partOfSpeech, 32),
        definition: text,
        example: cleanText(definition?.example, 300) || examples[0] || '',
      });
    }
  }

  if (meanings.length === 0) return failure(word, '暂无释义');
  return {
    word,
    phonetic,
    // 该接口只给一个音标，无法区分英美，两个字段都填上由显示层决定
    usPhonetic: phonetic,
    ukPhonetic: '',
    tags: [],
    meanings: meanings.slice(0, 8),
    source: 'freedict',
    audio,
  };
}

function failure(word, error) {
  return {
    word,
    phonetic: '',
    usPhonetic: '',
    ukPhonetic: '',
    tags: [],
    meanings: [],
    source: 'freedict',
    audio: { us: '', uk: '' },
    error,
  };
}
