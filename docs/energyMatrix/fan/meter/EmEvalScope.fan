using concurrent
using haystack

**
** 虚拟表 / KPI 公式求值时的"当前账期"作用域。
**
** 说明书 §3.3.2 给的公式原文是 `emMeterRead(@M-B1-01) - emSubMeterSum(@M-B1-01)`
** —— 不带账期参数。Axon 函数不捕获调用方的局部变量，所以账期必须另找通道。
**
** 这里用 `Actor.locals`：Axon 求值与调用方在同一线程上，进入前 set、finally
** 里恢复，作用域精确且不需要把 span 混进公式文本。同一个模式在
** `IObserver.onEvent` 里用来注入 Context。
**
** 公式也可以显式写第二个参数（`emMeterRead(@x, mySpan)`），那时不看本作用域。
**
const class EmEvalScope
{
  private static const Str spanKey := "energyMatrix.evalSpan"

  ** 当前账期；不在求值作用域内时为 null。
  static Span? curSpan() { Actor.locals[spanKey] as Span }

  **
  ** 在指定账期作用域内执行 f，结束后无条件恢复原值。
  ** 嵌套调用安全（内层结束后外层账期仍然有效）。
  **
  static Obj? withSpan(Span span, |->Obj?| f) {
    old := Actor.locals[spanKey]
    Actor.locals[spanKey] = span
    try {
      return f()
    } finally {
      if (old == null) Actor.locals.remove(spanKey)
      else             Actor.locals[spanKey] = old
    }
  }

  ** 取当前账期，缺失即报错 —— 公式没有账期就算不出用量，不能默默用"今天"兜底。
  static Span reqSpan() {
    s := curSpan
    if (s == null) throw ArgErr("不在账期求值作用域内：公式需要显式传 span，或经 EmEvalScope.withSpan 调用")
    return s
  }

//////////////////////////////////////////////////////////////////////////
// 递归深度守卫
//////////////////////////////////////////////////////////////////////////

  private static const Str depthKey := "energyMatrix.evalDepth"

  ** 虚表公式的最大嵌套深度。正常项目里虚表引用虚表不会超过两三层。
  static const Int maxDepth := 8

  **
  ** 在深度守卫内执行 f。
  **
  ** 虚表的 `emFormula` 可以引用别的表，别的表又可以是虚表 —— 配错一个引用
  ** 就能构成环（最典型的是缺口表的公式绕回它自己的源表）。没有守卫时这会
  ** 直接把栈打爆，报出来的是一串看不懂的 StackOverflow；有守卫就能明确告诉
  ** 使用者"是哪块表的公式成环了"。
  **
  static Obj? withDepth(Ref meterRef, |->Obj?| f) {
    cur := (Actor.locals[depthKey] as Int) ?: 0
    if (cur >= maxDepth) {
      throw ArgErr("虚表公式嵌套深度超过 $maxDepth 层（" + meterRef.toCode +
        "）—— 检查 emFormula 是否形成了循环引用")
    }
    Actor.locals[depthKey] = cur + 1
    try {
      return f()
    } finally {
      if (cur == 0) Actor.locals.remove(depthKey)
      else          Actor.locals[depthKey] = cur
    }
  }
}
