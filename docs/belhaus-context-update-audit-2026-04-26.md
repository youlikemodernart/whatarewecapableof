# Session Context Capture Audit: BELHAUS proposal composition

Created 2026-04-26 by running the `context-update` prompt for the BELHAUS proposal visual composition session.

## Superseding note

This audit captures the earlier local slot-board and graphics-handoff state. Later on 2026-04-26, the approved slot-board direction was incorporated locally into the active BELHAUS proposal source. Current state: BEL-01 and BEL-03 are live HTML/CSS objects in `proposals/belhaus/index.html`, BEL-02 is a five-work private catalog artifact, BEL-04 is a live approval timeline, final assets exist under `proposals/belhaus/img/`, and no deploy has been run. Use `docs/belhaus-composition-handoff.md`, `proposals/belhaus/media-slots.md`, and current project memory for the latest state.

## 1. Session summary

This session corrected the BELHAUS proposal work from the old standalone BELHAUS-styled repo to the active What are we capable of? proposal route. It created a WAWCO-native in-flow slot board, pulled Are.na images tagged `BEL-02` and `FAVE`, placed atmosphere images on all three proposal tabs, replaced the BEL-02 placeholder with a local image artifact, and adjusted proposal typography so body-like lists and tables stop using smaller text for emphasis. The main durable context is: BELHAUS proposal edits now belong in the WAWCO repo; future graphics should be generated in the WAWCO visual system; image placement is locally approved; and proposal typography needs a role-based size rule, not size-based emphasis.

## 2. Candidate context items

| Item | Classification | Why it matters | Recommended destination | Priority |
|---|---|---|---|---|
| Active BELHAUS source is `~/Projects/whatarewecapableof/proposals/belhaus/index.html`, not `~/Projects/belhaus-proposal/`. | Confirmed fact | Prevents future agents from editing the historical standalone repo. | Project memory, PROPOSALS, belhaus-advisor, handoff docs | High |
| Future BELHAUS proposal visuals must use WAWCO taste/profile, not standalone BELHAUS styling. | Decision | Prevents wrong visual language. | Project memory, belhaus-advisor, composition reference | High |
| Local slot board exists at `proposals/belhaus/slots/index.html`. | Project state | Fresh sessions need to preview the current composition draft. | Project memory, handoff docs | High |
| Slot guide and manifest exist at `proposals/belhaus/media-slots.md` and `.json`. | Project state | Provides the canonical slot map for the fresh graphics session. | Project memory, PROPOSALS, handoff docs | High |
| Noah likes the current local atmosphere image placements. | Preference | Future session should preserve those placements unless a stronger reason appears. | BELHAUS graphics handoff, project memory | High |
| Are.na channel `BELHAUS Media` has BEL-02 and FAVE tagged assets. | Confirmed fact | Fresh session can pull or verify assets without rediscovery. | BELHAUS graphics handoff, media-slots files | Medium |
| Local source images live under ignored `proposals/belhaus/img/src/`. | Project state | Prevents accidental deployment or deletion of raw draft assets. | Handoff docs, project memory | High |
| BEL-01 and BEL-03 need generated WAWCO-style diagrams. | Project state | This is the next fresh-session task. | BELHAUS graphics handoff | High |
| BEL-04 approval sequence can likely remain HTML timeline. | Decision | Avoids generating a bitmap where live accessible text is better. | BELHAUS graphics handoff | Medium |
| BEL-02 is better as an HTML artifact using real artwork images unless Noah asks for a single flattened graphic. | Decision | Prevents overpolished fake app UI. | BELHAUS graphics handoff | Medium |
| Typography issue: the template used `--size-s` for scope lists and tables, producing visible size shifts on Approach. | Bug or gotcha | Future proposal pages may repeat the same bad hierarchy if template is not understood. | Repo template, proposal docs, WAWCO project memory | High |
| Working typography rule: size is for role, not emphasis; body prose, body-like lists, and table body should use `--size-m`; small sizes are for metadata, labels, captions, and dense apparatus. | Decision | Keeps WAWCO proposal hierarchy consistent with Noah's preference. | Template, design/system docs after approval, WAWCO memory | High |
| Bold is acceptable for inline emphasis or wayfinding, but not for headings or structural hierarchy. | Decision | Reconciles current proposal behavior with the taste profile. | System docs after approval, WAWCO memory | Medium |
| Do not further change WAWCO taste profile or global constraints without explaining impact first. | Preference | Noah explicitly wants care before system-level changes. | WAWCO memory, handoff docs | High |
| Graphic-system path is `~/Projects/graphic-system`; use `profile.typeStack: live-site` for proposal graphics matching current live WAWCO proposal typography. | Workflow | Fresh graphics session needs the correct rendering path. | BELHAUS graphics handoff, graphic-system memory | High |
| Generated graphic-system outputs remain review artifacts until Noah approves copying into WAWCO proposal assets. | Workflow | Prevents premature live proposal changes. | BELHAUS graphics handoff, graphic-system memory | High |
| Tone fixes were applied to active BELHAUS proposal before media insertion. | Project state | Review before publish if Noah wants those separated from visual work. | BELHAUS composition handoff | Medium |
| Browser QA passed for slot board at 375, 768, 1280, and 1600 widths with no horizontal overflow. | Project state | Useful validation baseline. | BELHAUS composition handoff | Medium |
| Old standalone slot directory was removed and old `.gitignore` cleanup was done. | Project state | Prevents confusion if old repo appears clean. | BELHAUS composition handoff | Low |

## 3. Recommended changes

### `~/.pi/projects/-Users-noah--pi/memory/project_belhaus.md`

Status: update existing file  
Applies to: both  
Reason: future BELHAUS sessions should know image placement is locally approved and graphics generation is next.  
Proposed change: add a short note under current status that the WAWCO local slot board now includes accepted FAVE atmosphere placements, BEL-02 image artifact draft, typography trial, and a graphics handoff at `~/Projects/whatarewecapableof/docs/belhaus-graphics-generation-handoff.md`.

### `~/.pi/projects/-Users-noah--pi/memory/project_whatarewecapableof.md`

Status: update existing file  
Applies to: both  
Reason: the typography correction affects the proposal template and future proposal pages.  
Proposed change: add a concise proposal-system note: size changes should be role-based, not emphasis-based; body-like scope lists and table bodies now use `--size-m`; small sizes are reserved for labels, metadata, captions, and table headers.

### `~/.pi/projects/-Users-noah--pi/memory/reference_whatarewecapableof_proposal_composition.md`

Status: update existing file  
Applies to: both  
Reason: this is the durable reference for proposal composition.  
Proposed change: add BELHAUS as the second composition case after Teaspressa, including local slot board path, Are.na channel, accepted atmosphere placements, and next graphics slots. Add a typography gotcha about role-based size.

### `~/Projects/whatarewecapableof/PROPOSALS.md`

Status: update existing file  
Applies to: repo-local  
Reason: central proposal tracker should point to the new graphics handoff.  
Proposed change: update BELHAUS media slot note with the graphics handoff path and the fact that FAVE atmosphere placements are locally approved.

### `~/Projects/whatarewecapableof/docs/belhaus-graphics-generation-handoff.md`

Status: new file  
Applies to: repo-local  
Reason: requested fresh-session handoff for graphic generation.  
Proposed change: include read-first list, current approved image placements, graphics needed, draft graphic-system briefs, validation checklist, fresh-session workflow, and do-not-do list.

### `~/Projects/whatarewecapableof/design/system-constraints.md`

Status: update existing file later, not now  
Applies to: repo-local  
Reason: system-level typography rule needs care.  
Proposed change: after Noah approves, reconcile the bold and size rules. Suggested language: bold is allowed only for inline emphasis or inline wayfinding; size is for role, not emphasis; body prose and body-like lists stay at `--size-m`; small text is for labels, metadata, captions, and dense data apparatus.

### `~/Projects/whatarewecapableof/design/taste-profile/profile.md`

Status: do not update yet  
Applies to: repo-local  
Reason: Noah asked to explain contradictions before affecting the system too much.  
Proposed change: none until Noah explicitly approves a profile-level rewrite.

## 4. Dual-harness implications

No mirrored MCP or global instruction changes are required.

Shared project memory updates should use canonical `~/.pi/...` paths. The BELHAUS advisor agent was already updated earlier in the session to point future work at the WAWCO proposal, but no new agent update is strictly required from this later image and typography pass.

If an agent update is later desired, mirror both files:

```txt
~/.pi/agent/agents/belhaus-advisor.md
~/.pi/agents/belhaus-advisor/AGENT.md
```

No skill file update is required yet. A future update to the proposal composition skill or WAWCO docs may be warranted if the role-based typography rule repeats across more proposals.

## 5. Proposed implementation plan

1. Verify current git status in `~/Projects/whatarewecapableof`.
2. Keep the local slot board and raw image sources ignored.
3. Write the BELHAUS graphics generation handoff.
4. Update BELHAUS project memory with accepted local image placement and graphics-next status.
5. Update WAWCO project memory with the typography lesson.
6. Update the composition reference with BELHAUS as a live composition case.
7. Do not change global WAWCO taste profile until Noah approves a system-level rule edit.
8. Verify no secrets, tokens, or private env values are captured.
9. Summarize final changed files.

## 6. Questions before editing

No clarification needed for the repo-local handoff. System-level typography documentation should wait for explicit approval because it affects the WAWCO design system beyond BELHAUS.
