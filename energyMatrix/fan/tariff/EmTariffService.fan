using haystack
using skyarc
using skyarcd

**
** 费率解析与账单生成（域 7）—— **骨架桩**。
**
** 已实现：费率版本解析（`resolve`）与参数守卫接入 —— 这两件事是"参数换版
** 可无损重算"的前提，必须先立住。
** 未实现：五种计价模式的计价、两部制基本电费、账单组装。
**
** 说明书 §6 待决事项 OI-02（账单归属：energyMatrix 出账 / 只算不出账）
** 未闭合，骨架默认**只算不出账**，`EmBill` 模型保留但不生成。
**
** 实现时必须遵守：
**   - 账单项 `EmBillItem` 通过 `emLedgerRefs` 指向来源台账条目，逐笔可追溯
**   - 计价只读台账（`EmLedgerQuery`），禁止直读点位（铁律 6）
**   - 参与结算的条目必须过 `EmDataSourceGuard.checkSettleable`（estimated 不可结算）
**
class EmTariffService
{
  new make(Context cx) { this.cx = cx }

  Context cx

  private static const Str src := "EmTariffService"

  **
  ** 解析某介质在某时刻生效的费率版本。已实现。
  **
  ** 命中多个生效版本时取生效期起点最晚的那个，并 warn —— 费率重叠是配置
  ** 错误，但不能因此让账算不出来。
  **
  Dict? resolve(Ref siteRef, Str medium, DateTime at, Bool checked := true) {
    all := cx.proj.readAllList(
      "emTariff and siteRef==" + siteRef.toCode + " and emMedium==" + medium.toCode)
    hits := Dict[,]
    all.each |Dict t| {
      eff := t["emEffective"] as Span
      if (eff == null) return
      if (eff.contains(at)) hits.add(t)
    }
    if (hits.isEmpty) {
      if (checked) throw UnknownRecErr("站点 " + siteRef.toCode + " 介质 $medium 在 $at 没有生效费率")
      return null
    }
    if (hits.size > 1) {
      hits.sort |Dict a, Dict b -> Int| {
        return (b["emEffective"] as Span).start <=> (a["emEffective"] as Span).start
      }
      EnergyMatrixExt.logWarn(src,
        "站点 " + siteRef.toCode + " 介质 $medium 在 $at 有 " + hits.size + " 个生效费率版本，取最新")
    }
    hit := hits.first
    // 铁律 8：缺 emSourceDoc 的参数不允许生效。
    EmParamVersionGuard.check(hit)
    return hit
  }

  **
  ** 电度电费。**未实现**。
  **
  ** 实现提示：
  **   flat     用量 × 单价
  **   tou      按 `emTouPeriod` 拆分用量（需要 EmElecEnergyTou 分时台账）后分别计价
  **   tiered   按 `emTierMin`/`emTierMax` 分段累进
  **   twoPart  电度部分同 flat/tou，基本电费走 `demandCharge`
  **   contract 直接取约定价
  **
  Number energyCharge(Dict tariff, Ref siteRef, Span span) {
    throw UnsupportedErr("TODO 域 7：EmTariffService.energyCharge（模式 " +
      ((tariff["emPricingModel"] as Str) ?: "?") + "）尚未实现")
  }

  **
  ** 两部制基本电费。**未实现**。
  **
  ** 实现提示：`emChargeBasis == capacity` 时按变压器容量 × 单价；
  ** `demand` 时按账期最大需量 × 单价，超 `emDeclared` 的部分乘 `emOverRatio`（默认 2）。
  ** 最大需量来自 `EmElecDemand` 点位的台账投影，不是实时点位（铁律 6）。
  **
  Number demandCharge(Dict tariff, Ref siteRef, Span span) {
    throw UnsupportedErr("TODO 域 7：EmTariffService.demandCharge 尚未实现")
  }

  **
  ** 生成账单。**未实现**（OI-02 默认「只算不出账」）。
  **
  Grid buildBill(Ref payerRef, Span span) {
    throw UnsupportedErr(
      "TODO 域 7：EmTariffService.buildBill 尚未实现。骨架默认「只算不出账」" +
      "（说明书 §6 待决事项 OI-02），账单数据请用 emLedgerAggregate 导出给既有收费系统。")
  }
}
