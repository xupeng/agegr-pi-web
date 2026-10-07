// Test-only extension: real public registration, no credential or endpoint substitution.
export default function authReadinessFixture(pi) {
  const fixture = globalThis.__subagentNativeAuthReadiness;
  if (!fixture) throw new Error("Missing owned auth-readiness fixture");
  fixture.factories++;
  pi.registerProvider(fixture.provider);
  pi.registerProvider(fixture.sentinel.provider);
  pi.on("session_start", () => {
    fixture.starts++;
    if (fixture.failBinding) pi.registerProvider("gateway", { models: [{ id: "fixture-gpt", name: "broken registration" }] });
  });
}
