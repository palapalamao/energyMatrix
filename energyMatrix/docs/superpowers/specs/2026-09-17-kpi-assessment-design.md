# 核心 KPI 考核屏 — 需求阶段决策记录（2026-09-17）

需求：绿色医院评审 / 绩效考核支撑 —— 自动计算单位床位能耗、单位建筑面积能耗、人均能耗等核心指标。

## 现状盘点（调查证据，mytest 实测 + 源码实读）

- 后端 EmKpiService 骨架已实现且可用：EmKpi 定义 CRUD、`emFormula`
  （Axon 表达式，自由变量 emSelf/emSpan，分母缺失返回 null 不当 0）、
  `compute / computeAll`、`quotaProgress(All)`。
- Axon 端点已暴露（EnergyMatrixLib）：emKpiDefs / emKpiCompute /
  emKpiComputeAll / emQuotas / emQuotaProgressAll —— **无需新增后端接口**。
- mytest 已有 7 条指标定义：EUI_TOTAL / EUI_ELEC / WUI / EUI_PC /
  WATER_PER_BED / CARBON_INTENSITY / CBEI；12 条定额。
- EmSite 已有 area / emOccupancy / emCoolArea 参数；
  **emBeds（床位数）不存在** —— 单位床位能耗无法计算，是本需求唯一模型缺口。
- 前端已有「定额与对标」屏（定额进度视角），无 KPI 考核视角屏。

## 关键决策

1. **落地为新屏 /kpi「KPI 考核」**，归「分析优化」组，位于「能耗分析」与
   「定额与对标」之间（菜单 order -314.5），第 15 屏。与定额屏互补不重复：
   定额屏 = 限值执行进度；KPI 屏 = 指标强度 + 排名 + 趋势 + 评审判定。
2. **指标全部走既有 EmKpi 定义驱动**（emFormula 求值），前端不自算；
   新增「单位床位能耗」只需加定义 + emBeds 参数，不改代码即可配置。
3. **模型唯一变更**：EmSite 增加 `emBeds:N`（Xeto 定义 + demo 5 站点数据）。
4. **口径**：Layer 2 台账（铁律 6），月粒度为主，CBEI 按年；
   分母缺失返回 null，界面显示「—」并注明缺哪个参数，不得以 0 充数。
5. **版本统一 0.1.2**：spec 文档 V0.1.2 / em 0.1.2；后续规格文档、代码、pod
   同步 0.1.2。
6. **边界**：只读；EmKpiPoint（L3 归一化点位固化）不在本期。

## 阶段

- 阶段 1（本文档 + spec md/docx）→ 等用户确认。
- 阶段 2（确认后）：详细设计文档 + EmSite emBeds 模型 + demo 数据 +
  指标定义校正（WATER_PER_BED 编码名与中文名不符）+ 接口约定 + trio 菜单。
- 阶段 3（确认后）：前端 Kpi/ 三件套 + 测试 + pod 构建 + 真机目检。
## 补充（2026-09-17，用户确认环节追加）

- **emBeds 数据必须补齐**，且**站点基础参数 UI 可配置**。
- 调查结论：UI 可配置零后端变更 —— 数据模型配置屏 PropertyForm 已按
  fieldSchema 渲染站点表单（area/emCoolArea/emOccupancy），保存走既有
  emEntityUpdate（admin、保护标签、枚举校验、留审计）；emBeds 仅需
  在 SITE fieldSchema 加一行字段定义。
- KPI 考核屏不内嵌参数编辑：参数缺失显示「—」并引导去模型配置屏补录。

---

## 阶段 2 记录（2026-09-17，详细设计 + 模型 + 接口约定 + trio）

阶段 1 确认后执行，未动任何前端页面代码。

- 详细设计文档（md + docx，AI4B-EM-DD-2026-001）：V0.1.1 → V0.1.2；上游引用同步 V0.1.2；
  4.4 新增 KPI 数据契约段（emKpiDefs / emKpiComputeAll / emQuotas / emQuotaProgressAll /
  emEntityUpdate，只读无新增后端函数）；5.2 路由骨架加 /kpi；5.3 加「KPI 考核」模块行；
  5.4 加前端取数契约；附录 B 加 /em/kpi 行。docx 抽文本验证：V0.1.2×6、emBeds×3、和碳 0。
- 模型：spaces.xeto 的 EmSite 加 `emBeds: Number?`（核定床位数，CBEI 分母）；
  res/defaultModels/EmSite.trio 加 `emBeds:Arg("emBeds:N")`。
- UI 可配置：fieldSchema.ts 的 SITE 字段表加「核定床位数」，模型配置屏即改即用。
- trio：menu.trio 加 `entry("KPI 考核", "/kpi", -314.5, "icon-gauge")`；屏数注释 13→15。
- 更正：阶段 1 计划假设「demo.trio 5 站点补床位」不成立——demo.trio 只有 1 个商业综合体
  站点且床位不适用；mytest 的 5 站点是运行时数据，emBeds 补齐列为阶段 3 数据操作（需用户知情）。
- 更正：UI 词条不在 zh.props/en.props（那是 lib 级词条），屏内文案在 ts/src/i18n/*.json，
  阶段 3 随前端代码补。
- 已知问题：mytest 指标 WATER_PER_BED 中文名「人均水耗」与编码不符，阶段 3 改为「单位床位水耗」。
