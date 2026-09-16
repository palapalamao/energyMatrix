/** Ref-valued creation tags shared by Axon serialization and contract tests. */
export const CREATE_REF_TAGS = {
  meter: ["submeterOf", "floorRef", "emSpaceRef", "emTenantRef", "emServesRef"],
  virtualMeter: ["submeterOf", "floorRef", "emSpaceRef", "emTenantRef", "emServesRef"],
  loadGroup: ["emMeterRef", "floorRef", "emSpaceRef", "emTenantRef"],
} as const;
