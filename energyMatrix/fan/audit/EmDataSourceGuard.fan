using haystack

**
** 台账条目写入前的守卫 —— 铁律 1 与铁律 4 的强制点。
**
** 纯函数（不碰 Folio），因此可以在 `HaystackTest` 里直接测。
** `EmLedgerBuilder` / `EmReversal` / 分摊引擎写库前都必须过这里。
**
** 检查项：
**   1. `emMeterRef` 必填 —— 禁止裸点入账（铁律 1）
**   2. `emDataSource` 必填且合法（铁律 4）
**   3. `emMedium` 必填且合法
**   4. `val` 必填且是 Number
**   5. `span` 必填
**   6. `allocated` 条目必须带 `emRuleRef`（说明书 §4.3）
**   7. `emQuality` 若存在必须落在 [0,1]
**   8. 已关账（`emClosed`）的条目不接受任何修改（铁律 7）
**
const class EmDataSourceGuard
{
  **
  ** 校验一条待写入的台账条目。返回问题列表，空表示通过。
  ** 每条问题是 {level, code, msg}，与 `EmMeterTreeBuilder.issue` 同构。
  **
  static Dict[] validateEntry(Dict entry) {
    issues := Dict[,]

    if (entry["emMeterRef"] as Ref == null) {
      issues.add(err("ledger.meterRef.missing",
        "台账条目缺少 emMeterRef —— 禁止裸点直接进能耗账（铁律 1）"))
    }

    src := entry["emDataSource"] as Str
    if (src == null) {
      issues.add(err("ledger.dataSource.missing",
        "台账条目缺少 emDataSource —— 这是账目可审计的根（铁律 4）"))
    } else if (!EmDataSource.isValid(src)) {
      issues.add(err("ledger.dataSource.invalid",
        "emDataSource 非法：$src（合法值 " + EmDataSource.all.join("|") + "）"))
    } else if (src == EmDataSource.allocated && entry["emRuleRef"] as Ref == null) {
      issues.add(err("ledger.rule.missing",
        "分摊条目必须携带 emRuleRef 指向来源规则（说明书 §4.3）"))
    }

    medium := entry["emMedium"] as Str
    if (medium == null) {
      issues.add(err("ledger.medium.missing", "台账条目缺少 emMedium"))
    } else if (!EmMedium.isValid(medium)) {
      issues.add(err("ledger.medium.invalid",
        "emMedium 非法：$medium（合法值 " + EmMedium.all.join("|") + "）"))
    }

    if (entry["val"] as Number == null) {
      issues.add(err("ledger.val.missing", "台账条目缺少 val 或 val 不是 Number"))
    }

    if (entry["span"] == null) {
      issues.add(err("ledger.span.missing", "台账条目缺少 span（账期区间，左闭右开）"))
    }

    q := entry["emQuality"] as Number
    if (q != null && (q.toFloat < 0f || q.toFloat > 1f)) {
      issues.add(err("ledger.quality.range", "emQuality 必须落在 [0,1]，实际 " + q.toFloat))
    }

    return issues
  }

  **
  ** 校验并在失败时抛错。写库路径一律用这个 —— 让不合规的条目在写入前
  ** 就失败，而不是进了库以后靠报表去发现。
  **
  static Void checkEntry(Dict entry) {
    issues := validateEntry(entry)
    if (issues.isEmpty) return
    msgs := Str[,]
    issues.each |Dict i| { msgs.add((i["msg"] as Str) ?: "?") }
    throw ArgErr("台账条目校验失败：\n  - " + msgs.join("\n  - "))
  }

  **
  ** 已关账条目不可变（铁律 7）。任何试图 commit 到带 `emClosed` 记录的
  ** 路径都必须先过这里；修正只能走红冲（`EmReversal`）。
  **
  static Void checkMutable(Dict existing) {
    if (existing.has("emClosed")) {
      throw ArgErr("条目已关账（emClosed），不可修改；修正请走红冲 emReverseLedgerEntry（铁律 7）")
    }
  }

  **
  ** 该来源等级能否用于结算。`estimated` 不能 —— 估算值进结算链等于把
  ** 不确定性变成账单金额。
  **
  static Void checkSettleable(Dict entry) {
    src := EmDataSource.of(entry)
    if (src == null) throw ArgErr("条目缺少合法 emDataSource，不可用于结算")
    if (!EmDataSource.canSettle(src)) {
      throw ArgErr("emDataSource=$src 的条目不可用于结算（说明书 §5.1 表 5-1）")
    }
  }

  private static Dict err(Str code, Str msg) {
    Etc.makeDict(["level": "err", "code": code, "msg": msg])
  }
}
