using folio
using haystack
using skyarc
using skyarcd

**
** 红冲机制（说明书 §5.3）—— 已关账条目的**唯一**修改路径。
**
** 铁律 7：台账关账后不可变。发现错误时新增一条数值相反的红冲条目，通过
** `emReversalOf` 指向原条目，再录入正确条目。三条记录共同构成完整的修正链，
** 任何时点的账目状态均可复现：
**
**   L-2607-0151   M-C1-01   +96,400 kWh   estimated   完好率 64.1%   -> 已红冲
**   L-2607-0152   M-C1-01   -96,400 kWh   estimated   红冲条目
**   L-2607-0153   M-C1-01   +92,000 kWh   measured    补采后重录
**
** 红冲与重录条目不打 `emClosed` —— 它们是关账后的修正，会在下一次关账时
** 一并冻结。这样"某账期在某时点的余额"可以按 emClosed + 修正链复原。
**
class EmReversal
{
  new make(Context cx) { this.cx = cx }

  Context cx

  private static const Str src := "EmReversal"

  **
  ** 红冲一条条目。返回新建的红冲条目 id。
  **
  ** reason 必填 —— 一条没有原因的红冲在审计时等于没有红冲。
  **
  Ref reverse(Ref entryId, Str reason) {
    if (reason.trim.isEmpty) throw ArgErr("红冲必须填写原因（reason）")

    orig := cx.proj.readById(entryId, true)
    if (orig.missing("emLedger")) throw ArgErr(entryId.toCode + " 不是台账条目")
    if (orig.has("emReversalOf")) throw ArgErr("不能红冲一条红冲条目：" + (orig["dis"] ?: entryId.toCode))

    already := cx.proj.read("emLedger and emReversalOf==" + entryId.toCode, false)
    if (already != null) {
      throw ArgErr("该条目已被红冲：" + (already["dis"] ?: already.id.toCode))
    }

    val := orig["val"] as Number
    if (val == null) throw ArgErr("原条目缺少 val，无法红冲")

    span := orig["span"] as Span
    seq := nextSeq(span)

    tags := Etc.dictToMap(orig)
    tags.remove("id")
    tags.remove("mod")
    tags.remove("emClosed")           // 红冲条目本身未关账
    tags["dis"]          = EmLedgerPeriod.code(span, seq)
    tags["val"]          = Number(-val.toFloat, val.unit)
    tags["emReversalOf"] = entryId
    tags["emNote"]       = reason

    entry := Etc.makeDict(tags)
    EmDataSourceGuard.checkEntry(entry)
    d := cx.proj.commit(Diff.makeAdd(entry))

    EnergyMatrixExt.logInfo(src,
      "红冲 " + (orig["dis"] ?: entryId.toCode) + " → " + tags["dis"] + "：" + reason)
    return d.newRec.id
  }

  **
  ** 完整修正：红冲原条目 + 录入正确条目。返回 Grid（三行：原条目 / 红冲 / 重录）。
  **
  ** newDataSource 必须显式给 —— 补采后重录是 measured，人工核定是 manual，
  ** 两者的可结算 / 可披露性不同，不能沿用原条目的等级蒙混过关。
  **
  Grid correct(Ref entryId, Number newVal, Str newDataSource, Str reason,
               Number? newQuality := null)
  {
    if (!EmDataSource.isValid(newDataSource)) {
      throw ArgErr("emDataSource 非法：$newDataSource（合法值 " + EmDataSource.all.join("|") + "）")
    }

    orig := cx.proj.readById(entryId, true)
    revId := reverse(entryId, reason)

    span := orig["span"] as Span
    seq := nextSeq(span)

    tags := Etc.dictToMap(orig)
    tags.remove("id")
    tags.remove("mod")
    tags.remove("emClosed")
    tags["dis"]          = EmLedgerPeriod.code(span, seq)
    tags["val"]          = newVal
    tags["emDataSource"] = newDataSource
    tags["emQuality"]    = newQuality
    tags["emNote"]       = "重录（红冲 " + (orig["dis"] ?: entryId.toCode) + "）：" + reason
    tags["emCorrects"]   = entryId

    entry := Etc.makeDict(tags)
    EmDataSourceGuard.checkEntry(entry)
    d := cx.proj.commit(Diff.makeAdd(entry))

    EnergyMatrixExt.logInfo(src,
      "重录 " + tags["dis"] + " val=" + newVal + " source=" + newDataSource)

    return chain(entryId)
  }

  **
  ** 一条条目的完整修正链：原条目 → 红冲条目 → 重录条目。
  ** 列：dis, val, emDataSource, emQuality, emNote, emReversalOf, emCorrects, emClosed。
  **
  Grid chain(Ref entryId) {
    rows := Dict[,]
    orig := cx.proj.readById(entryId, false)
    if (orig != null) rows.add(orig)
    cx.proj.readAllList("emLedger and emReversalOf==" + entryId.toCode).each |Dict d| { rows.add(d) }
    cx.proj.readAllList("emLedger and emCorrects==" + entryId.toCode).each |Dict d| { rows.add(d) }
    return Etc.makeDictsGrid(null, rows)
  }

  ** 同月流水号：已有条目数 + 1。
  private Int nextSeq(Span span) {
    prefix := EmLedgerPeriod.code(span, 1)[0..-5]
    n := cx.proj.readAllList("emLedger and dis").findAll |Dict d -> Bool| {
      dis := d["dis"] as Str
      return dis != null && dis.startsWith(prefix)
    }.size
    return n + 1
  }
}
