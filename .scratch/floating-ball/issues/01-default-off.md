# 01: 默认不翻译

**What to build:** 打开任意页面时默认保持原文，不再自动发起翻译。用户主动触发才翻译。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] `DEFAULT_SETTINGS.enabled` 改为 `false`
- [x] Content Script 启动时**不再**自动执行整页翻译
- [x] 已保存过设置的用户不受影响（存储值优先于默认值）
- [x] 单元测试覆盖：默认关闭时 `translatePage` 不被自动触发

**实现备注：** 只改默认行为，不删除任何现有能力——自动翻译的入口保留，后续由悬浮球或站点白名单触发。
