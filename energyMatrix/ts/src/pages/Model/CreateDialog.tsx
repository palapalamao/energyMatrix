import { useState } from "react";
import { observer } from "mobx-react-lite";
import {
  Building2,
  Layers,
  LayoutGrid,
  Gauge,
  Sigma,
  AlertTriangle,
  Users,
  Cpu,
  Boxes,
  X,
} from "lucide-react";
import type { ModelViewModel } from "./ModelViewModel";
import { buildCreateSpec, type CreateWhat } from "./createSpec";

/**
 * 新建对象对话框 —— 设备树的建立入口。
 *
 * 八种对象各有各的前置条件（模板不同、必填项不同、挂在谁下面不同），
 * 所以是「先选类型，再按类型出表单」，而不是一张通用表。
 *
 * 创建一律由后端按模板生成 —— 前端不直接写记录，否则模板附带的采集点位、
 * 命名规则、内部绑定全都不会有。
 */

interface WhatOption {
  what: CreateWhat;
  label: string;
  desc: string;
  Icon: typeof Building2;
  /** 需要先选好站点 */
  needsSite: boolean;
}

const OPTIONS: WhatOption[] = [
  { what: "site", label: "站点", Icon: Building2, needsSite: false,
    desc: "一栋建筑或一个园区，是能耗核算的主体" },
  { what: "floor", label: "楼层", Icon: Layers, needsSite: true,
    desc: "用于按层出报表和对标" },
  { what: "zone", label: "计量分区", Icon: LayoutGrid, needsSite: true,
    desc: "按业态或用途划分的核算单元，可以跨楼层" },
  { what: "tenant", label: "租户 / 组织", Icon: Users, needsSite: false,
    desc: "账单的付费方，也是成本中心" },
  { what: "meter", label: "表计", Icon: Gauge, needsSite: true,
    desc: "实际安装的计量表，创建后自动带上对应的采集点位" },
  { what: "virtualMeter", label: "虚拟表", Icon: Sigma, needsSite: true,
    desc: "由公式算出来的表，比如几块表相加" },
  { what: "gapMeter", label: "缺口表", Icon: AlertTriangle, needsSite: true,
    desc: "总表减去各分表之和，用来发现没被计量到的用能" },
  { what: "load", label: "挂载已有设备", Icon: Cpu, needsSite: true,
    desc: "把已经存在的冷机、水泵、空调箱等纳入能耗核算。设备本身由 FIN DB Builder 或采集器发现建立，这里只给它补充能耗信息，不会重复创建" },
  { what: "loadGroup", label: "用能设备组", Icon: Boxes, needsSite: true,
    desc: "没有独立计量、也不按单台管理的批量对象，比如一层楼的灯具回路、一片区域的插座。这是能耗核算自己的对象，不对应现场某一台设备" },
];

export const CreateDialog = observer(function CreateDialog({
  vm,
  siteRef,
  onClose,
}: {
  vm: ModelViewModel;
  siteRef?: string;
  onClose: () => void;
}) {
  const [what, setWhat] = useState<CreateWhat>("meter");
  const [name, setName] = useState("");
  const [medium, setMedium] = useState("elec");
  const [role, setRole] = useState("sub");
  const [subItem, setSubItem] = useState("");
  const [parentMeter, setParentMeter] = useState("");
  const [sourceMeter, setSourceMeter] = useState("");
  const [formula, setFormula] = useState("");
  const [equipRef, setEquipRef] = useState("");
  const [parentOrg, setParentOrg] = useState("");
  const [floorRef, setFloorRef] = useState("");
  const [floorNum, setFloorNum] = useState("");
  const [area, setArea] = useState("");
  const [ratedPower, setRatedPower] = useState("");

  const opt = OPTIONS.find((o) => o.what === what)!;
  const blockedNoSite = opt.needsSite && !siteRef;

  const missing: string[] = [];
  if (blockedNoSite) missing.push("请先在页面顶部选择一个站点");
  if (what === "gapMeter" && !sourceMeter) missing.push("请选择要校核的总表");
  if (what === "load") {
    // 先说"没得挑"，再说"没挑" —— 顺序反了会让人对着空下拉找不到问题在哪
    if (vm.unboundEquips.length === 0) missing.push("没有可挂载的设备，请改用「用能设备组」");
    else if (!equipRef) missing.push("请选择要纳入核算的设备");
  }
  if (what === "virtualMeter" && formula.trim() === "") missing.push("请填写计算公式");
  if (what === "floor" && floorNum === "") missing.push("请填写楼层号");

  const canSubmit = !vm.submitting && missing.length === 0;

  const submit = async () => {
    const spec = buildCreateSpec({
      what, siteRef, name, medium, role, subItem, parentMeter, sourceMeter,
      formula, equipRef, parentOrg, floorRef, floorNum, area, ratedPower,
    });
    if (!spec) return;
    if (await vm.create(spec)) onClose();
  };

  const inputCls =
    "mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm " +
    "focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";
  const labelCls = "block text-xs font-medium text-slate-600";
  const hintCls = "mt-1 block text-[11px] text-slate-400";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-6 backdrop-blur-sm">
      <div className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        {/* 标题 */}
        <header className="flex items-start gap-3 border-b border-slate-100 px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-slate-900">新建对象</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              选择要创建的对象类型。新建表计时，系统会按介质自动生成对应的采集点位。
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {/* 类型卡片 */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {OPTIONS.map((o) => {
              const active = what === o.what;
              const disabled = o.needsSite && !siteRef;
              return (
                <button
                  key={o.what}
                  onClick={() => setWhat(o.what)}
                  className={[
                    "flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-all",
                    active
                      ? "border-brand bg-brand/5 ring-1 ring-brand"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                    disabled ? "opacity-50" : "",
                  ].join(" ")}
                >
                  <o.Icon size={18} className={active ? "text-brand" : "text-slate-400"} />
                  <span
                    className={[
                      "text-sm font-medium",
                      active ? "text-brand" : "text-slate-700",
                    ].join(" ")}
                  >
                    {o.label}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
            {opt.desc}
          </p>

          {/* 表单 */}
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {what !== "load" && (
              <label>
                <span className={labelCls}>
                  名称{what !== "gapMeter" && <span className="text-danger"> *</span>}
                </span>
                <input
                  className={inputCls}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={
                    what === "gapMeter" ? "留空则按总表自动命名" : "例：3F、餐饮区、1号进线柜"
                  }
                />
              </label>
            )}

            {what === "floor" && (
              <label>
                <span className={labelCls}>
                  楼层号<span className="text-danger"> *</span>
                </span>
                <input
                  type="number"
                  className={inputCls}
                  value={floorNum}
                  onChange={(e) => setFloorNum(e.target.value)}
                  placeholder="3"
                />
                <span className={hintCls}>地面层填 0，地上填 1、2、3…，地下填 -1、-2…</span>
              </label>
            )}

            {(what === "site" || what === "floor" || what === "zone" || what === "tenant") && (
              <label>
                <span className={labelCls}>面积（m²）</span>
                <input
                  type="number"
                  className={inputCls}
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  placeholder={what === "site" ? "建筑面积，能耗强度的分母" : ""}
                />
              </label>
            )}

            {what === "zone" && (
              <label>
                <span className={labelCls}>所在楼层</span>
                <select
                  className={inputCls}
                  value={floorRef}
                  onChange={(e) => setFloorRef(e.target.value)}
                >
                  <option value="">不指定（跨楼层分区）</option>
                  {vm.refOptions("floor").map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.dis}
                    </option>
                  ))}
                </select>
                <span className={hintCls}>餐饮区、主力店这类跨楼层的分区留空即可</span>
              </label>
            )}

            {what === "tenant" && (
              <label>
                <span className={labelCls}>上级组织</span>
                <select
                  className={inputCls}
                  value={parentOrg}
                  onChange={(e) => setParentOrg(e.target.value)}
                >
                  <option value="">无（顶层组织）</option>
                  {vm.refOptions("tenant").map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.dis}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {(what === "meter" || what === "virtualMeter") && (
              <label>
                <span className={labelCls}>
                  介质<span className="text-danger"> *</span>
                </span>
                <select
                  className={inputCls}
                  value={medium}
                  onChange={(e) => setMedium(e.target.value)}
                >
                  {vm.enumOptions("EmMedium").map((m) => (
                    <option key={m} value={m}>
                      {MEDIUM_DIS[m] ?? m}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {(what === "meter" || what === "virtualMeter" || what === "loadGroup") && (
              <label>
                <span className={labelCls}>所在楼层</span>
                <select
                  className={inputCls}
                  value={floorRef}
                  onChange={(e) => setFloorRef(e.target.value)}
                >
                  <option value="">不指定（站级或跨楼层设备）</option>
                  {vm.refOptions("floor").map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.dis}
                    </option>
                  ))}
                </select>
                <span className={hintCls}>不指定表示站级或跨楼层设备</span>
              </label>
            )}

            {what === "meter" && (
              <>
                <label>
                  <span className={labelCls}>
                    计量角色<span className="text-danger"> *</span>
                  </span>
                  <select
                    className={inputCls}
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                  >
                    {vm.enumOptions("EmMeterRole").map((r) => (
                      <option key={r} value={r}>
                        {ROLE_DIS[r] ?? r}
                      </option>
                    ))}
                  </select>
                  <span className={hintCls}>{ROLE_HINT[role] ?? ""}</span>
                </label>
                <label>
                  <span className={labelCls}>用能分项</span>
                  <select
                    className={inputCls}
                    value={subItem}
                    onChange={(e) => setSubItem(e.target.value)}
                  >
                    <option value="">暂不设置</option>
                    {vm.enumOptions("EmSubItem").map((s) => (
                      <option key={s} value={s}>
                        {s.toUpperCase()} · {SUBITEM_DIS[s] ?? s}
                      </option>
                    ))}
                  </select>
                  <span className={hintCls}>国标分项口径，只对电表有效</span>
                </label>
              </>
            )}

            {(what === "meter" || what === "virtualMeter") && (
              <label className="sm:col-span-2">
                <span className={labelCls}>上级表</span>
                <select
                  className={inputCls}
                  value={parentMeter}
                  onChange={(e) => setParentMeter(e.target.value)}
                >
                  <option value="">无（这是一块顶层表）</option>
                  {vm.meters
                    .filter((m) => !m.medium || m.medium === medium)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.dis}
                      </option>
                    ))}
                </select>
                <span className={hintCls}>
                  本表的用量计入哪一块上级表。下拉里只列出同介质的表 —— 电表挂电表、水表挂水表
                </span>
              </label>
            )}

            {what === "virtualMeter" && (
              <label className="sm:col-span-2">
                <span className={labelCls}>
                  计算公式<span className="text-danger"> *</span>
                </span>
                <input
                  className={inputCls + " font-mono"}
                  value={formula}
                  onChange={(e) => setFormula(e.target.value)}
                  placeholder="emMeterRead(@总表) - emSubMeterSum(@总表)"
                />
                <span className={hintCls}>
                  统计周期由系统自动带入，公式里不用写时间范围
                </span>
              </label>
            )}

            {what === "gapMeter" && (
              <label className="sm:col-span-2">
                <span className={labelCls}>
                  要校核的总表<span className="text-danger"> *</span>
                </span>
                <select
                  className={inputCls}
                  value={sourceMeter}
                  onChange={(e) => setSourceMeter(e.target.value)}
                >
                  <option value="">请选择</option>
                  {vm.meters
                    .filter((m) => !m.virtual)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.dis}
                        {m.medium ? ` · ${MEDIUM_DIS[m.medium] ?? m.medium}` : ""}
                      </option>
                    ))}
                </select>
                <span className={hintCls}>
                  公式会自动生成为「总表用量 − 各分表之和」，缺口表会挂在这块总表下面
                </span>
              </label>
            )}

            {what === "load" && (
              <label className="sm:col-span-2">
                <span className={labelCls}>
                  选择设备<span className="text-danger"> *</span>
                </span>
                {vm.unboundEquips.length === 0 ? (
                  <div className="mt-1 rounded-md border border-warn/30 bg-warn/5 px-3 py-2.5 text-xs leading-relaxed text-slate-600">
                    这个站点下还没有可纳入核算的设备。
                    <br />
                    设备（冷机、水泵、空调箱等）不由本系统创建，它们来自：
                    <ul className="ml-4 mt-1 list-disc space-y-0.5">
                      <li>FIN 的 DB Builder —— 手工建设备树</li>
                      <li>采集器的点位发现 —— 从 BACnet / Modbus 网关自动建</li>
                      <li>CoolMatrix、heatMatrix 等其他扩展已经建好的设备</li>
                    </ul>
                    <div className="mt-1.5">
                      如果只是想在账上留一个格子（比如"三层照明回路"），
                      请改用上面的<b>「用能设备组」</b>。
                    </div>
                  </div>
                ) : (
                  <>
                    <select
                      className={inputCls}
                      value={equipRef}
                      onChange={(e) => setEquipRef(e.target.value)}
                    >
                      <option value="">请选择</option>
                      {vm.unboundEquips.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.dis}
                        </option>
                      ))}
                    </select>
                    <span className={hintCls}>
                      只列出还没纳入核算的设备。系统不会新建设备，只给已有的设备补充能耗信息
                    </span>
                  </>
                )}
              </label>
            )}

            {(what === "load" || what === "loadGroup") && (
              <>
                <label>
                  <span className={labelCls}>用能分项</span>
                  <select
                    className={inputCls}
                    value={subItem}
                    onChange={(e) => setSubItem(e.target.value)}
                  >
                    <option value="">暂不设置</option>
                    {vm.enumOptions("EmSubItem").map((s) => (
                      <option key={s} value={s}>
                        {s.toUpperCase()} · {SUBITEM_DIS[s] ?? s}
                      </option>
                    ))}
                  </select>
                  <span className={hintCls}>不设置的话，它的用能在分项统计里归不了类</span>
                </label>
                <label>
                  <span className={labelCls}>额定功率（kW）</span>
                  <input
                    type="number"
                    className={inputCls}
                    value={ratedPower}
                    onChange={(e) => setRatedPower(e.target.value)}
                  />
                  <span className={hintCls}>没有独立计量时，按它乘运行时长分摊</span>
                </label>
              </>
            )}
          </div>

          {vm.error && (
            <div className="mt-4 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-slate-700">
              {vm.error}
            </div>
          )}
        </div>

        {/* 底部 */}
        <footer className="flex items-center gap-3 border-t border-slate-100 px-6 py-3">
          {missing.length > 0 && (
            <span className="text-xs text-warn">{missing[0]}</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              disabled={!canSubmit}
              onClick={() => void submit()}
              className="rounded-md bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-40"
            >
              {vm.submitting ? "创建中…" : "创建"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
});

const MEDIUM_DIS: Record<string, string> = {
  elec: "电", water: "水", gas: "燃气", steam: "蒸汽",
  heat: "热量", cool: "冷量", diesel: "柴油", coal: "煤", hydrogen: "氢",
};

const ROLE_DIS: Record<string, string> = {
  gateway: "关口表", main: "总表", branch: "分项表",
  sub: "子表", check: "考核表", virtual: "虚表",
};

const ROLE_HINT: Record<string, string> = {
  gateway: "与供能方结算的产权分界表，一种介质只应有一块",
  main: "建筑或系统级的汇总表",
  branch: "按用能分项划分的回路表",
  sub: "租户、楼层或末端的计量表",
  check: "只用于校核，不计入合计，避免重复计量",
  virtual: "由公式导出，不是实际安装的表",
};

const SUBITEM_DIS: Record<string, string> = {
  a1: "室内照明与插座", a2: "走廊与应急照明", a3: "室外景观照明",
  b1: "冷热站", b2: "空调末端",
  c1: "电梯扶梯", c2: "水泵", c3: "通风机",
  d1: "信息中心", d2: "厨房餐厅", d3: "洗衣房",
  d4: "游泳池", d5: "健身娱乐", d6: "其他",
};
