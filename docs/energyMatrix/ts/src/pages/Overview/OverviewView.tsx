import { useEffect } from "react";
import { Link } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { useViewModel } from "@/mvvm/hooks/useViewModel";
import { OverviewStore, OverviewViewModel } from "./OverviewViewModel";
import { PageHeader, Card, AsyncState } from "@/components/PageHeader";
import { Badge, Delta, Legend, Meter, ProgressBar, StackedBars } from "@/components/Bits";
import { useI18n } from "@/i18n/I18NProvider";
import { useSite } from "@/components/SiteContext";

/**
 * 能源总览驾驶舱（设计稿版式 A · 指标优先）。
 *
 * 版面自上而下四层，按"先结论、后依据"排：
 *   1. 综合能耗（折标煤）+ 各介质卡 —— 本期用了多少、比上期怎么样、离定额多远
 *   2. 分项堆叠趋势 + 分项拆解      —— 用在哪儿了
 *   3. 数据可信度 + 平衡校核        —— 上面那些数字信得过吗
 *   4. 关键指标条 + 待处理告警      —— 该管什么
 *
 * 第 3 层不是可选装饰。缺口率和数据来源分布决定了前两层的数字能不能拿去
 * 结算和披露 —— 把它们折叠到二级页面，等于默认所有人都会去点。
 */
export const OverviewView = observer(function OverviewView() {
  const vm = useViewModel(OverviewStore, OverviewViewModel);
  const { translate: t } = useI18n();
  const { siteRef, span } = useSite();

  useEffect(() => {
    if (siteRef) vm.load(siteRef, span);
  }, [vm, siteRef, span]);

  const labels = {
    loading: t("common.loading"),
    error: t("common.error"),
    empty: t("common.empty"),
  };

  const days = vm.spanDays(span);
  const cards = vm.mediumCards;
  const stats = vm.trendStats;
  const batch = vm.lastBatch;

  return (
    <>
      <PageHeader
        eyebrow={t("overview.eyebrow")}
        title={t("overview.title")}
        desc={t("overview.desc")}
        actions={
          <div className="flex items-center gap-2">
            {batch && (
              <Badge tone={batch.closed ? "ok" : "neutral"}>
                {batch.period ?? "—"} {batch.closed ? "已关账" : "采集中"}
              </Badge>
            )}
            {vm.openAlarmCount > 0 && (
              <Link to="/realtime">
                <Badge tone="danger">{vm.openAlarmCount} 条待处理告警</Badge>
              </Link>
            )}
          </div>
        }
      />

      <AsyncState loading={vm.loading} error={vm.error} labels={labels}>
        {/* ── 1. 综合能耗 + 各介质 ─────────────────────────────── */}
        <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-4 xl:grid-cols-6">
          {/* 折标煤头卡：跨介质唯一可加总的口径 */}
          <div className="rounded-lg border border-brand/30 bg-brand-soft/40 p-4 lg:col-span-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">综合能耗（折标煤）</span>
              <Badge tone="ok">近 {days} 天</Badge>
            </div>
            <div className="mt-1 font-mono text-fluid-xl font-semibold text-slate-900">
              {vm.fmtNum(vm.coalTotal, 2)}
              <span className="ml-1 text-sm font-normal text-slate-500">tce</span>
            </div>
            {vm.coalDetail.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                {vm.coalDetail.map((d) => (
                  <span key={d.medium} title={`折标煤系数 ${d.factor} kgce/单位`}>
                    {d.dis} {vm.fmtNum(d.tce, 2)}
                  </span>
                ))}
              </div>
            )}
            {vm.coalMissing.length > 0 && (
              <div className="mt-1.5 text-[11px] text-warn">
                未计入：{vm.coalMissing.join("、")}
                <span className="text-slate-400">（无折标煤系数）</span>
              </div>
            )}
            {vm.coalTotal === undefined && (
              <div className="mt-1 text-[11px] text-slate-400">
                本期没有可折标煤的台账 —— 先跑 emLedgerBuild
              </div>
            )}
          </div>

          {/* 各介质卡 */}
          {cards.length === 0 && (
            <Card className="lg:col-span-2 xl:col-span-4">
              <div className="text-sm text-slate-400">
                {labels.empty}
                <div className="mt-1 text-xs">
                  跑一次 <span className="font-mono">emDemoBuild()</span> 再{" "}
                  <span className="font-mono">emLedgerBuild(site, emThisMonthSpan(), "daily")</span>
                </div>
              </div>
            </Card>
          )}
          {cards.map((c) => (
            <div key={c.medium} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">{c.dis}</span>
                <Delta value={c.mom} title="环比：与紧邻其前的等长账期相比" />
              </div>
              <div className="mt-1 font-mono text-fluid-lg font-semibold text-slate-900">
                {vm.fmtNum(c.val, 0)}
                {c.unit && (
                  <span className="ml-1 text-xs font-normal text-slate-400">{c.unit}</span>
                )}
              </div>

              {/* 定额进度：配了定额的介质才画，没配的不要画一根空条充数 */}
              {c.quotaRatio !== undefined ? (
                <div className="mt-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>定额</span>
                    <span className="font-mono">{vm.fmtPct(c.quotaRatio, 0)}</span>
                  </div>
                  <div className="mt-0.5">
                    <ProgressBar
                      ratio={c.quotaRatio}
                      tone={
                        c.quotaLevel === "over"
                          ? "danger"
                          : c.quotaLevel === "warn"
                            ? "warn"
                            : "ok"
                      }
                    />
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-[11px] text-slate-300">未设定额</div>
              )}

              <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                <span>
                  同比{" "}
                  <Delta
                    value={c.yoy}
                    title={vm.hasLastYear ? "与去年同期相比" : "去年同期没有台账"}
                  />
                </span>
                <span className={(c.qualityMin ?? 1) < 0.9 ? "text-warn" : ""}>
                  完好率 {vm.fmtPct(c.qualityMin, 0)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* ── 2. 趋势 + 分项 ────────────────────────────────────── */}
        <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card
            title="用电趋势（按分项堆叠）"
            hint={`${stats.days} 个账期 · 日均 ${vm.fmtNum(stats.avg, 0)} kWh · 峰值 ${vm.fmtNum(stats.max, 0)} kWh${stats.maxAt ? `（${stats.maxAt}）` : ""}`}
            className="lg:col-span-2"
          >
            {vm.trendRows.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400">{labels.empty}</div>
            ) : (
              <>
                <StackedBars rows={vm.trendRows} series={vm.trendSeries} height={150} />
                <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-400">
                  <span>{vm.trendRows[0]?.label}</span>
                  <span>{vm.trendRows[vm.trendRows.length - 1]?.label}</span>
                </div>
                <div className="mt-3">
                  <Legend series={vm.trendSeries.slice(0, 8)} />
                </div>
              </>
            )}
          </Card>

          <Card title="分项结构" hint="GB/T 51161 分项计量口径，仅电介质">
            {vm.subItemGroups.length === 0 ? (
              <div className="text-sm text-slate-400">{labels.empty}</div>
            ) : (
              <>
                {/* 一级分组占比 */}
                <div className="flex h-3 w-full overflow-hidden rounded">
                  {vm.subItemGroups.map((g) => (
                    <div
                      key={g.group}
                      style={{ width: `${g.ratio * 100}%`, backgroundColor: g.color }}
                      title={`${g.group} ${g.dis} ${vm.fmtPct(g.ratio, 1)}`}
                    />
                  ))}
                </div>
                <ul className="mt-2 space-y-1">
                  {vm.subItemGroups.map((g) => (
                    <li key={g.group} className="flex items-center gap-2 text-xs">
                      <span
                        className="h-2 w-2 shrink-0 rounded-sm"
                        style={{ backgroundColor: g.color }}
                      />
                      <span className="text-slate-600">
                        {g.group} {g.dis}
                      </span>
                      <span className="ml-auto font-mono text-slate-500">
                        {vm.fmtPct(g.ratio, 1)}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* 二级明细 top 8 */}
                <div className="mt-3 border-t border-slate-100 pt-2">
                  <ul className="space-y-1.5">
                    {vm.subItemRows.slice(0, 8).map((r) => (
                      <li key={r.code}>
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="font-mono uppercase text-slate-400">{r.code}</span>
                          <span className="truncate text-slate-600">{r.dis}</span>
                          <span className="ml-auto shrink-0 font-mono text-slate-500">
                            {vm.fmtNum(r.val, 0)}
                          </span>
                        </div>
                        <div className="mt-0.5 h-1 w-full rounded bg-slate-100">
                          <div
                            className="h-1 rounded"
                            style={{
                              width: `${Math.max(1, r.ratio * 100)}%`,
                              backgroundColor: r.color,
                            }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                  <Link
                    to="/analysis"
                    className="mt-2 inline-block text-[11px] text-info hover:underline"
                  >
                    全部分项与多维分析 →
                  </Link>
                </div>
              </>
            )}
          </Card>
        </div>

        {/* ── 3. 可信度 + 平衡校核 ──────────────────────────────── */}
        <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card
            title={t("overview.sourceMix")}
            hint="估算数据不可用于结算与对外披露（说明书表 5-1）"
            className="lg:col-span-2"
          >
            {vm.sourceRows.length === 0 ? (
              <div className="text-sm text-slate-400">{labels.empty}</div>
            ) : (
              <>
                <div className="mb-3 flex items-baseline gap-2">
                  <span className="font-mono text-lg font-semibold text-brand">
                    {vm.fmtPct(vm.settleableRatio)}
                  </span>
                  <span className="text-xs text-slate-500">
                    可结算口径（实测 + 推导 + 分摊）· 共 {vm.fmtNum(vm.entryCount, 0)} 条台账
                  </span>
                </div>
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {vm.sourceRows.map((r) => (
                    <li key={r.source}>
                      <div className="flex items-center justify-between text-xs">
                        <span className={r.restricted ? "text-danger" : "text-slate-600"}>
                          {r.dis}
                          {r.restricted && (
                            <span className="ml-1 text-[10px]">不可结算</span>
                          )}
                        </span>
                        <span className="font-mono text-slate-500">{vm.fmtPct(r.ratio)}</span>
                      </div>
                      <div className="mt-1">
                        <Meter ratio={r.ratio ?? 0} tone={r.restricted ? "danger" : "info"} />
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          <Card title={t("overview.gap")} hint={t("overview.gapHint")}>
            <div
              className={[
                "font-mono text-fluid-xl font-semibold",
                vm.gapLevel === "over"
                  ? "text-danger"
                  : vm.gapLevel === "warn"
                    ? "text-warn"
                    : "text-brand",
              ].join(" ")}
            >
              {vm.fmtPct(vm.gapRatio)}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              阈值 5% · 超限时 <span className="font-mono">emClosePeriod</span> 阻断关账
            </div>
            <div className="mt-3">
              <ProgressBar
                ratio={Math.min(1, Math.abs(vm.gapRatio ?? 0) / 0.05)}
                tone={vm.gapLevel === "over" ? "danger" : vm.gapLevel === "warn" ? "warn" : "ok"}
              />
              <div className="mt-1 text-[10px] text-slate-400">相对 5% 闸门的位置</div>
            </div>
            {batch && (
              <div className="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
                最近批次 {batch.period ?? "—"} ·{" "}
                {batch.closed ? (
                  <span className="text-brand">已关账</span>
                ) : (
                  <span className="text-slate-400">未关账</span>
                )}
                {batch.gapRatio !== undefined && (
                  <span className="ml-1 font-mono">缺口 {vm.fmtPct(batch.gapRatio)}</span>
                )}
                <Link to="/reports" className="ml-2 text-info hover:underline">
                  去关账 →
                </Link>
              </div>
            )}
          </Card>
        </div>

        {/* ── 4. 关键指标 + 待处理告警 ──────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card title="关键指标" hint="口径均来自后端，前端不自行计算">
            <ul className="space-y-3">
              <KeyStat
                label="单位面积能耗 EUI"
                value={vm.fmtNum(vm.eui, 2)}
                unit="kWh/m²"
                note={vm.euiErr}
              />
              <KeyStat
                label="净碳排（总量 − 抵消）"
                value={vm.fmtNum(vm.carbonNet, 0)}
                unit="kgCO2e"
                note={vm.carbonErr}
              />
              <KeyStat
                label="已核证节能量"
                value={vm.fmtNum(vm.verifiedSavings, 0)}
                unit="kWh"
                note={
                  vm.unverifiedProjects > 0
                    ? `另有 ${vm.unverifiedProjects} 个项目未核证，其节能量不计入此处（铁律 10）`
                    : undefined
                }
              />
            </ul>
          </Card>

          <Card
            title="待处理告警"
            hint={
              vm.openAlarmCount > 5
                ? `共 ${vm.openAlarmCount} 条，此处只列最严重的 5 条`
                : "按严重度降序"
            }
            className="lg:col-span-2"
          >
            {vm.openAlarms.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-400">
                没有待处理告警
                <div className="mt-1 text-xs">
                  去「实时监测与告警」屏点「跑一次诊断」
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {vm.openAlarms.map((a) => (
                  <li key={a.id} className="flex items-start gap-2 py-2">
                    <Badge tone={a.severityTone}>{a.severityDis}</Badge>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-slate-700" title={a.dis}>
                        {a.dis}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {a.subjectDis ?? "—"} · {vm.fmtTs(a.ts)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Link
              to="/realtime"
              className="mt-2 inline-block text-[11px] text-info hover:underline"
            >
              全部告警与处置 →
            </Link>
          </Card>
        </div>
      </AsyncState>
    </>
  );
});

/** 关键指标的一行。算不出时显示「—」并把原因挂在 note 上，不留空白。 */
function KeyStat({
  label,
  value,
  unit,
  note,
}: {
  label: string;
  value: string;
  unit: string;
  note?: string;
}) {
  return (
    <li>
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-slate-500">{label}</span>
        <span className="font-mono text-sm font-medium text-slate-900">
          {value}
          <span className="ml-1 text-[10px] font-normal text-slate-400">{unit}</span>
        </span>
      </div>
      {note && <div className="mt-0.5 text-[10px] text-slate-400">{note}</div>}
    </li>
  );
}
