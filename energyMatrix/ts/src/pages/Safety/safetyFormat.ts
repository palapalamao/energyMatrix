import { HMarker } from "haystack-core";
import type { HDict } from "haystack-core";

/**
 * 电气安全监测屏（/safety，需求 7.3，V0.1.3）的纯函数 —— 运行时零依赖
 * （node:test 直接单测，同 kpiFormat 约定），不碰 client、不碰 mobx。
 *
 * 阈值口径来自已确认静态 Demo（docs/demo/2026-09-17-em-safety-screen），
 * 绝缘告警阈值 50 kΩ 是 IEC 60364-7-710 的 50 Ω/V 惯例值（220 V IT 系统），
 * 最终值评审定夺；模型层 emIrAlarmThreshold 逐柜可配，前端这里取默认值。
 *
 * 本屏只监测不控制：所有函数只做「数值 → 分级」的判定，无任何写操作。
 */

/**
 * 点位的 marker 名列表（classifyPoint 的输入）。
 * `instanceof HMarker` 判定 —— haystack-core 3.0.13 起 `HMarker.toJSON()`
 * 返回对象（{_kind:"marker"}），旧写法 `toJSON() === null` 恒不成立，
 * 会把全部点位归为 other、整屏空数据（2026-09-17 运行时验收实测）。
 */
export function tagNames(p: HDict): string[] {
  return p.keys.filter((k) => p.get(k) instanceof HMarker);
}

/** 越限三级：与 Demo 徽标（正常 / 越限预警 / 越限告警）同口径。 */

export type SafetyLevel = "ok" | "warn" | "alarm";

/** 与 Bits.Tone 兼容的语义色子集（不 import Bits，保持零运行时依赖）。 */
export type SafetyTone = "ok" | "warn" | "danger" | "neutral";

export function levelTone(level: SafetyLevel | undefined): SafetyTone {
  return level === "alarm" ? "danger" : level === "warn" ? "warn" : level === "ok" ? "ok" : "neutral";
}

/** 全屏阈值表（与 Demo TH 常量一一对应）。 */
export const SAFETY_TH = {
  /** 电压上下限（V），超出即告警（Demo 无电压预警带） */
  voltLo: 198,
  voltHi: 242,
  /** 线缆/接点温度（°C） */
  tempWarn: 60,
  tempAlarm: 70,
  /** IT 系统绝缘电阻（kΩ）——越低越危险，50 Ω/V × 220 V 惯例值 */
  irWarn: 50,
  irAlarm: 30,
  /** 电能质量（%） */
  thdV: 5,
  thdI: 20,
  unb: 2,
  /** 剩余/漏电流（mA） */
  leakWarn: 300,
  leakAlarm: 500,
} as const;

/** 点位归类：监测卡片按类取数，marker 是契约，命名自由。 */
export type SafetyPointKind =
  | "volt"
  | "current"
  | "power"
  | "temp"
  | "insulation"
  | "thdV"
  | "thdI"
  | "unbalance"
  | "leak"
  | "other";

/**
 * 按 marker 给点位归类。优先级从上到下；功率要排除 reactive
 * （EmElecPowerActive 只带 power，无功/reactive 不能当有功展示）。
 */
export function classifyPoint(tags: readonly string[]): SafetyPointKind {
  const has = (m: string) => tags.includes(m);
  if (has("emInsulation")) return "insulation";
  if (has("emThdV")) return "thdV";
  if (has("emThdI")) return "thdI";
  if (has("emUnbalance")) return "unbalance";
  if (has("emResidualCurrent")) return "leak";
  if (has("volt")) return "volt";
  if (has("current")) return "current";
  if (has("temp")) return "temp";
  if (has("power") && !has("reactive")) return "power";
  return "other";
}

/** 数值格式化：null/undefined/NaN 一律「—」（点位没采到不能当 0 展示）。 */
export function fmtVal(v?: number | null, digits = 1): string {
  if (v === undefined || v === null || Number.isNaN(v)) return "—";
  return v.toLocaleString(undefined, { maximumFractionDigits: digits });
}

/** 带上单位的展示值。 */
export function fmtValUnit(v?: number | null, unit?: string, digits = 1): string {
  if (v === undefined || v === null || Number.isNaN(v)) return "—";
  return `${fmtVal(v, digits)}${unit ? " " + unit : ""}`;
}

/**
 * 「越高越坏」的分级：v >= alarmAt 告警，v >= warnAt 预警。
 * 值缺失 → undefined（不猜）。
 */
export function overLevel(
  v: number | undefined,
  warnAt: number,
  alarmAt: number
): SafetyLevel | undefined {
  if (v === undefined || Number.isNaN(v)) return undefined;
  if (v >= alarmAt) return "alarm";
  if (v >= warnAt) return "warn";
  return "ok";
}

/**
 * 「越低越坏」的分级（绝缘电阻）：v <= alarmAt 告警，v <= warnAt 预警。
 */
export function underLevel(
  v: number | undefined,
  warnAt: number,
  alarmAt: number
): SafetyLevel | undefined {
  if (v === undefined || Number.isNaN(v)) return undefined;
  if (v <= alarmAt) return "alarm";
  if (v <= warnAt) return "warn";
  return "ok";
}

/** 电压窗口判定：越出 [lo, hi] 即告警（Demo 口径，无预警带）。 */
export function voltLevel(
  v: number | undefined,
  lo = SAFETY_TH.voltLo,
  hi = SAFETY_TH.voltHi
): SafetyLevel | undefined {
  if (v === undefined || Number.isNaN(v)) return undefined;
  return v < lo || v > hi ? "alarm" : "ok";
}

/**
 * 多个指标取最坏级别。缺失的指标不参与判定（点位没装 ≠ 安全，但也不
 * 该把整张卡片刷红 —— 缺失在卡片上显示「—」，由人来补装）。
 */
export function worstLevel(...levels: (SafetyLevel | undefined)[]): SafetyLevel {
  if (levels.includes("alarm")) return "alarm";
  if (levels.includes("warn")) return "warn";
  return "ok";
}

/**
 * 点位类 → 规范单位。单位优先从数据（curVal.unit）读，读不到才用这张表
 * 兜底 —— 硬编单位进显示层的坑见 emApi.unitOf 的注释。
 */
export const KIND_UNIT: Record<Exclude<SafetyPointKind, "other">, string> = {
  volt: "V",
  current: "A",
  power: "kW",
  temp: "°C",
  insulation: "kΩ",
  thdV: "%",
  thdI: "%",
  unbalance: "%",
  leak: "mA",
};
