using haystack

**
** 业务参数版本化守卫 —— 铁律 8 的强制点。
**
** 说明书 §5.4：费率（`EmTariff`）与排放因子（`EmEmissionFactor`）两类业务参数
** **必须填写 `emSourceDoc` 依据文件号**（政府批复文号、合同编号或国家标准号）。
** 缺少依据文件的参数不允许生效。参数换版一律新增记录并设置生效期，
** 旧版本转为只读，不得原地修改。
**
** 这条约束是"对外数字可信"的另一半（另一半是 `emDataSource` 追溯链）：
** 账单和碳账都是台账 × 参数的确定性投影，参数没有出处，投影就没有出处。
**
const class EmParamVersionGuard
{
  ** 受本守卫管辖的参数类型标记。
  static const Str[] versionedMarkers := ["emTariff", "emEmissionFactor"]

  **
  ** 校验一条参数记录。返回问题列表，空表示可以生效。
  **
  static Dict[] validate(Dict param) {
    issues := Dict[,]

    doc := param["emSourceDoc"] as Str
    if (doc == null || doc.trim.isEmpty) {
      issues.add(err("param.sourceDoc.missing",
        "业务参数缺少 emSourceDoc 依据文件号，不允许生效（铁律 8 / 说明书 §5.4）"))
    }

    // 费率必须有生效期；排放因子用 emYear 划分版本。
    if (param.has("emTariff") && param["emEffective"] == null) {
      issues.add(err("param.effective.missing",
        "EmTariff 缺少 emEffective 生效期；换版必须新增记录并设置生效期"))
    }
    if (param.has("emEmissionFactor") && param["emYear"] as Number == null) {
      issues.add(err("param.year.missing",
        "EmEmissionFactor 缺少 emYear；因子逐年更新，年份是它的版本号"))
    }

    return issues
  }

  ** 校验并在失败时抛错。参数生效（写库 / 被引用）路径一律走这里。
  static Void check(Dict param) {
    issues := validate(param)
    if (issues.isEmpty) return
    msgs := Str[,]
    issues.each |Dict i| { msgs.add((i["msg"] as Str) ?: "?") }
    throw ArgErr("业务参数校验失败：\n  - " + msgs.join("\n  - "))
  }

  **
  ** 旧版参数只读：已经被某个已关账账期引用过的参数不得原地修改。
  **
  ** 判据是记录上的 `emLocked` 标记 —— 由 `EmCarbonAccountBuilder` /
  ** `EmBillBuilder` 在结算时打上（说明书 §4.7 的因子版本快照 `emFactorRefs`
  ** 是同一件事的另一面）。
  **
  static Void checkMutable(Dict existing) {
    if (existing.has("emLocked")) {
      throw ArgErr("该参数版本已被已结算账期引用（emLocked），只读；换版请新增记录")
    }
  }

  private static Dict err(Str code, Str msg) {
    Etc.makeDict(["level": "err", "code": code, "msg": msg])
  }
}
