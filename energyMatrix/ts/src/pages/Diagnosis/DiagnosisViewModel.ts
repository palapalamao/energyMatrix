import { makeObservable, observable, runInAction } from "mobx";
import type { HClient, HDict } from "@/api/client";
import { BaseStore } from "@/mvvm/base/BaseStore";
import { BaseViewModel } from "@/mvvm/base/BaseViewModel";
import {
  emBaselines,
  emDiagRules,
  emSavingsProjects,
  has,
  id as recId,
  num,
  str,
} from "@/api/emApi";
import {
  CATEGORY_DIS,
  SEVERITY_DIS,
  SEVERITY_TONE,
  VERIFY_STATUS_DIS,
  VERIFY_STATUS_TONE,
  fmtNum,
  fmtPct,
} from "@/pages/shared";
import type { Tone } from "@/components/Bits";

/**
 * 节能诊断与核证。
 *
 * 铁律 10 是这一屏的全部重点：节能量的三个字段
 * （`emSavingsPlanned` / `emSavingsMeasured` / `emSavingsVerified`）
 * **任何时候不得相互替代**。所以卡片上三个数字是分开的三格，不做"取最好那个"
 * 的兜底 —— 一旦兜底，规划值就会以已核证的口径流到对外材料里。
 *
 * 基线的统计验收（ASHRAE G14）也在这屏：R² ≥ 0.75、CV(RMSE) ≤ 15%、|NMBE| ≤ 5%。
 * 三项逐条判定并显示，而不是只给一个 emValid 的红绿灯 —— 哪一项没过，
 * 决定了要回去改模型还是改数据。
 */

/** ASHRAE Guideline 14 的统计验收门槛。 */
export const G14 = { r2: 0.75, cvRmse: 0.15, nmbe: 0.05 };

export class DiagnosisStore extends BaseStore {
  private client: HClient | undefined = undefined;

  projects: HDict[] = [];
  baselines: HDict[] = [];
  rules: HDict[] = [];
  loading = false;
  error: string | undefined = undefined;

  constructor() {
    super();
    makeObservable(this, {
      projects: observable,
      baselines: observable,
      rules: observable,
      loading: observable,
      error: observable,
    });
  }

  override initialize(client: HClient): void {
    this.client = client;
    this.initialized = true;
  }

  async load(siteRef: string): Promise<void> {
    const client = this.client;
    if (!client) return;
    runInAction(() => {
      this.loading = true;
      this.error = undefined;
    });
    try {
      const [projects, baselines, rules] = await Promise.all([
        emSavingsProjects(client, siteRef),
        emBaselines(client, siteRef),
        emDiagRules(client, siteRef),
      ]);
      runInAction(() => {
        this.projects = projects;
        this.baselines = baselines;
        this.rules = rules;
      });
    } catch (e: unknown) {
      runInAction(() => {
        this.error = e instanceof Error ? e.message : String(e);
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }
}

export interface ProjectRow {
  id: string;
  dis: string;
  ecmType?: string;
  status: string;
  statusDis: string;
  statusTone: Tone;
  planned?: number;
  measured?: number;
  verified?: number;
  invest?: number;
  verifiedBy?: string;
  hasBaseline: boolean;
  /** 简单回收期（年）。只在**已核证**节能量存在时才算。 */
  payback?: number;
}

export interface BaselineRow {
  id: string;
  dis: string;
  option?: string;
  modelType?: string;
  r2?: number;
  cvRmse?: number;
  nmbe?: number;
  valid: boolean;
  checks: { label: string; ok: boolean; text: string }[];
}

export interface RuleRow {
  id: string;
  code?: string;
  dis: string;
  category?: string;
  categoryDis: string;
  severity?: string;
  severityTone: Tone;
  threshold?: number;
  /** 判据已实现的分类只有这两类，其余在诊断时会被跳过。 */
  supported: boolean;
}

const ECM_DIS: Record<string, string> = {
  retrofit: "设备改造",
  control: "控制优化",
  operation: "运行调整",
  renewable: "可再生能源",
  behavior: "行为节能",
};

/** 当前后端已实现判据的诊断分类。与 EmDiagRuleEngine.run 保持一致。 */
const SUPPORTED_CATEGORIES = ["dataQuality", "balance"];

export class DiagnosisViewModel extends BaseViewModel<DiagnosisStore> {
  get loading(): boolean {
    return this.store.loading;
  }
  get error(): string | undefined {
    return this.store.error;
  }

  load(siteRef: string): void {
    void this.store.load(siteRef);
  }

  get projectRows(): ProjectRow[] {
    return this.store.projects.map((d) => {
      const status = str(d, "emVerifyStatus") ?? "planned";
      const verified = num(d, "emSavingsVerified");
      const invest = num(d, "emInvest");
      // 回收期只用**已核证**节能量算。用规划值算出来的回收期是一张期货，
      // 放在同一个位置上会被当成事实读
      const payback =
        verified !== undefined && verified > 0 && invest !== undefined
          ? invest / verified
          : undefined;
      return {
        id: recId(d) ?? "",
        dis: str(d, "dis") ?? "",
        ecmType: str(d, "emEcmType"),
        status,
        statusDis: VERIFY_STATUS_DIS[status] ?? status,
        statusTone: VERIFY_STATUS_TONE[status] ?? "neutral",
        planned: num(d, "emSavingsPlanned"),
        measured: num(d, "emSavingsMeasured"),
        verified,
        invest,
        verifiedBy: str(d, "emVerifiedBy"),
        hasBaseline: !!d.get("emBaselineRef"),
        payback,
      };
    });
  }

  ecmDis(t?: string): string {
    return t ? (ECM_DIS[t] ?? t) : "—";
  }

  /** 三态节能量分别汇总。**不合并** —— 合并就是让三种口径互相替代。 */
  get savingsTotals(): { planned: number; measured: number; verified: number } {
    const rows = this.projectRows;
    return {
      planned: rows.reduce((s, r) => s + (r.planned ?? 0), 0),
      measured: rows.reduce((s, r) => s + (r.measured ?? 0), 0),
      verified: rows.reduce((s, r) => s + (r.verified ?? 0), 0),
    };
  }

  get unverifiedCount(): number {
    return this.projectRows.filter((r) => r.status !== "verified").length;
  }

  get baselineRows(): BaselineRow[] {
    return this.store.baselines.map((d) => {
      const r2 = num(d, "emR2");
      const cv = num(d, "emCvRmse");
      const nmbe = num(d, "emNmbe");
      return {
        id: recId(d) ?? "",
        dis: str(d, "dis") ?? "",
        option: str(d, "emIpmvpOption"),
        modelType: str(d, "emModelType"),
        r2,
        cvRmse: cv,
        nmbe,
        valid: has(d, "emValid") || d.get("emValid")?.toJSON() === true,
        checks: [
          {
            label: "R²",
            ok: r2 !== undefined && r2 >= G14.r2,
            text: `${fmtNum(r2, 3)} ≥ ${G14.r2}`,
          },
          {
            label: "CV(RMSE)",
            ok: cv !== undefined && cv <= G14.cvRmse,
            text: `${fmtPct(cv)} ≤ ${fmtPct(G14.cvRmse, 0)}`,
          },
          {
            label: "NMBE",
            ok: nmbe !== undefined && Math.abs(nmbe) <= G14.nmbe,
            text: `|${fmtPct(nmbe)}| ≤ ${fmtPct(G14.nmbe, 0)}`,
          },
        ],
      };
    });
  }

  get ruleRows(): RuleRow[] {
    return this.store.rules.map((d) => {
      const cat = str(d, "emCategory");
      const sev = str(d, "emSeverity") ?? "info";
      return {
        id: recId(d) ?? "",
        code: str(d, "emRuleCode"),
        dis: str(d, "dis") ?? "",
        category: cat,
        categoryDis: cat ? (CATEGORY_DIS[cat] ?? cat) : "—",
        severity: sev,
        severityTone: SEVERITY_TONE[sev] ?? "neutral",
        threshold: num(d, "emRuleThreshold"),
        supported: !!cat && SUPPORTED_CATEGORIES.includes(cat),
      };
    });
  }

  severityDis(s?: string): string {
    return s ? (SEVERITY_DIS[s] ?? s) : "—";
  }

  get unsupportedRuleCount(): number {
    return this.ruleRows.filter((r) => !r.supported).length;
  }

  fmtNum = fmtNum;
  fmtPct = fmtPct;
}
