import { makeObservable, observable, runInAction } from "mobx";
import type { HClient, HDict } from "@/api/client";
import { BaseStore } from "@/mvvm/base/BaseStore";
import { BaseViewModel } from "@/mvvm/base/BaseViewModel";
import {
  emKpiComputeAll,
  emKpiDefs,
  emQuotaProgressAll,
  id as recId,
  num,
  ref,
  str,
  type EmSpan,
} from "@/api/emApi";
import {
  MEDIUM_DIS,
  OVER_ACTION_DIS,
  QUOTA_SOURCE_DIS,
  fmtNum,
  fmtPct,
} from "@/pages/shared";
import type { Tone } from "@/components/Bits";

/**
 * 定额与对标。
 *
 * 两块内容，两条互不相干的取数路径：
 *   定额执行进度 `emQuotaProgressAll` —— 纯除法，用量取自台账
 *   指标定义表   `emKpiDefs` + `emKpiCompute`（本站点的当期值）
 *
 * 页面上每条定额都必须显示 `emLimitSource`。说明书 §4.5 把定额来源分成五类，
 * 要求报表中分别标注、不可混用 —— 一条不知道出处的限值没有约束力，
 * 把国标约束值和"拍脑袋定的"画成同一根进度条，就是在制造这种混用。
 */

export class QuotaStore extends BaseStore {
  private client: HClient | undefined = undefined;

  progress: HDict[] = [];
  kpiDefs: HDict[] = [];
  kpiVals: HDict[] = [];
  loading = false;
  error: string | undefined = undefined;

  constructor() {
    super();
    makeObservable(this, {
      progress: observable,
      kpiDefs: observable,
      kpiVals: observable,
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
      const [progress, defs] = await Promise.all([
        emQuotaProgressAll(client, siteRef, span),
        emKpiDefs(client),
      ]);

      // 逐个指标算本站点的当期值。指标数量是个位数，串行发出也无所谓；
      // 更重要的是**单个指标算不出不能拖垮整页** —— emKpiComputeAll 已经把
      // 单点失败收在行里了，这里再包一层 catch 兜住"指标定义本身有问题"
      const codes = defs.map((d) => str(d, "emKpiCode")).filter((c): c is string => !!c);
      const vals: HDict[] = [];
      for (const code of codes) {
        try {
          const r = await emKpiComputeAll(client, code, [siteRef], span);
          if (r[0]) vals.push(r[0]);
        } catch {
          // 忽略：该指标在指标表里会显示为「—」，公式问题在后端日志里
        }
      }

      runInAction(() => {
        this.progress = progress;
        this.kpiDefs = defs;
        this.kpiVals = vals;
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

export interface QuotaRow {
  id: string;
  dis: string;
  medium?: string;
  mediumDis: string;
  limit?: number;
  used?: number;
  ratio?: number;
  warnAt?: number;
  level: string;
  levelTone: Tone;
  source?: string;
  sourceDis: string;
  overAction?: string;
  overActionDis: string;
}

export interface KpiRow {
  code: string;
  dis: string;
  unit?: string;
  formula?: string;
  granularity?: string;
  higherIsBetter?: boolean;
  standard?: string;
  dims: string;
  val?: number;
  err?: string;
}

const LEVEL_TONE: Record<string, Tone> = { ok: "ok", warn: "warn", over: "danger" };
const LEVEL_DIS: Record<string, string> = { ok: "正常", warn: "接近上限", over: "已超限" };

export class QuotaViewModel extends BaseViewModel<QuotaStore> {
  get loading(): boolean {
    return this.store.loading;
  }
  get error(): string | undefined {
    return this.store.error;
  }

  load(siteRef: string, span: EmSpan): void {
    void this.store.load(siteRef, span);
  }

  get quotaRows(): QuotaRow[] {
    return this.store.progress.map((d) => {
      const level = str(d, "level") ?? "ok";
      const medium = str(d, "emMedium");
      const source = str(d, "emLimitSource");
      const action = str(d, "emOverAction");
      return {
        id: ref(d, "quotaRef") ?? recId(d) ?? "",
        dis: str(d, "dis") ?? "（未命名定额）",
        medium,
        mediumDis: medium ? (MEDIUM_DIS[medium] ?? medium) : "全部",
        limit: num(d, "emLimit"),
        used: num(d, "used"),
        ratio: num(d, "ratio"),
        warnAt: num(d, "emWarnRatio"),
        level,
        levelTone: LEVEL_TONE[level] ?? "neutral",
        source,
        sourceDis: source ? (QUOTA_SOURCE_DIS[source] ?? source) : "未标注来源",
        overAction: action,
        overActionDis: action ? (OVER_ACTION_DIS[action] ?? action) : "—",
      };
    });
  }

  levelDis(level: string): string {
    return LEVEL_DIS[level] ?? level;
  }

  get overCount(): number {
    return this.quotaRows.filter((r) => r.level === "over").length;
  }
  get warnCount(): number {
    return this.quotaRows.filter((r) => r.level === "warn").length;
  }
  /** 来源未标注的定额条数 —— 这是配置缺陷，要单独提出来。 */
  get noSourceCount(): number {
    return this.quotaRows.filter((r) => !r.source).length;
  }

  get kpiRows(): KpiRow[] {
    const byCode: Record<string, HDict> = {};
    this.store.kpiVals.forEach((v) => {
      const c = str(v, "emKpiCode");
      if (c) byCode[c] = v;
    });
    return this.store.kpiDefs.map((d) => {
      const code = str(d, "emKpiCode") ?? "";
      const v = byCode[code];
      const dims = d.get("emDimension");
      return {
        code,
        dis: str(d, "dis") ?? code,
        unit: str(d, "unit"),
        formula: str(d, "emFormula"),
        granularity: str(d, "emGranularity"),
        higherIsBetter: d.get("emHigherIsBetter")?.toJSON() === true,
        standard: str(d, "emStandardRef"),
        dims: dims ? String(JSON.stringify(dims.toJSON())).replace(/[[\]"]/g, "") : "",
        val: v ? num(v, "val") : undefined,
        err: v ? str(v, "err") : undefined,
      };
    });
  }

  fmtNum = fmtNum;
  fmtPct = fmtPct;
}
