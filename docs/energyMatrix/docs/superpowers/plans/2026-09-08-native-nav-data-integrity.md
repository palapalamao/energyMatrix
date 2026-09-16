# energyMatrix Native Navigation Data Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make FIN 5.3 native navigation show floor-bound and site-level energyMatrix equipment/points, while producing auditable and usable synthetic demo data.

**Architecture:** Keep the custom energyMatrix tree unchanged and repair the standard Haystack ancestor chain independently. Centralize floor resolution/validation in the Fantom CRUD layer, propagate the optional ancestor through ModelEntity templates, expose it through the TypeScript editor, and provide read-only auditing plus an operator-run idempotent migration artifact.

**Tech Stack:** Fantom 1.0 / FIN 5.3 ModelEntity trio / Axon / React 18 / TypeScript / Node test runner / Vite 5.

---

### Task 1: Protect the native navigation contract

**Files:**
- Modify: `fan/test/EmAxonSyntaxTest.fan`
- Modify: `lib/demo.trio`
- Create: `scripts/mytest-native-nav-migration.axon`

- [ ] **Step 1: Write a failing source-contract test**

Add a test that reads the migration artifact and requires the literal optional path `/site/[floor]/equip/point`, preview mode, idempotence guards, Synthetic provenance, and no credentials.

- [ ] **Step 2: Run the test and verify RED**

Run: `fan build.fan` followed by `fant energyMatrix::EmAxonSyntaxTest`

Expected: FAIL because the migration artifact/path contract does not exist.

- [ ] **Step 3: Add the minimal migration artifact skeleton**

Create a non-auto-loaded Axon script with `preview := true` as the safe default. It must discover exactly one energyMatrix site by name, calculate deterministic floor mappings, list navMeta/equip/point changes, and only call `commit`/history builders when the operator switches preview off.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `fan build.fan` followed by `fant energyMatrix::EmAxonSyntaxTest`

Expected: PASS for the migration artifact contract.

- [ ] **Step 5: Commit**

Commit the test and migration skeleton with one `Version:` trailer.

### Task 2: Propagate optional floor ancestry in ModelEntity templates

**Files:**
- Modify: `res/defaultModels/EmMeterBase.trio`
- Modify: `res/defaultModels/EmVirtualMeter.trio`
- Modify: `res/defaultModels/EmGapMeter.trio`
- Modify: `res/defaultModels/EmLoad.trio`
- Modify: all meter subtype templates containing point `siteRef:Walk("equipRef>siteRef")`
- Modify: `fan/test/EmModelTest.fan`

- [ ] **Step 1: Write failing template tests**

Require each equip template to declare `floorRef:Arg("floorRef:N")`; require every point record with an equip-derived `siteRef` to also contain `floorRef:Walk("equipRef>floorRef")`; reject required/no-default floor arguments.

- [ ] **Step 2: Run and verify RED**

Run: `fan build.fan` and `fant energyMatrix::EmModelTest`

Expected: FAIL listing templates without optional floor propagation.

- [ ] **Step 3: Implement minimal template changes**

Add the optional equip `floorRef` argument and adjacent point walk tags. Do not set a default floor and do not change `submeterOf`.

- [ ] **Step 4: Run and verify GREEN**

Run: `fan build.fan` and `fant energyMatrix::EmModelTest`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit templates and tests with one `Version:` trailer.

### Task 3: Centralize floor resolution and validation

**Files:**
- Create: `fan/models/EmFloorResolver.fan`
- Modify: `fan/models/EmEntityCrud.fan`
- Modify: `fan/models/EmModelBuilder.fan`
- Create: `fan/test/EmFloorResolverTest.fan`
- Modify: `build.fan` only if a new source directory is introduced (not expected)

- [ ] **Step 1: Write failing pure resolver tests**

Test these outcomes against supplied records: explicit floor accepted; `emSpaceRef` floor derived; no inputs returns no floor; non-floor target rejected; cross-site floor rejected; explicit/derived conflict rejected; removing a floor during edit is accepted.

- [ ] **Step 2: Run and verify RED**

Run: `fan build.fan` and `fant energyMatrix::EmFloorResolverTest`

Expected: compile/test failure because `EmFloorResolver` does not exist.

- [ ] **Step 3: Implement the pure resolver and Context adapter**

The pure function receives `siteRef`, `args`, and a lookup closure; it returns an args Dict with a validated `floorRef` or unchanged args. The CRUD adapter reads references through `cx.proj.readById`. Error text must identify non-floor, cross-site, or conflict cases.

- [ ] **Step 4: Apply it to create and edit paths**

Use it in `addMeter`, `addVirtualMeter`, `addGapMeter`, and `addLoadGroup`. In `EmModelBuilder.update`, validate changes to `floorRef` and/or `emSpaceRef` for meter/load records before commit.

- [ ] **Step 5: Run and verify GREEN**

Run: `fan build.fan`, `fant energyMatrix::EmFloorResolverTest`, and `fant energyMatrix::EmModelTest`

Expected: PASS.

- [ ] **Step 6: Commit**

Commit resolver integration and tests with one `Version:` trailer.

### Task 4: Expose floor selection in the TypeScript model editor

**Files:**
- Modify: `ts/src/api/emApi.ts`
- Modify: `ts/src/pages/Model/fieldSchema.ts`
- Modify: `ts/src/pages/Model/CreateDialog.tsx`
- Create: `ts/src/pages/Model/createSpec.ts`
- Create: `ts/tests/model-floor-ref.test.ts`
- Modify: `ts/package.json`

- [ ] **Step 1: Add Node test wiring and failing tests**

Add `"test": "node --experimental-strip-types --test tests/*.test.ts"`. Test that meter/virtual/load-group create specs include a selected floor, leave it absent when blank, and that field schemas expose floorRef for meter/load.

- [ ] **Step 2: Run and verify RED**

Run: `npm test` from `ts/`.

Expected: FAIL because the reusable create-spec helper/schema entries do not exist.

- [ ] **Step 3: Implement serializable create specs and API ref typing**

Extract pure create-spec construction from the dialog. Add `floorRef` to the `changesExpr` reference lists for meter, virtual meter, and load group.

- [ ] **Step 4: Add the UI selector**

Show “所在楼层” for meter, virtual meter, and load group with the hint “不指定表示站级或跨楼层设备”. Keep gap meter floor inherited from its source meter and do not offer a conflicting selector.

- [ ] **Step 5: Run and verify GREEN**

Run: `npm test`, `npm run typecheck`, and `npm run build` from `ts/`.

Expected: PASS.

- [ ] **Step 6: Commit**

Commit frontend changes and tests with one `Version:` trailer.

### Task 5: Repair demo provenance, units, history, and finalization

**Files:**
- Modify: `lib/demo.trio`
- Modify: `lib/queries.trio` if a helper belongs in the public library
- Modify: `fan/test/EmAxonSyntaxTest.fan`
- Modify: `locale/zh.props`
- Modify: `locale/en.props`
- Modify: `README.md`

- [ ] **Step 1: Write failing source-contract tests**

Require demo args to include `emSynthetic` and `emDataProvenance:"emDemoBuild"`; require the check meter result to be stored and included in history generation; require recent completed-hour logic; require medium-aware unit on gap delta points; require a defaulted `finalize` parameter and explicit ledger/diagnostic calls guarded by it.

- [ ] **Step 2: Run and verify RED**

Run: `fan build.fan` and `fant energyMatrix::EmAxonSyntaxTest`.

Expected: FAIL on each missing contract.

- [ ] **Step 3: Implement the minimal demo changes**

Add a shared provenance Dict merged into every demo creation call, deterministic floor mappings, the saved check-meter reference, completed-hour history end, medium unit mapping, and `finalize` guarded `emLedgerBuild`/`emDiagRun`. Do not auto-close periods or fabricate completed work orders.

- [ ] **Step 4: Update locale and operator docs**

Document the third argument, provenance, native navigation path, migration preview/execution, and backup requirement.

- [ ] **Step 5: Run and verify GREEN**

Run: `fan build.fan`, `fant energyMatrix::EmAxonSyntaxTest`, and all existing Fantom test classes.

Expected: PASS.

- [ ] **Step 6: Commit**

Commit demo behavior and documentation with one `Version:` trailer.

### Task 6: Add a read-only data audit

**Files:**
- Create: `fan/audit/EmDataAudit.fan`
- Modify: `fan/EnergyMatrixLib.fan`
- Create: `fan/test/EmDataAuditTest.fan`
- Modify: `locale/zh.props`
- Modify: `locale/en.props`

- [ ] **Step 1: Write failing pure audit tests**

Use in-memory Dicts to assert stable issue codes for missing equip floor ancestry, point/equip floor mismatch, dangling equipRef, multiple/missing L1 points, missing Synthetic provenance, and missing gap units. Assert a valid mixed floor/site model has no error.

- [ ] **Step 2: Run and verify RED**

Run: `fan build.fan` and `fant energyMatrix::EmDataAuditTest`.

Expected: compile/test failure because the audit does not exist.

- [ ] **Step 3: Implement pure structural auditing**

Return Dict rows with `severity`, `code`, `recRef`, `dis`, `message`, and `suggestedAction`. Never commit or mutate records.

- [ ] **Step 4: Add the Context-backed Axon facade**

Expose `emDataAudit(siteRef)` from `EnergyMatrixLib`; read bounded site/equip/point/business records and delegate structural rules to the pure auditor. History freshness is reported from available `hisSize`/timestamps and must stay `unavailable` if actual history cannot be verified.

- [ ] **Step 5: Run and verify GREEN**

Run: `fan build.fan`, `fant energyMatrix::EmDataAuditTest`, `fant energyMatrix::EmAxonSyntaxTest`.

Expected: PASS and locale parity.

- [ ] **Step 6: Commit**

Commit audit functionality with one `Version:` trailer.

### Task 7: Finish migration artifact and full verification

**Files:**
- Modify: `scripts/mytest-native-nav-migration.axon`
- Modify: `README.md`

- [ ] **Step 1: Complete preview/apply logic**

Use stable record refs and deterministic lookup, include navMeta optional path, propagate floorRef to points only from floor-bound parents, label demo records, refresh missing/stale demo histories, and build only open demo-derived ledger/diagnostic data. Abort on ambiguous site/floor matches.

- [ ] **Step 2: Verify migration safety statically**

Confirm preview defaults true, no credential literals, no deletes, no setpoints/overrides/control calls, no closed-ledger changes, and every write filter includes both `energyMatrix` and provenance/site scope.

- [ ] **Step 3: Run full fresh verification**

Run from `energy/energyMatrix`:

```text
fan build.fan
fant energyMatrix::EmAxonSyntaxTest
fant energyMatrix::EmModelTest
fant energyMatrix::EmFloorResolverTest
fant energyMatrix::EmDataAuditTest
fant energyMatrix::EmMeterTreeTest
fant energyMatrix::EmMeterReadingTest
fant energyMatrix::EmClosePeriodTest
fant energyMatrix::EmLayerIsolationTest
```

Run from `energy/energyMatrix/ts`:

```text
npm test
npm run typecheck
npm run build
```

Run from repository root:

```text
npm run check:tracked-secrets
```

Expected: every command exits 0. If a repository-wide gate fails for pre-existing unrelated changes, record the exact failure rather than claiming success.

- [ ] **Step 4: Request FIN Expert artifact validation**

Validate the complete pod artifact as a connector/FIN extension and record evidence IDs, target-version limitations, warnings, and deployment/rollback checks.

- [ ] **Step 5: Commit final migration/runbook changes**

Commit with one `Version:` trailer, then inspect the complete branch diff and present merge/cherry-pick options.
