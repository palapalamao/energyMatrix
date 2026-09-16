using haystack
using skyarc
using skyarcd

**
** 表具与采集器台账 —— 「表具与采集器管理」屏的后端。
**
** 回答的是运维的问题：**哪些表在正常上传数据，哪些没在**。这与建模器
** （对象配得对不对）和计量树（汇总关系对不对）是三件事。
**
** 通信状态取自 L1 累积读数点的 `curStatus` —— 那是连接器写的标准标签，
** 本库不自己判断"多久没数据算离线"：不同连接器的采集周期差几个数量级，
** 自己定阈值只会得出错误结论。
**
** 数据完好率取自**台账条目**的 `emQuality`，不现场读历史：一个站点几百块表，
** 每块表都去差分一遍历史，这个页面就打不开了。台账里的完好率是同一个数，
** 而且它就是记账时实际用的那个。
**
class EmMeterInventory
{
  new make(Context cx) { this.cx = cx }

  Context cx

  ** 通信状态。前四个直接取自点位的 `curStatus`（Haystack 标准值）。
  static const Str statusOk       := "ok"        // 正常
  static const Str statusStale    := "stale"     // 数据不新鲜
  static const Str statusFault    := "fault"     // 配置或硬件故障
  static const Str statusDown     := "down"      // 通信中断
  static const Str statusDisabled := "disabled"  // 人工停用
  ** 以下三个是本库补充的：点位层面根本没配好，谈不上通信。
  static const Str statusNoPoint  := "noPoint"   // 没有累积读数点
  static const Str statusUnbound  := "unbound"   // 有点位但没接采集通道
  static const Str statusVirtual  := "virtual"   // 虚表 / 缺口表，不涉及采集

  ** 判定为"离线"的状态 —— 需要运维介入的那几种。
  static const Str[] offlineStatuses := [statusFault, statusDown, statusNoPoint, statusUnbound]

  **
  ** 表具台账。每块表一行：
  **   id, dis, emMedium, emMeterRole, emVirtual, emGap,
  **   emParentDis     上级表显示名
  **   emMeterFactor, emInstallDate, emSubItem
  **   emPointCount    该表下的点位数
  **   emConnDis       采集器显示名（没接则 null）
  **   emCommStatus    见上面的状态常量
  **   emCurVal        L1 点当前读数（有就带上，便于现场核对表底）
  **   emQuality       最近一个账期的数据完好率（来自台账，没有台账则 null）
  **
  ** span 省略时不查台账，`emQuality` 全为 null —— 这条路径只读记录，很快。
  **
  Grid inventory(Ref siteRef, Span? span := null) {
    meters := EmMeterTree(cx).readMeters(siteRef)
    tree := EmMeterTree(cx).tree(siteRef)
    quality := span == null ? Ref:Number[:] : qualityByMeter(siteRef, span)

    rows := Dict[,]
    meters.each |Dict m| {
      rows.add(row(m, tree, quality))
    }
    rows.sort |Dict a, Dict b -> Int| {
      return EmModelTree.dis(a) <=> EmModelTree.dis(b)
    }
    return Etc.makeDictsGrid(null, rows)
  }

  private Dict row(Dict m, EmMeterTreeResult tree, Ref:Number quality) {
    isVirtual := m.has("emVirtual") || EmMeterRole.of(m) == EmMeterRole.virtualRole
    pts := cx.proj.readAllList("point and equipRef==" + m.id.toCode)
    l1 := EmModelValidator.l1Point(pts)

    node := tree.node(m.id)
    parent := node?.parent

    return Etc.makeDict([
      "id":            m.id,
      "dis":           EmModelTree.dis(m),
      "emMedium":      EmMedium.of(m),
      "emMeterRole":   EmMeterRole.of(m),
      "emVirtual":     isVirtual ? Marker.val : null,
      "emGap":         m["emGap"],
      "emParentDis":   parent == null ? null : parent.dis,
      "emMeterFactor": m["emMeterFactor"],
      "emInstallDate": m["emInstallDate"],
      "emSubItem":     m["emSubItem"],
      "emPointCount":  Number(pts.size),
      "emConnDis":     connDis(l1),
      "emCommStatus":  commStatus(isVirtual, l1),
      "emCurVal":      l1 == null ? null : l1["curVal"],
      "emQuality":     quality[m.id],
    ])
  }

  **
  ** 通信状态判定。
  **
  ** 虚表不涉及采集，直接返回 virtual —— 把它算进"离线"会让每个项目的
  ** 离线数天然大于 0，运维就不会再认真看这个数了。
  **
  static Str commStatus(Bool isVirtual, Dict? l1) {
    if (isVirtual) return statusVirtual
    if (l1 == null) return statusNoPoint
    cur := l1["curStatus"] as Str
    if (cur != null) return cur
    return connRefOf(l1) == null ? statusUnbound : statusStale
  }

  **
  ** 点位挂在哪个采集器上。
  **
  ** 各连接器写的标签名不同（`bacnetConnRef` / `modbusConnRef` / `opcConnRef` …），
  ** 所以按后缀找，而不是枚举一遍连接器类型 —— 新增一种连接器不用改这里。
  **
  static Ref? connRefOf(Dict point) {
    Ref? found := null
    point.each |Obj? v, Str n| {
      if (found != null) return
      if (!n.endsWith("ConnRef")) return
      r := v as Ref
      if (r != null) found = r
    }
    return found
  }

  private Str? connDis(Dict? l1) {
    if (l1 == null) return null
    r := connRefOf(l1)
    if (r == null) return null
    rec := cx.proj.readById(r, false)
    return rec == null ? r.dis : EmModelTree.dis(rec)
  }

  **
  ** 账期内每块表的数据完好率，取自台账条目（取最小值）。
  **
  ** 取最小而不是平均：一个月里有一天完好率 30%，平均下来看不出来，
  ** 但那一天的账是不可信的。
  **
  private Ref:Number qualityByMeter(Ref siteRef, Span span) {
    out := Ref:Number[:]
    EmLedgerQuery(cx).entries(siteRef, span).each |Dict e| {
      m := e["emMeterRef"] as Ref
      q := e["emQuality"] as Number
      if (m == null || q == null) return
      cur := out[m]
      if (cur == null || q.toFloat < cur.toFloat) out[m] = q
    }
    return out
  }

//////////////////////////////////////////////////////////////////////////
// 汇总
//////////////////////////////////////////////////////////////////////////

  **
  ** 台账统计。键：
  **   emTotal      在册表计（含虚表）
  **   emPhysical   实际安装的表（不含虚表）
  **   emOk         通信正常
  **   emOffline    需要处理的（故障 / 中断 / 没点位 / 没接采集）
  **   emVirtual    虚表 / 缺口表
  **   emConnCount  涉及的采集器数量
  **   emQualityAvg 平均数据完好率（无台账时为 null）
  **
  Dict stats(Ref siteRef, Span? span := null) {
    g := inventory(siteRef, span)

    total := 0; physical := 0; ok := 0; offline := 0; virt := 0
    conns := Str:Bool[:]
    qSum := 0f; qCount := 0

    g.each |Row r| {
      total++
      st := (r["emCommStatus"] as Str) ?: statusNoPoint
      if (st == statusVirtual) { virt++ }
      else {
        physical++
        if (st == statusOk) ok++
        if (offlineStatuses.contains(st)) offline++
      }
      c := r["emConnDis"] as Str
      if (c != null) conns[c] = true
      q := r["emQuality"] as Number
      if (q != null) { qSum = qSum + q.toFloat; qCount++ }
    }

    return Etc.makeDict([
      "emTotal":      Number(total),
      "emPhysical":   Number(physical),
      "emOk":         Number(ok),
      "emOffline":    Number(offline),
      "emVirtual":    Number(virt),
      "emConnCount":  Number(conns.size),
      "emQualityAvg": qCount == 0 ? null : Number(qSum / qCount.toFloat),
    ])
  }

  **
  ** 采集器清单。每个采集器一行：id, dis, emStatus, emMeterCount, emPointCount。
  **
  ** 采集器记录由各连接器扩展（hxConn 系列）维护，本库只读不写 —— 它们的
  ** 生命周期属于连接器，不属于能耗账。
  **
  Grid connectors(Ref siteRef) {
    // 先统计每个采集器带了多少块表 / 多少个点
    meterCount := Ref:Int[:]
    pointCount := Ref:Int[:]
    EmMeterTree(cx).readMeters(siteRef).each |Dict m| {
      pts := cx.proj.readAllList("point and equipRef==" + m.id.toCode)
      seen := Ref:Bool[:]
      pts.each |Dict p| {
        c := connRefOf(p)
        if (c == null) return
        pointCount[c] = (pointCount[c] ?: 0) + 1
        if (!seen.containsKey(c)) {
          seen[c] = true
          meterCount[c] = (meterCount[c] ?: 0) + 1
        }
      }
    }

    rows := Dict[,]
    cx.proj.readAllList("conn").each |Dict c| {
      n := meterCount[c.id]
      // 只列出真正带着本站点表计的采集器 —— 同一个 FIN 项目里可能还有
      // 一堆与能耗无关的连接器，全列出来只会干扰判断
      if (n == null) return
      rows.add(Etc.makeDict([
        "id":           c.id,
        "dis":          EmModelTree.dis(c),
        "emStatus":     c["connStatus"],
        "emMeterCount": Number(n),
        "emPointCount": Number(pointCount[c.id] ?: 0),
      ]))
    }
    rows.sort |Dict a, Dict b -> Int| {
      return EmModelTree.dis(a) <=> EmModelTree.dis(b)
    }
    return Etc.makeDictsGrid(null, rows)
  }
}
