using folio
using haystack
using skyarc
using skyarcd

**
** 能耗台账构建 —— Layer 1 与 Layer 2 之间**唯一**的数据通道（说明书 §2.1）。
**
** L2 delta 点是"读数"，台账是"账目"。两者之间必须有一层不可变的事实表，
** 否则数据修正无法回溯、账单无法审计。`EmLedgerEntry` 承担这个角色。
**
** 本类只做三件事：
**   1. 对每块表调 `EmMeterConsumption`（物理表 / 虚拟表同构，铁律 3）
**   2. 组装条目并过 `EmDataSourceGuard`（铁律 1 + 铁律 4）
**   3. 幂等写库：同一 (表, 账期键) 已有条目则更新；已关账则跳过（铁律 7）
**
** **不做**的事：不摊余量（那是 `EmAllocEngine` 在有 `EmAllocRule` 时才能做）、
** 不填补缺失（那是 estimated，需要人工决策）、不关账（那是审计动作）。
**
class EmLedgerBuilder
{
  new make(Context cx) { this.cx = cx }

  Context cx

  private static const Str src := "EmLedgerBuilder"

//////////////////////////////////////////////////////////////////////////
// 单条组装
//////////////////////////////////////////////////////////////////////////

  **
  ** 为一块表在一个账期组装台账条目（**不写库**）。
  **
  ** 返回的 Dict 已经过 `EmDataSourceGuard.checkEntry`，可以直接 commit。
  ** 用量算不出（`val == null`）时返回 null —— 宁可缺一条，也不写一条 0。
  **
  Dict? entryFor(Ref meterRef, Span span, Str granularity, Int seq := 1) {
    meter := cx.proj.readById(meterRef, true)
    if (meter.missing("meter")) {
      throw ArgErr("禁止裸点入账：" + meterRef.toCode + " 不是 meter（铁律 1）")
    }

    cons := EmMeterConsumption(cx).of(meterRef, span)
    val := cons["val"] as Number
    if (val == null) {
      EnergyMatrixExt.logDebug(src,
        "跳过 " + meterRef.toCode + " @ " + EmLedgerPeriod.key(span, granularity) + "：用量不可计算")
      return null
    }

    medium := cons["emMedium"] as Str
    tags := Str:Obj?[:]
    tags["energyMatrix"]  = Marker.val
    tags["emLedger"]      = Marker.val
    tags["dis"]           = EmLedgerPeriod.code(span, seq)
    tags["emMeterRef"]    = meterRef
    tags["emMedium"]      = medium
    tags["span"]          = span
    tags["emPeriod"]      = EmLedgerPeriod.key(span, granularity)
    tags["emGranularity"] = granularity
    tags["val"]           = val
    tags["emDataSource"]  = cons["emDataSource"]
    tags["emQuality"]     = cons["emQuality"]
    tags["siteRef"]       = meter["siteRef"]
    subItem := EmSubItem.of(meter, medium)
    if (subItem != null) tags["emSubItem"] = subItem
    if (meter.has("emSynthetic")) tags["emSynthetic"] = Marker.val
    if (meter["emDataProvenance"] != null) tags["emDataProvenance"] = meter["emDataProvenance"]
    if (meter["emSpaceRef"] != null) tags["emSpaceRef"] = meter["emSpaceRef"]
    if (meter["emTenantRef"] != null) tags["emTenantRef"] = meter["emTenantRef"]
    if (meter["emOrgRef"] != null) tags["emOrgRef"] = meter["emOrgRef"]

    entry := Etc.makeDict(tags)
    EmDataSourceGuard.checkEntry(entry)
    return entry
  }

//////////////////////////////////////////////////////////////////////////
// 幂等写库
//////////////////////////////////////////////////////////////////////////

  ** 查已有条目（同表 + 同账期键 + 非红冲）。
  Dict? existing(Ref meterRef, Str periodKey) {
    cx.proj.read("emLedger and not emReversalOf and emMeterRef==" + meterRef.toCode +
                 " and emPeriod==" + periodKey.toCode, false)
  }

  **
  ** 写入一条台账条目：已存在则更新，已关账则跳过。
  ** 返回条目 id；跳过时返回 null。
  **
  Ref? commitEntry(Dict entry) {
    EmDataSourceGuard.checkEntry(entry)
    meterRef := entry["emMeterRef"] as Ref
    period   := entry["emPeriod"] as Str
    old := existing(meterRef, period)

    if (old == null) {
      tags := Etc.dictToMap(entry)
      d := cx.proj.commit(Diff.makeAdd(tags))
      return d.newRec.id
    }

    if (old.has("emClosed")) {
      EnergyMatrixExt.logWarn(src,
        "条目已关账，跳过重建：" + (old["dis"] ?: old.id.toCode) +
        "；如需修正请走红冲 emReverseLedgerEntry（铁律 7）")
      return null
    }

    changes := Etc.dictToMap(entry)
    changes.remove("dis")   // 保留原编码，避免重建时流水号漂移
    cx.proj.commit(Diff(old, Etc.makeDict(changes)))
    return old.id
  }

//////////////////////////////////////////////////////////////////////////
// 批量构建
//////////////////////////////////////////////////////////////////////////

  **
  ** 为一个站点的全部表计在给定账期构建台账。
  **
  ** 账期按 granularity 切分成子区间逐个落库（说明书 OI-01 的默认取舍是
  ** daily 落库），所以传一个整月的 span + daily 会生成当月每天的条目。
  **
  ** 返回 Grid，列：meterRef, emPeriod, val, emDataSource, emQuality, status。
  ** status ∈ written | skipped | error。**逐表独立 try/catch**：一块表配置
  ** 有问题不能让整站的台账构建失败。
  **
  Grid build(Ref siteRef, Span span, Str granularity := EmGranularity.defaultGranularity) {
    if (!EmGranularity.isValid(granularity)) throw ArgErr("未知粒度：$granularity")

    tree := EmMeterTree(cx).tree(siteRef)
    spans := EmGranularity.split(span, granularity)
    rows := Dict[,]
    seq := seqStart(span)

    EnergyMatrixExt.logInfo(src,
      "build site=" + siteRef.toCode + " span=$span granularity=$granularity " +
      "meters=" + tree.all.size + " periods=" + spans.size)

    tree.all.each |EmMeterNode n| {
      spans.each |Span s| {
        try {
          entry := entryFor(n.id, s, granularity, seq)
          if (entry == null) {
            rows.add(row(n.id, EmLedgerPeriod.key(s, granularity), null, null, null, "skipped"))
            return
          }
          id := commitEntry(entry)
          seq++
          rows.add(row(n.id, entry["emPeriod"] as Str, entry["val"] as Number,
                       entry["emDataSource"] as Str, entry["emQuality"] as Number,
                       id == null ? "skipped" : "written"))
        } catch (Err e) {
          EnergyMatrixExt.logErr(src, "台账构建失败 " + n.dis + " @ " + s, e)
          rows.add(row(n.id, EmLedgerPeriod.key(s, granularity), null, null, null, "error"))
        }
      }
    }

    return Etc.makeDictsGrid(null, rows)
  }

  ** 本月已有条目数 + 1，作为流水号起点，保证编码在同月内不重复。
  private Int seqStart(Span span) {
    prefix := EmLedgerPeriod.code(span, 1)[0..-5]   // "L-2607-0001" → "L-2607-"
    n := cx.proj.readAllList("emLedger and dis").findAll |Dict d -> Bool| {
      dis := d["dis"] as Str
      return dis != null && dis.startsWith(prefix)
    }.size
    return n + 1
  }

  private static Dict row(Ref meterRef, Str? period, Number? val, Str? source,
                          Number? quality, Str status) {
    Etc.makeDict([
      "meterRef":     meterRef,
      "emPeriod":     period,
      "val":          val,
      "emDataSource": source,
      "emQuality":    quality,
      "status":       status,
    ])
  }
}
