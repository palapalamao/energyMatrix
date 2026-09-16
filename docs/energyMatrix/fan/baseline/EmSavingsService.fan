using folio
using haystack
using skyarc
using skyarcd

**
** 基线与节能量核证（域 9）—— **骨架桩**。
**
** 已实现：铁律 10 的守卫（`assertPublishable`、`newProjectTags`）与统计验收
** 接线（`validateBaseline`）—— 这些是"对外数字可信"的强制点，不能等。
** 未实现：五种基线模型的拟合、常规/非常规调整、报告期节能量计算。
**
** 实现时必须遵守（说明书 §4.6）：
**   - 新建项目默认 `emVerifyStatus: planned`
**   - `emSavingsPlanned` / `emSavingsMeasured` / `emSavingsVerified` 三个字段
**     任何时候不得相互替代
**   - 统计验收未通过（`emValid != true`）不得置为 `verified`
**   - Option D 的基线来自 CoolSim 校准仿真，不在本 pod 内实现
**
class EmSavingsService
{
  new make(Context cx) { this.cx = cx }

  Context cx

  private static const Str src := "EmSavingsService"

  **
  ** 新建节能项目的默认标签。已实现 —— 铁律 10 的落点：
  ** **默认状态恒为 planned**，调用方无法通过参数绕开。
  **
  static Dict newProjectTags(Str dis, Ref subjectRef, Number? planned := null) {
    Etc.makeDict([
      "energyMatrix":     Marker.val,
      "emSavingsProject": Marker.val,
      "dis":              dis,
      "emSubjectRef":     subjectRef,
      "emSavingsPlanned": planned,
      "emVerifyStatus":   EmVerifyStatus.defaultStatus,
    ])
  }

  **
  ** 对外发布前的守卫。已实现。
  **
  ** 任何把节能量放进报表 / 账单 / 对外材料的路径都必须先过这里。
  ** 未核证时抛错，而不是退回 `emSavingsPlanned` 冒充。
  **
  static Number assertPublishable(Dict project) {
    status := EmVerifyStatus.of(project)
    if (!EmVerifyStatus.canPublish(status)) {
      throw ArgErr("节能量未经核证（emVerifyStatus=$status），禁止以已核证口径对外发布（铁律 10）。" +
        "规划节能量请显式标注为「规划目标」后单独引用 emSavingsPlanned。")
    }
    v := project["emSavingsVerified"] as Number
    if (v == null) throw ArgErr("项目标记为 verified 但缺少 emSavingsVerified")
    return v
  }

  **
  ** 基线统计验收。已实现（计算在 `EmStatsValidator`，这里只做接线与落库）。
  **
  ** 把 `emR2` / `emCvRmse` / `emNmbe` / `emValid` 写回 `EmBaseline` 记录，
  ** 返回验收明细供 UI 逐项渲染。
  **
  Grid validateBaseline(Ref baselineRef, Float[] actual, Float[] predicted) {
    baseline := cx.proj.readById(baselineRef, true)
    modelType := (baseline["emModelType"] as Str) ?: EmModelType.linearRegression
    granularity := (baseline["emGranularity"] as Str) ?: EmGranularity.monthly

    res := EmStatsValidator.evaluate(actual, predicted,
             EmModelType.params(modelType), granularity)

    cx.proj.commit(Diff(baseline, Etc.makeDict([
      "emR2":     res["emR2"],
      "emCvRmse": res["emCvRmse"],
      "emNmbe":   res["emNmbe"],
      "emValid":  res["emValid"],
    ])))

    EnergyMatrixExt.logInfo(src,
      "baseline " + baselineRef.toCode + " 验收 " +
      (res["emValid"] == true ? "通过" : "不通过") +
      " R²=" + res["emR2"] + " CV(RMSE)=" + res["emCvRmse"] + " NMBE=" + res["emNmbe"])

    checks := (res["checks"] as Dict[]) ?: Dict[,]
    return Etc.makeDictsGrid(Etc.dictRemove(res, "checks"), checks)
  }

  **
  ** 拟合基线模型。**未实现**。
  **
  ** 实现提示：自变量（`emIndepVars`：cdd|hdd|occupancy|production|opHours）
  ** 与因变量（基准期台账用量）都只能来自 `EmLedgerQuery`，不得直读点位。
  ** 线性 / 多元回归用最小二乘正规方程即可（纯 Fantom，不需要 Java 库）；
  ** changePoint 需要分段搜索；gbdt 需要外部训练后固化成 ONNX。
  **
  Grid fit(Ref baselineRef) {
    throw UnsupportedErr("TODO 域 9：EmSavingsService.fit 尚未实现")
  }

  **
  ** 计算报告期节能量。**未实现**。
  **
  ** 实现提示：`emSavingsMeasured` = 基线预测量 − 报告期实测量（未调整）；
  ** `emSavingsVerified` = 在此基础上叠加 `EmAdjustment`（routine 气象/使用率、
  ** nonRoutine 面积/工艺变更）。两者写在不同字段，**不得相互替代**。
  **
  Grid computeSavings(Ref projectRef, Span reportSpan) {
    throw UnsupportedErr("TODO 域 9：EmSavingsService.computeSavings 尚未实现")
  }
}
