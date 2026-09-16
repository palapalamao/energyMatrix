using haystack

**
** 台账粒度（说明书附录 C 的 `EmGranularity`）。
**
** 骨架默认落库粒度是 `daily`（说明书 §6 待决事项 OI-01 的取舍：
** hourly 只留历史，daily 入账），四个值都被模型支持，夜间 Job 只跑 daily。
**
const class EmGranularity
{
  static const Str hourly  := "hourly"
  static const Str daily   := "daily"
  static const Str monthly := "monthly"
  static const Str yearly  := "yearly"

  static const Str[] all := [hourly, daily, monthly, yearly]

  ** 骨架的默认落库粒度（OI-01）。
  static const Str defaultGranularity := daily

  static Bool isValid(Str? g) { g != null && all.contains(g) }

  ** 该粒度的名义时长，用于账期切分与完好率分母估算。
  ** 月/年不是定长，返回 null —— 调用方必须用日历运算而不是加固定 Duration。
  static Duration? duration(Str g) {
    if (g == hourly) return 1hr
    if (g == daily)  return 24hr
    return null
  }

  **
  ** 把一个账期按粒度切成若干子区间（左闭右开）。
  ** 月/年用日历推进，避免"30 天"这种会在 2 月和闰年出错的近似。
  **
  static Span[] split(Span span, Str g) {
    out := Span[,]
    cur := span.start
    end := span.end
    guard := 0
    while (cur < end && guard < 100000) {
      next := advance(cur, g)
      if (next > end) next = end
      if (next <= cur) break
      // Span 没有公开的两参构造，用 Span.makeAbs（返回 Span?）。
      s := Span.makeAbs(cur, next)
      if (s == null) break
      out.add(s)
      cur = next
      guard++
    }
    return out
  }

  private static DateTime advance(DateTime t, Str g) {
    if (g == hourly)  return t + 1hr
    if (g == daily)   return (t.date + 1day).midnight(t.tz)
    if (g == monthly) return t.date.firstOfMonth.plus(32day).firstOfMonth.midnight(t.tz)
    return Date(t.date.year + 1, Month.jan, 1).midnight(t.tz)
  }
}
