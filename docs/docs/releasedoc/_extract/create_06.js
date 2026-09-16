import fs from "node:fs";
import {
  AlignmentType, Document, Footer, Header, HeadingLevel,
  Packer, PageNumber, Paragraph, ShadingType, Table, TableCell, TableRow,
  TextRun, WidthType, convertInchesToTwip, PageBreak,
} from "docx";

const outputPath = process.argv[2];
const T = String.raw;
const font = { ascii: "Times New Roman", hAnsi: "Times New Roman", cs: "Times New Roman", eastAsia: "SimSun" };
const fontH = { ascii: "Arial", hAnsi: "Arial", cs: "Arial", eastAsia: "Microsoft YaHei" };
const INK = "1E2832", TEAL = "0B5F77", GRAY = "5C6B78";

const run = (t, o = {}) => new TextRun({ text: t, font, size: 21, color: INK, ...o });
const para = (c, o = {}) => new Paragraph({ spacing: { after: 120, line: 320 }, ...o, children: Array.isArray(c) ? c : [c] });
const p = (t) => para(run(t), { indent: { firstLine: convertInchesToTwip(0.35) } });
const h1 = (t) => para(new TextRun({ text: t, font: fontH, bold: true, size: 30, color: TEAL }), { heading: HeadingLevel.HEADING_1, spacing: { before: 340, after: 160 } });
const h2 = (t) => para(new TextRun({ text: t, font: fontH, bold: true, size: 25, color: INK }), { heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 } });

// 三列对比表：维度 | 方案A | 方案B ...（首列为维度）
function cmpTable(widths, header, rows) {
  const total = widths.reduce((a, b) => a + b, 0);
  const mk = (t, i, isHead, isFirst) => new TableCell({
    children: [para(new TextRun({ text: t, font, size: 18, bold: isHead || isFirst, color: isHead ? "FFFFFF" : INK }), { spacing: { after: 0, line: 250 } })],
    width: { size: widths[i], type: WidthType.DXA },
    margins: { top: 70, bottom: 70, left: 100, right: 100 },
    shading: isHead ? { type: ShadingType.CLEAR, fill: TEAL } : (isFirst ? { type: ShadingType.CLEAR, fill: "EEF3F6" } : undefined),
  });
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({ children: header.map((t, i) => mk(t, i, true, false)), tableHeader: true }),
      ...rows.map((r) => new TableRow({ children: r.map((t, i) => mk(t, i, false, i === 0)) })),
    ],
  });
}
const gap = () => para(run("", { size: 10 }), { spacing: { after: 60 } });

const children = [];
children.push(para(run("建筑能耗采集通讯协议", { font: fontH, bold: true, size: 44, color: INK }), { alignment: AlignmentType.CENTER, spacing: { before: 2400, after: 180 } }));
children.push(para(run("综合技术与成本对比", { font: fontH, bold: true, size: 36, color: TEAL }), { alignment: AlignmentType.CENTER, spacing: { after: 120 } }));
children.push(para(run("分析报告", { font: fontH, bold: true, size: 36, color: TEAL }), { alignment: AlignmentType.CENTER, spacing: { after: 1400 } }));
children.push(para(run("energyMatrix 建筑能源管理系统 V1.0 · 附件三", { font: fontH, size: 22, color: GRAY }), { alignment: AlignmentType.CENTER, spacing: { after: 160 } }));
children.push(para(run("西门子（中国）有限公司 · 2026 年 9 月", { font: fontH, size: 22, color: GRAY }), { alignment: AlignmentType.CENTER }));
children.push(new Paragraph({ children: [new PageBreak()] }));

children.push(h1("一、协议定位与技术底层"));
children.push(p("能耗采集的通讯选型直接决定计量数据的及时性、完整率与工程成本。本报告对比楼宇能源管理中常见的七类通讯方式：Modbus RTU、Modbus TCP、M-Bus、BACnet、KNX、MQTT 与 LoRa / NB-IoT 无线上报，给出选型建议。"));
children.push(cmpTable([1700, 2450, 2450, 2400],
  ["维度", "有线总线（Modbus RTU / M-Bus）", "以太网（Modbus TCP / BACnet IP / KNX IP）", "无线广域（LoRa / NB-IoT）"],
  [
    ["协议基础", "Modbus：工业串行总线事实标准；M-Bus：EN 13757 欧洲仪表总线标准", "BACnet：楼宇自控国际标准（ISO 16484）；KNX：EN 50090 / ISO/IEC 14543", "LoRa：Semtech 调制 + LoRaWAN；NB-IoT：3GPP 蜂窝物联网"],
    ["核心定位", "表计密集区域的低成本可靠采集", "楼控 / 电力监控系统集成与主干传输", "改造难布线区域、分散点位的远传抄表"],
    ["典型设备", "电表、水表、冷热量表、采集器", "边缘引擎、网关、BA 控制器", "无线水表、燃气表、DTU"],
  ]));
children.push(gap());

children.push(h1("二、网络架构与拓扑能力"));
children.push(cmpTable([1700, 2450, 2450, 2400],
  ["维度", "Modbus RTU / M-Bus", "Modbus TCP / BACnet IP", "LoRa / NB-IoT"],
  [
    ["拓扑类型", "总线型；Modbus 每段 ≤32 节点（中继扩展），M-Bus 每段 ≤250 节点", "星型，依托楼宇设备网 / VLAN", "星型（LoRa 经网关汇聚；NB-IoT 直连运营商基站）"],
    ["覆盖能力", "RS-485 约 1,200 m；M-Bus 约 1,000 m", "以太网 100 m/段，光纤骨干延伸", "LoRa 室内 100–300 m；NB-IoT 依赖公网覆盖"],
    ["部署灵活性", "需敷设总线，表计集中配电箱内最经济", "复用既有综合布线", "免布线，即装即用；地下室需核查信号"],
  ]));
children.push(gap());

children.push(h1("三、传输性能与实时性"));
children.push(cmpTable([1700, 2450, 2450, 2400],
  ["维度", "Modbus RTU / M-Bus", "Modbus TCP / BACnet IP", "LoRa / NB-IoT"],
  [
    ["数据速率", "Modbus 1.2–115.2 kbps；M-Bus 0.3–38.4 kbps", "10/100 Mbps", "LoRa 0.3–50 kbps；NB-IoT ≈ 百 kbps 级"],
    ["采集周期", "秒级轮询（需量、负荷曲线场景可满足）", "毫秒–秒级", "分钟级及以上上报，适合日冻结 / 月账单"],
    ["可靠性", "有线抗干扰强，丢包率极低；屏蔽双绞线 + 终端电阻后工业级稳定", "依托 IP 网络，QoS 可管可控", "受遮挡与拥塞影响，需重传与补采机制"],
  ]));
children.push(gap());
children.push(p("energyMatrix 的台账以“日”为默认落库粒度、需量与实时负荷依赖 15 分钟级曲线，因此总线与以太网方案均可满足；纯 LoRa / NB-IoT 方案不适合承担需量监测与实时告警链路。"));

children.push(h1("四、供电与功耗"));
children.push(cmpTable([1700, 2450, 2450, 2400],
  ["维度", "Modbus RTU / M-Bus", "以太网方案", "LoRa / NB-IoT"],
  [
    ["设备供电", "电表常电；M-Bus 支持总线供电（水 / 热表常见）", "常电", "电池为主，低功耗设计"],
    ["典型续航", "—（常电）", "—（常电）", "电池 5–10 年（低频上报）"],
    ["维护要点", "总线极性与终端匹配", "网络可用性", "电池更换周期与远程电量监控"],
  ]));
children.push(gap());

children.push(h1("五、安全性、生态与集成"));
children.push(cmpTable([1700, 2450, 2450, 2400],
  ["维度", "Modbus RTU / M-Bus", "Modbus TCP / BACnet IP", "LoRa / NB-IoT"],
  [
    ["安全机制", "物理隔离为主；建议设备网独立 VLAN / 物理隔离", "支持网络层安全策略；BACnet/SC 提供安全链路", "AES-128（LoRaWAN）/ 运营商级加密（NB-IoT）"],
    ["生态兼容", "表计厂商几乎全部支持", "BA 与电力监控主流", "以水气表与 DTU 为主"],
    ["与 energyMatrix 集成", "边缘引擎原生 Modbus / M-Bus 驱动", "原生 BACnet IP / Modbus TCP 驱动", "经 MQTT 或网关汇聚后接入"],
  ]));
children.push(gap());

children.push(h1("六、工程建设成本分析（以 10,000 ㎡ 办公建筑为例）"));
children.push(p("假设：电计量关口 1 块 + 分项 24 块 + 楼层子表 24 块，水表 6 块，冷热量表 2 台，合计约 57 个计量点。"));
children.push(cmpTable([1700, 2450, 2450, 2400],
  ["成本项", "有线总线方案", "以太网直连方案", "无线（LoRa / NB-IoT）方案"],
  [
    ["线缆与敷设", "屏蔽双绞线约 1,500–2,500 m，需穿管敷设", "复用设备网，少量跳线", "无"],
    ["采集设备", "Modbus 网关 4–6 台 + M-Bus 采集器 1–2 台", "无需采集器（表计需网口型，单价更高）", "LoRa 网关 2–3 台，或 NB-IoT 表计内置流量费"],
    ["调试周期", "3–5 天（总线分段测试）", "2–3 天", "1–2 天（需逐点验证信号）"],
    ["综合工程造价", "中（线缆施工占主）", "中高（网口表计溢价）", "表计溢价 + 流量费，无施工费"],
  ]));
children.push(gap());

children.push(h1("七、运行维护成本"));
children.push(cmpTable([1700, 2450, 2450, 2400],
  ["维度", "有线总线方案", "以太网直连方案", "无线方案"],
  [
    ["故障排查", "总线分段定位，成熟直观", "依赖 IP 网络运维", "信号衰减与电池状态需远程监控"],
    ["数据完好率", "高（断网本地缓存补采）", "高", "中（依赖重传与补采策略）"],
    ["系统扩展", "总线余量内挂表即扩", "接入设备网即扩", "新装即入网，但密集区需评估信道"],
  ]));
children.push(gap());

children.push(h1("八、综合结论与选型建议"));
children.push(h2("8.1 推荐组合"));
children.push(p("新建项目与配电房集中的改造项目：以 RS-485（Modbus RTU）+ M-Bus 有线总线为主干，边缘引擎 Modbus TCP / BACnet IP 上行——数据完好率与实时性最优，全生命周期成本最低。"));
children.push(p("分散点位与难布线区域（独立电井、室外泵房、租户外铺）：采用 LoRa / NB-IoT 无线表计或 4G DTU 补盲，经 MQTT 汇聚接入。"));
children.push(h2("8.2 适用边界"));
children.push(p("需量监测、实时告警与负荷曲线链路必须使用有线方案；无线上报仅承担日 / 月冻结数据与账单口径数据。"));
children.push(p("既有楼控（BACnet）与电力监控（Modbus TCP）系统优先利旧对接，energyMatrix 经边缘引擎直接集成，不重复装表。"));
children.push(h2("8.3 关键纪律"));
children.push(p("无论采用何种通讯链路，进入 energyMatrix 台账的每个数值都必须带来源标记（实测 / 推导 / 分摊 / 估算 / 人工），无线链路的补采数据按估算口径标注，确保账目可审计。"));

const doc = new Document({
  features: { updateFields: false },
  sections: [{
    properties: { page: { margin: { top: 1440, right: 1200, bottom: 1440, left: 1200 } } },
    headers: { default: new Header({ children: [para(new TextRun({ text: "附件三 · 建筑能耗采集通讯协议对比分析", font: fontH, size: 18, color: GRAY }), { alignment: AlignmentType.CENTER, spacing: { after: 60 } })] }) },
    footers: { default: new Footer({ children: [para(new TextRun({ children: [PageNumber.CURRENT], font: fontH, size: 18, color: GRAY }), { alignment: AlignmentType.CENTER })] }) },
    children,
  }],
});
fs.writeFileSync(outputPath, await Packer.toBuffer(doc));
console.log("OK", outputPath);
