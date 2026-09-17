import assert from "node:assert/strict";
import test from "node:test";
import {
  CORE_KPI_CODES,
  fmtKpiVal,
  isCoreKpi,
  quotaLevel,
  quotaTone,
  sortCoreFirst,
} from "../src/pages/Kpi/kpiFormat.ts";

test("fmtKpiVal: null/undefined/NaN 一律 —（分母缺失不当 0）", () => {
  assert.equal(fmtKpiVal(null), "—");
  assert.equal(fmtKpiVal(undefined), "—");
  assert.equal(fmtKpiVal(Number.NaN), "—");
});

test("fmtKpiVal: 数值带千分位，单位缀后", () => {
  assert.equal(fmtKpiVal(42.357, "kWh/m²"), "42.4 kWh/m²");
  assert.equal(fmtKpiVal(12345.6, "kWh"), "12,345.6 kWh");
  assert.equal(fmtKpiVal(0, "kgCO2e/m²"), "0 kgCO2e/m²");
});

test("quotaLevel: 超 100% 是 over，逼近预警线是 warn", () => {
  assert.equal(quotaLevel(1.2), "over");
  assert.equal(quotaLevel(1.0), "over");
  assert.equal(quotaLevel(0.95), "warn");
  assert.equal(quotaLevel(0.9), "warn");
  assert.equal(quotaLevel(0.5), "ok");
  assert.equal(quotaLevel(0), "ok");
});

test("quotaLevel: 自定义预警线与缺失值", () => {
  assert.equal(quotaLevel(0.8, 0.75), "warn");
  assert.equal(quotaLevel(0.7, 0.75), "ok");
  assert.equal(quotaLevel(undefined), undefined);
  assert.equal(quotaLevel(Number.NaN), undefined);
});

test("quotaTone: 与 ProgressBar 语义色一致", () => {
  assert.equal(quotaTone("over"), "danger");
  assert.equal(quotaTone("warn"), "warn");
  assert.equal(quotaTone("ok"), "ok");
  assert.equal(quotaTone(undefined), "neutral");
});

test("isCoreKpi / CORE_KPI_CODES: 核心编码表内含 CBEI（单位床位能耗）", () => {
  assert.ok(isCoreKpi("CBEI"));
  assert.ok(isCoreKpi("EUI_TOTAL"));
  assert.ok(!isCoreKpi("PUE"));
  assert.ok(CORE_KPI_CODES.includes("WATER_PER_BED"));
});

test("sortCoreFirst: 核心按考核口径排序在前，其余按编码字典序", () => {
  const rows = [
    { code: "ZZZ_OTHER" },
    { code: "EUI_ELEC" },
    { code: "AAA_OTHER" },
    { code: "EUI_TOTAL" },
    { code: "CBEI" },
  ];
  const sorted = sortCoreFirst(rows).map((r) => r.code);
  assert.deepEqual(sorted, ["EUI_TOTAL", "EUI_ELEC", "CBEI", "AAA_OTHER", "ZZZ_OTHER"]);
  // 不改原数组
  assert.equal(rows[0].code, "ZZZ_OTHER");
});