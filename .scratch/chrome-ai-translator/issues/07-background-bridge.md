# 07: Background 翻译桥

**What to build:** Background Service Worker 能接收 Content Script 发来的翻译请求，读取用户配置的 API 凭据，交给调度器处理（先查缓存、再调 AI），并把结果回传。密钥与网络调用都只发生在 background，Content Script 全程不接触密钥。

**Blocked by:** 04

**Status:** ready-for-agent

- [x] Service Worker 能接收 TRANSLATE_REQUEST 并返回 TRANSLATE_RESULT（含译文与检测到的源语言）
- [x] 翻译前先查缓存，命中则不调用 AI
- [x] API 凭据从持久设置中读取，不硬编码，不传递给 Content Script
- [x] 翻译失败时向请求方返回可识别的失败结果，而不是静默无响应
- [x] 针对消息收发与缓存短路的集成测试通过
