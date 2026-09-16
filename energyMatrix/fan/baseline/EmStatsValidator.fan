using haystack

**
** IPMVP / ASHRAE Guideline 14 的基线模型统计验收（说明书 §4.6）。
**
** 纯数学，不碰 Folio —— 可以直接单测，也可以被前端「基线模型统计验收卡」
** 复用同一套判据。
**
** 验收口径（说明书原文）：月度口径要求决定系数不低于 0.75、CV(RMSE) 不超过
** 15%、NMBE 在正负 5% 以内；小时口径 CV(RMSE) 放宽至 30%。
** 结果记录在 `emR2` / `emCvRmse` / `emNmbe` / `emValid` 字段。
**
** 这套判据是铁律 10 的技术支点：不通过验收就不允许把节能量标成
** `verified`，只能停在 `computed`。
**
const class EmStatsValidator
{
  ** 月度口径阈值。
  static const Float monthlyR2Min     := 0.75f
  static const Float monthlyCvRmseMax := 0.15f
  ** 小时口径阈值（CV(RMSE) 放宽）。
  static const Float hourlyCvRmseMax  := 0.30f
  ** NMBE 绝对值上限，两种口径相同。
  static const Float nmbeMax          := 0.05f

  **
  ** 计算三项统计量。
  **
  ** actual     实测值序列
  ** predicted  模型预测值序列（与 actual 等长、同序）
  ** params     模型参数个数 p（ASHRAE G14 的自由度修正用 n-p；一元回归 p=2）
  **
  ** 返回 Dict：emR2, emCvRmse, emNmbe, emN。
  ** 样本不足（n <= params）时三项都为 null —— 自由度不足时给出的统计量没有意义。
  **
  static Dict stats(Float[] actual, Float[] predicted, Int params := 2) {
    n := actual.size
    if (n != predicted.size) throw ArgErr("actual 与 predicted 长度不一致：$n vs $predicted.size")
    if (n <= params) {
      return Etc.makeDict(["emR2": null, "emCvRmse": null, "emNmbe": null, "emN": Number(n)])
    }

    sum := 0f
    actual.each |Float v| { sum = sum + v }
    mean := sum / n.toFloat

    ssTot := 0f
    ssRes := 0f
    bias  := 0f
    for (i := 0; i < n; ++i) {
      a := actual[i]
      p := predicted[i]
      d := a - mean
      r := a - p
      ssTot = ssTot + d * d
      ssRes = ssRes + r * r
      bias  = bias + r
    }

    dof := (n - params).toFloat
    r2 := ssTot == 0f ? null : 1f - ssRes / ssTot
    rmse := (ssRes / dof).sqrt
    cv := mean == 0f ? null : rmse / mean
    nmbe := mean == 0f ? null : bias / (dof * mean)

    return Etc.makeDict([
      "emR2":     r2   == null ? null : Number(r2),
      "emCvRmse": cv   == null ? null : Number(cv),
      "emNmbe":   nmbe == null ? null : Number(nmbe),
      "emN":      Number(n),
    ])
  }

  **
  ** 按粒度判定是否通过验收。
  **
  ** granularity 取 `EmGranularity` 的值；hourly 用放宽后的 CV(RMSE) 阈值，
  ** 其余（daily/monthly/yearly）用月度口径。**未知粒度按月度口径**（更严），
  ** 不能因为粒度没填就放行。
  **
  ** 返回 Dict：emValid(Bool), checks(Dict[])，每条 check 是
  ** {name, value, limit, pass}。UI 直接渲染成逐项通过 / 不通过。
  **
  static Dict validate(Dict stats, Str granularity := EmGranularity.monthly) {
    cvMax := granularity == EmGranularity.hourly ? hourlyCvRmseMax : monthlyCvRmseMax

    r2   := (stats["emR2"] as Number)?.toFloat
    cv   := (stats["emCvRmse"] as Number)?.toFloat
    nmbe := (stats["emNmbe"] as Number)?.toFloat

    checks := Dict[,]
    checks.add(check("R²",       r2,   monthlyR2Min, r2   != null && r2 >= monthlyR2Min, ">="))
    checks.add(check("CV(RMSE)", cv,   cvMax,        cv   != null && cv <= cvMax,        "<="))
    checks.add(check("NMBE",     nmbe, nmbeMax,      nmbe != null && nmbe.abs <= nmbeMax, "|x|<="))

    valid := true
    checks.each |Dict c| { if (c["pass"] != true) valid = false }

    return Etc.makeDict([
      "emValid":       valid,
      "emGranularity": granularity,
      "checks":        checks,
    ])
  }

  ** 一步到位：算统计量并判定。返回合并后的 Dict。
  static Dict evaluate(Float[] actual, Float[] predicted, Int params := 2,
                       Str granularity := EmGranularity.monthly) {
    s := stats(actual, predicted, params)
    v := validate(s, granularity)
    return Etc.dictMerge(s, v)
  }

  private static Dict check(Str name, Float? value, Float limit, Bool pass, Str op) {
    Etc.makeDict([
      "name":  name,
      "value": value == null ? null : Number(value),
      "limit": Number(limit),
      "op":    op,
      "pass":  pass,
    ])
  }
}
