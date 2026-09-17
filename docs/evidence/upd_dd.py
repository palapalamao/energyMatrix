# -*- coding: utf-8 -*-
import io
p = r"D:\mygithub\energyMatrix\docs\designdoc\energyMatrix-fin-pod-detailed-design.md"
s = io.open(p, encoding="utf-8").read()

def rep(old, new):
    global s
    assert s.count(old) == 1, "anchor not unique/found: %r count=%d" % (old[:40], s.count(old))
    s = s.replace(old, new)

# 1. 封面版本
rep("**energyMatrix**\n\n**FIN Pod 详细设计说明书**\n\n数据接口 · Fantom 类设计 · 前端骨架 · 部署与时序\n\n版本 V0.1.1",
    "**energyMatrix**\n\n**FIN Pod 详细设计说明书**\n\n数据接口 · Fantom 类设计 · 前端骨架 · 部署与时序\n\n版本 V0.1.2")

# 2. 文档信息表：版本 + 上游引用
rep("| 版本 | V1.0 |", "| 版本 | V0.1.2 |")
rep("《energyMatrix 语义模型设计说明书》V0.1.1 |", "《energyMatrix 语义模型设计说明书》V0.1.2 |")

# 3. 修订记录加行
rep("| V0.1.1 | 2026-09 | 新增能流图（Sankey）屏设计；版本统一为 0.1.1；公司主体变更为西门子中国 | 架构组 |",
    "| V0.1.1 | 2026-09 | 新增能流图（Sankey）屏设计；版本统一为 0.1.1；公司主体变更为西门子中国 | 架构组 |\n| V0.1.2 | 2026-09 | 新增核心 KPI 考核屏（/kpi）设计：复用 emKpiDefs/emKpiComputeAll/emQuotaProgressAll，站点模型新增 emBeds（核定床位数）且参数 UI 可配置；版本统一为 0.1.2 | 架构组 |")

# 4. 4.4 Axon 函数库 —— KPI 数据契约段
old44 = "只读，不新增 Axon 函数、不新增后端接口。"
rep(old44, old44 + "\n\nKPI 考核（V0.1.2 新增，见 5.3）数据契约：指标定义取自 emKpiDefs()（emKpiCode、dis、emFormula、unit、emGranularity、emDimension、emHigherIsBetter、emStandardRef），数值批量取自 emKpiComputeAll(kpiCode, [subjectRef...], span)（emFormula 走 Axon 求值，分母缺失返回 null 不当 0），定额进度取自 emQuotas(subjectRef) 与 emQuotaProgressAll(subjectRef, span)。站点考核参数（area、emCoolArea、emOccupancy、emBeds）由模型配置屏经通用写接口 emEntityUpdate(entityId, changes) 维护（admin、枚举校验、留审计）。KPI 屏只读，不新增 Axon 函数、不新增后端接口。")

# 5. 5.2 路由骨架加 /kpi
rep("/flow                        能流图（Sankey）",
    "/flow                        能流图（Sankey）\n/kpi                         KPI 考核（核心指标 + 定额进度）")

# 6. 5.3 模块功能说明加行
rep("| 能流图 | 能源流向 Sankey、按介质分色、缺口断流汇入不明用能、tooltip 表计名与能耗 | 无 | 流向宽度取 L2 台账合计；考核表不参与汇总；空台账给引导不白屏 |",
    "| 能流图 | 能源流向 Sankey、按介质分色、缺口断流汇入不明用能、tooltip 表计名与能耗 | 无 | 流向宽度取 L2 台账合计；考核表不参与汇总；空台账给引导不白屏 |\n| KPI 考核 | 核心指标卡（单位面积能耗/电耗、人均能耗/水耗、单位床位能耗、碳强度）、定额进度对标、绿色医院评审数据支撑 | 无 | 分母缺失显示「—」并引导至模型配置屏；参数可配置（emBeds 等站点属性） |")

# 7. 5.4 前端取数契约加行
rep("mobx Store 内合并后经纯函数 buildSankey 转为 recharts Sankey 的 {nodes, links}。",
    "mobx Store 内合并后经纯函数 buildSankey 转为 recharts Sankey 的 {nodes, links}。\n\nKPI 考核前端取数契约（emApi 薄封装，V0.1.2）：emKpiDefs() 取指标定义、emKpiComputeAll(code, [site], span) 批量取值、emQuotaProgressAll(site, span) 取定额进度；分母缺失的指标显示「—」不当 0。")

# 8. 附录 B 路由清单加行
rep("| /em/flow | FlowPage | em:read | 能流图（Sankey），流向带宽∝台账能耗 |",
    "| /em/flow | FlowPage | em:read | 能流图（Sankey），流向带宽∝台账能耗 |\n| /em/kpi | KpiPage | em:read | KPI 考核：核心指标卡与定额进度，分母缺失显示「—」 |")

io.open(p, "w", encoding="utf-8", newline="\n").write(s)
print("OK all 8 edits")