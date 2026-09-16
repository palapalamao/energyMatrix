# emDiagRun Readonly List Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent `emDiagRun` from mutating the readonly list returned by Folio while preserving severity ordering and the existing public Axon API.

**Architecture:** Keep Folio querying in `EmDiagRuleEngine.activeRules`, but move ordering into a small deterministic helper that duplicates the input container before sorting. Test the helper with an immutable list so the regression reproduces without a live Folio project.

**Tech Stack:** Fantom 1.0 / Haystack 3.1.5.1 / FIN 5.3.0.2761 / `HaystackTest`

---

## File map

- Modify `fan/diagnostic/EmDiagRuleEngine.fan`: duplicate the rule list before in-place sorting and expose a no-doc deterministic sorting helper for unit testing.
- Create `fan/test/EmDiagRuleEngineTest.fan`: reproduce the readonly-list failure and verify descending severity order without a live project.
- No changes to `lib/demo.trio`, public Axon signatures, diagnostic evaluation, or live FIN data.

### Task 1: Reproduce the readonly-list failure

**Files:**
- Create: `fan/test/EmDiagRuleEngineTest.fan`
- Test: `fan/test/EmDiagRuleEngineTest.fan`

- [ ] **Step 1: Write the failing regression test**

```fan
using haystack

class EmDiagRuleEngineTest : HaystackTest
{
  private static Dict rule(Str code, Str severity) {
    Etc.makeDict(["emRuleCode": code, "emSeverity": severity])
  }

  Void test_sortRules_acceptsReadonlyList() {
    rules := Dict[
      rule("I-01", EmSeverity.info),
      rule("C-01", EmSeverity.critical),
      rule("W-01", EmSeverity.warn),
    ].toImmutable

    sorted := EmDiagRuleEngine.sortRules(rules)

    verifyEq(sorted.map |Dict r->Str| { r["emRuleCode"].toStr }, ["C-01", "W-01", "I-01"])
    verifyEq(rules.map |Dict r->Str| { r["emRuleCode"].toStr }, ["I-01", "C-01", "W-01"])
  }
}
```

- [ ] **Step 2: Build to verify RED**

Run from `haystack code/energy/energyMatrix`:

```powershell
$env:Path = 'C:\Program Files (x86)\FIN\FIN 5.3.0.2761\bin;' + $env:Path
& '.\scripts\build.ps1' -FantomOnly
```

Expected: compilation fails because `EmDiagRuleEngine.sortRules` does not exist yet. This confirms the test targets the missing safe behavior.

- [ ] **Step 3: Commit the failing test**

Run from repository root `D:\work\yiliaohouqin`:

```powershell
git add -- 'haystack code/energy/energyMatrix/fan/test/EmDiagRuleEngineTest.fan'
git commit -m 'test(energy): reproduce readonly diagnostic rule list'
```

### Task 2: Duplicate before sorting

**Files:**
- Modify: `fan/diagnostic/EmDiagRuleEngine.fan:37-43`
- Test: `fan/test/EmDiagRuleEngineTest.fan`

- [ ] **Step 1: Implement the minimal safe sorter**

Replace `activeRules` sorting with:

```fan
Dict[] activeRules(Ref siteRef) {
  all := cx.proj.readAllList("emDiagnostic and not disabled and siteRef==" + siteRef.toCode)
  return sortRules(all)
}

@NoDoc
static Dict[] sortRules(Dict[] rules) {
  sorted := rules.dup
  sorted.sort |Dict a, Dict b -> Int| {
    return EmSeverity.rank(b) <=> EmSeverity.rank(a)
  }
  return sorted
}
```

- [ ] **Step 2: Build to verify GREEN**

```powershell
$env:Path = 'C:\Program Files (x86)\FIN\FIN 5.3.0.2761\bin;' + $env:Path
& '.\scripts\build.ps1' -FantomOnly
```

Expected: `BUILD SUCCESS` and a rebuilt `energyMatrix.pod`.

- [ ] **Step 3: Run the focused test**

```powershell
& 'C:\Program Files (x86)\FIN\FIN 5.3.0.2761\bin\fant.bat' energyMatrix::EmDiagRuleEngineTest
```

Expected: the readonly-list test passes and the source input order remains unchanged.

- [ ] **Step 4: Commit the implementation**

Run from repository root `D:\work\yiliaohouqin`:

```powershell
git add -- 'haystack code/energy/energyMatrix/fan/diagnostic/EmDiagRuleEngine.fan'
git commit -m 'fix(energy): copy diagnostic rules before sorting'
```

### Task 3: Validate the complete change

**Files:**
- Verify: `fan/diagnostic/EmDiagRuleEngine.fan`
- Verify: `fan/test/EmDiagRuleEngineTest.fan`

- [ ] **Step 1: Run the complete energyMatrix Fantom suite**

```powershell
& 'C:\Program Files (x86)\FIN\FIN 5.3.0.2761\bin\fant.bat' energyMatrix
```

Expected: all energyMatrix test classes pass with zero failures.

- [ ] **Step 2: Review the final diff**

Run from repository root `D:\work\yiliaohouqin`:

```powershell
git diff HEAD~2 -- 'haystack code/energy/energyMatrix/fan/diagnostic/EmDiagRuleEngine.fan' 'haystack code/energy/energyMatrix/fan/test/EmDiagRuleEngineTest.fan'
```

Expected: only the focused sorter change and its regression test appear.

- [ ] **Step 3: Run FIN Expert offline validation**

Submit the complete modified Fantom file through `fin_validate_artifact` with `artifact_type="connector"` and target version `5.3.0.2761`.

Expected: no new blocking issue. Treat this as offline validation, not runtime certification.

- [ ] **Step 4: Report deployment boundary**

Do not install the Pod or restart FIN automatically. Report the built Pod location and request explicit authorization before deployment. After authorized deployment, rerun `emDemoBuild("某医院", 14)` in the live project and confirm that `emDiagRun` completes.
