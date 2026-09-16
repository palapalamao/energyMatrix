import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useClient } from "haystack-react";
import { emSites, has, id as emId, str, type EmSpan } from "@/api/emApi";
import type { HDict } from "@/api/client";
import { selectSiteRef } from "@/components/selectSite";

/**
 * 全局的「当前站点 + 当前账期」选择。
 *
 * 13 个屏共用同一份选择 —— 顶栏切了站点，所有页面跟着换，这是设计稿里
 * 顶栏站点选择器的语义。放 Context 而不是每页各自 useState，避免出现
 * 「总览是 A 站、计量树还是 B 站」这种对不上的画面。
 */

export interface SiteCtx {
  sites: HDict[];
  siteRef?: string;
  siteDis?: string;
  setSiteRef: (ref: string) => void;
  span: EmSpan;
  setSpan: (span: EmSpan) => void;
  rangeKey: RangeKey;
  setRangeKey: (k: RangeKey) => void;
  loading: boolean;
  error?: string;
}

export type RangeKey = "today" | "week" | "month" | "year";

const Ctx = createContext<SiteCtx | null>(null);

/** 各时间范围对应的账期（左闭右开）。 */
export function rangeToSpan(key: RangeKey, now = new Date()): EmSpan {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const start = new Date(now);
  const end = new Date(now);
  end.setDate(end.getDate() + 1); // 左闭右开：今天要写成 today .. today+1day

  if (key === "week") start.setDate(start.getDate() - 6);
  else if (key === "month") start.setDate(1);
  else if (key === "year") {
    start.setMonth(0);
    start.setDate(1);
  }
  return { start: iso(start), end: iso(end) };
}

export function SiteProvider({ children }: { children: ReactNode }) {
  const client = useClient();
  const [sites, setSites] = useState<HDict[]>([]);
  const [siteRef, setSiteRef] = useState<string | undefined>();
  const [rangeKey, setRangeKey] = useState<RangeKey>("month");
  const [span, setSpan] = useState<EmSpan>(() => rangeToSpan("month"));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const applyRange = useCallback((k: RangeKey) => {
    setRangeKey(k);
    setSpan(rangeToSpan(k));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    emSites(client)
      .then((list) => {
        if (cancelled) return;
        setSites(list);
        setSiteRef((cur) =>
          selectSiteRef(
            list.map((site) => ({
              ref: emId(site),
              dis: str(site, "dis"),
              synthetic: has(site, "emSynthetic"),
              dataProvenance: str(site, "emDataProvenance"),
            })),
            cur,
          ),
        );
        setError(undefined);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const value = useMemo<SiteCtx>(() => {
    const current = sites.find((s) => emId(s) === siteRef);
    return {
      sites,
      siteRef,
      siteDis: current ? str(current, "dis") : undefined,
      setSiteRef,
      span,
      setSpan,
      rangeKey,
      setRangeKey: applyRange,
      loading,
      error,
    };
  }, [sites, siteRef, span, rangeKey, applyRange, loading, error]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSite(): SiteCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSite must be used inside <SiteProvider>");
  return ctx;
}
