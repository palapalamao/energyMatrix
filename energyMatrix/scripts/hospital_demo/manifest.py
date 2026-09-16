from __future__ import annotations

from dataclasses import dataclass


GENERATION = "hospital-rich-demo-20260913"
TIMEZONE = "Asia/Shanghai"
PRIMARY_SITE_KEY = "hospital"

CURRENT_SPAN = ("2026-09-01", "2026-09-13", 13)
PRIOR_MONTH_SPAN = ("2026-08-01", "2026-08-31", 31)
LAST_YEAR_SPAN = ("2025-09-01", "2025-09-13", 13)


@dataclass(frozen=True)
class Site:
    key: str
    dis: str
    area: int
    cool_area: int
    occupancy: int
    usage_type: str
    base: int
    primary: bool = False


@dataclass(frozen=True)
class Floor:
    key: str
    site_key: str
    dis: str
    area: int
    floor_num: int
    usage_type: str


@dataclass(frozen=True)
class Zone:
    key: str
    site_key: str
    floor_key: str | None
    dis: str
    area: int
    usage_type: str


@dataclass(frozen=True)
class Tenant:
    key: str
    dis: str
    parent_key: str | None = None


@dataclass(frozen=True)
class Meter:
    key: str
    site_key: str
    dis: str
    medium: str
    role: str
    daily: int
    parent_key: str | None = None
    sub_item: str | None = None
    floor_key: str | None = None
    zone_key: str | None = None
    tenant_key: str | None = None
    source: str = "measured"


@dataclass(frozen=True)
class LoadGroup:
    key: str
    site_key: str
    dis: str
    sub_item: str
    meter_key: str
    rated_power: int
    qty: int
    floor_key: str | None = None
    zone_key: str | None = None
    tenant_key: str | None = None


@dataclass(frozen=True)
class Factor:
    key: str
    dis: str
    medium: str
    scope: str
    year: int
    factor: float
    unit: str
    coal_factor: float | None


SITES = [
    Site(PRIMARY_SITE_KEY, "某医院", 286000, 184000, 14200, "hospital", 510000, True),
    Site("east", "东院区", 132000, 84000, 6800, "hospital", 110000),
    Site("west", "西院区", 98000, 61000, 4200, "hospital", 210000),
    Site("south", "南院区", 76000, 44000, 3100, "hospital", 310000),
]

FLOORS = [
    Floor("h-b1", PRIMARY_SITE_KEY, "地下能源中心 B1", 43000, -1, "common"),
    Floor("h-f1", PRIMARY_SITE_KEY, "门急诊医技 1F", 38000, 1, "hospital"),
    Floor("h-f2", PRIMARY_SITE_KEY, "门急诊医技 2F", 36000, 2, "hospital"),
    Floor("h-f6", PRIMARY_SITE_KEY, "住院护理 6F", 32000, 6, "hospital"),
    Floor("h-f9", PRIMARY_SITE_KEY, "手术 ICU 9F", 28000, 9, "hospital"),
    Floor("h-roof", PRIMARY_SITE_KEY, "屋面能源设施", 12000, 18, "common"),
]

ZONES = [
    Zone("h-outpatient", PRIMARY_SITE_KEY, "h-f1", "门急诊公共区", 42000, "hospital"),
    Zone("h-imaging", PRIMARY_SITE_KEY, "h-f2", "影像检验中心", 28000, "hospital"),
    Zone("h-inpatient", PRIMARY_SITE_KEY, "h-f6", "住院病区", 92000, "hospital"),
    Zone("h-or", PRIMARY_SITE_KEY, "h-f9", "手术 ICU 区", 32000, "hospital"),
    Zone("h-energy", PRIMARY_SITE_KEY, "h-b1", "能源站与后勤机房", 36000, "common"),
    Zone("h-it", PRIMARY_SITE_KEY, "h-f2", "信息中心", 9000, "hospital"),
    Zone("h-kitchen", PRIMARY_SITE_KEY, "h-b1", "营养厨房与洗衣房", 16000, "common"),
    Zone("h-public", PRIMARY_SITE_KEY, None, "公共照明与室外", 31000, "common"),
]

TENANTS = [
    Tenant("hospital-ops", "医院运营中心"),
    Tenant("logistics", "后勤保障部", "hospital-ops"),
    Tenant("clinical", "临床医技部", "hospital-ops"),
    Tenant("it", "信息中心", "hospital-ops"),
    Tenant("surgery", "手术麻醉中心", "clinical"),
    Tenant("inpatient", "住院护理部", "clinical"),
]

METERS = [
    Meter("h-elec-gw", PRIMARY_SITE_KEY, "10kV 总进线", "elec", "gateway", 51600, floor_key="h-b1"),
    Meter("h-lighting-main", PRIMARY_SITE_KEY, "照明插座总表", "elec", "branch", 8200, "h-elec-gw", "a1", "h-f1", "h-public", "logistics"),
    Meter("h-lighting-emergency", PRIMARY_SITE_KEY, "走廊与应急照明", "elec", "branch", 2600, "h-lighting-main", "a2", "h-f6", "h-inpatient", "logistics"),
    Meter("h-landscape", PRIMARY_SITE_KEY, "室外景观照明", "elec", "branch", 920, "h-lighting-main", "a3", "h-roof", "h-public", "logistics"),
    Meter("h-chiller-plant", PRIMARY_SITE_KEY, "冷站群控总表", "elec", "branch", 11600, "h-elec-gw", "b1", "h-b1", "h-energy", "logistics"),
    Meter("h-hvac-terminal", PRIMARY_SITE_KEY, "空调末端风机盘管", "elec", "branch", 6700, "h-elec-gw", "b2", "h-f6", "h-inpatient", "logistics"),
    Meter("h-elevator", PRIMARY_SITE_KEY, "电梯扶梯动力", "elec", "branch", 2400, "h-elec-gw", "c1", "h-f1", "h-public", "logistics"),
    Meter("h-pumps", PRIMARY_SITE_KEY, "给排水循环泵", "elec", "branch", 3100, "h-elec-gw", "c2", "h-b1", "h-energy", "logistics"),
    Meter("h-ventilation", PRIMARY_SITE_KEY, "通风排烟系统", "elec", "branch", 2800, "h-elec-gw", "c3", "h-f9", "h-or", "logistics"),
    Meter("h-data-center", PRIMARY_SITE_KEY, "信息中心机房", "elec", "branch", 5400, "h-elec-gw", "d1", "h-f2", "h-it", "it"),
    Meter("h-kitchen-elec", PRIMARY_SITE_KEY, "营养厨房用电", "elec", "branch", 2100, "h-elec-gw", "d2", "h-b1", "h-kitchen", "logistics"),
    Meter("h-laundry", PRIMARY_SITE_KEY, "洗衣房动力", "elec", "branch", 1600, "h-elec-gw", "d3", "h-b1", "h-kitchen", "logistics"),
    Meter("h-medical-other", PRIMARY_SITE_KEY, "医疗专项其他用电", "elec", "branch", 5100, "h-elec-gw", "d6", "h-f2", "h-imaging", "clinical"),
    Meter("h-imaging-elec", PRIMARY_SITE_KEY, "影像设备专用电", "elec", "branch", 4300, "h-medical-other", "d6", "h-f2", "h-imaging", "clinical"),
    Meter("h-or-elec", PRIMARY_SITE_KEY, "手术 ICU 净化用电", "elec", "branch", 3800, "h-medical-other", "d6", "h-f9", "h-or", "surgery"),
    Meter("h-water-gw", PRIMARY_SITE_KEY, "市政进水总表", "water", "gateway", 720, floor_key="h-b1"),
    Meter("h-water-domestic", PRIMARY_SITE_KEY, "生活用水", "water", "branch", 360, "h-water-gw", floor_key="h-f6", zone_key="h-inpatient", tenant_key="inpatient"),
    Meter("h-water-medical", PRIMARY_SITE_KEY, "医技纯水补水", "water", "branch", 110, "h-water-gw", floor_key="h-f2", zone_key="h-imaging", tenant_key="clinical"),
    Meter("h-water-cooling", PRIMARY_SITE_KEY, "冷却补水", "water", "branch", 150, "h-water-gw", floor_key="h-b1", zone_key="h-energy", tenant_key="logistics"),
    Meter("h-water-kitchen", PRIMARY_SITE_KEY, "厨房洗衣用水", "water", "branch", 80, "h-water-gw", floor_key="h-b1", zone_key="h-kitchen", tenant_key="logistics"),
    Meter("h-gas-gw", PRIMARY_SITE_KEY, "天然气总表", "gas", "gateway", 920, floor_key="h-b1"),
    Meter("h-gas-kitchen", PRIMARY_SITE_KEY, "营养厨房天然气", "gas", "branch", 610, "h-gas-gw", floor_key="h-b1", zone_key="h-kitchen", tenant_key="logistics"),
    Meter("h-gas-boiler", PRIMARY_SITE_KEY, "锅炉房天然气", "gas", "branch", 260, "h-gas-gw", floor_key="h-b1", zone_key="h-energy", tenant_key="logistics"),
    Meter("h-steam-gw", PRIMARY_SITE_KEY, "外购蒸汽总表", "steam", "gateway", 13800, floor_key="h-b1"),
    Meter("h-steam-sterile", PRIMARY_SITE_KEY, "消毒供应蒸汽", "steam", "branch", 4200, "h-steam-gw", floor_key="h-f2", zone_key="h-imaging", tenant_key="clinical"),
    Meter("h-steam-laundry", PRIMARY_SITE_KEY, "洗衣房蒸汽", "steam", "branch", 6100, "h-steam-gw", floor_key="h-b1", zone_key="h-kitchen", tenant_key="logistics"),
    Meter("h-heat-gw", PRIMARY_SITE_KEY, "供热热量总表", "heat", "gateway", 9800, floor_key="h-b1"),
    Meter("h-heat-inpatient", PRIMARY_SITE_KEY, "住院供热支路", "heat", "branch", 3600, "h-heat-gw", floor_key="h-f6", zone_key="h-inpatient", tenant_key="inpatient"),
    Meter("h-heat-outpatient", PRIMARY_SITE_KEY, "门急诊供热支路", "heat", "branch", 2600, "h-heat-gw", floor_key="h-f1", zone_key="h-outpatient", tenant_key="clinical"),
    Meter("h-cool-gw", PRIMARY_SITE_KEY, "供冷冷量总表", "cool", "gateway", 16400, floor_key="h-b1"),
    Meter("h-cool-or", PRIMARY_SITE_KEY, "手术 ICU 供冷", "cool", "branch", 3600, "h-cool-gw", floor_key="h-f9", zone_key="h-or", tenant_key="surgery"),
    Meter("h-cool-ward", PRIMARY_SITE_KEY, "住院病区供冷", "cool", "branch", 5200, "h-cool-gw", floor_key="h-f6", zone_key="h-inpatient", tenant_key="inpatient"),
    Meter("h-cool-outpatient", PRIMARY_SITE_KEY, "门急诊供冷", "cool", "branch", 3800, "h-cool-gw", floor_key="h-f1", zone_key="h-outpatient", tenant_key="clinical"),
    Meter("h-elec-gap", PRIMARY_SITE_KEY, "电耗平衡缺口", "elec", "branch", 480, "h-elec-gw", "d6", source="derived"),
    Meter("h-water-gap", PRIMARY_SITE_KEY, "水耗平衡缺口", "water", "branch", 20, "h-water-gw", source="derived"),
    Meter("h-gas-gap", PRIMARY_SITE_KEY, "气耗平衡缺口", "gas", "branch", 50, "h-gas-gw", source="derived"),
    Meter("h-steam-gap", PRIMARY_SITE_KEY, "蒸汽平衡缺口", "steam", "branch", 3000, "h-steam-gw", source="derived"),
    Meter("h-heat-gap", PRIMARY_SITE_KEY, "供热平衡缺口", "heat", "branch", 3200, "h-heat-gw", source="derived"),
    Meter("h-cool-gap", PRIMARY_SITE_KEY, "供冷平衡缺口", "cool", "branch", 3000, "h-cool-gw", source="derived"),
    Meter("east-elec-gw", "east", "东院区 10kV 总进线", "elec", "gateway", 18000),
    Meter("east-lighting", "east", "东院区 照明插座", "elec", "branch", 3800, "east-elec-gw", "a1"),
    Meter("east-hvac", "east", "东院区 空调冷热源", "elec", "branch", 6200, "east-elec-gw", "b1"),
    Meter("east-medical", "east", "东院区 医技动力", "elec", "branch", 7600, "east-elec-gw", "d1"),
    Meter("east-water-gw", "east", "东院区 市政进水", "water", "gateway", 260),
    Meter("east-gas-gw", "east", "东院区 食堂天然气", "gas", "gateway", 420),
    Meter("west-elec-gw", "west", "西院区 10kV 总进线", "elec", "gateway", 15000),
    Meter("west-lighting", "west", "西院区 照明插座", "elec", "branch", 3200, "west-elec-gw", "a1"),
    Meter("west-hvac", "west", "西院区 空调冷热源", "elec", "branch", 5200, "west-elec-gw", "b1"),
    Meter("west-medical", "west", "西院区 医技动力", "elec", "branch", 6200, "west-elec-gw", "d1"),
    Meter("west-water-gw", "west", "西院区 市政进水", "water", "gateway", 220),
    Meter("west-gas-gw", "west", "西院区 食堂天然气", "gas", "gateway", 320),
    Meter("south-elec-gw", "south", "南院区 10kV 总进线", "elec", "gateway", 11000),
    Meter("south-lighting", "south", "南院区 照明插座", "elec", "branch", 2300, "south-elec-gw", "a1"),
    Meter("south-hvac", "south", "南院区 空调冷热源", "elec", "branch", 3800, "south-elec-gw", "b1"),
    Meter("south-medical", "south", "南院区 医技动力", "elec", "branch", 4650, "south-elec-gw", "d1"),
    Meter("south-water-gw", "south", "南院区 市政进水", "water", "gateway", 180),
    Meter("south-gas-gw", "south", "南院区 食堂天然气", "gas", "gateway", 210),
]

LOAD_GROUPS = [
    LoadGroup("lg-lighting-public", PRIMARY_SITE_KEY, "公共照明回路组", "a1", "h-lighting-main", 860, 420, "h-f1", "h-public", "logistics"),
    LoadGroup("lg-terminal-ward", PRIMARY_SITE_KEY, "住院空调末端组", "b2", "h-hvac-terminal", 1320, 260, "h-f6", "h-inpatient", "inpatient"),
    LoadGroup("lg-or-ventilation", PRIMARY_SITE_KEY, "手术净化风机组", "c3", "h-ventilation", 980, 58, "h-f9", "h-or", "surgery"),
    LoadGroup("lg-imaging", PRIMARY_SITE_KEY, "影像设备组", "d6", "h-imaging-elec", 2200, 16, "h-f2", "h-imaging", "clinical"),
]

KPI_CODES = ["EUI_TOTAL", "EUI_ELEC", "CARBON_INTENSITY", "WATER_PER_BED"]

QUOTAS = [
    {"key": "hospital-quota-elec", "site_key": PRIMARY_SITE_KEY, "dis": "某医院月度电耗上限", "medium": "elec", "limit": 1550000, "source": "standard"},
    {"key": "hospital-quota-water", "site_key": PRIMARY_SITE_KEY, "dis": "某医院月度水耗上限", "medium": "water", "limit": 23500, "source": "historical"},
    {"key": "hospital-quota-gas", "site_key": PRIMARY_SITE_KEY, "dis": "某医院月度天然气上限", "medium": "gas", "limit": 28500, "source": "contract"},
    {"key": "hospital-quota-steam", "site_key": PRIMARY_SITE_KEY, "dis": "某医院月度蒸汽上限", "medium": "steam", "limit": 455000, "source": "contract"},
    {"key": "hospital-quota-cool", "site_key": PRIMARY_SITE_KEY, "dis": "某医院月度供冷上限", "medium": "cool", "limit": 520000, "source": "benchmark"},
    {"key": "hospital-quota-heat", "site_key": PRIMARY_SITE_KEY, "dis": "某医院月度供热上限", "medium": "heat", "limit": 320000, "source": "benchmark"},
]

DIAG_RULES = [
    {"key": "hospital-dq", "site_key": PRIMARY_SITE_KEY, "code": "DQ-01", "dis": "主院区数据完好率低于 90%", "category": "dataQuality", "severity": "warn", "threshold": 0.9},
    {"key": "hospital-balance", "site_key": PRIMARY_SITE_KEY, "code": "BAL-01", "dis": "主院区缺口率超过 5%", "category": "balance", "severity": "critical", "threshold": 0.05},
    {"key": "hospital-hvac", "site_key": PRIMARY_SITE_KEY, "code": "HVAC-01", "dis": "冷站单位冷量电耗偏高", "category": "efficiency", "severity": "warn", "threshold": 0.72},
    {"key": "hospital-carbon", "site_key": PRIMARY_SITE_KEY, "code": "CARB-01", "dis": "碳强度偏离年度目标", "category": "carbonRisk", "severity": "info", "threshold": 0.08},
]

FACTORS = [
    Factor("factor-elec-2026", "华东电网排放因子 2026", "elec", "scope2", 2026, 0.5568, "kgCO2e/kWh", 0.1229),
    Factor("factor-elec-2025", "华东电网排放因子 2025", "elec", "scope2", 2025, 0.5703, "kgCO2e/kWh", 0.1229),
    Factor("factor-gas-2026", "天然气排放因子 2026", "gas", "scope1", 2026, 2.19, "kgCO2e/m³", 1.33),
    Factor("factor-gas-2025", "天然气排放因子 2025", "gas", "scope1", 2025, 2.16, "kgCO2e/m³", 1.33),
    Factor("factor-steam-2026", "外购蒸汽排放因子 2026", "steam", "scope2", 2026, 0.11, "kgCO2e/kg", 0.1286),
    Factor("factor-water-2026", "自来水供应排放因子 2026", "water", "scope3", 2026, 0.168, "kgCO2e/m³", None),
]

TARIFFS = [
    {"key": "tariff-elec-hospital", "site_key": PRIMARY_SITE_KEY, "dis": "某医院大工业分时电价 2026", "medium": "elec", "model": "tou", "unit": "CNY/kWh", "price": 0.82},
    {"key": "tariff-water-hospital", "site_key": PRIMARY_SITE_KEY, "dis": "某医院自来水综合水价 2026", "medium": "water", "model": "flat", "unit": "CNY/m³", "price": 4.65},
    {"key": "tariff-gas-hospital", "site_key": PRIMARY_SITE_KEY, "dis": "某医院天然气合同价 2026", "medium": "gas", "model": "flat", "unit": "CNY/m³", "price": 3.42},
]

CARBON_TARGETS = [
    {"key": "carbon-target-hospital-2030", "site_key": PRIMARY_SITE_KEY, "dis": "某医院 2030 单位面积碳排下降目标", "type": "intensity", "year": 2030, "base": 72.0, "target": 54.0},
    {"key": "carbon-target-hospital-2026", "site_key": PRIMARY_SITE_KEY, "dis": "某医院 2026 年度净碳排控制目标", "type": "absolute", "year": 2026, "base": 16800000.0, "target": 14200000.0},
]

GREEN_CERTS = [
    {"key": "green-cert-hospital-retired", "site_key": PRIMARY_SITE_KEY, "dis": "某医院 2026 已注销绿证", "type": "gec", "no": "GEC-2026-HOSP-1001", "val": 420000, "retired": True},
    {"key": "green-cert-hospital-second", "site_key": PRIMARY_SITE_KEY, "dis": "某医院 2026 第二批已注销绿证", "type": "greenPower", "no": "GP-2026-HOSP-1002", "val": 260000, "retired": True},
]

ANOMALIES = [
    {"key": "anomaly-hospital-quality", "meter_key": "h-chiller-plant", "rule_key": "hospital-dq", "dis": "冷站总表本期完好率偏低", "category": "dataQuality", "severity": "warn", "val": 0.84, "expected": 0.9, "status": "open"},
    {"key": "anomaly-hospital-balance", "meter_key": "h-elec-gw", "rule_key": "hospital-balance", "dis": "主进线与分项平衡偏差待复核", "category": "balance", "severity": "critical", "val": 0.061, "expected": 0.05, "status": "open"},
    {"key": "anomaly-hospital-water", "meter_key": "h-water-gw", "rule_key": "hospital-dq", "dis": "市政进水总表存在补录时段", "category": "dataQuality", "severity": "warn", "val": 0.87, "expected": 0.9, "status": "acked"},
    {"key": "anomaly-hospital-carbon", "meter_key": "h-gas-boiler", "rule_key": "hospital-carbon", "dis": "锅炉天然气导致碳强度偏高", "category": "carbonRisk", "severity": "info", "val": 0.092, "expected": 0.08, "status": "dispatched"},
]

WORK_ORDERS = [
    {"key": "wo-hospital-quality", "anomaly_key": "anomaly-hospital-quality", "meter_key": "h-chiller-plant", "dis": "冷站总表数据链路复核", "status": "assigned", "category": "dataQuality", "severity": "warn", "order_no": "W-RICH-001"},
    {"key": "wo-hospital-balance", "anomaly_key": "anomaly-hospital-balance", "meter_key": "h-elec-gw", "dis": "主进线分项平衡核查", "status": "inProgress", "category": "balance", "severity": "critical", "order_no": "W-RICH-002"},
    {"key": "wo-hospital-carbon", "anomaly_key": "anomaly-hospital-carbon", "meter_key": "h-gas-boiler", "dis": "锅炉燃气高碳排运行复盘", "status": "done", "category": "carbonRisk", "severity": "info", "order_no": "W-RICH-003"},
]

BASELINES = [
    {"key": "baseline-hospital-elec-2025", "site_key": PRIMARY_SITE_KEY, "dis": "某医院电耗基线 2025", "medium": "elec", "r2": 0.93, "cvrmse": 0.1, "nmbe": 0.01},
]

SAVINGS_PROJECTS = [
    {"key": "savings-hospital-chiller", "site_key": PRIMARY_SITE_KEY, "dis": "某医院冷站群控优化", "planned": 286400, "measured": 182600, "status": "monitoring", "invest": 680000},
    {"key": "savings-hospital-lighting", "site_key": PRIMARY_SITE_KEY, "dis": "某医院公共照明 LED 改造", "planned": 168000, "measured": 82100, "status": "verified", "invest": 420000},
]

BATCHES = [
    "01_model.axon",
    "02_business_params.axon",
    "03_history_ledger.axon",
    "04_operations_close.axon",
    "05_acceptance.axon",
]
