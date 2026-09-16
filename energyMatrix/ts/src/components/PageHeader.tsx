import type { ReactNode } from "react";

/**
 * 每屏统一的页头：eyebrow（标注本屏对应的语义 spec）+ 标题 + 一句话说明。
 *
 * eyebrow 里写 `em::EmMeter` 这种 spec 名不是装饰 —— 它把界面上的每个数字
 * 和语义模型对上号，交底和排查时能直接顺着 spec 名找到定义与来源。
 */
export function PageHeader({
  eyebrow,
  title,
  desc,
  actions,
}: {
  eyebrow: string;
  title: string;
  desc?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start gap-4">
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[11px] uppercase tracking-widest text-info">{eyebrow}</div>
        <h1 className="text-fluid-lg font-semibold text-slate-900">{title}</h1>
        {desc && <p className="mt-1 text-sm text-slate-500">{desc}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/** 卡片外框 —— 全站统一的一层容器，避免每页各写一套阴影和圆角。 */
export function Card({
  title,
  hint,
  children,
  className,
}: {
  title?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={["rounded-lg border border-slate-200 bg-white p-4", className ?? ""].join(" ")}
    >
      {title && (
        <header className="mb-3">
          <h2 className="text-sm font-medium text-slate-700">{title}</h2>
          {hint && <p className="text-xs text-slate-400">{hint}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

/** 统一的加载 / 空 / 错误占位，避免三种状态在各页各写一遍。 */
export function AsyncState({
  loading,
  error,
  empty,
  labels,
  children,
}: {
  loading: boolean;
  error?: string;
  empty?: boolean;
  labels: { loading: string; error: string; empty: string };
  children: ReactNode;
}) {
  if (loading) return <div className="py-8 text-center text-sm text-slate-400">{labels.loading}</div>;
  if (error)
    return (
      <div className="py-8 text-center text-sm text-danger">
        {labels.error}
        <div className="mt-1 font-mono text-xs text-slate-400">{error}</div>
      </div>
    );
  if (empty) return <div className="py-8 text-center text-sm text-slate-400">{labels.empty}</div>;
  return <>{children}</>;
}
