import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSankey,
  MEDIUM_COLOR,
  type FlowMeterNode,
  type FlowMeterTotal,
} from "../src/pages/Flow/flowGraph.ts";

const GAP = "不明用能";

function meter(p: Partial<FlowMeterNode> & { id: string }): FlowMeterNode {
  return { dis: p.id, isVirtual: false, isGap: false, ...p };
}

test("buildSankey: 空输入返回空图，不抛错", () => {
  const g = buildSankey([], [], GAP);
  assert.equal(g.nodes.length, 0);
  assert.equal(g.links.length, 0);
  assert.equal(g.gapValue, 0);
  assert.equal(g.skippedLinks, 0);
});

test("buildSankey: 父子树转成 source/target 下标边", () => {
  const meters = [
    meter({ id: "m1", dis: "总表" }),
    meter({ id: "m2", dis: "空调", parentId: "m1" }),
    meter({ id: "m3", dis: "照明", parentId: "m1" }),
  ];
  const totals: FlowMeterTotal[] = [
    { id: "m1", val: 100, unit: "kWh" },
    { id: "m2", val: 60, unit: "kWh" },
    { id: "m3", val: 30, unit: "kWh" },
  ];
  const g = buildSankey(meters, totals, GAP);
  assert.equal(g.nodes.length, 3);
  assert.equal(g.links.length, 2);
  // 边指向父→子，值=子表合计
  const m1 = g.nodes.findIndex((n) => n.name === "总表");
  const m2 = g.nodes.findIndex((n) => n.name === "空调");
  const m3 = g.nodes.findIndex((n) => n.name === "照明");
  assert.deepEqual(g.links.find((l) => l.target === m2), { source: m1, target: m2, value: 60 });
  assert.deepEqual(g.links.find((l) => l.target === m3), { source: m1, target: m3, value: 30 });
  assert.equal(g.unit, "kWh");
  assert.equal(g.skippedLinks, 0);
});

test("buildSankey: 缺口表产出汇入不明用能汇点，不作为普通节点", () => {
  const meters = [
    meter({ id: "m1", dis: "总表" }),
    meter({ id: "g1", dis: "电缺口", parentId: "m1", isGap: true }),
    meter({ id: "m2", dis: "空调", parentId: "m1" }),
  ];
  const totals: FlowMeterTotal[] = [
    { id: "m1", val: 100 },
    { id: "g1", val: 10 },
    { id: "m2", val: 60 },
  ];
  const g = buildSankey(meters, totals, GAP);
  // 节点：m1、m2 + 汇点；缺口表自己不进节点
  assert.equal(g.nodes.length, 3);
  assert.ok(g.nodes.every((n) => n.name !== "电缺口"));
  const sink = g.nodes.findIndex((n) => n.gapSink === true);
  assert.notEqual(sink, -1);
  assert.equal(g.nodes[sink].name, GAP);
  assert.equal(g.gapValue, 10);
  // 一条普通边（总表→空调） + 一条缺口边（源表→汇点）
  assert.equal(g.links.length, 2);
  const m1 = g.nodes.findIndex((n) => n.name === "总表");
  assert.ok(g.links.some((l) => l.source === m1 && l.target === sink && l.value === 10));
});

test("buildSankey: 无缺口产出时不出现汇点", () => {
  const meters = [meter({ id: "m1" }), meter({ id: "g1", parentId: "m1", isGap: true })];
  const g = buildSankey(meters, [{ id: "m1", val: 50 }], GAP);
  assert.ok(g.nodes.every((n) => !n.gapSink));
  assert.equal(g.gapValue, 0);
});

test("buildSankey: 零值与缺失值的边被过滤并计数", () => {
  const meters = [
    meter({ id: "m1" }),
    meter({ id: "m2", parentId: "m1" }),
    meter({ id: "m3", parentId: "m1" }),
    meter({ id: "m4", parentId: "m1" }),
  ];
  const totals: FlowMeterTotal[] = [
    { id: "m1", val: 100 },
    { id: "m2", val: 0 },      // 零值
    // m3 无合计行          // 缺失
    { id: "m4", val: -5 },     // 负值（异常数据）也不画
  ];
  const g = buildSankey(meters, totals, GAP);
  assert.equal(g.links.length, 0);
  assert.equal(g.skippedLinks, 3);
});

test("buildSankey: 自环与悬挂父引用被跳过并计数", () => {
  const meters = [
    meter({ id: "m1" }),
    meter({ id: "m2", parentId: "m2" }),   // 自环
    meter({ id: "m3", parentId: "ghost" }), // 悬挂父引用
  ];
  const totals: FlowMeterTotal[] = [
    { id: "m1", val: 10 },
    { id: "m2", val: 5 },
    { id: "m3", val: 5 },
  ];
  const g = buildSankey(meters, totals, GAP);
  assert.equal(g.links.length, 0);
  assert.equal(g.skippedLinks, 2);
  // 节点照常存在（读图仍能看到这两块表）
  assert.equal(g.nodes.length, 3);
});

test("buildSankey: 节点配色按介质取 MEDIUM_COLOR，未知介质回退默认色", () => {
  const meters = [
    meter({ id: "m1", medium: "elec" }),
    meter({ id: "m2", medium: "darkmatter", parentId: "m1" }),
  ];
  const g = buildSankey(meters, [{ id: "m2", val: 1 }], GAP);
  assert.equal(g.nodes.find((n) => n.name === "m1")!.fill, MEDIUM_COLOR.elec);
  assert.equal(g.nodes.find((n) => n.name === "m2")!.fill, "#9AA6B2");
});
