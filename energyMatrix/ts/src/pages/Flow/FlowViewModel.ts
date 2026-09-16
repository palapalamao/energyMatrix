import { makeObservable, observable, runInAction } from "mobx";
import type { HClient, HDict } from "@/api/client";
import { BaseStore } from "@/mvvm/base/BaseStore";
import { BaseViewModel } from "@/mvvm/base/BaseViewModel";
import {
  emMeterTree,
  emLedgerAggregate,
  id as emId,
  num,
  ref,
  str,
  unitOf,
  type EmSpan,
} from "@/api/emApi";
import {
  buildSankey,
  type FlowGraph,
  type FlowMeterNode,
  type FlowMeterTotal,
} from "./flowGraph";

/**
 * 能流图的 Store + ViewModel。
 *
 * 两个数据源在 Store 里合并（结构 emMeterTree + 数值 emLedgerAggregate
 * dim="meter"），经纯函数 buildSankey 变成 recharts Sankey 的 {nodes, links}。
 * 本屏只读，没有写路径。
 */

export class FlowStore extends BaseStore {
  private client?: HClient;

  graph: FlowGraph | undefined = undefined;
  loading = false;
  error: string | undefined = undefined;

  constructor() {
    super();
    makeObservable(this, {
      graph: observable,
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
      const [treeRows, totalRows] = await Promise.all([
        emMeterTree(client, siteRef, medium),
        emLedgerAggregate(client, siteRef, span, "meter", medium),
      ]);
      const meters: FlowMeterNode[] = treeRows.map((d: HDict) => ({
        id: emId(d) ?? "",
        dis: str(d, "dis") ?? emId(d) ?? "",
        medium: str(d, "emMedium"),
        role: str(d, "emMeterRole"),
        parentId: ref(d, "submeterOf"),
        isVirtual: !!d.get("emVirtual"),
        isGap: !!d.get("emGap"),
      }));
      const totals: FlowMeterTotal[] = totalRows.map((d: HDict) => ({
        // 聚合结果按维度分组，dim 列在 dim="meter" 时就是表计 ref。
        id: ref(d, "dim") ?? "",
        val: num(d, "val"),
        unit: unitOf(d, "val"),
      }));
      const graph = buildSankey(meters, totals, this.gapSinkName ?? "不明用能");
      runInAction(() => {
        this.graph = graph;
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

  /** 缺口汇点名由 ViewModel 注入（i18n），load 前必须设置。 */
  gapSinkName: string | undefined = undefined;
}

export class FlowViewModel extends BaseViewModel<FlowStore> {
  get loading(): boolean {
    return this.store.loading;
  }
  get error(): string | undefined {
    return this.store.error;
  }
  get graph(): FlowGraph | undefined {
    return this.store.graph;
  }

  load(siteRef: string, span: EmSpan, medium?: string): Promise<void> {
    this.store.gapSinkName = this.t("flow.gapSink", "不明用能");
    return this.store.load(siteRef, span, medium);
  }
}
