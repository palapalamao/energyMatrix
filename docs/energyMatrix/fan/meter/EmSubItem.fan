using haystack

**
** GB 分项计量分类（说明书 §3.7 表 3-7）。
**
** 依据《国家机关办公建筑和大型公共建筑能耗监测系统分项能耗数据采集技术导则》
** 与 GB/T 51161。同时挂在 `EmElecMeter` 与 `EmLoad` 两处：有表的按表计算，
** 无表的按 `EmLoad.emAllocWeight` 分摊。
**
** **仅电介质有效** —— 水/气/汽/冷热没有分项计量口径，给它们打 emSubItem
** 是常见的建模错误，`EmLedgerBuilder` 会拒绝写入。
**
const class EmSubItem
{
  static const Str a1 := "a1"   // 照明插座 - 室内照明与插座
  static const Str a2 := "a2"   // 照明插座 - 走廊与应急照明
  static const Str a3 := "a3"   // 照明插座 - 室外景观照明
  static const Str b1 := "b1"   // 空调用电 - 冷热站
  static const Str b2 := "b2"   // 空调用电 - 空调末端
  static const Str c1 := "c1"   // 动力用电 - 电梯扶梯
  static const Str c2 := "c2"   // 动力用电 - 水泵
  static const Str c3 := "c3"   // 动力用电 - 通风机
  static const Str d1 := "d1"   // 特殊用电 - 信息中心
  static const Str d2 := "d2"   // 特殊用电 - 厨房餐厅
  static const Str d3 := "d3"   // 特殊用电 - 洗衣房
  static const Str d4 := "d4"   // 特殊用电 - 游泳池
  static const Str d5 := "d5"   // 特殊用电 - 健身娱乐
  static const Str d6 := "d6"   // 特殊用电 - 其他

  static const Str[] all := [a1, a2, a3, b1, b2, c1, c2, c3, d1, d2, d3, d4, d5, d6]

  ** 一级分组（A 照明插座 / B 空调用电 / C 动力用电 / D 特殊用电）。
  static const Str:Str groups := [
    a1: "A", a2: "A", a3: "A",
    b1: "B", b2: "B",
    c1: "C", c2: "C", c3: "C",
    d1: "D", d2: "D", d3: "D", d4: "D", d5: "D", d6: "D",
  ]

  static const Str:Str dis := [
    a1: "室内照明与插座", a2: "走廊与应急照明", a3: "室外景观照明",
    b1: "冷热站",       b2: "空调末端",
    c1: "电梯扶梯",     c2: "水泵",         c3: "通风机",
    d1: "信息中心",     d2: "厨房餐厅",     d3: "洗衣房",
    d4: "游泳池",       d5: "健身娱乐",     d6: "其他",
  ]

  static Bool isValid(Str? s) { s != null && all.contains(s) }

  static Str? group(Str? s) { s == null ? null : groups[s] }

  **
  ** 取记录的分项，并做介质校验：非电介质一律返回 null。
  ** 说明书表 4-1 明确 `emSubItem` 仅电介质有效。
  **
  static Str? of(Dict rec, Str? medium) {
    if (medium != null && medium != EmMedium.elec) return null
    s := rec["emSubItem"] as Str
    return isValid(s) ? s : null
  }
}
