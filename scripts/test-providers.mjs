/**
 * 有道响应的归一化测试（离线 fixture）。
 *
 * fixture 是从真实响应里裁剪出来的结构片段，字段路径与线上完全一致。
 * 目的：接口一旦改字段，这个测试会立刻失败，而不是等到用户在界面上看到「暂无释义」。
 *
 * 用法： node scripts/test-providers.mjs
 */

import { normalize, dedupeMeanings } from '../lib/providers/youdao.js';
import { cleanText, posToZh } from '../lib/providers/common.js';

let failures = 0;
let checks = 0;
function check(label, condition, detail = '') {
  checks += 1;
  if (condition) console.log(`  ✓ ${label}`);
  else { failures += 1; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

/** 真实响应（2026-10 实测 https://dict.youdao.com/jsonapi?q=hello&dicts=...）的裁剪版。 */
const YOUDao_HELLO = {
  blng_sents_part: {
    'sentence-count': 6,
    'sentence-pair': [
      {
        'sentence-eng': "'<b>Hello</b>, Paul,' they chorused.",
        'sentence-translation': '“你好，保罗。”他们齐声问候道。',
        source: '《牛津词典》',
      },
    ],
  },
  collins: {
    collins_entries: [
      {
        hwas: 'also hullo',
        phonetic: 'hɛˈləʊ',
        entries: {
          entry: [
            {
              tran_entry: [
                {
                  pos_entry: { pos: 'CONVENTION', pos_tips: '习惯表达' },
                  exam_sents: {
                    sent: [{
                      chn_sent: '你好，特里斯。我就不握手了，我的手好脏。',
                      eng_sent: "Hello, Trish. I won't shake hands, because I'm filthy.",
                    }],
                  },
                  tran: 'You say "<b>Hello</b>" to someone when you meet them. 你好 (打招呼用语)',
                },
              ],
            },
            {
              tran_entry: [
                {
                  pos_entry: { pos: 'N-COUNT', pos_tips: '可数名词' },
                  exam_sents: {
                    sent: [{
                      chn_sent: '那位推销员向我打了个热情的招呼。',
                      eng_sent: 'The salesperson greeted me with a warm hello.',
                    }],
                  },
                  tran: '<b>Hello</b> is also a noun. 招呼',
                },
              ],
            },
          ],
        },
      },
    ],
  },
  simple: {
    query: 'hello',
    word: [{ usphone: 'həˈloʊ', ukphone: 'həˈləʊ', ukspeech: 'hello&type=1', usspeech: 'hello&type=2' }],
  },
  ec: {
    exam_type: ['初中', '高中', 'CET4', 'CET6', '考研'],
    source: { name: '有道词典', url: 'https://dict.youdao.com' },
    word: [{
      usphone: 'həˈloʊ',
      ukphone: 'həˈləʊ',
      trs: [
        { tr: [{ l: { i: ['int. 喂，你好（用于问候或打招呼）；<非正式>喂，嘿 (认为别人说了蠢话或分心)'] } }] },
        { tr: [{ l: { i: ['n. 招呼，问候；（Hello）（法、印、美、俄）埃洛（人名）'] } }] },
        { tr: [{ l: { i: ['v. 说（或大声说）“喂”；打招呼'] } }] },
      ],
      wfs: [
        { wf: { name: '复数', value: 'hellos' } },
        { wf: { name: '第三人称单数', value: 'helloes' } },
      ],
    }],
  },
};

console.log('Provider 归一化测试（离线 fixture）\n');

console.log('[1] 有道 jsonapi → WordInfo');
const info = normalize('hello', YOUDao_HELLO);
check('word 正确', info.word === 'hello', info.word);
check('音标取自 simple.word[0].usphone', info.phonetic === 'həˈloʊ', info.phonetic);
check('source 为 youdao', info.source === 'youdao', info.source);
check('有释义', info.meanings.length > 0, String(info.meanings.length));
check('词性已转中文', info.meanings.some((m) => m.partOfSpeech === '习惯表达'), JSON.stringify(info.meanings.map((m) => m.partOfSpeech)));
check('有英文释义', info.meanings.some((m) => /You say/.test(m.definition || '')), '');
check('英文释义里的 <b> 被清除', info.meanings.every((m) => !/<b>/.test(m.definition || '')), '');
check('有中文释义', info.meanings.some((m) => /你好|招呼|问候/.test(m.translation || '')), '');
check('有英汉对照例句', info.meanings.some((m) => /Hello, Trish/.test(m.example || '') && /你好/.test(m.example || '')), '');
check('词形变化并入首条释义', /变形：/.test(info.meanings[0].definition || ''), info.meanings[0].definition || '');
check('考试标签并入首条释义', /标签：/.test(info.meanings[0].definition || ''), info.meanings[0].definition || '');
check('没有 error 字段', !info.error, info.error || '');

console.log('\n[2] 边界情况');
const empty = normalize('zzzz', {});
check('空响应返回错误态而不抛异常', empty.meanings.length === 0 && empty.error === '暂无释义', JSON.stringify(empty));
const noEc = normalize('hello', { simple: { word: [{}] }, collins: { collins_entries: [{ entries: { entry: [{ tran_entry: [{ tran: 'A greeting.' }] }] } }] } });
check('只有柯林斯时也能出英文释义', noEc.meanings.length > 0 && /greeting/.test(noEc.meanings[0].definition || ''), JSON.stringify(noEc.meanings));
const onlyBlng = normalize('hello', { blng_sents_part: { 'sentence-pair': [{ 'sentence-eng': 'Hello there.', 'sentence-translation': '你好。' }] } });
check('只有例句时也能出内容', onlyBlng.meanings.length === 1 && /Hello there/.test(onlyBlng.meanings[0].example || ''), JSON.stringify(onlyBlng.meanings));

console.log('\n[3] 去重与工具函数');
const deduped = dedupeMeanings([
  { partOfSpeech: '名词', translation: '招呼', definition: '' },
  { partOfSpeech: '名词', translation: '招呼', example: 'hello there' },
  { partOfSpeech: '动词', translation: '打招呼' },
]);
check('合并同词性同释义', deduped.length === 2, String(deduped.length));
check('合并时保留例句', deduped[0].example === 'hello there', JSON.stringify(deduped[0]));
check('cleanText 去标签与压缩空白', cleanText('  a  <b>b</b>\n c  ') === 'a b c', cleanText('  a  <b>b</b>\n c  '));
check('cleanText 截断超长文本', cleanText('x'.repeat(1000), 20).length === 20);
check('posToZh 处理 n-count', posToZh('N-COUNT') === '可数名词', posToZh('N-COUNT'));
check('posToZh 未知词性原样返回', posToZh('whatever') === 'whatever', posToZh('whatever'));

console.log(`\n结果：${checks - failures}/${checks} 通过`);
if (failures > 0) { console.log(`失败 ${failures} 项`); process.exitCode = 1; } else { console.log('全部通过 ✓'); }
