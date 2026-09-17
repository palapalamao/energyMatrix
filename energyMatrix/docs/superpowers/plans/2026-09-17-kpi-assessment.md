# 核心 KPI 考核屏（/kpi）实施计划 —— V0.1.2

> 流程：阶段 1 需求文档（✅ 已确认）→ 阶段 2 规格/模型/接口/trio（本阶段）→ 阶段 3 开发。
> 每阶段推送 develop 后停下等用户确认。版本统一 0.1.2，公司名「西门子中国」。

## 阶段 2（当前，已执行）

- [x] 详细设计文档 md+docx：版本 → V0.1.2，上游引用 → V0.1.2，修订记录加行
- [x] 详细设计文档：4.4 加 KPI 数据契约段、5.2 路由骨架加 /kpi、5.3 加「KPI 考核」模块行、5.4 加前端取数契约、附录 B 加 /em/kpi
- [x] docx 同步修改并抽文本验证（V0.1.2×6、emBeds×3、和碳 0 残留）
- [x] 模型 `res/spec/em/spaces.xeto`：EmSite 加 `emBeds: Number?`
- [x] 模型 `res/defaultModels/EmSite.trio`：默认模型加 `emBeds:Arg("emBeds:N")`
- [x] UI 可配置 `ts/src/pages/Model/fieldSchema.ts`：SITE 字段表加「核定床位数」
- [x] 菜单 `lib/menu.trio`：加 `entry("KPI 考核", "/kpi", -314.5, "icon-gauge")`，屏数注释 13→15
- [ ] 验证：tsc --noEmit、pod 构建资源校验
- [ ] 提交 develop 并推送，停下等确认

## 阶段 3（确认后执行）

- [ ] 前端三件套 `ts/src/pages/Kpi/`：KpiViewModel.ts（mobx 三态）、KpiView.tsx（指标卡 + 定额进度表）、kpiFormat.ts（纯函数：单位换算/缺失「—」/定额进度色）
- [ ] `ts/src/routes.tsx` 加 `/kpi` 路由（与菜单深链接通）
- [ ] `ts/src/i18n/zh.json` + `en.json` 补词条
- [ ] `ts/src/api/emApi.ts` 核对/补齐封装（emKpiDefs / emKpiComputeAll / emQuotaProgressAll 已存在，按设计文档契约定稿）
- [ ] 测试 `ts/tests/kpi-format.test.ts`（node:test：单位换算、null→「—」、进度色阈值）
- [ ] 版本升级：`build.fan` `Version("0.1.2")`、`ts/package.json` + lock → 0.1.2
- [ ] `npm test` + `tsc --noEmit` 全绿；`fant energyMatrix` 111 方法不回退
- [ ] 构建 pod（build.ps1 + EM_OUT_POD_DIR），`emInfo()` 返回 0.1.2
- [ ] mytest 医院站点补 emBeds 数据（运行时数据操作，单独列示并经确认）
- [ ] 真机目检：指标卡数值、缺失分母显示「—」、模型配置屏可改床位数
- [ ] 提交 develop，更新 PR

## 关键决策（阶段 2 调查结论）

1. **后端零新增**：EmKpiService 已实现（emFormula Axon 求值、分母缺失返 null），
   EnergyMatrixLib 已暴露 emKpiDefs/emKpiCompute/emKpiComputeAll/emQuotas/emQuotaProgressAll；
   通用写接口 emEntityUpdate 已存在（admin、保护 id/mod/energyMatrix、枚举校验、留审计）。
2. **模型唯一变更**：EmSite 加 `emBeds:N`（xeto + 默认模型 + fieldSchema）。
3. **demo 数据不改动**：demo.trio 唯一站点是商业综合体，床位不适用——
   更正阶段 1 计划中的「demo.trio 5 站点」假设（那是 mytest 运行时数据，不在仓库）。
   mytest 医院站点的 emBeds 补齐列为阶段 3 运行时数据操作。
4. **UI 词条**：zh.props/en.props 是 lib 级词条，UI 屏内文案在 ts/src/i18n/*.json，
   随阶段 3 前端代码一起加（与能流图屏同一做法）。
5. **KPI 屏只读**：参数编辑归模型配置屏（/model），KPI 屏缺失显示「—」并引导。
6. **已知数据问题（阶段 3 顺带校正）**：mytest 的 WATER_PER_BED 指标中文名「人均水耗」
   与编码不符，应改为「单位床位水耗」；届时一并修正。
## 阶段 3 执行记录（2026-09-17，已完成并真机验收）

- [x] 前端三件套 `ts/src/pages/Kpi/`（kpiFormat 纯函数 / KpiViewModel / KpiView）
- [x] `routes.tsx` 加 `/kpi`；`AppShell.tsx` 侧栏加「KPI 考核」入口
- [x] i18n zh/en 补 25 个词条
- [x] 测试 `ts/tests/kpi-format.test.ts` 7 用例；npm test 33 全绿；tsc --noEmit 通过
- [x] 版本 0.1.2：build.fan / package.json / package-lock；`fant energyMatrix` 111 方法全绿
- [x] 部署排障：build.ps1 只编译不拷贝到 FIN lib/fan（其 "BUILD OK" 只判断文件存在，具误导性）；
  需另行提权跑 docs/evidence/deploy.ps1（拷贝+重启 FIN5）。emInfo() 已验证返回 0.1.2。
- [x] demo.trio 种子补 EUI_BED（单位床位能耗，/emBeds，kWh/床）
- [x] 运行时数据：emAddKpi(EUI_BED) 建出 @p:mytest:r:323e1d27-313c3e7c；
  emEntityUpdate 补 4 站点床位数（南 800/西 1000/东 1500/某医院 1200）
- [x] 真机验收（某医院·本月）：参数卡 4 项全有值；核心指标 8 卡含
  单位床位能耗 2,146.1 kWh/床；定额 8 条（2 超/1 预警）；版本徽标 0.1.2
  （截图 docs/evidence/kpi-screen-mytest.png）

## 已知数据问题（本次未改，上报）

1. WATER_PER_BED 编码名实不符：编码是"按床位"，但公式/单位/名称都是"人均"（m³/人）。
   emKpi 非资产树对象，emEntityUpdate 拒改，无改名路径；保留现状仅上报。
2. 某医院站点 emUsageType=retail 与名称不符（KPI 屏不受影响）。
