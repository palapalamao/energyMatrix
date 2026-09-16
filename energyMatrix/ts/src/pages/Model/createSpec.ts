import type { TagValue } from "../../api/emApi";

/** Backend creation commands accepted by ModelStore. */
export type CreateSpec =
  | { what: "site"; name: string; args: Record<string, TagValue> }
  | { what: "floor"; siteRef: string; name: string; args: Record<string, TagValue> }
  | { what: "zone"; siteRef: string; name: string; args: Record<string, TagValue> }
  | { what: "tenant"; parentRef?: string; name: string; args: Record<string, TagValue> }
  | { what: "meter"; siteRef: string; medium: string; name: string; args: Record<string, TagValue> }
  | { what: "virtualMeter"; siteRef: string; medium: string; formula: string; name: string;
      args: Record<string, TagValue> }
  | { what: "gapMeter"; siteRef: string; sourceMeterRef: string; name?: string }
  | { what: "load"; equipRef: string; args: Record<string, TagValue> }
  | { what: "loadGroup"; siteRef: string; name: string; args: Record<string, TagValue> };

export type CreateWhat = CreateSpec["what"];

export interface CreateFormState {
  what: CreateWhat;
  siteRef?: string;
  name: string;
  medium: string;
  role: string;
  subItem: string;
  parentMeter: string;
  sourceMeter: string;
  formula: string;
  equipRef: string;
  parentOrg: string;
  floorRef: string;
  floorNum: string;
  area: string;
  ratedPower: string;
}

/** Convert dialog state into a typed backend command without performing I/O. */
export function buildCreateSpec(state: CreateFormState): CreateSpec | undefined {
  const {
    what, siteRef, name, medium, role, subItem, parentMeter, sourceMeter,
    formula, equipRef, parentOrg, floorRef, floorNum, area, ratedPower,
  } = state;
  const args: Record<string, TagValue> = {};
  if (area !== "") args.area = Number(area);

  if (what === "site") return { what, name: name || "站点", args };
  if (what === "tenant") {
    return { what, parentRef: parentOrg || undefined, name: name || "租户", args };
  }
  if (!siteRef) return undefined;

  if (what === "floor") {
    if (floorNum !== "") args.floorNum = Number(floorNum);
    return { what, siteRef, name: name || "楼层", args };
  }
  if (what === "zone") {
    if (floorRef) args.floorRef = floorRef;
    return { what, siteRef, name: name || "分区", args };
  }
  if (what === "meter") {
    args.emMeterRole = role;
    if (subItem) args.emSubItem = subItem;
    if (parentMeter) args.submeterOf = parentMeter;
    if (floorRef) args.floorRef = floorRef;
    return { what, siteRef, medium, name: name || "表计", args };
  }
  if (what === "virtualMeter") {
    if (parentMeter) args.submeterOf = parentMeter;
    if (floorRef) args.floorRef = floorRef;
    return { what, siteRef, medium, formula, name: name || "虚拟表", args };
  }
  if (what === "gapMeter") {
    if (!sourceMeter) return undefined;
    return { what, siteRef, sourceMeterRef: sourceMeter, name: name || undefined };
  }
  if (what === "loadGroup") {
    if (subItem) args.emSubItem = subItem;
    if (ratedPower !== "") args.emRatedPower = Number(ratedPower);
    if (floorRef) args.floorRef = floorRef;
    return { what, siteRef, name: name || "设备组", args };
  }
  if (!equipRef) return undefined;
  if (subItem) args.emSubItem = subItem;
  if (ratedPower !== "") args.emRatedPower = Number(ratedPower);
  return { what: "load", equipRef, args };
}
