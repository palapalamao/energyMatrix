from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from manifest import (
    ANOMALIES,
    BASELINES,
    BATCHES,
    CARBON_TARGETS,
    DIAG_RULES,
    FACTORS,
    GREEN_CERTS,
    KPI_CODES,
    METERS,
    PRIMARY_SITE_KEY,
    QUOTAS,
    SAVINGS_PROJECTS,
    SITES,
    WORK_ORDERS,
)
from render_batches import render_all


class HospitalDemoManifestTest(unittest.TestCase):
    def test_rich_primary_hospital_dataset_shape(self) -> None:
        primary = next(site for site in SITES if site.key == PRIMARY_SITE_KEY)
        self.assertEqual(primary.dis, "某医院")
        self.assertGreaterEqual(len(SITES), 4)
        self.assertGreaterEqual(len([meter for meter in METERS if meter.site_key == PRIMARY_SITE_KEY]), 30)
        self.assertLessEqual(len([meter for meter in METERS if meter.site_key == PRIMARY_SITE_KEY]), 40)
        self.assertGreaterEqual(len(KPI_CODES), 4)
        self.assertGreaterEqual(len(QUOTAS), 6)
        self.assertGreaterEqual(len(DIAG_RULES), 4)
        self.assertEqual(len(FACTORS), 6)
        self.assertGreaterEqual(len(ANOMALIES), 4)
        self.assertGreaterEqual(len(WORK_ORDERS), 3)
        self.assertGreaterEqual(len(BASELINES), 1)
        self.assertGreaterEqual(len(SAVINGS_PROJECTS), 2)
        self.assertGreaterEqual(len(CARBON_TARGETS), 2)
        self.assertGreaterEqual(len(GREEN_CERTS), 2)
        self.assertEqual(len(BATCHES), 5)

    def test_diagnostic_categories_match_fin_contract(self) -> None:
        allowed = {
            "dataQuality",
            "balance",
            "overConsume",
            "efficiency",
            "scheduleWaste",
            "demandRisk",
            "quotaRisk",
            "carbonRisk",
        }

        for rule in DIAG_RULES:
            self.assertIn(rule["category"], allowed)
        for anomaly in ANOMALIES:
            self.assertIn(anomaly["category"], allowed)
        for order in WORK_ORDERS:
            self.assertIn(order["category"], allowed)

    def test_every_site_has_portfolio_meter_coverage(self) -> None:
        site_keys = {site.key for site in SITES}
        for key in site_keys:
            site_meters = [meter for meter in METERS if meter.site_key == key]
            self.assertGreaterEqual(len(site_meters), 5, key)
            self.assertTrue(any(meter.medium == "elec" and meter.role == "gateway" for meter in site_meters), key)

    def test_primary_site_gap_ratios_can_close_prior_month(self) -> None:
        primary_meters = [meter for meter in METERS if meter.site_key == PRIMARY_SITE_KEY]
        by_key = {meter.key: meter for meter in primary_meters}
        by_medium: dict[str, list] = {}
        for meter in primary_meters:
            by_medium.setdefault(meter.medium, []).append(meter)

        for medium, meters in by_medium.items():
            roots = [meter for meter in meters if meter.role == "gateway"]
            self.assertEqual(len(roots), 1, medium)
            root = roots[0]
            child_sum = sum(
                meter.daily
                for meter in meters
                if meter.parent_key == root.key and meter.role != "check"
            )
            ratio = abs(root.daily - child_sum) / root.daily
            self.assertLessEqual(ratio, 0.05, f"{medium} gap ratio {ratio:.2%}")

    def test_rendered_batches_are_preview_first_and_bounded(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            paths = render_all(Path(tmp))
            self.assertEqual([path.name for path in paths], BATCHES)
            joined = "\n".join(path.read_text(encoding="utf-8") for path in paths)

        for forbidden in ["pointWrite", "invokeAction", "password", "connStatus", "curStatus: \"ok\"", "p: emAddSavingsProject"]:
            self.assertNotIn(forbidden, joined)
        for required in [
            "preview: true",
            "hospital-rich-demo-20260913",
            "site-hospital-main",
            "hisWrite",
            "emLedgerBuild",
            "emClosePeriod",
            "emSynthetic",
            "emDataProvenance",
        ]:
            self.assertIn(required, joined)

    def test_rendered_batches_cover_all_page_contracts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            joined = "\n".join(path.read_text(encoding="utf-8") for path in render_all(Path(tmp)))

        for required in [
            "emAddQuota(site_hospital",
            "emAddDiagRule(site_hospital",
            "emCarbonTarget",
            "emGreenCert",
            "emBaseline",
            "emSavingsProject",
            "emAnomaly",
            "emWorkOrder",
            "emTariff",
            "emClosePeriod(site_hospital",
            "site-hospital-legacy-emDemoBuild",
            "emLegacySiteRef",
        ]:
            self.assertIn(required, joined)


if __name__ == "__main__":
    unittest.main()
