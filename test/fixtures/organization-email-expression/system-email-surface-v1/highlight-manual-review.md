# System Email Surface v1.4 highlight review

Date: 2026-07-26
Reviewer: Noah

## Client matrix

| Client | Version / OS | Light | Dark | Wrapping | Notes |
| --- | --- | --- | --- | --- | --- |
| Gmail web | | | | | |
| Gmail iOS | | | | | |
| Apple Mail macOS | | | | | |
| Apple Mail iPhone | | | | | |

## Color review

| Color | Hex | Light | Dark | Keep? | Notes |
| --- | --- | --- | --- | --- | --- |
| Butter | #FFF2A8 | | | | |
| Sun | #FFE08A | | | | |
| Sand | #F1E5C8 | | | | |
| Peach | #F8D7C4 | | | | |
| Coral | #F5C2B8 | | | | |
| Blush | #F3D4DC | | | | |
| Lilac | #E6DBF5 | | | | |
| Sky | #D9E8F6 | | | | |
| Mint | #D9ECDD | | | | |
| Sage | #DDE5D2 | | | | |
| Blue-gray | #E1E7ED | | | | |
| Gray | #E8EAED | | | | |

## Vibrant palette review

| Color | Hex | Gmail light | Gmail dark | Apple Mail light | Apple Mail dark | Keep? |
| --- | --- | --- | --- | --- | --- | --- |
| Highlighter yellow | #FFF200 | | | | | |
| Fluorescent green | #7CFC00 | | | | | |
| Hot pink | #FF4FD8 | | | | | |
| Highlighter orange | #FF9F1C | | | | | |
| Electric cyan | #00E5FF | | | | | |
| Bright violet | #C77DFF | | | | | |

## Component checks

- Short phrase remains legible.
- Long highlighted phrase wraps without gaps or clipping.
- Highlight inside a table cell remains aligned.
- Highlight beside bold text and links remains stable.
- Plain-text alternative contains the words without markup.
- Meaning survives when the highlight background is absent or inverted.
- Restrained usage feels useful.
- Moderate usage remains readable.
- Excessive example establishes a clear visual ceiling.

## Observed compatibility

- The initial soft colors looked good in light mode and remained acceptable in Apple Mail dark mode, but Gmail dark mode reduced their visibility substantially.
- Sun was the strongest overall treatment across the reviewed light and dark surfaces.
- Several saturated candidates lost contrast when Apple Mail dark mode changed the text treatment.
- Hot pink remained useful for specific emphasis.
- Sun is subdued in Gmail dark mode but remains acceptable.

## Decision

- Selected default: Sun `#FFE08A`
- Retained named variant: Hot pink `#FF4FD8`, for rare special emphasis
- Maximum preferred highlights per email: not separately set; use brief, restrained emphasis within the hard cap of 20
- Required fixes: make sun the default and remove all named colors except hot pink
- Approval status: approved
