using haystack

**
** 逐实体的铁律校验 —— 建模器右侧「校验·铁律」页签的数据源。
**
** 纯函数：输入是已经取好的记录 + 父记录 + 子点位，不碰 Folio，因此可以单测
** （见 `fan/test/EmModelValidatorTest.fan`）。Folio 门面见 `EmModelBuilder`。
**
** 与 `EmMeterTreeBuilder.build` 的分工：那个是**整棵树**的结构校验（环、
** 跨介质挂接、关口表唯一性），这个是**单个实体**的完备性校验（必填项、
** 枚举合法性、能不能进台账）。建模器需要后者 —— 用户点中一个节点，要知道
** 的是"这一个对象还差什么"。
**
const class EmModelValidator
{
  static const Str levelErr  := "err"
  static const Str levelWarn := "warn"
  static const Str levelInfo := "info"

  **
  ** 校验一个实体。
  **
  ** rec     被校验的记录
  ** kind    `EmNodeKind` 之一
  ** parent  父记录（表计的父表 / 分区的站点），没有则 null
  ** points  该实体的子点位（只有 meter 用得上）
  **
  ** 返回问题清单，每条 {level, code, msg, rule}。空清单表示这个对象在
  ** 建模层面是完备的 —— 但不代表它算得出账（那要看点位有没有历史数据）。
  **
  static Dict[] validate(Dict rec, Str kind, Dict? parent := null,
                         Dict[] points := Dict[,])
  {
    if (kind == EmNodeKind.site)   return validateSite(rec)
    if (kind == EmNodeKind.floor)  return validateFloor(rec)
    if (kind == EmNodeKind.zone)   return validateZone(rec)
    if (kind == EmNodeKind.tenant) return validateTenant(rec)
    if (kind == EmNodeKind.meter)  return validateMeter(rec, parent, points)
    if (kind == EmNodeKind.load)   return validateLoad(rec)
    return Dict[,]
  }

//////////////////////////////////////////////////////////////////////////
// 站点 / 分区 / 组织
//////////////////////////////////////////////////////////////////////////

  static Dict[] validateSite(Dict rec) {
    out := Dict[,]
    area := rec["area"] as Number
    if (area == null || area.toFloat <= 0f) {
      out.add(issue(levelErr, "site.area.missing",
        "请填写建筑面积 —— 单位面积能耗（EUI）和所有面积相关指标都以它为分母，不填则这些指标全部算不出来（area）",
        "§3.2"))
    }
    if ((rec["tz"] as Str) == null) {
      out.add(issue(levelWarn, "site.tz.missing",
        "请设置时区 —— 采集点位的时区跟随站点，不设会让每天的账期起止落在错误的时刻（tz）", "§3.6"))
    }
    if ((rec["emUsageType"] as Str) == null) {
      out.add(issue(levelWarn, "site.usageType.missing",
        "建议选择业态 —— 能耗对标和定额分配要按业态取基准值（emUsageType）", "§3.2"))
    }
    th := rec["emGapThreshold"] as Number
    if (th != null && (th.toFloat <= 0f || th.toFloat > 1f)) {
      out.add(issue(levelErr, "site.gapThreshold.range",
        "缺口率阈值要填 0 到 1 之间的小数（如 0.05 表示 5%），当前是 " + th.toFloat + "（emGapThreshold）", "§5.2"))
    }
    if ((rec["emOccupancy"] as Number) == null) {
      out.add(issue(levelInfo, "site.occupancy.missing",
        "未填在册人数 —— 人均能耗指标和「按人数分摊」将无法使用（emOccupancy）", "§3.2"))
    }
    return out
  }

  static Dict[] validateFloor(Dict rec) {
    out := Dict[,]
    if ((rec["siteRef"] as Ref) == null) {
      out.add(issue(levelErr, "floor.siteRef.missing", "这个楼层没有归属站点（siteRef）", "§3.2"))
    }
    area := rec["area"] as Number
    if (area == null || area.toFloat <= 0f) {
      out.add(issue(levelWarn, "floor.area.missing",
        "请填写楼层面积 —— 按层统计能耗强度时以它为分母（area）", "§3.2"))
    }
    if ((rec["floorNum"] as Number) == null) {
      out.add(issue(levelInfo, "floor.floorNum.missing",
        "未填楼层号 —— 楼层排序和地上/地下的区分依赖它（地面层填 0，地下填 -1、-2）（floorNum）", "§3.2"))
    }
    return out
  }

  static Dict[] validateZone(Dict rec) {
    out := Dict[,]
    if ((rec["siteRef"] as Ref) == null) {
      out.add(issue(levelErr, "zone.siteRef.missing", "这个分区没有归属站点（siteRef）", "§3.2"))
    }
    area := rec["area"] as Number
    if (area == null || area.toFloat <= 0f) {
      out.add(issue(levelWarn, "zone.area.missing",
        "请填写分区面积 —— 「按面积分摊」用它当权重，分区能耗强度用它当分母（area）", "§4.3"))
    }
    if ((rec["emUsageType"] as Str) == null) {
      out.add(issue(levelInfo, "zone.usageType.missing", "建议选择业态，便于同类分区之间对标（emUsageType）", "§3.2"))
    }
    return out
  }

  static Dict[] validateTenant(Dict rec) {
    out := Dict[,]
    if ((rec["area"] as Number) == null && (rec["emOccupancy"] as Number) == null) {
      out.add(issue(levelWarn, "tenant.weight.missing",
        "租户既没填面积也没填人数 —— 「按面积分摊」和「按人数分摊」都算不出它该分多少（area / emOccupancy）",
        "§4.3"))
    }
    if (rec.has("emTenant") && (rec["emContractNo"] as Str) == null) {
      out.add(issue(levelInfo, "tenant.contract.missing",
        "未填合同编号 —— 账单出现争议时无法追溯到合同（emContractNo）", "§3.2"))
    }
    return out
  }

//////////////////////////////////////////////////////////////////////////
// 表计（铁律最密集的地方）
//////////////////////////////////////////////////////////////////////////

  static Dict[] validateMeter(Dict rec, Dict? parent, Dict[] points) {
    out := Dict[,]
    isVirtual := rec.has("emVirtual") || EmMeterRole.of(rec) == EmMeterRole.virtualRole

    // ── 铁律 4：数据来源 ──────────────────────────────────────────
    src := rec["emDataSource"] as Str
    if (src == null) {
      out.add(issue(levelErr, "meter.dataSource.missing",
        "请选择数据来源 —— 每个能耗数值都要说明是实测、推导、分摊还是估算，否则这块表的数不能入账（emDataSource）",
        "铁律 4"))
    } else if (!EmDataSource.isValid(src)) {
      out.add(issue(levelErr, "meter.dataSource.invalid",
        "数据来源填了不认识的值：$src（可选：" + EmDataSource.all.join("、") + "）", "铁律 4"))
    }

    // ── 介质 ────────────────────────────────────────────────────
    medium := EmMedium.of(rec)
    if (medium == null) {
      out.add(issue(levelErr, "meter.medium.unknown",
        "判断不出这块表计的是什么 —— 请选择介质（电 / 水 / 燃气 / 蒸汽 / 冷量 / 热量）（emMedium）",
        "§3.3"))
    }

    // ── 角色 ────────────────────────────────────────────────────
    role := rec["emMeterRole"] as Str
    if (role == null) {
      out.add(issue(levelWarn, "meter.role.missing",
        "未选择计量角色，暂按「子表」处理（参与汇总，但不作为结算依据）（emMeterRole）", "§3.3.1"))
    } else if (!EmMeterRole.isValid(role)) {
      out.add(issue(levelErr, "meter.role.invalid",
        "计量角色填了不认识的值：$role（可选：" + EmMeterRole.all.join("、") + "）", "§3.3.1"))
    }

    // ── 铁律 2：跨介质挂接 ───────────────────────────────────────
    if (parent != null) {
      pm := EmMedium.of(parent)
      if (medium != null && pm != null && medium != pm) {
        out.add(issue(levelErr, "meter.medium.mismatch",
          "上级表的介质对不上：本表是 $medium，而上级表「" + EmModelTree.dis(parent) + "」是 $pm。电表的上级只能是电表，水表的上级只能是水表",
          "铁律 2"))
      }
      if (parent.missing("meter")) {
        out.add(issue(levelErr, "meter.parent.notMeter",
          "上级表指向的不是一块表计（submeterOf）", "铁律 2"))
      }
    }

    // ── 铁律 3：虚表必须有公式；实表必须有 L1 点位 ────────────────
    if (isVirtual) {
      f := rec["emFormula"] as Str
      if (f == null || f.trim.isEmpty) {
        out.add(issue(levelErr, "meter.virtual.noFormula",
          "虚拟表还没填计算公式 —— 它没有实际的采集点，用量只能靠公式算出来（emFormula）", "§3.3.2"))
      }
    } else {
      if (l1Point(points) == null) {
        out.add(issue(levelErr, "meter.l1.missing",
          "这块表没有累积读数采集点 —— 生成能耗台账时会跳过它，等于这块表不产生任何数据",
          "§3.6"))
      }
      if ((rec["emMaxReading"] as Number) == null) {
        out.add(issue(levelWarn, "meter.maxReading.missing",
          "未填表底翻转上限 —— 表数走满一圈归零时无法还原真实用量，那段时间的数据会被丢弃（emMaxReading）",
          "§3.6"))
      }
    }

    // ── 分项仅电有效 ────────────────────────────────────────────
    sub := rec["emSubItem"] as Str
    if (sub != null) {
      if (!EmSubItem.isValid(sub)) {
        out.add(issue(levelErr, "meter.subItem.invalid",
          "用能分项填了不认识的值：$sub", "§3.7"))
      } else if (medium != null && medium != EmMedium.elec) {
        out.add(issue(levelWarn, "meter.subItem.nonElec",
          "用能分项只对电表有效，本表是 $medium —— 这个设置会被忽略（emSubItem）", "表 4-1"))
      }
    }

    // ── 关口表的额外要求 ────────────────────────────────────────
    if (role == EmMeterRole.gateway && rec.missing("emSettlement")) {
      out.add(issue(levelInfo, "meter.gateway.notSettlement",
        "关口表通常也是与供能方结算的表，建议勾选「结算表」（emSettlement）", "§3.3.1"))
    }

    // ── 倍率 ────────────────────────────────────────────────────
    if (medium == EmMedium.elec && !isVirtual) {
      if ((rec["emMeterFactor"] as Number) == null) {
        out.add(issue(levelInfo, "meter.factor.missing",
          "未填综合倍率 —— 带互感器的电表读数需要乘倍率还原，暂按 1 处理（emMeterFactor）", "§3.3"))
      }
    }

    return out
  }

  ** 找 L1 累积读数点：优先认 `emL1Point` 标记，退到 `total and sensor`。
  static Dict? l1Point(Dict[] points) {
    Dict? marked := null
    Dict? fallback := null
    points.each |Dict p| {
      if (p.has("emL1Point") && marked == null) marked = p
      if (p.has("total") && p.has("sensor") && fallback == null) fallback = p
    }
    return marked ?: fallback
  }

//////////////////////////////////////////////////////////////////////////
// 用能设备
//////////////////////////////////////////////////////////////////////////

  static Dict[] validateLoad(Dict rec) {
    out := Dict[,]

    // 铁律 5：EmLoad 是挂在既有 equip 上的能耗身份，不是新设备
    if (rec.missing("equip")) {
      out.add(issue(levelErr, "load.notEquip",
        "能耗身份必须挂在已有的设备上 —— 本系统不重复创建冷机 / 水泵 / 空调机组，只给既有设备补充能耗信息",
        "铁律 5"))
    }

    sub := rec["emSubItem"] as Str
    if (sub == null) {
      out.add(issue(levelWarn, "load.subItem.missing",
        "未选择用能分项 —— 这台设备的用能在分项统计里归不了类（emSubItem）", "§3.7"))
    } else if (!EmSubItem.isValid(sub)) {
      out.add(issue(levelErr, "load.subItem.invalid", "用能分项填了不认识的值：$sub", "§3.7"))
    }

    hasMeter := (rec["emMeterRef"] as Ref) != null
    hasWeight := (rec["emAllocWeight"] as Number) != null ||
                 (rec["emRatedPower"] as Number) != null
    if (!hasMeter && !hasWeight) {
      out.add(issue(levelErr, "load.weight.missing",
        "这台设备既没有指定计量表，也没填额定功率或分摊权重 —— 它的用能既算不出来也分摊不到（emMeterRef / emRatedPower / emAllocWeight）", "§3.5"))
    }

    return out
  }

//////////////////////////////////////////////////////////////////////////
// 辅助
//////////////////////////////////////////////////////////////////////////

  static Dict issue(Str level, Str code, Str msg, Str rule) {
    Etc.makeDict(["level": level, "code": code, "msg": msg, "rule": rule])
  }

  ** 清单里是否有 err 级问题（有则这个对象不该进入台账链路）。
  static Bool hasErrors(Dict[] issues) {
    found := false
    issues.each |Dict i| { if (i["level"] == levelErr) found = true }
    return found
  }
}
