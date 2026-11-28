# A3-G interrupted execution recovery

The worktree `prolingo-p12-integration-qa` was on `test/text-v2-uat` at `2d3e435d30c912902b45955ab2b3c95de4a15175` on recovery. The index was empty. The working tree contained 19 modified files and four untracked source files. Normal and UAT builds from the recovered worktree both exited 0. No A3-G acceptance report, new audit script, or published A3-G evidence was present. The A3 commit and existing A3 and HF2 artifacts were preserved.

| Package | Recovery status | Existing evidence | Remaining work |
| --- | --- | --- | --- |
| G-P1 | IMPLEMENTED BUT NOT VERIFIED | Book intent and queue planner, existing scoped source path | Test authored bounds, channel policy, heading inclusion and Full fallback against the actual runtime. |
| G-P2 | PARTIALLY IMPLEMENTED | Book adapter to existing session executor, transport and Ready preview | Validate repeat navigation, exact Continue and stale-snapshot rejection, including transitions during waits. |
| G-P3 | PARTIALLY IMPLEMENTED | Shared activation and Reader context, Follow and Return controls | Verify all four views, manual focus independence and pending-selection priority. |
| G-P4 | IMPLEMENTED BUT NOT VERIFIED | Seven normalized timing fields, edge resolver, grouped Reset | Verify precedence and interaction with actual media, skipped work and cancellation. |
| G-N | PARTIALLY IMPLEMENTED | UAT-only tab shell, native Table guard, Legacy gate, document lifecycle | Verify Table authority and tab disposal. Legacy bootstrap can initialize or write Text v1 and is explicitly gated in this shell. |
| Integrated verification | NOT STARTED | Recovered build success and clean diff check | Add focused evidence and run final regression and build checks. |
| Reports and integrated owner UAT | NOT STARTED | Existing A3 and HF2 reports and original instructions | Complete the handoff and combined Indonesian checklist. |

The combined A3 and A3-G owner UAT remains NOT CONFIRMED. Production activation remains NO-GO.

## Continuation result

G-P1, G-P2, G-P3 and G-P4 completed focused Node and integrated Edge verification. G-N completed within the authorized Table/Book and Legacy-gate boundary. The first HF2 run exposed one stale live-timeline frame. After the Book observation subscription correction, final HF2 checks found zero false live-timeline frames. Final integrated A3/A3-G browser, HF2 fixture browser, native EN/ID Edge, sequential normal/UAT builds, focused lint comparison and diff checks each exited 0. The remaining gate is independent A3-G review and combined owner UAT. The [implementation report](A3G_Book_QA_Implementation_Report.md) lists every changed file and the [evidence](artifacts/a3g-book-qa-evidence.json) retains the final measured values.
