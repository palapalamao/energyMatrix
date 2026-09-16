using haystack
using skyarc
using skyarcd

**
** 表计用量的统一入口 —— 铁律 3「物理表与虚拟表同构」的落点。
**
** 上层（台账构建、缺口计算、分摊引擎）只调这里，永远不需要知道一块表是
** 物理直采还是公式导出。物理表走 `EmMeterReading`，虚拟表走
** `EmVirtualMeterEval`，两者返回同构的 Dict。
**
class EmMeterConsumption
{
  new make(Context cx) { this.cx = cx }

  Context cx

  **
  ** 某表在账期内的用量。返回 Dict，键与 `EmMeterReading.consumption` 一致：
  ** meterRef / val / emQuality / emDataSource / emMedium / emReasons。
  **
  ** 铁律 1：**能耗数值只能来自表**。这个方法只接受 meterRef —— 传进来的记录
  ** 若不是 `meter`，直接报错，不做"从点位凑一个用量"的兜底。
  **
  Dict of(Ref meterRef, Span span) {
    rec := cx.proj.readById(meterRef, true)
    if (rec.missing("meter")) {
      throw ArgErr("禁止裸点入账：" + meterRef.toCode + " 不是 meter（铁律 1）")
    }
    if (isVirtual(rec)) return EmVirtualMeterEval(cx).consumption(meterRef, span)
    return EmMeterReading(cx).consumption(meterRef, span)
  }

  ** 只取用量数值；算不出时返回 null（**不是 0**）。
  Number? value(Ref meterRef, Span span) { of(meterRef, span)["val"] as Number }

  **
  ** 某表直接子表的用量之和。`check` 表不计入（`EmMeterRole.countsTowardSum`），
  ** 计入就是重复计量。全部子表都算不出时返回 null。
  **
  Number? subMeterSum(Ref meterRef, Span span) {
    res := EmMeterTree(cx).tree(siteOf(meterRef))
    node := res.node(meterRef)
    if (node == null) return null
    total := 0f
    unit  := (Unit?)null
    any   := false
    node.summableChildren.each |EmMeterNode c| {
      v := value(c.id, span)
      if (v == null) return
      any = true
      if (unit == null) unit = v.unit
      total = total + v.toFloat
    }
    return any ? Number(total, unit) : null
  }

  ** 表所属站点；用于取对应站点的计量树缓存。
  Ref? siteOf(Ref meterRef) {
    rec := cx.proj.readById(meterRef, false)
    return rec == null ? null : rec["siteRef"] as Ref
  }

  private static Bool isVirtual(Dict rec) {
    rec.has("emVirtual") || EmMeterRole.of(rec) == EmMeterRole.virtualRole
  }
}
