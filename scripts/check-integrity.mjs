#!/usr/bin/env node
/**
 * 仓库完整性检查。两件事：
 *
 *   1. **编码检查**：源码是否为合法 UTF-8、有没有乱码。
 *      背景：用 PowerShell 的 Get-Content/Set-Content 处理 UTF-8 源码时，
 *      中文会被按本地代码页（GBK）误读，写回后变成乱码，甚至破坏 JS 语法。
 *
 *   2. **清单路径检查**：package.json 里 main / icon / exports / files /
 *      dsh.bundle.patch 引用的路径必须真实存在。
 *      背景：曾把已删除的 assets/ 目录留在 files 里，插件管理器扫描元数据时
 *      直接 ENOENT，插件被卡在半加载状态。
 *
 * 用法： node scripts/check-integrity.mjs
 * （npm run check）
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'artifacts']);
const TEXT_EXT = new Set(['.js', '.mjs', '.json', '.yml', '.yaml', '.md', '.css', '.html', '.svg']);

/** 本文件自身包含乱码特征串（作为检测规则），跳过它。 */
const SELF = fileURLToPath(import.meta.url);

/** 典型的 UTF-8 被误读后写回造成的乱码特征。 */
const MOJIBAKE = [
  /\uFFFD/, // 替换字符 U+FFFD
  /[\u00C0-\u00FF]{3,}/, // 连续的高位拉丁字符（例如 藞test、鍠傦紝）
  /锛|銆|鈹|鏂|璺|鍜|浣|娴|閰|鐢|鏄|涓|鍦|鐨|璇|鏌|鍚|瓒|鍧/, // 常见乱码汉字组合
];

let problems = 0;
let scanned = 0;

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(full);
      continue;
    }
    if (!TEXT_EXT.has(extname(entry.name))) continue;
    if (full === SELF) continue; // 检测规则本身含乱码样例
    scanned += 1;
    const buffer = await readFile(full);
    const text = buffer.toString('utf8');

    // 1) 非法 UTF-8 序列
    if (text.includes('\uFFFD')) {
      problems += 1;
      console.log(`✗ ${relative(ROOT, full)} — 含替换字符 U+FFFD（编码已损坏）`);
      continue;
    }
    // 2) 乱码特征
    const hit = MOJIBAKE.find((re) => re && re.test(text));
    if (hit) {
      const match = text.match(hit);
      const index = match?.index ?? 0;
      const around = text.slice(Math.max(0, index - 30), index + 30).replace(/\n/g, '\\n');
      problems += 1;
      console.log(`✗ ${relative(ROOT, full)} — 疑似乱码: …${around}…`);
      continue;
    }
    // 3) 必须有效 UTF-8 可往返
    if (Buffer.from(text, 'utf8').compare(buffer) !== 0) {
      problems += 1;
      console.log(`✗ ${relative(ROOT, full)} — 不是有效的 UTF-8`);
    }
  }
}

await walk(ROOT);

// ── 附加检查：package.json 引用的路径必须真实存在 ──────────────────
// 这是「包元信息错误：ENOENT ... assets」那次事故的直接防线：
// files / icon / exports / main 里写了不存在的路径，插件管理器会报错，
// 而这类错误很容易顺带把插件加载流程卡在半途。
let manifestProblems = 0;
try {
  const manifest = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
  const referenced = new Set();
  if (manifest.main) referenced.add(manifest.main);
  if (manifest.icon) referenced.add(manifest.icon);
  for (const value of Object.values(manifest.exports || {})) {
    if (typeof value === 'string') referenced.add(value);
  }
  if (manifest.dsh?.bundle?.patch) referenced.add(manifest.dsh.bundle.patch);
  for (const entry of manifest.files || []) referenced.add(entry);

  for (const rel of referenced) {
    const value = String(rel);
    // exports/files 里可能有 glob（如 ./locale/*.json），退化成检查其所在目录
    const candidate = value.includes('*')
      ? value.slice(0, value.indexOf('*')).replace(/\/$/, '')
      : value;
    if (!candidate) continue;
    const target = join(ROOT, candidate.replace(/^\.\//, ''));
    try {
      await stat(target);
    } catch {
      manifestProblems += 1;
      console.log(`✗ package.json 引用了不存在的路径: ${value}`);
    }
  }
  if (manifestProblems === 0) console.log(`package.json 路径引用检查通过 ✓（${referenced.size} 条）`);
} catch (error) {
  manifestProblems += 1;
  console.log(`✗ 无法校验 package.json: ${error.message}`);
}

console.log(`\n扫描 ${scanned} 个文件，发现 ${problems} 个编码问题，${manifestProblems} 个清单问题`);
if (problems > 0 || manifestProblems > 0) {
  if (problems > 0) console.log('编码问题请用 read/edit/write 工具修复（不要用 PowerShell 的 Set-Content 处理源码）。');
  process.exitCode = 1;
} else {
  console.log('全部检查通过 ✓');
}
