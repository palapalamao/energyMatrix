# Hospital Energy Demo Data Design

## Goal

Populate the EnergyMatrix pod in the local FIN `mytest` project with a coherent hospital-energy demonstration dataset so every product page has meaningful data. The primary site remains `某医院`. The dataset covers recent operations, prior-period comparison, prior-year comparison, accounting, quotas, carbon, diagnostics, work orders, savings projects, close periods, devices, and portfolio ranking.

The generated records are demonstration data only. Every created or derived record must carry `emSynthetic` and `emDataProvenance:"hospitalDemo-20260909"`. Tariffs, emission factors, targets, and savings values must state that they are simulated and are not valid for settlement, compliance reporting, or external publication.

## Current State

A bounded live read of connection `local-mytest` found one site, five floors, six zones, four tenants, 31 meters, 223 points, three quotas, five diagnostic rules, and no ledger entries. The empty ledger explains why the overview, trends, breakdown, carbon, and quota screens are mostly empty.

The installed pod also has a confirmed virtual-meter evaluator defect. Repeated evaluation binds `emSelf` in a scope where that symbol is already present, causing `axon::EvalErr: Symbol already bound 'emSelf'`. This must be fixed before the existing ledger APIs can derive gap meters reliably.

## Selected Approach

Use FIN Expert's governed live interface to call existing EnergyMatrix and FIN APIs in bounded batches. Do not add a persistent `emHospitalDemoBuild` Axon function. A local, reviewable data manifest and orchestration script may prepare the batches, but every read and mutation against FIN goes through the registered `local-mytest` connection and its audit and confirmation controls.

The source change is limited to the virtual-meter evaluator and stale site-selection handling. The data population itself uses existing functions such as `emAddSite`, `emAddFloor`, `emAddZone`, `emAddTenant`, `emAddMeter`, `emAddGapMeter`, history write operations, `emLedgerBuild`, KPI/quota/carbon services, diagnostics, work-order functions, and close-period services.

## Hospital Model

### Portfolio

Create three simulated sites so the portfolio page has a meaningful ranking:

- `某医院`: the fully modeled primary hospital.
- `某医院东院区`: a smaller outpatient and rehabilitation campus.
- `某医院康复院区`: a compact inpatient rehabilitation campus.

Each secondary campus uses ten physical meters and one gap meter, with enough meter history, ledger, KPI, and carbon data to participate in comparisons. The primary hospital is preferred by exact name after a reload; if it is absent, the selector falls back to the first valid site.

### Primary Hospital Spaces and Organizations

The primary hospital represents a general hospital in the hot-summer/cold-winter climate zone. Its model includes outpatient, emergency, inpatient wards, ICU, operating theatres, laboratory, imaging, central sterile supply, pharmacy, administration, logistics, kitchen, laundry, underground parking, information rooms, and the central energy plant.

Floors and zones carry realistic area, occupancy, usage type, and parent references. Department and operating organizations are represented with tenant/organization records only where the existing EnergyMatrix dimensional model requires those records for allocation and analysis; they are not treated as commercial leases.

### Metering

The primary site contains 48 physical meters, two check meters, and four virtual gap meters. The hierarchy covers:

- Electricity: utility gateway, lighting and sockets, cooling plant, HVAC terminals, elevators, pumps and fans, data rooms, medical equipment, imaging, operating theatres, sterilization, kitchen, laundry, parking, and charging facilities.
- Water: municipal inlet, domestic water, medical departments, HVAC makeup, kitchen, laundry, irrigation, and reclaimed water where supported.
- Natural gas: kitchen and domestic hot-water branches.
- Steam, heat, and cooling: gateway or main meters with department or plant branches where the existing model supports them.

Meters are assigned to spaces, departments, and standard electrical sub-items so ledger aggregation by medium, period, sub-item, space, tenant/organization, and meter all returns non-empty results. Gateway-to-branch differences remain within two to four percent to demonstrate balance checking without invalidating normal accounting.

## Historical Profiles

Write hourly cumulative readings for the most recent 90 days and for the matching month-to-date period one year earlier. Cumulative values remain monotonic and use realistic non-zero baselines.

Profiles are deterministic and explainable:

- ICU, inpatient wards, emergency, and information rooms retain a 24-hour base load.
- Outpatient, administration, and laboratories peak on weekday daytime schedules and reduce on weekends.
- Operating theatres and sterilization show scheduled daytime peaks.
- Imaging loads are intermittent but bounded.
- Kitchen profiles show breakfast, lunch, and dinner peaks.
- Laundry runs in daytime batches.
- Cooling and HVAC loads follow time-of-day and seasonal demand.
- Water, gas, steam, heat, and cooling remain consistent with the departments they serve.

Normal meters achieve 96 to 100 percent completeness. A few non-settlement branch meters contain bounded gaps or night-load anomalies so device health and diagnostic pages have something to display. Critical gateway histories remain complete enough for ledger derivation and close-period validation.

## Business Records

The populated dataset includes:

- Daily ledger entries for the recent 90-day span and the prior-year comparison span.
- Current and previous versions of simulated tariffs and emission factors for every represented medium.
- Eight quotas spanning site, department, and medium scopes.
- Seven KPI definitions and computed results, including total and electrical intensity, water intensity, per-capita use, and carbon intensity.
- Eight diagnostic rules with representative severities and categories.
- Twelve anomalies across open, acknowledged, dispatched, resolved, and false-alarm states.
- Six work orders across the supported workflow states.
- Two statistically valid demonstration baselines and five savings projects with planned, measured, and verified examples kept distinct.
- Three carbon targets plus retired and non-retired green certificates.
- A completed previous-month close-period batch and an open current period.

Derived records use existing EnergyMatrix services. Direct record creation is limited to parameter or demonstration-state types that do not have a public factory and remains explicitly tagged as synthetic.

## Execution Flow

1. Record bounded preflight counts and the active site identifiers through FIN Expert.
2. Add a regression test for repeated virtual-meter evaluation, fix the `emSelf` scope, run the Fantom suite, build the pod, back up the installed pod, deploy, and restart `FIN5`.
3. Fix the web site's stale-site fallback so an obsolete `targetRef` or cached site automatically changes to the first valid site.
4. Prepare a deterministic hospital data manifest and split live writes into bounded, restartable batches.
5. Build the primary site under the temporary name `某医院（构建中）` while retaining the current dataset. Tag every committed record with the generation provenance.
6. Write and verify history before building ledger entries.
7. Derive ledger, KPI, quota, carbon, diagnostics, anomalies, work orders, savings, and close-period data in dependency order.
8. Run read-only acceptance checks. Only after the new generation passes, remove the previous synthetic generation by its exact IDs or provenance marker and rename the new primary site to `某医院`.
9. Reload the pod and inspect every page.

Every live mutation is staged first. The staged preview must state the connection, project, expression or operation, risk, request hash, expiry, and intended effect. Design approval is not a live-operation confirmation; execution requires the unchanged single-use confirmation token for each staged batch.

## Failure Handling and Rollback

The new generation is built alongside the old one. A failed batch retains its exact generation tag and can be reconciled by bounded reads before any retry. An `outcome_unknown` result is never retried until its audit status and resulting records have been checked.

If pod deployment fails, restore the timestamped pod backup and restart `FIN5`. If data population fails, keep the previous generation active and remove only the failed generation after identifying its exact records. Never call the existing broad `emDemoClear()` as part of this workflow because it deletes every `energyMatrix` record and leaves historical samples orphaned.

## Acceptance Criteria

- Virtual and gap-meter calculations run repeatedly without `Symbol already bound 'emSelf'`.
- The primary site's physical meters have the requested recent and prior-year histories with valid units and monotonic cumulative values.
- Ledger counts are non-zero for all represented media and comparison periods.
- Overview totals reconcile with analysis and report totals within rounding tolerance.
- Current-period, previous-period, and prior-year comparisons are all available.
- Meter-tree validation has no structural errors, while intentional balance gaps stay within the configured threshold.
- Quota, KPI, carbon, diagnostic, anomaly, work-order, savings, portfolio, and close-period queries all return meaningful rows.
- Overview, realtime, work order, meter tree, analysis, quota, diagnosis, carbon, model, devices, portfolio, reports, and mobile pages render without backend errors and show non-empty content.
- All simulated records are distinguishable from real records by marker and provenance.
- Read-only FIN Expert audits and browser observations are retained for the final report.

## Non-Goals

- No frontend-only mock responses.
- No writes to control points or building equipment commands.
- No changes to real connector configuration.
- No representation of simulated prices, emissions, savings, or certificates as authoritative business data.
- No broad deletion of non-synthetic EnergyMatrix records or historical storage.
