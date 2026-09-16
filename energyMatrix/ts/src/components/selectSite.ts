export interface SiteChoice {
  ref?: string;
  dis?: string;
  synthetic?: boolean;
  dataProvenance?: string;
}

const PRIMARY_SITE_DIS = "某医院";
const CURRENT_DEMO_GENERATION = "hospital-rich-demo-20260913";

export function selectSiteRef(
  sites: readonly SiteChoice[],
  currentRef?: string
): string | undefined {
  const validSites = sites.filter((site): site is SiteChoice & { ref: string } => !!site.ref);
  if (currentRef && validSites.some((site) => site.ref === currentRef)) return currentRef;

  const currentDemo = validSites.find(
    (site) => site.dis === PRIMARY_SITE_DIS && site.dataProvenance === CURRENT_DEMO_GENERATION,
  );
  if (currentDemo) return currentDemo.ref;

  const canonicalHospital = validSites.find((site) => site.dis === PRIMARY_SITE_DIS);
  if (canonicalHospital) return canonicalHospital.ref;

  const syntheticDemo = validSites.find((site) => site.synthetic);
  return syntheticDemo?.ref ?? validSites[0]?.ref;
}
