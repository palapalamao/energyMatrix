import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useViewModel } from "@/mvvm/hooks/useViewModel";
import {
  MeterTreeStore,
  MeterTreeViewModel,
  ROLE_CLASS,
  ROLE_DIS,
} from "./MeterTreeViewModel";
import { PageHeader, Card, AsyncState } from "@/components/PageHeader";
import { useI18n } from "@/i18n/I18NProvider";
import { useSite } from "@/components/SiteContext";

const MEDIA = ["", "elec", "water", "gas", "steam", "cool", "heat"];
const MEDIUM_DIS: Record<string, string> = {
  "": "全部",
  elec: "电",
  water: "水",
  gas: "燃气",
  steam: "蒸汽",
  cool: "冷量",
  heat: "热量",
};

/**
 * 分项计量树。
 *
 * 左侧是树（按 emDepth 缩进，角色徽标六色），右侧是结构校验与平衡校核 ——
 * 这两块回答的是同一个问题：这套计量方案能不能支撑一份可结算的账。
 */
export const MeterTreeView = observer(function MeterTreeView() {
  const vm = useViewModel(MeterTreeStore, MeterTreeViewModel);
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

  return (
    <>
      <PageHeader
        eyebrow={t("meterTree.eyebrow")}
        title={t("meterTree.title")}
        desc={t("meterTree.desc")}
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
                {MEDIUM_DIS[m]}
              </button>
            ))}
          </div>
        }
      />

      <AsyncState loading={vm.loading} error={vm.error} labels={labels}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* 计量树 */}
          <Card
            title={t("meterTree.title")}
            hint="submeterOf 构成同介质 DAG；缩进即层级"
            className="lg:col-span-2"
          >
            {vm.rows.length === 0 ? (
              <div className="text-sm text-slate-400">{labels.empty}</div>
            ) : (
              <div className="em-scroll-x">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-400">
                      <th className="py-1 pr-3">表计</th>
                      <th className="py-1 pr-3">{t("common.medium")}</th>
                      <th className="py-1 pr-3">{t("meterTree.role")}</th>
                      <th className="py-1 text-right">子表数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vm.rows.map((r) => (
                      <tr key={r.id} className="border-t border-slate-100">
                        <td className="py-1.5 pr-3">
                          <span style={{ paddingLeft: `${r.depth * 16}px` }}>
                            {r.depth > 0 && <span className="mr-1 text-slate-300">└</span>}
                            {r.dis}
                          </span>
                          {r.gap && (
                            <span className="ml-2 rounded bg-warn/15 px-1 py-0.5 text-[10px] text-warn">
                              缺口
                            </span>
                          )}
                          {r.virtual && !r.gap && (
                            <span className="ml-2 rounded bg-accent/15 px-1 py-0.5 text-[10px] text-accent">
                              虚表
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 pr-3 text-xs text-slate-500">{r.medium ?? "—"}</td>
                        <td className="py-1.5 pr-3">
                          <span
                            className={[
                              "rounded px-1.5 py-0.5 text-[11px]",
                              ROLE_CLASS[r.role] ?? "bg-slate-100 text-slate-500",
                            ].join(" ")}
                          >
                            {ROLE_DIS[r.role] ?? r.role}
                          </span>
                        </td>
                        <td className="py-1.5 text-right font-mono text-xs">{r.childCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="space-y-4">
            {/* 结构校验 */}
            <Card title={t("meterTree.validate")} hint="铁律 2：同介质 DAG，禁止跨介质挂接">
              {vm.issues.length === 0 ? (
                <div className="text-sm text-brand">{t("meterTree.noIssues")}</div>
              ) : (
                <ul className="space-y-2">
                  {vm.issues.map((i, idx) => (
                    <li key={idx} className="text-xs">
                      <span
                        className={[
                          "mr-2 rounded px-1.5 py-0.5 text-[10px]",
                          i.level === "err"
                            ? "bg-danger/15 text-danger"
                            : "bg-warn/15 text-warn",
                        ].join(" ")}
                      >
                        {i.level}
                      </span>
                      <span className="font-mono text-slate-400">{i.code}</span>
                      <div className="mt-0.5 text-slate-600">{i.msg}</div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* 平衡校核 */}
            <Card title={t("meterTree.balance")} hint="总表 vs 子表之和；考核表不计入">
              {vm.gapRows.length === 0 ? (
                <div className="text-sm text-slate-400">{labels.empty}</div>
              ) : (
                <ul className="space-y-3">
                  {vm.gapRows.map((g, idx) => (
                    <li key={idx} className="text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">{g.medium ?? "—"}</span>
                        <span
                          className={[
                            "font-mono",
                            (g.gapRatio ?? 0) > 0.05 || (g.gapRatio ?? 0) < -0.05
                              ? "text-danger"
                              : "text-brand",
                          ].join(" ")}
                        >
                          {vm.fmtPct(g.gapRatio)}
                        </span>
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] text-slate-400">
                        {vm.fmtNum(g.parentVal)} − {vm.fmtNum(g.childSum)} ={" "}
                        {vm.fmtNum(g.gapVal)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* 点位三层约定 */}
            <Card title="点位三层约定" hint="说明书 §3.6">
              <ul className="space-y-1.5 text-xs text-slate-600">
                <li>
                  <span className="font-mono text-info">L1</span> 累积读数 ·{" "}
                  <span className="font-mono">total + sensor</span> · 直采只读
                </li>
                <li>
                  <span className="font-mono text-info">L2</span> 区间增量 ·{" "}
                  <span className="font-mono">emDelta</span> · 含溢出与换表补偿
                </li>
                <li>
                  <span className="font-mono text-info">L3</span> 归一化指标 ·{" "}
                  <span className="font-mono">emNormalized</span> · 业务层生成
                </li>
              </ul>
            </Card>
          </div>
        </div>
      </AsyncState>
    </>
  );
});
