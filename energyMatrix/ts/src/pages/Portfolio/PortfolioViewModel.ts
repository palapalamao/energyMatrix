import { makeObservable, observable, runInAction } from "mobx";
import type { HClient, HDict } from "@/api/client";
import { BaseStore } from "@/mvvm/base/BaseStore";
import { BaseViewModel } from "@/mvvm/base/BaseViewModel";
import {
  emKpiComputeAll,
  emKpiDefs,
  emSites,
  id as recId,
  num,
  ref,
  str,
  type EmSpan,
} from "@/api/emApi";
import { fmtNum, fmtPct } from "@/pages/shared";

/**
 * 多项目 / 园区总览。
 *
 * 排名走 `emKpiComputeAll` 而不是前端自己除 —— 指标口径（分母取 area 还是
 * emCoolArea、分子含不含分摊）必须只有一份定义，放在 `EmKpi.emFormula` 上。
 * 前端自己算的那一版永远会和报表对不上。
 *
 * **未做气象归一化**：说明书要求 EUI 排名前先归一化到标准气象年（CDD/HDD），
 * 这需要度日数据源，骨架里没有。所以页面上明确标注「未归一化」，
 * 而不是画一个看起来已经归一化过的排名。
 */

export class PortfolioStore extends BaseStore {
  private client: HClient | undefined = undefined;

  sites: HDict[] = [];
  kpiDefs: HDict[] = [];
  ranking: HDict[] = [];
  kpiCode = "EUI_TOTAL";
  loading = false;
  error: string | undefined = undefined;

  constructor() {
    super();
    makeObservable(this, {
      sites: observable,
      kpiDefs: observable,
      ranking: observable,
      kpiCode: observable,
      loading: observable,
      error: observable,
    });
  }

  override initialize(client: HClient): void {
    this.client = client;
    this.initialized = true;
  }

  async load(span: EmSpan, kpiCode: string): Promise<void> {
    const client = this.client;
    if (!client) return;
    runInAction(() => {
      this.loading = true;
      this.error = undefined;
      this.kpiCode = kpiCode;
    });
    try {
      const [sites, defs] = await Promise.all([emSites(client), emKpiDefs(client)]);
      const refs = sites.map((s) => recId(s)).filter((v): v is string => !!v);

      // 指标可能还没定义（空库 / 没跑示范数据），这时不该整页报错 ——
      // 站点清单本身就有信息量，排名列留空即可
      let ranking: HDict[] = [];
      const hasKpi = defs.some((d) => str(d, "emKpiCode") === kpiCode);
      if (hasKpi && refs.length > 0) {
        ranking = await emKpiComputeAll(client, kpiCode, refs, span);
      }

      runInAction(() => {
        this.sites = sites;
        this.kpiDefs = defs;
        this.ranking = ranking;
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

export interface SiteRow {
  id: string;
  dis: string;
  city?: string;
  usageType?: string;
  climateZone?: string;
  area?: number;
  kpi?: number;
  err?: string;
  rank?: number;
}

const USAGE_DIS: Record<string, string> = {
  office: "办公",
  retail: "商业",
  hotel: "酒店",
  hospital: "医院",
  school: "学校",
  datacenter: "数据中心",
  residential: "住宅",
  mixed: "综合体",
  industrial: "工业",
};

export class PortfolioViewModel extends BaseViewModel<PortfolioStore> {
  get loading(): boolean {
    return this.store.loading;
  }
  get error(): string | undefined {
    return this.store.error;
  }
  get kpiCode(): string {
    return this.store.kpiCode;
  }

  load(span: EmSpan, kpiCode: string): void {
    void this.store.load(span, kpiCode);
  }

  /** 可选指标：只列 emDimension 含 site 的，别的维度排站点没有意义。 */
  get kpiOptions(): { key: string; label: string; unit?: string }[] {
    return this.store.kpiDefs
      .filter((d) => {
        const dims = d.get("emDimension");
        return dims ? JSON.stringify(dims.toJSON()).includes("site") : true;
      })
      .map((d) => ({
        key: str(d, "emKpiCode") ?? "",
        label: str(d, "dis") ?? str(d, "emKpiCode") ?? "",
        unit: str(d, "unit"),
      }))
      .filter((o) => o.key !== "");
  }

  get kpiUnit(): string | undefined {
    return this.kpiOptions.find((o) => o.key === this.kpiCode)?.unit;
  }

  /** 当前指标的对标依据（国标条文号），报表里必须标出来。 */
  get kpiStandard(): string | undefined {
    const d = this.store.kpiDefs.find((x) => str(x, "emKpiCode") === this.store.kpiCode);
    return d ? str(d, "emStandardRef") : undefined;
  }

  get rows(): SiteRow[] {
    const byRef: Record<string, HDict> = {};
    this.store.ranking.forEach((r) => {
      const k = ref(r, "emSubjectRef");
      if (k) byRef[k] = r;
    });

    const list: SiteRow[] = this.store.sites.map((s) => {
      const sid = recId(s) ?? "";
      const k = byRef[sid];
      return {
        id: sid,
        dis: str(s, "dis") ?? str(s, "navName") ?? sid,
        city: str(s, "geoCity"),
        usageType: str(s, "emUsageType"),
        climateZone: str(s, "emClimateZone"),
        area: num(s, "area"),
        kpi: k ? num(k, "val") : undefined,
        err: k ? str(k, "err") : undefined,
      };
    });

    // 算得出的排前面并给名次；算不出的沉底且不占名次 —— 给一个没有数的项目
    // 排第一名，比不排更容易误导
    const scored = list.filter((r) => r.kpi !== undefined).sort((a, b) => a.kpi! - b.kpi!);
    scored.forEach((r, i) => (r.rank = i + 1));
    const unscored = list.filter((r) => r.kpi === undefined);
    return [...scored, ...unscored];
  }

  get summary(): {
    sites: number;
    cities: number;
    area: number;
    scored: number;
    best?: SiteRow;
    worst?: SiteRow;
  } {
    const rows = this.rows;
    const cities = new Set(rows.map((r) => r.city).filter(Boolean));
    const scored = rows.filter((r) => r.kpi !== undefined);
    return {
      sites: rows.length,
      cities: cities.size,
      area: rows.reduce((s, r) => s + (r.area ?? 0), 0),
      scored: scored.length,
      best: scored[0],
      worst: scored[scored.length - 1],
    };
  }

  /** 按业态分组的指标分布（均值 + 极值），代替箱线图。 */
  get byUsage(): { usage: string; dis: string; n: number; avg?: number; min?: number; max?: number }[] {
    const acc: Record<string, number[]> = {};
    this.rows.forEach((r) => {
      const u = r.usageType ?? "unknown";
      if (r.kpi === undefined) return;
      (acc[u] ??= []).push(r.kpi);
    });
    return Object.entries(acc).map(([usage, vals]) => ({
      usage,
      dis: USAGE_DIS[usage] ?? usage,
      n: vals.length,
      avg: vals.reduce((a, b) => a + b, 0) / vals.length,
      min: Math.min(...vals),
      max: Math.max(...vals),
    }));
  }

  usageDis(u?: string): string {
    return u ? (USAGE_DIS[u] ?? u) : "—";
  }

  fmtNum = fmtNum;
  fmtPct = fmtPct;
}
