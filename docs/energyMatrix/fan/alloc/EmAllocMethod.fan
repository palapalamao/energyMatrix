using haystack

**
** 分摊方法（说明书 §4.3 表 4-2）。
**
** 说明书铁律：分摊是**生成台账条目的一等公民行为**，规则可版本化、可追溯、
** 可重算。任何分摊结果条目必须携带 `emRuleRef`，且 `emDataSource` 恒为
** `allocated`（由 `EmDataSourceGuard` 强制）。
**
const class EmAllocMethod
{
  ** 按面积分摊（租赁面积或空调面积）。
  static const Str byArea         := "byArea"
  ** 按人数分摊。
  static const Str byHeadcount    := "byHeadcount"
  ** 按固定比例分摊，比例见 `emShares`。
  static const Str byFixedRatio   := "byFixedRatio"
  ** 按额定功率 × 运行时长分摊（`EmLoad.emAllocWeight`）。
  static const Str byRatedRuntime := "byRatedRuntime"
  ** 差值法：源表减去已计量子表之和。
  static const Str byRemainder    := "byRemainder"
  ** 按已计量子表用量比例分摊公摊部分。
  static const Str bySubMeterPro  := "bySubMeterPro"
  ** 自定义 Axon 表达式（`emFormula`）。
  static const Str custom         := "custom"

  static const Str[] all := [byArea, byHeadcount, byFixedRatio, byRatedRuntime,
                             byRemainder, bySubMeterPro, custom]

  static Bool isValid(Str? m) { m != null && all.contains(m) }

  ** 该方法所需的权重来源标签，用于规则配置期的完整性检查。
  static const Str:Str weightTag := [
    byArea:         "area",
    byHeadcount:    "emOccupancy",
    byFixedRatio:   "emShares",
    byRatedRuntime: "emAllocWeight",
  ]
}
