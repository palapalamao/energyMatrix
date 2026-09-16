using folio
using haystack
using skyarc
using skyarcd

**
** 关账事务与缺口率闸门（说明书 §5.2）。
**
** 关账是一次原子事务，执行顺序固定：
**   1. 冻结账期内的 L2 delta —— 骨架实现为**完整性检查**：账期内每块表的
**      每个子区间都必须已有台账条目，缺失清单直接返回。
**      （点位级的写保护需要 hisExt 的 write-protect，见 README 的 TODO。）
**   2. 执行全部生效的分摊规则，生成 allocated 条目
**   3. 计算缺口量与缺口率，写入 EmClosePeriod.emGapRatio
**   4. **缺口率超过阈值（默认 5%）时阻断关账**，返回未平衡的表计清单
**   5. 校核通过后为本期全部条目打 emClosed 标记，并写入关账批次记录
**
** 设计取舍（说明书原文）：缺口率阻断是**硬门槛**。目的是把计量方案的质量
** 问题挡在账目之外，而不是让它在报表里被平摊掉。宁可延迟关账，也不允许一份
** 内部不平衡的账目进入结算与披露链路。
**
class EmClosePeriod
{
  new make(Context cx) { this.cx = cx }

  Context cx

  private static const Str src := "EmClosePeriod"

  ** 关账结果状态（写在返回 Grid 的 meta 上）。
  static const Str statusClosed     := "closed"
  static const Str statusBlocked    := "blocked"
  static const Str statusIncomplete := "incomplete"
  static const Str statusAlready    := "alreadyClosed"
  static const Str statusDryRun     := "dryRun"

  **
  ** 执行关账。
  **
  ** threshold 为 null 时取站点记录上的 `emGapThreshold`，再退到
  ** `EnergyMatrixExt.defaultGapThreshold`（5%）。
  ** dryRun=true 时走完 1–4 步但不写 emClosed / 不写批次记录 —— UI 的
  ** 「关账预检」按钮用它。
  **
  ** 返回 Grid：
  **   meta  {status, emGapRatio, emThreshold, emEntryCount, span, siteRef, msg}
  **   rows  status=blocked/incomplete 时是问题清单；closed 时是各介质的缺口明细
  **
  Grid close(Ref siteRef, Span span, Str granularity := EmGranularity.defaultGranularity,
             Number? threshold := null, Bool dryRun := false)
  {
    if (!EmGranularity.isValid(granularity)) throw ArgErr("未知粒度：$granularity")
    periodKey := EmLedgerPeriod.key(span, granularity)
    limit := resolveThreshold(siteRef, threshold)

    EnergyMatrixExt.logInfo(src,
      "close site=" + siteRef.toCode + " period=$periodKey threshold=" + limit +
      (dryRun ? " (dryRun)" : ""))

    // ---- 0) 已关账则拒绝重复关账 ----
    old := findBatch(siteRef, periodKey)
    if (old != null && old.has("emClosed")) {
      return result(statusAlready, siteRef, span, null, limit, 0,
        "账期 $periodKey 已关账（批次 " + (old["dis"] ?: old.id.toCode) + "），不可重复关账", Dict[,])
    }

    // ---- 1) 完整性检查（冻结的前置条件）----
    missing := incompleteEntries(siteRef, span, granularity)
    if (!missing.isEmpty) {
      return result(statusIncomplete, siteRef, span, null, limit, 0,
        "账期内有 " + missing.size + " 个 (表, 子区间) 缺少台账条目，请先跑 emLedgerBuild",
        missing)
    }

    // ---- 2) 执行生效的分摊规则 ----
    allocRows := Dict[,]
    try {
      g := EmAllocEngine(cx).run(siteRef, span, granularity)
      g.each |Row r| { allocRows.add(r) }
    } catch (Err e) {
      EnergyMatrixExt.logErr(src, "分摊执行失败，关账中止", e)
      return result(statusBlocked, siteRef, span, null, limit, 0,
        "分摊规则执行失败：" + e.msg, Dict[,])
    }

    // ---- 3) 计算缺口率 ----
    gapGrid := EmGapCalc(cx).siteGaps(siteRef, span)
    gapRatio := EmGapCalc(cx).siteGapRatio(siteRef, span)

    // ---- 4) 闸门 ----
    if (isBlocked(gapRatio, limit)) {
      unbalanced := Dict[,]
      gapGrid.each |Row r| {
        rr := r["emGapRatio"] as Number
        if (rr != null && rr.toFloat.abs > limit.toFloat) unbalanced.add(r)
      }
      EnergyMatrixExt.logWarn(src,
        "关账被阻断：缺口率 " + pct(gapRatio) + " > 阈值 " + pct(limit))
      return result(statusBlocked, siteRef, span, gapRatio, limit, 0,
        "缺口率 " + pct(gapRatio) + " 超过阈值 " + pct(limit) + "，关账阻断（说明书 §5.2）",
        unbalanced)
    }

    entries := periodEntries(siteRef, span, granularity)

    if (dryRun) {
      return result(statusDryRun, siteRef, span, gapRatio, limit, entries.size,
        "预检通过：缺口率 " + pct(gapRatio) + "，可关账 " + entries.size + " 条",
        rowsOf(gapGrid))
    }

    // ---- 5) 打 emClosed + 写批次 ----
    now := DateTime.now
    who := cx.user.username
    diffs := Diff[,]
    entries.each |Dict e| { diffs.add(Diff(e, Etc.makeDict1("emClosed", Marker.val))) }
    if (!diffs.isEmpty) cx.proj.commitAll(diffs)

    writeBatch(old, siteRef, span, granularity, periodKey, gapRatio, entries.size, who, now)

    EnergyMatrixExt.logInfo(src,
      "closed $periodKey entries=" + entries.size + " gapRatio=" + pct(gapRatio) + " by=$who")

    return result(statusClosed, siteRef, span, gapRatio, limit, entries.size,
      "关账完成：" + entries.size + " 条条目已打 emClosed", rowsOf(gapGrid))
  }

//////////////////////////////////////////////////////////////////////////
// 闸门判据（纯函数，可单测）
//////////////////////////////////////////////////////////////////////////

  **
  ** 缺口率闸门：`|gapRatio| > threshold` 即阻断关账。
  **
  ** 抽成静态纯函数是为了能被单测钉死 —— 这是整个系统里唯一一处
  ** "把不合格的账挡在结算链之外"的硬门槛，边界行为不能靠人眼看代码保证。
  **
  ** 取绝对值：子表合计**大于**总表（负缺口）同样是计量方案有问题，
  ** 常见于表计重复计量或倍率配错，不能因为符号是负的就放行。
  **
  ** gapRatio 为 null（算不出缺口，例如根表没有子表）时**不阻断** ——
  ** 那是"无从校核"而不是"校核不通过"，由完整性检查那一步负责。
  **
  static Bool isBlocked(Number? gapRatio, Number threshold) {
    if (gapRatio == null) return false
    return gapRatio.toFloat.abs > threshold.toFloat
  }

//////////////////////////////////////////////////////////////////////////
// 步骤实现
//////////////////////////////////////////////////////////////////////////

  ** 账期内缺少条目的 (表, 子区间) 清单。
  Dict[] incompleteEntries(Ref siteRef, Span span, Str granularity) {
    tree := EmMeterTree(cx).tree(siteRef)
    spans := EmGranularity.split(span, granularity)
    out := Dict[,]
    tree.all.each |EmMeterNode n| {
      spans.each |Span s| {
        key := EmLedgerPeriod.key(s, granularity)
        hit := cx.proj.read("emLedger and not emReversalOf and emMeterRef==" + n.id.toCode +
                            " and emPeriod==" + key.toCode, false)
        if (hit == null) {
          out.add(Etc.makeDict([
            "meterRef": n.id,
            "dis":      n.dis,
            "emPeriod": key,
            "msg":      "缺少台账条目",
          ]))
        }
      }
    }
    return out
  }

  ** 账期内全部有效条目（含分摊生成的，不含红冲对）。
  Dict[] periodEntries(Ref siteRef, Span span, Str granularity) {
    keys := periodKeys(span, granularity)
    return cx.proj.readAllList("emLedger and siteRef==" + siteRef.toCode).findAll |Dict d -> Bool| {
      p := d["emPeriod"] as Str
      return p != null && keys.contains(p)
    }
  }

  ** All ledger period keys covered by the close span at the requested granularity.
  static Str[] periodKeys(Span span, Str granularity) {
    keys := Str[,]
    EmGranularity.split(span, granularity).each |Span s| {
      keys.add(EmLedgerPeriod.key(s, granularity))
    }
    return keys
  }

  ** 找该站点该账期的关账批次记录。
  Dict? findBatch(Ref siteRef, Str periodKey) {
    cx.proj.read("emClosePeriod and siteRef==" + siteRef.toCode +
                 " and emPeriod==" + periodKey.toCode, false)
  }

  private Void writeBatch(Dict? old, Ref siteRef, Span span, Str granularity, Str periodKey,
                          Number? gapRatio, Int count, Str who, DateTime now)
  {
    tags := Str:Obj?[:]
    tags["energyMatrix"]  = Marker.val
    tags["emClosePeriod"] = Marker.val
    tags["dis"]           = EmLedgerPeriod.closeCode(span)
    tags["siteRef"]       = siteRef
    tags["span"]          = span
    tags["emPeriod"]      = periodKey
    tags["emGranularity"] = granularity
    tags["emGapRatio"]    = gapRatio
    tags["emEntryCount"]  = Number(count)
    tags["emClosedBy"]    = who
    tags["emClosedAt"]    = now
    tags["emClosed"]      = Marker.val
    site := cx.proj.readById(siteRef, false)
    if (site != null) {
      if (site.has("emSynthetic")) tags["emSynthetic"] = Marker.val
      if (site["emDataProvenance"] != null) tags["emDataProvenance"] = site["emDataProvenance"]
    }
    d := Etc.makeDict(tags)
    if (old == null) cx.proj.commit(Diff.makeAdd(d))
    else             cx.proj.commit(Diff(old, d))
  }

//////////////////////////////////////////////////////////////////////////
// 辅助
//////////////////////////////////////////////////////////////////////////

  ** 阈值解析：显式参数 > 站点 emGapThreshold > Ext 默认 5%。
  Number resolveThreshold(Ref siteRef, Number? explicit) {
    if (explicit != null) return explicit
    site := cx.proj.readById(siteRef, false)
    fromSite := site == null ? null : site["emGapThreshold"] as Number
    if (fromSite != null) return fromSite
    return Number(EnergyMatrixExt.defaultGapThreshold)
  }

  private static Str pct(Number? n) {
    n == null ? "n/a" : ((n.toFloat * 1000f).round / 10f).toStr + "%"
  }

  private static Dict[] rowsOf(Grid g) {
    out := Dict[,]
    g.each |Row r| { out.add(r) }
    return out
  }

  private static Grid result(Str status, Ref siteRef, Span span, Number? gapRatio,
                             Number threshold, Int count, Str msg, Dict[] rows)
  {
    meta := Etc.makeDict([
      "status":       status,
      "ok":           status == statusClosed || status == statusDryRun,
      "siteRef":      siteRef,
      "span":         span,
      "emGapRatio":   gapRatio,
      "emThreshold":  threshold,
      "emEntryCount": Number(count),
      "msg":          msg,
    ])
    return Etc.makeDictsGrid(meta, rows)
  }
}
