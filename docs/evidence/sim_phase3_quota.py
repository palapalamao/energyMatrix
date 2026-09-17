# -*- coding: utf-8 -*-
# 阶段3: 站点参数 + 定额体系
import sys, urllib.request
sys.stdout.reconfigure(encoding="utf-8")
from phable import open_haystack_client
URI = "http://172.18.176.1:8080/api/mytest"
def evalz(ph, expr):
    zinc = expr.replace("\\", "\\\\").replace('"', '\\"')
    body = "ver:\"3.0\"\nexpr\n\"" + zinc + "\""
    req = urllib.request.Request(URI + "/eval", data=body.encode(),
        headers={"Content-Type": "text/zinc", "Authorization": "BEARER authToken=" + ph._auth_token})
    try:
        return urllib.request.urlopen(req, timeout=120).read().decode()
    except urllib.error.HTTPError as e:
        return "HTTP %s: %s" % (e.code, e.read().decode()[:300])
def one(ph, expr, tag):
    out = evalz(ph, expr).strip().replace("\n", " ")
    print("%-40s %s" % (tag, out[:130]))

with open_haystack_client(URI, "su", "su") as ph:
    B = "p:mytest:r:3232ede5-bd4bda85"   # 本部院区(原某医院)
    # 1) 站点: 改名+业态+规模(大型三甲本部)
    one(ph, 'emEntityUpdate(@%s, {navName: "本部院区"})' % B, "rename site")
    one(ph, 'emEntityUpdate(@%s, {area: 180000, emBeds: 1600, emOccupancy: 5400, emCoolArea: 115000})' % B, "site scale")
    one(ph, 'emEntityUpdate(@%s, {emUsageType: "hospital"})' % B, "site usage")
    # 2) 本部定额: 删2条陈旧全楼定额
    one(ph, 'commit(diff(readById(@p:mytest:r:3232ede7-0940932b), null, {remove}))', "del 全楼电耗")
    one(ph, 'commit(diff(readById(@p:mytest:r:3232ede7-fda2ad16), null, {remove}))', "del 全楼水耗")
    # 3) 本部定额: 更新6条(改名+优秀三甲限额)
    upd = [
      ("323a191e-017ba3fa", "本部院区月度电耗上限", 1400000),
      ("323a191e-83646dba", "本部院区月度水耗上限", 32000),
      ("323a191f-d4ffc689", "本部院区月度供热上限", 60000),
      ("323a191f-a9c0a1be", "本部院区月度供冷上限", 520000),
      ("323a191e-1930eb01", "本部院区月度蒸汽上限", 260000),
      ("323a191e-7fbb8df8", "本部院区月度天然气上限", 24000),
    ]
    for rid, dis, lim in upd:
        one(ph, 'commit(diff(readById(@p:mytest:r:%s), {emLimit: %d, dis: "%s"}))' % (rid, lim, dis), "upd " + dis)
    # 4) 东院区: 水耗定额去重+调整
    one(ph, 'commit(diff(readById(@p:mytest:r:32394268-ec1c69d9), {emLimit: 19500}))', "东 water upd")
    one(ph, 'commit(diff(readById(@p:mytest:r:32394299-7fd9b8b6), null, {remove}))', "东 water dup del")
    # 5) 南/西 新增定额(优秀三甲口径, 全部 standard/historical/contract 来源)
    adds = [
      ("323941c3-8698da6e", "南院区", 570000, "standard",  "elec",  "南院区月度电耗上限"),
      ("323941c3-8698da6e", "南院区", 11500,  "historical","water", "南院区月度水耗上限"),
      ("323941c3-8698da6e", "南院区", 9000,   "contract",  "gas",   "南院区月度天然气上限"),
      ("323941c3-1a9a3819", "西院区", 760000, "standard",  "elec",  "西院区月度电耗上限"),
      ("323941c3-1a9a3819", "西院区", 15500,  "historical","water", "西院区月度水耗上限"),
      ("323941c3-1a9a3819", "西院区", 11500,  "contract",  "gas",   "西院区月度天然气上限"),
    ]
    for sref, sname, lim, src, med, dis in adds:
        expr = ('emAddQuota(@%s, %d, "%s", emThisMonthSpan(), '
                '{dis: "%s", emMedium: "%s", emOverAction: "notify", emWarnRatio: 0.9})' % (sref, lim, src, dis, med))
        one(ph, expr, "add " + dis)
