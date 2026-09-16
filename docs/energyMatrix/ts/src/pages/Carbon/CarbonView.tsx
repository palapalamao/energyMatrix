import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { useViewModel } from "@/mvvm/hooks/useViewModel";
import { CarbonStore, CarbonViewModel } from "./CarbonViewModel";
import { PageHeader, Card, AsyncState } from "@/components/PageHeader";
import { Badge, Meter, ProgressBar, Stat } from "@/components/Bits";
import { useI18n } from "@/i18n/I18NProvider";
import { useSite } from "@/components/SiteContext";

/**
 * 碳排与双碳目标（设计稿版式 H）。
 *
 * 三条线索必须在同一屏上闭合：排放量 → 用的哪版因子 → 抵消凭什么算数。
 * 少任何一条，这个页面就只是几个不可审计的大字。
 */
export const CarbonView = observer(function CarbonView() {
  const vm = useViewModel(CarbonStore, CarbonViewModel);
  const { translate: t } = useI18n();
  const { siteRef, span } = useSite();

  useEffect(() => {
    if (siteRef) vm.load(siteRef, span);
  }, [vm, siteRef, span]);

  const labels = {
    loading: t("common.loading"),
    error: t("common.error"),
    empty: t("common.empty"),
  };

  const u = vm.unit;
  const total = vm.total ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="CARBON · em::EmCarbonAccount"
        title={t("nav.carbon")}
        desc="碳账 = 台账 × 因子。因子版本在结算时锁定，历史碳账不随换版漂移"
        actions={
          vm.year !== undefined ? (
            <Badge tone="neutral">
              因子年份 {vm.year} · 区域 {vm.region ?? "national"}
            </Badge>
          ) : undefined
        }
      />

      <AsyncState loading={vm.loading} error={vm.error} labels={labels}>
        {vm.accountError && (
          <div className="mb-4 rounded border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">
            碳账算不出来：{vm.accountError}
            <div className="mt-1 text-slate-500">
              下方的因子版本表照常显示 —— 排查通常就从那里开始。
            </div>
          </div>
        )}

        {vm.missingMedia.length > 0 && (
          <div className="mb-4 rounded border border-warn/30 bg-warn/5 px-3 py-2 text-xs text-warn">
            以下介质本期没有排放因子，其用能未计入碳账：{vm.missingMedia.join("、")}
            <span className="ml-1 text-slate-500">
              （缺因子的部分在账上是 0，不说明就是漏报）
            </span>
          </div>
        )}

        <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-5">
          <Stat label={`Scope 1 直接排放 (${u})`} value={vm.fmtNum(vm.scope1, 0)} hint="燃气 / 柴油 / 煤" />
          <Stat label={`Scope 2 外购能源 (${u})`} value={vm.fmtNum(vm.scope2, 0)} hint="电 / 热 / 冷 / 蒸汽" />
          <Stat label={`Scope 3 其他间接 (${u})`} value={vm.fmtNum(vm.scope3, 0)} hint="骨架未做供应链口径" />
          <Stat label={`抵消量 (${u})`} value={vm.fmtNum(vm.offset, 0)} tone="ok" hint="仅已注销核销的绿证" />
          <Stat label={`净排放 (${u})`} value={vm.fmtNum(vm.net, 0)} tone="warn" hint="总量 − 抵消" />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {/* 逐介质排放明细 */}
            <Card title="逐介质排放明细" hint="每一行都能追到用的是哪一条因子记录">
              {vm.emissionRows.length === 0 ? (
                <div className="text-sm text-slate-400">{labels.empty}</div>
              ) : (
                <div className="em-scroll-x">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-slate-400">
                        <th className="py-1 pr-3">介质</th>
                        <th className="py-1 pr-3">核算范围</th>
                        <th className="py-1 pr-3 text-right">用量</th>
                        <th className="py-1 pr-3 text-right">因子</th>
                        <th className="py-1 pr-3">因子单位</th>
                        <th className="py-1 pr-3 text-right">排放量 {u}</th>
                        <th className="w-24 py-1">占比</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vm.emissionRows.map((r) => (
                        <tr key={r.medium} className="border-t border-slate-100">
                          <td className="py-1.5 pr-3">{r.mediumDis}</td>
                          <td className="py-1.5 pr-3">
                            <Badge tone={r.scope === "scope1" ? "warn" : "info"}>
                              {r.scopeDis}
                            </Badge>
                          </td>
                          <td className="py-1.5 pr-3 text-right font-mono text-xs text-slate-500">
                            {vm.fmtNum(r.usage, 0)}
                          </td>
                          <td className="py-1.5 pr-3 text-right font-mono text-xs">
                            {vm.fmtNum(r.factor, 4)}
                          </td>
                          <td className="py-1.5 pr-3 font-mono text-[10px] text-slate-400">
                            {r.factorUnit ?? "—"}
                          </td>
                          <td className="py-1.5 pr-3 text-right font-mono">
                            {vm.fmtNum(r.emission, 0)}
                          </td>
                          <td className="py-1.5">
                            <Meter ratio={total > 0 ? (r.emission ?? 0) / total : 0} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* 因子版本表 */}
            <Card
              title="排放因子版本"
              hint="每条因子必须带 emSourceDoc 依据文号，否则解析时会被守卫拒绝（铁律 8）"
            >
              {vm.factorRows.length === 0 ? (
                <div className="text-sm text-slate-400">{labels.empty}</div>
              ) : (
                <div className="em-scroll-x">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-slate-400">
                        <th className="py-1 pr-3">年份</th>
                        <th className="py-1 pr-3">介质</th>
                        <th className="py-1 pr-3">区域</th>
                        <th className="py-1 pr-3 text-right">因子</th>
                        <th className="py-1 pr-3">单位</th>
                        <th className="py-1 pr-3">状态</th>
                        <th className="py-1">依据文号</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vm.factorRows.map((f) => (
                        <tr key={f.id} className="border-t border-slate-100">
                          <td className="py-1.5 pr-3 font-mono text-xs">{f.year ?? "—"}</td>
                          <td className="py-1.5 pr-3">{f.mediumDis}</td>
                          <td className="py-1.5 pr-3 text-xs text-slate-500">
                            {f.region ?? "national"}
                          </td>
                          <td className="py-1.5 pr-3 text-right font-mono text-xs">
                            {vm.fmtNum(f.factor, 4)}
                          </td>
                          <td className="py-1.5 pr-3 font-mono text-[10px] text-slate-400">
                            {f.factorUnit ?? "—"}
                          </td>
                          <td className="py-1.5 pr-3">
                            <div className="flex gap-1">
                              {f.used && <Badge tone="brand">本期在用</Badge>}
                              {f.locked && <Badge tone="neutral">已锁定</Badge>}
                            </div>
                          </td>
                          <td className="max-w-[16rem] py-1.5 text-[11px] text-slate-500">
                            {f.sourceDoc ?? <span className="text-danger">缺依据文号</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          <div className="space-y-4">
            {/* 碳目标进度 */}
            <Card title="碳目标进度" hint="总量型与强度型口径不可混用">
              {vm.targetRows.length === 0 ? (
                <div className="text-sm text-slate-400">{labels.empty}</div>
              ) : (
                <ul className="space-y-4">
                  {vm.targetRows.map((tg) => (
                    <li key={tg.id}>
                      <div className="mb-1 flex items-center gap-2 text-xs">
                        <Badge tone={tg.type === "intensity" ? "info" : "brand"}>
                          {tg.typeDis}
                        </Badge>
                        <span className="text-slate-600">{tg.dis}</span>
                      </div>
                      <ProgressBar
                        ratio={tg.progress}
                        tone={vm.progressTone(tg)}
                      />
                      <div className="mt-1 flex justify-between font-mono text-[11px] text-slate-400">
                        <span>基准 {vm.fmtNum(tg.base, 1)}</span>
                        <span className="text-slate-700">
                          当前 {vm.fmtNum(tg.cur, 1)} {tg.unit ?? ""}
                        </span>
                        <span>
                          {tg.targetYear ?? "—"} 目标 {vm.fmtNum(tg.goal, 1)}
                        </span>
                      </div>
                      <div className="mt-0.5 text-right text-[11px]">
                        完成度 {vm.fmtPct(tg.progress, 0)}
                        {tg.onTrack === false && (
                          <span className="ml-1 text-warn">未达目标</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* 绿证 */}
            <Card title="绿电 / 绿证 / CCER" hint="仅 emRetired（已注销核销）计入抵消">
              {vm.certRows.length === 0 ? (
                <div className="text-sm text-slate-400">{labels.empty}</div>
              ) : (
                <ul className="space-y-2">
                  {vm.certRows.map((c) => (
                    <li
                      key={c.id}
                      className="rounded border border-slate-100 px-2.5 py-2 text-xs"
                    >
                      <div className="flex items-center gap-1.5">
                        <Badge tone="info">{vm.certTypeDis(c.certType)}</Badge>
                        <Badge tone={c.retired ? "ok" : "warn"}>
                          {c.retired ? "已注销核销" : "未注销 · 不计抵消"}
                        </Badge>
                      </div>
                      <div className="mt-1 text-slate-600">{c.dis}</div>
                      <div className="mt-0.5 flex justify-between font-mono text-[10px] text-slate-400">
                        <span>{c.certNo ?? "—"}</span>
                        <span>
                          {vm.fmtNum(c.val, 0)} kWh · 归属 {c.vintage ?? "—"}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </AsyncState>
    </>
  );
});
