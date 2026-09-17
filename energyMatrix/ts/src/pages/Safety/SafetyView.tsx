import { useEffect, type ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { useViewModel } from "@/mvvm/hooks/useViewModel";
import { SafetyStore, SafetyViewModel, type ItPanelRow, type MetricVal } from "./SafetyViewModel";
import { KIND_UNIT, SAFETY_TH, fmtVal, fmtValUnit, levelTone } from "./safetyFormat";
import type { EmHisSample } from "@/api/emApi";
import { PageHeader, Card, AsyncState } from "@/components/PageHeader";
import { Badge, Meter, Stat } from "@/components/Bits";
import type { Tone } from "@/components/Bits";
import { useI18n } from "@/i18n/I18NProvider";
import { useSite } from "@/components/SiteContext";
import { fmtTs } from "@/pages/shared";

/**
 * 电气安全监测（需求文档 7.3，V0.1.3，第 16 屏）。
 *
 * 四个子视图，全部只读（红线：只监测不控制，无任何写控制点操作）：
 *   重点负荷实时监控  一级负荷回路 V/A/kW/°C + 24h 功率曲线，按医疗场所筛选
 *   IT 绝缘监测      医用 IT 隔离电源柜绝缘电阻对阈值（IEC 60364-7-710 50 Ω/V）
 *   电能质量分析     THDV/THDI/三相不平衡度 + 暂降事件（域 11 闭环）
 *   电气火灾预警     线缆温度 / 剩余电流，越限 → 域 11 异常 → 工单
 *
 * 视觉参照已确认静态 Demo（docs/demo/2026-09-17-em-safety-screen）。
 * 30 秒轮询只刷告警相关取数；曲线按「站点 + 日」缓存 5 分钟（设计 5.4）。
 */

const SPARK_W = 300;
const SPARK_H = 64;

/** 24h 曲线（SVG 折线，降采样到 ≤144 点，可画越限阈值虚线）。 */
function Spark({
  data,
  color,
  threshold,
}: {
  data: EmHisSample[];
  color: string;
  threshold?: number;
}) {
  const pts: { ts: string; val: number }[] = [];
  const step = Math.max(1, Math.ceil(data.length / 144));
  for (let i = 0; i < data.length; i += step) {
    const s = data[i];
    if (s.val !== undefined && !Number.isNaN(s.val)) pts.push({ ts: s.ts, val: s.val });
  }
  if (pts.length < 2) {
    return <div className="py-4 text-center font-mono text-xs text-slate-300">—</div>;
  }
  const vals = pts.map((p) => p.val);
  const min = threshold !== undefined ? Math.min(Math.min(...vals), threshold) : Math.min(...vals);
  const max = threshold !== undefined ? Math.max(Math.max(...vals), threshold) : Math.max(...vals);
  const span = max - min < 1e-6 ? 1 : max - min;
  const pad = 4;
  const xy = (i: number, v: number): [number, number] => [
    pad + (i / (pts.length - 1)) * (SPARK_W - 2 * pad),
    SPARK_H - pad - ((v - min) / span) * (SPARK_H - 2 * pad),
  ];
  const line = pts.map((p, i) => xy(i, p.val).map((n) => n.toFixed(1)).join(",")).join(" ");
  let threshLine: JSX.Element | null = null;
  if (threshold !== undefined && threshold >= min && threshold <= max) {
    const [, y] = xy(0, threshold);
    threshLine = (
      <line
        x1={pad}
        y1={y}
        x2={SPARK_W - pad}
        y2={y}
        stroke="#ef4444"
        strokeWidth={1}
        strokeDasharray="4 3"
        opacity={0.8}
      />
    );
  }
  const t0 = pts[0].ts.slice(11, 16);
  const t1 = pts[pts.length - 1].ts.slice(11, 16);
  return (
    <svg
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      preserveAspectRatio="none"
      className="block h-16 w-full"
    >
      {threshLine}
      <polyline points={line} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <text x={pad} y={SPARK_H - 1} fontSize={8} fill="#94a3b8">
        {t0}
      </text>
      <text x={SPARK_W - pad} y={SPARK_H - 1} fontSize={8} fill="#94a3b8" textAnchor="end">
        {t1}
      </text>
    </svg>
  );
}

/** 单指标小格：值 + 单位 + 名，越限按级着色。 */
function Metric({
  label,
  m,
  digits = 1,
}: {
  label: string;
  m: MetricVal;
  digits?: number;
}) {
  const color =
    m.level === "alarm"
      ? "text-danger"
      : m.level === "warn"
        ? "text-warn"
        : m.val === undefined
          ? "text-slate-300"
          : "text-slate-900";
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
      <div className={["font-mono text-fluid-base font-semibold", color].join(" ")}>
        {fmtVal(m.val, digits)}
        <span className="ml-0.5 text-[11px] font-normal text-slate-400">{m.unit ?? ""}</span>
      </div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  );
}

/** 级别徽标：正常 / 越限预警 / 越限告警。 */
function LevelBadge({ level, t }: { level: "ok" | "warn" | "alarm"; t: (k: string) => string }) {
  const tone: Tone = levelTone(level);
  return <Badge tone={tone}>{t(`safety.level.${level}`)}</Badge>;
}

/** 卡片外框按级别描边（同 Demo 的 warn/alarm 卡）。 */
function levelCardClass(level: "ok" | "warn" | "alarm"): string {
  return level === "alarm"
    ? "border-danger/40 bg-danger/5"
    : level === "warn"
      ? "border-warn/40 bg-warn/5"
      : "";
}

/** 顶部计数卡。 */
function SummaryCards({
  items,
}: {
  items: { label: string; value: ReactNode; tone?: Tone }[];
}) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
      {items.map((it) => (
        <Stat key={it.label} label={it.label} value={it.value} tone={it.tone ?? "neutral"} />
      ))}
    </div>
  );
}

export const SafetyView = observer(function SafetyView() {
  const vm = useViewModel(SafetyStore, SafetyViewModel);
  const { translate: t } = useI18n();
  const { siteRef } = useSite();

  useEffect(() => {
    if (siteRef) vm.load(siteRef);
  }, [vm, siteRef]);

  // 30 秒轮询：只刷告警相关取数（设计 5.4），曲线缓存 5 分钟
  useEffect(() => {
    const id = setInterval(() => vm.refresh(), 30_000);
    return () => clearInterval(id);
  }, [vm]);

  const labels = {
    loading: t("common.loading"),
    error: t("common.error"),
    empty: t("common.empty"),
  };

  const tabKey = vm.tab;
  const circuits = vm.circuitsFiltered;
  const circuitStat = vm.countBy(vm.circuits);
  const circuitStatF = vm.countBy(circuits);
  const itPanels = vm.itPanels;
  const itStat = vm.countBy(itPanels);
  const feeders = vm.feedersFiltered;
  const feederStat = vm.countBy(vm.feeders);
  const feederStatF = vm.countBy(feeders);
  const fireRows = vm.fireRows;
  const fireStat = vm.countBy(fireRows);

  const tabs = [
    { key: "load" as const, label: t("safety.tab.load"), n: circuitStat.total },
    { key: "it" as const, label: t("safety.tab.it"), n: itStat.total },
    { key: "pq" as const, label: t("safety.tab.pq"), n: feederStat.total },
    { key: "fire" as const, label: t("safety.tab.fire"), n: fireStat.total },
  ];

  return (
    <>
      <PageHeader
        eyebrow={t("safety.eyebrow")}
        title={t("nav.safety")}
        desc={t("safety.desc")}
        actions={<Badge tone="warn">{t("safety.readonly")}</Badge>}
      />

      {/* 子视图页签（带对象计数） */}
      <div className="mb-4 inline-flex rounded-md border border-slate-200 bg-white p-0.5">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            type="button"
            onClick={() => vm.setTab(tb.key)}
            className={[
              "rounded px-2.5 py-1 text-xs transition-colors",
              tabKey === tb.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
            ].join(" ")}
          >
            {tb.label}
            <span
              className={[
                "ml-1 rounded px-1 text-[10px]",
                tabKey === tb.key ? "bg-white/20" : "bg-slate-100 text-slate-500",
              ].join(" ")}
            >
              {tb.n}
            </span>
          </button>
        ))}
      </div>

      <AsyncState loading={vm.loading} error={vm.error} labels={labels}>
        {!vm.hasAnyPoints ? (
          <Card>
            <div className="py-6 text-center">
              <div className="text-sm text-slate-500">{t("safety.empty.title")}</div>
              <div className="mt-1 text-xs text-slate-400">{t("safety.empty.hint")}</div>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {tabKey === "load" && (
              <>
                <SummaryCards
                  items={[
                    { label: t("safety.sum.circuits"), value: circuitStat.total },
                    {
                      label: t("safety.sum.alarm"),
                      value: circuitStatF.alarm,
                      tone: circuitStatF.alarm > 0 ? "danger" : "neutral",
                    },
                    {
                      label: t("safety.sum.warn"),
                      value: circuitStatF.warn,
                      tone: circuitStatF.warn > 0 ? "warn" : "neutral",
                    },
                    {
                      label: t("safety.sum.thTemp"),
                      value: `${SAFETY_TH.tempWarn}/${SAFETY_TH.tempAlarm} °C`,
                    },
                  ]}
                />
                {vm.places.length > 0 && (
                  <div className="mb-3 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-slate-500">{t("safety.place")}</span>
                    <Chip active={vm.placeFilter === "all"} onClick={() => vm.setPlace("all")}>
                      {t("common.all")}
                    </Chip>
                    {vm.places.map((p) => (
                      <Chip key={p} active={vm.placeFilter === p} onClick={() => vm.setPlace(p)}>
                        {p}
                      </Chip>
                    ))}
                  </div>
                )}
                {circuits.length === 0 ? (
                  <Card>
                    <div className="py-6 text-center text-sm text-slate-400">{labels.empty}</div>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                    {circuits.map((c) => (
                      <Card key={c.id} className={levelCardClass(c.level)}>
                        <div className="mb-2 flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-medium text-slate-800">{c.name}</span>
                          {c.place && <Badge tone="neutral">{c.place}</Badge>}
                          <span className="ml-auto">
                            <LevelBadge level={c.level} t={t} />
                          </span>
                        </div>
                        <div className="mb-2 grid grid-cols-4 gap-2">
                          <Metric label={t("safety.metric.volt")} m={c.volt} />
                          <Metric label={t("safety.metric.current")} m={c.current} />
                          <Metric label={t("safety.metric.power")} m={c.power} />
                          <Metric label={t("safety.metric.temp")} m={c.temp} />
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {t("safety.curve.kw")}
                          <span className="float-right text-danger">
                            {t("safety.curve.limit")} {SAFETY_TH.tempWarn}/{SAFETY_TH.tempAlarm} °C
                          </span>
                        </div>
                        <Spark data={c.kwCurve} color="#0d9488" />
                      </Card>
                    ))}
                  </div>
                )}
              </>
            )}

            {tabKey === "it" && (
              <>
                <SummaryCards
                  items={[
                    { label: t("safety.sum.itPanels"), value: itStat.total },
                    {
                      label: t("safety.sum.alarm"),
                      value: itStat.alarm,
                      tone: itStat.alarm > 0 ? "danger" : "neutral",
                    },
                    {
                      label: t("safety.sum.warn"),
                      value: itStat.warn,
                      tone: itStat.warn > 0 ? "warn" : "neutral",
                    },
                    { label: t("safety.sum.thIr"), value: `${SAFETY_TH.irWarn} kΩ` },
                  ]}
                />
                <Card hint={t("safety.itHint")}>
                  {itPanels.length === 0 ? (
                    <div className="py-6 text-center text-sm text-slate-400">{labels.empty}</div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                      {itPanels.map((p: ItPanelRow) => (
                        <ItPanelCard key={p.id} p={p} t={t} />
                      ))}
                    </div>
                  )}
                </Card>
              </>
            )}

            {tabKey === "pq" && (
              <>
                <SummaryCards
                  items={[
                    { label: t("safety.sum.feeders"), value: feederStat.total },
                    {
                      label: t("safety.sum.overLimit"),
                      value: feederStatF.warn,
                      tone: feederStatF.warn > 0 ? "warn" : "neutral",
                    },
                    { label: t("safety.sum.thThdV"), value: `${SAFETY_TH.thdV} %` },
                    { label: t("safety.sum.sagEvents"), value: vm.sagEvents.length },
                  ]}
                />
                {vm.feederPlaces.length > 0 && (
                  <div className="mb-3 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-slate-500">{t("safety.feeder")}</span>
                    <Chip active={vm.feederFilter === "all"} onClick={() => vm.setFeeder("all")}>
                      {t("common.all")}
                    </Chip>
                    {vm.feederPlaces.map((pl) => (
                      <Chip key={pl} active={vm.feederFilter === pl} onClick={() => vm.setFeeder(pl)}>
                        {pl}
                      </Chip>
                    ))}
                  </div>
                )}
                {feeders.length === 0 ? (
                  <Card>
                    <div className="py-6 text-center text-sm text-slate-400">{labels.empty}</div>
                  </Card>
                ) : (
                  <div className="mb-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
                    {feeders.map((f) => (
                      <Card key={f.id} className={levelCardClass(f.level)}>
                        <div className="mb-2 flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-medium text-slate-800">{f.name}</span>
                          {f.place && <Badge tone="neutral">{f.place}</Badge>}
                          <span className="ml-auto">
                            <LevelBadge level={f.level} t={t} />
                          </span>
                        </div>
                        <div className="mb-2 grid grid-cols-3 gap-2">
                          <Metric label={t("safety.metric.thdV")} m={f.thdV} />
                          <Metric label={t("safety.metric.thdI")} m={f.thdI} />
                          <Metric label={t("safety.metric.unb")} m={f.unb} />
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {t("safety.curve.thdV")}
                          <span className="float-right text-danger">
                            {t("safety.curve.limit")} {SAFETY_TH.thdV} %
                          </span>
                        </div>
                        <Spark data={f.thdVCurve} color="#2563eb" threshold={SAFETY_TH.thdV} />
                      </Card>
                    ))}
                  </div>
                )}
                <Card title={t("safety.sag.title")} hint={t("safety.sag.hint")}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-slate-400">
                          <th className="py-1.5 pr-4 font-medium">{t("safety.sag.ts")}</th>
                          <th className="py-1.5 pr-4 font-medium">{t("safety.sag.subject")}</th>
                          <th className="py-1.5 pr-4 font-medium">{t("safety.sag.severity")}</th>
                          <th className="py-1.5 font-medium">{t("safety.sag.status")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vm.sagEvents.length === 0 && (
                          <tr>
                            <td colSpan={4} className="py-4 text-center text-slate-400">
                              {labels.empty}
                            </td>
                          </tr>
                        )}
                        {vm.sagEvents.map((e) => (
                          <tr key={e.id} className="border-t border-slate-100">
                            <td className="py-1.5 pr-4 font-mono text-xs text-slate-600">
                              {fmtTs(e.ts)}
                            </td>
                            <td className="py-1.5 pr-4 text-slate-700">{e.subject ?? "—"}</td>
                            <td className="py-1.5 pr-4">
                              <Badge tone={e.severityTone}>{e.severityDis}</Badge>
                            </td>
                            <td className="py-1.5">
                              <Badge tone={e.status === "open" ? "warn" : "neutral"}>
                                {e.statusDis}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            )}

            {tabKey === "fire" && (
              <>
                <SummaryCards
                  items={[
                    { label: t("safety.sum.fireRows"), value: fireStat.total },
                    {
                      label: t("safety.sum.alarm"),
                      value: fireStat.alarm,
                      tone: fireStat.alarm > 0 ? "danger" : "neutral",
                    },
                    {
                      label: t("safety.sum.warn"),
                      value: fireStat.warn,
                      tone: fireStat.warn > 0 ? "warn" : "neutral",
                    },
                    { label: t("safety.sum.thLeak"), value: `${SAFETY_TH.leakAlarm} mA` },
                  ]}
                />
                <Card
                  title={t("safety.fire.title")}
                  hint={t("safety.fire.hint")}
                >
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-slate-400">
                          <th className="py-1.5 pr-4 font-medium">{t("safety.fire.circuit")}</th>
                          <th className="py-1.5 pr-4 font-medium">
                            {t("safety.fire.temp")}（{SAFETY_TH.tempWarn}/{SAFETY_TH.tempAlarm} °C）
                          </th>
                          <th className="py-1.5 pr-4 font-medium">
                            {t("safety.fire.leak")}（{SAFETY_TH.leakWarn}/{SAFETY_TH.leakAlarm} mA）
                          </th>
                          <th className="py-1.5 font-medium">{t("safety.fire.judge")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fireRows.length === 0 && (
                          <tr>
                            <td colSpan={4} className="py-4 text-center text-slate-400">
                              {labels.empty}
                            </td>
                          </tr>
                        )}
                        {fireRows.map((r) => (
                          <tr
                            key={r.id}
                            className={[
                              "border-t border-slate-100",
                              r.level === "alarm" ? "bg-danger/5" : r.level === "warn" ? "bg-warn/5" : "",
                            ].join(" ")}
                          >
                            <td className="py-2 pr-4 text-slate-700">{r.name}</td>
                            <td className="py-2 pr-4">
                              <Meter
                                ratio={(r.temp.val ?? 0) / SAFETY_TH.tempAlarm}
                                tone={r.temp.level === "alarm" ? "danger" : r.temp.level === "warn" ? "warn" : "ok"}
                              />
                              <span className="ml-2 font-mono text-xs text-slate-600">
                                {fmtValUnit(r.temp.val, r.temp.unit ?? KIND_UNIT.temp)}
                              </span>
                            </td>
                            <td className="py-2 pr-4">
                              <Meter
                                ratio={(r.leak.val ?? 0) / SAFETY_TH.leakAlarm}
                                tone={r.leak.level === "alarm" ? "danger" : r.leak.level === "warn" ? "warn" : "ok"}
                              />
                              <span className="ml-2 font-mono text-xs text-slate-600">
                                {fmtValUnit(r.leak.val, r.leak.unit ?? KIND_UNIT.leak)}
                              </span>
                            </td>
                            <td className="py-2">
                              <LevelBadge level={r.level} t={t} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
                <Card title={t("safety.loop.title")} hint={t("safety.loop.hint")}>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-lg border border-brand/30 bg-brand-soft px-3 py-1.5 font-medium text-brand">
                      {t("safety.loop.rule")}
                    </span>
                    <span className="text-slate-300">→</span>
                    <span className="rounded-lg border border-info/30 bg-info/10 px-3 py-1.5 font-medium text-info">
                      {t("safety.loop.anomaly")}
                    </span>
                    <span className="text-slate-300">→</span>
                    <span className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 font-medium text-accent">
                      {t("safety.loop.workorder")}
                    </span>
                  </div>
                </Card>
              </>
            )}
          </div>
        )}
      </AsyncState>
    </>
  );
});

/** IT 隔离电源柜卡片：绝缘对阈值 + 负荷电流 + 变压器温度。 */
function ItPanelCard({ p, t }: { p: ItPanelRow; t: (k: string) => string }) {
  const irColor = p.level === "alarm" ? "#dc2626" : p.level === "warn" ? "#f59e0b" : "#0d9488";
  return (
    <Card className={levelCardClass(p.level)}>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-medium text-slate-800">{p.name}</span>
        {p.loc && <Badge tone="neutral">{p.loc}</Badge>}
        {p.sysVolt !== undefined && (
          <Badge tone="neutral" title="emSystemVolt">
            IT {fmtVal(p.sysVolt, 0)} V
          </Badge>
        )}
        <span className="ml-auto">
          <LevelBadge level={p.level} t={t} />
        </span>
      </div>
      <div className="mb-1 flex items-baseline justify-between text-[11px] text-slate-400">
        <span>
          {t("safety.metric.ir")} ·{" "}
          <b
            className={
              p.level === "ok"
                ? "text-brand"
                : p.level === "warn"
                  ? "text-warn"
                  : "text-danger"
            }
          >
            {fmtValUnit(p.ir.val, p.ir.unit ?? KIND_UNIT.insulation)}
          </b>
        </span>
        <span className="text-danger">
          {t("safety.curve.limit")} {fmtVal(p.irAlarmAt)} kΩ
        </span>
      </div>
      <Spark data={p.irCurve} color={irColor} threshold={p.irAlarmAt} />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Metric label={t("safety.metric.load")} m={p.load} />
        <Metric label={t("safety.metric.winding")} m={p.windingTemp} />
      </div>
    </Card>
  );
}

/** 筛选 chip。 */
function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "border-brand bg-brand text-white"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100",
      ].join(" ")}
    >
      {children}
    </button>
  );
}