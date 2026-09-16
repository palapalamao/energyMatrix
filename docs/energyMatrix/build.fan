#! /usr/bin/env fan
//
// energyMatrix — 建筑能源管理系统 FIN Pod（Fantom 后端 + React/TS 前端）。
//
// 语义模型依据《energyMatrix 语义模型设计说明书 V1.0》(AI4B-EM-DS-2026-001)：
//   Layer 1  对象与设备   域1 空间与组织 / 域2 计量 / 域3 供能 / 域4 用能 / 点位规范
//   Layer 2  业务对象     域5 台账 / 域6 分摊 / 域7 计费 / 域8 指标 /
//                        域9 核证 / 域10 碳 / 域11 诊断
//   两层之间唯一的数据通道是 EmLedgerEntry（能耗台账）。
//
// ── Xeto 与本 pod 的关系（重要）──────────────────────────────────────────
// 说明书 §2.2 要求交付 Xeto 库 `em`。但本 pod 的目标运行环境 FIN 5.3
// (hetan_5.3.0.2761) 内置 haystack 3.1.5.1，属 Haystack 4 defs 体系，
// 全部 284 个框架 pod 中不存在任何 xeto pod —— Xeto 在此无法编译、无法加载。
// 因此采用双轨：
//   * res/spec/em/*.xeto   规格源真相（打包进 pod 供人阅读 / 未来迁 Haxall 4 直接用），
//                          FIN 5.3 不解析它。
//   * lib/defs.trio        FIN 5.3 上真正生效的 def 库（emXxx 标签 + 16 个枚举）。
//   * res/defaultModels/   ModelEntity trio 模板，是实例化设备/表计的唯一入口。
// 两轨的差异逐条记录在 README.md「与说明书的偏差」。
//
// ── 构建路线 ──────────────────────────────────────────────────────────
// 本 pod 遵循仓内 FIN 5.x 约定（extensions/jediHKU、extensions/coolsim）：
// finBuild / BuildFinPod + skyarc.ext / skyarc.lib 索引注册。
// 注意 skills/coolmatrix-fin-extension-architect/skill.md 里的
// `using build` / BuildPod / ph.lib 模板已过时，不要照抄。
//
using finBuild

class Args : BuildFinArgs {
  new make() : super(Build#make) {}
}

class Build : BuildFinPod
{
  new make(Args args) : super(args)
  {
    podName = "energyMatrix"
    summary = "energyMatrix — 建筑能源管理（计量 / 台账 / 分摊 / 计费 / 指标 / 核证 / 碳 / 诊断）"
    version = Version("0.1.0")
    outDir := Env.cur.vars["EM_OUT_POD_DIR"]
    if (outDir != null && !outDir.trim.isEmpty) outPodDir = File.os(outDir).normalize.uri

    meta = [
      "proj.name":    podName,
      "org.name":     "AI4Building",
      "org.uri":      "https://ai4building.cn",
      "license.name": "Commercial",
      // 不声明 "fin.components" —— 本 pod 不发 Graphic Builder 图元，UI 是
      // 经 finStackMobileMenu iframe 加载的 TS SPA（res/web/em/）。误声明会让
      // FINGraphicsService 去扫组件文件并告警"未找到组件文件"。
    ]

    depends = [
      // Fantom
      "sys        1.0+",
      "concurrent 1.0+",   // AtomicBool / ConcurrentMap（Ext 的可变状态只能放这里）
      "web        1.0+",
      "util       1.0+",

      // SkySpark / SkyArc 框架
      "haystack   3.0.20+",
      "axon       3.0.20+",
      "folio      3.0.20+",
      "foliox     3.0.20+",  // Context.folio → FolioX，L1 raw / L2 delta 的 his 读写
      "hx         3.0.20+",
      "skyarc     3.0.20+",
      "skyarcd    3.0.20+",

      // 历史与作业
      "hisExt     3.0.20+",
      "jobExt     3.0.20+",  // res/defaultJobs/jobs.trio 的夜间台账流水线

      // FIN 框架
      "finStackCoreExt        5.0+",     // finStackMobileMenu 顶栏菜单注册
      "finEntityModelToolsExt 0.0.11+",  // ModelEntity + trio 模板实例化
    ]

    // WARNING srcDirs 非递归 —— 每新建一个含 .fan 的子目录都要在这里加一行，
    // 否则编译期报 "Type not found"。
    // 目录按「能力域」划分（对应说明书的 11 个域），不得出现 utils/ helpers/ misc/。
    srcDirs = [
      `fan/`,
      `fan/models/`,       // 域1–4：ModelEntity 子类（空间 / 表计 / 供能 / 用能）
      `fan/meter/`,        // 域2  ：计量树、读数差分、虚拟表、缺口量  ★已实现
      `fan/ledger/`,       // 域5  ：台账构建、关账事务、红冲、查询      ★已实现
      `fan/alloc/`,        // 域6  ：分摊规则引擎                      （骨架桩）
      `fan/tariff/`,       // 域7  ：费率 / 需量电费 / 账单             （骨架桩）
      `fan/kpi/`,          // 域8  ：指标定义与定额                     （骨架桩）
      `fan/baseline/`,     // 域9  ：IPMVP 基线与节能量核证             （骨架桩）
      `fan/carbon/`,       // 域10 ：排放因子与碳账                     （骨架桩）
      `fan/diagnostic/`,   // 域11 ：诊断规则、异常、工单               （骨架桩）
      `fan/audit/`,        // 横切 ：数据来源分级 / 参数版本化守卫      ★已实现
      `fan/observers/`,    // 横切 ：Folio 变更订阅
      // BuildFinPod 没有 testDirs —— 测试作为普通 srcDir 编入 pod，
      // 用 <fin>/bin/fant energyMatrix::<TestClass> 运行。
      `fan/test/`,
    ]

    // WARNING resDirs 同样非递归。res/web/em/ 是 ts/ 的 Vite outDir。
    // locale/ 只有在下方 index["fin.lang"] 存在时才会被 FIN 加载。
    resDirs = [
      `lib/`,
      `locale/`,
      `res/`,
      `res/defaultModels/`,
      `res/defaultJobs/`,
      `res/spec/`,
      `res/spec/em/`,
      `res/web/`,
      `res/web/em/`,
    ]

    // finBuild 在 Fantom 编译之前先在 ts/ 跑 `npm run build`，产物落 res/web/em/。
    // 前提：ts/ 已经 npm install。要做纯 Fantom 编译检查时可临时注释掉这一行。
    nodeDirs = [`ts/`]

    index = [
      // 三个键缺一，FIN 会静默丢掉本 ext（不出现在菜单 / locale 不加载）。
      "skyarc.ext": "energyMatrix::EnergyMatrixExt",
      "skyarc.lib": "energyMatrix::EnergyMatrixLib",
      "fin.lang":   "energyMatrix",
    ]
  }
}
