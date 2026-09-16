# 能流图（Sankey）新屏 · 实施计划

> 日期：2026-09-16 ｜ 分支：develop ｜ 设计记录：specs/2026-09-16-energy-flow-design.md
> 阶段闸门：①需求文档 → 确认 → ②规格/模型/接口/trio → 确认 → ③开发

## 阶段 1：需求文档（✅ 已完成，提交 13308a9，用户已确认）
- [x] 语义模型设计说明书 spec md+docx：V0.1.1、新增第 7 章 7.1 能流图、西门子中国、修订记录
- [x] 过程设计文档 specs/2026-09-16-energy-flow-design.md

## 阶段 2：规格文档 + 模型 + 接口 + trio（✅ 本次完成，待用户确认）
- [x] 详细设计 md+docx（AI4B-EM-DD-2026-001）：V0.1.1、上游引用 V0.1.1、西门子中国、修订记录
- [x] 4.4 Axon 函数库：新增 emLedgerQuery 行（表 4-3 计 21 项）+ 能流图数据契约段
- [x] 5.2 路由骨架：十个一级模块 + /flow；附录 B 加 /em/flow | FlowPage | em:read
- [x] 5.3 模块功能说明：新增「能流图」行（只读、L2 台账宽度、缺口断流、空态不白屏）
- [x] 5.4 数据获取：emApi 取数契约段（emMeterTree + emLedgerAggregate → buildSankey）
- [x] 模型定义核对（结论：无需新增 def）：
  - emMedium / emVirtual / emGap / emMeterRole：defs.trio ✅、xeto ✅
  - submeterOf：xeto（meters.xeto）✅；defs.trio 不重复声明（属 ph 标准命名空间，FIN 自带）
  - emDepth / emChildCount：emMeterTree 的**查询期派生列**，非记录标签，按约定不入 defs
- [x] lib/menu.trio：「能流图」菜单项 entry("能流图", "/flow", -315.5, "workflow")，归「监测运行」组
- [ ] ~~zh.props / en.props 补词条~~ **偏差记录**：能流图无新 Axon 函数，pod locale 层无可注册词条；
      菜单显示名随 menu.trio 硬编码（与现有 13 项一致）。SPA 界面词条在阶段 3 落 ts/src/i18n/{zh,en}.json。

## 阶段 3：开发（⛔ 等用户确认阶段 2 后执行）
- [ ] ts/src/pages/Flow/flowGraph.ts —— 纯函数 buildSankey（树→边、缺口汇入「不明用能」、零值边过滤、防御自环、空输入）
- [ ] ts/src/pages/Flow/FlowViewModel.ts —— mobx Store（site/span/medium 筛选，loading/error/empty）
- [ ] ts/src/pages/Flow/FlowView.tsx —— recharts <Sankey>，按介质配色，tooltip（表计名/能耗/单位），空台账引导
- [ ] ts/src/api/emApi.ts —— emMeterTree / emLedgerAggregate 薄封装（签名已写入详细设计 5.4）
- [ ] ts/src/routes.tsx —— 加 /flow（与阶段 2 菜单项接通，两处必须同步）
- [ ] ts/src/i18n/zh.json + en.json —— 「能流图」词条
- [ ] 版本升级：build.fan Version("0.1.1")；ts/package.json + package-lock.json → 0.1.1
- [ ] ts/tests/flow-graph.test.ts（node:test）；npm test + tsc --noEmit 全绿
- [ ] fant energyMatrix —— 9 测试类 111 方法不回退
- [ ] build.ps1（pwsh + EM_OUT_POD_DIR）出 pod；emInfo() 探针 version:0.1.1
- [ ] FIN 真机目检（mytest 医院数据）：流向、缺口节点、筛选切换
- [ ] 提交 develop + PR（main 不动）

## 验证基线
- fant energyMatrix：9 tests / 111 methods / 472 verifies（当前全绿，阶段 3 不得回退）
- pod 构建产物输出到仓库 output/（EM_OUT_POD_DIR），不入 git（.gitignore 已忽略 *.pod）
