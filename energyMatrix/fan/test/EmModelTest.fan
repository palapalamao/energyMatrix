using finEntityModelToolsExt
using haystack

**
** 建模器的纯函数测试：资产树铺平 + 逐实体铁律校验。
**
** 需要 Folio 的部分（改属性守卫、删除守卫、规格源码读取）留给运行期验证 ——
** 见 README「验证」一节。
**
** 运行：<fin>/bin/fant energyMatrix::EmModelTest
**
class EmModelTest : HaystackTest
{
//////////////////////////////////////////////////////////////////////////
// 构造测试记录
//////////////////////////////////////////////////////////////////////////

  private static Dict rec(Str id, Str dis, Str:Obj? tags) {
    m := Str:Obj?[:]
    m["id"] = Ref(id, dis)
    m["dis"] = dis
    m["energyMatrix"] = Marker.val
    tags.each |Obj? v, Str k| { m[k] = v }
    return Etc.makeDict(m)
  }

  private static Dict site(Str id, Str dis, Str:Obj? extra := Str:Obj?[:]) {
    t := Str:Obj?["site": Marker.val, "area": Number(28400f, Unit("m²")),
                  "tz": "Asia/Shanghai", "emUsageType": "office"]
    extra.each |Obj? v, Str k| { t[k] = v }
    return rec(id, dis, t)
  }

  private static Dict floor(Str id, Str dis, Str siteId, Str:Obj? extra := Str:Obj?[:]) {
    t := Str:Obj?["floor": Marker.val, "space": Marker.val,
                  "siteRef": Ref(siteId), "area": Number(3000f, Unit("m²")),
                  "floorNum": Number(1f)]
    extra.each |Obj? v, Str k| { t[k] = v }
    return rec(id, dis, t)
  }

  private static Dict zone(Str id, Str dis, Str siteId, Str:Obj? extra := Str:Obj?[:]) {
    t := Str:Obj?["space": Marker.val, "emZone": Marker.val,
                  "siteRef": Ref(siteId), "area": Number(1000f, Unit("m²"))]
    extra.each |Obj? v, Str k| { t[k] = v }
    return rec(id, dis, t)
  }

  private static Dict meter(Str id, Str dis, Str siteId, Str medium, Str role,
                            Str? parentId := null, Str:Obj? extra := Str:Obj?[:]) {
    t := Str:Obj?["equip": Marker.val, "meter": Marker.val,
                  "siteRef": Ref(siteId), "emMedium": medium,
                  "emMeterRole": role, "emDataSource": "measured"]
    if (parentId != null) t["submeterOf"] = Ref(parentId)
    extra.each |Obj? v, Str k| { t[k] = v }
    return rec(id, dis, t)
  }

  private static Dict load(Str id, Str dis, Str siteId, Str:Obj? extra := Str:Obj?[:]) {
    t := Str:Obj?["equip": Marker.val, "emLoad": Marker.val,
                  "siteRef": Ref(siteId), "emSubItem": "b1",
                  "emRatedPower": Number(75f, Unit("kW"))]
    extra.each |Obj? v, Str k| { t[k] = v }
    return rec(id, dis, t)
  }

  private static Dict tenant(Str id, Str dis, Str? parentId := null,
                             Str:Obj? extra := Str:Obj?[:]) {
    t := Str:Obj?["emOrg": Marker.val, "emTenant": Marker.val,
                  "area": Number(500f, Unit("m²"))]
    if (parentId != null) t["emParentRef"] = Ref(parentId)
    extra.each |Obj? v, Str k| { t[k] = v }
    return rec(id, dis, t)
  }

  private static Dict? find(Dict[] rows, Str id) {
    Dict? hit := null
    rows.each |Dict r| { if ((r["id"] as Ref)?.id == id) hit = r }
    return hit
  }

  private static Int depth(Dict[] rows, Str id) {
    (find(rows, id)?.get("emDepth") as Number)?.toFloat?.toInt ?: -1
  }

  private static Bool hasCode(Dict[] issues, Str code) {
    found := false
    issues.each |Dict i| { if (i["code"] == code) found = true }
    return found
  }

//////////////////////////////////////////////////////////////////////////
// 节点类型判定
//////////////////////////////////////////////////////////////////////////

  Void test_nodeKind_meterBeatsLoad() {
    // 表计与负荷都带 equip；负荷还挂在既有 equip 上。判定顺序必须先 meter
    // 再 load，否则一块表会被认成负荷。
    m := meter("m-1", "总表", "s-1", "elec", "main")
    verifyEq(EmNodeKind.of(m), EmNodeKind.meter)
    verifyEq(EmNodeKind.of(load("e-1", "冷机", "s-1")), EmNodeKind.load)
    verifyEq(EmNodeKind.of(site("s-1", "站点")), EmNodeKind.site)
    verifyEq(EmNodeKind.of(zone("z-1", "餐饮区", "s-1")), EmNodeKind.zone)
    verifyEq(EmNodeKind.of(tenant("t-1", "星巴克")), EmNodeKind.tenant)
  }

  Void test_nodeKind_floorBeatsZone() {
    // Haystack 里 floor is space，楼层同时带 floor 与 space 两个标记。
    // 判定必须先认 floor，否则楼层会被当成计量分区。
    f := floor("f-1", "3F", "s-1")
    verifyEq(EmNodeKind.of(f), EmNodeKind.floor)
    verifyEq(EmNodeKind.of(zone("z-1", "餐饮区", "s-1")), EmNodeKind.zone)
    verifyEq(EmNodeKind.filterGroup[EmNodeKind.floor], "space")
  }

  Void test_nodeKind_zonePrefersFloorAsParent() {
    // 挂了楼层的分区显示在楼层下；跨楼层的分区直接挂站点
    onFloor := zone("z-1", "3F 办公区", "s-1", ["floorRef": Ref("f-1")])
    verifyEq(EmNodeKind.parentOf(onFloor, EmNodeKind.zone), Ref("f-1"))

    crossFloor := zone("z-2", "餐饮区", "s-1")
    verifyEq(EmNodeKind.parentOf(crossFloor, EmNodeKind.zone), Ref("s-1"))

    verifyEq(EmNodeKind.parentOf(floor("f-1", "3F", "s-1"), EmNodeKind.floor), Ref("s-1"))
  }

  Void test_nodeKind_ignoresForeignRecords() {
    // 没有 energyMatrix 标记的记录不属于本库资产树（同一 Folio 里还有
    // CoolMatrix / heatMatrix 的设备）
    foreign := Etc.makeDict(["id": Ref("x-1"), "equip": Marker.val, "chiller": Marker.val])
    verifyNull(EmNodeKind.of(foreign))
  }

  Void test_nodeKind_loadPrefersMeterAsParent() {
    // 负荷优先挂它的计量表 —— 一眼能看出这台设备的账算在哪块表上
    l := load("e-1", "冷机", "s-1", ["emMeterRef": Ref("m-b1"), "emSpaceRef": Ref("z-1")])
    verifyEq(EmNodeKind.parentOf(l, EmNodeKind.load), Ref("m-b1"))

    l2 := load("e-2", "风机", "s-1", ["emSpaceRef": Ref("z-1")])
    verifyEq(EmNodeKind.parentOf(l2, EmNodeKind.load), Ref("z-1"))

    l3 := load("e-3", "水泵", "s-1")
    verifyEq(EmNodeKind.parentOf(l3, EmNodeKind.load), Ref("s-1"))
  }

//////////////////////////////////////////////////////////////////////////
// 资产树铺平
//////////////////////////////////////////////////////////////////////////

  Void test_flatten_buildsHierarchy() {
    recs := [
      site("s-1", "奥体中心"),
      zone("z-1", "餐饮区", "s-1"),
      meter("m-gw", "关口表", "s-1", "elec", "gateway"),
      meter("m-b1", "冷热站", "s-1", "elec", "branch", "m-gw"),
      load("e-1", "1号冷机", "s-1", ["emMeterRef": Ref("m-b1")]),
      tenant("t-1", "星巴克"),
    ]
    rows := EmModelTree.flatten(recs)

    verifyEq(rows.size, 6)
    verifyEq(depth(rows, "s-1"), 0)
    verifyEq(depth(rows, "z-1"), 1)
    verifyEq(depth(rows, "m-gw"), 1)
    verifyEq(depth(rows, "m-b1"), 2, "子表挂父表，不挂站点")
    verifyEq(depth(rows, "e-1"), 3, "负荷挂它的计量表")
    verifyEq(depth(rows, "t-1"), 0, "组织树与空间正交，自成一棵根")

    // 前序：站点整棵子树出完，组织树才开始
    verifyEq((rows.first["id"] as Ref).id, "s-1")
    verifyEq((rows.last["id"] as Ref).id, "t-1")
  }

  Void test_flatten_floorLevel() {
    recs := [
      site("s-1", "奥体中心"),
      floor("f-1", "3F", "s-1"),
      zone("z-1", "3F 办公区", "s-1", ["floorRef": Ref("f-1")]),
      zone("z-2", "餐饮区", "s-1"),   // 跨楼层，直接挂站点
    ]
    rows := EmModelTree.flatten(recs)
    verifyEq(depth(rows, "s-1"), 0)
    verifyEq(depth(rows, "f-1"), 1)
    verifyEq(depth(rows, "z-1"), 2, "挂了楼层的分区在楼层下")
    verifyEq(depth(rows, "z-2"), 1, "跨楼层分区直接挂站点")
    verifyEq(find(rows, "f-1")["emNodeKind"], EmNodeKind.floor)
  }

  Void test_flatten_carriesDisplayFields() {
    rows := EmModelTree.flatten([
      meter("m-1", "冷热站", "s-1", "elec", "branch", null,
            ["emSubItem": "b1", "emVirtual": null]),
    ])
    r := find(rows, "m-1")
    verifyEq(r["emNodeKind"], EmNodeKind.meter)
    verifyEq(r["emGroup"], "metering")
    verifyEq(r["emMedium"], "elec")
    verifyEq(r["emMeterRole"], "branch")
    verifyEq(r["emSubItem"], "b1")
    verifyEq((r["emChildCount"] as Number).toFloat, 0f)
  }

  Void test_flatten_orphanKeptAsRoot() {
    // 父引用指向本批之外的记录：按根处理并标 emOrphan，
    // 绝不能从树里丢掉 —— 否则用户会以为记录不见了
    rows := EmModelTree.flatten([
      meter("m-x", "孤儿表", "s-missing", "elec", "sub", "m-missing"),
    ])
    verifyEq(rows.size, 1)
    verifyEq(depth(rows, "m-x"), 0)
    verifyNotNull(find(rows, "m-x")["emOrphan"])
  }

  Void test_flatten_cyclesAreCut() {
    // a → b → a：断环后两者都还在树里，深度有限
    recs := [
      meter("m-a", "A", "s-1", "elec", "main", "m-b"),
      meter("m-b", "B", "s-1", "elec", "branch", "m-a"),
    ]
    rows := EmModelTree.flatten(recs)
    verifyEq(rows.size, 2, "成环的节点不能消失")
    rows.each |Dict r| {
      d := (r["emDepth"] as Number).toFloat.toInt
      verify(d >= 0 && d < 64, "深度必须有限")
    }
  }

  Void test_flatten_selfReferenceBecomesRoot() {
    rows := EmModelTree.flatten([
      meter("m-a", "A", "s-1", "elec", "main", "m-a"),
    ])
    verifyEq(rows.size, 1)
    verifyEq(depth(rows, "m-a"), 0)
    verifyNotNull(find(rows, "m-a")["emOrphan"])
  }

  Void test_flatten_stableOrdering() {
    // 同层按 dis 排，结果不随输入顺序漂移
    a := [site("s-1", "站点"), meter("m-b", "B表", "s-1", "elec", "sub"),
          meter("m-a", "A表", "s-1", "elec", "sub")]
    b := [meter("m-a", "A表", "s-1", "elec", "sub"), site("s-1", "站点"),
          meter("m-b", "B表", "s-1", "elec", "sub")]
    ids := |Dict[] rows -> Str| {
      out := Str[,]
      rows.each |Dict r| { out.add((r["id"] as Ref).id) }
      return out.join(",")
    }
    verifyEq(ids(EmModelTree.flatten(a)), ids(EmModelTree.flatten(b)))
    verifyEq(ids(EmModelTree.flatten(a)), "s-1,m-a,m-b")
  }

//////////////////////////////////////////////////////////////////////////
// 逐实体校验 · 站点 / 分区 / 组织
//////////////////////////////////////////////////////////////////////////

  Void test_validateSite_requiresArea() {
    bad := rec("s-1", "站点", ["site": Marker.val, "tz": "Asia/Shanghai",
                              "emUsageType": "office"])
    issues := EmModelValidator.validate(bad, EmNodeKind.site)
    verify(hasCode(issues, "site.area.missing"), "面积是 EUI 的分母，缺了整个指标域算不出来")
    verify(EmModelValidator.hasErrors(issues))

    ok := site("s-1", "站点", ["emOccupancy": Number(3000f)])
    verifyFalse(EmModelValidator.hasErrors(EmModelValidator.validate(ok, EmNodeKind.site)))
  }

  Void test_validateSite_gapThresholdRange() {
    bad := site("s-1", "站点", ["emGapThreshold": Number(1.5f)])
    verify(hasCode(EmModelValidator.validate(bad, EmNodeKind.site), "site.gapThreshold.range"))

    ok := site("s-2", "站点", ["emGapThreshold": Number(0.03f)])
    verifyFalse(hasCode(EmModelValidator.validate(ok, EmNodeKind.site), "site.gapThreshold.range"))
  }

  Void test_validateFloor() {
    ok := floor("f-1", "3F", "s-1")
    verifyFalse(EmModelValidator.hasErrors(EmModelValidator.validate(ok, EmNodeKind.floor)))

    noSite := rec("f-2", "3F", ["floor": Marker.val, "space": Marker.val])
    issues := EmModelValidator.validate(noSite, EmNodeKind.floor)
    verify(hasCode(issues, "floor.siteRef.missing"))
    verify(hasCode(issues, "floor.area.missing"))
    verify(hasCode(issues, "floor.floorNum.missing"))
  }

  Void test_validateZone_warnsOnMissingArea() {
    z := rec("z-1", "餐饮区", ["space": Marker.val, "emZone": Marker.val,
                              "siteRef": Ref("s-1")])
    issues := EmModelValidator.validate(z, EmNodeKind.zone)
    verify(hasCode(issues, "zone.area.missing"))
    verifyFalse(EmModelValidator.hasErrors(issues), "缺面积只是 warn —— 不做面积分摊也能用")
  }

  Void test_validateTenant_needsAllocWeight() {
    t := rec("t-1", "星巴克", ["emOrg": Marker.val, "emTenant": Marker.val])
    verify(hasCode(EmModelValidator.validate(t, EmNodeKind.tenant), "tenant.weight.missing"))
  }

//////////////////////////////////////////////////////////////////////////
// 逐实体校验 · 表计（铁律最密集）
//////////////////////////////////////////////////////////////////////////

  private static Dict l1Pt() {
    Etc.makeDict(["id": Ref("p-1"), "point": Marker.val, "sensor": Marker.val,
                  "total": Marker.val, "emL1Point": Marker.val, "his": Marker.val])
  }

  Void test_validateMeter_requiresDataSource() {
    m := rec("m-1", "总表", ["equip": Marker.val, "meter": Marker.val,
                            "emMedium": "elec", "emMeterRole": "main"])
    issues := EmModelValidator.validate(m, EmNodeKind.meter, null, [l1Pt])
    verify(hasCode(issues, "meter.dataSource.missing"), "铁律 4")
    verify(EmModelValidator.hasErrors(issues))
  }

  Void test_validateMeter_requiresMedium() {
    m := rec("m-1", "总表", ["equip": Marker.val, "meter": Marker.val,
                            "emMeterRole": "main", "emDataSource": "measured"])
    verify(hasCode(EmModelValidator.validate(m, EmNodeKind.meter, null, [l1Pt]),
                   "meter.medium.unknown"))
  }

  Void test_validateMeter_rejectsCrossMediumParent() {
    parent := meter("m-e", "电总表", "s-1", "elec", "main")
    child := meter("m-w", "水表", "s-1", "water", "sub", "m-e")
    issues := EmModelValidator.validate(child, EmNodeKind.meter, parent, [l1Pt])
    verify(hasCode(issues, "meter.medium.mismatch"), "铁律 2：电表的父表只能是电表")
  }

  Void test_validateMeter_physicalMeterNeedsL1Point() {
    m := meter("m-1", "总表", "s-1", "elec", "main", null,
               ["emMaxReading": Number(99999f)])
    // 没有点位
    verify(hasCode(EmModelValidator.validate(m, EmNodeKind.meter, null, Dict[,]),
                   "meter.l1.missing"), "没有 L1 点，台账构建会跳过这块表")
    // 有点位
    verifyFalse(hasCode(EmModelValidator.validate(m, EmNodeKind.meter, null, [l1Pt]),
                        "meter.l1.missing"))
  }

  Void test_validateMeter_l1PointFallsBackToTotalSensor() {
    // 模板没打 emL1Point 时，退到 total + sensor 认
    plain := Etc.makeDict(["id": Ref("p-2"), "point": Marker.val,
                           "sensor": Marker.val, "total": Marker.val])
    verifyNotNull(EmModelValidator.l1Point([plain]))
    verifyNull(EmModelValidator.l1Point(Dict[,]))
  }

  Void test_validateMeter_virtualNeedsFormula() {
    v := meter("m-v", "缺口", "s-1", "elec", "virtual", null, ["emVirtual": Marker.val])
    issues := EmModelValidator.validate(v, EmNodeKind.meter, null, Dict[,])
    verify(hasCode(issues, "meter.virtual.noFormula"))
    // 虚表没有 L1 点是正常的，不该报 l1.missing
    verifyFalse(hasCode(issues, "meter.l1.missing"), "虚表没有采集点，不该要求 L1")

    v2 := meter("m-v2", "缺口", "s-1", "elec", "virtual", null,
                ["emVirtual": Marker.val, "emFormula": "emMeterRead(@m-gw)"])
    verifyFalse(EmModelValidator.hasErrors(
      EmModelValidator.validate(v2, EmNodeKind.meter, null, Dict[,])))
  }

  Void test_validateMeter_subItemOnlyForElec() {
    w := meter("m-w", "水表", "s-1", "water", "sub", null,
               ["emSubItem": "b1", "emMaxReading": Number(9999f)])
    issues := EmModelValidator.validate(w, EmNodeKind.meter, null, [l1Pt])
    verify(hasCode(issues, "meter.subItem.nonElec"), "分项计量口径只对电有效")
    verifyFalse(EmModelValidator.hasErrors(issues), "这是 warn 不是 err")

    bad := meter("m-e", "电表", "s-1", "elec", "sub", null, ["emSubItem": "z9"])
    verify(hasCode(EmModelValidator.validate(bad, EmNodeKind.meter, null, [l1Pt]),
                   "meter.subItem.invalid"))
  }

  Void test_validateMeter_warnsOnMissingMaxReading() {
    m := meter("m-1", "总表", "s-1", "elec", "main")
    issues := EmModelValidator.validate(m, EmNodeKind.meter, null, [l1Pt])
    verify(hasCode(issues, "meter.maxReading.missing"),
      "没有 emMaxReading，翻转区间会被判负增量丢弃")
    verifyFalse(EmModelValidator.hasErrors(issues), "这是 warn，不阻断")
  }

  Void test_validateMeter_cleanMeterHasNoErrors() {
    m := meter("m-1", "关口表", "s-1", "elec", "gateway", null, [
      "emMaxReading": Number(99999f),
      "emMeterFactor": Number(200f),
      "emSettlement": Marker.val,
    ])
    issues := EmModelValidator.validate(m, EmNodeKind.meter, null, [l1Pt])
    verifyFalse(EmModelValidator.hasErrors(issues), "配置完备的表不该报 err：" + issues)
  }

//////////////////////////////////////////////////////////////////////////
// 逐实体校验 · 用能设备（铁律 5）
//////////////////////////////////////////////////////////////////////////

  Void test_validateLoad_mustBeOnExistingEquip() {
    // 铁律 5：EmLoad 是挂在既有 equip 上的能耗身份，不是新建设备
    notEquip := rec("e-1", "冷机", ["emLoad": Marker.val, "emSubItem": "b1",
                                   "emRatedPower": Number(75f)])
    verify(hasCode(EmModelValidator.validate(notEquip, EmNodeKind.load), "load.notEquip"))
  }

  Void test_validateLoad_needsMeterOrWeight() {
    // 既没有独立计量也没有分摊权重 → 这台设备的用能既算不出也摊不到
    orphan := rec("e-1", "冷机", ["equip": Marker.val, "emLoad": Marker.val,
                                 "emSubItem": "b1"])
    issues := EmModelValidator.validate(orphan, EmNodeKind.load)
    verify(hasCode(issues, "load.weight.missing"))
    verify(EmModelValidator.hasErrors(issues))

    metered := load("e-2", "冷机", "s-1", ["emMeterRef": Ref("m-b1"),
                                          "emRatedPower": Remove.val])
    verifyFalse(hasCode(EmModelValidator.validate(metered, EmNodeKind.load),
                        "load.weight.missing"))
  }

  Void test_validateLoad_warnsOnMissingSubItem() {
    l := rec("e-1", "冷机", ["equip": Marker.val, "emLoad": Marker.val,
                            "emRatedPower": Number(75f)])
    issues := EmModelValidator.validate(l, EmNodeKind.load)
    verify(hasCode(issues, "load.subItem.missing"), "没有分项，这台设备在拆解里落不进任何一格")
    verifyFalse(EmModelValidator.hasErrors(issues))
  }

//////////////////////////////////////////////////////////////////////////
// 表具台账：通信状态判定与采集器识别
//////////////////////////////////////////////////////////////////////////

  private static Dict point(Str:Obj? tags) {
    m := Str:Obj?["id": Ref("p-1"), "point": Marker.val, "sensor": Marker.val,
                  "total": Marker.val, "emL1Point": Marker.val]
    tags.each |Obj? v, Str k| { m[k] = v }
    return Etc.makeDict(m)
  }

  Void test_commStatus_virtualIsNotOffline() {
    // 虚表没有采集通道。把它算成"离线"会让每个项目的离线数天然大于 0，
    // 运维就不会再认真看这个数了。
    verifyEq(EmMeterInventory.commStatus(true, null), EmMeterInventory.statusVirtual)
    verifyFalse(EmMeterInventory.offlineStatuses.contains(EmMeterInventory.statusVirtual))
  }

  Void test_commStatus_noPointVsUnbound() {
    // 完全没有累积读数点 vs 有点位但没接采集通道 —— 两种问题，两种修法
    verifyEq(EmMeterInventory.commStatus(false, null), EmMeterInventory.statusNoPoint)
    verifyEq(EmMeterInventory.commStatus(false, point([:])), EmMeterInventory.statusUnbound)
    verifyEq(EmMeterInventory.commStatus(false, point(["bacnetConnRef": Ref("c-1")])),
             EmMeterInventory.statusStale)
  }

  Void test_commStatus_prefersCurStatus() {
    // 连接器写了 curStatus 就用它 —— 本库不自己判断"多久没数据算离线"，
    // 不同连接器的采集周期差几个数量级，自定阈值只会得出错误结论
    verifyEq(EmMeterInventory.commStatus(false, point(["curStatus": "ok"])), "ok")
    verifyEq(EmMeterInventory.commStatus(false, point(["curStatus": "down"])), "down")
    verifyEq(
      EmMeterInventory.commStatus(false, point(["curStatus": "fault", "modbusConnRef": Ref("c-1")])),
      "fault")
  }

  Void test_connRefOf_matchesAnyConnectorType() {
    // 按 *ConnRef 后缀找，新增一种连接器不用改代码
    verifyEq(EmMeterInventory.connRefOf(point(["bacnetConnRef": Ref("c-1")])), Ref("c-1"))
    verifyEq(EmMeterInventory.connRefOf(point(["modbusConnRef": Ref("c-2")])), Ref("c-2"))
    verifyEq(EmMeterInventory.connRefOf(point(["someFutureConnRef": Ref("c-9")])), Ref("c-9"))
    verifyNull(EmMeterInventory.connRefOf(point(["equipRef": Ref("m-1")])))
  }

  Void test_offlineStatuses_coverActionableOnly() {
    // 离线 = 需要运维介入的。stale（数据不新鲜）与 disabled（人工停用）不算 ——
    // 前者可能只是采集周期长，后者是有人主动关的
    verify(EmMeterInventory.offlineStatuses.contains(EmMeterInventory.statusDown))
    verify(EmMeterInventory.offlineStatuses.contains(EmMeterInventory.statusFault))
    verify(EmMeterInventory.offlineStatuses.contains(EmMeterInventory.statusNoPoint))
    verify(EmMeterInventory.offlineStatuses.contains(EmMeterInventory.statusUnbound))
    verifyFalse(EmMeterInventory.offlineStatuses.contains(EmMeterInventory.statusStale))
    verifyFalse(EmMeterInventory.offlineStatuses.contains(EmMeterInventory.statusDisabled))
  }

//////////////////////////////////////////////////////////////////////////
// @Axon 返回值的可序列化性
//
// 这一组测试守的是一个咬过人的坑：**Dict 的键是 Haystack 标签名，必须
// 小写开头**。@Axon 返回 Dict 时，Axon 会把它转成单行 Grid（键 → 列名），
// 大写开头的键在这一步抛 `Invalid col name`。而这一步发生在响应序列化
// 过程中，客户端收到的是被截断的 Zinc，报的是 "Could not find a value"，
// 与真正的原因毫无关系。
//////////////////////////////////////////////////////////////////////////

  Void test_emEnums_isSerializableGrid() {
    g := EnergyMatrixLib.emEnums
    verify(g.size >= 17, "附录 C 的 17 个枚举都该在")

    names := Str[,]
    g.each |Row r| {
      n := r["name"] as Str
      verifyNotNull(n, "每行都要有 name")
      names.add(n)
      vals := r["values"] as Str[]
      verifyNotNull(vals, "$n 缺少 values")
      verifyFalse(vals.isEmpty, "$n 的取值不能为空")
    }
    verify(names.contains("EmMedium"))
    verify(names.contains("EmWorkOrderStatus"))
  }

  ** 各 @Axon 返回 Dict 的键必须都是合法列名 —— 否则响应写不出去。
  Void test_axonDictKeysAreValidColNames() {
    samples := Dict[
      // 建模器
      EmModelValidator.issue("err", "x.y", "msg", "§1"),
      EmModelTree.flatten([site("s-1", "站点")]).first,
      // 统计验收
      EmStatsValidator.stats([1f, 2f, 3f, 4f], [1.1f, 2.1f, 2.9f, 4.2f]),
      // 缺口 / 读数
      Etc.makeDict(["meterRef": Ref("m-1"), "val": Number(1f), "emQuality": Number(1f),
                    "emDataSource": "measured", "emMedium": "elec"]),
    ]
    samples.each |Dict d, Int i| {
      // makeDictGrid 是 Axon 把返回 Dict 转成响应 Grid 时走的同一条路
      verifyNotNull(Etc.makeDictGrid(null, d), "样本 $i 无法转成 Grid")
    }
  }

  **
  ** 交叉表把**维度取值摊成列名**，所以列维度只能是枚举型。
  **
  ** 分项编码（a1/b1/d6）是合法列名，Ref 不是 —— 后者在 `Etc.makeDictsGrid`
  ** 构造阶段就抛 `Invalid col name`。`EmLedgerQuery.enumDims` 提前拦住它，
  ** 为的是报一个说得清的错，而不是让人对着
  ** `Could not find a value`（客户端读到截断的 Zinc 时的报错）猜半天。
  **
  Void test_crosstabColNames() {
    // 正例：分项编码当列名 —— 建 Grid 与 Zinc 往返都要过
    row := Etc.makeDict([
      "period": "D-20260901",
      "a1": Number(180f, Unit("kWh")), "b1": Number(260f, Unit("kWh")),
      "d6": Number(12f, Unit("kWh")),
      "val": Number(452f, Unit("kWh")), "emEntryCount": Number(3),
    ])
    g := Etc.makeDictsGrid(Etc.makeDict(["emCols": "b1,a1,d6"]), [row])
    back := ZincReader(ZincWriter.gridToStr(g).in).readGrid
    verifyEq(back.size, 1)
    verifyEq(back.first->b1, Number(260f, Unit("kWh")))
    verifyEq(back.meta->emCols, "b1,a1,d6")

    // 缺失分项也必须映射为合法列名；不能把 "<none>" 当 Grid col name。
    missingCol := EmLedgerQuery.enumColName(null)
    verifyEq(missingCol, "none")
    verifyNotNull(Etc.makeDictsGrid(null, [Etc.makeDict([
      "period": "D-20260901", missingCol: Number(1f, Unit("kWh"))])]))

    // 反例：Ref 当列名 —— 这正是 enumDims 守卫存在的理由
    verifyErr(ArgErr#) {
      Etc.makeDictsGrid(null, [Etc.makeDict([
        "period": "D-20260901", "@p:proj:r:2f8c-abcd": Number(1f)])])
    }

    // 守卫本身：只有 subItem / medium 可以当列维度
    verifyEq(EmLedgerQuery.enumDims.contains("subItem"), true)
    verifyEq(EmLedgerQuery.enumDims.contains("medium"), true)
    verifyEq(EmLedgerQuery.enumDims.contains("meter"), false)
    verifyEq(EmLedgerQuery.enumDims.contains("space"), false)
    verifyEq(EmLedgerQuery.enumDims.contains("tenant"), false)
    // 列维度必须是合法维度的子集，不然守卫会把合法用法也挡掉
    EmLedgerQuery.enumDims.each |Str d| {
      verifyNotNull(EmLedgerQuery.dimTags[d], "$d 不是合法维度")
    }
  }

//////////////////////////////////////////////////////////////////////////
// 规格文件映射
//////////////////////////////////////////////////////////////////////////

  Void test_specFileMapping() {
    verifyEq(EmModelBuilder.specFileOf(EmNodeKind.meter), "meters")
    verifyEq(EmModelBuilder.specFileOf(EmNodeKind.site), "spaces")
    verifyEq(EmModelBuilder.specFileOf(EmNodeKind.load), "loads")
  }

  Void test_specSource_rejectsPathTraversal() {
    // name 只允许字母数字下划线 —— 挡掉 ../ 与绝对路径
    verifyErr(ArgErr#) { EmModelBuilder.specSource("../../etc/passwd") }
    verifyErr(ArgErr#) { EmModelBuilder.specSource("tags/../../x") }
    verifyErr(ArgErr#) { EmModelBuilder.specSource("") }
  }

  **
  ** 模板里没有默认值的 `Arg("x")`，只有在工厂**保证一定会传**该参数时才安全。
  **
  ** 踩过的坑：`Etc.makeDict` 会丢掉值为 null 的键，所以"传了 null"和"没传"
  ** 在模板看来是同一回事。顶层组织的 parentRef 就是 null，于是
  ** `emAddTenant(null, ...)` 报 `Missing argument: Arg("parentId")`。
  ** 凡是可以为空的 Arg，都必须写成 `Arg("x:N")`。
  **
  Void test_templateArgsHaveDefaultsWhereOptional() {
    // 唯一一个父对象可空的模板
    tenant := EmModelBuilder.templateSource("EmTenant")
    verify(tenant.contains("Arg(\"parentId:N\")"),
      "EmTenant.trio 的 parentId 必须带默认值 —— 顶层组织没有上级")

    // 其余模板里无默认值的 Arg 只允许是 parentId（工厂必传站点）
    bad := Str[,]
    EmModelBuilder.templateFiles.each |Str name| {
      src := EmModelBuilder.templateSource(name)
      src.splitLines.each |Str line| {
        i := line.index("Arg(\"")
        if (i == null) return
        rest := line[(i + 5)..-1]
        j := rest.index("\"")
        if (j == null) return
        spec := rest[0..<j]
        if (spec.contains(":")) return          // 有默认值
        if (spec == "parentId") return          // 工厂必传
        bad.add("$name: Arg(\"$spec\")")
      }
    }
    verify(bad.isEmpty,
      "以下 Arg 既没有默认值、工厂又不保证会传：" + bad.join(", "))
  }

  ** 原生 NavPath 把 floor 放在 equip 之前；equip 的楼层必须是可选参数。
  Void test_equipTemplatesExposeOptionalFloorRef() {
    ["EmMeterBase", "EmVirtualMeter", "EmGapMeter", "EmLoad"].each |Str name| {
      src := EmModelBuilder.templateSource(name)
      verify(src.contains("floorRef:Arg(\"floorRef:N\")"),
        "$name 必须声明可选 floorRef，站级设备留空")
    }
  }

  ** 模板层：Walk 在 makeFromTrio 构造时就硬解析 —— equip 没有楼层直接抛 Err。
  ** 所以"无楼层建表"在创建层就被 withFloor 拒掉（ArgErr），根本到不了模板层。
  ** 已实测（2026-09-18 冒烟）：带楼层建表后点位自动带 equip 的楼层。
  Void test_pointFloorRefIsWalkToEquipFloor() {
    withFloor := ModelEntityEmElecMeter.makeFromTrio(
      Ref("s-1"), "Submeter", Etc.makeDict([
        "emMeterRole": "sub", "floorRef": Ref("f-1")]))
    floorEquip := withFloor.modelAsDicts.find |Dict rec->Bool| { rec.has("equip") }
    verifyEq(floorEquip["floorRef"], Ref("f-1"))
    points := withFloor.modelAsDicts.findAll |Dict rec->Bool| { rec.has("point") }
    verify(!points.isEmpty)
    points.each |Dict point| { verifyEq(point["floorRef"], Ref("f-1")) }
    verifyErr(Err#) {
      m := ModelEntityEmElecMeter.makeFromTrio(
        Ref("s-1"), "Gateway", Etc.makeDict1("emMeterRole", "gateway")) }
  }
  ** point 必须通过 Walk 继承 equip 的楼层（结构红线：点位必备 floorRef）。
  Void test_pointTemplatesInheritOptionalFloorRef() {
    missing := Str[,]
    EmModelBuilder.templateFiles.each |Str name| {
      lines := EmModelBuilder.templateSource(name).splitLines
      siteWalks := lines.findAll |Str line -> Bool| {
        line.trim == "siteRef:Walk(\"equipRef>siteRef\")"
      }.size
      if (siteWalks == 0) return
      floorWalks := lines.findAll |Str line -> Bool| {
        line.trim == "floorRef:Walk(\"equipRef>floorRef\")"
      }.size
      // 每个声明了 siteRef Walk 的 point 都必须有对应的 floorRef Walk。
      if (floorWalks < siteWalks) missing.add("$name ($floorWalks/$siteWalks)")
    }
    verify(missing.isEmpty,
      "以下 point 没有通过 Walk 继承楼层：" + missing.join(", "))
  }

  Void test_specSource_readsPodFile() {
    // 规格文件随 pod 打包（build.fan resDirs 有 res/spec/em/）
    src := EmModelBuilder.specSource("tags")
    verify(src.contains("EmMeterRole"), "tags.xeto 应含计量角色枚举")
    verify(EmModelBuilder.specFiles.contains("meters"))
    verify(EmModelBuilder.specFiles.size >= 14, "附录 A 的 14 个 xeto 文件都该在 pod 里")
  }
}
