import type { ReactNode } from "react";

/**
 * 后半程 8 个屏共用的小件。
 *
 * 抽出来不是为了少写几行，而是为了**语义一致**：严重度的颜色、状态徽标的
 * 措辞、进度条的预警线，在告警屏和工单屏必须长得一模一样，否则同一件事在
 * 两个页面上看起来像两件事。
 */

/** 徽标配色。语义固定，不要按"好看"改。 */
export type Tone = "neutral" | "info" | "ok" | "warn" | "danger" | "brand";

// 用 tailwind.config.js 里的语义色，不用默认调色板 —— 换主题时只改那一处
const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-600",
  info: "bg-info/10 text-info",
  ok: "bg-brand-soft text-brand",
  warn: "bg-warn/10 text-warn",
  danger: "bg-danger/10 text-danger",
  brand: "bg-accent/10 text-accent",
};

export function Badge({
  tone = "neutral",
  children,
  title,
}: {
  tone?: Tone;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={[
        "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium leading-4",
        TONE_CLASS[tone],
      ].join(" ")}
    >
      {children}
    </span>
  );
}

/** 一个数字 + 标签的统计卡格。 */
export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
}) {
  const color =
    tone === "danger"
      ? "text-danger"
      : tone === "warn"
        ? "text-warn"
        : tone === "ok"
          ? "text-brand"
          : "text-slate-900";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={["mt-1 font-mono text-fluid-xl font-semibold", color].join(" ")}>
        {value}
      </div>
      {hint && <div className="mt-1 text-[11px] text-slate-400">{hint}</div>}
    </div>
  );
}

/**
 * 带预警线的进度条。
 *
 * 超过 100% 的部分不会溢出容器，但**颜色要变** —— 把 120% 画成一条满格的
 * 绿条，等于把超限藏起来。
 */
export function ProgressBar({
  ratio,
  warnAt,
  tone,
}: {
  ratio?: number;
  warnAt?: number;
  tone?: Tone;
}) {
  const r = ratio ?? 0;
  const level: Tone = tone ?? (r >= 1 ? "danger" : r >= (warnAt ?? 0.9) ? "warn" : "ok");
  const bar =
    level === "danger" ? "bg-danger" : level === "warn" ? "bg-warn" : "bg-brand";
  return (
    <div className="relative h-2 w-full overflow-hidden rounded bg-slate-100">
      <div className={["h-2 rounded", bar].join(" ")} style={{ width: `${Math.min(100, r * 100)}%` }} />
      {warnAt !== undefined && warnAt > 0 && warnAt < 1 && (
        <div
          className="absolute top-0 h-2 w-px bg-slate-400/70"
          style={{ left: `${warnAt * 100}%` }}
          title={`预警线 ${(warnAt * 100).toFixed(0)}%`}
        />
      )}
    </div>
  );
}

/** 分段切换（维度 / 介质 / 视图）。 */
export function SegTabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { key: T; label: string }[];
  onChange: (k: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={[
            "rounded px-2.5 py-1 text-xs transition-colors",
            o.key === value
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-100",
          ].join(" ")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 横向占比条 —— 排行 / 拆解表里用，比饼图好读也好排序。 */
export function Meter({ ratio, tone = "info" }: { ratio: number; tone?: Tone }) {
  const bar =
    tone === "danger"
      ? "bg-danger"
      : tone === "warn"
        ? "bg-warn"
        : tone === "brand"
          ? "bg-brand"
          : "bg-info";
  return (
    <div className="h-1.5 w-full rounded bg-slate-100">
      <div
        className={["h-1.5 rounded", bar].join(" ")}
        style={{ width: `${Math.max(1, Math.min(100, ratio * 100))}%` }}
      />
    </div>
  );
}

/**
 * 迷你柱状趋势图。
 *
 * 纯 div，不引图表库 —— 骨架阶段引一个 200KB 的图表库只为画 30 根柱子，
 * 不划算；真要做交互式图表时再引，那时也不会用这个组件。
 */
export function Sparkbars({
  data,
  labels,
  height = 88,
}: {
  data: number[];
  labels?: string[];
  height?: number;
}) {
  const max = data.reduce((m, v) => (v > m ? v : m), 0);
  if (data.length === 0) return null;
  return (
    <div className="flex items-end gap-[2px]" style={{ height }}>
      {data.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-t bg-info/70 hover:bg-info"
          style={{ height: `${max > 0 ? Math.max(2, (v / max) * 100) : 2}%` }}
          title={`${labels?.[i] ?? i}: ${v.toLocaleString(undefined, { maximumFractionDigits: 1 })}`}
        />
      ))}
    </div>
  );
}

/**
 * 「这块还没实现」的说明条。
 *
 * 与其把未实现的区块画成假数据，不如明说 —— 交底时能直接指着它讲进度。
 */
export function NotImplemented({ children }: { children: ReactNode }) {
  return (
    <div className="rounded border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
      {children}
    </div>
  );
}

/**
 * 堆叠柱状趋势。
 *
 * 每根柱子是一个账期，段是分项（或介质）。段的顺序由 `series` 决定 ——
 * 按合计降序传进来，占比大的在底下，某天缺格时上面的段不会整体跳动。
 *
 * 纯 div + inline style：段的颜色是数据驱动的，Tailwind 只保留静态出现过的
 * 类名，拼不出来。
 */
export function StackedBars({
  rows,
  series,
  height = 140,
}: {
  rows: { label: string; values: Record<string, number | undefined>; total: number }[];
  series: { key: string; label: string; color: string }[];
  height?: number;
}) {
  const max = rows.reduce((m, r) => (r.total > m ? r.total : m), 0);
  if (rows.length === 0) return null;

  return (
    <div className="flex items-end gap-[3px]" style={{ height }}>
      {rows.map((r) => (
        <div
          key={r.label}
          className="group relative flex flex-1 flex-col justify-end"
          style={{ height: "100%" }}
          title={
            `${r.label} · 合计 ${r.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}\n` +
            series
              .filter((s) => r.values[s.key] !== undefined)
              .map(
                (s) =>
                  `${s.label} ${r.values[s.key]!.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
              )
              .join("\n")
          }
        >
          {/* 从顶往下画：flex-col + justify-end 时先渲染的段在上面，
              所以要倒着遍历，才能让 series[0]（占比最大）落在柱底 */}
          {[...series].reverse().map((s) => {
            const v = r.values[s.key];
            if (v === undefined || v <= 0) return null;
            return (
              <div
                key={s.key}
                style={{
                  height: `${max > 0 ? (v / max) * 100 : 0}%`,
                  backgroundColor: s.color,
                  opacity: 0.88,
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** 堆叠图的图例。 */
export function Legend({
  series,
}: {
  series: { key: string; label: string; color: string; value?: string }[];
}) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <span
            className="h-2 w-2 shrink-0 rounded-sm"
            style={{ backgroundColor: s.color }}
          />
          {s.label}
          {s.value && <span className="font-mono text-slate-400">{s.value}</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * 同比 / 环比的箭头 + 百分比。
 *
 * **方向性不能写死成"涨=红"**：能耗涨是坏事，光伏发电涨是好事。
 * 调用方用 `higherIsBetter` 说清楚，这里只负责画。
 */
export function Delta({
  value,
  higherIsBetter = false,
  title,
}: {
  value?: number;
  higherIsBetter?: boolean;
  title?: string;
}) {
  if (value === undefined || Number.isNaN(value)) {
    return (
      <span className="font-mono text-[11px] text-slate-300" title={title}>
        —
      </span>
    );
  }
  const good = higherIsBetter ? value > 0 : value < 0;
  const flat = Math.abs(value) < 0.001;
  return (
    <span
      className={[
        "font-mono text-[11px]",
        flat ? "text-slate-400" : good ? "text-brand" : "text-danger",
      ].join(" ")}
      title={title}
    >
      {flat ? "持平" : `${value > 0 ? "▲" : "▼"} ${(Math.abs(value) * 100).toFixed(1)}%`}
    </span>
  );
}
