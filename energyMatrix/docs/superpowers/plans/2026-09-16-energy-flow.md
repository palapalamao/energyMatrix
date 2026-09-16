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

## 阶段 3：开发（✅ 代码完成并验证，真机目检待用户配合）
- [x] ts/src/pages/Flow/flowGraph.ts —— 纯函数 buildSankey（树→边、缺口汇入「不明用能」、零值边过滤、防御自环、空输入）
- [x] ts/src/pages/Flow/FlowViewModel.ts —— mobx Store（site/span/medium 筛选，loading/error/empty）
- [x] ts/src/pages/Flow/FlowView.tsx —— recharts <Sankey>，按介质配色，tooltip（表计名/能耗/单位），空台账引导
- [x] ts/src/api/emApi.ts —— emMeterTree / emLedgerAggregate 薄封装（签名已写入详细设计 5.4）
- [x] ts/src/routes.tsx —— 加 /flow（与阶段 2 菜单项接通，两处必须同步）
- [x] ts/src/i18n/zh.json + en.json —— 「能流图」词条
- [x] 版本升级：build.fan Version("0.1.1")；ts/package.json + package-lock.json → 0.1.1
- [x] ts/tests/flow-graph.test.ts（node:test）；npm test + tsc --noEmit 全绿  （26/26 通过，tsc 0 错误）
- [x] fant energyMatrix —— 9 测试类 111 方法不回退  （111 methods / 472 verifies 全绿）
- [x] build.ps1（pwsh + EM_OUT_POD_DIR）出 pod；emInfo() 探针 version:0.1.1  （pod meta.props pod.version=0.1.1）
- [ ] FIN 真机目检（mytest 医院数据）：流向、缺口节点、筛选切换
- [ ] 提交 develop + PR（main 不动）  （本次提交推送后开 PR）

## 验证基线
- fant energyMatrix：9 tests / 111 methods / 472 verifies（当前全绿，阶段 3 不得回退）
- pod 构建产物输出到仓库 output/（EM_OUT_POD_DIR），不入 git（.gitignore 已忽略 *.pod）

## 运行期问题与修复记录（2026-09-17）

### 问题：pod 部署后能流图无数据

排查发现两个独立根因，均已修复并真机验证：

1. **演示数据缺口（数据侧）**：种子脚本在 2026-09-02 重置了全部物理表的 L1
   累积读数，差分器按 emMaxReading=9,999,999 溢出补偿，给 9/1 生成
   ~970 万 kWh/表的伪增量（derived），缺口率 895%。
   修复：用 phable 直连按「锚点=9/1 读数 + k×9月日增量」重写 9/2–9/14
   历史（脚本留 WSL ~/emfix/），随后原样重放 emNightlyPipeline daily。
   验证：某医院 9 月聚合全部 measured，总进线 670,800 kWh；三院区
   gapRatio 2.2–2.7%。8 月关账数据未动。

2. **前端读错列名（代码侧）**：后端 EmLedgerQuery.aggregate 的维度列按 dim
   值命名（dim="meter" 时列名="meter"），FlowViewModel 原读 ref(d,"dim")
   得全 null → 空图。改为 ref(d,"meter")，与既有分析屏读法一致。

3. **recharts 2.15.4 <Sankey> 不读节点数据上的 fill、不画标签、链接固定灰
   #333**（node_modules 源码实读为证）。本屏以 node/link 渲染器接管：
   节点 Rectangle 用数据 fill（按介质配色）+ text 标签；链接 stroke 取
   源节点介质色。FlowView.tsx 修改，npm test 26/26 + tsc 0 错。

### 部署验证

- pod 重建（em-app-B90YF6uq.js）→ 提权停服拷贝至 FIN lib\fan → 重启 FIN5。
- 服务器确认提供新包；登录 mytest 后经 FIN 外壳 LoadApplication 打开 /flow。
- 真机验证：全部介质 34 节点/33 流；「电」筛选 16 节点/15 流且全金色
  （#F0B429）+ 不明用能灰色汇点；标签齐全（10kV 总进线 → 各分项）。
- 截图取证：docs/evidence/flow-sankey-chart.png（注意：finMobile 外壳页
  表面截图/打印为白，证据经抽取 SVG 独立渲染获得）。

### 经验

- **pod 内 SPA 缓存激进**：换 pod 后浏览器可能仍用旧 index.html（本次实测
  iframe 自动重载后拉回旧包 B2J9BArZ）。排查前端问题时必须先确认
  实际运行的 bundle 名，必要时清缓存硬刷。
- 访问能流图必须走 FIN 外壳（/finMobile/mytest → LoadApplication），
  直接开 pod URL 缺 Attest-Key，eval 会失败。
