using folio
using haystack
using skyarc
using skyarcd

**
** 建模器的 Folio 门面 —— 「数据模型配置」屏的后端。
**
** 负责读资产树、读实体详情与点位、改属性、删实体、跑逐实体校验。
** 建实体走 `EmEntityCrud`（模板实例化），这里不重复。
**
** 三条守卫是这个类存在的理由，缺了它们建模器就是一把能把账搞乱的刀：
**   1. **不许改 modelId / id** —— 那是模板实例与模型定义之间的绑定，
**      改了之后 `findDictBasedOnModelId` 再也找不到这条记录
**   2. **不许改已入账表计的介质** —— 历史台账条目的 emMedium 是当时写死的，
**      改表不改账会让同一块表的历史分属两种介质
**   3. **不许删被已关账条目引用的表** —— 那会让一份已经冻结的账目失去来源
**
class EmModelBuilder
{
  new make(Context cx) { this.cx = cx }

  Context cx

  private static const Str src := "EmModelBuilder"

  ** 禁止通过建模器修改的标签：模型绑定与 Folio 内部字段。
  static const Str[] protectedTags := ["id", "mod", "energyMatrix"]

  ** 模型 id 标签的后缀 —— 任何以它结尾的标签都不许改。
  static const Str modelIdSuffix := "ModelId"

//////////////////////////////////////////////////////////////////////////
// 读：资产树
//////////////////////////////////////////////////////////////////////////

  **
  ** 资产树（扁平行，前端按 emDepth 缩进渲染）。
  **
  ** siteRef 为 null 时返回整个项目的资产树；给定时只返回该站点的空间/计量/
  ** 设备子树 —— 组织树（租户）与空间正交，**始终**全量返回，因为一个租户
  ** 可能跨站点。
  **
  Grid tree(Ref? siteRef := null) {
    Dict[] recs := Dict[,]
    if (siteRef == null) {
      recs = cx.proj.readAllList("energyMatrix and (site or floor or meter or emLoad or emZone or emOrg)")
    } else {
      s := cx.proj.readById(siteRef, true)
      recs.add(s)
      recs.addAll(cx.proj.readAllList(
        "energyMatrix and (floor or meter or emLoad or emZone) and siteRef==" + siteRef.toCode))
      recs.addAll(cx.proj.readAllList("energyMatrix and emOrg"))
    }
    return Etc.makeDictsGrid(null, EmModelTree.flatten(recs))
  }

//////////////////////////////////////////////////////////////////////////
// 读：实体详情与点位
//////////////////////////////////////////////////////////////////////////

  **
  ** 实体详情。返回 Dict：
  **   rec         完整记录
  **   emNodeKind  节点类型
  **   emParentId  父节点
  **   emModelId   实例化它的模板 id（形如 `_equip:emElecMeter`），没有则 null
  **   emSpecFile  对应的 xeto 规格文件名，供 UI 显示只读源码
  **   emPointCount / emLedgerCount  子点位数与已入账条目数（删除前的影响面）
  **
  Dict detail(Ref entityId) {
    rec := cx.proj.readById(entityId, true)
    kind := EmNodeKind.of(rec)
    if (kind == null) throw ArgErr(entityId.toCode + " 不是 energyMatrix 资产树里的对象")

    return Etc.makeDict([
      "rec":          rec,
      "emNodeKind":   kind,
      "emParentId":   EmNodeKind.parentOf(rec, kind),
      "emModelId":    modelIdOf(rec),
      "emSpecFile":   specFileOf(kind),
      "emPointCount": Number(points(entityId).size),
      "emLedgerCount": Number(ledgerCount(entityId)),
    ])
  }

  **
  ** 实体的子点位。列：id, dis, navName, kind, unit, his, emL1Point, emDelta,
  ** emTouPeriod, emBound（是否已绑定到采集通道）。
  **
  ** `emBound` 的判据是记录上有没有连接器引用（`connRef` / `curConnRef` 之类，
  ** 由 hxConn 的具体连接器写入）。骨架里不引入连接器，所以这一列多半是 false ——
  ** 它的价值在于让点表交底时一眼看出"哪些槽位还没接上"。
  **
  Grid points(Ref entityId) {
    recs := cx.proj.readAllList("point and equipRef==" + entityId.toCode)
    rows := Dict[,]
    recs.each |Dict p| {
      rows.add(Etc.makeDict([
        "id":          p.id,
        "dis":         EmModelTree.dis(p),
        "navName":     p["navName"],
        "kind":        p["kind"],
        "unit":        p["unit"],
        "his":         p["his"],
        "emL1Point":   p["emL1Point"],
        "emDelta":     p["emDelta"],
        "emTouPeriod": p["emTouPeriod"],
        "curVal":      p["curVal"],
        "emBound":     isBound(p) ? Marker.val : null,
      ]))
    }
    rows.sort |Dict a, Dict b -> Int| {
      return EmModelTree.dis(a) <=> EmModelTree.dis(b)
    }
    return Etc.makeDictsGrid(null, rows)
  }

  private static Bool isBound(Dict p) {
    p.has("connRef") || p.has("curConnRef") || p.has("hisConnRef") || p.has("bacnetCur")
  }

//////////////////////////////////////////////////////////////////////////
// 读：逐实体校验
//////////////////////////////////////////////////////////////////////////

  ** 逐实体铁律校验。列：level(err|warn|info), code, msg, rule。
  Grid validateEntity(Ref entityId) {
    rec := cx.proj.readById(entityId, true)
    kind := EmNodeKind.of(rec)
    if (kind == null) throw ArgErr(entityId.toCode + " 不是 energyMatrix 资产树里的对象")

    Dict? parent := null
    p := EmNodeKind.parentOf(rec, kind)
    if (p != null) parent = cx.proj.readById(p, false)

    pts := kind == EmNodeKind.meter
      ? cx.proj.readAllList("point and equipRef==" + entityId.toCode)
      : Dict[,]

    issues := EmModelValidator.validate(rec, kind, parent, pts)
    return Etc.makeDictsGrid(null, issues)
  }

//////////////////////////////////////////////////////////////////////////
// 写：改属性
//////////////////////////////////////////////////////////////////////////

  **
  ** 更新实体属性。
  **
  ** changes 里值为 `Remove.val` 表示删除该标签。返回更新后的记录。
  **
  ** 拒绝三类修改：受保护标签、模型 id 标签、以及已入账表计的介质变更。
  ** 每次成功更新都会作废计量树缓存 —— 改了 `submeterOf` / `emMeterRole` /
  ** `emMedium` 都会改变汇总结果。
  **
  Dict update(Ref entityId, Dict changes) {
    rec := cx.proj.readById(entityId, true)
    kind := EmNodeKind.of(rec)
    if (kind == null) throw ArgErr(entityId.toCode + " 不是 energyMatrix 资产树里的对象")

    changes = resolveFloorChanges(rec, kind, changes)
    assertEditable(changes)
    assertEnums(changes)
    assertMediumStable(rec, kind, changes)
    assertParentSane(rec, kind, changes)

    d := cx.proj.commit(Diff(rec, syncDis(rec, changes)))
    EmMeterTree.invalidate(rec["siteRef"] as Ref)

    EnergyMatrixExt.logInfo(src,
      "updated " + kind + " '" + EmModelTree.dis(rec) + "' " + entityId.toCode +
      " tags=" + Etc.dictNames(changes).join(","))
    return d.newRec
  }

  **
  ** 改名时同步 `dis`。
  **
  ** 模板有两种写法：楼层 / 分区 / 表计 / 设备只写 `navName` + `disMacro`
  ** （完整显示名由系统拼出来，`dis` 不入库）；站点与租户额外存了一个 `dis`。
  ** 用户改的是「名称」= `navName`，如果不把存着的那个 `dis` 一起改掉，
  ** 树上还会显示旧名字 —— 改完看不到变化是最让人怀疑系统坏了的那种 bug。
  **
  private static Dict syncDis(Dict rec, Dict changes) {
    nn := changes["navName"] as Str
    if (nn == null) return changes
    if (rec.missing("dis")) return changes          // dis 是算出来的，不用管
    if (changes["dis"] != null) return changes      // 调用方已经显式给了
    return Etc.dictSet(changes, "dis", nn)
  }

  ** Validate explicit floor edits and derive a floor when emSpaceRef changes.
  private Dict resolveFloorChanges(Dict rec, Str kind, Dict changes) {
    if (kind != EmNodeKind.meter && kind != EmNodeKind.load) return changes
    if (changes.missing("floorRef") && changes.missing("emSpaceRef")) return changes

    siteRef := rec["siteRef"] as Ref
    if (siteRef == null) throw ArgErr("设备缺少 siteRef，不能校验 floorRef")

    lookup := |Ref id->Dict?| { cx.proj.readById(id, false) }
    if (changes.has("floorRef")) {
      effective := Str:Obj?[:]
      effective["floorRef"] = changes["floorRef"]
      space := changes.has("emSpaceRef") ? changes["emSpaceRef"] : rec["emSpaceRef"]
      if (space != null) effective["emSpaceRef"] = space
      EmFloorResolver.resolve(siteRef, Etc.makeDict(effective), lookup, true)
      return changes
    }

    // emSpaceRef alone was edited. A concrete space with a floor updates the
    // native navigation ancestor; removing/changing to a cross-floor space does
    // not silently discard an independently assigned floor.
    space := changes["emSpaceRef"]
    if (space == null || space is Remove) return changes
    resolved := EmFloorResolver.resolve(
      siteRef, Etc.makeDict1("emSpaceRef", space), lookup)
    derived := resolved["floorRef"] as Ref
    return derived == null ? changes : Etc.dictSet(changes, "floorRef", derived)
  }

  ** 受保护标签与模型 id 标签不可改。
  private static Void assertEditable(Dict changes) {
    bad := Str[,]
    changes.each |Obj? v, Str n| {
      if (protectedTags.contains(n)) bad.add(n)
      else if (n.endsWith(modelIdSuffix)) bad.add(n)
    }
    if (!bad.isEmpty) {
      throw ArgErr("以下标签不允许通过建模器修改：" + bad.join(", ") +
        "。modelId 是模板实例与模型定义之间的绑定，改了之后按 modelId 定位记录会全部失效。")
    }
  }

  ** 枚举型标签必须是合法值 —— 建模期就拦住，别等到关账夜里才发现。
  private static Void assertEnums(Dict changes) {
    checkEnum(changes, "emMedium",     EmMedium.all)
    checkEnum(changes, "emMeterRole",  EmMeterRole.all)
    checkEnum(changes, "emSubItem",    EmSubItem.all)
    checkEnum(changes, "emDataSource", EmDataSource.all)
    checkEnum(changes, "emGranularity", EmGranularity.all)
  }

  private static Void checkEnum(Dict changes, Str tag, Str[] allowed) {
    v := changes[tag]
    if (v == null || v is Remove) return
    s := v as Str
    if (s == null || !allowed.contains(s)) {
      throw ArgErr("$tag 非法：" + v.toStr + "（合法值 " + allowed.join("|") + "）")
    }
  }

  **
  ** 已经入账的表计不许改介质。
  **
  ** 历史台账条目的 `emMedium` 是写入当时固化的，改表不改账会让同一块表的
  ** 历史分属两种介质，跨介质汇总立刻错乱。要换介质就新建一块表。
  **
  private Void assertMediumStable(Dict rec, Str kind, Dict changes) {
    if (kind != EmNodeKind.meter) return
    nm := changes["emMedium"] as Str
    if (nm == null) return
    cur := EmMedium.of(rec)
    if (cur == null || nm == cur) return
    n := ledgerCount(rec.id)
    if (n > 0) {
      throw ArgErr("这块表已有 $n 条台账条目，不允许把介质从 $cur 改成 $nm —— " +
        "历史条目的 emMedium 已固化，改表不改账会让同一块表的历史分属两种介质。" +
        "需要换介质请新建一块表。")
    }
  }

  ** 父引用不能指向自己，也不能指向不存在的记录。
  private Void assertParentSane(Dict rec, Str kind, Dict changes) {
    p := changes["submeterOf"]
    if (p == null || p is Remove) return
    pr := p as Ref
    if (pr == null) throw ArgErr("submeterOf 必须是 Ref")
    if (pr == rec.id) throw ArgErr("submeterOf 不能指向自己")
    target := cx.proj.readById(pr, false)
    if (target == null) throw ArgErr("submeterOf 指向的记录不存在：" + pr.toCode)
    if (target.missing("meter")) throw ArgErr("submeterOf 必须指向一块表计")
    // 环检测交给 EmMeterTreeBuilder（它会在整棵树上剪断并报 meter.cycle），
    // 这里只挡住最直接的自引用与非法目标。
  }

//////////////////////////////////////////////////////////////////////////
// 写：删除
//////////////////////////////////////////////////////////////////////////

  **
  ** 删除实体。
  **
  ** 默认拒绝一切有影响面的删除，force=true 才放行，且**永远**拒绝删除被
  ** 已关账条目引用的表 —— 那会让一份已经冻结、可能已经对外披露的账目
  ** 失去来源，没有任何 force 参数应该能做到这件事。
  **
  ** 删除会连带删掉该实体的子点位（它们是模板生成的，独立存在没有意义）。
  ** 返回被删除的记录数。
  **
  Int delete(Ref entityId, Bool force := false) {
    rec := cx.proj.readById(entityId, true)
    kind := EmNodeKind.of(rec)
    if (kind == null) throw ArgErr(entityId.toCode + " 不是 energyMatrix 资产树里的对象")

    // ---- 已关账条目：硬拒绝 ----
    closed := cx.proj.readAllList(
      "emLedger and emClosed and emMeterRef==" + entityId.toCode).size
    if (closed > 0) {
      throw ArgErr("这块表被 $closed 条**已关账**的台账条目引用，不允许删除 —— " +
        "删了会让一份已冻结的账目失去来源（铁律 7）。")
    }

    // ---- 未关账条目 / 子节点：需要 force ----
    open := ledgerCount(entityId)
    kids := childCount(entityId, kind)
    if (!force && (open > 0 || kids > 0)) {
      parts := Str[,]
      if (open > 0) parts.add("$open 条未关账台账条目")
      if (kids > 0) parts.add("$kids 个子节点")
      throw ArgErr("删除会影响 " + parts.join(" 与 ") +
        "，请确认后以 force=true 重试（子节点会被解除父引用，不会级联删除）。")
    }

    diffs := Diff[,]

    // 子点位随实体一起删
    pts := cx.proj.readAllList("point and equipRef==" + entityId.toCode)
    pts.each |Dict p| { diffs.add(Diff(p, null, Diff.remove)) }

    // 未关账条目一并删掉 —— 留着它们等于留下一批指向不存在表计的孤儿账目
    if (open > 0) {
      cx.proj.readAllList("emLedger and emMeterRef==" + entityId.toCode).each |Dict e| {
        diffs.add(Diff(e, null, Diff.remove))
      }
    }

    // 子节点解除父引用而不是级联删除 —— 级联删除太容易一键清空一个站点
    detachChildren(entityId, kind, diffs)

    diffs.add(Diff(rec, null, Diff.remove))
    cx.proj.commitAll(diffs)
    EmMeterTree.invalidate(rec["siteRef"] as Ref)

    EnergyMatrixExt.logWarn(src,
      "deleted " + kind + " '" + EmModelTree.dis(rec) + "' " + entityId.toCode +
      "（点位 " + pts.size + "，台账 $open，解除子节点 $kids）")
    return diffs.size
  }

  ** 把指向本实体的子节点父引用摘掉，避免留下悬挂引用。
  private Void detachChildren(Ref entityId, Str kind, Diff[] diffs) {
    if (kind == EmNodeKind.meter) {
      cx.proj.readAllList("meter and submeterOf==" + entityId.toCode).each |Dict c| {
        diffs.add(Diff(c, Etc.makeDict1("submeterOf", Remove.val)))
      }
      cx.proj.readAllList("emLoad and emMeterRef==" + entityId.toCode).each |Dict c| {
        diffs.add(Diff(c, Etc.makeDict1("emMeterRef", Remove.val)))
      }
    } else if (kind == EmNodeKind.tenant) {
      cx.proj.readAllList("emOrg and emParentRef==" + entityId.toCode).each |Dict c| {
        diffs.add(Diff(c, Etc.makeDict1("emParentRef", Remove.val)))
      }
    } else if (kind == EmNodeKind.zone) {
      cx.proj.readAllList("emLoad and emSpaceRef==" + entityId.toCode).each |Dict c| {
        diffs.add(Diff(c, Etc.makeDict1("emSpaceRef", Remove.val)))
      }
    } else if (kind == EmNodeKind.floor) {
      // 分区只是"归属"在楼层下，删楼层不该连带删分区 —— 摘掉 floorRef，
      // 分区会回到站点下继续存在
      cx.proj.readAllList("emZone and floorRef==" + entityId.toCode).each |Dict c| {
        diffs.add(Diff(c, Etc.makeDict1("floorRef", Remove.val)))
      }
    }
  }

//////////////////////////////////////////////////////////////////////////
// 规格源码
//////////////////////////////////////////////////////////////////////////

  **
  ** 读 pod 内的 xeto 规格源码（`res/spec/em/<name>.xeto`）。
  **
  ** 走 Axon 而不是让前端直接请求 pod 资源路径：FIN 的 pod 资源路由对
  ** 非常规扩展名并不友好（`.md` 直接 400），走这里稳且能做名字校验。
  **
  ** name 只允许字母、数字与下划线 —— 挡掉 `../` 这类路径穿越。
  **
  static Str specSource(Str name) {
    if (!isSafeName(name)) throw ArgErr("非法的规格文件名：$name")
    uri := specDir.toUri + "${name}.xeto".toUri
    f := EnergyMatrixExt#.pod.file(uri, false)
    if (f == null) throw UnknownRecErr("pod 内没有规格文件：$uri")
    return f.readAllStr
  }

  ** 规格目录在 pod 内的路径。
  private static const Str specDir := "/res/spec/em/"

  **
  ** pod 内全部规格文件名（不含扩展名），供 UI 下拉。
  **
  ** 注意用 `uri.pathStr` 而不是 `uri.toStr`：pod 文件的 uri 形如
  ** `fan://energyMatrix/res/spec/em/tags.xeto`，整串并不以 `/res/` 开头。
  **
  static Str[] specFiles() {
    out := Str[,]
    EnergyMatrixExt#.pod.files.each |File f| {
      if (f.ext != "xeto") return
      if (!f.uri.pathStr.startsWith(specDir)) return
      out.add(f.basename)
    }
    return out.sort
  }

  ** 模板目录在 pod 内的路径。
  private static const Str templateDir := "/res/defaultModels/"

  **
  ** 读 pod 内的 trio 模板源码（`res/defaultModels/<name>.trio`）。
  **
  ** 给建模工具与自检用：模板决定了实例化出来的对象长什么样（带哪些点位、
  ** 哪些字段有默认值），排查"为什么建出来的表少一个点位"时得能看到它。
  **
  static Str templateSource(Str name) {
    if (!isSafeName(name)) throw ArgErr("非法的模板文件名：$name")
    f := EnergyMatrixExt#.pod.file(templateDir.toUri + "${name}.trio".toUri, false)
    if (f == null) throw UnknownRecErr("pod 内没有模板文件：${name}.trio")
    return f.readAllStr
  }

  ** pod 内全部模板文件名（不含扩展名）。
  static Str[] templateFiles() {
    out := Str[,]
    EnergyMatrixExt#.pod.files.each |File f| {
      if (f.ext != "trio") return
      if (!f.uri.pathStr.startsWith(templateDir)) return
      out.add(f.basename)
    }
    return out.sort
  }

  private static Bool isSafeName(Str name) {
    if (name.isEmpty || name.size > 40) return false
    ok := true
    name.each |Int ch| {
      if (!ch.isAlphaNum && ch != '_') ok = false
    }
    return ok
  }

  ** 各节点类型对应的 xeto 规格文件。
  static Str? specFileOf(Str kind) {
    if (kind == EmNodeKind.site)   return "spaces"
    if (kind == EmNodeKind.floor)  return "spaces"
    if (kind == EmNodeKind.zone)   return "spaces"
    if (kind == EmNodeKind.tenant) return "spaces"
    if (kind == EmNodeKind.meter)  return "meters"
    if (kind == EmNodeKind.load)   return "loads"
    return null
  }

//////////////////////////////////////////////////////////////////////////
// 辅助
//////////////////////////////////////////////////////////////////////////

  ** 该实体已有多少条台账条目（删除与改介质的影响面）。
  Int ledgerCount(Ref entityId) {
    cx.proj.readAllList("emLedger and emMeterRef==" + entityId.toCode).size
  }

  private Int childCount(Ref entityId, Str kind) {
    if (kind == EmNodeKind.meter) {
      return cx.proj.readAllList("meter and submeterOf==" + entityId.toCode).size +
             cx.proj.readAllList("emLoad and emMeterRef==" + entityId.toCode).size
    }
    if (kind == EmNodeKind.tenant) {
      return cx.proj.readAllList("emOrg and emParentRef==" + entityId.toCode).size
    }
    if (kind == EmNodeKind.zone) {
      return cx.proj.readAllList("emLoad and emSpaceRef==" + entityId.toCode).size
    }
    if (kind == EmNodeKind.floor) {
      return cx.proj.readAllList("emZone and floorRef==" + entityId.toCode).size
    }
    if (kind == EmNodeKind.site) {
      return cx.proj.readAllList(
        "energyMatrix and (floor or meter or emLoad or emZone) and siteRef==" + entityId.toCode).size
    }
    return 0
  }

  ** 取记录上的模型 id（任何 `*ModelId` 标签的值）。
  private static Str? modelIdOf(Dict rec) {
    Str? found := null
    rec.each |Obj? v, Str n| {
      if (found != null) return
      if (!n.endsWith(modelIdSuffix)) return
      s := v as Str
      if (s != null) found = s
    }
    return found
  }
}
