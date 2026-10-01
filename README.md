# dsh-plugin-word-hover · 英文悬停词典

在 DeepSeek Harness 里读 AI 英文回复时，鼠标悬停任意英文单词 → 单词出现「被选中」高亮 → 自动弹出音标、词性、中文释义、英文释义、双语例句。

- 目标应用：DSH Desktop 0.2.0-rc.2（Web GUI / Electron）
- 形态：一个 bundle 包（宿主端插件 + Web 客户端插件）
- 无需 API Key，无需额外端口，不发送任何对话内容
- 许可证：[MIT](LICENSE)（代码）· [第三方数据来源](THIRD-PARTY-NOTICES.md)

> ⚠️ **合规提示（请先读）**
>
> 默认主源是**有道词典的公开网页接口**（非官方 API）。
> 有道官方条款写明其返回数据「严禁缓存、再利用与转卖」，因此**本插件不缓存任何释义内容**：
> 每次查词都真实请求上游，结果只显示在浮层里、用完即弃。
> **仅供个人学习使用，请勿用于商业用途或批量抓取。**
> 需要商用请把 `provider` 改为 `custom` 并指向你自有的合规后端。
> 数据版权归各词典提供方所有，本项目与有道、DeepSeek 等主体无隶属关系。

---

## 一、功能

| 能力 | 说明 |
|---|---|
| 悬停查词 | 指针**停在**单词上约 440ms 后出高亮 + 释义（停稳 200ms + 悬停延迟 240ms）；默认**不预取、不翻译整段** |
| 精确命中 | 指针必须真正落在单词矩形内才算命中；在词与词之间、行距里、行首缩进处都不触发 |
| 扫过不查词 | 鼠标持续在文字上滑动时**永远不会**弹释义，必须真的停下来；慢慢划过一行英文也不会误触发 |
| 高亮 | **浅灰圆角胶囊 + 细描边**（贴合单词、左右外扩 3px / 上下 2px，圆角 `min(6px, 50%)`）；底色不透明度 ≤0.14，文字始终清晰可读，不会把原词「挖掉」 |
| 浮层内容 | 单词、音标（美/英）、发音按钮、词性（中文）、中文释义、英文释义、双语例句、来源标识 |
| 定位 | 优先单词下方，空间不足翻上方；左右自动避让，距边缘 ≥ 8px；`position: fixed`，无布局抖动 |
| 长词条 | 浮层高度先收进「锚点上下更大的一侧」，再兜一层视口上限；**底边永不越过视口安全线**（不会被系统任务栏或屏幕边缘吃掉），超出内容靠浮层内部滚动看全 |
| 浮层保持 | 鼠标从单词移到浮层上不会消失 |
| 关闭 | 移出单词与浮层 250ms 后关闭；ESC 关闭；点击外部关闭 |
| 锁定 | 点击单词锁定浮层（再点一次或 ESC 解除） |
| 自动生效 | 新消息、滚动加载、流式输出都不需要额外处理（见 §五） |
| 发音 | 优先系统语音合成（离线、零请求），失败时回落到词典音频 |
| 键盘 | 浮层内 Tab 可到发音/锁定按钮；浮层打开时 Tab / Shift+Tab 可跳到上/下一个单词 |
| 不缓存 | **每次查词都真实请求上游**，没有任何词典缓存层；结果只存在于当次调用栈里 |
| 兼容 | 代码块、行内代码、数学公式、链接、输入框、用户消息、侧栏一律不处理 |

### 关于「为什么必须停一下」（设计取舍）

如果只用 `caretRangeFromPoint` 判断，它在字符间隙、行首缩进甚至空白处都会**吸附**到最近的字符 ——
结果是鼠标还没碰到单词释义就弹出来，滑过一行英文时更是频繁误触发。所以本插件做了两层防护：

1. **精确命中测试**：光标必须真的落在单词的可见矩形内；垂直方向再收缩 14%/6%，
   避免走在行距里也算命中（收缩量与高亮胶囊的外扩量对齐，碰到胶囊就一定响应）。
2. **停稳才计时**：指针连续移动时计时器不断重排，只有停下 200ms 才开始悬停计时，
   再等 `hoverDelayMs`（默认 240ms）才查词。

代价是「有意悬停」比纯 hover 慢一点（约 440ms）。如果你更想要快，把 `hoverDelayMs` 调到
`200`；如果想要更稳，调大它。若你希望**完全不自动弹层**，把 `trigger` 改成 `click`。

---

## 二、安装

### 前置

- DSH 版本：0.2.0-rc.2（其它版本可能需调整选择器，见 §六）
- Node.js ≥ 22（仅构建时需要；仓库已含构建产物，正常安装不需要）

### 1. 构建客户端 bundle（可选）

`lib/client.js` 已随仓库提交，只有改了 `src/client/*` 才需要重新构建：

```powershell
node tools/build.mjs
```

### 2. 安装到 DSH

三种方式任选：

**方式 A：npm（发布后）**——在 DSH 的 Plugins 面板里直接输入包名：

```text
dsh-plugin-word-hover
```

**方式 B：GitHub**——输入仓库地址：

```text
github:<你的用户名>/dsh-plugin-word-hover
```

**方式 C：本地目录**——先把仓库克隆/下载到本机，然后在 Plugins 面板里选择本地安装，
填入**该目录的绝对路径**（示例）：

```text
D:\plugins\dsh-plugin-word-hover
```

装完 **必须完全退出 DSH 再重新打开**（关闭窗口 ≠ 退出进程），新的宿主端模块与客户端 bundle 才会加载。

### 3. 确认生效

- 打开一个含 AI 英文回复的会话，把鼠标停在任意英文单词上；
- 或在开发者控制台执行：

```js
__DSH_WORD_HOVER__.debug()          // 查看选择器命中情况与当前配置
__DSH_WORD_HOVER__.openSettings()  // 打开设置面板
```

### 4. 验证选择器与真实页面是否一致（推荐）

因为选择器来自对 DSH 包的分析，建议用真实页面验证一次：

```powershell
# 1) 用调试端口启动 DSH（先完全退出已运行的实例）
& "D:\DeepSeekHarness\DeepSeekHarness.exe" --remote-debugging-port=9222
# 2) 打开一个含 AI 英文回复的会话，然后运行：
node scripts/verify-page.mjs
```

它会只读地报告：选择器命中数、正文采样、Range 矩形测量、插件挂载状态、主题 token 可用性。

---

## 三、配置

配置写在 profile 或 `$DSH_HOME` 的 `cordis.patch.yml` 里对应条目的 `config`。

> ⚠️ **DSH 的 patch 条目是「整体替换 config」，不是合并。** 覆盖时必须把想保留的字段全部重写。

```yaml
- id: dsh-word-hover
  config:
    enabled: true
    trigger: hover            # hover | click
    hoverDelayMs: 240         # 悬停触发延迟
    hideDelayMs: 250          # 移出后关闭延迟
    lockOnClick: true
    speakEnabled: true
    provider: youdao          # 主源：youdao | freedict | suggest | custom
    fallbackProviders: [suggest, freedict]
    timeoutMs: 8000
    concurrency: 4
    sessionTtlMs: 300000      # 只记「上游说查不到」这一事实，不保存释义；0 = 完全不记
    allowDirectFallback: false # 宿主不可用时允许客户端直连公网（有 CORS/合规风险）
    proxy: true
    proxyRateLimitPerMinute: 120
    excludeSelectors: []      # 额外排除的 CSS 选择器
```

界面上的设置面板为了即时生效，把用户改动存在浏览器 `localStorage`，
与 `cordis.patch.yml` 的关系是：**宿主 config 提供默认值，用户偏好覆盖之**。

### 用你自己的合规后端

把 `provider` 设为 `custom`，并把 `lookupPath` 指向你的后端（支持绝对 URL）：

```yaml
    provider: custom
    lookupPath: 'https://your-backend.example.com/dict-lookup'
```

后端只要返回同样的结构即可：

```json
{
  "word": "hello",
  "phonetic": "həˈloʊ",
  "meanings": [
    { "partOfSpeech": "感叹词", "translation": "你好", "definition": "A greeting.", "example": "Hello, everyone." }
  ],
  "source": "your-backend"
}
```

---

## 四、架构

```
┌─ 浏览器（DSH Web GUI） ─────────────────────────────────────────┐
│  lib/client.js（__ModuleLoader__ 注册，自包含闭包）              │
│    dom.js        按鼠标坐标即时查询 DOM（只读，不改任何宿主节点） │
│    overlay.js    Shadow DOM 里的高亮块 + 浮层 + 设置面板          │
│    sessionmemo.js 请求折叠 + 「查不到」短时抑制（**不存释义**）    │
│    lookup.js     去重 / 并发 4 / 8s 超时 / AbortController        │
│    speak.js      speechSynthesis → mp3 回落                      │
└──────────────────────────┬──────────────────────────────────────┘
                           │ GET /word-hover/dict（同源，无 CORS、无 Key）
┌──────────────────────────▼──────────────────────────────────────┐
│  lib/index.js（宿主端 Cordis 插件）                              │
│    输入校验（只接受单个英文单词）                                 │
│    令牌桶限流（默认 120 次/分钟/IP）                              │
│    单飞合并（只折叠并发，**不保留任何结果**）                      │
│    provider 降级链：youdao → suggest → freedict                  │
│    /word-hover/settings 设置回显                                 │
│    /word-hover/test   连通性自检（带 CORS）                       │
└─────────────────────────────────────────────────────────────────┘
```

### 关于「不缓存」

主源的权利人条款明确写着返回数据「严禁缓存、再利用与转卖」，所以本项目**没有任何词典缓存层**：

| 曾经的做法 | 现在 |
|---|---|
| 内存 LRU（500 条） | 已移除 |
| IndexedDB 持久缓存（TTL 7 天） | 已移除 |
| 宿主端响应缓存（1000 条） | 已移除 |
| `GET /word-hover/cache` 清缓存路由 | 已移除 |
| `WordInfo.cached` 字段与「缓存」标记 | 已移除 |

每次悬停都会**真实请求上游**，释义只存在于当次调用的 Promise → DOM 里，浮层关闭即丢弃。
唯一保留的两项都与「保存释义」无关：

- **请求折叠**：同一瞬间对同一个词的重复请求合并成一次，请求结束立刻从表里删除；
- **失败抑制**：上游明确答复"查不到"的词，`sessionTtlMs` 内不再重复请求。
  只记布尔事实与时间戳，随页面刷新消失，`0` 表示完全不记。

### 为什么高亮不改 DOM

需求要的是「单词被选中」的观感，但**修改**宿主 DOM（把单词包成 `<span>`）在 DSH 里代价很高：
DSH 的消息正文是 React + 增量 Markdown 解析（只有尾部 1–2 个块会更新，其余块以缓存的
React element 复用），插入包裹元素会与 React 的重渲染争夺同一批节点，并破坏文本复制。

所以本插件**一行宿主 DOM 都不改**：

1. 用 `document.caretRangeFromPoint(x, y)` 取光标下的字符；
2. 扩展成单词边界，用 `Range.getClientRects()` 量出精确矩形；
3. 在插件自己的 Shadow DOM 里画一个同位置的高亮块（视觉上等价于选中）。

结果：复制是原文、Markdown 渲染不受影响、流式输出不会把高亮冲掉、1000 词消息也不卡
（没有 per-word 监听，也没有预扫描）。

---

## 五、逐条对照验收标准

| # | 验收标准 | 实现方式 |
|---|---|---|
| 1 | 悬停 300ms 内出现高亮和释义 | `hoverDelayMs` 默认 240ms；先画高亮 + 骨架，再填内容 |
| 2 | 移开 250ms 内消失；移到浮层不消失 | `hideDelayMs` 默认 250ms；浮层 `mouseenter` 会重置定时器 |
| 3 | 点击锁定，ESC / 外部点击关闭 | 三态状态机 `idle→hover→locked`；`keydown` 捕获阶段处理 ESC；`click` 用 `composedPath()` 判断是否落在浮层内 |
| 4 | 代码块 / URL / 输入框 / 用户消息不受影响 | 命中测试要求祖先必须有 `data-chat-flow-kind="assistant-step"`；并跳过 `pre/code/input/textarea/[contenteditable]/.md-code-block/.katex` |
| 5 | 新消息和流式输出自动生效 | 不用 MutationObserver，也不预扫描：每次悬停都按坐标即时查询当前 DOM |
| 6 | ~~刷新后已查过的词从缓存显示~~ | **需求已变更**：主源条款禁止缓存返回数据，因此不缓存。刷新后同一个词会重新请求上游 |
| 7 | API 失败不报错，有降级和错误提示 | 每个 provider 都把异常转成错误态；宿主端依次降级；全失败返回 `{error:'网络错误'}`，浮层显示中文提示 |
| 8 | 关闭开关后完全不处理文本 | 所有监听器先查 `enabled`；关闭时解绑全部监听、移除容器、abort 在途请求 |
| 9 | 不破坏复制、Markdown、原有交互 | 零宿主 DOM 变更（见 §四） |

---

## 六、已知风险与限制

### 0.3 排障：滚到底仍有一截在任务栏下方（已修复过一次）

**根因**：定位用的高度和实际渲染的高度**不是同一个值**。
`position()` 在测量尺寸后把 `maxHeight` 还原成了空字符串，于是浮层渲染时会撑到自然高度
（比如 900px），而 `computePosition` 是拿测量时算好的 600px 去算 `top` 的 ——
底边就这样溢出到视口之外，被 Windows 任务栏遮住，滚到底也露不出来。

**修法**：
1. `maxHeight` 在测量与渲染两个阶段都**固化**，不再还原；
2. `computePosition` 接收 `maxHeight` 并返回**收敛后的高度**，调用方直接用这个值设置
   `max-height` —— 保证「参与定位的高度」与「实际渲染的高度」字面相等；
3. 加最后一道防御：即使锚点位置极端，底边也不越过视口安全线。

**另一个连带修复**：高度被压到很小时，浮层会不可避免压住锚点单词
（`data-side="clamp"`）。此时鼠标几乎立刻「脱离」命中区，原来的自动关闭会让浮层
在一次鼠标移动后就消失，用户根本读不完。现在钳制态改为**只能显式关闭**
（Esc / 点击空白处 / 20 秒兜底）。

回归测试：穷举 7 个锚点位置 × 5 种词条长度，断言「底边始终在视口安全线内」。

### 0.2 排障：点击朗读没反应（已修复过一次）

**历史事故**：发音按钮出现了，但点了没有任何声音，也没有任何提示。根因是三处叠加：

1. **`speechSynthesis.cancel()` 紧接 `speak()`** —— Chromium 会把刚排队的 utterance
   一并丢弃。现在改为「先建 utterance → 再 cancel → 最后 speak」。
2. **语音列表为空时给 utterance 赋了 `voice = undefined`** —— `getVoices()` 首次调用
   常返回空数组（语音列表异步加载），部分 Electron 构建下赋值 undefined 会静默失败。
   现在列表为空就**不设** voice，交给引擎选默认英语嗓音。
3. **失败完全静默** —— `speak()` 不抛异常就算成功，用户看不到任何反馈。

现在发音有完整的降级与反馈链：

```
系统语音合成（700ms 内没 onstart 就判定失败）
      ↓
词典返回的 mp3 录音（有道 collins_primary.gramcat[0].audiourl）
      ↓
在浮层底部明确提示「无法朗读：系统没有可用的英语语音，且没有可用的音频」
```

底部提示也会实时反映状态（「正在朗读「bug」…」/「正在播放「bug」的录音…」），
并由 `scripts/test-speak.mjs` 的 23 项测试守住全部分支（含「静默失败」这条路径）。

### 0.1 排障：样式没生效 / 按钮不出现（已修复过一次）

**历史事故**：`styles.js` 里的选择器是无前缀的（`.head` / `.word` / `.tip` / `.btn`…），
而 `render.js` 渲染出的类名带前缀（`.dsh-wh-head` / `.dsh-wh-word`…）。后果有三个：

1. **整套浮层样式从未生效**（只是靠宿主页面的继承字体凑合看起来还行）；
2. `mountHeaderActions` 里 `querySelector('.head')` 永远返回 null → **静默 return**，
   发音与锁定按钮根本没被创建；
3. 底部却还在提示「点击 🔊 朗读」→ 用户看到一条指向不存在按钮的提示。

现在全部类名统一加 `dsh-wh-` 前缀，并且 `scripts/test-render.mjs` 里有一条断言：
**渲染出的每一个类名都必须在 CSS 里有定义**，反向也检查 CSS 里没有遗留的无前缀类名。
这类「样式与结构不同步」的问题不会再溜过去。

顺带修掉的两个相关问题：

- `translatePos` 的分隔符正则里原本包含 `-`，把柯林斯的 `V-T`（及物动词）切成
  `V` + `T`，导致词性显示为空或错乱；现在正确映射为「及物动词」。
- `.dsh-wh-source` 只被渲染、从未定义样式，已补齐。

### 0. 排障：页面交互异常 / 插件卡住（已修复过一次）

**历史事故**：`package.json` 的 `files` 字段引用了一个已被删除的 `assets/` 目录，
插件管理器元数据扫描时报 `ENOENT ... assets`，插件加载流程卡在半途，
表现为「查过一次词后页面划不动、点不了」。修复方式是让清单与实际文件一一对应
（`icon` 改为 `./icon.svg`，`files` 去掉不存在的目录）。

现在 `node scripts/check-integrity.mjs` 会顺带校验 `main` / `icon` / `exports` /
`files` / `dsh.bundle.patch` 引用的路径是否真实存在，这类问题不会再溜过去。

如果你再遇到「页面交互异常」，按下面顺序处理：

```js
// 1) 紧急停止插件：立即卸载运行时并记住关闭状态
__DSH_WORD_HOVER__.panic()

// 2) 查看运行态与覆盖层实际命中区域，判断有没有东西挡住页面
__DSH_WORD_HOVER__.debug()

// 3) 在任意坐标验证命中测试（只读）。返回 {hit:false} 表示该点不该触发查词
__DSH_WORD_HOVER__.debug().hitTest(600, 400)
```

`debug()` 返回容器的 `pointerEvents` / `zIndex` / 尺寸、浮层的 `display` /
`pointerEvents` / 可见标记与坐标，以及**屏幕中心点当前命中的元素**（`elementAtCenter`）。
若该元素是本插件的容器或浮层，说明覆盖层没有正确变得不可交互。

**覆盖层的硬性不变量**（已有回归测试守住）：

1. 容器恒为 `pointer-events: none`；
2. 浮层隐藏态用 `display: none` —— **彻底移出命中测试**，而不是只靠 `opacity: 0`；
3. 测量尺寸阶段（`data-measuring`）参与布局但不可见、不可交互；
4. 浮层连续可见超过 20 秒自动关闭（`MAX_VISIBLE_MS`，锁定态除外），
   保证没有任何路径能让它永久停在鼠标下方；
5. 插件只读宿主 DOM，不修改、不包裹、不替换任何节点。

### 1. 词典接口是非官方的（最重要）

主源 `dict.youdao.com/jsonapi` 是**有道词典网页版使用的公开接口**，不是官方开放平台 API：

- 没有 SLA，随时可能变更字段或限制访问；
- 有道官方开放平台条款明文写着返回数据**「严禁缓存、再利用与转卖」**。

**本项目对这条限制的响应是「不缓存」**——这是刻意的设计决定，不是配置项：

- 宿主端不保留任何上游响应（没有内存 LRU、没有响应缓存）；
- 客户端不落盘任何释义（没有 IndexedDB、没有 localStorage 词条）；
- 唯一保留的是「请求折叠」与「失败抑制」，两者都不保存释义内容（见 §四）；
- 并对每个来源 IP 做限流（默认 120 次/分钟）。

**个人学习自用风险可控；请勿用于商业分发或批量抓取。** 如需商用，请把 `provider` 改成
`custom` 指向你自有的合规后端（例如有道智云、百度翻译的付费接口）。

这也意味着一个功能上的取舍：**同一个词每次悬停都会重新请求上游**，上游慢时会有可见等待。
这是为合规付出的直接代价；如果你在自己的部署里选择了合规的后端，可以在 `custom` 后端里
自行加入缓存，那是你的决定与你的授权范围。

### 2. provider 可用性（本机实测）

| provider | 实测 | 说明 |
|---|---|---|
| `youdao`（jsonapi） | ✅ 可用，约 237ms | 字段最全：音标 + 词性 + 中英释义 + 双语例句 |
| `suggest`（有道简版） | ✅ 可用，约 60ms | 响应仅约 200 字节，但释义被截断、无音标 |
| `freedict`（Free Dictionary） | ❌ 8s 超时 | 该接口稳定性差（多次 Cloudflare 522），只作末位兜底 |

### 3. DSH 版本漂移

选择器锚定在 `data-*` 属性（`data-conversation-region` / `data-conversation-scroll` /
`data-chat-flow-kind` / `data-slot`）和两个全局类名（`.md-code-block` / `.md-table-wide`）上，
这些比 CSS Module 的哈希前缀稳定得多。但 DSH 升级后仍可能变化：

```powershell
node scripts/verify-page.mjs
```

如果助手回复块没命中，在控制台跑这一行并把结果告诉我：

```js
[...document.querySelectorAll('[data-chat-flow-kind]')].map(e => e.getAttribute('data-chat-flow-kind'))
```

只需改 `src/client/dom.js` 顶部的 `FLOW_KIND_ATTR` / `ASSISTANT_KIND` 两个常量，然后重新构建。

### 4. 官方插件规范的一处偏离

官方 `cordis-plugin-development` 指南写着「不要把 DOM 写到组件外、不要 append 到 `document.body`」。
本插件把容器插到应用根节点（`#root` / `#app` / `[data-dsh-boot]`）内部而不是 `body`，
并且**只读宿主 DOM**。但「对既有正文做逐词悬停」在 DSH 的插槽体系里确实没有对应扩展点，
所以这是有意为之的取舍，已在设置面板与本文档中标注。

### 5. 客户端无法通过官方 API 注册设置入口

DSH 客户端插件没有公开的「注册设置项」API，所以设置面板通过两条路进入：

- 控制台 API：`__DSH_WORD_HOVER__.openSettings()`
- 或直接改 `cordis.patch.yml`（推荐长期使用）

### 6. 其它

- 音节/词形变化的来源取决于上游返回，不保证每个词都有。
- 浮层宽度上限 420px；高度按「锚点上下更大的一侧」收敛，超出内容在浮层内部滚动。
- 每次查词都要真实请求上游（不缓存），上游慢时会先显示骨架（有 8s 超时兜底）。

---

## 七、开发

```powershell
# 重新构建客户端 bundle（改了 src/client/* 之后必须跑，并把 lib/client.js 一起提交）
node tools/build.mjs

# 跑全部测试套件（推荐；任一失败即非零退出码）
npm test

# 也可以单独跑某一套
node scripts/check-integrity.mjs   # 编码 + package.json 路径引用检查
node scripts/test-render.mjs       # 渲染结构 + 类名与 CSS 对齐
node scripts/test-speak.mjs        # 发音的全部降级分支
node scripts/selftest.mjs          # 客户端 bundle 注册契约 / 生命周期 / 纯函数 / 定位
node scripts/test-providers.mjs    # provider 归一化（离线 fixture）
node scripts/test-host.mjs         # 宿主端端到端
node scripts/test-host.mjs --live  # 额外做一次真实联网自检

# 真实页面 DOM 探针（需要 DSH 带 --remote-debugging-port 启动）
node scripts/verify-page.mjs
```

> ⚠️ 不要用 PowerShell 的 `Get-Content` / `Set-Content` 处理这些源码文件：
> 默认编码会按本地代码页解析 UTF-8，导致中文注释变乱码、甚至破坏 JS 语法。
> `scripts/check-integrity.mjs` 就是为兜住这类事故写的。

### 目录

```
dsh-plugin-word-hover/
├── package.json              # dsh.bundle + dsh.client 声明
├── cordis.patch.yml          # 插入 Loader 行的 bundle patch（含完整默认配置）
├── icon.svg                  # 插件管理器卡片图标（原创 SVG）
├── locale/{zh,en}.json       # 插件管理器列表页的标题与描述
├── lib/
│   ├── index.js              # 宿主端：路由、限流、降级链（无缓存）
│   ├── client.js             # 客户端 bundle（由 tools/build.mjs 生成，需提交）
│   └── providers/            # youdao / suggest / freedict / common
├── src/client/               # 客户端源码（11 个模块）
│   ├── config.js  word.js  lru.js  dom.js  sessionmemo.js
│   ├── render.js  lookup.js  styles.js  overlay.js  speak.js  index.js
├── tools/build.mjs           # 零依赖构建：把 src/client/* 压成一个自包含闭包
└── scripts/                  # 测试与验证脚本（无测试框架依赖）
```

### 贡献

1. 改完 `src/client/*` **必须**执行 `node tools/build.mjs` 并提交 `lib/client.js`
   —— DSH 加载的是构建产物，不会替你构建；
2. 提交前跑 `npm test`，全绿再提 PR；
3. 修 bug 时请顺手补一条会失败的断言。这个项目的多数断言都来自真实事故
   （类名与 CSS 不同步、浮层溢出视口、按钮指向不存在的目标……），
   README §六 有完整的"事故档案"。

---

## 八、许可证与合规

- **代码**：[MIT](LICENSE)。你可以自由使用、修改、分发、商用**本代码**。
- **词典数据**：不在本许可证范围内，版权归各词典提供方所有。详见
  [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

本项目默认主源是非官方公开接口，**仅供个人学习使用，请勿用于商业用途或批量抓取**。
如需商用，请把 `provider` 改为 `custom` 并指向你自有的合规后端。

本项目是第三方个人作品，与 DeepSeek、网易有道等任何主体**无隶属、赞助或背书关系**。
