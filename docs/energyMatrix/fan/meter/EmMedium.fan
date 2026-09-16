using haystack

**
** 能源介质的规范取值与推断。
**
** 说明书附录 C 的 `EmMedium` 在 xeto 里被写成 Choice 却从未被使用（全库用
** `emMediumId: Str` 自由文本）。本 pod 把它收敛成枚举值集合 —— 跨介质折标煤
** 与碳核算依赖介质是可枚举的，自由文本给不了这个保障。
**
** 规范标签名是 `emMedium`（Str）。`emMediumId` 作为历史别名仍被 `of` 识别。
**
const class EmMedium
{
  static const Str elec     := "elec"
  static const Str water    := "water"
  static const Str gas      := "gas"
  static const Str steam    := "steam"
  static const Str heat     := "heat"
  static const Str cool     := "cool"
  static const Str diesel   := "diesel"
  static const Str coal     := "coal"
  static const Str hydrogen := "hydrogen"

  ** 全部合法取值，顺序即 UI 中的展示顺序。
  static const Str[] all := [elec, water, gas, steam, heat, cool, diesel, coal, hydrogen]

  ** 各介质的计量单位（累积量）。用于台账条目 val 的单位校验与展示。
  static const Str:Str units := [
    elec:     "kWh",
    water:    "m³",
    gas:      "m³",
    steam:    "kg",
    heat:     "kWh",
    cool:     "kWh",
    diesel:   "kg",
    coal:     "kg",
    hydrogen: "kg",
  ]

  ** 是否合法介质。
  static Bool isValid(Str? m) { m != null && all.contains(m) }

  ** 该介质的累积量单位；未知介质返回 null。
  static Str? unit(Str? m) { m == null ? null : units[m] }

  **
  ** 从记录推断介质。优先取显式的 `emMedium`（或历史别名 `emMediumId`）标签；
  ** 没有时按 Haystack 标记回退推断。
  **
  ** 回退顺序有意义：冷/热量表本身也带 `water`（载冷/载热介质是水），
  ** 所以必须先判 `chilled` / `hot`，否则会被误判成水表。
  **
  static Str? of(Dict rec) {
    explicit := (rec["emMedium"] as Str) ?: (rec["emMediumId"] as Str)
    if (explicit != null) return isValid(explicit) ? explicit : null

    if (rec.has("chilled"))    return cool
    if (rec.has("hot"))        return heat
    if (rec.has("steam"))      return steam
    if (rec.has("naturalGas")) return gas
    if (rec.has("gas"))        return gas
    if (rec.has("elec"))       return elec
    if (rec.has("water"))      return water
    if (rec.has("diesel"))     return diesel
    if (rec.has("coal"))       return coal
    return null
  }
}
