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