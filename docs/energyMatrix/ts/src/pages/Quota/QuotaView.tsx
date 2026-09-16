import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { useViewModel } from "@/mvvm/hooks/useViewModel";
import { QuotaStore, QuotaViewModel } from "./QuotaViewModel";
import { PageHeader, Card, AsyncState } from "@/components/PageHeader";
import { Badge, ProgressBar, Stat } from "@/components/Bits";
import { useI18n } from "@/i18n/I18NProvider";
import { useSite } from "@/components/SiteContext";

/**
 * 定额与对标（设计稿版式 F）。
 *
 * 每条定额都带着来源徽标 —— 那不是装饰，是这一屏的核心约束：
 * 国标约束值、历史同期、合同约定三种限值放在一起比较，结论就没有意义了。
 */
export const QuotaView = observer(function QuotaView() {
  const vm = useViewModel(QuotaStore, QuotaViewModel);
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

  const quotas = vm.quotaRows;
  const kpis = vm.kpiRows;

  return (
    <>
      <PageHeader
        eyebrow="BENCHMARK · em::EmQuota"
        title={t("nav.quota")}
        desc="定额来源分五类，报表中必须分别标注 —— 不知道出处的限值没有约束力"
      />

      <AsyncState loading={vm.loading} error={vm.error} labels={labels}>
        <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Stat label="定额条数" value={quotas.length} />
          <Stat
            label="已超限"
            value={vm.overCount}
            tone={vm.overCount > 0 ? "danger" : "neutral"}
          />
          <Stat
            label="接近上限"
            value={vm.warnCount}
            tone={vm.warnCount > 0 ? "warn" : "neutral"}
          />
          <Stat
            label="未标注来源"
            value={vm.noSourceCount}
            tone={vm.noSourceCount > 0 ? "warn" : "neutral"}
            hint="配置缺陷，需补 emLimitSource"
          />
        </div>

        <div className="space-y-4">
          {/* 定额执行进度 */}
          <Card
            title="定额执行进度"
            hint="用量取自台账；预警线是每条定额各自的 emWarnRatio"
          >
            {quotas.length === 0 ? (
              <div className="text-sm text-slate-400">{labels.empty}</div>
            ) : (
              <ul className="space-y-4">
                {quotas.map((q) => (
                  <li key={q.id}>
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span className="text-sm text-slate-700">{q.dis}</span>
                      <Badge tone="info">{q.mediumDis}</Badge>
                      <Badge tone={q.source ? "neutral" : "warn"} title="emLimitSource">
                        {q.sourceDis}
                      </Badge>
                      <Badge tone={q.levelTone}>{vm.levelDis(q.level)}</Badge>
                      {q.level === "over" && q.overAction && (
                        <Badge tone="danger" title="emOverAction">
                          超限动作：{q.overActionDis}
                        </Badge>
                      )}
                      <span className="ml-auto font-mono text-xs text-slate-500">
                        {vm.fmtNum(q.used)} / {vm.fmtNum(q.limit)}
                        <span className="ml-2 text-slate-400">{vm.fmtPct(q.ratio)}</span>
                      </span>
                    </div>
                    <ProgressBar ratio={q.ratio} warnAt={q.warnAt} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* 指标定义表 */}
          <Card
            title="指标定义与本期值"
            hint="公式存在 EmKpi.emFormula，前后端共用同一份定义"
          >
            {kpis.length === 0 ? (
              <div className="text-sm text-slate-400">{labels.empty}</div>
            ) : (
              <div className="em-scroll-x">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-400">
                      <th className="py-1 pr-3">编码</th>
                      <th className="py-1 pr-3">名称</th>
                      <th className="py-1 pr-3 text-right">本期值</th>
                      <th className="py-1 pr-3">单位</th>
                      <th className="py-1 pr-3">粒度</th>
                      <th className="py-1 pr-3">方向</th>
                      <th className="py-1 pr-3">可用维度</th>
                      <th className="py-1">对标依据</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpis.map((k) => (
                      <tr key={k.code} className="border-t border-slate-100 align-top">
                        <td className="py-1.5 pr-3 font-mono text-xs text-info">{k.code}</td>
                        <td className="py-1.5 pr-3">
                          {k.dis}
                          {k.formula && (
                            <div
                              className="mt-0.5 max-w-[22rem] truncate font-mono text-[10px] text-slate-400"
                              title={k.formula}
                            >
                              {k.formula}
                            </div>
                          )}
                        </td>
                        <td className="py-1.5 pr-3 text-right font-mono">
                          {k.val === undefined ? (
                            <span className="text-slate-300" title={k.err ?? "算不出"}>
                              —
                            </span>
                          ) : (
                            vm.fmtNum(k.val, 2)
                          )}
                        </td>
                        <td className="py-1.5 pr-3 font-mono text-xs text-slate-500">
                          {k.unit ?? "—"}
                        </td>
                        <td className="py-1.5 pr-3 text-xs text-slate-500">
                          {k.granularity ?? "—"}
                        </td>
                        <td className="py-1.5 pr-3 text-xs">
                          <Badge tone={k.higherIsBetter ? "ok" : "neutral"}>
                            {k.higherIsBetter ? "越高越好" : "越低越好"}
                          </Badge>
                        </td>
                        <td className="py-1.5 pr-3 font-mono text-[10px] text-slate-400">
                          {k.dims || "—"}
                        </td>
                        <td className="max-w-[14rem] py-1.5 text-[11px] text-slate-500">
                          {k.standard ?? (
                            <span className="text-slate-300">未标注</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </AsyncState>
    </>
  );
});
