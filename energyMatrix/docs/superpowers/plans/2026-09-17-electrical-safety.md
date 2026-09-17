# 电气安全监测屏（/safety，第 16 屏）实施计划 —— V0.1.3

> 流程：阶段 1 需求文档（✅ 已确认，commit 6536958）→ 阶段 2 规格/模型/接口/trio（本阶段）→ 阶段 3 开发。
> 每阶段推送 develop 后停下等用户确认。文档版本统一 V0.1.3（代码版本阶段 3 升 0.1.3），公司名「西门子中国」。
> 静态 Demo（评审用，纯前端模拟数据）：`docs/demo/2026-09-17-em-safety-screen/em-safety-demo.html`（已获用户确认）。

## 阶段 2（当前，已执行）

- [x] 详细设计文档 md+docx：版本 → V0.1.3，上游引用 → V0.1.3，修订记录加行
- [x] 详细设计文档：4.4 加电气安全数据契约段（hisRead 直读 L1、暂降双轨、告警复用域 11、无新增后端接口）、5.2 路由骨架加 /safety、5.3 加「电气安全」模块行、5.4 加前端取数契约、5.5 权限矩阵加行（全角色只读）、附录 B 加 /em/safety
- [x] docx 同步修改并抽文本验证（V0.1.3×6、电气安全×7、和碳 0 残留；md 同口径一致）
- [x] 模型 `res/spec/em/points.xeto`：新增 EmInsulationResistance(kΩ)/EmThdV(%)/EmThdI(%)/EmUnbalance(%)/EmResidualCurrent(mA) 五个点位规范 + emInsulation/emThd/emUnbalance/emResidualCurrent 四个 marker
- [x] 模型 `res/spec/em/supply.xeto`：新增 EmItIsolationPanel（医用 IT 隔离电源柜，emSystemVolt + emIrAlarmThreshold 逐柜可配，阈值参照 IEC 60364-7-710 的 50 Ω/V）
- [x] 菜单 `lib/menu.trio`：加 `entry("电气安全", "/safety", -317.5, "icon-flag")`（归「监测运行」组、位于「实时监测与告警」之后），屏数注释 15→16
- [x] 验证：`fan` 编译不回退（阶段 3 复核：Fantom 编译通过止于 WritePod 提权，TrioReader 解析 defs.trio 217 defs 含 emThdV/emThdI）（xeto/trio 随 pod 构建校验）；注：阶段 3 真机目检菜单图标 icon-flag，若缺字回退 icon-alert
- [x] 提交 develop 并推送（7a1264a），已确认

## 阶段 3（确认后执行）

- [x] 前端三件套 `ts/src/pages/Safety/`：SafetyViewModel.ts（mobx，四子视图状态 + 2s 模拟/实时刷新）、SafetyView.tsx（四页签 + 卡片/表格/曲线）、safetyFormat.ts（纯函数：阈值分级色、单位、缺失「—」）
- [x] `ts/src/routes.tsx` 加 `/safety` 路由（与菜单深链接通）；`AppShell.tsx` 侧栏加「电气安全」入口
- [x] `ts/src/api/emApi.ts` 补 hisRead 批量封装（按点位 id 列表取 24h 序列）
- [x] `ts/src/i18n/zh.json` + `en.json` 补词条（UI 词条不在 zh.props/en.props——那是 lib 级词条；本需求无新增 Axon 函数，lib 词条零变更）
- [x] 测试 `ts/tests/safety-format.test.ts`（node:test：阈值分级、暂降事件重要度判定、缺失「—」）
- [x] 版本升级：`build.fan` `Version("0.1.3")`、`ts/package.json` + lock → 0.1.3
- [x] `npm test` + `tsc --noEmit` 全绿；`fant energyMatrix` 方法数不回退
- [x] 构建 pod（build.ps1 + EM_OUT_POD_DIR），`emInfo()` 返回 0.1.3
- [ ] mytest 医院四院区按 7.3.1–7.3.4 补监测点位、IT 隔离电源柜与 his 模拟数据（建立到设备树，运行时数据操作，单独列示并经确认）
- [ ] 真机目检：四子视图数值/越限高亮、菜单图标 icon-flag 渲染、版本徽标 0.1.3
- [ ] 提交 develop，更新 PR

## 关键决策（阶段 2 调查结论）

1. **后端零新增**：四个子视图全部只读，监测量经既有 hisRead 通道取 L1 点位历史；告警复用域 11
   （EmDiagRuleEngine → EmAnomaly → EmWorkOrder），不新建告警体系、不新增计算域（需求文档 7.3 共性边界已定）。
2. **模型变更两处**：points.xeto 五个新点位规范（电压/电流/功率/温度四类复用既有 EmVolt/EmCurrent/
   EmElecPowerActive/EmTemp，零新增）；supply.xeto 一个 equip 类型 EmItIsolationPanel。
3. **阈值**：绝缘告警阈值 50 kΩ 为 IEC 60364-7-710 的 50 Ω/V 惯例值（220 V 系统），文档注明「最终值评审定夺」；
   模型层做成 emIrAlarmThreshold 逐柜可配，前端默认值 50。
4. **权限**：全角色只读（只监测不控制），权限点仅 em:read；写操作列「无」。
5. **菜单图标**：选用 icon-flag（警示语义且未被占用）；icon 字体为二进制无法离线核验，
   阶段 3 真机目检，若缺字回退 icon-alert。
6. **暂降双轨**：电压暂降 = his 点（曲线留痕）+ 域 11 异常事件（闭环），与需求文档 7.3.3 一致。
7. **台账边界**：监测数据不产生 L2 台账口径，与铁律 6 不冲突（需求文档已定）。
