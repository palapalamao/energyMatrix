import { makeObservable, observable, runInAction } from "mobx";
import type { HClient, HDict } from "@/api/client";
import { BaseStore } from "@/mvvm/base/BaseStore";
import { BaseViewModel } from "@/mvvm/base/BaseViewModel";
import {
  emSavingsProjects,
  emWorkOrderUpdate,
  emWorkOrders,
  date,
  dt,
  id as recId,
  num,
  ref,
  str,
} from "@/api/emApi";
import {
  CATEGORY_DIS,
  SEVERITY_DIS,
  SEVERITY_TONE,
  WO_STATUS_DIS,
  WO_STATUS_ORDER,
  fmtTs,
} from "@/pages/shared";
import type { Tone } from "@/components/Bits";

/**
 * 工单管理。
 *
 * 状态**只能沿流程往前走**（new → assigned → inProgress → done → closed）。
 * 后端会拒绝回退，前端也就不该把回退按钮画出来 —— 画了再被拒，用户只会觉得
 * 系统坏了。允许任意跳转的状态机等于没有状态机。
 *
 * 转 done / closed 时后端会把工单带的异常一并置为 resolved：单子关了异常还
 * 挂着，告警列表就会越积越长，最后没人看。
 */

export class WorkOrderStore extends BaseStore {
  private client: HClient | undefined = undefined;

  orders: HDict[] = [];
  projects: HDict[] = [];
  loading = false;
  error: string | undefined = undefined;
  busyId: string | undefined = undefined;

  constructor() {
    super();
    makeObservable(this, {
      orders: observable,
      projects: observable,
      loading: observable,
      error: observable,
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
      const [orders, projects] = await Promise.all([
        emWorkOrders(client, siteRef),
        emSavingsProjects(client, siteRef),
      ]);
      runInAction(() => {
        this.orders = orders;
        this.projects = projects;
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

  async advance(
    siteRef: string,
    woId: string,
    status: string,
    result?: string,
    savingsProjectRef?: string
  ): Promise<void> {
    const client = this.client;
    if (!client) return;
    runInAction(() => {
      this.busyId = woId;
      this.error = undefined;
    });
    try {
      await emWorkOrderUpdate(client, woId, status, result, savingsProjectRef);
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
}

export interface WorkOrderRow {
  id: string;
  orderNo?: string;
  dis: string;
  status: string;
  statusDis: string;
  category?: string;
  categoryDis: string;
  severity?: string;
  severityTone: Tone;
  severityDis: string;
  assignee?: string;
  dueDate?: string;
  subjectDis?: string;
  anomalyCount?: number;
  ts?: string;
  result?: string;
  savingsProjectRef?: string;
  /** 下一个允许的状态；已到 closed 时为 undefined。 */
  nextStatus?: string;
  nextStatusDis?: string;
  /** 逾期：有到期日且已过期，且还没完成。 */
  overdue: boolean;
}

export class WorkOrderViewModel extends BaseViewModel<WorkOrderStore> {
  get loading(): boolean {
    return this.store.loading;
  }
  get error(): string | undefined {
    return this.store.error;
  }
  get busyId(): string | undefined {
    return this.store.busyId;
  }

  load(siteRef: string): void {
    void this.store.load(siteRef);
  }
  advance(
    siteRef: string,
    id: string,
    status: string,
    result?: string,
    project?: string
  ): void {
    void this.store.advance(siteRef, id, status, result, project);
  }

  /** 可选的节能项目（工单闭环去向）。 */
  get projectOptions(): { id: string; dis: string }[] {
    return this.store.projects.map((p) => ({
      id: recId(p) ?? "",
      dis: str(p, "dis") ?? "",
    }));
  }

  get rows(): WorkOrderRow[] {
    const today = new Date().toISOString().slice(0, 10);
    return this.store.orders.map((d) => {
      const status = str(d, "emWorkOrderStatus") ?? "new";
      const sev = str(d, "emSeverity") ?? "info";
      const cat = str(d, "emCategory");
      const i = WO_STATUS_ORDER.indexOf(status as (typeof WO_STATUS_ORDER)[number]);
      const next = i >= 0 && i < WO_STATUS_ORDER.length - 1 ? WO_STATUS_ORDER[i + 1] : undefined;
      const due = date(d, "emDueDate");
      return {
        id: recId(d) ?? "",
        orderNo: str(d, "emOrderNo"),
        dis: str(d, "dis") ?? "",
        status,
        statusDis: WO_STATUS_DIS[status] ?? status,
        category: cat,
        categoryDis: cat ? (CATEGORY_DIS[cat] ?? cat) : "—",
        severity: sev,
        severityTone: SEVERITY_TONE[sev] ?? "neutral",
        severityDis: SEVERITY_DIS[sev] ?? sev,
        assignee: str(d, "emAssignee"),
        dueDate: due,
        subjectDis: str(d, "emSubjectDis") ?? ref(d, "emSubjectRef"),
        anomalyCount: num(d, "emAnomalyCount"),
        ts: dt(d, "ts"),
        result: str(d, "emResult"),
        savingsProjectRef: ref(d, "emSavingsProjectRef"),
        nextStatus: next,
        nextStatusDis: next ? WO_STATUS_DIS[next] : undefined,
        overdue: !!due && due < today && status !== "done" && status !== "closed",
      };
    });
  }

  /** 看板列：五个状态各一列，空列也保留 —— 看板的形状本身就是状态流。 */
  get columns(): { key: string; dis: string; rows: WorkOrderRow[] }[] {
    const rows = this.rows;
    return WO_STATUS_ORDER.map((k) => ({
      key: k,
      dis: WO_STATUS_DIS[k],
      rows: rows.filter((r) => r.status === k),
    }));
  }

  get overdueCount(): number {
    return this.rows.filter((r) => r.overdue).length;
  }

  get openCount(): number {
    return this.rows.filter((r) => r.status !== "closed" && r.status !== "done").length;
  }

  fmtTs = fmtTs;
}
