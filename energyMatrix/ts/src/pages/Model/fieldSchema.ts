import type { NodeKind } from "@/api/emApi";

/**
 * 属性编辑器的字段表 —— 每种对象显示哪些属性、怎么编辑。
 *
 * 这张表决定的是**让人改什么**，不是记录上有什么。记录上还有一批由模板生成的
 * 内部标签（模板绑定、显示名规则之类），它们要么改不得（后端会拒），
 * 要么改了也没意义，所以不出现在这里。
 *
 * `enumOf` 指向后端 `emEnums()` 返回的枚举名 —— 下拉选项与后端共用一份来源，
 * 前端不另抄一份，否则新增一种介质要改两个地方。
 *
 * 名称绑的是 `navName` 而不是 `dis`：模板给楼层 / 分区 / 表计 / 设备写的是
 * `navName` + `disMacro`（完整显示名由系统按「站点名 + 本级名」拼出来，不存库），
 * 绑 `dis` 会读到空值。站点与租户额外存了 `dis`，后端在改名时会一并同步。
 */

export type FieldType = "str" | "num" | "enum" | "ref" | "date" | "marker";

export interface FieldDef {
  tag: string;
  label: string;
  type: FieldType;
  /** type=enum 时，对应 emEnums() 里的键名。 */
  enumOf?: string;
  /** type=ref 时，候选来自资产树里的哪种对象。 */
  refKind?: NodeKind;
  unit?: string;
  hint?: string;
  /** 必填项：为空时高亮提示（真正的强制在后端校验里）。 */
  required?: boolean;
  /** 归到哪一组显示。默认「基本信息」。 */
  group?: string;
}

/** 属性分组，决定表单里的分节顺序。 */
export const FIELD_GROUPS = ["基本信息", "计量设置", "归属关系", "高级"] as const;

const SITE: FieldDef[] = [
  { tag: "navName", label: "名称", type: "str", required: true },
  { tag: "area", label: "建筑面积", type: "num", unit: "m²", required: true,
    hint: "单位面积能耗（EUI）的分母" },
  { tag: "emCoolArea", label: "空调面积", type: "num", unit: "m²" },
  { tag: "emOccupancy", label: "在册人数", type: "num",
    hint: "人均能耗指标与「按人数分摊」要用" },
  { tag: "emBeds", label: "核定床位数", type: "num",
    hint: "单位床位能耗（CBEI）的分母，医院类站点考核必填" },
  { tag: "emUsageType", label: "业态", type: "enum", enumOf: "EmUsageType" },
  { tag: "emClimateZone", label: "气候区", type: "str",
    hint: "严寒 / 寒冷 / 夏热冬冷 / 夏热冬暖 / 温和" },
  { tag: "tz", label: "时区", type: "str", group: "高级",
    hint: "采集点位的时区跟随站点" },
  { tag: "emBaseYear", label: "基准年", type: "num", group: "高级" },
  { tag: "emGapThreshold", label: "缺口率上限", type: "num", group: "高级",
    hint: "填 0~1 的小数，如 0.05 表示 5%。超过这个值就不允许关账" },
];

const FLOOR: FieldDef[] = [
  { tag: "navName", label: "名称", type: "str", required: true },
  { tag: "floorNum", label: "楼层号", type: "num", required: true,
    hint: "地面层填 0，地上填 1、2、3…，地下填 -1、-2…" },
  { tag: "area", label: "楼层面积", type: "num", unit: "m²",
    hint: "按层统计能耗强度时的分母" },
  { tag: "emUsageType", label: "业态", type: "enum", enumOf: "EmUsageType" },
];

const ZONE: FieldDef[] = [
  { tag: "navName", label: "名称", type: "str", required: true },
  { tag: "area", label: "面积", type: "num", unit: "m²",
    hint: "「按面积分摊」的权重，也是分区能耗强度的分母" },
  { tag: "emUsageType", label: "业态", type: "enum", enumOf: "EmUsageType" },
  { tag: "emOccupancy", label: "人数", type: "num" },
  { tag: "floorRef", label: "所在楼层", type: "ref", refKind: "floor", group: "归属关系",
    hint: "跨楼层的分区留空即可" },
  { tag: "emTenantRef", label: "归属租户", type: "ref", refKind: "tenant", group: "归属关系" },
];

const TENANT: FieldDef[] = [
  { tag: "navName", label: "名称", type: "str", required: true },
  { tag: "area", label: "租赁面积", type: "num", unit: "m²" },
  { tag: "emOccupancy", label: "人数", type: "num" },
  { tag: "emUsageType", label: "业态", type: "enum", enumOf: "EmUsageType" },
  { tag: "emContractNo", label: "合同编号", type: "str" },
  { tag: "emParentRef", label: "上级组织", type: "ref", refKind: "tenant", group: "归属关系" },
];

const METER: FieldDef[] = [
  { tag: "navName", label: "名称", type: "str", required: true },
  { tag: "emMedium", label: "介质", type: "enum", enumOf: "EmMedium", required: true,
    hint: "已经产生台账的表不允许改介质，需要换介质请另建一块" },
  { tag: "emMeterRole", label: "计量角色", type: "enum", enumOf: "EmMeterRole", required: true,
    group: "计量设置",
    hint: "决定它怎么参与汇总。考核表只用于校核，不计入合计" },
  { tag: "emDataSource", label: "数据来源", type: "enum", enumOf: "EmDataSource", required: true,
    group: "计量设置",
    hint: "实测 / 推导 / 分摊 / 估算 / 人工录入。估算的数据不能用于结算和对外披露" },
  { tag: "emSubItem", label: "用能分项", type: "enum", enumOf: "EmSubItem", group: "计量设置",
    hint: "国标分项口径，只对电表有效" },
  { tag: "submeterOf", label: "上级表", type: "ref", refKind: "meter", group: "归属关系",
    hint: "本表的用量计入哪一块上级表。上下级必须是同一种介质" },
  { tag: "floorRef", label: "所在楼层", type: "ref", refKind: "floor", group: "归属关系",
    hint: "站级或跨楼层表计留空即可" },
  { tag: "emMaxReading", label: "表底翻转上限", type: "num", group: "计量设置",
    hint: "表数走满一圈归零的那个数。不填的话，翻转当天的用量会被丢弃" },
  { tag: "emInstallDate", label: "安装 / 换表日期", type: "date", group: "计量设置",
    hint: "换表当天的用量会按新表底数计算，避免出现一个巨大的负数" },
  { tag: "emMeterFactor", label: "综合倍率", type: "num", group: "计量设置",
    hint: "带互感器的电表，读数要乘这个倍率才是真实用量" },
  { tag: "emCtRatio", label: "电流互感器变比", type: "num", group: "高级" },
  { tag: "emPtRatio", label: "电压互感器变比", type: "num", group: "高级" },
  { tag: "emFormula", label: "计算公式", type: "str", group: "高级",
    hint: "只有虚拟表用。例：emMeterRead(@总表) - emSubMeterSum(@总表)" },
  { tag: "emSettlement", label: "结算表", type: "marker", group: "计量设置",
    hint: "与供能方结算用的表，精度和审计要求最高" },
  { tag: "emMeterScope", label: "计量范围说明", type: "str", group: "高级",
    hint: "这块表管哪些回路，写给现场交底看" },
  { tag: "emSpaceRef", label: "归属分区", type: "ref", refKind: "zone", group: "归属关系" },
  { tag: "emTenantRef", label: "归属租户", type: "ref", refKind: "tenant", group: "归属关系" },
];

const LOAD: FieldDef[] = [
  { tag: "navName", label: "名称", type: "str", required: true },
  { tag: "emSubItem", label: "用能分项", type: "enum", enumOf: "EmSubItem", required: true,
    hint: "不选的话，这台设备的用能在分项统计里归不了类" },
  { tag: "emMeterRef", label: "计量表", type: "ref", refKind: "meter", group: "归属关系",
    hint: "有独立计量就选对应的表；没有就靠下面的功率或权重分摊" },
  { tag: "floorRef", label: "所在楼层", type: "ref", refKind: "floor", group: "归属关系",
    hint: "站级或跨楼层设备留空即可" },
  { tag: "emRatedPower", label: "额定功率", type: "num", unit: "kW",
    hint: "「按额定功率 × 运行时长分摊」的基数" },
  { tag: "emAllocWeight", label: "分摊权重", type: "num", group: "高级",
    hint: "留空则自动用「额定功率 × 运行时长」" },
  { tag: "emQty", label: "数量", type: "num", hint: "灯具、末端这类批量对象填台数" },
  { tag: "emSpaceRef", label: "归属分区", type: "ref", refKind: "zone", group: "归属关系" },
  { tag: "emTenantRef", label: "归属租户", type: "ref", refKind: "tenant", group: "归属关系" },
];

const SCHEMAS: Record<NodeKind, FieldDef[]> = {
  site: SITE,
  floor: FLOOR,
  zone: ZONE,
  tenant: TENANT,
  meter: METER,
  load: LOAD,
};

export function fieldsFor(kind: NodeKind): FieldDef[] {
  return SCHEMAS[kind] ?? [];
}

/** 按分组拆开，供表单分节渲染。空分组不返回。 */
export function groupedFields(kind: NodeKind): { group: string; fields: FieldDef[] }[] {
  const fields = fieldsFor(kind);
  const out: { group: string; fields: FieldDef[] }[] = [];
  for (const g of FIELD_GROUPS) {
    const list = fields.filter((f) => (f.group ?? "基本信息") === g);
    if (list.length) out.push({ group: g, fields: list });
  }
  return out;
}

/** 按类型把字段名分组，交给 `changesExpr` 生成正确的写入格式。 */
export function tagTypesFor(kind: NodeKind) {
  const fields = fieldsFor(kind);
  return {
    ref: fields.filter((f) => f.type === "ref").map((f) => f.tag),
    date: fields.filter((f) => f.type === "date").map((f) => f.tag),
    marker: fields.filter((f) => f.type === "marker").map((f) => f.tag),
  };
}

/** 对象类型的中文名。 */
export const KIND_DIS: Record<NodeKind, string> = {
  site: "站点",
  floor: "楼层",
  zone: "计量分区",
  meter: "表计",
  load: "用能设备",
  tenant: "租户 / 组织",
};

/** 左侧筛选分组的中文名。 */
export const GROUP_DIS: Record<string, string> = {
  all: "全部",
  space: "空间",
  metering: "计量",
  equip: "设备",
  org: "组织",
};
