# Agent Routing

Current as of 2026-04-24.

Use this file to coordinate Cursor, pi, Codex CLI, and Claude CLI on `whatarewecapableof.com`.

## Default division of labor

| Tool | Use for | Avoid using for |
|---|---|---|
| Cursor | Visual navigation, side-by-side HTML/CSS/image review, manual edits where directory context matters. | Long autonomous refactors without a written task boundary. |
| pi | Planning, repo inspection, task routing, browser validation, MCP work, project memory, final synthesis. | Large unsupervised visual implementation passes. |
| Codex CLI | Bounded implementation: scripts, bulk path edits, lint/build fixes, small refactors with clear file ownership. | Open-ended design judgment or brand copy. |
| Claude CLI | Architecture review, design-system critique, HTML/CSS review, documentation, second-pass checks. | Blind bulk edits across many files without a plan. |

## Required context before editing

Read these first:

1. `docs/directory-map.md`
2. `docs/asset-inventory.md`
3. `design/sitemap.md`
4. `design/system-constraints.md`
5. `design/taste-profile/profile.md` when the task touches layout, type, image density, visual hierarchy, or motion.

For proposal pages, also read:

1. `PROPOSALS.md`
2. `proposals/_template/index.html`
3. The active proposal file, for example `proposals/compassion/index.html`.

## Cursor as viewer

Cursor is primarily a viewing layer for this project. Use it to keep the file tree, generated dashboard, source files, and local preview visible at the same time. Do not treat Cursor as the default editing surface unless Noah explicitly wants to edit there.

Open the visual dashboard through a local server:

```txt
http://localhost:8888/docs/site-dashboard.html
```

## Standard workflow

### 1. Inspect

Use pi or Cursor to review the current state:

```bash
git status --short
find . -maxdepth 3 -type d | sort
npm run scan:assets
```

Open these files in Cursor:

```txt
docs/site-dashboard.html through Simple Browser
docs/directory-map.md
docs/asset-inventory.md
proposals/compassion/index.html
proposals/compassion/img/
css/components.css
```

### 2. Bound the task

Write the task in this shape before delegating:

```txt
Goal:
Allowed files:
Do not edit:
Validation commands:
Expected handoff:
```

Keep one agent responsible for one directory or file group. Do not let two agents edit the same proposal file at once.

### 3. Implement

Use Cursor for visual edits and inspection. Use Codex for bounded code changes. Use pi for small precise edits or coordination.

### 4. Review

Use Claude CLI for review when the change touches:

- Site architecture.
- Proposal template structure.
- Design-system constraints.
- Accessibility-sensitive HTML.
- Image-heavy layout.
- Any refactor spanning more than one page type.

### 5. Validate

Run:

```bash
npm run scan:assets
python3 -m http.server 8888
```

Then open:

```txt
http://localhost:8888
http://localhost:8888/proposals/compassion
http://localhost:8888/proposals/compassion/
```

Check both slash forms for proposal pages because asset paths must work in both cases.

## Codex task templates

### Asset scanner or asset cleanup

```txt
Project root: ~/Projects/whatarewecapableof

Goal:
Improve the asset management tooling without changing page design.

Allowed files:
- scripts/scan-assets.mjs
- docs/asset-inventory.md
- docs/asset-inventory.json
- package.json, only if adding or updating npm scripts

Do not edit:
- proposals/*/index.html
- proposals/*/img/**
- css/**
- design/reference-analysis/**

Rules:
- Preserve the root-relative path rule for local assets.
- Report missing local assets and relative local asset references separately.
- Treat design/reference-analysis as working reference material.

Validation:
- npm run scan:assets
- git diff -- scripts/scan-assets.mjs docs/asset-inventory.md docs/asset-inventory.json package.json

Handoff:
Write a summary with changed files, commands run, findings, and unresolved issues.
```

### Bulk path replacement

```txt
Project root: ~/Projects/whatarewecapableof

Goal:
Replace fragile local asset paths with root-relative paths in one proposal page.

Allowed files:
- proposals/<slug>/index.html

Do not edit:
- proposal images
- shared CSS
- other proposal pages

Rules:
- Convert local assets to /proposals/<slug>/img/...
- Preserve external URLs.
- Preserve mailto links.
- Do not change copy or layout.

Validation:
- npm run scan:assets
- rg 'src="img/|href="img/' proposals/<slug>/index.html
- Open both /proposals/<slug> and /proposals/<slug>/ locally.

Handoff:
List every changed reference and any remaining relative local path.
```

## Claude review templates

### Proposal page review

```txt
Project root: ~/Projects/whatarewecapableof

Read:
- docs/directory-map.md
- docs/asset-inventory.md
- design/system-constraints.md
- design/taste-profile/profile.md
- proposals/_template/index.html
- proposals/<slug>/index.html

Task:
Review the proposal page structure for path safety, design-system alignment, accessibility, and maintainability. Do not edit files.

Return:
- Findings by severity.
- Exact file and line references where possible.
- Recommended changes that preserve the current visual direction.
```

### Directory architecture review

```txt
Project root: ~/Projects/whatarewecapableof

Read:
- docs/directory-map.md
- docs/agent-routing.md
- docs/asset-inventory.md
- design/sitemap.md
- design/system-constraints.md

Task:
Review whether the directory structure can support future creative case studies, proposal pages, and image-heavy work. Do not edit files.

Return:
- Current structure strengths.
- Fragile areas.
- Recommended next structural moves.
- Decisions that need Noah before implementation.
```

## Git rules

- Run `git status --short` before editing.
- Preserve uncommitted user work.
- Use a branch for structural changes.
- Keep generated inventory changes with the script or asset changes that caused them.
- Review `git diff` before committing or handing off.

## Handoff format

Use this format when any agent finishes:

```md
## Handoff

### Changed files
- ...

### Commands run
- ...

### Findings
- ...

### Validation status
- Passed:
- Not run:

### Open issues
- ...
```
