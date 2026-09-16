import assert from "node:assert/strict";
import test from "node:test";

import { buildCreateSpec } from "../src/pages/Model/createSpec.ts";
import { fieldsFor } from "../src/pages/Model/fieldSchema.ts";
import { CREATE_REF_TAGS } from "../src/api/emCreateRefTags.ts";

const common = {
  siteRef: "s-1",
  name: "",
  medium: "elec",
  role: "sub",
  subItem: "",
  parentMeter: "",
  sourceMeter: "",
  formula: "emMeterRead(@m-1)",
  equipRef: "",
  parentOrg: "",
  floorRef: "f-1",
  floorNum: "",
  area: "",
  ratedPower: "",
};

test("meter, virtual meter and load group include selected floorRef", () => {
  for (const what of ["meter", "virtualMeter", "loadGroup"] as const) {
    const spec = buildCreateSpec({ ...common, what });
    assert.ok(spec && "args" in spec);
    assert.equal(spec.args.floorRef, "f-1", what);
  }
});

test("blank floorRef keeps equipment site-level", () => {
  const spec = buildCreateSpec({ ...common, what: "meter", floorRef: "" });
  assert.ok(spec && "args" in spec);
  assert.equal(Object.hasOwn(spec.args, "floorRef"), false);
});

test("gap meter does not accept an independent floor selection", () => {
  const spec = buildCreateSpec({
    ...common,
    what: "gapMeter",
    sourceMeter: "m-1",
  });
  assert.deepEqual(spec, {
    what: "gapMeter",
    siteRef: "s-1",
    sourceMeterRef: "m-1",
    name: undefined,
  });
});

test("meter and load edit schemas expose optional floorRef", () => {
  for (const kind of ["meter", "load"] as const) {
    const field = fieldsFor(kind).find((candidate) => candidate.tag === "floorRef");
    assert.equal(field?.type, "ref", kind);
    assert.equal(field?.refKind, "floor", kind);
    assert.match(field?.hint ?? "", /站级|跨楼层/);
  }
});

test("Axon create wrappers serialize floorRef as a Haystack Ref", () => {
  for (const kind of ["meter", "virtualMeter", "loadGroup"] as const) {
    assert.equal(CREATE_REF_TAGS[kind].includes("floorRef"), true, kind);
  }
});
