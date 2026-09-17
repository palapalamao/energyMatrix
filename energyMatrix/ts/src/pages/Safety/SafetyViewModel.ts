import { makeObservable, observable, runInAction } from "mobx";
import type { HClient, HDict } from "@/api/client";
import { BaseStore } from "@/mvvm/base/BaseStore";
import { BaseViewModel } from "@/mvvm/base/BaseViewModel";
import {
  emAnomalies,
  emHisReadToday,
  emSafetyItPanels,
  emSafetyMeters,
  emSafetyPoints,
  emSafetySpaces,
  id as recId,
  num,
  ref as refOf,
  str,
  unitOf,
  type EmHisSample,
} from "@/api/emApi";
import {
  SAFETY_TH,
  classifyPoint,
  overLevel,
  underLevel,
  voltLevel,
  worstLevel,
  type SafetyLevel,
  type SafetyPointKind,
} from "./safetyFormat";
import { ANOMALY_STATUS_DIS, SEVERITY_DIS, SEVERITY_TONE } from "@/pages/shared";
import type { Tone } from "@/components/Bits";

/**
 * 电气安全监测屏（/safety，需求 7.3，V0.1.3）的 Store + ViewModel。
 *
 * 取数（详细设计 4.4 / 5.4 数据契约，后端接口零新增，全部只读）：
 *   回路/柜/馈线结构  readAll（与 EmMeterTree.readMeters 同源的全记录，
 *                     医疗场所筛选要用表上的 emSpaceRef）
 *   监测点位          readAll(point and … and 安全 marker 组)
 *   监测量            hisRead 宽表批量取今日序列（曲线 = 全天序列，
 *                     实时值 = 点位 curVal，缺则回退曲线末样本）
 *   暂降/越限闭环      域 11 既有 emAnomalies（→ EmWorkOrder 工单）
 *
 * 红线：只监测不控制，本屏没有任何写操作；监测数据不产生 L2 台账口径。
 */

export type SafetyTab = "load" | "it" | "pq" | "fire";

/** 曲线按「站点 + 日」缓存 5 分钟（设计 5.4 约定）。 */
const CURVE_TTL = 5 * 60_000;

export class SafetyStore extends BaseStore {
  private client?: HClient;
  private siteRef: string | undefined;
  private curveLoadedAt = 0;

  meters: HDict[] = [];
  spaces: HDict[] = [];
  points: HDict[] = [];
  panels: HDict[] = [];
  anomalies: HDict[] = [];
  /** 点位 ref → 今日 his 序列。 */
  curves: Record<string, EmHisSample[]> = {};
  loading = false;
  error: string | undefined = undefined;
  /** 当前子视图与筛选（页签状态在 VM，深链进来可预设）。 */
  tab: SafetyTab = "load";
  placeFilter = "all";
  feederFilter = "all";

  constructor() {
    super();
    makeObservable(this, {
      meters: observable,
      spaces: observable,
      points: observable,
      panels: observable,
      anomalies: observable,
      curves: observable,
      loading: observable,
      error: observable,
      tab: observable,
      placeFilter: observable,
      feederFilter: observable,
    });
  }

  override initialize(client: HClient): void {
    this.client = client;
    this.initialized = true;
  }

  /** 结构 + 点位 + 告警一次取齐，再批量取曲线。 */
  async load(siteRef: string): Promise<void> {
    const client = this.client;
    if (!client) return;
    this.siteRef = siteRef;
    runInAction(() => {
      this.loading = true;
      this.error = undefined;
    });
    try {
      const [meters, spaces, points, panels, anomalies] = await Promise.all([
        emSafetyMeters(client, siteRef),
        emSafetySpaces(client, siteRef),
        emSafetyPoints(client, siteRef),
        emSafetyItPanels(client, siteRef),
        emAnomalies(client, siteRef),
      ]);
      runInAction(() => {
        this.meters = meters;
        this.spaces = spaces;
        this.points = points;
        this.panels = panels;
        this.anomalies = anomalies;
      });
      await this.fetchCurves();
    } catch (e: unknown) {
      runInAction(() => {
        this.error = e instanceof Error ? e.message : String(e);
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  /**
   * 30 秒轮询（仅告警相关视图）：刷新点位实时值与异常列表；
   * 曲线超过 5 分钟才重取（设计 5.4：曲线按「站点+对象+日」缓存）。
   */
  async refresh(): Promise<void> {
    const client = this.client;
    const siteRef = this.siteRef;
    if (!client || !siteRef) return;
    try {
      const [points, anomalies] = await Promise.all([
        emSafetyPoints(client, siteRef),
        emAnomalies(client, siteRef),
      ]);
      runInAction(() => {
        this.points = points;
        this.anomalies = anomalies;
      });
      if (Date.now() - this.curveLoadedAt > CURVE_TTL) {
        await this.fetchCurves();
      }
    } catch {
      // 轮询失败不覆盖页面 —— 上一轮数据继续显示，下一次轮询再试
    }
  }

  /** 需要曲线的点位：重点负荷的功率点 + 绝缘点 + THDV 点。 */
  private curveRefs(): string[] {
    const byEquip = this.groupByEquip();
    const refs: string[] = [];
    for (const meter of this.meters) {
      const mid = recId(meter);
      if (!mid) continue;
      const byKind = byEquip.get(mid);
      if (!byKind) continue;
      // 重点负荷卡片：有电压监测的回路才画功率曲线
      if (byKind.has("volt")) {
        const p = byKind.get("power");
        if (p) refs.push(recId(p) ?? "");
      }
    }
    for (const p of this.points) {
      const kind = classifyPoint(tagNames(p));
      if (kind === "insulation" || kind === "thdV") refs.push(recId(p) ?? "");
    }
    return refs.filter((r) => r !== "");
  }

  private async fetchCurves(): Promise<void> {
    const client = this.client;
    if (!client) return;
    const refs = this.curveRefs();
    try {
      const curves = await emHisReadToday(client, refs);
      runInAction(() => {
        this.curves = curves;
        this.curveLoadedAt = Date.now();
      });
    } catch (e: unknown) {
      // 曲线取不到不拖垮整页 —— 卡片上曲线区显示「—」，实时值仍走 curVal
      runInAction(() => {
        this.curves = {};
        this.curveLoadedAt = Date.now();
      });
    }
  }

  /** 点位按 equipRef 分组再按类归并。 */
  private groupByEquip(): Map<string, Map<SafetyPointKind, HDict>> {
    const map = new Map<string, Map<SafetyPointKind, HDict>>();
    for (const p of this.points) {
      const equip = refOf(p, "equipRef");
      if (!equip) continue;
      const kind = classifyPoint(tagNames(p));
      if (kind === "other") continue;
      if (!map.has(equip)) map.set(equip, new Map());
      // 同类多点（如三相电压）取第一个 —— 监测卡展示单值，明细去看实时屏
      if (!map.get(equip)!.has(kind)) map.get(equip)!.set(kind, p);
    }
    return map;
  }
}

/** 点位的 marker 名列表（classifyPoint 的输入）。 */
function tagNames(p: HDict): string[] {
  return p.keys.filter((k) => {
    const v = p.get(k);
    return v !== null && v !== undefined && typeof v.toJSON === "function" && v.toJSON() === null;
  });
}

// ──────────────────────────────────────────────────────────────────────────
// 展示行（ViewModel 派生，全部只读）
// ──────────────────────────────────────────────────────────────────────────

export interface MetricVal {
  val?: number;
  unit?: string;
  level: SafetyLevel | undefined;
}

export interface CircuitRow {
  id: string;
  name: string;
  place?: string;
  volt: MetricVal;
  current: MetricVal;
  power: MetricVal;
  temp: MetricVal;
  kwCurve: EmHisSample[];
  level: SafetyLevel;
}

export interface ItPanelRow {
  id: string;
  name: string;
  loc?: string;
  /** 预警边界（kΩ）= 柜上 emIrAlarmThreshold（可配，默认 50 Ω/V 惯例值）。 */
  irWarnAt: number;
  /** 告警带（kΩ）= 预警边界 × 0.6（沿用 30/50 的 Demo 比例）。 */
  irAlarmAt: number;
  ir: MetricVal;
  load: MetricVal;
  windingTemp: MetricVal;
  sysVolt?: number;
  irCurve: EmHisSample[];
  level: SafetyLevel;
}

export interface FeederRow {
  id: string;
  name: string;
  place?: string;
  thdV: MetricVal;
  thdI: MetricVal;
  unb: MetricVal;
  thdVCurve: EmHisSample[];
  level: SafetyLevel;
}

export interface FireRow {
  id: string;
  name: string;
  temp: MetricVal;
  leak: MetricVal;
  level: SafetyLevel;
}

export interface SagEventRow {
  id: string;
  ts?: string;
  subject?: string;
  severity?: string;
  severityDis: string;
  severityTone: Tone;
  status: string;
  statusDis: string;
}

export class SafetyViewModel extends BaseViewModel<SafetyStore> {
  get loading(): boolean {
    return this.store.loading;
  }
  get error(): string | undefined {
    return this.store.error;
  }

  load(siteRef: string): void {
    void this.store.load(siteRef);
  }
  refresh(): void {
    void this.store.refresh();
  }

  get tab(): SafetyTab {
    return this.store.tab;
  }
  setTab(t: SafetyTab): void {
    runInAction(() => {
      this.store.tab = t;
    });
  }
  get placeFilter(): string {
    return this.store.placeFilter;
  }
  setPlace(f: string): void {
    runInAction(() => {
      this.store.placeFilter = f;
    });
  }

  // ── 通用派生 ──────────────────────────────────────────────────────────

  private spaceDisByRef = new Map<string, string>();

  private spaceDis(ref?: string): string | undefined {
    if (!ref) return undefined;
    if (this.spaceDisByRef.size === 0) {
      for (const s of this.store.spaces) this.spaceDisByRef.set(recId(s) ?? "", str(s, "dis") ?? "");
    }
    return this.spaceDisByRef.get(ref) ?? undefined;
  }

  /** 点位实时值：curVal 优先，缺则回退曲线末样本（his 直读口径）。 */
  private liveVal(p: HDict | undefined): number | undefined {
    if (!p) return undefined;
    const cur = num(p, "curVal");
    if (cur !== undefined) return cur;
    const pid = recId(p);
    if (!pid) return undefined;
    const samples = this.store.curves[pid];
    if (!samples || samples.length === 0) return undefined;
    return samples[samples.length - 1].val;
  }


  private byEquipKind(): Map<string, Map<SafetyPointKind, HDict>> {
    const map = new Map<string, Map<SafetyPointKind, HDict>>();
    for (const p of this.store.points) {
      const equip = refOf(p, "equipRef");
      if (!equip) continue;
      const kind = classifyPoint(tagNames(p));
      if (kind === "other") continue;
      if (!map.has(equip)) map.set(equip, new Map());
      if (!map.get(equip)!.has(kind)) map.get(equip)!.set(kind, p);
    }
    return map;
  }

  private meterName(m: HDict): string {
    return str(m, "dis") ?? str(m, "navName") ?? (recId(m) ?? "");
  }

  // ── 子视图 1：重点负荷实时监控（7.3.1） ────────────────────────────────

  get circuits(): CircuitRow[] {
    const byEquip = this.byEquipKind();
    const rows: CircuitRow[] = [];
    for (const m of this.store.meters) {
      const mid = recId(m);
      if (!mid) continue;
      const byKind = byEquip.get(mid);
      if (!byKind?.has("volt")) continue; // 重点负荷 = 有一级负荷电压监测的回路
      const voltP = byKind.get("volt");
      const tempP = byKind.get("temp");
      const powerP = byKind.get("power");
      const volt = this.liveVal(voltP);
      const temp = this.liveVal(tempP);
      rows.push({
        id: mid,
        name: this.meterName(m),
        place: this.spaceDis(refOf(m, "emSpaceRef")),
        volt: { val: volt, unit: unitOfPoint(voltP), level: voltLevel(volt) },
        current: {
          val: this.liveVal(byKind.get("current")),
          unit: unitOfPoint(byKind.get("current")),
          level: undefined, // 电流无越限口径，只展示
        },
        power: {
          val: this.liveVal(powerP),
          unit: unitOfPoint(powerP),
          level: undefined,
        },
        temp: {
          val: temp,
          unit: unitOfPoint(tempP),
          level: overLevel(temp, SAFETY_TH.tempWarn, SAFETY_TH.tempAlarm),
        },
        kwCurve: powerP ? (this.store.curves[recId(powerP) ?? ""] ?? []) : [],
        level: worstLevel(voltLevel(volt), overLevel(temp, SAFETY_TH.tempWarn, SAFETY_TH.tempAlarm)),
      });
    }
    return rows;
  }

  get places(): string[] {
    const set = new Set<string>();
    for (const r of this.circuits) if (r.place) set.add(r.place);
    return [...set];
  }

  get circuitsFiltered(): CircuitRow[] {
    const f = this.store.placeFilter;
    return this.circuits.filter((r) => f === "all" || r.place === f);
  }

  // ── 子视图 2：IT 隔离电源绝缘监测（7.3.2） ─────────────────────────────

  get itPanels(): ItPanelRow[] {
    const byEquip = this.byEquipKind();
    const rows: ItPanelRow[] = [];
    for (const panel of this.store.panels) {
      const pid = recId(panel);
      if (!pid) continue;
      const byKind = byEquip.get(pid);
      const irP = byKind?.get("insulation");
      // 柜下没挂绝缘点的（点位未建）也要列出 —— 一眼看见配置缺口。
      // emIrAlarmThreshold 语义 = 「告警关注阈值」（IEC 50 Ω/V 惯例值，
      // 即预警边界 50 kΩ）；告警带 = 0.6 × 阈值（沿用 30/50 的 Demo 比例）。
      const warnAt = num(panel, "emIrAlarmThreshold") ?? SAFETY_TH.irWarn;
      const alarmAt = warnAt * 0.6;
      const ir = this.liveVal(irP);
      const loadP = byKind?.get("current");
      const tempP = byKind?.get("temp");
      const load = this.liveVal(loadP);
      const winding = this.liveVal(tempP);
      rows.push({
        id: pid,
        name: str(panel, "dis") ?? str(panel, "navName") ?? pid,
        loc: this.spaceDis(refOf(panel, "emSpaceRef")),
        irAlarmAt: alarmAt,
        irWarnAt: warnAt,
        ir: { val: ir, unit: unitOfPoint(irP), level: underLevel(ir, warnAt, alarmAt) },
        load: { val: load, unit: unitOfPoint(loadP), level: undefined },
        windingTemp: {
          val: winding,
          unit: unitOfPoint(tempP),
          level: overLevel(winding, SAFETY_TH.tempWarn, SAFETY_TH.tempAlarm),
        },
        sysVolt: num(panel, "emSystemVolt"),
        irCurve: irP ? (this.store.curves[recId(irP) ?? ""] ?? []) : [],
        level: worstLevel(underLevel(ir, warnAt, alarmAt)),
      });
    }
    return rows;
  }

  // ── 子视图 3：电能质量分析（7.3.3） ────────────────────────────────────

  get feeders(): FeederRow[] {
    const byEquip = this.byEquipKind();
    const rows: FeederRow[] = [];
    for (const m of this.store.meters) {
      const mid = recId(m);
      if (!mid) continue;
      const byKind = byEquip.get(mid);
      if (!byKind?.has("thdV")) continue; // 馈线 = 挂 THD 监测的回路
      const thdVP = byKind.get("thdV");
      const thdIP = byKind.get("thdI");
      const unbP = byKind.get("unbalance");
      const thdV = this.liveVal(thdVP);
      const thdI = this.liveVal(thdIP);
      const unb = this.liveVal(unbP);
      rows.push({
        id: mid,
        name: this.meterName(m),
        place: this.spaceDis(refOf(m, "emSpaceRef")),
        thdV: {
          val: thdV,
          unit: unitOfPoint(thdVP),
          level: overLevel(thdV, SAFETY_TH.thdV, Number.POSITIVE_INFINITY),
        },
        thdI: {
          val: thdI,
          unit: unitOfPoint(thdIP),
          level: overLevel(thdI, SAFETY_TH.thdI, Number.POSITIVE_INFINITY),
        },
        unb: {
          val: unb,
          unit: unitOfPoint(unbP),
          level: overLevel(unb, SAFETY_TH.unb, Number.POSITIVE_INFINITY),
        },
        thdVCurve: thdVP ? (this.store.curves[recId(thdVP) ?? ""] ?? []) : [],
        level: worstLevel(
          overLevel(thdV, SAFETY_TH.thdV, Number.POSITIVE_INFINITY),
          overLevel(thdI, SAFETY_TH.thdI, Number.POSITIVE_INFINITY),
          overLevel(unb, SAFETY_TH.unb, Number.POSITIVE_INFINITY)
        ),
      });
    }
    return rows;
  }

  /** 电能质量馈线的医疗场所（筛选 chips 数据源）。 */
  get feederPlaces(): string[] {
    const set = new Set<string>();
    for (const r of this.feeders) if (r.place) set.add(r.place);
    return [...set];
  }

  get feederFilter(): string {
    return this.store.feederFilter;
  }
  setFeeder(f: string): void {
    runInAction(() => {
      this.store.feederFilter = f;
    });
  }

  get feedersFiltered(): FeederRow[] {
    const f = this.store.feederFilter;
    return this.feeders.filter((r) => f === "all" || r.place === f);
  }

  /** 暂降/越限事件：域 11 异常列表（his 留痕 + 事件闭环双轨的事件侧）。 */
  get sagEvents(): SagEventRow[] {
    return this.store.anomalies
      .map((d) => {
        const sev = str(d, "emSeverity") ?? "info";
        const st = str(d, "emAnomalyStatus") ?? "open";
        return {
          id: recId(d) ?? "",
          ts: str(d, "ts"),
          subject: str(d, "emSubjectDis"),
          severity: sev,
          severityDis: SEVERITY_DIS[sev] ?? sev,
          severityTone: SEVERITY_TONE[sev] ?? "neutral",
          status: st,
          statusDis: ANOMALY_STATUS_DIS[st] ?? st,
        };
      })
      .sort((a, b) => (b.ts ?? "").localeCompare(a.ts ?? ""))
      .slice(0, 20);
  }

  // ── 子视图 4：电气火灾预警（7.3.4） ────────────────────────────────────

  get fireRows(): FireRow[] {
    const byEquip = this.byEquipKind();
    const rows: FireRow[] = [];
    for (const m of this.store.meters) {
      const mid = recId(m);
      if (!mid) continue;
      const byKind = byEquip.get(mid);
      if (!byKind?.has("temp") && !byKind?.has("leak")) continue;
      const tempP = byKind?.get("temp");
      const leakP = byKind?.get("leak");
      const temp = this.liveVal(tempP);
      const leak = this.liveVal(leakP);
      rows.push({
        id: mid,
        name: this.meterName(m),
        temp: {
          val: temp,
          unit: unitOfPoint(tempP),
          level: overLevel(temp, SAFETY_TH.tempWarn, SAFETY_TH.tempAlarm),
        },
        leak: {
          val: leak,
          unit: unitOfPoint(leakP),
          level: overLevel(leak, SAFETY_TH.leakWarn, SAFETY_TH.leakAlarm),
        },
        level: worstLevel(
          overLevel(temp, SAFETY_TH.tempWarn, SAFETY_TH.tempAlarm),
          overLevel(leak, SAFETY_TH.leakWarn, SAFETY_TH.leakAlarm)
        ),
      });
    }
    return rows;
  }

  // ── 汇总统计（各子视图顶部计数卡） ────────────────────────────────────

  countBy(rows: { level: SafetyLevel }[]): { alarm: number; warn: number; total: number } {
    return {
      total: rows.length,
      alarm: rows.filter((r) => r.level === "alarm").length,
      warn: rows.filter((r) => r.level === "warn").length,
    };
  }

  get hasAnyPoints(): boolean {
    return this.store.points.length > 0;
  }
}

/** 点位单位：curVal 上的单位（从数据读，不硬编 —— 同 emApi.unitOf 口径）。 */
function unitOfPoint(p: HDict | undefined): string | undefined {
  if (!p) return undefined;
  return unitOf(p, "curVal");
}