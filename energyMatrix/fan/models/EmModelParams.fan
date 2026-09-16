using finEntityModelToolsExt
using haystack
using skyarcd

**
** 全部 energyMatrix ModelEntity 共享的 mixin。
**
** 定位 pod 内 `res/defaultModels/` 下的 `.trio` 模板（每个模板是一条 equip /
** site / space 记录 + 它的子 point 记录，用 finEntityModelToolsExt 的 DSL 书写：
** `Arg("parentId")`、`Walk("floorRef>siteRef")`、`disMacro`、`<x>ModelId`）。
**
** `PROJ_TAG` = `energyMatrix`，是本库托管的每条记录都必须带的全局标记 ——
** Axon 查询靠它把本产品的对象树与同一 Folio 里的 CoolMatrix / heatMatrix
** 记录隔离开（说明书 §2.3 的强制约束）。
**
** 注意 `getModelTrio` 刻意用 `checked=false` + `echo` 而不是抛错：
** static const 字段初始化时抛错会被 JVM 包成 `ExceptionInInitializerError`，
** 原因信息全部丢失，排查代价极高。
**
mixin EmModelParams
{
  ** 本库全局标记。
  static const Str PROJ_TAG := "energyMatrix"

  ** trio 模板目录（打包进 pod 的 resDirs）。
  static const Uri TEMPLATES_PROD_PATH := `/res/defaultModels/`

  static File? getModelTrio(Str modelFileName, Uri podsFolderPath := TEMPLATES_PROD_PATH) {
    file := EnergyMatrixExt#.pod.file(podsFolderPath + modelFileName.toUri, false)
    if (file == null) {
      echo("[WARNING] EmModelParams.getModelTrio: ${podsFolderPath + modelFileName.toUri} not found in pod")
    }
    return file
  }
}
