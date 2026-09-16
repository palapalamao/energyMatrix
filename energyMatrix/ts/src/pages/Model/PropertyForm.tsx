import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import type { TagValue } from "@/api/emApi";
import type { FieldDef } from "./fieldSchema";
import type { ModelViewModel } from "./ModelViewModel";

/**
 * 属性页签的表单。
 *
 * 只提交**改动过的字段**（与记录当前值比对），不是整条记录回写：
 *   - 后端按增量更新，整条回写会把模板生成的内部标签也送上去，那些会被拒
 *   - 只送改动，两个人同时改同一个对象的不同字段不会互相覆盖
 *
 * 把一个已有的值清空 → 提交"删除这个属性"，这与"没动过"是两回事。
 */
export const PropertyForm = observer(function PropertyForm({
  vm,
  onSaved,
}: {
  vm: ModelViewModel;
  onSaved?: () => void;
}) {
  const groups = vm.fieldGroups;
  const entityId = vm.selectedId;

  // 表单草稿：只存用户改过的字段
  const [draft, setDraft] = useState<Record<string, TagValue>>({});

  // 切换选中对象时清空草稿，避免把上一个对象的编辑带过来
  useEffect(() => {
    setDraft({});
  }, [entityId]);

  const dirty = Object.keys(draft).length > 0;

  const current = (f: FieldDef): TagValue =>
    f.tag in draft ? draft[f.tag] : vm.fieldValue(f.tag, f.type);

  const setField = (tag: string, v: TagValue) => setDraft((d) => ({ ...d, [tag]: v }));

  const submit = async () => {
    if (await vm.save(draft)) {
      setDraft({});
      onSaved?.();
    }
  };

  return (
    <div>
      {groups.map(({ group, fields }, gi) => (
        <section key={group} className={gi > 0 ? "mt-6" : ""}>
          {groups.length > 1 && (
            <h3 className="mb-3 border-b border-slate-100 pb-1.5 text-xs font-medium text-slate-400">
              {group}
            </h3>
          )}
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
            {fields.map((f) => (
              <Field
                key={f.tag}
                def={f}
                value={current(f)}
                dirty={f.tag in draft}
                vm={vm}
                onChange={(v) => setField(f.tag, v)}
              />
            ))}
          </div>
        </section>
      ))}

      <div className="sticky bottom-0 mt-6 flex items-center gap-3 border-t border-slate-100 bg-white pt-4">
        <button
          disabled={!dirty || vm.submitting}
          onClick={() => void submit()}
          className="rounded-md bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-40"
        >
          {vm.submitting ? "保存中…" : "保存"}
        </button>
        <button
          disabled={!dirty || vm.submitting}
          onClick={() => setDraft({})}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        >
          撤销修改
        </button>
        {dirty && (
          <span className="text-xs text-warn">
            有 {Object.keys(draft).length} 项修改还没保存
          </span>
        )}
      </div>
    </div>
  );
});

/** 枚举值的中文名。后端返回的是英文代码，这里只负责显示。 */
const ENUM_DIS: Record<string, Record<string, string>> = {
  EmMedium: {
    elec: "电", water: "水", gas: "燃气", steam: "蒸汽",
    heat: "热量", cool: "冷量", diesel: "柴油", coal: "煤", hydrogen: "氢",
  },
  EmMeterRole: {
    gateway: "关口表", main: "总表", branch: "分项表",
    sub: "子表", check: "考核表", virtual: "虚表",
  },
  EmDataSource: {
    measured: "实测", derived: "推导", allocated: "分摊",
    estimated: "估算（不可结算）", manual: "人工录入",
  },
  EmUsageType: {
    office: "办公", retail: "商业零售", hotel: "酒店", hospital: "医疗",
    datacenter: "数据中心", industrial: "工业", residence: "居住",
    common: "公区", parking: "车库",
  },
  EmSubItem: {
    a1: "A1 室内照明与插座", a2: "A2 走廊与应急照明", a3: "A3 室外景观照明",
    b1: "B1 冷热站", b2: "B2 空调末端",
    c1: "C1 电梯扶梯", c2: "C2 水泵", c3: "C3 通风机",
    d1: "D1 信息中心", d2: "D2 厨房餐厅", d3: "D3 洗衣房",
    d4: "D4 游泳池", d5: "D5 健身娱乐", d6: "D6 其他",
  },
};

function enumLabel(enumOf: string | undefined, code: string): string {
  if (!enumOf) return code;
  return ENUM_DIS[enumOf]?.[code] ?? code;
}

function Field({
  def,
  value,
  dirty,
  vm,
  onChange,
}: {
  def: FieldDef;
  value: TagValue;
  dirty: boolean;
  vm: ModelViewModel;
  onChange: (v: TagValue) => void;
}) {
  const missing = def.required && (value === undefined || value === "");
  const base = [
    "mt-1 w-full rounded-md border px-2.5 py-1.5 text-sm",
    "focus:outline-none focus:ring-1",
    dirty
      ? "border-warn bg-warn/5 focus:border-warn focus:ring-warn"
      : missing
        ? "border-danger focus:border-danger focus:ring-danger"
        : "border-slate-300 focus:border-brand focus:ring-brand",
  ].join(" ");

  return (
    <label className="block">
      <span className="flex items-baseline gap-1 text-xs font-medium text-slate-600">
        {def.label}
        {def.required && <span className="text-danger">*</span>}
        {def.unit && <span className="font-normal text-slate-400">（{def.unit}）</span>}
        {dirty && <span className="ml-auto text-[10px] font-normal text-warn">已修改</span>}
      </span>

      {def.type === "marker" ? (
        <span className="mt-1.5 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span className="text-slate-600">{value === true ? "是" : "否"}</span>
        </span>
      ) : def.type === "enum" ? (
        <select
          className={base}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
        >
          <option value="">未设置</option>
          {vm.enumOptions(def.enumOf).map((o) => (
            <option key={o} value={o}>
              {enumLabel(def.enumOf, o)}
            </option>
          ))}
        </select>
      ) : def.type === "ref" ? (
        <select
          className={base}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
        >
          <option value="">未设置</option>
          {vm.refOptions(def.refKind ?? "meter").map((o) => (
            <option key={o.id} value={o.id}>
              {o.dis}
            </option>
          ))}
        </select>
      ) : def.type === "num" ? (
        <input
          type="number"
          className={base}
          value={value === undefined ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        />
      ) : def.type === "date" ? (
        <input
          type="date"
          className={base}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
        />
      ) : (
        <input
          type="text"
          className={base}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
        />
      )}

      {def.hint && (
        <span className="mt-1 block text-[11px] leading-relaxed text-slate-400">{def.hint}</span>
      )}
    </label>
  );
}
