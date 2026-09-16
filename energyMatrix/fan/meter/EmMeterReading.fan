using folio
using haystack
using skyarc
using skyarcd

**
** 表计读数的 Folio 门面：定位 L1 累积读数点 → 读历史 → 交给
** `EmMeterReadingCalc` 差分 → 输出 L2 增量与区间用量。
**
** 这是本 pod 里**唯一**读点位历史的地方（连同虚拟表求值）。说明书铁律 6
** 规定 Layer 2 的业务对象只读台账、禁止直读点位 —— `fan/test/EmLayerIsolationTest.fan`
** 会扫描源码把这条钉死。
**
** Context 非 const（请求作用域），所以服务类是非 const class 持有 cx。
**
class EmMeterReading
{
  new make(Context cx) { this.cx = cx }

  Context cx

  private static const Str src := "EmMeterReading"

//////////////////////////////////////////////////////////////////////////
// 点位定位
//////////////////////////////////////////////////////////////////////////

  **
  ** 定位该表的 L1 累积读数点（`total and sensor`）。
  **
  ** 一块表可能挂多个累积点（尖峰平谷分时电量也是 total），所以按下面的
  ** 优先级消歧，而不是硬编码 navName —— 改名即失联是最常见的失效方式。
  **   1. 显式 `emL1Point` 标记（模板生成的点位带这个标记）
  **   2. 不带 `emTouPeriod` 的那个（分时电量不是总累积量）
  **   3. 按介质匹配的量纲标记（elec→energy, water/gas→volume, steam→mass）
  **   4. 仍有多个则按 dis 排序取第一个并 warn（保证结果确定，不随查询顺序漂移）
  **
  Dict? totalPoint(Ref meterRef, Bool checked := true) {
    cands := cx.proj.readAllList(
      "point and total and sensor and equipRef==" + meterRef.toCode)
    if (cands.isEmpty) {
      if (checked) throw UnknownRecErr("表 " + meterRef.toCode + " 下没有 L1 累积读数点(total and sensor)")
      return null
    }
    if (cands.size == 1) return cands.first

    explicit := Dict[,]
    cands.each |Dict d| { if (d.has("emL1Point")) explicit.add(d) }
    if (explicit.size == 1) return explicit.first
    pool := explicit.isEmpty ? cands : explicit

    nonTou := Dict[,]
    pool.each |Dict d| { if (d.missing("emTouPeriod")) nonTou.add(d) }
    if (nonTou.size == 1) return nonTou.first
    if (!nonTou.isEmpty) pool = nonTou

    meter := cx.proj.readById(meterRef, false)
    medium := meter == null ? null : EmMedium.of(meter)
    quantity := quantityTag(medium)
    if (quantity != null) {
      byQty := Dict[,]
      pool.each |Dict d| { if (d.has(quantity)) byQty.add(d) }
      if (byQty.size == 1) return byQty.first
      if (!byQty.isEmpty) pool = byQty
    }

    pool = pool.dup.sort |Dict a, Dict b -> Int| {
      return dis(a) <=> dis(b)
    }
    EnergyMatrixExt.logWarn(src,
      "表 " + meterRef.toCode + " 下有 " + pool.size + " 个候选 L1 点，取 " + dis(pool.first) +
      "；建议给权威点打 emL1Point 标记")
    return pool.first
  }

  ** 显示名。注意：Fantom 解析不了「链式 elvis + as 转换」
  ** （`(a as Str) ?: (b as Str) ?: c` 报 "Expected expression statement"），
  ** 所以这里写成显式的 null 检查而不是一行链式表达式。
  private static Str dis(Dict d) {
    Str? s := d["dis"] as Str
    if (s == null) s = d["navName"] as Str
    return s ?: d.id.toStr
  }

  ** 各介质累积量的 Haystack 量纲标记。
  private static Str? quantityTag(Str? medium) {
    if (medium == null) return null
    if (medium == EmMedium.elec)  return "energy"
    if (medium == EmMedium.heat)  return "energy"
    if (medium == EmMedium.cool)  return "energy"
    if (medium == EmMedium.water) return "volume"
    if (medium == EmMedium.gas)   return "volume"
    return null
  }

//////////////////////////////////////////////////////////////////////////
// 历史读取与差分
//////////////////////////////////////////////////////////////////////////

  **
  ** 读 L1 原始累积读数样本（按 ts 升序）。
  ** Fantom 侧 `folio.his.read` 没有 Axon `hisRead` 的默认行数上限，
  ** 跨年查询不会被静默截断。
  **
  HisItem[] rawSamples(Ref pointRef, Span span) {
    items := HisItem[,]
    cx.folio.his.read(pointRef, span, null) |HisItem item| {
      if (item.ts >= span.start && item.ts <= span.end) items.add(item)
    }
    items.sort |HisItem a, HisItem b -> Int| { return a.ts <=> b.ts }
    return items
  }

  ** 某表在账期内的 L2 区间增量。
  EmDeltaItem[] deltas(Ref meterRef, Span span) {
    meter := cx.proj.readById(meterRef, true)
    pt := totalPoint(meterRef, false)
    if (pt == null) return EmDeltaItem[,]
    raw := rawSamples(pt.id, span)
    return EmMeterReadingCalc.deltas(
      raw,
      meter["emMaxReading"]  as Number,
      meter["emInstallDate"] as Date,
      interval(pt))
  }

  ** 点位采样周期：优先 `hisCollectInterval`，缺省 15min。
  private static Duration interval(Dict pt) {
    n := pt["hisCollectInterval"] as Number
    if (n == null) return EmMeterReadingCalc.defaultInterval
    d := n.toDuration(false)
    return d ?: EmMeterReadingCalc.defaultInterval
  }

//////////////////////////////////////////////////////////////////////////
// 区间用量
//////////////////////////////////////////////////////////////////////////

  **
  ** 某表在账期内的用量与数据质量。返回 Dict，键：
  **   val          Number?  用量（全区间不可信时为 null，**不是 0**）
  **   emQuality    Number   数据完好率 0~1
  **   emDataSource Str      measured（全部正常差分）| derived（含溢出/换表补偿）
  **   emMedium     Str?
  **   emReasons    Dict     各 reason 的计数，供 dataQuality 诊断
  **
  ** 虚拟表走 `EmVirtualMeterEval`，不在这里 —— 虚表没有 L1 点位。
  **
  Dict consumption(Ref meterRef, Span span) {
    meter := cx.proj.readById(meterRef, true)
    medium := EmMedium.of(meter)

    items := deltas(meterRef, span)
    val := EmMeterReadingCalc.sum(items)
    q   := EmMeterReadingCalc.quality(items)
    counts := EmMeterReadingCalc.reasonCounts(items)

    compensated := (counts[EmDeltaItem.reasonOverflow] ?: 0) +
                   (counts[EmDeltaItem.reasonMeterChange] ?: 0)
    source := compensated > 0 ? EmDataSource.derived : EmDataSource.measured

    reasons := Str:Obj?[:]
    counts.each |Int c, Str k| { reasons[k] = Number(c) }

    return Etc.makeDict([
      "meterRef":     meterRef,
      "val":          val,
      "emQuality":    q,
      "emDataSource": source,
      "emMedium":     medium,
      "emReasons":    Etc.makeDict(reasons),
    ])
  }

  ** L2 增量的 Grid 形式。列：ts, val, emReason。
  Grid deltaGrid(Ref meterRef, Span span) {
    rows := Dict[,]
    deltas(meterRef, span).each |EmDeltaItem di| { rows.add(di.toRow) }
    return Etc.makeDictsGrid(null, rows)
  }
}
