# 浏览器插件「AI 实时翻译」Spec

Status: ready-for-agent

## Problem Statement

市面上的网页翻译插件大多收费或有功能限制。用户希望有一个免费、可控、可自配 AI 服务的浏览器翻译插件，因此决定自己动手实现。当前工作区无任何代码，这是一个从零开始的 greenfield 项目。

## Solution

开发一个 Chrome 扩展（Manifest V3），调用外部 AI 模型（OpenAI 兼容接口），对整个网页做双语对照的实时翻译。用户可手动选择目标语言，源语言自动检测；翻译结果缓存到 IndexedDB 以降低 API 调用成本；通过 Popup 提供翻译开关与语言选择，通过 Options 页配置 API 与排除站点。

## User Stories

1. 作为一个普通用户，我想安装扩展后打开网页即自动翻译整页内容，以便无需任何操作就能阅读外文网站。
2. 作为一个用户，我想从下拉框选择目标语言，以便把网页翻译成我熟悉的语言。
3. 作为一个用户，我想让插件自动检测网页源语言，以便无需手动指定源语言。
4. 作为一个用户，我想看到原文与译文双语对照展示，以便在阅读译文的同时能核对原文的准确含义。
5. 作为一个用户，我想让译文直接可见（而不是悬停才显示），以便获得"整页实时翻译"的体验。
6. 作为一个用户，我想在滚动页面时，新进入视口的内容被优先翻译，以便长页面能流畅地持续阅读。
7. 作为一个用户，我想在页面内容动态变化（如无限滚动加载更多、SPA 路由切换、弹窗出现）后，新增文本也被自动翻译，以便动态页面也能完整阅读。
8. 作为一个用户，我想通过点击工具栏图标快速开关翻译，以便临时暂停或恢复翻译。
9. 作为一个用户，我想把某些网站（如银行、内网）加入排除列表，以便这些网站不自动翻译。
10. 作为一个用户，我想在设置面板配置 AI 接口地址、API 密钥和模型名，以便使用我自己拥有的 AI 服务。
11. 作为一个用户，我想让翻译结果被缓存，以便下次访问相同内容时无需再次调用 API，节省成本与等待时间。
12. 作为一个用户，我想查看并清空翻译缓存，以便管理浏览器存储占用。
13. 作为一个用户，我想在 API 调用失败时页面保留原文而不报错，以便阅读体验不被破坏。
14. 作为一个用户，我想让翻译过程不破坏网页原有的布局与样式，以便阅读体验自然。
15. 作为一个用户，我想让代码块、网址、数字等不适合翻译的内容保持原样，以便避免误翻造成的理解偏差。
16. 作为一个用户，我想让已翻译过的句子在整页范围内只被翻译一次（去重），以便减少 API 调用次数。
17. 作为一个用户，我想在页面包含大量文本时翻译仍能流畅进行，以便性能不卡顿。
18. 作为一个用户，我想让我的 API 密钥安全存储、不暴露给网页，以便避免密钥泄露。
19. 作为一个用户，我想让扩展只申请完成翻译所需的最小权限，以便保护我的隐私。
20. 作为一个用户，我想在浏览器重启后翻译设置与缓存仍然保留，以便无需重复配置。

## Implementation Decisions

### 技术栈

- Chrome 扩展 Manifest V3（MV2 已废弃）。
- TypeScript + Vite + @crxjs/vite-plugin，多入口构建（content / background / popup / options）。
- Content Script 与 Background 用原生 TS + 轻量 DOM 操作，不引入 UI 框架，避免与第三方页面冲突及体积开销。
- Popup 与 Options 可选 Vue 3。

### 模块划分

- 翻译调度器（scheduler）：翻译队列、并发限制（3–5 路）、请求去重、失败指数退避重试。
- 缓存层（cache）：内存 LRU（约 500–1000 条） + IndexedDB 持久化。
- AI 客户端（translator）：OpenAI 兼容接口调用。
- 段落提取器（extractor）：TreeWalker 遍历文本节点，聚合成段落块。
- 双语渲染器（renderer）：把译文渲染进 DOM 的双语对照结构。
- 可见性调度（visibility-scheduler）：IntersectionObserver 计算可见性，产出翻译顺序。
- DOM 变化监听（mutation-observer）：MutationObserver + 防抖（约 500ms）。
- 适配层（adapters）：隔离 chrome.storage / chrome.runtime / IndexedDB / fetch 等浏览器能力。

### 测试接缝（Seam）

- 唯一 seam = 依赖注入。5 个业务模块都是纯逻辑，不直接 `import chrome`，浏览器能力通过注入的接口（端口）传入。
- scheduler 注入「翻译客户端」接口；cache 注入「存储」接口；translator 注入「fetch」接口；extractor / renderer 输入 DOM（测试用 jsdom）。

### API 契约（OpenAI 兼容）

- 请求：`POST {baseURL}/chat/completions`，body 含 `model`、`messages`（system 提示词约束为翻译引擎 + user 为待译文本）、`temperature`（约 0.3）。
- 响应：取 `choices[0].message.content` 作为译文。
- 源语言由模型自动检测，或依据提示词约束。

### 消息协议（content ↔ background）

- `TRANSLATE_REQUEST`：`{ blocks: [{ id, text, targetLang }] }`
- `TRANSLATE_RESULT`：`{ results: [{ id, translated, sourceLang }] }`

### 缓存 schema

- key：`hash(原文) + ':' + 目标语言`
- value：`{ translated, sourceLang, timestamp }`
- 命中缓存即不调 API，是成本控制核心；默认不过期，Options 提供手动清空。

### 双语对照 DOM 结构

- 原文包裹在变灰的容器中，译文包裹在正常展示的容器中，二者并排。
- 已翻译节点打标记，供提取器跳过、供回退识别。

### 安全

- API 密钥仅存于 background（chrome.storage），content script 通过消息请求翻译，永不接触密钥。
- manifest 声明最小权限，排除站点列表防止敏感页面误翻。

## Testing Decisions

### 什么是好测试

- 只测外部行为（输入 → 输出 / 状态变化），不测内部实现细节。
- 每个测试独立、可离线运行，不依赖真实网络或真实浏览器。

### 测试的模块

- scheduler：去重（相同原文并发只发一次）、并发限制、退避重试、缓存命中短路。
- cache：LRU 淘汰、持久化读写（用内存存储替身测试）。
- translator：请求体构造、响应解析、错误处理。
- extractor：段落块提取（跳过 script/style/code 等、聚合块级文本、已译节点跳过）。
- renderer：双语对照 DOM 结构正确、原文保留、标记正确。

### 测试工具

- Vitest 作为测试运行器。
- jsdom 提供 DOM 环境给 extractor / renderer。
- Vitest mock 提供 fetch / storage / IndexedDB 替身。

### 测试参考

- 项目为 greenfield，无既有测试可参考；遵循「先写测试再实现」（TDD）的切片式推进。

## Out of Scope

- 账号体系、付费、订阅。
- Firefox / Safari 等多浏览器适配（仅 Chrome）。
- hover 提示展示模式（留作后续展示模式扩展，MVP 仅双语对照）。
- 图片 / 视频内文字的 OCR 翻译。
- 语音翻译、实时字幕。
- 本地离线翻译模型（如 Gemini Nano 内置 AI）。
- 翻译结果的人工校对 / 术语表自定义。

## Further Notes

- 本 spec 是 MVP 范围；hover 展示模式、术语表、批量翻译优化等可在后续迭代补充。
- 下一步：`/to-tickets` 将本 spec 拆分为带依赖边的实现 ticket，再 `/implement` 逐条 TDD 实现。
- 领域术语与关键决策已沉淀在根目录 `CONTEXT.md`，完整架构见 `docs/architecture.md`。
