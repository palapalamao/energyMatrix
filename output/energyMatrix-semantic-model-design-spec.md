`ai4building  ·  Digital Twin System`

`**energyMatrix**`

**语义模型设计说明书**

建筑能源管理系统 · FIN Framework Pod 插件

版本 V0.1.2

西门子中国

2026 年 9 月

# **文档信息**



| 项目 | 内容 |
| --- | --- |
| 文档名称 | energyMatrix 语义模型设计说明书 |
| 文档编号 | AI4B-EM-DS-2026-001 |
| 版本 | V0.1.2 |
| 密级 | 公司内部 |
| 产品形态 | FIN Framework Pod 插件，Digital Twin System 组成部分 |
| Xeto 库 | em 0.1.2 |
| 编制单位 | 西门子中国 · ai4building |
| 适用范围 | 公共建筑、商业综合体、园区级建筑群的能耗与碳排管理 |
| 关联文档 | CoolMatrix 冷源群控设计说明、heatMatrix 智慧供热设计说明、CoolSim 数字孪生仿真说明 |



## **修订记录**



| 版本 | 日期 | 修订内容 | 编制 |
| --- | --- | --- | --- |
| V0.1 | 2026-08 | Layer 1 对象与设备数据模型初稿 | 架构组 |
| V0.2 | 2026-08 | Layer 2 业务对象模型初稿 | 架构组 |
| V1.0 | 2026-09 | 两层模型合并，补充审计约束与附录 | 架构组 |
| V0.1.1 | 2026-09 | 新增能流图（Sankey）界面需求；公司主体变更为西门子中国；版本统一为 0.1.1 | 架构组 |
| V0.1.2 | 2026-09 | 新增核心 KPI 考核界面需求（绿色医院评审支撑）；EmSite 增加 emBeds 床位参数；版本统一为 0.1.2 | 架构组 |




# **1  概述**

## **1.1  编制目的**

本文档定义 energyMatrix 建筑能源管理系统的语义数据模型，是后续计算引擎开发、点表交底、前端实现与第三方系统对接的唯一模型依据。

模型分两层交付：Layer 1 描述客观存在的物理对象与设备，回答“建筑里有什么、装了哪些表、采了哪些点”；Layer 2 描述能源管理的业务对象，回答“用了多少、谁用的、花多少钱、排多少碳、省了多少”。两层之间以能耗台账（EmLedgerEntry）为唯一桥梁。

本文档不涉及控制逻辑、AI 寻优算法与前端交互设计，这些内容分别由 CoolMatrix、heatMatrix 与 energyMatrix 界面设计说明覆盖。

## **1.2  产品定位**

energyMatrix 以 FIN Framework Pod 插件形式部署，数据存于本地 Folio，不依赖外部云服务。它与 CoolMatrix（冷源群控）、heatMatrix（智慧供热）、CoolSim（数字孪生仿真）构成同一 Digital Twin System 的四个组件，共享 Project Haystack / Xeto 语义底座。



| 项 | 取值 |
| --- | --- |
| Pod 名 | energyMatrix |
| Xeto 库 | em |
| Axon 函数前缀 | em |
| 全局 marker | energyMatrix |
| 依赖库 | sys、ph、ph.points、ph.equips |
| 数据存储 | Folio（本地） |
| 运行环境 | FIN Framework 5.x / Haxall，Fantom 运行时 |



表 1-1  产品形态与运行环境

## **1.3  参考标准与依据**



| 类别 | 标准或文件 | 在本模型中的作用 |
| --- | --- | --- |
| 语义标准 | Project Haystack 4.0 / 5.0（Xeto） | 对象、设备、点位的基础本体 |
| 分项计量 | 《国家机关办公建筑和大型公共建筑能耗监测系统分项能耗数据采集技术导则》 | EmSubItem 枚举 A1–D6 的划分依据 |
| 能耗指标 | GB/T 51161-2016 民用建筑能耗标准 | EUI 约束值与定额来源 |
| 节能量核证 | IPMVP Core Concepts / ASHRAE Guideline 14 | EmBaseline 与 EmSavingsProject 的方法学 |
| 碳核算 | GB/T 2589-2020 综合能耗计算通则 | 折标煤系数 |
| 碳因子 | 生态环境部电力二氧化碳排放因子公告 | Scope 2 排放因子来源 |
| 建筑碳排 | GB/T 51366-2019 建筑碳排放计算标准 | 热力等介质因子来源 |



表 1-2  参考标准与依据

## **1.4  术语与缩略语**



| 术语 | 说明 |
| --- | --- |
| Xeto | Project Haystack 5.0 引入的规格描述语言，用类型化的 spec 约束数据模型 |
| Folio | FIN Framework 的内置对象数据库，存储 rec 与历史 |
| 台账条目 | EmLedgerEntry，某表某账期的用量账目，关账后不可变 |
| 缺口量 | 总表读数减去各分表之和的差值，本模型强制显式建模，不得摊入任一分项 |
| 虚拟表 | 由公式导出的计量对象，与物理表在模型层同构 |
| 红冲 | 以负数条目冲销已入账错误条目的修正方式，原条目保留不删 |
| IPMVP | 国际节能效果测量和验证规程 |
| EUI | Energy Use Intensity，单位面积能耗强度 |
| Scope 1 / 2 / 3 | 温室气体核算体系中的直接排放、外购能源间接排放与其他间接排放 |



表 1-3  术语与缩略语

# **2  总体架构**

## **2.1  三层语义分层**

模型自下而上分为三层，每层只依赖下层，不允许反向依赖：



| L0  语义底座    ph · ph.points · ph.equips Haystack 官方本体，不做任何修改 L1  对象与设备  em::spaces · em::meters · em::supply · em::loads · em::points 域1 空间与组织 / 域2 计量 / 域3 供能 / 域4 用能 L2  业务对象    em::ledger · em::alloc · em::tariff · em::kpi em::baseline · em::carbon · em::diagnostic 域5 台账 / 域6 分摊 / 域7 计费 / 域8 指标 域9 核证 / 域10 碳 / 域11 闭环 |
| --- |



L1 与 L2 之间唯一的数据通道是 EmLedgerEntry。所有 L2 业务对象一律读台账，禁止直接读取点位历史。这一约束保证任何账目都可以追溯到具体的台账条目，而台账条目又可以追溯到具体的表计与数据来源等级。

## **2.2  Pod 与 Xeto 库结构**



| energyMatrix/            # FIN Pod lib/em/                # Xeto lib lib.xeto             # 库声明与依赖 tags.xeto            # 全局标签、枚举、Choice spaces.xeto          # 域1  空间与组织 meters.xeto          # 域2  计量（核心） supply.xeto          # 域3  供能 / 产能 / 储能 loads.xeto           # 域4  用能设备 points.xeto          # 点位规范 ledger.xeto          # 域5  能耗台账 alloc.xeto           # 域6  分摊规则引擎 tariff.xeto          # 域7  费率 / 合约 / 账单 kpi.xeto             # 域8  指标体系与定额 baseline.xeto        # 域9  基线与核证 carbon.xeto          # 域10 碳资产 diagnostic.xeto      # 域11 诊断与闭环 |
| --- |



## **2.3  命名规范**



| 对象类别 | 规则 | 示例 |
| --- | --- | --- |
| Xeto spec | Em 前缀 + 大驼峰 | EmElecMeter、EmLedgerEntry |
| 自定义标签 | em 前缀 + 小驼峰 | emMeterRole、emGapRatio |
| 枚举类型 | Em 前缀 + 大驼峰 | EmMeterRole、EmSubItem |
| 枚举值 | 全小写小驼峰 | gateway、byRatedRuntime |
| Axon 函数 | em 前缀 + 小驼峰 | emLedgerBuild、emAllocRun |
| 表计编码 | M（物理）/ V（虚拟）+ 分项 + 序号 | M-B1-CH1、V-B1-GAP |
| 台账编码 | L-年月-流水 | L-2607-0142 |



表 2-1  命名规范



| 强制约束 本库所有自定义标签一律带 em 前缀。禁止直接向 ph 命名空间添加标签，也禁止复用其他产品库（cm、hm）的私有标签，以保证同一 Folio 内多产品共存时不发生语义冲突。 |
| --- |



## **2.4  与兄弟产品的职责边界**



| 维度 | energyMatrix | CoolMatrix / heatMatrix |
| --- | --- | --- |
| 关心什么 | 用了多少、谁用的、花多少钱、排多少碳 | 怎么控、控得好不好 |
| 时间尺度 | 小时 / 日 / 月 / 年台账 | 秒 / 分钟控制周期 |
| 对设备 | 只通过 EmLoad 赋予能耗身份 | 拥有设备控制模型与安全联锁 |
| 数据流向 | 读取控制侧能效点用于指标计算 | 不读取 energyMatrix，避免账务层进入控制环 |
| 交集 | EmSavingsProject 的 Option B 措施级核证 | 提供措施执行记录与工况标记 |



表 2-2  产品职责边界

CoolSim 在 IPMVP Option D 场景中接入，作为校准仿真的基线来源。

# **3  Layer 1：对象与设备数据模型**

## **3.1  建模铁律**

- 一切能耗数值归属唯一 EmMeter。禁止裸点直接进入能耗账，虚拟表也是表。

- 表计层级用 ph::submeterOf 构成有向无环图，禁止跨介质挂接。电表的父表只能是电表。

- 物理表与虚拟表同构。差值法、分摊法、多表求和在模型层无差别，业务层不感知实现方式。

- 每个数值必带 emDataSource，取值为实测、推导、分摊、估算、人工录入之一。这是能耗账目可审计的根。

- 不重复定义冷机、水泵、空调机组。这些属于 ph.equips 与 CoolMatrix / heatMatrix 的职责，energyMatrix 只通过 EmLoad 为既有设备挂上分项归类、计量归属与额定值。

## **3.2  域一  空间与组织**

空间树来自 ph::Site / Floor / Space，本库只扩展计量与考核所必需的属性。组织树（业主、物业、租户、成本中心）作为与空间正交的第二棵树独立建模，二者通过 EmZone.emTenantRef 关联。



| Spec | 父类 | 关键属性 | 说明 |
| --- | --- | --- | --- |
| EmSite | ph::Site | area、emCoolArea、emOccupancy、emClimateZone、emBaseYear | 站点，EUI 与人均指标的分母来源 |
| EmFloor | ph::Floor | area、emUsageType | 楼层 |
| EmZone | ph::Space | area、emUsageType、emTenantRef | 能耗核算最小空间单元，可跨楼层 |
| EmOrg | Dict | parentRef | 组织单元 / 成本中心，构成组织树 |
| EmTenant | EmOrg | area、emContractNo、emLeaseStart、emLeaseEnd | 租户，账单付费方 |



表 3-1  空间与组织域对象

## **3.3  域二  计量**

计量域是整个模型的核心。EmMeter 继承 ph::Meter，扩展计量角色、数据来源、服务对象与倍率等属性。各介质子类按 Haystack 官方 Meter 分类派生，不另起炉灶。



| Spec | 介质 | 核心点位 |
| --- | --- | --- |
| EmElecMeter | 电 | 累积电量、有功功率、无功功率、功率因数、电压、电流、频率、尖峰平谷分时电量、最大需量 |
| EmWaterMeter | 水 | 累积水量、瞬时流量 |
| EmGasMeter | 燃气 | 累积体积、瞬时流量、标况折算量 |
| EmSteamMeter | 蒸汽 | 累积质量、热量、流量、温度、压力 |
| EmCoolMeter | 冷量 | 累积冷量、瞬时冷功率、累积水量、流量、进出水温、温差 |
| EmHeatMeter | 热量 | 同上，标记为 hot |



表 3-2  计量器具分类

### **3.3.1  计量角色**

emMeterRole 是六值枚举，而非 marker。汇总算法只识别角色，不识别层级深度，因此三层楼的项目与三十层的项目使用同一套汇总逻辑。



| 取值 | 中文 | 语义 |
| --- | --- | --- |
| gateway | 关口表 | 与供能方结算的产权分界表，唯一权威源 |
| main | 总表 | 建筑或系统级汇总表 |
| branch | 分项表 | 按用能分项划分的回路表 |
| sub | 子表 | 租户、楼层或末端计量表 |
| check | 考核表 | 仅用于校核，不参与汇总，防止重复计量 |
| virtual | 虚表 | 由加减、分摊或差值公式导出 |



表 3-3  emMeterRole 枚举

### **3.3.2  虚拟表**

虚拟表通过 emVirtual 标记与 emFormula 表达式定义，在模型层与物理表完全同构。典型用途是差值法求余量与按规则分摊：



| // 冷热站余量：总表减去已计量子表之和 V-B1-GAP  emFormula: "emMeterRead(@M-B1-01) - emSubMeterSum(@M-B1-01)" // 商户分摊：按租赁面积从总表分配 V-D2-ALC  emFormula: "emAllocByArea(@M-D2-01, tenantSet)" |
| --- |



### **3.3.3  缺口量**



| 设计取舍 总表减各分表之和的差值必须显式建模为一个带 emGap 标记的虚拟表，而不是让它在报表中被平摊或悄悄消失。缺口率是判断计量方案是否合格的第一指标，也是关账闸门的判据。 |
| --- |



## **3.4  域三  供能、产能与储能**

产能与储能设备既是能源节点，也必须挂表，走与用能侧一致的计量模型。净电量约定：正值为从电网购入或储能放电，负值为上网或储能充电。



| Spec | 说明 | 关键点位 |
| --- | --- | --- |
| EmUtilityInlet | 市政能源接入点，产权分界 | 关联 EmTariff |
| EmTransformer | 变压器 | 负载率、绕组温度、有功功率 |
| EmPvSystem | 光伏发电系统 | 发电量、上网电量、自发自用量、辐照度、系统效率 PR |
| EmBess | 电化学储能 | SOC、SOH、充电量、放电量、有功功率 |
| EmEvCharger | 充电桩 | 累积电量、有功功率 |



表 3-4  供能域对象

## **3.5  域四  用能设备**

EmLoad 是一个混入式的能耗身份，可挂在任何 ph::Equip 之上。有独立计量的设备通过 emMeterRef 关联表计；无表设备通过 emAllocWeight 参与分摊，默认权重为额定功率乘以运行时长。



| Spec | 对应分项 | 典型对象 |
| --- | --- | --- |
| EmLightingLoad | A1 / A2 / A3 | 照明回路、景观灯 |
| EmHvacLoad | B1 / B2 | 冷机、热泵、空调箱、风机盘管 |
| EmElevatorLoad | C1 | 电梯、扶梯 |
| EmPumpLoad | C2 | 生活泵、排污泵 |
| EmFanLoad | C3 | 送排风机 |
| EmItLoad | D1 | 机房 UPS、精密空调 |
| EmProcessLoad | D2 / D6 | 厨房设备、工艺负荷 |
| EmLoadGroup | 按成员 | 无独立计量的批量设备聚合 |



表 3-5  用能设备子类型

## **3.6  点位三层规范**

国内表计换表与累积量溢出是常态，因此累积读数与区间增量必须在模型层分离，不能在历史汇总时现场处理。



| 层 | 名称 | 标签 | 职责 |
| --- | --- | --- | --- |
| L1 | 累积读数 | total + sensor | 表底数，直采只读，禁止修改 |
| L2 | 区间增量 | emDelta | 由 L1 差分，含溢出补偿（emMaxReading）与换表补偿（emInstallDate） |
| L3 | 归一化指标 | emNormalized | 单位面积、单位人数或度日数修正后的指标，由业务层生成 |



表 3-6  点位三层规范

L1 与 L2 点位强制启用历史记录，插值方式为线性，时区继承站点设置，默认采样周期 15 分钟。

## **3.7  分项计量映射**

emSubItem 枚举严格对齐《大型公共建筑能耗监测系统分项能耗数据采集技术导则》，同时挂在 EmElecMeter 与 EmLoad 两处：有表的按表计算，无表的按 EmLoad 权重分摊。



| 代码 | 分项 | 子项 | 典型计量对象 |
| --- | --- | --- | --- |
| A1 | 照明插座 | 室内照明与插座 | 楼层照明回路、插座回路 |
| A2 | 照明插座 | 走廊与应急照明 | 公区照明配电箱 |
| A3 | 照明插座 | 室外景观照明 | 泛光照明配电箱 |
| B1 | 空调用电 | 冷热站 | 冷机、冷冻泵、冷却泵、冷却塔 |
| B2 | 空调用电 | 空调末端 | 空调箱、新风机组、风机盘管回路 |
| C1 | 动力用电 | 电梯扶梯 | 电梯机房配电 |
| C2 | 动力用电 | 水泵 | 生活给水泵、排污泵 |
| C3 | 动力用电 | 通风机 | 车库排风、消防补风 |
| D1 | 特殊用电 | 信息中心 | 数据机房、UPS、精密空调 |
| D2 | 特殊用电 | 厨房餐厅 | 餐饮商户总表 |
| D3 | 特殊用电 | 洗衣房 | 洗衣设备配电 |
| D4 | 特殊用电 | 游泳池 | 泳池循环加热 |
| D5 | 特殊用电 | 健身娱乐 | 健身房、影院 |
| D6 | 特殊用电 | 其他 | 充电桩、舞台、工艺设备 |



表 3-7  GB 分项计量映射

# **4  Layer 2：能源管理业务对象模型**

## **4.1  建模铁律**

- 业务对象只读 EmLedgerEntry，禁止直接读取点位历史。

- 台账关账后不可变，任何修正一律走红冲（emReversalOf），原条目保留不删。

- 业务参数（费率 EmTariff、排放因子 EmEmissionFactor）随时间版本化，且必填 emSourceDoc 依据文件号。

- 账单、碳账、指标均为台账的确定性投影，任一参数换版可无损重算。

- 节能量默认标记为规划目标（emVerifyStatus: planned），未经 IPMVP 基线核证不得以已核证口径对外发布。

## **4.2  域五  能耗台账**

L2 delta 点是读数，台账是账目。两者之间必须有一层不可变的事实表，否则数据修正无法回溯、账单无法审计。EmLedgerEntry 承担这个角色。



| 属性 | 类型 | 说明 |
| --- | --- | --- |
| meterRef | Ref | 来源表，物理或虚拟 |
| emMediumId | Str | 介质标识 |
| emSubItem | EmSubItem? | 分项归类，仅电介质有效 |
| span | Span | 账期区间，左闭右开 |
| emGranularity | Enum | hourly / daily / monthly / yearly |
| val | Number | 用量，单位随介质 |
| emDataSource | Enum | 实测 / 推导 / 分摊 / 估算 / 人工 |
| emQuality | Number? | 数据完好率，有效采样数除以应采样数 |
| emClosed | Marker? | 已关账，不可修改 |
| emReversalOf | Ref? | 红冲指向被冲销条目 |
| emRuleRef | Ref? | 若为分摊产生，指向分摊规则 |



表 4-1  EmLedgerEntry 属性

EmClosePeriod 记录每次关账操作，携带本期缺口率 emGapRatio 与条目数，支撑审计与重算。

## **4.3  域六  分摊规则引擎**

分摊是生成台账条目的一等公民行为，规则可版本化、可追溯、可重算。任何分摊结果条目必须携带 emRuleRef，且 emDataSource 恒为 allocated。



| 方法 | 说明 |
| --- | --- |
| byArea | 按面积分摊，取租赁面积或空调面积 |
| byHeadcount | 按人数分摊 |
| byFixedRatio | 按固定比例分摊，比例见 emShares |
| byRatedRuntime | 按额定功率乘以运行时长分摊 |
| byRemainder | 差值法，源表减去已计量子表之和 |
| bySubMeterPro | 按已计量子表用量比例分摊公摊部分 |
| custom | 自定义 Axon 表达式 |



表 4-2  EmAllocMethod 枚举

多条规则同时命中同一对象时，按 emPriority 升序执行。规则携带 emEffective 生效期，换版即新增记录，旧版只读。

## **4.4  域七  费率、合约与账单**

费率是随时间版本化的业务参数，绝不写死在设备属性里。账单只是台账与费率的确定性投影，可无损重算。



| 计价模式 | 说明 | 关键参数 |
| --- | --- | --- |
| flat | 单一制 | 单价 |
| tou | 分时电价 | 尖、峰、平、谷四时段单价与适用月份、小时 |
| tiered | 阶梯计价 | 阶梯上下限与对应单价 |
| twoPart | 两部制 | 电度电费加基本电费，基本电费按容量制或需量制 |
| contract | 合约价 | 对租户或能源托管的约定价 |



表 4-3  EmPricingModel 枚举

EmDemandCharge 描述两部制基本电费，区分按变压器容量计费与按最大需量计费，并支持申报需量与超申报加倍系数。

EmBill 的每一个账单项 EmBillItem 通过 ledgerRefs 指向来源台账条目，逐笔可追溯。账单状态覆盖草稿、已开具、争议中、已结清与作废五态。

## **4.5  域八  指标体系与定额**

指标定义与时序实例分离。EmKpi 是可版本化、可跨项目复用的定义，EmKpiPoint 是挂在被评价对象下的归一化时序点，即 Layer 1 点位规范中的 L3。



| 对象 | 职责 |
| --- | --- |
| EmKpi | 指标定义：稳定编码、Axon 公式、单位、粒度、支持维度、方向性、对标依据 |
| EmKpiPoint | 指标时序实例，可写历史，参与趋势与告警 |
| EmQuota | 定额或限额：受限对象、考核期、限值、来源、预警比例、超限动作 |



表 4-4  指标域对象

定额来源分为国标地标约束值、历史同期、同类对标、合同约定与人工下达五类，不同来源在报表中需分别标注，不可混用。

## **4.6  域九  基线与节能量核证**



| 强制约束 任何节能量在通过基线核证前，一律标记为 planned（规划目标）。禁止以已核证口径出现在报表、账单或对外材料中。这一约束与 Layer 1 的 emDataSource 追溯链共同构成本系统对外数字的可信性基础。 |
| --- |



EmBaseline 描述核证边界内的基线模型，支持 IPMVP 四种选项：



| 选项 | 方法 | 适用场景 |
| --- | --- | --- |
| Option A | 部分参数测量 | 关键参数实测，其余估算，适用于照明改造等 |
| Option B | 全参数测量 | 措施级独立计量，适用于单一设备改造 |
| Option C | 整体计量 | 关口表或总表回归，适用于全楼综合措施 |
| Option D | 校准仿真 | 对接 CoolSim，适用于无完整基准期数据的场景 |



表 4-5  IPMVP 选项

模型统计验收依据 ASHRAE Guideline 14，月度口径要求决定系数不低于 0.75，CV(RMSE) 不超过 15%，NMBE 在正负 5% 以内；小时口径 CV(RMSE) 放宽至 30%。验收结果记录在 emR2、emCvRmse、emNmbe 与 emValid 字段。

EmSavingsProject 将节能量拆为三个独立字段，任何时候不得相互替代：



| 字段 | 含义 | 可对外引用口径 |
| --- | --- | --- |
| emSavingsPlanned | 规划节能量，措施设计阶段的目标值 | 必须标注为规划目标 |
| emSavingsMeasured | 报告期实测差值，未做基线调整 | 仅内部使用 |
| emSavingsVerified | 经常规与非常规调整后的核证节能量 | 可作为节能量正式引用 |



表 4-6  节能量三态字段

核证状态 emVerifyStatus 覆盖 planned、monitoring、computed、verified、rejected 五态。EmAdjustment 区分常规调整（气象、使用率）与非常规调整（面积、工艺变更），每笔调整记录原因与调整量。

## **4.7  域十  碳资产**

排放因子是随年份与区域变化的业务参数，属于 Layer 2，不是设备属性。碳账目由能耗台账与因子确定性推导，任一因子换版可全量重算。



| 设计取舍 电网排放因子逐年更新。若碳账实时引用最新因子，历史数据会随因子换版整体漂移，与已披露的报告对不上。因此 EmCarbonAccount 在账期结算时将本期使用的因子版本以 emFactorRefs 快照锁定。 |
| --- |





| 对象 | 职责 |
| --- | --- |
| EmEmissionFactor | 排放因子：介质、Scope、区域、年份、因子值、折标煤系数、依据文件号（必填） |
| EmCarbonAccount | 碳账目：核算边界、账期、Scope 1/2/3 排放量、抵消量、净排放、因子版本快照 |
| EmCarbonTarget | 碳目标：基准年、目标年、总量型或强度型目标值 |
| EmGreenCert | 绿电、绿证与 CCER，仅在注销核销后方可用于抵消 |



表 4-7  碳资产域对象

## **4.8  域十一  诊断与闭环**

诊断规则输出异常事件，事件经确认后升级为工单，所有节能建议最终落到 EmSavingsProject，形成诊断到措施到核证的闭环。



| 架构原则 沿用 AI 建议、确定性执行的一贯原则：诊断模型只产生 EmAnomaly，不直接写入控制点。需要动作时走工单，或交由 CoolMatrix / heatMatrix 的确定性策略层执行。实时安全回路永不依赖账务层。 |
| --- |





| 类别 | 判据示例 |
| --- | --- |
| dataQuality | 采集断点、数值冻结、负增量、超量程 |
| balance | 缺口率超限、子表合计大于总表 |
| overConsume | 同比或环比突变、夜间基线偏高 |
| efficiency | EUI 或 PUE 劣化 |
| scheduleWaste | 非营业时段设备运行 |
| demandRisk | 逼近申报需量 |
| quotaRisk | 定额消耗进度超前 |
| carbonRisk | 碳目标进度偏离 |



表 4-8  EmDiagCategory 枚举

EmAnomaly 的 emImpactVal 字段用于估算异常造成的影响用量，其数据来源恒为 estimated，仅用于排序与展示，永不进入台账参与结算。

## **4.9  端到端数据流**



| 物理表读数 \| v L1 raw (total)  --差分/溢出补偿/换表补偿-->  L2 delta \| EmAllocRule 分摊 --------+ v EmLedgerEntry  --> 关账 EmClosePeriod \| +-----------------------+-----------------+------------------+ v                       v                 v                  v EmBill                EmKpiPoint       EmCarbonAccount     EmDiagnostic (x EmTariff)      (/ 面积/人数/度日)     (x EmEmissionFactor)        \| v EmBaseline  -->  EmSavingsProject  <--  EmAnomaly |
| --- |



图 4-1  端到端数据流

# **5  数据完整性与审计约束**

## **5.1  数据来源分级**



| 等级 | 含义 | 可用于结算 | 可用于对外披露 |
| --- | --- | --- | --- |
| measured | 实测，物理表计直采 | 是 | 是 |
| derived | 推导，由其他实测量运算得出 | 是 | 是 |
| allocated | 分摊，按规则从上级量分配 | 是（需规则备案） | 是（需注明分摊） |
| estimated | 估算，模型或历史均值填补 | 否 | 否 |
| manual | 人工录入，抄表或账单 | 是（需双人复核） | 是 |



表 5-1  数据来源分级与使用限制

## **5.2  关账事务与缺口率闸门**

关账是一次原子事务，执行顺序如下：

- 冻结账期内所有 L2 delta 点，禁止后续补采覆盖。

- 执行全部生效的分摊规则，生成 allocated 条目。

- 计算缺口量与缺口率，写入 EmClosePeriod.emGapRatio。

- 缺口率超过阈值（默认 5%）时阻断关账，返回未平衡的表计清单。

- 校核通过后为本期全部条目打 emClosed 标记，并写入关账批次记录。



| 设计取舍 缺口率阻断是硬门槛。其目的是把计量方案的质量问题挡在账目之外，而不是让它在报表里被平摊掉。宁可延迟关账，也不允许一份内部不平衡的账目进入结算与披露链路。 |
| --- |



## **5.3  红冲机制**

已关账条目不可修改。发现错误时新增一条数值相反的红冲条目，通过 emReversalOf 指向原条目，再录入正确条目。三条记录共同构成完整的修正链，任何时点的账目状态均可复现。



| L-2607-0151   M-C1-01   +96,400 kWh   estimated   完好率 64.1%   -> 已红冲 L-2607-0152   M-C1-01   -96,400 kWh   estimated   红冲条目 L-2607-0153   M-C1-01   +92,000 kWh   measured    完好率 97.2%   补采后重录 |
| --- |



## **5.4  参数版本化与依据文件**

费率与排放因子两类业务参数必须填写 emSourceDoc 依据文件号，例如政府批复文号、合同编号或国家标准号。缺少依据文件的参数不允许生效。参数换版一律新增记录并设置生效期，旧版本转为只读，不得原地修改。

# **6  待决事项**



| 编号 | 事项 | 选项 | 影响 |
| --- | --- | --- | --- |
| OI-01 | 台账落库粒度 | hourly 落库 / daily 落库，hourly 仅留历史 | 表数上千时 Folio 存储与查询压力 |
| OI-02 | 账单归属 | energyMatrix 出账 / 只算不出账，导出给既有收费系统 | 域七实现范围与对接接口 |
| OI-03 | 指标公式形式 | Axon 表达式（现场可改） / 固化算子（需发版） | 灵活性与安全性的取舍 |
| OI-04 | EmZone 语义 | 允许跨楼层 / 严格贴合 Haystack 5 space 语义 | 空间树与计量分区的对应关系 |
| OI-05 | 租户主数据 | 进 Folio / 退化为外键并定时同步 ERP | 组织树的权威源归属 |



表 6-1  待决事项清单

# **7  可视化与界面需求**



## **7.1  能流图（Sankey）**



能流图以桑基图（Sankey）呈现建筑能源从进线到分项用能的完整流向，是能耗分析的可视化补充。本需求随 V0.1.1 新增，落地为前端第 14 屏（hash 路由 /flow，FIN 顶栏菜单「能流图」，归「监测运行」组）。




图形态：Sankey 桑基图，流向带宽度正比于能耗量，节点为表计/分项，按介质分色。




数据口径：Layer 2 能耗台账（遵守铁律 6，禁直读 L1 点位历史）；流向宽度取选定账期内的台账合计，可回看任意账期。




筛选维度：站点（必选）、账期（span）、介质（电/水/气/热/汽/油，可切换单介质视图）。




结构来源：计量树 DAG（既有 Axon 端点 emMeterTree）——源表到子表/分项逐级汇入；缺口表产出汇入「不明用能」汇点；虚拟表作为派生节点；考核表不参与汇总（沿用 3.3 的汇总语义）。




数值来源：既有 Axon 端点 emLedgerQuery.aggregate（dim 取 meter），本需求不新增后端接口、不新增 Axon 函数。




交互约定：节点 tooltip 显示表计名、能耗值与单位；台账为空时给出「先构建台账」引导，不得白屏。




权限与边界：本屏只读，不含任何写操作；节点点击钻取、实时（L1）口径为后续版本需求，不在 V0.1.1 范围。





## **7.2  核心 KPI 考核（绿色医院评审支撑）**



面向绿色医院评审与机构绩效考核，自动计算单位能耗强度类核心指标，给出同比、环比与达标判定，为多院区并列排名提供统一口径。本需求随 V0.1.2 新增，落地为前端新屏（hash 路由 /kpi，FIN 顶栏菜单「KPI 考核」，归「分析优化」组，位于「能耗分析」与「定额与对标」之间），是第 15 屏。




指标清单（初版，全部由既有 EmKpi 指标定义驱动，评审口径调整后可在「指标定义表」配置扩展，不改代码）：




- 单位建筑面积综合能耗 EUI（kWh/m²·月）——既有定义 EUI_TOTAL；单位面积电耗 EUI_ELEC（kWh/m²·月）
- 单位建筡面积水耗 WUI（m³/m²·月）——既有定义 WUI
- 人均能耗（kWh/人·月）——既有定义 EUI_PC；人均水耗（m³/人·月）——既有定义 WATER_PER_BED（现有编码名与中文名不符，V0.1.2 一并校正）
- 单位床位能耗（kWh/床·月）——**新增**；绿色医院评审核心指标，依赖新模型参数 emBeds（见下）
- 单位面积碳排（kgCO₂/m²·年）——既有定义 CBEI，按年粒度




数据口径：Layer 2 能耗台账（铁律 6，禁直读 L1 点位历史）。指标值一律由后端 EmKpiService 求值（emFormula 为 Axon 表达式，分母缺失返回 null 不得当 0），前端只做展示、不自算口径。粒度以月为主，碳排强度按年。




模型变更（本需求唯一模型缺口）：EmSite 增加 `emBeds:N`（在册床位数，单位床位能耗的分母），Xeto 定义与 demo 数据同步补齐（5 个站点）；既有参数 area（建筑面积）、emOccupancy（在册人数）、emCoolArea（空调面积）沿用，不重定义。




筛选维度：账期（月，可回看任意已出账账期，支持多月趋势）；对象范围（多院区并列对比与排名；单站点下可下钻到 emDimension 允许的楼层 / 租户对象）。




交互约定：KPI 卡片（当前值、单位、同比、环比、达标状态徽标）；院区排名表（同一指标跨对象排名，分母缺失显示「—」并注明缺哪个参数）；多月趋势图（叠加定额 / 国标基准线，基准线必须标注 emLimitSource 来源）；台账为空或指标无法求值时给空态引导，不得白屏、不得以 0 充数。




权限与边界：本屏只读，不新增后端接口与 Axon 函数（复用既有 emKpiDefs / emKpiCompute / emKpiComputeAll / emQuotas / emQuotaProgressAll）；KPI 定义编辑与定额录入维持既有功能入口；EmKpiPoint 归一化点位固化（L3 写历史）不在 V0.1.2 范围，列后续版本。



# **附录 A  Xeto 库文件清单**



| 文件 | 层 | 内容 |
| --- | --- | --- |
| lib.xeto | — | 库声明、版本与依赖 |
| tags.xeto | — | 全局 marker、枚举、Choice 与关系型标签 |
| spaces.xeto | L1 | EmSite、EmFloor、EmZone、EmOrg、EmTenant |
| meters.xeto | L1 | EmMeter 及六类介质子类 |
| supply.xeto | L1 | EmUtilityInlet、EmTransformer、EmPvSystem、EmBess、EmEvCharger |
| loads.xeto | L1 | EmLoad、EmLoadGroup 及七类负荷子类型 |
| points.xeto | L1 | L1 累积读数与 L2 增量点位规范 |
| ledger.xeto | L2 | EmLedgerEntry、EmClosePeriod |
| alloc.xeto | L2 | EmAllocRule、EmAllocShare |
| tariff.xeto | L2 | EmTariff、EmTariffRate、EmDemandCharge、EmBill、EmBillItem |
| kpi.xeto | L2 | EmKpi、EmKpiPoint、EmQuota |
| baseline.xeto | L2 | EmBaseline、EmSavingsProject、EmAdjustment |
| carbon.xeto | L2 | EmEmissionFactor、EmCarbonAccount、EmCarbonTarget、EmGreenCert |
| diagnostic.xeto | L2 | EmDiagnostic、EmAnomaly、EmWorkOrder |



# **附录 B  对象速查表**



| 域 | 核心对象 | 一句话职责 |
| --- | --- | --- |
| 一 空间与组织 | EmSite / EmZone / EmTenant | 空间树与组织树正交并存 |
| 二 计量 | EmMeter 及子类 | 唯一入账主体，构成同介质 DAG |
| 三 供能 | EmUtilityInlet / EmPvSystem / EmBess | 能源节点同样挂表 |
| 四 用能 | EmLoad | 为既有设备赋予能耗身份 |
| 五 台账 | EmLedgerEntry / EmClosePeriod | 唯一事实源，关账即冻结 |
| 六 分摊 | EmAllocRule | 七种方法，规则版本化，结果回指规则 |
| 七 计费 | EmTariff / EmBill | 账单项逐笔挂台账 |
| 八 指标 | EmKpi / EmQuota | 定义与时序实例分离 |
| 九 核证 | EmBaseline / EmSavingsProject | IPMVP 四选项，节能量三态分离 |
| 十 碳 | EmEmissionFactor / EmCarbonAccount | 因子版本锁定在账期内 |
| 十一 闭环 | EmDiagnostic / EmAnomaly / EmWorkOrder | 诊断到工单到措施到核证 |



# **附录 C  枚举值全集**



| 枚举 | 取值 |
| --- | --- |
| EmMeterRole | gateway、main、branch、sub、check、virtual |
| EmSubItem | a1、a2、a3、b1、b2、c1、c2、c3、d1、d2、d3、d4、d5、d6 |
| EmUsageType | office、retail、hotel、hospital、datacenter、industrial、residence、common、parking |
| EmDataSource | measured、derived、allocated、estimated、manual |
| EmGranularity | hourly、daily、monthly、yearly |
| EmAllocMethod | byArea、byHeadcount、byFixedRatio、byRatedRuntime、byRemainder、bySubMeterPro、custom |
| EmPricingModel | flat、tou、tiered、twoPart、contract |
| EmBillStatus | draft、issued、disputed、settled、voided |
| EmQuotaSource | standard、historical、benchmark、contract、manual |
| EmIpmvpOption | optionA、optionB、optionC、optionD |
| EmModelType | linearRegression、multiVarRegression、changePoint、gbdt、simulation |
| EmVerifyStatus | planned、monitoring、computed、verified、rejected |
| EmScope | scope1、scope2、scope3 |
| EmDiagCategory | dataQuality、balance、overConsume、efficiency、scheduleWaste、demandRisk、quotaRisk、carbonRisk |
| EmSeverity | info、warn、critical |
| EmAnomalyStatus | open、acked、dispatched、resolved、falseAlarm |


