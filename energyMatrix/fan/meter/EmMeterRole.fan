using haystack

**
** 计量角色（说明书 §3.3.1 表 3-3）。
**
** 角色是六值枚举而不是 marker —— 汇总算法只认角色、不认层级深度，
** 所以三层楼的项目和三十层的项目共用同一套汇总逻辑。
**
const class EmMeterRole
{
  ** 关口表：与供能方结算的产权分界表，唯一权威源。
  static const Str gateway := "gateway"
  ** 总表：建筑或系统级汇总表。
  static const Str main    := "main"
  ** 分项表：按用能分项划分的回路表。
  static const Str branch  := "branch"
  ** 子表：租户 / 楼层 / 末端计量表。
  static const Str sub     := "sub"
  ** 考核表：仅用于校核，**不参与汇总**，防止重复计量。
  static const Str check   := "check"
  ** 虚表：由加减、分摊或差值公式导出。
  static const Str virtualRole := "virtual"

  static const Str[] all := [gateway, main, branch, sub, check, virtualRole]

  static Bool isValid(Str? r) { r != null && all.contains(r) }

  ** 取记录的角色；缺失或非法一律回退到 `sub`（最保守：参与汇总但不当权威源）。
  static Str of(Dict rec) {
    r := rec["emMeterRole"] as Str
    return isValid(r) ? r : sub
  }

  **
  ** 该角色是否参与父表的汇总。
  **
  ** `check` 是唯一不参与的角色 —— 它与某块已计量的表覆盖同一段回路，
  ** 计入就是重复计量。这条规则同时决定了缺口量的算法。
  **
  static Bool countsTowardSum(Str role) { role != check }

  ** 该角色是否可以作为结算 / 对外披露的权威源。
  static Bool isAuthoritative(Str role) { role == gateway }
}
