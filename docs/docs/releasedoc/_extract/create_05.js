import fs from "node:fs";
import {
  AlignmentType, Document, Footer, Header, HeadingLevel, ImportedXmlComponent,
  Packer, PageNumber, Paragraph, ShadingType, Table, TableCell, TableRow,
  TextRun, WidthType, convertInchesToTwip, PageBreak,
} from "docx";

const outputPath = process.argv[2];
if (!outputPath) throw new Error("Usage: node create.js <out.docx>");
const T = String.raw;

const font = { ascii: "Times New Roman", hAnsi: "Times New Roman", cs: "Times New Roman", eastAsia: "SimSun" };
const fontH = { ascii: "Arial", hAnsi: "Arial", cs: "Arial", eastAsia: "Microsoft YaHei" };
const INK = "1E2832", TEAL = "0B5F77", GRAY = "5C6B78";

const run = (text, o = {}) => new TextRun({ text, font, size: 21, color: INK, ...o });
const para = (children, o = {}) => new Paragraph({
  spacing: { after: 120, line: 320 }, ...o,
  children: Array.isArray(children) ? children : [children],
});
const p = (t) => para(run(t), { indent: { firstLine: convertInchesToTwip(0.35) } });
const pb = (t) => para([run(t, { bold: true })], { indent: { firstLine: convertInchesToTwip(0.35) } });
const h1 = (t) => para(new TextRun({ text: t, font: fontH, bold: true, size: 32, color: TEAL }),
  { heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 180 } });
const h2 = (t) => para(new TextRun({ text: t, font: fontH, bold: true, size: 26, color: INK }),
  { heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 140 } });
const h3 = (t) => para(new TextRun({ text: t, font: fontH, bold: true, size: 23, color: INK }),
  { heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 } });

const W = [1500, 7500]; // 参数表两列
const cell = (t, o = {}) => new TableCell({
  children: [para(run(t, { size: 19 }), { spacing: { after: 0, line: 260 } })],
  margins: { top: 80, bottom: 80, left: 110, right: 110 },
  ...o,
});
function paramTable(rows) {
  return new Table({
    width: { size: 9000, type: WidthType.DXA },
    columnWidths: W,
    rows: rows.map(([k, v], i) => new TableRow({ children: [
      cell(k, { width: { size: W[0], type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill: "EEF3F6" } }),
      cell(v, { width: { size: W[1], type: WidthType.DXA } }),
    ] })),
  });
}

const xmlEscape = (v) => String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const toc = (entries) => {
  const cached = entries.map(({ title, level, page }) => {
    const indent = Math.max(0, level - 1) * 360;
    return `<w:p><w:pPr><w:pStyle w:val="TOC${level}"/><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9000"/></w:tabs><w:ind w:left="${indent}"/></w:pPr><w:r><w:t>${xmlEscape(title)}</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>${page}</w:t></w:r></w:p>`;
  }).join("");
  return ImportedXmlComponent.fromXmlString(`<w:sdt xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:sdtPr><w:alias w:val="目录"/></w:sdtPr><w:sdtContent><w:p><w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/><w:instrText xml:space="preserve"> TOC \\o &quot;1-2&quot; \\h \\z \\u </w:instrText><w:fldChar w:fldCharType="separate"/></w:r></w:p>${cached}<w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:sdtContent></w:sdt>`).root[0];
};

const tocEntries = [
  { title: "一、项目概述", level: 1, page: 3 },
  { title: "二、系统设计要求与设计依据", level: 1, page: 4 },
  { title: "三、子系统设计", level: 1, page: 5 },
  { title: "四、系统架构设计", level: 1, page: 9 },
  { title: "五、应用场景", level: 1, page: 10 },
  { title: "六、技术参数", level: 1, page: 12 },
  { title: "七、数据治理十条铁律", level: 1, page: 15 },
];

const children = [];

// ── 封面 ──
children.push(para(run("energyMatrix 建筑能源管理系统", { font: fontH, bold: true, size: 48, color: INK }), { alignment: AlignmentType.CENTER, spacing: { before: 2600, after: 200 } }));
children.push(para(run("解决方案技术说明", { font: fontH, bold: true, size: 40, color: TEAL }), { alignment: AlignmentType.CENTER, spacing: { after: 300 } }));
children.push(para(run("V1.0", { font: fontH, size: 28, color: GRAY }), { alignment: AlignmentType.CENTER, spacing: { after: 1600 } }));
children.push(para(run("西门子（中国）有限公司", { font: fontH, size: 24, color: INK }), { alignment: AlignmentType.CENTER, spacing: { after: 160 } }));
children.push(para(run("2026 年 9 月", { font: fontH, size: 22, color: GRAY }), { alignment: AlignmentType.CENTER }));
children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 目录 ──
children.push(para(run("目  录", { font: fontH, bold: true, size: 30, color: INK }), { alignment: AlignmentType.CENTER, spacing: { after: 240 } }));
children.push(toc(tocEntries));
children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 一、项目概述 ──
h1s: {
children.push(h1("一、项目概述"));
children.push(h2("1.1 项目名称"));
children.push(p("energyMatrix 建筑能源管理系统建设项目（以下简称“本系统”）。"));
children.push(h2("1.2 实施范围"));
children.push(p("覆盖项目红线内的全部能耗计量对象：电力（关口、分项、楼层与租户回路）、自来水与中水、燃气、冷量与热量，以及光伏、储能、充电桩等供能产储设施；向上接入集团多站点管理与对上报表，向下接入既有楼宇自控与电力监控系统。"));
children.push(h2("1.3 应用场景"));
children.push(p("办公区、会议室、医院门诊与住院、商业综合体租户区、体育场馆大空间、设备机房、地下空间等。"));
children.push(h2("1.4 项目建设要求"));
children.push(p("完成项目区域的能耗物联网建设，通过“语义模型 + 能耗台账 + 边缘引擎”提升数字化运营水平，为管理者提供安全、高效、节能、低碳的用能环境。"));
children.push(p("通过多功能表计、采集器与边缘引擎的连接，实现能耗数据的自动采集、台账化管理、远程监控与智能诊断。系统在本地完成数据的收集、存储和分析，为管理决策与双碳考核提供可审计的数据支撑。"));
children.push(p("系统包括分项计量系统、能耗台账系统、分摊系统、费率与账单系统、指标与定额系统、基线与核证系统、碳资产管理系统、诊断与工单系统、边缘控制系统以及 AI Agent 能力，实现能耗数据在全业务流程中的闭环应用。"));
}

// ── 二、设计要求 ──
children.push(h1("二、系统设计要求与设计依据"));
children.push(h2("2.1 设计依据"));
for (const s of [
  "《建筑节能与可再生能源利用通用规范》GB 55015-2021",
  "《民用建筑能耗标准》GB/T 51161-2016",
  "《用能单位能源计量器具配备和管理通则》GB 17167-2006",
  "《国家机关办公建筑和大型公共建筑能耗监测系统分项能耗数据采集技术导则》",
  "《民用建筑电气设计规范》GB 51348-2019",
  "《智能建筑设计标准》GB 50314-2015",
  "《建筑节能设计标准》GB 50189",
  "《供配电系统设计规范》GB 50052-2009",
  "《建筑电气工程施工质量验收规范》GB 50303-2015",
  "《综合布线系统工程设计规范》GB 50311-2016",
  "ASHRAE Guideline 14 Measurement of Energy, Demand, and Water Savings",
  "IPMVP 国际节能效果测量与验证规程",
  "相关专业提供的工程设计资料",
]) children.push(p(s));

// ── 三、子系统 ──
children.push(h1("三、子系统设计"));

children.push(h2("3.1 分项计量系统"));
children.push(p("3.1.1 本系统依据《分项能耗数据采集技术导则》将用电划分为 A 照明插座、B 空调用电、C 动力用电、D 特殊用电四类共 14 个分项；水、气、冷、热按介质分别建账。"));
children.push(p("3.1.2 计量树采用同介质有向无环图（DAG）：关口表 → 分项表 → 楼层 / 租户子表；系统自动进行环检测（就地剪断）、跨介质挂接拒绝与悬挂父引用校验。"));
children.push(p("3.1.3 考核表用于校核而不参与汇总，防止重复计量；缺口表（总表与各分表之和的差值，即不明用能）单独归集呈现，不参与汇总，缺口率超阈值（默认 5%）自动阻断月度关账。"));
children.push(p("3.1.4 表底翻转、换表与互感器变比由系统自动补偿：L1 累积读数直采禁改，L2 区间增量由差分生成，含溢出与换表补偿。"));
children.push(p("3.1.5 虚拟表与物理表同构：由 Axon 公式求值（8 层深度守卫防循环引用），上层业务无需区分表计实现方式。"));

children.push(h2("3.2 能耗台账系统"));
children.push(p("3.2.1 台账（EmLedgerEntry）是对象层与业务层之间唯一的数据通道；账单、碳账、指标全部从台账投影，可无损重算。"));
children.push(p("3.2.2 台账默认按日（daily）落库，支持 hourly / weekly / monthly 四种粒度；关账后台账不可变，修正一律走红冲（EmReversal），保留完整修正链。"));
children.push(p("3.2.3 关账前执行预检：缺口率闸门、未平衡表计清单逐项列出；预检不通过不得关账。"));
children.push(p("3.2.4 每条台账数值必带数据来源标记（实测 / 推导 / 分摊 / 估算 / 人工录入），可结算口径一屏呈现。"));

children.push(h2("3.3 分摊系统"));
children.push(p("3.3.1 分摊规则支持版本化加载、排序与校验；无独立计量的回路按规则从上级量分配，分摊结果带 allocated 来源标记。"));
children.push(p("3.3.2 分摊方法覆盖面积法、定额法、计量比例法、额定功率时长法等常用口径，规则参数必填来源文件。"));

children.push(h2("3.4 费率与账单系统"));
children.push(p("3.4.1 费率方案版本化管理，支持单一制、两部制（含需量 / 容量）与分时电价（尖峰平谷）解析。"));
children.push(p("3.4.2 租户账单每个账单项逐笔指向来源台账条目（ledgerRefs），可回溯到表计与点位；最大需量逼近申报值时提前预警，避免超需量加价。"));

children.push(h2("3.5 指标与定额系统"));
children.push(p("3.5.1 指标定义与时序实例分离：EmKpi 可版本化并复用到任意对象，公式为 Axon 表达式；支持批量指标求值与排名。"));
children.push(p("3.5.2 定额（EmQuota）记录限额与来源（政府下达 / 集团分解 / 历史基准），按考核期给出执行进度与超前 / 滞后动作建议。"));
children.push(p("3.5.3 EUI 对标挂接 GB 55015-2021 约束值与 GB/T 51161-2016 引导值，按气候区与业态自动选取。"));

children.push(h2("3.6 基线与核证系统"));
children.push(p("3.6.1 节能项目基线模型按 ASHRAE Guideline 14 月度判据进行统计验收；支持 IPMVP Option C 整体计量回归。"));
children.push(p("3.6.2 未通过基线核证的节能量一律为 planned，禁止以 verified 对外；通过验收的项目方可转 verified。"));

children.push(h2("3.7 碳资产管理系统"));
children.push(p("3.7.1 排放因子版本化管理，每条因子必填来源文件；因子换版即锁定旧版快照，历史碳账不漂移、可全量重算。"));
children.push(p("3.7.2 Scope 1 / 2 / 3 分别归集；因子单位分母与台账用量单位不一致时直接报错，拒绝口径错配。"));
children.push(p("3.7.3 绿电 / 绿证抵消仅计入已注销核销（emRetired）的证书；碳目标（总量或强度口径）进度自动跟踪；折标煤合计一屏呈现，未配置系数的介质明示“未计入”。"));

children.push(h2("3.8 诊断与工单系统"));
children.push(p("3.8.1 诊断规则引擎持续评估台账数据质量与平衡校核；同规则、同对象、同账期幂等创建，不重复告警；未实现判据明示跳过，不谎报。"));
children.push(p("3.8.2 诊断只产生异常，不直写控制点；异常经值班确认后方可升级为工单。"));
children.push(p("3.8.3 工单状态前向单向流转（new → assigned → inProgress → done → closed），每次流转留痕；一张工单可合并多条同源异常；形成长期措施的工单挂接节能项目走核证闭环。"));

children.push(h2("3.9 边缘控制器"));
children.push(p("3.9.1 边缘控制器支持 BACnet UDP/IP、Modbus RTU、Modbus TCP/IP、KNX IP、M-Bus、MQTT、Haystack over RESTful API、OPC UA、oBix、Sedona 与 SQL 等协议。"));
children.push(p("3.9.2 中小型项目可将系统部署在嵌入式边缘控制器（F200 / NEXIO）中，无需额外服务器；断网时站点自治运行，恢复后自动续传。"));
children.push(p("3.9.3 完全基于网页浏览器（Chrome / Edge）进行工程调试：组态画图、时间表、历史存储、诊断规则配置等。"));

children.push(h2("3.10 AI Agent"));
children.push(p("基于 FIN Framework 语义标签技术和大模型技术，提供 AI 智能体读写楼宇设备参数或 Haystack 数据库数据的基础设施与能力。采用标准 OpenAI API 接口，支持图像和自然语言访问，支持本地知识库，降低智能体间交流的复杂度；支持本地或云端大模型，数据不出项目内网。"));

// ── 四、架构 ──
children.push(h1("四、系统架构设计"));
children.push(h2("4.1 设备层"));
children.push(p("设备层主要分为计量设备、采集设备与供能产储设施："));
children.push(p("（1）计量设备：关口多功能电表、分项与子项导轨式电表、智能水表、智能燃气表、超声波冷热量表、计量型智能插座。"));
children.push(p("（2）采集设备：Modbus 网关 / 采集器、M-Bus 采集器、4G DTU，将总线数据经有线网络回传边缘控制器。"));
children.push(p("（3）供能产储设施：市政关口、变配电、光伏、储能、充电桩，按与用能侧一致的计量模型挂表建账。"));
children.push(h2("4.2 网络层"));
children.push(p("表计与采集器之间通过 RS-485（Modbus RTU）或 M-Bus 总线通讯，采集器经有线以太网接入设备网，与边缘控制器通讯；无内网区域经 4G DTU 回传。"));
children.push(h2("4.3 平台层"));
children.push(p("平台采用 B/S 架构。energyMatrix 以 FIN Pod 形式部署于 FIN Framework 5（Fantom 后端 + React 前端），通过局域网 API 接口实现本地端数据互通以及 AI Agent 功能的应用；集团场景经 FIN Network 实现多站点集中管理。"));
children.push(h2("4.4 语义模型"));
children.push(p("系统采用两层语义模型：Layer 1 对象与设备（空间与组织 / 计量 / 供能 / 用能四个域），Layer 2 业务对象（台账 / 分摊 / 计费 / 指标 / 核证 / 碳 / 诊断七个域），两层之间唯一的数据通道是能耗台账。语义定义以 Xeto 库 em 为规格源真相（随 pod 打包），运行侧由约 150 个标签与 16 个枚举的定义库在 FIN 5.3 生效；14 个 ModelEntity 模板是实例化设备与表计的唯一入口。"));

// ── 五、应用场景 ──
children.push(h1("五、应用场景"));
children.push(h2("5.1 办公场景"));
children.push(p("上班时间：以楼层 / 分区为单位跟踪用能强度，非营业时段强度异常自动命中 scheduleWaste 类规则并生成异常；下班后对非必要回路执行定时关闭策略，次日台账自动呈现节支效果。"));
children.push(p("定额考核：按科室 / 部门分解定额，执行进度按月呈现，超支对象自动进入诊断清单。"));
children.push(h2("5.2 医院场景"));
children.push(p("全院分项计量覆盖门诊、住院、手术部与机房；24 小时负荷曲线保障用能安全，需量逼近申报值时提前预警；重点用能设备纳入诊断闭环，异常派单到班组。"));
children.push(h2("5.3 商业综合体场景"));
children.push(p("租户账单与公区分摊：每个账单项逐笔回溯到台账条目与表计，争议有据可查；租户 EUI 同业态排名，为招商与运营提供数据支撑。"));
children.push(h2("5.4 园区 / 场馆场景"));
children.push(p("分时电价负荷曲线指导负荷转移与储能策略验证；赛事 / 闭馆模式切换的用能差异量化呈现；双碳目标进度、绿证核销与对上报表模板一键生成。"));
children.push(h2("5.5 集团多站点场景"));
children.push(p("多项目经 FIN Network 汇总至多项目总览，EUI 归一化至标准气象年（CDD/HDD 修正）后跨项目排名，集团汇总指标一键取数。"));

// ── 六、技术参数 ──
children.push(h1("六、技术参数"));
children.push(h2("6.1 F200 边缘引擎"));
children.push(paramTable([
  ["产品简介", "边缘引擎（CFG3.F200），内嵌 FIN Framework；支持 3 网口与 4G 无线上网，内置 8GB eMMC；浏览器完成全部工程调试"],
  ["协议支持", "BACnet IP、Modbus TCP/IP/RTU、KNX IP、OPC UA、MQTT、Haystack RESTful API 等"],
  ["点位规模", "单台最大 3,000 点"],
  ["产品尺寸", "144 × 117 × 74.5 mm"],
  ["电源输入", "24V AC/DC"],
  ["额定功率", "8W"],
  ["RAM / 存储", "2GB / 8GB eMMC"],
  ["网口", "RJ45 × 3（100 mb/s）"],
  ["工作环境", "-5℃ ~ 50℃，5~95% RH（非冷凝）"],
]));
children.push(h2("6.2 NEXIO 边缘控制器"));
children.push(paramTable([
  ["产品简介", "边缘控制器，内嵌 FIN Framework；双 RS-485 与 M-Bus 直连，支持 Daisy-chain 网络与故障旁路"],
  ["处理器", "Quad-core Cortex-A72 (ARM v8) 64-bit 1.5GHz"],
  ["RAM / 存储", "4GB LPDDR4 / 16GB eMMC"],
  ["点位规模", "单台最大 5,000 点"],
  ["接口", "RS-485 × 2、M-Bus × 1（直连 ≤5 台）、以太网 × 2、USB × 1、Wi-Fi 配置热点"],
  ["电源输入", "12 ÷ 24V AC/DC，最大功耗 10W"],
  ["产品尺寸", "90 × 105 × 71 mm（6 个 DIN 模数），185 g"],
  ["工作环境", "0 ~ +60℃，IP20"],
]));
children.push(h2("6.3 关口多功能电表（选型技术要求）"));
children.push(paramTable([
  ["功能要求", "双向有功 / 无功电能、分时 TOU（尖峰平谷）、最大需量、电压 / 电流 / 功率因数 / 频率、谐波监测"],
  ["准确度等级", "有功 0.5S 级及以上（结算级）"],
  ["通信接口", "RS-485（Modbus RTU）或以太网（Modbus TCP）"],
  ["配套", "电流互感器变比录入系统，由系统自动还原一次侧读数"],
]));
children.push(h2("6.4 分项 / 子项导轨式电表（选型技术要求）"));
children.push(paramTable([
  ["功能要求", "正向有功电能、需量、电压 / 电流 / 功率"],
  ["准确度等级", "有功 1 级及以上"],
  ["安装方式", "35mm DIN 导轨安装"],
  ["通信接口", "RS-485（Modbus RTU），每条总线不超过 32 块"],
]));
children.push(h2("6.5 智能水表（选型技术要求）"));
children.push(paramTable([
  ["功能要求", "累积流量、瞬时流量，支持远传抄表"],
  ["通信接口", "M-Bus 或 RS-485"],
  ["供电", "电池或总线供电，电池寿命 ≥ 6 年"],
]));
children.push(h2("6.6 超声波冷热量表（选型技术要求）"));
children.push(paramTable([
  ["功能要求", "累积冷 / 热量、瞬时功率、供回水温度、流量"],
  ["准确度等级", "2 级及以上"],
  ["通信接口", "M-Bus 或 RS-485（Modbus RTU）"],
]));
children.push(h2("6.7 采集器 / 网关（选型技术要求）"));
children.push(paramTable([
  ["Modbus 网关", "RS-485 转以太网，支持 Modbus RTU → Modbus TCP 透传或轮询缓存"],
  ["M-Bus 采集器", "M-Bus 总线数据采集转以太网；NEXIO 直连 5 台以内可免采集器"],
  ["4G DTU", "无内网区域数据回传，支持断点续传"],
]));
children.push(h2("6.8 嵌入式触摸屏（选型技术要求）"));
children.push(paramTable([
  ["用途", "能源运行监控中心本地值守：实时负荷、告警事件流、平衡校核状态"],
  ["规格", "10 寸及以上工业触摸屏，以太网接入，浏览器内核展示"],
]));

// ── 七、铁律 ──
children.push(h1("七、数据治理十条铁律"));
children.push(p("下列铁律是系统的数据纪律，每一条在代码中均有强制点与单元测试："));
for (const s of [
  "铁律 1：一切能耗归属唯一表计（EmMeter），禁止裸点直接入账。",
  "铁律 2：同介质计量有向无环图，禁止跨介质挂接。",
  "铁律 3：物理表与虚拟表同构，上层业务无感。",
  "铁律 4：每个数值必带数据来源（emDataSource）。",
  "铁律 5：不重复定义冷机 / 水泵 / 空调箱（与楼控模型复用，不另建）。",
  "铁律 6：L2 台账只读，禁止直读点位历史（源码扫描自动守卫）。",
  "铁律 7：关账不可变，修正一律走红冲。",
  "铁律 8：业务参数版本化，必填来源文件（emSourceDoc）。",
  "铁律 9：账单 / 碳账 / 指标可无损重算（输入只有台账与参数版本）。",
  "铁律 10：节能量默认 planned，通过基线核证后方可 verified 对外。",
  "附：缺口率 5% 闸门 —— 缺口率超阈值自动阻断月度关账（阈值可按站点覆盖）。",
]) children.push(p(s));

const doc = new Document({
  features: { updateFields: true },
  sections: [{
    properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
    headers: { default: new Header({ children: [para(new TextRun({ text: "energyMatrix 建筑能源管理系统 V1.0 解决方案技术说明", font: fontH, size: 18, color: GRAY }), { alignment: AlignmentType.CENTER, spacing: { after: 60 } })] }) },
    footers: { default: new Footer({ children: [para(new TextRun({ children: [PageNumber.CURRENT], font: fontH, size: 18, color: GRAY }), { alignment: AlignmentType.CENTER })] }) },
    children,
  }],
});

fs.writeFileSync(outputPath, await Packer.toBuffer(doc));
console.log("OK", outputPath);
