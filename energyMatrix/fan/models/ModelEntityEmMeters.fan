using finEntityModelToolsExt
using haystack
using skyarcd

**
** 六种介质的表计模型 + 虚拟表 + 缺口表，全部继承自 `ModelEntityEmMeterBase`。
**
** 每个子类只做两件事：
**   1. 声明自己的 model-id 三元组（`<x>MeterModelId` / `_equip:<x>Meter`）
**   2. 在构造体里叠加介质专属 trio（`readTrioWithSwizzle` + `extendByDicts`）
**
** 介质与 Haystack 本体的映射（phIoT 的 `lib/meter.trio` + `lib/substance.trio`）：
**   电   `equip meter elec`            （conjunct `elec-meter`）
**   水   `equip meter water`           （`domestic-water` 由 emWaterType 细分）
**   燃气 `equip meter naturalGas`
**   蒸汽 `equip meter steam`
**   冷量 `equip meter chilled water`   （`chilled-water`）
**   热量 `equip meter hot water`       （`hot-water`）
**
** 注意 xeto 原稿在 `EmElecMeter` 上挂了 `elecMeter` 这个小驼峰 marker，
** 但 phIoT 里并不存在该 marker —— `elec-meter` 是 conjunct（`elec` + `meter`）。
** 这里按 phIoT 的真实本体写，详见 README「与说明书的偏差」#7。
**

**
** 电表（说明书 §3.3 表 3-2）：累积电量、有功/无功功率、功率因数、电压、电流、
** 频率、尖峰平谷分时电量、最大需量。
**
class ModelEntityEmElecMeter : ModelEntityEmMeterBase
{
  static const Str MODEL_EXT_FILE_NAME    := "EmElecMeter.trio"
  static const File? MODEL_EXT_TRIO_FILE  := EmModelParams.getModelTrio(MODEL_EXT_FILE_NAME)
  static const Str MODEL_ID_NAME_EXT      := "emElecMeterModelId"
  static const Str ENTITY_MODEL_ID_VAL_EXT := "_equip:emElecMeter"

  new makeFromDb(Context cx, Ref entityId, Bool keepTransient := false)
    : super.makeFromDb(cx, entityId, MODEL_ID_NAME_EXT, ENTITY_MODEL_ID_VAL_EXT,
                       ENTITY_REF_NAME, keepTransient) {}

  new makeFromTrio(Ref? parentId := null, Str? name := null,
                   Dict args := Etc.emptyDict, Bool keepTransient := false)
    : super.makeFromTrio(parentId, name, args, keepTransient) {
    EmMeterModelExt.apply(this, MODEL_EXT_TRIO_FILE, parentId, name, args)
  }
}

** 水表：累积水量、瞬时流量。
class ModelEntityEmWaterMeter : ModelEntityEmMeterBase
{
  static const Str MODEL_EXT_FILE_NAME    := "EmWaterMeter.trio"
  static const File? MODEL_EXT_TRIO_FILE  := EmModelParams.getModelTrio(MODEL_EXT_FILE_NAME)
  static const Str MODEL_ID_NAME_EXT      := "emWaterMeterModelId"
  static const Str ENTITY_MODEL_ID_VAL_EXT := "_equip:emWaterMeter"

  new makeFromDb(Context cx, Ref entityId, Bool keepTransient := false)
    : super.makeFromDb(cx, entityId, MODEL_ID_NAME_EXT, ENTITY_MODEL_ID_VAL_EXT,
                       ENTITY_REF_NAME, keepTransient) {}

  new makeFromTrio(Ref? parentId := null, Str? name := null,
                   Dict args := Etc.emptyDict, Bool keepTransient := false)
    : super.makeFromTrio(parentId, name, args, keepTransient) {
    EmMeterModelExt.apply(this, MODEL_EXT_TRIO_FILE, parentId, name, args)
  }
}

** 燃气表：累积体积、瞬时流量、标况折算量。
class ModelEntityEmGasMeter : ModelEntityEmMeterBase
{
  static const Str MODEL_EXT_FILE_NAME    := "EmGasMeter.trio"
  static const File? MODEL_EXT_TRIO_FILE  := EmModelParams.getModelTrio(MODEL_EXT_FILE_NAME)
  static const Str MODEL_ID_NAME_EXT      := "emGasMeterModelId"
  static const Str ENTITY_MODEL_ID_VAL_EXT := "_equip:emGasMeter"

  new makeFromDb(Context cx, Ref entityId, Bool keepTransient := false)
    : super.makeFromDb(cx, entityId, MODEL_ID_NAME_EXT, ENTITY_MODEL_ID_VAL_EXT,
                       ENTITY_REF_NAME, keepTransient) {}

  new makeFromTrio(Ref? parentId := null, Str? name := null,
                   Dict args := Etc.emptyDict, Bool keepTransient := false)
    : super.makeFromTrio(parentId, name, args, keepTransient) {
    EmMeterModelExt.apply(this, MODEL_EXT_TRIO_FILE, parentId, name, args)
  }
}

** 蒸汽表：累积质量、热量、流量、温度、压力。
class ModelEntityEmSteamMeter : ModelEntityEmMeterBase
{
  static const Str MODEL_EXT_FILE_NAME    := "EmSteamMeter.trio"
  static const File? MODEL_EXT_TRIO_FILE  := EmModelParams.getModelTrio(MODEL_EXT_FILE_NAME)
  static const Str MODEL_ID_NAME_EXT      := "emSteamMeterModelId"
  static const Str ENTITY_MODEL_ID_VAL_EXT := "_equip:emSteamMeter"

  new makeFromDb(Context cx, Ref entityId, Bool keepTransient := false)
    : super.makeFromDb(cx, entityId, MODEL_ID_NAME_EXT, ENTITY_MODEL_ID_VAL_EXT,
                       ENTITY_REF_NAME, keepTransient) {}

  new makeFromTrio(Ref? parentId := null, Str? name := null,
                   Dict args := Etc.emptyDict, Bool keepTransient := false)
    : super.makeFromTrio(parentId, name, args, keepTransient) {
    EmMeterModelExt.apply(this, MODEL_EXT_TRIO_FILE, parentId, name, args)
  }
}

** 冷量表：累积冷量、瞬时冷功率、累积水量、流量、进出水温、温差。
class ModelEntityEmCoolMeter : ModelEntityEmMeterBase
{
  static const Str MODEL_EXT_FILE_NAME    := "EmCoolMeter.trio"
  static const File? MODEL_EXT_TRIO_FILE  := EmModelParams.getModelTrio(MODEL_EXT_FILE_NAME)
  static const Str MODEL_ID_NAME_EXT      := "emCoolMeterModelId"
  static const Str ENTITY_MODEL_ID_VAL_EXT := "_equip:emCoolMeter"

  new makeFromDb(Context cx, Ref entityId, Bool keepTransient := false)
    : super.makeFromDb(cx, entityId, MODEL_ID_NAME_EXT, ENTITY_MODEL_ID_VAL_EXT,
                       ENTITY_REF_NAME, keepTransient) {}

  new makeFromTrio(Ref? parentId := null, Str? name := null,
                   Dict args := Etc.emptyDict, Bool keepTransient := false)
    : super.makeFromTrio(parentId, name, args, keepTransient) {
    EmMeterModelExt.apply(this, MODEL_EXT_TRIO_FILE, parentId, name, args)
  }
}

** 热量表：结构同冷量表，标记为 hot。
class ModelEntityEmHeatMeter : ModelEntityEmMeterBase
{
  static const Str MODEL_EXT_FILE_NAME    := "EmHeatMeter.trio"
  static const File? MODEL_EXT_TRIO_FILE  := EmModelParams.getModelTrio(MODEL_EXT_FILE_NAME)
  static const Str MODEL_ID_NAME_EXT      := "emHeatMeterModelId"
  static const Str ENTITY_MODEL_ID_VAL_EXT := "_equip:emHeatMeter"

  new makeFromDb(Context cx, Ref entityId, Bool keepTransient := false)
    : super.makeFromDb(cx, entityId, MODEL_ID_NAME_EXT, ENTITY_MODEL_ID_VAL_EXT,
                       ENTITY_REF_NAME, keepTransient) {}

  new makeFromTrio(Ref? parentId := null, Str? name := null,
                   Dict args := Etc.emptyDict, Bool keepTransient := false)
    : super.makeFromTrio(parentId, name, args, keepTransient) {
    EmMeterModelExt.apply(this, MODEL_EXT_TRIO_FILE, parentId, name, args)
  }
}

**
** 虚拟表（说明书 §3.3.2）：在**模型层**与物理表同构（同样是 `equip meter`，
** 同样带角色 / 介质 / 父表），但没有 L1 累积读数点 —— 它的用量由 `emFormula`
** 求值得到（`EmVirtualMeterEval`）。
**
** 因此虚拟表**不继承** `ModelEntityEmMeterBase`：基类模板会带来一个 L1 采集点，
** 而虚表没有东西可采。硬继承再想办法把点位删掉，比另写一份 8 行的模板要脆得多。
** 「同构」是指业务层拿到一块表时不需要区分实现方式（`EmMeterConsumption` 负责
** 分派），不是指模板必须共用。
**
class ModelEntityEmVirtualMeter : ModelEntity, EmModelParams
{
  static const Str MODEL_BASE_FILE_NAME  := "EmVirtualMeter.trio"
  static const File? MODEL_TRIO_FILE     := EmModelParams.getModelTrio(MODEL_BASE_FILE_NAME)
  static const Str MODEL_ID_NAME         := "emVirtualMeterModelId"
  static const Str ENTITY_MODEL_ID_VAL   := "_equip:emVirtualMeter"
  static const Str ENTITY_REF_NAME       := "emMeterRef"
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
** 缺口表（说明书 §3.3.3）：一种特化的虚拟表，`emGap` + 差值法公式。
**
** 设计取舍（说明书原文）：总表减各分表之和的差值**必须显式建模为一个带
** `emGap` 标记的虚拟表**，而不是让它在报表中被平摊或悄悄消失。缺口率是判断
** 计量方案是否合格的第一指标，也是关账闸门的判据。
**
class ModelEntityEmGapMeter : ModelEntity, EmModelParams
{
  static const Str MODEL_BASE_FILE_NAME  := "EmGapMeter.trio"
  static const File? MODEL_TRIO_FILE     := EmModelParams.getModelTrio(MODEL_BASE_FILE_NAME)
  static const Str MODEL_ID_NAME         := "emGapMeterModelId"
  static const Str ENTITY_MODEL_ID_VAL   := "_equip:emGapMeter"
  static const Str ENTITY_REF_NAME       := "emMeterRef"
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
** 子类叠加介质 trio 的公共实现。
**
** 八个子类的构造体逻辑完全一样，抽出来避免复制八遍；如果哪天叠加逻辑要改，
** 只改这一处。
**
const class EmMeterModelExt
{
  static Void apply(ModelEntityEmMeterBase model, File? trioFile,
                    Ref? parentId, Str? name, Dict args)
  {
    if (trioFile == null) return   // getModelTrio 已经 echo 过 WARNING
    ext := model.readTrioWithSwizzle(trioFile)
    merged := Etc.dictMerge(Etc.makeDict([
      ModelEntityEmMeterBase.PARENT_ID_ARG_NAME:  parentId,
      ModelEntityEmMeterBase.ENTITY_DIS_ARG_NAME: name,
    ]), args)
    model.extendByDicts(ext, merged)
  }
}
