using haystack

**
** 计价模式与账单状态（说明书 §4.4 表 4-3）。
**
** 费率是**随时间版本化的业务参数**，绝不写死在设备属性里。账单只是台账与
** 费率的确定性投影，可无损重算（铁律 9）。
**
const class EmPricingModel
{
  ** 单一制：一个单价。
  static const Str flat     := "flat"
  ** 分时电价：尖、峰、平、谷四时段单价 + 适用月份 / 小时。
  static const Str tou      := "tou"
  ** 阶梯计价：阶梯上下限与对应单价。
  static const Str tiered   := "tiered"
  ** 两部制：电度电费 + 基本电费（按容量制或需量制）。
  static const Str twoPart  := "twoPart"
  ** 合约价：对租户或能源托管的约定价。
  static const Str contract := "contract"

  static const Str[] all := [flat, tou, tiered, twoPart, contract]

  static Bool isValid(Str? m) { m != null && all.contains(m) }

  ** 分时时段。
  static const Str[] touPeriods := ["sharp", "peak", "flat", "valley"]

  ** 基本电费计费基准。
  static const Str basisCapacity := "capacity"   // 按变压器容量
  static const Str basisDemand   := "demand"     // 按最大需量
}

**
** 账单状态（说明书附录 C 的 `EmBillStatus`）。
**
** 注意：xeto 原稿把 `emStatus` 这一个全局标签同时赋给了 `EmBillStatus`、
** `EmAnomalyStatus` 与 `Str`（工单）三种类型。本 pod 把它拆成
** `emBillStatus` / `emAnomalyStatus` / `emWorkOrderStatus` 三个独立标签，
** 详见 README「与说明书的偏差」#1。
**
const class EmBillStatus
{
  static const Str draft    := "draft"
  static const Str issued   := "issued"
  static const Str disputed := "disputed"
  static const Str settled  := "settled"
  static const Str voided   := "voided"

  static const Str[] all := [draft, issued, disputed, settled, voided]

  static Bool isValid(Str? s) { s != null && all.contains(s) }

  ** 已开具之后的状态不允许直接改金额 —— 只能作废重开。
  static Bool isFrozen(Str s) { s != draft }
}
