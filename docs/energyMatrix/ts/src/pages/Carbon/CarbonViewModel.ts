import { makeObservable, observable, runInAction } from "mobx";
import type { HClient, HDict, HGrid } from "@/api/client";
import { BaseStore } from "@/mvvm/base/BaseStore";
import { BaseViewModel } from "@/mvvm/base/BaseViewModel";
import {
  emCarbonAccount,
  emCarbonTargetProgress,
  emCarbonTargets,
  emFactors,
  emGreenCerts,
  has,
  id as recId,
  num,
  ref,
  rows as gridRows,
  str,
  type EmSpan,
} from "@/api/emApi";
import { MEDIUM_DIS, SCOPE_DIS, fmtNum, fmtPct } from "@/pages/shared";
import type { Tone } from "@/components/Bits";

/**
 * 碳排与双碳目标。
 *
 * 碳账是**台账 × 因子**的确定性投影，所以这一屏没有任何自己的计算：
 * `emCarbonAccount` 一次返回逐介质明细（rows）与 Scope 汇总（meta）。
 *
 * 一屏之内要能回答两个审计问题：
 *   1. 这个数是用哪一版因子算的？ → 因子版本表 + 每行的 emFactorRef
 *   2. 抵消量凭什么算数？        → 绿证表里只有 emRetired 的才计入
 *
 * 页面**不传 lock** —— 锁定因子版本是关账时的动作，浏览页面不该有副作用。
 */

export class CarbonStore extends BaseStore {
  private client: HClient | undefined = undefined;

  account: HGrid | undefined = undefined;
  factors: HDict[] = [];
  certs: HDict[] = [];
  targets: HDict[] = [];
  targetProgress: HDict[] = [];
  loading = false;
  error: string | undefined = undefined;
  /** 碳账算不出来时的原因（缺因子、单位对不上…），单独显示不打断整页。 */
  accountError: string | undefined = undefined;

  constructor() {
    super();
    makeObservable(this, {
      account: observable,
      factors: observable,
      certs: observable,
      targets: observable,
      targetProgress: observable,
      loading: observable,
      error: observable,
      accountError: observable,
    });
  }

  override initialize(client: HClient): void {
    this.client = client;
    this.initialized = true;
  }

  async load(siteRef: string, span: EmSpan): Promise<void> {
    const client = this.client;
    if (!client) return;
    runInAction(() => {
      this.loading = true;
      this.error = undefined;
      this.accountError = undefined;
    });
    try {
      const [factors, certs, targets] = await Promise.all([
        emFactors(client),
        emGreenCerts(client, siteRef),
        emCarbonTargets(client, siteRef),
      ]);

      // 碳账单独 try：因子录错（单位对不上、同年多版本）会抛错，
      // 但因子表本身正是排查那个错误的地方 —— 不能因为算不出账就把它藏起来
      let account: HGrid | undefined;
      let accountError: string | undefined;
      try {
        account = await emCarbonAccount(client, siteRef, span);
      } catch (e: unknown) {
        accountError = e instanceof Error ? e.message : String(e);
      }

      const progress: HDict[] = [];
      for (const tg of targets) {
        const tid = recId(tg);
        if (!tid) continue;
        try {
          const p = await emCarbonTargetProgress(client, tid, span);
          if (p) progress.push(p);
        } catch {
          // 目标缺 emBaseValue 之类的配置问题，那一行显示为「—」
        }
      }

      runInAction(() => {
        this.factors = factors;
        this.certs = certs;
        this.targets = targets;
        this.account = account;
        this.accountError = accountError;
        this.targetProgress = progress;
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

export interface EmissionRow {
  medium: string;
  mediumDis: string;
  scope: string;
  scopeDis: string;
  usage?: number;
  factor?: number;
  factorUnit?: string;
  emission?: number;
}

export interface FactorRow {
  id: string;
  dis: string;
  medium?: string;
  mediumDis: string;
  scope?: string;
  region?: string;
  year?: number;
  factor?: number;
  factorUnit?: string;
  sourceDoc?: string;
  locked: boolean;
  used: boolean;
}

export interface CertRow {
  id: string;
  dis: string;
  certType?: string;
  certNo?: string;
  vintage?: number;
  val?: number;
  retired: boolean;
}

export interface TargetRow {
  id: string;
  dis: string;
  type?: string;
  typeDis: string;
  targetYear?: number;
  base?: number;
  goal?: number;
  cur?: number;
  unit?: string;
  progress?: number;
  onTrack?: boolean;
}

const CERT_TYPE_DIS: Record<string, string> = {
  greenPower: "绿电",
  gec: "绿证",
  ccer: "CCER",
};

export class CarbonViewModel extends BaseViewModel<CarbonStore> {
  get loading(): boolean {
    return this.store.loading;
  }
  get error(): string | undefined {
    return this.store.error;
  }
  get accountError(): string | undefined {
    return this.store.accountError;
  }

  load(siteRef: string, span: EmSpan): void {
    void this.store.load(siteRef, span);
  }

  /** Grid meta 也是一个 HDict，`num`/`str` 直接可用。 */
  private meta(tag: string): number | undefined {
    const m = this.store.account?.meta;
    return m ? num(m, tag) : undefined;
  }

  get scope1(): number | undefined {
    return this.meta("emScope1");
  }
  get scope2(): number | undefined {
    return this.meta("emScope2");
  }
  get scope3(): number | undefined {
    return this.meta("emScope3");
  }
  get total(): number | undefined {
    return this.meta("emTotal");
  }
  get offset(): number | undefined {
    return this.meta("emOffset");
  }
  get net(): number | undefined {
    return this.meta("emNet");
  }
  get unit(): string {
    const m = this.store.account?.meta;
    return (m ? str(m, "emUnit") : undefined) ?? "kgCO2e";
  }
  get year(): number | undefined {
    return this.meta("emYear");
  }
  get region(): string | undefined {
    const m = this.store.account?.meta;
    return m ? str(m, "emRegion") : undefined;
  }

  /**
   * 本期没有因子的介质。
   * 必须显示 —— 缺因子的那部分能耗在碳账里是**零**，不说明就是漏报。
   */
  get missingMedia(): string[] {
    const m = this.store.account?.meta;
    const s = m ? str(m, "emMissing") : undefined;
    if (!s) return [];
    return s.split(",").filter(Boolean).map((x) => MEDIUM_DIS[x] ?? x);
  }

  /** 本期实际用到的因子 id 集合，用来在因子表里标「本期在用」。 */
  private get usedFactorIds(): Set<string> {
    const set = new Set<string>();
    const g = this.store.account;
    if (!g) return set;
    gridRows(g).forEach((r) => {
      const v = ref(r, "emFactorRef");
      if (v) set.add(v);
    });
    return set;
  }

  get emissionRows(): EmissionRow[] {
    if (!this.store.account) return [];
    return gridRows(this.store.account).map((d) => {
      const medium = str(d, "emMedium") ?? "?";
      const scope = str(d, "emScope") ?? "?";
      return {
        medium,
        mediumDis: MEDIUM_DIS[medium] ?? medium,
        scope,
        scopeDis: SCOPE_DIS[scope] ?? scope,
        usage: num(d, "val"),
        factor: num(d, "emFactor"),
        factorUnit: str(d, "emFactorUnit"),
        emission: num(d, "emEmission"),
      };
    });
  }

  get factorRows(): FactorRow[] {
    const used = this.usedFactorIds;
    return this.store.factors
      .map((d) => {
        const medium = str(d, "emMedium");
        const fid = recId(d) ?? "";
        return {
          id: fid,
          dis: str(d, "dis") ?? fid,
          medium,
          mediumDis: medium ? (MEDIUM_DIS[medium] ?? medium) : "—",
          scope: str(d, "emScope"),
          region: str(d, "emRegion"),
          year: num(d, "emYear"),
          factor: num(d, "emFactor"),
          factorUnit: str(d, "emFactorUnit"),
          sourceDoc: str(d, "emSourceDoc"),
          locked: has(d, "emLocked"),
          used: used.has(fid),
        };
      })
      .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  }

  get certRows(): CertRow[] {
    return this.store.certs.map((d) => {
      const ct = str(d, "emCertType");
      return {
        id: recId(d) ?? "",
        dis: str(d, "dis") ?? "",
        certType: ct,
        certNo: str(d, "emCertNo"),
        vintage: num(d, "emVintage"),
        val: num(d, "val"),
        retired: has(d, "emRetired"),
      };
    });
  }

  certTypeDis(t?: string): string {
    return t ? (CERT_TYPE_DIS[t] ?? t) : "—";
  }

  get targetRows(): TargetRow[] {
    const byRef: Record<string, HDict> = {};
    this.store.targetProgress.forEach((p) => {
      const v = ref(p, "emTargetRef");
      if (v) byRef[v] = p;
    });
    return this.store.targets.map((tg) => {
      const tid = recId(tg) ?? "";
      const p = byRef[tid];
      const type = str(tg, "emTargetType");
      return {
        id: tid,
        dis: str(tg, "dis") ?? tid,
        type,
        typeDis: type === "intensity" ? "强度型" : type === "absolute" ? "总量型" : "—",
        targetYear: num(tg, "emTargetYear"),
        base: num(tg, "emBaseValue"),
        goal: num(tg, "emTargetValue"),
        cur: p ? num(p, "cur") : undefined,
        unit: p ? str(p, "emUnit") : undefined,
        progress: p ? num(p, "progress") : undefined,
        onTrack: p ? p.get("onTrack")?.toJSON() === true : undefined,
      };
    });
  }

  progressTone(r: TargetRow): Tone {
    if (r.progress === undefined) return "neutral";
    if (r.progress >= 1) return "ok";
    if (r.progress >= 0.6) return "warn";
    return "danger";
  }

  fmtNum = fmtNum;
  fmtPct = fmtPct;
}
