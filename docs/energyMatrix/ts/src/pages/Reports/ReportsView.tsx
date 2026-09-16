import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { useViewModel } from "@/mvvm/hooks/useViewModel";
import { ReportsStore, ReportsViewModel } from "./ReportsViewModel";
import { PageHeader, Card, AsyncState } from "@/components/PageHeader";
import { useI18n } from "@/i18n/I18NProvider";
import { useSite } from "@/components/SiteContext";
import { str } from "@/api/emApi";

const TONE_CLASS = {
  ok: "border-brand/30 bg-brand/5 text-slate-700",
  warn: "border-warn/30 bg-warn/5 text-slate-700",
  danger: "border-danger/30 bg-danger/5 text-slate-700",
};

/**
 * 报表与关账。
 *
 * 关账入口在这里而不在定时任务里 —— 缺口率闸门是硬门槛，必须有人对
 * 「这个月的账平不平」负责。UI 强制两步：先预检看闸门结论，再决定关不关。
 */
export const ReportsView = observer(function ReportsView() {
  const vm = useViewModel(ReportsStore, ReportsViewModel);
  const { translate: t } = useI18n();
  const { siteRef, span } = useSite();

  useEffect(() => {
    if (siteRef) vm.loadBatches(siteRef);
  }, [vm, siteRef]);

  const labels = {
    loading: t("common.loading"),
    error: t("common.error"),
    empty: t("common.empty"),
  };

  const result = vm.result;

  return (
    <>
      <PageHeader
        eyebrow={t("reports.eyebrow")}
        title={t("reports.title")}
        desc={t("reports.desc")}
        actions={
          <>
            <button
              disabled={!siteRef || vm.submitting}
              onClick={() => siteRef && vm.dryRun(siteRef, span)}
              className="rounded border border-info px-3 py-1.5 text-sm text-info hover:bg-info/5 disabled:opacity-40"
            >
              {t("reports.dryRun")}
            </button>
            <button
              disabled={!siteRef || vm.submitting || !vm.canClose}
              onClick={() => siteRef && vm.doClose(siteRef, span)}
              title={vm.canClose ? undefined : "先跑一次预检"}
              className="rounded bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand/90 disabled:opacity-40"
            >
              {t("reports.close")}
            </button>
          </>
        }
      />

      {/* 闸门结论 */}
      {result && (
        <div
          className={[
            "mb-4 rounded border px-4 py-3 text-sm",
            TONE_CLASS[vm.resultTone(result.status)],
          ].join(" ")}
        >
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <span className="font-mono text-xs uppercase tracking-wide">{result.status}</span>
            <span>
              {t("ledgerBar.gapRatio")}{" "}
              <span className="font-mono">{vm.fmtPct(result.gapRatio)}</span>
              {result.threshold !== undefined && (
                <span className="text-slate-400"> / 阈值 {vm.fmtPct(result.threshold)}</span>
              )}
            </span>
            {result.entryCount !== undefined && (
              <span>
                {t("common.entries")} <span className="font-mono">{result.entryCount}</span>
              </span>
            )}
          </div>
          {result.msg && <div className="mt-1 text-slate-600">{result.msg}</div>}

          {result.rows.length > 0 && (
            <div className="em-scroll-x mt-3">
              <table className="w-full text-xs">
                <tbody>
                  {result.rows.slice(0, 20).map((r, idx) => (
                    <tr key={idx} className="border-t border-slate-200/60">
                      <td className="py-1 pr-3 font-mono text-slate-500">
                        {str(r, "dis") ?? str(r, "emMedium") ?? "—"}
                      </td>
                      <td className="py-1 pr-3 text-slate-600">
                        {str(r, "msg") ?? str(r, "emPeriod") ?? ""}
                      </td>
                      <td className="py-1 text-right font-mono text-slate-500">
                        {r.get("emGapRatio")?.toString() ?? ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.rows.length > 20 && (
                <div className="mt-1 text-[11px] text-slate-400">
                  共 {result.rows.length} 条，此处只显示前 20 条
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <AsyncState loading={vm.loading} error={vm.error} labels={labels}>
        <Card title={t("reports.batches")} hint="EmClosePeriod · 关账即冻结，修正只能走红冲">
          {vm.batchRows.length === 0 ? (
            <div className="text-sm text-slate-400">{labels.empty}</div>
          ) : (
            <div className="em-scroll-x">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400">
                    <th className="py-1 pr-3">批次</th>
                    <th className="py-1 pr-3">账期</th>
                    <th className="py-1 pr-3">粒度</th>
                    <th className="py-1 pr-3">状态</th>
                    <th className="py-1 pr-3">操作人</th>
                    <th className="py-1 pr-3 text-right">条目数</th>
                    <th className="py-1 text-right">缺口率</th>
                  </tr>
                </thead>
                <tbody>
                  {vm.batchRows.map((b) => (
                    <tr key={b.period ?? b.dis} className="border-t border-slate-100">
                      <td className="py-1.5 pr-3 font-mono text-xs">{b.dis}</td>
                      <td className="py-1.5 pr-3 font-mono text-xs">{b.period ?? "—"}</td>
                      <td className="py-1.5 pr-3 text-xs text-slate-500">
                        {b.granularity ?? "—"}
                      </td>
                      <td className="py-1.5 pr-3">
                        <span
                          className={[
                            "rounded px-1.5 py-0.5 text-[11px]",
                            b.closed ? "bg-brand/15 text-brand" : "bg-warn/15 text-warn",
                          ].join(" ")}
                        >
                          {b.closed ? t("ledgerBar.closed") : t("ledgerBar.open")}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 text-xs text-slate-500">{b.closedBy ?? "—"}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-xs">
                        {b.entryCount ?? "—"}
                      </td>
                      <td className="py-1.5 text-right font-mono text-xs">
                        {vm.fmtPct(b.gapRatio)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </AsyncState>
    </>
  );
});
