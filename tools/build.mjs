#!/usr/bin/env node
/**
 * 零依赖构建脚本：把 src/client/*.js 压平成一个自包含的 lib/client.js。
 *
 * 为什么需要它：
 *   DSH 的客户端插件 bundle 必须是「一整块」——浏览器侧按
 *   window.__ModuleLoader__.load({id, factory}) 注册，factory 里用同步 require
 *   解析模块。DSH 的模块系统对「入口再动态 import 自己的 chunk」有明确限制，
 *   所以最稳妥的做法是把所有客户端代码内联进一个闭包。
 *
 * 做法：每个源文件包进一个 IIFE，只把公开 API 放进命名空间对象，
 * 这样各文件内部的重名标识符互不干扰；import 语句改为从命名空间解构。
 *
 * 用法： node tools/build.mjs
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SRC = join(ROOT, 'src', 'client');
const OUT = join(ROOT, 'lib', 'client.js');

/**
 * 模块清单：顺序 = 依赖顺序（被依赖的在前）。
 *
 * namespace 统一加 `__` 前缀 —— 必须保证它与任何被导出的标识符都不同名，
 * 否则 `const { Overlay } = Overlay;` 会因 TDZ 直接抛 ReferenceError（已踩过）。
 */
const MODULES = [
  { file: 'config.js', ns: '__Config', exports: ['HOST_DEFAULTS', 'USER_EDITABLE_KEYS', 'buildConfig', 'loadUserSettings', 'pickUserSettings', 'saveUserSettings', 'SettingsStore', 'SETTINGS_STORAGE_KEY', 'clampNumber'] },
  { file: 'word.js', ns: '__Word', exports: ['MAX_WORD_LENGTH', 'SKIP_TAGS', 'SKIP_CLASS_SELECTOR', 'normalizeWord', 'isLookupCandidate', 'trimToSingleWord', 'wordAtOffset', 'allWordsIn', 'pointHitsRects', 'HIT_INSET_TOP', 'HIT_INSET_BOTTOM'] },
  { file: 'lru.js', ns: '__Lru', exports: ['LruMap'] },
  { file: 'styles.js', ns: '__Styles', exports: ['OVERLAY_CSS'] },
  { file: 'render.js', ns: '__Render', exports: ['translatePos', 'stripTags', 'normalizeWordInfo', 'renderDictionaryBody', 'renderLoadingBody', 'SOURCE_LABELS'] },
  { file: 'dom.js', ns: '__Dom', exports: ['FLOW_KIND_ATTR', 'ASSISTANT_KIND', 'domRoots', 'domInvalidateRoots', 'domWordAtPoint', 'domBlockSignature', 'domBuildWordIndex', 'domIsExcluded', 'domIsInsideAssistant', 'domVisibleAssistantBlocks'] },
  { file: 'sessionmemo.js', ns: '__SessionMemo', exports: ['SessionMemo', 'DEFAULT_MISS_SUPPRESS_MS'] },
  { file: 'speak.js', ns: '__Speak', exports: ['speak', 'stopSpeaking', 'warmUpVoices', '__setSpeakImplForTest'] },
  { file: 'lookup.js', ns: '__Lookup', exports: ['DictionaryLookup'] },
  { file: 'overlay.js', ns: '__Overlay', exports: ['Overlay', 'buildSettingsPanel', 'OVERLAY_EDGE_MARGIN', 'EDGE_MARGIN', 'computePosition', 'defaultHintText'] },
  { file: 'index.js', ns: '__Main', exports: ['createWordHover', 'EDGE_MARGIN', 'SIDE_CLEARANCE'] },
];

/** 把 import 语句改写成从命名空间解构。 */
function rewriteImports(code, nsByFile) {
  return code.replace(
    /import\s*\{([\s\S]*?)\}\s*from\s*['"]\.\/([\w.-]+)['"];?/g,
    (match, names, file) => {
      const ns = nsByFile.get(file);
      if (!ns) throw new Error(`未知的客户端模块依赖: ./${file}`);
      const body = names
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .join(', ');
      return `const { ${body} } = ${ns};`;
    },
  );
}

/** 去掉 export 关键字，把声明留在 IIFE 作用域内。 */
function stripExports(code) {
  return code
    .replace(/^export\s+(?=(const|let|var|function|class|async)\b)/gm, '')
    .replace(/^export\s*\{[\s\S]*?\};?\s*$/gm, '');
}

/** 校验：文件里声明的每个导出都必须在清单里，否则打包结果会缺 API。 */
function verifyExports(code, expected, file) {
  const declared = new Set();
  for (const match of code.matchAll(/^(?:export\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)) {
    declared.add(match[1]);
  }
  const missing = expected.filter((name) => !declared.has(name));
  if (missing.length > 0) {
    throw new Error(`${file} 里找不到这些导出: ${missing.join(', ')}`);
  }
}

const nsByFile = new Map(MODULES.map((m) => [m.file, m.ns]));

const parts = [];
for (const mod of MODULES) {
  const raw = await readFile(join(SRC, mod.file), 'utf8');
  verifyExports(raw, mod.exports, mod.file);
  let code = rewriteImports(raw, nsByFile);
  code = stripExports(code);
  parts.push(
    `  // ══ ${mod.file} ${'═'.repeat(Math.max(0, 60 - mod.file.length))}\n`
    + `  const ${mod.ns} = (() => {\n`
    + `${code.replace(/^(?!$)/gm, '    ')}\n`
    + `  return { ${mod.exports.join(', ')} };\n`
    + `  })();`,
  );
}

const bundle = `/**
 * dsh-plugin-word-hover —— 客户端 bundle（由 tools/build.mjs 生成，请勿手改）
 *
 * 生成时间：${new Date().toISOString()}
 * 源文件：src/client/{config,word,lru,styles,render,dom,cache,speak,lookup,overlay,index}.js
 *
 * 契约：id 必须等于 npm 包名；factory 惰性执行；返回 { inject, apply(ctx) }。
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-word-hover',
  factory: function () {
    'use strict';

${parts.join('\n\n')}

    // 对外暴露一份扁平 API，便于排错与无 DSH 环境下的自测
    const api = Object.assign(
      {},
      __Config, __Word, __Lru, __Styles, __Render, __Dom,
      __SessionMemo, __Speak, __Lookup, __Overlay, __Main,
    );
    globalThis.__DSH_WORD_HOVER_API__ = { controller: null, api };

    return {
      inject: ['slots'],
      apply(ctx) {
        const controller = __Main.createWordHover({
          config: (globalThis.__DSH_WORD_HOVER_CONFIG__ && typeof globalThis.__DSH_WORD_HOVER_CONFIG__ === 'object')
            ? globalThis.__DSH_WORD_HOVER_CONFIG__
            : {},
        });
        // 便于在开发者控制台里检查
        globalThis.__DSH_WORD_HOVER_API__.controller = controller;
        return controller.apply(ctx);
      },
    };
  },
});
`;

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, bundle, 'utf8');

const kb = (Buffer.byteLength(bundle, 'utf8') / 1024).toFixed(1);
console.log(`已生成 ${OUT}`);
console.log(`  模块 ${MODULES.length} 个，体积 ${kb} KB`);
