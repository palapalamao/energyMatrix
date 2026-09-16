import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { ResponsiveContainer, Sankey, Tooltip } from "recharts";
import { useViewModel } from "@/mvvm/hooks/useViewModel";
import { FlowStore, FlowViewModel } from "./FlowViewModel";
import { PageHeader, Card, AsyncState } from "@/components/PageHeader";
import { useI18n } from "@/i18n/I18NProvider";
import { useSite } from "@/components/SiteContext";
import { MEDIUM_DIS, fmtNum } from "@/pages/shared";

const MEDIA = ["", "elec", "water", "gas", "steam", "cool", "heat"];

/**
 * 能流图（Sankey）。
 *
 * 能源从进线到分项的流向：流向带宽度 = 账期台账合计（L2，铁律 6），
 * 按介质分色；缺口表的产出不画进父子关系（会重复计量），而是汇入
 * 「不明用能」汇点 —— 一眼看出还有多少能耗说不清楚。
 * 只读屏：无写路径，tooltip 展示表计名与能耗。
 */
export const FlowView = observer(function FlowView() {
  const vm = useViewModel(FlowStore, FlowViewModel);
  const { translate: t } = useI18n();
  const { siteRef, span } = useSite();
  const [medium, setMedium] = useState("");

  useEffect(() => {
    if (siteRef) vm.load(siteRef, span, medium || undefined);
  }, [vm, siteRef, span, medium]);

  const labels = {
    loading: t("common.loading"),
    error: t("common.error"),
    empty: t("common.empty"),
  };

  const graph = vm.graph;
  const noFlow = graph !== undefined && graph.links.length === 0;

  return (
    <>
      <PageHeader
        eyebrow={t("flow.eyebrow")}
        title={t("flow.title")}
        desc={t("flow.desc")}
        actions={
          <div className="flex items-center gap-1 rounded border border-slate-300 p-0.5">
            {MEDIA.map((m) => (
              <button
                key={m || "all"}
                onClick={() => setMedium(m)}
                className={[
                  "rounded px-2 py-1 text-xs transition-colors",
                  medium === m ? "bg-info text-white" : "text-slate-600 hover:bg-slate-100",
                ].join(" ")}
              >
                {m === "" ? t("common.all") : (MEDIUM_DIS[m] ?? m)}
              </button>
            ))}
          </div>
        }
      />

      <AsyncState loading={vm.loading} error={vm.error} labels={labels}>
        {noFlow ? (
          <Card title={t("flow.title")}>
            <div className="py-16 text-center text-sm text-slate-400">
              {t("flow.emptyLedger")}
            </div>
          </Card>
        ) : (
          graph && (
            <Card
              title={t("flow.title")}
              hint={t("flow.desc")}
              className="h-[640px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <Sankey
                  data={{ nodes: graph.nodes, links: graph.links }}
                  nodePadding={20}
                  nodeWidth={14}
                  linkCurvature={0.5}
                  iterations={64}
                >
                  <Tooltip
                    formatter={(v: number, name: string) => [
                      `${fmtNum(v)} ${graph.unit ?? ""}`.trim(),
                      name,
                    ]}
                  />
                </Sankey>
              </ResponsiveContainer>
            </Card>
          )
        )}
      </AsyncState>
    </>
  );
});
