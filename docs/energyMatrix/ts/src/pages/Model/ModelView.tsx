import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import {
  Building2,
  Layers,
  LayoutGrid,
  Gauge,
  Sigma,
  AlertTriangle,
  Users,
  Cpu,
  Plus,
  Trash2,
  Search,
} from "lucide-react";
import { useViewModel } from "@/mvvm/hooks/useViewModel";
import { ModelStore, ModelViewModel, type TreeRow } from "./ModelViewModel";
import { PropertyForm } from "./PropertyForm";
import { CreateDialog } from "./CreateDialog";
import { GROUP_DIS, KIND_DIS } from "./fieldSchema";
import { PageHeader, Card, AsyncState } from "@/components/PageHeader";
import { useI18n } from "@/i18n/I18NProvider";
import { useSite } from "@/components/SiteContext";
import type { NodeKind } from "@/api/emApi";

const GROUPS = ["all", "space", "metering", "equip", "org"];
const TABS = ["props", "points", "check"] as const;
const TAB_DIS: Record<(typeof TABS)[number], string> = {
  props: "属性",
  points: "采集点位",
  check: "检查",
};

/** 每种对象的图标与配色 —— 树里一眼分得清是空间、表还是设备。 */
const KIND_STYLE: Record<NodeKind, { Icon: typeof Building2; cls: string }> = {
  site: { Icon: Building2, cls: "text-slate-500" },
  floor: { Icon: Layers, cls: "text-slate-500" },
  zone: { Icon: LayoutGrid, cls: "text-brand" },
  meter: { Icon: Gauge, cls: "text-info" },
  load: { Icon: Cpu, cls: "text-accent" },
  tenant: { Icon: Users, cls: "text-warn" },
};

const ROLE_DIS: Record<string, string> = {
  gateway: "关口表", main: "总表", branch: "分项表",
  sub: "子表", check: "考核表", virtual: "虚表",
};

const ROLE_CLASS: Record<string, string> = {
  gateway: "bg-danger/10 text-danger",
  main: "bg-info/10 text-info",
  branch: "bg-brand/10 text-brand",
  sub: "bg-slate-100 text-slate-500",
  check: "bg-warn/10 text-warn",
  virtual: "bg-accent/10 text-accent",
};

const MEDIUM_DIS: Record<string, string> = {
  elec: "电", water: "水", gas: "燃气", steam: "蒸汽",
  heat: "热量", cool: "冷量", diesel: "柴油", coal: "煤", hydrogen: "氢",
};

const TOU_DIS: Record<string, string> = {
  sharp: "尖", peak: "峰", flat: "平", valley: "谷",
};

/**
 * 数据模型配置 —— 建立与维护设备树。
 *
 * 左侧是资产树（空间、计量、设备、组织合并成一棵），右侧是选中对象的
 * 属性 / 采集点位 / 检查三个页签。
 *
 * 所有校验规则都在后端，前端只负责把结果显示出来 —— 规则写两遍必然会不一致。
 */
export const ModelView = observer(function ModelView() {
  const vm = useViewModel(ModelStore, ModelViewModel);
  const { translate: t } = useI18n();
  const { siteRef } = useSite();

  const [group, setGroup] = useState("all");
  const [tab, setTab] = useState<(typeof TABS)[number]>("props");
  const [creating, setCreating] = useState(false);
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    vm.lastSiteRef = siteRef;
    vm.loadTree(siteRef);
  }, [vm, siteRef]);

  const rows = vm.filteredRows(group, keyword);
  const labels = {
    loading: t("common.loading"),
    error: t("common.error"),
    empty: t("common.empty"),
  };

  const confirmDelete = async () => {
    const { points, ledger } = vm.impact;
    const parts = [`确定删除「${vm.selectedDis}」吗？`];
    if (points > 0) parts.push(`它的 ${points} 个采集点位会一并删除。`);
    if (ledger > 0) parts.push(`还有 ${ledger} 条未关账的能耗记录会被删除。`);
    parts.push("此操作不可撤销。");
    // 已关账记录引用的表，后端会直接拒绝；这里不特殊处理，让后端的说明显示出来
    if (!window.confirm(parts.join("\n"))) return;
    await vm.remove(true);
  };

  return (
    <>
      <PageHeader
        eyebrow="资产与设备树"
        title={t("nav.model")}
        desc="建立站点、楼层、分区、表计与用能设备的层级关系。新建表计时会自动生成对应的采集点位"
        actions={
          <button
            onClick={() => {
              vm.clearMessages();
              setCreating(true);
            }}
            className="flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand/90"
          >
            <Plus size={15} />
            新建对象
          </button>
        }
      />

      {vm.notice && (
        <div className="mb-3 rounded-md border border-brand/30 bg-brand/5 px-3 py-2 text-sm text-slate-700">
          {vm.notice}
        </div>
      )}
      {vm.error && !creating && (
        <div className="mb-3 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-slate-700">
          {vm.error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* ── 左：资产树 ─────────────────────────────────────── */}
        <Card className="lg:col-span-2">
          <div className="mb-3 space-y-2">
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索名称"
                className="w-full rounded-md border border-slate-300 py-1.5 pl-8 pr-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {GROUPS.map((g) => (
                <button
                  key={g}
                  onClick={() => setGroup(g)}
                  className={[
                    "rounded-md px-2 py-1 text-xs transition-colors",
                    group === g ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100",
                  ].join(" ")}
                >
                  {GROUP_DIS[g]}
                </button>
              ))}
              <span className="ml-auto text-[11px] text-slate-400">{rows.length} 项</span>
            </div>
          </div>

          <AsyncState loading={vm.loadingTree} error={undefined} labels={labels}>
            {rows.length === 0 ? (
              <EmptyTree hasAny={vm.rows.length > 0} onCreate={() => setCreating(true)} />
            ) : (
              <ul className="-mx-1 max-h-[60vh] overflow-y-auto">
                {rows.map((r) => (
                  <TreeItem
                    key={r.id}
                    row={r}
                    selected={r.id === vm.selectedId}
                    onSelect={() => vm.select(r.id)}
                  />
                ))}
              </ul>
            )}
          </AsyncState>
        </Card>

        {/* ── 右：对象详情 ───────────────────────────────────── */}
        <div className="lg:col-span-3">
          {!vm.selectedId ? (
            <Card>
              <div className="py-14 text-center text-sm text-slate-400">
                在左侧选择一个对象，查看和修改它的属性
              </div>
            </Card>
          ) : (
            <Card>
              <header className="mb-4 flex items-start gap-3 border-b border-slate-100 pb-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {vm.selectedKind && <KindIcon kind={vm.selectedKind} size={18} />}
                    <h2 className="truncate text-base font-medium text-slate-900">
                      {vm.selectedDis}
                    </h2>
                    {vm.selectedKind && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
                        {KIND_DIS[vm.selectedKind]}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-400">
                    {vm.impact.points > 0 && <span>{vm.impact.points} 个采集点位</span>}
                    {vm.impact.ledger > 0 && <span>{vm.impact.ledger} 条能耗记录</span>}
                  </div>
                </div>
                <button
                  disabled={vm.submitting}
                  onClick={() => void confirmDelete()}
                  className="flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-500 hover:border-danger/40 hover:bg-danger/5 hover:text-danger disabled:opacity-40"
                >
                  <Trash2 size={13} />
                  删除
                </button>
              </header>

              <div className="mb-4 flex items-center gap-1 border-b border-slate-100">
                {TABS.map((tb) => (
                  <button
                    key={tb}
                    onClick={() => setTab(tb)}
                    className={[
                      "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
                      tab === tb
                        ? "border-brand font-medium text-brand"
                        : "border-transparent text-slate-500 hover:text-slate-700",
                    ].join(" ")}
                  >
                    {TAB_DIS[tb]}
                    {tb === "check" && vm.errorCount > 0 && (
                      <span className="rounded-full bg-danger px-1.5 text-[10px] leading-4 text-white">
                        {vm.errorCount}
                      </span>
                    )}
                    {tb === "points" && vm.missingL1 && (
                      <span className="rounded-full bg-danger px-1.5 text-[10px] leading-4 text-white">
                        !
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <AsyncState loading={vm.loadingDetail} error={undefined} labels={labels}>
                {tab === "props" && <PropertyForm vm={vm} />}
                {tab === "points" && <PointsTab vm={vm} />}
                {tab === "check" && <CheckTab vm={vm} />}
              </AsyncState>
            </Card>
          )}
        </div>
      </div>

      {creating && <CreateDialog vm={vm} siteRef={siteRef} onClose={() => setCreating(false)} />}
    </>
  );
});

function KindIcon({ kind, size = 15 }: { kind: NodeKind; size?: number }) {
  const s = KIND_STYLE[kind];
  if (!s) return null;
  return <s.Icon size={size} className={`shrink-0 ${s.cls}`} />;
}

function EmptyTree({ hasAny, onCreate }: { hasAny: boolean; onCreate: () => void }) {
  if (hasAny) {
    return (
      <div className="py-10 text-center text-sm text-slate-400">
        没有匹配的对象，换个筛选条件或关键词试试
      </div>
    );
  }
  return (
    <div className="px-4 py-10 text-center">
      <Building2 size={28} className="mx-auto text-slate-300" />
      <p className="mt-3 text-sm text-slate-500">还没有任何对象</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">
        建议的顺序：先建<b>站点</b>，再建<b>表计</b>（从关口表开始，把分项表挂到它下面），
        最后按需补楼层和分区。
      </p>
      <button
        onClick={onCreate}
        className="mt-4 rounded-md bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand/90"
      >
        创建第一个对象
      </button>
    </div>
  );
}

function TreeItem({
  row,
  selected,
  onSelect,
}: {
  row: TreeRow;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        onClick={onSelect}
        className={[
          "relative flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm transition-colors",
          selected ? "bg-brand/10 text-brand" : "text-slate-700 hover:bg-slate-50",
        ].join(" ")}
        style={{ paddingLeft: `${8 + row.depth * 18}px` }}
      >
        {/* 缩进引导线：让「谁挂在谁下面」一眼看得出来 */}
        {Array.from({ length: row.depth }, (_, i) => (
          <span
            key={i}
            aria-hidden
            className="pointer-events-none absolute top-0 h-full border-l border-slate-200"
            style={{ left: `${14 + i * 18}px` }}
          />
        ))}

        <KindIcon kind={row.kind} />
        <span className="min-w-0 flex-1 truncate">{row.dis}</span>

        {row.kind === "meter" && row.medium && (
          <span className="shrink-0 text-[11px] text-slate-400">
            {MEDIUM_DIS[row.medium] ?? row.medium}
          </span>
        )}
        {row.kind === "meter" && row.role && !row.gap && !row.virtual && (
          <span
            className={[
              "shrink-0 rounded px-1.5 py-0.5 text-[10px]",
              ROLE_CLASS[row.role] ?? "bg-slate-100 text-slate-500",
            ].join(" ")}
          >
            {ROLE_DIS[row.role] ?? row.role}
          </span>
        )}
        {row.gap && (
          <span className="flex shrink-0 items-center gap-0.5 rounded bg-warn/10 px-1.5 py-0.5 text-[10px] text-warn">
            <AlertTriangle size={10} />
            缺口
          </span>
        )}
        {row.virtual && !row.gap && (
          <span className="flex shrink-0 items-center gap-0.5 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
            <Sigma size={10} />
            虚表
          </span>
        )}
        {row.orphan && (
          <span
            className="shrink-0 rounded bg-danger/10 px-1.5 py-0.5 text-[10px] text-danger"
            title="它挂在一个已经不存在的对象下面，暂时显示在顶层"
          >
            无归属
          </span>
        )}
        {row.childCount > 0 && (
          <span className="shrink-0 text-[10px] text-slate-300">{row.childCount}</span>
        )}
      </button>
    </li>
  );
}

const PointsTab = observer(function PointsTab({ vm }: { vm: ModelViewModel }) {
  const pts = vm.pointRows;
  return (
    <>
      {vm.missingL1 && (
        <div className="mb-3 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-slate-700">
          这块表没有累积读数点，生成能耗台账时会跳过它 —— 等于这块表不产生任何数据。
        </div>
      )}
      {pts.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400">该对象下没有采集点位</div>
      ) : (
        <div className="em-scroll-x">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="py-2 pr-3 font-normal">点位</th>
                <th className="py-2 pr-3 font-normal">单位</th>
                <th className="py-2 pr-3 font-normal">用途</th>
                <th className="py-2 pr-3 font-normal">存历史</th>
                <th className="py-2 font-normal">采集</th>
              </tr>
            </thead>
            <tbody>
              {pts.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 last:border-0">
                  <td className="py-2 pr-3">
                    {p.dis}
                    {p.touPeriod && (
                      <span className="ml-1.5 rounded bg-slate-100 px-1 text-[10px] text-slate-500">
                        {TOU_DIS[p.touPeriod] ?? p.touPeriod}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs text-slate-500">{p.unit ?? "—"}</td>
                  <td className="py-2 pr-3 text-xs">
                    {p.l1 && <span className="text-info">表底累积读数</span>}
                    {p.delta && <span className="text-brand">区间用量</span>}
                    {!p.l1 && !p.delta && <span className="text-slate-400">辅助参数</span>}
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    {p.his ? <span className="text-brand">是</span> : <span className="text-slate-400">否</span>}
                  </td>
                  <td className="py-2 text-xs">
                    {p.bound ? (
                      <span className="text-brand">已接通</span>
                    ) : (
                      <span className="text-warn">未接通</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
            点位由系统按模板自动生成。「采集」一列表示这个点位有没有接到现场的采集通道，
            用于点表交底时核对哪些还没接上。
          </p>
        </div>
      )}
    </>
  );
});

const CheckTab = observer(function CheckTab({ vm }: { vm: ModelViewModel }) {
  const issues = vm.issueRows;
  if (issues.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-brand">
        这个对象配置完整，没有发现问题
      </div>
    );
  }
  const tone: Record<string, { cls: string; dis: string }> = {
    err: { cls: "bg-danger/10 text-danger", dis: "必须处理" },
    warn: { cls: "bg-warn/10 text-warn", dis: "建议处理" },
    info: { cls: "bg-slate-100 text-slate-500", dis: "提示" },
  };
  return (
    <>
      <div className="mb-3 text-xs text-slate-500">
        发现 {vm.errorCount} 个必须处理、{vm.warnCount} 个建议处理的问题。
        必须处理的问题会让这个对象算不出能耗数据。
      </div>
      <ul className="space-y-2.5">
        {issues.map((i, idx) => (
          <li key={idx} className="rounded-md border border-slate-100 p-3">
            <div className="flex items-center gap-2">
              <span className={["rounded px-1.5 py-0.5 text-[10px]", tone[i.level]?.cls ?? ""].join(" ")}>
                {tone[i.level]?.dis ?? i.level}
              </span>
              <span className="ml-auto text-[11px] text-slate-300" title="设计说明书出处">
                {i.rule}
              </span>
            </div>
            <div className="mt-1.5 text-sm leading-relaxed text-slate-600">{i.msg}</div>
          </li>
        ))}
      </ul>
    </>
  );
});
