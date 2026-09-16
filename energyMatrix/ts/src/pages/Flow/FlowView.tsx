import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { Layer, Rectangle, ResponsiveContainer, Sankey, Tooltip } from "recharts";
import { useViewModel } from "@/mvvm/hooks/useViewModel";
import { FlowStore, FlowViewModel } from "./FlowViewModel";
import { PageHeader, Card, AsyncState } from "@/components/PageHeader";
import { useI18n } from "@/i18n/I18NProvider";
import { useSite } from "@/components/SiteContext";
import { MEDIUM_DIS, fmtNum } from "@/pages/shared";
import type { FlowSankeyLink, FlowSankeyNode } from "./flowGraph";

const MEDIA = ["", "elec", "water", "gas", "steam", "cool", "heat"];

/**
 * 能流图（Sankey）。
 *
 * 能源从进线到分项的流向：流向带宽度 = 账期台账合计（L2，铁律 6），
 * 按介质分色；缺口表的产出不画进父子关系（会重复计量），而是汇入
 * 「不明用能」汇点 —— 一眼看出还有多少能耗说不清楚。
 * 只读屏：无写路径，tooltip 展示表计名与能耗。
 */

/** recharts 2.15 的 <Sankey> 默认节点渲染不读数据上的 fill，也不画标签，
 *  链接固定灰 #333 —— node/link 渲染器由本屏接管（配色挂在节点数据上）。 */
interface SankeyNodeRenderProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: FlowSankeyNode;
}

function SankeyNode({ x = 0, y = 0, width = 0, height = 0, payload }: SankeyNodeRenderProps) {
  const name = payload?.name ?? "";
  return (
    <Layer>
      <Rectangle x={x} y={y} width={width} height={height} fill={payload?.fill ?? "#9AA6B2"} fillOpacity={0.9} />
      <text
        x={x + width + 6}
        y={y + height / 2}
        dy="0.35em"
        fontSize={11}
        fill="#334155"
        style={{ paintOrder: "stroke", stroke: "#fff", strokeWidth: 2 }}
      >
        {name}
      </text>
    </Layer>
  );
}

interface SankeyLinkRenderProps {
  sourceX?: number;
  sourceY?: number;
  sourceControlX?: number;
  targetX?: number;
  targetY?: number;
  targetControlX?: number;
  linkWidth?: number;
  payload?: FlowSankeyLink & { source?: FlowSankeyNode; target?: FlowSankeyNode };
}

function SankeyLink({
  sourceX,
  sourceY,
  sourceControlX,
  targetX,
  targetY,
  targetControlX,
  linkWidth,
  payload,
}: SankeyLinkRenderProps) {
  const sx = sourceX ?? 0, sy = sourceY ?? 0, scx = sourceControlX ?? 0, tx = targetX ?? 0, ty = targetY ?? 0, tcx = targetControlX ?? 0, lw = linkWidth ?? 0;
  return (
    <path
      className="recharts-sankey-link"
      d={`M${sx},${sy} C${scx},${sy} ${tcx},${ty} ${tx},${ty}`}
      fill="none"
      stroke={payload?.source?.fill ?? "#9AA6B2"}
      strokeWidth={lw}
      strokeOpacity={0.35}
    />
  );
}

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
                  node={<SankeyNode />}
                  link={<SankeyLink />}
                  nodePadding={20}
                  nodeWidth={14}
                  linkCurvature={0.5}
                  iterations={64}
                  margin={{ top: 10, right: 180, bottom: 10, left: 10 }}
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