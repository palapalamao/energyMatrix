import { makeObservable, observable, runInAction } from "mobx";
import type { HClient, HDict } from "@/api/client";
import { BaseStore } from "@/mvvm/base/BaseStore";
import { BaseViewModel } from "@/mvvm/base/BaseViewModel";
import {
  emConnectors,
  emMeterInventory,
  emMeterStats,
  has,
  id as emId,
  num,
  str,
  type EmSpan,
} from "@/api/emApi";

/**
 * 表具与采集器管理的 Store + ViewModel。
 *
 * 这一屏回答的是运维的问题：**哪些表在正常上传数据，哪些没在，为什么**。
 * 与建模页（对象配得对不对）和计量树（汇总关系对不对）是三件不同的事。
 */

/** 通信状态。前五个来自采集器写的标准标签，后三个是本系统补充的。 */
export type CommStatus =
  | "ok" | "stale" | "fault" | "down" | "disabled"
  | "noPoint" | "unbound" | "virtual";

export const COMM_DIS: Record<string, string> = {
  ok: "正常",
  stale: "数据不新鲜",
  fault: "故障",
  down: "通信中断",
  disabled: "已停用",
  noPoint: "缺采集点",
  unbound: "未接采集器",
  virtual: "虚表",
};

/** 状态的处置建议 —— 光给状态不给下一步，运维还是不知道该干什么。 */
export const COMM_ADVICE: Record<string, string> = {
  stale: "采集周期可能较长，或采集器上报变慢；先看采集器状态",
  fault: "采集器报了配置或硬件故障，需要到现场或到连接器里查",
  down: "采集器与表之间断了，检查通信链路与地址配置",
  disabled: "有人主动停用了这个点位，确认是否还需要",
  noPoint: "这块表没有累积读数点，台账会跳过它 —— 到建模页检查模板是否完整",
  unbound: "点位建好了但没接到采集通道，需要在采集器里做点位绑定",
};

export const COMM_TONE: Record<string, "ok" | "warn" | "danger" | "muted"> = {
  ok: "ok",
  stale: "warn",
  disabled: "muted",
  virtual: "muted",
  fault: "danger",
  down: "danger",
  noPoint: "danger",
  unbound: "warn",
};

export interface MeterRow {
  id: string;
  dis: string;
  medium?: string;
  role: string;
  parentDis?: string;
  virtual: boolean;
  gap: boolean;
  subItem?: string;
  factor?: number;
  installDate?: string;
  pointCount: number;
  connDis?: string;
  status: CommStatus;
  curVal?: number;
  quality?: number;
}

export interface ConnRow {
  id: string;
  dis: string;
  status?: string;
  meterCount: number;
  pointCount: number;
}

export interface Stats {
  total: number;
  physical: number;
  ok: number;
  offline: number;
  virtual: number;
  connCount: number;
  qualityAvg?: number;
}

export class DevicesStore extends BaseStore {
  private client?: HClient;

  // observable 字段必须带初始化器（见 BaseStore 的说明）
  meters: HDict[] = [];
  conns: HDict[] = [];
  stats: HDict | undefined = undefined;
  loading = false;
  error: string | undefined = undefined;

  constructor() {
    super();
    makeObservable(this, {
      meters: observable,
      conns: observable,
      stats: observable,
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
      const [meters, stats, conns] = await Promise.all([
        emMeterInventory(client, siteRef, span),
        emMeterStats(client, siteRef, span),
        emConnectors(client, siteRef),
      ]);
      runInAction(() => {
        this.meters = meters;
        this.stats = stats;
        this.conns = conns;
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

export class DevicesViewModel extends BaseViewModel<DevicesStore> {
  get loading(): boolean { return this.store.loading; }
  get error(): string | undefined { return this.store.error; }

  load(siteRef: string, span: EmSpan): void {
    void this.store.load(siteRef, span);
  }

  get rows(): MeterRow[] {
    return this.store.meters.map((d) => ({
      id: emId(d) ?? "",
      dis: str(d, "dis") ?? "—",
      medium: str(d, "emMedium"),
      role: str(d, "emMeterRole") ?? "sub",
      parentDis: str(d, "emParentDis"),
      virtual: has(d, "emVirtual"),
      gap: has(d, "emGap"),
      subItem: str(d, "emSubItem"),
      factor: num(d, "emMeterFactor"),
      installDate: d.get("emInstallDate")?.toString(),
      pointCount: num(d, "emPointCount") ?? 0,
      connDis: str(d, "emConnDis"),
      status: (str(d, "emCommStatus") ?? "noPoint") as CommStatus,
      curVal: num(d, "emCurVal"),
      quality: num(d, "emQuality"),
    }));
  }

  get connRows(): ConnRow[] {
    return this.store.conns.map((d) => ({
      id: emId(d) ?? "",
      dis: str(d, "dis") ?? "—",
      status: str(d, "emStatus"),
      meterCount: num(d, "emMeterCount") ?? 0,
      pointCount: num(d, "emPointCount") ?? 0,
    }));
  }

  get stats(): Stats {
    const s = this.store.stats;
    return {
      total: s ? (num(s, "emTotal") ?? 0) : 0,
      physical: s ? (num(s, "emPhysical") ?? 0) : 0,
      ok: s ? (num(s, "emOk") ?? 0) : 0,
      offline: s ? (num(s, "emOffline") ?? 0) : 0,
      virtual: s ? (num(s, "emVirtual") ?? 0) : 0,
      connCount: s ? (num(s, "emConnCount") ?? 0) : 0,
      qualityAvg: s ? num(s, "emQualityAvg") : undefined,
    };
  }

  /**
   * 按介质、状态、关键词过滤。
   *
   * `status="problem"` 是个组合筛选：所有需要处置的状态。运维最常点的就是它 ——
   * 逐个状态点一遍才能看全问题的话，这个页面就白做了。
   */
  filtered(medium: string, status: string, keyword: string): MeterRow[] {
    const kw = keyword.trim().toLowerCase();
    return this.rows.filter((r) => {
      if (medium && r.medium !== medium) return false;
      if (status === "problem") {
        if (!["fault", "down", "noPoint", "unbound"].includes(r.status)) return false;
      } else if (status && r.status !== status) return false;
      if (kw && !r.dis.toLowerCase().includes(kw)) return false;
      return true;
    });
  }

  /** 出现过的介质，用于筛选器（不写死九种，没有的不显示）。 */
  get media(): string[] {
    const set = new Set<string>();
    this.rows.forEach((r) => r.medium && set.add(r.medium));
    return [...set].sort();
  }

  /** 各状态的数量，筛选器上直接显示。 */
  get statusCounts(): Record<string, number> {
    const out: Record<string, number> = {};
    this.rows.forEach((r) => {
      out[r.status] = (out[r.status] ?? 0) + 1;
    });
    out.problem = this.rows.filter((r) =>
      ["fault", "down", "noPoint", "unbound"].includes(r.status)
    ).length;
    return out;
  }

  fmtPct(v?: number): string {
    return v === undefined ? "—" : (v * 100).toFixed(1) + "%";
  }

  fmtNum(v?: number): string {
    return v === undefined ? "—" : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
}
