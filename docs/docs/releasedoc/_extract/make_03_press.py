# -*- coding: utf-8 -*-
"""energyMatrix V1.0 通讯稿 PDF 生成（ReportLab 路由）"""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.colors import HexColor
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, HRFlowable)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

regular = os.environ['DAIMON_CJK_FONT_REGULAR']
bold = os.environ['DAIMON_CJK_FONT_BOLD']
pdfmetrics.registerFont(TTFont('CJK', regular))
pdfmetrics.registerFont(TTFont('CJK-B', bold))
pdfmetrics.registerFontFamily('CJK', normal='CJK', bold='CJK-B', italic='CJK', boldItalic='CJK-B')

INK = HexColor('#1E2832'); TEAL = HexColor('#0B5F77'); GRAY = HexColor('#5C6B78'); LINE = HexColor('#C7D0D8')

title_s = ParagraphStyle('t', fontName='CJK-B', fontSize=19, leading=28, textColor=INK)
meta_s = ParagraphStyle('m', fontName='CJK', fontSize=9, leading=14, textColor=GRAY)
h2_s = ParagraphStyle('h2', fontName='CJK-B', fontSize=13.5, leading=20, textColor=TEAL, spaceBefore=14, spaceAfter=6)
h3_s = ParagraphStyle('h3', fontName='CJK-B', fontSize=11.5, leading=17, textColor=INK, spaceBefore=8, spaceAfter=3)
body_s = ParagraphStyle('b', fontName='CJK', fontSize=10.5, leading=18, textColor=HexColor('#333333'), firstLineIndent=21, spaceAfter=5)
li_s = ParagraphStyle('li', parent=body_s, firstLineIndent=0, leftIndent=16, bulletIndent=4)
tag_s = ParagraphStyle('tag', fontName='CJK', fontSize=9, leading=14, textColor=GRAY, spaceBefore=16)

OUT = r"D:\work\yiliaohouqin\haystack code\energy\docs\releasedoc\03_让每一度电都有账可查：energyMatrix重新定义建筑能源管理_通讯稿.pdf"
doc = SimpleDocTemplate(OUT, pagesize=A4, topMargin=2.4*cm, bottomMargin=2.2*cm, leftMargin=2.8*cm, rightMargin=2.8*cm,
                        title="让每一度电都有账可查：energyMatrix 重新定义建筑能源管理",
                        author="西门子（中国）有限公司")

story = []
story.append(Paragraph("让每一度电都有账可查：energyMatrix 重新定义建筑能源管理", title_s))
story.append(Spacer(1, 6))
story.append(Paragraph("西门子（中国）有限公司 · 2026 年 9 月 14 日 · 北京", meta_s))
story.append(Spacer(1, 4))
story.append(HRFlowable(width="100%", thickness=0.75, color=LINE))
story.append(Spacer(1, 10))

def h2(t): story.append(Paragraph(t, h2_s))
def h3(t): story.append(Paragraph(t, h3_s))
def p(t): story.append(Paragraph(t, body_s))
def li(t): story.append(Paragraph("· " + t, li_s))

p("当建筑“双碳”考核从倡议变成约束，能耗计量也从选答题变成必答题。GB 55015-2021《建筑节能与可再生能源利用通用规范》要求建筑能耗分类、分项计量与能耗监测，GB/T 51161-2016《民用建筑能耗标准》给出了分业态的约束值与引导值——标准已经把“要计什么、怎么分项、计到什么精度”写清楚了。西门子（中国）有限公司正式发布 energyMatrix 建筑能源管理系统 V1.0：一套以 Project Haystack 语义模型为底座、以能耗台账为核心、软硬件一体化的建筑能源管理解决方案，让建筑从“看得见能耗”进化到“算得清账目、核得了节能、管得住双碳”。")

h2("传统能源管理三大断点，energyMatrix 逐一接上")
h3("采不准 · 数据孤岛")
p("表计、楼控、电力监控各自为战，点位没有统一语义，同一度电在不同系统里对不上；电、水、气、冷热量跨介质没有统一账目，分析只能停留在“看曲线”。")
h3("算不清 · 台账不可信")
p("表底翻转、换表、互感器变比、倍率漏乘让读数失真；总表与分表之和的缺口无人认领；月底手工平账，改过一个数就再也说不清哪版是真的。")
h3("核不了 · 节能与碳排说不清")
p("节能改造做了，节能量没有基线核证，业主不认；排放因子随手引用，换一年口径全变；绿证买了却算不进账。管理层要的“节了多少、排了多少”，始终没有能签字的数字。")

h2("五大核心能力，把能源管理做成一门“会计学问”")
h3("1 分项计量树：不明用能显性化")
p("依据《分项能耗数据采集技术导则》A/B/C/D 四类 14 个分项建账，关口表、分项表、楼层与租户子表构成同介质有向无环图；总表与分表之和的缺口归入 emGap 缺口虚表单独呈现，缺口率超 5% 自动阻断月度关账——不明用能无处藏身。")
h3("2 能耗台账：关账不可变，修正走红冲")
p("L1 表底读数、L2 区间增量、L3 归一化指标的三层点位约定贯穿全系统；表底翻转与换表自动补偿，物理表与虚拟表同构。关账后台账不可变，任何修正一律走红冲并保留完整修正链，账单、碳账、指标全部从台账投影、可无损重算。")
h3("3 指标定额与双碳核算：因子版本化，账目永不漂移")
p("EUI 对标 GB 55015-2021 约束值与 GB/T 51161-2016 引导值，定额进度按来源（政府下达 / 集团分解 / 历史基准）逐对象跟踪。排放因子版本化管理且必填来源文件，Scope 1/2/3 分别归集，绿证仅“已注销核销”方可计入抵消；因子单位与台账单位不一致时系统直接报错，拒绝“悄悄错 1000 倍”。")
h3("4 诊断闭环：异常有去向，节能量有核证")
p("诊断规则引擎持续评估台账，异常经值班确认后派单，工单状态机前向单向流转、全程留痕；形成长期措施的工单挂接节能项目，基线模型通过 ASHRAE Guideline 14 统计验收后，节能量才可从 planned 转为 verified 对外——未核证的节能量，系统禁止宣称。")
h3("5 边缘引擎：轻量化架构，部署灵活成本优")
p("FIN Framework 内嵌于 F200 / NEXIO 边缘控制器，单台支撑 3,000 / 5,000 点，BACnet、Modbus、KNX、MQTT、M-Bus 多协议接入既有表计与楼控系统。中小项目无需额外服务器，浏览器即可完成全部组态；断网站点自治，恢复自动续传；集团场景经 FIN Network 实现多站点集中管理与跨项目 EUI 排名。")

h2("AI 赋能：会查账的能源管家")
p("依托 Haystack 语义标签底座与标准 OpenAI API 接口，第三方 AI 智能体可在授权范围内读写楼宇设备参数与 Haystack 数据库：用自然语言查询本月能耗、定额执行与碳排进度，生成能耗分析与空间使用报告；支持本地或云端大模型，数据不出项目内网。")

h2("十条铁律：不是口号，是代码")
p("energyMatrix 把数据治理写成系统纪律：一切能耗归属唯一表计、禁裸点入账；同介质计量 DAG、禁跨介质挂接；每个数值必带数据来源；L2 台账只读、禁直读点位历史（由源码扫描自动守卫）；业务参数版本化、必填来源文件；节能量默认 planned……十条铁律每一条都有对应的代码强制点与单元测试，87 个测试用例逐条钉死。交付的每个数字，都经得起审计与复算。")

h2("一个底座，四个组件")
p("energyMatrix 与 CoolMatrix（冷源群控）、heatMatrix（智慧供热）、CoolSim（数字孪生仿真）共享同一 Haystack 语义底座，构成完整的 Digital Twin System。能源账与控制系统天然打通，新建楼宇与存量改造均可适配，支持医院、商业综合体、办公园区、体育场馆等多业态场景，本地私有化或集团多站点部署任选。")
p("目前，energyMatrix V1.0 已完成 13 个业务屏的全部真数据接入，并提供一条命令即可复现的完整示范数据（商业综合体与三级医院两套），欢迎预约演示与试点交流，让绿色、可信、可核证成为每一栋建筑的能源标配。")

story.append(HRFlowable(width="100%", thickness=0.75, color=LINE))
story.append(Paragraph("#energyMatrix #建筑能源管理 #分项计量 #能耗台账 #双碳核算 #诊断闭环 #边缘引擎 #FIN Framework #Haystack", tag_s))
story.append(Spacer(1, 4))
story.append(Paragraph("注：本文所述功能以 energyMatrix V1.0 发布版本为准；文中标准条文以官方发布文本为准。", meta_s))

def deco(canvas, doc):
    canvas.saveState()
    w, h = A4
    canvas.setStrokeColor(LINE); canvas.setLineWidth(0.5)
    canvas.line(2.8*cm, 1.6*cm, w-2.8*cm, 1.6*cm)
    canvas.setFont('CJK', 8); canvas.setFillColor(GRAY)
    canvas.drawCentredString(w/2, 1.1*cm, f"energyMatrix V1.0 通讯稿 · 第 {doc.page} 页")
    canvas.restoreState()

doc.build(story, onFirstPage=deco, onLaterPages=deco)
print("OK", OUT)
