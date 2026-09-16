using axon
using haystack

**
** 把 pod 里每个 trio Axon 函数的 `src` 过一遍 Axon 解析器。
**
** 为什么需要这个：`lib/*.trio` 里的 Axon 是**资源文件**，不参与 Fantom 编译。
** 语法写错了，`fan build.fan` 一样成功，直到有人在页面上点了那个按钮才炸。
** 这个测试把语法错误挡在构建阶段。
**
** 它查不出运行期问题（函数名拼错、参数类型不对、库没启用），那些只能靠
** 真实项目跑一遍 —— 见 README「验证」一节。
**
** 运行：<fin>/bin/fant energyMatrix::EmAxonSyntaxTest
**
class EmAxonSyntaxTest : HaystackTest
{
  ** trio 资源在 pod 内的目录。
  private static const Str libDir := "/lib/"

  Void test_allAxonFuncsParse() {
    files := trioFiles
    verify(files.size >= 3, "至少应有 defs / menu / queries 三个 trio，实际 " + files.size)

    total := 0
    failures := Str[,]

    files.each |File f| {
      TrioReader(f.in).readAllDicts.each |Dict r| {
        src := r["src"] as Str
        if (src == null) return               // 非函数记录（def / 菜单项之外的）
        name := (r["name"] as Str) ?: "<匿名>"
        total++
        try {
          Parser(Loc(f.name, 1), src.in).parseTop(name, Etc.emptyDict)
        } catch (Err e) {
          failures.add("$f.name :: $name  →  " + e.msg)
        }
      }
    }

    verify(total > 0, "没有扫描到任何 Axon 函数，检查 libDir 是否还对")
    verify(failures.isEmpty, "Axon 语法错误：\n  " + failures.join("\n  "))
  }

  **
  ** Axon 的区间 `(a..b)` **不是可迭代集合**。
  **
  ** 对它 `.map` / `.each` / `.toList`，回调拿到的是 `ObjRange` 本身而不是元素，
  ** 运行时报 `Unsupported operation haystack::ObjRange mul haystack::Number`
  ** 这种与真实原因毫不相干的错。语法检查看不出来 —— 它语法完全合法 ——
  ** 所以只能靠模式匹配挡住。
  **
  ** 要循环就用字面量列表（小时）或递归（天数），见 `lib/demo.trio` 的
  ** `emDemoHisDays`。区间本身当**值**用（`toSpan(a..b)`）是没问题的。
  **
  Void test_noRangeIteration() {
    bad := Str[,]
    trioFiles.each |File f| {
      lines := f.readAllLines
      for (i := 0; i < lines.size; ++i) {
        line := lines[i]
        if (line.trim.startsWith("//")) continue    // 注释里提这件事是允许的
        if (!line.contains("..")) continue
        if (line.contains(".map(") || line.contains(".each(") || line.contains(".toList")) {
          bad.add("$f.name:${i + 1}: " + line.trim)
        }
      }
    }
    verify(bad.isEmpty,
      "对区间做了迭代 —— Axon 的 (a..b) 不是集合，回调会拿到 ObjRange。\n  " +
      bad.join("\n  "))
  }

  **
  ** FIN 5.3 的 Axon 日期库没有 `firstOfMonth` 符号。Fantom 的
  ** `Date.firstOfMonth` 虽然可用，但把同样写法放进 trio 只会在运行期报
  ** `Unknown symbol 'firstOfMonth'`。Axon 侧统一用
  ** `date(today().year, today().month, 1)` 构造月初。
  **
  Void test_noUnsupportedFirstOfMonth() {
    bad := Str[,]
    trioFiles.each |File f| {
      lines := f.readAllLines
      for (i := 0; i < lines.size; ++i) {
        line := lines[i]
        if (line.trim.startsWith("//")) continue
        if (line.contains(".firstOfMonth")) bad.add("$f.name:${i + 1}: " + line.trim)
      }
    }
    verify(bad.isEmpty,
      "FIN 5.3 Axon 不支持 firstOfMonth；请用 date(today().year, today().month, 1)。\n  " +
      bad.join("\n  "))
  }

  **
  ** `mytest` 修复脚本必须默认只预览，并固定使用 FIN 5.3 已验证支持的
  ** 可选楼层导航段。脚本不随 pod 自动加载，只有操作者在 FIN 中显式执行
  ** 才可能写数据。
  **
  Void test_nativeNavMigrationIsPreviewFirst() {
    src := EmLayerIsolationTest.findSrcDir
    verifyNotNull(src, "找不到源码树，无法检查迁移脚本")
    f := src.parent + `scripts/mytest-native-nav-migration.axon`
    verify(f.exists, "缺少 mytest 原生设备树迁移脚本")

    text := f.readAllStr
    try {
      Parser(Loc(f.name, 1), text.in).parse
    } catch (Err e) {
      fail("迁移脚本 Axon 语法错误：" + e.toStr)
    }
    verify(text.contains("preview: true"), "迁移脚本必须默认 preview:true")
    verify(text.contains("/site/[floor]/equip/point"), "必须使用可选 floor 导航段")
    verify(text.contains("emSynthetic"), "迁移必须补 Synthetic 标记")
    verify(text.contains("emDataProvenance"), "迁移必须补来源标识")
    verify(text.contains("alreadyCorrect"), "迁移必须声明幂等跳过规则")
    verify(text.contains("navMeta"), "迁移必须预览并更新 navMeta")
    verify(text.contains("resolveFloor"), "迁移必须用确定性规则解析设备楼层")
    verify(text.contains("historyPlans"), "迁移必须预览历史补写")
    verify(text.contains("emDemoHis("), "迁移必须调用受控的 demo 历史生成器")
    verify(text.contains("emClosed"), "迁移必须保护已关账台账")
    verify(text.contains("emDataAudit(site"), "迁移后必须返回只读审计结果")
    verify(text.contains("commit(diff"), "apply 模式必须包含显式幂等提交")
    verifyFalse(text.contains("{remove}"), "迁移脚本不得删除记录")
    verifyFalse(text.contains("pointWrite"), "迁移脚本不得控制点位")
    verifyFalse(text.contains("invokeAction"), "迁移脚本不得调用设备动作")
    verifyFalse(text.contains("return "), "迁移局部函数应使用表达式结果，避免非局部 return")
    verifyFalse(text.contains("->navName"), "navName 必须用安全下标读取，避免缺标签 trap")
    verifyFalse(text.contains("password"), "迁移脚本不得包含凭据")
  }

  **
  ** Hospital rich demo import batches are generated outside the pod, but they
  ** are operator-facing Axon. Keep them parser-checked and preview-first.
  Void test_hospitalDemoBatchesParseAndPreviewFirst() {
    src := EmLayerIsolationTest.findSrcDir
    verifyNotNull(src, "找不到源码树，无法检查医院丰富数据批次")
    dir := src.parent + `output/hospital-rich-demo-20260913/`
    verify(dir.exists, "缺少医院丰富数据批次目录，请先运行 scripts/hospital_demo/render_batches.py")

    files := dir.list.findAll |File f->Bool| { f.ext == "axon" }.sort
    verifyEq(files.size, 5)
    files.each |File f| {
      text := f.readAllStr
      try {
        Parser(Loc(f.name, 1), text.in).parse
      } catch (Err e) {
        fail("$f.name Axon 语法错误：" + e.toStr)
      }
      verify(text.contains("preview: true"), "$f.name 必须默认 preview:true")
      verify(text.contains("emSynthetic"), "$f.name 必须标记 Synthetic")
      verifyFalse(text.contains("pointWrite"), "$f.name 不得控制点位")
      verifyFalse(text.contains("invokeAction"), "$f.name 不得调用设备动作")
      verifyFalse(text.contains("password"), "$f.name 不得包含凭据")
    }
  }

  ** Demo data must be traceable and immediately usable after one build call.
  Void test_demoBuildCompletenessContract() {
    f := EnergyMatrixExt#.pod.file((libDir + "demo.trio").toUri, false)
    verifyNotNull(f, "lib/demo.trio 应该在 pod 里")
    funcs := TrioReader(f.in).readAllDicts
    build := funcs.find |Dict rec->Bool| { rec["name"] == "emDemoBuild" }
    verifyNotNull(build, "demo.trio 缺少 emDemoBuild")
    demoHis := funcs.find |Dict rec->Bool| { rec["name"] == "emDemoHis" }
    verifyNotNull(demoHis, "demo.trio 缺少 emDemoHis")
    text := build["src"] as Str
    hisText := demoHis["src"] as Str
    all := f.readAllStr

    verify(text.contains("days: 14, finalize: true"), "emDemoBuild 必须默认完成业务派生")
    verify(text.contains("checkMeter: emAddMeter"), "考核表引用必须保存")
    verify(text.contains("emDemoHis(checkMeter"), "考核表必须写历史")
    verify(all.contains("emDemoHisPartial"), "历史必须补到今天最近完成整点")
    verify(all.contains("(h + 1) * 1hr"), "整点时间戳必须表示刚完成的小时")
    verify(hisText.contains("hisCollectInterval: 1hr"), "合成逐小时历史的点位采集周期必须是 1hr")
    verify(hisText.contains("baseline: [{ts: startDt, val: 100000}]"), "历史必须包含起始日午夜基线")
    verify(hisText.contains("baseline.addAll(fullDays).addAll(partial)"), "午夜基线必须先于完整日和当日整点历史")
    verify(text.contains("emSynthetic"), "Demo 记录必须有 Synthetic 标记")
    verify(text.contains("emDataProvenance: \"emDemoBuild\""), "Demo 记录必须有稳定来源")
    verify(text.contains("if (finalize and days > 0)"), "无历史时不能运行派生")
    verify(text.contains("historyStart: today() - days * 1day"),
           "月末派生起点必须受 Demo 历史起点约束")
    verify(text.contains("monthStart: date(today().year, today().month, 1)"),
           "月初派生起点必须受本月起点约束")
    verify(text.contains("deriveStart: if (historyStart > monthStart) historyStart else monthStart"),
           "月末/月初交集必须选历史起点与月初中较晚者")
    verify(text.contains("deriveSpan: toSpan(deriveStart..today())"),
           "月末/月初交集必须截止到今天")
    verify(text.contains("emLedgerBuild(site, deriveSpan, \"daily\")"),
           "月末/月初交集必须约束台账派生")
    verify(text.contains("emDiagRun(site, deriveSpan)"),
           "月末/月初交集必须约束诊断派生")
    verifyFalse(text.contains("emThisMonthSpan()"),
                "Demo 派生不得越过月末/月初历史交集")
    verify(text.contains("ledgerErrors: ledger.findAll(row => row[\"status\"] == \"error\")"),
           "Demo 必须检查台账错误行")
    verify(text.contains("ledgerWritten: ledger.findAll(row => row[\"status\"] == \"written\")"),
           "Demo 必须单独统计写入成功行")
    ledgerTagPass := "readAll(energyMatrix and emLedger and siteRef==site).each(rec => commit(diff(rec, demoTags)))"
    verify(text.contains("if (ledgerWritten.size > 0)"),
           "有成功台账时必须先补齐 Demo 来源")
    verify(text.contains(ledgerTagPass),
           "成功台账必须在失败退出前标记为 Demo 数据")
    verify(text.contains("if (finalize and days > 0 and ledgerErrors.size > 0)"),
           "台账有错误时必须中止")
    verify(text.contains("if (finalize and days > 0 and ledgerWritten.size == 0)"),
           "台账没有成功写入时必须中止")
    verify(text.contains("已保留并标记 \" + ledgerWritten.size + \" 个成功条目"),
           "台账错误必须披露已保留并标记的成功条目数")
    verify(text.contains("ledgerEntries: ledgerWritten.size"),
           "返回值必须只统计成功写入的台账")
    verifyFalse(text.contains("ledgerEntries: ledger.size"),
                "不得把尝试行数报告成成功台账数")
    verify(text.index("ledgerErrors.size > 0") < text.index("diagnostics:"),
           "台账错误门必须先于诊断")
    verify(text.index("ledgerWritten.size == 0") < text.index("diagnostics:"),
           "空台账门必须先于诊断")
    verify(text.index(ledgerTagPass) < text.index("ledgerErrors.size > 0"),
           "成功台账来源标记必须先于错误门")
    verify(text.index(ledgerTagPass) < text.index("ledgerWritten.size == 0"),
           "成功台账来源标记必须先于空台账门")
    verifyFalse(text.contains("emClosePeriod(site"), "Demo 不得自动关账")
  }

  ** Gap delta is a quantity and must carry the source medium's unit.
  Void test_gapTemplateAcceptsMediumUnit() {
    src := EmModelBuilder.templateSource("EmGapMeter")
    verify(src.contains("unit:Arg(\"unit:N\")"), "缺口差值点必须接收介质单位")

    fanSrc := EmLayerIsolationTest.findSrcDir
    verifyNotNull(fanSrc, "找不到源码树，无法检查 addGapMeter")
    crud := (fanSrc + `models/EmEntityCrud.fan`).readAllStr
    verify(crud.contains("EmMedium.unit(medium)"), "addGapMeter 必须按介质提供单位")
  }

  ** Folio readAllList results are readonly in FIN 5.3 and must be copied before sorting.
  Void test_folioListsAreCopiedBeforeSort() {
    src := EmLayerIsolationTest.findSrcDir
    verifyNotNull(src, "找不到源码树，无法检查 Folio 列表排序")

    diag := (src + `diagnostic/EmDiagRuleEngine.fan`).readAllStr
    verify(diag.contains("return sortRules(all)") && diag.contains("sorted := rules.dup"),
      "诊断规则排序必须通过可测试的边界函数复制 Folio 列表")

    lib := (src + `EnergyMatrixLib.fan`).readAllStr
    verify(lib.contains("readAllList(\"emClosePeriod and siteRef==\" + siteRef.toCode).dup"),
      "关账批次排序前必须复制 Folio 列表")
  }

  ** Virtual-meter formulas must bind emSelf inside a fresh function frame so
  ** repeated evaluations in one Axon Context do not rebind a lambda parameter.
  Void test_virtualMeterUsesIsolatedSelfBinding() {
    src := EmLayerIsolationTest.findSrcDir
    verifyNotNull(src, "找不到源码树，无法检查虚拟表公式求值器")

    text := (src + `meter/EmVirtualMeterEval.fan`).readAllStr
    verify(text.contains("(emSubjectParam) => do emSelf: emSubjectParam; ("),
      "虚拟表公式必须在新的函数帧内定义 emSelf")
    verify(text.contains("fn.call(cx, [selfRef])"),
      "虚拟表公式必须把当前表 Ref 传入私有参数")
    verifyFalse(text.contains("(emSelf) =>"),
      "lambda 参数不能直接命名 emSelf，否则 FIN 5.3 会重复绑定")

    generated := "(emSubjectParam) => do emSelf: emSubjectParam; (1 + 2) end"
    try {
      Parser(Loc("EmVirtualMeterEval.eval", 1), generated.in).parse
    } catch (Err e) {
      fail("虚拟表公式的 Axon lambda 语法错误：" + e.toStr)
    }
  }

  ** 菜单里的深链必须与前端路由对得上 —— 对不上就是点进去一片空白。
  Void test_menuRoutesAreKnown() {
    known := ["/overview", "/realtime", "/workorder", "/meter-tree", "/analysis",
              "/quota", "/diagnosis", "/carbon", "/model", "/devices",
              "/portfolio", "/reports", "/mobile"]
    f := EnergyMatrixExt#.pod.file((libDir + "menu.trio").toUri, false)
    verifyNotNull(f, "lib/menu.trio 应该在 pod 里")

    src := f.readAllStr
    bad := Str[,]
    // 深链形如 open("/overview")
    src.splitLines.each |Str line| {
      i := line.index("open(\"")
      if (i == null) return
      rest := line[(i + 6)..-1]
      j := rest.index("\"")
      if (j == null) return
      route := rest[0..<j]
      if (!known.contains(route)) bad.add(route)
    }
    verify(bad.isEmpty, "菜单深链指向了前端没有的路由：" + bad.join(", ") +
      "（改路由时记得同步改 lib/menu.trio）")
  }

  **
  ** 每个 `@Axon` 函数都要有中英文 locale 条目。
  **
  ** 缺条目不会报错，FIN 只是把函数名原样显示在函数浏览器里 —— 一个静默的
  ** 缺陷，人工核对很容易漏（这个测试第一次跑出来就是 20 个）。
  **
  Void test_axonFuncsHaveLocale() {
    fns := axonFuncNames
    if (fns.isEmpty) {
      fail("找不到 fan/EnergyMatrixLib.fan。请在 extensions/energyMatrix/ 下运行 " +
           "fant，或设置 EM_SRC —— 静默跳过的对账等于没有对账。")
      return
    }
    verify(fns.size > 30, "应该扫到几十个 @Axon 函数，实际 " + fns.size)

    ["zh", "en"].each |Str lang| {
      f := EnergyMatrixExt#.pod.file("/locale/${lang}.props".toUri, false)
      verifyNotNull(f, "locale/${lang}.props 应该在 pod 里")
      src := f.readAllStr
      missing := fns.findAll |Str n -> Bool| { !src.contains(n + ".dis") }
      verify(missing.isEmpty,
        "locale/${lang}.props 缺少这些函数的 .dis：" + missing.join(", "))
    }
  }

  **
  ** 从 Lib 源码里扫出 @Axon 函数名。
  **
  ** 不走反射：`Type.methods` 拿到的是**全部** static 方法，分不出哪些带
  ** `@Axon`（facet 类型在 axon pod 里，测试不依赖它），而这里要对账的正是
  ** "对外暴露了几个函数"。源码扫描反而是准的。
  **
  private static Str[] axonFuncNames() {
    dir := EmLayerIsolationTest.findSrcDir
    if (dir == null) return Str[,]
    f := dir + `EnergyMatrixLib.fan`
    if (!f.exists) return Str[,]
    src := f.readAllStr

    out := Str[,]
    src.splitLines.each |Str line| {
      t := line.trim
      if (!t.startsWith("static ")) return
      i := t.index("em")
      if (i == null) return
      j := t.index("(", i)
      if (j == null) return
      name := t[i..<j].trim
      if (!name.startsWith("em")) return
      if (name.contains(" ")) return
      if (!out.contains(name)) out.add(name)
    }
    return out
  }

  private static File[] trioFiles() {
    out := File[,]
    EnergyMatrixExt#.pod.files.each |File f| {
      if (f.ext != "trio") return
      if (!f.uri.pathStr.startsWith(libDir)) return
      out.add(f)
    }
    return out
  }
}
