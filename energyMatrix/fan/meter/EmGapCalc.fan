using haystack
using skyarc
using skyarcd

**
** 缺口量与缺口率（说明书 §3.3.3）。
**
** 设计取舍（说明书原文）：总表减各分表之和的差值**必须显式建模为一个带
** `emGap` 标记的虚拟表**，而不是让它在报表里被平摊或悄悄消失。缺口率是判断
** 计量方案是否合格的第一指标，也是关账闸门的判据。
**
** 所以这里只算、只报，绝不"把余量摊进某个分项"。摊余量是分摊引擎在有
** 明确规则（`EmAllocRule`，method=byRemainder）时才能做的事，且结果条目
** 必须带 `emRuleRef` + `emDataSource:allocated`。
**
class EmGapCalc
{
  new make(Context cx) { this.cx = cx }

  Context cx

  private static const Str src := "EmGapCalc"

  **
  ** 单块表的缺口。返回 Dict：
  **   meterRef     Ref     被校核的表（通常是 gateway / main）
  **   emMedium     Str?
  **   parentVal    Number? 本表用量
  **   childSum     Number? 参与汇总的子表用量之和
  **   emGapVal     Number? 缺口量 = parentVal - childSum
  **   emGapRatio   Number? 缺口率 = emGapVal / parentVal（parentVal<=0 时为 null）
  **   emChildCount Number  参与汇总的子表数
  **
  ** 叶子表（无参与汇总的子表）返回 emGapVal=null —— 无子表就谈不上缺口，
  ** 不能当成 0% 合格。
  **
  Dict of(Ref meterRef, Span span) {
    tree := EmMeterTree(cx)
    cons := EmMeterConsumption(cx)
    res  := tree.tree(cons.siteOf(meterRef))
    node := res.node(meterRef)

    rec := cx.proj.readById(meterRef, true)
    medium := EmMedium.of(rec)

    kids := node == null ? EmMeterNode[,] : node.summableChildren
    if (kids.isEmpty) {
      return row(meterRef, medium, cons.value(meterRef, span), null, null, null, 0)
    }

    parentVal := cons.value(meterRef, span)
    childSum  := cons.subMeterSum(meterRef, span)

    if (parentVal == null || childSum == null) {
      return row(meterRef, medium, parentVal, childSum, null, null, kids.size)
    }

    gap := parentVal.toFloat - childSum.toFloat
    ratio := parentVal.toFloat > 0f ? gap / parentVal.toFloat : null

    return row(meterRef, medium, parentVal, childSum,
               Number(gap, parentVal.unit),
               ratio == null ? null : Number(ratio),
               kids.size)
  }

  **
  ** 站点级缺口校核：对每个介质的根表（gateway 优先，否则 main）算一次。
  ** 列同 `of`。这是关账闸门与 UI「平衡校核卡」的数据源。
  **
  Grid siteGaps(Ref siteRef, Span span) {
    res := EmMeterTree(cx).tree(siteRef)
    rows := Dict[,]
    checkRoots(res).each |EmMeterNode n| { rows.add(of(n.id, span)) }
    return Etc.makeDictsGrid(null, rows)
  }

  **
  ** 站点在账期内的总体缺口率 —— 关账闸门用的单一数字。
  **
  ** 口径：Σ|各根表缺口量| / Σ各根表用量（同介质内加总，跨介质按各自比率取最大）。
  ** 取**最大**而不是平均：任何一个介质不平衡都说明计量方案有问题，
  ** 平均会把一个严重不平衡的介质稀释掉。
  **
  Number? siteGapRatio(Ref siteRef, Span span) {
    worst := (Float?)null
    checkRoots(EmMeterTree(cx).tree(siteRef)).each |EmMeterNode n| {
      d := of(n.id, span)
      r := d["emGapRatio"] as Number
      if (r == null) return
      a := r.toFloat.abs
      if (worst == null || a > worst) worst = a
    }
    return worst == null ? null : Number(worst)
  }

  **
  ** 参与校核的根表：每个介质取 gateway；没有 gateway 时退到 main；
  ** 都没有就取该介质的树根。
  **
  static EmMeterNode[] checkRoots(EmMeterTreeResult res) {
    byMedium := Str:EmMeterNode[:]
    res.all.each |EmMeterNode n| {
      m := n.medium
      if (m == null) return
      if (n.summableChildren.isEmpty) return
      cur := byMedium[m]
      if (cur == null || rank(n) < rank(cur)) byMedium[m] = n
    }
    out := EmMeterNode[,]
    byMedium.keys.sort.each |Str m| { out.add(byMedium[m]) }
    return out
  }

  ** 角色优先级：gateway(0) < main(1) < 其他(2)。
  private static Int rank(EmMeterNode n) {
    if (n.role == EmMeterRole.gateway) return 0
    if (n.role == EmMeterRole.main)    return 1
    return 2
  }

  private static Dict row(Ref meterRef, Str? medium, Number? parentVal, Number? childSum,
                          Number? gapVal, Number? gapRatio, Int childCount) {
    Etc.makeDict([
      "meterRef":     meterRef,
      "emMedium":     medium,
      "parentVal":    parentVal,
      "childSum":     childSum,
      "emGapVal":     gapVal,
      "emGapRatio":   gapRatio,
      "emChildCount": Number(childCount),
    ])
  }
}
