# dsh-plugin-word-hover · 英文悬停词典

在 DeepSeek Harness 里读 AI 英文回复时，鼠标悬停任意英文单词 → 单词出现「被选中」高亮 → 自动弹出音标、词性、中文释义、英文释义、双语例句。

- 目标应用：DSH Desktop 0.2.0-rc.2（Web GUI / Electron）
- 形态：一个 bundle 包（宿主端插件 + Web 客户端插件）
- 无需 API Key，无需额外端口，不发送任何对话内容
- 许可证：[MIT](LICENSE)（代码）· [第三方数据来源](THIRD-PARTY-NOTICES.md)

> ⚠️ **合规提示（请先读）**
>
> 默认主源是**有道词典的公开网页接口**（非官方 API），插件按你的悬停行为逐词请求。
> **仅供个人学习使用，请勿用于商业用途或批量抓取。**
> 需要商用请把 `provider` 改为 `custom` 并指向你自有的合规后端。
> 数据版权归各词典提供方所有，本项目与有道、DeepSeek 等主体无隶属关系。

---

## 一、功能

| 能力 | 说明 |
|---|---|
| 悬停查词 | 指针**停在**单词上约 440ms 后出高亮 + 释义（停稳 200ms + 悬停延迟 240ms）；不预取、不翻译整段 |
| 精确命中 | 指针必须真正落在单词矩形内才算命中；在词与词之间、行距里、行首缩进处都不触发 |
| 扫过不查词 | 鼠标持续在文字上滑动时**永远不会**弹释义，必须真的停下来；慢慢划过一行英文也不会误触发 |
| 高亮 | **浅灰圆角胶囊 + 细描边**（贴合单词、左右外扩 3px / 上下 2px）；文字始终清晰可读，不会把原词「挖掉」 |
| 浮层内容 | 单词、音标（美/英）、发音按钮、词性（中文）、中文释义、英文释义、双语例句、话题 · 标签、来源标识 |
| 话题 · 标签 | **单独成行**显示（如 `话题 · 标签　CET4 · CET6 · 考研`），可在菜单里关闭 |
| 定位 | 优先单词下方，空间不足翻上方；左右自动避让，距边缘 ≥ 8px；`position: fixed`，无布局抖动 |
| 长词条 | 浮层高度先收进「锚点上下更大的一侧」，再兜一层视口上限；**底边永不越过视口安全线**，超出内容在浮层内部滚动 |
| 浮层保持 | 鼠标从单词移到浮层上不会消失 |
| 关闭 | 移出单词与浮层 250ms 后关闭；ESC 关闭；点击外部关闭 |
| 锁定 | 点击单词锁定浮层（再点一次或 ESC 解除） |
| 自动生效 | 新消息、滚动加载、流式输出都不需要额外处理（见 §四） |
| 发音 | **默认美音、只读一次**；优先系统语音合成（离线、零请求），失败时回落到词典录音 |
| 更多设置 | 锁定键右侧的 **⋮** 打开下拉菜单：默认发音口音、音标显示方式、例句/标签/词性/释义/来源的显示开关 |
| 键盘 | 浮层内 Tab 可到发音/锁定/⋮ 按钮；菜单支持上下键移动、Esc 关闭；浮层打开时 Tab / Shift+Tab 可跳到上/下一个单词 |
| 兼容 | 代码块、行内代码、数学公式、链接、输入框、用户消息、侧栏一律不处理 |

### 发音与音标

- **默认发美音，且只读一次。** 菜单里可以改成英音；

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

- DSH 版本：0.2.0-rc.2（其它版本可能需调整选择器，见 §五）
- Node.js ≥ 22（仅构建时需要；仓库已含构建产物，正常安装不需要）

### 1. 从 GitHub 安装

在 DSH 界面里打开 **Plugins 面板**，输入仓库地址：

```text
github:ilyskyo/Word-Hover-dsh
```

### 2. 从本地目录安装

先把仓库克隆/下载到本机，然后在 Plugins 面板里选择本地安装，填入**该目录的绝对路径**（示例）：

```text
D:\plugins\Word-Hover-dsh
```

装完 **必须完全退出 DSH 再重新打开**（关闭窗口 ≠ 退出进程），新的宿主端模块与客户端 bundle 才会加载。

### 4. 重新构建客户端 bundle（改源码后才需要）

`lib/client.js` 已随仓库提交，正常安装不需要构建：

```powershell
node tools/build.mjs
```

### 5. 确认生效

- 打开一个含 AI 英文回复的会话，把鼠标停在任意英文单词上；
- 或在开发者控制台执行：

```js
__DSH_WORD_HOVER__.debug()          // 查看选择器命中情况与当前配置
__DSH_WORD_HOVER__.openSettings()  // 打开设置面板
```

### 6. 验证选择器与真实页面是否一致（推荐）

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
    missSuppressMs: 300000    # 上游答复"查不到"的词在此期间不重复请求；0 = 不抑制
    allowDirectFallback: false # 宿主不可用时允许客户端直连公网（有 CORS/合规风险）
    proxy: true
    proxyRateLimitPerMinute: 120
    accent: us                # 发音口音：us 美音（默认）| uk 英音
    phoneticDisplay: us       # 音标显示：no 不显示 | us 只美音 | uk 只英音 | both 都显示
    showTags: true            # 话题 · 标签单独成行
    excludeSelectors: []      # 额外排除的 CSS 选择器
```

界面上的 **⋮ 菜单**与设置面板改的是同一份配置：**宿主 config 提供默认值，用户偏好
（浏览器 `localStorage`）覆盖之**。菜单里的改动会立刻重绘当前浮层，不需要重新悬停。

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
│    sessionmemo.js 在途请求折叠 + 「查不到」短时抑制               │
│    lookup.js     并发 4 / 8s 超时 / AbortController              │
│    speak.js      speechSynthesis → mp3 回落                      │
└──────────────────────────┬──────────────────────────────────────┘
                           │ GET /word-hover/dict（同源，无 CORS、无 Key）
┌──────────────────────────▼──────────────────────────────────────┐
│  lib/index.js（宿主端 Cordis 插件）                              │
│    输入校验（只接受单个英文单词）                                 │
│    令牌桶限流（默认 120 次/分钟/IP）                              │
│    在途请求合并                                                   │
│    provider 降级链：youdao → suggest → freedict                  │
│    /word-hover/settings 设置回显                                 │
│    /word-hover/test   连通性自检（带 CORS）                       │
└─────────────────────────────────────────────────────────────────┘
```

### 为什么高亮不改 DOM

需求要的是「单词被选中」的观感，但**修改**宿主 DOM（把单词包成 `<span>`）在 DSH 里代价很高：
DSH 的消息正文是 React + 增量 Markdown 解析（只有尾部 1–2 个块会更新，其余块复用已冻结的
React element），插入包裹元素会与 React 的重渲染争夺同一批节点，并破坏文本复制。

所以本插件**一行宿主 DOM 都不改**：

1. 用 `document.caretRangeFromPoint(x, y)` 取光标下的字符；
2. 扩展成单词边界，用 `Range.getClientRects()` 量出精确矩形；
3. 在插件自己的 Shadow DOM 里画一个同位置的高亮块（视觉上等价于选中）。

结果：复制是原文、Markdown 渲染不受影响、流式输出不会把高亮冲掉、1000 词消息也不卡
（没有 per-word 监听，也没有预扫描）。

---

## 五、已知风险与限制

### 1. 词典接口是非官方的

主源 `dict.youdao.com/jsonapi` 是**有道词典网页版使用的公开接口**，不是官方开放平台 API：

- 没有 SLA，随时可能变更字段或限制访问；
- 属于非官方接口，请自行评估使用风险。

**个人学习自用风险可控；请勿用于商业分发或批量抓取。** 如需商用，请把 `provider` 改成
`custom` 指向你自有的合规后端（例如有道智云、百度翻译的付费接口）。



### 目录

```
dsh-plugin-word-hover/
├── package.json              # dsh.bundle + dsh.client 声明
├── cordis.patch.yml          # 插入 Loader 行的 bundle patch（含完整默认配置）
├── icon.svg                  # 插件管理器卡片图标（原创 SVG）
├── locale/{zh,en}.json       # 插件管理器列表页的标题与描述
├── lib/
│   ├── index.js              # 宿主端：路由、限流、降级链
│   ├── client.js             # 客户端 bundle（由 tools/build.mjs 生成，需提交）
│   └── providers/            # youdao / suggest / freedict / common
├── src/client/               # 客户端源码（11 个模块）
├── tools/build.mjs           # 零依赖构建：把 src/client/* 压成一个自包含闭包
└── scripts/                  # 测试与验证脚本（无测试框架依赖）
```

---

## 六、许可证与合规

- **代码**：[MIT](LICENSE)。你可以自由使用、修改、分发、商用**本代码**。
- **词典数据**：不在本许可证范围内，版权归各词典提供方所有。详见
  [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

本项目默认主源是非官方公开接口，**仅供个人学习使用，请勿用于商业用途或批量抓取**。
如需商用，请把 `provider` 改为 `custom` 并指向你自有的合规后端。

本项目是第三方个人作品，与 DeepSeek、网易有道等任何主体**无隶属、赞助或背书关系**。
