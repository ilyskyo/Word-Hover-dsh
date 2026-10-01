#!/usr/bin/env node
/**
 * 统一测试入口：依次跑完所有测试套件，任一失败即返回非零退出码。
 *
 * 用法： node scripts/run-all.mjs
 * （npm test）
 *
 * 说明：各套件是独立的 Node 脚本（不依赖任何测试框架），这样：
 *   - 贡献者不需要 npm install 就能跑测试；
 *   - 每个套件也能单独执行，便于定位问题。
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

/** 顺序有意义：先做静态检查，再跑行为测试。 */
const SUITES = [
  { name: '完整性检查（编码 + 清单路径）', script: 'check-integrity.mjs' },
  { name: '渲染结构', script: 'test-render.mjs' },
  { name: '发音逻辑', script: 'test-speak.mjs' },
  { name: '客户端 bundle 自测', script: 'selftest.mjs' },
  { name: 'provider 归一化', script: 'test-providers.mjs' },
  { name: '宿主端端到端', script: 'test-host.mjs' },
];

/** 逐个跑，继承 stdio 以便实时看到输出。 */
function run(script) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [join(HERE, script)], {
      cwd: ROOT,
      stdio: 'inherit',
    });
    child.on('close', (code) => resolvePromise(code ?? 1));
    child.on('error', () => resolvePromise(1));
  });
}

const results = [];
for (const suite of SUITES) {
  console.log(`\n${'─'.repeat(64)}\n▶ ${suite.name}   (${suite.script})\n${'─'.repeat(64)}`);
  // eslint-disable-next-line no-await-in-loop -- 串行执行，避免输出交错
  const code = await run(suite.script);
  results.push({ ...suite, code });
}

console.log(`\n${'═'.repeat(64)}\n汇总\n${'═'.repeat(64)}`);
for (const r of results) {
  console.log(`  ${r.code === 0 ? '✓' : '✗'} ${r.name}`);
}

const failed = results.filter((r) => r.code !== 0);
if (failed.length > 0) {
  console.log(`\n${failed.length} 个套件失败：${failed.map((r) => r.script).join(', ')}`);
  process.exitCode = 1;
} else {
  console.log(`\n全部 ${results.length} 个套件通过 ✓`);
}
