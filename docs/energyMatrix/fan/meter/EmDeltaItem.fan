using haystack

**
** 一个 L2 区间增量样本（说明书 §3.6 的 L2 层）。
**
** `val` 为 null 表示该区间无法给出可信增量 —— 调用方必须把它计入
** `emQuality` 的分母，而不是当 0 处理。把不可信区间悄悄当 0，是能耗账
** 里最常见也最难查的错。
**
const class EmDeltaItem
{
  ** 正常差分。
  static const Str reasonNormal      := "normal"
  ** 累积量翻转，已按 `emMaxReading` 补偿。
  static const Str reasonOverflow    := "overflow"
  ** 跨 `emInstallDate` 换表，新表从 0 起算。
  static const Str reasonMeterChange := "meterChange"
  ** 负增量且无法用翻转解释 —— 数据质量问题，val 为 null。
  static const Str reasonNegative    := "negative"
  ** 采集断点（相邻样本间隔远超采样周期），val 为 null。
  static const Str reasonGap         := "gap"

  new make(DateTime ts, Number? val, Str reason) {
    this.ts     = ts
    this.val    = val
    this.reason = reason
  }

  ** 区间结束时刻（与 L1 样本的时间戳对齐）。
  const DateTime ts
  ** 区间增量；不可信时为 null。
  const Number? val
  ** 见上面的 reason 常量。
  const Str reason

  ** 是否可信（可进台账）。
  Bool isValid() { val != null }

  Dict toRow() {
    Etc.makeDict([
      "ts":       ts,
      "val":      val,
      "emReason": reason,
    ])
  }

  override Str toStr() { "EmDeltaItem($ts, $val, $reason)" }
}
