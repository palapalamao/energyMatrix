using haystack
using skyarc
using skyarcd

**
** 台账查询与多维聚合 —— Layer 2 全部业务对象的**唯一**取数入口。
**
** 铁律 6：业务对象只读 `EmLedgerEntry`，禁止直接读取点位历史。
** `fan/tariff|kpi|carbon|baseline|diagnostic` 里的任何取数都必须经过这里；
** `fan/test/EmLayerIsolationTest.fan` 会扫描源码把这条钉死。
**
** 支持的维度（说明书 §4.5 `EmKpi.emDimension`）：
**   subItem | medium | space | tenant | org | meter | period
**
class EmLedgerQuery
{
  new make(Context cx) { this.cx = cx }

  Context cx

  ** 合法聚合维度 → 台账条目上对应的标签名。
  static const Str:Str dimTags := [
    "subItem": "emSubItem",
    "medium":  "emMedium",
    "space":   "emSpaceRef",
    "tenant":  "emTenantRef",
    "org":     "emOrgRef",
    "meter":   "emMeterRef",
    "period":  "emPeriod",
  ]

  **
  ** 账期内的原始条目。
  **
  ** 默认排除红冲对（`emReversalOf` 与被红冲的原条目）—— 直接求和会双算。
  ** includeReversals=true 时返回全部，用于审计视图。
  **
  Dict[] entries(Ref subjectRef, Span span, Str? medium := null, Bool includeReversals := false) {
    filter := StrBuf()
    filter.add("emLedger and (").add(subjectFilter(subjectRef)).add(")")
    if (medium != null) filter.add(" and emMedium==").add(medium.toCode)
    all := cx.proj.readAllList(filter.toStr)

    inSpan := Dict[,]
    all.each |Dict d| {
      s := d["span"] as Span
      if (s == null) return
      if (s.start >= span.start && s.start < span.end) inSpan.add(d)
    }
    if (includeReversals) return inSpan
    return netEntries(inSpan)
  }

  **
  ** 「属于这个对象」在台账上怎么写成 filter。
  **
  ** 台账条目从表计上抄了五个维度标签（siteRef / emSpaceRef / emTenantRef /
  ** emOrgRef / emMeterRef），所以按对象取数就是选对其中一个：
  **
  **   站点      siteRef==      （整站，最常用）
  **   楼层/区域  emSpaceRef==   （楼层还要并上它底下的区域，见下）
  **   租户      emTenantRef==
  **   表计      emMeterRef==
  **
  ** **楼层要展开**：表计的 `emSpaceRef` 通常指到最细的那层空间（区域），
  ** 直接用 `emSpaceRef==@floor` 只能捞到那些直接挂楼层的表，楼层合计会偏小。
  ** 这里把楼层底下的空间一并并进来 —— 楼层能耗少算是个只在对账时才会
  ** 暴露的错，比报错难查得多。
  **
  ** 对象类型认不出来时按站点处理（与本方法的历史行为一致）。
  **
  Str subjectFilter(Ref subjectRef) {
    code := subjectRef.toCode
    rec := cx.proj.readById(subjectRef, false)
    if (rec == null) return "siteRef==" + code

    kind := EmNodeKind.of(rec)
    if (kind == EmNodeKind.meter)  return "emMeterRef==" + code
    if (kind == EmNodeKind.tenant) return "emTenantRef==" + code
    if (kind == EmNodeKind.zone)   return "emSpaceRef==" + code
    if (kind == EmNodeKind.floor) {
      buf := StrBuf().add("emSpaceRef==").add(code)
      descendantSpaces(subjectRef).each |Ref r| {
        buf.add(" or emSpaceRef==").add(r.toCode)
      }
      return buf.toStr
    }
    return "siteRef==" + code
  }

  **
  ** 某个空间底下的全部后代空间（不含自己）。
  ** 只走一次全量读 + 内存展开，避免按层递归查库。
  **
  Ref[] descendantSpaces(Ref spaceRef) {
    all := cx.proj.readAllList("energyMatrix and (space or floor)")
    children := Ref:Ref[][:]
    all.each |Dict r| {
      k := EmNodeKind.of(r)
      if (k == null) return
      p := EmNodeKind.parentOf(r, k)
      if (p == null) return
      list := children[p]
      if (list == null) { list = Ref[,]; children[p] = list }
      list.add(r.id)
    }

    out := Ref[,]
    seen := Ref:Bool[:]
    queue := Ref[spaceRef]
    seen[spaceRef] = true
    while (!queue.isEmpty) {
      cur := queue.removeAt(0)
      (children[cur] ?: Ref[,]).each |Ref c| {
        if (seen.containsKey(c)) return    // 配错成环时不至于转不出来
        seen[c] = true
        out.add(c)
        queue.add(c)
      }
    }
    return out
  }

  **
  ** 剔除红冲对：一条红冲条目与它指向的原条目相互抵消，两者都不参与求和。
  ** 保留重录条目（`emCorrects`）—— 它才是修正后的真实用量。
  **
  static Dict[] netEntries(Dict[] all) {
    reversed := Ref:Bool[:]
    all.each |Dict d| {
      r := d["emReversalOf"] as Ref
      if (r != null) reversed[r] = true
    }
    out := Dict[,]
    all.each |Dict d| {
      if (d["emReversalOf"] != null) return   // 红冲条目本身
      if (reversed.containsKey(d.id)) return  // 被红冲的原条目
      out.add(d)
    }
    return out
  }

  **
  ** 按维度聚合。返回 Grid，列：<dim>, val, emEntryCount, emQualityMin, emSources。
  **
  ** `emQualityMin` 取组内最小完好率 —— 一组数据的可信度由最差的那条决定，
  ** 平均值会把一条 30% 完好率的条目藏在一堆 100% 里面。
  ** `emSources` 是组内出现过的来源等级（逗号分隔），用于 UI 的「数据可信度」卡。
  **
  Grid aggregate(Ref siteRef, Span span, Str dim, Str? medium := null) {
    tag := dimTags[dim]
    if (tag == null) {
      throw ArgErr("未知维度：$dim（合法值 " + dimTags.keys.sort.join("|") + "）")
    }

    groups := Str:Dict[][:]
    groups.ordered = true
    keyVals := Str:Obj?[:]

    entries(siteRef, span, medium).each |Dict d| {
      v := d[tag]
      k := v == null ? "<none>" : v.toStr
      keyVals[k] = v
      list := groups[k]
      if (list == null) { list = Dict[,]; groups[k] = list }
      list.add(d)
    }

    rows := Dict[,]
    groups.keys.sort.each |Str k| {
      list := groups[k]
      total := 0f
      unit := (Unit?)null
      qMin := (Float?)null
      sources := Str:Bool[:]
      list.each |Dict d| {
        n := d["val"] as Number
        if (n != null) {
          if (unit == null) unit = n.unit
          total = total + n.toFloat
        }
        q := d["emQuality"] as Number
        if (q != null && (qMin == null || q.toFloat < qMin)) qMin = q.toFloat
        s := d["emDataSource"] as Str
        if (s != null) sources[s] = true
      }
      rows.add(Etc.makeDict([
        dim:             keyVals[k],
        "val":           Number(total, unit),
        "emEntryCount":  Number(list.size),
        "emQualityMin":  qMin == null ? null : Number(qMin),
        "emSources":     sources.keys.sort.join(","),
      ]))
    }
    return Etc.makeDictsGrid(null, rows)
  }

  **
  ** 只能当**列维度**用的那几个 —— 它们的取值是枚举字符串。
  **
  ** `space` / `tenant` / `org` / `meter` 的取值是 Ref，摊成列名会得到
  ** `@p:proj:r:2f8c…` 这种非法 Haystack 标签名。Axon 把 Dict 转 Grid 时会在
  ** **响应序列化过程中**抛 `Invalid col name`，客户端收到的是被截断的 Zinc、
  ** 报的却是 `Could not find a value` —— 与真实原因毫不相干的错（README 踩坑 41）。
  ** 所以这里提前拦住，报一个说得清的错。
  **
  static const Str[] enumDims := ["subItem", "medium"]

  ** Legal Grid column name used when an enum dimension is genuinely missing.
  static Str enumColName(Obj? val) {
    s := val as Str
    if (s == null || s.trim.isEmpty) return "none"
    return s
  }

  **
  ** 二维交叉表。行是一个维度，列是另一个维度的各个取值。
  **
  ** 总览屏的「30 日分项堆叠趋势」就是 `crosstab(site, span, "period", "subItem", "elec")`：
  ** 一次取完 30 天 × 12 个分项，而不是发 12 次 `aggregate` 再在前端对齐账期
  ** —— 那样每列的账期集合可能不一样（某个分项某天没数据），对齐逻辑要写在
  ** 前端且很容易错位。
  **
  ** 返回 Grid：
  **   `<rowDim>`     行键（period 时是 `D-yyyyMMdd` 这样的账期码）
  **   `<各列取值>`    该格的用量（缺格为 null，**不补 0** —— 没记账和记了 0 是两回事）
  **   `val`          行合计
  **   `emEntryCount` 行条目数
  ** Grid meta 带 `emCols`（逗号分隔的列名，按合计降序），前端照它的顺序画堆叠。
  **
  Grid crosstab(Ref subjectRef, Span span, Str rowDim, Str colDim, Str? medium := null) {
    rowTag := dimTags[rowDim]
    if (rowTag == null) {
      throw ArgErr("未知行维度：$rowDim（合法值 " + dimTags.keys.sort.join("|") + "）")
    }
    if (!enumDims.contains(colDim)) {
      throw ArgErr("列维度只能是 " + enumDims.join(" 或 ") + "，不能是 $colDim —— " +
        "其余维度的取值是 Ref，摊成列名会得到非法的 Haystack 标签名")
    }
    colTag := dimTags[colDim]

    // rowKey → (colKey → 累计值)
    cells := Str:Str:Float[:]
    cells.ordered = true
    rowVals := Str:Obj?[:]
    rowCounts := Str:Int[:]
    colTotals := Str:Float[:]
    unit := (Unit?)null

    entries(subjectRef, span, medium).each |Dict d| {
      n := d["val"] as Number
      if (n == null) return
      if (unit == null) unit = n.unit

      rv := d[rowTag]
      rk := rv == null ? "<none>" : rv.toStr
      rowVals[rk] = rv
      rowCounts[rk] = (rowCounts[rk] ?: 0) + 1

      ck := enumColName(d[colTag])
      row := cells[rk]
      if (row == null) { row = Str:Float[:]; cells[rk] = row }
      row[ck] = (row[ck] ?: 0f) + n.toFloat
      colTotals[ck] = (colTotals[ck] ?: 0f) + n.toFloat
    }

    // 列按合计降序 —— 堆叠图里占比大的放底下才稳定，不会因为某天缺格上下跳
    cols := colTotals.keys.sort |Str a, Str b -> Int| { colTotals[b] <=> colTotals[a] }

    rows := Dict[,]
    cells.keys.sort.each |Str rk| {
      tags := Str:Obj?[:]
      tags.ordered = true
      tags[rowDim] = rowVals[rk]
      rowTotal := 0f
      cols.each |Str ck| {
        v := cells[rk][ck]
        if (v == null) return              // 缺格留空，不补 0
        tags[ck] = Number(v, unit)
        rowTotal = rowTotal + v
      }
      tags["val"] = Number(rowTotal, unit)
      tags["emEntryCount"] = Number(rowCounts[rk] ?: 0)
      rows.add(Etc.makeDict(tags))
    }

    return Etc.makeDictsGrid(Etc.makeDict([
      "emRowDim": rowDim,
      "emColDim": colDim,
      "emCols":   cols.join(","),
      "emMedium": medium,
    ]), rows)
  }

  **
  ** 账期内的用量合计。这是 Layer 2 各域最常用的一个数 ——
  ** 账单、KPI、碳账都从这里取，而不是自己去读表读点。
  **
  Number? total(Ref siteRef, Span span, Str? medium := null) {
    total := 0f
    unit := (Unit?)null
    any := false
    entries(siteRef, span, medium).each |Dict d| {
      n := d["val"] as Number
      if (n == null) return
      any = true
      if (unit == null) unit = n.unit
      total = total + n.toFloat
    }
    return any ? Number(total, unit) : null
  }

  **
  ** 数据来源分布（UI「数据可信度」卡）。列：emDataSource, val, ratio, emEntryCount。
  ** ratio 是该来源用量占总量的比例。
  **
  Grid sourceMix(Ref siteRef, Span span, Str? medium := null) {
    bySource := Str:Float[:]
    counts := Str:Int[:]
    grand := 0f
    unit := (Unit?)null
    entries(siteRef, span, medium).each |Dict d| {
      s := (d["emDataSource"] as Str) ?: "<none>"
      n := d["val"] as Number
      counts[s] = (counts[s] ?: 0) + 1
      if (n == null) return
      if (unit == null) unit = n.unit
      bySource[s] = (bySource[s] ?: 0f) + n.toFloat
      grand = grand + n.toFloat
    }

    rows := Dict[,]
    EmDataSource.all.each |Str s| {
      v := bySource[s]
      if (v == null && counts[s] == null) return
      rows.add(Etc.makeDict([
        "emDataSource": s,
        "val":          Number(v ?: 0f, unit),
        "ratio":        Number(grand == 0f ? 0f : (v ?: 0f) / grand),
        "emEntryCount": Number(counts[s] ?: 0),
      ]))
    }
    return Etc.makeDictsGrid(null, rows)
  }
}
