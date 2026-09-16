# energyMatrix Pod Version Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the energyMatrix pod to `0.1.1` and display the version actually loaded by FIN at the bottom-left of the SPA.

**Architecture:** `build.fan` remains the single version source. The existing read-only `emInfo()` Axon function exposes the loaded pod version; a focused React component reuses the global Haystack client, fetches that value once per client instance, and renders non-blocking loading/error states below `LedgerStatusBar`.

**Tech Stack:** FIN 5.3/Fantom, Axon, React 18, TypeScript, haystack-react, Node test runner, Vite, Tailwind CSS.

---

## File map

- Create `fan/test/EmVersionTest.fan`: executable contract for the compiled pod version.
- Modify `build.fan`: authoritative pod version only.
- Create `ts/src/components/podVersion.ts`: pure display formatter.
- Create `ts/tests/pod-version.test.ts`: formatter behavior.
- Create `ts/tests/pod-version-component.test.ts`: source contract for client reuse, cancellation, error handling and placement.
- Create `ts/src/components/PodVersionBadge.tsx`: runtime `emInfo()` loading and display.
- Modify `ts/src/components/AppShell.tsx`: place the badge at the bottom of the sidebar.

### Task 1: Upgrade the pod version

**Files:**
- Create: `fan/test/EmVersionTest.fan`
- Modify: `build.fan`

- [ ] **Step 1: Write the failing pod-version test**

```fan
using haystack

class EmVersionTest : HaystackTest
{
  Void test_podVersion() {
    verifyEq(EnergyMatrixExt#.pod.version, Version("0.1.1"))
  }
}
```

- [ ] **Step 2: Run the test and verify RED**

Run with the FIN 5.3 PathEnv build overlay:

```powershell
$fanWork = 'C:\Users\11607\AppData\Local\Temp\codex-energyMatrix-fan-env'
New-Item -ItemType Directory -Force -Path (Join-Path $fanWork 'lib\fan') | Out-Null
$env:FAN_ENV = 'util::PathEnv'
$env:FAN_ENV_PATH = $fanWork
& 'C:\Program Files (x86)\FIN\FIN 5.3.0.2761\bin\fan.bat' build.fan fan
& 'C:\Program Files (x86)\FIN\FIN 5.3.0.2761\bin\fant.bat' energyMatrix::EmVersionTest
```

Working directory: `energy/energyMatrix`.

Expected: test failure showing actual `0.1.0`, expected `0.1.1`.

- [ ] **Step 3: Bump the authoritative version**

Change only:

```fan
version = Version("0.1.1")
```

- [ ] **Step 4: Rebuild and verify GREEN**

Run the same build and test commands.

Expected: `BUILD SUCCESS` and `EmVersionTest` passes.

- [ ] **Step 5: Commit**

Commit `build.fan` and `fan/test/EmVersionTest.fan` with one repository `Version:` trailer.

### Task 2: Add the runtime version badge

**Files:**
- Create: `ts/src/components/podVersion.ts`
- Create: `ts/tests/pod-version.test.ts`
- Create: `ts/tests/pod-version-component.test.ts`
- Create: `ts/src/components/PodVersionBadge.tsx`
- Modify: `ts/src/components/AppShell.tsx`

- [ ] **Step 1: Write the failing formatter test**

`ts/tests/pod-version.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { formatPodVersion } from "../src/components/podVersion.ts";

test("formats the loaded energyMatrix pod version", () => {
  assert.equal(formatPodVersion("0.1.1"), "energyMatrix v0.1.1");
});

test("uses an explicit unknown state when FIN info is unavailable", () => {
  assert.equal(formatPodVersion(undefined), "energyMatrix v?");
});
```

`ts/tests/pod-version-component.test.ts` must read `PodVersionBadge.tsx` and
`AppShell.tsx` as text and initially fail because it cannot find:

- `useClient()` and `emInfo(client)`;
- an effect-local `cancelled` flag and cleanup assignment;
- `title={error}` on the non-blocking badge;
- `<PodVersionBadge />` after `<LedgerStatusBar />`.

- [ ] **Step 2: Run the frontend test and verify RED**

Run:

```powershell
cd "D:\work\yiliaohouqin\haystack code\energy\energyMatrix\ts"
npm test
```

Expected: module-not-found failure for `podVersion.ts`.

- [ ] **Step 3: Implement the pure formatter**

```ts
export function formatPodVersion(version?: string): string {
  return version ? `energyMatrix v${version}` : "energyMatrix v?";
}
```

The formatter module must also expose the loading label as a stable constant:

```ts
export const POD_VERSION_LOADING_LABEL = "energyMatrix v…";
```

- [ ] **Step 4: Run only the formatter test and verify GREEN**

Run from `energy/energyMatrix/ts`:

```powershell
node --experimental-strip-types --test tests/pod-version.test.ts
```

Expected: the formatter test passes. The separate component source-contract test remains RED until Steps 5–6 are complete.

- [ ] **Step 5: Implement `PodVersionBadge`**

The component must use explicit state:

```ts
const [version, setVersion] = useState<string>();
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string>();
```

It must:

- obtain the shared client with `useClient()`;
- call existing `emInfo(client)` inside an effect keyed only by `client`;
- extract `version` with the existing safe `str()` helper;
- guard state updates with a `cancelled` flag;
- render `energyMatrix v…` while loading;
- render `formatPodVersion(version)` after completion;
- expose a request error only through `title` and keep the application usable.
- reset `loading`, `version`, and `error` when the `client` instance changes.

Use low-emphasis sidebar styling:

```tsx
className="shrink-0 border-t border-shell-line px-3 py-2 text-center text-[10px] tracking-wide text-slate-500"
```

- [ ] **Step 6: Place the badge in `AppShell`**

Import `PodVersionBadge` directly and render it immediately after `<LedgerStatusBar />` inside the sidebar.

- [ ] **Step 7: Verify frontend behavior**

Run:

```powershell
cd "D:\work\yiliaohouqin\haystack code\energy\energyMatrix\ts"
npm test
npm run typecheck
npm run build
```

Expected: all tests and typecheck pass; Vite production build succeeds. The existing chunk-size warning is acceptable.

- [ ] **Step 8: Commit**

Commit only the formatter, both tests, component and AppShell integration with one repository `Version:` trailer.

### Task 3: Full verification and artifact refresh

**Files:**
- No source files expected.
- Refresh local output: `energy/output/energyMatrix.pod`.

- [ ] **Step 1: Run full FIN build**

Working directory: `energy/energyMatrix`. Run:

```powershell
$fanWork = 'C:\Users\11607\AppData\Local\Temp\codex-energyMatrix-fan-env'
New-Item -ItemType Directory -Force -Path (Join-Path $fanWork 'lib\fan') | Out-Null
$env:FAN_ENV = 'util::PathEnv'
$env:FAN_ENV_PATH = $fanWork
& 'C:\Program Files (x86)\FIN\FIN 5.3.0.2761\bin\fan.bat' build.fan
```

Expected: Vite build plus `WritePod`, ending in `BUILD SUCCESS`.

- [ ] **Step 2: Run focused backend and frontend checks**

Run backend checks from `energy/energyMatrix`:

```powershell
& 'C:\Program Files (x86)\FIN\FIN 5.3.0.2761\bin\fant.bat' energyMatrix::EmVersionTest
& 'C:\Program Files (x86)\FIN\FIN 5.3.0.2761\bin\fant.bat' energyMatrix::EmAxonSyntaxTest
```

Run frontend checks from `energy/energyMatrix/ts`:

```powershell
npm test
npm run typecheck
npm run build
```

Expected: all pass.

- [ ] **Step 3: Copy and hash the pod artifact**

Run:

```powershell
Copy-Item -LiteralPath `
  'C:\Users\11607\AppData\Local\Temp\codex-energyMatrix-fan-env\lib\fan\energyMatrix.pod' `
  -Destination 'D:\work\yiliaohouqin\haystack code\energy\output\energyMatrix.pod' `
  -Force
Get-FileHash -Algorithm SHA256 `
  'D:\work\yiliaohouqin\haystack code\energy\output\energyMatrix.pod'
```

- [ ] **Step 4: Inspect scope**

Confirm no unrelated dirty files were staged or changed. Preserve the existing user-owned `App.tsx`, `projectName.ts`, project-name test, skills and archive changes.

- [ ] **Step 5: Runtime acceptance handoff**

After the operator installs and restarts FIN, verify:

```axon
emInfo()->version
```

Expected: `0.1.1`, and the left-bottom badge shows `energyMatrix v0.1.1`.

Also verify all specified runtime states:

- before FIN is restarted with the new pod, the badge honestly shows the still-loaded old version;
- stop or make FIN temporarily unreachable, refresh the Vite page, and confirm the application shell remains usable while the badge shows `energyMatrix v?` with an error tooltip;
- start external development with `$env:VITE_FIN_PROJECT='mytest'; npm run dev`, open `http://localhost:8083/#/overview`, and confirm the request goes to `/api/mytest/` and the badge shows the loaded FIN version.
