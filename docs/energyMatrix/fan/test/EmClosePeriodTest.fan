using haystack

**
** 关账闸门、台账守卫与账期键的单元测试（说明书 §5.2 / §5.3 / 铁律 1·4·7）。
**
** 只测纯函数部分：闸门判据、条目校验、账期键与台账编码、账期切分。
** 需要真 Folio 的部分（关账事务本身、红冲写库）留给运行期验证 —— 见
** README「验证」一节的 emClosePeriod / emReverseLedgerEntry 手动跑通步骤。
**
** 运行：<fin>/bin/fant energyMatrix::EmClosePeriodTest
**
class EmClosePeriodTest : HaystackTest
{
  private static const TimeZone tz := TimeZone("Asia/Shanghai")

  private static Span span(Str startDate, Str endDate) {
    s := Span.makeAbs(Date.fromStr(startDate).midnight(tz), Date.fromStr(endDate).midnight(tz))
    if (s == null) throw ArgErr("bad span")
    return s
  }

//////////////////////////////////////////////////////////////////////////
// 缺口率闸门（说明书 §5.2 —— 硬门槛）
//////////////////////////////////////////////////////////////////////////

  Void test_gate_belowThresholdPasses() {
    limit := Number(0.05f)
    verifyFalse(EmClosePeriod.isBlocked(Number(0.049f), limit), "4.9% 应放行")
    verifyFalse(EmClosePeriod.isBlocked(Number(0.05f),  limit), "恰好等于阈值应放行")
    verifyFalse(EmClosePeriod.isBlocked(Number(0f),     limit))
  }

  Void test_gate_aboveThresholdBlocks() {
    limit := Number(0.05f)
    verify(EmClosePeriod.isBlocked(Number(0.051f), limit), "5.1% 必须阻断")
    verify(EmClosePeriod.isBlocked(Number(0.3f),   limit))
  }

  Void test_gate_negativeGapAlsoBlocks() {
    // 子表合计大于总表同样说明计量方案有问题（重复计量 / 倍率配错），
    // 不能因为符号是负的就放行
    limit := Number(0.05f)
    verify(EmClosePeriod.isBlocked(Number(-0.08f), limit), "负缺口超阈值同样阻断")
    verifyFalse(EmClosePeriod.isBlocked(Number(-0.02f), limit))
  }

  Void test_gate_nullGapDoesNotBlock() {
    // 算不出缺口是"无从校核"而不是"校核不通过"，由完整性检查那一步负责
    verifyFalse(EmClosePeriod.isBlocked(null, Number(0.05f)))
  }

//////////////////////////////////////////////////////////////////////////
// 铁律 7：已关账条目不可变
//////////////////////////////////////////////////////////////////////////

  Void test_guard_rejectsMutationOfClosedEntry() {
    closed := Etc.makeDict(["emLedger": Marker.val, "emClosed": Marker.val, "dis": "L-2607-0151"])
    open   := Etc.makeDict(["emLedger": Marker.val, "dis": "L-2607-0152"])

    verifyErr(ArgErr#) { EmDataSourceGuard.checkMutable(closed) }
    // 未关账的条目可以直接改
    EmDataSourceGuard.checkMutable(open)
  }

//////////////////////////////////////////////////////////////////////////
// 铁律 1 + 4：台账条目校验
//////////////////////////////////////////////////////////////////////////

  private static Dict entry(Str:Obj? overrides := Str:Obj?[:]) {
    tags := Str:Obj?[:]
    tags["emMeterRef"]   = Ref("m-1")
    tags["emMedium"]     = EmMedium.elec
    tags["span"]         = span("2026-07-01", "2026-07-02")
    tags["val"]          = Number(120f, Unit("kWh"))
    tags["emDataSource"] = EmDataSource.measured
    overrides.each |Obj? v, Str k| { tags[k] = v }
    return Etc.makeDict(tags)
  }

  private static Bool hasCode(Dict[] issues, Str code) {
    found := false
    issues.each |Dict i| { if (i["code"] == code) found = true }
    return found
  }

  Void test_guard_acceptsValidEntry() {
    verifyEq(EmDataSourceGuard.validateEntry(entry).size, 0)
    EmDataSourceGuard.checkEntry(entry)   // 不应抛错
  }

  Void test_guard_rejectsBarePoint() {
    // 铁律 1：禁止裸点直接进能耗账
    issues := EmDataSourceGuard.validateEntry(entry(["emMeterRef": null]))
    verify(hasCode(issues, "ledger.meterRef.missing"))
    verifyErr(ArgErr#) { EmDataSourceGuard.checkEntry(entry(["emMeterRef": null])) }
  }

  Void test_guard_requiresDataSource() {
    // 铁律 4：每个数值必带 emDataSource
    verify(hasCode(EmDataSourceGuard.validateEntry(entry(["emDataSource": null])),
                   "ledger.dataSource.missing"))
    verify(hasCode(EmDataSourceGuard.validateEntry(entry(["emDataSource": "bogus"])),
                   "ledger.dataSource.invalid"))
  }

  Void test_guard_allocatedEntryNeedsRuleRef() {
    // 说明书 §4.3：分摊结果条目必须携带 emRuleRef
    withoutRule := entry(["emDataSource": EmDataSource.allocated])
    verify(hasCode(EmDataSourceGuard.validateEntry(withoutRule), "ledger.rule.missing"))

    withRule := entry(["emDataSource": EmDataSource.allocated, "emRuleRef": Ref("r-1")])
    verifyEq(EmDataSourceGuard.validateEntry(withRule).size, 0)
  }

  Void test_guard_qualityRange() {
    verify(hasCode(EmDataSourceGuard.validateEntry(entry(["emQuality": Number(1.2f)])),
                   "ledger.quality.range"))
    verify(hasCode(EmDataSourceGuard.validateEntry(entry(["emQuality": Number(-0.1f)])),
                   "ledger.quality.range"))
    verifyEq(EmDataSourceGuard.validateEntry(entry(["emQuality": Number(0.97f)])).size, 0)
  }

  Void test_guard_estimatedCannotSettle() {
    // 说明书表 5-1：估算值不可用于结算，也不可对外披露
    verifyErr(ArgErr#) {
      EmDataSourceGuard.checkSettleable(entry(["emDataSource": EmDataSource.estimated]))
    }
    EmDataSourceGuard.checkSettleable(entry(["emDataSource": EmDataSource.manual]))
    verifyFalse(EmDataSource.canSettle(EmDataSource.estimated))
    verifyFalse(EmDataSource.canDisclose(EmDataSource.estimated))
    verify(EmDataSource.needsEvidence(EmDataSource.allocated))
  }

//////////////////////////////////////////////////////////////////////////
// 铁律 8：业务参数必须有依据文件
//////////////////////////////////////////////////////////////////////////

  Void test_paramGuard_requiresSourceDoc() {
    noDoc := Etc.makeDict(["emTariff": Marker.val, "emEffective": span("2026-01-01", "2027-01-01")])
    verifyErr(ArgErr#) { EmParamVersionGuard.check(noDoc) }

    ok := Etc.makeDict([
      "emTariff":    Marker.val,
      "emEffective": span("2026-01-01", "2027-01-01"),
      "emSourceDoc": "苏价工〔2025〕42 号",
    ])
    EmParamVersionGuard.check(ok)
  }

  Void test_paramGuard_lockedVersionIsReadOnly() {
    locked := Etc.makeDict(["emEmissionFactor": Marker.val, "emLocked": Marker.val])
    verifyErr(ArgErr#) { EmParamVersionGuard.checkMutable(locked) }
  }

//////////////////////////////////////////////////////////////////////////
// 账期键与台账编码
//////////////////////////////////////////////////////////////////////////

  Void test_periodKey() {
    day := span("2026-07-15", "2026-07-16")
    verifyEq(EmLedgerPeriod.key(day, EmGranularity.daily),   "2026-07-15")
    verifyEq(EmLedgerPeriod.key(day, EmGranularity.monthly), "2026-07")
    verifyEq(EmLedgerPeriod.key(day, EmGranularity.yearly),  "2026")
    verifyEq(EmLedgerPeriod.key(day, EmGranularity.hourly),  "2026-07-15T00")
  }

  Void test_ledgerCode() {
    july := span("2026-07-01", "2026-08-01")
    verifyEq(EmLedgerPeriod.code(july, 142), "L-2607-0142")
    verifyEq(EmLedgerPeriod.code(july, 1),   "L-2607-0001")
    verifyEq(EmLedgerPeriod.closeCode(july), "C-2607")
    // EmLedgerBuilder / EmReversal 靠这个前缀数同月已有条目，长度必须对
    verifyEq(EmLedgerPeriod.code(july, 1)[0..-5], "L-2607-")
  }

//////////////////////////////////////////////////////////////////////////
// 账期切分（月 / 年必须走日历，不能加固定 Duration）
//////////////////////////////////////////////////////////////////////////

  Void test_granularity_splitDaily() {
    july := span("2026-07-01", "2026-08-01")
    days := EmGranularity.split(july, EmGranularity.daily)
    verifyEq(days.size, 31)
    verifyEq(days.first.start.date.toStr, "2026-07-01")
    verifyEq(days.last.start.date.toStr,  "2026-07-31")
    verifyEq(days.last.end.date.toStr,    "2026-08-01")
  }

  Void test_closePeriodKeys_coverWholeDailySpan() {
    keys := EmClosePeriod.periodKeys(span("2026-08-01", "2026-09-01"), EmGranularity.daily)
    verifyEq(keys.size, 31)
    verifyEq(keys.first, "2026-08-01")
    verifyEq(keys.last, "2026-08-31")
  }

  Void test_granularity_splitFebruaryUsesCalendar() {
    // 2 月只有 28 天 —— 用固定 30day 推进会切错
    feb := span("2026-02-01", "2026-03-01")
    verifyEq(EmGranularity.split(feb, EmGranularity.daily).size, 28)
    verifyEq(EmGranularity.split(feb, EmGranularity.monthly).size, 1)
  }

  Void test_granularity_splitMonthly() {
    year := span("2026-01-01", "2027-01-01")
    months := EmGranularity.split(year, EmGranularity.monthly)
    verifyEq(months.size, 12)
    verifyEq(months[1].start.date.toStr, "2026-02-01")
    verifyEq(months.last.start.date.toStr, "2026-12-01")
  }

  Void test_granularity_defaults() {
    verifyEq(EmGranularity.defaultGranularity, EmGranularity.daily,
      "骨架默认落库粒度是 daily（说明书 §6 OI-01）")
    verify(EmGranularity.isValid("hourly"))
    verifyFalse(EmGranularity.isValid("weekly"))
  }
}
