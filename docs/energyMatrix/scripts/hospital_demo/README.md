# Hospital rich FIN demo data

This generator renders the approved rich hospital dataset for `local-mytest`.

- `某医院` is the canonical primary site for every energyMatrix page.
- `东院区`, `西院区`, and `南院区` remain secondary sites for Portfolio ranking.
- The primary hospital has 30-40 meters across electricity, water, gas, steam, heat, cool, and balance/gap branches.
- 5 import batches.
- History is limited to current month, prior month, and the same period last year.
- Collector/device communication health is not fabricated; generated meters remain demo/synthetic and unbound/stale unless real connectors are added separately.

Run from `energyMatrix`:

```powershell
python scripts/hospital_demo/render_batches.py
```

The generated `.axon` files default to `preview: true`. For live import, stage the exact intended Axon text through FIN Expert first, then execute only after the user confirms the unchanged staged request.
