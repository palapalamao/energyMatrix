# 重点负荷与电气安全监测 · 设计决策记录

> 日期：2026-09-17 ｜ 分支：develop ｜ 阶段：阶段 1（需求文档更新，已提交待确认）
> 上游需求文档：AI4B-EM-DS-2026-001《energyMatrix 语义模型设计说明书》V0.1.3（新增 7.3 节）

## Goal

面向医院一、二类医疗场所的电气安全运行场景，新增第 16 屏「电气安全」（`/safety`），对四个子需求进行 24 小时连续监测与预警：

1. **重点负荷实时监控**：手术室 / ICU / 急诊等一级负荷配电回路的电压、电流、功率、温度。
2. **医用隔离电源（IT 系统）绝缘监测**：二类医疗场所 IT 系统绝缘电阻等，保障用电安全（参照 IEC 60364-7-710 惯例）。
3. **电能质量分析**：谐波（THD）、电压暂降、三相不平衡，保障 CT / MRI 等精密设备稳定运行。
4. **电气火灾预警**：线缆温度、剩余（漏电）流监测，提前识别火灾隐患。

## 已确认决策（评审要点）

| 决策点 | 结论 | 备选（已否决/二期） |
|---|---|---|
| 入口位置 | 新屏「电气安全」，第 16 屏，hash 路由 `/safety`，FIN 顶栏菜单归「监测运行」组，位于「实时监测与告警」之后 | 拆四个独立屏（评审可再定夺屏名/分组） |
| 子视图形态 | 屏内四个 Tab 对应四个子需求 | 四屏并列菜单 |
| 数据层 | Layer 1 实时监测，hisRead 读点位历史；不进入 L2 能耗台账（与铁律 6 不冲突） | 台账化归档（否决） |
| 告警闭环 | 复用域 11：EmDiagRuleEngine 阈值规则（emExpr）→ EmAnomaly 异常事件 → EmWorkOrder 工单；阈值规则可配置 | 新建独立告警体系（否决） |
| 控制边界 | 只监测、不控制；页面无任何写控制点操作 | — |
| 既有「实时监测与告警」屏 | 保持不动——它是诊断异常事件列表 + 工单派发（EmAnomaly），与本屏（回路参数实时监控）互补 | 合并两屏（否决） |

## 模型缺口与对策（需求已写明，阶段 2 落地）

| 缺口 | 对策 | 落点 |
|---|---|---|
| 绝缘电阻无点位规范 | 新增 EmInsulationResistance（kΩ） | `res/spec/em/points.xeto` + `lib/defs.trio` |
| 剩余电流无点位规范 | 新增 EmResidualCurrent（mA） | 同上 |
| 谐波无点位规范 | 新增 EmThdV / EmThdI（%） | 同上 |
| 三相不平衡无点位规范 | 新增 EmUnbalance（%） | 同上 |
| IT 隔离电源柜无 equip 类型 | 新增 IT 隔离电源柜 equip 类型，挂场所与供电回路 | `loads.xeto` 或新模型文件 + `lib/defs.trio` |
| 电压暂降（事件型） | 「his 点 + 异常事件」双轨：曲线留痕 + 事件闭环 | 规则引擎 + EmAnomaly |
| **数据缺口（用户硬性要求）** | mytest 四院区补齐重点负荷回路监测点位、IT 隔离电源柜与 his 模拟数据——缺的数建立到设备树与标签上 | 阶段 3 demo 数据脚本，随 V0.1.3 一并交付 |

已存在、无需新增：EmVolt / EmCurrent / EmElecPowerActive / EmTemp / EmFreq / EmLoadRate（points.xeto 既有）。

## 接口预期（阶段 2 写入详细设计文档）

- 无新后端 Axon 函数；前端复用既有 hisRead 通道与规则引擎读取。
- 阶段 2 在详细设计文档接口节写清封装签名（如 emApi 层 his 读取封装）后再动 trio。

## 版本（本次同步执行）

- pod / 前端包 / Xeto 库 / 两份设计文档版本统一为 **0.1.3**（本阶段先升需求文档至 V0.1.3，代码版本号在阶段 3 升）。
- 需求文档封面版本行已同步（V0.1.2 → V0.1.3），公司名维持「西门子中国」。

## 阶段闸门（硬约束）

1. **阶段 1（本阶段）**：只更新需求文档（spec md+docx）+ 本文档 → 提交 develop → **停下等确认**。
2. 阶段 2（确认后）：详细设计文档（路由骨架 /safety、模块条目、接口契约）、points.xeto 等模型补齐、menu.trio 菜单项、locale 词条、`plans/` 任务清单。
3. 阶段 3（再确认后）：Safety 四 Tab 开发、routes 接通、版本号升级 0.1.3、测试 + tsc + `fant energyMatrix`、build.ps1 出 pod、部署 FIN 重启、四院区设备树数据补齐、真机目检、PR。

---

## 阶段 2 记录（2026-09-17，详细设计 + 模型 + trio，commit 59a5c83）

阶段 1 确认后执行，未动任何前端页面代码。

- 详细设计文档（md + docx，AI4B-EM-DD-2026-001）：V0.1.2 → V0.1.3；上游引用同步 V0.1.3；
  4.4 新增电气安全数据契约段（hisRead 直读 L1、暂降双轨、告警复用域 11、无新增后端接口）；
  5.2 路由骨架加 /safety；5.3 加「电气安全」模块行；5.4 加前端取数契约；
  5.5 权限矩阵加行（全角色只读）；附录 B 加 /em/safety。
  docx 抽文本验证：V0.1.3×6、电气安全×7、和碳 0 残留；md 同口径一致。
- 模型：points.xeto 新增 EmInsulationResistance(kΩ)/EmThdV(%)/EmThdI(%)/EmUnbalance(%)/
  EmResidualCurrent(mA) 五点位规范 + emInsulation/emThd/emUnbalance/emResidualCurrent 四 marker；
  supply.xeto 新增 EmItIsolationPanel（医用 IT 隔离电源柜）。
- **落点定夺**：IT 柜 equip 按变配电归类进 supply.xeto（与 EmTransformer 同组、继承
  EmSupplyEquip），未新建模型文件、未放 loads.xeto（用能设备域）——它是供电侧设备。
  阈值做成 emIrAlarmThreshold 逐柜可配（默认 50 Ω/V × 系统电压）。
- defs.trio（FIN 5.3 真正生效的 def 库）：补 emInsulation/emThd/emUnbalance/emResidualCurrent/
  emItIsolation 五个 marker def（xeto 在 FIN 5.3 无法编译，仅作规格源真相，见 build.fan 注）。
- trio：menu.trio 加 entry("电气安全", "/safety", -317.5, "icon-flag")（监测运行组、
  实时监测与告警之后）；屏数注释 15→16。TrioReader 实测解析通过（menu 1 def / defs 215 defs）。
- 静态 demo（docs/demo/2026-09-17-em-safety-screen/em-safety-demo.html）已随本阶段入库，
  是评审确认的交互原型，阶段 3 前端实现的参照。
- 更正：「locale 词条」按 KPI 阶段先例拆清——lib 级 zh.props/en.props 因无新增 Axon 函数
  零变更；UI 屏内词条在 ts/src/i18n/*.json，随阶段 3 前端代码补。
- 阶段 3 验证项：真机目检菜单图标 icon-flag 渲染（icon 字体为二进制无法离线核验，
  若缺字回退 icon-alert）。
