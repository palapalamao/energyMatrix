import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import { useI18n } from "@/i18n/I18NProvider";
import { useSite, type RangeKey } from "@/components/SiteContext";
import { id as emId, str } from "@/api/emApi";
import { LedgerStatusBar } from "@/components/LedgerStatusBar";
import { PodVersionBadge } from "@/components/PodVersionBadge";

/**
 * 全局框架：左侧 240px 四分组导航 + 顶栏 + 底部常驻 Ledger 状态条。
 * 布局照 UI 设计稿（南京奥体中心原型）。
 */

interface NavItem {
  to: string;
  key: string;
}
interface NavGroup {
  key: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    key: "group.monitor",
    items: [
      { to: "/overview", key: "nav.overview" },
      { to: "/realtime", key: "nav.realtime" },
      { to: "/workorder", key: "nav.workorder" },
      { to: "/meter-tree", key: "nav.meterTree" },
    ],
  },
  {
    key: "group.analysis",
    items: [
      { to: "/analysis", key: "nav.analysis" },
      { to: "/quota", key: "nav.quota" },
      { to: "/diagnosis", key: "nav.diagnosis" },
      { to: "/carbon", key: "nav.carbon" },
    ],
  },
  {
    key: "group.asset",
    items: [
      { to: "/model", key: "nav.model" },
      { to: "/devices", key: "nav.devices" },
    ],
  },
  {
    key: "group.portfolio",
    items: [
      { to: "/portfolio", key: "nav.portfolio" },
      { to: "/reports", key: "nav.reports" },
      { to: "/mobile", key: "nav.mobile" },
    ],
  },
];

const RANGES: RangeKey[] = ["today", "week", "month", "year"];
const RANGE_LABEL: Record<RangeKey, string> = {
  today: "今日",
  week: "本周",
  month: "本月",
  year: "本年",
};

export function AppShell({ children }: { children: ReactNode }) {
  const { translate: t, lang, setLang } = useI18n();
  const { sites, siteRef, setSiteRef, rangeKey, setRangeKey } = useSite();

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* ── 左侧导航 ─────────────────────────────────────────── */}
      <aside className="flex h-full w-sidebar shrink-0 flex-col bg-shell text-slate-300">
        <div className="border-b border-shell-line px-5 py-4">
          <div className="text-lg font-semibold tracking-wide text-white">
            {t("app.title")}
          </div>
          <div className="text-xs text-slate-400">{t("app.subtitle")}</div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {NAV_GROUPS.map((g) => (
            <div key={g.key} className="mb-4">
              <div className="px-3 pb-1 text-[11px] uppercase tracking-widest text-slate-500">
                {t(g.key)}
              </div>
              {g.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    [
                      "block rounded px-3 py-2 text-sm transition-colors",
                      isActive
                        ? "bg-brand/15 text-brand"
                        : "text-slate-300 hover:bg-shell-soft hover:text-white",
                    ].join(" ")
                  }
                >
                  {t(item.key)}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <LedgerStatusBar />
        <PodVersionBadge />
      </aside>

      {/* ── 右侧主区 ─────────────────────────────────────────── */}
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-6 py-3">
          <label className="text-xs text-slate-500">{t("common.site")}</label>
          <select
            className="rounded border border-slate-300 px-2 py-1 text-sm"
            value={siteRef ?? ""}
            onChange={(e) => setSiteRef(e.target.value)}
          >
            {sites.length === 0 && <option value="">—</option>}
            {sites.map((s) => (
              <option key={emId(s)} value={emId(s)}>
                {str(s, "dis") ?? emId(s)}
              </option>
            ))}
          </select>

          <div className="ml-4 flex items-center gap-1 rounded border border-slate-300 p-0.5">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRangeKey(r)}
                className={[
                  "rounded px-2 py-1 text-xs transition-colors",
                  rangeKey === r ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100",
                ].join(" ")}
              >
                {RANGE_LABEL[r]}
              </button>
            ))}
          </div>

          <div className="ml-auto">
            <button
              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
              onClick={() => setLang(lang === "zh" ? "en" : "zh")}
            >
              {lang === "zh" ? "EN" : "中文"}
            </button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-6 py-5">{children}</main>
      </div>
    </div>
  );
}
