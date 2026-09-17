# -*- coding: utf-8 -*-
# 阶段1: 需求 docx 同步 —— V0.1.3 + 7.3 节
import io, sys, copy
sys.stdout.reconfigure(encoding="utf-8")
from docx import Document
from docx.text.paragraph import Paragraph

PATH = r"D:\mygithub\energyMatrix\output\energyMatrix-semantic-model-design-spec(1).docx"
d = Document(PATH)

def set_para_text(p, text):
    runs = p.runs
    if not runs:
        p.add_run(text); return
    runs[0].text = text
    for r in runs[1:]:
        r._element.getparent().remove(r._element)

# ---- 1) 文档信息表: 版本 / Xeto 库
for tb in d.tables:
    for row in tb.rows:
        cells = row.cells
        if len(cells) >= 2 and cells[0].text.strip() == "版本":
            set_para_text(cells[1].paragraphs[0], "V0.1.3")
        if len(cells) >= 2 and cells[0].text.strip() == "Xeto 库":
            set_para_text(cells[1].paragraphs[0], "em 0.1.3")

# ---- 2) 修订记录表: 追加 V0.1.3 行
for tb in d.tables:
    hdr = [c.text.strip() for c in tb.rows[0].cells]
    if "修订内容" in hdr:
        last = tb.rows[-1]
        if "V0.1.2" in last.cells[0].text:
            new_tr = copy.deepcopy(last._element)
            last._element.addnext(new_tr)
            from docx.table import _Row
            nrow = _Row(new_tr, last._parent)
            vals = ["V0.1.3", "2026-09",
                    "新增重点负荷与电气安全监测需求（重点负荷实时监控、医用隔离电源绝缘监测、电能质量分析、电气火灾预警）；配套新增绝缘电阻/剩余电流/谐波/不平衡度点位规范与 IT 隔离电源设备类型；版本统一为 0.1.3",
                    "架构组"]
            for i, v in enumerate(vals):
                set_para_text(nrow.cells[i].paragraphs[0], v)
        break

# ---- 3) 正文: 附录 A 前插入 7.3
h2_proto = h3_proto = body_proto = None
appendix_el = None
for p in d.paragraphs:
    t = p.text.strip()
    if t.startswith("7.2") and (getattr(p.style, "name", "") or "").startswith("Heading"):
        h2_proto = p
    if t.startswith("3.3.1") and (getattr(p.style, "name", "") or "").startswith("Heading"):
        h3_proto = p
    if t.startswith("面向绿色医院评审"):
        body_proto = p
    if t.startswith("附录 A"):
        appendix_el = p._element
assert h2_proto is not None and h3_proto is not None and body_proto is not None and appendix_el is not None

BLOCKS = [
    ("H2", "7.3  重点负荷与电气安全监测（医院专项）"),
    ("B", "面向医院客户一、二类医疗场所的电气安全运行场景，对重点负荷配电回路、医用隔离电源、电能质量与电气火灾隐患进行 24 小时连续监测与预警。本需求随 V0.1.3 新增，落地为前端新屏（第 16 屏「电气安全」，hash 路由 /safety，FIN 顶栏菜单归「监测运行」组、位于「实时监测与告警」之后；屏名与分组评审时可再定夺），屏内四个子视图对应四个子需求。"),
    ("H3", "7.3.1  重点负荷实时监控"),
    ("B", "对象：手术室、ICU、急诊等一级负荷的配电回路，回路以计量树电表承载、经空间标签挂到医疗场所（按场所筛选回路）。"),
    ("B", "参数：电压（V）、电流（A）、有功功率（kW）、线缆/端子温度（°C），24 小时连续监测、分钟级采样展示；视图按场所（空间）筛选回路，卡片 + 24h 曲线，越限高亮。"),
    ("B", "模型现状：四类参数点位规范已存在（EmVolt / EmCurrent / EmElecPowerActive / EmTemp），无新增规范；缺口在数据——医院院区需为重点负荷回路补齐监测点位并生成 his 模拟数据（缺的数据建立到设备树与标签上，demo 数据随 V0.1.3 一并补齐）。"),
    ("H3", "7.3.2  医用隔离电源（IT 系统）绝缘监测"),
    ("B", "对象：二类医疗场所（手术室、ICU 等）的 IT 隔离电源系统。"),
    ("B", "参数：系统绝缘电阻（kΩ，核心量）、负荷电流（A）、变压器温度（°C）；绝缘电阻下降越限告警，告警阈值参照 IEC 60364-7-710 的 50 Ω/V 惯例（220 V IT 系统约 50 kΩ，最终值评审定夺），告警联动既有异常事件与工单闭环。"),
    ("B", "模型缺口（本需求新增，V0.1.3）：点位规范 EmInsulationResistance（绝缘电阻，kΩ）；IT 隔离电源柜作为 equip 挂到场所与供电回路，监测点挂设备下进入设备树。"),
    ("H3", "7.3.3  电能质量分析"),
    ("B", "对象：CT、MRI 等大型影像设备馈线及院区主进线。"),
    ("B", "参数：电压总谐波畸变率 THD（%）、电流 THD（%）、三相电压不平衡度（%）、电压暂降（剩余电压 % + 持续时间，事件型）；馈线 PQ 一览 + 趋势 + 暂降事件列表，支撑精密医疗设备稳定运行。"),
    ("B", "模型缺口（本需求新增，V0.1.3）：点位规范 EmThdV（电压 THD，%）、EmThdI（电流 THD，%）、EmUnbalance（三相不平衡度，%）；电压暂降以「his 点 + 异常事件」双轨记录（曲线留痕 + 事件闭环）。"),
    ("H3", "7.3.4  电气火灾预警"),
    ("B", "对象：各院区配电回路（重点覆盖一级负荷与大电流回路）。"),
    ("B", "参数：线缆温度（°C，复用既有 EmTemp）、剩余/漏电流（mA）；阈值越限产生异常事件并派发工单，提前识别电气火灾隐患。"),
    ("B", "模型缺口（本需求新增，V0.1.3）：点位规范 EmResidualCurrent（剩余电流，mA）。"),
    ("H3", "共性与边界"),
    ("B", "数据层：本域属 Layer 1 实时监测场景，经既有 hisRead 通道读取点位历史，不产生 L2 台账口径，与铁律 6（业务对象禁直读点位）不冲突；四个子需求的监测数据原则上不进入能耗台账。"),
    ("B", "告警闭环：统一复用域 11 诊断与闭环（EmDiagRuleEngine 阈值规则 → EmAnomaly 异常事件 → EmWorkOrder 工单），阈值在诊断规则中可配置；本需求不新建告警体系、不新增后端计算域（评审确认）。"),
    ("B", "安全红线：全部子需求只监测、不控制，页面不含任何写控制点操作（沿用「实时安全回路绝不依赖账务层、绝不直接写控制点」原则）。"),
    ("B", "demo 数据：mytest 医院四院区按 7.3.1–7.3.4 补齐重点负荷回路监测点位、IT 隔离电源柜与 his 模拟数据（建立到设备树），随 V0.1.3 演示环境一并交付。"),
]

cursor = appendix_el
for kind, text in BLOCKS:
    proto = {"H2": h2_proto, "H3": h3_proto, "B": body_proto}[kind]
    el = copy.deepcopy(proto._element)
    cursor.addprevious(el)
    cursor = el
    set_para_text(Paragraph(el, proto._parent), text)

d.save(PATH)
print("docx saved")

# ---- 4) 回读验证
d2 = Document(PATH)
txt = "\n".join(p.text for p in d2.paragraphs)
tbl_txt = "\n".join(c.text for tb in d2.tables for r in tb.rows for c in r.cells)
checks = ["V0.1.3", "em 0.1.3", "7.3  重点负荷与电气安全监测", "7.3.1", "7.3.2", "7.3.3", "7.3.4",
          "EmInsulationResistance", "EmResidualCurrent", "EmThdV", "EmUnbalance", "IEC 60364-7-710"]
full = txt + "\n" + tbl_txt
for c in checks:
    print(("OK  " if c in full else "MISS"), c)

