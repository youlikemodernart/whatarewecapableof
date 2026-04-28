#!/usr/bin/env python3
from dataclasses import dataclass
from pathlib import Path
from html import escape
import argparse

ROOT = Path(__file__).resolve().parents[1]
SVG_DIR = ROOT / "svg"
SVG_DIR.mkdir(parents=True, exist_ok=True)

W = 1800
BG = "#ffffff"
INK = "#000000"
MUTED = "#666666"
RULE = "#d9d9d9"
FAINT = "#eeeeee"
LIGHT = "#f7f7f7"
DEBUG = "#ff00cc"
DEBUG_SAFE = "#00aaff"
ACCENT = "#000fff"
TEXT_FACE = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
MONO = "'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace"

LAYERS = [
    "background",
    "debug",
    "connectors",
    "containers",
    "nodes",
    "markers",
    "text",
    "notes",
]


@dataclass(frozen=True)
class Box:
    x: float
    y: float
    w: float
    h: float
    name: str = ""
    pad: float = 18

    @property
    def left(self):
        return self.x

    @property
    def right(self):
        return self.x + self.w

    @property
    def top(self):
        return self.y

    @property
    def bottom(self):
        return self.y + self.h

    @property
    def cx(self):
        return self.x + self.w / 2

    @property
    def cy(self):
        return self.y + self.h / 2

    def content(self):
        return Box(self.x + self.pad, self.y + self.pad, self.w - self.pad * 2, self.h - self.pad * 2, f"{self.name} content", self.pad)

    def anchor(self, side):
        if side == "top":
            return self.cx, self.top
        if side == "bottom":
            return self.cx, self.bottom
        if side == "left":
            return self.left, self.cy
        if side == "right":
            return self.right, self.cy
        if side == "center":
            return self.cx, self.cy
        raise ValueError(f"Unknown side: {side}")

    def marker_point(self, placement="ne", r=18, inset=14):
        if placement == "ne":
            return self.right - r - inset, self.top + r + inset
        if placement == "nw":
            return self.left + r + inset, self.top + r + inset
        if placement == "se":
            return self.right - r - inset, self.bottom - r - inset
        if placement == "sw":
            return self.left + r + inset, self.bottom - r - inset
        if placement == "e":
            return self.right - r - inset, self.cy
        if placement == "w":
            return self.left + r + inset, self.cy
        raise ValueError(f"Unknown placement: {placement}")

    def contains_circle(self, cx, cy, r, inset=0):
        return (
            cx - r >= self.left + inset
            and cx + r <= self.right - inset
            and cy - r >= self.top + inset
            and cy + r <= self.bottom - inset
        )


def safe_text(s):
    return escape(str(s))


class Canvas:
    def __init__(self, height, title, kicker, debug=False):
        self.h = height
        self.debug = debug
        self.layers = {name: [] for name in LAYERS}
        self.issues = []
        self.marker_checks = []
        self.text_checks = []
        self.boxes = []
        self.parts_start = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{height}" viewBox="0 0 {W} {height}">']
        self.parts_start.append('''<defs>
  <marker id="arrowBlue" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#000fff" /></marker>
  <marker id="arrowBlack" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#000000" /></marker>
</defs>''')
        self.rect(0, 0, W, height, BG, None, layer="background")
        self.text(90, 78, kicker, 19, MONO, MUTED, letter=1.8)
        self.text(90, 128, title, 44, TEXT_FACE, INK)
        self.line(90, 164, W - 90, 164, INK, 1, layer="connectors")

    def add(self, layer, markup):
        self.layers[layer].append(markup)

    def estimate_width(self, s, size, font=TEXT_FACE, letter=0):
        factor = 0.61 if "Mono" in font or "mono" in font else 0.52
        return len(str(s)) * size * factor + max(0, len(str(s)) - 1) * letter

    def fit_size(self, s, max_w, size, min_size, font=TEXT_FACE, letter=0):
        current = size
        while current > min_size and self.estimate_width(s, current, font, letter) > max_w:
            current -= 1
        return current

    def rect(self, x, y, w, h, fill="none", stroke=INK, sw=1, rx=0, opacity=1, dash=None, layer="nodes"):
        attrs = [f'x="{x}"', f'y="{y}"', f'width="{w}"', f'height="{h}"', f'fill="{fill}"']
        attrs.append('stroke="none"' if stroke is None else f'stroke="{stroke}" stroke-width="{sw}"')
        if rx:
            attrs.append(f'rx="{rx}"')
        if opacity != 1:
            attrs.append(f'opacity="{opacity}"')
        if dash:
            attrs.append(f'stroke-dasharray="{dash}"')
        self.add(layer, f'<rect {" ".join(attrs)} />')

    def rect_box(self, box, fill="none", stroke=INK, sw=1, rx=0, opacity=1, dash=None, layer="nodes"):
        self.boxes.append(box)
        self.rect(box.x, box.y, box.w, box.h, fill, stroke, sw, rx, opacity, dash, layer)
        if self.debug and layer in {"nodes", "containers"}:
            safe = box.content()
            self.rect(box.x, box.y, box.w, box.h, "none", DEBUG, 1, 0, 0.7, "4 4", "debug")
            self.rect(safe.x, safe.y, safe.w, safe.h, "none", DEBUG_SAFE, 1, 0, 0.7, "2 4", "debug")

    def circle(self, x, y, r, fill=BG, stroke=INK, sw=1, opacity=1, layer="markers"):
        self.add(layer, f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" opacity="{opacity}" />')

    def line(self, x1, y1, x2, y2, stroke=INK, sw=1, opacity=1, dash=None, marker=None, layer="connectors"):
        attrs = [f'x1="{x1}"', f'y1="{y1}"', f'x2="{x2}"', f'y2="{y2}"', f'stroke="{stroke}"', f'stroke-width="{sw}"', f'opacity="{opacity}"']
        if dash:
            attrs.append(f'stroke-dasharray="{dash}"')
        if marker:
            attrs.append(f'marker-end="url(#{marker})"')
        self.add(layer, f'<line {" ".join(attrs)} />')

    def text(self, x, y, s, size=24, font=TEXT_FACE, fill=INK, weight=400, anchor="start", letter=0, opacity=1, layer="text", baseline=None):
        style = f'font-family:{font}; font-size:{size}px; font-weight:{weight}; fill:{fill}; letter-spacing:{letter}px; opacity:{opacity};'
        attrs = [f'x="{x}"', f'y="{y}"', f'text-anchor="{anchor}"', f'style="{style}"']
        if baseline:
            attrs.append(f'dominant-baseline="{baseline}"')
        self.add(layer, f'<text {" ".join(attrs)}>{safe_text(s)}</text>')

    def text_mid(self, x, y, s, size=24, font=TEXT_FACE, fill=INK, weight=400, anchor="start", letter=0, opacity=1):
        self.text(x, y, s, size, font, fill, weight, anchor, letter, opacity, baseline="middle")

    def lines(self, x, y, lines, size=24, font=TEXT_FACE, fill=INK, leading=1.22, weight=400, letter=0, opacity=1, anchor="start"):
        for i, line in enumerate(lines):
            self.text(x, y + i * size * leading, line, size, font, fill, weight, anchor, letter, opacity)

    def label(self, x, y, s, size=17, fill=MUTED):
        self.text(x, y, s.upper(), size, MONO, fill, letter=1.4)

    def label_mid(self, x, y, s, size=17, fill=MUTED, anchor="start"):
        self.text_mid(x, y, s.upper(), size, MONO, fill, anchor=anchor, letter=1.4)

    def num(self, x, y, n, fill=BG, stroke=INK, text_fill=INK, r=20, layer="markers"):
        self.circle(x, y, r, fill, stroke, 1.5, layer=layer)
        self.text(x, y + 1, str(n), 18, MONO, text_fill, anchor="middle", baseline="middle")
        if self.debug:
            self.circle(x, y, 3, DEBUG, DEBUG, 1, layer="debug")

    def marker(self, box, n, placement="ne", r=18, inset=14, fill=BG, stroke=ACCENT, text_fill=ACCENT):
        x, y = box.marker_point(placement, r, inset)
        self.marker_checks.append((box, x, y, r, inset, str(n)))
        self.num(x, y, n, fill, stroke, text_fill, r)
        return x, y

    def tag(self, x, y, label, w=None, fill=BG, stroke=RULE, text_fill=INK, size=16):
        w = w or max(104, self.estimate_width(label, size, MONO, 1.0) + 32)
        box = Box(x, y, w, 38, f"tag {label}", 14)
        self.rect_box(box, fill, stroke, 1, rx=19, layer="nodes")
        fit = self.fit_size(label, box.w - 28, size, 11, MONO, 1.0)
        self.text_mid(x + w / 2, y + 20, label, fit, MONO, text_fill, anchor="middle", letter=1.0)
        self.text_checks.append((box, label, fit, MONO, 1.0, box.w - 28))
        return box

    def node(self, x, y, w, h, title, meta=None, fill=BG, stroke=INK, accent=False, dashed=False, title_size=25, meta_size=16, name=None):
        box = Box(x, y, w, h, name or title, 18)
        self.rect_box(box, fill, stroke, 1, rx=0, dash="6 6" if dashed else None, layer="nodes")
        if accent:
            self.line(x, y, x + w, y, ACCENT, 3, layer="nodes")
        fit = self.fit_size(title, box.w - 36, title_size, 16, TEXT_FACE, 0)
        self.text(x + 18, y + 38, title, fit, TEXT_FACE, INK)
        self.text_checks.append((box, title, fit, TEXT_FACE, 0, box.w - 36))
        if meta:
            meta_lines = meta if isinstance(meta, list) else [meta]
            self.lines(x + 18, y + 70, meta_lines[:2], meta_size, MONO, MUTED, leading=1.25, letter=0.6)
            for m in meta_lines[:2]:
                self.text_checks.append((box, m, meta_size, MONO, 0.6, box.w - 36))
        return box

    def small_node(self, box, title, stroke=RULE, accent=False, title_size=20, min_size=14):
        self.rect_box(box, BG, stroke, 1, layer="nodes")
        if accent:
            self.line(box.left, box.top, box.right, box.top, ACCENT, 3, layer="nodes")
        fit = self.fit_size(title, box.w - box.pad * 2, title_size, min_size, TEXT_FACE, 0)
        self.text_mid(box.left + box.pad, box.cy, title, fit, TEXT_FACE, INK)
        self.text_checks.append((box, title, fit, TEXT_FACE, 0, box.w - box.pad * 2))
        return box

    def layout_row(self, labels, x, y, available_w, h, gap=18, min_w=105, pad=18):
        widths = [max(min_w, self.estimate_width(label, 20, TEXT_FACE) + pad * 2) for label in labels]
        total = sum(widths) + gap * (len(labels) - 1)
        if total > available_w:
            gap = max(8, min(gap, (available_w - sum(widths)) / max(1, len(labels) - 1)))
            total = sum(widths) + gap * (len(labels) - 1)
        if total > available_w:
            scale = (available_w - gap * (len(labels) - 1)) / sum(widths)
            widths = [max(min_w, w * scale) for w in widths]
            total = sum(widths) + gap * (len(labels) - 1)
        start = x + (available_w - total) / 2
        boxes = []
        cx = start
        for label, width in zip(labels, widths):
            boxes.append(Box(cx, y, width, h, label, pad))
            cx += width + gap
        return boxes

    def bus(self, parent, children, bus_y, stroke=RULE):
        self.line(parent.cx, parent.bottom, parent.cx, bus_y, stroke, 1)
        self.line(children[0].cx, bus_y, children[-1].cx, bus_y, stroke, 1)
        for child in children:
            self.line(child.cx, bus_y, child.cx, child.top, stroke, 1)

    def vertical_trunk(self, parent, children, stroke=RULE):
        if not children:
            return
        self.line(parent.cx, parent.bottom, parent.cx, children[-1].top, stroke, 1)

    def band(self, box, label, value, stroke=INK, dash=None, label_w=320, value_size=22, value_font=TEXT_FACE, value_fill=INK):
        self.rect_box(box, BG, stroke, 1, dash=dash, layer="containers")
        self.label_mid(box.left + 30, box.cy, label)
        max_w = box.w - label_w - 60
        fit = self.fit_size(value, max_w, value_size, 14, value_font, 0.5 if value_font == MONO else 0)
        self.text_mid(box.left + label_w, box.cy, value, fit, value_font, value_fill, letter=0.5 if value_font == MONO else 0)
        self.text_checks.append((box, value, fit, value_font, 0.5 if value_font == MONO else 0, max_w))
        return box

    def footer_rule(self):
        self.line(90, self.h - 54, W - 90, self.h - 54, RULE, 1)

    def audit(self, name):
        for box, x, y, r, inset, label in self.marker_checks:
            if not box.contains_circle(x, y, r, inset=0):
                self.issues.append(f"{name}: marker {label} not contained in {box.name}")
        for box in self.boxes:
            if box.left < 0 or box.top < 0 or box.right > W or box.bottom > self.h:
                self.issues.append(f"{name}: box {box.name} outside canvas")
        for box, s, size, font, letter, max_w in self.text_checks:
            if self.estimate_width(s, size, font, letter) > max_w + 2:
                self.issues.append(f"{name}: text {s} may overflow {box.name}")
        return self.issues

    def save(self, name):
        issues = self.audit(name)
        parts = list(self.parts_start)
        for layer in LAYERS:
            if self.layers[layer]:
                parts.append(f'<g id="{layer}">')
                parts.extend(self.layers[layer])
                parts.append('</g>')
        parts.append('</svg>')
        suffix = ".debug.svg" if self.debug else ".svg"
        out_name = name.replace(".svg", suffix)
        (SVG_DIR / out_name).write_text('\n'.join(parts))
        return issues


def diagram_01(debug=False):
    c = Canvas(780, "Current access route", "Sales School diagram 01", debug)
    stops = [
        ("Preview", "GoHighLevel", "entry surface"),
        ("Email HTML", "Firebase", "iframe layer"),
        ("Email index", "Day list", "student scans"),
        ("Day section", "Day One or Two", "student chooses"),
        ("Breakout", "button", "opens PDF"),
        ("PDF index", "6 Canva PDFs", "video links"),
        ("Wistia page", "35 videos", "playback"),
    ]
    x0, y0, w, h, gap = 90, 270, 208, 178, 25
    center_y = y0 + 88
    c.line(x0 + 40, center_y, x0 + 6 * (w + gap) + w - 40, center_y, RULE, 1)
    for i, (title, meta, note) in enumerate(stops):
        x = x0 + i * (w + gap)
        c.node(x, y0, w, h, title, [meta, note], stroke=INK if i in {0, 6} else RULE, accent=i == 6, title_size=25)
        c.num(x + 24, y0 - 34, i + 1, fill=BG, stroke=ACCENT if i == 6 else INK, text_fill=ACCENT if i == 6 else INK, r=18)
        if i < len(stops) - 1:
            gx = x + w + gap / 2
            c.circle(gx, center_y, 4, INK, INK, 1, layer="markers")

    c.label(90, 535, "Evidence counts")
    stats = [("2", "day sections"), ("6", "PDF indexes"), ("35", "Wistia videos"), ("1", "resource PDF"), ("5", "missing support features")]
    for i, (num, label) in enumerate(stats):
        x = 90 + i * 320
        c.line(x, 566, x + 250, 566, RULE, 1)
        c.text(x, 620, num, 42, TEXT_FACE, INK)
        c.text(x, 650, label.upper(), 16, MONO, MUTED, letter=1.1)

    c.label(90, 720, "Route view")
    c.text(240, 720, "Each stop is a surface students cross before reaching the video.", 19, TEXT_FACE, INK)
    return c.save("01-current-access-terrain.svg")


def diagram_02(debug=False):
    c = Canvas(660, "Same assets, cleaner topology", "Sales School diagram 02", debug)
    left = Box(90, 245, 760, 310, "current panel", 34)
    right = Box(950, 245, 760, 310, "proposed panel", 34)
    c.rect_box(left, BG, INK, 1, layer="containers")
    c.rect_box(right, BG, INK, 1, layer="containers")
    c.label(left.x + 34, left.y + 48, "Current route")
    c.label(right.x + 34, right.y + 48, "Proposed portal")

    current_labels = ["Email", "Day", "PDF", "Wistia"]
    current_boxes = c.layout_row(current_labels, left.x + 55, left.y + 120, 610, 56, gap=22, min_w=118, pad=18)
    for i, box in enumerate(current_boxes):
        c.small_node(box, current_labels[i], stroke=RULE, title_size=21)
        if i < len(current_boxes) - 1:
            c.line(box.right, box.cy, current_boxes[i + 1].left, box.cy, RULE, 1)
    c.text(left.x + 34, left.y + 260, "Document route to reach videos", 23, TEXT_FACE, INK)

    root = c.node(right.x + 278, right.y + 45, 205, 86, "Course home", "entry", stroke=INK, accent=True, title_size=22, meta_size=14)
    child_labels = ["Today", "Day One", "Day Two", "Resources", "Facilitator"]
    children = c.layout_row(child_labels, right.x + 85, right.y + 175, 590, 48, gap=15, min_w=92, pad=14)
    c.bus(root, children, right.y + 153, RULE)
    for child in children:
        c.small_node(child, child.name, stroke=RULE, title_size=19)
    c.text(right.x + 34, right.y + 260, "Same material, now inside a course place", 23, TEXT_FACE, INK)

    c.footer_rule()
    c.text(90, 624, "Optional comparison. Diagrams 01 and 03 carry this argument with more detail.", 17, MONO, MUTED, letter=0.8)
    return c.save("02-structure-shift.svg")


def diagram_03(debug=False):
    c = Canvas(960, "Proposed portal architecture", "Sales School diagram 03", debug)
    root = c.node(735, 245, 330, 92, "Course home", "/sales-school", stroke=INK, accent=False, title_size=28)
    specs = [
        (120, 455, "Today", "live surface"),
        (430, 455, "Day One", "breakouts 1 to 3"),
        (740, 455, "Day Two", "breakouts 4 to 6"),
        (1050, 455, "Resources", "support files"),
        (1360, 455, "Facilitator", "operator view"),
    ]
    first_boxes = [Box(x, y, 220, 92, title, 18) for x, y, title, meta in specs]
    c.bus(root, first_boxes, 405, RULE)
    first = []
    for (x, y, title, meta), box in zip(specs, first_boxes):
        first.append(c.node(x, y, 220, 92, title, meta, stroke=INK if title == "Today" else RULE, accent=title == "Today", title_size=25))

    for parent, labs in [(first[1], ["Breakout 1", "Breakout 2", "Breakout 3"]), (first[2], ["Breakout 4", "Breakout 5", "Breakout 6"] )]:
        children = [Box(parent.x + 20, 615 + j * 56, 180, 42, lab, 18) for j, lab in enumerate(labs)]
        c.vertical_trunk(parent, children, RULE)
        for child in children:
            c.small_node(child, child.name, stroke=RULE, title_size=18)

    c.band(Box(120, 812, 1480, 54, "kept media layer", 18), "Kept media layer", "Wistia embeds or linked media pages", stroke=INK, label_w=350, value_size=22)
    c.band(Box(120, 890, 1480, 46, "optional later", 18), "Optional later", "search, progress, admin editing, cohorts, login", stroke=RULE, dash="8 8", label_w=350, value_size=18, value_font=MONO, value_fill=MUTED)
    return c.save("03-portal-architecture.svg")


def diagram_04(debug=False):
    c = Canvas(800, "Live break operating flow", "Sales School diagram 04", debug)
    steps = [
        ("Zoom cue", "Facilitator", "sets the moment"),
        ("Open Today", "Student", "one stable page"),
        ("Watch queue", "Portal", "active breakout"),
        ("Return prompt", "Portal", "back to Zoom"),
        ("Debrief", "Zoom", "room resumes"),
    ]
    y = 360
    xs = [180, 520, 860, 1200, 1540]
    r = 32
    for i in range(len(xs) - 1):
        c.line(xs[i] + r, y, xs[i + 1] - r, y, ACCENT, 2)
    for i, (title, role, note) in enumerate(steps):
        x = xs[i]
        c.num(x, y, i + 1, fill=BG, stroke=ACCENT, text_fill=ACCENT, r=r)
        c.text(x, y + 84, title, 27, TEXT_FACE, INK, anchor="middle")
        c.text(x, y + 116, role.upper(), 16, MONO, MUTED, anchor="middle", letter=1.2)
        c.text(x, y + 146, note, 17, MONO, MUTED, anchor="middle", letter=0.4)

    c.label(90, 585, "Exception checks")
    exceptions = [
        ("Cannot open Today", "backup link or support route"),
        ("Wrong breakout", "active assignment stays visible"),
        ("Student stuck", "redirect and resume practice"),
    ]
    for i, (title, note) in enumerate(exceptions):
        x = 90 + i * 540
        c.rect_box(Box(x, 620, 490, 86, title, 18), BG, RULE, 1, layer="nodes")
        c.text(x + 24, 655, title, 24, TEXT_FACE, INK)
        c.text(x + 24, 688, note, 17, MONO, MUTED, letter=0.5)

    c.footer_rule()
    c.text(90, 764, "Proposed live-session model. Support ownership and active-breakout control still need confirmation.", 17, MONO, MUTED, letter=0.8)
    return c.save("04-live-break-operating-flow.svg")


def diagram_05(debug=False):
    c = Canvas(1020, "Today live surface", "Sales School diagram 05", debug)
    surface = Box(120, 245, 1080, 690, "today surface", 48)
    c.rect_box(surface, BG, INK, 1, layer="containers")
    c.rect(surface.x, surface.y, surface.w, 78, LIGHT, None, layer="containers")
    c.label(surface.x + 34, surface.y + 49, "Sales School / Day One / live now")
    c.tag(surface.right - 190, surface.y + 20, "ACTIVE", w=140, fill=BG, stroke=ACCENT, text_fill=ACCENT, size=15)
    c.marker(surface, 1, "ne", r=18, inset=14)

    task = Box(surface.x + 48, surface.y + 130, 600, 158, "student task", 30)
    c.rect_box(task, BG, INK, 1, layer="nodes")
    c.label(task.x + 30, task.y + 42, "Student task")
    c.text(task.x + 30, task.y + 92, "Watch Breakout 2 now", 36, TEXT_FACE, INK)
    c.marker(task, 2, "ne", r=18, inset=14)

    ret = Box(surface.x + 700, surface.y + 130, 300, 158, "return prompt", 30)
    c.rect_box(ret, BG, RULE, 1, layer="nodes")
    c.label(ret.x + 30, ret.y + 42, "Return")
    c.text(ret.x + 30, ret.y + 92, "Back to Zoom", 30, TEXT_FACE, INK)
    c.marker(ret, 4, "ne", r=18, inset=14)

    c.label(surface.x + 48, surface.y + 365, "Watch queue")
    queue_rows = []
    for i, title in enumerate(["Lesson 1", "Lesson 2", "Resource"]):
        row = Box(surface.x + 48, surface.y + 398 + i * 58, 600, 42, title, 18)
        queue_rows.append(row)
        c.rect_box(row, BG, RULE, 1, layer="nodes")
        c.text_mid(row.x + 28, row.cy, title, 23, TEXT_FACE, INK)
    c.marker(queue_rows[0], 3, "ne", r=14, inset=7)

    help_box = Box(surface.x + 700, surface.y + 398, 300, 100, "help path", 30)
    c.rect_box(help_box, BG, RULE, 1, layer="nodes")
    c.text(help_box.x + 30, help_box.y + 40, "Ask for help", 24, TEXT_FACE, INK)
    c.text(help_box.x + 30, help_box.y + 72, "for stuck states", 17, MONO, MUTED, letter=0.4)
    c.marker(help_box, 5, "ne", r=18, inset=14)

    media = Box(surface.x + 48, surface.y + 590, 952, 78, "Wistia layer", 30)
    c.rect_box(media, BG, RULE, 1, layer="nodes")
    c.label_mid(media.x + 30, media.cy, "Media")
    c.text_mid(media.x + 252, media.cy, "Wistia playback layer", 24, TEXT_FACE, INK)
    c.marker(media, 6, "se", r=18, inset=14)

    key_x = 1275
    c.label(key_x, surface.y + 24, "Key")
    items = [
        (1, "Live state"),
        (2, "Active breakout"),
        (3, "Watch queue"),
        (4, "Return prompt"),
        (5, "Help path"),
        (6, "Wistia layer"),
    ]
    for i, (n, label) in enumerate(items):
        y = surface.y + 78 + i * 74
        c.num(key_x, y, n, fill=BG, stroke=ACCENT, text_fill=ACCENT, r=17)
        c.text_mid(key_x + 42, y, label, 24, TEXT_FACE, INK)
    return c.save("05-today-state-surface.svg")


def diagram_06(debug=False):
    c = Canvas(840, "Scope boundary", "Sales School diagram 06", debug)
    rows = [
        ("Phase 1", "Course portal", ["Course home", "Today", "Day pages", "Breakout pages", "Resources", "Facilitator"], INK, None),
        ("Kept layer", "Wistia media", ["embeds", "linked video pages", "existing hosting"], ACCENT, None),
        ("Phase 2", "Optional platform features", ["search", "progress", "admin editing", "cohorts", "login"], RULE, "8 8"),
    ]
    y = 245
    row_h = 144
    tag_x = 650
    for idx, (label, title, tags, stroke, dash) in enumerate(rows):
        row = Box(90, y, 1620, row_h, label, 40)
        c.rect_box(row, BG, stroke, 1.2, dash=dash, layer="containers")
        c.label(row.x + 46, row.y + 45, label)
        c.text(row.x + 46, row.y + 94, title, 31, TEXT_FACE, INK)
        x = tag_x
        for tag in tags:
            tw = max(116, c.estimate_width(tag, 15, MONO, 1.0) + 34)
            c.tag(x, row.y + 56, tag, w=tw, fill=BG, stroke=RULE, text_fill=INK if idx != 2 else MUTED, size=15)
            x += tw + 18
        y += row_h + 30

    c.footer_rule()
    c.text(90, 804, "MVP scope is the portal around existing media. Platform features remain optional later work.", 17, MONO, MUTED, letter=0.8)
    return c.save("06-scope-frontier.svg")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("-d", dest="debug", action="store_true", help="Write debug SVGs with box bounds and anchor points")
    args = parser.parse_args()
    all_issues = []
    for fn in [diagram_01, diagram_02, diagram_03, diagram_04, diagram_05, diagram_06]:
        all_issues.extend(fn(args.debug))
    if all_issues:
        for issue in all_issues:
            print(f"WARN {issue}")
    print(f"Wrote SVGs to {SVG_DIR}")


if __name__ == "__main__":
    main()
