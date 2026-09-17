import assert from "node:assert/strict";
import test from "node:test";
import { HDict, HMarker, HRef, HStr } from "haystack-core";
import {
  tagNames,
  KIND_UNIT,
  SAFETY_TH,
  classifyPoint,
  fmtVal,
  fmtValUnit,
  levelTone,
  overLevel,
  underLevel,
  voltLevel,
  worstLevel,
} from "../src/pages/Safety/safetyFormat.ts";

test("fmtVal: null/undefined/NaN 一律 —（没采到不能当 0）", () => {
  assert.equal(fmtVal(null), "—");
  assert.equal(fmtVal(undefined), "—");
  assert.equal(fmtVal(Number.NaN), "—");
  assert.equal(fmtVal(0), "0");
});

test("fmtValUnit: 数值带单位，缺失显示 —", () => {
  assert.equal(fmtValUnit(52.3, "kΩ"), "52.3 kΩ");
  assert.equal(fmtValUnit(undefined, "V"), "—");
});

test("classifyPoint: marker 优先级与 reactive 排除", () => {
  assert.equal(classifyPoint(["elec", "sensor", "emInsulation"]), "insulation");
  assert.equal(classifyPoint(["elec", "sensor", "emThd", "emThdV"]), "thdV");
  assert.equal(classifyPoint(["elec", "sensor", "emThd", "emThdI"]), "thdI");
  assert.equal(classifyPoint(["elec", "sensor", "emUnbalance"]), "unbalance");
  assert.equal(classifyPoint(["elec", "sensor", "emResidualCurrent"]), "leak");
  assert.equal(classifyPoint(["elec", "volt", "sensor"]), "volt");
  assert.equal(classifyPoint(["elec", "current", "sensor"]), "current");
  assert.equal(classifyPoint(["temp", "sensor"]), "temp");
  // 有功功率：有 power 无 reactive；无功必须被排除
  assert.equal(classifyPoint(["elec", "power", "sensor"]), "power");
  assert.equal(classifyPoint(["elec", "power", "reactive", "sensor"]), "other");
  // 最大需量（emDemand/max 也带 power）：统计量不是实时功率，必须排除（2026-09-17 实测无 his 被选中致卡片「—」）
  assert.equal(classifyPoint(["elec", "power", "emDemand", "max", "sensor"]), "other");
  assert.equal(classifyPoint(["elec", "sensor"]), "other");
});

test("overLevel: 温度/漏电流阈值分级（与 Demo TH 同口径）", () => {
  assert.equal(overLevel(74.6, SAFETY_TH.tempWarn, SAFETY_TH.tempAlarm), "alarm");
  assert.equal(overLevel(63.2, SAFETY_TH.tempWarn, SAFETY_TH.tempAlarm), "warn");
  assert.equal(overLevel(46.5, SAFETY_TH.tempWarn, SAFETY_TH.tempAlarm), "ok");
  assert.equal(overLevel(520, SAFETY_TH.leakWarn, SAFETY_TH.leakAlarm), "alarm");
  assert.equal(overLevel(320, SAFETY_TH.leakWarn, SAFETY_TH.leakAlarm), "warn");
  assert.equal(overLevel(185, SAFETY_TH.leakWarn, SAFETY_TH.leakAlarm), "ok");
  assert.equal(overLevel(undefined, SAFETY_TH.leakWarn, SAFETY_TH.leakAlarm), undefined);
});

test("underLevel: 绝缘电阻越低越坏（50 预警 / 30 告警）", () => {
  assert.equal(underLevel(42.8, 50, 30), "warn");
  assert.equal(underLevel(28, 50, 30), "alarm");
  assert.equal(underLevel(128.5, 50, 30), "ok");
  assert.equal(underLevel(undefined, 50, 30), undefined);
  // 柜级可配阈值：emIrAlarmThreshold=80 为预警边界，告警带 = 0.6×80=48
  assert.equal(underLevel(60, 80, 48), "warn");
  assert.equal(underLevel(40, 80, 48), "alarm");
  assert.equal(underLevel(90, 80, 48), "ok");
});

test("voltLevel: 198–242 V 窗口，越出即告警（无预警带）", () => {
  assert.equal(voltLevel(217.2), "ok");
  assert.equal(voltLevel(198), "ok");
  assert.equal(voltLevel(242), "ok");
  assert.equal(voltLevel(190), "alarm");
  assert.equal(voltLevel(245), "alarm");
  assert.equal(voltLevel(undefined), undefined);
});

test("worstLevel: 多指标取最坏，缺失不参与", () => {
  assert.equal(worstLevel("ok", "warn", "ok"), "warn");
  assert.equal(worstLevel("ok", "alarm", undefined), "alarm");
  assert.equal(worstLevel(undefined, undefined), "ok");
  assert.equal(worstLevel("warn", undefined), "warn");
});

test("levelTone: 与 Bits.Tone 语义色一致", () => {
  assert.equal(levelTone("alarm"), "danger");
  assert.equal(levelTone("warn"), "warn");
  assert.equal(levelTone("ok"), "ok");
  assert.equal(levelTone(undefined), "neutral");
});

test("SAFETY_TH / KIND_UNIT: 阈值与 Demo 一致，单位表齐全", () => {
  assert.equal(SAFETY_TH.voltLo, 198);
  assert.equal(SAFETY_TH.voltHi, 242);
  assert.equal(SAFETY_TH.irWarn, 50);
  assert.equal(SAFETY_TH.irAlarm, 30);
  assert.equal(SAFETY_TH.thdV, 5);
  assert.equal(SAFETY_TH.thdI, 20);
  assert.equal(SAFETY_TH.unb, 2);
  assert.equal(SAFETY_TH.leakWarn, 300);
  assert.equal(SAFETY_TH.leakAlarm, 500);
  assert.equal(KIND_UNIT.insulation, "kΩ");
  assert.equal(KIND_UNIT.leak, "mA");
  assert.equal(KIND_UNIT.power, "kW");
});
test("tagNames: instanceof HMarker 判定（haystack-core 3.0.13 toJSON 非 null 回归）", () => {
  const d = HDict.make({ id: HRef.make("p:demo:r:1"), volt: HMarker.make(), kind: HStr.make("Number") });
  assert.deepEqual(tagNames(d), ["volt"]);
});
