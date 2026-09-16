/**
 * 能流图（Sankey）数据结构 —— 纯函数模块。
 *
 * 不 import 任何东西（React / haystack / mobx 都不依赖），
 * node:test 直接单测（ts/tests/flow-graph.test.ts）。
 *
 * 数据契约（详细设计 4.4/5.4）：
 *   结构 = emMeterTree 的行：id / dis / emMedium / emMeterRole / submeterOf /
 *          emDepth / emVirtual / emGap / emChildCount
 *   数值 = emLedgerAggregate(siteRef, span, "meter") 的行：dim（表计 ref）/ val
 *
 * 汇总语义沿用 EmMeterNode.summableChildren（说明书 3.3）：
 *   考核表照常显示，但它不是任何父表的汇总来源 —— 能流图的边取的是
 *   submeterOf 的父子关系，与后端汇总无关，这里不再特殊处理。
 */

/** emMeterTree 一行的最小投影。 */
export interface FlowMeterNode {
  id: string;
  dis: string;
  medium?: string;
  role?: string;
  parentId?: string;
  isVirtual: boolean;
  isGap: boolean;
}

/** emLedgerAggregate dim="meter" 一行的最小投影。 */
export interface FlowMeterTotal {
  id: string;
  val?: number;
  unit?: string;
}

/** 供给 recharts <Sankey> 的节点。fill 必须挂在数据上（recharts 约定）。 */
export interface FlowSankeyNode {
  name: string;
  medium?: string;
  fill: string;
  /** 缺口汇点标记（tooltip 展示名不同）。 */
  gapSink?: boolean;
}

export interface FlowSankeyLink {
  /** recharts 要求 source/target 是节点数组下标。 */
  source: number;
  target: number;
  value: number;
}

export interface FlowGraph {
  nodes: FlowSankeyNode[];
  links: FlowSankeyLink[];
  /** 缺口表合计（汇入不明用能汇点的总量）。 */
  gapValue: number;
  /** 被过滤掉的边数：自环 / 悬挂父引用 / 非正值。 */
  skippedLinks: number;
  /** 显示用单位（取第一条带单位的合计）。 */
  unit?: string;
}

/** 介质配色。与堆叠图不同，Sankey 的 fill 必须挂在数据节点上。 */
export const MEDIUM_COLOR: Record<string, string> = {
  elec: "#F0B429",
  water: "#2AA7DF",
  gas: "#E2703A",
  steam: "#8B9DAF",
  heat: "#D6455B",
  cool: "#3E7CB1",
  diesel: "#6B5B95",
  coal: "#4A4A4A",
  hydrogen: "#57C7B5",
};

const DEFAULT_COLOR = "#9AA6B2";

/** 缺口汇点固定色 —— 中性灰，不与任何介质撞色。 */
export const GAP_SINK_COLOR = "#B0B7BF";

/**
 * 计量树行 + 台账合计 → recharts Sankey {nodes, links}。
 *
 * 规则：
 *   1. 缺口表（isGap）不作为节点出现 —— 它的台账产出汇入「不明用能」汇点；
 *      缺口表按 submeterOf 挂在源表下，若画成父子边，父表的流出会被缺口
 *      重复计入，流向图就画成了平衡表。
 *   2. 边取 submeterOf 父子关系，值 = 子表台账合计。
 *   3. 自环（parent == 自身）与悬挂父引用（父不在节点集里）跳过并计数 ——
 *      后端 builder 已就地剪断，这里是前端防御。
 *   4. 子表合计缺失或 <= 0 的边不画（没有宽度的流只会干扰读图）。
 *   5. 空输入返回空图，不抛错（调用方负责空态引导）。
 */
export function buildSankey(
  meters: FlowMeterNode[],
  totals: FlowMeterTotal[],
  gapSinkName: string
): FlowGraph {
  const empty: FlowGraph = { nodes: [], links: [], gapValue: 0, skippedLinks: 0, unit: undefined };
  if (meters.length === 0) return empty;

  const totalById = new Map<string, FlowMeterTotal>();
  let unit: string | undefined;
  for (const t of totals) {
    totalById.set(t.id, t);
    if (unit === undefined && t.unit) unit = t.unit;
  }

  const nodes: FlowSankeyNode[] = [];
  const indexById = new Map<string, number>();
  let skipped = 0;
  let gapValue = 0;

  // 第一遍：普通表计节点（缺口表跳过）。
  for (const m of meters) {
    if (m.isGap) {
      const t = totalById.get(m.id);
      if (t?.val != null && t.val > 0) gapValue += t.val;
      continue;
    }
    if (indexById.has(m.id)) continue; // 防御：后端不应给重复 id
    indexById.set(m.id, nodes.length);
    nodes.push({
      name: m.dis || m.id,
      medium: m.medium,
      fill: (m.medium && MEDIUM_COLOR[m.medium]) || DEFAULT_COLOR,
    });
  }

  // 缺口汇点：有缺口产出才出现。
  if (gapValue > 0) {
    indexById.set("__gap__", nodes.length);
    nodes.push({ name: gapSinkName, fill: GAP_SINK_COLOR, gapSink: true });
  }

  // 第二遍：父子边。缺口表的产出从它的源表汇入汇点。
  const links: FlowSankeyLink[] = [];
  for (const m of meters) {
    if (m.isGap) continue;
    const t = totalById.get(m.id);
    if (m.parentId === undefined || m.parentId === "") continue;
    if (m.parentId === m.id) {
      skipped += 1; // 自环
      continue;
    }
    const childIdx = indexById.get(m.id);
    if (childIdx === undefined) continue;
    const val = t?.val;
    if (val === undefined || val <= 0) {
      skipped += 1; // 无值/零值：画不出宽度的流
      continue;
    }
    const parentIdx = indexById.get(m.parentId);
    if (parentIdx === undefined) {
      skipped += 1; // 悬挂父引用
      continue;
    }
    links.push({ source: parentIdx, target: childIdx, value: val });
  }

  // 缺口边：源表 → 不明用能（值=缺口表产出）。
  if (gapValue > 0) {
    const sinkIdx = indexById.get("__gap__")!;
    for (const m of meters) {
      if (!m.isGap) continue;
      const srcIdx = m.parentId !== undefined ? indexById.get(m.parentId) : undefined;
      const t = totalById.get(m.id);
      if (srcIdx !== undefined && t?.val != null && t.val > 0) {
        links.push({ source: srcIdx, target: sinkIdx, value: t.val });
      }
    }
  }

  return { nodes, links, gapValue, skippedLinks: skipped, unit };
}
