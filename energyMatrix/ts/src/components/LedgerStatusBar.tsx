import { useEffect, useState } from "react";
import { useClient } from "haystack-react";
import { emClosePeriods, has, num, str } from "@/api/emApi";
import { useI18n } from "@/i18n/I18NProvider";
import { useSite } from "@/components/SiteContext";

/**
 * 左侧导航底部常驻的账期状态条（设计稿里的 Ledger 状态条）。
 *
 * 显示最近一个关账批次：账期 / 是否已关账 / 缺口率。
 * 这条信息之所以常驻，是因为「这个月的账平不平」决定了页面上所有数字
 * 能不能拿去结算和披露 —— 它不该藏在某个二级页面里。
 */
export function LedgerStatusBar() {
  const client = useClient();
  const { translate: t } = useI18n();
  const { siteRef } = useSite();
  const [batch, setBatch] = useState<{
    period?: string;
    closed: boolean;
    gapRatio?: number;
  } | null>(null);

  useEffect(() => {
    if (!siteRef) {
      setBatch(null);
      return;
    }
    let cancelled = false;
    emClosePeriods(client, siteRef)
      .then((list) => {
        if (cancelled) return;
        // 取账期键最大的那个批次（字符串比较对 2026-07 这种格式是安全的）
        const latest = list
          .slice()
          .sort((a, b) => (str(a, "emPeriod") ?? "").localeCompare(str(b, "emPeriod") ?? ""))
          .pop();
        setBatch(
          latest
            ? {
                period: str(latest, "emPeriod"),
                closed: has(latest, "emClosed"),
                gapRatio: num(latest, "emGapRatio"),
              }
            : null
        );
      })
      .catch(() => {
        if (!cancelled) setBatch(null);
      });
    return () => {
      cancelled = true;
    };
  }, [client, siteRef]);

  const gapPct =
    batch?.gapRatio === undefined ? undefined : (batch.gapRatio * 100).toFixed(1) + "%";

  return (
    <div className="border-t border-shell-line px-4 py-3 text-xs">
      {!batch && <div className="text-slate-500">{t("common.empty")}</div>}
      {batch && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">{t("ledgerBar.period")}</span>
            <span className="font-mono text-slate-200">{batch.period ?? "—"}</span>
            <span
              className={[
                "rounded px-1.5 py-0.5 text-[10px]",
                batch.closed ? "bg-brand/20 text-brand" : "bg-warn/20 text-warn",
              ].join(" ")}
            >
              {batch.closed ? t("ledgerBar.closed") : t("ledgerBar.open")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400">{t("ledgerBar.gapRatio")}</span>
            <span className="font-mono text-slate-200">{gapPct ?? "—"}</span>
          </div>
        </div>
      )}
    </div>
  );
}
