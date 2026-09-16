import { makeObservable, observable, runInAction } from "mobx";
import type { HClient, HDict } from "@/api/client";
import { BaseStore } from "@/mvvm/base/BaseStore";
import { BaseViewModel } from "@/mvvm/base/BaseViewModel";
import {
  emAnomalies,
  emAnomalyAck,
  emAnomalyStats,
  emLedgerAggregate,
  emQuotaProgressAll,
  dt,
  id as recId,
  num,
  str,
  type EmSpan,
} from "@/api/emApi";
import {
  MEDIUM_DIS,
  QUOTA_SOURCE_DIS,
  SEVERITY_DIS,
  SEVERITY_TONE,
  fmtNum,
  fmtPct,
  fmtTs,
} from "@/pages/shared";
import type { Tone } from "@/components/Bits";

/**
 * 移动端速览 —— 三个场景的原型同屏并排。
 *
 * 这一屏在桌面上把三部手机摆在一起，是给交底用的：值班（控制室 / 夜间，
 * 深色）、异常处置（白班巡检，浅色）、能耗速览（管理者，浅色）。
 * 真上手机时各自是一条独立路由，这里只是同一份数据的三种取景。
 *
 * 数据全部复用桌面端的接口 —— 移动端不另开一套后端，否则两边口径迟早分叉。
 */

export class MobileStore extends BaseStore {
  private client: HClient | undefined = undefined;

  byMedium: HDict[] = [];
  byPeriod: HDict[] = [];
  anomalies: HDict[] = [];
  stats: HDict | undefined = undefined;
  quotas: HDict[] = [];
  loading = false;
  error: string | undefined = undefined;
  busyId: string | undefined = undefined;

  constructor() {
    super();
    makeObservable(this, {
      byMedium: observable,
      byPeriod: observable,
      anomalies: observable,
      stats: observable,
      quotas: observable,
      loading: observable,
      error: observable,
      busyId: observable,
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
      const [byMedium, byPeriod, anomalies, stats, quotas] = await Promise.all([
        emLedgerAggregate(client, siteRef, span, "medium"),
        emLedgerAggregate(client, siteRef, span, "period", "elec"),
        emAnomalies(client, siteRef),
        emAnomalyStats(client, siteRef),
        emQuotaProgressAll(client, siteRef, span),
      ]);
      runInAction(() => {
        this.byMedium = byMedium;
        this.byPeriod = byPeriod;
        this.anomalies = anomalies;
        this.stats = stats;
        this.quotas = quotas;
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

  async ack(siteRef: string, span: EmSpan, anomalyId: string): Promise<void> {
    const client = this.client;
    if (!client) return;
    runInAction(() => {
      this.busyId = anomalyId;
    });
    try {
      await emAnomalyAck(client, anomalyId);
      await this.load(siteRef, span);
    } catch (e: unknown) {
      runInAction(() => {
        this.error = e instanceof Error ? e.message : String(e);
      });
    } finally {
      runInAction(() => {
        this.busyId = undefined;
      });
    }
  }
}

export interface MobileAnomaly {
  id: string;
  dis: string;
  severity: string;
  severityDis: string;
  severityTone: Tone;
  subjectDis?: string;
  ts?: string;
  open: boolean;
}

export interface MobileQuota {
  dis: string;
  ratio?: number;
  level: string;
  sourceDis: string;
}

export class MobileViewModel extends BaseViewModel<MobileStore> {
  get loading(): boolean {
    return this.store.loading;
  }
  get error(): string | undefined {
    return this.store.error;
  }
  get busyId(): string | undefined {
    return this.store.busyId;
  }

  load(siteRef: string, span: EmSpan): void {
    void this.store.load(siteRef, span);
  }
  ack(siteRef: string, span: EmSpan, id: string): void {
    void this.store.ack(siteRef, span, id);
  }

  /** 电耗合计 —— 值班首页和管理者速览都以它为主数字。 */
  get elecTotal(): number | undefined {
    const row = this.store.byMedium.find((d) => str(d, "medium") === "elec");
    return row ? num(row, "val") : undefined;
  }

  get mediumRows(): { medium: string; dis: string; val?: number }[] {
    return this.store.byMedium.map((d) => {
      const m = str(d, "medium") ?? "?";
      return { medium: m, dis: MEDIUM_DIS[m] ?? m, val: num(d, "val") };
    });
  }

  /** 近几日电耗，画迷你趋势。 */
  get trend(): { period: string; val: number }[] {
    return this.store.byPeriod
      .map((d) => ({ period: str(d, "period") ?? "", val: num(d, "val") ?? 0 }))
      .filter((r) => r.period !== "")
      .sort((a, b) => a.period.localeCompare(b.period))
      .slice(-14);
  }

  /** 最近一个账期与上一个账期的环比。 */
  get dod(): number | undefined {
    const t = this.trend;
    if (t.length < 2) return undefined;
    const prev = t[t.length - 2].val;
    if (prev === 0) return undefined;
    return (t[t.length - 1].val - prev) / prev;
  }

  statOf(key: string): number {
    const s = this.store.stats;
    return s ? (num(s, key) ?? 0) : 0;
  }

  get anomalyRows(): MobileAnomaly[] {
    return this.store.anomalies.map((d) => {
      const sev = str(d, "emSeverity") ?? "info";
      const st = str(d, "emAnomalyStatus") ?? "open";
      return {
        id: recId(d) ?? "",
        dis: str(d, "dis") ?? "",
        severity: sev,
        severityDis: SEVERITY_DIS[sev] ?? sev,
        severityTone: SEVERITY_TONE[sev] ?? "neutral",
        subjectDis: str(d, "emSubjectDis"),
        ts: dt(d, "ts"),
        open: st === "open",
      };
    });
  }

  /** 值班首页只滚动最近的几条，手机上不该出现长列表。 */
  get recentAnomalies(): MobileAnomaly[] {
    return this.anomalyRows.slice(0, 6);
  }

  get pendingAnomalies(): MobileAnomaly[] {
    return this.anomalyRows.filter((a) => a.open).slice(0, 8);
  }

  get quotaRows(): MobileQuota[] {
    return this.store.quotas.map((d) => {
      const src = str(d, "emLimitSource");
      return {
        dis: str(d, "dis") ?? "",
        ratio: num(d, "ratio"),
        level: str(d, "level") ?? "ok",
        sourceDis: src ? (QUOTA_SOURCE_DIS[src] ?? src) : "未标注来源",
      };
    });
  }

  fmtNum = fmtNum;
  fmtPct = fmtPct;
  fmtTs = fmtTs;
}
