import fs from "node:fs";
import {
  AlignmentType, Document, Footer, Header, HeadingLevel,
  Packer, PageNumber, Paragraph, ShadingType, Table, TableCell, TableRow,
  TextRun, WidthType, convertInchesToTwip, PageBreak,
} from "docx";

const outputPath = process.argv[2];
const font = { ascii: "Times New Roman", hAnsi: "Times New Roman", cs: "Times New Roman", eastAsia: "SimSun" };
const fontH = { ascii: "Arial", hAnsi: "Arial", cs: "Arial", eastAsia: "Microsoft YaHei" };
const INK = "1E2832", TEAL = "0B5F77", GRAY = "5C6B78";

const run = (t, o = {}) => new TextRun({ text: t, font, size: 21, color: INK, ...o });
const para = (c, o = {}) => new Paragraph({ spacing: { after: 120, line: 320 }, ...o, children: Array.isArray(c) ? c : [c] });
const p = (t) => para(run(t), { indent: { firstLine: convertInchesToTwip(0.35) } });
const h1 = (t) => para(new TextRun({ text: t, font: fontH, bold: true, size: 28, color: TEAL }), { heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 140 } });
const h2 = (t) => para(new TextRun({ text: t, font: fontH, bold: true, size: 24, color: INK }), { heading: HeadingLevel.HEADING_2, spacing: { before: 220, after: 100 } });

const FW = [800, 1700, 4500, 2000]; // 序号/类别/选项/补充
function formTable(rows) {
  const total = FW.reduce((a, b) => a + b, 0);
  const mk = (t, i, isHead) => new TableCell({
    children: [para(new TextRun({ text: t, font, size: 18, bold: isHead, color: isHead ? "FFFFFF" : INK }), { spacing: { after: 0, line: 250 } })],
    width: { size: FW[i], type: WidthType.DXA },
    margins: { top: 70, bottom: 70, left: 100, right: 100 },
    shading: isHead ? { type: ShadingType.CLEAR, fill: TEAL } : undefined,
  });
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: FW,
    rows: [
      new TableRow({ children: ["序号", "信息类别", "具体选项 / 填写项", "补充说明"].map((t, i) => mk(t, i, true)), tableHeader: true }),
      ...rows.map((r) => new TableRow({ children: r.map((t, i) => mk(t, i, false)) })),
    ],
  });
}
const gap = () => para(run("", { size: 10 }), { spacing: { after: 60 } });

const children = [];
children.push(para(run("能源管理项目信息收集表", { font: fontH, bold: true, size: 44, color: INK }), { alignment: AlignmentType.CENTER, spacing: { before: 2200, after: 200 } }));
children.push(para(run("（energyMatrix 建筑能源管理系统 V1.0 · 附件五）", { font: fontH, size: 24, color: GRAY }), { alignment: AlignmentType.CENTER, spacing: { after: 1400 } }));
children.push(para(run("西门子（中国）有限公司 · 2026", { font: fontH, size: 22, color: GRAY }), { alignment: AlignmentType.CENTER }));
children.push(new Paragraph({ children: [new PageBreak()] }));

children.push(h2("填写说明"));
children.push(p("请在对应选项后打“√”，多选或单选已标注；未覆盖的需求请在“补充说明”栏填写。"));
children.push(p("涉及数量、面积、期限等信息请直接填写具体数值。"));
children.push(p("可提供相关图纸（配电系统图、计量回路图、平面图等）作为附件，并标注文件名称。"));

children.push(h1("一、项目基础信息"));
children.push(formTable([
  ["1.1", "项目名称", "______（请填写）", ""],
  ["1.2", "项目类型", "□ 新建项目　□ 存量改造项目", ""],
  ["1.3", "建筑类型", "□ 写字楼　□ 商场 / 综合体　□ 酒店　□ 医院　□ 学校　□ 体育场馆　□ 园区　□ 数据中心　□ 工业厂房　□ 其他（请列明）", ""],
  ["1.4", "建筑规模", "总建筑面积：______㎡；楼层数：地上______层 / 地下______层", ""],
  ["1.5", "用能介质", "□ 电　□ 自来水　□ 中水　□ 燃气　□ 蒸汽　□ 冷量　□ 热量　□ 柴油　□ 光伏　□ 储能　□ 充电桩　□ 其他", "多选"],
  ["1.6", "图纸资料", "□ 配电系统图　□ 计量回路图　□ 平面图　□ 无（文件名称：______）", ""],
]));
children.push(gap());

children.push(h1("二、现有计量与回路情况"));
children.push(formTable([
  ["2.1", "关口计量", "□ 已有结算关口表（产权分界）　□ 无　□ 不确定；关口表是否带远传：□ 是 □ 否", ""],
  ["2.2", "分项计量", "□ 已按 A 照明插座 / B 空调 / C 动力 / D 特殊分项装表　□ 部分分项　□ 未分项", "请列出现有分项回路"],
  ["2.3", "楼层 / 租户表", "楼层子表______块；租户表______块", ""],
  ["2.4", "表计接口", "□ RS-485（Modbus）　□ M-Bus　□ 网口（Modbus TCP）　□ 无线（LoRa / NB-IoT）　□ 脉冲　□ 无远传（人工抄表）", "多选"],
  ["2.5", "既有系统", "□ 楼宇自控（BACnet）　□ 电力监控　□ 能耗监测平台　□ 光伏监控　□ 无　□ 其他（请说明）", "需评估利旧对接"],
  ["2.6", "水气冷热计量", "水表______块；燃气表______块；冷热量表______台；接口：______", ""],
  ["2.7", "历史数据", "□ 有历史能耗数据（格式：______，时段：______）　□ 无", "用于基线建立"],
]));
children.push(gap());

children.push(h1("三、功能需求信息"));
children.push(h2("（一）计量与台账需求"));
children.push(formTable([
  ["3.1.1", "计量粒度", "□ 实时曲线（15 分钟）　□ 小时　□ 日　□ 月账单", "多选"],
  ["3.1.2", "分项要求", "□ 按国标四类 14 分项　□ 自定义分项（请说明）", ""],
  ["3.1.3", "平衡校核", "□ 需要总表-分表缺口校核（默认闸门 5%）　□ 自定义阈值：______%", ""],
  ["3.1.4", "关账与红冲", "□ 月度关账管理　□ 需要修正留痕（红冲链）　□ 不需要", ""],
]));
children.push(h2("（二）分摊与计费需求"));
children.push(formTable([
  ["3.2.1", "分摊需求", "□ 公区分摊　□ 无表回路分摊　□ 不需要；分摊方法：□ 面积 □ 定额 □ 计量比例 □ 额定功率时长", ""],
  ["3.2.2", "计费模式", "□ 单一制　□ 两部制（□ 需量 □ 容量）　□ 分时电价（尖峰平谷）　□ 其他", ""],
  ["3.2.3", "租户账单", "□ 需要逐户账单（租户数：______）　□ 需要账单追溯台账　□ 不需要", ""],
  ["3.2.4", "需量管理", "□ 需要需量预警（申报值：______kW）　□ 不需要", ""],
]));
children.push(h2("（三）指标定额与双碳需求"));
children.push(formTable([
  ["3.3.1", "指标对标", "□ EUI 对标（GB 55015 / GB·T 51161）　□ 同比环比分析　□ 7×24 用能强度　□ 不需要", ""],
  ["3.3.2", "定额考核", "□ 需要（考核对象：□ 楼层 □ 租户 □ 科室 □ 设备）；限额来源：□ 政府下达 □ 集团分解 □ 历史基准", ""],
  ["3.3.3", "碳排放核算", "□ 需要（Scope：□ 1 □ 2 □ 3）　□ 绿电 / 绿证抵消　□ 碳目标跟踪　□ 不需要", ""],
  ["3.3.4", "上报要求", "□ 政府能耗监测平台上报　□ 集团汇总上报　□ 报表模板导出　□ 无", "请说明上报格式要求"],
]));
children.push(h2("（四）诊断与工单需求"));
children.push(formTable([
  ["3.4.1", "诊断规则", "□ 数据质量　□ 平衡校核　□ 夜间 / 非营业时段浪费　□ 超定额　□ 自定义规则（请说明）", "多选"],
  ["3.4.2", "工单管理", "□ 需要派单与 SLA　□ 与既有工单系统集成（请说明）　□ 不需要", ""],
  ["3.4.3", "节能核证", "□ 需要（IPMVP / ASHRAE G14 基线核证）　□ 不需要", ""],
]));
children.push(gap());

children.push(h1("四、技术适配信息"));
children.push(formTable([
  ["4.1", "网络环境", "□ 设备网独立 VLAN　□ 办公网复用　□ 有线覆盖不全　□ 无内网区域（请说明位置）", ""],
  ["4.2", "部署方式", "□ 本地私有化（边缘引擎）　□ 集团多站点（FIN Network）　□ 私有云　□ 无指定（按方案推荐）", ""],
  ["4.3", "点位规模", "预估表计______块；点位总数约______点", "用于边缘引擎与授权选型"],
  ["4.4", "AI 能力", "□ 需要 AI Agent（自然语言查能耗 / 生成报告）　□ 本地大模型　□ 云端大模型　□ 暂不需要", ""],
  ["4.5", "数据安全", "□ 数据不出内网　□ 允许加密上云　□ 等保要求（级别：______）", ""],
  ["4.6", "控制终端", "□ 浏览器后台　□ 监控大屏 / 嵌入式触摸屏　□ 移动端速览　□ 其他（请列明）", ""],
]));
children.push(gap());

children.push(h1("五、管理与运维信息"));
children.push(formTable([
  ["5.1", "权限管理", "□ 分级权限（管理员 / 能源经理 / 值班员 / 租户只读）　□ 统一权限　□ 无特殊要求", ""],
  ["5.2", "数据统计", "□ 能耗台账　□ 表计通信状态与数据完好率　□ 告警与工单统计　□ 碳排报表　□ 其他（请列明）", ""],
  ["5.3", "施工要求", "工期要求：______天；施工窗口期：______；是否允许停电施工：□ 是 □ 否；是否允许穿管敷线：□ 是 □ 否", ""],
  ["5.4", "维保要求", "质保期限：______年；维保响应时效：______小时内", ""],
  ["5.5", "预算情况", "大致预算：______元", ""],
]));
children.push(gap());

children.push(h1("六、联系人与备注"));
children.push(formTable([
  ["6.1", "项目联系人", "姓名：______　电话：______　邮箱：______", ""],
  ["6.2", "其他备注", "______（请填写以上未覆盖的需求或特殊说明）", ""],
]));
children.push(gap());
children.push(h2("提交说明"));
children.push(p("请填写完成后，连同图纸等附件，一并发送至指定邮箱或与方案经理联系。收到本表后，我方将结合《附件一 · 典型面积配置方案》出具项目级配置与报价。"));

const doc = new Document({
  features: { updateFields: false },
  sections: [{
    properties: { page: { margin: { top: 1440, right: 1200, bottom: 1440, left: 1200 } } },
    headers: { default: new Header({ children: [para(new TextRun({ text: "附件五 · 能源管理项目信息收集表 2026", font: fontH, size: 18, color: GRAY }), { alignment: AlignmentType.CENTER, spacing: { after: 60 } })] }) },
    footers: { default: new Footer({ children: [para(new TextRun({ children: [PageNumber.CURRENT], font: fontH, size: 18, color: GRAY }), { alignment: AlignmentType.CENTER })] }) },
    children,
  }],
});
fs.writeFileSync(outputPath, await Packer.toBuffer(doc));
console.log("OK", outputPath);
