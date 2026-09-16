using folio
using haystack
using skyarc
using skyarcd

**
** 碳资产（域 10）。
**
** 核心是说明书 §4.7 那条设计取舍：
**
** > 电网排放因子逐年更新。若碳账实时引用最新因子，历史数据会随因子换版
** > 整体漂移，与已披露的报告对不上。因此 `EmCarbonAccount` 在账期结算时
** > 将本期使用的因子版本以 `emFactorRefs` 快照锁定。
**
** 已实现：因子版本解析与快照锁定、Scope 1/2/3 归集、抵消量核销、碳目标进度。
** 未实现：Scope 3 的上游数据采集（目前只有显式标了 `emScope: "scope3"`
** 的因子会归到 Scope 3，没有独立的供应链口径）。
**
** 三条约束落在代码里：
**   - 碳账只读台账（`EmLedgerQuery`），不得直读点位（铁律 6）
**   - 因子缺 `emSourceDoc` 不允许生效（铁律 8，`EmParamVersionGuard`）
**   - 绿电/绿证/CCER 仅在 `emRetired`（已注销核销）后方可用于抵消
**
class EmCarbonService
{
  new make(Context cx) { this.cx = cx }

  Context cx

  private static const Str src := "EmCarbonService"

  **
  ** 解析某介质在某年的排放因子。已实现。
  **
  ** 优先匹配区域（`emRegion`），退到 national。同区域同年份有多个版本时
  ** 报错而不是随便挑一个 —— 碳排数字要能对得上已披露的报告。
  **
  Dict? resolveFactor(Str medium, Int year, Str? region := null, Bool checked := true) {
    filter := "emEmissionFactor and emMedium==" + medium.toCode +
              " and emYear==" + year
    all := cx.proj.readAllList(filter)

    hits := Dict[,]
    if (region != null) {
      all.each |Dict f| { if (f["emRegion"] == region) hits.add(f) }
    }
    if (hits.isEmpty) {
      all.each |Dict f| {
        r := f["emRegion"] as Str
        if (r == null || r == "national") hits.add(f)
      }
    }

    if (hits.isEmpty) {
      if (checked) throw UnknownRecErr("介质 $medium 在 $year 年没有排放因子" +
        (region == null ? "" : "（区域 $region）"))
      return null
    }
    if (hits.size > 1) {
      throw ArgErr("介质 $medium / $year 年 / 区域 " + (region ?: "national") +
        " 命中 " + hits.size + " 个排放因子版本，无法确定口径；请清理重复记录")
    }

    f := hits.first
    EmParamVersionGuard.check(f)   // 铁律 8：缺 emSourceDoc 不允许生效
    return f
  }

  **
  ** 锁定本期使用的因子版本（快照）。已实现。
  **
  ** 在账期结算时把用到的因子记录打上 `emLocked`（此后只读），并把它们的 id
  ** 收进碳账的 `emFactorRefs`。因子换版时历史碳账不再漂移。
  **
  Ref[] lockFactors(Dict[] factors) {
    refs := Ref[,]
    diffs := Diff[,]
    factors.each |Dict f| {
      refs.add(f.id)
      if (f.missing("emLocked")) {
        diffs.add(Diff(f, Etc.makeDict1("emLocked", Marker.val)))
      }
    }
    if (!diffs.isEmpty) {
      cx.proj.commitAll(diffs)
      EnergyMatrixExt.logInfo(src, "锁定 " + diffs.size + " 个排放因子版本")
    }
    return refs
  }

  **
  ** 抵消资格检查。已实现 —— 绿电/绿证/CCER 只有注销核销后才能抵消。
  **
  static Void assertRetired(Dict cert) {
    if (cert.missing("emRetired")) {
      throw ArgErr("绿证 " + ((cert["emCertNo"] as Str) ?: cert.id.toCode) +
        " 尚未注销核销（缺 emRetired），不得用于抵消（说明书 §4.7）")
    }
  }

  **
  ** 折标煤合计（综合能耗，说明书 §4.6 的能耗总量控制口径）。
  **
  ** 折标煤系数 `emCoalFactor`（kgce/单位）挂在排放因子记录上 —— 它和排放因子
  ** 是同一套版本化参数，共用 `emSourceDoc` 与年份，不另立一套。
  **
  ** 形状与 `buildAccount` 一致：**逐介质明细在 rows，合计在 meta**。
  ** 不返回"Dict 里套一个 Grid" —— Zinc 的嵌套栅格是个粗糙地带，
  ** 而这里根本不需要嵌套。
  **
  ** rows：emMedium / usage / emCoalFactor / val（该介质的 tce）
  ** meta：val（合计 tce）、unit、emYear、emMissing
  **
  ** `emMissing`（**没有折标煤系数的介质**）必须显示：水没有折标煤系数是对的
  ** （水不计入综合能耗），但某个介质因为参数没录而缺席，和它本来就不该计入，
  ** 在数字上是同一个结果 —— 不列出来就分不清。
  **
  Grid coalEquivalent(Ref subjectRef, Span span) {
    year := span.start.date.year
    subject := cx.proj.readById(subjectRef, false)
    region := subject == null ? null : subject["emRegion"] as Str

    total := 0f
    rows := Dict[,]
    missing := Str[,]

    EmLedgerQuery(cx).aggregate(subjectRef, span, "medium").each |Dict d| {
      medium := d["medium"] as Str
      if (medium == null) return
      usage := d["val"] as Number
      if (usage == null) return

      f := resolveFactor(medium, year, region, false)
      coal := f == null ? null : f["emCoalFactor"] as Number
      if (coal == null) { missing.add(medium); return }

      tce := usage.toFloat * coal.toFloat / 1000f      // kgce → tce
      total = total + tce
      rows.add(Etc.makeDict([
        "emMedium":      medium,
        "usage":         usage,
        "emCoalFactor":  coal,
        "val":           Number(tce),
      ]))
    }

    return Etc.makeDictsGrid(Etc.makeDict([
      "emSubjectRef": subjectRef,
      "emYear":       Number(year),
      "val":          Number(total),
      "unit":         "tce",
      "emMissing":    missing.join(","),
    ]), rows)
  }

  **
  ** 生成碳账。已实现 —— Σ(台账用量 × 因子)，按 `emScope` 归集。
  **
  ** 每介质一行，列：emMedium、emScope、val（用量）、emFactor、emFactorUnit、
  ** emEmission（排放量）、emFactorRef、emQualityMin。
  ** Grid meta 携带：emScope1 / emScope2 / emScope3 / emTotal / emOffset / emNet /
  ** emFactorRefs（版本快照）/ emYear / emRegion / emUnit / emMissing（缺因子的介质）。
  **
  ** 三条约束落在代码里：
  **   - 用量只从 `EmLedgerQuery.aggregate` 取，不碰点位（铁律 6）
  **   - 因子经 `resolveFactor` → `EmParamVersionGuard`，缺 emSourceDoc 直接拒（铁律 8）
  **   - 抵消只认已注销核销的绿证（`assertRetired`）
  **
  ** `lock` 为 true 时把用到的因子打上 `emLocked` —— 账期结算才这么做，
  ** 平时查看碳账不应该产生副作用。
  **
  Grid buildAccount(Ref subjectRef, Span span, Bool lock := false) {
    subject := cx.proj.readById(subjectRef, true)
    if (subject.missing("site")) {
      throw ArgErr("碳账目前只支持站点口径：" + subjectRef.toCode +
        " 不是 site（子对象的碳账需要先确定分摊规则，见域 6）")
    }

    year   := span.start.date.year
    region := subject["emRegion"] as Str

    rows    := Dict[,]
    factors := Dict[,]
    missing := Str[,]
    scope   := Str:Float[:]
    EmScope.all.each |Str s| { scope[s] = 0f }
    massUnit := (Str?)null

    EmLedgerQuery(cx).aggregate(subjectRef, span, "medium").each |Dict d| {
      // 聚合结果的列名就是维度名本身（dim="medium"），不是 emMedium 标签名
      medium := d["medium"] as Str
      if (medium == null) return
      usage := d["val"] as Number
      if (usage == null) return

      f := resolveFactor(medium, year, region, false)
      if (f == null) { missing.add(medium); return }

      factorVal := f["emFactor"] as Number
      factorUnit := f["emFactorUnit"] as Str
      if (factorVal == null || factorUnit == null) {
        throw ArgErr("排放因子 " + f.id.toCode + " 缺 emFactor 或 emFactorUnit —— " +
          "没有单位的因子无法确认量纲，拒绝参与核算")
      }

      parts := factorUnit.split('/')
      if (parts.size != 2) {
        throw ArgErr("emFactorUnit 必须写成 <质量单位>/<用量单位>（如 kgCO2e/kWh），" +
          "当前是：$factorUnit")
      }
      mass := parts[0]; per := parts[1]

      // 因子分母必须和台账用量单位一致。不做自动换算：kWh 与 MWh 差 1000 倍，
      // 猜错一次整份碳报告就作废，不如在这里停下来让人把因子录对。
      usageUnit := usage.unit?.symbol ?: usage.unit?.name
      if (usageUnit != null && usageUnit != per) {
        throw ArgErr("介质 $medium 的因子单位是 $factorUnit，但台账用量单位是 " +
          "$usageUnit —— 分母对不上，请改因子记录（本系统不做单位自动换算）")
      }
      if (massUnit == null) massUnit = mass
      else if (massUnit != mass) {
        throw ArgErr("排放因子的质量单位不统一（$massUnit vs $mass）—— " +
          "同一份碳账里必须用同一个量纲")
      }

      emission := usage.toFloat * factorVal.toFloat
      sc := (f["emScope"] as Str) ?: EmScope.ofMedium(medium)
      if (!EmScope.isValid(sc)) {
        throw ArgErr("排放因子 " + f.id.toCode + " 的 emScope 非法：$sc")
      }
      scope[sc] = scope[sc] + emission
      factors.add(f)

      rows.add(Etc.makeDict([
        "emMedium":     medium,
        "emScope":      sc,
        "val":          usage,
        "emFactor":     factorVal,
        "emFactorUnit": factorUnit,
        "emFactorRef":  f.id,
        "emEmission":   Number(emission),
        "emQualityMin": d["emQualityMin"],
      ]))
    }

    total  := scope[EmScope.scope1] + scope[EmScope.scope2] + scope[EmScope.scope3]
    offset := offsetOf(subjectRef, year, region)
    factorRefs := Ref[,]
    if (lock) factorRefs = lockFactors(factors)
    else      factors.each |Dict f| { factorRefs.add(f.id) }

    if (!missing.isEmpty) {
      EnergyMatrixExt.logWarn(src, "碳账缺因子：" + missing.join("、") + "（$year 年）")
    }

    return Etc.makeDictsGrid(Etc.makeDict([
      "emSubjectRef": subjectRef,
      "emYear":       Number(year),
      "emRegion":     region ?: "national",
      "emUnit":       massUnit ?: "kgCO2e",
      "emScope1":     Number(scope[EmScope.scope1]),
      "emScope2":     Number(scope[EmScope.scope2]),
      "emScope3":     Number(scope[EmScope.scope3]),
      "emTotal":      Number(total),
      "emOffset":     Number(offset),
      "emNet":        Number(total - offset),
      "emFactorRefs": factorRefs,
      "emLocked":     lock ? Marker.val : null,
      "emMissing":    missing.join(","),
    ]), rows)
  }

  **
  ** 本年度可用的抵消量。只认已注销核销（`emRetired`）的绿证。
  **
  ** 绿证记的是绿电电量（`val`，kWh），换成排放量要乘当年的电网因子 ——
  ** 用的是**同一个**因子版本，所以抵消量和 Scope 2 永远同口径。
  **
  private Float offsetOf(Ref subjectRef, Int year, Str? region) {
    certs := cx.proj.readAllList("emGreenCert and emSubjectRef==" + subjectRef.toCode)
    if (certs.isEmpty) return 0f

    elecFactor := resolveFactor(EmMedium.elec, year, region, false)
    if (elecFactor == null) return 0f
    fv := (elecFactor["emFactor"] as Number)?.toFloat
    if (fv == null) return 0f

    sum := 0f
    certs.each |Dict c| {
      v := (c["emVintage"] as Number)?.toInt
      if (v != null && v != year) return
      assertRetired(c)              // 未注销的直接抛，不静默跳过
      kwh := (c["val"] as Number)?.toFloat
      if (kwh != null) sum = sum + kwh * fv
    }
    return sum
  }

  **
  ** 碳目标进度。已实现。
  **
  ** 总量型比 `emNet`，强度型比 `emNet / area` —— 两种口径**永不混用**：
  ** 面积扩了强度会降但总量在涨，用错口径能把一个不达标的项目说成达标。
  **
  ** 返回 Dict：emTargetType、emBaseValue、emTargetValue、cur、progress、
  ** onTrack、emUnit。progress = (基准 − 当前) / (基准 − 目标)。
  **
  Dict targetProgress(Ref targetRef, Span span) {
    target := cx.proj.readById(targetRef, true)
    type := target["emTargetType"] as Str
    if (type != "absolute" && type != "intensity") {
      throw ArgErr("碳目标 " + targetRef.toCode + " 的 emTargetType 非法：$type")
    }
    subjectRef := target["emSubjectRef"] as Ref
    if (subjectRef == null) throw ArgErr("碳目标 " + targetRef.toCode + " 缺 emSubjectRef")

    acct := buildAccount(subjectRef, span)
    net := (acct.meta["emNet"] as Number)?.toFloat ?: 0f

    unit := (acct.meta["emUnit"] as Str) ?: "kgCO2e"
    cur := net
    if (type == "intensity") {
      area := (cx.proj.readById(subjectRef, true)["area"] as Number)?.toFloat
      if (area == null || area <= 0f) {
        throw ArgErr("强度型碳目标需要被评价对象的 area，" + subjectRef.toCode + " 没有")
      }
      cur = net / area
      unit = unit + "/m²"
    }

    base := (target["emBaseValue"] as Number)?.toFloat
    goal := (target["emTargetValue"] as Number)?.toFloat
    progress := (Float?)null
    if (base != null && goal != null && base != goal) {
      progress = (base - cur) / (base - goal)
    }

    return Etc.makeDict([
      "emTargetRef":   targetRef,
      "emSubjectRef":  subjectRef,
      "emTargetType":  type,
      "emBaseValue":   target["emBaseValue"],
      "emTargetValue": target["emTargetValue"],
      "emTargetYear":  target["emTargetYear"],
      "cur":           Number(cur),
      "emUnit":        unit,
      "progress":      progress == null ? null : Number(progress),
      "onTrack":       progress == null ? null : (progress >= 1f),
    ])
  }
}

**
** 温室气体核算范围（说明书 §4.7）。
**
const class EmScope
{
  ** 直接排放：燃气 / 柴油 / 冷媒泄漏。
  static const Str scope1 := "scope1"
  ** 间接排放：外购电力 / 热力 / 冷量。
  static const Str scope2 := "scope2"
  ** 其他间接排放。
  static const Str scope3 := "scope3"

  static const Str[] all := [scope1, scope2, scope3]

  static Bool isValid(Str? s) { s != null && all.contains(s) }

  ** 介质的默认核算范围。燃料燃烧在本建筑内 → Scope 1；外购能源 → Scope 2。
  static Str ofMedium(Str medium) {
    if (medium == EmMedium.gas)    return scope1
    if (medium == EmMedium.diesel) return scope1
    if (medium == EmMedium.coal)   return scope1
    return scope2
  }
}
