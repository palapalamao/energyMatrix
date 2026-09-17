# -*- coding: utf-8 -*-
import sys, urllib.request
sys.stdout.reconfigure(encoding="utf-8")
from phable import open_haystack_client
URI = "http://172.18.176.1:8080/api/mytest"
def evalz(ph, expr):
    zinc = expr.replace("\\", "\\\\").replace('"', '\\"')
    body = 'ver:"3.0"\nexpr\n"' + zinc + '"'
    req = urllib.request.Request(URI + "/eval", data=body.encode(),
        headers={"Content-Type": "text/zinc", "Authorization": "BEARER authToken=" + ph._auth_token})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.read().decode()
    except urllib.error.HTTPError as e:
        return "HTTPError %s: %s" % (e.code, e.read().decode()[:400])
def refs(txt):
    return [l.split()[0].lstrip("@") for l in txt.splitlines() if l.startswith("@p:")]
def main(ph):
    site = "p:mytest:r:3232ede5-bd4bda85"
    # 清理遗留 TMP 表
    for old in refs(evalz(ph, 'readAll(meter and navName=="TMP-WITHFLOOR" or navName=="TMP-NOFLOOR")')):
        evalz(ph, 'commit(diff(readById(@%s), {remove}))' % old)
        print("cleaned leftover", old)
    floors = refs(evalz(ph, 'readAll(floor and siteRef==@%s)' % site))
    floor = floors[0]
    print("floor =", floor)
    # 1) 无楼层 -> 拒绝
    r = evalz(ph, 'emAddMeter(@%s, "elec", "TMP-NOFLOOR", {emMeterRole:"check"})' % site)
    assert "必填" in r, "no-floor should be rejected: " + r[:200]
    print("1) no-floor rejected: OK")
    # 2) 带楼层 -> 点位自动继承
    r = evalz(ph, 'emAddMeter(@%s, "elec", "TMP-WITHFLOOR", {emMeterRole:"check", floorRef:@%s})' % (site, floor))
    meter = refs(r)[0]
    pts = [l for l in evalz(ph, 'readAll(point and equipRef==@%s)' % meter).splitlines() if l.startswith("@p:")]
    ok = sum(1 for l in pts if floor in l)
    print("2) points total=%d inherited=%d" % (len(pts), ok))
    assert pts and ok == len(pts), "inheritance broken"
    # 3) 清理
    evalz(ph, 'commit(diff(readById(@%s), {remove}))' % meter)
    print("3) cleanup OK")
    print("SMOKE PASS")
with open_haystack_client(URI, "su", "su") as ph:
    main(ph)