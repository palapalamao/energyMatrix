import assert from "node:assert/strict";
import test from "node:test";

import { selectSiteRef } from "../src/components/selectSite.ts";

test("keeps current site when it is still in the refreshed site list", () => {
  assert.equal(selectSiteRef([{ ref: "s-1" }, { ref: "s-2" }], "s-2"), "s-2");
});

test("stale current site selects the rich primary hospital demo first", () => {
  const sites = [
    {
      ref: "hospital",
      dis: "某医院",
      synthetic: true,
      dataProvenance: "hospital-rich-demo-20260913",
    },
    {
      ref: "east",
      dis: "东院区",
      synthetic: true,
      dataProvenance: "hospital-demo-minimal-20260913",
    },
  ];

  assert.equal(selectSiteRef(sites, "retired-site"), "hospital");
});

test("canonical hospital name wins over an older synthetic generation", () => {
  const sites = [
    { ref: "east", dis: "东院区", synthetic: true, dataProvenance: "hospital-demo-minimal-20260913" },
    { ref: "hospital", dis: "某医院", synthetic: true, dataProvenance: "hospitalDemo-20260909" },
  ];

  assert.equal(selectSiteRef(sites, undefined), "hospital");
});

test("falls back to the canonical hospital before a secondary synthetic site", () => {
  const sites = [
    { ref: "legacy", dis: "某医院" },
    { ref: "demo", dis: "东院区", synthetic: true },
  ];

  assert.equal(selectSiteRef(sites, "retired-site"), "legacy");
});

test("falls back to the first refreshed site when no demo marker is available", () => {
  assert.equal(selectSiteRef([{ ref: "s-1" }, { ref: "s-2" }], "old-site"), "s-1");
});

test("returns undefined when no refreshed sites are available", () => {
  assert.equal(selectSiteRef([], "old-site"), undefined);
});
