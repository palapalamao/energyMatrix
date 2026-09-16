using haystack
using skyarc
using skyarcd

**
** 分摊规则引擎（域 6）—— **骨架桩**。
**
** 本轮交付实现的是「计量 + 台账」闭环；分摊引擎给出完整的接口契约与规则
** 加载 / 排序 / 校验，但**七种分摊方法的计算尚未实现**。
**
** 为什么这样切：分摊结果直接进台账、直接进账单，一旦口径错了就要走红冲。
** 说明书 §6 的待决事项 OI-01（台账落库粒度）与 OI-05（租户主数据归属）都会
** 改变分摊的实现方式，在它们敲定之前实现七种方法是返工。
**
** `run` 在**站点没有生效规则时返回空 Grid**（关账流程可以正常走完），
** 只有确实存在生效规则时才抛 `UnsupportedErr` —— 让"有规则却不执行"这件事
** 无法被静默跳过。
**
** 实现时必须遵守：
**   1. 结果条目 `emDataSource` 恒为 `allocated`，且必须带 `emRuleRef`
**   2. 多条规则命中同一对象时按 `emPriority` 升序执行
**   3. 规则携带 `emEffective` 生效期；换版即新增记录，旧版只读
**   4. 分摊不得改变总量：Σ分摊结果 == 源表用量（允许最后一份吸收舍入差）
**
class EmAllocEngine
{
  new make(Context cx) { this.cx = cx }

  Context cx

  private static const Str src := "EmAllocEngine"

  **
  ** 加载站点在给定时刻生效的分摊规则，按 `emPriority` 升序排。
  ** 已实现 —— 规则的加载与排序是关账流程的前置检查，不能等。
  **
  Dict[] activeRules(Ref siteRef, DateTime at) {
    all := cx.proj.readAllList("emAllocRule and not disabled and siteRef==" + siteRef.toCode)
    out := Dict[,]
    all.each |Dict r| {
      eff := r["emEffective"] as Span
      if (eff != null && !eff.contains(at)) return
      out.add(r)
    }
    out.sort |Dict a, Dict b -> Int| {
      return priority(a) <=> priority(b)
    }
    return out
  }

  private static Int priority(Dict r) {
    n := r["emPriority"] as Number
    return n == null ? 1000 : n.toFloat.toInt
  }

  **
  ** 规则配置校验。已实现 —— 让配置错误在配置期就暴露，而不是在关账夜里。
  ** 返回问题清单，空表示通过。
  **
  Dict[] validateRule(Dict rule) {
    issues := Dict[,]

    method := rule["emMethod"] as Str
    if (!EmAllocMethod.isValid(method)) {
      issues.add(err("alloc.method.invalid",
        "emMethod 非法：" + (method ?: "<null>") + "（合法值 " + EmAllocMethod.all.join("|") + "）"))
    }

    if (rule["emSourceRef"] as Ref == null) {
      issues.add(err("alloc.source.missing", "分摊规则缺少 emSourceRef（被分摊的源表）"))
    }

    if (rule["emEffective"] as Span == null) {
      issues.add(err("alloc.effective.missing",
        "分摊规则缺少 emEffective 生效期；换版必须新增记录，旧版只读"))
    }

    if (method == EmAllocMethod.byFixedRatio && rule["emShares"] == null) {
      issues.add(err("alloc.shares.missing", "byFixedRatio 必须提供 emShares"))
    }
    if (method == EmAllocMethod.custom) {
      f := rule["emFormula"] as Str
      if (f == null || f.trim.isEmpty) {
        issues.add(err("alloc.formula.missing", "custom 方法必须提供 emFormula"))
      }
    }

    return issues
  }

  **
  ** 执行站点在账期内的全部生效规则，生成 allocated 台账条目。
  **
  ** 返回 Grid，列：emRuleRef, emMethod, emTargetRef, val, status。
  ** 无生效规则时返回空 Grid（关账可继续）。
  **
  Grid run(Ref siteRef, Span span, Str granularity := EmGranularity.defaultGranularity) {
    rules := activeRules(siteRef, span.start)
    if (rules.isEmpty) {
      EnergyMatrixExt.logDebug(src, "site " + siteRef.toCode + " 无生效分摊规则，跳过")
      return Etc.makeDictsGrid(null, Dict[,])
    }

    names := Str[,]
    rules.each |Dict r| { names.add(((r["dis"] as Str) ?: r.id.toStr)) }
    throw UnsupportedErr(
      "分摊引擎尚未实现（域 6 骨架桩），但站点 " + siteRef.toCode + " 有 " + rules.size +
      " 条生效规则：" + names.join(", ") +
      "。请先实现 EmAllocEngine.allocate，或临时 disable 这些规则后再关账。")
  }

  **
  ** 执行单条规则。**未实现** —— 七种方法的计算入口。
  **
  ** 实现提示（说明书 §4.3）：
  **   byArea         权重取 target 的 `area`（租赁面积）或 `emCoolArea`（空调面积）
  **   byHeadcount    权重取 `emOccupancy`
  **   byFixedRatio   权重取 `emShares` 里各 `EmAllocShare.emWeight`
  **   byRatedRuntime 权重 = `emRatedPower` × 运行时长（需读 EmLoad 的运行反馈）
  **   byRemainder    源表用量 − 已计量子表之和，即 `EmGapCalc.of(...).emGapVal`
  **   bySubMeterPro  按各已计量子表用量占比分摊公摊部分
  **   custom         `emFormula` 的 Axon 表达式，经 EmEvalScope 注入账期
  **
  Grid allocate(Dict rule, Span span, Str granularity) {
    throw UnsupportedErr("TODO 域 6：EmAllocEngine.allocate（方法 " +
      ((rule["emMethod"] as Str) ?: "?") + "）尚未实现")
  }

  private static Dict err(Str code, Str msg) {
    Etc.makeDict(["level": "err", "code": code, "msg": msg])
  }
}
