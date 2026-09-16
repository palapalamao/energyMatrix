from __future__ import annotations

import argparse
from pathlib import Path

from manifest import (
    ANOMALIES,
    BASELINES,
    BATCHES,
    CARBON_TARGETS,
    CURRENT_SPAN,
    DIAG_RULES,
    FACTORS,
    FLOORS,
    GENERATION,
    GREEN_CERTS,
    KPI_CODES,
    LAST_YEAR_SPAN,
    LOAD_GROUPS,
    METERS,
    PRIMARY_SITE_KEY,
    PRIOR_MONTH_SPAN,
    QUOTAS,
    SAVINGS_PROJECTS,
    SITES,
    TARIFFS,
    TENANTS,
    TIMEZONE,
    WORK_ORDERS,
    ZONES,
)


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = ROOT / "output" / GENERATION


def q(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def key_expr(key: str) -> str:
    return f"emDemoKey=={q(key)}"


def var_name(prefix: str, key: str) -> str:
    return f"{prefix}_{key.replace('-', '_')}"


def marker(value: bool) -> str:
    return "marker()" if value else "removeMarker()"


def ref_arg(prefix: str, key: str | None) -> str:
    return "null" if key is None else var_name(prefix, key)


def header(batch: str, summary: str) -> list[str]:
    return [
        "// energyMatrix hospital rich demo data",
        f"// generation: {GENERATION}",
        f"// batch: {batch}",
        "// Default is preview-only. Change preview to false only after FIN Expert stages the unchanged request and the user confirms it.",
        "do",
        "  preview: true",
        f"  generation: {q(GENERATION)}",
        '  demoTags: {emSynthetic, emDataProvenance: generation}',
        f"  if (preview) return {{batch: {q(batch)}, generation: generation, preview, summary: {q(summary)}}}",
        "",
    ]


def footer() -> list[str]:
    return ["end", ""]


def render_model() -> str:
    lines = header("01_model", "4 sites, rich primary hospital model, demo collectors are disabled/stale instead of healthy")
    lines.extend(
        [
            '  demoConnOld: read(conn and emDemoKey=="conn-hospital-demo-disabled", false)',
            '  demoConn: if (demoConnOld != null) demoConnOld->id else commit(diff(null, {',
            "    conn, energyMatrix, emSynthetic, emDataProvenance: generation,",
            '    emDemoKey: "conn-hospital-demo-disabled", dis: "某医院 演示未绑定采集器",',
            '    emCommStatus: "unbound"',
            "  }, {add}))->id",
            "",
        ]
    )

    for site in SITES:
        site_var = var_name("site", site.key)
        site_key = f"site-{site.key}" if not site.primary else "site-hospital-main"
        lines.extend(
            [
                f"  {site_var}ByKey: read(energyMatrix and site and {key_expr(site_key)}, false)",
                f"  {site_var}ByDis: read(energyMatrix and site and dis=={q(site.dis)}, false)",
                f"  {site_var}: if ({site_var}ByKey != null) {site_var}ByKey->id else if ({site_var}ByDis != null) {site_var}ByDis->id else emAddSite({q(site.dis)}, {{",
                "    energyMatrix, emSynthetic, emDataProvenance: generation,",
                f"    emDemoKey: {q(site_key)}, area: {site.area}m², emCoolArea: {site.cool_area}m²,",
                f"    emOccupancy: {site.occupancy}, emUsageType: {q(site.usage_type)}, emClimateZone: {q('hotSummerColdWinter')},",
                f"    emRegion: {q('华东')}, emBaseYear: 2025, emGapThreshold: 0.05, tz: {q(TIMEZONE)}",
                "  })",
                f"  commit(diff(readById({site_var}), {{emSynthetic, emDataProvenance: generation, emDemoKey: {q(site_key)}, dis: {q(site.dis)}, navName: {q(site.dis)}}}))",
                "",
            ]
        )

    for tenant in TENANTS:
        tenant_var = var_name("tenant", tenant.key)
        parent = ref_arg("tenant", tenant.parent_key)
        lines.extend(
            [
                f"  {tenant_var}Old: read(energyMatrix and emTenant and {key_expr('tenant-' + tenant.key)}, false)",
                f"  {tenant_var}: if ({tenant_var}Old != null) {tenant_var}Old->id else emAddTenant({parent}, {q(tenant.dis)}, {{",
                f"    energyMatrix, emSynthetic, emDataProvenance: generation, emDemoKey: {q('tenant-' + tenant.key)}, emUsageType: {q('hospital')}",
                "  })",
                f"  commit(diff(readById({tenant_var}), {{emSynthetic, emDataProvenance: generation, emDemoKey: {q('tenant-' + tenant.key)}}}))",
                "",
            ]
        )

    for floor in FLOORS:
        floor_var = var_name("floor", floor.key)
        lines.extend(
            [
                f"  {floor_var}Old: read(energyMatrix and floor and {key_expr('floor-' + floor.key)}, false)",
                f"  {floor_var}: if ({floor_var}Old != null) {floor_var}Old->id else emAddFloor({var_name('site', floor.site_key)}, {q(floor.dis)}, {{",
                f"    energyMatrix, emSynthetic, emDataProvenance: generation, emDemoKey: {q('floor-' + floor.key)},",
                f"    area: {floor.area}m², floorNum: {floor.floor_num}, emUsageType: {q(floor.usage_type)}",
                "  })",
                f"  commit(diff(readById({floor_var}), {{emSynthetic, emDataProvenance: generation, emDemoKey: {q('floor-' + floor.key)}}}))",
                "",
            ]
        )

    for zone in ZONES:
        zone_var = var_name("zone", zone.key)
        args = [
            "energyMatrix",
            "emSynthetic",
            "emDataProvenance: generation",
            f"emDemoKey: {q('zone-' + zone.key)}",
            f"area: {zone.area}m²",
            f"emUsageType: {q(zone.usage_type)}",
        ]
        if zone.floor_key:
            args.append(f"floorRef: {var_name('floor', zone.floor_key)}")
        lines.extend(
            [
                f"  {zone_var}Old: read(energyMatrix and emZone and {key_expr('zone-' + zone.key)}, false)",
                f"  {zone_var}: if ({zone_var}Old != null) {zone_var}Old->id else emAddZone({var_name('site', zone.site_key)}, {q(zone.dis)}, {{",
                "    " + ", ".join(args),
                "  })",
                f"  commit(diff(readById({zone_var}), {{{', '.join(args[1:4])}}}))",
                "",
            ]
        )

    for meter in METERS:
        meter_var = var_name("meter", meter.key)
        meter_key = f"meter-{meter.key}"
        site_dis = next(site.dis for site in SITES if site.key == meter.site_key)
        model_dis = f"{site_dis} {meter.dis}"
        args = [
            "energyMatrix",
            "emSynthetic",
            "emDataProvenance: generation",
            f"emDemoKey: {q(meter_key)}",
            f"emMeterRole: {q(meter.role)}",
            f"emDataSource: {q(meter.source)}",
            "emMaxReading: 9999999",
            "emInstallDate: 2025-01-01",
        ]
        if meter.parent_key:
            args.append(f"submeterOf: {var_name('meter', meter.parent_key)}")
        if meter.sub_item:
            args.append(f"emSubItem: {q(meter.sub_item)}")
        if meter.floor_key:
            args.append(f"floorRef: {var_name('floor', meter.floor_key)}")
        if meter.zone_key:
            args.append(f"emSpaceRef: {var_name('zone', meter.zone_key)}")
        if meter.tenant_key:
            args.append(f"emTenantRef: {var_name('tenant', meter.tenant_key)}")
        if meter.role == "gateway":
            args.append("emSettlement")
        lines.extend(
            [
                f"  {meter_var}ByKey: read(energyMatrix and meter and {key_expr(meter_key)}, false)",
                f"  {meter_var}ByDis: read(energyMatrix and meter and dis=={q(model_dis)}, false)",
                f"  {meter_var}: if ({meter_var}ByKey != null) {meter_var}ByKey->id else if ({meter_var}ByDis != null) {meter_var}ByDis->id else emAddMeter({var_name('site', meter.site_key)}, {q(meter.medium)}, {q(meter.dis)}, {{",
                "    " + ", ".join(args),
                "  })",
                f"  commit(diff(readById({meter_var}), {{",
                "    " + ", ".join(args[1:]),
                "  }))",
                "",
            ]
        )

    for load in LOAD_GROUPS:
        load_var = var_name("load", load.key)
        args = [
            "energyMatrix",
            "emSynthetic",
            "emDataProvenance: generation",
            f"emDemoKey: {q('load-' + load.key)}",
            f"emSubItem: {q(load.sub_item)}",
            f"emMeterRef: {var_name('meter', load.meter_key)}",
            f"emRatedPower: {load.rated_power}kW",
            f"emQty: {load.qty}",
        ]
        if load.floor_key:
            args.append(f"floorRef: {var_name('floor', load.floor_key)}")
        if load.zone_key:
            args.append(f"emSpaceRef: {var_name('zone', load.zone_key)}")
        if load.tenant_key:
            args.append(f"emTenantRef: {var_name('tenant', load.tenant_key)}")
        lines.extend(
            [
                f"  {load_var}Old: read(energyMatrix and emLoad and {key_expr('load-' + load.key)}, false)",
                f"  {load_var}: if ({load_var}Old != null) {load_var}Old->id else emAddLoadGroup({var_name('site', load.site_key)}, {q(load.dis)}, {{",
                "    " + ", ".join(args),
                "  })",
                f"  commit(diff(readById({load_var}), {{{', '.join(args[1:4])}}}))",
                "",
            ]
        )

    lines.extend(
        [
            "  readAll(energyMatrix and point and emDataProvenance==generation).each(p => commit(diff(p, {emDemoConnRef: demoConn})))",
            "  readAll(energyMatrix and emDataProvenance==generation).each(rec => commit(diff(rec, demoTags)))",
            f"  {{batch: \"01_model\", generation: generation, sites: {len(SITES)}, floors: {len(FLOORS)}, zones: {len(ZONES)}, tenants: {len(TENANTS)}, meters: {len(METERS)}, loads: {len(LOAD_GROUPS)}}}",
        ]
    )
    lines.extend(footer())
    return "\n".join(lines)


def render_params() -> str:
    lines = header("02_business_params", "KPIs, quotas, tariffs, emission factors, carbon targets and green certificates")
    for site in SITES:
        site_key = "site-hospital-main" if site.primary else f"site-{site.key}"
        lines.append(f"  {var_name('site', site.key)}: read(energyMatrix and site and {key_expr(site_key)}, true)->id")
    lines.append(f"  qSpan: toSpan({CURRENT_SPAN[0]}..{CURRENT_SPAN[1]})")
    lines.append("")
    kpis = [
        ("EUI_TOTAL", "综合能耗强度", "emLedgerTotal(emSelf->id, emSpan) / emSelf->area", "kWh/m²"),
        ("EUI_ELEC", "单位面积电耗", "emLedgerTotal(emSelf->id, emSpan, \"elec\") / emSelf->area", "kWh/m²"),
        ("CARBON_INTENSITY", "单位面积净碳排", "emCarbonNet(emSelf->id, emSpan) / emSelf->area", "kgCO2e/m²"),
        ("WATER_PER_BED", "人均水耗", "emLedgerTotal(emSelf->id, emSpan, \"water\") / emSelf->emOccupancy", "m³/人"),
    ]
    for code, dis, formula, unit in kpis:
        kpi_var = var_name("kpi", code.lower())
        kpi_key = "kpi-" + code.lower().replace("_", "-")
        kpi_tags = (
            f"{{emSynthetic, emDataProvenance: generation, emDemoKey: {q(kpi_key)}, "
            f"dis: {q(dis)}, emKpiCode: {q(code)}, emFormula: {q(formula)}, "
            f"unit: {q(unit)}, emGranularity: \"monthly\", emHigherIsBetter: false}}"
        )
        lines.extend(
            [
                f"  {kpi_var}Old: read(emKpi and emKpiCode=={q(code)}, false)",
                f"  if ({kpi_var}Old == null) do",
                f"    {kpi_var}: emAddKpi({q(code)}, {q(dis)}, {q(formula)}, {kpi_tags})",
                f"    commit(diff(readById({kpi_var}), {kpi_tags}))",
                f"  end else commit(diff({kpi_var}Old, {kpi_tags}))",
            ]
        )
    lines.append("")

    for quota in QUOTAS:
        quota_var = var_name("quota", quota["key"])
        lines.extend(
            [
                f"  if (read(emQuota and {key_expr('quota-' + quota['key'])}, false) == null) do",
                f"    {quota_var}: emAddQuota({var_name('site', quota['site_key'])}, {quota['limit']}, {q(quota['source'])}, qSpan, {{dis: {q(quota['dis'])}, emMedium: {q(quota['medium'])}, emWarnRatio: 0.9, emOverAction: \"notify\"}})",
                f"    commit(diff(readById({quota_var}), {{emSynthetic, emDataProvenance: generation, emDemoKey: {q('quota-' + quota['key'])}}}))",
                "  end",
                "",
            ]
        )

    for tariff in TARIFFS:
        lines.extend(
            [
                f"  if (read(emTariff and {key_expr(tariff['key'])}, false) == null) commit(diff(null, {{",
                f"    energyMatrix, emTariff, emSynthetic, emDataProvenance: generation, emDemoKey: {q(tariff['key'])},",
                f"    siteRef: {var_name('site', tariff['site_key'])}, dis: {q(tariff['dis'])}, emMedium: {q(tariff['medium'])},",
                f"    emPricingModel: {q(tariff['model'])}, emEffective: toSpan(2026-01-01..2026-12-31), emUnitPrice: {tariff['price']}, emPriceUnit: {q(tariff['unit'])},",
                f"    emSourceDoc: {q('hospital-rich-demo synthetic tariff, not for settlement')}",
                "  }, {add}))",
                "",
            ]
        )

    for rule in DIAG_RULES:
        rule_var = var_name("rule", rule["key"])
        lines.extend(
            [
                f"  if (read(emDiagnostic and {key_expr('diag-' + rule['key'])}, false) == null) do",
                f"    {rule_var}: emAddDiagRule({var_name('site', rule['site_key'])}, {q(rule['code'])}, {q(rule['dis'])}, {q(rule['category'])}, {q(rule['severity'])}, {rule['threshold']})",
                f"    commit(diff(readById({rule_var}), {{emSynthetic, emDataProvenance: generation, emDemoKey: {q('diag-' + rule['key'])}}}))",
                "  end",
                "",
            ]
        )

    for factor in FACTORS:
        coal = "null" if factor.coal_factor is None else str(factor.coal_factor)
        factor_var = var_name("factor", factor.key)
        factor_tags = (
            f"{{energyMatrix, emEmissionFactor, emSynthetic, emDataProvenance: generation, emDemoKey: {q(factor.key)}, "
            f"dis: {q(factor.dis)}, emMedium: {q(factor.medium)}, emScope: {q(factor.scope)}, emRegion: \"华东\", "
            f"emYear: {factor.year}, emFactor: {factor.factor}, emFactorUnit: {q(factor.unit)}, emCoalFactor: {coal}, "
            f"emSourceDoc: {q('hospital-rich-demo synthetic factor set, not for disclosure')}}}"
        )
        lines.extend(
            [
                f"  {factor_var}Old: read(emEmissionFactor and {key_expr(factor.key)}, false)",
                f"  if ({factor_var}Old == null) commit(diff(null, {factor_tags}, {{add}})) else commit(diff({factor_var}Old, {factor_tags}))",
                "",
            ]
        )

    for target in CARBON_TARGETS:
        lines.extend(
            [
                f"  if (read(emCarbonTarget and {key_expr(target['key'])}, false) == null) commit(diff(null, {{energyMatrix, emCarbonTarget, emSynthetic, emDataProvenance: generation, emDemoKey: {q(target['key'])}, siteRef: {var_name('site', target['site_key'])}, emSubjectRef: {var_name('site', target['site_key'])}, dis: {q(target['dis'])}, emTargetType: {q(target['type'])}, emTargetYear: {target['year']}, emBaseValue: {target['base']}, emTargetValue: {target['target']}, emSourceDoc: {q('hospital-rich-demo synthetic carbon target')}}}, {{add}}))",
                "",
            ]
        )
    for cert in GREEN_CERTS:
        lines.extend(
            [
                f"  if (read(emGreenCert and {key_expr(cert['key'])}, false) == null) commit(diff(null, {{energyMatrix, emGreenCert, {('emRetired, ' if cert['retired'] else '')}emSynthetic, emDataProvenance: generation, emDemoKey: {q(cert['key'])}, siteRef: {var_name('site', cert['site_key'])}, emSubjectRef: {var_name('site', cert['site_key'])}, dis: {q(cert['dis'])}, emCertType: {q(cert['type'])}, emCertNo: {q(cert['no'])}, emVintage: 2026, val: {cert['val']}}}, {{add}}))",
                "",
            ]
        )

    lines.extend(
        [
            "  readAll(energyMatrix and emDataProvenance==generation).each(rec => commit(diff(rec, demoTags)))",
            f"  {{batch: \"02_business_params\", generation: generation, kpis: {len(KPI_CODES)}, quotas: {len(QUOTAS)}, tariffs: {len(TARIFFS)}, diagRules: {len(DIAG_RULES)}, factors: {len(FACTORS)}, carbonTargets: {len(CARBON_TARGETS)}, greenCerts: {len(GREEN_CERTS)}}}",
        ]
    )
    lines.extend(footer())
    return "\n".join(lines)


def series_calls(start: str, days: int, suffix: str, scale: float) -> list[str]:
    calls = []
    for meter in METERS:
        meter_var = var_name("meter", meter.key)
        daily = round(meter.daily * scale, 2)
        base_var = f"{meter.site_key}{suffix.title()}"
        calls.append(f"writeSeries({meter_var}, {daily}, {start}, {days}, {base_var} + {len(calls) * 1000})")
    return calls


def render_history() -> str:
    day_nums = ",".join(str(i) for i in range(0, 32))
    current_start, current_end, current_days = CURRENT_SPAN
    prior_start, prior_end, prior_days = PRIOR_MONTH_SPAN
    last_start, last_end, last_days = LAST_YEAR_SPAN
    lines = header("03_history_ledger", "writes current, prior and last-year history, then builds daily ledgers for every site")
    for site in SITES:
        lines.append(f"  {site.key}Cur: {site.base}")
        lines.append(f"  {site.key}Prior: {site.base + 40000}")
        lines.append(f"  {site.key}Ly: {site.base + 80000}")
    lines.append("")
    for meter in METERS:
        lines.append(f"  {var_name('meter', meter.key)}: read(energyMatrix and meter and {key_expr('meter-' + meter.key)}, true)->id")
    for site in SITES:
        site_key = "site-hospital-main" if site.primary else f"site-{site.key}"
        lines.append(f"  {var_name('site', site.key)}: read(energyMatrix and site and {key_expr(site_key)}, true)->id")
    lines.extend(
        [
            "",
            "  writeSeries: (meter, daily, startDate, days, base) => do",
            "    pt: read(point and emL1Point and equipRef==meter, false)",
            "    if (pt == null) return 0",
            "    commit(diff(pt, {hisCollectInterval: 1day, emSynthetic, emDataProvenance: generation}))",
            "    hisClear(pt, toSpan(startDate..(startDate + days * 1day)))",
            f"    dayNums: [{day_nums}]",
            f"    items: [{{ts: dateTime(startDate, 00:00:00, {q(TIMEZONE)}), val: base}}]",
            f"    fullItems: items.addAll(dayNums.findAll(d => d < days).map(d => {{ts: dateTime(startDate + (d + 1) * 1day, 00:00:00, {q(TIMEZONE)}), val: base + daily * (d + 1)}}))",
            "    hisWrite(fullItems.toGrid, pt)",
            "    fullItems.size",
            "  end",
            "",
        ]
    )
    calls = (
        series_calls(current_start, current_days, "CUR", 1.0)
        + series_calls(prior_start, prior_days, "PRIOR", 0.94)
        + series_calls(last_start, last_days, "LY", 1.08)
    )
    lines.append("  samples: " + ("\n    + ".join(calls)))
    ledger_calls = []
    for span_start, span_end in [(current_start, current_end), (prior_start, prior_end), (last_start, last_end)]:
        for site in SITES:
            ledger_calls.append(f"emLedgerBuild({var_name('site', site.key)}, toSpan({span_start}..{span_end}), \"daily\").size")
    lines.extend(
        [
            "",
            "  ledgerRows: " + ("\n    + ".join(ledger_calls)),
            "  readAll(energyMatrix and emLedger and emDataProvenance==generation).each(rec => commit(diff(rec, demoTags)))",
            '  {batch: "03_history_ledger", generation: generation, samples: samples, ledgerRows: ledgerRows}',
        ]
    )
    lines.extend(footer())
    return "\n".join(lines)


def render_operations() -> str:
    current_start, current_end, _ = CURRENT_SPAN
    prior_start, prior_end, _ = PRIOR_MONTH_SPAN
    lines = header("04_operations_close", "anomalies, work orders, baselines, savings projects and one completed prior-month close")
    lines.extend(
        [
            f'  site_hospital: read(energyMatrix and site and emDemoKey=="site-hospital-main", true)->id',
            f"  curSpan: toSpan({current_start}..{current_end})",
            f"  priorSpan: toSpan({prior_start}..{prior_end})",
            "",
        ]
    )
    for meter in METERS:
        if meter.site_key == PRIMARY_SITE_KEY:
            lines.append(f"  {var_name('meter', meter.key)}: read(energyMatrix and meter and {key_expr('meter-' + meter.key)}, true)->id")
    for rule in DIAG_RULES:
        lines.append(f"  {var_name('rule', rule['key'])}: read(emDiagnostic and {key_expr('diag-' + rule['key'])}, true)->id")
    lines.append("")

    for anomaly in ANOMALIES:
        anomaly_var = var_name("anomaly", anomaly["key"])
        deviation = round((anomaly["val"] - anomaly["expected"]) / anomaly["expected"], 4)
        lines.extend(
            [
                f"  {anomaly_var}Old: read(emAnomaly and {key_expr(anomaly['key'])}, false)",
                f"  {anomaly_var}: if ({anomaly_var}Old != null) {anomaly_var}Old->id else commit(diff(null, {{energyMatrix, emAnomaly, emSynthetic, emDataProvenance: generation, emDemoKey: {q(anomaly['key'])}, siteRef: site_hospital, emDiagRef: {var_name('rule', anomaly['rule_key'])}, emSubjectRef: {var_name('meter', anomaly['meter_key'])}, dis: {q(anomaly['dis'])}, emCategory: {q(anomaly['category'])}, emSeverity: {q(anomaly['severity'])}, emPeriod: \"2026-09\", span: curSpan, ts: now(), emVal: {anomaly['val']}, emExpected: {anomaly['expected']}, emDeviation: {deviation}, emAnomalyStatus: {q(anomaly['status'])}}}, {{add}}))->id",
                "",
            ]
        )

    for order in WORK_ORDERS:
        lines.extend(
            [
                f"  if (read(emWorkOrder and {key_expr(order['key'])}, false) == null) commit(diff(null, {{energyMatrix, emWorkOrder, emSynthetic, emDataProvenance: generation, emDemoKey: {q(order['key'])}, siteRef: site_hospital, emSubjectRef: {var_name('meter', order['meter_key'])}, emAnomalyRefs: [{var_name('anomaly', order['anomaly_key'])}], dis: {q(order['dis'])}, emOrderNo: {q(order['order_no'])}, emAssignee: \"能源管理员\", emDueDate: 2026-09-20, emWorkOrderStatus: {q(order['status'])}, emCategory: {q(order['category'])}, emSeverity: {q(order['severity'])}, ts: now()}}, {{add}}))",
                "",
            ]
        )

    for baseline in BASELINES:
        baseline_var = var_name("baseline", baseline["key"])
        lines.extend(
            [
                f"  {baseline_var}Old: read(emBaseline and {key_expr(baseline['key'])}, false)",
                f"  {baseline_var}: if ({baseline_var}Old != null) {baseline_var}Old->id else commit(diff(null, {{energyMatrix, emBaseline, emSynthetic, emDataProvenance: generation, emDemoKey: {q(baseline['key'])}, siteRef: site_hospital, emSubjectRef: site_hospital, dis: {q(baseline['dis'])}, emMedium: {q(baseline['medium'])}, emIpmvpOption: \"optionC\", emModelType: \"multiVarRegression\", emGranularity: \"monthly\", emBaselineSpan: toSpan(2025-01-01..2025-12-31), emIndepVars: [\"cdd\", \"hdd\", \"opHours\"], emR2: {baseline['r2']}, emCvRmse: {baseline['cvrmse']}, emNmbe: {baseline['nmbe']}, emValid: true}}, {{add}}))->id",
                "",
            ]
        )

    for project in SAVINGS_PROJECTS:
        baseline_ref = var_name("baseline", BASELINES[0]["key"])
        project_key = project["key"].replace("-", "_")
        project_var = var_name("project", project["key"])
        lines.extend(
            [
                f"  projectOld_{project_key}: read(emSavingsProject and {key_expr(project['key'])}, false)",
                f"  if (projectOld_{project_key} == null) do",
                f"    {project_var}: emAddSavingsProject({q(project['dis'])}, site_hospital, {project['planned']})",
                f"    commit(diff(readById({project_var}), {{emSynthetic, emDataProvenance: generation, emDemoKey: {q(project['key'])}, emBaselineRef: {baseline_ref}, emEcmType: \"control\", emInvest: {project['invest']}, emReportSpan: curSpan, emSavingsMeasured: {project['measured']}, emVerifyStatus: {q(project['status'])}}}))",
                "  end",
                "",
            ]
        )

    lines.extend(
        [
            '  legacySiteOld: read(site and emDemoKey=="site-hospital-legacy-emDemoBuild", false)',
            '  legacySite: if (legacySiteOld != null) legacySiteOld->id else commit(diff(null, {site, dis: "某医院（旧 emDemoBuild 隔离）", emSynthetic, emDataProvenance: "emDemoBuild-isolated-20260914", emDemoKey: "site-hospital-legacy-emDemoBuild", tz: "Asia/Shanghai"}, {add}))->id',
            '  readAll(energyMatrix and meter and siteRef==site_hospital and emDataProvenance=="emDemoBuild").each(m => commit(diff(m, {siteRef: legacySite, emLegacySiteRef: site_hospital, emIsolationReason: "isolated from canonical hospital rich demo close scope", emIsolatedAt: now()})))',
            "  emInvalidateMeterTree(site_hospital)",
            "",
            '  closeResult: emClosePeriod(site_hospital, priorSpan, "daily", null, false)',
            "  readAll(energyMatrix and emDataProvenance==generation).each(rec => commit(diff(rec, demoTags)))",
            f'  {{batch: "04_operations_close", generation: generation, anomalies: {len(ANOMALIES)}, workOrders: {len(WORK_ORDERS)}, baselines: {len(BASELINES)}, savingsProjects: {len(SAVINGS_PROJECTS)}, closeStatus: closeResult.meta->status}}',
        ]
    )
    lines.extend(footer())
    return "\n".join(lines)


def render_acceptance() -> str:
    current_start, current_end, _ = CURRENT_SPAN
    lines = header("05_acceptance", "read-only acceptance counts for every energyMatrix page")
    lines.extend(
        [
            '  site_hospital: read(energyMatrix and site and emDemoKey=="site-hospital-main", true)->id',
            f"  span: toSpan({current_start}..{current_end})",
            "  sites: readAll(energyMatrix and site).size",
            "  meters: readAll(energyMatrix and meter and siteRef==site_hospital).size",
            "  ledgers: emLedgerEntries(site_hospital, span).size",
            "  mediumAgg: emLedgerAggregate(site_hospital, span, \"medium\").size",
            "  subItemAgg: emLedgerAggregate(site_hospital, span, \"subItem\", \"elec\").size",
            "  crosstabCols: emLedgerCrosstab(site_hospital, span, \"period\", \"subItem\", \"elec\").meta->emCols",
            "  meterTree: emMeterTree(site_hospital).size",
            "  gaps: emSiteGaps(site_hospital, span).size",
            "  quotas: emQuotaProgressAll(site_hospital, span).size",
            "  kpis: emKpiDefs().size",
            "  rules: emDiagRules(site_hospital).size",
            "  anomalies: emAnomalies(site_hospital).size",
            "  workOrders: emWorkOrders(site_hospital).size",
            "  baselines: emBaselines(site_hospital).size",
            "  savings: emSavingsProjects(site_hospital).size",
            "  carbonRows: emCarbonAccount(site_hospital, span).size",
            "  carbonTargets: emCarbonTargets(site_hospital).size",
            "  greenCerts: emGreenCerts(site_hospital).size",
            "  closePeriods: emClosePeriods(site_hospital).size",
            "  devices: emMeterInventory(site_hospital, span).size",
            "  connectors: emConnectors(site_hospital).size",
            "  tariffs: emTariffs(site_hospital).size",
            "  {batch: \"05_acceptance\", generation: generation, sites: sites, meters: meters, ledgers: ledgers, mediumAgg: mediumAgg, subItemAgg: subItemAgg, crosstabCols: crosstabCols, meterTree: meterTree, gaps: gaps, quotas: quotas, kpis: kpis, rules: rules, anomalies: anomalies, workOrders: workOrders, baselines: baselines, savings: savings, carbonRows: carbonRows, carbonTargets: carbonTargets, greenCerts: greenCerts, closePeriods: closePeriods, devices: devices, connectors: connectors, tariffs: tariffs}",
        ]
    )
    lines.extend(footer())
    return "\n".join(lines)


RENDERERS = {
    BATCHES[0]: render_model,
    BATCHES[1]: render_params,
    BATCHES[2]: render_history,
    BATCHES[3]: render_operations,
    BATCHES[4]: render_acceptance,
}


def render_all(out_dir: Path = DEFAULT_OUT) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for name in BATCHES:
        path = out_dir / name
        path.write_text(RENDERERS[name](), encoding="utf-8")
        paths.append(path)
    return paths


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    for path in render_all(args.out):
        print(path)


if __name__ == "__main__":
    main()
