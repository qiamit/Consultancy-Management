# QE 4-agent workflow (Cursor)

Four Cursor chats work in one repo, one session at a time. They hand work to each other through files in `docs/agents/`, plus one `NEXT:` line that Amit pastes into the next chat.

```
QE Planner ──(plan + coder prompt, Amit approves)──▶ QE Coder ──(commit + push)──▶ QE Auditor ──(audit report)──▶ QE Tester ──(live test report)──▶ QE Planner ──▶ English summary, then Hindi summary, to Amit ──▶ next plan
```

Rules: `.cursor/rules/05-qe-standards.mdc` (always on) and one role rule per chat (`qe-planner.mdc`, `qe-coder.mdc`, `qe-auditor.mdc`, `qe-tester.mdc`).

---

## हिंदी: शुरू कैसे करें

1. Cursor में यह repo खोलिए। चार नई chats बनाइए (`Cmd+T` या `+ New Chat`), और हर chat का नाम बदल दीजिए (chat title पर double-click या right-click → Rename):
   - **QE Planner**: mode **Agent**. Plan और रिपोर्ट files लिखनी हैं, इसलिए Ask mode नहीं चलेगा, क्योंकि Ask mode files नहीं लिख सकता। Rule इसे code छूने नहीं देता। सिर्फ़ सोच-विचार करना हो तो Plan mode भी ठीक है।
   - **QE Coder**: mode **Agent**. सिर्फ़ यही chat code बदलती है और commit/push करती है।
   - **QE Auditor**: mode **Agent**, code पर read-only (सिर्फ़ audit report लिखती है)। बिना report वाला सिर्फ़ review चाहिए तो Ask mode भी चलेगा।
   - **QE Tester**: mode **Agent**. Cursor का browser, read-only DB और Railway logs इस्तेमाल करती है; code नहीं बदलती।
2. हर chat में नीचे दिया "पहला message" paste कीजिए।
3. उसके बाद हर agent अपने जवाब के आख़िर में एक `NEXT:` line देगा। उसे copy करके बताई गई chat में paste कीजिए। बस इतना ही करना है।
4. एक समय पर एक ही session (जैसे S6) चलाइए। Coder का काम ख़त्म होने से पहले Planner से अगला plan code मत करवाइए।
5. Password कभी chat में मत लिखिए। Tester को login चाहिए तो वो आपसे कहेगा, और आप Cursor के browser में ख़ुद login कर दीजिए।
6. Planner plan बनाकर रुकेगा। Plan पढ़कर "approve" लिखिए, या जो बदलना है वो बताइए। Approve के बाद ही Coder को काम मिलेगा।

## English: quick start

1. Create 4 chats named **QE Planner**, **QE Coder**, **QE Auditor** and **QE Tester**, all in **Agent** mode. The role rules enforce the limits: Planner and Auditor never touch code, and Tester never touches code or git. Plan mode is fine for brainstorming in the Planner chat. Ask mode can't write report files.
2. Paste the first message below into each chat.
3. After that, copy each agent's final `NEXT:` line into the chat it names.
4. Run one session at a time. Optional: if you ever want two coders in parallel, use Cursor's worktree option for parallel agents so each gets its own copy of the repo. Merge through a branch and PR, never by pushing two sessions to `main` at once.

### First message for each chat (paste once)

**QE Planner**
```
@qe-planner You are QE Planner for this repo. Read .cursor/rules/qe-planner.mdc, .cursor/rules/05-qe-standards.mdc, docs/agents/README.md, docs/agents/STATUS.md, docs/agents/decisions.md and docs/agents/BASELINES.md. Then tell me in Hindi the current status and the next step for session S6. Do not write any code.
```

**QE Coder**
```
@qe-coder You are QE Coder for this repo. Read .cursor/rules/qe-coder.mdc, .cursor/rules/05-qe-standards.mdc and docs/agents/STATUS.md. Confirm in 3 lines that you understand the ORDER + STOP RULES, then wait. Do not change anything until I paste "Execute docs/agents/plans/<ID>_coder_prompt.md".
```

**QE Auditor**
```
@qe-auditor You are QE Auditor for this repo (read-only on code). Read .cursor/rules/qe-auditor.mdc, .cursor/rules/05-qe-standards.mdc and docs/agents/STATUS.md. Confirm in 3 lines, then wait for "Start audit for <ID>".
```

**QE Tester**
```
@qe-tester You are QE Tester for this repo (live site, DB read-only/rollback, browser; never edit code). Read .cursor/rules/qe-tester.mdc, .cursor/rules/05-qe-standards.mdc and docs/agents/STATUS.md. Run `node --check docs/agents/tests/db-run.mjs` and confirm in 3 lines, then wait for "Start testing for <ID>".
```

If pasting `@qe-…` doesn't turn into a rule chip, type `@`, pick the rule from the list, then paste the rest. The message also names the rule file, so it works either way.

### Trigger lines (the agents print these; you only paste them)
| From | Paste into | Text |
|---|---|---|
| Planner (after you approve) | QE Coder | `@qe-coder Execute docs/agents/plans/<ID>_coder_prompt.md` |
| Coder (success) | QE Auditor | `@qe-auditor Start audit for <ID> (commit <hash>)` |
| Coder (STOP) | QE Planner | `@qe-planner <ID> coding STOPPED — read docs/agents/reports/coding/<ID>_coding.md` |
| Auditor (OK) | QE Tester | `@qe-tester Start testing for <ID> (commit <hash>)` |
| Auditor (BLOCKER) | QE Planner | `@qe-planner <ID> audit has BLOCKERS — read docs/agents/reports/audit/<ID>_audit.md` |
| Tester | QE Planner | `@qe-planner Testing done for <ID> — read docs/agents/reports/testing/<ID>_testing.md` |

## Files
| Path | Purpose | Written by |
|---|---|---|
| `STATUS.md` | Handoff board: current session, stage, owner, next action, log | all |
| `decisions.md` | Amit's decisions (the source of truth for business rules) | Planner |
| `BASELINES.md` | typecheck / lint / build numbers + DB sanity counts | Coder |
| `api-catalog.md` | RPCs and endpoints an AI bot / future MCP server can call | Coder |
| `plans/<ID>_plan.md`, `plans/<ID>_coder_prompt.md` | Session plan and the exact prompt for the Coder | Planner |
| `reports/coding/<ID>_coding.md` | Verify numbers, migrate output, commit, files | Coder |
| `reports/audit/<ID>_audit.md` | Findings by severity, "Tester must check" | Auditor |
| `reports/testing/<ID>_testing.md` | Live, DB and browser results, leftovers | Tester |
| `tests/db-run.mjs`, `tests/<ID>_*.sql` | DB test runner (always rolled back) and test scripts | Tester |

All of these hold no secrets and are committed by the Coder with each session (`git add docs/agents`). `docs/prompts/` stays untracked.

Grok Bot (outside Cursor) can still verify the live site and DB independently and draft plans. Its prompts can be dropped into `docs/agents/plans/<ID>_coder_prompt.md` for the Planner to review.
