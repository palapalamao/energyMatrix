# -*- coding: utf-8 -*-
import io, sys
sys.stdout.reconfigure(encoding="utf-8")
p = "output/energyMatrix-semantic-model-design-spec.md"
s = io.open(p, encoding="utf-8").read()

old = "模型变更（本需求唯一模型缺口）：EmSite 增加 `emBeds:N`（在册床位数，单位床位能耗的分母），Xeto 定义与 demo 数据同步补齐（5 个站点）；既有参数 area（建筑面积）、emOccupancy（在册人数）、emCoolArea（空调面积）沿用，不重定义。"
new = ("模型变更（本需求唯一模型缺口）：EmSite 增加 `emBeds:N`（在册床位数，单位床位能耗的分母），Xeto 定义与 demo 数据同步补齐（5 个站点）；既有参数 area（建筑面积）、emOccupancy（在册人数）、emCoolArea（空调面积）沿用，不重定义。\n\n\n\n\n"
"参数可配置：站点基础参数（建筑面积 / 空调面积 / 在册人数 / 床位数）统一在既有「数据模型配置」屏在线维护（PropertyForm 表单经既有 `emEntityUpdate` 写入，admin 权限、拒绝受保护标签、写操作留审计），KPI 考核屏不内嵌参数编辑；参数缺失时 KPI 屏显示「—」并引导去模型配置补录。")
assert old in s
s = s.replace(old, new, 1)

old2 = "| V0.1.2 | 2026-09 | 新增核心 KPI 考核界面需求（绿色医院评审支撑）；EmSite 增加 emBeds 床位参数；版本统一为 0.1.2 | 架构组 |"
new2 = "| V0.1.2 | 2026-09 | 新增核心 KPI 考核界面需求（绿色医院评审支撑）；EmSite 增加 emBeds 床位参数且基础参数可在数据模型配置屏在线维护；版本统一为 0.1.2 | 架构组 |"
assert old2 in s
s = s.replace(old2, new2, 1)
io.open(p, "w", encoding="utf-8", newline="\n").write(s)
print("md updated")