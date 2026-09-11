# 03: AI 客户端（OpenAI 兼容）

**What to build:** 一个注入 fetch 的翻译客户端，按 OpenAI 兼容契约构造请求、解析译文，并区分处理各类失败（网络错误、非 2xx、响应结构异常），让上层能据此决定是重试还是降级。

**Blocked by:** 01

**Status:** ready-for-agent

- [x] 客户端不直接依赖网络实现，fetch 通过注入获得
- [x] 请求按 OpenAI 兼容契约构造：目标地址、模型名、system 提示词约束为翻译引擎、待译文本、低温度
- [x] 正确从响应中取出首条译文内容
- [x] 对网络失败、非 2xx、响应结构异常分别抛出可区分的错误
- [x] 单元测试覆盖：请求体构造、响应解析、各类错误的处理

**实现备注：** 错误以 `AiTranslationError` 抛出，带 `kind`（network / http / format）与 `status`，供调度器判断重试策略。源语言不要求模型回传，固定为 `auto`（模型自动识别源语言）。
