import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const badgeUrl = new URL("../src/components/PodVersionBadge.tsx", import.meta.url);
const shellUrl = new URL("../src/components/AppShell.tsx", import.meta.url);

test("sidebar shows only the pod version returned by emInfo", () => {
  assert.equal(existsSync(badgeUrl), true, "PodVersionBadge.tsx should exist");

  const badge = readFileSync(badgeUrl, "utf8");
  assert.match(badge, /useClient\(\)/);
  assert.match(badge, /emInfo\(client\)/);
  assert.doesNotMatch(badge, /energyMatrix v/);

  const shell = readFileSync(shellUrl, "utf8");
  assert.match(shell, /<LedgerStatusBar\s*\/>[\s\S]*<PodVersionBadge\s*\/>/);
});
