# energyMatrix — 建筑能源管理数字孪生 Pod

Xeto lib `em` — 语义模型两层交付

```
energyMatrix/lib/em/
  lib.xeto          # 库声明与依赖
  tags.xeto         # 全局标签、枚举、Choice
  # ---- Layer 1 对象与设备数据模型 ----
  spaces.xeto       # 域1 空间与组织
  meters.xeto       # 域2 计量器具（核心）
  supply.xeto       # 域3 供能/产能/储能
  loads.xeto        # 域4 用能设备
  points.xeto       # 点位规范（L1 raw / L2 delta）
  # ---- Layer 2 能源管理业务对象模型 ----
  ledger.xeto       # 域5 能耗台账（两层唯一桥梁）
  alloc.xeto        # 域6 分摊规则引擎
  tariff.xeto       # 域7 费率/合约/账单
  kpi.xeto          # 域8 指标体系与定额
  baseline.xeto     # 域9 基线与节能量核证（IPMVP）
  carbon.xeto       # 域10 碳资产
  diagnostic.xeto   # 域11 诊断与闭环
```

## Layer 1 五条铁律
1. 一切能耗数值归属唯一 `EmMeter`，禁止裸点入账。
2. 表计层级用 `submeterOf` 构成 DAG，禁止跨介质挂接。
3. 物理表与虚拟表同构（`emVirtual` + `emFormula`）。
4. 每个数值必带 `emDataSource`，可追溯。
5. 不重复定义冷机/水泵/AHU，复用 ph.equips 与 CoolMatrix/heatMatrix。

## Layer 2 五条铁律
6. 业务对象只读 `EmLedgerEntry`，禁止直读点位。
7. 台账关账后不可变，修正一律走红冲（`emReversalOf`）。
8. 业务参数（费率 `EmTariff`、因子 `EmEmissionFactor`）随时间版本化，
   且必填 `emSourceDoc` 依据文件号。
9. 账单、碳账、指标均为台账的确定性投影，可无损重算。
10. 节能量默认 `emVerifyStatus: planned`（规划目标），
    未经 IPMVP 基线核证不得以 verified 形式对外。

## 数据流
```
物理表读数 ──▶ L1 raw(total) ──▶ L2 delta ──▶ EmLedgerEntry ──▶ 关账
                                    ▲              │
                          EmAllocRule 分摊 ─────────┤
                                                   ├──▶ EmBill      (× EmTariff)
                                                   ├──▶ EmKpiPoint  (÷ 面积/人数/度日)
                                                   ├──▶ EmCarbonAccount (× EmEmissionFactor)
                                                   └──▶ EmDiagnostic ──▶ EmAnomaly
                                                                            │
                                          EmBaseline ──▶ EmSavingsProject ◀─┘
```
