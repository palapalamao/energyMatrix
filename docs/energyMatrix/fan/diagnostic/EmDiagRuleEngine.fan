using folio
using haystack
using skyarc
using skyarcd

**
** 诊断与闭环（域 11）—— **骨架桩**。
**
** 架构原则（说明书 §4.8 原文）：沿用「AI 建议、确定性执行」的一贯原则 ——
** **诊断模型只产生 `EmAnomaly`，不直接写入控制点**。需要动作时走工单，
** 或交由 CoolMatrix / heatMatrix 的确定性策略层执行。
** **实时安全回路永不依赖账务层。**
**
** 已实现：规则加载与配置校验、**dataQuality 与 balance 两类判据**、异常状态机
** （确认 / 派单 / 处置）、工单闭环。
**
** 未实现：另外六类判据（overConsume / efficiency / scheduleWaste / demandRisk /
** quotaRisk / carbonRisk）。为什么先做这两类：它们只需要**台账**与**缺口**就能
** 判定，不依赖任何还没定下来的口径；另外六类分别要等指标公式（域 8）、
** 基线（域 9）、费率需量（域 7）、碳目标（域 10）落地。
**
** 实现时必须遵守：
**   - 判据求值只读台账（`EmLedgerQuery`）与缺口（`EmGapCalc`），不直读点位
**   - `EmAnomaly.emImpactVal` 的 `emDataSource` 恒为 `estimated`，
**     **仅用于排序与展示，永不进入台账参与结算**
**   - 生成异常绝不写任何控制点
**
class EmDiagRuleEngine
{
  new make(Context cx) { this.cx = cx }

  Context cx

  private static const Str src := "EmDiagRuleEngine"

  ** 启用的诊断规则，按严重度降序（critical 先跑）。已实现。
  Dict[] activeRules(Ref siteRef) {
    all := cx.proj.readAllList("emDiagnostic and not disabled and siteRef==" + siteRef.toCode)
    return sortRules(all)
  }

  ** Folio may return an immutable list; sort a writable copy instead.
  @NoDoc
  static Dict[] sortRules(Dict[] rules) {
    sorted := rules.dup
    sorted.sort |Dict a, Dict b -> Int| {
      return EmSeverity.rank(b) <=> EmSeverity.rank(a)
    }
    return sorted
  }

  ** 规则配置校验。已实现。返回问题清单，空表示通过。
  Dict[] validateRule(Dict rule) {
    issues := Dict[,]
    if ((rule["emRuleCode"] as Str) == null) {
      issues.add(err("diag.code.missing", "诊断规则缺少 emRuleCode"))
    }
    cat := rule["emCategory"] as Str
    if (!EmDiagCategory.isValid(cat)) {
      issues.add(err("diag.category.invalid",
        "emCategory 非法：" + (cat ?: "<null>") + "（合法值 " + EmDiagCategory.all.join("|") + "）"))
    }
    sev := rule["emSeverity"] as Str
    if (!EmSeverity.isValid(sev)) {
      issues.add(err("diag.severity.invalid",
        "emSeverity 非法：" + (sev ?: "<null>") + "（合法值 " + EmSeverity.all.join("|") + "）"))
    }
    expr := rule["emExpr"] as Str
    if (expr == null || expr.trim.isEmpty) {
      issues.add(err("diag.expr.missing", "诊断规则缺少 emExpr 判据表达式"))
    }
    return issues
  }

  **
  ** 新建诊断规则。
  **
  ** threshold 的含义随分类而定：
  **   dataQuality  数据完好率低于它就报（如 0.9）
  **   balance      缺口率绝对值高于它就报（如 0.05）
  **
  Ref addRule(Ref siteRef, Str ruleCode, Str dis, Str category, Str severity,
              Number threshold, Dict args := Etc.emptyDict) {
    if (!EmDiagCategory.isValid(category)) {
      throw ArgErr("emCategory 非法：$category（合法值 " + EmDiagCategory.all.join("、") + "）")
    }
    if (!EmSeverity.isValid(severity)) {
      throw ArgErr("emSeverity 非法：$severity（合法值 " + EmSeverity.all.join("、") + "）")
    }
    tags := Etc.dictToMap(args)
    tags["energyMatrix"]    = Marker.val
    tags["emDiagnostic"]    = Marker.val
    tags["siteRef"]         = siteRef
    tags["dis"]             = dis
    tags["emRuleCode"]      = ruleCode
    tags["emCategory"]      = category
    tags["emSeverity"]      = severity
    tags["emRuleThreshold"] = threshold
    d := cx.proj.commit(Diff.makeAdd(Etc.makeDict(tags)))
    EnergyMatrixExt.logInfo(src, "created diag rule $ruleCode ($category)")
    return d.newRec.id
  }

  **
  ** 跑一遍站点的诊断规则，生成 `EmAnomaly`。
  **
  ** 幂等：同一条规则 + 同一个对象 + 同一账期，只会有一条 open 的异常。
  ** 重复跑不会刷屏 —— 一个每跑一次就多出几百条重复告警的诊断系统，
  ** 两天之内就会被运维关掉。
  **
  ** 返回 Grid：emRuleCode, emCategory, emSubjectRef, dis, emVal, emExpected,
  ** status(created|existing|skipped)。
  **
  Grid run(Ref siteRef, Span span) {
    rules := activeRules(siteRef)
    if (rules.isEmpty) {
      EnergyMatrixExt.logDebug(src, "site " + siteRef.toCode + " 无启用的诊断规则")
      return Etc.makeDictsGrid(null, Dict[,])
    }

    rows := Dict[,]
    unsupported := Str[,]
    rules.each |Dict rule| {
      cat := rule["emCategory"] as Str
      try {
        if (cat == EmDiagCategory.dataQuality) rows.addAll(runDataQuality(rule, siteRef, span))
        else if (cat == EmDiagCategory.balance) rows.addAll(runBalance(rule, siteRef, span))
        else unsupported.add((rule["emRuleCode"] as Str) ?: cat)
      } catch (Err e) {
        EnergyMatrixExt.logErr(src, "规则执行失败 " + (rule["emRuleCode"] ?: rule.id.toCode), e)
      }
    }

    if (!unsupported.isEmpty) {
      // 不抛错：已经跑出来的异常是有价值的，不该因为别的规则没实现就全丢掉。
      // 但也不能不说 —— 静默跳过会让人以为那些规则在正常工作。
      EnergyMatrixExt.logWarn(src,
        "以下规则的判据尚未实现，本次跳过：" + unsupported.join(", "))
    }

    meta := Etc.makeDict([
      "siteRef":     siteRef,
      "span":        span,
      "emRuleCount": Number(rules.size),
      "emSkipped":   unsupported.isEmpty ? null : unsupported.join(", "),
    ])
    return Etc.makeDictsGrid(meta, rows)
  }

  **
  ** dataQuality：账期内完好率低于阈值的台账条目 → 一条异常。
  **
  ** 判据直接落在台账上而不是点位上：完好率是记账时实际用的那个数，
  ** 拿点位现算会得出与账目不一致的结论。
  **
  private Dict[] runDataQuality(Dict rule, Ref siteRef, Span span) {
    limit := threshold(rule, 0.9f)
    out := Dict[,]
    EmLedgerQuery(cx).entries(siteRef, span).each |Dict e| {
      q := e["emQuality"] as Number
      if (q == null || q.toFloat >= limit) return
      m := e["emMeterRef"] as Ref
      if (m == null) return
      meter := cx.proj.readById(m, false)
      out.add(upsertAnomaly(rule, m, span, q, Number(limit),
        "数据完好率 " + pct(q) + " 低于 " + pct(Number(limit)) +
        "（" + EmModelTree.dis(meter) + " " + (e["emPeriod"] ?: "") + "）"))
    }
    return out
  }

  **
  ** balance：缺口率超阈值 → 一条异常，挂在被校核的那块表上。
  **
  private Dict[] runBalance(Dict rule, Ref siteRef, Span span) {
    limit := threshold(rule, EnergyMatrixExt.defaultGapThreshold)
    out := Dict[,]
    EmGapCalc(cx).siteGaps(siteRef, span).each |Row r| {
      ratio := r["emGapRatio"] as Number
      if (ratio == null || ratio.toFloat.abs <= limit) return
      m := r["meterRef"] as Ref
      if (m == null) return
      meter := cx.proj.readById(m, false)
      out.add(upsertAnomaly(rule, m, span, ratio, Number(limit),
        "缺口率 " + pct(ratio) + " 超过阈值 " + pct(Number(limit)) +
        "（" + EmModelTree.dis(meter) + "）"))
    }
    return out
  }

  ** 规则阈值，缺省用分类的默认值。
  private static Float threshold(Dict rule, Float def) {
    n := rule["emRuleThreshold"] as Number
    return n == null ? def : n.toFloat
  }

  private static Str pct(Number? n) {
    n == null ? "n/a" : ((n.toFloat * 1000f).round / 10f).toStr + "%"
  }

  **
  ** 建异常；同规则 + 同对象 + 同账期已有 open 的就不重复建。
  **
  private Dict upsertAnomaly(Dict rule, Ref subject, Span span,
                             Number val, Number expected, Str msg) {
    key := EmLedgerPeriod.key(span, EmGranularity.daily)
    existing := cx.proj.read(
      "emAnomaly and emDiagRef==" + rule.id.toCode +
      " and emSubjectRef==" + subject.toCode +
      " and emPeriod==" + key.toCode, false)

    status := "existing"
    Ref? id := existing?.id
    if (existing == null) {
      dev := expected.toFloat == 0f ? null
        : Number((val.toFloat - expected.toFloat) / expected.toFloat)
      tags := Str:Obj?[:]
      tags["energyMatrix"]    = Marker.val
      tags["emAnomaly"]       = Marker.val
      tags["dis"]             = msg
      tags["siteRef"]         = rule["siteRef"]
      tags["emDiagRef"]       = rule.id
      tags["emSubjectRef"]    = subject
      tags["emCategory"]      = rule["emCategory"]
      tags["emSeverity"]      = rule["emSeverity"]
      tags["emPeriod"]        = key
      tags["span"]            = span
      tags["ts"]              = DateTime.now
      tags["emVal"]           = val
      tags["emExpected"]      = expected
      tags["emDeviation"]     = dev
      tags["emAnomalyStatus"] = EmAnomalyStatus.open
      id = cx.proj.commit(Diff.makeAdd(Etc.makeDict(tags))).newRec.id
      status = "created"
    }

    return Etc.makeDict([
      "anomalyRef":   id,
      "emRuleCode":   rule["emRuleCode"],
      "emCategory":   rule["emCategory"],
      "emSubjectRef": subject,
      "dis":          msg,
      "emVal":        val,
      "emExpected":   expected,
      "status":       status,
    ])
  }

  **
  ** 异常清单（UI「实时监测与告警」的数据源）。
  ** status 省略时返回全部；给定时只返回该状态的。
  **
  Grid anomalies(Ref siteRef, Str? status := null) {
    filter := "emAnomaly and siteRef==" + siteRef.toCode
    if (status != null) filter = filter + " and emAnomalyStatus==" + status.toCode
    recs := cx.proj.readAllList(filter)

    rows := Dict[,]
    recs.each |Dict a| {
      subj := a["emSubjectRef"] as Ref
      subjRec := subj == null ? null : cx.proj.readById(subj, false)
      rows.add(Etc.dictMerge(a, Etc.makeDict([
        "emSubjectDis": subjRec == null ? null : EmModelTree.dis(subjRec),
      ])))
    }
    rows.sort |Dict a, Dict b -> Int| {
      // 严重度降序，同级按时间倒序 —— 最该先看的排最前
      s := EmSeverity.rank(b) <=> EmSeverity.rank(a)
      if (s != 0) return s
      ta := a["ts"] as DateTime
      tb := b["ts"] as DateTime
      if (ta == null || tb == null) return 0
      return tb <=> ta
    }
    return Etc.makeDictsGrid(null, rows)
  }

  ** 异常按状态与分类的计数（UI 顶部统计卡）。
  Dict anomalyStats(Ref siteRef) {
    byStatus := Str:Int[:]
    byCategory := Str:Int[:]
    critical := 0
    total := 0
    cx.proj.readAllList("emAnomaly and siteRef==" + siteRef.toCode).each |Dict a| {
      total++
      st := (a["emAnomalyStatus"] as Str) ?: EmAnomalyStatus.open
      byStatus[st] = (byStatus[st] ?: 0) + 1
      c := (a["emCategory"] as Str) ?: "?"
      byCategory[c] = (byCategory[c] ?: 0) + 1
      if (a["emSeverity"] == EmSeverity.critical && st == EmAnomalyStatus.open) critical++
    }
    stats := Str:Obj?[:]
    EmAnomalyStatus.all.each |Str st| { stats[st] = Number(byStatus[st] ?: 0) }
    stats["emCritical"] = Number(critical)
    stats["emTotal"] = Number(total)
    cats := Str:Obj?[:]
    byCategory.each |Int n, Str c| { cats[c] = Number(n) }
    stats["emByCategory"] = Etc.makeDict(cats)
    return Etc.makeDict(stats)
  }

  **
  ** 确认一条异常（open → acked）。已实现 —— 状态机是闭环的骨架，先立住。
  **
  Ref ack(Ref anomalyRef, Str? note := null) {
    a := cx.proj.readById(anomalyRef, true)
    if (a.missing("emAnomaly")) throw ArgErr(anomalyRef.toCode + " 不是 EmAnomaly")
    cur := (a["emAnomalyStatus"] as Str) ?: EmAnomalyStatus.open
    if (cur != EmAnomalyStatus.open) {
      throw ArgErr("异常当前状态是 $cur，只有 open 可以确认")
    }
    cx.proj.commit(Diff(a, Etc.makeDict([
      "emAnomalyStatus": EmAnomalyStatus.acked,
      "emAckBy":         cx.user.username,
      "emAckAt":         DateTime.now,
      "emNote":          note,
    ])))
    return anomalyRef
  }

  **
  ** 误报：置为 falseAlarm。与 resolved 分开是有意义的 —— 误报多说明规则
  ** 阈值不对，那是要回去改规则的信号，混进"已处置"里就看不见了。
  **
  Ref markFalseAlarm(Ref anomalyRef, Str? note := null) {
    a := cx.proj.readById(anomalyRef, true)
    if (a.missing("emAnomaly")) throw ArgErr(anomalyRef.toCode + " 不是 EmAnomaly")
    cx.proj.commit(Diff(a, Etc.makeDict([
      "emAnomalyStatus": EmAnomalyStatus.falseAlarm,
      "emAckBy":         cx.user.username,
      "emAckAt":         DateTime.now,
      "emNote":          note,
    ])))
    return anomalyRef
  }

  **
  ** 派单：异常 → 工单。
  **
  ** 一条工单可以带多条异常（同一块表连着几天完好率低，是一个问题不是五个），
  ** 所以 `emAnomalyRefs` 是列表。
  **
  Ref dispatch(Ref[] anomalyRefs, Str assignee, Date? dueDate := null) {
    if (anomalyRefs.isEmpty) throw ArgErr("至少要选一条异常才能派单")

    anomalies := Dict[,]
    anomalyRefs.each |Ref r| {
      a := cx.proj.readById(r, true)
      if (a.missing("emAnomaly")) throw ArgErr(r.toCode + " 不是 EmAnomaly")
      if (a["emAnomalyStatus"] == EmAnomalyStatus.dispatched) {
        throw ArgErr("异常已经派过单了：" + EmModelTree.dis(a))
      }
      anomalies.add(a)
    }

    first := anomalies.first
    tags := Str:Obj?[:]
    tags["energyMatrix"]      = Marker.val
    tags["emWorkOrder"]       = Marker.val
    tags["dis"]               = EmModelTree.dis(first)
    tags["siteRef"]           = first["siteRef"]
    tags["emOrderNo"]         = orderNo
    tags["emSubjectRef"]      = first["emSubjectRef"]
    tags["emAnomalyRefs"]     = anomalyRefs
    tags["emAssignee"]        = assignee
    tags["emDueDate"]         = dueDate
    tags["emWorkOrderStatus"] = EmWorkOrderStatus.assigned
    tags["emCategory"]        = first["emCategory"]
    tags["emSeverity"]        = first["emSeverity"]
    tags["ts"]                = DateTime.now
    wo := cx.proj.commit(Diff.makeAdd(Etc.makeDict(tags))).newRec.id

    diffs := Diff[,]
    anomalies.each |Dict a| {
      diffs.add(Diff(a, Etc.makeDict([
        "emAnomalyStatus": EmAnomalyStatus.dispatched,
        "emWorkOrderRef":  wo,
      ])))
    }
    cx.proj.commitAll(diffs)

    EnergyMatrixExt.logInfo(src,
      "dispatched " + anomalies.size + " anomalies → work order " + tags["emOrderNo"])
    return wo
  }

  ** 工单编号 `W-yyMMdd-nnn`，同日流水。
  private Str orderNo() {
    d := Date.today
    prefix := "W-" + (d.year % 100).toStr.padl(2, '0') +
              (d.month.ordinal + 1).toStr.padl(2, '0') + d.day.toStr.padl(2, '0') + "-"
    n := cx.proj.readAllList("emWorkOrder and emOrderNo").findAll |Dict w -> Bool| {
      no := w["emOrderNo"] as Str
      return no != null && no.startsWith(prefix)
    }.size
    return prefix + (n + 1).toStr.padl(3, '0')
  }

  **
  ** 工单状态流转：new → assigned → inProgress → done → closed。
  **
  ** 只允许沿着状态流往前走 —— 允许任意跳转的状态机等于没有状态机，
  ** 事后没人说得清一张单子到底经历了什么。
  **
  Ref updateWorkOrder(Ref woRef, Str status, Str? result := null,
                      Ref? savingsProjectRef := null) {
    if (!EmWorkOrderStatus.isValid(status)) {
      throw ArgErr("工单状态非法：$status（合法值 " + EmWorkOrderStatus.all.join("、") + "）")
    }
    wo := cx.proj.readById(woRef, true)
    if (wo.missing("emWorkOrder")) throw ArgErr(woRef.toCode + " 不是 EmWorkOrder")

    cur := (wo["emWorkOrderStatus"] as Str) ?: EmWorkOrderStatus.newOrder
    ci := EmWorkOrderStatus.all.index(cur) ?: 0
    ni := EmWorkOrderStatus.all.index(status) ?: 0
    if (ni < ci) {
      throw ArgErr("工单不能从「$cur」退回「$status」—— 状态只能沿流程往前走")
    }

    changes := Str:Obj?[:]
    changes["emWorkOrderStatus"] = status
    if (result != null) changes["emResult"] = result
    if (savingsProjectRef != null) changes["emSavingsProjectRef"] = savingsProjectRef
    cx.proj.commit(Diff(wo, Etc.makeDict(changes)))

    // 工单完成时，把它带的异常一并置为已处置 —— 单子关了异常还挂着，
    // 告警列表就会越积越长，最后没人看
    if (status == EmWorkOrderStatus.done || status == EmWorkOrderStatus.closed) {
      refs := wo["emAnomalyRefs"] as Ref[]
      if (refs != null) {
        diffs := Diff[,]
        refs.each |Ref r| {
          a := cx.proj.readById(r, false)
          if (a == null) return
          if (a["emAnomalyStatus"] == EmAnomalyStatus.resolved) return
          diffs.add(Diff(a, Etc.makeDict1("emAnomalyStatus", EmAnomalyStatus.resolved)))
        }
        if (!diffs.isEmpty) cx.proj.commitAll(diffs)
      }
    }
    return woRef
  }

  ** 工单清单（UI「工单管理」的数据源）。
  Grid workOrders(Ref siteRef, Str? status := null) {
    filter := "emWorkOrder and siteRef==" + siteRef.toCode
    if (status != null) filter = filter + " and emWorkOrderStatus==" + status.toCode
    recs := cx.proj.readAllList(filter)
    rows := Dict[,]
    recs.each |Dict w| {
      subj := w["emSubjectRef"] as Ref
      subjRec := subj == null ? null : cx.proj.readById(subj, false)
      refs := w["emAnomalyRefs"] as Ref[]
      rows.add(Etc.dictMerge(w, Etc.makeDict([
        "emSubjectDis":   subjRec == null ? null : EmModelTree.dis(subjRec),
        "emAnomalyCount": Number(refs == null ? 0 : refs.size),
      ])))
    }
    rows.sort |Dict a, Dict b -> Int| {
      ta := a["ts"] as DateTime
      tb := b["ts"] as DateTime
      if (ta == null || tb == null) return 0
      return tb <=> ta
    }
    return Etc.makeDictsGrid(null, rows)
  }

  private static Dict err(Str code, Str msg) {
    Etc.makeDict(["level": "err", "code": code, "msg": msg])
  }
}

**
** 诊断分类（说明书 §4.8 表 4-8）。
**
const class EmDiagCategory
{
  ** 数据质量：采集断点、数值冻结、负增量、超量程。
  static const Str dataQuality   := "dataQuality"
  ** 平衡校核：缺口率超限、子表合计大于总表。
  static const Str balance       := "balance"
  ** 用能异常：同比或环比突变、夜间基线偏高。
  static const Str overConsume   := "overConsume"
  ** 效率异常：EUI 或 PUE 劣化。
  static const Str efficiency    := "efficiency"
  ** 作息浪费：非营业时段设备运行。
  static const Str scheduleWaste := "scheduleWaste"
  ** 需量风险：逼近申报需量。
  static const Str demandRisk    := "demandRisk"
  ** 定额风险：定额消耗进度超前。
  static const Str quotaRisk     := "quotaRisk"
  ** 碳目标进度偏离。
  static const Str carbonRisk    := "carbonRisk"

  static const Str[] all := [dataQuality, balance, overConsume, efficiency,
                             scheduleWaste, demandRisk, quotaRisk, carbonRisk]

  static Bool isValid(Str? c) { c != null && all.contains(c) }
}

** 异常严重度。
const class EmSeverity
{
  static const Str info     := "info"
  static const Str warn     := "warn"
  static const Str critical := "critical"

  static const Str[] all := [info, warn, critical]

  static Bool isValid(Str? s) { s != null && all.contains(s) }

  ** 排序用权重，critical 最大。
  static Int rank(Dict rec) {
    s := rec["emSeverity"] as Str
    if (s == critical) return 2
    if (s == warn)     return 1
    return 0
  }
}

**
** 异常状态机（说明书附录 C 的 `EmAnomalyStatus`）。
**
** 注意标签名是 `emAnomalyStatus` 而不是 xeto 原稿的 `emStatus` ——
** 后者在原稿里被三种类型共用，详见 README「与说明书的偏差」#1。
**
const class EmAnomalyStatus
{
  static const Str open       := "open"
  static const Str acked      := "acked"
  static const Str dispatched := "dispatched"
  static const Str resolved   := "resolved"
  static const Str falseAlarm := "falseAlarm"

  static const Str[] all := [open, acked, dispatched, resolved, falseAlarm]

  static Bool isValid(Str? s) { s != null && all.contains(s) }
}

**
** 工单状态。xeto 原稿只有一个自由文本 `emStatus: Str <doc:"new|assigned|...">`，
** 这里补成正式枚举（README 偏差 #1）。
**
const class EmWorkOrderStatus
{
  static const Str newOrder  := "new"
  static const Str assigned  := "assigned"
  static const Str inProgress := "inProgress"
  static const Str done      := "done"
  static const Str closed    := "closed"

  static const Str[] all := [newOrder, assigned, inProgress, done, closed]

  static Bool isValid(Str? s) { s != null && all.contains(s) }
}
