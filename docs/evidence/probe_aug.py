# -*- coding: utf-8 -*-
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

with open_haystack_client(URI, "su", "su") as ph:
    for name, ref, daily in [("东院区","323941c3-0060fb1b", 50400), ("本部院区","3232ede5-bd4bda85", None)]:
        out = evalz(ph, 'emLedgerTotal(@p:mytest:r:%s, toSpan(2026-08-01..2026-08-31), "elec")' % ref)
        print(name, "Aug elec total:", out.strip().replace("\n"," "))
    # 找出东院区 8/10 当天的台账条目, 看哪些表缺
    print(evalz(ph, '''
      readAll("emLedger and siteRef==@p:mytest:r:323941c3-0060fb1b and emPeriod==\\"2026-08-10\\"")
        .map(r => {meter: r->emMeterRef->dis, med: r->emMedium, val: r->val})''')[:2000])
