# Proposed portal architecture toolchain comparison

Date: 2026-04-27

## Source model

Model file:

```txt
proposals/sales-school/diagrams/models/03-portal-architecture.yaml
```

The model treats diagram 03 as a survey view. It separates:

- MVP page hierarchy.
- Today as the live-session surface.
- Wistia as the kept media layer.
- Search, progress, admin editing, cohorts, and login as optional later scope.
- Transcript indexing as omitted from this visible diagram retry.

## Toolchain outputs

Output directory:

```txt
proposals/sales-school/diagrams/toolchain
```

Generated files:

```txt
03-portal-architecture-outline.html
03-portal-architecture.dot
03-portal-architecture-graphviz.svg
03-portal-architecture-review.html
checks/03-portal-architecture/report.json
checks/03-portal-architecture/desktop.png
checks/03-portal-architecture/mobile.png
checks/03-portal-architecture/reduced-motion.png
checks/03-portal-architecture/print.pdf
```

## Checks

Source model lint:

```txt
0 errors
0 warnings
```

Browser check:

```txt
0 errors
0 warnings
0 axe violations
```

The browser checker now includes a horizontal overflow check. The first run found mobile overflow in the combined review page. The page renderer was adjusted so the review page now fits the mobile viewport and passes the check.

## Comparison with WAWCO SVG

Current WAWCO image source:

```txt
proposals/sales-school/diagrams/svg/03-portal-architecture.svg
```

Current WAWCO PNG:

```txt
proposals/sales-school/diagrams/png/03-portal-architecture.png
```

The WAWCO SVG matches the validated model on the main structure:

- Course home at `/sales-school`.
- Today as the live surface.
- Day One and Day Two as peer sections.
- Breakouts 1 through 3 under Day One.
- Breakouts 4 through 6 under Day Two.
- Resources and Facilitator as peer support pages.
- Wistia shown as the kept media layer.
- Optional later band with search, progress, admin editing, cohorts, and login.

One visual mismatch was corrected:

- The generator previously gave the Course home root a WAWCO blue top rule.
- The source model reserves the WAWCO blue accent for the Today live surface.
- `generate-diagrams.py` was updated so Course home uses a black rule and Today remains blue.
- SVG and PNG outputs were regenerated.

Remaining difference between toolchain and final WAWCO rendering:

- The model records each breakout page using Wistia media.
- The WAWCO image intentionally compresses those relations into one kept media layer band.
- This is a good client-facing reduction because the relation table carries the detailed source trace.

## Integration guidance

Diagram 03 is ready as a candidate for proposal integration if Noah approves using image diagrams.

Use the PNG for visual placement and keep the SVG plus generator for editability. Keep a caption and text equivalent near the image because the PNG intentionally does not carry every relation, evidence record, or source note.
