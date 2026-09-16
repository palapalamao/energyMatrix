import { makeObservable, observable, runInAction } from "mobx";
import type { HClient, HDict, HGrid } from "@/api/client";
import { BaseStore } from "@/mvvm/base/BaseStore";
import { BaseViewModel } from "@/mvvm/base/BaseViewModel";
import {
  emAnomalies,
  emCarbonNet,
  emClosePeriods,
  emCoalEquivalent,
  emKpiComputeAll,
  emLedgerAggregate,
  emLedgerCrosstab,
  emLedgerSourceMix,
  emQuotaProgressAll,
  emSavingsProjects,
  emSiteGapRatio,
  dt,
  has,
  id as recId,
  lastYearSpan,
  num,
  prevSpan,
  ref,
  rows as gridRows,
  spanDays,
  str,
  unitOf,
  type EmSpan,
} from "@/api/emApi";
import {
  MEDIUM_DIS,
  MEDIUM_ORDER,
  SEVERITY_DIS,
  SEVERITY_TONE,
  SOURCE_DIS,
  SUBITEM_DIS,
  SUBITEM_GROUP_COLOR,
  SUBITEM_GROUP_DIS,
  fmtNum,
  fmtPct,
  fmtTs,
  subItemColor,
} from "@/pages/shared";
import type { Tone } from "@/components/Bits";

/**
 * 能源总览驾驶舱（设计稿版式 A · 指标优先）。
 *
 * **整屏没有一个数字是前端算出来的口径**——每一块都对应一个后端函数：
 *
 *   综合能耗(tce)  emCoalEquivalent      Σ(用量 × emCoalFactor)
 *   各介质用量      emLedgerAggregate(medium)
 *   环比 / 同比     同上，换一个账期再取一次
 *   分项堆叠趋势    emLedgerCrosstab(period × subItem)
 *   数据可信度      emLedgerSourceMix
 *   缺口率          emSiteGapRatio
 *   定额进度        emQuotaProgressAll
 *   EUI            emKpiComputeAll("EUI_TOTAL")
 *   净碳排          emCarbonNet
 *   待处理告警      emAnomalies
 *
 * 前端只做**除法与排序**（占比、名次），口径全在后端 —— 一旦总览自己算一套，
 * 它和报表就会在某个月对不上，而且没人说得清哪边对。
 *
 * ## 取数分两层
 *
 * **核心块**（台账相关）任一失败 → 整页报错。总览的主张是"这些数字互相自洽"，
 * 上半页真下半页假比整页报错更难排查。
 *
 * **旁挂块**（指标 / 碳排 / 定额 / 告警 / 节能 / 关账）逐个 try —— 它们依赖
 * 各自的配置（指标定义、排放因子、定额记录），缺一个不该让总览打不开，
 * 那一格显示「—」并带上原因。
 */

/** 旁挂块的取数外壳：失败不抛，返回 undefined 并记下原因。 */
async function safe<T>(fn: () => Promise<T>): Promise<{ v?: T; err?: string }> {
  try {
    return { v: await fn() };
  } catch (e: unknown) {
    return { err: e instanceof Error ? e.message : String(e) };
  }
}

export class OverviewStore extends BaseStore {
  private client: HClient | undefined = undefined;

  // ── 核心块 ──────────────────────────────────────────────────────
  // 每个 observable 字段都必须带初始化器（哪怕是 `= undefined`）。
  // tsconfig 里 useDefineForClassFields=false（装饰器需要），此时 TS **不会**
  // 为"只有类型声明、没有初始化器"的字段生成任何赋值 —— 属性在实例上根本不存在，
  // makeObservable 就会抛 "[MobX] minified error nr: 1 … Cannot decorate undefined property"。
  byMedium: HDict[] = [];
  byMediumPrev: HDict[] = [];
  byMediumLastYear: HDict[] = [];
  bySubItem: HDict[] = [];
  trend: HGrid | undefined = undefined;
  sourceMix: HDict[] = [];
  gapRatio: number | undefined = undefined;

  // ── 旁挂块 ──────────────────────────────────────────────────────
  coal: HGrid | undefined = undefined;
  quotas: HDict[] = [];
  anomalies: HDict[] = [];
  savings: HDict[] = [];
  batches: HDict[] = [];
  eui: number | undefined = undefined;
  euiErr: string | undefined = undefined;
  carbonNet: number | undefined = undefined;
  carbonErr: string | undefined = undefined;

  loading = false;
  error: string | undefined = undefined;

  constructor() {
    super();
    // MobX 6 不支持在子类上用 makeAutoObservable，必须显式标注。
    makeObservable(this, {
      byMedium: observable,
      byMediumPrev: observable,
      byMediumLastYear: observable,
      bySubItem: observable,
      trend: observable,
      sourceMix: observable,
      gapRatio: observable,
      coal: observable,
      quotas: observable,
      anomalies: observable,
      savings: observable,
      batches: observable,
      eui: observable,
      euiErr: observable,
      carbonNet: observable,
      carbonErr: observable,
      loading: observable,
      error: observable,
    });
  }

  override initialize(client: HClient): void {
    this.client = client;
    this.initialized = true;
  }

  async load(siteRef: string, span: EmSpan): Promise<void> {
    const client = this.client;
    if (!client) return;

    runInAction(() => {
      this.loading = true;
      this.error = undefined;
    });

    try {
      const prev = prevSpan(span);
      const ly = lastYearSpan(span);

      const [byMedium, byMediumPrev, byMediumLastYear, bySubItem, trend, sourceMix, gapRatio] =
        await Promise.all([
          emLedgerAggregate(client, siteRef, span, "medium"),
          emLedgerAggregate(client, siteRef, prev, "medium"),
          emLedgerAggregate(client, siteRef, ly, "medium"),
          emLedgerAggregate(client, siteRef, span, "subItem", "elec"),
          emLedgerCrosstab(client, siteRef, span, "period", "subItem", "elec"),
          emLedgerSourceMix(client, siteRef, span),
          emSiteGapRatio(client, siteRef, span),
        ]);

      runInAction(() => {
        this.byMedium = byMedium;
        this.byMediumPrev = byMediumPrev;
        this.byMediumLastYear = byMediumLastYear;
        this.bySubItem = bySubItem;
        this.trend = trend;
        this.sourceMix = sourceMix;
        this.gapRatio = gapRatio;
      });

      const [coal, quotas, anomalies, savings, batches, eui, carbon] = await Promise.all([
        safe(() => emCoalEquivalent(client, siteRef, span)),
        safe(() => emQuotaProgressAll(client, siteRef, span)),
        safe(() => emAnomalies(client, siteRef, "open")),
        safe(() => emSavingsProjects(client, siteRef)),
        safe(() => emClosePeriods(client, siteRef)),
        safe(() => emKpiComputeAll(client, "EUI_TOTAL", [siteRef], span)),
        safe(() => emCarbonNet(client, siteRef, span)),
      ]);

      runInAction(() => {
        this.coal = coal.v;
        this.quotas = quotas.v ?? [];
        this.anomalies = anomalies.v ?? [];
        this.savings = savings.v ?? [];
        this.batches = batches.v ?? [];
        this.eui = eui.v?.[0] ? num(eui.v[0], "val") : undefined;
        this.euiErr = eui.err ?? (eui.v?.[0] ? str(eui.v[0], "err") : "指标 EUI_TOTAL 未定义");
        this.carbonNet = carbon.v;
        this.carbonErr = carbon.err;
      });
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
}

/** 数据来源等级的展示顺序：可信度从高到低。 */
export const SOURCE_ORDER = ["measured", "derived", "allocated", "manual", "estimated"];

export interface MediumCard {
  medium: string;
  dis: string;
  val?: number;
  unit?: string;
  /** 环比：与紧邻其前的等长账期相比。 */
  mom?: number;
  /** 同比：与去年同期相比；没有历史数据时为 undefined。 */
  yoy?: number;
  entries?: number;
  qualityMin?: number;
  /** 该介质的定额进度（若配了定额）。 */
  quotaRatio?: number;
  quotaLevel?: string;
}

export interface SourceRow {
  source: string;
  dis: string;
  val?: number;
  ratio?: number;
  entries?: number;
  /** 估算数据既不可结算也不可披露（说明书表 5-1），UI 要单独标出来。 */
  restricted: boolean;
}

export interface SubItemRow {
  code: string;
  group: string;
  dis: string;
  color: string;
  val?: number;
  ratio: number;
}

export interface AlarmRow {
  id: string;
  dis: string;
  severityDis: string;
  severityTone: Tone;
  subjectDis?: string;
  ts?: string;
}

export class OverviewViewModel extends BaseViewModel<OverviewStore> {
  get loading(): boolean {
    return this.store.loading;
  }
  get error(): string | undefined {
    return this.store.error;
  }

  load(siteRef: string, span: EmSpan): void {
    void this.store.load(siteRef, span);
  }

  // ── 头卡：综合能耗（折标煤）─────────────────────────────────────

  /** 合计在 **meta** 上 —— rows 是逐介质明细，读 rows[0] 会拿到"电"的数当全楼。 */
  get coalTotal(): number | undefined {
    const m = this.store.coal?.meta;
    return m ? num(m, "val") : undefined;
  }

  /**
   * 没有折标煤系数、因而**未计入**综合能耗的介质。
   * 水本来就不计入，和"某介质参数没录"在数字上是同一个结果 —— 必须列出来。
   */
  get coalMissing(): string[] {
    const m = this.store.coal?.meta;
    const s = m ? str(m, "emMissing") : undefined;
    if (!s) return [];
    return s.split(",").filter(Boolean).map((m) => MEDIUM_DIS[m] ?? m);
  }

  get coalDetail(): { medium: string; dis: string; factor?: number; tce?: number }[] {
    const g = this.store.coal;
    if (!g) return [];
    return gridRows(g).map((d) => {
      const m = str(d, "emMedium") ?? "?";
      return {
        medium: m,
        dis: MEDIUM_DIS[m] ?? m,
        factor: num(d, "emCoalFactor"),
        tce: num(d, "val"),
      };
    });
  }

  // ── 各介质卡 ────────────────────────────────────────────────────

  private mediumVal(list: HDict[], medium: string): number | undefined {
    const row = list.find((d) => str(d, "medium") === medium);
    return row ? num(row, "val") : undefined;
  }

  /** 增长率。分母缺失或为 0 时返回 undefined —— 不拿 0 当基数，那会得到 ∞。 */
  private growth(cur?: number, base?: number): number | undefined {
    if (cur === undefined || base === undefined || base === 0) return undefined;
    return (cur - base) / base;
  }

  get mediumCards(): MediumCard[] {
    const quotaByMedium: Record<string, HDict> = {};
    this.store.quotas.forEach((q) => {
      const m = str(q, "emMedium");
      if (m) quotaByMedium[m] = q;
    });

    return this.store.byMedium
      .map((d) => {
        const m = str(d, "medium") ?? "?";
        const cur = num(d, "val");
        const q = quotaByMedium[m];
        return {
          medium: m,
          dis: MEDIUM_DIS[m] ?? m,
          val: cur,
          unit: unitOf(d, "val"),
          mom: this.growth(cur, this.mediumVal(this.store.byMediumPrev, m)),
          yoy: this.growth(cur, this.mediumVal(this.store.byMediumLastYear, m)),
          entries: num(d, "emEntryCount"),
          qualityMin: num(d, "emQualityMin"),
          quotaRatio: q ? num(q, "ratio") : undefined,
          quotaLevel: q ? str(q, "level") : undefined,
        };
      })
      .sort((a, b) => {
        // 固定顺序，不按用量排 —— 卡片位置每期都变，看板上的人会找不到
        const ia = MEDIUM_ORDER.indexOf(a.medium);
        const ib = MEDIUM_ORDER.indexOf(b.medium);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      });
  }

  /** 去年同期整体没有台账时，同比列一律显示「—」并说明原因。 */
  get hasLastYear(): boolean {
    return this.store.byMediumLastYear.length > 0;
  }

  // ── 分项堆叠趋势 ────────────────────────────────────────────────

  /** 堆叠图的段。按后端给的 `emCols` 顺序（合计降序），占比大的落柱底。 */
  get trendSeries(): { key: string; label: string; color: string }[] {
    const g = this.store.trend;
    if (!g) return [];
    const cols = str(g.meta, "emCols");
    if (!cols) return [];
    return cols
      .split(",")
      .filter(Boolean)
      .map((code) => ({
        key: code,
        label: SUBITEM_DIS[code] ?? code,
        color: subItemColor(code),
      }));
  }

  get trendRows(): {
    label: string;
    values: Record<string, number | undefined>;
    total: number;
  }[] {
    const g = this.store.trend;
    if (!g) return [];
    const series = this.trendSeries;
    return gridRows(g).map((d) => {
      const values: Record<string, number | undefined> = {};
      series.forEach((s) => {
        values[s.key] = num(d, s.key);
      });
      return {
        // 账期码形如 D-20260901，只留 MM-DD 当刻度
        label: (str(d, "period") ?? "").replace(/^D-\d{4}/, "").replace(/^(\d{2})(\d{2})$/, "$1-$2"),
        values,
        total: num(d, "val") ?? 0,
      };
    });
  }

  get trendStats(): { avg?: number; max?: number; maxAt?: string; days: number } {
    const rows = this.trendRows;
    if (rows.length === 0) return { days: 0 };
    const vals = rows.map((r) => r.total);
    const max = Math.max(...vals);
    return {
      avg: vals.reduce((a, b) => a + b, 0) / vals.length,
      max,
      maxAt: rows.find((r) => r.total === max)?.label,
      days: rows.length,
    };
  }

  // ── 分项拆解 ────────────────────────────────────────────────────

  get subItemRows(): SubItemRow[] {
    const raw = this.store.bySubItem
      .map((d) => {
        const code = str(d, "subItem") ?? "";
        return {
          code,
          group: code.slice(0, 1).toUpperCase(),
          dis: SUBITEM_DIS[code] ?? code,
          color: subItemColor(code),
          val: num(d, "val"),
        };
      })
      .filter((r) => r.code !== "");
    const total = raw.reduce((s, r) => s + (r.val ?? 0), 0);
    return raw
      .map((r) => ({ ...r, ratio: total > 0 ? (r.val ?? 0) / total : 0 }))
      .sort((a, b) => (b.val ?? 0) - (a.val ?? 0));
  }

  /** 国标一级分组（A/B/C/D）。 */
  get subItemGroups(): {
    group: string;
    dis: string;
    color: string;
    val: number;
    ratio: number;
  }[] {
    const acc: Record<string, number> = {};
    this.subItemRows.forEach((r) => {
      acc[r.group] = (acc[r.group] ?? 0) + (r.val ?? 0);
    });
    const total = Object.values(acc).reduce((a, b) => a + b, 0);
    return Object.entries(acc)
      .map(([group, val]) => ({
        group,
        dis: SUBITEM_GROUP_DIS[group] ?? group,
        color: SUBITEM_GROUP_COLOR[group] ?? "#9AA6B2",
        val,
        ratio: total > 0 ? val / total : 0,
      }))
      .sort((a, b) => a.group.localeCompare(b.group));
  }

  // ── 数据可信度 ──────────────────────────────────────────────────

  get sourceRows(): SourceRow[] {
    const rows = this.store.sourceMix.map((d) => {
      const s = str(d, "emDataSource") ?? "?";
      return {
        source: s,
        dis: SOURCE_DIS[s] ?? s,
        val: num(d, "val"),
        ratio: num(d, "ratio"),
        entries: num(d, "emEntryCount"),
        restricted: s === "estimated",
      };
    });
    return rows.sort(
      (a, b) => SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source)
    );
  }

  /** 可结算比例 = 实测 + 推导 + 分摊。估算与人工录入不计入。 */
  get settleableRatio(): number | undefined {
    if (this.store.sourceMix.length === 0) return undefined;
    return this.sourceRows
      .filter((r) => ["measured", "derived", "allocated"].includes(r.source))
      .reduce((s, r) => s + (r.ratio ?? 0), 0);
  }

  // ── 平衡校核 ────────────────────────────────────────────────────

  get gapRatio(): number | undefined {
    return this.store.gapRatio;
  }

  /** 缺口率的展示等级。阈值默认 5%（说明书 §5.2），预警线取阈值的一半。 */
  get gapLevel(): "ok" | "warn" | "over" {
    const g = this.store.gapRatio;
    if (g === undefined) return "ok";
    const abs = Math.abs(g);
    if (abs > 0.05) return "over";
    if (abs > 0.025) return "warn";
    return "ok";
  }

  // ── 关键指标条 ──────────────────────────────────────────────────

  get eui(): number | undefined {
    return this.store.eui;
  }
  get euiErr(): string | undefined {
    return this.store.eui === undefined ? this.store.euiErr : undefined;
  }
  get carbonNet(): number | undefined {
    return this.store.carbonNet;
  }
  get carbonErr(): string | undefined {
    return this.store.carbonErr;
  }

  /**
   * 已核证节能量。
   * **只累加 `emSavingsVerified`** —— 规划值和实测值不能顶替它上驾驶舱（铁律 10）。
   */
  get verifiedSavings(): number {
    return this.store.savings.reduce((s, p) => s + (num(p, "emSavingsVerified") ?? 0), 0);
  }

  get unverifiedProjects(): number {
    return this.store.savings.filter((p) => str(p, "emVerifyStatus") !== "verified").length;
  }

  /** 最近一个关账批次。 */
  get lastBatch(): { period?: string; closed: boolean; gapRatio?: number } | undefined {
    const b = this.store.batches[0];
    if (!b) return undefined;
    return {
      period: str(b, "emPeriod"),
      closed: has(b, "emClosed") || !!str(b, "emClosedBy"),
      gapRatio: num(b, "emGapRatio"),
    };
  }

  get entryCount(): number {
    return this.store.byMedium.reduce((s, d) => s + (num(d, "emEntryCount") ?? 0), 0);
  }

  // ── 待处理告警 ──────────────────────────────────────────────────

  get openAlarms(): AlarmRow[] {
    return this.store.anomalies.slice(0, 5).map((d) => {
      const sev = str(d, "emSeverity") ?? "info";
      return {
        id: recId(d) ?? "",
        dis: str(d, "dis") ?? "",
        severityDis: SEVERITY_DIS[sev] ?? sev,
        severityTone: SEVERITY_TONE[sev] ?? "neutral",
        subjectDis: str(d, "emSubjectDis") ?? ref(d, "emSubjectRef"),
        ts: dt(d, "ts"),
      };
    });
  }

  get openAlarmCount(): number {
    return this.store.anomalies.length;
  }

  // ── 格式化 ──────────────────────────────────────────────────────

  spanDays = spanDays;
  fmtNum = fmtNum;
  fmtPct = fmtPct;
  fmtTs = fmtTs;
}
