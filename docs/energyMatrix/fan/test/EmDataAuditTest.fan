using haystack

** Pure structural tests for the read-only energyMatrix data audit.
class EmDataAuditTest : HaystackTest
{
  private static Dict rec(Str id, Str dis, Str:Obj? tags) {
    m := Str:Obj?["id": Ref(id, dis), "dis": dis, "energyMatrix": Marker.val]
    tags.each |Obj? v, Str k| { m[k] = v }
    return Etc.makeDict(m)
  }

  private static Dict site() {
    rec("s-1", "Demo", ["site": Marker.val, "emSynthetic": Marker.val,
      "emDataProvenance": "emDemoBuild"])
  }

  private static Bool hasCode(Dict[] issues, Str code) {
    issues.any |Dict issue->Bool| { issue["code"] == code }
  }

  private static Bool hasError(Dict[] issues) {
    issues.any |Dict issue->Bool| { issue["severity"] == "error" }
  }

  Void test_validMixedFloorAndSiteModelHasNoErrors() {
    f := rec("f-1", "1F", ["floor": Marker.val, "siteRef": Ref("s-1"),
      "emSynthetic": Marker.val, "emDataProvenance": "emDemoBuild"])
    floorMeter := rec("m-1", "1F Meter", ["equip": Marker.val, "meter": Marker.val,
      "siteRef": Ref("s-1"), "floorRef": f.id, "emMedium": "elec",
      "emSynthetic": Marker.val, "emDataProvenance": "emDemoBuild"])
    floorPoint := rec("p-1", "Total", ["point": Marker.val, "equipRef": floorMeter.id,
      "siteRef": Ref("s-1"), "floorRef": f.id, "emL1Point": Marker.val,
      "his": Marker.val, "hisSize": Number(10f), "unit": "kWh",
      "emSynthetic": Marker.val, "emDataProvenance": "emDemoBuild"])
    siteMeter := rec("m-2", "Gateway", ["equip": Marker.val, "meter": Marker.val,
      "siteRef": Ref("s-1"), "emMedium": "elec", "emSynthetic": Marker.val,
      "emDataProvenance": "emDemoBuild"])
    sitePoint := rec("p-2", "Total", ["point": Marker.val, "equipRef": siteMeter.id,
      "siteRef": Ref("s-1"), "emL1Point": Marker.val, "his": Marker.val,
      "hisSize": Number(10f), "unit": "kWh", "emSynthetic": Marker.val,
      "emDataProvenance": "emDemoBuild"])
    ledger := rec("l-1", "Ledger", ["emLedger": Marker.val, "siteRef": Ref("s-1"),
      "emSynthetic": Marker.val, "emDataProvenance": "emDemoBuild"])

    verifyFalse(hasError(EmDataAudit.inspect([site, f, floorMeter, floorPoint,
      siteMeter, sitePoint, ledger])))
  }

  Void test_detectsPointFloorMismatchAndDanglingEquip() {
    f := rec("f-1", "1F", ["floor": Marker.val, "siteRef": Ref("s-1")])
    m := rec("m-1", "Meter", ["equip": Marker.val, "meter": Marker.val,
      "siteRef": Ref("s-1"), "floorRef": f.id, "emMedium": "elec"])
    mismatch := rec("p-1", "Bad Floor", ["point": Marker.val, "equipRef": m.id,
      "siteRef": Ref("s-1"), "emL1Point": Marker.val, "his": Marker.val])
    dangling := rec("p-2", "Orphan", ["point": Marker.val,
      "equipRef": Ref("missing"), "siteRef": Ref("s-1")])
    issues := EmDataAudit.inspect([site, f, m, mismatch, dangling])
    verify(hasCode(issues, "nav.point.floorMismatch"))
    verify(hasCode(issues, "point.equipRef.dangling"))
  }

  Void test_detectsMissingAndMultipleL1Points() {
    missing := rec("m-1", "Missing", ["equip": Marker.val, "meter": Marker.val,
      "siteRef": Ref("s-1"), "emMedium": "elec"])
    multiple := rec("m-2", "Multiple", ["equip": Marker.val, "meter": Marker.val,
      "siteRef": Ref("s-1"), "emMedium": "elec"])
    p1 := rec("p-1", "A", ["point": Marker.val, "equipRef": multiple.id,
      "siteRef": Ref("s-1"), "emL1Point": Marker.val])
    p2 := rec("p-2", "B", ["point": Marker.val, "equipRef": multiple.id,
      "siteRef": Ref("s-1"), "emL1Point": Marker.val])
    issues := EmDataAudit.inspect([site, missing, multiple, p1, p2])
    verify(hasCode(issues, "meter.l1.missing"))
    verify(hasCode(issues, "meter.l1.multiple"))
  }

  Void test_detectsSyntheticProvenanceAndGapUnitProblems() {
    gap := rec("m-g", "Gap", ["equip": Marker.val, "meter": Marker.val,
      "emVirtual": Marker.val, "emGap": Marker.val, "siteRef": Ref("s-1"),
      "emMedium": "water", "emSynthetic": Marker.val])
    point := rec("p-g", "Gap Delta", ["point": Marker.val, "emDelta": Marker.val,
      "equipRef": gap.id, "siteRef": Ref("s-1"), "emSynthetic": Marker.val])
    issues := EmDataAudit.inspect([site, gap, point])
    verify(hasCode(issues, "synthetic.provenanceMissing"))
    verify(hasCode(issues, "point.gap.unitMissing"))
  }

  Void test_detectsStaleAndReversedHistory() {
    meter := rec("m-1", "Meter", ["equip": Marker.val, "meter": Marker.val,
      "siteRef": Ref("s-1"), "emMedium": "elec"])
    point := rec("p-1", "Total", ["point": Marker.val, "equipRef": meter.id,
      "siteRef": Ref("s-1"), "emL1Point": Marker.val, "his": Marker.val,
      "hisSize": Number(10f), "hisStart": DateTime.now - 1hr,
      "hisEnd": DateTime.now - 2hr, "unit": "kWh"])
    issues := EmDataAudit.inspect([site, meter, point])
    verify(hasCode(issues, "history.stale"))
    verify(hasCode(issues, "history.order.invalid"))
  }
}
