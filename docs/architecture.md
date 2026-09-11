# 浏览器插件「AI 实时翻译」架构设计

## 1. 目标

一个 Chrome 扩展（Manifest V3），调用外部 AI 模型，对整个网页做**双语对照**的实时翻译，通过缓存降低 API 成本，并提供语言选择、翻译开关与设置面板。

## 2. 总体架构

```
┌──────────────────────────────────────────────────────┐
│                    Popup（工具栏弹窗）                  │
│       目标语言选择 · 翻译开关 · 当前站点排除 · 进设置     │
├──────────────────────────────────────────────────────┤
│              Background Service Worker                │
│   翻译调度 · 并发/去重 · 缓存读写 · OpenAI 兼容客户端    │
│   （apiKey 只在这里，content script 不接触）            │
├──────────────────────────────────────────────────────┤
│                  Content Script                       │
│   提取段落块 → 双语渲染 → MutationObserver → 可见排序     │
├──────────────────────────────────────────────────────┤
│               Options Page（设置面板）                  │
│   API 配置 · 排除站点列表 · 缓存管理                    │
└──────────────────────────────────────────────────────┘
    存储：chrome.storage.sync（设置） / IndexedDB（缓存）
```

## 3. 技术栈

- 语言：TypeScript
- 构建：Vite + `@crxjs/vite-plugin`（多入口：content / background / popup / options）
- Content Script 与 Background 用原生 TS + 轻量 DOM 操作，**不引入 UI 框架**（要注入到任意第三方页面，避免框架冲突与体积开销）
- Popup / Options 可选 Vue 3（用户熟悉）

## 4. 模块详细设计

### 4.1 Content Script（注入网页）

| 模块 | 职责 |
| ---- | ---- |
| `text-extractor` | `TreeWalker(SHOW_TEXT)` 遍历，跳过 `script/style/noscript/textarea/code/pre` 与已翻译节点，按块级祖先聚合成「段落块」 |
| `dom-renderer` | 双语对照渲染：原文包 `span.tr-origin`（灰），译文包 `span.tr-target` |
| `mutation-observer` | 监听 DOM 增删改，**防抖（约 500ms）** 合并批量变化后增量提取 |
| `visibility-scheduler` | `IntersectionObserver` 计算可见性，产出「可见优先」的翻译顺序 |
| `messaging` | 与 background 的 `chrome.runtime` 消息收发 |

**段落块提取要点**：遍历文本节点，找到其最近块级元素祖先，把该块内的所有文本聚合成一个翻译单元，生成稳定 `id`（基于路径或原文 hash）。

**双语渲染示例**：

```html
<!-- 原文 -->
<p>Hello world</p>
<!-- 翻译后 -->
<p>
  <span class="tr-target">你好，世界</span>
  <span class="tr-origin">Hello world</span>
</p>
```

### 4.2 Background Service Worker（MV3）

| 模块 | 职责 |
| ---- | ---- |
| `translator` | OpenAI 兼容客户端：`POST {baseURL}/chat/completions`，system 提示词约束为翻译引擎 |
| `scheduler` | 翻译队列：并发限制（3–5 路）、请求去重、失败指数退避重试 |
| `cache` | IndexedDB 封装（读 / 写 / 命中） |
| `router` | 消息路由：响应 content script 的翻译请求、popup/options 的设置读写 |

**OpenAI 兼容请求体**：

```json
{
  "model": "用户配置",
  "messages": [
    { "role": "system", "content": "你是翻译引擎，只输出译文，不解释。" },
    { "role": "user", "content": "将以下内容翻译成{目标语言}：{段落文本}" }
  ],
  "temperature": 0.3
}
```

### 4.3 存储层

| 存储 | 用途 |
| ---- | ---- |
| `chrome.storage.sync` | 用户设置：目标语言、API 配置（baseURL/key/model）、排除站点列表、翻译开关 |
| IndexedDB（`translations` 表） | 翻译缓存，key = `hash(原文) + ':' + 目标语言`，value = `{译文, 源语言, 时间戳}` |
| 内存 Map（LRU） | 热缓存，容量约 500–1000 条，加速命中 |

### 4.4 UI

- **Popup**：目标语言下拉框、全局翻译开关、当前站点「排除/恢复」、进设置入口。
- **Options**：API 配置表单、排除站点列表（增删）、缓存管理（清空 / 查看占用）。

## 5. 数据流与消息协议

content script → background 消息：

```
TRANSLATE_REQUEST  { blocks: [{ id, text, targetLang }] }
TRANSLATE_RESULT   { results: [{ id, translated, sourceLang }] }
```

**完整流程**：

1. 页面加载 / 内容变化 → content script 提取段落块。
2. 先查**内存 LRU** → 命中直接渲染。
3. 未命中 → 发 `TRANSLATE_REQUEST` 给 background。
4. background 查 **IndexedDB** → 命中直接返回。
5. 未命中 → 进 `scheduler` 队列（去重 + 并发限制）→ 调 AI API → 写 IndexedDB → 返回结果。
6. content script 收到结果 → 双语渲染。

## 6. 缓存策略

- key：`hash(原文) + ':' + 目标语言`（同一句话跨页面、跨站点都命中）。
- 分层：内存 LRU（热）→ IndexedDB（持久化，无 10MB 配额压力）。
- 默认不过期（翻译结果相对稳定），Options 提供手动清空。
- 命中缓存即省一次 API 调用，是成本控制的核心。

## 7. 性能与成本控制

- **并发限制**：3–5 路，避免打爆 API 限流。
- **请求去重**：相同 `原文 + 目标语言` 并发时只发一次。
- **可见优先**：视口内先翻，后台补翻其余，长页面不一次性海量调用。
- **段落合并**：相邻短文本合并为一次请求，省 overhead 与 token。
- **防抖**：DOM 变化 500ms 内合并为一次批量提取。

## 8. 安全

- API key 存 `chrome.storage`，只进 background；content script 通过消息请求翻译，**永不接触 key**。
- 排除站点列表：防止在网银、内网等敏感页面误翻。
- 仅请求目标站点权限，最小化 manifest 权限声明。

## 9. 下一步

本架构收敛后，按主流程推进：

```
/to-spec   → 产出 .scratch/<feature>/spec.md
/to-tickets → 拆分为带依赖边的 ticket
/implement → 逐 ticket TDD 实现
```
