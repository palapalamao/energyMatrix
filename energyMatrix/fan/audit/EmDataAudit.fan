using haystack
using skyarc
using skyarcd

**
** energyMatrix data integrity audit.
**
** `inspect` is deliberately pure so its rules can be tested without a live project.
** `run` is the bounded, read-only FIN facade: it reads only the requested site and
** records scoped to that site (directly or through emSubjectRef).
**
const class EmDataAudit
{
  ** Inspect an in-memory record set and return stable, operator-facing issues.
  static Dict[] inspect(Dict[] recs) {
    issues := Dict[,]
    byId := Ref:Dict[:]
    recs.each |Dict rec| {
      byId[rec.id] = rec
    }

    sites  := recs.findAll |Dict rec->Bool| { rec.has("site") }
    points := recs.findAll |Dict rec->Bool| { rec.has("point") }
    meters := recs.findAll |Dict rec->Bool| { rec.has("meter") }

    // Any explicit floorRef must resolve to a floor in the same site.
    recs.each |Dict rec| {
      floorRef := rec["floorRef"] as Ref
      if (floorRef == null) return
      floor := byId[floorRef]
      if (floor == null) {
        issues.add(issue("error", "nav.floorRef.dangling", rec,
          "floorRef points to a record outside this site or to a missing record",
          "Set floorRef to a floor in the same site, or remove it for site-level equipment"))
      } else if (!floor.has("floor")) {
        issues.add(issue("error", "nav.floorRef.notFloor", rec,
          "floorRef does not point to a floor record",
          "Set floorRef to a valid floor record"))
      } else if (!sameRef(rec["siteRef"], floor["siteRef"])) {
        issues.add(issue("error", "nav.floorRef.crossSite", rec,
          "floorRef belongs to a different site",
          "Use a floor from the record's site"))
      }
    }

    // Native FIN navigation depends on point -> equip plus matching site/floor ancestry.
    points.each |Dict point| {
      equipRef := point["equipRef"] as Ref
      equip := equipRef == null ? null : byId[equipRef]
      if (equipRef == null) {
        issues.add(issue("error", "point.equipRef.missing", point,
          "Point has no equipRef", "Set equipRef to its owning equipment"))
        return
      }
      if (equip == null) {
        issues.add(issue("error", "point.equipRef.dangling", point,
          "equipRef points to a record outside this site or to a missing record",
          "Set equipRef to an equipment record in this site"))
        return
      }
      if (!equip.has("equip")) {
        issues.add(issue("error", "point.equipRef.notEquip", point,
          "equipRef does not point to an equip record",
          "Set equipRef to a valid equipment record"))
        return
      }
      if (!sameRef(point["siteRef"], equip["siteRef"])) {
        issues.add(issue("error", "nav.point.siteMismatch", point,
          "Point siteRef does not match its equipment siteRef",
          "Copy siteRef from the owning equipment"))
      }
      if (!sameRef(point["floorRef"], equip["floorRef"])) {
        issues.add(issue("error", "nav.point.floorMismatch", point,
          "Point floorRef does not match its equipment floorRef",
          "Copy floorRef from the owning equipment; remove both for site-level equipment"))
      }
    }

    // Every physical meter must expose exactly one authoritative cumulative point.
    meters.each |Dict meter| {
      if (meter.has("emVirtual")) return
      l1 := points.findAll |Dict point->Bool| {
        sameRef(point["equipRef"], meter.id) && point.has("emL1Point")
      }
      if (l1.isEmpty) {
        issues.add(issue("error", "meter.l1.missing", meter,
          "Physical meter has no emL1Point", "Create or tag exactly one cumulative history point"))
      } else if (l1.size > 1) {
        issues.add(issue("error", "meter.l1.multiple", meter,
          "Physical meter has multiple emL1Point records",
          "Keep emL1Point only on the authoritative cumulative point"))
      }
      l1.each |Dict point| {
        if (!point.has("his")) {
          issues.add(issue("error", "history.marker.missing", point,
            "The authoritative cumulative point is not historized",
            "Enable history and confirm samples are being stored"))
        }
        hisSize := point["hisSize"] as Number
        if (hisSize != null && hisSize.toFloat <= 0f) {
          issues.add(issue("error", "history.empty", point,
            "History verification reports zero samples",
            "Import or collect samples, then run the audit again"))
        }
        hisStart := point["hisStart"] as DateTime
        hisEnd := point["hisEnd"] as DateTime
        if (hisSize != null && hisSize.toFloat > 0f && hisEnd == null) {
          issues.add(issue("warning", "history.end.missing", point,
            "History contains samples but has no hisEnd metadata",
            "Read the point history and refresh history metadata"))
        }
        if (hisEnd != null && hisEnd < DateTime.now - 1hr) {
          issues.add(issue("error", "history.stale", point,
            "Latest history sample is older than the last completed hour",
            "Restore collection or refresh the synthetic history"))
        }
        if (hisStart != null && hisEnd != null && hisStart > hisEnd) {
          issues.add(issue("error", "history.order.invalid", point,
            "hisStart is later than hisEnd",
            "Repair or reimport the point history and metadata"))
        }
      }
    }

    l1Points := points.findAll |Dict point->Bool| { point.has("emL1Point") }
    if (!l1Points.isEmpty && l1Points.all |Dict point->Bool| { point["hisSize"] == null }) {
      issues.add(issue("info", "history.verification.unavailable", null,
        "History sample counts were not supplied to the structural audit",
        "Run emDataAudit in FIN to verify live history availability"))
    }

    // Gap delta points must carry the medium's engineering unit.
    points.each |Dict point| {
      equipRef := point["equipRef"] as Ref
      equip := equipRef == null ? null : byId[equipRef]
      if (equip != null && equip.has("emGap") && point.has("emDelta") && point["unit"] == null) {
        issues.add(issue("error", "point.gap.unitMissing", point,
          "Gap delta point has no unit", "Set the unit derived from the meter's emMedium"))
      }
    }

    // Synthetic/demo data must always be distinguishable from operational data.
    recs.each |Dict rec| {
      provenance := rec["emDataProvenance"] as Str
      if (rec.has("emSynthetic") && provenance == null) {
        issues.add(issue("error", "synthetic.provenanceMissing", rec,
          "Synthetic record has no emDataProvenance",
          "Set emDataProvenance to the generator or import identifier"))
      }
      if (provenance == "emDemoBuild" && !rec.has("emSynthetic")) {
        issues.add(issue("error", "synthetic.markerMissing", rec,
          "Demo-generated record is missing emSynthetic",
          "Add emSynthetic or correct emDataProvenance"))
      }
    }
    sites.each |Dict site| {
      if (!site.has("emSynthetic")) return
      siteId := site.id
      recs.each |Dict rec| {
        if (rec.id == siteId) return
        scoped := sameRef(rec["siteRef"], siteId) || sameRef(rec["emSubjectRef"], siteId)
        if (scoped && (!rec.has("emSynthetic") || rec["emDataProvenance"] == null)) {
          issues.add(issue("error", "synthetic.child.unlabeled", rec,
            "Record under a synthetic site is not fully provenance-labelled",
            "Add emSynthetic and emDataProvenance to the record"))
        }
      }
      hasLedger := recs.any |Dict rec->Bool| {
        rec.has("emLedger") && (sameRef(rec["siteRef"], siteId) || sameRef(rec["emSubjectRef"], siteId))
      }
      if (!hasLedger) {
        issues.add(issue("warning", "business.ledger.missing", site,
          "Synthetic site has no ledger output",
          "Build the demo ledger after history generation succeeds"))
      }
    }

    // Reuse the canonical meter-tree rules for cycles, bad parents and media conflicts.
    EmMeterTreeBuilder.build(meters).issues.each |Dict treeIssue| {
      meterRef := treeIssue["meterRef"] as Ref
      issues.add(issue(treeIssue["level"] == "err" ? "error" : "warning",
        (treeIssue["code"] as Str) ?: "meter.tree",
        meterRef == null ? null : byId[meterRef],
        (treeIssue["msg"] as Str) ?: "Meter tree validation failed",
        "Correct the meter hierarchy, then rerun the audit"))
    }
    return issues
  }

  ** Run the audit against one FIN site without changing any record or history.
  static Grid run(Context cx, Ref siteRef) {
    site := cx.proj.readById(siteRef, true)
    if (site == null || !site.has("site")) throw ArgErr("Not a site: " + siteRef.toCode)

    byId := Ref:Dict[:]
    byId[siteRef] = site
    filters := [
      "siteRef==" + siteRef.toCode,
      "emSubjectRef==" + siteRef.toCode,
    ]
    filters.each |Str filter| {
      cx.proj.readAllList(filter).each |Dict rec| { byId[rec.id] = rec }
    }

    // Pull directly referenced floors/equipment so dangling-vs-out-of-scope is explicit.
    refs := Ref[,]
    byId.vals.each |Dict rec| {
      floorRef := rec["floorRef"] as Ref
      equipRef := rec["equipRef"] as Ref
      if (floorRef != null && !byId.containsKey(floorRef)) refs.add(floorRef)
      if (equipRef != null && !byId.containsKey(equipRef)) refs.add(equipRef)
    }
    refs.unique.each |Ref id| {
      rec := cx.proj.readById(id, true)
      if (rec != null) byId[id] = rec
    }
    return Etc.makeDictsGrid(null, inspect(byId.vals))
  }

  private static Bool sameRef(Obj? a, Obj? b) {
    ar := a as Ref
    br := b as Ref
    return ar == null ? br == null : ar == br
  }

  private static Dict issue(Str severity, Str code, Dict? rec, Str message,
                            Str suggestedAction) {
    Etc.makeDict([
      "severity": severity,
      "code": code,
      "recRef": rec?.id,
      "dis": rec?.dis,
      "message": message,
      "suggestedAction": suggestedAction,
    ])
  }
}
