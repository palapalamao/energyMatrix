using haystack

** Pure tests for floor ownership resolution used by meter/load creation and edit.
class EmFloorResolverTest : HaystackTest
{
  private static Dict rec(Str id, Str:Obj? tags) {
    m := Str:Obj?["id": Ref(id)]
    tags.each |Obj? v, Str k| { m[k] = v }
    return Etc.makeDict(m)
  }

  private static Func lookup(Dict[] recs) {
    return |Ref id->Dict?| { recs.find |Dict r->Bool| { r.id == id } }
  }

  private static const Ref site := Ref("s-1")
  private static const Ref floor1 := Ref("f-1")
  private static const Ref floor2 := Ref("f-2")
  private static const Ref zone1 := Ref("z-1")

  private static Dict[] validRefs() {
    return [
      rec("f-1", ["floor": Marker.val, "siteRef": site]),
      rec("f-2", ["floor": Marker.val, "siteRef": site]),
      rec("z-1", ["emZone": Marker.val, "siteRef": site, "floorRef": floor1]),
    ]
  }

  Void test_explicitFloorIsAccepted() {
    args := Etc.makeDict(["floorRef": floor1])
    out := EmFloorResolver.resolve(site, args, lookup(validRefs))
    verifyEq(out["floorRef"], floor1)
  }

  Void test_floorIsDerivedFromSpace() {
    args := Etc.makeDict(["emSpaceRef": zone1])
    out := EmFloorResolver.resolve(site, args, lookup(validRefs))
    verifyEq(out["floorRef"], floor1)
  }

  Void test_noOwnershipKeepsSiteLevel() {
    args := Etc.makeDict(["emMeterRole": "gateway"])
    out := EmFloorResolver.resolve(site, args, lookup(validRefs))
    verifyNull(out["floorRef"])
    verifyEq(out["emMeterRole"], "gateway")
  }

  Void test_rejectsInvalidAndCrossSiteFloor() {
    verifyErr(ArgErr#) {
      EmFloorResolver.resolve(site, Etc.makeDict(["floorRef": zone1]), lookup(validRefs))
    }

    foreign := rec("f-x", ["floor": Marker.val, "siteRef": Ref("s-2")])
    verifyErr(ArgErr#) {
      EmFloorResolver.resolve(site, Etc.makeDict(["floorRef": foreign.id]), lookup([foreign]))
    }
  }

  Void test_rejectsExplicitDerivedConflict() {
    args := Etc.makeDict(["floorRef": floor2, "emSpaceRef": zone1])
    verifyErr(ArgErr#) { EmFloorResolver.resolve(site, args, lookup(validRefs)) }
  }

  Void test_explicitRemoveIsPreservedForEdit() {
    args := Etc.makeDict(["floorRef": Remove.val, "emSpaceRef": zone1])
    out := EmFloorResolver.resolve(site, args, lookup(validRefs), true)
    verify(out["floorRef"] is Remove)
  }
}
