import { makeObservable, observable, runInAction } from "mobx";
import type { HClient, HDict } from "@/api/client";
import { BaseStore } from "@/mvvm/base/BaseStore";
import { BaseViewModel } from "@/mvvm/base/BaseViewModel";
import {
  emEntityDetail,
  emKpiComputeAll,
  emKpiDefs,
  emQuotaProgressAll,
  num,
  str,
  type EmSpan,
} from "@/api/emApi";
import { isCoreKpi, quotaLevel, quotaTone, sortCoreFirst } from "./kpiFormat";
import type { Tone } from "@/components/Bits";

/**
 * 核心 KPI 考核屏的 Store + ViewModel。
 *
 * 取数全部是既有后端函数（详细设计 4.4 数据契约，V0.1.2，零新增）：
 *   指标定义  emKpiDefs()
 *   指标数值  emKpiComputeAll(code, [site], span)   —— 分母缺失行内返 null，不当 0
 *   定额进度  emQuotaProgressAll(site, span)
 *   考核参数  emEntityDetail(site) 的 rec（area / emCoolArea / emOccupancy / emBeds）
 *
 * 本屏只读：参数维护归模型配置屏（emEntityUpdate，admin）。
 */

export class KpiStore extends BaseStore {
  private client?: HClient;

  defs: HDict[] = [];
  vals: HDict[] = [];
  progress: HDict[] = [];
  siteRec: HDict | undefined = undefined;
  loading = false;
  error: string | undefined = undefined;

  constructor() {
    super();
    makeObservable(this, {
      defs: observable,
      vals: observable,
      progress: observable,
      siteRec: observable,
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
      const [defs, progress, detail] = await Promise.all([
        emKpiDefs(client),
        emQuotaProgressAll(client, siteRef, span),
        emEntityDetail(client, siteRef),
      ]);

      // 逐个指标算本站点的当期值。单个指标算不出不能拖垮整页 ——
      // 行内 val=null + err 由 emKpiComputeAll 保证，这里再兜公式本身有错的情况。
      const codes = defs.map((d) => str(d, "emKpiCode")).filter((c): c is string => !!c);
      const vals: HDict[] = [];
      for (const code of codes) {
        try {
          const r = await emKpiComputeAll(client, code, [siteRef], span);
          if (r[0]) vals.push(r[0]);
        } catch {
          // 该指标在卡片上显示「—」；公式问题在后端日志里
        }
      }

      runInAction(() => {
        this.defs = defs;
        this.vals = vals;
        this.progress = progress;
        this.siteRec = detail ? (detail.get("rec") as HDict | undefined) : undefined;
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

export interface KpiCard {
  code: string;
  dis: string;
  unit?: string;
  granularity?: string;
  standard?: string;
  higherIsBetter?: boolean;
  core: boolean;
  val?: number;
  err?: string;
}

export interface KpiParam {
  tag: string;
  val?: number;
}

export interface QuotaLine {
  id: string;
  dis: string;
  unit?: string;
  limit?: number;
  used?: number;
  ratio?: number;
  warnAt?: number;
  level: "ok" | "warn" | "over" | undefined;
  tone: Tone;
  source?: string;
}

export class KpiViewModel extends BaseViewModel<KpiStore> {
  get loading(): boolean {
    return this.store.loading;
  }
  get error(): string | undefined {
    return this.store.error;
  }

  load(siteRef: string, span: EmSpan): void {
    void this.store.load(siteRef, span);
  }

  get kpiCards(): KpiCard[] {
    const byCode: Record<string, HDict> = {};
    this.store.vals.forEach((v) => {
      const c = str(v, "emKpiCode");
      if (c) byCode[c] = v;
    });
    const rows: KpiCard[] = this.store.defs.map((d) => {
      const code = str(d, "emKpiCode") ?? "";
      const v = byCode[code];
      return {
        code,
        dis: str(d, "dis") ?? code,
        unit: str(d, "unit"),
        granularity: str(d, "emGranularity"),
        standard: str(d, "emStandardRef"),
        higherIsBetter: d.get("emHigherIsBetter")?.toJSON() === true,
        core: isCoreKpi(code),
        val: v ? num(v, "val") : undefined,
        err: v ? str(v, "err") : undefined,
      };
    });
    return sortCoreFirst(rows);
  }

  /** 考核参数：分母缺失就是缺失，显示「—」并引导去模型配置屏补。 */
  get siteParams(): KpiParam[] {
    const rec = this.store.siteRec;
    const get = (tag: string) => (rec ? num(rec, tag) : undefined);
    return [
      { tag: "area", val: get("area") },
      { tag: "emCoolArea", val: get("emCoolArea") },
      { tag: "emOccupancy", val: get("emOccupancy") },
      { tag: "emBeds", val: get("emBeds") },
    ];
  }

  get quotaLines(): QuotaLine[] {
    return this.store.progress.map((d) => {
      const ratio = num(d, "ratio");
      const warnAt = num(d, "emWarnRatio");
      const level = quotaLevel(ratio, warnAt);
      const source = str(d, "emLimitSource");
      return {
        id: str(d, "quotaRef") ?? str(d, "id") ?? "",
        dis: str(d, "dis") ?? "（未命名定额）",
        unit: str(d, "unit"),
        limit: num(d, "emLimit"),
        used: num(d, "used"),
        ratio,
        warnAt,
        level,
        tone: quotaTone(level),
        source: source ?? undefined,
      };
    });
  }

  get overCount(): number {
    return this.quotaLines.filter((r) => r.level === "over").length;
  }
  get warnCount(): number {
    return this.quotaLines.filter((r) => r.level === "warn").length;
  }
  /** 来源未标注的定额条数 —— 配置缺陷，要单独提出来（同定额屏口径）。 */
  get noSourceCount(): number {
    return this.quotaLines.filter((r) => !r.source).length;
  }
}