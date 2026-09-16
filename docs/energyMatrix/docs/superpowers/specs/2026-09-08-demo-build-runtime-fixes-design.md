# energyMatrix Demo Build Runtime Fixes

## Problem

`emDemoBuild("mytest Synthetic Demo222", 14)` creates a complete native FIN navigation tree and writes point history, but does not complete the business derivation pipeline:

1. `EmDiagRuleEngine.activeRules` sorts the immutable list returned by Folio `readAllList`, causing `sys::ReadonlyErr: List is readonly`.
2. `emDemoHis` writes hourly samples while generated L1 points declare `hisCollectInterval:15min`. `EmMeterReadingCalc` therefore classifies every one-hour interval as a data gap and produces no physical-meter consumption or ledger entries.
3. `EmVirtualMeterEval` injects `emSelf` with a `do emSelf: ...` definition into a request-scoped Axon context. The second formula evaluation sees the previous binding and fails with `Symbol already bound 'emSelf'`.

Read-only live verification on `mytest Synthetic Demo222` found 28 L1 points, all 28 historized, with 356 samples per point from 2026-08-25 01:00 through 2026-09-08 20:00. The site has zero ledger and anomaly records. Therefore raw point history exists; the empty EnergyMatrix trend is caused by an empty ledger.

## Selected Design

### Immutable Folio Results

Duplicate any Folio list before an in-place sort. Apply this to both known direct cases:

- `EmDiagRuleEngine.activeRules`
- `EnergyMatrixLib.emClosePeriods`

Sorting order and public return values remain unchanged.

### Demo History Cadence

Keep the demo's intentionally lightweight hourly history. Before writing a demo L1 point, set that point's `hisCollectInterval` to `1hr`. Add a midnight baseline sample at the beginning of the generated range so the first daily ledger period has both boundaries and does not lose its first hour.

Alternatives rejected:

- Generate 15-minute demo history: valid but creates four times as many records and adds unnecessary demo complexity.
- Relax the production gap detector: unsafe because it would hide real collection outages for normal 15-minute points.

The default production meter templates remain at 15 minutes; only synthetic demo points use one hour.

### Virtual Formula Scope

Compile the virtual-meter expression as an Axon lambda with `emSelf` as its parameter, then invoke the lambda with the current meter Ref. This follows the existing `EmKpiService` pattern and gives every evaluation a lexical binding instead of mutating the shared Axon symbol table.

### Demo Completeness Contract

`emDemoBuild(..., days, true)` must not report success when ledger derivation contains errors. It will inspect the ledger result and fail with a concise error count if any row has status `error`. With a valid demo build, the returned result must report non-zero history and ledger counts, while diagnostics may legitimately be zero if no implemented rule fires.

## Verification

Tests are added before implementation and must fail for the three identified defects:

- Folio-owned lists are copied before sorting.
- Demo history cadence is one hour and includes the initial midnight baseline.
- Virtual meter formulas use a lambda-scoped `emSelf` and can be evaluated repeatedly without symbol collision.
- The demo build checks ledger errors instead of silently continuing.

Then run the complete TypeScript and Fantom suites, build with FIN 5.3.0, deploy the resulting pod, restart `FIN5`, and verify the HTTP endpoints.

The final project reset is intentionally manual under the repository's Haystack safety policy:

```axon
emDemoClear()
emDemoBuild("mytest Synthetic Demo", 14)
```

After the user runs these commands, verification uses only bounded `read` and `hisRead`: confirm the new site, all L1 histories, non-zero ledger entries, and the absence of demo-build runtime errors.

## Non-goals

- Changing production meter sampling defaults.
- Deleting orphaned history left by `emDemoClear`.
- Automatically closing a ledger period.
- Executing control-point writes or arbitrary Axon through automation.
