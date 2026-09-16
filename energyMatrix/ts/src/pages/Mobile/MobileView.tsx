import { useEffect, type ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { useViewModel } from "@/mvvm/hooks/useViewModel";
import { MobileStore, MobileViewModel } from "./MobileViewModel";
import { PageHeader, AsyncState } from "@/components/PageHeader";
import { Badge, ProgressBar, Sparkbars } from "@/components/Bits";
import { useI18n } from "@/i18n/I18NProvider";
import { useSite } from "@/components/SiteContext";

/**
 * 移动端速览（设计稿版式 M）。
 *
 * 三部手机并排：值班首页（深色，控制室 / 夜间）、异常处置（白班巡检）、
 * 能耗速览（管理者）。数据全部复用桌面端接口 —— 移动端不另开一套后端。
 */
export const MobileView = observer(function MobileView() {
  const vm = useViewModel(MobileStore, MobileViewModel);
  const { translate: t } = useI18n();
  const { siteRef, siteDis, span } = useSite();

  useEffect(() => {
    if (siteRef) vm.load(siteRef, span);
  }, [vm, siteRef, span]);

  const labels = {
    loading: t("common.loading"),
    error: t("common.error"),
    empty: t("common.empty"),
  };

  return (
    <>
      <PageHeader
        eyebrow="MOBILE · em::EmAnomaly"
        title={t("nav.mobile")}
        desc="三个场景共用桌面端的同一批接口 —— 移动端另起一套后端，两边口径迟早分叉"
      />

      <AsyncState loading={vm.loading} error={vm.error} labels={labels}>
        <div className="flex flex-wrap gap-6">
          {/* 一、值班首页（深色） */}
          <Phone title="值班首页" subtitle="控制室 / 夜间" dark>
            <div className="px-4 pt-3">
              <div className="text-[11px] text-slate-400">{siteDis ?? "—"}</div>
              <div className="mt-2 text-[11px] text-slate-400">本期电耗 kWh</div>
              <div className="font-mono text-3xl font-semibold text-white">
                {vm.fmtNum(vm.elecTotal, 0)}
              </div>
              {vm.dod !== undefined && (
                <div
                  className={[
                    "mt-0.5 font-mono text-xs",
                    vm.dod > 0 ? "text-warn" : "text-brand",
                  ].join(" ")}
                >
                  环比 {vm.dod > 0 ? "+" : ""}
                  {vm.fmtPct(vm.dod)}
                </div>
              )}
              <div className="mt-3">
                <Sparkbars
                  data={vm.trend.map((x) => x.val)}
                  labels={vm.trend.map((x) => x.period)}
                  height={52}
                />
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <DarkStat label="严重" value={vm.statOf("emCritical")} danger />
                <DarkStat label="待处理" value={vm.statOf("open")} />
                <DarkStat label="已派单" value={vm.statOf("dispatched")} />
              </div>

              <div className="mt-4 text-[11px] text-slate-400">异常事件流</div>
              <ul className="mt-1 space-y-1.5 pb-4">
                {vm.recentAnomalies.length === 0 && (
                  <li className="py-4 text-center text-[11px] text-slate-500">暂无异常</li>
                )}
                {vm.recentAnomalies.map((a) => (
                  <li key={a.id} className="rounded bg-shell-soft px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={[
                          "h-1.5 w-1.5 rounded-full",
                          a.severity === "critical"
                            ? "bg-danger"
                            : a.severity === "warn"
                              ? "bg-warn"
                              : "bg-info",
                        ].join(" ")}
                      />
                      <span className="truncate text-[11px] text-slate-200">{a.dis}</span>
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-slate-500">
                      {vm.fmtTs(a.ts)}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <PhoneTabs active="实时" dark />
          </Phone>

          {/* 二、异常处置（浅色） */}
          <Phone title="异常处置" subtitle="白班巡检">
            <div className="px-4 pt-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-slate-800">待办异常</span>
                <span className="font-mono text-xs text-slate-400">
                  {vm.pendingAnomalies.length} 条
                </span>
              </div>
              <ul className="mt-2 space-y-2 pb-4">
                {vm.pendingAnomalies.length === 0 && (
                  <li className="py-6 text-center text-xs text-slate-400">
                    没有待处理异常
                    <div className="mt-1 text-[11px]">去「实时告警」屏跑一次诊断</div>
                  </li>
                )}
                {vm.pendingAnomalies.map((a) => (
                  <li key={a.id} className="rounded border border-slate-200 p-2">
                    <div className="flex items-center gap-1.5">
                      <Badge tone={a.severityTone}>{a.severityDis}</Badge>
                      <span className="truncate text-[11px] text-slate-500">
                        {a.subjectDis ?? "—"}
                      </span>
                    </div>
                    <div className="mt-1 line-clamp-2 text-xs text-slate-700">{a.dis}</div>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="font-mono text-[10px] text-slate-400">
                        {vm.fmtTs(a.ts)}
                      </span>
                      <button
                        type="button"
                        disabled={vm.busyId === a.id}
                        onClick={() => siteRef && vm.ack(siteRef, span, a.id)}
                        className="rounded bg-slate-900 px-2 py-0.5 text-[11px] text-white disabled:opacity-40"
                      >
                        确认
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <PhoneTabs active="告警" />
          </Phone>

          {/* 三、能耗速览（浅色） */}
          <Phone title="能耗速览" subtitle="管理者">
            <div className="px-4 pt-3 pb-4">
              <div className="text-[11px] text-slate-400">{siteDis ?? "—"} · 本期</div>
              <ul className="mt-2 grid grid-cols-2 gap-2">
                {vm.mediumRows.slice(0, 4).map((m) => (
                  <li key={m.medium} className="rounded border border-slate-200 p-2">
                    <div className="text-[11px] text-slate-400">{m.dis}</div>
                    <div className="font-mono text-sm font-medium text-slate-800">
                      {vm.fmtNum(m.val, 0)}
                    </div>
                  </li>
                ))}
                {vm.mediumRows.length === 0 && (
                  <li className="col-span-2 py-4 text-center text-xs text-slate-400">
                    本期还没有台账
                  </li>
                )}
              </ul>

              <div className="mt-4 text-[11px] text-slate-400">定额进度</div>
              <ul className="mt-1.5 space-y-2.5">
                {vm.quotaRows.length === 0 && (
                  <li className="py-3 text-center text-xs text-slate-400">未设置定额</li>
                )}
                {vm.quotaRows.map((q, i) => (
                  <li key={i}>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="truncate text-slate-600">{q.dis}</span>
                      <span className="ml-2 shrink-0 font-mono text-slate-400">
                        {vm.fmtPct(q.ratio, 0)}
                      </span>
                    </div>
                    <div className="mt-1">
                      <ProgressBar
                        ratio={q.ratio}
                        tone={q.level === "over" ? "danger" : q.level === "warn" ? "warn" : "ok"}
                      />
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-400">{q.sourceDis}</div>
                  </li>
                ))}
              </ul>
            </div>
            <PhoneTabs active="我的" />
          </Phone>
        </div>
      </AsyncState>
    </>
  );
});

/** 手机外框。宽 300 是 iPhone 逻辑宽度的近似，够看出真实的换行位置。 */
function Phone({
  title,
  subtitle,
  dark,
  children,
}: {
  title: string;
  subtitle: string;
  dark?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-2">
        <div className="text-sm font-medium text-slate-700">{title}</div>
        <div className="text-[11px] text-slate-400">{subtitle}</div>
      </div>
      <div
        className={[
          "flex w-[300px] flex-col overflow-hidden rounded-[1.75rem] border-4 shadow-sm",
          dark ? "border-shell-line bg-shell" : "border-slate-200 bg-white",
        ].join(" ")}
        style={{ height: 560 }}
      >
        {/* 刘海 */}
        <div className="flex justify-center pt-2">
          <div
            className={[
              "h-1.5 w-16 rounded-full",
              dark ? "bg-shell-line" : "bg-slate-200",
            ].join(" ")}
          />
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function DarkStat({
  label,
  value,
  danger,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div className="rounded bg-shell-soft py-2">
      <div
        className={[
          "font-mono text-lg font-semibold",
          danger && value > 0 ? "text-danger" : "text-white",
        ].join(" ")}
      >
        {value}
      </div>
      <div className="text-[10px] text-slate-400">{label}</div>
    </div>
  );
}

/** 底部 tab。原型件 —— 桌面端不导航，只表明移动端的信息架构。 */
function PhoneTabs({ active, dark }: { active: string; dark?: boolean }) {
  const tabs = ["实时", "告警", "巡检", "我的"];
  return (
    <nav
      className={[
        "flex shrink-0 border-t",
        dark ? "border-shell-line bg-shell-soft" : "border-slate-200 bg-slate-50",
      ].join(" ")}
    >
      {tabs.map((tab) => (
        <div
          key={tab}
          className={[
            "flex-1 py-2 text-center text-[11px]",
            tab === active
              ? dark
                ? "text-brand"
                : "text-slate-900"
              : dark
                ? "text-slate-500"
                : "text-slate-400",
          ].join(" ")}
        >
          {tab}
        </div>
      ))}
    </nav>
  );
}
