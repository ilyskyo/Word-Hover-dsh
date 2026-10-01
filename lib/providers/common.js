/**
 * Provider 适配器集合。
 *
 * 统一契约：
 *   export const id: string
 *   export async function lookupWord(word, ctx): Promise<WordInfo>
 *
 * WordInfo（与客户端完全一致的结构）：
 *   { word, phonetic?, meanings:[{partOfSpeech?,translation?,definition?,example?}], source, audio?, error? }
 *
 * 注意：结构里**没有** cached 字段 —— 本插件不缓存任何返回数据。
 *
 * 任何异常都不应该冒泡出去：失败请返回 { word, meanings: [], source, error }。
 */

/** 把英文词性缩写转成中文，保证 UI 直接可读（也便于跨 provider 对齐）。 */
export const POS_ZH = Object.freeze({
  n: '名词', v: '动词', adj: '形容词', adv: '副词', prep: '介词', conj: '连词',
  pron: '代词', num: '数词', art: '冠词', int: '感叹词', aux: '助动词',
  convention: '习惯表达', exclamation: '感叹词', phrase: '短语', idiom: '习语',
  'n-count': '可数名词', 'n-uncount': '不可数名词', 'n-var': '可变名词',
  'n-sing': '单数名词', 'n-plural': '复数名词', 'n-proper': '专有名词',
  'phrasal-verb': '动词短语',
});

export function posToZh(raw) {
  if (!raw) return '';
  const key = String(raw).trim().replace(/^\.+|\.+$/g, '').toLowerCase().replace(/\s+/g, '-');
  return POS_ZH[key] || String(raw);
}

/** 去掉 HTML 标签与常见实体（有道返回里含 <b> 与 <非正式> 这类标记）。 */
export function cleanText(text, maxLength = 400) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/<[^>]{0,60}>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/** 取得 fetch 实现：宿主是 Node 22+，有全局 fetch。 */
export function httpFetch(url, { timeoutMs = 8000, headers = {}, signal } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
  const onAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  return fetch(url, {
    method: 'GET',
    signal: controller.signal,
    headers: {
      accept: 'application/json',
      // 找一个稳定的 UA，避免被当成爬虫直接 403
      'user-agent': 'Mozilla/5.0 (compatible; dsh-plugin-word-hover/0.1)',
      ...headers,
    },
  }).finally(() => {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', onAbort);
  });
}

/** 解析 JSON，失败返回 null。 */
export async function readJson(response) {
  try {
    const text = await response.text();
    if (!text) return null;
    return JSON.parse(text);
  } catch { return null; }
}
