# 01: 项目脚手架与 MV3 扩展骨架

**What to build:** 从零搭起可扩展的项目骨架：TypeScript + Vite 构建，Manifest V3 清单，Content Script / Background Service Worker / Popup / Options 四个入口齐备。产物能真正加载到 Chrome，工具栏出现图标，点击能打开一个占位 Popup。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] 构建命令产出可直接加载的扩展目录（`dist/`）
- [ ] 在 Chrome 扩展管理页以「加载已解压的扩展程序」方式成功加载，无 manifest 报错（**需人工验证**）
- [x] manifest 声明为 V3，且只申请翻译所需的最小权限
- [x] 四个入口（content / background / popup / options）均被构建产出
- [ ] 点击工具栏图标能打开 Popup 占位页（**需人工验证**）
- [x] 测试运行器就绪，能跑通 smoke 测试

**实现备注：** 测试环境用 happy-dom 取代 jsdom——jsdom 自带跨 realm 的 `Uint8Array`，会让 esbuild 的 invariant 校验失败导致测试无法启动（vitest#4043）。
