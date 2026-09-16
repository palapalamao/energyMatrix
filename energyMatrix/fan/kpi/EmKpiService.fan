using axon
using folio
using haystack
using skyarc
using skyarcd

**
** 指标体系与定额（域 8）—— **骨架桩**。
**
** 说明书 §4.5：指标定义（`EmKpi`）与时序实例（`EmKpiPoint`）分离。
** `EmKpi` 是可版本化、可跨项目复用的定义；`EmKpiPoint` 是挂在被评价对象下的
** 归一化时序点，即 Layer 1 点位规范中的 L3。
**
** 已实现：指标定义 CRUD、`emFormula` 求值、定额进度计算。
** 未实现：`EmKpiPoint` 写历史（把指标值固化成 L3 归一化点）。
**
** 说明书 §6 待决事项 OI-03（指标公式形式：Axon 表达式 / 固化算子）
** 骨架默认选 **Axon 表达式**，与虚拟表 `emFormula` 保持一致，现场可改。
** 求值走 `EmEvalScope.withSpan`，公式里可以直接用 `emLedgerTotal(...)`。
**
class EmKpiService
{
  new make(Context cx) { this.cx = cx }

  Context cx

  private static const Str src := "EmKpiService"

  ** 按稳定编码取指标定义。已实现。
  Dict? byCode(Str kpiCode, Bool checked := true) {
    cx.proj.read("emKpi and emKpiCode==" + kpiCode.toCode, checked)
  }

  ** 全部指标定义。已实现（UI「指标定义表」的数据源）。
  Grid definitions() {
    Etc.makeDictsGrid(null, cx.proj.readAllList("emKpi"))
  }

  **
  ** 新建指标定义。已实现 —— `EmKpi` 是一条纯记录，没有模板也没有子点位，
  ** 建它不需要任何口径决策；真正待定的是 `emFormula` 怎么求值（见 `compute`）。
  **
  ** args 常用键：unit、emGranularity、emDimension、emHigherIsBetter、emStandardRef。
  **
  Ref addKpi(Str kpiCode, Str dis, Str formula, Dict args := Etc.emptyDict) {
    if (byCode(kpiCode, false) != null) {
      throw ArgErr("指标编码已存在：$kpiCode —— 编码要跨项目稳定，不能重复")
    }
    tags := Etc.dictToMap(args)
    tags["energyMatrix"] = Marker.val
    tags["emKpi"]        = Marker.val
    tags["dis"]          = dis
    tags["emKpiCode"]    = kpiCode
    tags["emFormula"]    = formula
    d := cx.proj.commit(Diff.makeAdd(Etc.makeDict(tags)))
    EnergyMatrixExt.logInfo(src, "created kpi $kpiCode '$dis'")
    return d.newRec.id
  }

  **
  ** 新建定额。已实现。
  **
  ** `emLimitSource` 必填 —— 说明书 §4.5：定额来源分五类，不同来源在报表中
  ** 必须分别标注，不可混用。一个不知道出处的限值没有约束力。
  **
  Ref addQuota(Ref subjectRef, Number limit, Str limitSource, Span span,
               Dict args := Etc.emptyDict) {
    if (!EmQuotaSource.isValid(limitSource)) {
      throw ArgErr("emLimitSource 非法：$limitSource（合法值 " +
        EmQuotaSource.all.join("、") + "）")
    }
    if (limit.toFloat <= 0f) throw ArgErr("定额限值必须大于 0")

    tags := Etc.dictToMap(args)
    tags["energyMatrix"]  = Marker.val
    tags["emQuota"]       = Marker.val
    tags["emSubjectRef"]  = subjectRef
    tags["emLimit"]       = limit
    tags["emLimitSource"] = limitSource
    tags["span"]          = span
    if (tags["emWarnRatio"] == null) tags["emWarnRatio"] = Number(0.9f)
    d := cx.proj.commit(Diff.makeAdd(Etc.makeDict(tags)))
    EnergyMatrixExt.logInfo(src, "created quota limit=$limit source=$limitSource")
    return d.newRec.id
  }

  ** 站点相关的全部定额（UI「定额执行进度」的数据源）。
  Grid quotas(Ref? subjectRef := null) {
    filter := subjectRef == null
      ? "emQuota"
      : "emQuota and emSubjectRef==" + subjectRef.toCode
    return Etc.makeDictsGrid(null, cx.proj.readAllList(filter))
  }

  **
  ** 全部定额的执行进度（一次算完，UI 不必逐条回查）。
  ** 列同 `quotaProgress`，外加 dis 与 emLimitSource。
  **
  Grid quotaProgressAll(Ref subjectRef, Span span) {
    rows := Dict[,]
    cx.proj.readAllList("emQuota and emSubjectRef==" + subjectRef.toCode).each |Dict q| {
      try {
        p := quotaProgress(q.id, span)
        rows.add(Etc.dictMerge(p, Etc.makeDict([
          "dis":           EmModelTree.dis(q),
          "emLimitSource": q["emLimitSource"],
          "emOverAction":  q["emOverAction"],
        ])))
      } catch (Err e) {
        // 单条定额配错不该让整页打不开
        EnergyMatrixExt.logWarn(src, "定额进度计算失败 " + q.id.toCode + ": " + e.msg)
      }
    }
    return Etc.makeDictsGrid(null, rows)
  }

  **
  ** 计算一个指标。已实现 —— `emFormula` 走 Axon 求值。
  **
  ** 公式的自由变量由这里绑定，共两个：
  **   `emSelf`  被评价对象的 **Dict**（用来取归一化分母：`emSelf->area`）
  **   `emSpan`  账期
  **
  ** 取数函数（`emLedgerTotal` 等）的第一个参数是 **Ref**，所以公式里要写
  ** `emSelf->id` 而不是 `emSelf` —— 不给 Dict→Ref 留隐式强转，是因为一旦
  ** 强转规则在别的 FIN 版本上不同，指标会静默算错而不是报错。
  **
  ** 典型公式：`emLedgerTotal(emSelf->id, emSpan) / emSelf->area`
  **
  ** 账期同时也进 `EmEvalScope`，这样公式里调用不带 span 参数的表计函数
  ** （`emMeterRead(@x)`）也能拿到同一个账期，与虚拟表的行为一致。
  **
  ** 分母为 0 或缺失时返回 null，**不返回 0** —— "面积没填"和"能耗强度为零"
  ** 是两件事，混在一起会让排名表把没建模完的项目排到第一。
  **
  Number? compute(Str kpiCode, Ref subjectRef, Span span) {
    kpi := byCode(kpiCode)
    formula := kpi["emFormula"] as Str
    if (formula == null || formula.trim.isEmpty) {
      throw ArgErr("指标 $kpiCode 缺少 emFormula")
    }
    subject := cx.proj.readById(subjectRef, true)

    fn := cx.eval("(emSelf, emSpan) => " + formula) as Fn
    if (fn == null) throw ArgErr("指标 $kpiCode 的 emFormula 不是合法表达式：$formula")

    res := EmEvalScope.withSpan(span) |->Obj?| {
      return EmEvalScope.withDepth(subjectRef) |->Obj?| { fn.call(cx, [subject, span]) }
    }

    if (res == null) return null
    n := res as Number
    if (n == null) {
      throw ArgErr("指标 $kpiCode 的公式返回了 " + res.typeof.name + " 而不是数值：$formula")
    }
    // NaN / Infinity 来自 0 作分母 —— 当作"算不出"而不是当作一个数
    if (n.toFloat.isNaN || n.toFloat == Float.posInf || n.toFloat == Float.negInf) return null
    return n
  }

  **
  ** 一批对象的同一指标（排名表用）。单个对象算不出时该行为 null 而不是整表失败。
  **
  Grid computeAll(Str kpiCode, Ref[] subjectRefs, Span span) {
    kpi := byCode(kpiCode)
    rows := Dict[,]
    subjectRefs.each |Ref r| {
      val := (Number?)null
      err := (Str?)null
      try {
        val = compute(kpiCode, r, span)
      } catch (Err e) {
        err = e.msg
      }
      subject := cx.proj.readById(r, false)
      rows.add(Etc.makeDict([
        "emSubjectRef": r,
        "dis":          subject == null ? r.toStr : EmModelTree.dis(subject),
        "emKpiCode":    kpiCode,
        "val":          val,
        "unit":         kpi["unit"],
        "err":          err,
      ]))
    }
    return Etc.makeDictsGrid(Etc.makeDict([
      "emKpiCode": kpiCode,
      "dis":       EmModelTree.dis(kpi),
      "unit":      kpi["unit"],
    ]), rows)
  }

  **
  ** 把指标值写成 `EmKpiPoint` 的历史（L3 归一化点）。**未实现**。
  **
  ** 实现提示：`cx.folio.his.write(...)` 返回 `FolioFuture`，
  ** 必须 `((Future)...).waitFor(10sec)`，否则写入未落盘就返回。
  **
  Void writeKpiPoint(Ref kpiPointRef, DateTime ts, Number val) {
    throw UnsupportedErr("TODO 域 8：EmKpiService.writeKpiPoint 尚未实现")
  }

  **
  ** 定额执行进度。已实现 —— 纯除法，没有口径争议，UI 的定额进度条直接用。
  **
  ** 返回 Dict：quotaRef, emSubjectRef, emMedium, emLimit, used, ratio,
  ** emWarnRatio, level。level ∈ ok | warn | over；用量取自台账
  ** （`EmLedgerQuery.total`）。
  **
  ** `emMedium` 必须回报：`used` 是**只统计这个介质**算出来的，不带介质的
  ** 进度值没法和别的数对上；调用方（如总览按介质挂定额）也需要它来配对。
  ** 定额没限定介质时为 null，表示"全部介质合计"。
  **
  Dict quotaProgress(Ref quotaRef, Span span) {
    quota := cx.proj.readById(quotaRef, true)
    limit := quota["emLimit"] as Number
    if (limit == null || limit.toFloat <= 0f) {
      throw ArgErr("定额 " + quotaRef.toCode + " 缺少有效的 emLimit")
    }

    subject := quota["emSubjectRef"] as Ref
    if (subject == null) throw ArgErr("定额 " + quotaRef.toCode + " 缺少 emSubjectRef")

    medium := quota["emMedium"] as Str
    used := EmLedgerQuery(cx).total(subject, span, medium)
    ratio := used == null ? null : used.toFloat / limit.toFloat

    warnAt := (quota["emWarnRatio"] as Number)?.toFloat ?: 0.9f
    level := "ok"
    if (ratio != null) {
      if (ratio >= 1f) level = "over"
      else if (ratio >= warnAt) level = "warn"
    }

    return Etc.makeDict([
      "quotaRef":     quotaRef,
      "emSubjectRef": subject,
      "emMedium":     medium,
      "emLimit":      limit,
      "used":         used,
      "ratio":        ratio == null ? null : Number(ratio),
      "emWarnRatio":  Number(warnAt),
      "level":        level,
    ])
  }
}

**
** 定额来源（说明书 §4.5）。不同来源在报表中需分别标注，**不可混用**。
**
const class EmQuotaSource
{
  static const Str standard   := "standard"    // 国标 / 地标约束值
  static const Str historical := "historical"  // 历史同期
  static const Str benchmark  := "benchmark"   // 同类对标
  static const Str contract   := "contract"    // 合同约定（能源托管）
  static const Str manual     := "manual"      // 人工下达

  static const Str[] all := [standard, historical, benchmark, contract, manual]

  static Bool isValid(Str? s) { s != null && all.contains(s) }
}
