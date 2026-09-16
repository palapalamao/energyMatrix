import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useViewModel } from "@/mvvm/hooks/useViewModel";
import { PortfolioStore, PortfolioViewModel } from "./PortfolioViewModel";
import { PageHeader, Card, AsyncState } from "@/components/PageHeader";
import { Badge, Meter, NotImplemented, Stat } from "@/components/Bits";
import { useI18n } from "@/i18n/I18NProvider";
import { useSite } from "@/components/SiteContext";

/**
 * 多项目 / 园区总览（设计稿版式 L）。
 *
 * 这一屏不看顶栏选的站点 —— 它本来就是跨站点的视角，只跟着账期走。
 */
export const PortfolioView = observer(function PortfolioView() {
  const vm = useViewModel(PortfolioStore, PortfolioViewModel);
  const { translate: t } = useI18n();
  const { span } = useSite();
  const [kpiCode, setKpiCode] = useState("EUI_TOTAL");

  useEffect(() => {
    vm.load(span, kpiCode);
  }, [vm, span, kpiCode]);

  const labels = {
    loading: t("common.loading"),
    error: t("common.error"),
    empty: t("common.empty"),
  };

  const s = vm.summary;
  const rows = vm.rows;
  const maxKpi = rows.reduce((m, r) => Math.max(m, r.kpi ?? 0), 0);

  return (
    <>
      <PageHeader
        eyebrow="PORTFOLIO · em::EmSite"
        title={t("nav.portfolio")}
        desc="排名口径来自 EmKpi.emFormula —— 前端不自己算指标，否则永远和报表对不上"
        actions={
          <select
            value={kpiCode}
            onChange={(e) => setKpiCode(e.target.value)}
            className="rounded border border-slate-200 bg-white px-2 py-1 text-xs"
          >
            {vm.kpiOptions.length === 0 && <option value={kpiCode}>{kpiCode}</option>}
            {vm.kpiOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        }
      />

      <AsyncState loading={vm.loading} error={vm.error} labels={labels}>
        <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Stat label="项目数" value={s.sites} hint={`已算出指标 ${s.scored}`} />
          <Stat label="城市数" value={s.cities} />
          <Stat label="总建筑面积" value={vm.fmtNum(s.area, 0)} hint="m²" />
          <Stat
            label="最优 / 最差"
            value={
              <span className="text-base">
                {vm.fmtNum(s.best?.kpi, 2)} / {vm.fmtNum(s.worst?.kpi, 2)}
              </span>
            }
            hint={vm.kpiUnit}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card
            title="项目排名"
            hint={vm.kpiStandard ? `对标依据：${vm.kpiStandard}` : "该指标未标注对标依据"}
            className="lg:col-span-2"
          >
            {rows.length === 0 ? (
              <div className="text-sm text-slate-400">{labels.empty}</div>
            ) : (
              <div className="em-scroll-x">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-400">
                      <th className="w-10 py-1 pr-2">#</th>
                      <th className="py-1 pr-3">项目</th>
                      <th className="py-1 pr-3">业态</th>
                      <th className="py-1 pr-3">气候区</th>
                      <th className="py-1 pr-3 text-right">面积 m²</th>
                      <th className="py-1 pr-3 text-right">
                        {kpiCode} {vm.kpiUnit ? `(${vm.kpiUnit})` : ""}
                      </th>
                      <th className="w-28 py-1">相对</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-t border-slate-100">
                        <td className="py-1.5 pr-2 font-mono text-xs text-slate-400">
                          {r.rank ?? "—"}
                        </td>
                        <td className="py-1.5 pr-3">
                          {r.dis}
                          {r.city && (
                            <span className="ml-1.5 text-[11px] text-slate-400">{r.city}</span>
                          )}
                        </td>
                        <td className="py-1.5 pr-3 text-xs text-slate-500">
                          {vm.usageDis(r.usageType)}
                        </td>
                        <td className="py-1.5 pr-3 font-mono text-[11px] text-slate-400">
                          {r.climateZone ?? "—"}
                        </td>
                        <td className="py-1.5 pr-3 text-right font-mono text-xs text-slate-500">
                          {vm.fmtNum(r.area, 0)}
                        </td>
                        <td className="py-1.5 pr-3 text-right font-mono">
                          {r.kpi === undefined ? (
                            <span className="text-slate-300" title={r.err ?? "指标算不出"}>
                              —
                            </span>
                          ) : (
                            vm.fmtNum(r.kpi, 2)
                          )}
                        </td>
                        <td className="py-1.5">
                          {r.kpi !== undefined && maxKpi > 0 && (
                            <Meter
                              ratio={r.kpi / maxKpi}
                              tone={r.rank === 1 ? "brand" : "info"}
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {rows.some((r) => r.err) && (
              <div className="mt-3 space-y-1">
                {rows
                  .filter((r) => r.err)
                  .map((r) => (
                    <div key={r.id} className="text-[11px] text-warn">
                      {r.dis}：{r.err}
                    </div>
                  ))}
              </div>
            )}
          </Card>

          <div className="space-y-4">
            <Card title="业态分布" hint="同业态之间才有可比性">
              {vm.byUsage.length === 0 ? (
                <div className="text-sm text-slate-400">{labels.empty}</div>
              ) : (
                <ul className="space-y-3">
                  {vm.byUsage.map((u) => (
                    <li key={u.usage}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-600">
                          {u.dis}
                          <span className="ml-1 text-slate-400">×{u.n}</span>
                        </span>
                        <span className="font-mono text-slate-500">{vm.fmtNum(u.avg, 2)}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-1 font-mono text-[10px] text-slate-400">
                        <span>{vm.fmtNum(u.min, 2)}</span>
                        <div className="h-px flex-1 bg-slate-200" />
                        <span>{vm.fmtNum(u.max, 2)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="口径说明">
              <div className="space-y-2 text-xs text-slate-500">
                <p>
                  排名值由后端 <span className="font-mono">emKpiComputeAll</span> 计算，公式存在{" "}
                  <span className="font-mono">EmKpi.emFormula</span>，与报表共用同一份定义。
                </p>
                <p className="flex items-start gap-1.5">
                  <Badge tone="warn">未归一化</Badge>
                  <span>
                    说明书要求 EUI 排名前先归一化到标准气象年（CDD / HDD）。骨架里没有度日
                    数据源，因此这里是**原始 EUI**，跨气候区比较仅供参考。
                  </span>
                </p>
              </div>
            </Card>

            <NotImplemented>
              集团汇总的折标煤总量与年核证节能量需要跨站点聚合口径（域 6 分摊 + 域 9 核证），
              两者都还是桩，这里先不给数 —— 给一个算法未定的合计数，比不给更危险。
            </NotImplemented>
          </div>
        </div>
      </AsyncState>
    </>
  );
});
