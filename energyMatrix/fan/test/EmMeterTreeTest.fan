using haystack

**
** 计量树构建与校验的单元测试（说明书铁律 2）。
**
** 用 `HaystackTest` 而不是 `FinProjTest`：`EmMeterTreeBuilder` 是纯函数，
** 输入一批 Dict 就能跑，不需要真 Folio、不需要 @DbTest、也不需要等
** Ext.onStart 的异步就绪。
**
** 运行：<fin>/bin/fant energyMatrix::EmMeterTreeTest
**
class EmMeterTreeTest : HaystackTest
{
  private static Dict meter(Str id, Str dis, Str medium, Str role, Str? parent := null,
                            Str:Obj? extra := Str:Obj?[:]) {
    tags := Str:Obj?[:]
    tags["id"]           = Ref(id, dis)
    tags["dis"]          = dis
    tags["energyMatrix"] = Marker.val
    tags["equip"]        = Marker.val
    tags["meter"]        = Marker.val
    tags["emMedium"]     = medium
    tags["emMeterRole"]  = role
    if (parent != null) tags["submeterOf"] = Ref(parent)
    extra.each |Obj? v, Str k| { tags[k] = v }
    return Etc.makeDict(tags)
  }

  private static Bool hasCode(Dict[] issues, Str code) {
    found := false
    issues.each |Dict i| { if (i["code"] == code) found = true }
    return found
  }

//////////////////////////////////////////////////////////////////////////
// 正常树
//////////////////////////////////////////////////////////////////////////

  Void test_build_normalTree() {
    recs := [
      meter("m-gw",  "关口表",   "elec", "gateway"),
      meter("m-b1",  "冷热站",   "elec", "branch", "m-gw"),
      meter("m-a1",  "照明",     "elec", "branch", "m-gw"),
      meter("m-b1a", "1号冷机",  "elec", "sub",    "m-b1"),
    ]
    res := EmMeterTreeBuilder.build(recs)

    verifyEq(res.all.size, 4)
    verifyEq(res.roots.size, 1)
    verifyEq(res.roots.first.dis, "关口表")
    verifyFalse(res.hasErrors, "正常树不应有 err：" + res.issues)

    gw := res.roots.first
    verifyEq(gw.children.size, 2)
    // children 按 dis 排序，结果不随查询顺序漂移
    verifyEq(gw.children.first.dis, "冷热站")
    verifyEq(gw.depth, 0)

    b1 := res.node(Ref("m-b1"))
    verifyNotNull(b1)
    verifyEq(b1.depth, 1)
    verifyEq(b1.children.size, 1)
    verifyEq(res.node(Ref("m-b1a")).depth, 2)
  }

//////////////////////////////////////////////////////////////////////////
// 铁律 2：DAG —— 环必须被检出并就地剪断
//////////////////////////////////////////////////////////////////////////

  Void test_build_detectsCycle() {
    // a → b → c → a
    recs := [
      meter("m-a", "A", "elec", "main",   "m-c"),
      meter("m-b", "B", "elec", "branch", "m-a"),
      meter("m-c", "C", "elec", "branch", "m-b"),
    ]
    res := EmMeterTreeBuilder.build(recs)

    verify(res.hasErrors, "环应该被判为 err")
    verify(hasCode(res.issues, "meter.cycle"), "应有 meter.cycle：" + res.issues)
    // 环被剪断后仍然要能算出根，否则下游递归会无限循环
    verify(res.roots.size >= 1, "剪断后应至少有一个根")
    // 深度计算不会挂死
    res.all.each |EmMeterNode n| { verify(n.depth < 64) }
  }

  Void test_build_detectsSelfReference() {
    recs := [ meter("m-a", "A", "elec", "main", "m-a") ]
    res := EmMeterTreeBuilder.build(recs)
    verify(hasCode(res.issues, "meter.parent.self"), "自引用应被检出")
    verifyEq(res.roots.size, 1)
  }

  Void test_build_detectsDanglingParent() {
    recs := [ meter("m-a", "A", "elec", "sub", "m-missing") ]
    res := EmMeterTreeBuilder.build(recs)
    verify(hasCode(res.issues, "meter.parent.dangling"), "悬挂父引用应被检出")
    // 悬挂后当作根处理，不能因此丢掉这块表
    verifyEq(res.roots.size, 1)
  }

//////////////////////////////////////////////////////////////////////////
// 铁律 2：禁止跨介质挂接
//////////////////////////////////////////////////////////////////////////

  Void test_build_rejectsCrossMediumParent() {
    recs := [
      meter("m-e", "电总表", "elec",  "main"),
      meter("m-w", "水表",   "water", "sub", "m-e"),   // 水表挂在电表下
    ]
    res := EmMeterTreeBuilder.build(recs)
    verify(hasCode(res.issues, "meter.medium.mismatch"), "跨介质挂接应被检出：" + res.issues)
  }

  Void test_build_flagsUnknownMedium() {
    // 既没有 emMedium 也没有可推断的标记
    bare := Etc.makeDict([
      "id": Ref("m-x"), "dis": "未知表", "energyMatrix": Marker.val,
      "equip": Marker.val, "meter": Marker.val, "emMeterRole": "sub",
    ])
    res := EmMeterTreeBuilder.build([bare])
    verify(hasCode(res.issues, "meter.medium.unknown"))
  }

//////////////////////////////////////////////////////////////////////////
// 角色语义：check 表不参与汇总
//////////////////////////////////////////////////////////////////////////

  Void test_summableChildren_excludesCheckMeters() {
    recs := [
      meter("m-main", "总表",   "elec", "main"),
      meter("m-s1",   "子表1",  "elec", "sub",    "m-main"),
      meter("m-s2",   "子表2",  "elec", "sub",    "m-main"),
      meter("m-ck",   "考核表", "elec", "check",  "m-main"),
    ]
    res := EmMeterTreeBuilder.build(recs)
    main := res.node(Ref("m-main"))

    verifyEq(main.children.size, 3, "考核表仍然是子节点（树里看得见）")
    verifyEq(main.summableChildren.size, 2, "但不参与汇总，否则就是重复计量")

    // 汇总回调只应被两个子表调用
    sum := EmMeterTree.sumChildren(main) |EmMeterNode n -> Number?| {
      return Number(100f, Unit("kWh"))
    }
    verifyEq(sum.toFloat, 200f)
  }

  Void test_summableChildren_excludesGapMeter() {
    // 缺口表按 submeterOf 挂在源表下（计量树里能看见），但它是"余量"而不是
    // 一块被计量的回路：计入汇总会让 Σ子表 恒等于父表（缺口永远 0），
    // 而且缺口公式本身要调 emSubMeterSum，计入就是无限递归。
    recs := [
      meter("m-gw", "关口表", "elec", "gateway"),
      meter("m-s1", "子表1",  "elec", "sub", "m-gw"),
      meter("m-gap", "缺口", "elec", "virtual", "m-gw",
            ["emVirtual": Marker.val, "emGap": Marker.val,
             "emFormula": "emMeterRead(@m-gw) - emSubMeterSum(@m-gw)"]),
    ]
    res := EmMeterTreeBuilder.build(recs)
    gw := res.node(Ref("m-gw"))

    verifyEq(gw.children.size, 2, "缺口表仍然挂在树上")
    verifyEq(gw.summableChildren.size, 1, "但不参与汇总")
    verifyEq(gw.summableChildren.first.dis, "子表1")
  }

  Void test_role_defaultsToSub() {
    bare := Etc.makeDict([
      "id": Ref("m-y"), "dis": "无角色表", "meter": Marker.val, "emMedium": "elec",
    ])
    verifyEq(EmMeterRole.of(bare), EmMeterRole.sub, "角色缺失应回退到最保守的 sub")
    verifyEq(EmMeterRole.of(Etc.makeDict1("emMeterRole", "bogus")), EmMeterRole.sub)
    verify(EmMeterRole.countsTowardSum(EmMeterRole.sub))
    verifyFalse(EmMeterRole.countsTowardSum(EmMeterRole.check))
    verify(EmMeterRole.isAuthoritative(EmMeterRole.gateway))
    verifyFalse(EmMeterRole.isAuthoritative(EmMeterRole.main))
  }

//////////////////////////////////////////////////////////////////////////
// 虚表与关口表
//////////////////////////////////////////////////////////////////////////

  Void test_build_virtualMeterNeedsFormula() {
    noFormula := meter("m-v", "虚表", "elec", "virtual", null,
                       ["emVirtual": Marker.val])
    withFormula := meter("m-v2", "虚表2", "elec", "virtual", null,
                       ["emVirtual": Marker.val, "emFormula": "emMeterRead(@m-gw)"])

    verify(hasCode(EmMeterTreeBuilder.build([noFormula]).issues, "meter.virtual.noFormula"))
    verifyFalse(hasCode(EmMeterTreeBuilder.build([withFormula]).issues, "meter.virtual.noFormula"))
  }

  Void test_build_warnsOnMultipleGateways() {
    recs := [
      meter("m-g1", "关口1", "elec", "gateway"),
      meter("m-g2", "关口2", "elec", "gateway"),
    ]
    res := EmMeterTreeBuilder.build(recs)
    verify(hasCode(res.issues, "meter.gateway.multiple"), "同介质多关口表应告警")
    // 只是 warn，不阻断
    verifyFalse(res.hasErrors)
  }

//////////////////////////////////////////////////////////////////////////
// 介质推断
//////////////////////////////////////////////////////////////////////////

  Void test_medium_inferenceOrder() {
    // 冷/热量表本身也带 water，必须先判 chilled/hot 否则会被误判成水表
    cool := Etc.makeDict(["chilled": Marker.val, "water": Marker.val, "meter": Marker.val])
    heat := Etc.makeDict(["hot": Marker.val, "water": Marker.val, "meter": Marker.val])
    water := Etc.makeDict(["water": Marker.val, "meter": Marker.val])

    verifyEq(EmMedium.of(cool),  EmMedium.cool)
    verifyEq(EmMedium.of(heat),  EmMedium.heat)
    verifyEq(EmMedium.of(water), EmMedium.water)

    // 显式标签优先于推断
    verifyEq(EmMedium.of(Etc.makeDict(["emMedium": "gas", "elec": Marker.val])), EmMedium.gas)
    // 非法显式值不回退到推断 —— 宁可判不出，也不猜
    verifyNull(EmMedium.of(Etc.makeDict(["emMedium": "bogus", "elec": Marker.val])))
    verifyEq(EmMedium.unit(EmMedium.elec), "kWh")
    verifyEq(EmMedium.unit(EmMedium.water), "m³")
  }
}
