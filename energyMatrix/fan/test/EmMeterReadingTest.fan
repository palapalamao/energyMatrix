using haystack

**
** L1 累积读数 → L2 区间增量的差分算法测试（说明书 §3.6）。
**
** 国内表计"换表 + 累积量溢出"是常态，这段逻辑必须被钉死：
** 一次误判就会让某个账期的用量凭空多出一个 emMaxReading。
**
** 运行：<fin>/bin/fant energyMatrix::EmMeterReadingTest
**
class EmMeterReadingTest : HaystackTest
{
  private static const TimeZone tz := TimeZone("Asia/Shanghai")
  private static const Unit kwh := Unit("kWh")

  ** 从 2026-07-01 00:00 起、按 step 递增的时间戳序列。
  private static HisItem[] series(Float[] vals, Duration step := 15min) {
    t0 := DateTime(2026, Month.jul, 1, 0, 0, 0, 0, tz)
    items := HisItem[,]
    for (i := 0; i < vals.size; ++i) {
      items.add(HisItem(t0 + Duration(step.ticks * i), Number(vals[i], kwh)))
    }
    return items
  }

//////////////////////////////////////////////////////////////////////////
// 正常差分
//////////////////////////////////////////////////////////////////////////

  Void test_deltas_normal() {
    raw := series([100f, 110f, 125f, 130f])
    d := EmMeterReadingCalc.deltas(raw)

    verifyEq(d.size, 3, "n 个样本产生 n-1 个区间")
    verifyEq(d[0].val.toFloat, 10f)
    verifyEq(d[1].val.toFloat, 15f)
    verifyEq(d[2].val.toFloat, 5f)
    d.each |EmDeltaItem di| { verifyEq(di.reason, EmDeltaItem.reasonNormal) }

    verifyEq(EmMeterReadingCalc.sum(d).toFloat, 30f)
    verifyEq(EmMeterReadingCalc.sum(d).unit, kwh, "单位必须保留")
    verifyEq(EmMeterReadingCalc.quality(d).toFloat, 1f)
  }

  Void test_deltas_singleSampleYieldsNothing() {
    verifyEq(EmMeterReadingCalc.deltas(series([100f])).size, 0)
    verifyEq(EmMeterReadingCalc.deltas(HisItem[,]).size, 0)
    // 全部不可信时 sum 返回 null，**不是 0** —— 0 会被当成"这段时间没用电"
    verifyNull(EmMeterReadingCalc.sum(EmDeltaItem[,]))
    verifyEq(EmMeterReadingCalc.quality(EmDeltaItem[,]).toFloat, 0f)
  }

//////////////////////////////////////////////////////////////////////////
// 溢出补偿
//////////////////////////////////////////////////////////////////////////

  Void test_deltas_overflowCompensated() {
    // 五位表，翻转上限 99999：99990 → 20 实际用了 30
    raw := series([99980f, 99990f, 20f, 35f])
    d := EmMeterReadingCalc.deltas(raw, Number(99999f, kwh))

    verifyEq(d.size, 3)
    verifyEq(d[0].reason, EmDeltaItem.reasonNormal)
    verifyEq(d[0].val.toFloat, 10f)

    verifyEq(d[1].reason, EmDeltaItem.reasonOverflow)
    verifyEq(d[1].val.toFloat, 99999f - 99990f + 20f)   // = 29

    verifyEq(d[2].reason, EmDeltaItem.reasonNormal)
    verifyEq(d[2].val.toFloat, 15f)
    verifyEq(EmMeterReadingCalc.quality(d).toFloat, 1f)
  }

  Void test_deltas_negativeWithoutMaxReadingIsNotGuessed() {
    // 没有配 emMaxReading 就不猜 —— 判为负增量，val=null，计入完好率分母
    raw := series([500f, 100f])
    d := EmMeterReadingCalc.deltas(raw)

    verifyEq(d.size, 1)
    verifyEq(d[0].reason, EmDeltaItem.reasonNegative)
    verifyNull(d[0].val)
    verifyFalse(d[0].isValid)
    verifyEq(EmMeterReadingCalc.quality(d).toFloat, 0f)
    verifyNull(EmMeterReadingCalc.sum(d))
  }

  Void test_deltas_implausibleOverflowRejected() {
    // 补偿后落在 (0, max) 之外 → 更可能是换表 / 人工清零，不该伪装成正常用量
    raw := series([10f, 5f])
    d := EmMeterReadingCalc.deltas(raw, Number(100f, kwh))
    // 10 → 5 补偿后 = 100 - 10 + 5 = 95，落在区间内，会被当成溢出
    verifyEq(d[0].reason, EmDeltaItem.reasonOverflow)

    // 但如果 prev 已经超过 max，补偿没有物理意义
    raw2 := series([150f, 5f])
    d2 := EmMeterReadingCalc.deltas(raw2, Number(100f, kwh))
    verifyEq(d2[0].reason, EmDeltaItem.reasonNegative)
    verifyNull(d2[0].val)
  }

//////////////////////////////////////////////////////////////////////////
// 换表补偿
//////////////////////////////////////////////////////////////////////////

  Void test_deltas_meterChange() {
    // 7/1 00:00、00:15、00:30 三个样本；换表日期是 7/1 → 第一个区间就跨换表
    // 新表从自己的起始底数开始计数，与旧表底数不可比 → 增量取新表读数本身
    t0 := DateTime(2026, Month.jun, 30, 23, 45, 0, 0, tz)
    raw := [
      HisItem(t0,          Number(88000f, kwh)),   // 旧表底数
      HisItem(t0 + 15min,  Number(12f,    kwh)),   // 换表后新表读数
      HisItem(t0 + 30min,  Number(20f,    kwh)),
    ]
    d := EmMeterReadingCalc.deltas(raw, null, Date(2026, Month.jul, 1))

    verifyEq(d.size, 2)
    verifyEq(d[0].reason, EmDeltaItem.reasonMeterChange)
    verifyEq(d[0].val.toFloat, 12f, "换表区间取新表读数，不是 12 - 88000")
    verifyEq(d[1].reason, EmDeltaItem.reasonNormal)
    verifyEq(d[1].val.toFloat, 8f)
    // 换表补偿属于"由其他实测量运算得出" → derived，不再是纯 measured
    verifyEq(EmMeterReadingCalc.reasonCounts(d)[EmDeltaItem.reasonMeterChange], 1)
  }

  Void test_deltas_meterChangeOnlyAffectsCrossingInterval() {
    // 换表日期在整个序列之前 → 不应触发换表补偿
    raw := series([100f, 110f])
    d := EmMeterReadingCalc.deltas(raw, null, Date(2026, Month.jun, 1))
    verifyEq(d[0].reason, EmDeltaItem.reasonNormal)
  }

//////////////////////////////////////////////////////////////////////////
// 采集断点与数据完好率
//////////////////////////////////////////////////////////////////////////

  Void test_deltas_gapDetected() {
    t0 := DateTime(2026, Month.jul, 1, 0, 0, 0, 0, tz)
    raw := [
      HisItem(t0,          Number(100f, kwh)),
      HisItem(t0 + 15min,  Number(110f, kwh)),
      HisItem(t0 + 4hr,    Number(200f, kwh)),   // 间隔 3h45m >> 15min × 3
      HisItem(t0 + 4hr + 15min, Number(210f, kwh)),
    ]
    d := EmMeterReadingCalc.deltas(raw)

    verifyEq(d.size, 3)
    verifyEq(d[0].reason, EmDeltaItem.reasonNormal)
    verifyEq(d[1].reason, EmDeltaItem.reasonGap, "超过 interval×3 应判为采集断点")
    verifyNull(d[1].val)
    verifyEq(d[2].reason, EmDeltaItem.reasonNormal)

    // 断点区间只影响完好率，不影响总量
    verifyEq(EmMeterReadingCalc.sum(d).toFloat, 20f)
    verifyNumApprox(EmMeterReadingCalc.quality(d), 2f / 3f, 0.0001f)
  }

  Void test_deltas_naValueTreatedAsGap() {
    t0 := DateTime(2026, Month.jul, 1, 0, 0, 0, 0, tz)
    raw := [
      HisItem(t0,         Number(100f, kwh)),
      HisItem(t0 + 15min, null),
      HisItem(t0 + 30min, Number(130f, kwh)),
    ]
    d := EmMeterReadingCalc.deltas(raw)
    verifyEq(d[0].reason, EmDeltaItem.reasonGap)
    verifyEq(d[1].reason, EmDeltaItem.reasonGap)
    verifyNull(EmMeterReadingCalc.sum(d))
  }

  Void test_reasonCounts() {
    raw := series([100f, 110f, 50f])   // 第二个区间负增量
    d := EmMeterReadingCalc.deltas(raw)
    counts := EmMeterReadingCalc.reasonCounts(d)
    verifyEq(counts[EmDeltaItem.reasonNormal], 1)
    verifyEq(counts[EmDeltaItem.reasonNegative], 1)
  }
}
