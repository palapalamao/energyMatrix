import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useViewModel } from "@/mvvm/hooks/useViewModel";
import {
  WorkOrderStore,
  WorkOrderViewModel,
  type WorkOrderRow,
} from "./WorkOrderViewModel";
import { PageHeader, Card, AsyncState } from "@/components/PageHeader";
import { Badge, SegTabs, Stat } from "@/components/Bits";
import { useI18n } from "@/i18n/I18NProvider";
import { useSite } from "@/components/SiteContext";

/**
 * 工单管理（设计稿版式 C）。
 *
 * 看板与列表两个视图看的是同一份数据。看板的列就是状态流本身，
 * 空列也保留 —— 一眼能看出单子卡在哪一步。
 */
export const WorkOrderView = observer(function WorkOrderView() {
  const vm = useViewModel(WorkOrderStore, WorkOrderViewModel);
  const { translate: t } = useI18n();
  const { siteRef } = useSite();
  const [view, setView] = useState<"board" | "list">("board");
  const [detail, setDetail] = useState<WorkOrderRow | undefined>();

  useEffect(() => {
    if (siteRef) vm.load(siteRef);
  }, [vm, siteRef]);

  const labels = {
    loading: t("common.loading"),
    error: t("common.error"),
    empty: t("common.empty"),
  };

  return (
    <>
      <PageHeader
        eyebrow="CLOSED LOOP · em::EmWorkOrder"
        title={t("nav.workorder")}
        desc="状态只能沿流程往前走；完成时挂在单上的异常会一并置为已处置"
        actions={
          <SegTabs
            value={view}
            options={[
              { key: "board", label: "看板" },
              { key: "list", label: "列表" },
            ]}
            onChange={setView}
          />
        }
      />

      <AsyncState loading={vm.loading} error={vm.error} labels={labels}>
        <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Stat label="工单总数" value={vm.rows.length} />
          <Stat label="进行中" value={vm.openCount} tone={vm.openCount > 0 ? "warn" : "neutral"} />
          <Stat
            label="逾期"
            value={vm.overdueCount}
            tone={vm.overdueCount > 0 ? "danger" : "neutral"}
          />
          <Stat
            label="已闭环至节能项目"
            value={vm.rows.filter((r) => r.savingsProjectRef).length}
            tone="ok"
            hint="诊断 → 措施 → 核证"
          />
        </div>

        {vm.rows.length === 0 ? (
          <Card>
            <div className="py-6 text-center text-sm text-slate-400">
              {labels.empty}
              <div className="mt-1 text-xs">先在「实时监测与告警」屏选中异常派单</div>
            </div>
          </Card>
        ) : view === "board" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {vm.columns.map((col) => (
              <div key={col.key} className="rounded-lg border border-slate-200 bg-slate-50/60 p-2">
                <div className="mb-2 flex items-center justify-between px-1 text-xs text-slate-500">
                  <span>{col.dis}</span>
                  <span className="font-mono">{col.rows.length}</span>
                </div>
                <ul className="space-y-2">
                  {col.rows.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setDetail(r)}
                        className="w-full rounded border border-slate-200 bg-white p-2 text-left hover:border-slate-300"
                      >
                        <div className="flex items-center gap-1">
                          <Badge tone={r.severityTone}>{r.severityDis}</Badge>
                          {r.overdue && <Badge tone="danger">逾期</Badge>}
                        </div>
                        <div className="mt-1 line-clamp-2 text-xs text-slate-700">{r.dis}</div>
                        <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-400">
                          <span>{r.orderNo ?? "—"}</span>
                          <span>{r.assignee ?? "未指派"}</span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <Card>
            <div className="em-scroll-x">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400">
                    <th className="py-1 pr-3">工单号</th>
                    <th className="py-1 pr-3">问题</th>
                    <th className="py-1 pr-3">对象</th>
                    <th className="py-1 pr-3">负责人</th>
                    <th className="py-1 pr-3">到期</th>
                    <th className="py-1 pr-3">异常数</th>
                    <th className="py-1 pr-3">状态</th>
                    <th className="py-1">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {vm.rows.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="py-2 pr-3 font-mono text-xs text-info">{r.orderNo ?? "—"}</td>
                      <td className="max-w-[20rem] py-2 pr-3">
                        <button
                          type="button"
                          onClick={() => setDetail(r)}
                          className="truncate text-left hover:underline"
                          title={r.dis}
                        >
                          {r.dis}
                        </button>
                        <div className="text-[11px] text-slate-400">{r.categoryDis}</div>
                      </td>
                      <td className="py-2 pr-3 text-xs text-slate-600">{r.subjectDis ?? "—"}</td>
                      <td className="py-2 pr-3 text-xs">{r.assignee ?? "—"}</td>
                      <td className="py-2 pr-3 font-mono text-[11px]">
                        <span className={r.overdue ? "text-danger" : "text-slate-400"}>
                          {r.dueDate ?? "—"}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right font-mono text-xs text-slate-500">
                        {r.anomalyCount ?? 0}
                      </td>
                      <td className="py-2 pr-3">
                        <Badge tone={r.status === "closed" ? "ok" : "neutral"}>
                          {r.statusDis}
                        </Badge>
                      </td>
                      <td className="py-2">
                        {r.nextStatus && (
                          <button
                            type="button"
                            disabled={vm.busyId === r.id}
                            onClick={() => siteRef && vm.advance(siteRef, r.id, r.nextStatus!)}
                            className="rounded border border-slate-200 px-1.5 py-0.5 text-[11px] hover:bg-slate-50 disabled:opacity-30"
                          >
                            → {r.nextStatusDis}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </AsyncState>

      {detail && (
        <DetailDrawer
          row={detail}
          vm={vm}
          siteRef={siteRef}
          onClose={() => setDetail(undefined)}
        />
      )}
    </>
  );
});

/**
 * 工单详情抽屉。
 *
 * 转 done 时可以顺手选一个节能项目 —— 这就是设计稿里的「闭环去向」：
 * 一次诊断 → 一张工单 → 一个可核证的节能措施。
 */
function DetailDrawer({
  row,
  vm,
  siteRef,
  onClose,
}: {
  row: WorkOrderRow;
  vm: WorkOrderViewModel;
  siteRef?: string;
  onClose: () => void;
}) {
  const [result, setResult] = useState(row.result ?? "");
  const [project, setProject] = useState(row.savingsProjectRef ?? "");

  const advance = () => {
    if (!siteRef || !row.nextStatus) return;
    vm.advance(siteRef, row.id, row.nextStatus, result || undefined, project || undefined);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/20" onClick={onClose}>
      <aside
        className="h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="font-mono text-[11px] text-info">{row.orderNo ?? "—"}</div>
            <h2 className="mt-0.5 text-base font-medium text-slate-900">{row.dis}</h2>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        <dl className="mt-4 space-y-2 text-sm">
          <Field label="状态">
            <Badge tone={row.status === "closed" ? "ok" : "neutral"}>{row.statusDis}</Badge>
          </Field>
          <Field label="严重度">
            <Badge tone={row.severityTone}>{row.severityDis}</Badge>
          </Field>
          <Field label="诊断分类">{row.categoryDis}</Field>
          <Field label="对象">{row.subjectDis ?? "—"}</Field>
          <Field label="负责人">{row.assignee ?? "—"}</Field>
          <Field label="到期日">
            <span className={row.overdue ? "text-danger" : ""}>{row.dueDate ?? "—"}</span>
          </Field>
          <Field label="关联异常">{row.anomalyCount ?? 0} 条</Field>
          <Field label="创建时间">{vm.fmtTs(row.ts)}</Field>
        </dl>

        {/* 状态流 */}
        <div className="mt-5">
          <div className="mb-2 text-xs text-slate-400">状态流</div>
          <ol className="flex items-center gap-1 text-[11px]">
            {vm.columns.map((c, i) => (
              <li key={c.key} className="flex items-center gap-1">
                <span
                  className={[
                    "rounded px-1.5 py-0.5",
                    c.key === row.status
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-400",
                  ].join(" ")}
                >
                  {c.dis}
                </span>
                {i < vm.columns.length - 1 && <span className="text-slate-300">›</span>}
              </li>
            ))}
          </ol>
        </div>

        {row.nextStatus ? (
          <div className="mt-5 space-y-3 rounded border border-slate-200 p-3">
            <div className="text-xs text-slate-500">
              推进到「{row.nextStatusDis}」
              <span className="ml-1 text-slate-400">状态不可回退</span>
            </div>
            <textarea
              value={result}
              onChange={(e) => setResult(e.target.value)}
              rows={3}
              placeholder="处置结果（可选）"
              className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
            />
            <div>
              <label className="mb-1 block text-[11px] text-slate-400">
                闭环去向：节能项目（可选）
              </label>
              <select
                value={project}
                onChange={(e) => setProject(e.target.value)}
                className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
              >
                <option value="">不关联</option>
                {vm.projectOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.dis}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={vm.busyId === row.id}
              onClick={advance}
              className="w-full rounded bg-slate-900 px-3 py-1.5 text-xs text-white disabled:opacity-40"
            >
              推进
            </button>
          </div>
        ) : (
          <div className="mt-5 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            工单已关闭，不可再推进。
          </div>
        )}

        {row.result && (
          <div className="mt-4">
            <div className="text-xs text-slate-400">处置结果</div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{row.result}</p>
          </div>
        )}
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <dt className="w-20 shrink-0 text-xs text-slate-400">{label}</dt>
      <dd className="text-slate-700">{children}</dd>
    </div>
  );
}
