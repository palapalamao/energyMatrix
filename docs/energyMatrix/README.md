# energyMatrix — 建筑能源管理 FIN Pod

依据《energyMatrix 语义模型设计说明书 V1.0》（AI4B-EM-DS-2026-001，和碳技术（南京）有限公司）
落地的 FIN Framework 5 扩展：Fantom 后端 + React/TypeScript 前端，打包成单个 `energyMatrix.pod`。

与 CoolMatrix（冷源群控）、heatMatrix（智慧供热）、CoolSim（数字孪生仿真）构成同一
Digital Twin System 的四个组件，共享 Project Haystack 语义底座。

---

## 一、这是骨架，哪些能跑、哪些是桩

| 域 | 内容 | 状态 |
|---|---|---|
| 1 空间与组织 | EmSite / EmFloor / EmZone / EmTenant 模板与工厂 | ✅ 可用 |
| **建模器** | 资产树、实体详情与点位、改属性、删实体、逐实体铁律校验 | ✅ **完整实现** |
| **表具与采集器** | 表具台账、通信状态、采集器清单、数据完好率 | ✅ **完整实现** |
| 2 **计量** | 计量树（DAG + 跨介质校验 + 角色汇总）、L1→L2 差分（溢出/换表补偿）、虚拟表求值、缺口量 | ✅ **完整实现** |
| 3 供能产储 | 语义定义齐备（defs.trio / xeto） | ⚠️ 无 ModelEntity 模板 |
| 4 用能设备 | 挂载既有设备（`emAttachLoad`）+ 设备组（`emAddLoadGroup`） | ✅ 可用 |
| 5 **台账** | 台账构建、关账事务（5% 缺口闸门）、红冲、多维聚合、**二维交叉表** | ✅ **完整实现** |
| 6 分摊 | 规则加载 / 排序 / 校验 ✅；七种方法的计算 | ⛔ 桩 |
| 7 费率账单 | 费率版本解析 ✅；计价与账单 | ⛔ 桩 |
| 8 **指标定额** | 指标 / 定额 CRUD、`emFormula` Axon 求值、批量指标（排名）、定额进度 | ✅ **可用**（`EmKpiPoint` 写历史仍是桩） |
| 9 基线核证 | ASHRAE G14 统计验收 ✅、铁律 10 守卫 ✅、项目 / 基线清单 ✅；模型拟合与节能量计算 | ⛔ 桩 |
| 10 **碳资产** | 因子版本解析与快照锁定、Scope 1/2/3 归集、绿证抵消核销、碳目标进度、**折标煤合计** | ✅ **可用**（Scope 3 只认显式标注的因子，无供应链口径） |
| 11 **诊断闭环** | 规则 CRUD、**dataQuality / balance 两类判据**、幂等建异常、确认 / 误报 / 派单、工单状态流（前向单向） | ✅ **可用**（其余六类判据未实现，跑诊断时记在 `meta.emSkipped`） |
| 横切 审计 | `EmDataSourceGuard` / `EmParamVersionGuard` | ✅ **完整实现** |
| 前端 | **13 屏全部接真数据**，无占位页；写操作（建模、关账、确认 / 派单 / 工单流转）已通 | ✅ **完整实现** |
| 前端 · 总览 | 折标煤头卡 + 各介质（环比 / 同比 / 定额）+ 分项堆叠趋势 + 可信度 + 平衡校核 + 关键指标 + 告警摘要 | ✅ **按设计稿版式 A 建成** |

「桩」= 接口签名、文档注释与配置校验都在，方法体抛 `UnsupportedErr` 并写清实现提示。
前端 13 屏的取数端点全部存在，域实现完成后接上即可，**接口不用改**。

---

## 二、十条铁律与它们在代码里的强制点

说明书的十条铁律不是文档里的口号，每一条都有对应的代码强制点：

| 铁律 | 强制点 |
|---|---|
| 1 一切能耗归属唯一 EmMeter，禁裸点入账 | `EmMeterConsumption.of` 拒绝非 meter；`EmDataSourceGuard` 要求 `emMeterRef` |
| 2 同介质 DAG，禁跨介质挂接 | `EmMeterTreeBuilder`：环检测（就地剪断）+ 介质一致性 + 悬挂父引用 |
| 3 物理表与虚拟表同构 | `EmMeterConsumption` 统一分派，上层永远不需要区分 |
| 4 每个数值必带 emDataSource | `EmDataSourceGuard.checkEntry` 在写库前拦截 |
| 5 不重复定义冷机/水泵/AHU | `EmEntityCrud.attachLoad` 只往既有 equip 合并标签，不建新设备 |
| 6 **L2 只读台账，禁直读点位历史** | 目录隔离 + `EmLayerIsolationTest` **扫描源码**自动守卫 |
| 7 关账不可变，修正走红冲 | `EmLedgerBuilder.commitEntry` 跳过 `emClosed`；`EmReversal` 是唯一修改路径 |
| 8 业务参数版本化 + 必填 emSourceDoc | `EmParamVersionGuard`，费率与因子解析时强制过 |
| 9 账单/碳账/指标可无损重算 | 三者的输入只有台账 + 参数版本，没有隐藏状态 |
| 10 节能量默认 planned | `EmSavingsService.newProjectTags` 恒写 planned；`assertPublishable` 守发布口 |
| §5.2 缺口率 5% 闸门 | `EmClosePeriod.isBlocked`（纯函数，被单测钉死） |

两条容易踩的汇总语义（都写在 `EmMeterNode.summableChildren` 里）：

- **考核表不参与汇总** —— 它与某块已计量回路重叠，计入就是重复计量。
- **缺口表不参与汇总** —— 缺口表按 `submeterOf` 挂在源表下面（这样计量树里
  一眼能看出还有多少不明用能），但它是"余量"而不是一块被计量的回路。计入的话
  Σ子表 会恒等于父表、缺口永远是 0，校核彻底失效；而且缺口公式本身要调
  `emSubMeterSum`，计入即无限递归。虚表公式另有 8 层深度守卫
  （`EmEvalScope.withDepth`），任何循环引用会报出是哪块表，而不是打爆栈。

---

## 三、与说明书的偏差

xeto 原稿有 2 处必然冲突、若干处违反它自己的命名约束。修正版收录在
`res/spec/em/`，逐条差异如下。**这些偏差是有意的，改回去会导致编译或语义冲突。**

| # | 原稿 | 本 pod | 理由 |
|---|---|---|---|
| 1 | `emStatus` 一个标签同时是 `EmBillStatus` / `EmAnomalyStatus` / `Str`（工单） | 拆成 `emBillStatus` / `emAnomalyStatus` / `emWorkOrderStatus`，并把工单状态补成正式枚举 | 一个名字三种类型必然冲突 |
| 2 | `emDemandCharge` 既当 marker（从未声明）又当 `EmTariff` 里的 Ref slot | 声明 `emDemandCharge: Marker`，Ref 改名 `emDemandChargeRef` | 同名不能既是标记又是引用 |
| 3 | `meterScope: Str?` | `emMeterScope` | **phIoT 已占用** `^meterScope is ^choice`（值 siteMeter/submeter） |
| 4 | `meterRef` / `sourceRef` / `targetRef` / `payerRef` / `ledgerRefs` / `subjectRef` / `parentRef` | 统一加 `em` 前缀 | 违反说明书 §2.3 自己的强制约束；`meterRef` 还与 L1 的 `emMeterRef` 表示同一语义 |
| 5 | `EmMedium` 定义成 Choice 却全库用 `emMediumId: Str` 自由文本 | 改成 `EmMedium` Enum，标签统一 `emMedium` | 跨介质折标煤与碳核算需要类型保障；Choice 子项名（Elec/Water/…）还与 ph 有撞名风险 |
| 6 | L2 delta **0 个 point spec**（只有一个 `emDelta` Marker） | 补 5 个 delta spec（电/水/气/汽/冷热） | 溢出与换表补偿是 §3.6 的核心，没有落点等于读数与增量在模型层没分开 |
| 7 | `EmElecMeter` 挂 `elecMeter` 等小驼峰 marker | trio 侧写 `equip meter elec`；xeto 保留并加注 | phIoT 里没有这些 marker，Haystack 4 用 conjunct `elec-meter` 表达 |
| 8 | 虚表 / 缺口表只有标签没有具名 spec | 保持标签驱动，但给出 `EmVirtualMeter.trio` / `EmGapMeter.trio` 两个模板 | UI 的 virtual/gap 徽标需要有实体可落 |
| 9 | `EmAdjustment.emDelta: Number` | `emAdjDelta` | 与 L2 增量点的 `emDelta` marker 同名冲突 |
| 10 | 账期只有 `span: Span` | 增补 `emPeriod: Str` 索引投影 | Span 无法用 Haystack filter 做等值查询，而「同表同账期只能有一条有效条目」是幂等重建与红冲链的前提。`span` 仍是语义权威 |
| 11 | 无 | 增补 `emGapThreshold`（站点）、`emL1Point`、`emLocked`、`emCorrects` | 分别用于：闸门阈值按站点覆盖、L1 权威点消歧、参数版本锁定、修正链补全 |

### Xeto 与 FIN 5.3 的关系（最重要的一条）

说明书 §2.2 要求交付 Xeto 库 `em`。但目标运行环境 **FIN 5.3（hetan_5.3.0.2761）
内置 haystack 3.1.5.1，属 Haystack 4 defs 体系，全部 284 个框架 pod 中不存在
任何 xeto pod** —— Xeto 在这里无法编译、无法加载。

所以采用双轨：

- `res/spec/em/*.xeto` —— **规格源真相**，随 pod 打包供人阅读，未来迁到
  Haxall 4.x / Haystack 5 时直接可用。FIN 5.3 不解析它。
- `lib/defs.trio` —— FIN 5.3 上的等价定义（约 150 个标签 + 16 个枚举）。
- `res/defaultModels/*.trio` —— ModelEntity 模板，实例化设备与表计的唯一入口。

注：即使 `lib/defs.trio` 没有被 def 编译器加载，Folio 也允许写入未声明的标签
（coolMatrix 的 `cmXxx` 就是这么用的），所以它对运行**不是**硬依赖 ——
它的价值在于让标签在 FIN 的 def 浏览器与建模工具里可发现、可校验。

---

## 四、说明书 §6 待决事项的骨架取舍

| 编号 | 事项 | 本骨架 | 改动成本 |
|---|---|---|---|
| OI-01 | 台账落库粒度 | **daily 落库**，hourly 只留历史 | 低 —— `EmGranularity` 四值全支持，改 Job 参数即可 |
| OI-02 | 账单归属 | **只算不出账**，`EmBill` 模型保留 | 中 —— 域 7 本轮是桩，实现时一并定 |
| OI-03 | 指标公式形式 | **Axon 表达式**，绑定 `emSelf`（Dict）与 `emSpan`；取数函数收 Ref，公式写 `emSelf->id`（不留隐式强转） | 中 —— 换成固化算子要改 `EmKpiService.compute` |
| OI-04 | EmZone 语义 | **允许跨楼层**（挂 siteRef 而非 floorRef） | 高 —— 改了要迁数据 |
| OI-05 | 租户主数据 | **进 Folio**（`EmTenant` 是 Folio rec） | 高 —— 改成外键要重做 `emTenantRef` 的引用完整性 |

---

## 五、目录结构

```
extensions/energyMatrix/
├── build.fan                 finBuild / BuildFinPod（注释里写满了踩坑）
├── scripts/build.sh|.ps1     构建脚本，--fantom-only 做纯后端检查
├── fan/
│   ├── EnergyMatrixExt.fan   const Ext，生命周期 + 日志门面 + observers
│   ├── EnergyMatrixLib.fan   薄 @Axon 门面（方法体 1–5 行，逻辑全在 service）
│   ├── models/      ★        ModelEntity（组合继承）+ 建模器（资产树/校验/守卫）
│   ├── meter/       ★        计量树、读数差分、虚拟表、缺口量
│   ├── ledger/      ★        台账构建、关账事务、红冲、查询、夜间流水线
│   ├── audit/       ★        数据来源分级、参数版本化守卫
│   ├── kpi/         ★        指标定义 CRUD、emFormula 求值、定额进度
│   ├── carbon/      ★        因子版本、Scope 归集、绿证抵消、碳目标进度
│   ├── diagnostic/  ★        规则引擎（两类判据）、异常状态机、工单状态流
│   ├── alloc|tariff|baseline/                        三个域的 service 桩
│   ├── observers/            obsCommits 订阅（表计变更 → 作废计量树缓存）
│   └── test/                 6 个测试类，87 个用例
├── lib/
│   ├── defs.trio             FIN 5.3 的定义库（emXxx 标签 + 16 枚举）
│   ├── menu.trio             finStackMobileMenu，13 屏深链
│   ├── queries.trio          纯 Axon 查询 + 建模期巡检（找出违反铁律的记录）
│   └── demo.trio             5 层商业综合体示范数据（emDemoBuild / emDemoClear）
├── locale/{en,zh}.props
├── res/
│   ├── defaultModels/*.trio  14 个 ModelEntity 模板
│   ├── defaultJobs/jobs.trio 唯一一个串行 Job
│   ├── spec/em/*.xeto        14 个 xeto 修正版（规格源真相）
│   └── web/em/               Vite 产物（不入库）
└── ts/                       Vite5 + React18 + MobX + Tailwind + haystack-nclient
    └── src/
        ├── api/              client（再导出）+ emApi（80 个 Axon 的薄封装）
        ├── mvvm/             BaseStore / BaseViewModel / useViewModel
        ├── components/       AppShell / SiteContext / PageHeader / Bits（共用小件）
        ├── pages/shared.ts   跨屏展示字典与格式化（只管展示，不含任何口径）
        └── pages/<Screen>/   13 屏，每屏一个 View + 一个 ViewModel
```

---

## 六、构建与验证

```bash
FAN=/Users/syatanic/Apps/fin/hetan_5.3.0.2761/bin/fan
cd extensions/energyMatrix

# 纯 Fantom 编译检查（自动临时注释 nodeDirs，不跑前端）
PATH="$(dirname $FAN):$PATH" ./scripts/build.sh --fantom-only

# 单元测试
/Users/syatanic/Apps/fin/hetan_5.3.0.2761/bin/fant energyMatrix

# 完整构建：finBuild 先跑 ts/ 的 vite build，再编译 Fantom
PATH="$(dirname $FAN):$PATH" ./scripts/build.sh
```

**编译必须用运行中 FIN server 所用的那个安装** —— 用别的版本构建，pod 会落到
另一个 `fan.home` 的 `lib/fan/` 下，live server 永远不会加载它。
确认方法：`ps aux | grep -i hetan`，看 `-Dfan.home=…`。

### 运行期验证（需人工，一次跑通即可确认端到端）

1. 重启 `finStackHost`，在 FIN 设置里安装 `energyMatrix.pod`
2. 顶栏出现 energyMatrix 菜单及 13 个子项；点开后**硬刷新**（Cmd+Shift+R，pod 内 SPA 缓存很激进）
3. **一条命令铺一份完整的示范数据**（最快的验证路径）：

```
emDemoBuild()                       // 完整模型 + 近期历史 + 台账 + 诊断
emDemoBuild("XX 广场", 30)           // 指定名称与天数，默认完成业务派生
emDemoBuild("XX 广场", 0, false)     // 只建模型，不写历史和业务派生
emDemoClear()                    // 清空（破坏性，只在演示环境用）
```

   所有示范记录都带 `emSynthetic` 和 `emDataProvenance:"emDemoBuild"`，不能与真实
   现场数据混淆。建出来的是：1 站点 / 5 楼层 / 6 分区 / 4 租户 / 三级电计量树（关口 → 12 个
   国标分项 → 每层子表 + 租户表）/ 水气冷三种介质 / 3 块缺口表 / 1 块考核表 /
   4 个设备组 / 2 份费率 + 3 个排放因子（含上一年版本）/ 5 条指标定义 /
   3 条不同来源的定额 / 5 条诊断规则 / 1 条基线 + 2 个节能项目 /
   1 个碳目标 + 2 张绿证（一张已注销、一张未注销）。
   缺口是**故意留的**：电 3.2%、水 1.1%，都在 5% 闸门以下 —— 关账能过，
   同时「平衡校核」卡上看得见非零的数。
   同样是故意的还有：诊断规则里只有 2 条判据已实现，另 3 条会被跳过并显示在
   告警屏上；绿证有一张没注销，用来演示抵消资格检查。

   默认的第三参数 `finalize:true` 会继续构建当月台账并运行诊断，13 个屏可直接
   检查。它不会自动关账，也不会伪造已完成工单。如需手动重跑派生：

```
site: read(energyMatrix and site)->id
emLedgerBuild(site, emThisMonthSpan(), "daily")     // 台账 → 总览/分析/定额/碳排
emDiagRun(site, emThisMonthSpan())                  // 诊断 → 告警屏；再去派单建工单
emClosePeriod(site, emThisMonthSpan(), "daily", null, true)   // 关账预检 → 报表屏
```

   FIN 原生设备树使用 `/site/[floor]/equip/point`：有真实 `floorRef` 的设备显示在
   楼层下，站级或跨楼层设备直接显示在 site 下。已有 `mytest` 数据先审阅并运行
   `scripts/mytest-native-nav-migration.axon`；脚本默认 `preview:true`，执行前必须导出
   项目备份。

   `mytest` 迁移流程（脚本不会随 pod 自动运行）：

   1. 在 FIN 项目管理中导出 `mytest` 全量备份，并记录备份文件时间。
   2. 安装新 pod、重启 `finStackHost`，先执行
      `site: read(energyMatrix and site)->id; emDataAudit(site)` 保存迁移前审计结果。
   3. 打开 `scripts/mytest-native-nav-migration.axon`，保持 `preview:true`，把完整
      `do ... end` 粘贴到 Axon Shell。确认 `nav.action`、`recordPlans`、
      `historyPlans`，且没有 `blocked`；此时不会提交 Diff 或写历史。
   4. 只有预览无歧义后，把同一脚本中的 `preview` 改成 `false` 再执行一次。
      脚本只改命名站点的测试记录、唯一 `navMeta`、缺失/过期的 demo 历史；发现
      已关账台账时会跳过业务派生，不会改关账数据。
   5. 再以 `preview:true` 执行：记录项应全部为 `skip`，历史应为 `skip`；随后运行
      `emDataAudit(site)`。目标是无 `error`，有解释的 `info/warning` 可保留。
   6. 确认 `read(navMeta)->equipPath` 为 `/site/[floor]/equip/point`，重启
      `finStackHost` 并用 `Ctrl+Shift+R` 硬刷新浏览器。若验收失败，停止继续写入，
      用第 1 步的全量备份恢复；脚本本身不提供删除式回滚。

4. **或者用「数据模型配置」屏手工建**（验证模板实例化的交互路径）：
   - 「新建对象」→ 站点，填建筑面积
   - 顶栏切到新建的站点 → 「新建对象」→ 表计（介质「电」、角色「关口表」）
   - 再建两块「分项表」，上级表选关口表（下拉里只会列出同介质的表）
   - 「新建对象」→ 缺口表，选刚才那块关口表（公式自动生成）
   - 「新建对象」→ 楼层（填楼层号）；再建一个分区并选到该楼层下
   - 「新建对象」→ 租户，上级组织留空（这一步验证顶层组织的 Arg 默认值）
   - 选中任一块表 → 「采集点位」页签应看到模板生成的表底累积读数与区间用量
   - 「检查」页签应提示缺「表底翻转上限」之类的建议项；把介质改成「水」再保存，
     应被上下级介质不一致的校验拒绝
   - 试着删除关口表：确认框会报出影响面（采集点位数 / 能耗记录数）

   注：UI 里**不展示** xeto 规格源码。规格文件仍随 pod 打包，需要时用
   `emSpecFiles()` / `emSpecSource("meters")` 在 Axon 控制台读。
5. 也可以逐条用 Axon 建，跑通台账闭环：

```
site: emAddSite("演示站点", {area: 28400m², emUsageType: "office"})
gw:   emAddMeter(site, "elec", "关口表", {emMeterRole: "gateway"})
b1:   emAddMeter(site, "elec", "冷热站", {emMeterRole: "branch", submeterOf: gw, emSubItem: "b1"})
a1:   emAddMeter(site, "elec", "照明",   {emMeterRole: "branch", submeterOf: gw, emSubItem: "a1"})
gap:  emAddGapMeter(site, gw)

emMeterTreeValidate(site)                     // 应返回空 Grid
// 给三块表的 L1 点写一段历史后：
emLedgerBuild(site, toSpan(2026-07-01..2026-07-31), "daily")
emSiteGapRatio(site, toSpan(2026-07-01..2026-07-31))
// toSpan 的第二个参数是**时区**不是结束日期 —— 要传一个（闭）日期区间
emClosePeriod(site, toSpan(2026-07-01..2026-07-31), "daily", null, true)   // 预检
```

6. **验证总览驾驶舱**（这一屏是示范数据最直接的检验）：
   - 头卡「综合能耗」应是折标煤 tce，且底下列出电 / 燃气两项明细；
     **右侧应显示「未计入：水（无折标煤系数）」** —— 水没有 `emCoalFactor` 是对的，
     但这句话必须出现，否则分不清"本来不计入"和"参数漏录"
   - 各介质卡的「环比」有值（示范数据是连续日序列），「同比」应为 `—`
     （去年同期没有台账，标注也说了原因）—— 出现具体数字反而说明算错了
   - 电、水两张卡有定额进度条，冷量那张显示「未设定额」
   - 分项堆叠趋势应有 14 根柱子（默认天数），鼠标悬停能看到当天各分项的明细
   - 「可结算口径」应接近 100%（示范数据全是 measured）
   - 缺口率约 3.2%，进度条落在 5% 闸门的三分之二处
   - 「关键指标」的 EUI 有值；净碳排有值；已核证节能量应为 82,100 kWh
     并注明「另有 1 个项目未核证」
   - 跑过 `emDiagRun` 后，右下角「待处理告警」有内容，页头出现红色告警数徽标
7. **验证诊断闭环**（三屏）：
   - 「实时监测与告警」→ 右上角「跑一次诊断」→ 应出现异常，且顶部提示条列出
     被跳过的规则（`OC-01 / SW-01 / QR-01`，判据尚未实现）
   - **再点一次**「跑一次诊断」→ 新建数应为 0（幂等：同规则 + 同对象 + 同账期
     只有一条异常）
   - 勾选两条异常 → 填负责人 → 「派单」→ 「工单管理」屏看板的「已派单」列出现一张
   - 打开工单 → 选一个节能项目 → 推进到「已完成」→ 回告警屏，那两条异常应变成
     「已处置」
   - 工单推到 closed 后，详情里不再有推进按钮（状态不可回退）
8. **验证碳账口径**：「碳排与双碳目标」屏
   - 因子版本表里当年那条应标「本期在用」，上一年那条标「已锁定」
   - 未注销的那张绿证不计入抵消（抵消量只反映已注销的 500000 kWh × 电网因子）
   - 把某条因子的 `emFactorUnit` 改成 `tCO2e/MWh` 再刷新 → 页面顶部应报
     「分母对不上」而不是悄悄算错 1000 倍
9. 验证闸门：把某块子表的读数调小，让缺口率超 5%，再跑一次预检 —— meta 的
   `status` 应为 `blocked`，rows 是未平衡表计清单
10. 验证红冲：关账后 `emReverseLedgerEntry(entryId, "补采后重录")`，
   `emLedgerChain(entryId)` 应返回三条记录

> ⚠️ **尚未做过运行期验证的部分**：`res/defaultModels/*.trio` 的组合继承实例化
> （`readTrioWithSwizzle` + `extendByDicts` 的合并行为、`Walk("equipRef>siteRef")`
> 的引用解析）需要活的 proj 才能跑，纯内存测试会在 `XStrResolver ... No proj
> available` 失败。上面第 3 步就是这条路径的验证 —— 建一块表后去「点位」页签，
> 能看到 L1/L2 两个点位、且 `siteRef` 已由 `Walk` 解析出来，就说明组合继承生效了。

---

## 七、踩坑清单（改代码前先看这里）

### 构建

1. `srcDirs` / `resDirs` **非递归** —— 每新建一个子目录都要在 build.fan 里加一行
2. 漏 `index["fin.lang"]` → `locale/` **静默**不加载，没有任何报错
3. `index` 三键（skyarc.ext / skyarc.lib / fin.lang）缺一，FIN 静默丢掉本 ext
4. 不发 Graphic Builder 图元就别写 `meta["fin.components"]`，否则 FINGraphicsService 告警"未找到组件文件"
5. `@ExtMeta.depends` 填的是 **Ext 名**不是 pod 名（`finStackCoreExt` → `"finStackCore"`）
6. `BuildFinPod` 没有 `testDirs`，`fan/test/` 当普通 srcDir 编进 pod
7. `nodeDirs` 会在 Fantom 编译**之前**跑 `npm run build`，所以 `ts/` 要先 `npm install`
8. `.md` 资源会被 FIN 的 pod router 拒（400），文档不要指望在 pod 里在线打开

### Fantom

9. Ext 必须 `const class`；可变状态只能进 `AtomicBool` / `ConcurrentMap`；`onStart` 不直接写 Folio
10. **`it` 是关键字**，不能当闭包参数名（`|EmDeltaItem it|` 报 "Expected expression statement"）
11. **`virtual` 是关键字**，不能当常量名（本 pod 里是 `EmMeterRole.virtualRole`）
12. **链式 elvis + `as` 转换解析不了**：`(a as Str) ?: (b as Str) ?: c` 报错，要拆成显式 null 检查
13. **`Span` 没有公开的两参构造** —— 用 `Span.makeAbs(start, end)`，返回 `Span?`
14. `Month.ordinal` 是 0 基，取月份数字要 `+1`
15. `Number?` 参与算术前必须判 null；除法会丢单位，要用 `CoreLib._as(...)` 还原
16. Fantom 侧 `cx.folio.his.read` 没有 Axon `hisRead` 的行数上限，跨年查询不会被截断
17. `HisLib.hisWrite` 返回 Future，要 `((Future)...).waitFor(10sec)` 才算落盘
18. 空 Grid 不做 `[0]` 索引、不 `colToList`
19. 排序比较器要满足反对称性（两者都 null 返回 0，只判一边会得到不确定顺序）
20. 日志一律走 `EnergyMatrixExt.logInfo/logWarn/logErr`，**绝不用 `echo`**
21. filter 里引用 ref 一律 `$ref.toCode`
22. 多语句方法体要显式 `return`；`each{}` 里 `return` 非法；`static` 字段必须 `const`

### Axon / trio

23. **`toSpan(x, tz)` 的第二个参数是时区，不是结束日期**。要表示一段账期得传日期
    区间：`toSpan(2026-07-01..2026-07-31)`。Axon 的日期区间是**闭区间**，转成 Span
    后右端自动到次日 0 点 —— 所以 `toSpan(today()..today())` 正是"今天一整天"，
    不会掉进 `today..today` 零时长的坑
24. **区间 `(a..b)` 不是可迭代集合**。对它 `.map` / `.each` / `.toList`，回调拿到的是
    `ObjRange` 本身而不是元素，运行时报
    `Unsupported operation haystack::ObjRange mul haystack::Number` —— 与真实原因
    毫不相干。要循环就用**字面量列表**（如 24 个小时）或**递归**（如天数），
    见 `lib/demo.trio` 的 `emDemoHisDays`；区间当**值**用（`toSpan(a..b)`）没问题。
    `EmAxonSyntaxTest.test_noRangeIteration` 守着这条
25. 没有 `%`；这个安装里连 `mod()` 都没有，`floor()` 在 `hxMath`（需单独启用那个库）。
    也没有 `.toInt`
26. **trio 里的 Axon 不参与编译** —— 语法写错了 `fan build.fan` 照样成功，直到有人
    点了那个按钮才炸。`EmAxonSyntaxTest` 把每个 `src` 过一遍 Axon 解析器挡住这类错误
27. trio 里 `enabled` 之类布尔可能是字符串 `"F"`，必须 `== true` 判断，不能裸 marker 匹配
28. **Job 的身份是 `dis`** —— 改名等于新建，旧的会留在库里继续跑
29. **有依赖顺序的 Job 不要靠时间错开**，合并成一个串行 Job（本 pod 的 `emNightlyPipeline` 就是这个原因）
30. 基类 trio 的每个 `Arg("x")` **必须带默认值**（`Arg("x:default")`，`N` = null）
31. Arg 默认值不能是"数字开头但非数值"（`200x100` 会 ParseErr）
32. **可为空的 Arg 必须写 `Arg("x:N")`**。`Etc.makeDict` 会丢掉值为 null 的键，
    所以"传了 null"和"没传"在模板看来是同一回事 —— 顶层组织的 parentRef 就是 null，
    于是 `emAddTenant(null, …)` 报 `Missing argument: Arg("parentId")`。
    `EmModelTest.test_templateArgsHaveDefaultsWhereOptional` 守着这条

### 前端

33. `assetsDir: "."` 拍平资源目录 —— `resDirs` 非递归，多一层子目录就打不进 pod
34. `base: "./"` 相对路径 —— FIN 从 pod 根路径提供服务，绝对 URL 会 404
35. 必须 hash 路由 —— FIN 用 iframe 加载，history API 会把地址改成外壳路径
36. `accept: "text/zinc"` 必须写 —— JSON 会丢单位、时区与列 meta
37. 动态参数一律 `.toAxon()`，**绝不**把用户输入拼进 Axon 表达式
38. 读字段一律 `dict.get<HType>(tag)?.value`；`dict.id` 的类型太宽，用 `get<HRef>("id")`
39. 绝不手写 `fetch('/api/{proj}/eval')` —— `Client` 已封装 attest-key / cookie / CSRF
40. 部署后必须硬刷新（Cmd+Shift+R）
41. **@Axon 返回的 Dict，键必须是合法 Haystack 标签名（小写开头）**。Axon 会把返回
    Dict 转成单行 Grid（键 → 列名），`EmMedium` 这种大驼峰键在这一步抛
    `Invalid col name`；而这发生在**响应序列化过程中**，客户端收到的是被截断的
    Zinc，报的却是 `Could not find a value`（haystack-core 的 ZincReader 读到末尾），
    与真正的原因毫无关系。要返回"名字是大驼峰"的数据就用 **Grid**（把名字放进
    `name` 列），别用 Dict 的键。`EmModelTest.test_axonDictKeysAreValidColNames`
    守着这条。
42. **MobX Store 的 observable 字段必须带初始化器**：写 `foo: T | undefined = undefined`，
    不要写 `foo?: T`。本项目 `useDefineForClassFields: false`（装饰器需要），TS 只为带
    初始化器的字段生成赋值，纯类型声明的字段在实例上不存在，`makeObservable` 会抛
    `[MobX] minified error nr: 1 … Cannot decorate undefined property`。
    `strictPropertyInitialization` 豁免可选属性，**类型检查过得去，只有运行时才炸**。
43. 嵌套 Dict（如 `emAnomalyStats` 的 `emByCategory`）用 `dict.get<HDict>(k).keys` +
    `get<HNum>` 遍历，**不要 `toJSON()`** —— toJSON 把不带单位的数字变成裸 number、
    带单位的变成 `{_kind:"number", val, unit}`，两种形状都得处理才对，很容易只写一种
44. Ref 列表参数拼成 Axon 的 `[…]` 时，每个元素也要 `HRef.make(id).toAxon()`。
    手拼 `"@" + id` 会漏掉项目前缀（`p:proj:r:xxxx`）
45. `HDateTime` / `HDate` 的 `.value` 就是 ISO 文本，但**不要用 `get<HStr>` 去读** ——
    运行时能拿到值，类型是假的，改天换个读法就静默出错。用 `dt()` / `date()` 助手

### 后端设计约定（这一轮定下来的）

46. **指标公式的自由变量只有两个**：`emSelf`（被评价对象的 **Dict**）与 `emSpan`。
    取数函数（`emLedgerTotal` 等）第一个参数收 **Ref**，所以公式里要写 `emSelf->id`
    而不是 `emSelf` —— 不给 Dict→Ref 留隐式强转，是因为一旦强转规则在别的 FIN 版本
    上不同，指标会**静默算错**而不是报错
47. **排放因子的单位分母必须与台账用量单位一致**，`buildAccount` 不做自动换算：
    因子写 `tCO2e/MWh` 而台账是 `kWh` 会直接报错。差 1000 倍猜错一次，整份碳报告作废 ——
    在这里停下来让人把因子录对，比事后对账便宜得多
48. **判据没实现的诊断规则不抛错、也不静默跳过**，记进 `meta.emSkipped` 由 UI 显示。
    抛错会丢掉已经跑出来的异常；静默跳过等于谎报那些规则在工作
49. **工单状态只能沿流程往前走**（`EmWorkOrderStatus.all.index` 比大小）。允许任意
    跳转的状态机等于没有状态机，事后没人说得清一张单子经历过什么
50. **每个 `@Axon` 都要有中英 locale 条目**，`EmAxonSyntaxTest.test_axonFuncsHaveLocale`
    对账。缺条目不报错，FIN 只是把函数名原样显示——这个测试第一次跑就抓到 20 个
51. **交叉表的列维度只能是枚举型**（`subItem` / `medium`）。Ref 型维度摊成列名会在
    `Etc.makeDictsGrid` **构造阶段**就抛 `Invalid col name` —— 不是序列化时。
    `EmLedgerQuery.enumDims` 提前拦住并报一个说得清的错；
    `EmModelTest.test_crosstabColNames` 两头都钉住（分项编码可以、Ref 不行）
52. **凡是"取第 0 行当最近一条"的查询，后端必须先排序**。`emClosePeriods` 原来直接
    返回 Folio 的顺序，总览卡和左下角状态条都取 `[0]`，显示出来的"最近批次"是随机的
53. **返回 Dict 时不要嵌套 Grid**。Zinc 的嵌套栅格是粗糙地带，而且通常不必要 ——
    照 `emCarbonAccount` / `emCoalEquivalent` 的做法：**明细放 rows，合计放 meta**

---

## 八、扩展指引

- **实现一个桩域**：service 类的方法体已经写清实现提示与必须遵守的约束，
  取数一律经 `EmLedgerQuery`（`EmLayerIsolationTest` 会在编译后扫源码守着这条）。
- **加一种介质**：`EmMedium` 加值 → `lib/defs.trio` 的枚举加值 →
  `res/defaultModels/` 加一份子模板 → `fan/models/ModelEntityEmMeters.fan` 加一个子类 →
  `EmEntityCrud.newMeterModel` 加一个分支。
### 用能设备从哪来

铁律 5 规定本系统**不重复创建**冷机、水泵、空调箱 —— 那是 `ph.equips` 与
CoolMatrix / heatMatrix 的职责。所以设备有两条来路：

| 场景 | 做法 |
|---|---|
| 现场真实存在的单台设备 | 先由 **FIN DB Builder** 手工建、或由**采集器点位发现**自动建、或已有其他扩展建好；再在建模页用「挂载已有设备」给它补充分项与计量归属 |
| 没有独立计量、不按单台管理的批量对象（一层楼的灯具回路、一片插座） | 建模页「用能设备组」直接建 —— `EmLoadGroup` 本来就是说明书表 3-5 里 energyMatrix 自己的对象，不与任何 HVAC 模型重复 |

建模页在候选设备为空时会直接把这段说明显示出来，不会让人对着空下拉猜。

- **加一个屏**：`ts/src/routes.tsx` 加路由 → `AppShell.NAV_GROUPS` 加导航项 →
  **同步改 `lib/menu.trio` 的深链**（不改的话菜单点进来是空白页）。
- **加一个 Axon 函数**：写在 `EnergyMatrixLib`（方法体 1–5 行委托给 service），
  同时补 `locale/{en,zh}.props` 的 `.dis` / `.doc`。
