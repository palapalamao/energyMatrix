using axon
using folio
using haystack
using skyarc
using skyarcd

**
** energyMatrix 的 Axon 函数库 —— **只做注册，不放业务逻辑**。
**
** 每个方法体 1–5 行：参数转换 → 委托给 `fan/<域>/` 下的 service 类 → 返回。
** 出现循环、`cx.proj.commit`、Diff 拼装就说明分层被破坏，请下沉。
**
** 命名：全部 `em` 前缀（说明书 §2.3）。Axon 函数注册在全局命名空间，
** 前缀撞车会**静默覆盖**别的扩展的函数 —— `em` 前缀已核对过 FIN 5.3 的
** 全部 284 个 pod，无冲突。
**
** 权限：只读查询用 `@Axon`；任何写 Folio / 触发关账 / 改状态的用
** `@Axon { admin = true }`。
**
const class EnergyMatrixLib
{
  private static Context cx() { Context.cur }

//////////////////////////////////////////////////////////////////////////
// Info
//////////////////////////////////////////////////////////////////////////

  ** 身份探针：确认 pod 已加载并报告版本。前端各页 mount 时调用。
  @Axon
  static Dict emInfo() {
    Etc.makeDict([
      "podName":     "energyMatrix",
      "version":     EnergyMatrixExt#.pod.version.toStr,
      "extName":     EnergyMatrixExt.metaName,
      "uiUri":       "/pod/energyMatrix/res/web/em/index.html",
      "specUri":     "/pod/energyMatrix/res/spec/em/",
      "gapThreshold": Number(EnergyMatrixExt.defaultGapThreshold),
    ])
  }

  **
  ** 本库的枚举全集（说明书附录 C），供前端下拉与校验共用一份真相。
  ** 列：name（枚举类型名）, values（取值列表）。
  **
  ** 返回 **Grid** 而不是 `{EmMedium: [...], ...}` 这样的 Dict：Dict 的键是
  ** Haystack 标签名，**必须小写开头**。而枚举类型名是大驼峰（EmMedium），
  ** 直接当键会在 Axon 把返回 Dict 转成响应 Grid 时抛 `Invalid col name`，
  ** 且这一步发生在响应序列化过程中 —— 客户端收到的是被截断的 Zinc，
  ** 报的是莫名其妙的 "Could not find a value"，排查代价极高。
  ** 用 Grid 就没有键名约束，类型名以数据形式出现在 name 列里。
  **
  @Axon
  static Grid emEnums() {
    rows := Dict[,]
    addEnum(rows, "EmMedium",          EmMedium.all)
    addEnum(rows, "EmMeterRole",       EmMeterRole.all)
    addEnum(rows, "EmSubItem",         EmSubItem.all)
    addEnum(rows, "EmDataSource",      EmDataSource.all)
    addEnum(rows, "EmGranularity",     EmGranularity.all)
    addEnum(rows, "EmAllocMethod",     EmAllocMethod.all)
    addEnum(rows, "EmPricingModel",    EmPricingModel.all)
    addEnum(rows, "EmBillStatus",      EmBillStatus.all)
    addEnum(rows, "EmQuotaSource",     EmQuotaSource.all)
    addEnum(rows, "EmIpmvpOption",     EmIpmvpOption.all)
    addEnum(rows, "EmModelType",       EmModelType.all)
    addEnum(rows, "EmVerifyStatus",    EmVerifyStatus.all)
    addEnum(rows, "EmScope",           EmScope.all)
    addEnum(rows, "EmDiagCategory",    EmDiagCategory.all)
    addEnum(rows, "EmSeverity",        EmSeverity.all)
    addEnum(rows, "EmAnomalyStatus",   EmAnomalyStatus.all)
    addEnum(rows, "EmWorkOrderStatus", EmWorkOrderStatus.all)
    return Etc.makeDictsGrid(null, rows)
  }

  private static Void addEnum(Dict[] rows, Str name, Str[] values) {
    rows.add(Etc.makeDict2("name", name, "values", values))
  }

//////////////////////////////////////////////////////////////////////////
// 域 1–4 · 实体工厂（全部走 EmEntityCrud，不要在别处 new ModelEntityXxx）
//////////////////////////////////////////////////////////////////////////

  ** 新建站点。args 可覆写模板里的任意 Arg（area / emUsageType / tz / emGapThreshold …）。
  @Axon { admin = true }
  static Ref emAddSite(Str name := "Site", Dict args := Etc.emptyDict) {
    EmEntityCrud(cx).addSite(name, args)
  }

  ** 新建楼层。args 常用键：area、floorNum（地面层 0 / 地上为正 / 地下为负）、emUsageType。
  @Axon { admin = true }
  static Ref emAddFloor(Ref siteRef, Str name := "Floor", Dict args := Etc.emptyDict) {
    EmEntityCrud(cx).addFloor(siteRef, name, args)
  }

  **
  ** 新建计量分区（能耗核算最小空间单元）。
  ** args 里给 `floorRef` 就归属到那一层；跨楼层的分区不填即可。
  **
  @Axon { admin = true }
  static Ref emAddZone(Ref siteRef, Str name := "Zone", Dict args := Etc.emptyDict) {
    EmEntityCrud(cx).addZone(siteRef, name, args)
  }

  ** 新建租户 / 组织单元。parentRef 为上级组织，可为 null。
  @Axon { admin = true }
  static Ref emAddTenant(Ref? parentRef := null, Str name := "Tenant",
                         Dict args := Etc.emptyDict) {
    EmEntityCrud(cx).addTenant(parentRef, name, args)
  }

  **
  ** 新建表计。medium ∈ elec|water|gas|steam|heat|cool|diesel|coal|hydrogen。
  ** args 常用键：emMeterRole / submeterOf / emSubItem / emMeterFactor /
  ** emMaxReading / emInstallDate / emServesRef / emSpaceRef / emTenantRef。
  **
  @Axon { admin = true }
  static Ref emAddMeter(Ref siteRef, Str medium, Str name := "Meter",
                        Dict args := Etc.emptyDict) {
    EmEntityCrud(cx).addMeter(siteRef, medium, name, args)
  }

  ** 新建虚拟表。formula 是 Axon 表达式，账期由求值作用域注入。
  @Axon { admin = true }
  static Ref emAddVirtualMeter(Ref siteRef, Str medium, Str formula,
                               Str name := "Virtual Meter", Dict args := Etc.emptyDict) {
    EmEntityCrud(cx).addVirtualMeter(siteRef, medium, formula, name, args)
  }

  ** 新建缺口表（差值法虚表，公式固定为「源表 − 已计量子表之和」）。
  @Axon { admin = true }
  static Ref emAddGapMeter(Ref siteRef, Ref sourceMeterRef, Str? name := null,
                           Dict args := Etc.emptyDict) {
    EmEntityCrud(cx).addGapMeter(siteRef, sourceMeterRef, name, args)
  }

  **
  ** 给既有 equip 挂能耗身份（铁律 5：不重复定义冷机 / 水泵 / AHU）。
  ** args 常用键：emSubItem / emMeterRef / emRatedPower / emAllocWeight。
  **
  @Axon { admin = true }
  static Ref emAttachLoad(Ref equipRef, Dict args := Etc.emptyDict) {
    EmEntityCrud(cx).attachLoad(equipRef, args)
  }

  **
  ** 新建用能设备组（说明书表 3-5 的 EmLoadGroup）。
  **
  ** 用于没有独立计量、也不按单台管理的批量对象（一层楼的灯具回路、一片插座）。
  ** 现场真实存在的单台设备请用 `emAttachLoad` 给既有 equip 挂身份，不要用这个。
  **
  @Axon { admin = true }
  static Ref emAddLoadGroup(Ref siteRef, Str name := "Load Group",
                            Dict args := Etc.emptyDict) {
    EmEntityCrud(cx).addLoadGroup(siteRef, name, args)
  }

//////////////////////////////////////////////////////////////////////////
// 建模器（「数据模型配置」屏）
//////////////////////////////////////////////////////////////////////////

  **
  ** 资产树（扁平行，按 emDepth 缩进渲染）。
  **
  ** 把空间树、计量树、组织树合并成一棵可浏览的树。列：
  ** id, dis, emNodeKind(site|zone|meter|load|tenant), emGroup(space|metering|equip|org),
  ** emParentId, emDepth, emChildCount, emOrphan,
  ** emMedium, emMeterRole, emVirtual, emGap, emSubItem, emUsageType, emDataSource, area。
  **
  ** siteRef 省略时返回整个项目；给定时只返回该站点的子树 —— 组织树与空间
  ** 正交，始终全量返回（一个租户可能跨站点）。
  **
  @Axon
  static Grid emModelTree(Ref? siteRef := null) {
    EmModelBuilder(cx).tree(siteRef)
  }

  **
  ** 实体详情。键：rec, emNodeKind, emParentId, emModelId, emSpecFile,
  ** emPointCount, emLedgerCount。
  ** 后两个是删除 / 改介质前的影响面，UI 应当在确认框里显示出来。
  **
  @Axon
  static Dict emEntityDetail(Ref entityId) {
    EmModelBuilder(cx).detail(entityId)
  }

  ** 实体的子点位。列：id, dis, navName, kind, unit, his, emL1Point, emDelta,
  ** emTouPeriod, curVal, emBound。
  @Axon
  static Grid emEntityPoints(Ref entityId) {
    EmModelBuilder(cx).points(entityId)
  }

  ** 逐实体铁律校验。列：level(err|warn|info), code, msg, rule。
  @Axon
  static Grid emEntityValidate(Ref entityId) {
    EmModelBuilder(cx).validateEntity(entityId)
  }

  **
  ** Read-only site data audit. Checks native FIN navigation ancestry, meter-tree
  ** integrity, L1/history readiness, gap-point units and synthetic provenance.
  ** Columns: severity, code, recRef, dis, message, suggestedAction.
  **
  @Axon
  static Grid emDataAudit(Ref siteRef) {
    EmDataAudit.run(cx, siteRef)
  }

  **
  ** 更新实体属性。changes 里值为 `removeMarker()` 表示删除该标签。
  **
  ** 拒绝：受保护标签（id/mod/energyMatrix）、任何 `*ModelId` 标签、
  ** 非法枚举值、已入账表计的介质变更、非法父引用。
  **
  @Axon { admin = true }
  static Dict emEntityUpdate(Ref entityId, Dict changes) {
    EmModelBuilder(cx).update(entityId, changes)
  }

  **
  ** 删除实体（连同其子点位）。返回删除的记录数。
  **
  ** 默认拒绝一切有影响面的删除；force=true 放行未关账条目与子节点
  ** （子节点只解除父引用，不级联删除）。
  ** **被已关账条目引用的表永远不能删** —— force 也不行。
  **
  @Axon { admin = true }
  static Number emEntityDelete(Ref entityId, Bool force := false) {
    Number(EmModelBuilder(cx).delete(entityId, force))
  }

  ** pod 内的 xeto 规格源码（只读，供建模器右下角显示）。
  @Axon
  static Str emSpecSource(Str name) { EmModelBuilder.specSource(name) }

  ** pod 内全部 xeto 规格文件名。
  @Axon
  static Str[] emSpecFiles() { EmModelBuilder.specFiles }

//////////////////////////////////////////////////////////////////////////
// 域 2 · 计量
//////////////////////////////////////////////////////////////////////////

  ** 站点计量树（扁平行）。列：id, dis, emMedium, emMeterRole, submeterOf,
  ** emDepth, emVirtual, emGap, emChildCount。
  @Axon
  static Grid emMeterTree(Ref siteRef, Str? medium := null) {
    EmMeterTree(cx).rows(siteRef, medium)
  }

  ** 计量树校验（DAG / 跨介质挂接 / 虚表公式 / 关口表唯一性）。
  ** 列：level(err|warn), code, msg, meterRef。空 Grid = 结构合格。
  @Axon
  static Grid emMeterTreeValidate(Ref siteRef) {
    EmMeterTree(cx).validate(siteRef)
  }

  ** 作废计量树缓存。手工改了表计标签而 observer 没触发时用。
  @Axon { admin = true }
  static Str emInvalidateMeterTree(Ref? siteRef := null) {
    EmMeterTree.invalidate(siteRef)
    return siteRef == null ? "all" : siteRef.toStr
  }

  **
  ** 某表在账期内的用量。span 省略时取当前求值作用域的账期
  ** （虚表 `emFormula` 里可以直接写 `emMeterRead(@M-B1-01)`）。
  **
  @Axon
  static Number? emMeterRead(Ref meterRef, Span? span := null) {
    EmMeterConsumption(cx).value(meterRef, span ?: EmEvalScope.reqSpan)
  }

  ** 某表直接子表用量之和（check 表不计入）。span 同 `emMeterRead`。
  @Axon
  static Number? emSubMeterSum(Ref meterRef, Span? span := null) {
    EmMeterConsumption(cx).subMeterSum(meterRef, span ?: EmEvalScope.reqSpan)
  }

  ** 某表的用量与数据质量。键：val, emQuality, emDataSource, emMedium, emReasons。
  @Axon
  static Dict emMeterConsumption(Ref meterRef, Span span) {
    EmMeterConsumption(cx).of(meterRef, span)
  }

  ** 某表的 L2 区间增量。列：ts, val, emReason(normal|overflow|meterChange|negative|gap)。
  @Axon
  static Grid emMeterDeltas(Ref meterRef, Span span) {
    EmMeterReading(cx).deltaGrid(meterRef, span)
  }

  ** 某表的缺口明细。键：parentVal, childSum, emGapVal, emGapRatio, emChildCount。
  @Axon
  static Dict emGap(Ref meterRef, Span span) {
    EmGapCalc(cx).of(meterRef, span)
  }

  ** 站点各介质的缺口校核（UI「平衡校核卡」数据源）。
  @Axon
  static Grid emSiteGaps(Ref siteRef, Span span) {
    EmGapCalc(cx).siteGaps(siteRef, span)
  }

  ** 站点总体缺口率（关账闸门用的单一数字，取各介质中最差的那个）。
  @Axon
  static Number? emSiteGapRatio(Ref siteRef, Span span) {
    EmGapCalc(cx).siteGapRatio(siteRef, span)
  }

//////////////////////////////////////////////////////////////////////////
// 表具与采集器管理
//////////////////////////////////////////////////////////////////////////

  **
  ** 表具台账。每块表一行：id, dis, emMedium, emMeterRole, emVirtual, emGap,
  ** emParentDis, emMeterFactor, emInstallDate, emSubItem, emPointCount,
  ** emConnDis, emCommStatus, emCurVal, emQuality。
  **
  ** emCommStatus 取自 L1 点位的 `curStatus`（连接器写的标准标签），
  ** 补充三个本库自己的值：noPoint（没有累积读数点）、unbound（点位没接采集
  ** 通道）、virtual（虚表，不涉及采集）。
  **
  ** span 省略时不查台账，`emQuality` 全为 null —— 那条路径只读记录，很快。
  **
  @Axon
  static Grid emMeterInventory(Ref siteRef, Span? span := null) {
    EmMeterInventory(cx).inventory(siteRef, span)
  }

  **
  ** 表具台账统计。键：emTotal, emPhysical, emOk, emOffline, emVirtual,
  ** emConnCount, emQualityAvg。
  **
  @Axon
  static Dict emMeterStats(Ref siteRef, Span? span := null) {
    EmMeterInventory(cx).stats(siteRef, span)
  }

  **
  ** 采集器清单。列：id, dis, emStatus, emMeterCount, emPointCount。
  ** 只列出真正带着本站点表计的采集器 —— 同一项目里可能还有一堆与能耗无关的连接器。
  **
  @Axon
  static Grid emConnectors(Ref siteRef) {
    EmMeterInventory(cx).connectors(siteRef)
  }

//////////////////////////////////////////////////////////////////////////
// 域 5 · 台账
//////////////////////////////////////////////////////////////////////////

  **
  ** 构建站点台账。列：meterRef, emPeriod, val, emDataSource, emQuality,
  ** status(written|skipped|error)。逐表独立 try/catch，单表失败不影响全站。
  **
  @Axon { admin = true }
  static Grid emLedgerBuild(Ref siteRef, Span span, Str granularity := "daily") {
    EmLedgerBuilder(cx).build(siteRef, span, granularity)
  }

  ** 账期内的台账条目（默认剔除红冲对，直接求和不会双算）。
  @Axon
  static Grid emLedgerEntries(Ref siteRef, Span span, Str? medium := null,
                              Bool includeReversals := false) {
    Etc.makeDictsGrid(null, EmLedgerQuery(cx).entries(siteRef, span, medium, includeReversals))
  }

  ** 按维度聚合台账。dim ∈ subItem|medium|space|tenant|org|meter|period。
  ** 列：<dim>, val, emEntryCount, emQualityMin, emSources。
  @Axon
  static Grid emLedgerAggregate(Ref siteRef, Span span, Str dim, Str? medium := null) {
    EmLedgerQuery(cx).aggregate(siteRef, span, dim, medium)
  }

  **
  ** 台账二维交叉表 —— 一次取完"账期 × 分项"这类堆叠图数据。
  **
  ** rowDim 可以是任意维度；**colDim 只能是 subItem 或 medium**：其余维度的
  ** 取值是 Ref，摊成列名会得到非法的 Haystack 标签名，错会以
  ** `Could not find a value` 的形式出现在客户端（见 README 踩坑 41）。
  **
  ** 缺格返回 null 而不是 0 —— 没记账和记了 0 是两回事。
  ** Grid meta 的 `emCols` 是按合计降序的列名清单，前端照它的顺序画堆叠。
  **
  @Axon
  static Grid emLedgerCrosstab(Ref subjectRef, Span span, Str rowDim, Str colDim,
                               Str? medium := null) {
    EmLedgerQuery(cx).crosstab(subjectRef, span, rowDim, colDim, medium)
  }

  ** 账期用量合计。Layer 2 各域取数都走这里（铁律 6）。
  @Axon
  static Number? emLedgerTotal(Ref siteRef, Span span, Str? medium := null) {
    EmLedgerQuery(cx).total(siteRef, span, medium)
  }

  ** 数据来源分布（UI「数据可信度」卡）。列：emDataSource, val, ratio, emEntryCount。
  @Axon
  static Grid emLedgerSourceMix(Ref siteRef, Span span, Str? medium := null) {
    EmLedgerQuery(cx).sourceMix(siteRef, span, medium)
  }

  **
  ** 关账。meta 携带 status / emGapRatio / emThreshold / emEntryCount / msg。
  ** status ∈ closed | blocked | incomplete | alreadyClosed | dryRun。
  ** dryRun=true 走完预检但不写 emClosed —— UI 的「关账预检」按钮用它。
  **
  @Axon { admin = true }
  static Grid emClosePeriod(Ref siteRef, Span span, Str granularity := "daily",
                            Number? threshold := null, Bool dryRun := false) {
    EmClosePeriod(cx).close(siteRef, span, granularity, threshold, dryRun)
  }

  ** 红冲一条台账条目（已关账条目的唯一修改路径）。返回红冲条目 id。
  @Axon { admin = true }
  static Ref emReverseLedgerEntry(Ref entryId, Str reason) {
    EmReversal(cx).reverse(entryId, reason)
  }

  ** 红冲 + 重录。返回完整修正链（原条目 / 红冲 / 重录）。
  @Axon { admin = true }
  static Grid emCorrectLedgerEntry(Ref entryId, Number newVal, Str newDataSource,
                                   Str reason, Number? newQuality := null) {
    EmReversal(cx).correct(entryId, newVal, newDataSource, reason, newQuality)
  }

  ** 一条条目的完整修正链。
  @Axon
  static Grid emLedgerChain(Ref entryId) { EmReversal(cx).chain(entryId) }

  ** 站点的关账批次记录（UI reports 屏的关账批次表）。
  @Axon
  static Grid emClosePeriods(Ref siteRef) {
    recs := cx.proj.readAllList("emClosePeriod and siteRef==" + siteRef.toCode).dup
    // 按账期码倒序 —— 调用方（总览卡、左下角状态条）都取第 0 行当"最近一次"，
    // 不排序时那一行是 Folio 的返回顺序，看着像最新的其实是随机的
    recs.sort |Dict a, Dict b -> Int| {
      pa := (a["emPeriod"] as Str) ?: ""
      pb := (b["emPeriod"] as Str) ?: ""
      return pb <=> pa
    }
    return Etc.makeDictsGrid(null, recs)
  }

//////////////////////////////////////////////////////////////////////////
// 域 6 · 分摊（骨架桩）
//////////////////////////////////////////////////////////////////////////

  ** 站点在某时刻生效的分摊规则，按 emPriority 升序。
  @Axon
  static Grid emAllocRules(Ref siteRef, DateTime at := DateTime.now) {
    Etc.makeDictsGrid(null, EmAllocEngine(cx).activeRules(siteRef, at))
  }

  ** 分摊规则配置校验。列：level, code, msg。
  @Axon
  static Grid emAllocValidate(Ref ruleRef) {
    Etc.makeDictsGrid(null, EmAllocEngine(cx).validateRule(cx.proj.readById(ruleRef, true)))
  }

  ** 执行分摊规则。**未实现**：站点有生效规则时抛 UnsupportedErr（域 6 骨架桩）。
  @Axon { admin = true }
  static Grid emAllocRun(Ref siteRef, Span span, Str granularity := "daily") {
    EmAllocEngine(cx).run(siteRef, span, granularity)
  }

//////////////////////////////////////////////////////////////////////////
// 域 7 · 费率与账单（骨架桩）
//////////////////////////////////////////////////////////////////////////

  ** 解析某介质在某时刻生效的费率版本（缺 emSourceDoc 会报错，铁律 8）。
  @Axon
  static Dict? emTariffResolve(Ref siteRef, Str medium, DateTime at := DateTime.now) {
    EmTariffService(cx).resolve(siteRef, medium, at, false)
  }

  ** 生成账单。**未实现**（OI-02 默认「只算不出账」）。
  @Axon { admin = true }
  static Grid emBillBuild(Ref payerRef, Span span) {
    EmTariffService(cx).buildBill(payerRef, span)
  }

//////////////////////////////////////////////////////////////////////////
// 域 8 · 指标与定额
//////////////////////////////////////////////////////////////////////////

  ** 全部指标定义（UI「EmKpi 指标定义表」数据源）。
  @Axon
  static Grid emKpiDefs() { EmKpiService(cx).definitions }

  **
  ** 新建指标定义。formula 是 Axon 表达式（说明书 §6 OI-03 的取舍）。
  ** args 常用键：unit / emGranularity / emDimension / emHigherIsBetter / emStandardRef。
  **
  @Axon { admin = true }
  static Ref emAddKpi(Str kpiCode, Str dis, Str formula, Dict args := Etc.emptyDict) {
    EmKpiService(cx).addKpi(kpiCode, dis, formula, args)
  }

  **
  ** 新建定额。limitSource ∈ standard|historical|benchmark|contract|manual —— 必填，
  ** 不同来源在报表里要分别标注，不可混用（说明书 §4.5）。
  **
  @Axon { admin = true }
  static Ref emAddQuota(Ref subjectRef, Number limit, Str limitSource, Span span,
                        Dict args := Etc.emptyDict) {
    EmKpiService(cx).addQuota(subjectRef, limit, limitSource, span, args)
  }

  ** 定额清单。
  @Axon
  static Grid emQuotas(Ref? subjectRef := null) { EmKpiService(cx).quotas(subjectRef) }

  **
  ** 某对象全部定额的执行进度（一次算完）。
  ** 列：quotaRef, dis, emLimit, used, ratio, emWarnRatio, level, emLimitSource, emOverAction。
  **
  @Axon
  static Grid emQuotaProgressAll(Ref subjectRef, Span span) {
    EmKpiService(cx).quotaProgressAll(subjectRef, span)
  }

  **
  ** 计算一个指标。`emFormula` 走 Axon 求值。
  **
  ** 公式里可用两个自由变量：`emSelf`（被评价对象的 Dict）与 `emSpan`。
  ** 取数函数的第一个参数是 Ref，所以写 `emSelf->id` 而不是 `emSelf`。
  ** 分母缺失或为 0 时返回 null 而不是 0。
  **
  @Axon
  static Number? emKpiCompute(Str kpiCode, Ref subjectRef, Span span) {
    EmKpiService(cx).compute(kpiCode, subjectRef, span)
  }

  **
  ** 同一指标算一批对象（排名 / 对标表）。
  ** 列：emSubjectRef, dis, emKpiCode, val, unit, err。单个对象算不出时 val 为
  ** null 且 err 有值，不影响其余行。
  **
  @Axon
  static Grid emKpiComputeAll(Str kpiCode, Ref[] subjectRefs, Span span) {
    EmKpiService(cx).computeAll(kpiCode, subjectRefs, span)
  }

  ** 定额执行进度。键：emLimit, used, ratio, emWarnRatio, level(ok|warn|over)。
  @Axon
  static Dict emQuotaProgress(Ref quotaRef, Span span) {
    EmKpiService(cx).quotaProgress(quotaRef, span)
  }

//////////////////////////////////////////////////////////////////////////
// 域 9 · 基线与核证
//////////////////////////////////////////////////////////////////////////

  **
  ** 基线统计验收（ASHRAE G14）。actual / predicted 等长同序。
  ** meta 携带 emR2 / emCvRmse / emNmbe / emValid；rows 是逐项 check。
  **
  @Axon { admin = true }
  static Grid emBaselineValidate(Ref baselineRef, Number[] actual, Number[] predicted) {
    a := Float[,]; actual.each |Number n| { a.add(n.toFloat) }
    p := Float[,]; predicted.each |Number n| { p.add(n.toFloat) }
    return EmSavingsService(cx).validateBaseline(baselineRef, a, p)
  }

  ** 新建节能项目。**默认 emVerifyStatus=planned**，调用方无法绕开（铁律 10）。
  @Axon { admin = true }
  static Ref emAddSavingsProject(Str dis, Ref subjectRef, Number? planned := null) {
    tags := EmSavingsService.newProjectTags(dis, subjectRef, planned)
    return cx.proj.commit(Diff.makeAdd(tags)).newRec.id
  }

  ** 节能项目清单（UI「节能诊断与核证」的数据源）。
  @Axon
  static Grid emSavingsProjects(Ref? subjectRef := null) {
    filter := subjectRef == null
      ? "emSavingsProject"
      : "emSavingsProject and emSubjectRef==" + subjectRef.toCode
    return Etc.makeDictsGrid(null, cx.proj.readAllList(filter))
  }

  ** 基线清单。
  @Axon
  static Grid emBaselines(Ref? subjectRef := null) {
    filter := subjectRef == null
      ? "emBaseline"
      : "emBaseline and emSubjectRef==" + subjectRef.toCode
    return Etc.makeDictsGrid(null, cx.proj.readAllList(filter))
  }

  ** 计算报告期节能量。**未实现**（域 9 骨架桩）。
  @Axon { admin = true }
  static Grid emSavingsCompute(Ref projectRef, Span reportSpan) {
    EmSavingsService(cx).computeSavings(projectRef, reportSpan)
  }

//////////////////////////////////////////////////////////////////////////
// 域 10 · 碳资产
//////////////////////////////////////////////////////////////////////////

  ** 解析排放因子版本（缺 emSourceDoc 会报错，铁律 8）。
  @Axon
  static Dict? emFactorResolve(Str medium, Number year, Str? region := null) {
    EmCarbonService(cx).resolveFactor(medium, year.toFloat.toInt, region, false)
  }

  ** 排放因子清单（UI「因子版本表」的数据源）。
  @Axon
  static Grid emFactors() {
    Etc.makeDictsGrid(null, cx.proj.readAllList("emEmissionFactor"))
  }

  ** 费率清单。
  @Axon
  static Grid emTariffs(Ref? siteRef := null) {
    filter := siteRef == null ? "emTariff" : "emTariff and siteRef==" + siteRef.toCode
    return Etc.makeDictsGrid(null, cx.proj.readAllList(filter))
  }

  **
  ** 生成碳账。每介质一行，meta 携带 Scope 1/2/3、总量、抵消量、净排放与
  ** 因子版本快照（emFactorRefs）。
  **
  ** `lock` 为 true 时把用到的因子打上 `emLocked` —— **只在账期结算时传 true**，
  ** 页面上查看碳账不应该产生副作用。
  **
  @Axon
  static Grid emCarbonAccount(Ref subjectRef, Span span, Bool lock := false) {
    EmCarbonService(cx).buildAccount(subjectRef, span, lock)
  }

  **
  ** 净排放量（总排放 − 抵消）。指标公式里最常用的那个碳数字，
  ** 单独开一个函数是为了不用在公式里写 `emCarbonAccount(...).meta->emNet`。
  ** 单位由因子决定（示范数据是 kgCO2e）。
  **
  @Axon
  static Number? emCarbonNet(Ref subjectRef, Span span) {
    EmCarbonService(cx).buildAccount(subjectRef, span).meta["emNet"] as Number
  }

  **
  ** 折标煤合计（综合能耗，tce）。总览驾驶舱的头卡就是这个数。
  **
  ** 逐介质明细在 rows（emMedium / usage / emCoalFactor / val），合计在 **meta**
  ** （val / unit / emYear / emMissing）。
  **
  ** `emMissing`（没有 `emCoalFactor` 的介质）要显示出来 —— 水本来就不计入
  ** 综合能耗，和"某介质因为参数没录而缺席"在数字上是同一个结果，不列出来分不清。
  **
  @Axon
  static Grid emCoalEquivalent(Ref subjectRef, Span span) {
    EmCarbonService(cx).coalEquivalent(subjectRef, span)
  }

  ** 碳目标清单。
  @Axon
  static Grid emCarbonTargets(Ref? subjectRef := null) {
    filter := subjectRef == null
      ? "emCarbonTarget"
      : "emCarbonTarget and emSubjectRef==" + subjectRef.toCode
    return Etc.makeDictsGrid(null, cx.proj.readAllList(filter))
  }

  **
  ** 碳目标进度。总量型比净排放，强度型比单位面积净排放 —— 两种口径不混用。
  ** 键：emTargetType, emBaseValue, emTargetValue, cur, emUnit, progress, onTrack。
  **
  @Axon
  static Dict emCarbonTargetProgress(Ref targetRef, Span span) {
    EmCarbonService(cx).targetProgress(targetRef, span)
  }

  ** 绿电 / 绿证 / CCER 清单。只有 emRetired（已注销核销）的才可用于抵消。
  @Axon
  static Grid emGreenCerts(Ref? subjectRef := null) {
    filter := subjectRef == null
      ? "emGreenCert"
      : "emGreenCert and emSubjectRef==" + subjectRef.toCode
    return Etc.makeDictsGrid(null, cx.proj.readAllList(filter))
  }

//////////////////////////////////////////////////////////////////////////
// 域 11 · 诊断与闭环
//////////////////////////////////////////////////////////////////////////

  ** 站点启用的诊断规则，按严重度降序。
  @Axon
  static Grid emDiagRules(Ref siteRef) {
    Etc.makeDictsGrid(null, EmDiagRuleEngine(cx).activeRules(siteRef))
  }

  ** 诊断规则配置校验。列：level, code, msg。
  @Axon
  static Grid emDiagValidate(Ref ruleRef) {
    Etc.makeDictsGrid(null, EmDiagRuleEngine(cx).validateRule(cx.proj.readById(ruleRef, true)))
  }

  **
  ** 新建诊断规则。
  ** threshold 的含义随分类而定：dataQuality 是完好率下限（如 0.9），
  ** balance 是缺口率上限（如 0.05）。
  **
  @Axon { admin = true }
  static Ref emAddDiagRule(Ref siteRef, Str ruleCode, Str dis, Str category,
                           Str severity, Number threshold, Dict args := Etc.emptyDict) {
    EmDiagRuleEngine(cx).addRule(siteRef, ruleCode, dis, category, severity, threshold, args)
  }

  **
  ** 跑一遍诊断，生成异常。
  **
  ** 已实现 dataQuality 与 balance 两类；其余六类会被跳过并记在返回 Grid 的
  ** meta.emSkipped 里 —— 不抛错，因为已经跑出来的异常是有价值的。
  ** 幂等：同规则 + 同对象 + 同账期只会有一条异常，重复跑不刷屏。
  **
  @Axon { admin = true }
  static Grid emDiagRun(Ref siteRef, Span span) {
    EmDiagRuleEngine(cx).run(siteRef, span)
  }

  ** 异常清单。status 省略返回全部。列含 emSubjectDis 便于直接展示。
  @Axon
  static Grid emAnomalies(Ref siteRef, Str? status := null) {
    EmDiagRuleEngine(cx).anomalies(siteRef, status)
  }

  ** 异常统计（各状态计数 + 严重异常数 + 按分类计数）。
  @Axon
  static Dict emAnomalyStats(Ref siteRef) { EmDiagRuleEngine(cx).anomalyStats(siteRef) }

  ** 确认一条异常（open → acked）。
  @Axon { admin = true }
  static Ref emAnomalyAck(Ref anomalyRef, Str? note := null) {
    EmDiagRuleEngine(cx).ack(anomalyRef, note)
  }

  ** 标记误报。与「已处置」分开 —— 误报多说明规则阈值该调了。
  @Axon { admin = true }
  static Ref emAnomalyFalseAlarm(Ref anomalyRef, Str? note := null) {
    EmDiagRuleEngine(cx).markFalseAlarm(anomalyRef, note)
  }

  **
  ** 派单：把若干条异常合成一张工单。
  ** 同一块表连着几天完好率低是一个问题，不是五个 —— 所以收的是列表。
  **
  @Axon { admin = true }
  static Ref emDispatchWorkOrder(Ref[] anomalyRefs, Str assignee, Date? dueDate := null) {
    EmDiagRuleEngine(cx).dispatch(anomalyRefs, assignee, dueDate)
  }

  ** 工单清单。列含 emSubjectDis 与 emAnomalyCount。
  @Axon
  static Grid emWorkOrders(Ref siteRef, Str? status := null) {
    EmDiagRuleEngine(cx).workOrders(siteRef, status)
  }

  **
  ** 工单状态流转：new → assigned → inProgress → done → closed，**只能往前走**。
  ** 置为 done/closed 时，它带的异常一并置为已处置。
  **
  @Axon { admin = true }
  static Ref emWorkOrderUpdate(Ref woRef, Str status, Str? result := null,
                               Ref? savingsProjectRef := null) {
    EmDiagRuleEngine(cx).updateWorkOrder(woRef, status, result, savingsProjectRef)
  }

//////////////////////////////////////////////////////////////////////////
// 夜间流水线（res/defaultJobs/jobs.trio 的唯一入口）
//////////////////////////////////////////////////////////////////////////

  **
  ** 夜间台账流水线：台账构建 → 分摊 → 缺口校核，**串行**执行。
  **
  ** 这几步有严格先后依赖，绝不能拆成几个 Job 靠时间错开 —— 站点一多就会
  ** 出现"分摊还没跑完缺口就算了"的竞态。所以它们合并在这一个函数里。
  **
  ** **关账不在流水线里**：关账是带审计语义的人工动作（要有人对缺口率负责），
  ** 由 UI 的 reports 屏发起。
  **
  ** siteRef 省略时对项目内全部 EmSite 逐个跑；单站失败不中断其余站点。
  **
  @Axon { admin = true }
  static Grid emNightlyPipeline(Ref? siteRef := null, Span? span := null,
                                Str granularity := "daily") {
    EmNightlyPipeline(cx).run(siteRef, span, granularity)
  }
}
