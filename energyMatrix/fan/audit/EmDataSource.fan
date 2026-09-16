using haystack

**
** 数据来源分级（说明书 §5.1 表 5-1）—— 所有能耗账目可审计性的根。
**
** 铁律 4：**每个数值必带 emDataSource**。这不是可选元数据，是"这笔账能不能
** 用于结算 / 能不能对外披露"的判据：
**
** | 等级       | 含义                     | 可结算 | 可披露 |
** |-----------|--------------------------|-------|-------|
** | measured  | 实测，物理表计直采        | 是    | 是    |
** | derived   | 推导，由其他实测量运算得出 | 是    | 是    |
** | allocated | 分摊，按规则从上级量分配   | 是（需规则备案）| 是（需注明分摊）|
** | estimated | 估算，模型或历史均值填补   | **否** | **否** |
** | manual    | 人工录入，抄表或账单      | 是（需双人复核）| 是    |
**
const class EmDataSource
{
  static const Str measured  := "measured"
  static const Str derived   := "derived"
  static const Str allocated := "allocated"
  static const Str estimated := "estimated"
  static const Str manual    := "manual"

  static const Str[] all := [measured, derived, allocated, estimated, manual]

  static Bool isValid(Str? s) { s != null && all.contains(s) }

  ** 可用于结算。`estimated` 不可 —— 估算值进结算链就等于把不确定性变成账单。
  static Bool canSettle(Str s) { s != estimated }

  ** 可用于对外披露。同上。
  static Bool canDisclose(Str s) { s != estimated }

  ** 需要额外备案 / 复核才能成立的等级。
  static Bool needsEvidence(Str s) { s == allocated || s == manual }

  ** 取记录的来源等级；缺失返回 null（调用方应视为校验失败，不要默认成 measured）。
  static Str? of(Dict rec) {
    s := rec["emDataSource"] as Str
    return isValid(s) ? s : null
  }
}
