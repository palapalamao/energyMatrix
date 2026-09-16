import { makeObservable, observable, runInAction } from "mobx";
import type { HClient, HDict } from "@/api/client";
import { BaseStore } from "@/mvvm/base/BaseStore";
import { BaseViewModel } from "@/mvvm/base/BaseViewModel";
import {
  emMeterTree,
  emMeterTreeValidate,
  emSiteGaps,
  has,
  id as emId,
  num,
  ref,
  str,
  type EmSpan,
} from "@/api/emApi";

/**
 * 分项计量树的 Store + ViewModel。
 *
 * 三块：计量树（扁平行 + emDepth 缩进）、结构校验、平衡校核。
 * 结构校验与平衡校核放在同一屏，是因为它们回答的是同一个问题 ——
 * 「这套计量方案能不能支撑一份可结算的账」。
 */

export class MeterTreeStore extends BaseStore {
  private client?: HClient;

  // observable 字段必须带初始化器 —— useDefineForClassFields=false 下，
  // 没有初始化器的字段不会被 TS 生成，makeObservable 会抛 MobX error nr 1。
  nodes: HDict[] = [];
  issues: HDict[] = [];
  gaps: HDict[] = [];
  loading = false;
  error: string | undefined = undefined;

  constructor() {
    super();
    makeObservable(this, {
      nodes: observable,
      issues: observable,
      gaps: observable,
      loading: observable,
      error: observable,
    });
  }

  override initialize(client: HClient): void {
    this.client = client;
    this.initialized = true;
  }

  async load(siteRef: string, span: EmSpan, medium?: string): Promise<void> {
    const client = this.client;
    if (!client) return;
    runInAction(() => {
      this.loading = true;
      this.error = undefined;
    });
    try {
      const [nodes, issues, gaps] = await Promise.all([
        emMeterTree(client, siteRef, medium),
        emMeterTreeValidate(client, siteRef),
        emSiteGaps(client, siteRef, span),
      ]);
      runInAction(() => {
        this.nodes = nodes;
        this.issues = issues;
        this.gaps = gaps;
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

export interface MeterRow {
  id?: string;
  dis: string;
  medium?: string;
  role: string;
  depth: number;
  virtual: boolean;
  gap: boolean;
  childCount: number;
}

export interface IssueRow {
  level: string;
  code: string;
  msg: string;
}

export interface GapRow {
  meterRef?: string;
  medium?: string;
  parentVal?: number;
  childSum?: number;
  gapVal?: number;
  gapRatio?: number;
  childCount?: number;
}

/** 六种角色的展示名与配色（对应设计稿的六色徽标）。 */
export const ROLE_DIS: Record<string, string> = {
  gateway: "关口表",
  main: "总表",
  branch: "分项表",
  sub: "子表",
  check: "考核表",
  virtual: "虚表",
};

export const ROLE_CLASS: Record<string, string> = {
  gateway: "bg-danger/15 text-danger",
  main: "bg-info/15 text-info",
  branch: "bg-brand/15 text-brand",
  sub: "bg-slate-100 text-slate-500",
  check: "bg-warn/15 text-warn",
  virtual: "bg-accent/15 text-accent",
};

export class MeterTreeViewModel extends BaseViewModel<MeterTreeStore> {
  get loading(): boolean {
    return this.store.loading;
  }
  get error(): string | undefined {
    return this.store.error;
  }

  load(siteRef: string, span: EmSpan, medium?: string): void {
    void this.store.load(siteRef, span, medium);
  }

  get rows(): MeterRow[] {
    return this.store.nodes.map((d) => ({
      id: emId(d),
      dis: str(d, "dis") ?? emId(d) ?? "—",
      medium: str(d, "emMedium"),
      role: str(d, "emMeterRole") ?? "sub",
      depth: num(d, "emDepth") ?? 0,
      virtual: has(d, "emVirtual"),
      gap: has(d, "emGap"),
      childCount: num(d, "emChildCount") ?? 0,
    }));
  }

  get issues(): IssueRow[] {
    return this.store.issues.map((d) => ({
      level: str(d, "level") ?? "warn",
      code: str(d, "code") ?? "?",
      msg: str(d, "msg") ?? "",
    }));
  }

  get errorCount(): number {
    return this.issues.filter((i) => i.level === "err").length;
  }

  get gapRows(): GapRow[] {
    return this.store.gaps.map((d) => ({
      meterRef: ref(d, "meterRef"),
      medium: str(d, "emMedium"),
      parentVal: num(d, "parentVal"),
      childSum: num(d, "childSum"),
      gapVal: num(d, "emGapVal"),
      gapRatio: num(d, "emGapRatio"),
      childCount: num(d, "emChildCount"),
    }));
  }

  fmtNum(v?: number): string {
    return v === undefined ? "—" : v.toLocaleString(undefined, { maximumFractionDigits: 1 });
  }

  fmtPct(v?: number): string {
    return v === undefined ? "—" : (v * 100).toFixed(1) + "%";
  }
}
