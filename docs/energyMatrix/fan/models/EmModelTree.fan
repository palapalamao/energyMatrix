using haystack

**
** 资产树的构建 —— 纯函数，输入一批记录，输出前端可直接渲染的扁平行。
**
** 不依赖 Folio / Context，所以可以在 `HaystackTest` 里直接单测
** （见 `fan/test/EmModelTreeTest.fan`）。Folio 门面见 `EmModelBuilder`。
**
** 与 `EmMeterTreeBuilder` 的分工：那个只管表计、只关心汇总语义（DAG、
** 跨介质、角色）；这个把空间树、计量树、组织树合并成一棵**给人看的**资产树，
** 关心的是层级展示与父引用是否成环。两者对表计的父子关系解释一致
** （都以 `submeterOf` 为准），但用途不同，不要合并。
**
const class EmModelTree
{
  ** 向上遍历上限，防御性上界。
  private static const Int maxWalk := 128

  ** 根节点的排序权重：站点在前，组织树在后。
  private static const Str:Int rootOrder := [
    EmNodeKind.site: 0,
    EmNodeKind.tenant: 1,
  ]

  **
  ** 把一批记录铺成有序的扁平树行。
  **
  ** 返回的每一行携带：
  **   id / dis / emNodeKind / emParentId / emDepth / emChildCount
  **   emMedium / emMeterRole / emVirtual / emGap / emSubItem / emUsageType / area
  **
  ** 父引用指向本批之外的记录（例如只查了一个站点却有跨站引用）时，该节点
  ** 按根处理并标 `emOrphan` —— 不能把它从树里丢掉，否则用户会以为记录不见了。
  **
  static Dict[] flatten(Dict[] recs) {
    // ---- 1) 建索引 ----
    nodes := Dict[,]
    kinds := Ref:Str[:]
    byId  := Ref:Dict[:]
    recs.each |Dict r| {
      k := EmNodeKind.of(r)
      if (k == null) return
      nodes.add(r)
      kinds[r.id] = k
      byId[r.id] = r
    }

    // ---- 2) 解析父引用 ----
    parents := Ref:Ref[:]
    orphans := Ref:Bool[:]
    nodes.each |Dict r| {
      p := EmNodeKind.parentOf(r, kinds[r.id])
      if (p == null) return
      if (p == r.id) { orphans[r.id] = true; return }   // 自引用当根，不成环
      if (!byId.containsKey(p)) { orphans[r.id] = true; return }
      parents[r.id] = p
    }

    // ---- 3) 断环：沿 parent 向上走，撞到路径里已出现的节点即剪断 ----
    nodes.each |Dict r| {
      seen := Ref:Bool[:]
      seen[r.id] = true
      cur := r.id
      i := 0
      while (i < maxWalk) {
        p := parents[cur]
        if (p == null) break
        if (seen.containsKey(p)) { parents.remove(cur); orphans[cur] = true; break }
        seen[p] = true
        cur = p
        i++
      }
      if (i >= maxWalk) { parents.remove(r.id); orphans[r.id] = true }
    }

    // ---- 4) 建子表 ----
    children := Ref:Ref[][:]
    nodes.each |Dict r| {
      p := parents[r.id]
      if (p == null) return
      list := children[p]
      if (list == null) { list = Ref[,]; children[p] = list }
      list.add(r.id)
    }

    // ---- 5) 前序展开 ----
    roots := Ref[,]
    nodes.each |Dict r| { if (parents[r.id] == null) roots.add(r.id) }
    sortIds(roots, byId, kinds, true)

    out := Dict[,]
    roots.each |Ref id| { emit(id, 0, byId, kinds, children, orphans, out) }
    return out
  }

  private static Void emit(Ref id, Int depth, Ref:Dict byId, Ref:Str kinds,
                           Ref:Ref[] children, Ref:Bool orphans, Dict[] out)
  {
    rec := byId[id]
    if (rec == null) return
    kids := children[id] ?: Ref[,]
    out.add(row(rec, kinds[id], depth, kids.size, orphans.containsKey(id)))
    if (depth > maxWalk) return
    sorted := kids.dup
    sortIds(sorted, byId, kinds, false)
    sorted.each |Ref c| { emit(c, depth + 1, byId, kinds, children, orphans, out) }
  }

  ** 根按 (类型权重, dis) 排；子节点只按 dis 排。结果稳定，不随查询顺序漂移。
  private static Void sortIds(Ref[] ids, Ref:Dict byId, Ref:Str kinds, Bool byKind) {
    ids.sort |Ref a, Ref b -> Int| {
      if (byKind) {
        ka := rootOrder[kinds[a]] ?: 9
        kb := rootOrder[kinds[b]] ?: 9
        if (ka != kb) return ka <=> kb
      }
      return dis(byId[a]) <=> dis(byId[b])
    }
  }

  ** 显示名。Fantom 解析不了「链式 elvis + as 转换」，写成显式 null 检查。
  static Str dis(Dict? d) {
    if (d == null) return "?"
    Str? s := d["dis"] as Str
    if (s == null) s = d["navName"] as Str
    return s ?: d.id.toStr
  }

  private static Dict row(Dict rec, Str kind, Int depth, Int childCount, Bool orphan) {
    Etc.makeDict([
      "id":           rec.id,
      "dis":          dis(rec),
      "emNodeKind":   kind,
      "emGroup":      EmNodeKind.filterGroup[kind],
      "emParentId":   EmNodeKind.parentOf(rec, kind),
      "emDepth":      Number(depth),
      "emChildCount": Number(childCount),
      "emOrphan":     orphan ? Marker.val : null,
      // 各类型的展示要素，前端不必再逐条回查
      "emMedium":     rec["emMedium"],
      "emMeterRole":  rec["emMeterRole"],
      "emVirtual":    rec["emVirtual"],
      "emGap":        rec["emGap"],
      "emSubItem":    rec["emSubItem"],
      "emUsageType":  rec["emUsageType"],
      "emDataSource": rec["emDataSource"],
      "area":         rec["area"],
    ])
  }
}
