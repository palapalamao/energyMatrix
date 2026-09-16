using folio
using haystack
using skyarc
using skyarcd

**
** 实体实例化的统一入口 —— `EnergyMatrixLib` 的工厂 @Axon 全部委托到这里。
**
** 反模式提醒：**不要在别处 `new ModelEntityXxx(...)` 绕过这里**。
** 走同一个入口才能保证 `energyMatrix` 全局标记、缓存作废、日志格式一致。
**
class EmEntityCrud
{
  new make(Context cx) { this.cx = cx }

  Context cx

  private static const Str src := "EmEntityCrud"

//////////////////////////////////////////////////////////////////////////
// 空间与组织
//////////////////////////////////////////////////////////////////////////

  ** 新建站点。args 可覆写模板里的任意 `Arg(...)`（area / emUsageType / tz …）。
  Ref addSite(Str name := "Site", Dict args := Etc.emptyDict) {
    m := ModelEntityEmSite.makeFromTrio(name, args)
    m.commit(cx)
    log("site", m.entityId, name)
    return m.entityId
  }

  **
  ** 新建楼层。
  **
  ** 楼层是站点与分区之间的一层，用于按层出报表与按层对标。
  ** args 常用键：area、floorNum（地面层 0、地上为正、地下为负）、emUsageType。
  **
  Ref addFloor(Ref siteRef, Str name := "Floor", Dict args := Etc.emptyDict) {
    m := ModelEntityEmFloor.makeFromTrio(siteRef, name, args)
    m.commit(cx)
    log("floor", m.entityId, name)
    return m.entityId
  }

  **
  ** 新建计量分区。
  **
  ** 分区挂在站点下；args 里给了 `floorRef` 就同时归属到那一层。
  ** 跨楼层的分区（餐饮区、主力店这类）不填 floorRef 即可。
  **
  Ref addZone(Ref siteRef, Str name := "Zone", Dict args := Etc.emptyDict) {
    m := ModelEntityEmZone.makeFromTrio(siteRef, name, args)
    m.commit(cx)
    log("zone", m.entityId, name)
    return m.entityId
  }

  ** 新建租户 / 组织单元。parentRef 为上级组织（构成成本中心树），可为 null。
  Ref addTenant(Ref? parentRef, Str name := "Tenant", Dict args := Etc.emptyDict) {
    m := ModelEntityEmTenant.makeFromTrio(parentRef, name, args)
    m.commit(cx)
    log("tenant", m.entityId, name)
    return m.entityId
  }

//////////////////////////////////////////////////////////////////////////
// 计量
//////////////////////////////////////////////////////////////////////////

  **
  ** 新建表计。medium 决定用哪个子类模板。
  **
  ** args 常用键：emMeterRole / submeterOf / emSubItem / emMeterFactor /
  ** emMaxReading / emInstallDate / emServesRef / emSpaceRef / emTenantRef。
  **
  Ref addMeter(Ref siteRef, Str medium, Str name := "Meter", Dict args := Etc.emptyDict) {
    if (!EmMedium.isValid(medium)) {
      throw ArgErr("未知介质：$medium（合法值 " + EmMedium.all.join("|") + "）")
    }
    m := newMeterModel(medium, siteRef, name, withFloor(siteRef, args))
    m.commit(cx)
    EmMeterTree.invalidate(siteRef)   // 拓扑变了，作废计量树缓存
    log("meter($medium)", m.entityId, name)
    return m.entityId
  }

  **
  ** 新建虚拟表。formula 是 `emFormula`（Axon 表达式），账期由
  ** `EmEvalScope` 注入，所以可以直接写 `emMeterRead(@M-B1-01)`。
  **
  Ref addVirtualMeter(Ref siteRef, Str medium, Str formula,
                      Str name := "Virtual Meter", Dict args := Etc.emptyDict) {
    merged := Etc.dictMerge(args, Etc.makeDict([
      "emMedium":  medium,
      "emFormula": formula,
    ]))
    merged = withFloor(siteRef, merged)
    m := ModelEntityEmVirtualMeter.makeFromTrio(siteRef, name, merged)
    m.commit(cx)
    EmMeterTree.invalidate(siteRef)
    log("virtualMeter($medium)", m.entityId, name)
    return m.entityId
  }

  **
  ** 新建缺口表 —— 差值法虚表，公式固定为「源表 − 已计量子表之和」。
  **
  ** 这是说明书 §3.3.3 的强制建模：缺口必须是一块显式存在的表，不能让它
  ** 在报表里被平摊掉。
  **
  Ref addGapMeter(Ref siteRef, Ref sourceMeterRef, Str? name := null,
                  Dict args := Etc.emptyDict) {
    srcRec := cx.proj.readById(sourceMeterRef, true)
    medium := EmMedium.of(srcRec)
    if (medium == null) throw ArgErr("源表 " + sourceMeterRef.toCode + " 判定不出介质")
    formula := "emMeterRead(" + sourceMeterRef.toCode + ") - emSubMeterSum(" +
               sourceMeterRef.toCode + ")"
    dis := name ?: ("Gap of " + ((srcRec["dis"] as Str) ?: sourceMeterRef.toStr))
    fixed := Str:Obj?[
      "emMedium":   medium,
      "emFormula":  formula,
      "submeterOf": sourceMeterRef,
      "unit":        EmMedium.unit(medium),
    ]
    sourceFloor := srcRec["floorRef"] as Ref
    if (sourceFloor != null) fixed["floorRef"] = sourceFloor
    merged := withFloor(siteRef, Etc.dictMerge(args, Etc.makeDict(fixed)))
    m := ModelEntityEmGapMeter.makeFromTrio(siteRef, dis, merged)
    m.commit(cx)
    EmMeterTree.invalidate(siteRef)
    log("gapMeter($medium)", m.entityId, dis)
    return m.entityId
  }

//////////////////////////////////////////////////////////////////////////
// 用能设备（铁律 5：不新建 equip，只挂能耗身份）
//////////////////////////////////////////////////////////////////////////

  **
  ** 给一台**既有** equip 挂上能耗身份。
  **
  ** 铁律 5：不重复定义冷机 / 水泵 / 空调机组 —— 那是 ph.equips 与
  ** CoolMatrix / heatMatrix 的职责。这里只往目标 equip 上合并
  ** `energyMatrix` + `emLoad` + `emSubItem` + `emMeterRef` + 额定值等标签。
  **
  ** args 常用键：emSubItem / emMeterRef / emRatedPower / emAllocWeight /
  ** emSpaceRef / emTenantRef。
  **
  **
  ** 新建用能设备组（说明书表 3-5 的 `EmLoadGroup`）。
  **
  ** 与 `attachLoad` 的分工：
  **   - 现场真实存在、由 FIN DB Builder 或连接器发现建出来的设备（冷机、水泵、
  **     空调箱）→ 用 `attachLoad` 给它挂能耗身份，**不新建**（铁律 5）
  **   - 没有独立计量、也不作为单台设备管理的批量对象（一层楼的灯具回路、
  **     一片区域的插座）→ 用这个方法建一个聚合对象，它本来就是 energyMatrix
  **     自己的建模产物，不与任何 HVAC 模型重复
  **
  ** 这条边界很重要：设备组是"账上的一个格子"，不是"一台设备"。
  **
  Ref addLoadGroup(Ref siteRef, Str name := "Load Group", Dict args := Etc.emptyDict) {
    merged := Etc.dictMerge(args, Etc.makeDict1("emLoadGroup", Marker.val))
    merged = withFloor(siteRef, merged)
    m := ModelEntityEmLoad.makeFromTrio(siteRef, name, merged)
    m.commit(cx)
    log("loadGroup", m.entityId, name)
    return m.entityId
  }

  Ref attachLoad(Ref equipRef, Dict args := Etc.emptyDict) {
    equip := cx.proj.readById(equipRef, true)
    if (equip.missing("equip")) throw ArgErr(equipRef.toCode + " 不是 equip")

    tags := Etc.dictToMap(args)
    tags["energyMatrix"] = Marker.val
    tags["emLoad"]       = Marker.val

    sub := args["emSubItem"] as Str
    if (sub != null && !EmSubItem.isValid(sub)) {
      throw ArgErr("emSubItem 非法：$sub（合法值 " + EmSubItem.all.join("|") + "）")
    }

    cx.proj.commit(Diff(equip, Etc.makeDict(tags)))
    log("load", equipRef, (equip["dis"] as Str) ?: equipRef.toStr)
    return equipRef
  }

//////////////////////////////////////////////////////////////////////////
// 内部
//////////////////////////////////////////////////////////////////////////

  private ModelEntityEmMeterBase newMeterModel(Str medium, Ref siteRef, Str name, Dict args) {
    merged := Etc.dictMerge(args, Etc.makeDict1("emMedium", medium))
    if (medium == EmMedium.elec)  return ModelEntityEmElecMeter.makeFromTrio(siteRef, name, merged)
    if (medium == EmMedium.water) return ModelEntityEmWaterMeter.makeFromTrio(siteRef, name, merged)
    if (medium == EmMedium.gas)   return ModelEntityEmGasMeter.makeFromTrio(siteRef, name, merged)
    if (medium == EmMedium.steam) return ModelEntityEmSteamMeter.makeFromTrio(siteRef, name, merged)
    if (medium == EmMedium.cool)  return ModelEntityEmCoolMeter.makeFromTrio(siteRef, name, merged)
    if (medium == EmMedium.heat)  return ModelEntityEmHeatMeter.makeFromTrio(siteRef, name, merged)
    // diesel / coal / hydrogen 目前没有专属模板，用基类（只有 L1/L2 两个点位）。
    return ModelEntityEmMeterBase.makeFromTrio(siteRef, name, merged)
  }

  private Dict withFloor(Ref siteRef, Dict args) {
    return EmFloorResolver.resolve(siteRef, args, |Ref id->Dict?| {
      cx.proj.readById(id, false)
    })
  }

  private static Void log(Str kind, Ref id, Str dis) {
    EnergyMatrixExt.logInfo(src, "created $kind '" + dis + "' " + id.toCode)
  }
}
