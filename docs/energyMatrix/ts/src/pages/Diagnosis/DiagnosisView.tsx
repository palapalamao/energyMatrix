import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { useViewModel } from "@/mvvm/hooks/useViewModel";
import { DiagnosisStore, DiagnosisViewModel } from "./DiagnosisViewModel";
import { PageHeader, Card, AsyncState } from "@/components/PageHeader";
import { Badge, Stat } from "@/components/Bits";
import { useI18n } from "@/i18n/I18NProvider";
import { useSite } from "@/components/SiteContext";

/**
 * 节能诊断与核证（设计稿版式 G）。
 *
 * 三态节能量在页面上永远是三格，不做合并、不做兜底 —— 铁律 10。
 */
export const DiagnosisView = observer(function DiagnosisView() {
  const vm = useViewModel(DiagnosisStore, DiagnosisViewModel);
  const { translate: t } = useI18n();
  const { siteRef } = useSite();

  useEffect(() => {
    if (siteRef) vm.load(siteRef);
  }, [vm, siteRef]);

  const labels = {
    loading: t("common.loading"),
    error: t("common.error"),
    empty: t("common.empty"),
  };

  const totals = vm.savingsTotals;

  return (
    <>
      <PageHeader
        eyebrow="M&V · em::EmSavingsProject"
        title={t("nav.diagnosis")}
        desc="节能量三态字段不得相互替代；未经核证不得以已核证口径对外发布"
      />

      <AsyncState loading={vm.loading} error={vm.error} labels={labels}>
        <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Stat label="规划节能量 kWh" value={vm.fmtNum(totals.planned, 0)} hint="emSavingsPlanned" />
          <Stat
            label="实测节能量 kWh"
            value={vm.fmtNum(totals.measured, 0)}
            tone="warn"
            hint="emSavingsMeasured · 未经核证"
          />
          <Stat
            label="已核证节能量 kWh"
            value={vm.fmtNum(totals.verified, 0)}
            tone="ok"
            hint="emSavingsVerified · 唯一可对外口径"
          />
          <Stat
            label="待核证项目"
            value={vm.unverifiedCount}
            tone={vm.unverifiedCount > 0 ? "warn" : "neutral"}
            hint="仅可按「规划目标」口径引用"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* 节能项目 */}
          <Card
            title="节能项目"
            hint="回收期只用已核证节能量计算 —— 用规划值算出来的回收期是期货"
            className="lg:col-span-2"
          >
            {vm.projectRows.length === 0 ? (
              <div className="text-sm text-slate-400">{labels.empty}</div>
            ) : (
              <ul className="space-y-3">
                {vm.projectRows.map((p) => (
                  <li key={p.id} className="rounded border border-slate-100 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-slate-800">{p.dis}</span>
                      <Badge tone="info">{vm.ecmDis(p.ecmType)}</Badge>
                      <Badge tone={p.statusTone}>{p.statusDis}</Badge>
                      {!p.hasBaseline && <Badge tone="warn">未绑定基线</Badge>}
                      {p.payback !== undefined && (
                        <span className="ml-auto font-mono text-xs text-slate-500">
                          回收期 {vm.fmtNum(p.payback, 1)} 年
                        </span>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <Cell label="规划" value={vm.fmtNum(p.planned, 0)} />
                      <Cell label="实测" value={vm.fmtNum(p.measured, 0)} tone="text-warn" />
                      <Cell label="已核证" value={vm.fmtNum(p.verified, 0)} tone="text-brand" />
                      <Cell label="投资 元" value={vm.fmtNum(p.invest, 0)} />
                    </div>
                    {p.verifiedBy && (
                      <div className="mt-1.5 text-[11px] text-slate-400">
                        核证方：{p.verifiedBy}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="space-y-4">
            {/* 基线统计验收 */}
            <Card title="基线统计验收" hint="ASHRAE Guideline 14，三项逐条判定">
              {vm.baselineRows.length === 0 ? (
                <div className="text-sm text-slate-400">{labels.empty}</div>
              ) : (
                <ul className="space-y-3">
                  {vm.baselineRows.map((b) => (
                    <li key={b.id} className="rounded border border-slate-100 p-2.5">
                      <div className="flex items-center gap-1.5">
                        <Badge tone={b.valid ? "ok" : "danger"}>
                          {b.valid ? "验收通过" : "未通过"}
                        </Badge>
                        {b.option && <Badge tone="neutral">{b.option}</Badge>}
                      </div>
                      <div className="mt-1 text-xs text-slate-600">{b.dis}</div>
                      <ul className="mt-2 space-y-1">
                        {b.checks.map((c) => (
                          <li
                            key={c.label}
                            className="flex items-center justify-between text-[11px]"
                          >
                            <span className="text-slate-500">{c.label}</span>
                            <span
                              className={[
                                "font-mono",
                                c.ok ? "text-brand" : "text-danger",
                              ].join(" ")}
                            >
                              {c.ok ? "✓" : "✗"} {c.text}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* 诊断规则库 */}
            <Card
              title="诊断规则库"
              hint={
                vm.unsupportedRuleCount > 0
                  ? `其中 ${vm.unsupportedRuleCount} 条的判据尚未实现，跑诊断时会被跳过`
                  : "全部判据均已实现"
              }
            >
              {vm.ruleRows.length === 0 ? (
                <div className="text-sm text-slate-400">{labels.empty}</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {vm.ruleRows.map((r) => (
                    <li key={r.id} className="py-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[11px] text-info">{r.code ?? "—"}</span>
                        <Badge tone={r.severityTone}>{vm.severityDis(r.severity)}</Badge>
                        {!r.supported && <Badge tone="neutral">判据未实现</Badge>}
                        {r.threshold !== undefined && (
                          <span className="ml-auto font-mono text-[11px] text-slate-400">
                            阈值 {vm.fmtNum(r.threshold, 3)}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-600">{r.dis}</div>
                      <div className="text-[11px] text-slate-400">{r.categoryDis}</div>
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

function Cell({
  label,
  value,
  tone = "text-slate-800",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div>
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className={["font-mono text-sm", tone].join(" ")}>{value}</div>
    </div>
  );
}
