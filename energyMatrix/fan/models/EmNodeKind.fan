using haystack

**
** 资产树里的节点类型。
**
** 建模器把两棵正交的树（空间树 + 组织树）与计量树合并成一棵可浏览的资产树：
**
**   site                     站点
**    ├─ floor                楼层
**    │   └─ zone             计量分区（挂了楼层就显示在楼层下）
**    ├─ zone                 计量分区（可跨楼层时直接挂站点）
**    ├─ meter                表计（自身用 submeterOf 构成同介质 DAG）
**    │   └─ meter …
**    └─ load                 用能设备的能耗身份
**   tenant                   组织 / 租户（与空间正交，自成一棵根）
**    └─ tenant …
**
** 节点类型决定了：右侧详情面板显示哪些属性、能挂哪些子节点、以及
** `EmModelValidator` 跑哪一组铁律检查。
**
const class EmNodeKind
{
  static const Str site   := "site"
  static const Str floor  := "floor"
  static const Str zone   := "zone"
  static const Str meter  := "meter"
  static const Str load   := "load"
  static const Str tenant := "tenant"

  static const Str[] all := [site, floor, zone, meter, load, tenant]

  ** UI 左侧筛选器的分组（对应设计稿的「全部 / 空间 / 计量 / 设备 / 组织」）。
  static const Str:Str filterGroup := [
    site:   "space",
    floor:  "space",
    zone:   "space",
    meter:  "metering",
    load:   "equip",
    tenant: "org",
  ]

  static Bool isValid(Str? k) { k != null && all.contains(k) }

  **
  ** 判定一条记录属于哪种节点。
  **
  ** 顺序有意义，两处不能调换：
  **   - `EmLoad` 挂在既有 equip 上（铁律 5），那条 equip 同时带 `equip` 和
  **     `emLoad`；而表计带 `equip` + `meter`。先判 meter，否则一块表会被认成负荷。
  **   - Haystack 里 `floor is space`，楼层同时带 `floor` 和 `space`。
  **     先判 floor，否则楼层会被认成计量分区。
  ** 返回 null 表示这条记录不属于 energyMatrix 的资产树。
  **
  static Str? of(Dict rec) {
    if (rec.missing("energyMatrix")) return null
    if (rec.has("site"))    return site
    if (rec.has("meter"))   return meter
    if (rec.has("emLoad"))  return load
    if (rec.has("floor"))   return floor
    if (rec.has("emZone"))  return zone
    if (rec.has("space"))   return zone
    if (rec.has("emOrg"))   return tenant
    return null
  }

  **
  ** 该类型节点在树中的父节点 id。
  **
  ** meter 优先挂父表（`submeterOf`）—— 计量树的形状就是它；没有父表的表挂站点。
  ** load 优先挂它的计量表（一眼能看出"这台设备的账算在哪块表上"），
  ** 没有表的挂分区，再没有就挂站点。
  ** zone 挂楼层（`floorRef`）—— 没填楼层就直接挂站点，这是跨楼层分区的情形
  ** （说明书 §6 待决事项 OI-04 取的是"允许跨楼层"）。
  **
  static Ref? parentOf(Dict rec, Str kind) {
    if (kind == site)   return null
    if (kind == tenant) return rec["emParentRef"] as Ref
    if (kind == floor)  return rec["siteRef"] as Ref
    if (kind == zone) {
      f := rec["floorRef"] as Ref
      if (f != null) return f
      return rec["siteRef"] as Ref
    }
    if (kind == meter) {
      p := rec["submeterOf"] as Ref
      if (p != null) return p
      return rec["siteRef"] as Ref
    }
    // load
    m := rec["emMeterRef"] as Ref
    if (m != null) return m
    s := rec["emSpaceRef"] as Ref
    if (s != null) return s
    return rec["siteRef"] as Ref
  }
}
