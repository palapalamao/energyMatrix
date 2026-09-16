using concurrent
using haystack
using skyarc
using skyarcd

**
** 监听表计记录变更，作废对应站点的计量树缓存。
**
** 计量树（`submeterOf` 有向无环图 + 角色汇总）在每次查询时重建代价不低，
** 而表计拓扑是低频变更，所以缓存在 `EmMeterTree` 里、由本订阅者作废。
**
** 只订阅带 `energyMatrix` 且 `meter` 的记录 —— 不要订阅全部 equip，
** 否则任何设备改动都会触发一次作废。
**
const class EmMeterTreeObserver : IObserver
{
  new make(EnergyMatrixExt ext) { this.ext = ext }

  override const EnergyMatrixExt ext

  private static const Str src := "EmMeterTreeObserver"

  override Void onStart() {
    observe("obsCommits", #onCommit, Etc.makeDict([
      "obsFilter":  "energyMatrix and meter",
      "obsAdds":    Marker.val,
      "obsUpdates": Marker.val,
      "obsRemoves": Marker.val,
    ]))
    EnergyMatrixExt.logInfo(src, "subscribed to obsCommits(energyMatrix and meter)")
  }

  override Void onStop() {
    EmMeterTree.invalidateAll
  }

  ** obsCommits 回调：msg["subType"] 是 "added"/"updated"/"removed"，
  ** msg["newRec"] / msg["oldRec"] 是 Dict。
  Void onCommit(Dict msg) {
    rec := (msg["newRec"] as Dict) ?: (msg["oldRec"] as Dict)
    if (rec == null) return
    siteRef := rec["siteRef"] as Ref
    EmMeterTree.invalidate(siteRef)
    EnergyMatrixExt.logDebug(src,
      "meter " + (msg["subType"] ?: "?") + " → invalidated tree for site " +
      (siteRef?.toCode ?: "<all>"))
  }
}
