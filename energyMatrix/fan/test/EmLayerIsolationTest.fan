using haystack

**
** 铁律 6 的自动化守卫：**Layer 2 业务对象只读台账，禁止直接读取点位历史。**
**
** 说明书 §2.1 原文：L1 与 L2 之间唯一的数据通道是 `EmLedgerEntry`。所有 L2
** 业务对象一律读台账，禁止直接读取点位历史。这一约束保证任何账目都可以追溯
** 到具体的台账条目，而台账条目又可以追溯到具体的表计与数据来源等级。
**
** 这条铁律靠人眼 review 守不住 —— 谁都可能在算账单时"顺手"去读一下点位。
** 所以用测试扫描源码：`fan/tariff|kpi|carbon|baseline|diagnostic/` 下不允许
** 出现任何历史读取调用。
**
** ── 关于源码定位 ──────────────────────────────────────────────────────
** pod 里不含 .fan 源码，所以本测试需要能找到源码树。查找顺序：
**   1. 环境变量 `EM_SRC`（CI 里显式指定）
**   2. 当前工作目录下的 `fan/`（在扩展目录里跑 fant 时命中）
**   3. 当前工作目录下的 `extensions/energyMatrix/fan/`（在仓库根跑时命中）
** 都找不到时测试**明确失败**并给出提示，而不是悄悄通过 —— 一个静默跳过的
** 架构守卫等于没有守卫。
**
** 运行：cd extensions/energyMatrix && <fin>/bin/fant energyMatrix::EmLayerIsolationTest
**
class EmLayerIsolationTest : HaystackTest
{
  ** Layer 2 的域目录 —— 这些目录里的代码只允许经 EmLedgerQuery 取数。
  static const Str[] layer2Dirs := ["tariff", "kpi", "carbon", "baseline", "diagnostic"]

  **
  ** 禁止出现的调用。
  **
  ** `folio.his` / `hisRead` / `hisRollup` 是直读点位历史；
  ** `EmMeterReading` / `EmVirtualMeterEval` / `EmMeterConsumption` 是 Layer 1
  ** 的取数入口 —— L2 直接调它们等于绕过台账。
  **
  static const Str[] forbidden := [
    "folio.his",
    "hisRead",
    "hisRollup",
    "EmMeterReading(",
    "EmVirtualMeterEval(",
    "EmMeterConsumption(",
  ]

  ** 定位源码树；找不到返回 null。
  static File? findSrcDir() {
    fromEnv := Env.cur.vars["EM_SRC"]
    if (fromEnv != null) {
      f := File.os(fromEnv).normalize
      if (f.exists) return f
    }
    cands := [
      File.os("fan").normalize,
      File.os("extensions/energyMatrix/fan").normalize,
    ]
    for (i := 0; i < cands.size; ++i) {
      c := cands[i]
      if (c.exists && c.isDir) return c
    }
    return null
  }

  Void test_layer2_neverReadsPointHistory() {
    src := findSrcDir
    if (src == null) {
      fail("找不到源码树。请在 extensions/energyMatrix/ 下运行 fant，" +
           "或设置环境变量 EM_SRC 指向该目录的 fan/。" +
           "（这个守卫不能静默跳过 —— 静默跳过的架构约束等于没有约束。）")
      return
    }

    violations := Str[,]
    scanned := 0

    layer2Dirs.each |Str dir| {
      d := src + "${dir}/".toUri
      if (!d.exists) return
      d.list.each |File f| {
        if (f.ext != "fan") return
        scanned++
        lines := f.readAllLines
        for (i := 0; i < lines.size; ++i) {
          line := lines[i]
          // 跳过注释行 —— 文档里提到 hisRead 是正常的（实现提示就在写它）
          trimmed := line.trim
          if (trimmed.startsWith("//") || trimmed.startsWith("**")) continue
          forbidden.each |Str bad| {
            if (line.contains(bad)) {
              violations.add("$dir/$f.name:${i + 1}: $bad  →  $trimmed")
            }
          }
        }
      }
    }

    verify(scanned > 0, "没有扫描到任何 Layer 2 源文件，检查 findSrcDir 的候选路径")

    if (!violations.isEmpty) {
      fail("Layer 2 出现了直读点位的调用（违反铁律 6）。\n" +
           "业务对象只能经 EmLedgerQuery 读台账 —— 否则账目无法回溯到条目，" +
           "账单也就无法审计。\n  " + violations.join("\n  "))
    }
  }

  **
  ** 反向确认：Layer 1 的计量域**应该**读历史，否则说明扫描规则写错了目录
  ** 或者关键字失效（比如 API 改名后这个守卫就形同虚设）。
  **
  Void test_layer1_doesReadPointHistory() {
    src := findSrcDir
    if (src == null) return   // 上一个用例已经 fail 过，这里不重复噪音

    meterDir := src + `meter/`
    verify(meterDir.exists, "fan/meter/ 应该存在")

    found := false
    meterDir.list.each |File f| {
      if (f.ext != "fan") return
      if (f.readAllStr.contains("folio.his")) found = true
    }
    verify(found,
      "fan/meter/ 里没有发现 folio.his —— 要么历史读取被挪走了，" +
      "要么 forbidden 关键字已经失效，这个守卫需要跟着更新。")
  }
}
