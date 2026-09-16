using haystack

**
** 计量树的一个节点。纯数据对象，不碰 Folio —— 由 `EmMeterTreeBuilder`
** 从一批 Dict 构造，因此整棵树可以脱离 proj 做单元测试。
**
class EmMeterNode
{
  new make(Dict rec) {
    this.rec      = rec
    this.id       = rec.id
    // Fantom 解析不了「链式 elvis + as 转换」，必须写成显式 null 检查。
    Str? nm := rec["dis"] as Str
    if (nm == null) nm = rec["navName"] as Str
    this.dis      = nm ?: rec.id.toStr
    this.medium   = EmMedium.of(rec)
    this.role     = EmMeterRole.of(rec)
    this.parentId = rec["submeterOf"] as Ref
  }

  ** 原始 Folio 记录。
  Dict rec

  const Ref id
  const Str dis
  ** 介质；无法判定时为 null（校验阶段会报 err）。
  const Str? medium
  ** `emMeterRole` 六值之一。
  const Str role
  ** `submeterOf` 指向的父表 id；根节点为 null。
  const Ref? parentId

  ** 父节点。父引用悬挂（指向不存在的表）时为 null，此时节点被当作根处理。
  EmMeterNode? parent := null
  ** 子节点，按 dis 排序。
  EmMeterNode[] children := EmMeterNode[,]

  Bool isVirtual() { rec.has("emVirtual") || role == EmMeterRole.virtualRole }
  Bool isGap()     { rec.has("emGap") }
  Bool isCheck()   { role == EmMeterRole.check }
  Bool isRoot()    { parent == null }

  **
  ** 参与父表汇总的直接子节点。
  **
  ** 排除两类：
  **   - **考核表**（`check`）：与某块已计量回路重叠，计入就是重复计量
  **   - **缺口表**（`emGap`）：它是"父表减去已计量子表之和"的余量。缺口表
  **     按 `submeterOf` 挂在源表下面（这样计量树里一眼能看出还有多少不明用能），
  **     但它绝不能参与那个和 —— 否则 Σ子表 恒等于 父表，缺口永远是 0，
  **     校核就失去意义；而且缺口公式本身要调 `emSubMeterSum`，
  **     计入会造成无限递归。
  **
  EmMeterNode[] summableChildren() {
    out := EmMeterNode[,]
    children.each |EmMeterNode c| {
      if (!EmMeterRole.countsTowardSum(c.role)) return
      if (c.isGap) return
      out.add(c)
    }
    return out
  }

  ** 到根的层级，根为 0。
  Int depth() {
    n := 0
    p := parent
    // 深度上限保护：建树阶段已经断过环，这里只是防御。
    while (p != null && n < 64) { n++; p = p.parent }
    return n
  }

  ** 本节点及其全部后代（前序）。
  EmMeterNode[] descendants() {
    out := EmMeterNode[,]
    collect(this, out)
    return out
  }

  private static Void collect(EmMeterNode n, EmMeterNode[] out) {
    out.add(n)
    n.children.each |EmMeterNode c| { collect(c, out) }
  }

  ** 供前端渲染的扁平行。
  Dict toRow() {
    Etc.makeDict([
      "id":        id,
      "dis":       dis,
      "emMedium":  medium,
      "emMeterRole": role,
      "submeterOf": parentId,
      "emDepth":   Number(depth),
      "emVirtual": isVirtual ? Marker.val : null,
      "emGap":     isGap ? Marker.val : null,
      "emChildCount": Number(children.size),
    ])
  }

  override Str toStr() { "EmMeterNode($dis, $role, $medium)" }
}
