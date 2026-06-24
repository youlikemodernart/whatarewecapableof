# Templates

Named starting points for the things we publish. Fork the right one. Do not reuse a live client page as a template, and do not invent a new format per page.

| Template | Use it for | Format / CSS |
|---|---|---|
| `proposal/` | **Client proposals (the default).** | Editorial single-scroll: `/css/site.css` + `/css/proposal.css` (`.p-meta`, `.p-title`, `.p-lede`, `.finding`, `.layer`, `.p-table`, `.close-line`, `.cta`). This is what every current live proposal uses. |
| `brief/` | Internal project briefs. | Self-contained, single column, inline `<style>`. Reference: `briefs/sophie`. |
| `tab-guide/` | Tabbed single-page guides (Summary / Research / Scope / ?) with a sticky header and JS tab switching. | Legacy tabbed system: `/css/tokens.css` stack + inline styles + tab handler. Reference: `instructions/shipstation`. |

## Routing note (read this if you came here for "the template")

"The proposal template" means **`proposal/`** (editorial). The `tab-guide/` format was previously `proposals/_template/` and was documented as the proposal template, but no current proposal uses it; it is kept for tabbed guides only. If a new format is needed for a new kind of thing, add a new named folder here rather than overloading one of these.

## Baseline every template keeps

All our pages now share this floor; new templates must not regress it:

- a `<main>` landmark (with `id="main"` + a skip link wherever there is a masthead), and `<header>` / `<footer>` as **siblings** of `<main>`, not children;
- `width` and `height` on every `<img>` (reserve the box, avoid layout shift);
- real `<th scope="col">` (and a `<caption>`) on data tables; first-column row labels via `<td class="lead-cell">`;
- underlined links in running prose (never color alone).

Nothing here is served: `/_templates/*` is routed to 404.
