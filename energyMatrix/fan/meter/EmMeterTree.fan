using concurrent
using haystack
using skyarc
using skyarcd

**
** 计量树的 Folio 门面：读表计记录 → 交给 `EmMeterTreeBuilder` 建树 → 输出 Grid。
**
** 缓存的是**表计记录列表**（Dict 不可变，可安全放进 ConcurrentMap），不是树对象
** —— 树节点是可变对象，放进 ConcurrentMap 会抛 NotImmutableErr。表计拓扑是低频
** 变更，重建一棵内存树的代价可以忽略；真正贵的是 Folio 查询。
**
** 缓存由 `EmMeterTreeObserver` 在表计记录提交时作废。缓存没有 TTL —— 手工改了
** 表计标签而订阅没触发时，用 `emInvalidateMeterTree()` 清。
**
class EmMeterTree
{
  new make(Context cx) { this.cx = cx }

  Context cx

  private static const Str src := "EmMeterTree"

  ** siteKey -> Dict[]（immutable）。key 见 `cacheKey`。
  private static const ConcurrentMap cache := ConcurrentMap()

  private static Str cacheKey(Ref? siteRef) { siteRef?.toStr ?: "<all>" }

  ** 作废某站点的缓存；siteRef 为 null 时清全部。
  static Void invalidate(Ref? siteRef) {
    if (siteRef == null) { invalidateAll; return }
    cache.remove(cacheKey(siteRef))
  }

  static Void invalidateAll() { cache.clear }

//////////////////////////////////////////////////////////////////////////
// 读取
//////////////////////////////////////////////////////////////////////////

  **
  ** 读取站点下全部 energyMatrix 表计（含虚表）。
  ** siteRef 为 null 时读整个项目 —— 只在单站点项目或诊断场景使用。
  **
  Dict[] readMeters(Ref? siteRef) {
    key := cacheKey(siteRef)
    hit := cache.get(key) as Dict[]
    if (hit != null) return hit

    filter := "energyMatrix and meter"
    if (siteRef != null) filter = filter + " and siteRef==" + siteRef.toCode
    recs := cx.proj.readAllList(filter).toImmutable
    cache.set(key, recs)
    return recs
  }

  ** 建树。
  EmMeterTreeResult tree(Ref? siteRef) { EmMeterTreeBuilder.build(readMeters(siteRef)) }

//////////////////////////////////////////////////////////////////////////
// Grid 输出（供 @Axon 与前端）
//////////////////////////////////////////////////////////////////////////

  **
  ** 扁平化的计量树。列：id, dis, emMedium, emMeterRole, submeterOf,
  ** emDepth, emVirtual, emGap, emChildCount。
  ** medium 非 null 时只返回该介质的子树。
  **
  Grid rows(Ref? siteRef, Str? medium := null) {
    res := tree(siteRef)
    out := Dict[,]
    roots := medium == null ? res.roots : res.rootsOf(medium)
    roots.each |EmMeterNode r| {
      r.descendants.each |EmMeterNode n| { out.add(n.toRow) }
    }
    return Etc.makeDictsGrid(null, out)
  }

  **
  ** 校验结果。列：level(err|warn), code, msg, meterRef。
  ** 空 Grid 表示计量方案在结构上合格。
  **
  Grid validate(Ref? siteRef) {
    res := tree(siteRef)
    if (res.hasErrors) {
      EnergyMatrixExt.logWarn(src,
        "meter tree validation found errors for site " + (siteRef?.toCode ?: "<all>"))
    }
    return Etc.makeDictsGrid(null, res.issues)
  }

//////////////////////////////////////////////////////////////////////////
// 汇总
//////////////////////////////////////////////////////////////////////////

  **
  ** 某表的直接子表用量之和（`check` 表不计入 —— 见 `EmMeterRole.countsTowardSum`）。
  ** 用量由 `reader` 回调提供，因此本方法既能跑实测读数，也能跑台账值。
  **
  static Number? sumChildren(EmMeterNode node, |EmMeterNode -> Number?| reader) {
    total := 0f
    unit  := (Unit?)null
    any   := false
    node.summableChildren.each |EmMeterNode c| {
      v := reader(c)
      if (v == null) return
      any = true
      if (unit == null) unit = v.unit
      total = total + v.toFloat
    }
    return any ? Number(total, unit) : null
  }
}
