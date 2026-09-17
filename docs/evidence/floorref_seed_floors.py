# -*- coding: utf-8 -*-
# 为缺楼层的院区补建医院标准楼层（幂等：已有楼层的站点跳过）
import sys, re, urllib.request
sys.stdout.reconfigure(encoding="utf-8")
from phable import open_haystack_client
URI = "http://172.18.176.1:8080/api/mytest"
def evalz(ph, expr):
    zinc = expr.replace("\\", "\\\\").replace('"', '\\"')
    body = 'ver:"3.0"\nexpr\n"' + zinc + '"'
    req = urllib.request.Request(URI + "/eval", data=body.encode(),
        headers={"Content-Type": "text/zinc", "Authorization": "BEARER authToken=" + ph._auth_token})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.read().decode()
    except urllib.error.HTTPError as e:
        return "HTTPError %s: %s" % (e.code, e.read().decode()[:200])
SITES = {
    "p:mytest:r:323941c3-0060fb1b": "东院区",
    "p:mytest:r:323941c3-8698da6e": "南院区",
    "p:mytest:r:323941c3-1a9a3819": "西院区",
    "p:mytest:r:323a22ee-12afada7": "某医院（旧 emDemoBuild 隔离）",
}
FLOORS = [
    ("地下能源中心 B1", -1, 43000, "common"),
    ("门急诊医技 1F",  1, 38000, "hospital"),
    ("门急诊医技 2F",  2, 36000, "hospital"),
    ("住院护理 6F",    6, 32000, "hospital"),
    ("手术 ICU 9F",    9, 28000, "hospital"),
    ("屋面能源设施",   18, 12000, "common"),
]
def refs(txt):
    return [l.split()[0].lstrip("@") for l in txt.splitlines() if l.startswith("@p:")]
with open_haystack_client(URI, "su", "su") as ph:
    for site, name in SITES.items():
        existing = evalz(ph, "readAll(floor and siteRef==@%s)" % site)
        n = len([l for l in existing.splitlines() if l.startswith("@p:")])
        if n > 0:
            print(name, "already has", n, "floors, skip")
            continue
        for dis, num, area, usage in FLOORS:
            r = evalz(ph, 'emAddFloor(@%s, "%s", {floorNum:%d, area:%dm², emUsageType:"%s"})' % (site, dis, num, area, usage))
            ok = not r.startswith("ver") or "err" not in r.splitlines()[1]
            print(name, dis, "OK" if ok else "FAIL: " + r[:150])
        print("---")