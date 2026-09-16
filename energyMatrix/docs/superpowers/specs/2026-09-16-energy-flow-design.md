# 能流图（Sankey）新屏 · 设计决策记录

> 日期：2026-09-16 ｜ 分支：develop ｜ 阶段：阶段 1（需求文档更新，已提交待确认）
> 上游需求文档：AI4B-EM-DS-2026-001《energyMatrix 语义模型设计说明书》V0.1.1（新增第 7 章）

## Goal

在 energyMatrix 前端新增第 14 屏「能流图」：以 Sankey 图呈现建筑能源从进线到分项用能的完整流向，帮助用户一眼看出"能源从哪来、到哪去、哪里不明"。

## 已确认决策（用户拍板）

| 决策点 | 结论 | 备选（已否决/二期） |
|---|---|---|
| 图形态 | Sankey 桑基图（流向带宽 ∝ 能耗，按介质分色） | 层级拓扑图 / 树图+箭头 |
| 入口位置 | 新屏「能流图」，第 14 屏，hash 路由 `/flow`，FIN 顶栏菜单归「监测运行」组 | 嵌入「能耗分析」屏页签 |
| 数据口径 | L2 能耗台账（铁律 6），宽度=选定账期台账合计 | 实时 L1 口径（二期） |
| 后端改动 | 零。复用既有端点 `emMeterTree` + `emLedgerQuery.aggregate(dim="meter")` | — |
| 交互深度 | 只读 + tooltip + 空态引导；节点钻取列二期 | 点击钻取（二期） |

## 数据流（阶段 3 实现契约）

```
emMeterTree(siteRef)                → DAG 结构：节点表计、submeterOf 父子边、medium、角色
emLedgerQuery.aggregate(siteRef, span, dim="meter") → 各表计账期合计值
        ↓ buildSankey(treeNodes, meterTotals)（纯函数，可单测）
recharts <Sankey> {nodes, links}    → 缺口表汇入「不明用能」汇点；零值边过滤；防御自环
```

- 虚拟表：作为派生节点出现在图中。
- 考核表：不参与汇总（沿用 EmMeterNode.summableChildren 语义），图中照常显示但不作为父表汇总来源。
- 空台账：给「先构建台账」引导文案，不白屏。

## 版本与公司名（本次同步执行）

- pod / 前端包 / Xeto 库 / 两份设计文档版本统一为 **0.1.1**。
- 两份设计文档全文公司名「和碳技术（南京）有限公司」→「西门子中国」（"· ai4building" 品牌后缀保留）。
- 不在同步范围：`output/` 下逆向恢复版《…说明书 V1.0》、《docs/releasedoc/` 对外资料。

## 阶段闸门（硬约束）

1. **阶段 1（本阶段）**：只更新需求文档（spec md+docx）+ 本文档 → 提交 develop → **停下等确认**。
2. 阶段 2（确认后）：详细设计文档（路由/模块/接口契约）、模型定义核对（defs.trio / xeto）、`lib/menu.trio` 菜单项、locale 词条、`plans/` 任务清单。
3. 阶段 3（再确认后）：Flow 三件套开发、routes 接通、版本号升级、测试、pod 构建、真机目检、PR。
