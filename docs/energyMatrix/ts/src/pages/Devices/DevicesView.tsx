import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { Search, Router, Gauge, WifiOff, CheckCircle2, Sigma } from "lucide-react";
import { useViewModel } from "@/mvvm/hooks/useViewModel";
import {
  DevicesStore,
  DevicesViewModel,
  COMM_ADVICE,
  COMM_DIS,
  COMM_TONE,
  type MeterRow,
} from "./DevicesViewModel";
import { PageHeader, Card, AsyncState } from "@/components/PageHeader";
import { useI18n } from "@/i18n/I18NProvider";
import { useSite } from "@/components/SiteContext";

const MEDIUM_DIS: Record<string, string> = {
  elec: "电", water: "水", gas: "燃气", steam: "蒸汽",
  heat: "热量", cool: "冷量", diesel: "柴油", coal: "煤", hydrogen: "氢",
};

const ROLE_DIS: Record<string, string> = {
  gateway: "关口表", main: "总表", branch: "分项表",
  sub: "子表", check: "考核表", virtual: "虚表",
};

const TONE_CLASS: Record<string, string> = {
  ok: "bg-brand/10 text-brand",
  warn: "bg-warn/10 text-warn",
  danger: "bg-danger/10 text-danger",
  muted: "bg-slate-100 text-slate-500",
};

/** 状态筛选器上的按钮。problem 是组合项：所有需要处置的状态。 */
const STATUS_FILTERS = [
  { key: "", dis: "全部" },
  { key: "problem", dis: "待处理" },
  { key: "ok", dis: "正常" },
  { key: "stale", dis: "不新鲜" },
  { key: "unbound", dis: "未接采集器" },
  { key: "noPoint", dis: "缺采集点" },
  { key: "virtual", dis: "虚表" },
];

/**
 * 表具与采集器管理。
 *
 * 上面是统计卡（在册 / 正常 / 待处理 / 采集器 / 平均完好率），下面是表具台账。
 * 「待处理」是默认想看的那一栏 —— 运维打开这个页面就是为了找出哪些表没在传数据。
 */
export const DevicesView = observer(function DevicesView() {
  const vm = useViewModel(DevicesStore, DevicesViewModel);
  const { translate: t } = useI18n();
  const { siteRef, span } = useSite();

  const [medium, setMedium] = useState("");
  const [status, setStatus] = useState("");
  const [keyword, setKeyword] = useState("");
  const [showConns, setShowConns] = useState(false);

  useEffect(() => {
    if (siteRef) vm.load(siteRef, span);
  }, [vm, siteRef, span]);

  const rows = vm.filtered(medium, status, keyword);
  const counts = vm.statusCounts;
  const s = vm.stats;
  const labels = {
    loading: t("common.loading"),
    error: t("common.error"),
    empty: t("common.empty"),
  };

  return (
    <>
      <PageHeader
        eyebrow="表具与采集器"
        title={t("nav.devices")}
        desc="哪些表在正常上传数据、哪些没在。完好率低的表，它算出来的账不能用于结算"
        actions={
          <button
            onClick={() => setShowConns((v) => !v)}
            className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            <Router size={15} />
            {showConns ? "隐藏采集器" : `采集器 ${s.connCount}`}
          </button>
        }
      />

      <AsyncState loading={vm.loading} error={vm.error} labels={labels}>
        {/* 统计卡 */}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          <StatCard
            Icon={Gauge}
            label="在册表计"
            value={s.physical}
            sub={s.virtual > 0 ? `另有 ${s.virtual} 块虚表` : undefined}
          />
          <StatCard Icon={CheckCircle2} label="通信正常" value={s.ok} tone="ok" />
          <StatCard
            Icon={WifiOff}
            label="待处理"
            value={s.offline}
            tone={s.offline > 0 ? "danger" : "ok"}
            sub={s.offline > 0 ? "故障 / 中断 / 未接采集" : "全部正常"}
            onClick={s.offline > 0 ? () => setStatus("problem") : undefined}
          />
          <StatCard Icon={Router} label="采集器" value={s.connCount} />
          <StatCard
            Icon={Sigma}
            label="平均完好率"
            valueText={vm.fmtPct(s.qualityAvg)}
            tone={
              s.qualityAvg === undefined
                ? "muted"
                : s.qualityAvg >= 0.95
                  ? "ok"
                  : s.qualityAvg >= 0.8
                    ? "warn"
                    : "danger"
            }
            sub={s.qualityAvg === undefined ? "本期还没有台账" : "取本期台账的最差值"}
          />
        </div>

        {/* 采集器清单 */}
        {showConns && (
          <Card title="采集器" hint="由采集器扩展维护，这里只读不改" className="mb-4">
            {vm.connRows.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-400">
                本站点的表计还没有接到任何采集器
              </div>
            ) : (
              <div className="em-scroll-x">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                      <th className="py-2 pr-3 font-normal">采集器</th>
                      <th className="py-2 pr-3 font-normal">状态</th>
                      <th className="py-2 pr-3 text-right font-normal">带表数</th>
                      <th className="py-2 text-right font-normal">点位数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vm.connRows.map((c) => (
                      <tr key={c.id} className="border-b border-slate-50 last:border-0">
                        <td className="py-2 pr-3">{c.dis}</td>
                        <td className="py-2 pr-3 text-xs">
                          <span
                            className={[
                              "rounded px-1.5 py-0.5",
                              c.status === "ok" ? TONE_CLASS.ok : TONE_CLASS.warn,
                            ].join(" ")}
                          >
                            {COMM_DIS[c.status ?? ""] ?? c.status ?? "未知"}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-right font-mono text-xs">{c.meterCount}</td>
                        <td className="py-2 text-right font-mono text-xs">{c.pointCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {/* 表具台账 */}
        <Card>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索表计"
                className="w-44 rounded-md border border-slate-300 py-1.5 pl-8 pr-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>

            <select
              value={medium}
              onChange={(e) => setMedium(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <option value="">全部介质</option>
              {vm.media.map((m) => (
                <option key={m} value={m}>
                  {MEDIUM_DIS[m] ?? m}
                </option>
              ))}
            </select>

            <div className="flex flex-wrap items-center gap-1">
              {STATUS_FILTERS.map((f) => {
                const n = f.key === "" ? vm.rows.length : (counts[f.key] ?? 0);
                if (f.key !== "" && n === 0) return null;
                return (
                  <button
                    key={f.key || "all"}
                    onClick={() => setStatus(f.key)}
                    className={[
                      "rounded-md px-2 py-1 text-xs transition-colors",
                      status === f.key
                        ? "bg-slate-800 text-white"
                        : "text-slate-600 hover:bg-slate-100",
                    ].join(" ")}
                  >
                    {f.dis}
                    <span className="ml-1 opacity-60">{n}</span>
                  </button>
                );
              })}
            </div>

            <span className="ml-auto text-[11px] text-slate-400">{rows.length} 块表</span>
          </div>

          {rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">
              {vm.rows.length === 0
                ? "这个站点下还没有表计，先到「数据模型配置」建表"
                : "没有匹配的表计，换个筛选条件试试"}
            </div>
          ) : (
            <div className="em-scroll-x">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                    <th className="py-2 pr-3 font-normal">表计</th>
                    <th className="py-2 pr-3 font-normal">介质</th>
                    <th className="py-2 pr-3 font-normal">角色</th>
                    <th className="py-2 pr-3 font-normal">上级表</th>
                    <th className="py-2 pr-3 font-normal">采集器</th>
                    <th className="py-2 pr-3 text-right font-normal">倍率</th>
                    <th className="py-2 pr-3 text-right font-normal">当前读数</th>
                    <th className="py-2 pr-3 text-right font-normal">完好率</th>
                    <th className="py-2 font-normal">通信状态</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <MeterTr key={r.id} row={r} vm={vm} />
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

function StatCard({
  Icon,
  label,
  value,
  valueText,
  sub,
  tone = "muted",
  onClick,
}: {
  Icon: typeof Gauge;
  label: string;
  value?: number;
  valueText?: string;
  sub?: string;
  tone?: "ok" | "warn" | "danger" | "muted";
  onClick?: () => void;
}) {
  const color =
    tone === "ok" ? "text-brand" : tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : "text-slate-900";
  return (
    <div
      onClick={onClick}
      className={[
        "rounded-lg border border-slate-200 bg-white p-4",
        onClick ? "cursor-pointer transition-colors hover:border-slate-300 hover:bg-slate-50" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        <Icon size={13} className="text-slate-400" />
        {label}
      </div>
      <div className={`mt-1 font-mono text-fluid-xl font-semibold ${color}`}>
        {valueText ?? value}
      </div>
      {sub && <div className="mt-1 text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}

function MeterTr({ row: r, vm }: { row: MeterRow; vm: DevicesViewModel }) {
  const tone = COMM_TONE[r.status] ?? "muted";
  const advice = COMM_ADVICE[r.status];
  return (
    <tr className="border-b border-slate-50 last:border-0">
      <td className="py-2 pr-3">
        {r.dis}
        {r.gap && (
          <span className="ml-1.5 rounded bg-warn/10 px-1 py-0.5 text-[10px] text-warn">缺口</span>
        )}
        {r.subItem && (
          <span className="ml-1.5 font-mono text-[10px] uppercase text-slate-400">
            {r.subItem}
          </span>
        )}
      </td>
      <td className="py-2 pr-3 text-xs text-slate-500">
        {r.medium ? (MEDIUM_DIS[r.medium] ?? r.medium) : "—"}
      </td>
      <td className="py-2 pr-3 text-xs text-slate-500">{ROLE_DIS[r.role] ?? r.role}</td>
      <td className="py-2 pr-3 text-xs text-slate-500">{r.parentDis ?? "—"}</td>
      <td className="py-2 pr-3 text-xs text-slate-500">{r.connDis ?? "—"}</td>
      <td className="py-2 pr-3 text-right font-mono text-xs">{vm.fmtNum(r.factor)}</td>
      <td className="py-2 pr-3 text-right font-mono text-xs">{vm.fmtNum(r.curVal)}</td>
      <td
        className={[
          "py-2 pr-3 text-right font-mono text-xs",
          r.quality !== undefined && r.quality < 0.8 ? "text-danger" : "",
        ].join(" ")}
      >
        {vm.fmtPct(r.quality)}
      </td>
      <td className="py-2">
        <span
          className={["rounded px-1.5 py-0.5 text-[11px]", TONE_CLASS[tone]].join(" ")}
          title={advice}
        >
          {COMM_DIS[r.status] ?? r.status}
        </span>
        {advice && (
          <div className="mt-0.5 max-w-xs text-[10px] leading-relaxed text-slate-400">{advice}</div>
        )}
      </td>
    </tr>
  );
}
