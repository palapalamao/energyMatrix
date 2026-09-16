# Energy Overview Minimal Data Design

## Goal

Make the EnergyMatrix `/overview` page in the local FIN `mytest` project show meaningful real backend data. Success means the page selects `某医院` and displays non-empty energy cards, a daily trend, electrical subitem composition, and source-quality data.

## Current Evidence

- The embedded frontend currently posts to `/api/sys/evalAll`. FIN returns `Unknown symbol 'emInfo'` and `No proj available for context`, so the page cannot load sites even when project data exists.
- The existing `某医院` site already has 31 meters, 223 points, and 28 L1 points with history. It has no ledger rows.
- A separate, incomplete `hospitalDemo-20260909` generation currently contains 3 sites, 14 floors, 17 zones, 10 organizations, 12 tariffs, 12 emission factors, and 8 meters with L1 points but no history. It is not needed for this minimal outcome and must not be extended or removed in this task.

## Selected Approach

### 1. Resolve the FIN project correctly

Update the frontend project-name resolver so an EnergyMatrix iframe can derive `mytest` from the same-origin top FIN URL `/finMobile/mytest...`. Preserve the existing route-parameter and FIN-shell-global resolution paths, and keep `sys` only as the final fallback.

After rebuilding and deploying the pod, browser network evidence must show the app using the `mytest` project rather than `/api/sys/evalAll`.

### 2. Reuse the existing hospital model

Use the exact existing site named `某医院`. Do not rename the incomplete new primary site and do not create additional meters, points, sites, diagnostic records, work orders, certificates, or close-period records.

Read the 28 existing L1 points and calculate their common usable history date range. Use only a bounded date range supported by the available history.

### 3. Build only the ledger needed by Overview

Stage one governed `emLedgerBuild(siteRef, span, "daily")` operation for the existing `某医院` site and the verified common history span. Present the exact connection, project, site, span, risk, request hash, expiry, and expected effect. Execute only after a fresh explicit confirmation.

Do not manually seed ledger rows unless the normal ledger build fails and the user separately approves a fallback design.

### 4. Verify the visible outcome

Use read-only FIN queries and the authenticated browser to require:

- the site selector chooses `某医院`;
- project requests run against `mytest`, not `sys`;
- daily ledger count is non-zero;
- the overview energy cards, electrical trend, subitem composition, and source-quality section contain data;
- no new unhandled EnergyMatrix error is visible or logged.

Stop when these conditions pass. Empty optional sections such as alerts, work orders, savings, carbon targets, or close periods do not block completion.

## Error Handling

- Pod deployment remains recoverable through the existing timestamped backup.
- Any live mutation uses FIN Expert staging and exact user confirmation.
- On `failed`, reconcile the ledger and stop; do not retry blindly.
- On `outcome_unknown`, inspect operation status and reconcile with read-only queries; never retry.
- Do not delete or clean either the old demo generation or the incomplete new generation in this task.

## Tests

- Add focused tests for project-name resolution from route parameters, FIN shell globals, and the top `/finMobile/<project>` path.
- Run frontend tests, type-check, build, Fantom build/tests, and the existing renderer tests before deployment.
- Verify the deployed pod hash, FIN service state, authenticated connection, browser request project, ledger count, and visible overview sections.

## Non-Goals

- Filling every EnergyMatrix route.
- Completing the three-site hospital demonstration dataset.
- Generating 90 days of new point history.
- Seeding diagnostics, anomalies, work orders, savings projects, quotas, certificates, or close periods.
- Removing existing synthetic or partial-generation data.
