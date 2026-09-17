# -*- coding: utf-8 -*-
import io, json, collections

zh_add = collections.OrderedDict([
    ("nav.kpi", "KPI 考核"),
    ("kpi.eyebrow", "ASSESSMENT · em::EmKpi / EmQuota"),
    ("kpi.title", "核心 KPI 考核"),
    ("kpi.desc", "单位面积 / 人均 / 单位床位能耗与碳强度 —— 绿色医院评审与绩效考核的数据底稿；数值全部取自台账与站点参数，前端不自算口径"),
    ("kpi.params", "考核参数（分母来源）"),
    ("kpi.paramsHint", "参数在「数据模型配置」屏维护；分母缺失的指标在下方显示 —，不当 0"),
    ("kpi.param.area", "建筑面积"),
    ("kpi.param.emCoolArea", "空调面积"),
    ("kpi.param.emOccupancy", "在册人数"),
    ("kpi.param.emBeds", "核定床位数"),
    ("kpi.paramMissing", "未配置，去模型配置屏补"),
    ("kpi.cards", "核心指标"),
    ("kpi.cardsHint", "本期值；核心考核指标排前面"),
    ("kpi.core", "核心"),
    ("kpi.standard", "对标依据"),
    ("kpi.noValue", "算不出"),
    ("kpi.quota", "定额执行进度"),
    ("kpi.quotaHint", "口径与「定额与对标」屏一致；来源标注与明细去那边看"),
    ("kpi.quotaTotal", "定额条数"),
    ("kpi.quotaOver", "已超限"),
    ("kpi.quotaWarn", "接近上限"),
    ("kpi.quotaNoSource", "未标注来源"),
    ("kpi.level.ok", "正常"),
    ("kpi.level.warn", "接近上限"),
    ("kpi.level.over", "已超限"),
])

en_add = collections.OrderedDict([
    ("nav.kpi", "KPI Assessment"),
    ("kpi.eyebrow", "ASSESSMENT · em::EmKpi / EmQuota"),
    ("kpi.title", "Core KPI Assessment"),
    ("kpi.desc", "Energy & carbon intensity per area / person / bed — the data basis for green hospital accreditation; all values from ledger and site parameters, never computed on the frontend"),
    ("kpi.params", "Assessment Parameters (denominators)"),
    ("kpi.paramsHint", "Maintained in Data Model screen; missing denominators show as — below, never as 0"),
    ("kpi.param.area", "Floor Area"),
    ("kpi.param.emCoolArea", "Cooled Area"),
    ("kpi.param.emOccupancy", "Occupancy"),
    ("kpi.param.emBeds", "Licensed Beds"),
    ("kpi.paramMissing", "Not set — configure in Data Model"),
    ("kpi.cards", "Core Indicators"),
    ("kpi.cardsHint", "Current period values; core assessment indicators first"),
    ("kpi.core", "Core"),
    ("kpi.standard", "Benchmark Ref"),
    ("kpi.noValue", "Not computable"),
    ("kpi.quota", "Quota Progress"),
    ("kpi.quotaHint", "Same semantics as Quota & Benchmark; details and source labels live there"),
    ("kpi.quotaTotal", "Quotas"),
    ("kpi.quotaOver", "Over Limit"),
    ("kpi.quotaWarn", "Near Limit"),
    ("kpi.quotaNoSource", "No Source Label"),
    ("kpi.level.ok", "OK"),
    ("kpi.level.warn", "Near Limit"),
    ("kpi.level.over", "Over Limit"),
])

for path, add in [(r"energyMatrix/ts/src/i18n/zh.json", zh_add), (r"energyMatrix/ts/src/i18n/en.json", en_add)]:
    data = json.load(io.open(path, encoding="utf-8"), object_pairs_hook=collections.OrderedDict)
    # nav.kpi 紧跟 nav.analysis 之后；其余 kpi.* 追加末尾（与 flow.* 同区）
    out = collections.OrderedDict()
    for k, v in data.items():
        out[k] = v
        if k == "nav.analysis":
            out["nav.kpi"] = add["nav.kpi"]
    for k, v in add.items():
        if k != "nav.kpi":
            out[k] = v
    io.open(path, "w", encoding="utf-8", newline="\n").write(json.dumps(out, ensure_ascii=False, indent=2) + "\n")
    print(path, "keys:", len(out))