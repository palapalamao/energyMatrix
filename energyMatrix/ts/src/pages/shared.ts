import type { Tone } from "@/components/Bits";

/**
 * 跨屏共用的展示字典与格式化。
 *
 * 这些映射**只管展示**，不参与任何计算 —— 计算口径全在后端。放在一处是为了
 * 「电」在总览、分析、碳排三个屏上永远是同一个字，而不是三种写法。
 */

/** 介质展示名。键与 EmMedium 枚举一致。 */
export const MEDIUM_DIS: Record<string, string> = {
  elec: "电",
  water: "水",
  gas: "燃气",
  steam: "蒸汽",
  heat: "热量",
  cool: "冷量",
  diesel: "柴油",
  coal: "煤",
  hydrogen: "氢",
};

/** 国标分项一级分组。 */
export const SUBITEM_GROUP_DIS: Record<string, string> = {
  A: "照明插座",
  B: "空调",
  C: "动力",
  D: "特殊区域",
};

/**
 * 国标分项一级分组的配色（设计稿原色）。
 *
 * 写死十六进制而不是走 Tailwind 类名：堆叠图的每一段要用 inline style 上色，
 * 类名在这里没法拼（Tailwind 只保留静态出现过的类）。
 */
export const SUBITEM_GROUP_COLOR: Record<string, string> = {
  A: "#6EB435",
  B: "#138BAA",
  C: "#7B61C9",
  D: "#E89B1A",
};

/** 分项编码 → 它所属一级分组的颜色。 */
export function subItemColor(code: string): string {
  return SUBITEM_GROUP_COLOR[code.slice(0, 1).toUpperCase()] ?? "#9AA6B2";
}

/** 国标分项二级编码。 */
export const SUBITEM_DIS: Record<string, string> = {
  a1: "室内照明与插座",
  a2: "走廊与应急照明",
  a3: "室外景观照明",
  b1: "冷热站",
  b2: "空调末端",
  c1: "电梯扶梯",
  c2: "水泵",
  c3: "通风机",
  d1: "信息中心",
  d2: "厨房餐厅",
  d3: "洗衣房",
  d4: "游泳池",
  d5: "健身娱乐",
  d6: "其他",
};

/** 数据来源等级。顺序即可信度从高到低（说明书表 5-1）。 */
export const SOURCE_DIS: Record<string, string> = {
  measured: "实测",
  derived: "推导",
  allocated: "分摊",
  manual: "人工录入",
  estimated: "估算",
};

/** 定额来源。不同来源必须分别标注，不可混用（说明书 §4.5）。 */
export const QUOTA_SOURCE_DIS: Record<string, string> = {
  standard: "国标 / 地标",
  historical: "历史同期",
  benchmark: "同类对标",
  contract: "合同约定",
  manual: "人工下达",
};

/** 超限动作。 */
export const OVER_ACTION_DIS: Record<string, string> = {
  notify: "仅提醒",
  bill: "计入账单",
  limitLoad: "限负荷",
};

/** 诊断分类。 */
export const CATEGORY_DIS: Record<string, string> = {
  dataQuality: "数据质量",
  balance: "平衡校核",
  overConsume: "用能异常",
  efficiency: "效率异常",
  scheduleWaste: "作息浪费",
  demandRisk: "需量风险",
  quotaRisk: "定额风险",
  carbonRisk: "碳目标风险",
};

/** 异常状态。 */
export const ANOMALY_STATUS_DIS: Record<string, string> = {
  open: "待处理",
  acked: "已确认",
  dispatched: "已派单",
  resolved: "已处置",
  falseAlarm: "误报",
};

/** 工单状态，顺序即状态流（只能往前走）。 */
export const WO_STATUS_ORDER = ["new", "assigned", "inProgress", "done", "closed"] as const;
export const WO_STATUS_DIS: Record<string, string> = {
  new: "新建",
  assigned: "已派单",
  inProgress: "处理中",
  done: "已完成",
  closed: "已关闭",
};

/** 严重度。 */
export const SEVERITY_DIS: Record<string, string> = {
  info: "提示",
  warn: "预警",
  critical: "严重",
};

export const SEVERITY_TONE: Record<string, Tone> = {
  info: "info",
  warn: "warn",
  critical: "danger",
};

/** 核证状态（铁律 10：未核证不得以已核证口径对外）。 */
export const VERIFY_STATUS_DIS: Record<string, string> = {
  planned: "规划中",
  implemented: "已实施",
  monitoring: "监测中",
  verified: "已核证",
  rejected: "未通过",
};

export const VERIFY_STATUS_TONE: Record<string, Tone> = {
  planned: "neutral",
  implemented: "info",
  monitoring: "warn",
  verified: "ok",
  rejected: "danger",
};

/** 温室气体核算范围。 */
export const SCOPE_DIS: Record<string, string> = {
  scope1: "Scope 1 直接排放",
  scope2: "Scope 2 外购能源",
  scope3: "Scope 3 其他间接",
};

/**
 * 各介质在总览卡上的固定排序。
 * 不按用量排 —— 卡片位置每期都变，看板上的人会找不到自己关心的那张。
 */
export const MEDIUM_ORDER = [
  "elec", "water", "gas", "cool", "heat", "steam", "diesel", "coal", "hydrogen",
];

/** 千分位 + 最多一位小数；undefined 显示破折号而不是 0。 */
export function fmtNum(v?: number, digits = 1): string {
  if (v === undefined || v === null || Number.isNaN(v)) return "—";
  return v.toLocaleString(undefined, { maximumFractionDigits: digits });
}

/** 百分比。 */
export function fmtPct(v?: number, digits = 1): string {
  if (v === undefined || v === null || Number.isNaN(v)) return "—";
  return (v * 100).toFixed(digits) + "%";
}

/** 带符号的百分比（同比 / 环比）。 */
export function fmtDelta(v?: number, digits = 1): string {
  if (v === undefined || v === null || Number.isNaN(v)) return "—";
  const s = (v * 100).toFixed(digits) + "%";
  return v > 0 ? "+" + s : s;
}

/** ISO 时间戳截到分钟；haystack 的 DateTime 带时区后缀，这里只取前 16 位。 */
export function fmtTs(v?: string): string {
  if (!v) return "—";
  return v.slice(0, 16).replace("T", " ");
}
