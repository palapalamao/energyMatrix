using haystack

**
** L1 累积读数 → L2 区间增量的差分算法（说明书 §3.6）。
**
** 纯函数，不碰 Folio —— 国内表计"换表 + 累积量溢出"是常态，这段逻辑必须能
** 被单测钉死（见 `fan/test/EmMeterReadingTest.fan`），不能在历史汇总时现场处理。
**
** 三种补偿：
**   1. **溢出补偿**：读数翻转（cur < prev）时按 `emMaxReading` 还原
**      `delta = maxReading - prev + cur`。没有 `emMaxReading` 就不猜，直接判负增量。
**   2. **换表补偿**：区间跨过 `emInstallDate` 时，新表从自己的起始底数开始计数，
**      与旧表底数不可比 —— 增量取新表读数本身。
**   3. **断点识别**：相邻样本间隔超过 `maxGap` 时该区间判为不可信（val=null），
**      交由上层按 `emQuality` 处理或走估算/人工补录。
**
const class EmMeterReadingCalc
{
  ** 默认采样周期（说明书 §3.6：L1/L2 默认 15 分钟）。
  static const Duration defaultInterval := 15min

  ** 断点判定倍数：间隔 > interval * gapFactor 即视为采集断点。
  static const Int gapFactor := 3

  **
  ** 把一串按时间升序的累积读数差分成区间增量。
  **
  ** raw          L1 累积读数样本（必须已按 ts 升序；本方法不再排序）
  ** maxReading   `emMaxReading` 翻转上限，null 表示不做溢出补偿
  ** installDate  `emInstallDate` 换表 / 安装日期，null 表示不做换表补偿
  ** interval     采样周期，用于断点判定
  **
  ** 返回的列表比输入少一个元素（首个样本只能作为基准，无法构成区间）。
  **
  static EmDeltaItem[] deltas(HisItem[] raw, Number? maxReading := null,
                              Date? installDate := null,
                              Duration interval := defaultInterval)
  {
    out := EmDeltaItem[,]
    if (raw.size < 2) return out

    gapLimit := Duration(interval.ticks * gapFactor)

    for (i := 1; i < raw.size; ++i) {
      prev := raw[i - 1]
      cur  := raw[i]
      out.add(delta(prev, cur, maxReading, installDate, gapLimit))
    }
    return out
  }

  **
  ** 单个区间的差分。抽成独立方法便于逐场景单测。
  **
  static EmDeltaItem delta(HisItem prev, HisItem cur, Number? maxReading,
                           Date? installDate, Duration gapLimit)
  {
    pv := prev.val as Number
    cv := cur.val  as Number

    // 非数值样本（na / null）→ 不可信
    if (pv == null || cv == null) {
      return EmDeltaItem(cur.ts, null, EmDeltaItem.reasonGap)
    }

    unit := cv.unit ?: pv.unit

    // ---- 换表补偿：区间跨过安装日期 ----
    // 判据是"上一样本在换表之前、本样本在换表当天或之后"。新表从自己的起始
    // 底数计数，与旧表底数不可比，因此增量只能取新表读数本身。
    if (installDate != null) {
      prevDate := prev.ts.date
      curDate  := cur.ts.date
      if (prevDate < installDate && curDate >= installDate) {
        return EmDeltaItem(cur.ts, Number(cv.toFloat, unit), EmDeltaItem.reasonMeterChange)
      }
    }

    // ---- 采集断点 ----
    if (cur.ts - prev.ts > gapLimit) {
      return EmDeltaItem(cur.ts, null, EmDeltaItem.reasonGap)
    }

    diff := cv.toFloat - pv.toFloat

    // ---- 正常 ----
    if (diff >= 0f) {
      return EmDeltaItem(cur.ts, Number(diff, unit), EmDeltaItem.reasonNormal)
    }

    // ---- 溢出补偿 ----
    // 只有配置了 emMaxReading 才补偿，且补偿后必须落在 (0, maxReading) 内 ——
    // 否则更可能是换表 / 人工清零 / 采集错乱，不该被伪装成一次正常用量。
    if (maxReading != null) {
      max := maxReading.toFloat
      if (max > 0f && pv.toFloat <= max) {
        wrapped := max - pv.toFloat + cv.toFloat
        if (wrapped > 0f && wrapped < max) {
          return EmDeltaItem(cur.ts, Number(wrapped, unit), EmDeltaItem.reasonOverflow)
        }
      }
    }

    return EmDeltaItem(cur.ts, null, EmDeltaItem.reasonNegative)
  }

  **
  ** 增量求和。忽略不可信区间（val=null）—— 它们只影响 `quality`，不影响总量。
  ** 全部不可信时返回 null，而不是 0。
  **
  static Number? sum(EmDeltaItem[] items, Unit? unit := null) {
    total := 0f
    any   := false
    u     := unit
    items.each |EmDeltaItem di| {
      v := di.val
      if (v == null) return
      any = true
      if (u == null) u = v.unit
      total = total + v.toFloat
    }
    return any ? Number(total, u) : null
  }

  **
  ** 数据完好率：有效区间数 / 总区间数，落在 [0,1]。
  ** 说明书 §4.2 的 `emQuality`，是台账条目可用于结算与披露的判据之一。
  **
  static Number quality(EmDeltaItem[] items) {
    if (items.isEmpty) return Number(0f)
    ok := 0
    items.each |EmDeltaItem di| { if (di.isValid) ok++ }
    return Number(ok.toFloat / items.size.toFloat)
  }

  ** 按 reason 分组计数，用于 dataQuality 类诊断。
  static Str:Int reasonCounts(EmDeltaItem[] items) {
    m := Str:Int[:]
    items.each |EmDeltaItem di| { m[di.reason] = (m[di.reason] ?: 0) + 1 }
    return m
  }
}
