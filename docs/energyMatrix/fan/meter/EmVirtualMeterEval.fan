using axon
using haystack
using skyarc
using skyarcd

**
** 虚拟表求值（说明书 §3.3.2）。
**
** 铁律 3：**物理表与虚拟表同构** —— 差值法、分摊法、多表求和在模型层无差别，
** 业务层不感知实现方式。所以本类的返回结构与 `EmMeterReading.consumption`
** 完全一致，上层拿到一块表只管调 `EmMeterConsumption.of(...)`。
**
** 虚表的用量来自 `emFormula`（Axon 表达式），求值上下文里注入了 span
** 与本表 ref，可用的内建函数：
**   emMeterRead(meterRef)      某表在当前账期的用量
**   emSubMeterSum(meterRef)    某表的直接子表用量之和（check 表不计入）
** 这两个函数在 lib/queries.trio 里定义，由 EnergyMatrixLib 的 @Axon 提供实现。
**
** 例（说明书原文）：
**   V-B1-GAP  emFormula: "emMeterRead(@M-B1-01) - emSubMeterSum(@M-B1-01)"
**   V-D2-ALC  emFormula: "emAllocByArea(@M-D2-01, tenantSet)"
**
class EmVirtualMeterEval
{
  new make(Context cx) { this.cx = cx }

  Context cx

  private static const Str src := "EmVirtualMeterEval"

  **
  ** 对虚表求值，返回与 `EmMeterReading.consumption` 同构的 Dict。
  **
  ** 求值失败不吞异常成 null —— 一块虚表算不出来是配置错误，必须显式暴露，
  ** 否则它会以"0 用量"的形式悄悄进账。
  **
  Dict consumption(Ref meterRef, Span span) {
    meter := cx.proj.readById(meterRef, true)
    medium := EmMedium.of(meter)

    if (meter.missing("emVirtual") && EmMeterRole.of(meter) != EmMeterRole.virtualRole) {
      throw ArgErr("$meterRef.toCode 不是虚拟表（缺 emVirtual 标记）")
    }

    formula := meter["emFormula"] as Str
    if (formula == null || formula.trim.isEmpty) {
      throw ArgErr("虚拟表 " + meterRef.toCode + " 缺少 emFormula")
    }

    val := eval(formula, meterRef, span)

    // 虚表的来源等级：带 emGap 标记的缺口表是差值推导（derived）；
    // 由分摊规则驱动的虚表由 EmAllocEngine 写台账时覆写为 allocated。
    source := EmDataSource.derived

    return Etc.makeDict([
      "meterRef":     meterRef,
      "val":          val,
      // 虚表本身没有采样，完好率继承自其依赖 —— 骨架阶段先给 1.0，
      // 并在 README 记为待办：应取所有被引用表的 emQuality 最小值。
      "emQuality":    Number(1f),
      "emDataSource": source,
      "emMedium":     medium,
      "emReasons":    Etc.makeDict(["virtual": Number(1)]),
    ])
  }

  **
  ** 在账期作用域里求 Axon 表达式。
  **
  ** `emSelf` 以局部变量形式注入（公式里可直接引用本表）；账期走
  ** `EmEvalScope`（Actor.locals），因此说明书原文那种不带 span 参数的写法
  ** `emMeterRead(@M-B1-01) - emSubMeterSum(@M-B1-01)` 可以直接用。
  **
  Number? eval(Str formula, Ref selfRef, Span span) {
    fn := cx.eval("(emSubjectParam) => do emSelf: emSubjectParam; (" + formula + ") end") as Fn
    if (fn == null) throw ArgErr("虚拟表公式不是合法表达式：$formula")
    try {
      res := EmEvalScope.withSpan(span) |->Obj?| {
        return EmEvalScope.withDepth(selfRef) |->Obj?| { return fn.call(cx, [selfRef]) }
      }
      if (res == null) return null
      if (res is Number) return res
      throw ArgErr("emFormula 求值结果不是 Number：" + res.typeof.name)
    } catch (Err e) {
      EnergyMatrixExt.logErr(src, "虚表求值失败 " + selfRef.toCode + " : " + formula, e)
      throw e
    }
  }
}
