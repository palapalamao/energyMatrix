import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useViewModel } from "@/mvvm/hooks/useViewModel";
import { RealtimeStore, RealtimeViewModel } from "./RealtimeViewModel";
import { PageHeader, Card, AsyncState } from "@/components/PageHeader";
import { Badge, SegTabs, Stat } from "@/components/Bits";
import { useI18n } from "@/i18n/I18NProvider";
import { useSite } from "@/components/SiteContext";
import { ANOMALY_STATUS_DIS } from "@/pages/shared";

/**
 * 实时监测与告警（设计稿版式 B）。
 *
 * 页面上没有任何"下发 / 控制"按钮，这是有意的：诊断规则只产生异常事件，
 * 绝不直接写控制点 —— 实时安全回路永不依赖账务层。
 */

const STATUS_TABS = [
  { key: "", label: "全部" },
  { key: "open", label: ANOMALY_STATUS_DIS.open },
  { key: "acked", label: ANOMALY_STATUS_DIS.acked },
  { key: "dispatched", label: ANOMALY_STATUS_DIS.dispatched },
  { key: "resolved", label: ANOMALY_STATUS_DIS.resolved },
  { key: "falseAlarm", label: ANOMALY_STATUS_DIS.falseAlarm },
];

export const RealtimeView = observer(function RealtimeView() {
  const vm = useViewModel(RealtimeStore, RealtimeViewModel);
  const { translate: t } = useI18n();
  const { siteRef, span } = useSite();
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState<string | undefined>();
  const [selected, setSelected] = useState<string[]>([]);
  const [assignee, setAssignee] = useState("");

  useEffect(() => {
    if (siteRef) vm.load(siteRef);
    setSelected([]);
  }, [vm, siteRef]);

  const labels = {
    loading: t("common.loading"),
    error: t("common.error"),
    empty: t("common.empty"),
  };

  const rows = vm.rows(category, status || undefined);
  const selectable = rows.filter((r) => r.canDispatch);
  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const doDispatch = () => {
    if (!siteRef || selected.length === 0 || !assignee.trim()) return;
    vm.dispatch(siteRef, selected, assignee.trim());
    setSelected([]);
    setAssignee("");
  };

  return (
    <>
      <PageHeader
        eyebrow="MONITORING · em::EmAnomaly"
        title={t("nav.realtime")}
        desc="诊断规则只产生异常事件，绝不直接写控制点 —— 实时安全回路永不依赖账务层"
        actions={
          <button
            type="button"
            disabled={!siteRef || vm.running}
            onClick={() => siteRef && vm.run(siteRef, span)}
            className="rounded bg-slate-900 px-3 py-1.5 text-xs text-white disabled:opacity-40"
          >
            {vm.running ? "诊断中…" : "跑一次诊断"}
          </button>
        }
      />

      {vm.runMsg && (
        <div className="mb-3 rounded border border-info/30 bg-info/5 px-3 py-2 text-xs text-info">
          {vm.runMsg}
          <span className="ml-1 text-slate-500">
            （同规则 + 同对象 + 同账期只会有一条异常，重复跑不会刷屏）
          </span>
        </div>
      )}
      {vm.skipped && (
        <div className="mb-3 rounded border border-warn/30 bg-warn/5 px-3 py-2 text-xs text-warn">
          以下规则的判据尚未实现，本次跳过：{vm.skipped}
        </div>
      )}

      <AsyncState loading={vm.loading} error={vm.error} labels={labels}>
        <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-5">
          <Stat
            label="严重且待处理"
            value={vm.statOf("emCritical")}
            tone={vm.statOf("emCritical") > 0 ? "danger" : "neutral"}
          />
          <Stat label="待处理" value={vm.statOf("open")} tone="warn" />
          <Stat label="已确认" value={vm.statOf("acked")} />
          <Stat label="已派单" value={vm.statOf("dispatched")} />
          <Stat label="已处置 / 误报" value={`${vm.statOf("resolved")} / ${vm.statOf("falseAlarm")}`} />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          {/* 分类筛选 */}
          <Card title="诊断分类" hint="点击筛选，再点取消">
            {vm.byCategory.length === 0 ? (
              <div className="text-sm text-slate-400">{labels.empty}</div>
            ) : (
              <ul className="space-y-1">
                {vm.byCategory.map((c) => (
                  <li key={c.key}>
                    <button
                      type="button"
                      onClick={() => setCategory((cur) => (cur === c.key ? undefined : c.key))}
                      className={[
                        "flex w-full items-center justify-between rounded px-2 py-1.5 text-xs transition-colors",
                        category === c.key
                          ? "bg-slate-900 text-white"
                          : "text-slate-600 hover:bg-slate-100",
                      ].join(" ")}
                    >
                      <span>{c.dis}</span>
                      <span className="font-mono">{c.n}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* 告警表 */}
          <Card className="lg:col-span-3">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <SegTabs value={status} options={STATUS_TABS} onChange={setStatus} />
              <div className="ml-auto flex items-center gap-2">
                <input
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  placeholder="派单给…"
                  className="w-28 rounded border border-slate-200 px-2 py-1 text-xs"
                />
                <button
                  type="button"
                  disabled={selected.length === 0 || !assignee.trim() || !!vm.busyId}
                  onClick={doDispatch}
                  className="rounded bg-info px-2.5 py-1 text-xs text-white disabled:opacity-40"
                  title="多条异常可以合成一张工单 —— 同一块表连着几天报警是一个问题，不是五个"
                >
                  派单（{selected.length}）
                </button>
              </div>
            </div>

            {rows.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-400">
                {labels.empty}
                <div className="mt-1 text-xs">先点右上角「跑一次诊断」生成异常</div>
              </div>
            ) : (
              <div className="em-scroll-x">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-400">
                      <th className="w-8 py-1">
                        <input
                          type="checkbox"
                          checked={selectable.length > 0 && selected.length === selectable.length}
                          onChange={(e) =>
                            setSelected(e.target.checked ? selectable.map((r) => r.id) : [])
                          }
                        />
                      </th>
                      <th className="py-1 pr-3">级别</th>
                      <th className="py-1 pr-3">异常事件</th>
                      <th className="py-1 pr-3">对象</th>
                      <th className="py-1 pr-3 text-right">实测 / 期望</th>
                      <th className="py-1 pr-3">账期</th>
                      <th className="py-1 pr-3">状态</th>
                      <th className="py-1">处置</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-t border-slate-100 align-top">
                        <td className="py-2">
                          <input
                            type="checkbox"
                            disabled={!r.canDispatch}
                            checked={selected.includes(r.id)}
                            onChange={() => toggle(r.id)}
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <Badge tone={r.severityTone}>{r.severityDis}</Badge>
                        </td>
                        <td className="max-w-[22rem] py-2 pr-3">
                          <div className="truncate" title={r.dis}>
                            {r.dis}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {r.categoryDis} · {vm.fmtTs(r.ts)}
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-xs text-slate-600">
                          {r.subjectDis ?? "—"}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono text-xs">
                          {vm.fmtNum(r.val, 3)} / {vm.fmtNum(r.expected, 3)}
                          {r.deviation !== undefined && (
                            <div className="text-[10px] text-slate-400">
                              偏差 {vm.fmtPct(r.deviation)}
                            </div>
                          )}
                        </td>
                        <td className="py-2 pr-3 font-mono text-[11px] text-slate-400">
                          {r.period ?? "—"}
                        </td>
                        <td className="py-2 pr-3">
                          <Badge tone={r.status === "open" ? "warn" : "neutral"}>
                            {r.statusDis}
                          </Badge>
                          {r.ackBy && (
                            <div className="mt-0.5 text-[10px] text-slate-400">{r.ackBy}</div>
                          )}
                        </td>
                        <td className="py-2">
                          <div className="flex gap-1">
                            <button
                              type="button"
                              disabled={!r.canAck || vm.busyId === r.id}
                              onClick={() => siteRef && vm.ack(siteRef, r.id)}
                              className="rounded border border-slate-200 px-1.5 py-0.5 text-[11px] hover:bg-slate-50 disabled:opacity-30"
                            >
                              确认
                            </button>
                            <button
                              type="button"
                              disabled={
                                r.status === "falseAlarm" ||
                                r.status === "resolved" ||
                                vm.busyId === r.id
                              }
                              onClick={() => siteRef && vm.falseAlarm(siteRef, r.id)}
                              className="rounded border border-slate-200 px-1.5 py-0.5 text-[11px] hover:bg-slate-50 disabled:opacity-30"
                              title="误报与已处置分开统计 —— 误报多说明规则该调阈值了"
                            >
                              误报
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="mt-4 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
          异常上的影响用量恒为 <span className="font-mono">estimated</span> 口径，仅用于排序展示，
          <b>永不进入台账</b>。要把一次异常的影响入账，必须走红冲 / 重录，而不是让告警自己写数。
        </div>
      </AsyncState>
    </>
  );
});
