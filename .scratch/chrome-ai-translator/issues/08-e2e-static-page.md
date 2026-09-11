# 08: 端到端：静态整页翻译

**What to build:** 打通整条链路——页面加载后，Content Script 提取全页段落块，经 Background 翻译，再把译文以双语对照渲染回页面。这是用户第一次真正看到「打开外文页面就变成双语」的效果。

**Blocked by:** 05, 06, 07

**Status:** ready-for-agent

- [x] 打开一个静态外文页面，整页文本自动变为双语对照，无需任何手动触发（✅ 已人工验证：aihero.dev 198 块全部成功）
- [x] 页面原有布局与样式不被破坏（✅ 已人工验证：改为追加式渲染后原站结构完好）
- [x] 同一句话在整页内只请求一次（去重生效）
- [x] 第二次打开同一页面时命中缓存，不再产生 API 调用
- [x] 翻译完成前原文正常可读（渲染发生在响应返回之后，原文在此之前保持原样）

**实现备注：** 端到端链路拆为可测函数 `src/content/translate-page.ts`（注入 root / hostname / getContext / sendTranslateRequest），因此「提取→请求→渲染」整条链路无需浏览器即可测试。Content Script 只读取非敏感设置（开关 / 目标语言 / 排除站点），从不读取 API 凭据。
