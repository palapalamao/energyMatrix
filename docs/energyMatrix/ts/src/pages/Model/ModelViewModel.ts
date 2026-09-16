import { makeObservable, observable, runInAction } from "mobx";
import type { HClient, HDict } from "@/api/client";
import { BaseStore } from "@/mvvm/base/BaseStore";
import { BaseViewModel } from "@/mvvm/base/BaseViewModel";
import {
  emAddFloor,
  emAddGapMeter,
  emAddLoadGroup,
  emAddMeter,
  emAddSite,
  emAddTenant,
  emAddVirtualMeter,
  emAddZone,
  emAttachLoad,
  emEnums,
  emEntityDelete,
  emEntityDetail,
  emEntityPoints,
  emEntityUpdate,
  emEntityValidate,
  emModelTree,
  emUnboundEquips,
  has,
  id as emId,
  num,
  ref,
  str,
  type NodeKind,
  type TagValue,
} from "@/api/emApi";
import { fieldsFor, groupedFields, tagTypesFor } from "./fieldSchema";
import type { CreateSpec } from "./createSpec";

/**
 * 「数据模型配置」屏的 Store + ViewModel。
 *
 * 这一屏是 FIN 设备树的建立入口：左侧资产树，右侧属性 / 点位 / 校验三页签，
 * 顶部是各类实体的新建入口。所有写操作都走后端的守卫（改 modelId、改已入账
 * 表计的介质、删被已关账条目引用的表都会被拒），前端**不重复实现**这些判断，
 * 只负责把后端的报错原样显示出来 —— 两处各写一套规则迟早会不一致。
 */

export interface TreeRow {
  id: string;
  dis: string;
  kind: NodeKind;
  group: string;
  parentId?: string;
  depth: number;
  childCount: number;
  orphan: boolean;
  medium?: string;
  role?: string;
  virtual: boolean;
  gap: boolean;
  subItem?: string;
}

export interface PointRow {
  id: string;
  dis: string;
  kind?: string;
  unit?: string;
  his: boolean;
  l1: boolean;
  delta: boolean;
  touPeriod?: string;
  bound: boolean;
}

export interface IssueRow {
  level: string;
  code: string;
  msg: string;
  rule: string;
}

export class ModelStore extends BaseStore {
  private client?: HClient;

  // observable 字段必须带初始化器（见 BaseStore 的说明）
  tree: HDict[] = [];
  enums: Record<string, string[]> = {};
  selectedId: string | undefined = undefined;
  detail: HDict | undefined = undefined;
  points: HDict[] = [];
  issues: HDict[] = [];
  unboundEquips: HDict[] = [];
  loadingTree = false;
  loadingDetail = false;
  submitting = false;
  error: string | undefined = undefined;
  notice: string | undefined = undefined;

  constructor() {
    super();
    makeObservable(this, {
      tree: observable,
      enums: observable,
      selectedId: observable,
      detail: observable,
      points: observable,
      issues: observable,
      unboundEquips: observable,
      loadingTree: observable,
      loadingDetail: observable,
      submitting: observable,
      error: observable,
      notice: observable,
    });
  }

  override initialize(client: HClient): void {
    this.client = client;
    this.initialized = true;
  }

  private fail(e: unknown): void {
    runInAction(() => {
      this.error = e instanceof Error ? e.message : String(e);
    });
  }

  async loadTree(siteRef?: string): Promise<void> {
    const client = this.client;
    if (!client) return;
    runInAction(() => {
      this.loadingTree = true;
      this.error = undefined;
    });
    try {
      const [tree, enums, equips] = await Promise.all([
        emModelTree(client, siteRef),
        Object.keys(this.enums).length ? Promise.resolve(this.enums) : emEnums(client),
        siteRef ? emUnboundEquips(client, siteRef) : Promise.resolve([] as HDict[]),
      ]);
      runInAction(() => {
        this.tree = tree;
        this.enums = enums;
        this.unboundEquips = equips;
      });
    } catch (e: unknown) {
      this.fail(e);
    } finally {
      runInAction(() => {
        this.loadingTree = false;
      });
    }
  }

  async select(entityId: string): Promise<void> {
    const client = this.client;
    if (!client) return;
    runInAction(() => {
      this.selectedId = entityId;
      this.loadingDetail = true;
      this.error = undefined;
    });
    try {
      const [detail, points, issues] = await Promise.all([
        emEntityDetail(client, entityId),
        emEntityPoints(client, entityId),
        emEntityValidate(client, entityId),
      ]);
      runInAction(() => {
        this.detail = detail;
        this.points = points;
        this.issues = issues;
      });
    } catch (e: unknown) {
      this.fail(e);
    } finally {
      runInAction(() => {
        this.loadingDetail = false;
      });
    }
  }

  /** 保存属性修改。失败时把后端的原话显示出来（那里面写了拒绝的理由）。 */
  async save(entityId: string, kind: NodeKind, changes: Record<string, TagValue>): Promise<boolean> {
    const client = this.client;
    if (!client) return false;
    runInAction(() => {
      this.submitting = true;
      this.error = undefined;
      this.notice = undefined;
    });
    try {
      await emEntityUpdate(client, entityId, changes, tagTypesFor(kind));
      runInAction(() => {
        this.notice = "已保存";
      });
      return true;
    } catch (e: unknown) {
      this.fail(e);
      return false;
    } finally {
      runInAction(() => {
        this.submitting = false;
      });
    }
  }

  async remove(entityId: string, force: boolean): Promise<boolean> {
    const client = this.client;
    if (!client) return false;
    runInAction(() => {
      this.submitting = true;
      this.error = undefined;
      this.notice = undefined;
    });
    try {
      await emEntityDelete(client, entityId, force);
      runInAction(() => {
        this.selectedId = undefined;
        this.detail = undefined;
        this.notice = "已删除";
      });
      return true;
    } catch (e: unknown) {
      this.fail(e);
      return false;
    } finally {
      runInAction(() => {
        this.submitting = false;
      });
    }
  }

  /** 新建实体。返回新记录 id；失败返回 undefined 并把错误留在 error 上。 */
  async create(spec: CreateSpec): Promise<string | undefined> {
    const client = this.client;
    if (!client) return undefined;
    runInAction(() => {
      this.submitting = true;
      this.error = undefined;
      this.notice = undefined;
    });
    try {
      let newId = "";
      if (spec.what === "site") {
        newId = await emAddSite(client, spec.name, spec.args);
      } else if (spec.what === "floor") {
        newId = await emAddFloor(client, spec.siteRef, spec.name, spec.args);
      } else if (spec.what === "zone") {
        newId = await emAddZone(client, spec.siteRef, spec.name, spec.args);
      } else if (spec.what === "tenant") {
        newId = await emAddTenant(client, spec.parentRef, spec.name, spec.args);
      } else if (spec.what === "meter") {
        newId = await emAddMeter(client, spec.siteRef, spec.medium, spec.name, spec.args);
      } else if (spec.what === "virtualMeter") {
        newId = await emAddVirtualMeter(
          client, spec.siteRef, spec.medium, spec.formula, spec.name, spec.args);
      } else if (spec.what === "gapMeter") {
        newId = await emAddGapMeter(client, spec.siteRef, spec.sourceMeterRef, spec.name);
      } else if (spec.what === "loadGroup") {
        newId = await emAddLoadGroup(client, spec.siteRef, spec.name, spec.args);
      } else {
        await emAttachLoad(client, spec.equipRef, spec.args);
        newId = spec.equipRef;
      }
      runInAction(() => {
        this.notice = "已创建";
      });
      return newId;
    } catch (e: unknown) {
      this.fail(e);
      return undefined;
    } finally {
      runInAction(() => {
        this.submitting = false;
      });
    }
  }

  clearMessages(): void {
    runInAction(() => {
      this.error = undefined;
      this.notice = undefined;
    });
  }
}

export class ModelViewModel extends BaseViewModel<ModelStore> {
  get loadingTree(): boolean { return this.store.loadingTree; }
  get loadingDetail(): boolean { return this.store.loadingDetail; }
  get submitting(): boolean { return this.store.submitting; }
  get error(): string | undefined { return this.store.error; }
  get notice(): string | undefined { return this.store.notice; }
  get selectedId(): string | undefined { return this.store.selectedId; }
  get enums(): Record<string, string[]> { return this.store.enums; }

  loadTree(siteRef?: string): void { void this.store.loadTree(siteRef); }
  select(entityId: string): void { void this.store.select(entityId); }
  clearMessages(): void { this.store.clearMessages(); }

  async save(changes: Record<string, TagValue>): Promise<boolean> {
    const id = this.selectedId;
    const kind = this.selectedKind;
    if (!id || !kind) return false;
    const ok = await this.store.save(id, kind, changes);
    if (ok) {
      await this.store.select(id);
      await this.store.loadTree(this.lastSiteRef);
    }
    return ok;
  }

  async remove(force: boolean): Promise<boolean> {
    const id = this.selectedId;
    if (!id) return false;
    const ok = await this.store.remove(id, force);
    if (ok) await this.store.loadTree(this.lastSiteRef);
    return ok;
  }

  async create(spec: CreateSpec): Promise<boolean> {
    const newId = await this.store.create(spec);
    if (!newId) return false;
    await this.store.loadTree(this.lastSiteRef);
    await this.store.select(newId);
    return true;
  }

  /** 最近一次加载树用的站点 —— 保存/删除后按同一范围刷新。 */
  lastSiteRef: string | undefined = undefined;

  // ── 树 ────────────────────────────────────────────────────────────

  get rows(): TreeRow[] {
    return this.store.tree.map((d) => ({
      id: emId(d) ?? "",
      dis: str(d, "dis") ?? "—",
      kind: (str(d, "emNodeKind") ?? "site") as NodeKind,
      group: str(d, "emGroup") ?? "space",
      parentId: ref(d, "emParentId"),
      depth: num(d, "emDepth") ?? 0,
      childCount: num(d, "emChildCount") ?? 0,
      orphan: has(d, "emOrphan"),
      medium: str(d, "emMedium"),
      role: str(d, "emMeterRole"),
      virtual: has(d, "emVirtual"),
      gap: has(d, "emGap"),
      subItem: str(d, "emSubItem"),
    }));
  }

  /**
   * 按分组与关键词过滤。
   *
   * 命中的节点会**连同它的所有上级一起保留** —— 否则子节点会失去上下文浮在
   * 顶层，用户看到一堆不知道挂在哪的表，比不过滤还难用。
   */
  filteredRows(group: string, keyword = ""): TreeRow[] {
    const all = this.rows;
    const kw = keyword.trim().toLowerCase();
    if (group === "all" && !kw) return all;

    const byId = new Map(all.map((r) => [r.id, r]));
    const keep = new Set<string>();
    for (const r of all) {
      if (group !== "all" && r.group !== group) continue;
      if (kw && !r.dis.toLowerCase().includes(kw)) continue;
      keep.add(r.id);
      let p = r.parentId;
      let guard = 0;
      while (p && !keep.has(p) && guard++ < 64) {
        keep.add(p);
        p = byId.get(p)?.parentId;
      }
    }
    return all.filter((r) => keep.has(r.id));
  }

  // ── 详情 ──────────────────────────────────────────────────────────

  get selectedRec(): HDict | undefined {
    return this.store.detail?.get<HDict>("rec");
  }

  get selectedKind(): NodeKind | undefined {
    const d = this.store.detail;
    return d ? ((str(d, "emNodeKind") ?? undefined) as NodeKind | undefined) : undefined;
  }

  get selectedDis(): string {
    const rec = this.selectedRec;
    return rec ? (str(rec, "dis") ?? "—") : "—";
  }

  get modelId(): string | undefined {
    const d = this.store.detail;
    return d ? str(d, "emModelId") : undefined;
  }

  /** 删除前的影响面：子点位数与已入账条目数。 */
  get impact(): { points: number; ledger: number } {
    const d = this.store.detail;
    return {
      points: d ? (num(d, "emPointCount") ?? 0) : 0,
      ledger: d ? (num(d, "emLedgerCount") ?? 0) : 0,
    };
  }

  get fields() {
    const k = this.selectedKind;
    return k ? fieldsFor(k) : [];
  }

  /** 按分组拆开的字段，供属性表单分节渲染。 */
  get fieldGroups() {
    const k = this.selectedKind;
    return k ? groupedFields(k) : [];
  }

  /** 树里某种对象的数量，用于筛选器上的计数。 */
  countOf(kind: NodeKind): number {
    return this.rows.filter((r) => r.kind === kind).length;
  }

  /** 取记录上某个标签的当前值，转成表单能用的原始值。 */
  fieldValue(tag: string, type: string): TagValue {
    const rec = this.selectedRec;
    if (!rec) return undefined;
    if (type === "marker") return has(rec, tag);
    if (type === "num") return num(rec, tag);
    if (type === "ref") return ref(rec, tag);
    const v = rec.get(tag);
    if (v === undefined || v === null) return undefined;
    return str(rec, tag) ?? v.toString();
  }

  /** 某个 ref 字段的候选项（从当前树里挑对应类型的节点）。 */
  refOptions(kind: NodeKind): TreeRow[] {
    return this.rows.filter((r) => r.kind === kind && r.id !== this.selectedId);
  }

  enumOptions(name?: string): string[] {
    return name ? (this.store.enums[name] ?? []) : [];
  }

  // ── 点位 ──────────────────────────────────────────────────────────

  get pointRows(): PointRow[] {
    return this.store.points.map((d) => ({
      id: emId(d) ?? "",
      dis: str(d, "dis") ?? "—",
      kind: str(d, "kind"),
      unit: str(d, "unit"),
      his: has(d, "his"),
      l1: has(d, "emL1Point"),
      delta: has(d, "emDelta"),
      touPeriod: str(d, "emTouPeriod"),
      bound: has(d, "emBound"),
    }));
  }

  /** 没有 L1 点的实体表算不出台账 —— 点位页签要把这件事顶到最前面。 */
  get missingL1(): boolean {
    if (this.selectedKind !== "meter") return false;
    const rec = this.selectedRec;
    if (rec && has(rec, "emVirtual")) return false;
    return !this.pointRows.some((p) => p.l1);
  }

  // ── 校验 ──────────────────────────────────────────────────────────

  get issueRows(): IssueRow[] {
    const order: Record<string, number> = { err: 0, warn: 1, info: 2 };
    return this.store.issues
      .map((d) => ({
        level: str(d, "level") ?? "info",
        code: str(d, "code") ?? "?",
        msg: str(d, "msg") ?? "",
        rule: str(d, "rule") ?? "",
      }))
      .sort((a, b) => (order[a.level] ?? 9) - (order[b.level] ?? 9));
  }

  get errorCount(): number {
    return this.issueRows.filter((i) => i.level === "err").length;
  }

  get warnCount(): number {
    return this.issueRows.filter((i) => i.level === "warn").length;
  }

  /** 可挂能耗身份的候选设备（还没挂过的 equip）。 */
  get unboundEquips(): { id: string; dis: string }[] {
    return this.store.unboundEquips.map((d) => ({
      id: emId(d) ?? "",
      dis: str(d, "dis") ?? str(d, "navName") ?? emId(d) ?? "—",
    }));
  }

  /** 当前树里的表计，供「缺口表的源表」「父表」等下拉。 */
  get meters(): TreeRow[] {
    return this.rows.filter((r) => r.kind === "meter");
  }
}
