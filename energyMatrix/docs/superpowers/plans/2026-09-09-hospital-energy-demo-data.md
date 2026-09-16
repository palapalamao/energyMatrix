# Hospital Energy Demo Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill every EnergyMatrix pod page in FIN project `mytest` with coherent, traceable hospital energy demonstration data covering three sites, 90 recent days, prior-year comparison, ledger, quota, carbon, diagnostics, work orders, savings, and reporting.

**Architecture:** Fix the virtual-meter runtime defect and stale-site fallback in product code, then use a deterministic local manifest to render bounded Axon expressions without installing a persistent hospital-builder function. Send every live read and mutation through FIN Expert's registered `local-mytest` connection; stage each mutation, obtain explicit confirmation, execute the unchanged request, reconcile by read, and cut over only after the new generation passes acceptance checks.

**Tech Stack:** FIN Framework 5.3.0.2761 / Haystack 3.1.5.1, Fantom, Axon/Trio, React 18, TypeScript, Node test runner, Python 3 standard library, FIN Expert governed live runtime, Kimi WebBridge.

---

## File Map

- Modify `haystack code/energy/energyMatrix/fan/meter/EmVirtualMeterEval.fan`: isolate `emSelf` inside each virtual-formula call frame.
- Modify `haystack code/energy/energyMatrix/fan/test/EmAxonSyntaxTest.fan`: lock the safe formula-binding source contract.
- Create `haystack code/energy/energyMatrix/ts/src/components/selectSite.ts`: pure site-selection fallback.
- Modify `haystack code/energy/energyMatrix/ts/src/components/SiteContext.tsx`: replace stale refs and prefer `某医院`.
- Create `haystack code/energy/energyMatrix/ts/tests/site-selection.test.ts`: cover valid, stale, preferred, and empty site lists.
- Create `haystack code/energy/energyMatrix/scripts/hospital_demo/manifest.py`: single source of truth for the three-site hospital dataset.
- Create `haystack code/energy/energyMatrix/scripts/hospital_demo/render_batches.py`: render bounded, idempotent Axon expressions; never connect to FIN.
- Create `haystack code/energy/energyMatrix/scripts/hospital_demo/test_manifest.py`: validate counts, references, energy balance, provenance, and batch size.
- Create `haystack code/energy/energyMatrix/scripts/hospital_demo/README.md`: operator commands, batch order, confirmation boundaries, reconciliation, and rollback.
- Generated but uncommitted `haystack code/energy/output/hospital-demo-20260909/*.axon`: exact rendered batches used for staging.
- Generated but uncommitted `haystack code/energy/output/hospital-demo-20260909/audits.json`: audit IDs and observed counts only; never credentials or confirmation tokens.

## Shared Execution Setup

Create an isolated worktree from the approved design commit before changing code. Do not include the user's dirty `App.tsx`, `skills-lock.json`, or untracked files.

```powershell
git worktree add 'D:\work\yiliaohouqin-worktrees\hospital-energy-demo-data' -b codex/hospital-energy-demo-data 0ad5ef8
Set-Location 'D:\work\yiliaohouqin-worktrees\hospital-energy-demo-data\haystack code\energy\energyMatrix'
$fanOverlay = 'C:\Users\11607\AppData\Local\Temp\codex-energyMatrix-hospital-demo'
New-Item -ItemType Directory -Force -Path (Join-Path $fanOverlay 'lib\fan') | Out-Null
$env:FAN_ENV = 'util::PathEnv'
$env:FAN_ENV_PATH = $fanOverlay
```

All source edits use `apply_patch`. Live credentials remain in the OS credential manager. Never place a password, cookie, session token, or FIN Expert confirmation token in the repository, generated output, shell history, audit file, or chat response.

### Task 1: Fix repeated virtual-meter evaluation

**Files:**
- Modify: `haystack code/energy/energyMatrix/fan/test/EmAxonSyntaxTest.fan`
- Modify: `haystack code/energy/energyMatrix/fan/meter/EmVirtualMeterEval.fan:67-82`

- [ ] **Step 1: Change the source-contract test first**

Replace `test_virtualMeterUsesLexicalSelfBinding` with assertions that require an Axon-valid private parameter and a new local `emSelf` binding inside the lambda call frame. Parse a representative generated expression so the contract also covers Axon syntax:

```fan
Void test_virtualMeterUsesIsolatedSelfBinding() {
  src := EmLayerIsolationTest.findSrcDir
  verifyNotNull(src, "找不到源码树，无法检查虚拟表公式求值器")

  text := (src + `meter/EmVirtualMeterEval.fan`).readAllStr
  verify(text.contains("(emSubjectParam) => do emSelf: emSubjectParam; ("),
    "虚拟表公式必须在新的函数帧内定义 emSelf")
  verify(text.contains("fn.call(cx, [selfRef])"),
    "虚拟表公式必须把当前表 Ref 传入私有参数")
  verifyFalse(text.contains("(emSelf) =>"),
    "lambda 参数不能直接命名 emSelf，否则 FIN 5.3 会重复绑定")

  generated := "(emSubjectParam) => do emSelf: emSubjectParam; (1 + 2) end"
  try {
    Parser(Loc("EmVirtualMeterEval.eval", 1), generated.in).parse
  } catch (Err e) {
    fail("虚拟表公式的 Axon lambda 语法错误：" + e.toStr)
  }
}
```

- [ ] **Step 2: Build and verify RED**

```powershell
& 'C:\Program Files (x86)\FIN\FIN 5.3.0.2761\bin\fan.bat' build.fan
& 'C:\Program Files (x86)\FIN\FIN 5.3.0.2761\bin\fant.bat' energyMatrix::EmAxonSyntaxTest
```

Expected: the focused test fails if the current source directly names the lambda parameter `emSelf`, uses an Axon-invalid private parameter, or generates an expression that FIN 5.3 cannot parse.

- [ ] **Step 3: Implement the minimal frame isolation**

Change only the formula compilation line in `EmVirtualMeterEval.eval`:

```fan
fn := cx.eval("(emSubjectParam) => do emSelf: emSubjectParam; (" + formula + ") end") as Fn
```

Keep `EmEvalScope.withSpan`, `EmEvalScope.withDepth`, result validation, logging, and exception propagation unchanged.

- [ ] **Step 4: Rebuild and verify GREEN**

Run the commands from Step 2. Expected: `EmAxonSyntaxTest` passes both the source contract and representative Axon parser coverage.

- [ ] **Step 5: Run the complete Fantom suite**

```powershell
& 'C:\Program Files (x86)\FIN\FIN 5.3.0.2761\bin\fant.bat' energyMatrix
```

Expected: every EnergyMatrix test passes with zero failures.

- [ ] **Step 6: Commit the backend fix**

```powershell
git add -- 'fan/test/EmAxonSyntaxTest.fan' 'fan/meter/EmVirtualMeterEval.fan'
git commit -m 'fix(energy): isolate virtual meter self binding'
```

### Task 2: Recover automatically from a stale site reference

**Files:**
- Create: `haystack code/energy/energyMatrix/ts/src/components/selectSite.ts`
- Create: `haystack code/energy/energyMatrix/ts/tests/site-selection.test.ts`
- Modify: `haystack code/energy/energyMatrix/ts/src/components/SiteContext.tsx:66-82`

- [ ] **Step 1: Write the failing pure-function tests**

Create `site-selection.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { selectSiteRef } from "../src/components/selectSite.ts";

const sites = [
  { ref: "east", dis: "某医院东院区" },
  { ref: "main", dis: "某医院" },
];

test("keeps a current ref that still exists", () => {
  assert.equal(selectSiteRef(sites, "east"), "east");
});

test("replaces a stale ref with the preferred hospital", () => {
  assert.equal(selectSiteRef(sites, "deleted"), "main");
});

test("falls back to the first valid site when preferred name is absent", () => {
  assert.equal(selectSiteRef([{ ref: "only", dis: "分院" }], "deleted"), "only");
});

test("returns undefined for an empty site list", () => {
  assert.equal(selectSiteRef([], "deleted"), undefined);
});
```

- [ ] **Step 2: Run tests and verify RED**

```powershell
Set-Location 'D:\work\yiliaohouqin-worktrees\hospital-energy-demo-data\haystack code\energy\energyMatrix\ts'
npm ci
npm test
```

Expected: the new test fails because `selectSite.ts` does not exist.

- [ ] **Step 3: Implement the pure selector**

Create `selectSite.ts`:

```ts
export interface SiteChoice {
  ref?: string;
  dis?: string;
}

export function selectSiteRef(
  sites: SiteChoice[],
  currentRef?: string,
  preferredDis = "某医院"
): string | undefined {
  if (currentRef && sites.some((site) => site.ref === currentRef)) return currentRef;
  return sites.find((site) => site.dis === preferredDis)?.ref ?? sites[0]?.ref;
}
```

In `SiteContext.tsx`, import `selectSiteRef` and replace the current null-only fallback:

```ts
const choices = list.map((site) => ({ ref: emId(site), dis: str(site, "dis") }));
setSiteRef((current) => selectSiteRef(choices, current));
```

- [ ] **Step 4: Run frontend verification**

```powershell
npm test
npm run typecheck
npm run build
```

Expected: all Node tests pass, TypeScript reports no errors, and Vite produces the pod web assets.

- [ ] **Step 5: Commit the site fallback**

```powershell
git add -- 'src/components/selectSite.ts' 'src/components/SiteContext.tsx' 'tests/site-selection.test.ts'
git commit -m 'fix(energy): replace stale site selections'
```

### Task 3: Define and validate the hospital data manifest

**Files:**
- Create: `haystack code/energy/energyMatrix/scripts/hospital_demo/manifest.py`
- Create: `haystack code/energy/energyMatrix/scripts/hospital_demo/test_manifest.py`

- [ ] **Step 1: Write manifest invariant tests**

Tests must use `unittest.TestCase` so `unittest discover` executes every assertion, and must assert all of the following exact requirements:

```python
import unittest

class ManifestTests(unittest.TestCase):
    def test_exact_scope(self):
        self.assertEqual([s["name"] for s in SITES], ["某医院（构建中）", "某医院东院区", "某医院康复院区"])
        self.assertEqual(len(primary_physical_meters()), 48)
        self.assertEqual(len(primary_check_meters()), 2)
        self.assertEqual(len(primary_gap_meters()), 4)
        self.assertEqual(len(secondary_physical_meters()), 20)
        self.assertEqual(len(secondary_gap_meters()), 2)
        self.assertEqual(len(QUOTAS), 8)
        self.assertEqual(len(KPIS), 7)
        self.assertEqual(len(DIAG_RULES), 8)
        self.assertEqual(len(ANOMALY_SCENARIOS), 12)
        self.assertEqual(len(WORK_ORDER_SCENARIOS), 6)
        self.assertEqual(len(BASELINES), 2)
        self.assertEqual(len(SAVINGS_PROJECTS), 5)
        self.assertEqual(len(CARBON_TARGETS), 3)

    def test_all_records_are_traceable(self):
        self.assertEqual(GENERATION, "hospitalDemo-20260909")
        self.assertTrue(all(item["key"].startswith("hd-") for item in all_manifest_records()))
        self.assertTrue(all(item["synthetic"] is True for item in all_manifest_records()))
        self.assertTrue(all(item["provenance"] == GENERATION for item in all_manifest_records()))
        self.assertEqual(len({item["key"] for item in all_manifest_records()}), len(all_manifest_records()))

    def test_meter_graph_and_balances(self):
        validate_parent_keys_exist()
        validate_parent_and_child_media_match()
        for gateway in gateway_meters():
            ratio = sum(child["daily"] for child in direct_accounting_children(gateway)) / gateway["daily"]
            self.assertGreaterEqual(ratio, 0.96)
            self.assertLessEqual(ratio, 0.98)

    def test_business_semantics(self):
        self.assertEqual({q["scope"] for q in QUOTAS}, {"site", "department"})
        self.assertGreaterEqual(len({q["medium"] for q in QUOTAS}), 4)
        self.assertEqual({p["verify_status"] for p in SAVINGS_PROJECTS}, {"planned", "monitoring", "verified"})
        self.assertEqual({c["retired"] for c in GREEN_CERTS}, {True, False})
        self.assertTrue(all(site["derive_ledger"] and site["derive_kpi"] and site["derive_carbon"] for site in SITES))
        self.assertTrue(all(len(b["actual"]) == len(b["predicted"]) >= 12 for b in BASELINES))

    def test_parameter_disclaimers(self):
        for item in TARIFFS + EMISSION_FACTORS + CARBON_TARGETS + SAVINGS_PROJECTS:
            self.assertTrue("演示" in item["source_doc"] or "模拟" in item["source_doc"])
```

- [ ] **Step 2: Run tests and verify RED**

```powershell
Set-Location 'D:\work\yiliaohouqin-worktrees\hospital-energy-demo-data\haystack code\energy\energyMatrix'
& 'C:\Users\11607\FINExpert\finprofile\.venv\Scripts\python.exe' -m unittest discover -s scripts/hospital_demo -p 'test_*.py' -v
```

Expected: imports or assertions fail because the manifest is not implemented.

- [ ] **Step 3: Implement the exact model**

In `manifest.py`, define immutable dictionaries/lists with stable `hd-*` keys and `GENERATION`. Use these exact totals:

- Sites: three.
- Primary floors: twelve; primary zones: fifteen; primary organizations/departments: eight.
- Primary physical meters: 24 electric, 8 water, 3 gas, 4 steam, 4 heat, 5 cooling.
- Primary check meters: two electric.
- Primary gap meters: electric gateway, water gateway, cooling main, and primary lighting branch.
- Each secondary site: ten physical meters and one electric gap meter.
- All represented media: `elec`, `water`, `gas`, `steam`, `heat`, `cool`.
- Current and previous-year parameter versions: twelve tariffs and twelve emission factors.
- Business records: eight quotas, seven KPIs, eight diagnostic rules, twelve anomaly scenarios, six work-order scenarios, two baselines, five savings projects, three carbon targets, and four green certificates.

Electric branches must cover lighting/sockets, cooling plant, HVAC terminals, elevators, pumps/fans, information rooms, outpatient, emergency, wards, ICU, operating theatres, laboratory, imaging, sterilization, pharmacy, kitchen, laundry, parking, and charging. Every meter includes a daily amount, profile kind, medium, role, parent key when applicable, space/department keys, source classification, unit, and meter scope.

Use deterministic profile kinds `continuous`, `weekday`, `surgery`, `imaging`, `meal`, `laundry`, `hvac`, and `night`. Do not call a random generator without a fixed seed. Critical gateways have complete history; intentional gaps are limited to named non-settlement branches.

- [ ] **Step 4: Run manifest tests and verify GREEN**

Run the command from Step 2. Expected: every invariant passes.

- [ ] **Step 5: Commit the manifest**

```powershell
git add -- 'scripts/hospital_demo/manifest.py' 'scripts/hospital_demo/test_manifest.py'
git commit -m 'feat(energy): define hospital demo dataset'
```

### Task 4: Render bounded, idempotent live-operation batches

**Files:**
- Create: `haystack code/energy/energyMatrix/scripts/hospital_demo/render_batches.py`
- Modify: `haystack code/energy/energyMatrix/scripts/hospital_demo/test_manifest.py`
- Create: `haystack code/energy/energyMatrix/scripts/hospital_demo/README.md`

- [ ] **Step 1: Add failing renderer tests**

Require fifteen ordered batch files. Primary recent history is split into six groups of eight meters so each request stays within the 120-second live-operation bound:

```python
EXPECTED_BATCHES = [
    "01-model-and-parameters",
    "02-primary-recent-history-01",
    "02-primary-recent-history-02",
    "02-primary-recent-history-03",
    "02-primary-recent-history-04",
    "02-primary-recent-history-05",
    "02-primary-recent-history-06",
    "03-primary-prior-year-history",
    "04-east-history",
    "04-rehab-history",
    "05-primary-recent-ledger",
    "05-comparison-ledger",
    "05-secondary-ledger-and-diagnostics",
    "06-workflows-and-close-period",
    "07-cutover",
]

class RendererTests(unittest.TestCase):
    def test_rendered_batches_are_bounded_and_safe(self):
        batches = render_all()
        self.assertEqual(list(batches), EXPECTED_BATCHES)
        self.assertTrue(all(len(expr.encode("utf-8")) <= 20_000 for expr in batches.values()))
        for name, expr in batches.items():
            if name != "07-cutover":
                self.assertIn('emDataProvenance:"hospitalDemo-20260909"', expr)
                self.assertIn("emSynthetic", expr)
            self.assertNotIn("password", expr.lower())
            self.assertNotIn("pointWrite(", expr)

    def test_cutover_is_provenance_scoped(self):
        expr = render_all()["07-cutover"]
        self.assertIn('emDataProvenance=="emDemoBuild"', expr)
        self.assertIn("emSynthetic", expr)
        self.assertNotIn("emDemoClear()", expr)
```

- [ ] **Step 2: Run tests and verify RED**

Run the unittest command from Task 3. Expected: renderer imports or assertions fail.

- [ ] **Step 3: Implement the renderer**

The renderer must:

- Produce local Axon expressions only; it must not import FIN Expert, open sockets, or connect to FIN.
- Upsert by `emDemoKey` and generation rather than assuming server-generated Refs.
- Use existing EnergyMatrix factories for sites, floors, zones, organizations, meters, gap meters, quotas, KPIs, diagnostic rules, and savings projects.
- Use direct Folio commits only for versioned parameters, baseline/target/certificate records, and explicitly synthetic anomaly seeds unsupported by a public factory.
- The sole work-order exception is exactly one synthetic `new` work-order scenario: create it by direct Folio commit because public dispatch begins at `assigned`. Treat it as not publicly reachable, attach `emSynthetic`, `emDataProvenance:"hospitalDemo-20260909"`, `emDemoKey`, and an audit note, and create or advance every other work-order scenario through public dispatch and transition services.
- Before renderer acceptance and before any live staging, syntax-validate every rendered KPI formula and diagnostic subject filter with the FIN 5.3 Axon parser. Any parser failure blocks batch output and staging.
- Generate cumulative, monotonic hourly histories on the server from compact local lambdas. The expressions include recent 90-day data and the matching prior-year month-to-date span, weekday/weekend factors, deterministic day variation, and profile-specific hourly cumulative curves.
- Set `hisCollectInterval:1hr` on synthetic L1 points and never call `pointWrite`.
- Resolve dependencies through exact `energyMatrix and emDemoKey` lookups inside each expression.
- Make retries idempotent: skip existing model records, overwrite matching history timestamps, use existing ledger upsert behavior, and never duplicate business records with the same `emDemoKey`.
- Pass both `emSynthetic` and `emDataProvenance` through every factory that accepts arguments. After every service call, explicitly tag all new site-scoped derived records, including points, ledger entries, anomalies, work orders, close periods, savings projects, and any service-created supporting records. Directly committed global parameters and KPI definitions receive both tags at creation.
- End every non-cutover batch with a scope audit: new site-linked records missing either marker must be zero, and `hd-*` global records missing either marker must be zero. A non-zero result makes the batch report an error and blocks the next batch.
- Return a compact result dict with attempted/written/skipped/error counts and the generation string.
- Refuse to render any expression over 20,000 UTF-8 bytes.

`07-cutover` must first verify that exactly one new primary site exists and that its ledger count is non-zero. It then removes only records satisfying `energyMatrix and emSynthetic and emDataProvenance=="emDemoBuild"`, updates the new primary site's display name from `某医院（构建中）` to `某医院`, and returns removed and renamed counts. It must never invoke `emDemoClear()`.

- [ ] **Step 4: Document governed operation flow**

The README must show:

```powershell
& 'C:\Users\11607\FINExpert\finprofile\.venv\Scripts\python.exe' scripts/hospital_demo/render_batches.py --output 'D:\work\yiliaohouqin\haystack code\energy\output\hospital-demo-20260909'
```

Document the exact batch order, read-only preflight, FIN Expert stage/confirm/execute/reconcile cycle, `outcome_unknown` stop rule, no-token persistence rule, acceptance queries, and pod/data rollback steps.

- [ ] **Step 5: Verify generated output**

Run the renderer, then run:

```powershell
Get-ChildItem -LiteralPath 'D:\work\yiliaohouqin\haystack code\energy\output\hospital-demo-20260909' -Filter '*.axon' | ForEach-Object { "{0} {1}" -f $_.Name, $_.Length }
```

Expected: fifteen files, each no larger than 20,000 bytes, with no credentials or confirmation tokens.

- [ ] **Step 6: Commit renderer and operator guide**

```powershell
git add -- 'scripts/hospital_demo/render_batches.py' 'scripts/hospital_demo/test_manifest.py' 'scripts/hospital_demo/README.md'
git commit -m 'feat(energy): render governed hospital demo batches'
```

### Task 5: Build, validate, and deploy the corrected pod

**Files:**
- Build artifact: `C:\Users\11607\AppData\Local\Temp\codex-energyMatrix-hospital-demo\lib\fan\energyMatrix.pod`
- Production target: `C:\Program Files (x86)\FIN\FIN 5.3.0.2761\lib\fan\energyMatrix.pod`
- Backup target: `D:\work\yiliaohouqin\haystack code\energy\output\backups\energyMatrix.pod.<timestamp>.bak`

- [ ] **Step 1: Run all offline verification**

```powershell
Set-Location 'D:\work\yiliaohouqin-worktrees\hospital-energy-demo-data\haystack code\energy\energyMatrix\ts'
npm test
npm run typecheck
npm run build
Set-Location '..'
$env:FAN_ENV = 'util::PathEnv'
$env:FAN_ENV_PATH = 'C:\Users\11607\AppData\Local\Temp\codex-energyMatrix-hospital-demo'
& 'C:\Program Files (x86)\FIN\FIN 5.3.0.2761\bin\fan.bat' build.fan
& 'C:\Program Files (x86)\FIN\FIN 5.3.0.2761\bin\fant.bat' energyMatrix
& 'C:\Users\11607\FINExpert\finprofile\.venv\Scripts\python.exe' -m unittest discover -s scripts/hospital_demo -p 'test_*.py' -v
```

Expected: all frontend, Fantom, and manifest tests pass; the pod exists only in the PathEnv overlay.

- [ ] **Step 2: Run FIN Expert artifact validation**

Validate the changed Fantom connector/pod artifact for FIN 5.3.0.2761. Record evidence IDs, applicability limits, unresolved runtime questions, and any validator degradation. Do not claim compilation compatibility from knowledge validation alone; the build and live smoke tests provide runtime evidence.

- [ ] **Step 3: Prepare a recoverable deployment**

Resolve and verify the exact source and target paths, compute the source SHA-256, copy the current installed pod to a timestamped backup, stop `FIN5`, replace the target, verify the installed hash, start `FIN5`, and wait for `Running`. If the process lacks permission, use one narrowly scoped UAC-elevated PowerShell helper whose only targets are the verified pod and `FIN5` service.

- [ ] **Step 4: Discover and verify the live connection**

Call FIN Expert `live_list_connections` first and select `local-mytest` only from the returned list. Stop if it is absent or its project is not `mytest`; never synthesize a connection from the URL. Then run `live_test_connection('local-mytest', actor='codex-hospital-demo')` and require `ok:true`, project `mytest`, and user `su`. Also require the SPA resource and `/api/mytest/about` to return HTTP 200. If any check fails, restore the backup before continuing.

- [ ] **Step 5: Run the live virtual-meter regression read**

Against the retained old synthetic site, execute one bounded read-only expression that calls `emSiteGaps(siteRef, span)` twice in the same request and returns both row counts. Require two successful non-zero results and no `Symbol already bound 'emSelf'`. If FIN Expert unexpectedly classifies the expression as a mutation, stop and inspect the classifier result instead of executing it as a read. If the regression fails, restore the timestamped pod backup, restart `FIN5`, verify the service returns to `Running`, and stop before any data-population batch.

- [ ] **Step 6: Commit deployment metadata only if source changed**

Do not commit generated pod files, backups, rendered batch output, audit JSON, or credentials. Confirm `git diff --check` and a clean worktree apart from ignored/generated output.

### Task 6: Create the new generation through governed live batches

**Files:**
- Read: `haystack code/energy/output/hospital-demo-20260909/01-model-and-parameters.axon`
- Read: `haystack code/energy/output/hospital-demo-20260909/02-primary-recent-history-01.axon` through `02-primary-recent-history-06.axon`
- Read: `haystack code/energy/output/hospital-demo-20260909/03-primary-prior-year-history.axon`
- Read: `haystack code/energy/output/hospital-demo-20260909/04-east-history.axon`
- Read: `haystack code/energy/output/hospital-demo-20260909/04-rehab-history.axon`
- Update locally, uncommitted: `haystack code/energy/output/hospital-demo-20260909/audits.json`

- [ ] **Step 1: Discover the connection and capture bounded preflight state**

Call FIN Expert `live_list_connections`, select `local-mytest` only if it is returned for project `mytest`, and stop if it is absent. Then use FIN Expert read-only operations to record connection/project, site IDs and names, counts by record type and provenance, L1 point history status, current ledger count, and old generation count. Save only audit IDs and non-sensitive counts.

- [ ] **Step 2: Stage model and parameter creation**

Call `live_execute_axon` with the exact contents of `01-model-and-parameters.axon`, `confirmed:false`, actor `codex-hospital-demo`, `max_rows:1000`, `max_bytes:1000000`, and `timeout_seconds:120`.

Require `status:staged`. Present connection `local-mytest`, project `mytest`, risk, request hash, expiry, and exact intended record counts to the user. Do not execute until the user explicitly confirms this unchanged preview.

- [ ] **Step 3: Execute and reconcile the model batch**

Repeat the unchanged request with `confirmed:true` and its single-use token. On `succeeded`, read by `emDataProvenance=="hospitalDemo-20260909"` and validate all model/parameter counts. On `failed`, report the category and inspect the partial generation. On `outcome_unknown`, stop and reconcile by audit and read; do not retry.

- [ ] **Step 4: Stage and execute recent primary history in six chunks**

Apply the same stage/confirm/execute/reconcile sequence independently to `02-primary-recent-history-01.axon` through `02-primary-recent-history-06.axon`. Each file covers eight distinct primary physical meters. A successful chunk is never silently retried; a failed or unknown chunk is reconciled by its exact meter keys and time span before proceeding. After all six succeed, verify all 48 primary physical meters have hourly history across the requested 90-day window, gateway completeness is 100 percent, and intentional gaps occur only on named non-settlement branches.

- [ ] **Step 5: Stage and execute prior-year primary history**

Apply the sequence to `03-primary-prior-year-history.axon`. Verify every comparison meter has history for the matching prior-year month-to-date span.

- [ ] **Step 6: Stage and execute secondary-site history**

Apply the sequence independently to `04-east-history.axon` and `04-rehab-history.axon`. Verify each secondary site has ten physical meters, one gap meter, recent history, and prior-year comparison history.

### Task 7: Derive business data and perform the cutover

**Files:**
- Read: `haystack code/energy/output/hospital-demo-20260909/05-primary-recent-ledger.axon`
- Read: `haystack code/energy/output/hospital-demo-20260909/05-comparison-ledger.axon`
- Read: `haystack code/energy/output/hospital-demo-20260909/05-secondary-ledger-and-diagnostics.axon`
- Read: `haystack code/energy/output/hospital-demo-20260909/06-workflows-and-close-period.axon`
- Read: `haystack code/energy/output/hospital-demo-20260909/07-cutover.axon`
- Update locally, uncommitted: `haystack code/energy/output/hospital-demo-20260909/audits.json`

- [ ] **Step 1: Stage and execute ledger and diagnostics in three bounded batches**

Apply the governed sequence independently to the three batch 05 files. The first builds the primary site's recent daily ledger, the second builds its prior-year comparison ledger, and the third builds both secondary sites' ledgers and diagnostics. Reconcile non-zero ledger counts for all six primary-site media, require zero ledger error rows, and require every site to return non-null KPI and carbon results needed by portfolio ranking.

- [ ] **Step 2: Run cross-query reconciliation before workflow seeding**

Read totals through `emLedgerAggregate`, `emLedgerCrosstab`, `emLedgerSourceMix`, `emSiteGapRatio`, `emQuotaProgressAll`, `emKpiComputeAll`, `emCarbonAccount`, `emAnomalies`, and `emAnomalyStats`. Require totals to reconcile within rounding tolerance and gap ratios to remain between two and four percent. Do not call `emDiagRun` in this read-only reconciliation step because it is an admin mutation already executed in the staged batch.

- [ ] **Step 3: Stage and execute workflow and close-period data**

Apply the governed sequence to batch 06. Use existing anomaly acknowledgment, false-alarm, dispatch, and work-order transition services to produce the requested state distribution. Create exactly one synthetic `new` work-order scenario through the documented direct-commit exception, generation-tag it, record its audit note, and never describe it as publicly reachable. Produce the `assigned`, `inProgress`, `done`, and `closed` scenarios through public dispatch and transition services. Call `emBaselineValidate` for both baselines with their manifest `actual` and `predicted` arrays, and require the returned `emR2`, `emCvRmse`, `emNmbe`, and `emValid` values to pass the product thresholds. Close the previous complete month only after `emClosePeriod(siteRef, priorMonthSpan, "daily", null, true)` returns `dryRun`; perform the actual close with the unchanged arguments except `dryRun:false`. Leave the current month open.

- [ ] **Step 4: Verify all acceptance counts before deletion**

Require three sites; 68 physical meters; two check meters; six gap meters; non-zero point histories and ledgers; eight quotas split across site and department scopes and at least four media; seven KPIs; eight rules; twelve anomalies; six work orders; two statistically valid baselines; five savings projects spanning planned, monitoring, and verified states; three carbon targets; four green certificates containing both retired and non-retired examples; and at least one completed previous-month close period. Verify each secondary site has non-zero ledger, KPI, and carbon results. Verify every new and derived record carries both `emSynthetic` and `emDataProvenance:"hospitalDemo-20260909"`.

- [ ] **Step 5: Stage the exact cutover**

Stage batch 07 only after Step 4 passes. Present the exact old-generation filter and current matching count, the new primary site ID, the rename to `某医院`, risk, hash, and expiry. Explicitly state that this removes old synthetic model records but does not delete historical storage or any non-synthetic EnergyMatrix record.

- [ ] **Step 6: Execute and reconcile cutover**

After explicit confirmation, execute the unchanged batch. Verify zero records remain with `emDataProvenance=="emDemoBuild"`, exactly one active site is named `某医院`, the two secondary sites remain, and all new acceptance counts are unchanged. If the result is unknown, stop and reconcile; never run the cutover twice blindly.

### Task 8: Verify every pod page and hand off evidence

**Files:**
- No committed files.

- [ ] **Step 1: Run the read-only API matrix**

Use FIN Expert to query every endpoint consumed by the thirteen screens: site list, overview aggregates, current/previous/prior-year totals, crosstab, source mix, gap ratio, meter tree and validation, devices and history status, six analysis dimensions, quota progress, KPI computation, savings/baselines, factors and carbon account, targets, certificates, anomalies and stats, work orders, portfolio ranking, close periods, and mobile aggregates.

Record expression/filter, observed row count, audit ID, truncation warnings, and failures. Narrow any truncated query before drawing a conclusion.

- [ ] **Step 2: Inspect all routes in the real FIN page**

Use `@kimi-webbridge` with the already authenticated browser session. Reload the current FIN URL, verify stale target recovery, and inspect:

```text
/overview /realtime /workorder /meter-tree /analysis /quota /diagnosis
/carbon /model /devices /portfolio /reports /mobile
```

Require no visible backend error, no `UnknownRecErr`, populated cards/tables/charts, and consistent primary-site totals. Record screenshots or observations without exposing credentials or session material.

- [ ] **Step 3: Verify logs and service health**

Read the current FIN log around the execution window and confirm there are no new `Symbol already bound 'emSelf'`, `ReadonlyErr`, ledger-build, or unhandled EnergyMatrix exceptions. Confirm `FIN5` remains `Running` and `live_test_connection` still succeeds.

- [ ] **Step 4: Run final repository verification**

```powershell
git diff --check
git status --short
git log --oneline --decorate -8
```

Confirm only intended commits exist in the feature worktree and the user's original dirty files remain untouched in the original checkout.

- [ ] **Step 5: Deliver the final report**

Report the deployed pod hash and backup path, active branch/commits, live connection/project, final counts, date spans, all FIN Expert audit IDs, page verification results, simulated-data disclaimer, and any unresolved limitations. Link the changed source, manifest, renderer, operator guide, design, and plan using absolute paths.
