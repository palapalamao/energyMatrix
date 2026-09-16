using finEntityModelToolsExt
using haystack
using skyarcd

**
** 计量表基类模型（`res/defaultModels/EmMeterBase.trio`）。
**
** FIN 的 ModelEntity 没有原生的模型继承 —— **继承 = Fantom 类继承 + trio 组合**：
** 基类 `makeFromTrio` 载入基类 trio（equip + 共享的 L1/L2 点位），子类在构造体
** 里 `readTrioWithSwizzle(子 trio)` + `extendByDicts(...)` 叠加介质专属内容。
**
** 六种介质的表在结构上只差「介质标记 + 单位 + 几个专属点位」，正是这套组合
** 继承要解决的场景；如果每种介质各写一份独立 trio，共享点位改一次要改六处。
**
** 子 trio 的书写约束（踩过的坑）：
**   - equip 与**重述的继承点**同时带子 modelId + 基 modelId（后者是合并 match-key）
**   - 重述的继承点必须把 `equipRef` 重指到子 equip，否则 equipRef 悬挂
**   - 新增的 delta 点只带子 modelId
**   - 基类 trio 里每个 `Arg("x")` **必须带默认值**（`Arg("x:default")`，`N` = null），
**     否则基类先于子 args 加载时报 `ParseErr: Missing argument ... no default`
**   - 默认值不能是"数字开头但非数值"（如 `200x100`），会在 Arg 解析时报 ParseErr
**
class ModelEntityEmMeterBase : ModelEntity, EmModelParams
{
  static const Str MODEL_BASE_FILE_NAME  := "EmMeterBase.trio"
  static const File? MODEL_TRIO_FILE     := EmModelParams.getModelTrio(MODEL_BASE_FILE_NAME)
  static const Str MODEL_ID_NAME         := "emMeterModelId"
  static const Str ENTITY_MODEL_ID_VAL   := "_equip:emMeter"
  static const Str ENTITY_REF_NAME       := "emMeterRef"
  static const Str PARENT_ID_ARG_NAME    := "parentId"
  static const Str ENTITY_DIS_ARG_NAME   := "entityDis"

  ** 基类的 L1 / L2 点位在模型里的 id 后缀。
  static const Str POINT_L1_TOTAL := "l1Total"
  static const Str POINT_L2_DELTA := "l2Delta"

  **
  ** 从库里加载已有实体。model-id 三元组是可覆写默认参 —— 子类传自己的那一组。
  **
  new makeFromDb(Context cx, Ref entityId,
                 Str modelIdName := MODEL_ID_NAME,
                 Str entityModelIdVal := ENTITY_MODEL_ID_VAL,
                 Str entityRefName := ENTITY_REF_NAME,
                 Bool keepTransient := false)
    : super.makeFromDb(cx, entityId, modelIdName, entityModelIdVal, entityRefName, keepTransient) {}

  **
  ** 从 trio 模板构造（内存态，需再调 `commit(cx)` 才落库）。
  **
  new makeFromTrio(Ref? parentId := null, Str? name := null,
                   Dict args := Etc.emptyDict, Bool keepTransient := false)
    : super.makeFromTrio(MODEL_ID_NAME, ENTITY_MODEL_ID_VAL, ENTITY_REF_NAME, MODEL_TRIO_FILE,
        Etc.dictMerge(Etc.makeDict([PARENT_ID_ARG_NAME: parentId, ENTITY_DIS_ARG_NAME: name]), args),
        keepTransient) {}

//////////////////////////////////////////////////////////////////////////
// 访问器
//////////////////////////////////////////////////////////////////////////

  ** 按 model-id 后缀取子点位的 Ref。
  ** `findDictBasedOnModelId` 匹配**任意** `*ModelId` 标签，所以基类访问器用
  ** 基 modelId、子类新增点的访问器用子 modelId，都能解析。
  Ref? pointRef(Str suffix, Bool checked := true) {
    findDictBasedOnModelId("${ENTITY_MODEL_ID_VAL}_point:$suffix", checked)?.id
  }

  ** L1 累积读数点（表底数）。
  Ref? l1TotalRef(Bool checked := true) { pointRef(POINT_L1_TOTAL, checked) }

  ** L2 区间增量点。
  Ref? l2DeltaRef(Bool checked := true) { pointRef(POINT_L2_DELTA, checked) }
}
