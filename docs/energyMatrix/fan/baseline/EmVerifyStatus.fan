using haystack

**
** 节能量核证状态（说明书 §4.6）。
**
** 铁律 10（强制约束，说明书原文）：任何节能量在通过基线核证前，一律标记为
** `planned`（规划目标）。**禁止以已核证口径出现在报表、账单或对外材料中。**
** 这一约束与 Layer 1 的 `emDataSource` 追溯链共同构成本系统对外数字的
** 可信性基础。
**
const class EmVerifyStatus
{
  ** 规划目标：所有对外数字的默认状态。
  static const Str planned    := "planned"
  ** 报告期采集中。
  static const Str monitoring := "monitoring"
  ** 已算出但未审核。
  static const Str computed   := "computed"
  ** 已核证 —— 只有它可以作为节能量正式引用。
  static const Str verified   := "verified"
  ** 核证不通过。
  static const Str rejected   := "rejected"

  static const Str[] all := [planned, monitoring, computed, verified, rejected]

  ** 新建节能项目的默认状态（铁律 10）。
  static const Str defaultStatus := planned

  static Bool isValid(Str? s) { s != null && all.contains(s) }

  ** 可作为节能量正式对外引用。只有 verified。
  static Bool canPublish(Str s) { s == verified }

  **
  ** 取项目的核证状态。缺失时返回 `planned` —— 缺省必须是最保守的那个，
  ** 不能因为字段没填就当成已核证。
  **
  static Str of(Dict rec) {
    s := rec["emVerifyStatus"] as Str
    return isValid(s) ? s : defaultStatus
  }

  **
  ** 取项目可对外引用的节能量。
  **
  ** 说明书表 4-6 把节能量拆成三个**任何时候不得相互替代**的字段：
  **   emSavingsPlanned   规划节能量 —— 必须标注为规划目标
  **   emSavingsMeasured  报告期实测差值 —— 仅内部使用
  **   emSavingsVerified  经调整后的核证节能量 —— 可正式引用
  ** 未核证时返回 null，而不是退回 planned 值冒充。
  **
  static Number? publishableSavings(Dict project) {
    if (!canPublish(of(project))) return null
    return project["emSavingsVerified"] as Number
  }
}

**
** IPMVP 选项（说明书 §4.6 表 4-5）。
**
const class EmIpmvpOption
{
  ** 部分参数测量：关键参数实测，其余估算（照明改造等）。
  static const Str optionA := "optionA"
  ** 全参数测量：措施级独立计量（单一设备改造）。
  static const Str optionB := "optionB"
  ** 整体计量：关口表或总表回归（全楼综合措施）。
  static const Str optionC := "optionC"
  ** 校准仿真：对接 CoolSim（无完整基准期数据的场景）。
  static const Str optionD := "optionD"

  static const Str[] all := [optionA, optionB, optionC, optionD]

  static Bool isValid(Str? s) { s != null && all.contains(s) }
}

**
** 基线模型类型（说明书 §4.6）。
**
const class EmModelType
{
  static const Str linearRegression   := "linearRegression"
  static const Str multiVarRegression := "multiVarRegression"
  ** 变点模型 3P/5P，温度相关负荷首选。
  static const Str changePoint        := "changePoint"
  ** LightGBM 等，需固化为 ONNX。
  static const Str gbdt               := "gbdt"
  ** CoolSim 校准仿真。
  static const Str simulation         := "simulation"

  static const Str[] all := [linearRegression, multiVarRegression, changePoint, gbdt, simulation]

  static Bool isValid(Str? s) { s != null && all.contains(s) }

  ** 该模型类型的默认参数个数 p，用于 ASHRAE G14 的自由度修正。
  static Int params(Str t) {
    if (t == linearRegression)   return 2
    if (t == multiVarRegression) return 3
    if (t == changePoint)        return 3
    return 2
  }
}
