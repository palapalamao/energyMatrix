/**
 * KPI 考核屏的纯函数 —— 运行时零依赖（node:test 直接单测，同 flowGraph 约定），
 * 不碰 client、不碰 mobx。
 *
 * 展示层只负责「把后端算好的数摆出来」：emFormula 的求值口径在后端
 * EmKpiService，这里一律不重复实现计算。
 */

/** 与 Bits.Tone 兼容的语义色子集（这里不 import Bits，保持本模块零运行时依赖）。 */
export type KpiTone = "neutral" | "ok" | "warn" | "danger";

/** 数值格式化：null/undefined/NaN 一律「—」；千分位，最多 digits 位小数。 */
function fmt(v?: number | null, digits = 1): string {
  if (v === undefined || v === null || Number.isNaN(v)) return "—";
  return v.toLocaleString(undefined, { maximumFractionDigits: digits });
}

/**
 * 核心考核指标编码（绿色医院评审口径）。
 *
 * 只决定卡片排序（核心在前）与「核心」徽标，不决定算不算 ——
 * 指标定义全在 emKpiDefs()，现场加指标不用改这里。
 */
export const CORE_KPI_CODES = [
  "EUI_TOTAL",
  "EUI_ELEC",
  "EUI_BED",
  "CBEI",
  "EUI_PC",
  "WUI",
  "WATER_PER_BED",
  "CARBON_INTENSITY",
] as const;

export function isCoreKpi(code: string): boolean {
  return (CORE_KPI_CODES as readonly string[]).includes(code);
}

/** 核心指标排前面，其余按编码字典序，稳定输出（不改原数组）。 */
export function sortCoreFirst<T extends { code: string }>(rows: T[]): T[] {
  const rank = (code: string): number => {
    const i = (CORE_KPI_CODES as readonly string[]).indexOf(code);
    return i < 0 ? 1000 + (code < "Z" ? 0 : 0) : i;
  };
  return [...rows].sort((a, b) => {
    const ca = rank(a.code);
    const cb = rank(b.code);
    return ca === cb ? a.code.localeCompare(b.code) : ca - cb;
  });
}

/**
 * 指标值展示：缺失/null/NaN 一律「—」（分母没配的指标不能当 0 展示，
 * 0 是「算出来等于零」，null 是「根本算不了」，评审时这两件事天差地别）。
 */
export function fmtKpiVal(v?: number | null, unit?: string): string {
  if (v === undefined || v === null || Number.isNaN(v)) return "—";
  return `${fmt(v)}${unit ? " " + unit : ""}`;
}

/**
 * 定额进度 → 严重度。
 *  ratio >= 1       over   （达到或超过限值；与 ProgressBar 的 r>=1→danger 同口径）
 *  ratio >= warnAt  warn   （逼近上限，默认 0.9）
 *  其余             ok
 * ratio 缺失（定额还没配用量口径）→ undefined，不猜。
 */
export function quotaLevel(
  ratio?: number,
  warnAt?: number
): "ok" | "warn" | "over" | undefined {
  if (ratio === undefined || ratio === null || Number.isNaN(ratio)) return undefined;
  if (ratio >= 1) return "over";
  const warn = warnAt ?? 0.9;
  return ratio >= warn ? "warn" : "ok";
}

export function quotaTone(level: "ok" | "warn" | "over" | undefined): KpiTone {
  return level === "over" ? "danger" : level === "warn" ? "warn" : level === "ok" ? "ok" : "neutral";
}