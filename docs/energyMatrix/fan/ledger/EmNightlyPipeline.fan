using haystack
using skyarc
using skyarcd

**
** 夜间台账流水线 —— `res/defaultJobs/jobs.trio` 里那个**唯一** Job 的实现。
**
** 台账构建 → 分摊 → 缺口校核 三步有严格先后依赖。coolSimExt 的 jobs.trio
** 留下过一条明确的教训：
**
** > 不要靠时间间隔保证 Job 之间的依赖顺序。有依赖就合并进一个 Job 串行执行。
**
** 所以这里是一个函数里的三步，而不是三个 Job 排在 01:00 / 01:10 / 01:20。
**
** **关账不在流水线里** —— 关账要有人对缺口率负责（说明书 §5.2 的闸门是
** 硬门槛），是人工动作，由 UI reports 屏发起。
**
class EmNightlyPipeline
{
  new make(Context cx) { this.cx = cx }

  Context cx

  private static const Str src := "EmNightlyPipeline"

  **
  ** 跑流水线。
  **
  ** siteRef 省略 → 项目内全部 `EmSite`（带 `energyMatrix and site` 标记）。
  ** span 省略 → 昨天整天（Job 在 01:00 跑，处理的是前一天的账）。
  **
  ** 返回 Grid，每站一行：siteRef, dis, built, skipped, errors,
  ** allocRows, emGapRatio, status(ok|error), msg。
  ** **逐站独立 try/catch** —— 一个站点配置有问题不能让整批 Job 失败。
  **
  Grid run(Ref? siteRef := null, Span? span := null,
           Str granularity := EmGranularity.defaultGranularity)
  {
    sites := siteRef == null ? allSites : Dict[cx.proj.readById(siteRef, true)]
    rows := Dict[,]

    sites.each |Dict site| {
      s := span ?: yesterday(site)
      try {
        rows.add(runOne(site, s, granularity))
      } catch (Err e) {
        EnergyMatrixExt.logErr(src, "站点流水线失败：" + dis(site), e)
        rows.add(Etc.makeDict([
          "siteRef": site.id, "dis": dis(site),
          "status": "error", "msg": e.msg,
        ]))
      }
    }

    EnergyMatrixExt.logInfo(src, "nightly pipeline done, sites=" + rows.size)
    return Etc.makeDictsGrid(null, rows)
  }

  private Dict runOne(Dict site, Span span, Str granularity) {
    // ---- 1) 台账构建 ----
    build := EmLedgerBuilder(cx).build(site.id, span, granularity)
    built := 0; skipped := 0; errors := 0
    build.each |Row r| {
      s := r["status"] as Str
      if (s == "written") built++
      else if (s == "skipped") skipped++
      else errors++
    }

    // ---- 2) 分摊（无生效规则时是 no-op）----
    allocRows := 0
    allocMsg := (Str?)null
    try {
      allocRows = EmAllocEngine(cx).run(site.id, span, granularity).size
    } catch (UnsupportedErr e) {
      // 域 6 骨架桩：有规则却没实现。记录但不中断 —— 台账已经落库，
      // 缺口率仍然算得出，运维需要看到这条信息而不是整批 Job 失败。
      allocMsg = e.msg
      EnergyMatrixExt.logWarn(src, "分摊未执行：" + e.msg)
    }

    // ---- 3) 缺口校核 ----
    gapRatio := EmGapCalc(cx).siteGapRatio(site.id, span)

    return Etc.makeDict([
      "siteRef":    site.id,
      "dis":        dis(site),
      "span":       span,
      "built":      Number(built),
      "skipped":    Number(skipped),
      "errors":     Number(errors),
      "allocRows":  Number(allocRows),
      "emGapRatio": gapRatio,
      "status":     errors > 0 ? "partial" : "ok",
      "msg":        allocMsg,
    ])
  }

  ** 项目内全部 energyMatrix 站点。
  Dict[] allSites() { cx.proj.readAllList("energyMatrix and site") }

  ** 站点时区下的"昨天"整天（左闭右开）。
  static Span yesterday(Dict site) {
    tz := TimeZone.fromStr((site["tz"] as Str) ?: TimeZone.cur.name, false) ?: TimeZone.cur
    d := Date.today(tz) - 1day
    s := Span.makeAbs(d.midnight(tz), (d + 1day).midnight(tz))
    if (s == null) throw ArgErr("无法构造昨天的账期区间")
    return s
  }

  private static Str dis(Dict d) { (d["dis"] as Str) ?: d.id.toStr }
}
