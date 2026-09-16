# energyMatrix Demo Build Runtime Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one `emDemoBuild(name, 14)` call generate usable raw history, non-empty ledger trends, and diagnostics on FIN 5.3 without read-only-list or repeated-formula failures.

**Architecture:** Preserve the production 15-minute meter defaults and correct only the synthetic demo cadence. Treat Folio query results as immutable at their API boundary, and evaluate virtual formulas through a lambda-scoped `emSelf`, following the existing KPI evaluator pattern. Add source-contract regression tests because the affected runtime services require a real FIN `Context`, then validate the complete pod with FIN 5.3.

**Tech Stack:** Fantom 1.0.80, FIN Framework 5.3.0.2761, Axon/Trio, Node test runner, Vite 5.

---

### Shared execution setup

Run every Task 1-4 command from the clean worktree module root:

```powershell
Set-Location 'D:\work\yiliaohouqin\haystack code\.worktrees\demo-build-runtime-fixes\haystack code\energy\energyMatrix'
$fanWork = 'C:\Users\11607\AppData\Local\Temp\codex-energyMatrix-demo-fixes'
New-Item -ItemType Directory -Force -Path (Join-Path $fanWork 'lib\fan') | Out-Null
$env:FAN_ENV = 'util::PathEnv'
$env:FAN_ENV_PATH = $fanWork
```

This environment setup is mandatory: it keeps every RED/GREEN build out of the live FIN installation. All `git add`/`git commit` commands below also run from this module root, whose repository root is three levels above.

---

### Task 1: Make Folio-result sorting immutable-safe

**Files:**
- Modify: `haystack code/energy/energyMatrix/fan/test/EmAxonSyntaxTest.fan`
- Modify: `haystack code/energy/energyMatrix/fan/diagnostic/EmDiagRuleEngine.fan:37-43`
- Modify: `haystack code/energy/energyMatrix/fan/EnergyMatrixLib.fan:434-443`

- [ ] **Step 1: Write the failing regression test**

Add `test_folioListsAreCopiedBeforeSort` to `EmAxonSyntaxTest`. Read both source files through `EmLayerIsolationTest.findSrcDir` and assert that each `readAllList` assignment which is immediately sorted ends in `.dup`:

```fan
Void test_folioListsAreCopiedBeforeSort() {
  fanSrc := EmLayerIsolationTest.findSrcDir
  verifyNotNull(fanSrc, "找不到源码树")
  diag := (fanSrc + `diagnostic/EmDiagRuleEngine.fan`).readAllStr
  lib  := (fanSrc + `EnergyMatrixLib.fan`).readAllStr
  verify(diag.contains("readAllList(\"emDiagnostic and not disabled") &&
         diag.contains("siteRef.toCode).dup"), "诊断规则排序前必须复制 Folio 只读列表")
  verify(lib.contains("readAllList(\"emClosePeriod and siteRef==\" + siteRef.toCode).dup"),
         "关账批次排序前必须复制 Folio 只读列表")
}
```

- [ ] **Step 2: Run the focused test and verify RED**

Run from `haystack code/energy/energyMatrix` with an isolated `FAN_ENV_PATH`:

```powershell
& 'C:\Program Files (x86)\FIN\FIN 5.3.0.2761\bin\fan.bat' build.fan
& 'C:\Program Files (x86)\FIN\FIN 5.3.0.2761\bin\fant.bat' energyMatrix::EmAxonSyntaxTest
```

Expected: the new test fails because both assignments currently sort Folio-owned lists directly.

- [ ] **Step 3: Implement the minimal immutable-boundary fix**

Change only the two assignments:

```fan
all := cx.proj.readAllList("emDiagnostic and not disabled and siteRef==" + siteRef.toCode).dup
```

```fan
recs := cx.proj.readAllList("emClosePeriod and siteRef==" + siteRef.toCode).dup
```

- [ ] **Step 4: Rebuild and verify GREEN**

Run the same focused build/test command. Expected: `EmAxonSyntaxTest` passes.

- [ ] **Step 5: Commit**

```powershell
git add -- 'fan/test/EmAxonSyntaxTest.fan' 'fan/diagnostic/EmDiagRuleEngine.fan' 'fan/EnergyMatrixLib.fan'
git commit -m "fix(energy): copy Folio lists before sorting" -m "Version: v0.6.44"
```

### Task 2: Align synthetic history cadence and daily boundaries

**Files:**
- Modify: `haystack code/energy/energyMatrix/fan/test/EmAxonSyntaxTest.fan`
- Modify: `haystack code/energy/energyMatrix/lib/demo.trio:391-405`

- [ ] **Step 1: Extend the demo completeness test for cadence and baseline**

In `test_demoBuildCompletenessContract`, load the `emDemoHis` source and require:

```fan
verify(his.contains("hisCollectInterval: 1hr"), "Demo hourly history must declare a one-hour cadence")
verify(his.contains("baseline: [{ts: startDt, val: 100000}]"), "Demo history must include its midnight baseline")
verify(his.contains("baseline.addAll(fullDays).addAll(partial)"), "Baseline must precede hourly samples")
```

- [ ] **Step 2: Rebuild and verify RED**

Run `fant energyMatrix::EmAxonSyntaxTest`. Expected: failure because the current code retains the template's 15-minute cadence and starts at 01:00.

- [ ] **Step 3: Implement hourly demo metadata and the midnight sample**

In `emDemoHis`, update only the synthetic L1 point and compose the history list with a leading boundary:

```axon
commit(diff(pt, {hisCollectInterval: 1hr}))
baseline: [{ts: startDt, val: 100000}]
items: baseline.addAll(fullDays).addAll(partial)
```

Keep `emDemoHisDays` and the production templates unchanged.

- [ ] **Step 4: Rebuild and verify GREEN**

Run the focused test. Expected: Axon parsing and the new cadence contract pass.

- [ ] **Step 5: Commit**

```powershell
git add -- 'fan/test/EmAxonSyntaxTest.fan' 'lib/demo.trio'
git commit -m "fix(energy): align demo history cadence" -m "Version: v0.6.45"
```

### Task 3: Give virtual formulas lexical `emSelf` scope

**Files:**
- Modify: `haystack code/energy/energyMatrix/fan/test/EmAxonSyntaxTest.fan`
- Modify: `haystack code/energy/energyMatrix/fan/meter/EmVirtualMeterEval.fan:65-89`

- [ ] **Step 1: Add a failing formula-scope contract test**

Add a test that requires the KPI evaluator's established lambda pattern and rejects the persistent definition:

```fan
Void test_virtualMeterUsesLexicalSelfBinding() {
  fanSrc := EmLayerIsolationTest.findSrcDir
  verifyNotNull(fanSrc, "找不到源码树")
  src := (fanSrc + `meter/EmVirtualMeterEval.fan`).readAllStr
  verify(src.contains("cx.eval(\"(emSelf) => (\" + formula + \"))\") as Fn"))
  verify(src.contains("fn.call(cx, [selfRef])"))
  verifyFalse(src.contains("do emSelf:"), "不得向请求 AxonContext 重复定义 emSelf")
}
```

- [ ] **Step 2: Rebuild and verify RED**

Expected: failure because the current evaluator uses `do emSelf: ...`.

- [ ] **Step 3: Implement the lambda-scoped evaluator**

Build an `Fn` once per call and invoke it inside the existing span/depth guards:

```fan
fn := cx.eval("(emSelf) => (" + formula + ")") as Fn
if (fn == null) throw ArgErr("虚拟表公式不是合法表达式：$formula")
res := EmEvalScope.withSpan(span) |->Obj?| {
  return EmEvalScope.withDepth(selfRef) |->Obj?| { return fn.call(cx, [selfRef]) }
}
```

- [ ] **Step 4: Rebuild and verify GREEN**

Expected: the focused tests pass and source no longer defines a persistent Axon symbol.

- [ ] **Step 5: Commit**

```powershell
git add -- 'fan/test/EmAxonSyntaxTest.fan' 'fan/meter/EmVirtualMeterEval.fan'
git commit -m "fix(energy): scope virtual meter formulas" -m "Version: v0.6.46"
```

### Task 4: Surface ledger derivation failures from `emDemoBuild`

**Files:**
- Modify: `haystack code/energy/energyMatrix/fan/test/EmAxonSyntaxTest.fan`
- Modify: `haystack code/energy/energyMatrix/lib/demo.trio:353-378`

- [ ] **Step 1: Add a failing demo failure-contract assertion**

Extend `test_demoBuildCompletenessContract` with exact source-contract assertions. They must prove that attempted rows are split by status, that either errors or zero successful writes abort the build, that the public count reports only successful writes, and that both gates occur before diagnostics:

```fan
verify(text.contains("ledgerErrors: ledger.findAll(row => row[\"status\"] == \"error\")"),
       "Demo 必须检查台账错误行")
verify(text.contains("ledgerWritten: ledger.findAll(row => row[\"status\"] == \"written\")"),
       "Demo 必须单独统计写入成功行")
verify(text.contains("if (finalize and days > 0 and ledgerErrors.size > 0)"),
       "台账有错误时必须中止")
verify(text.contains("if (finalize and days > 0 and ledgerWritten.size == 0)"),
       "台账没有成功写入时必须中止")
verify(text.contains("ledgerEntries: ledgerWritten.size"),
       "返回值必须只统计成功写入的台账")
verifyFalse(text.contains("ledgerEntries: ledger.size"),
            "不得把尝试行数报告成成功台账数")
verify(text.index("ledgerErrors.size > 0") < text.index("diagnostics:"),
       "台账错误门必须先于诊断")
verify(text.index("ledgerWritten.size == 0") < text.index("diagnostics:"),
       "空台账门必须先于诊断")
```

The existing all-function parser test must also parse the changed `emDemoBuild` body, validating the selected Axon `throw` syntax.

- [ ] **Step 2: Rebuild and verify RED**

Expected: the contract test fails because `emDemoBuild` currently discards row statuses.

- [ ] **Step 3: Add the minimal ledger status gate**

Immediately after `emLedgerBuild`, add this exact status gate. It rejects partial/empty derivation before diagnostics, while leaving periods open:

```axon
ledger: if (finalize and days > 0) emLedgerBuild(site, emThisMonthSpan(), "daily") else []
ledgerErrors: ledger.findAll(row => row["status"] == "error")
ledgerWritten: ledger.findAll(row => row["status"] == "written")
if (finalize and days > 0 and ledgerErrors.size > 0)
  throw("Demo 台账构建失败：" + ledgerErrors.size + " 个 (表, 账期) 错误")
if (finalize and days > 0 and ledgerWritten.size == 0)
  throw("Demo 台账构建失败：没有生成任何有效台账条目")
diagnostics: if (finalize and days > 0) emDiagRun(site, emThisMonthSpan()) else []
```

Change the returned field to:

```axon
ledgerEntries: ledgerWritten.size
```

- [ ] **Step 4: Rebuild and verify GREEN**

Expected: both the source contract and complete Trio Axon syntax parsing pass.

- [ ] **Step 5: Commit**

```powershell
git add -- 'fan/test/EmAxonSyntaxTest.fan' 'lib/demo.trio'
git commit -m "fix(energy): fail incomplete demo derivation" -m "Version: v0.6.47"
```

### Task 5: Full verification and production deployment

**Files:**
- Build artifact: `C:\Users\11607\AppData\Local\Temp\codex-energyMatrix-demo-fixes\lib\fan\energyMatrix.pod`
- Production target: `C:\Program Files (x86)\FIN\FIN 5.3.0.2761\lib\fan\energyMatrix.pod`
- Backup directory: `haystack code/energy/output/backups/`

- [ ] **Step 1: Install the clean worktree's frontend dependencies**

Run `npm ci` in `haystack code/energy/energyMatrix/ts`.

- [ ] **Step 2: Run all frontend tests**

Run `npm test`. Expected: all tests pass.

- [ ] **Step 3: Build the pod into an isolated FIN environment**

Return from `ts` to the module root, set `FAN_ENV=util::PathEnv` and `FAN_ENV_PATH=C:\Users\11607\AppData\Local\Temp\codex-energyMatrix-demo-fixes`, then run FIN 5.3 `fan.bat build.fan`:

```powershell
Set-Location 'D:\work\yiliaohouqin\haystack code\.worktrees\demo-build-runtime-fixes\haystack code\energy\energyMatrix'
$env:FAN_ENV = 'util::PathEnv'
$env:FAN_ENV_PATH = 'C:\Users\11607\AppData\Local\Temp\codex-energyMatrix-demo-fixes'
& 'C:\Program Files (x86)\FIN\FIN 5.3.0.2761\bin\fan.bat' build.fan
```

Expected: Vite production build and Fantom compilation both succeed; the pod is written only to the isolated path.

- [ ] **Step 4: Run the complete Fantom test suite**

Run FIN 5.3 `fant.bat energyMatrix` with the same isolated environment. Expected: every test and verify passes.

- [ ] **Step 5: Verify repository state**

Run `git diff --check`, `git status --short`, and confirm every commit has exactly one `Version:` trailer.

- [ ] **Step 6: Deploy recoverably**

Verify the exact production target, back up its current pod, copy the tested artifact, compare SHA-256 hashes, then restart `FIN5`. If Windows ACL blocks the current process, use a narrowly scoped UAC-elevated script that performs only these operations.

- [ ] **Step 7: Verify the deployed service**

Require `FIN5` status `Running`, `/api/mytest/about` HTTP 200, the pod SPA resource HTTP 200, and the production pod hash equal to the tested artifact.

### Task 6: Manual demo reset and bounded live verification

**Files:** None.

- [ ] **Step 1: Ask the user to reset and rebuild demo data in FIN**

```axon
emDemoClear()
emDemoBuild("mytest Synthetic Demo", 14)
```

Explain that `emDemoClear` removes records but leaves orphaned history for deleted point Refs; this does not affect the newly created points.

- [ ] **Step 2: Verify the rebuilt site read-only**

After the user reports success, use only bounded Haystack `read` and 15-day `hisRead` calls to confirm:

- one intended synthetic site exists;
- every L1 point has history and none are empty;
- the first sample is at midnight and counts reflect the boundary sample;
- ledger records are non-zero;
- the EnergyMatrix trend query has rows;
- diagnostics complete without `ReadonlyErr` or `emSelf` binding errors.

- [ ] **Step 3: Hand off viewing guidance**

State that native FIN raw-history trends are available on the L1 `point`, while EnergyMatrix overview trends are ledger-derived and should now populate after a successful build.
