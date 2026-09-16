using concurrent
using haystack
using skyarc
using skyarcd

**
** energyMatrix 运行时扩展（只管生命周期）。
**
** 不可变 `const` Ext —— 业务逻辑全部下沉到 `fan/meter/`、`fan/ledger/`、
** `fan/audit/` 等能力域的 service 类，经薄壳 `EnergyMatrixLib` 暴露成 Axon。
** 任何可变状态只能放 `AtomicBool` / `AtomicRef` / `ConcurrentMap` / Actor，
** 绝不能是普通字段（const class 里写非 const 字段直接编译失败）。
**
** onStart 里不直接写 Folio —— 需要写库的初始化经调度 Actor 或 Job 派发。
**
@ExtMeta
{
  name    = "energyMatrix"
  // @ExtMeta.depends 列的是目标 **Ext 名**（各依赖自己的 @ExtMeta.name），
  // 不是 pod 名：finStackCoreExt 注册为 "finStackCore"，
  // finEntityModelToolsExt 注册为 "finEntityModelTools"。
  depends = ["haystack", "finStackCore", "finEntityModelTools"]
}
const class EnergyMatrixExt : Ext
{
  static const ExtMeta? extMeta := EnergyMatrixExt#.facet(ExtMeta#, true) as ExtMeta
  static const Str metaName := extMeta.name

  ** 关账缺口率闸门的默认阈值（说明书 §5.2：默认 5%，超过即阻断关账）。
  ** 站点可在 projMeta / site 记录上用 `emGapThreshold` 覆盖。
  static const Float defaultGapThreshold := 0.05f

  ** 就绪标志 —— onStart 走完才翻 true。测试 setup 需要轮询它。
  const AtomicBool isConfigured := AtomicBool(false)

  ** 取当前运行中的 Ext 实例。
  static EnergyMatrixExt cur() { Context.cur.proj.ext(metaName) }

//////////////////////////////////////////////////////////////////////////
// 日志 —— 全项目统一走这四个方法，绝不用 echo
//////////////////////////////////////////////////////////////////////////

  static Log cxLog() {
    Context.cur(false)?.proj?.ext(metaName)?.log ?: Log.get(metaName)
  }

  static Void logInfo(Str src, Str msg) { cxLog.info("[$src] $msg") }
  static Void logWarn(Str src, Str msg) { cxLog.warn("[$src] $msg") }
  ** debug 默认关闭，用于逐条台账 / 逐块表的高频日志，避免刷屏。
  static Void logDebug(Str src, Str msg) { cxLog.debug("[$src] $msg") }
  static Void logErr(Str src, Str msg, Err? err := null) {
    if (err != null) cxLog.err("[$src] $msg", err)
    else             cxLog.err("[$src] $msg")
  }

//////////////////////////////////////////////////////////////////////////
// Observers
//////////////////////////////////////////////////////////////////////////

  ** 注册在本扩展上的 Folio 变更订阅。字段必须 const。
  const IObserver[] observers := [
    EmMeterTreeObserver(this),
  ]

//////////////////////////////////////////////////////////////////////////
// 生命周期
//////////////////////////////////////////////////////////////////////////

  override Void onStart() {
    try {
      observers.each |IObserver o| { o.onStart }
      isConfigured.getAndSet(true)
      logInfo(metaName, "started (gapThreshold=" + (defaultGapThreshold * 100f) + "%)")
    } catch (Err e) {
      logErr(metaName, "onStart failed", e)
    }
  }

  override Void onStop() {
    observers.each |IObserver o| {
      try { o.onStop } catch (Err e) { logErr(metaName, "onStop failed for $o.typeof.name", e) }
    }
    isConfigured.getAndSet(false)
    logInfo(metaName, "stopped")
  }
}
