import { makeObservable, observable, runInAction } from "mobx";
import type { HClient, HDict } from "@/api/client";
import { BaseStore } from "@/mvvm/base/BaseStore";
import { BaseViewModel } from "@/mvvm/base/BaseViewModel";
import { emClosePeriod, emClosePeriods, has, num, str, type EmSpan } from "@/api/emApi";

/**
 * 报表与关账的 Store + ViewModel。
 *
 * 关账是这套系统里唯一一个「人必须为结果负责」的动作：缺口率闸门是硬门槛，
 * 宁可延迟关账，也不允许一份内部不平衡的账目进入结算与披露链路
 * （说明书 §5.2 的设计取舍原文）。
 *
 * 所以 UI 分两步：先跑**预检**（dryRun），把闸门结论摆在人面前，
 * 再由人决定要不要真的关。默认按钮是预检，不是关账。
 */

export interface CloseResult {
  status: string;
  ok: boolean;
  msg?: string;
  gapRatio?: number;
  threshold?: number;
  entryCount?: number;
  /** blocked/incomplete 时是问题清单；closed/dryRun 时是各介质缺口明细。 */
  rows: HDict[];
}

export class ReportsStore extends BaseStore {
  private client?: HClient;

  // observable 字段必须带初始化器 —— useDefineForClassFields=false 下，
  // 没有初始化器的字段不会被 TS 生成，makeObservable 会抛 MobX error nr 1。
  batches: HDict[] = [];
  result: CloseResult | undefined = undefined;
  loading = false;
  submitting = false;
  error: string | undefined = undefined;

  constructor() {
    super();
    makeObservable(this, {
      batches: observable,
      result: observable,
      loading: observable,
      submitting: observable,
      error: observable,
    });
  }

  override initialize(client: HClient): void {
    this.client = client;
    this.initialized = true;
  }

  async loadBatches(siteRef: string): Promise<void> {
    const client = this.client;
    if (!client) return;
    runInAction(() => {
      this.loading = true;
      this.error = undefined;
    });
    try {
      const batches = await emClosePeriods(client, siteRef);
      runInAction(() => {
        this.batches = batches;
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

  async close(siteRef: string, span: EmSpan, dryRun: boolean): Promise<void> {
    const client = this.client;
    if (!client) return;
    runInAction(() => {
      this.submitting = true;
      this.error = undefined;
    });
    try {
      const grid = await emClosePeriod(client, siteRef, span, "daily", dryRun);
      const meta = grid.meta;
      runInAction(() => {
        this.result = {
          status: meta.get("status")?.toString() ?? "?",
          ok: !!meta.get("ok"),
          msg: meta.get("msg")?.toString(),
          gapRatio: num(meta, "emGapRatio"),
          threshold: num(meta, "emThreshold"),
          entryCount: num(meta, "emEntryCount"),
          rows: grid.getRows(),
        };
      });
      // 真关账后批次列表变了，刷新一次
      if (!dryRun) await this.loadBatches(siteRef);
    } catch (e: unknown) {
      runInAction(() => {
        this.error = e instanceof Error ? e.message : String(e);
      });
    } finally {
      runInAction(() => {
        this.submitting = false;
      });
    }
  }
}

export interface BatchRow {
  dis: string;
  period?: string;
  granularity?: string;
  closed: boolean;
  closedBy?: string;
  gapRatio?: number;
  entryCount?: number;
}

export class ReportsViewModel extends BaseViewModel<ReportsStore> {
  get loading(): boolean {
    return this.store.loading;
  }
  get submitting(): boolean {
    return this.store.submitting;
  }
  get error(): string | undefined {
    return this.store.error;
  }
  get result(): CloseResult | undefined {
    return this.store.result;
  }

  loadBatches(siteRef: string): void {
    void this.store.loadBatches(siteRef);
  }

  dryRun(siteRef: string, span: EmSpan): void {
    void this.store.close(siteRef, span, true);
  }

  doClose(siteRef: string, span: EmSpan): void {
    void this.store.close(siteRef, span, false);
  }

  /** 只有预检通过（status=dryRun）才允许真正关账 —— 不给"直接关"的捷径。 */
  get canClose(): boolean {
    return this.result?.status === "dryRun";
  }

  get batchRows(): BatchRow[] {
    return this.store.batches
      .map((d) => ({
        dis: str(d, "dis") ?? "—",
        period: str(d, "emPeriod"),
        granularity: str(d, "emGranularity"),
        closed: has(d, "emClosed"),
        closedBy: str(d, "emClosedBy"),
        gapRatio: num(d, "emGapRatio"),
        entryCount: num(d, "emEntryCount"),
      }))
      .sort((a, b) => (b.period ?? "").localeCompare(a.period ?? ""));
  }

  /** 闸门结论的展示等级。 */
  resultTone(status: string): "ok" | "warn" | "danger" {
    if (status === "closed" || status === "dryRun") return "ok";
    if (status === "alreadyClosed") return "warn";
    return "danger";
  }

  fmtPct(v?: number): string {
    return v === undefined ? "—" : (v * 100).toFixed(1) + "%";
  }
}
