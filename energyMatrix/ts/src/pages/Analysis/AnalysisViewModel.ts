import { makeObservable, observable, runInAction } from "mobx";
import { HRef } from "@/api/client";
import type { HClient, HDict } from "@/api/client";
import { BaseStore } from "@/mvvm/base/BaseStore";
import { BaseViewModel } from "@/mvvm/base/BaseViewModel";
import { emLedgerAggregate, id as recId, num, ref, str, type EmSpan } from "@/api/emApi";
import { MEDIUM_DIS, SUBITEM_DIS, SUBITEM_GROUP_DIS, fmtNum, fmtPct } from "@/pages/shared";

/**
 * 能耗分析。
 *
 * 整屏只调一个后端函数 —— `emLedgerAggregate(siteRef, span, dim, medium)`。
 * 换维度就是换 `dim`，换介质就是换 `medium`；六个维度共用同一条取数路径，
 * 是台账多维聚合本来就该有的样子（说明书 §4.5 emDimension）。
 *
 * 趋势用 `dim="period"` —— 台账条目自带 `emPeriod`（`D-yyyyMMdd` 之类的
 * 账期码），按它分组就是按时间分组，不需要另开一套时间序列接口。
 */

/** 可切换的分析维度。与 EmLedgerQuery.dimTags 一一对应。 */
export const DIMS = [
  { key: "subItem", label: "分项" },
  { key: "space", label: "空间" },
  { key: "tenant", label: "租户" },
  { key: "org", label: "组织" },
  { key: "meter", label: "表计" },
  { key: "medium", label: "介质" },
] as const;

export type DimKey = (typeof DIMS)[number]["key"];

export class AnalysisStore extends BaseStore {
  private client: HClient | undefined = undefined;

  byDim: HDict[] = [];
  byPeriod: HDict[] = [];
  bySubItem: HDict[] = [];
  /** 维度值 → 展示名。space/tenant/org/meter 分组键是 Ref，要回查名字。 */
  disByRef: Record<string, string> = {};
  loading = false;
  error: string | undefined = undefined;

  constructor() {
    super();
    makeObservable(this, {
      byDim: observable,
      byPeriod: observable,
      bySubItem: observable,
      disByRef: observable,
      loading: observable,
      error: observable,
    });
  }

  override initialize(client: HClient): void {
    this.client = client;
    this.initialized = true;
  }

  async load(siteRef: string, span: EmSpan, dim: DimKey, medium?: string): Promise<void> {
    const client = this.client;
    if (!client) return;
    runInAction(() => {
      this.loading = true;
      this.error = undefined;
    });
    try {
      const [byDim, byPeriod, bySubItem] = await Promise.all([
        emLedgerAggregate(client, siteRef, span, dim, medium),
        emLedgerAggregate(client, siteRef, span, "period", medium),
        emLedgerAggregate(client, siteRef, span, "subItem", "elec"),
      ]);
      runInAction(() => {
        this.byDim = byDim;
        this.byPeriod = byPeriod;
        this.bySubItem = bySubItem;
      });
      await this.resolveNames(dim, byDim);
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
   * 把 Ref 型的分组键换成可读名字。
   *
   * 一次 `readByIds` 解决，不按行逐个 `readById` —— 一个 30 行的表会打出
   * 30 个请求，在 FIN 的 attest-key 刷新窗口上很容易被卡住。
   */
  private async resolveNames(dim: DimKey, rows: HDict[]): Promise<void> {
    const client = this.client;
    if (!client) return;
    if (dim === "subItem" || dim === "medium") return;

    const ids = rows.map((r) => ref(r, dim)).filter((v): v is string => !!v);
    if (ids.length === 0) return;

    // 走 HRef.toAxon 而不是手拼 "@"+id：记录 id 可能带项目前缀（p:proj:r:xxx），
    // 手拼会漏掉，而且拼字符串就是给 Axon 注入留门
    const list = ids.map((i) => HRef.make(i).toAxon()).join(", ");
    const grid = await client.ext.eval(`readByIds([${list}], false)`);
    const map: Record<string, string> = {};
    grid.getRows().forEach((rec) => {
      const rid = recId(rec);
      if (rid) map[rid] = str(rec, "dis") ?? str(rec, "navName") ?? rid;
    });
    runInAction(() => {
      this.disByRef = { ...this.disByRef, ...map };
    });
  }
}

export interface DimRow {
  key: string;
  dis: string;
  val?: number;
  ratio: number;
  entries?: number;
  qualityMin?: number;
  sources?: string;
}

export interface PeriodRow {
  period: string;
  val?: number;
}

export class AnalysisViewModel extends BaseViewModel<AnalysisStore> {
  get loading(): boolean {
    return this.store.loading;
  }
  get error(): string | undefined {
    return this.store.error;
  }

  load(siteRef: string, span: EmSpan, dim: DimKey, medium?: string): void {
    void this.store.load(siteRef, span, dim, medium);
  }

  /** 分组键的展示名。Ref 型回查，枚举型查字典，都查不到就露出原值。 */
  private disOf(dim: DimKey, key: string): string {
    if (dim === "medium") return MEDIUM_DIS[key] ?? key;
    if (dim === "subItem") return SUBITEM_DIS[key] ?? key;
    return this.store.disByRef[key] ?? key;
  }

  rowsOf(dim: DimKey): DimRow[] {
    const raw = this.store.byDim.map((d) => {
      const k = ref(d, dim) ?? str(d, dim) ?? "<未分类>";
      return {
        key: k,
        dis: this.disOf(dim, k),
        val: num(d, "val"),
        entries: num(d, "emEntryCount"),
        qualityMin: num(d, "emQualityMin"),
        sources: str(d, "emSources"),
      };
    });
    const total = raw.reduce((s, r) => s + (r.val ?? 0), 0);
    return raw
      .map((r) => ({ ...r, ratio: total > 0 ? (r.val ?? 0) / total : 0 }))
      .sort((a, b) => (b.val ?? 0) - (a.val ?? 0));
  }

  get periodRows(): PeriodRow[] {
    return this.store.byPeriod
      .map((d) => ({ period: str(d, "period") ?? "", val: num(d, "val") }))
      .filter((r) => r.period !== "")
      .sort((a, b) => a.period.localeCompare(b.period));
  }

  /** 趋势的三个统计量。用于「日均 / 峰值 / 最低」三个小字。 */
  get periodStats(): { avg?: number; max?: number; min?: number; maxAt?: string } {
    const vals = this.periodRows.map((r) => r.val ?? 0);
    if (vals.length === 0) return {};
    const max = Math.max(...vals);
    const at = this.periodRows.find((r) => (r.val ?? 0) === max)?.period;
    return {
      avg: vals.reduce((a, b) => a + b, 0) / vals.length,
      max,
      min: Math.min(...vals),
      maxAt: at,
    };
  }

  /** 分项按 A/B/C/D 四组合并 —— 国标口径的一级分类。 */
  get subItemGroups(): { group: string; dis: string; val: number; ratio: number }[] {
    const acc: Record<string, number> = {};
    this.store.bySubItem.forEach((d) => {
      const code = str(d, "subItem") ?? "";
      if (!code) return;
      const g = code.slice(0, 1).toUpperCase();
      acc[g] = (acc[g] ?? 0) + (num(d, "val") ?? 0);
    });
    const total = Object.values(acc).reduce((a, b) => a + b, 0);
    return Object.entries(acc)
      .map(([group, val]) => ({
        group,
        dis: SUBITEM_GROUP_DIS[group] ?? group,
        val,
        ratio: total > 0 ? val / total : 0,
      }))
      .sort((a, b) => a.group.localeCompare(b.group));
  }

  fmtNum = fmtNum;
  fmtPct = fmtPct;
}
