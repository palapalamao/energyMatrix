# -*- coding: utf-8 -*-
import sys, urllib.request
sys.stdout.reconfigure(encoding="utf-8")
from phable import open_haystack_client
URI = "http://172.18.176.1:8080/api/mytest"

def evalz(ph, expr):
    zinc = expr.replace("\\", "\\\\").replace('"', '""')
    body = "ver:\"3.0\"\nexpr\n\"" + zinc + "\""
    req = urllib.request.Request(URI + "/eval", data=body.encode(),
        headers={"Content-Type": "text/zinc", "Authorization": "BEARER authToken=" + ph._auth_token})
    try:
        return urllib.request.urlopen(req, timeout=60).read().decode()
    except urllib.error.HTTPError as e:
        return "HTTP %s: %s" % (e.code, e.read().decode()[:300])

BEDS = {
    "p:mytest:r:323941c3-8698da6e": 800,
    "p:mytest:r:323941c3-1a9a3819": 1000,
    "p:mytest:r:323941c3-0060fb1b": 1500,
    "p:mytest:r:3232ede5-bd4bda85": 1200,
}

with open_haystack_client(URI, "su", "su") as ph:
    print("=== add EUI_BED ===")
    r = evalz(ph, "emAddKpi(\"EUI_BED\", \"单位床位能耗\", \"emLedgerTotal(emSelf->id, emSpan) / emSelf->emBeds\", {unit: \"kWh/床\", emGranularity: \"monthly\", emHigherIsBetter: false, emStandardRef: \"绿色医院评审 单位床位能耗口径\", emDimension: [\"site\"]})")
    print(r[:400])
    for ref, n in BEDS.items():
        print("=== beds", n, ref, "===")
        r = evalz(ph, "emEntityUpdate(@" + ref + ", {emBeds: " + str(n) + "})")
        print(r[:200])