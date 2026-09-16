using finEntityModelToolsExt
using haystack
using skyarcd

**
** 域 1「空间与组织」的 ModelEntity（说明书 §3.2）。
**
** 空间树来自 `ph::Site / Floor / Space`，本库只扩展计量与考核必需的属性。
** 组织树（业主 / 物业 / 租户 / 成本中心）是与空间**正交的第二棵树**，
** 独立建模，二者通过 `EmZone.emTenantRef` 关联。
**

**
** 站点（说明书表 3-1）：EUI 与人均指标的分母来源。
**
** `emGapThreshold` 是本 pod 的增补字段 —— 关账缺口率闸门允许按站点覆盖
** （不同项目的计量完备程度差别很大），缺省走 `EnergyMatrixExt.defaultGapThreshold`。
**
class ModelEntityEmSite : ModelEntity, EmModelParams
{
  static const Str MODEL_BASE_FILE_NAME  := "EmSite.trio"
  static const File? MODEL_TRIO_FILE     := EmModelParams.getModelTrio(MODEL_BASE_FILE_NAME)
  static const Str MODEL_ID_NAME         := "emSiteModelId"
  static const Str ENTITY_MODEL_ID_VAL   := "_site:emSite"
  static const Str ENTITY_REF_NAME       := "siteRef"
  static const Str ENTITY_DIS_ARG_NAME   := "entityDis"

  new makeFromDb(Context cx, Ref entityId, Bool keepTransient := false)
    : super.makeFromDb(cx, entityId, MODEL_ID_NAME, ENTITY_MODEL_ID_VAL,
                       ENTITY_REF_NAME, keepTransient) {}

  new makeFromTrio(Str? name := null, Dict args := Etc.emptyDict, Bool keepTransient := false)
    : super.makeFromTrio(MODEL_ID_NAME, ENTITY_MODEL_ID_VAL, ENTITY_REF_NAME, MODEL_TRIO_FILE,
        Etc.dictMerge(Etc.makeDict1(ENTITY_DIS_ARG_NAME, name), args), keepTransient) {}
}

**
** 楼层（说明书表 3-1）。
**
** 站点与分区之间的一层，用于按层出报表与按层对标。分区**可选地**挂在楼层下
** （`EmZone.floorRef`）—— 不填就直接挂站点，那是跨楼层分区的情形。
**
class ModelEntityEmFloor : ModelEntity, EmModelParams
{
  static const Str MODEL_BASE_FILE_NAME  := "EmFloor.trio"
  static const File? MODEL_TRIO_FILE     := EmModelParams.getModelTrio(MODEL_BASE_FILE_NAME)
  static const Str MODEL_ID_NAME         := "emFloorModelId"
  static const Str ENTITY_MODEL_ID_VAL   := "_floor:emFloor"
  static const Str ENTITY_REF_NAME       := "floorRef"
  static const Str PARENT_ID_ARG_NAME    := "parentId"
  static const Str ENTITY_DIS_ARG_NAME   := "entityDis"

  new makeFromDb(Context cx, Ref entityId, Bool keepTransient := false)
    : super.makeFromDb(cx, entityId, MODEL_ID_NAME, ENTITY_MODEL_ID_VAL,
                       ENTITY_REF_NAME, keepTransient) {}

  new makeFromTrio(Ref? parentId := null, Str? name := null,
                   Dict args := Etc.emptyDict, Bool keepTransient := false)
    : super.makeFromTrio(MODEL_ID_NAME, ENTITY_MODEL_ID_VAL, ENTITY_REF_NAME, MODEL_TRIO_FILE,
        Etc.dictMerge(Etc.makeDict([PARENT_ID_ARG_NAME: parentId, ENTITY_DIS_ARG_NAME: name]), args),
        keepTransient) {}
}

**
** 计量分区（说明书表 3-1）：能耗核算的**最小空间单元，可跨楼层**。
**
** 说明书 §6 待决事项 OI-04（EmZone 允许跨楼层 / 严格贴合 Haystack 5 space 语义）
** 骨架取「允许跨楼层」—— 与 xeto 现状一致，也符合国内商业综合体按业态分区
** 而不是按楼层分区的实际做法。因此 `EmZone` 挂 `siteRef` 而不是 `floorRef`。
**
class ModelEntityEmZone : ModelEntity, EmModelParams
{
  static const Str MODEL_BASE_FILE_NAME  := "EmZone.trio"
  static const File? MODEL_TRIO_FILE     := EmModelParams.getModelTrio(MODEL_BASE_FILE_NAME)
  static const Str MODEL_ID_NAME         := "emZoneModelId"
  static const Str ENTITY_MODEL_ID_VAL   := "_space:emZone"
  static const Str ENTITY_REF_NAME       := "emSpaceRef"
  static const Str PARENT_ID_ARG_NAME    := "parentId"
  static const Str ENTITY_DIS_ARG_NAME   := "entityDis"

  new makeFromDb(Context cx, Ref entityId, Bool keepTransient := false)
    : super.makeFromDb(cx, entityId, MODEL_ID_NAME, ENTITY_MODEL_ID_VAL,
                       ENTITY_REF_NAME, keepTransient) {}

  new makeFromTrio(Ref? parentId := null, Str? name := null,
                   Dict args := Etc.emptyDict, Bool keepTransient := false)
    : super.makeFromTrio(MODEL_ID_NAME, ENTITY_MODEL_ID_VAL, ENTITY_REF_NAME, MODEL_TRIO_FILE,
        Etc.dictMerge(Etc.makeDict([PARENT_ID_ARG_NAME: parentId, ENTITY_DIS_ARG_NAME: name]), args),
        keepTransient) {}
}

**
** 租户 / 组织单元（说明书表 3-1 的 `EmOrg` / `EmTenant`）。
**
** 说明书 §6 待决事项 OI-05（租户主数据进 Folio / 退化为外键同步 ERP）
** 骨架取「进 Folio」—— 账单付费方与分摊目标都要能被 Ref 指向，
** 外键方案会让 `emTenantRef` 失去引用完整性。
**
** `EmOrg` 与 `EmTenant` 共用一个模板：带 `emTenant` 标记的就是租户
** （说明书里 EmTenant 本身就继承自 EmOrg）。
**
class ModelEntityEmTenant : ModelEntity, EmModelParams
{
  static const Str MODEL_BASE_FILE_NAME  := "EmTenant.trio"
  static const File? MODEL_TRIO_FILE     := EmModelParams.getModelTrio(MODEL_BASE_FILE_NAME)
  static const Str MODEL_ID_NAME         := "emTenantModelId"
  static const Str ENTITY_MODEL_ID_VAL   := "_org:emTenant"
  static const Str ENTITY_REF_NAME       := "emTenantRef"
  static const Str PARENT_ID_ARG_NAME    := "parentId"
  static const Str ENTITY_DIS_ARG_NAME   := "entityDis"

  new makeFromDb(Context cx, Ref entityId, Bool keepTransient := false)
    : super.makeFromDb(cx, entityId, MODEL_ID_NAME, ENTITY_MODEL_ID_VAL,
                       ENTITY_REF_NAME, keepTransient) {}

  new makeFromTrio(Ref? parentId := null, Str? name := null,
                   Dict args := Etc.emptyDict, Bool keepTransient := false)
    : super.makeFromTrio(MODEL_ID_NAME, ENTITY_MODEL_ID_VAL, ENTITY_REF_NAME, MODEL_TRIO_FILE,
        Etc.dictMerge(Etc.makeDict([PARENT_ID_ARG_NAME: parentId, ENTITY_DIS_ARG_NAME: name]), args),
        keepTransient) {}
}

**
** 用能设备的「能耗身份」（说明书 §3.5 的 `EmLoad`）。
**
** 铁律 5：**不重复定义冷机、水泵、空调机组** —— 那是 `ph.equips` 与
** CoolMatrix / heatMatrix 的职责。energyMatrix 只通过 `EmLoad` 给既有设备
** 挂上分项归类（`emSubItem`）、计量归属（`emMeterRef`）与额定值。
**
** 因此这个模板**不建新 equip**：它是一组打在既有 equip 上的标签。
** 用 `EmEntityCrud.attachLoad` 把它合并到目标设备，而不是 `commit` 一个新记录。
**
class ModelEntityEmLoad : ModelEntity, EmModelParams
{
  static const Str MODEL_BASE_FILE_NAME  := "EmLoad.trio"
  static const File? MODEL_TRIO_FILE     := EmModelParams.getModelTrio(MODEL_BASE_FILE_NAME)
  static const Str MODEL_ID_NAME         := "emLoadModelId"
  static const Str ENTITY_MODEL_ID_VAL   := "_equip:emLoad"
  static const Str ENTITY_REF_NAME       := "emLoadRef"
  static const Str PARENT_ID_ARG_NAME    := "parentId"
  static const Str ENTITY_DIS_ARG_NAME   := "entityDis"

  new makeFromDb(Context cx, Ref entityId, Bool keepTransient := false)
    : super.makeFromDb(cx, entityId, MODEL_ID_NAME, ENTITY_MODEL_ID_VAL,
                       ENTITY_REF_NAME, keepTransient) {}

  new makeFromTrio(Ref? parentId := null, Str? name := null,
                   Dict args := Etc.emptyDict, Bool keepTransient := false)
    : super.makeFromTrio(MODEL_ID_NAME, ENTITY_MODEL_ID_VAL, ENTITY_REF_NAME, MODEL_TRIO_FILE,
        Etc.dictMerge(Etc.makeDict([PARENT_ID_ARG_NAME: parentId, ENTITY_DIS_ARG_NAME: name]), args),
        keepTransient) {}
}
