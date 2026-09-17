# -*- coding: utf-8 -*-
import io
p = r"energyMatrix/lib/demo.trio"
s = io.open(p, encoding="utf-8").read()
old = '''    emAddKpi("CBEI", "单位面积碳排", "emCarbonNet(emSelf->id, emSpan) / emSelf->area", {
      emSynthetic, emDataProvenance: "emDemoBuild",
      unit: "kgCO2e/m²", emGranularity: "yearly", emHigherIsBetter: false,
      emStandardRef: "GB/T 51366-2019 建筑碳排放计算标准",
      emDimension: ["site"]})'''
new = old + '''
    // 单位床位能耗 —— 绿色医院评审核心指标，分母是 EmSite.emBeds（V0.1.2 新增）。
    // 非医院业态（如本零售示范）没有床位，该指标对这些站点显示「—」。
    emAddKpi("EUI_BED", "单位床位能耗", "emLedgerTotal(emSelf->id, emSpan) / emSelf->emBeds", {
      emSynthetic, emDataProvenance: "emDemoBuild",
      unit: "kWh/床", emGranularity: "monthly", emHigherIsBetter: false,
      emStandardRef: "绿色医院评审 单位床位能耗口径",
      emDimension: ["site"]})'''
assert s.count(old) == 1, "anchor count %d" % s.count(old)
s = s.replace(old, new)
io.open(p, "w", encoding="utf-8", newline="\n").write(s)
print("demo.trio OK")