import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useViewModel } from "@/mvvm/hooks/useViewModel";
import { AnalysisStore, AnalysisViewModel, DIMS, type DimKey } from "./AnalysisViewModel";
import { PageHeader, Card, AsyncState } from "@/components/PageHeader";
import { Badge, Meter, SegTabs, Sparkbars } from "@/components/Bits";
import { useI18n } from "@/i18n/I18NProvider";
import { useSite } from "@/components/SiteContext";
import { MEDIUM_DIS } from "@/pages/shared";

/**
 * 能耗分析（设计稿版式 E）。
 *
 * 左边是选定维度的对比表，右边是账期趋势 + 国标分项四组占比。
 * 换维度不换页面结构 —— 六个维度读的是同一份台账，界面上也应该看得出
 * 它们是同一件事的不同切法。
 */

const MEDIA: { key: string; label: string }[] = [
  { key: "", label: "全部" },
  { key: "elec", label: MEDIUM_DIS.elec },
  { key: "water", label: MEDIUM_DIS.water },
  { key: "gas", label: MEDIUM_DIS.gas },
  { key: "cool", label: MEDIUM_DIS.cool },
];

export const AnalysisView = observer(function AnalysisView() {
  const vm = useViewModel(AnalysisStore, AnalysisViewModel);
  const { translate: t } = useI18n();
  const { siteRef, span } = useSite();
  const [dim, setDim] = useState<DimKey>("subItem");
  const [medium, setMedium] = useState<string>("");

  useEffect(() => {
    if (siteRef) vm.load(siteRef, span, dim, medium || undefined);
  }, [vm, siteRef, span, dim, medium]);

  const labels = {
    loading: t("common.loading"),
    error: t("common.error"),
    empty: t("common.empty"),
  };

  const rows = vm.rowsOf(dim);
  const stats = vm.periodStats;
  const periods = vm.periodRows;

  return (
    <>
      <PageHeader
        eyebrow="ANALYSIS · em::EmLedgerEntry"
        title={t("nav.analysis")}
        desc="六个维度读的是同一份台账 —— 换维度只是换一次 emLedgerAggregate 的 dim"
        actions={
          <div className="flex items-center gap-2">
            <SegTabs value={medium} options={MEDIA} onChange={setMedium} />
          </div>
        }
      />

      <div className="mb-4">
        <SegTabs value={dim} options={DIMS.map((d) => ({ key: d.key, label: d.label }))} onChange={setDim} />
      </div>

      <AsyncState loading={vm.loading} error={vm.error} labels={labels}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* 维度对比表 */}
          <Card
            title={`按${DIMS.find((d) => d.key === dim)?.label}对比`}
            hint="占比按本期合计；完好率取组内最小值 —— 一组数据的可信度由最差的那条决定"
            className="lg:col-span-2"
          >
            {rows.length === 0 ? (
              <div className="text-sm text-slate-400">{labels.empty}</div>
            ) : (
              <div className="em-scroll-x">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-400">
                      <th className="py-1 pr-3">名称</th>
                      <th className="py-1 pr-3 text-right">{t("common.value")}</th>
                      <th className="w-32 py-1 pr-3">占比</th>
                      <th className="py-1 pr-3 text-right">{t("common.entries")}</th>
                      <th className="py-1 pr-3 text-right">{t("common.quality")}</th>
                      <th className="py-1">{t("common.source")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.key} className="border-t border-slate-100">
                        <td className="max-w-[16rem] truncate py-1.5 pr-3" title={r.dis}>
                          {r.dis}
                        </td>
                        <td className="py-1.5 pr-3 text-right font-mono">{vm.fmtNum(r.val)}</td>
                        <td className="py-1.5 pr-3">
                          <div className="flex items-center gap-2">
                            <Meter ratio={r.ratio} />
                            <span className="w-10 shrink-0 text-right font-mono text-[11px] text-slate-400">
                              {vm.fmtPct(r.ratio, 0)}
                            </span>
                          </div>
                        </td>
                        <td className="py-1.5 pr-3 text-right font-mono text-xs text-slate-500">
                          {vm.fmtNum(r.entries, 0)}
                        </td>
                        <td className="py-1.5 pr-3 text-right font-mono text-xs">
                          <span
                            className={
                              (r.qualityMin ?? 1) < 0.9 ? "text-warn" : "text-slate-500"
                            }
                          >
                            {vm.fmtPct(r.qualityMin)}
                          </span>
                        </td>
                        <td className="py-1.5 font-mono text-[10px] text-slate-400">
                          {r.sources ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="space-y-4">
            {/* 账期趋势 */}
            <Card
              title="账期趋势"
              hint="按台账条目的 emPeriod 分组 —— 时间维度不另开接口"
            >
              {periods.length === 0 ? (
                <div className="text-sm text-slate-400">{labels.empty}</div>
              ) : (
                <>
                  <Sparkbars
                    data={periods.map((p) => p.val ?? 0)}
                    labels={periods.map((p) => p.period)}
                  />
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-[11px] text-slate-400">日均</div>
                      <div className="font-mono text-sm">{vm.fmtNum(stats.avg)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400">峰值</div>
                      <div className="font-mono text-sm text-warn">{vm.fmtNum(stats.max)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400">最低</div>
                      <div className="font-mono text-sm">{vm.fmtNum(stats.min)}</div>
                    </div>
                  </div>
                  {stats.maxAt && (
                    <div className="mt-2 text-center font-mono text-[10px] text-slate-400">
                      峰值账期 {stats.maxAt}
                    </div>
                  )}
                </>
              )}
            </Card>

            {/* 国标分项四组 */}
            <Card title="分项占比（国标一级）" hint="仅电介质，与介质筛选无关">
              {vm.subItemGroups.length === 0 ? (
                <div className="text-sm text-slate-400">{labels.empty}</div>
              ) : (
                <ul className="space-y-2">
                  {vm.subItemGroups.map((g) => (
                    <li key={g.group}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-slate-600">
                          <Badge tone="info">{g.group}</Badge>
                          {g.dis}
                        </span>
                        <span className="font-mono text-slate-500">{vm.fmtPct(g.ratio, 0)}</span>
                      </div>
                      <div className="mt-1">
                        <Meter ratio={g.ratio} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </AsyncState>
    </>
  );
});
