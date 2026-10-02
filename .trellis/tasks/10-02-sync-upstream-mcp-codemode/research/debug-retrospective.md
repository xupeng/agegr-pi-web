# Debug retrospective: security provenance and inner Markdown identity

## 1. Root cause categories

- **B/C — cross-layer source policy and propagation:** a render-facing decorated-name parser
  became the source of a host completion snapshot. Direct-result authorization rejected the
  remote summary, but the parent saw only exact `Agent.writtenFiles`, losing child provenance.
- **C — session tool carry omission:** new upstream navigation retained session-level tools,
  but omitted the fork's already-active `ask_user`.
- **D/E — coverage gap and implicit React identity:** a stable message entry key was mistaken
  for stable descendants. The 10s file-index refresh changed component function types and
  remounted P, not the outer message/list. This lookup dependency existed at L.
- **E — fixture geometry assumption:** compact mobile controls mean two messages can fit in a
  300px viewport. The actual contract is width stability when overflow changes, not mandatory
  scrolling at that exact height. The mobile fixture now uses 180px, retaining assertions.

## 2. Why initial interpretations were insufficient

- Direct spoof negatives did not exercise child → snapshot → parent authorization; all static
  gates passed while the transitive source-policy gap remained.
- `data-entry-id=e4998` on replacement nodes did not prove the original P survived. The first
  browser report correctly retained a full-suite failure rather than accepting replacement text.
- Session_start/full refresh occurred near the browser failure, but the distinguishing observer
  evidence showed P-only removal and a connected outer wrapper during a normal index TTL.
  Re-keying the list or suppressing SSE/refresh would have targeted the wrong owner.
- Separate targeted browser passes establish coverage but never replace the unfiltered gate.
  The TTL diagnostic's later reading-offset failure is still retained; an ordinary desktop pass
  does not erase it. Final independent whole-suite verification is pending at this writing.
- The later reading-offset diagnostic distinguished capture from restoration: raw captured
  values were 9275/-2275/120px, and stable 120 restored to 120. The test waited for one network
  response while IntersectionObserver continued a prepend cascade. Main approved test-only
  capture stabilization: re-park at 120 until two frame samples are within the original <5px
  tolerance and no older request is outstanding, within 30s. Restoration is not re-parked;
  its original assertion remains. No product scroll-precedence change was made.

## 3. Prevention mechanisms

| Priority | Mechanism | Action / status |
| --- | --- | --- |
| P0 | Source policy | Explicit render/snapshot policy and one exact-result gate; fresh/resume runtime use snapshot — implemented |
| P0 | Cross-layer regression | Complete child → host details → parent grant negative plus real fresh/reopen tests — passing |
| P1 | Navigation | Carry only previously active, registered, visible ask; inactive/hidden/Chat-only regressions — passing |
| P1 | React identity | Consume index context inside stable named renderers; actual-source memo tests — 0/2 before, 2/2 after |
| P1 | Browser | Retain original DOM handle and overflow/alignment assertions; independent unfiltered final run — pending |
| P2 | Spec | Source/identity contracts in clickable-file-paths, runtime contract in mcp-codemode, ask carry in ask-user-protocol — updated |

## 4. Systematic expansion and limitations

Decorated-name render helpers are not authentication. Audit any further render→host snapshot
promotion rather than copying parsers or tightening all UI names. Exact historical Agent records
that already lost child provenance remain a disclosed limitation; this task does not migrate
them or silently prohibit U's allowed model/Agent reference policy.

Memoized renderer factories can remount stateful code/Mermaid blocks as well as P when a dynamic
context value becomes a factory dependency. Inspect element types and subtree removal, not only
outer keys. Do not freeze context to preserve identity: current lookup removal must remove links.

## 5. Knowledge capture

Updated `.trellis/spec/frontend/{clickable-file-paths,mcp-codemode,ask-user-protocol}.md` and
`guides/upstream-sync.md`. This application has no `src/templates/markdown/spec/` distribution
tree, so no unrelated Trellis/template modification is appropriate. Spec commits stay in this
task's batch after explicit one-shot confirmation; this retrospective is not permission to commit.

Evidence owners: `independent-check.md`, `browser-verification.md`, `pagination-fix.md`; raw logs
remain local/ignored. None of these intermediate reports certifies a final merge ancestor or AC6.
