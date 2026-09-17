import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { useViewModel } from "@/mvvm/hooks/useViewModel";
import { KpiStore, KpiViewModel } from "./KpiViewModel";
import { PageHeader, Card, AsyncState } from "@/components/PageHeader";
import { Badge, ProgressBar, Stat } from "@/components/Bits";
import { useI18n } from "@/i18n/I18NProvider";
import { useSite } from "@/components/SiteContext";
import { QUOTA_SOURCE_DIS, fmtNum, fmtPct } from "@/pages/shared";
import { fmtKpiVal } from "./kpiFormat";

/**
 * 核心 KPI 考核（绿色医院评审 / 绩效考核数据支撑）。
 *
 * 三块内容，全部只读：
 *   考核参数   站点的四个分母（面积/空调面积/人数/床位数）—— 缺哪个一眼看见，
 *              缺的指标在下面卡片里就是「—」，去模型配置屏补
 *   核心指标卡 全部 EmKpi 定义的本期值，核心考核指标排前面
 *   定额进度   本站点的定额执行进度与超限/预警计数（明细在定额与对标屏）
 */

const PARAM_UNITS: Record<string, string> = {
  area: "m²",
  emCoolArea: "m²",
  emOccupancy: "人",
  emBeds: "床",
};

export const KpiView = observer(function KpiView() {
  const vm = useViewModel(KpiStore, KpiViewModel);
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

  const cards = vm.kpiCards;
  const quotas = vm.quotaLines;

  return (
    <>
      <PageHeader
        eyebrow={t("kpi.eyebrow")}
        title={t("nav.kpi")}
        desc={t("kpi.desc")}
      />

      <AsyncState loading={vm.loading} error={vm.error} labels={labels}>
        <div className="space-y-4">
          {/* 考核参数：分母来源，缺了哪个直接决定哪些指标算不出 */}
          <Card title={t("kpi.params")} hint={t("kpi.paramsHint")}>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {vm.siteParams.map((p) => {
                const missing = p.val === undefined;
                return (
                  <Stat
                    key={p.tag}
                    label={`${t(`kpi.param.${p.tag}`)}${PARAM_UNITS[p.tag] ? `（${PARAM_UNITS[p.tag]}）` : ""}`}
                    value={missing ? "—" : fmtNum(p.val)}
                    tone={missing ? "warn" : "neutral"}
                    hint={missing ? t("kpi.paramMissing") : undefined}
                  />
                );
              })}
            </div>
          </Card>

          {/* 核心指标卡 */}
          <Card title={t("kpi.cards")} hint={t("kpi.cardsHint")}>
            {cards.length === 0 ? (
              <div className="text-sm text-slate-400">{labels.empty}</div>
            ) : (
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                {cards.map((k) => {
                  const noVal = k.val === undefined;
                  return (
                    <div
                      key={k.code}
                      className="rounded-lg border border-slate-200 bg-white p-4"
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-slate-500">{k.dis}</span>
                        {k.core && <Badge tone="brand">{t("kpi.core")}</Badge>}
                        {k.standard && (
                          <Badge tone="neutral" title={t("kpi.standard")}>
                            {k.standard}
                          </Badge>
                        )}
                      </div>
                      <div
                        className={[
                          "mt-1 font-mono text-fluid-xl font-semibold",
                          noVal ? "text-slate-300" : "text-slate-900",
                        ].join(" ")}
                        title={noVal ? (k.err ?? t("kpi.noValue")) : k.err ?? undefined}
                      >
                        {fmtKpiVal(k.val, k.unit)}
                      </div>
                      <div className="mt-1 font-mono text-[10px] text-slate-400">
                        {k.code}
                        {k.granularity ? ` · ${k.granularity}` : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* 定额执行进度 */}
          <Card title={t("kpi.quota")} hint={t("kpi.quotaHint")}>
            <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
              <Stat label={t("kpi.quotaTotal")} value={quotas.length} />
              <Stat
                label={t("kpi.quotaOver")}
                value={vm.overCount}
                tone={vm.overCount > 0 ? "danger" : "neutral"}
              />
              <Stat
                label={t("kpi.quotaWarn")}
                value={vm.warnCount}
                tone={vm.warnCount > 0 ? "warn" : "neutral"}
              />
              <Stat
                label={t("kpi.quotaNoSource")}
                value={vm.noSourceCount}
                tone={vm.noSourceCount > 0 ? "warn" : "neutral"}
              />
            </div>
            {quotas.length === 0 ? (
              <div className="text-sm text-slate-400">{labels.empty}</div>
            ) : (
              <ul className="space-y-4">
                {quotas.map((q) => (
                  <li key={q.id}>
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span className="text-sm text-slate-700">{q.dis}</span>
                      <Badge tone={q.source ? "neutral" : "warn"} title="emLimitSource">
                        {q.source ? (QUOTA_SOURCE_DIS[q.source] ?? q.source) : "未标注来源"}
                      </Badge>
                      {q.level && (
                        <Badge tone={q.tone}>{t(`kpi.level.${q.level}`)}</Badge>
                      )}
                      <span className="ml-auto font-mono text-xs text-slate-500">
                        {fmtNum(q.used)} / {fmtNum(q.limit)}
                        <span className="ml-2 text-slate-400">{fmtPct(q.ratio)}</span>
                      </span>
                    </div>
                    <ProgressBar ratio={q.ratio} warnAt={q.warnAt} tone={q.tone} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </AsyncState>
    </>
  );
});