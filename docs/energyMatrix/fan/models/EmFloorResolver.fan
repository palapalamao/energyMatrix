using haystack

**
** Resolves the optional floor ancestor shared by native FIN navigation.
**
** This class is pure: record access is supplied by `lookup`, which keeps the
** validation deterministic in tests and lets runtime callers use Folio.
**
class EmFloorResolver
{
  **
  ** Return args with a validated/derived floorRef.
  **
  ** Explicit floorRef wins. When it is absent, emSpaceRef may contribute its
  ** floorRef. If both are present they must agree. `allowRemove` is used by the
  ** editor so an operator may deliberately remove a floor assignment.
  **
  static Dict resolve(Ref siteRef, Dict args, Func lookup, Bool allowRemove := false) {
    rawFloor := args["floorRef"]
    if (rawFloor is Remove) {
      if (allowRemove) return args
      throw ArgErr("floorRef 不能在创建参数中使用 Remove")
    }

    explicit := refArg(rawFloor, "floorRef")
    derived := Ref?[,]

    spaceRef := refArg(args["emSpaceRef"], "emSpaceRef")
    if (spaceRef != null) {
      space := lookup.call(spaceRef) as Dict
      if (space == null) throw ArgErr("emSpaceRef 指向的记录不存在：" + spaceRef.toCode)
      assertSameSite("emSpaceRef", spaceRef, siteRef, space)
      sf := space["floorRef"] as Ref
      if (sf != null) derived.add(sf)
    }

    floorRef := explicit ?: derived.first
    if (explicit != null && !derived.isEmpty && explicit != derived.first) {
      throw ArgErr("floorRef " + explicit.toCode + " 与 emSpaceRef 推导的楼层 " +
        derived.first.toCode + " 冲突")
    }
    if (floorRef == null) return args

    floor := lookup.call(floorRef) as Dict
    if (floor == null) throw ArgErr("floorRef 指向的记录不存在：" + floorRef.toCode)
    if (floor.missing("floor")) throw ArgErr("floorRef 必须指向 floor：" + floorRef.toCode)
    assertSameSite("floorRef", floorRef, siteRef, floor)
    return Etc.dictSet(args, "floorRef", floorRef)
  }

  private static Ref? refArg(Obj? val, Str name) {
    if (val == null || val is Remove) return null
    ref := val as Ref
    if (ref == null) throw ArgErr("$name 必须是 Ref")
    return ref
  }

  private static Void assertSameSite(Str tag, Ref ref, Ref siteRef, Dict rec) {
    actual := rec["siteRef"] as Ref
    if (actual != siteRef) {
      throw ArgErr("$tag " + ref.toCode + " 不属于目标站点 " + siteRef.toCode)
    }
  }
}
