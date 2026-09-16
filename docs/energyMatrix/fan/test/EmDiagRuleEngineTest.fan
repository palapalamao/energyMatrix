using haystack

** Regression coverage for diagnostic rule ordering.
class EmDiagRuleEngineTest : HaystackTest
{
  private static Dict rule(Str code, Str severity) {
    Etc.makeDict(["emRuleCode": code, "emSeverity": severity])
  }

  Void test_sortRules_acceptsReadonlyList() {
    rules := Dict[
      rule("I-01", EmSeverity.info),
      rule("C-01", EmSeverity.critical),
      rule("W-01", EmSeverity.warn),
    ].toImmutable

    sorted := EmDiagRuleEngine.sortRules(rules)

    verifyEq(sorted.map |Dict r->Str| { r["emRuleCode"].toStr },
             ["C-01", "W-01", "I-01"])
    verifyEq(rules.map |Dict r->Str| { r["emRuleCode"].toStr },
             ["I-01", "C-01", "W-01"])
  }
}
