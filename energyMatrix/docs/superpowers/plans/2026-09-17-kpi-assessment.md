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