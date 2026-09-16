import type { HClient } from "@/api/client";
import { HDate, HDateTime, HDict, HGrid, HList, HNum, HRef, HStr } from "@/api/client";
import { CREATE_REF_TAGS } from "@/api/emCreateRefTags";

/**
 * energyMatrix 后端 Axon 接口的薄封装。
 *
 * 三条硬规矩：
 *   1. **动态参数一律走 `.toAxon()`**，绝不把用户输入拼进表达式字符串 ——
 *      zinc 序列化会正确转义，手工拼接会产生 Axon 注入。
 *   2. 读字段一律 `dict.get<HType>(tag)?.value`；marker 用 `!!dict.get(tag)`。
 *      不要 `String(hval)`，也不要直接读 `.value` 之外的内部字段。
 *   3. 只调 `client.ext.eval`，不混用 `client.ext.read` —— 同一个 pod 里
 *      两种范式混着用会让"数据从哪来"变得难追。
 */

/** 账期。后端签名是 `haystack::Span`，Axon 侧用 `toSpan(start, end)` 构造。 */
export interface EmSpan {
  /** ISO 日期，含 */
  start: string;
  /** ISO 日期，不含（左闭右开） */
  end: string;
}

/**
 * 把账期转成 Axon 表达式片段。
 *
 * 两个坑：
 *   1. `toSpan(x, tz)` 的**第二个参数是时区**，不是结束日期。写成
 *      `toSpan(start, end)` 会把日期当时区传进去。正确写法是传一个日期区间
 *      `toSpan(start..end)`。
 *   2. Axon 的日期区间 `a..b` 是**闭区间**，而这里的 `end` 是开区间的右端
 *      （与后端 Span 一致）—— 所以要减一天再拼。
 */
export function spanExpr(span: EmSpan): string {
  return `toSpan(${span.start}..${shiftDays(span.end, -1)})`;
}

/** ISO 日期加减天数，只做日期运算不碰时区。 */
function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 账期长度（天）。左闭右开，所以直接相减就是天数。 */
export function spanDays(span: EmSpan): number {
  const a = Date.parse(`${span.start}T00:00:00Z`);
  const b = Date.parse(`${span.end}T00:00:00Z`);
  return Math.max(1, Math.round((b - a) / 86400000));
}

/** 紧邻其前的等长账期（环比的分母）。 */
export function prevSpan(span: EmSpan): EmSpan {
  const n = spanDays(span);
  return { start: shiftDays(span.start, -n), end: shiftDays(span.end, -n) };
}

/**
 * 去年同期（同比的分母）。
 * 按 365 天平移而不是改年份 —— 平移后账期长度恒等，闰年不会让分母多一天。
 */
export function lastYearSpan(span: EmSpan): EmSpan {
  return { start: shiftDays(span.start, -365), end: shiftDays(span.end, -365) };
}

/** 从 Grid 里安全取一列的数值；缺失返回 undefined 而不是 0。 */
export function num(dict: HDict, tag: string): number | undefined {
  return dict.get<HNum>(tag)?.value;
}

/**
 * 数值列的单位符号。
 *
 * `HNum.unit` 是一个 `HUnit` 对象（不是字符串），`String(u)` 才是 `kWh` / `m³`。
 * 单位要从**数据**里读而不是按介质硬编一张表 —— 现场把电表配成 MWh 时，
 * 硬编表会让页面上的数字和单位对不上号。
 */
export function unitOf(dict: HDict, tag: string): string | undefined {
  const u = dict.get<HNum>(tag)?.unit;
  return u ? String(u) : undefined;
}

/** 从 Grid 里安全取一列的字符串。 */
export function str(dict: HDict, tag: string): string | undefined {
  return dict.get<HStr>(tag)?.value;
}

/** DateTime 标签 → ISO 文本。HDateTime.value 本身就是 ISO 字符串。 */
export function dt(dict: HDict, tag: string): string | undefined {
  return dict.get<HDateTime>(tag)?.value;
}

/** Date 标签 → ISO 日期文本（yyyy-MM-dd）。 */
export function date(dict: HDict, tag: string): string | undefined {
  return dict.get<HDate>(tag)?.value;
}

/** 从 Grid 里安全取一列的 Ref。 */
export function ref(dict: HDict, tag: string): string | undefined {
  return dict.get<HRef>(tag)?.value;
}

/** 记录 id。haystack-core 的 `dict.id` 类型太宽，统一走 get<HRef>。 */
export function id(dict: HDict): string | undefined {
  return dict.get<HRef>("id")?.value;
}

/** marker 存在性。 */
export function has(dict: HDict, tag: string): boolean {
  return !!dict.get(tag);
}

/** Grid → 行数组，方便在 React 里 map。 */
export function rows(grid: HGrid): HDict[] {
  return grid.getRows();
}

// ──────────────────────────────────────────────────────────────────────────
// 通用
// ──────────────────────────────────────────────────────────────────────────

/** pod 身份探针。各页 mount 时调一次，确认后端在线。 */
export async function emInfo(client: HClient): Promise<HDict | undefined> {
  const g = await client.ext.eval("emInfo()");
  return g.first ?? undefined;
}

/** 本项目的全部 energyMatrix 站点。 */
export async function emSites(client: HClient): Promise<HDict[]> {
  return rows(await client.ext.eval("readAll(energyMatrix and site)"));
}

// ──────────────────────────────────────────────────────────────────────────
// 域 2 · 计量
// ──────────────────────────────────────────────────────────────────────────

/** 站点计量树（扁平行）。medium 为空表示全部介质。 */
export async function emMeterTree(
  client: HClient,
  siteRef: string,
  medium?: string
): Promise<HDict[]> {
  const m = medium ? `, ${HStr.make(medium).toAxon()}` : "";
  return rows(await client.ext.eval(`emMeterTree(${HRef.make(siteRef).toAxon()}${m})`));
}

/** 计量树校验结果。空数组表示结构合格。 */
export async function emMeterTreeValidate(
  client: HClient,
  siteRef: string
): Promise<HDict[]> {
  return rows(await client.ext.eval(`emMeterTreeValidate(${HRef.make(siteRef).toAxon()})`));
}

/** 站点各介质的缺口校核（平衡校核卡）。 */
export async function emSiteGaps(
  client: HClient,
  siteRef: string,
  span: EmSpan
): Promise<HDict[]> {
  return rows(
    await client.ext.eval(`emSiteGaps(${HRef.make(siteRef).toAxon()}, ${spanExpr(span)})`)
  );
}

/** 站点总体缺口率（关账闸门的判据）。 */
export async function emSiteGapRatio(
  client: HClient,
  siteRef: string,
  span: EmSpan
): Promise<number | undefined> {
  const g = await client.ext.eval(
    `emSiteGapRatio(${HRef.make(siteRef).toAxon()}, ${spanExpr(span)})`
  );
  // Axon 返回标量时会被包成单行单列 Grid，列名 val。
  return g.first?.get<HNum>("val")?.value;
}

// ──────────────────────────────────────────────────────────────────────────
// 域 5 · 台账
// ──────────────────────────────────────────────────────────────────────────

/** 按维度聚合台账。dim ∈ subItem|medium|space|tenant|org|meter|period。 */
export async function emLedgerAggregate(
  client: HClient,
  siteRef: string,
  span: EmSpan,
  dim: string,
  medium?: string
): Promise<HDict[]> {
  const m = medium ? `, ${HStr.make(medium).toAxon()}` : "";
  return rows(
    await client.ext.eval(
      `emLedgerAggregate(${HRef.make(siteRef).toAxon()}, ${spanExpr(span)}, ` +
        `${HStr.make(dim).toAxon()}${m})`
    )
  );
}

/** 数据来源分布（数据可信度卡）。 */
export async function emLedgerSourceMix(
  client: HClient,
  siteRef: string,
  span: EmSpan
): Promise<HDict[]> {
  return rows(
    await client.ext.eval(`emLedgerSourceMix(${HRef.make(siteRef).toAxon()}, ${spanExpr(span)})`)
  );
}

/** 站点的关账批次记录。 */
export async function emClosePeriods(client: HClient, siteRef: string): Promise<HDict[]> {
  return rows(await client.ext.eval(`emClosePeriods(${HRef.make(siteRef).toAxon()})`));
}

/**
 * 关账（或关账预检）。
 *
 * 返回的 Grid meta 携带 status / emGapRatio / emThreshold / emEntryCount / msg。
 * status ∈ closed | blocked | incomplete | alreadyClosed | dryRun。
 * 调用方必须读 meta 而不是只看 rows —— 被闸门挡下时 rows 是未平衡表计清单。
 */
export async function emClosePeriod(
  client: HClient,
  siteRef: string,
  span: EmSpan,
  granularity = "daily",
  dryRun = true
): Promise<HGrid> {
  return client.ext.eval(
    `emClosePeriod(${HRef.make(siteRef).toAxon()}, ${spanExpr(span)}, ` +
      `${HStr.make(granularity).toAxon()}, null, ${dryRun})`
  );
}

/**
 * 台账二维交叉表（账期 × 分项这类堆叠图的数据源）。
 *
 * 返回整个 Grid —— 列名清单在 **meta.emCols**（按合计降序），rows 里缺格是
 * null 而不是 0。一次取完，不要按分项发 N 次 `emLedgerAggregate` 再在前端
 * 对齐账期：每个分项的账期集合可能不一样，对齐逻辑写在前端很容易错位。
 */
export async function emLedgerCrosstab(
  client: HClient,
  subjectRef: string,
  span: EmSpan,
  rowDim: string,
  colDim: string,
  medium?: string
): Promise<HGrid> {
  const m = medium ? `, ${HStr.make(medium).toAxon()}` : "";
  return client.ext.eval(
    `emLedgerCrosstab(${HRef.make(subjectRef).toAxon()}, ${spanExpr(span)}, ` +
      `${HStr.make(rowDim).toAxon()}, ${HStr.make(colDim).toAxon()}${m})`
  );
}

/**
 * 折标煤合计（综合能耗，tce）。
 *
 * 与 `emCarbonAccount` 同形：**逐介质明细在 rows，合计在 meta**
 * （val / unit / emYear / emMissing）。只读 rows 会把第一个介质的数字
 * 当成全楼合计。
 */
export async function emCoalEquivalent(
  client: HClient,
  subjectRef: string,
  span: EmSpan
): Promise<HGrid> {
  return client.ext.eval(
    `emCoalEquivalent(${HRef.make(subjectRef).toAxon()}, ${spanExpr(span)})`
  );
}

/** 台账条目明细。 */
export async function emLedgerEntries(
  client: HClient,
  siteRef: string,
  span: EmSpan,
  medium?: string
): Promise<HDict[]> {
  const m = medium ? `, ${HStr.make(medium).toAxon()}` : "";
  return rows(
    await client.ext.eval(
      `emLedgerEntries(${HRef.make(siteRef).toAxon()}, ${spanExpr(span)}${m})`
    )
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 建模器（「数据模型配置」屏）
// ──────────────────────────────────────────────────────────────────────────

/** 资产树节点类型。 */
export type NodeKind = "site" | "floor" | "zone" | "meter" | "load" | "tenant";

/** 左侧筛选分组。 */
export type NodeGroup = "space" | "metering" | "equip" | "org";

/** 属性表单里一个字段的值。undefined 表示"删除这个标签"。 */
export type TagValue = string | number | boolean | undefined;

/** 各标签的写入类型 —— 决定 `changesExpr` 生成哪种 Axon 字面量。 */
export interface TagTypes {
  /** Ref 型标签（submeterOf / emMeterRef …）。 */
  ref?: string[];
  /** Date 型标签（emInstallDate）。Axon 的日期字面量不带引号。 */
  date?: string[];
  /** Marker 型标签（emSettlement）。true → marker()，false → removeMarker()。 */
  marker?: string[];
}

/**
 * 把表单值转成 Axon Dict 字面量。
 *
 * `undefined` → `removeMarker()`：Folio 的 Diff 用它表示**删除标签**，
 * 与"没传这个键"（保持不变）是两回事 —— UI 上分别对应"清空"与"没动过"。
 *
 * 类型必须按标签区分，不能只看 JS 值的 typeof：
 *   - Ref 用 `HRef.make(...).toAxon()`，不要手拼 `@` —— 记录 id 可能带项目前缀
 *     （`p:proj:r:xxxx`），手拼会漏掉
 *   - Date 在 Axon 里是不带引号的字面量 `2026-07-01`，当字符串写进去会变成 Str
 *   - Marker 写 `marker()`，写 `true` 会变成 Bool，filter 里 `and emSettlement`
 *     仍然匹配得上，但类型是错的，后续按 marker 语义处理时会出问题
 */
export function changesExpr(
  changes: Record<string, TagValue>,
  types: TagTypes = {}
): string {
  const isRef = (k: string) => types.ref?.includes(k) ?? false;
  const isDate = (k: string) => types.date?.includes(k) ?? false;
  const isMarker = (k: string) => types.marker?.includes(k) ?? false;

  const parts: string[] = [];
  for (const [k, v] of Object.entries(changes)) {
    if (v === undefined) {
      parts.push(`${k}: removeMarker()`);
    } else if (isMarker(k)) {
      parts.push(`${k}: ${v ? "marker()" : "removeMarker()"}`);
    } else if (isRef(k)) {
      parts.push(`${k}: ${HRef.make(String(v)).toAxon()}`);
    } else if (isDate(k)) {
      // 只接受 ISO 日期，挡掉把任意字符串当日期塞进 Axon 表达式
      const d = String(v);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`${k} 不是合法日期：${d}`);
      parts.push(`${k}: ${d}`);
    } else if (typeof v === "number") {
      parts.push(`${k}: ${HNum.make(v).toAxon()}`);
    } else if (typeof v === "boolean") {
      parts.push(`${k}: ${v}`);
    } else {
      parts.push(`${k}: ${HStr.make(v).toAxon()}`);
    }
  }
  return `{${parts.join(", ")}}`;
}

/** 资产树（扁平行）。siteRef 省略 = 整个项目。 */
export async function emModelTree(client: HClient, siteRef?: string): Promise<HDict[]> {
  const arg = siteRef ? HRef.make(siteRef).toAxon() : "";
  return rows(await client.ext.eval(`emModelTree(${arg})`));
}

/** 实体详情（含删除/改介质的影响面）。 */
export async function emEntityDetail(
  client: HClient,
  entityId: string
): Promise<HDict | undefined> {
  const g = await client.ext.eval(`emEntityDetail(${HRef.make(entityId).toAxon()})`);
  return g.first ?? undefined;
}

/** 实体的子点位。 */
export async function emEntityPoints(client: HClient, entityId: string): Promise<HDict[]> {
  return rows(await client.ext.eval(`emEntityPoints(${HRef.make(entityId).toAxon()})`));
}

/** 逐实体铁律校验。 */
export async function emEntityValidate(client: HClient, entityId: string): Promise<HDict[]> {
  return rows(await client.ext.eval(`emEntityValidate(${HRef.make(entityId).toAxon()})`));
}

/** 更新实体属性。后端会拒绝改 modelId、非法枚举、已入账表计的介质。 */
export async function emEntityUpdate(
  client: HClient,
  entityId: string,
  changes: Record<string, TagValue>,
  types: TagTypes = {}
): Promise<void> {
  await client.ext.eval(
    `emEntityUpdate(${HRef.make(entityId).toAxon()}, ${changesExpr(changes, types)})`
  );
}

/** 删除实体。被已关账条目引用的表**永远**删不掉，force 也不行。 */
export async function emEntityDelete(
  client: HClient,
  entityId: string,
  force = false
): Promise<void> {
  await client.ext.eval(`emEntityDelete(${HRef.make(entityId).toAxon()}, ${force})`);
}

/**
 * 全部枚举取值 —— 与后端共用一份真相，下拉框不再各写一份。
 *
 * 后端返回的是 Grid（列 name / values）而不是以枚举名为键的 Dict：
 * Dict 的键是 Haystack 标签名，必须小写开头，而枚举名是大驼峰（EmMedium），
 * 当键会让响应序列化直接失败。这里把 Grid 摊平成前端好用的字典。
 */
export async function emEnums(client: HClient): Promise<Record<string, string[]>> {
  const g = await client.ext.eval("emEnums()");
  const out: Record<string, string[]> = {};
  for (const row of rows(g)) {
    const name = str(row, "name");
    if (!name) continue;
    const list = row.get<HList>("values");
    out[name] = list ? list.toArray().map((v) => String((v as HStr)?.value ?? v)) : [];
  }
  return out;
}

// ── 建实体（模板实例化，全部走 EmEntityCrud）────────────────────────────

export async function emAddSite(
  client: HClient,
  name: string,
  args: Record<string, TagValue> = {}
): Promise<string> {
  const g = await client.ext.eval(
    `emAddSite(${HStr.make(name).toAxon()}, ${changesExpr(args)})`
  );
  return g.first?.get<HRef>("val")?.value ?? "";
}

export async function emAddFloor(
  client: HClient,
  siteRef: string,
  name: string,
  args: Record<string, TagValue> = {}
): Promise<string> {
  const g = await client.ext.eval(
    `emAddFloor(${HRef.make(siteRef).toAxon()}, ${HStr.make(name).toAxon()}, ${changesExpr(args)})`
  );
  return g.first?.get<HRef>("val")?.value ?? "";
}

export async function emAddZone(
  client: HClient,
  siteRef: string,
  name: string,
  args: Record<string, TagValue> = {}
): Promise<string> {
  const g = await client.ext.eval(
    `emAddZone(${HRef.make(siteRef).toAxon()}, ${HStr.make(name).toAxon()}, ${changesExpr(args, { ref: ["emTenantRef", "floorRef"] })})`
  );
  return g.first?.get<HRef>("val")?.value ?? "";
}

export async function emAddTenant(
  client: HClient,
  parentRef: string | undefined,
  name: string,
  args: Record<string, TagValue> = {}
): Promise<string> {
  const p = parentRef ? HRef.make(parentRef).toAxon() : "null";
  const g = await client.ext.eval(
    `emAddTenant(${p}, ${HStr.make(name).toAxon()}, ${changesExpr(args)})`
  );
  return g.first?.get<HRef>("val")?.value ?? "";
}

export async function emAddMeter(
  client: HClient,
  siteRef: string,
  medium: string,
  name: string,
  args: Record<string, TagValue> = {}
): Promise<string> {
  const g = await client.ext.eval(
    `emAddMeter(${HRef.make(siteRef).toAxon()}, ${HStr.make(medium).toAxon()}, ` +
      `${HStr.make(name).toAxon()}, ${changesExpr(args, { ref: [...CREATE_REF_TAGS.meter], date: ["emInstallDate"], marker: ["emSettlement"] })})`
  );
  return g.first?.get<HRef>("val")?.value ?? "";
}

export async function emAddVirtualMeter(
  client: HClient,
  siteRef: string,
  medium: string,
  formula: string,
  name: string,
  args: Record<string, TagValue> = {}
): Promise<string> {
  const g = await client.ext.eval(
    `emAddVirtualMeter(${HRef.make(siteRef).toAxon()}, ${HStr.make(medium).toAxon()}, ` +
      `${HStr.make(formula).toAxon()}, ${HStr.make(name).toAxon()}, ${changesExpr(args, { ref: [...CREATE_REF_TAGS.virtualMeter] })})`
  );
  return g.first?.get<HRef>("val")?.value ?? "";
}

export async function emAddGapMeter(
  client: HClient,
  siteRef: string,
  sourceMeterRef: string,
  name?: string
): Promise<string> {
  const n = name ? HStr.make(name).toAxon() : "null";
  const g = await client.ext.eval(
    `emAddGapMeter(${HRef.make(siteRef).toAxon()}, ${HRef.make(sourceMeterRef).toAxon()}, ${n})`
  );
  return g.first?.get<HRef>("val")?.value ?? "";
}

/** 给既有 equip 挂能耗身份（铁律 5：不新建设备）。 */
export async function emAttachLoad(
  client: HClient,
  equipRef: string,
  args: Record<string, TagValue> = {}
): Promise<void> {
  await client.ext.eval(
    `emAttachLoad(${HRef.make(equipRef).toAxon()}, ${changesExpr(args, { ref: ["emMeterRef", "emSpaceRef", "emTenantRef"] })})`
  );
}

/** 候选设备：还没挂能耗身份的 equip（供「挂载负荷」下拉）。 */
export async function emUnboundEquips(client: HClient, siteRef: string): Promise<HDict[]> {
  return rows(
    await client.ext.eval(
      `readAll(equip and not emLoad and not meter and siteRef==${HRef.make(siteRef).toAxon()})`
    )
  );
}

/** 新建用能设备组（无独立计量的批量对象）。 */
export async function emAddLoadGroup(
  client: HClient,
  siteRef: string,
  name: string,
  args: Record<string, TagValue> = {}
): Promise<string> {
  const g = await client.ext.eval(
    `emAddLoadGroup(${HRef.make(siteRef).toAxon()}, ${HStr.make(name).toAxon()}, ` +
      `${changesExpr(args, { ref: [...CREATE_REF_TAGS.loadGroup] })})`
  );
  return g.first?.get<HRef>("val")?.value ?? "";
}

// ──────────────────────────────────────────────────────────────────────────
// 表具与采集器管理
// ──────────────────────────────────────────────────────────────────────────

/** 表具台账。span 省略时不查台账，完好率列为空（这条路径更快）。 */
export async function emMeterInventory(
  client: HClient,
  siteRef: string,
  span?: EmSpan
): Promise<HDict[]> {
  const s = span ? `, ${spanExpr(span)}` : "";
  return rows(await client.ext.eval(`emMeterInventory(${HRef.make(siteRef).toAxon()}${s})`));
}

/** 表具台账统计。 */
export async function emMeterStats(
  client: HClient,
  siteRef: string,
  span?: EmSpan
): Promise<HDict | undefined> {
  const s = span ? `, ${spanExpr(span)}` : "";
  const g = await client.ext.eval(`emMeterStats(${HRef.make(siteRef).toAxon()}${s})`);
  return g.first ?? undefined;
}

/** 采集器清单（只列出带着本站点表计的）。 */
export async function emConnectors(client: HClient, siteRef: string): Promise<HDict[]> {
  return rows(await client.ext.eval(`emConnectors(${HRef.make(siteRef).toAxon()})`));
}

// ──────────────────────────────────────────────────────────────────────────
// 域 8 · 指标与定额
// ──────────────────────────────────────────────────────────────────────────

/** 指标定义表。 */
export async function emKpiDefs(client: HClient): Promise<HDict[]> {
  return rows(await client.ext.eval("emKpiDefs()"));
}

/** 某对象全部定额的执行进度。列含 level(ok|warn|over) 与 emLimitSource。 */
export async function emQuotaProgressAll(
  client: HClient,
  subjectRef: string,
  span: EmSpan
): Promise<HDict[]> {
  return rows(
    await client.ext.eval(
      `emQuotaProgressAll(${HRef.make(subjectRef).toAxon()}, ${spanExpr(span)})`
    )
  );
}

/**
 * 同一指标算一批对象。
 *
 * 单个对象算不出时该行 `val` 为 null、`err` 有值，其余行照常返回 ——
 * 排名表不该因为一个项目没填面积就整页打不开。
 */
export async function emKpiComputeAll(
  client: HClient,
  kpiCode: string,
  subjectRefs: string[],
  span: EmSpan
): Promise<HDict[]> {
  if (subjectRefs.length === 0) return [];
  const list = subjectRefs.map((r) => HRef.make(r).toAxon()).join(", ");
  return rows(
    await client.ext.eval(
      `emKpiComputeAll(${HStr.make(kpiCode).toAxon()}, [${list}], ${spanExpr(span)})`
    )
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 域 9 · 基线与核证
// ──────────────────────────────────────────────────────────────────────────

/** 节能项目清单。 */
export async function emSavingsProjects(
  client: HClient,
  subjectRef?: string
): Promise<HDict[]> {
  const a = subjectRef ? HRef.make(subjectRef).toAxon() : "";
  return rows(await client.ext.eval(`emSavingsProjects(${a})`));
}

/** 基线清单（含 R² / CV(RMSE) / NMBE 统计验收字段）。 */
export async function emBaselines(client: HClient, subjectRef?: string): Promise<HDict[]> {
  const a = subjectRef ? HRef.make(subjectRef).toAxon() : "";
  return rows(await client.ext.eval(`emBaselines(${a})`));
}

// ──────────────────────────────────────────────────────────────────────────
// 域 10 · 碳资产
// ──────────────────────────────────────────────────────────────────────────

/**
 * 碳账。返回整个 Grid —— Scope 1/2/3、总量、抵消、净排放都在 **meta** 上，
 * 只看 rows 会漏掉页面上最大的那几个数字。
 *
 * 不传 lock：页面查看碳账不应该锁因子版本（那是关账时的动作）。
 */
export async function emCarbonAccount(
  client: HClient,
  subjectRef: string,
  span: EmSpan
): Promise<HGrid> {
  return client.ext.eval(
    `emCarbonAccount(${HRef.make(subjectRef).toAxon()}, ${spanExpr(span)})`
  );
}

/** 排放因子版本表。 */
export async function emFactors(client: HClient): Promise<HDict[]> {
  return rows(await client.ext.eval("emFactors()"));
}

/** 绿电 / 绿证 / CCER。只有 emRetired 的才可用于抵消。 */
export async function emGreenCerts(client: HClient, subjectRef?: string): Promise<HDict[]> {
  const a = subjectRef ? HRef.make(subjectRef).toAxon() : "";
  return rows(await client.ext.eval(`emGreenCerts(${a})`));
}

/** 净排放量（总排放 − 抵消）。单位由因子决定，示范数据是 kgCO2e。 */
export async function emCarbonNet(
  client: HClient,
  subjectRef: string,
  span: EmSpan
): Promise<number | undefined> {
  const g = await client.ext.eval(
    `emCarbonNet(${HRef.make(subjectRef).toAxon()}, ${spanExpr(span)})`
  );
  return g.first?.get<HNum>("val")?.value;
}

/** 碳目标清单。 */
export async function emCarbonTargets(client: HClient, subjectRef?: string): Promise<HDict[]> {
  const a = subjectRef ? HRef.make(subjectRef).toAxon() : "";
  return rows(await client.ext.eval(`emCarbonTargets(${a})`));
}

/** 碳目标进度。总量型与强度型口径不同，返回的 emUnit 已经区分好。 */
export async function emCarbonTargetProgress(
  client: HClient,
  targetRef: string,
  span: EmSpan
): Promise<HDict | undefined> {
  const g = await client.ext.eval(
    `emCarbonTargetProgress(${HRef.make(targetRef).toAxon()}, ${spanExpr(span)})`
  );
  return g.first ?? undefined;
}

/** 费率清单。 */
export async function emTariffs(client: HClient, siteRef?: string): Promise<HDict[]> {
  const a = siteRef ? HRef.make(siteRef).toAxon() : "";
  return rows(await client.ext.eval(`emTariffs(${a})`));
}

// ──────────────────────────────────────────────────────────────────────────
// 域 11 · 诊断与闭环
// ──────────────────────────────────────────────────────────────────────────

/** 站点启用的诊断规则，按严重度降序。 */
export async function emDiagRules(client: HClient, siteRef: string): Promise<HDict[]> {
  return rows(await client.ext.eval(`emDiagRules(${HRef.make(siteRef).toAxon()})`));
}

/**
 * 跑一遍诊断。
 *
 * 返回整个 Grid：meta.emSkipped 列出**判据尚未实现而被跳过**的规则，
 * 页面必须把它显示出来 —— 不显示就等于告诉用户那些规则在正常工作。
 */
export async function emDiagRun(
  client: HClient,
  siteRef: string,
  span: EmSpan
): Promise<HGrid> {
  return client.ext.eval(`emDiagRun(${HRef.make(siteRef).toAxon()}, ${spanExpr(span)})`);
}

/** 异常清单，严重度降序。status 省略返回全部。 */
export async function emAnomalies(
  client: HClient,
  siteRef: string,
  status?: string
): Promise<HDict[]> {
  const s = status ? `, ${HStr.make(status).toAxon()}` : "";
  return rows(await client.ext.eval(`emAnomalies(${HRef.make(siteRef).toAxon()}${s})`));
}

/** 异常统计。键：open/acked/dispatched/resolved/falseAlarm/emCritical/emTotal/emByCategory。 */
export async function emAnomalyStats(
  client: HClient,
  siteRef: string
): Promise<HDict | undefined> {
  const g = await client.ext.eval(`emAnomalyStats(${HRef.make(siteRef).toAxon()})`);
  return g.first ?? undefined;
}

/** 确认异常（open → acked）。 */
export async function emAnomalyAck(
  client: HClient,
  anomalyRef: string,
  note?: string
): Promise<void> {
  const n = note ? `, ${HStr.make(note).toAxon()}` : "";
  await client.ext.eval(`emAnomalyAck(${HRef.make(anomalyRef).toAxon()}${n})`);
}

/** 标记误报。与「已处置」分开 —— 误报多是规则该调阈值的信号。 */
export async function emAnomalyFalseAlarm(
  client: HClient,
  anomalyRef: string,
  note?: string
): Promise<void> {
  const n = note ? `, ${HStr.make(note).toAxon()}` : "";
  await client.ext.eval(`emAnomalyFalseAlarm(${HRef.make(anomalyRef).toAxon()}${n})`);
}

/** 派单：多条异常 → 一张工单。 */
export async function emDispatchWorkOrder(
  client: HClient,
  anomalyRefs: string[],
  assignee: string,
  dueDate?: string
): Promise<string> {
  const list = anomalyRefs.map((r) => HRef.make(r).toAxon()).join(", ");
  // Axon 的日期是不带引号的字面量；先挡掉非 ISO 输入，别把任意字符串拼进表达式
  let due = "null";
  if (dueDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new Error(`不是合法日期：${dueDate}`);
    due = dueDate;
  }
  const g = await client.ext.eval(
    `emDispatchWorkOrder([${list}], ${HStr.make(assignee).toAxon()}, ${due})`
  );
  return g.first?.get<HRef>("val")?.value ?? "";
}

/** 工单清单。 */
export async function emWorkOrders(
  client: HClient,
  siteRef: string,
  status?: string
): Promise<HDict[]> {
  const s = status ? `, ${HStr.make(status).toAxon()}` : "";
  return rows(await client.ext.eval(`emWorkOrders(${HRef.make(siteRef).toAxon()}${s})`));
}

/** 工单状态流转。只能沿 new→assigned→inProgress→done→closed 往前走。 */
export async function emWorkOrderUpdate(
  client: HClient,
  woRef: string,
  status: string,
  result?: string,
  savingsProjectRef?: string
): Promise<void> {
  const r = result ? HStr.make(result).toAxon() : "null";
  const p = savingsProjectRef ? HRef.make(savingsProjectRef).toAxon() : "null";
  await client.ext.eval(
    `emWorkOrderUpdate(${HRef.make(woRef).toAxon()}, ${HStr.make(status).toAxon()}, ${r}, ${p})`
  );
}
