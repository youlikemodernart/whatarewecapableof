#!/usr/bin/env node
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = join(__dirname, '..');
const SVG_DIR = join(BASE, 'svg');
const HTML_DIR = join(BASE, 'html');
mkdirSync(SVG_DIR, { recursive: true });
mkdirSync(HTML_DIR, { recursive: true });

const SANS = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const CT = '#1a1a1a';

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function tx(x, y, content, o = {}) {
  const font = o.mono ? MONO : SANS;
  const sz = o.size || 16;
  const anc = o.anchor || 'middle';
  const op = o.opacity !== undefined ? o.opacity : 1;
  const w = o.weight || 'normal';
  const ls = o.mono && o.caps ? ' letter-spacing="0.06em"' : '';
  const t = o.caps ? esc(content).toUpperCase() : esc(content);
  return `<text x="${x}" y="${y}" font-family="${font}" font-size="${sz}" fill="${CT}" fill-opacity="${op}" text-anchor="${anc}" font-weight="${w}"${ls}>${t}</text>`;
}

function ln(x1, y1, x2, y2, o = {}) {
  const op = o.lineOpacity !== undefined ? o.lineOpacity : 0.20;
  const d = o.dash ? ` stroke-dasharray="${o.dash}"` : '';
  const m = o.arrow ? ' marker-end="url(#arw)"' : '';
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${CT}" stroke-opacity="${op}" stroke-width="${o.width||1}"${d}${m}/>`;
}

function bx(x, y, w, h, o = {}) {
  const op = o.borderOpacity !== undefined ? o.borderOpacity : 0.20;
  const d = o.dash ? ` stroke-dasharray="${o.dash}"` : '';
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" stroke="${CT}" stroke-opacity="${op}" fill="${o.fill||'none'}" stroke-width="1"${d}/>`;
}

function svgOpen(w, h) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
<defs><marker id="arw" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
<path d="M0.5,0.5 L7,3 L0.5,5.5" fill="none" stroke="${CT}" stroke-opacity="0.35" stroke-width="1.2" stroke-linejoin="round"/></marker></defs>
<rect width="${w}" height="${h}" fill="white"/>`;
}

// ==== DIAGRAM A: CURRENT ACCESS CHAIN ====
function diagramA() {
  const W = 1400, H = 520;
  const nw = 120, nh = 56, ny = 110, mx = 50;
  const gap = (W - 2*mx - 7*nw) / 6;
  const nodes = [['GoHighLevel','preview'],['Firebase','email HTML'],['Email','index'],['Day','section'],['Breakout','button'],['PDF','index'],['Wistia','page']];
  const verbs = ['opens','loads iframe','scans','clicks','opens','links to'];
  const platforms = [{label:'GoHighLevel',s:0,e:0},{label:'Firebase',s:1,e:1},{label:'Email / PDF',s:2,e:5},{label:'Wistia',s:6,e:6}];

  const pos = nodes.map((_,i) => { const x=mx+i*(nw+gap); return {x, cx:x+nw/2, r:x+nw}; });
  const out = [svgOpen(W,H)];

  // Platform labels + rules
  for (const p of platforms) {
    const fx=pos[p.s].x-8, lx=pos[p.e].r+8, cx=(fx+lx)/2;
    out.push(tx(cx, 38, p.label, {mono:true, size:10, caps:true, opacity:0.40}));
    out.push(ln(fx, 50, lx, 50, {lineOpacity:0.10}));
  }

  // Platform boundary verticals
  for (const bv of [(pos[0].r+pos[1].x)/2, (pos[1].r+pos[2].x)/2, (pos[5].r+pos[6].x)/2]) {
    out.push(ln(bv, 50, bv, ny+nh+6, {lineOpacity:0.06, dash:'3,4'}));
  }

  // Nodes
  for (let i=0; i<7; i++) {
    const p=pos[i];
    out.push(bx(p.x, ny, nw, nh, {borderOpacity:0.18}));
    out.push(tx(p.cx, ny+23, nodes[i][0], {size:15}));
    out.push(tx(p.cx, ny+41, nodes[i][1], {size:15}));
  }

  // Arrows + verbs
  for (let i=0; i<6; i++) {
    const x1=pos[i].r+2, x2=pos[i+1].x-2, ay=ny+nh/2;
    out.push(ln(x1, ay, x2-6, ay, {lineOpacity:0.30, arrow:true}));
    out.push(tx((x1+x2)/2, ay-10, verbs[i], {size:11, opacity:0.45}));
  }

  // Evidence counts with leader lines
  const ey = 260;
  const ev = [{i:2,t:'2 days'},{i:3,t:'6 breakout PDFs'},{i:6,t:'35 Wistia videos'},{i:6,t:'1 resource PDF',dy:18}];
  for (const e of ev) {
    if (!e.dy) out.push(ln(pos[e.i].cx, ny+nh+3, pos[e.i].cx, ey-16, {lineOpacity:0.07, dash:'2,4'}));
    out.push(tx(pos[e.i].cx, ey+(e.dy||0), e.t, {mono:true, size:11, opacity:0.50}));
  }

  // Separator + support gaps
  const gy = 340;
  out.push(ln(mx, gy, W-mx, gy, {lineOpacity:0.10}));
  out.push(tx(mx, gy+18, 'Support gaps', {mono:true, size:10, caps:true, opacity:0.38, anchor:'start'}));
  const gaps = ['No global nav','No search','No progress','No session state','No facilitator surface'];
  const gsp = (W-2*mx)/gaps.length;
  for (let i=0; i<gaps.length; i++) out.push(tx(mx+gsp*i+gsp/2, gy+40, gaps[i], {mono:true, size:11, opacity:0.42}));

  // Caption
  out.push(tx(mx, H-16, 'Current-state route. Source: Sales School IA packet, email preview, PDF contact sheet, Wistia thumbnails. April 2026.', {size:11, opacity:0.35, anchor:'start'}));
  out.push('</svg>');
  return out.join('\n');
}

// ==== DIAGRAM B: PROPOSED PORTAL ARCHITECTURE ====
function diagramB() {
  const W = 1400, H = 560;
  const cx = W/2, mx = 50;
  const out = [svgOpen(W,H)];

  // Root
  const ry=40, rw=180, rh=48;
  out.push(bx(cx-rw/2, ry, rw, rh, {borderOpacity:0.22}));
  out.push(tx(cx, ry+20, '/sales-school', {size:15}));
  out.push(tx(cx, ry+37, 'Course home', {mono:true, size:10, caps:true, opacity:0.42}));

  // Level 1
  const l1y=148, l1h=48, l1w=130;
  const l1 = [{l:'/today',s:'Live hub',em:true},{l:'/day-one',s:'Day One'},{l:'/day-two',s:'Day Two'},{l:'/resources',s:'Resources'},{l:'/facilitator',s:'Facilitator'}];
  const l1g = (W-2*mx-l1.length*l1w)/(l1.length-1);
  const l1p = l1.map((_,i)=>{ const x=mx+i*(l1w+l1g); return {x, cx:x+l1w/2}; });

  for (const p of l1p) out.push(ln(cx, ry+rh, p.cx, l1y, {lineOpacity:0.14}));
  for (let i=0; i<l1.length; i++) {
    const p=l1p[i], n=l1[i];
    out.push(bx(p.x, l1y, l1w, l1h, {borderOpacity:n.em?0.30:0.18}));
    out.push(tx(p.cx, l1y+20, n.l, {size:14}));
    out.push(tx(p.cx, l1y+36, n.s, {mono:true, size:10, caps:true, opacity:n.em?0.55:0.40}));
  }

  // Breakouts: single row of 6
  const l2y=260, l2h=42, l2w=100;
  const bkLabels = ['Breakout 1','Breakout 2','Breakout 3','Breakout 4','Breakout 5','Breakout 6'];
  const bkGap = 14;
  const bkTotalW = 6*l2w + 5*bkGap;
  const bkStartX = cx - bkTotalW/2;
  const bkPos = bkLabels.map((_,i) => { const x=bkStartX+i*(l2w+bkGap); return {x, cx:x+l2w/2}; });

  for (let i=0; i<6; i++) {
    const parentCx = i<3 ? l1p[1].cx : l1p[2].cx;
    out.push(ln(parentCx, l1y+l1h, bkPos[i].cx, l2y, {lineOpacity:0.12}));
    out.push(bx(bkPos[i].x, l2y, l2w, l2h, {borderOpacity:0.15}));
    out.push(tx(bkPos[i].cx, l2y+26, bkLabels[i], {size:13}));
  }

  // Wistia layer
  const wY = 362;
  out.push(ln(80, wY, W-80, wY, {lineOpacity:0.10, dash:'6,4'}));
  out.push(tx(cx, wY+20, 'Wistia media layer', {size:14, opacity:0.50}));
  out.push(tx(cx, wY+38, 'Retained. Existing hosting, embeds, and linked video pages.', {mono:true, size:10, opacity:0.35}));

  for (const b of bkPos) out.push(ln(b.cx, l2y+l2h, b.cx, wY-3, {lineOpacity:0.05, dash:'2,5'}));

  // Phase 2
  const p2y = 425;
  out.push(ln(80, p2y, W-80, p2y, {lineOpacity:0.08, dash:'4,4'}));
  out.push(tx(cx, p2y+20, 'Optional later platform scope', {mono:true, size:10, caps:true, opacity:0.35}));
  const p2 = ['Search','Progress','Transcript indexing','Admin editing','Cohort management','Login'];
  const p2sp = (W-160)/p2.length;
  for (let i=0; i<p2.length; i++) out.push(tx(80+p2sp*i+p2sp/2, p2y+44, p2[i], {size:13, opacity:0.35}));

  out.push(tx(mx, H-16, 'Proposed MVP portal structure. Wistia retained as media layer. Phase 2 conditional on school reuse.', {size:11, opacity:0.35, anchor:'start'}));
  out.push('</svg>');
  return out.join('\n');
}

// ==== DIAGRAM C: LIVE BREAK FLOW ====
function diagramC() {
  const W = 1400, H = 580;
  const lx = 105, lw = W-155;
  const out = [svgOpen(W,H)];

  const lanes = [{l:'Facilitator',y:40,h:100},{l:'Student',y:140,h:100},{l:'Portal',y:240,h:80},{l:'Zoom',y:320,h:60}];
  for (const la of lanes) {
    out.push(tx(lx-6, la.y+15, la.l, {mono:true, size:10, caps:true, opacity:0.35, anchor:'end'}));
    out.push(ln(lx, la.y, lx+lw, la.y, {lineOpacity:0.06}));
  }
  out.push(ln(lx, 380, lx+lw, 380, {lineOpacity:0.06}));

  const sw=125, sh=38;
  function step(x, y, label, o={}) {
    const w=o.w||sw, h=o.h||sh;
    out.push(bx(x-w/2, y, w, h, {borderOpacity:o.em?0.28:0.16, dash:o.dash}));
    const ll = Array.isArray(label)?label:[label];
    if (ll.length===1) out.push(tx(x, y+h/2+5, ll[0], {size:13}));
    else { out.push(tx(x, y+h/2-2, ll[0], {size:12})); out.push(tx(x, y+h/2+13, ll[1], {size:12})); }
  }
  function sn(x, y, n) { out.push(tx(x, y-5, String(n), {mono:true, size:9, opacity:0.30})); }

  const sx = [185, 330, 475, 640, 810, 990, 1170];

  // Facilitator lane
  sn(sx[0], lanes[0].y+28, 1);
  step(sx[0], lanes[0].y+28, ['Selects active','breakout']);
  sn(sx[1], lanes[0].y+28, 2);
  step(sx[1], lanes[0].y+28, 'Cues students');
  out.push(ln(sx[0]+sw/2+3, lanes[0].y+28+sh/2, sx[1]-sw/2-3, lanes[0].y+28+sh/2, {lineOpacity:0.25, arrow:true}));

  step(sx[4], lanes[0].y+28, ['Watches for','stuck students'], {w:140});
  out.push(ln(sx[1]+sw/2+3, lanes[0].y+28+sh/2, sx[4]-70, lanes[0].y+28+sh/2, {lineOpacity:0.08, dash:'4,4'}));

  step(sx[6], lanes[0].y+28, 'Debrief');

  // Student lane
  sn(sx[2], lanes[1].y+24, 3);
  step(sx[2], lanes[1].y+24, 'Opens Today', {em:true});
  out.push(ln(sx[1], lanes[0].y+28+sh, sx[2], lanes[1].y+24, {lineOpacity:0.18, arrow:true}));
  out.push(tx((sx[1]+sx[2])/2-20, (lanes[0].y+28+sh+lanes[1].y+24)/2, 'receives cue', {size:10, opacity:0.35}));

  sn(sx[4], lanes[1].y+24, 5);
  step(sx[4], lanes[1].y+24, ['Watches video','sequence']);

  // Portal lane
  sn(sx[3], lanes[2].y+18, 4);
  step(sx[3], lanes[2].y+18, ['Active breakout,','queue, return cue'], {w:150, em:true});
  out.push(ln(sx[2], lanes[1].y+24+sh, sx[3], lanes[2].y+18, {lineOpacity:0.18, arrow:true}));
  out.push(ln(sx[3]+75+3, lanes[2].y+18+sh/2, sx[4]-sw/2-3, lanes[1].y+24+sh/2, {lineOpacity:0.18, arrow:true}));
  out.push(tx((sx[3]+sx[4])/2+10, lanes[1].y+24+sh+14, 'via Wistia', {size:10, opacity:0.30, mono:true}));

  sn(sx[5], lanes[2].y+18, 6);
  step(sx[5], lanes[2].y+18, 'Return prompt');
  out.push(ln(sx[4]+sw/2+3, lanes[1].y+24+sh/2, sx[5], lanes[2].y+18, {lineOpacity:0.18, arrow:true}));

  // Zoom lane
  sn(sx[6], lanes[3].y+10, 7);
  step(sx[6], lanes[3].y+10, 'Returns to Zoom');
  out.push(ln(sx[5]+sw/2+3, lanes[2].y+18+sh/2, sx[6]-sw/2-3, lanes[3].y+10+sh/2, {lineOpacity:0.18, arrow:true}));
  out.push(ln(sx[6], lanes[3].y+10, sx[6], lanes[0].y+28+sh, {lineOpacity:0.12, dash:'3,4'}));

  // Exceptions
  const exY = 400;
  out.push(ln(lx, exY, lx+lw, exY, {lineOpacity:0.10}));
  out.push(tx(lx, exY+16, 'Exception paths (proposed, unconfirmed)', {mono:true, size:10, caps:true, opacity:0.35, anchor:'start'}));

  const exc = [
    {f:"Can't open Today", r:'Facilitator shares backup link', o:'Rejoin'},
    {f:'Wrong breakout loaded', r:'Today shows active state', o:'Select current'},
    {f:'Student stuck', r:'Help request to facilitator', o:'Resume'},
  ];
  for (let i=0; i<exc.length; i++) {
    const ey=exY+38+i*30, e=exc[i];
    out.push(tx(lx+6, ey, '×', {size:14, opacity:0.28, anchor:'start'}));
    out.push(tx(lx+24, ey, e.f, {size:13, opacity:0.55, anchor:'start'}));
    out.push(tx(lx+230, ey, '→', {size:13, opacity:0.22, anchor:'start'}));
    out.push(tx(lx+255, ey, e.r, {size:13, opacity:0.45, anchor:'start'}));
    out.push(tx(lx+530, ey, '→', {size:13, opacity:0.22, anchor:'start'}));
    out.push(tx(lx+555, ey, e.o, {size:13, opacity:0.45, anchor:'start'}));
  }

  out.push(tx(lx, H-16, 'Proposed live-break operating flow. Exception paths are assumptions until we confirm.', {size:11, opacity:0.35, anchor:'start'}));
  out.push('</svg>');
  return out.join('\n');
}

// ==== DIAGRAM D: SCOPE FRONTIER ====
function diagramD() {
  const W = 1400, H = 470;
  const mx = 50;
  const colGap = 30;
  const colW = (W-2*mx-2*colGap)/3;
  const out = [svgOpen(W,H)];

  const cols = [
    {x:mx, l:'Build', s:'Phase 1 course portal'},
    {x:mx+colW+colGap, l:'Keep', s:'Retained media layer'},
    {x:mx+2*(colW+colGap), l:'Wait', s:'Optional platform scope'},
  ];

  for (const c of cols) {
    out.push(tx(c.x+colW/2, 38, c.l, {mono:true, size:11, caps:true, opacity:0.45}));
    out.push(tx(c.x+colW/2, 56, c.s, {size:13, opacity:0.50}));
    out.push(ln(c.x, 68, c.x+colW, 68, {lineOpacity:0.15}));
  }

  for (let i=1; i<3; i++) {
    const sx=cols[i].x-colGap/2;
    out.push(ln(sx, 26, sx, 350, {lineOpacity:0.06, dash:'4,4'}));
  }

  const items = [
    ['Course home','Today','Day One','Day Two','Breakout 1–6','Resources','Facilitator','Wistia embeds and links'],
    ['Wistia video hosting','Existing video embeds','Linked video pages','Video transcripts'],
    ['Search','Progress tracking','Transcript indexing','Admin editing','Cohort management','Login'],
  ];

  for (let c=0; c<3; c++) {
    const col=cols[c];
    for (let i=0; i<items[c].length; i++) {
      out.push(tx(col.x+12, 94+i*26, items[c][i], {size:14, opacity:c===2?0.38:0.70, anchor:'start'}));
    }
  }

  const ay = 338;
  out.push(ln(mx, ay, W-mx, ay, {lineOpacity:0.08}));
  out.push(tx((cols[0].x+colW/2+cols[1].x+colW/2)/2, ay+22, 'Phase 1 builds around existing Wistia content', {size:12, opacity:0.42}));
  out.push(ln(cols[0].x+colW, ay+17, cols[1].x, ay+17, {lineOpacity:0.15, arrow:true}));
  out.push(tx((cols[1].x+colW/2+cols[2].x+colW/2)/2, ay+48, 'Phase 2 extends the portal if the school repeats', {size:12, opacity:0.42}));
  out.push(ln(cols[2].x, ay+43, cols[1].x+colW, ay+43, {lineOpacity:0.12, dash:'4,4', arrow:true}));

  out.push(tx(mx, H-16, 'Scope boundary. Phase 1 wraps existing media. Wistia retained. Phase 2 conditional on school reuse.', {size:11, opacity:0.35, anchor:'start'}));
  out.push('</svg>');
  return out.join('\n');
}

// ==== HTML VIEWER ====
function viewer(svg, title) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400&display=swap" rel="stylesheet">
<style>body{margin:0;padding:0;background:white}svg{display:block}</style></head><body>${svg}</body></html>`;
}

// ==== MAIN ====
const all = [
  {id:'01-current-access-chain', t:'Current Access Chain', fn:diagramA},
  {id:'02-portal-architecture', t:'Portal Architecture', fn:diagramB},
  {id:'03-live-break-flow', t:'Live Break Flow', fn:diagramC},
  {id:'04-scope-frontier', t:'Scope Frontier', fn:diagramD},
];
for (const d of all) {
  const svg = d.fn();
  writeFileSync(join(SVG_DIR, `${d.id}.svg`), svg, 'utf-8');
  writeFileSync(join(HTML_DIR, `${d.id}.html`), viewer(svg, d.t), 'utf-8');
  console.log(`${d.id}: SVG + HTML`);
}
console.log('Done.');
