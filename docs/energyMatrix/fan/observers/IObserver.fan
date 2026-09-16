using concurrent
using haystack
using skyarc
using skyarcd

**
** Folio 变更订阅者的统一接口。
**
** 实现类必须是 `const class`（`EnergyMatrixExt.observers` 是 const 字段）。
** `observe` 把回调包进一个 Actor：回调跑在 ext 的 actor 池里，**没有请求级
** Context**，所以 `onEvent` 在调用 handler 前临时装一个 Context 进
** `Actor.locals`，并在 finally 里恢复 —— 少了这一步，handler 里任何
** `cx.proj.read` / Axon eval 都会失败。
**
** 回调里不要做长计算：actor 池是共享的，长任务会拖垮其他订阅者，
** 应改为投递给 hxTask / Job。
**
const mixin IObserver
{
  ** 宿主扩展。
  abstract EnergyMatrixExt ext()

  ** 注册订阅。
  abstract Void onStart()

  ** 注销订阅（Ext.onStop 调用）。
  abstract Void onStop()

  **
  ** 订阅辅助：obs 为观察者名（如 "obsCommits"），handler 为本类上的
  ** 回调方法（签名 `Void f(Dict msg)`），config 为观察者配置 Dict。
  **
  protected Void observe(Str obs, Method handler, Dict config) {
    fn := #onEvent.func.bind([this, handler])
    ext.observe(obs, config, Actor(ext.proj.extActorPool, fn))
  }

  ** Actor 回调入口：装 Context → 调 handler → 恢复。
  private Void onEvent(Method handler, Dict msg) {
    key := Etc.cxActorLocalsKey
    old := Actor.locals[key]
    Actor.locals[key] = Context(ext.sys, User.conn, ext.proj)
    try {
      handler.call(this, msg)
    } catch (Err e) {
      EnergyMatrixExt.logErr(typeof.name, "observer callback failed", e)
    } finally {
      if (old == null) Actor.locals.remove(key)
      else             Actor.locals[key] = old
    }
  }
}
