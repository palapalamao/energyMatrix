import { makeObservable, observable, runInAction } from "mobx";
import { HDict } from "@/api/client";
import type { HClient } from "@/api/client";
import { BaseStore } from "@/mvvm/base/BaseStore";
import { BaseViewModel } from "@/mvvm/base/BaseViewModel";
import {
  emAnomalies,
  emAnomalyAck,
  emAnomalyFalseAlarm,
  emAnomalyStats,
  emDiagRun,
  emDispatchWorkOrder,
  dt,
  id as recId,
  num,
  ref,
  str,
  type EmSpan,
} from "@/api/emApi";
import {
  ANOMALY_STATUS_DIS,
  CATEGORY_DIS,
  SEVERITY_DIS,
  SEVERITY_TONE,
  fmtNum,
  fmtPct,
  fmtTs,
} from "@/pages/shared";
import type { Tone } from "@/components/Bits";

/**
 * 实时监测与告警。
 *
 * 说明书 §4.8 的那条边界写在这里：**诊断规则只产生异常事件，绝不直接写控制点**。
 * 所以这一屏能做的只有三件事 —— 确认、标误报、派单，没有任何"下发"按钮。
 * 实时安全回路不依赖账务层，这是设计约束不是功能缺失。
 *
 * 「跑一次诊断」是幂等的：同规则 + 同对象 + 同账期只会有一条异常，
 * 所以按钮可以随便点，不会刷屏。
 */

export class RealtimeStore extends BaseStore {
  private client: HClient | undefined = undefined;

  anomalies: HDict[] = [];
  stats: HDict | undefined = undefined;
  loading = false;
  error: string | undefined = undefined;
  /** 上一次跑诊断的结果摘要，跑完显示一次。 */
  runMsg: string | undefined = undefined;
  /** 判据未实现而被跳过的规则，必须显示 —— 静默跳过等于谎报规则在工作。 */
  skipped: string | undefined = undefined;
  running = false;
  /** 正在提交写操作的异常 id，用于禁用按钮防重复提交。 */
  busyId: string | undefined = undefined;

  constructor() {
    super();
    makeObservable(this, {
      anomalies: observable,
      stats: observable,
      loading: observable,
      error: observable,
      runMsg: observable,
      skipped: observable,
      running: observable,
      busyId: observable,
    });
  }

  override initialize(client: HClient): void {
    this.client = client;
    this.initialized = true;
  }

  async load(siteRef: string): Promise<void> {
    const client = this.client;
    if (!client) return;
    runInAction(() => {
      this.loading = true;
      this.error = undefined;
    });
    try {
      const [list, stats] = await Promise.all([
        emAnomalies(client, siteRef),
        emAnomalyStats(client, siteRef),
      ]);
      runInAction(() => {
        this.anomalies = list;
        this.stats = stats;
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

  async run(siteRef: string, span: EmSpan): Promise<void> {
    const client = this.client;
    if (!client) return;
    runInAction(() => {
      this.running = true;
      this.runMsg = undefined;
      this.skipped = undefined;
    });
    try {
      const g = await emDiagRun(client, siteRef, span);
      const rows = g.getRows();
      const created = rows.filter((r) => str(r, "status") === "created").length;
      runInAction(() => {
        this.runMsg = `本次命中 ${rows.length} 条，其中新建 ${created} 条（其余为已存在的同期异常）`;
        this.skipped = str(g.meta, "emSkipped");
      });
      await this.load(siteRef);
    } catch (e: unknown) {
      runInAction(() => {
        this.error = e instanceof Error ? e.message : String(e);
      });
    } finally {
      runInAction(() => {
        this.running = false;
      });
    }
  }

  /** 写操作的公共外壳：置忙 → 调后端 → 重载 → 复位。 */
  private async mutate(siteRef: string, anomalyId: string, fn: () => Promise<void>): Promise<void> {
    runInAction(() => {
      this.busyId = anomalyId;
      this.error = undefined;
    });
    try {
      await fn();
      await this.load(siteRef);
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

  async ack(siteRef: string, anomalyId: string, note?: string): Promise<void> {
    const client = this.client;
    if (!client) return;
    await this.mutate(siteRef, anomalyId, () => emAnomalyAck(client, anomalyId, note));
  }

  async falseAlarm(siteRef: string, anomalyId: string, note?: string): Promise<void> {
    const client = this.client;
    if (!client) return;
    await this.mutate(siteRef, anomalyId, () => emAnomalyFalseAlarm(client, anomalyId, note));
  }

  async dispatch(siteRef: string, ids: string[], assignee: string, due?: string): Promise<void> {
    const client = this.client;
    if (!client) return;
    await this.mutate(siteRef, ids[0] ?? "", async () => {
      await emDispatchWorkOrder(client, ids, assignee, due);
    });
  }
}

export interface AnomalyRow {
  id: string;
  dis: string;
  category?: string;
  categoryDis: string;
  severity?: string;
  severityTone: Tone;
  severityDis: string;
  status: string;
  statusDis: string;
  subjectDis?: string;
  period?: string;
  ts?: string;
  val?: number;
  expected?: number;
  deviation?: number;
  ackBy?: string;
  /** 只有 open 的异常可以确认；已派单的不能再派。 */
  canAck: boolean;
  canDispatch: boolean;
}

export class RealtimeViewModel extends BaseViewModel<RealtimeStore> {
  get loading(): boolean {
    return this.store.loading;
  }
  get error(): string | undefined {
    return this.store.error;
  }
  get running(): boolean {
    return this.store.running;
  }
  get runMsg(): string | undefined {
    return this.store.runMsg;
  }
  get skipped(): string | undefined {
    return this.store.skipped;
  }
  get busyId(): string | undefined {
    return this.store.busyId;
  }

  load(siteRef: string): void {
    void this.store.load(siteRef);
  }
  run(siteRef: string, span: EmSpan): void {
    void this.store.run(siteRef, span);
  }
  ack(siteRef: string, id: string): void {
    void this.store.ack(siteRef, id);
  }
  falseAlarm(siteRef: string, id: string): void {
    void this.store.falseAlarm(siteRef, id);
  }
  dispatch(siteRef: string, ids: string[], assignee: string, due?: string): void {
    void this.store.dispatch(siteRef, ids, assignee, due);
  }

  statOf(key: string): number {
    const s = this.store.stats;
    return s ? (num(s, key) ?? 0) : 0;
  }

  /**
   * 分类统计。`emByCategory` 是一个嵌套 Dict，键是分类名。
   * 走 `keys` + `num()` 而不是 `toJSON()` —— toJSON 会把带单位的数字变成
   * `{_kind:"number", val}`、不带单位的变成裸数字，两种形状都要处理才对。
   */
  get byCategory(): { key: string; dis: string; n: number }[] {
    const nested = this.store.stats?.get<HDict>("emByCategory");
    if (!nested) return [];
    return nested.keys
      .map((k) => ({ key: k, dis: CATEGORY_DIS[k] ?? k, n: num(nested, k) ?? 0 }))
      .sort((a, b) => b.n - a.n);
  }

  rows(category?: string, status?: string): AnomalyRow[] {
    return this.store.anomalies
      .map((d) => {
        const cat = str(d, "emCategory");
        const sev = str(d, "emSeverity") ?? "info";
        const st = str(d, "emAnomalyStatus") ?? "open";
        return {
          id: recId(d) ?? "",
          dis: str(d, "dis") ?? "",
          category: cat,
          categoryDis: cat ? (CATEGORY_DIS[cat] ?? cat) : "—",
          severity: sev,
          severityTone: SEVERITY_TONE[sev] ?? "neutral",
          severityDis: SEVERITY_DIS[sev] ?? sev,
          status: st,
          statusDis: ANOMALY_STATUS_DIS[st] ?? st,
          subjectDis: str(d, "emSubjectDis") ?? ref(d, "emSubjectRef"),
          period: str(d, "emPeriod"),
          ts: dt(d, "ts"),
          val: num(d, "emVal"),
          expected: num(d, "emExpected"),
          deviation: num(d, "emDeviation"),
          ackBy: str(d, "emAckBy"),
          canAck: st === "open",
          canDispatch: st === "open" || st === "acked",
        };
      })
      .filter((r) => (category ? r.category === category : true))
      .filter((r) => (status ? r.status === status : true));
  }

  fmtNum = fmtNum;
  fmtPct = fmtPct;
  fmtTs = fmtTs;
}
