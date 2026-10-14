/*
 * Oficina viva · Five Minutes — módulo cerrado.
 * NO EDITAR ESTE ARCHIVO: la app solo lo monta y le pasa datos/callbacks.
 * Uso:
 *   import { mountOfficeViva } from './office-viva.js';
 *   import './office-viva.css';
 *   const office = mountOfficeViva(divConAltura, { onRunRequested, onAction, onOpenExpediente, onOpenChat, onOpenInforme });
 *   office.syncAgents([...]); office.setData({...}); office.destroy();
 * Tipos y contrato: office-viva.d.ts
 */
/* eslint-disable */
export function mountOfficeViva(container, opts = {}) {
const OPT = { demo: false, readOnly: false, canRun: true, theme: 'auto', timeZone: 'Europe/Madrid', loadFonts: true, ...opts };
if (!OPT.clock) OPT.clock = OPT.demo ? 'demo' : 'real';
if (!container) throw new Error('mountOfficeViva: falta el contenedor');
container.classList.add('fm-office');
if (OPT.theme !== 'auto') container.dataset.theme = OPT.theme;
container.innerHTML = MARKUP;
if (OPT.loadFonts && !document.querySelector('link[data-fm-office-fonts]')) {
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.dataset.fmOfficeFonts = '1';
  l.href = 'https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;600;700&family=Nunito:wght@500;700;800&display=swap';
  document.head.appendChild(l);
}
const ROOT = container.querySelector('.app');
const $ = (id) => (ROOT.id === id ? ROOT : ROOT.querySelector('#' + id));
const CLEAN = [];
let destroyed = false;
/* ============ utilidades ============ */
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgbToHex(r, g, b) { return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join(''); }
function shade(h, f) { const [r, g, b] = hexToRgb(h); return rgbToHex(r * f, g * f, b * f); }
function mix(a, b, t) { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)); }
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; return [c, g]; }

const OUT = '#2a2140';

/* ============ primitivas pixel (sin antialias) ============ */
const P = {
  rect(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); },
  poly(g, pts, c) {
    g.fillStyle = c;
    let y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    y0 = Math.floor(y0); y1 = Math.ceil(y1);
    for (let y = y0; y < y1; y++) {
      const yc = y + 0.5, xs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a.y <= yc && b.y > yc) || (b.y <= yc && a.y > yc)) xs.push(a.x + (yc - a.y) * (b.x - a.x) / (b.y - a.y));
      }
      xs.sort((m, n) => m - n);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.round(xs[k]), xb = Math.round(xs[k + 1]);
        if (xb > xa) g.fillRect(xa, y, xb - xa, 1);
      }
    }
  },
  line(g, x0, y0, x1, y1, c) {
    g.fillStyle = c;
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let e = dx + dy, n = 0;
    for (;;) {
      g.fillRect(x0, y0, 1, 1);
      if ((x0 === x1 && y0 === y1) || ++n > 2000) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  },
};

/** Contorno oscuro de 1px alrededor de lo opaco: el gran truco del look Habbo. */
function outlined(src, color = OUT) {
  const w = src.width, h = src.height;
  const [c, g] = mk(w, h);
  const s = src.getContext('2d').getImageData(0, 0, w, h).data;
  const out = g.createImageData(w, h); const d = out.data;
  const [R, G, B] = hexToRgb(color);
  const a = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : s[(y * w + x) * 4 + 3];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (s[i + 3] > 0) { d[i] = s[i]; d[i + 1] = s[i + 1]; d[i + 2] = s[i + 2]; d[i + 3] = 255; }
    else if (a(x - 1, y) || a(x + 1, y) || a(x, y - 1) || a(x, y + 1)) { d[i] = R; d[i + 1] = G; d[i + 2] = B; d[i + 3] = 255; }
  }
  g.putImageData(out, 0, 0);
  return c;
}

/* ============ mapa ============
  #  pared      .  suelo madera   ,  alfombra salón   ~  alfombra despacho
  1-3 sillas analistas  4 silla CEO   D mesa trabajo  E mesa CEO
  T mesa central  t silla mesa central  s sofá  c mesita  K café  F nevera  w agua
  B pizarra  R impresora  A recreativa  P planta  L estantería  G mampara cristal  x puerta baño */
const MAP = [
  '################',
  '#B.1...2.A.3..x#',
  '#..D...D...D..V#',
  '#K............R#',
  '#F...:t:t:.....#',
  '#w...tTTTt.GGGG#',
  '#....:t:t:.G~4~#',
  '#P..........~E~#',
  '#s,,,......G~~L#',
  '#s,c,.o.o..G~~P#',
  '#P,,,.....PG~~~#',
  '################',
];
const MH = MAP.length, MW = MAP[0].length;
const ch = (x, y) => (MAP[y] && MAP[y][x]) || '#';
const WALK = new Set(['.', ',', '~', ':', 'x', '1', '2', '3', '4', 't', 's', 'o', 'V']);
const walkable = (x, y) => WALK.has(ch(x, y));
const SEATS = {};
for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) { const c = ch(x, y); if (/[1-4]/.test(c)) SEATS[c] = { x, y }; }
const TABLE_SEATS = []; for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (ch(x, y) === 't') TABLE_SEATS.push({ x, y });

/* ============ proyección isométrica 2:1 (resolución baja) ============ */
const WX0 = -16, WX1 = 36, WY0 = -14, WY1 = 30; // mundo exterior alrededor de la oficina
const OX = (WY1 - WX0) * 16 + 16, OY = 300;
const LW = (WX1 - WX0 + WY1 - WY0) * 16 + 64, LH = OY + (WX1 + WY1) * 8 + 40;
const iso = (x, y, z = 0) => ({ x: OX + (x - y) * 16, y: OY + (x + y) * 8 - z });
function facingTo(dx, dy) { const sx = dx - dy, sy = dx + dy; return { back: sy < 0, flip: sx < 0 ? -1 : 1 }; }

/* ============ caja isométrica con contorno ============ */
function box(g, L, x0, y0, x1, y1, z0, h, col, o = {}) {
  const A = L(x0, y0, z0 + h), B = L(x1, y0, z0 + h), C = L(x1, y1, z0 + h), D = L(x0, y1, z0 + h);
  const Bb = L(x1, y0, z0), Cb = L(x1, y1, z0), Db = L(x0, y1, z0);
  const ol = o.outline || shade(col, 0.5);
  if (!o.noY1) P.poly(g, [Db, Cb, C, D], o.left || shade(col, 0.8));
  if (!o.noX1) P.poly(g, [Cb, Bb, B, C], o.right || shade(col, 0.9));
  P.poly(g, [A, B, C, D], o.top || col);
  if (o.noLines) return;
  if (!o.skip?.y0) P.line(g, A.x, A.y, B.x, B.y, ol);
  if (!o.skip?.x0) P.line(g, A.x, A.y, D.x, D.y, ol);
  if (!o.noX1) { P.line(g, B.x, B.y, C.x, C.y, ol); P.line(g, Bb.x, Bb.y, B.x, B.y, ol); P.line(g, Cb.x, Cb.y, Bb.x, Bb.y, ol); }
  if (!o.noY1) { P.line(g, C.x, C.y, D.x, D.y, ol); P.line(g, Db.x, Db.y, D.x, D.y, ol); P.line(g, Db.x, Db.y, Cb.x, Cb.y, ol); }
  if (!o.noX1 || !o.noY1) P.line(g, Cb.x, Cb.y, C.x, C.y, ol);
}

/* ============ fondo estático: suelo, paredes, rótulo ============ */
const WALL_H = 64;
const C = {
  wood: '#f0c592', wood2: '#e8b880', rug: '#6cc9c6', rugDot: '#93dcd8', lilac: '#bda8ef', lilacDot: '#d4c6f7',
  wallUp: '#fdf3e1', wallLow: '#8ecdf5', rail: '#ffffff', base: '#5b8fd6', cap: '#eadcc2',
  slabL: '#c4865a', slabR: '#b0764d',
};
const BW = (x, z) => iso(x, 1, z);
const LWp = (y, z) => iso(1, y, z);

const FONT = {
  F: ['111', '100', '110', '100', '100'], I: ['111', '010', '010', '010', '111'], V: ['101', '101', '101', '101', '010'],
  E: ['111', '100', '110', '100', '111'], M: ['10001', '11011', '10101', '10001', '10001'], N: ['1001', '1101', '1011', '1001', '1001'],
  U: ['101', '101', '101', '101', '111'], A: ['010', '101', '111', '101', '101'], L: ['100', '100', '100', '100', '111'], C: ['111', '100', '100', '100', '111'], H: ['101', '101', '111', '101', '101'], P: ['110', '101', '110', '100', '100'], R: ['110', '101', '110', '101', '101'], T: ['111', '010', '010', '010', '010'], S: ['111', '100', '111', '001', '111'], ' ': ['00', '00', '00', '00', '00'],
};
function skewText(g, text, x0, y0, color, slope = 0.5) {
  let cx = 0;
  for (const chr of text) {
    const glyph = FONT[chr]; if (!glyph) continue;
    for (let r = 0; r < 5; r++) for (let c = 0; c < glyph[r].length; c++) {
      if (glyph[r][c] === '1') { const px = cx + c; P.rect(g, x0 + px, y0 + r + Math.floor(px * slope), 1, 1, color); }
    }
    cx += glyph[0].length + 1;
  }
}

function buildBackground() {
  const [c, g0] = mk(LW, LH);
  drawGround(g0);
  let g = g0;
  // suelo
  for (let y = 1; y < MH - 1; y++) for (let x = 1; x < MW - 1; x++) {
    const k = ch(x, y);
    const base = k === ',' ? C.rug : k === '~' ? C.lilac : k === ':' ? '#ffd98a' : ((x + y) % 2 ? C.wood : C.wood2);
    const A = iso(x, y), B = iso(x + 1, y), Cc = iso(x + 1, y + 1), D = iso(x, y + 1);
    P.poly(g, [A, B, Cc, D], base);
    if (k === ',' || k === '~' || k === ':') {
      const m = iso(x + 0.5, y + 0.5), dc = k === ',' ? C.rugDot : k === '~' ? C.lilacDot : '#ffeab8';
      P.rect(g, m.x - 1, m.y, 2, 1, dc);
      P.rect(g, m.x - 8, m.y, 1, 1, dc);
      P.rect(g, m.x + 7, m.y, 1, 1, dc);
    } else {
      for (const f of [0.33, 0.66]) { const a = iso(x, y + f), b = iso(x + 1, y + f); P.line(g, a.x, a.y, b.x, b.y, shade(base, 0.95)); }
    }
    P.line(g, A.x, A.y, B.x, B.y, shade(base, 0.9));
    P.line(g, A.x, A.y, D.x, D.y, shade(base, 0.9));
  }
  // losa frontal (efecto maqueta)
  for (let x = 1; x < MW - 1; x++) {
    const a = iso(x, MH - 1), b = iso(x + 1, MH - 1);
    P.poly(g, [a, b, { x: b.x, y: b.y + 7 }, { x: a.x, y: a.y + 7 }], C.slabL);
  }
  for (let y = 1; y < MH - 1; y++) {
    const a = iso(MW - 1, y), b = iso(MW - 1, y + 1);
    P.poly(g, [a, b, { x: b.x, y: b.y + 7 }, { x: a.x, y: a.y + 7 }], C.slabR);
  }
  const fl = iso(1, MH - 1), fc = iso(MW - 1, MH - 1), fr = iso(MW - 1, 1);
  P.line(g, fl.x, fl.y + 7, fc.x, fc.y + 7, OUT); P.line(g, fc.x, fc.y + 7, fr.x, fr.y + 7, OUT);
  P.line(g, fl.x, fl.y, fl.x, fl.y + 7, OUT); P.line(g, fr.x, fr.y, fr.x, fr.y + 7, OUT); P.line(g, fc.x, fc.y, fc.x, fc.y + 7, OUT);
  P.line(g, fl.x, fl.y, fc.x, fc.y, shade(C.wood, 0.75)); P.line(g, fc.x, fc.y, fr.x, fr.y, shade(C.wood, 0.75));

  // pared del fondo (plano y=1) y pared izquierda (plano x=1): capa aparte para tapar lo que hay detrás
  const [wc, wg] = mk(LW, LH); g = wg;
  const walls = [
    { p: (u, z) => BW(u, z), cap: (u, z) => iso(u, 0.8, z), from: 1, to: MW - 1, f: 1 },
    { p: (u, z) => LWp(u, z), cap: (u, z) => iso(0.8, u, z), from: 1, to: MH - 1, f: 0.92 },
  ];
  for (const w of walls) {
    const band = (z0, z1, col) => P.poly(g, [w.p(w.from, z0), w.p(w.to, z0), w.p(w.to, z1), w.p(w.from, z1)], shade(col, w.f));
    band(0, WALL_H, C.wallUp); band(0, 24, C.wallLow); band(22, 25, C.rail); band(0, 3, C.base);
    for (let u = w.from + 1; u < w.to; u++) { const a = w.p(u, 4), b = w.p(u, 21); P.line(g, a.x, a.y, b.x, b.y, shade(C.wallLow, 0.9 * w.f)); }
    P.poly(g, [w.p(w.from, WALL_H), w.p(w.to, WALL_H), w.cap(w.to, WALL_H), w.cap(w.from, WALL_H)], C.cap);
    const e0 = w.p(w.to, 0), e1 = w.p(w.to, WALL_H), e2 = w.cap(w.to, WALL_H), e3 = w.cap(w.to, 0);
    P.poly(g, [e0, e1, e2, e3], shade(C.cap, 0.85));
    P.line(g, e0.x, e0.y, e1.x, e1.y, OUT); P.line(g, e1.x, e1.y, e2.x, e2.y, OUT); P.line(g, e2.x, e2.y, e3.x, e3.y, OUT);
    const t0 = w.cap(w.from, WALL_H), t1 = w.cap(w.to, WALL_H); P.line(g, t0.x, t0.y, t1.x, t1.y, OUT);
    const b0 = w.p(w.from, 0), b1 = w.p(w.to, 0); P.line(g, b0.x, b0.y, b1.x, b1.y, shade(C.base, 0.7));
  }
  const k0 = BW(1, 0), k1 = BW(1, WALL_H); P.line(g, k0.x, k0.y, k1.x, k1.y, shade(C.wallUp, 0.82));

  // rótulo Five Minutes
  const s0 = BW(6.9, 48), s1 = BW(10.9, 48), s2 = BW(10.9, 60), s3 = BW(6.9, 60);
  P.poly(g, [s0, s1, s2, s3], '#3d6ef5');
  P.line(g, s0.x, s0.y, s1.x, s1.y, OUT); P.line(g, s1.x, s1.y, s2.x, s2.y, OUT); P.line(g, s2.x, s2.y, s3.x, s3.y, OUT); P.line(g, s3.x, s3.y, s0.x, s0.y, OUT);
  const tx = BW(7.12, 58); skewText(g, 'FIVE MINUTES', tx.x, tx.y, '#ffffff');

  // póster de gráfico en pared izquierda
  const q = (y, z) => LWp(y, z);
  P.poly(g, [q(6.3, 28), q(7.5, 28), q(7.5, 50), q(6.3, 50)], '#ffffff');
  [[6.45, 8, '#ff6f61'], [6.7, 13, '#ffd166'], [6.95, 10, '#2bb3a3'], [7.2, 17, '#3d6ef5']].forEach(([y, h, col]) => {
    P.poly(g, [q(y, 31), q(y + 0.17, 31), q(y + 0.17, 31 + h), q(y, 31 + h)], col);
  });
  const pa = q(6.3, 28), pb = q(7.5, 28), pc = q(7.5, 50), pd = q(6.3, 50);
  P.line(g, pa.x, pa.y, pb.x, pb.y, OUT); P.line(g, pb.x, pb.y, pc.x, pc.y, OUT); P.line(g, pc.x, pc.y, pd.x, pd.y, OUT); P.line(g, pd.x, pd.y, pa.x, pa.y, OUT);
  return { bg: c, walls: wc };
}

/* ============ sprites de mobiliario ============ */
function makeSprite(fw, fh, maxH, draw) {
  const AX = fh * 16 + 6, AY = maxH + 6;
  const [c, g] = mk((fw + fh) * 16 + 12, (fw + fh) * 8 + maxH + 14);
  const L = (x, y, z = 0) => ({ x: AX + (x - y) * 16, y: AY + (x + y) * 8 - z });
  draw(g, L);
  return { c, ax: AX, ay: AY };
}
const WL = (tx, ty) => (x, y, z = 0) => iso(tx + x, ty + y, z);

const DESK_ITEMS = {
  maria: (g, L) => { box(g, L, 0.08, 0.58, 0.28, 0.8, 15, 7, '#d6a066'); box(g, L, 0.11, 0.62, 0.25, 0.76, 22, 5, '#e8b77c'); },
  lucia: (g, L) => { box(g, L, 0.12, 0.64, 0.2, 0.72, 15, 8, '#ff8fa3'); box(g, L, 0.24, 0.62, 0.34, 0.74, 15, 3, '#ffffff'); },
  mattia: (g, L) => { box(g, L, 0.1, 0.6, 0.28, 0.76, 15, 2, '#3a3f55'); box(g, L, 0.12, 0.62, 0.26, 0.66, 17, 1, '#9be3a2'); },
};

const props = [];
const SEAT_OWNER = { 1: 'maria', 2: 'lucia', 3: 'mattia', 4: 'ceo' };
const OWNER_COLOR = { maria: '#2bb3a3', lucia: '#ff6f61', mattia: '#f2b134', ceo: '#33405f' };
const STOOLS = ['#ffd166', '#7bd389', '#ff8fab', '#8ecdf5', '#c3a6ff', '#ffb067'];
let stoolI = 0;

function addProp(tx, ty, spr, dyn, dOff = 0) { props.push({ tx, ty, depth: tx + ty + 1 + dOff, spr, dyn }); }

/* Pasarela acristalada con cinta transportadora: oficina → almacén, sobre la carretera */
const BRIDGE = { x0: 15, x1: 22, y: 2, z: 28 };
function buildBridge() {
  const { y, z } = BRIDGE;
  for (let x = BRIDGE.x0; x < BRIDGE.x1; x++) {
    const first = x === BRIDGE.x0, last = x === BRIDGE.x1 - 1;
    addProp(x, y, makeSprite(1, 1, 90, (g, L) => {
      if (x === 16 || x === 20) box(g, L, 0.4, 0.4, 0.6, 0.6, -z + z, z, '#8f97ab');
      box(g, L, 0, 0.12, 1, 0.88, z, 3, '#dfe4ee', { noX1: !last, skip: { x0: !first }, left: '#aab3c6', right: '#9aa3b5' });
      P.poly(g, [L(0, 0.12, z + 3), L(1, 0.12, z + 3), L(1, 0.12, z + 26), L(0, 0.12, z + 26)], 'rgba(178,226,255,0.30)');
      box(g, L, 0, 0.16, 1, 0.42, z + 3, 4, '#3b4256', { noX1: !last, skip: { x0: !first }, noLines: true });
      box(g, L, 0, 0.12, 1, 0.88, z + 26, 2, '#c3cad8', { noX1: !last, skip: { x0: !first } });
      const r0 = L(0, 0.12, z + 14), r1 = L(1, 0.12, z + 14); P.line(g, r0.x, r0.y, r1.x, r1.y, '#c3cad8');
    }), (g, t) => bridgeFx(g, t, x), -0.05);
    addProp(x, y, makeSprite(1, 1, 90, (g, L) => {
      P.poly(g, [L(0, 0.88, z + 3), L(1, 0.88, z + 3), L(1, 0.88, z + 26), L(0, 0.88, z + 26)], 'rgba(178,226,255,0.26)');
      const a = L(0.2, 0.88, z + 6), b = L(0.45, 0.88, z + 22); P.line(g, a.x, a.y, b.x, b.y, 'rgba(255,255,255,0.7)');
      for (const zz of [z + 3, z + 14, z + 26]) { const p0 = L(0, 0.88, zz), p1 = L(1, 0.88, zz); P.line(g, p0.x, p0.y, p1.x, p1.y, '#aab3c6'); }
      if (first || last) { const p0 = L(first ? 0 : 1, 0.88, z), p1 = L(first ? 0 : 1, 0.88, z + 28); P.line(g, p0.x, p0.y, p1.x, p1.y, '#5c6378'); }
    }), null, 1.3);
  }
}
function bridgeFx(g, t, x) {
  const L = WL(x, BRIDGE.y), z = BRIDGE.z;
  const off = (t * 0.9) % 0.5;
  for (let k = 0; k < 2; k++) { const u = k * 0.5 + off, a = L(1 - u, 0.17, z + 7), b = L(1 - u, 0.41, z + 7); P.line(g, a.x, a.y, b.x, b.y, '#5c6378'); }
  for (let i = 0; i < 9; i++) {
    const wx = BRIDGE.x1 + 0.2 - (((t * 0.9) + i * 0.83) % (BRIDGE.x1 - BRIDGE.x0 + 0.4));
    if (wx < x || wx >= x + 1) continue;
    const p = iso(wx, BRIDGE.y + 0.29, z + 7);
    P.rect(g, p.x - 4, p.y - 6, 8, 7, OUT); P.rect(g, p.x - 3, p.y - 5, 6, 5, '#d6a066'); P.rect(g, p.x - 3, p.y - 5, 6, 2, '#e8b77c'); P.rect(g, p.x - 1, p.y - 5, 1, 5, '#b8743f');
  }
}

function buildProps() {
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const k = ch(x, y);
    switch (k) {
      case 'D': {
        const owner = SEAT_OWNER[ch(x, y - 1)];
        addProp(x, y, makeSprite(1, 1, 36, (g, L) => {
          box(g, L, 0.08, 0.22, 0.18, 0.82, 0, 12, '#9aa1b8');
          box(g, L, 0.82, 0.22, 0.92, 0.82, 0, 12, '#9aa1b8');
          box(g, L, 0.04, 0.18, 0.96, 0.86, 12, 3, '#fbf7ef');
          box(g, L, 0.3, 0.46, 0.56, 0.6, 15, 1, '#d9dce6');
          box(g, L, 0.7, 0.32, 0.8, 0.4, 15, 3, '#6b7186');
          box(g, L, 0.6, 0.24, 0.94, 0.34, 18, 11, '#34364b');
          DESK_ITEMS[owner]?.(g, L);
        }), (g, t) => deskFx(g, t, x, y, owner));
        break;
      }
      case 'E':
        addProp(x, y, makeSprite(1, 1, 40, (g, L) => {
          box(g, L, 0.04, 0.16, 0.96, 0.88, 0, 14, '#8a5a3c', { top: '#a8714a' });
          box(g, L, 0.3, 0.42, 0.66, 0.6, 14, 1, '#c9ccd8');
          box(g, L, 0.3, 0.38, 0.66, 0.43, 15, 9, '#2e3145');
          box(g, L, 0.16, 0.66, 0.44, 0.76, 14, 3, '#e8c15a');
          box(g, L, 0.76, 0.3, 0.86, 0.4, 14, 3, '#6b4a33');
        }), (g, t) => {
          const L = WL(x, y), p = L(0.81, 0.35, 23);
          P.rect(g, p.x - 4, p.y - 4, 8, 8, '#4aa3df'); P.rect(g, p.x - 2, p.y - 3, 3, 2, '#7bd389'); P.rect(g, p.x + 1, p.y, 2, 2, '#7bd389');
          P.rect(g, p.x - 4, p.y - 4, 8, 1, OUT); P.rect(g, p.x - 4, p.y + 3, 8, 1, OUT); P.rect(g, p.x - 4, p.y - 4, 1, 8, OUT); P.rect(g, p.x + 3, p.y - 4, 1, 8, OUT);
          deskFx(g, t, x, y, 'ceo');
        });
        break;
      case '1': case '2': case '3': case '4': {
        const col = OWNER_COLOR[SEAT_OWNER[k]];
        const tall = k === '4' ? 18 : 13;
        addProp(x, y, makeSprite(1, 1, 34, (g, L) => {
          box(g, L, 0.32, 0.42, 0.68, 0.58, 0, 1, '#555b70');
          box(g, L, 0.46, 0.46, 0.54, 0.54, 1, 6, '#555b70');
          box(g, L, 0.28, 0.28, 0.72, 0.72, 7, 3, col);
          box(g, L, 0.28, 0.14, 0.72, 0.26, 9, tall, col);
        }), null, -0.3);
        break;
      }
      case 't': {
        const col = STOOLS[stoolI++ % STOOLS.length];
        addProp(x, y, makeSprite(1, 1, 16, (g, L) => {
          box(g, L, 0.44, 0.44, 0.56, 0.56, 0, 6, '#8f96ad');
          box(g, L, 0.3, 0.3, 0.7, 0.7, 6, 3, col);
        }), null, -0.3);
        break;
      }
      case 'T': {
        const r = ch(x + 1, y) === 'T', l = ch(x - 1, y) === 'T';
        addProp(x, y, makeSprite(1, 1, 30, (g, L) => {
          if (!l) box(g, L, 0.12, 0.3, 0.22, 0.7, 0, 12, '#b98a5c');
          if (!r) box(g, L, 0.78, 0.3, 0.88, 0.7, 0, 12, '#b98a5c');
          box(g, L, l ? 0 : 0.04, 0.1, r ? 1 : 0.96, 0.9, 12, 4, '#fff4e2', { left: '#d39b67', right: '#c58c5a', noX1: r, skip: { x0: l } });
        }), x === 7 ? (g, t) => tableFx(g, t, x, y) : null);
        break;
      }
      case 's': {
        const up = ch(x, y - 1) === 's', down = ch(x, y + 1) === 's';
        addProp(x, y, makeSprite(1, 1, 34, (g, L) => {
          box(g, L, 0.04, 0, 0.26, 1, 0, 24, '#ff7a6b', { noY1: down, skip: { y0: up } });
          box(g, L, 0.26, 0, 0.9, 1, 0, 9, '#ff8f80', { noY1: down, skip: { y0: up } });
          if (!up) box(g, L, 0.26, 0, 0.9, 0.14, 9, 6, '#ff7a6b');
          if (!down) box(g, L, 0.26, 0.86, 0.9, 1, 9, 6, '#ff7a6b');
          box(g, L, 0.32, 0.2, 0.84, 0.8, 9, 1, '#ffa497', { noLines: true });
        }), null, -0.3);
        break;
      }
      case 'o': {
        const col = x < 7 ? '#a463f2' : '#3fc6f5';
        addProp(x, y, makeSprite(1, 1, 24, (g, L) => {
          box(g, L, 0.18, 0.18, 0.82, 0.82, 0, 7, col);
          box(g, L, 0.24, 0.24, 0.76, 0.76, 7, 2, shade(col, 1.12), { noLines: true });
        }), null, -0.3);
        break;
      }
      case 'c':
        addProp(x, y, makeSprite(1, 1, 30, (g, L) => {
          box(g, L, 0.2, 0.2, 0.8, 0.8, 0, 8, '#ffffff', { left: '#9fd3c7', right: '#b6e0d6' });
          box(g, L, 0.26, 0.56, 0.46, 0.74, 8, 1, '#ff6f61');
          box(g, L, 0.5, 0.32, 0.62, 0.44, 8, 7, '#5ac8b8');
        }), (g, t) => {
          const p = WL(x, y)(0.56, 0.38, 18);
          P.rect(g, p.x - 3, p.y - 2, 2, 2, '#ff8fab'); P.rect(g, p.x + 1, p.y - 3, 2, 2, '#ffd166'); P.rect(g, p.x - 1, p.y - 4, 2, 2, '#ff6f61');
        });
        break;
      case 'K':
        addProp(x, y, makeSprite(1, 1, 40, (g, L) => {
          box(g, L, 0.08, 0.08, 0.92, 0.92, 0, 16, '#f7f3ea', { left: '#b97f52', right: '#c98d5e' });
          box(g, L, 0.18, 0.28, 0.58, 0.72, 16, 17, '#e2453c');
          box(g, L, 0.58, 0.42, 0.68, 0.58, 24, 3, '#2f2f3a');
          box(g, L, 0.68, 0.16, 0.8, 0.28, 16, 3, '#ffffff');
          box(g, L, 0.68, 0.74, 0.8, 0.86, 16, 3, '#ffd166');
        }), (g, t) => coffeeFx(g, t, x, y));
        break;
      case 'F':
        addProp(x, y, makeSprite(1, 1, 52, (g, L) => {
          box(g, L, 0.12, 0.12, 0.88, 0.88, 0, 46, '#eef3fa');
          box(g, L, 0.88, 0.22, 0.92, 0.3, 22, 14, '#9aa3b5');
          box(g, L, 0.88, 0.5, 0.9, 0.56, 34, 3, '#ff6f61'); box(g, L, 0.88, 0.62, 0.9, 0.68, 30, 3, '#2bb3a3'); box(g, L, 0.88, 0.44, 0.9, 0.5, 38, 3, '#ffd166');
          const a = L(0.88, 0.12, 30), b = L(0.88, 0.88, 30); P.line(g, a.x, a.y, b.x, b.y, '#b9c3d6');
        }), (g, t) => fridgeFx(g, t, x, y));
        break;
      case 'w':
        addProp(x, y, makeSprite(1, 1, 42, (g, L) => {
          box(g, L, 0.26, 0.26, 0.74, 0.74, 0, 20, '#f4f4f8');
          box(g, L, 0.3, 0.3, 0.7, 0.7, 20, 14, '#8fd0f7', { outline: '#3b78b5' });
          box(g, L, 0.74, 0.44, 0.8, 0.56, 12, 3, '#3d6ef5');
        }), (g, t) => waterFx(g, t, x, y));
        break;
      case 'B':
        addProp(x, y, makeSprite(1, 1, 50, (g, L) => {
          box(g, L, 0.38, 0.16, 0.46, 0.24, 0, 13, '#8f96ad');
          box(g, L, 0.38, 0.76, 0.46, 0.84, 0, 13, '#8f96ad');
          box(g, L, 0.36, 0.06, 0.46, 0.94, 12, 32, '#ffffff', { outline: '#6b7186', right: '#ffffff', left: '#d9dce6' });
          box(g, L, 0.46, 0.2, 0.56, 0.8, 12, 2, '#9aa1b8');
        }), (g, t) => boardFx(g, t, x, y));
        break;
      case 'R':
        addProp(x, y, makeSprite(1, 1, 30, (g, L) => {
          box(g, L, 0.18, 0.18, 0.82, 0.82, 0, 12, '#5c6378');
          box(g, L, 0.14, 0.2, 0.86, 0.8, 12, 10, '#d4d8e3');
          box(g, L, 0.22, 0.28, 0.78, 0.6, 22, 3, '#9aa1b3');
          box(g, L, 0.28, 0.8, 0.72, 0.94, 15, 1, '#ffffff');
        }), (g, t) => printerFx(g, t, x, y));
        break;
      case 'A':
        addProp(x, y, makeSprite(1, 1, 58, (g, L) => {
          box(g, L, 0.12, 0.3, 0.88, 0.88, 0, 42, '#7b4bd6');
          box(g, L, 0.12, 0.82, 0.88, 1.02, 18, 4, '#5a33a8');
          box(g, L, 0.12, 0.3, 0.88, 0.5, 42, 7, '#ffcf3f');
          box(g, L, 0.3, 0.9, 0.36, 0.96, 22, 4, '#ff4d6d');
          box(g, L, 0.6, 0.9, 0.66, 0.96, 22, 1, '#3df5a8'); box(g, L, 0.72, 0.9, 0.78, 0.96, 22, 1, '#ffd23f');
        }), (g, t) => arcadeFx(g, t, x, y));
        break;
      case 'P':
        addProp(x, y, makeSprite(1, 1, 18, (g, L) => {
          box(g, L, 0.3, 0.3, 0.7, 0.7, 0, 12, '#e07b53');
          box(g, L, 0.33, 0.33, 0.67, 0.67, 12, 1, '#6b4a33', { noLines: true });
        }), (g, t) => plantFx(g, t, x, y));
        break;
      case 'L':
        addProp(x, y, makeSprite(1, 1, 54, (g, L) => {
          box(g, L, 0.15, 0.15, 0.85, 0.85, 0, 46, '#a8714a');
          const cols = ['#ff6f61', '#3d6ef5', '#ffd166', '#2bb3a3', '#c3a6ff', '#ffffff'];
          for (const z of [5, 19, 33]) for (let i = 0; i < 8; i++) {
            const xx = 0.2 + i * 0.08, a = L(xx, 0.85, z), b = L(xx, 0.85, z + 9 - (i % 3));
            P.line(g, a.x, a.y, b.x, b.y, cols[(i + z) % cols.length]); P.line(g, a.x + 1, a.y, b.x + 1, b.y, cols[(i + z) % cols.length]);
          }
        }));
        break;
      case 'G': {
        const horiz = ch(x - 1, y) === 'G' || ch(x + 1, y) === 'G';
        const vert = ch(x, y - 1) === 'G' || ch(x, y + 1) === 'G';
        addProp(x, y, makeSprite(1, 1, 44, (g, L) => {
          const glass = (x0, y0, x1, y1, faceX) => {
            const face = faceX
              ? [L(x1, y0, 3), L(x1, y1, 3), L(x1, y1, 34), L(x1, y0, 34)]
              : [L(x0, y1, 3), L(x1, y1, 3), L(x1, y1, 34), L(x0, y1, 34)];
            P.poly(g, face, 'rgba(178,226,255,0.38)');
            const r1 = faceX ? L(x1, y0 + 0.25, 10) : L(x0 + 0.25, y1, 10), r2 = faceX ? L(x1, y0 + 0.45, 28) : L(x0 + 0.45, y1, 28);
            P.line(g, r1.x, r1.y, r2.x, r2.y, 'rgba(255,255,255,0.75)');
            box(g, L, x0, y0, x1, y1, 0, 3, '#c3cad8');
            box(g, L, x0, y0, x1, y1, 34, 3, '#c3cad8');
          };
          if (horiz || !vert) glass(0, 0.46, 1, 0.54, false);
          if (vert) glass(0.46, 0, 0.54, 1, true);
          if (!(ch(x + 1, y) === 'G') && horiz) box(g, L, 0.9, 0.44, 1, 0.56, 0, 37, '#aab3c6');
        }));
        break;
      }
      case 'V':
        addProp(x, y, makeSprite(1, 1, 70, (g, L) => {
          box(g, L, 0.08, 0.08, 0.92, 0.92, 0, 2, '#9aa1b8');
          for (const [px, py] of [[0.08, 0.08], [0.84, 0.08], [0.08, 0.84]]) box(g, L, px, py, px + 0.08, py + 0.08, 2, 58, '#5c6378');
          P.poly(g, [L(0.08, 0.08, 2), L(0.08, 0.92, 2), L(0.08, 0.92, 60), L(0.08, 0.08, 60)], 'rgba(178,226,255,0.35)');
          box(g, L, 0.08, 0.08, 0.92, 0.92, 60, 3, '#5c6378');
          const s = L(0.3, 0.08, 52); P.rect(g, s.x, s.y, 4, 3, '#3df5a8');
        }), (g, t) => {
          const L = WL(x, y), z = W.liftZ || 0;
          box(g, L, 0.12, 0.12, 0.88, 0.88, z + 1, 2, '#ffd23f', { left: '#e0b52f', right: '#ebc23a' });
        }, -0.35);
        addProp(x, y, makeSprite(1, 1, 70, (g, L) => {
          P.poly(g, [L(0.08, 0.92, 2), L(0.92, 0.92, 2), L(0.92, 0.92, 60), L(0.08, 0.92, 60)], 'rgba(178,226,255,0.22)');
          P.poly(g, [L(0.92, 0.08, 2), L(0.92, 0.92, 2), L(0.92, 0.92, 60), L(0.92, 0.08, 60)], 'rgba(178,226,255,0.22)');
          box(g, L, 0.84, 0.84, 0.92, 0.92, 2, 58, '#5c6378');
          const a = L(0.3, 0.92, 14), b = L(0.6, 0.92, 44); P.line(g, a.x, a.y, b.x, b.y, 'rgba(255,255,255,0.7)');
        }), null, 0.4);
        break;
      default: break;
    }
  }
  buildBridge();
  // cama del gato (decoración)
  addProp(4, 10, makeSprite(1, 1, 10, (g, L) => {
    box(g, L, 0.22, 0.25, 0.78, 0.75, 0, 4, '#ffd166', { left: '#e5b54c' });
    box(g, L, 0.3, 0.33, 0.7, 0.67, 4, 1, '#fff0c2', { noLines: true });
  }), null, -0.4);
}

/* ============ mundo exterior: campus logístico de Five Minutes ============ */
let seed = 7;
const srand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const inRoomArea = (x, y) => x >= -1 && x <= MW && y >= -1 && y <= MH;
const WAREHOUSE = { x0: 22, y0: -8, x1: 32, y1: 3 };
const MARKET = { x0: 22, y0: 13, x1: 32, y1: 22 };
const inRect = (r, x, y, m = 0) => x >= r.x0 - m && x < r.x1 + m && y >= r.y0 - m && y < r.y1 + m;
const POND = { cx: -8.5, cy: 6.5, rx: 3.2, ry: 2.3 };
const pondD = (x, y) => ((x + 0.5 - POND.cx) / POND.rx) ** 2 + ((y + 0.5 - POND.cy) / POND.ry) ** 2;

function groundAt(x, y) {
  if (x >= 17 && x <= 19) return 'road';
  if (x === 16 || x === 20) return 'walk';
  if (y >= 12 && y <= 15 && x >= -1 && x <= 15) return 'plaza';
  if (x >= 21 && x <= 34 && y >= 4 && y <= 10) return 'yard';
  if (inRect(WAREHOUSE, x, y)) return 'yard';
  if (x >= 21 && x <= 34 && y >= 23 && y <= 29) return 'lot';
  if (inRect(MARKET, x, y)) return 'lot';
  const d = pondD(x, y);
  if (d < 1) return 'water';
  if (d < 1.55) return 'sand';
  if (y === 13 && x >= -14 && x < -1) return 'dirt';
  if (x === -6 && y > 8 && y < 13) return 'dirt';
  return 'grass';
}

const GC = {
  grass: ['#86cc6e', '#7ec466'], road: ['#5d6275', '#5d6275'], walk: ['#d8d2c2', '#d2ccbb'], plaza: ['#ecdfc4', '#e3d4b5'],
  yard: ['#bdb8ab', '#b7b2a4'], lot: ['#6f7589', '#6f7589'], water: ['#5fb8e6', '#5fb8e6'], sand: ['#ead7a3', '#e4cf98'], dirt: ['#d9b98a', '#d2b180'],
};
function drawGround(g) {
  for (let y = -44; y <= 64; y++) for (let x = -44; x <= 74; x++) {
    const A = iso(x, y);
    if (A.x < -40 || A.x > LW + 40 || A.y < -40 || A.y > LH + 20) continue;
    const k = groundAt(x, y), base = GC[k][(x + y) & 1];
    const B = iso(x + 1, y), Cc = iso(x + 1, y + 1), D = iso(x, y + 1), m = iso(x + 0.5, y + 0.5);
    P.poly(g, [A, B, Cc, D], base);
    seed = (x * 73856093) ^ (y * 19349663) ^ 1234; seed = Math.abs(seed) % 2147483646 + 1;
    if (k === 'grass') {
      for (let i = 0; i < 3; i++) { const px = m.x + Math.round((srand() - 0.5) * 18), py = m.y + Math.round((srand() - 0.5) * 8); P.rect(g, px, py, 1, 2, srand() < 0.5 ? '#5fa653' : '#a3dc84'); }
      if (srand() < 0.13 && !inRoomArea(x, y)) { const c = ['#ff6f91', '#ffd23f', '#ffffff', '#b48cff'][Math.floor(srand() * 4)]; const px = m.x + Math.round((srand() - 0.5) * 14); P.rect(g, px, m.y - 1, 2, 2, c); P.rect(g, px, m.y + 1, 1, 1, '#4f9a45'); }
    } else if (k === 'road') {
      if (x === 18 && (y & 1)) { const a = iso(18.5, y + 0.1), b = iso(18.5, y + 0.8); P.line(g, a.x, a.y, b.x, b.y, '#ffd23f'); }
      if (x === 17) { const a = iso(17.06, y), b = iso(17.06, y + 1); P.line(g, a.x, a.y, b.x, b.y, '#e9e9f0'); }
      if (x === 19) { const a = iso(19.94, y), b = iso(19.94, y + 1); P.line(g, a.x, a.y, b.x, b.y, '#e9e9f0'); }
    } else if (k === 'water') {
      if (srand() < 0.5) P.rect(g, m.x - 3, m.y, 5, 1, '#8fd3f5');
    } else if (k === 'lot') {
      if (y >= 23 && x % 2 === 0) { const a = iso(x, y + 0.1), b = iso(x, y + 0.9); P.line(g, a.x, a.y, b.x, b.y, '#e9e9f0'); }
    } else if (k === 'yard') {
      if (y === 4 && [23, 26, 29].includes(x)) { const a = iso(x, 4.1), b = iso(x + 1, 4.1); P.line(g, a.x, a.y, b.x, b.y, '#ffd23f'); }
    }
    if (k === 'walk' || k === 'plaza') { P.line(g, A.x, A.y, B.x, B.y, shade(base, 0.9)); P.line(g, A.x, A.y, D.x, D.y, shade(base, 0.9)); }
  }
  // nenúfares y juncos
  for (const [x, y] of [[-9.6, 6.2], [-7.2, 7.1], [-8.4, 5.4]]) { const p = iso(x, y); P.rect(g, p.x - 2, p.y - 1, 5, 3, '#4fbf6a'); P.rect(g, p.x, p.y - 1, 1, 1, '#ff8fab'); }
}

function circle(g, cx, cy, r, col) {
  for (let dy = -r; dy <= r; dy++) { const hw = Math.round(Math.sqrt(r * r - dy * dy)); g.fillStyle = col; g.fillRect(Math.round(cx - hw), Math.round(cy + dy), hw * 2 + 1, 1); }
}
function outlineSprite(spr) { spr.c = outlined(spr.c); return spr; }

const TREE_KINDS = [
  ['#3f9b4f', '#58b85c', '#7bd389'], ['#2f7d4a', '#3f9b5c', '#5cb874'], ['#e889a8', '#f4a6c0', '#ffd0df'], ['#d9822b', '#efa13d', '#ffc766'],
];
function treeSprite(kind, size) {
  return outlineSprite(makeSprite(1, 1, 70, (g, L) => {
    box(g, L, 0.42, 0.42, 0.58, 0.58, 0, 16 + size * 4, '#8a5a3c', { noLines: true });
    const b = L(0.5, 0.5, 26 + size * 6), [d, m, l] = TREE_KINDS[kind];
    const r = 11 + size * 2;
    circle(g, b.x, b.y + 2, r, d); circle(g, b.x - 5, b.y - 2, r - 3, m); circle(g, b.x + 5, b.y - 4, r - 4, m);
    circle(g, b.x - 1, b.y - 8, r - 5, m); circle(g, b.x - 4, b.y - 7, 3, l); circle(g, b.x + 3, b.y - 11, 2, l);
    if (kind === 2) for (let i = 0; i < 6; i++) P.rect(g, b.x - 8 + i * 3, b.y - 4 + (i % 3) * 3, 1, 1, '#ffffff');
  }));
}
function bushSprite(col) {
  return outlineSprite(makeSprite(1, 1, 24, (g, L) => {
    const b = L(0.5, 0.5, 6); circle(g, b.x - 4, b.y, 6, shade(col, 0.85)); circle(g, b.x + 4, b.y, 6, shade(col, 0.85)); circle(g, b.x, b.y - 3, 6, col);
    P.rect(g, b.x - 3, b.y - 6, 1, 1, '#ff6f91'); P.rect(g, b.x + 3, b.y - 3, 1, 1, '#ffd23f');
  }));
}
function lampSprite() {
  return makeSprite(1, 1, 50, (g, L) => {
    box(g, L, 0.44, 0.44, 0.56, 0.56, 0, 40, '#3b4256');
    box(g, L, 0.36, 0.36, 0.64, 0.64, 40, 5, '#ffe9a8', { outline: '#3b4256' });
    box(g, L, 0.38, 0.38, 0.62, 0.62, 45, 2, '#3b4256');
  });
}
function benchSprite(alongX) {
  return makeSprite(1, 1, 24, (g, L) => {
    if (alongX) { box(g, L, 0.05, 0.4, 0.95, 0.65, 6, 2, '#b8743f'); box(g, L, 0.05, 0.3, 0.95, 0.38, 8, 8, '#b8743f'); box(g, L, 0.1, 0.45, 0.18, 0.6, 0, 6, '#3b4256'); box(g, L, 0.82, 0.45, 0.9, 0.6, 0, 6, '#3b4256'); }
    else { box(g, L, 0.4, 0.05, 0.65, 0.95, 6, 2, '#b8743f'); box(g, L, 0.3, 0.05, 0.38, 0.95, 8, 8, '#b8743f'); box(g, L, 0.45, 0.1, 0.6, 0.18, 0, 6, '#3b4256'); box(g, L, 0.45, 0.82, 0.6, 0.9, 0, 6, '#3b4256'); }
  });
}
function planterSprite() {
  return makeSprite(1, 1, 30, (g, L) => {
    box(g, L, 0.12, 0.12, 0.88, 0.88, 0, 9, '#c98d5e', { top: '#7a5235' });
    const b = L(0.5, 0.5, 10); circle(g, b.x - 4, b.y - 2, 4, '#4fbf6a'); circle(g, b.x + 4, b.y - 3, 4, '#58b85c'); circle(g, b.x, b.y - 6, 4, '#7bd389');
    P.rect(g, b.x - 5, b.y - 5, 2, 2, '#ff6f91'); P.rect(g, b.x + 3, b.y - 7, 2, 2, '#ffd23f'); P.rect(g, b.x, b.y - 9, 2, 2, '#ffffff');
  });
}
function truckSprite(col, dir) {
  // a lo largo del eje y: 1 x 3 tiles; dir=+1 cabina en y alto (hacia la cámara)
  return makeSprite(1, 3, 34, (g, L) => {
    const cab0 = dir > 0 ? 2.25 : 0.05, cab1 = dir > 0 ? 2.95 : 0.75, tr0 = dir > 0 ? 0.05 : 0.8, tr1 = dir > 0 ? 2.2 : 2.95;
    box(g, L, 0.18, tr0, 0.82, tr1, 3, 22, '#f4f4f8');
    const s0 = L(0.82, tr0 + 0.2, 12), s1 = L(0.82, tr1 - 0.2, 12); P.line(g, s0.x, s0.y, s1.x, s1.y, '#3d6ef5'); P.line(g, s0.x, s0.y - 1, s1.x, s1.y - 1, '#3d6ef5');
    box(g, L, 0.2, cab0, 0.8, cab1, 3, 17, col);
    const w0 = L(0.82, dir > 0 ? cab0 + 0.1 : cab0 + 0.15, 13), w1 = L(0.82, dir > 0 ? cab1 - 0.15 : cab1 - 0.1, 13); P.line(g, w0.x, w0.y, w1.x, w1.y, '#bfe6ff'); P.line(g, w0.x, w0.y - 1, w1.x, w1.y - 1, '#bfe6ff');
    for (const yy of [tr0 + 0.3, tr1 - 0.3, (cab0 + cab1) / 2]) { const w = L(0.82, yy, 2); P.rect(g, w.x - 2, w.y - 2, 4, 4, '#2a2140'); }
  });
}
function carSprite(col, dir) {
  return makeSprite(1, 2, 24, (g, L) => {
    box(g, L, 0.2, 0.15, 0.8, 1.85, 3, 8, col);
    const c0 = dir > 0 ? 0.6 : 0.5, c1 = dir > 0 ? 1.5 : 1.4;
    box(g, L, 0.25, c0, 0.75, c1, 11, 6, shade(col, 1.15), { right: '#bfe6ff', left: '#a8d8f5' });
    for (const yy of [0.45, 1.55]) { const w = L(0.8, yy, 2); P.rect(g, w.x - 2, w.y - 2, 4, 4, '#2a2140'); }
  });
}

const OUT_PROPS = [];
function addOut(tx, ty, spr, dOff = 0, kind = '') { OUT_PROPS.push({ tx, ty, depth: tx + ty + 1 + dOff, spr, kind, out: true }); }

function buildOutdoor() {
  // almacén
  const wh = WAREHOUSE, fw = wh.x1 - wh.x0, fh = wh.y1 - wh.y0;
  const whSpr = makeSprite(fw, fh, 72, (g, L) => {
    box(g, L, 0, 0, fw, fh, 0, 44, '#cfd5e0', { top: '#9aa3b5', left: '#c3cad8', right: '#b3bbcc' });
    for (let i = 1; i < fw; i++) { const a = L(i, 0, 44), b = L(i, fh, 44); P.line(g, a.x, a.y, b.x, b.y, '#8a93a8'); }
    for (const dx of [1.2, 4.2, 7.2]) {
      const q = [L(dx, fh, 2), L(dx + 1.6, fh, 2), L(dx + 1.6, fh, 30), L(dx, fh, 30)];
      P.poly(g, q, '#8f97ab');
      for (let z = 6; z < 30; z += 4) { const a = L(dx, fh, z), b = L(dx + 1.6, fh, z); P.line(g, a.x, a.y, b.x, b.y, '#7a8296'); }
      for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4]; P.line(g, a.x, a.y, b.x, b.y, OUT); }
      const lmp = L(dx + 0.8, fh, 34); P.rect(g, lmp.x - 2, lmp.y - 1, 4, 2, '#ffd23f');
    }
    const s0 = L(0.6, fh, 36), s1 = L(fw - 0.6, fh, 36), s2 = L(fw - 0.6, fh, 43), s3 = L(0.6, fh, 43);
    P.poly(g, [s0, s1, s2, s3], '#3d6ef5');
    const tx = L(3.6, fh, 42); skewText(g, 'ALMACEN', tx.x, tx.y, '#ffffff');
  });
  addOut(wh.x0, wh.y0, outlineSprite(whSpr), fw / 2 + fh / 2 - 1, 'warehouse');
  // supermercado
  const mk2 = MARKET, mw = mk2.x1 - mk2.x0, mh = mk2.y1 - mk2.y0;
  const mkSpr = makeSprite(mw, mh, 80, (g, L) => {
    box(g, L, 0, 0, mw, mh, 0, 36, '#fbf3e4', { top: '#d9cdb5', left: '#efe2c8', right: '#e3d4b5' });
    for (let i = 0; i < mw * 2; i++) {
      const x0 = i * 0.5, q = [L(x0, mh + 0.25, 22), L(x0 + 0.5, mh + 0.25, 22), L(x0 + 0.5, mh, 28), L(x0, mh, 28)];
      P.poly(g, q, i % 2 ? '#ffffff' : '#ff4d6d');
    }
    for (let i = 0; i < mw - 1; i++) { const q = [L(i + 0.6, mh, 5), L(i + 1.3, mh, 5), L(i + 1.3, mh, 18), L(i + 0.6, mh, 18)]; P.poly(g, q, '#9fd3f5'); P.line(g, q[0].x, q[0].y, q[3].x, q[3].y, '#ffffff'); }
    for (let i = 0; i < mh - 1; i++) { const q = [L(mw, i + 0.6, 8), L(mw, i + 1.3, 8), L(mw, i + 1.3, 20), L(mw, i + 0.6, 20)]; P.poly(g, q, '#9fd3f5'); }
    box(g, L, 3.3, 3.5, 6.7, 3.8, 36, 18, '#ff4d6d', { left: '#ff4d6d', right: '#d63b58', top: '#ffd23f' });
    const tx = L(3.75, 3.8, 50); skewText(g, 'HIPER', tx.x, tx.y, '#ffffff');
    box(g, L, 4.2, 3.6, 4.3, 3.7, 0, 36, '#3b4256'); box(g, L, 5.7, 3.6, 5.8, 3.7, 0, 36, '#3b4256');
  });
  addOut(mk2.x0, mk2.y0, outlineSprite(mkSpr), mw / 2 + mh / 2 - 1, 'market');
  // camiones aparcados en los muelles, palés, coches del parking
  addOut(23, 4, outlineSprite(truckSprite('#ff6f61', 1)), 1.5);
  addOut(29, 4, outlineSprite(truckSprite('#2bb3a3', 1)), 1.5);
  const pallet = () => makeSprite(1, 1, 30, (g, L) => {
    box(g, L, 0.15, 0.15, 0.85, 0.85, 0, 3, '#b8743f');
    box(g, L, 0.2, 0.2, 0.8, 0.8, 3, 9, '#d6a066'); box(g, L, 0.25, 0.25, 0.75, 0.75, 12, 8, '#e8b77c');
  });
  for (const [x, y] of [[33, 5], [33, 7], [33, 9], [21, 9], [22, 9]]) addOut(x, y, pallet());
  const carCols = ['#ff6f61', '#3d6ef5', '#ffd23f', '#7bd389', '#c3a6ff', '#ffffff', '#3b4256'];
  for (const [x, y, i] of [[22, 24, 0], [24, 24, 1], [28, 24, 2], [32, 24, 3], [26, 27, 4], [30, 27, 5], [22, 27, 6]]) addOut(x, y, outlineSprite(carSprite(carCols[i], 1)), 0.5);
  // carritos
  addOut(33, 23, makeSprite(1, 1, 20, (g, L) => { for (let i = 0; i < 3; i++) box(g, L, 0.2, 0.1 + i * 0.25, 0.8, 0.3 + i * 0.25, 4, 7, '#c3cad8'); }));
  // farolas
  for (const y of [-12, -6, 0, 6, 12, 18, 24]) addOut(16, y, lampSprite(), 0, 'lamp');
  for (const y of [-9, -3, 3, 9, 15, 21, 27]) addOut(20, y, lampSprite(), 0, 'lamp');
  for (const x of [0, 7, 14]) addOut(x, 15, lampSprite(), 0, 'lamp');
  // plaza
  for (const x of [2, 5, 10, 13]) addOut(x, 14, planterSprite());
  addOut(8, 15, benchSprite(true)); addOut(-4, 13, benchSprite(true)); addOut(-11, 9, benchSprite(false));
  // árboles y arbustos
  const occupied = new Set();
  const free = (x, y) => groundAt(x, y) === 'grass' && !inRoomArea(x, y) && !occupied.has(`${x},${y}`) && !(y >= 11 && y <= 16 && x >= -2 && x <= 16);
  const place = (x, y, spr) => { occupied.add(`${x},${y}`); addOut(x, y, spr); };
  seed = 99;
  const trees = [0, 1, 2, 3].flatMap((k) => [0, 1, 2].map((s) => treeSprite(k, s)));
  for (let i = 0; i < 900; i++) {
    const x = -40 + Math.floor(srand() * 110), y = -40 + Math.floor(srand() * 100);
    const sp = iso(x, y); if (sp.x < 0 || sp.x > LW || sp.y < 30 || sp.y > LH + 10) continue;
    if (!free(x, y) || !free(x + 1, y) || !free(x, y + 1)) continue;
    if (x > 13 && x < 22 && y > -2 && y < 12) continue;
    const r = srand();
    place(x, y, r < 0.72 ? trees[Math.floor(srand() * trees.length)] : bushSprite(['#4fbf6a', '#3f9b5c', '#58b85c'][Math.floor(srand() * 3)]));
    occupied.add(`${x + 1},${y}`); occupied.add(`${x},${y + 1}`);
  }
}

/* ============ vida exterior: tráfico, carretilla, compradores, patos ============ */
const VEH = [];
const NPCS = [];
const DUCKS = [{ a: 0, s: 0.25 }, { a: 2.4, s: 0.18 }];
function initOutdoorLife() {
  const mkVeh = (kind, col, dir, lane, y, speed) => ({ kind, dir, lane, y, speed, spr: outlineSprite(kind === 'truck' ? truckSprite(col, dir) : carSprite(col, dir)), len: kind === 'truck' ? 3 : 2 });
  VEH.push(mkVeh('truck', '#3d6ef5', 1, 17, -10, 3.2), mkVeh('car', '#ffd23f', 1, 17, 12, 4.4), mkVeh('truck', '#ff6f61', -1, 19, 20, 2.8), mkVeh('car', '#7bd389', -1, 19, -2, 4.0));
  W.forklift = { x: 24, dir: 1, load: true, wait: 0, spr: {} };
  const looks = [
    { skin: '#f2c7a5', hair: '#2b2230', hairStyle: 'short', shirt: '#7b4bd6', pants: '#34405e', shoes: SHOES },
    { skin: '#c98a62', hair: '#5a3624', hairStyle: 'long', shirt: '#ffd23f', pants: '#3b3550', shoes: SHOES },
    { skin: '#e2a77f', hair: '#d8d4cc', hairStyle: 'bob', shirt: '#7bd389', pants: '#2f3a5c', shoes: SHOES },
    { skin: '#8d5a3b', hair: '#101010', hairStyle: 'short', shirt: '#ff8fab', pants: '#26315f', shoes: SHOES },
    { skin: '#f0c09a', hair: '#c4492e', hairStyle: 'long', shirt: '#3fc6f5', pants: '#34405e', shoes: SHOES },
  ];
  const zones = [{ x0: 21.5, x1: 34, y0: 23, y1: 29.5 }, { x0: 21.5, x1: 34, y0: 23, y1: 29.5 }, { x0: 0, x1: 15, y0: 13.4, y1: 15.6 }, { x0: -14, x1: -2, y0: 12.4, y1: 13.6 }, { x0: 21.5, x1: 33, y0: 23, y1: 29.5 }];
  looks.forEach((look, i) => { const z = zones[i]; NPCS.push({ id: `npc${i}`, look, z, x: rand(z.x0, z.x1), y: rand(z.y0, z.y1), tx: 0, ty: 0, wait: rand(0, 3), facing: facingTo(0, 1), walking: false, cart: i < 2 || i === 4 }); });
}
function updateOutdoor(dt) {
  for (const v of VEH) { v.y += v.dir * v.speed * dt; if (v.dir > 0 && v.y > WY1 + 2) v.y = WY0 - 4; if (v.dir < 0 && v.y < WY0 - 4) v.y = WY1 + 2; }
  const f = W.forklift;
  if (f.wait > 0) f.wait -= dt;
  else { f.x += f.dir * 1.6 * dt; if (f.x > 31.5) { f.x = 31.5; f.dir = -1; f.wait = 1.4; f.load = !f.load; } if (f.x < 23.5) { f.x = 23.5; f.dir = 1; f.wait = 1.4; f.load = !f.load; } }
  for (const n of NPCS) {
    if (n.wait > 0) { n.wait -= dt; n.walking = false; continue; }
    if (!n.tx) { n.tx = rand(n.z.x0, n.z.x1); n.ty = rand(n.z.y0, n.z.y1); }
    const dx = n.tx - n.x, dy = n.ty - n.y, d = Math.hypot(dx, dy), st = 1.6 * dt;
    if (d < st) { n.x = n.tx; n.y = n.ty; n.tx = 0; n.wait = rand(1.5, 5); n.walking = false; }
    else { n.x += dx / d * st; n.y += dy / d * st; n.facing = facingTo(dx, dy); n.walking = true; }
  }
  for (const d of DUCKS) d.a += d.s * dt;
  // mariposas de día, luciérnagas de noche
  const n = nightness(W.hour);
  if (Math.random() < dt * 1.2) {
    const p = iso(rand(-14, -2), rand(-8, 11), 6);
    if (n > 0.5) parts.push({ x: p.x, y: p.y, vx: rand(-3, 3), vy: rand(-3, 3), life: 0, max: 3, c: '#fff6a0', s: 1, glow: true });
    else parts.push({ x: p.x, y: p.y, vx: rand(-6, 6), vy: rand(-4, 2), life: 0, max: 3.5, c: pick(['#ff8fab', '#ffd23f', '#ffffff']), s: 1, fly: true });
  }
}
function forkliftSprite(dir, load) {
  const key = `fork|${dir}|${load}`; let s = avCache.get(key); if (s) return s;
  s = outlineSprite(makeSprite(1, 1, 40, (g, L) => {
    box(g, L, 0.25, 0.3, 0.75, 0.7, 2, 9, '#ffd23f');
    box(g, L, 0.3, 0.35, 0.55, 0.65, 11, 8, '#3b4256');
    const fx = dir > 0 ? 0.78 : 0.12;
    box(g, L, fx, 0.32, fx + 0.08, 0.68, 0, 26, '#3b4256');
    if (load) { box(g, L, dir > 0 ? 0.86 : -0.25, 0.25, dir > 0 ? 1.2 : 0.1, 0.75, 4, 3, '#b8743f'); box(g, L, dir > 0 ? 0.9 : -0.2, 0.3, dir > 0 ? 1.15 : 0.05, 0.7, 7, 9, '#d6a066'); }
  }));
  avCache.set(key, s); return s;
}
function outdoorItems(items) {
  for (const p of OUT_PROPS) items.push({ d: p.depth, p });
  for (const v of VEH) items.push({ d: v.lane + v.y, veh: v });
  const f = W.forklift; items.push({ d: f.x + 6.5, fork: f });
  for (const n of NPCS) items.push({ d: n.x + n.y, npc: n });
}
function drawOutdoorItem(g, it, t) {
  if (it.veh) { const v = it.veh, s = iso(v.lane, v.y); g.drawImage(v.spr.c, Math.round(s.x - v.spr.ax), Math.round(s.y - v.spr.ay)); return true; }
  if (it.fork) { const f = it.fork, spr = forkliftSprite(f.dir, f.load), s = iso(f.x - 0.5, 6); g.drawImage(spr.c, Math.round(s.x - spr.ax), Math.round(s.y - spr.ay)); return true; }
  if (it.npc) {
    const n = it.npc, s = iso(n.x, n.y);
    g.fillStyle = 'rgba(42,33,64,0.22)'; g.fillRect(Math.round(s.x) - 6, Math.round(s.y) - 1, 13, 3);
    const spr = avatarSprite(n, n.facing.back ? 'back' : 'front', n.walking ? 'walk' : 'stand', n.walking ? Math.floor(t / 0.12) % 4 : 0, n.cart ? 'bag' : null, n.facing.flip);
    g.drawImage(spr.c, Math.round(s.x) - spr.ax, Math.round(s.y) - spr.ay);
    return true;
  }
  return false;
}
function drawDucks(g, t) {
  for (const d of DUCKS) {
    const x = POND.cx + Math.cos(d.a) * POND.rx * 0.55, y = POND.cy + Math.sin(d.a) * POND.ry * 0.55, s = iso(x, y), fl = Math.sin(d.a) > 0 ? -1 : 1;
    P.rect(g, s.x - 4, s.y - 3, 8, 4, OUT); P.rect(g, s.x - 3, s.y - 2, 6, 3, '#ffffff'); P.rect(g, s.x + fl * 3 - 1, s.y - 5, 3, 3, '#3f9b4f'); P.rect(g, s.x + fl * 5, s.y - 4, 2, 1, '#ff9f43');
    if (Math.floor(t * 2 + d.a) % 3 === 0) P.rect(g, s.x - 6, s.y + 1, 2, 1, '#8fd3f5');
  }
}
function drawCloudShadows(g, t) {
  g.fillStyle = 'rgba(30,40,80,0.07)';
  for (let i = 0; i < 3; i++) {
    const x = ((t * 5 + i * 560) % (LW + 400)) - 200, y = 120 + i * 230;
    g.beginPath(); g.ellipse(x, y, 120, 40, 0, 0, Math.PI * 2); g.ellipse(x + 70, y - 14, 70, 30, 0, 0, Math.PI * 2); g.fill();
  }
}
function outdoorGlows(g, n, t) {
  if (n < 0.05) return;
  for (const p of OUT_PROPS) if (p.kind === 'lamp') { const s = iso(p.tx + 0.5, p.ty + 0.5, 43); glow(g, s.x, s.y, 36, '255,214,140', 0.45 * n); const f = iso(p.tx + 0.5, p.ty + 0.5); glow(g, f.x, f.y, 26, '255,214,140', 0.22 * n); }
  for (const dx of [1.2, 4.2, 7.2]) { const s = iso(WAREHOUSE.x0 + dx + 0.8, WAREHOUSE.y1, 34); glow(g, s.x, s.y, 30, '255,220,120', 0.5 * n); }
  const sg = iso(MARKET.x0 + 5, MARKET.y0 + 3.8, 44); glow(g, sg.x, sg.y, 46, '255,90,120', 0.45 * n);
  for (const v of VEH) { const hy = v.dir > 0 ? v.y + v.len : v.y, s = iso(v.lane + 0.5, hy + v.dir * 0.6, 4); glow(g, s.x, s.y, 18, '255,250,210', 0.5 * n); }
}

/* ============ estado del mundo compartido por los efectos ============ */
const W = {
  t: 0, hour: 9, dayNight: true, stack: 0,
  coffeeBusy: 0, fridgeOpen: 0, waterBusy: 0, printing: 0, printStart: 0, arcadePlaying: 0,
  board: [], doorOpen: 0, bathroom: null, cat: null,
};
const DESK_OF = {};
for (const [seat, owner] of Object.entries(SEAT_OWNER)) {
  const s = SEATS[seat];
  DESK_OF[owner] = { x: s.x, y: s.y + 1 };
}

/* ============ hora, cielo y luz ============ */
const CYCLE = 300;
function hourAt(sec) {
  const u = (sec % CYCLE) / CYCLE;
  const h = u < 0.94 ? 7.5 + (u / 0.94) * 14.5 : 22 + ((u - 0.94) / 0.06) * 9.5;
  return h % 24;
}
function keyframe(h, frames) {
  const f = frames; if (h <= f[0][0]) h += 24;
  for (let i = 0; i < f.length; i++) {
    const a = f[i], b = f[(i + 1) % f.length];
    const bh = i + 1 < f.length ? b[0] : b[0] + 24;
    if (h >= a[0] && h <= bh) return mix(a[1], b[1], (h - a[0]) / (bh - a[0] || 1));
  }
  return f[0][1];
}
const SKY = [[5, '#2b2f5c'], [7, '#ffc9a3'], [9, '#a9dcf7'], [13, '#9fd6f5'], [17, '#ffd9a8'], [19, '#ff9f7a'], [20.5, '#6f6fb8'], [22, '#2b2f5c']];
const TINT = [[5, '#6f78b8'], [7, '#ffe6cc'], [9, '#ffffff'], [16.5, '#ffffff'], [18.5, '#ffdcc0'], [20, '#bdb6e8'], [22, '#7b83c2']];
const nightness = (h) => (h >= 18 ? clamp((h - 18) / 2.5, 0, 1) : h < 7.5 ? clamp((7.5 - h) / 2.5, 0, 1) : 0);
const sunness = (h) => (h >= 8 && h <= 18.5 ? Math.sin(((h - 8) / 10.5) * Math.PI) * 0.8 + 0.2 : 0);

/* ============ elementos dinámicos de pared ============ */
const WINDOWS = [{ wall: 'back', a: 3.9, b: 5.7 }, { wall: 'back', a: 11.7, b: 13.3 }, { wall: 'left', a: 8.1, b: 9.8 }];
function wallPoint(w, u, z) { return w.wall === 'back' ? BW(u, z) : LWp(u, z); }

function drawWallDyn(g, t) {
  const h = W.hour, sky = keyframe(h, SKY), n = nightness(h);
  for (const w of WINDOWS) {
    const zl = 28, zh = 54;
    const q = [wallPoint(w, w.a, zl), wallPoint(w, w.b, zl), wallPoint(w, w.b, zh), wallPoint(w, w.a, zh)];
    P.poly(g, q, sky);
    // nubes o estrellas
    for (let i = 0; i < 3; i++) {
      const u = ((t * 0.018 + i * 0.37) % 1);
      if (u < 0.08 || u > 0.88) continue;
      const p = wallPoint(w, lerp(w.a, w.b, u), zl + 8 + i * 6);
      if (n > 0.5) P.rect(g, p.x, p.y, 1, 1, '#fff6c8');
      else { P.rect(g, p.x - 2, p.y, 6, 2, '#ffffff'); P.rect(g, p.x, p.y - 1, 3, 1, '#ffffff'); }
    }
    if (n > 0.6 && w.wall === 'back' && w.a < 5) { const m = wallPoint(w, w.a + 0.5, 46); P.rect(g, m.x, m.y, 3, 3, '#fff3b0'); }
    const mid = (w.a + w.b) / 2;
    const m0 = wallPoint(w, mid, zl), m1 = wallPoint(w, mid, zh), h0 = wallPoint(w, w.a, (zl + zh) / 2), h1 = wallPoint(w, w.b, (zl + zh) / 2);
    P.line(g, m0.x, m0.y, m1.x, m1.y, '#ffffff'); P.line(g, h0.x, h0.y, h1.x, h1.y, '#ffffff');
    for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4]; P.line(g, a.x, a.y, b.x, b.y, OUT); }
    const sill = w.wall === 'back'
      ? [iso(w.a - 0.06, 1, zl), iso(w.b + 0.06, 1, zl), iso(w.b + 0.06, 1.14, zl), iso(w.a - 0.06, 1.14, zl)]
      : [iso(1, w.a - 0.06, zl), iso(1, w.b + 0.06, zl), iso(1.14, w.b + 0.06, zl), iso(1.14, w.a - 0.06, zl)];
    P.poly(g, sill, '#ffffff'); P.line(g, sill[2].x, sill[2].y, sill[3].x, sill[3].y, '#b9b2c9');
  }
  // puerta del baño
  const da = 14.08, db = 14.92, open = W.doorOpen > t;
  const dq = [BW(da, 0), BW(db, 0), BW(db, 42), BW(da, 42)];
  P.poly(g, dq, open ? '#2b2440' : '#d39461');
  if (!open) {
    const k = BW(db - 0.14, 20); P.rect(g, k.x, k.y, 2, 2, '#ffd23f');
    const p0 = BW(da + 0.12, 26), p1 = BW(db - 0.12, 26); P.line(g, p0.x, p0.y, p1.x, p1.y, shade('#d39461', 0.8));
  } else {
    P.poly(g, [BW(da, 0), iso(da, 1.7, 0), iso(da, 1.7, 42), BW(da, 42)], '#c98a57');
    const a = iso(da, 1.7, 0), b = iso(da, 1.7, 42); P.line(g, a.x, a.y, b.x, b.y, OUT);
  }
  for (let i = 0; i < 4; i++) { const a = dq[i], b = dq[(i + 1) % 4]; P.line(g, a.x, a.y, b.x, b.y, OUT); }
  const sgn = BW(14.3, 52); P.rect(g, sgn.x, sgn.y - 4, 9, 8, '#ffffff'); P.rect(g, sgn.x + 2, sgn.y - 2, 2, 5, '#3d6ef5'); P.rect(g, sgn.x + 5, sgn.y - 2, 2, 5, '#ff6f61');
  const led = BW(14.86, 50); P.rect(g, led.x, led.y, 2, 2, W.bathroom ? '#ff4d6d' : '#3df5a8');
  // reloj
  const c = BW(2.75, 51), R = 6;
  for (let dy = -R; dy <= R; dy++) { const hw = Math.round(Math.sqrt(R * R - dy * dy)); P.rect(g, c.x - hw, c.y + dy, hw * 2 + 1, 1, OUT); }
  for (let dy = -R + 1; dy <= R - 1; dy++) { const hw = Math.round(Math.sqrt((R - 1) * (R - 1) - dy * dy)); P.rect(g, c.x - hw, c.y + dy, hw * 2 + 1, 1, '#ffffff'); }
  const hh = (W.hour % 12) / 12 * Math.PI * 2, mm = (W.hour % 1) * Math.PI * 2;
  P.line(g, c.x, c.y, c.x + Math.sin(hh) * 3, c.y - Math.cos(hh) * 3, OUT);
  P.line(g, c.x, c.y, c.x + Math.sin(mm) * 4.5, c.y - Math.cos(mm) * 4.5, '#ff4d6d');
}

function drawSunPatches(g) {
  const s = W.dayNight ? sunness(W.hour) : 0.7; if (s <= 0.02) return;
  const col = `rgba(255,240,180,${(0.22 * s).toFixed(3)})`;
  for (const w of WINDOWS) {
    const q = w.wall === 'back'
      ? [iso(w.a + 0.2, 1.02), iso(w.b + 0.2, 1.02), iso(w.b + 1.4, 3.1), iso(w.a + 1.4, 3.1)]
      : [iso(1.02, w.a + 0.2), iso(1.02, w.b + 0.2), iso(3.0, w.b + 1.2), iso(3.0, w.a + 1.2)];
    P.poly(g, q, col);
  }
}

/* ============ efectos de objetos ============ */
function deskFx(g, t, x, y, owner) {
  const a = AG[owner]; if (!a) return;
  const L = WL(x, y);
  const led = L(0.62, 0.34, 20);
  P.rect(g, led.x, led.y, 1, 1, a.real.status === 'working' ? '#3df5ff' : '#5b6078');
  if (a.mugOnDesk) { const m = L(0.2, 0.36, 15); P.rect(g, m.x - 1, m.y - 3, 3, 3, '#ffffff'); P.rect(g, m.x + 2, m.y - 2, 1, 1, '#ffffff'); P.rect(g, m.x - 1, m.y - 3, 3, 1, '#6b4a33'); }
}
function tableFx(g, t, x, y) {
  const L = WL(x, y);
  for (let i = 0; i < W.stack; i++) {
    const p = L(0.38 + i * 0.12, 0.42 - i * 0.04, 16 + i);
    P.rect(g, p.x - 4, p.y - 1, 8, 3, '#ffffff'); P.rect(g, p.x - 4, p.y + 2, 8, 1, '#c9c2d6');
    P.rect(g, p.x - 2, p.y, 4, 1, ['#2bb3a3', '#ff6f61', '#f2b134'][i % 3]);
  }
}
function coffeeFx(g, t, x, y) {
  const L = WL(x, y), led = L(0.58, 0.3, 30);
  const busy = W.coffeeBusy > t;
  P.rect(g, led.x, led.y, 1, 1, busy ? (Math.floor(t * 6) % 2 ? '#3df5a8' : '#ffffff') : '#ffd23f');
  if (busy && Math.random() < 0.35) { const s = L(0.63, 0.5, 22); puff(s.x, s.y, '#ffffff', -6); }
}
function fridgeFx(g, t, x, y) {
  if (W.fridgeOpen <= t) return;
  const L = WL(x, y);
  P.poly(g, [L(0.88, 0.16, 4), L(0.88, 0.84, 4), L(0.88, 0.84, 44), L(0.88, 0.16, 44)], '#fff6c2');
  const sh = [L(0.88, 0.16, 18), L(0.88, 0.84, 18)]; P.line(g, sh[0].x, sh[0].y, sh[1].x, sh[1].y, '#d8cf9a');
  const leaf = [L(0.88, 0.84, 4), L(1.36, 0.98, 4), L(1.36, 0.98, 44), L(0.88, 0.84, 44)];
  P.poly(g, leaf, '#e3eaf5');
  for (let i = 0; i < 4; i++) { const a = leaf[i], b = leaf[(i + 1) % 4]; P.line(g, a.x, a.y, b.x, b.y, '#8a93a8'); }
}
function waterFx(g, t, x, y) {
  if (W.waterBusy <= t || Math.random() > 0.3) return;
  const p = WL(x, y)(0.5, 0.5, rand(22, 30));
  sparkle(p.x + rand(-3, 3), p.y, '#ffffff', 0.5);
}
function boardFx(g, t, x, y) {
  const L = WL(x, y);
  for (const m of W.board) { const a = L(0.46, m.y0, m.z), b = L(0.46, m.y1, m.z + m.dz); P.line(g, a.x, a.y, b.x, b.y, m.c); }
}
function printerFx(g, t, x, y) {
  const L = WL(x, y), led = L(0.82, 0.3, 18);
  const on = W.printing > t;
  P.rect(g, led.x, led.y, 1, 1, on ? (Math.floor(t * 8) % 2 ? '#3df5a8' : '#1b8f5a') : '#3df5a8');
  if (on) { const k = clamp((t - W.printStart) / 1.6, 0, 1); const p = L(0.5, 0.94 + k * 0.25, 16); P.rect(g, p.x - 4, p.y - 1, 8, 3, '#ffffff'); P.rect(g, p.x - 2, p.y, 4, 1, '#9aa1b8'); }
}
function arcadeFx(g, t, x, y) {
  const L = WL(x, y), y1 = 0.88;
  const q = [L(0.22, y1, 22), L(0.78, y1, 22), L(0.78, y1, 38), L(0.22, y1, 38)];
  P.poly(g, q, '#120d26');
  const play = W.arcadePlaying > t, f = Math.floor(t * (play ? 10 : 3));
  for (let i = 0; i < (play ? 7 : 3); i++) {
    const u = ((i * 0.37 + f * 0.07) % 1) * 0.5 + 0.25, z = 24 + ((i * 5 + f) % 12);
    const p = L(u, y1, z); P.rect(g, p.x, p.y, play ? 2 : 1, 1, ['#ff4d6d', '#3df5a8', '#ffd23f', '#3df5ff'][i % 4]);
  }
  if (play) { const s = L(0.5, y1, 25); P.rect(g, s.x - 1, s.y, 3, 2, '#ffffff'); }
  const mq = L(0.5, 0.5, 46); P.rect(g, mq.x - 6, mq.y - 2, 12, 2, f % 2 ? '#ff4d6d' : '#7b4bd6');
}
function plantFx(g, t, x, y) {
  const base = WL(x, y)(0.5, 0.5, 13);
  const sw = REDUCED ? 0 : Math.round(Math.sin(t * 1.4 + x * 1.7 + y) * 1);
  const leaves = [[-6, -4, 5, 4, '#3a9e55'], [2, -5, 5, 4, '#3a9e55'], [-4, -10, 4, 6, '#4fbf6a'], [1, -12, 4, 7, '#4fbf6a'], [-2, -17, 4, 6, '#7bd389'], [-8, -9, 3, 3, '#7bd389'], [5, -9, 3, 3, '#4fbf6a']];
  for (const [dx, dy, w, h] of leaves) { const k = dy < -8 ? sw : 0; P.rect(g, base.x + dx + k - 1, base.y + dy - 1, w + 2, h + 2, '#1f5a34'); }
  for (const [dx, dy, w, h, c] of leaves) { const k = dy < -8 ? sw : 0; P.rect(g, base.x + dx + k, base.y + dy, w, h, c); }
  P.rect(g, base.x - 2 + sw, base.y - 18, 3, 1, shade('#7bd389', 0.6));
}

/* ============ avatares pixel (procedurales, con contorno automático) ============ */
const AV_W = 30, AV_H = 46, FX = 15, FY = 43;
const SIT = new Set(['sit', 'type', 'sitDrink', 'sitTalk', 'sitPhone', 'sad']);

function drawAvatar(g, look, view, anim, f, carry) {
  const r = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(FX + x, FY + y, w, h); };
  const sit = SIT.has(anim);
  const crouch = anim === 'pet';
  let bob = 0;
  if (anim === 'walk' && (f === 1 || f === 3)) bob = -1;
  if (anim === 'celebrate' && f === 1) bob = -3;
  const down = sit ? 4 : crouch ? 5 : 0;
  const ty = -19 + down + bob, hy = ty - 11 + (anim === 'sad' ? 1 : 0);
  const arm = shade(look.shirt, 0.86), skin = look.skin, back = view === 'back';

  // piernas
  if (sit || crouch) {
    r(-4, -5, 3, 3, look.pants); r(1, -5, 3, 3, look.pants); r(-4, -2, 3, 2, look.shoes); r(1, -2, 3, 2, look.shoes);
  } else {
    const lA = anim === 'walk' && f === 0 ? 2 : 0, lB = anim === 'walk' && f === 2 ? 2 : 0;
    const sx = anim === 'walk' ? (f === 0 ? -1 : f === 2 ? 1 : 0) : 0;
    r(-4 + sx, -9 + bob, 3, 7 - lA, look.pants); r(1 - sx, -9 + bob, 3, 7 - lB, look.pants);
    r(-4 + sx, -2 + bob - lA, 3, 2, look.shoes); r(1 - sx, -2 + bob - lB, 3, 2, look.shoes);
  }
  // torso
  r(-5, ty, 10, 10, look.shirt); r(3, ty, 2, 10, shade(look.shirt, 0.88));
  if (!back) {
    if (look.suit) { r(-1, ty, 2, 4, '#ffffff'); r(-1, ty + 1, 2, 6, look.tie); }
    else r(-2, ty, 4, 1, look.collar || '#ffffff');
  }
  // brazos
  const hand = (x, y) => r(x, y, 2, 2, skin);
  const armsDown = (oy1 = 0, oy2 = 0) => { r(-7, ty + 1 + oy1, 2, 8, arm); hand(-7, ty + 9 + oy1); r(5, ty + 1 + oy2, 2, 8, arm); hand(5, ty + 9 + oy2); };
  switch (anim) {
    case 'walk': armsDown(f === 0 ? -1 : f === 2 ? 1 : 0, f === 0 ? 1 : f === 2 ? -1 : 0); break;
    case 'type': case 'play':
      r(-7, ty + 2, 2, 5, arm); r(5, ty + 2, 2, 5, arm);
      if (!back) { r(-5, ty + 6 + (f ? 1 : 0), 3, 2, skin); r(2, ty + 6 + (f ? 0 : 1), 3, 2, skin); }
      else { hand(-7, ty + 7 + (f ? 1 : 0)); hand(5, ty + 7 + (f ? 0 : 1)); }
      break;
    case 'drink': case 'sitDrink':
      r(-7, ty + 1, 2, 8, arm); hand(-7, ty + 9);
      r(5, ty - 2 + (f ? 1 : 0), 2, 6, arm);
      if (!back) { r(2, hy + 7 + (f ? 1 : 0), 4, 4, '#ffffff'); r(6, hy + 8 + (f ? 1 : 0), 1, 2, '#ffffff'); r(2, hy + 7 + (f ? 1 : 0), 4, 1, '#6b4a33'); }
      break;
    case 'talk': case 'sitTalk':
      r(-7, ty + 1, 2, 8, arm); hand(-7, ty + 9);
      if (f) { r(5, ty - 3, 2, 6, arm); hand(5, ty - 5); } else { r(5, ty + 1, 2, 8, arm); hand(5, ty + 9); }
      break;
    case 'phone': case 'sitPhone':
      r(-7, ty + 1, 2, 8, arm); hand(-7, ty + 9);
      r(5, ty - 3, 2, 6, arm); r(4, hy + 3, 2, 6, '#2f2f3a'); r(4, hy + 4, 1, 1, '#3df5ff');
      break;
    case 'celebrate': case 'stretch': {
      const w = anim === 'stretch' && f ? 1 : 0;
      r(-7 - w, ty - 8, 2, 9, arm); hand(-7 - w, ty - 10); r(5 + w, ty - 8, 2, 9, arm); hand(5 + w, ty - 10);
      break;
    }
    case 'write':
      r(-7, ty + 1, 2, 8, arm); hand(-7, ty + 9);
      r(5, ty - 5 + (f ? 2 : 0), 2, 7, arm); hand(5, ty - 7 + (f ? 2 : 0));
      break;
    case 'use': case 'pet':
      r(-7, ty + 1, 2, 8, arm); hand(-7, ty + 9);
      r(5, ty + 3, 2, 3, arm); r(6, ty + 5, 3, 2, arm); hand(8 + (f ? 1 : 0), ty + 5);
      break;
    default: armsDown();
  }
  if (carry === 'mug' && !anim.toLowerCase().includes('drink')) { r(6, ty + 7, 4, 4, '#ffffff'); r(10, ty + 8, 1, 2, '#ffffff'); r(6, ty + 7, 4, 1, '#6b4a33'); }
  if (carry === 'bag') { r(-10, ty + 4, 5, 6, '#ff4d6d'); r(-9, ty + 2, 3, 1, '#ff4d6d'); r(-9, ty + 6, 3, 1, '#ffffff'); }
  if (carry === 'paper') { r(-10, ty + 3, 6, 7, '#ffffff'); r(-9, ty + 5, 4, 1, '#9aa1b8'); r(-9, ty + 7, 3, 1, '#9aa1b8'); }

  // cabeza
  r(-1, ty - 1, 2, 1, skin);
  if (back) {
    r(-5, hy, 10, 11, look.hair); r(-6, hy + 4, 1, 3, skin); r(5, hy + 4, 1, 3, skin);
    if (look.hairStyle === 'long') r(-5, hy + 10, 10, 6, look.hair);
    if (look.hairStyle === 'bob') r(-6, hy + 2, 12, 8, look.hair);
    if (look.bow) r(-2, hy - 2, 4, 2, look.bow);
    if (look.headset) { r(-6, hy - 1, 12, 1, '#2f2f3a'); r(-7, hy + 4, 2, 3, '#2f2f3a'); r(5, hy + 4, 2, 3, '#2f2f3a'); }
  } else {
    r(-5, hy, 10, 11, skin); r(4, hy + 1, 1, 9, shade(skin, 0.92));
    const blink = anim === 'blink' || anim === 'sad';
    if (look.glasses) {
      r(-2, hy + 4, 3, 3, OUT); r(2, hy + 4, 3, 3, OUT); r(1, hy + 5, 1, 1, OUT);
      r(-1, hy + 5, 1, 1, blink ? OUT : '#cfeaff'); r(3, hy + 5, 1, 1, blink ? OUT : '#cfeaff');
    } else if (blink) { r(-1, hy + 6, 2, 1, OUT); r(2, hy + 6, 2, 1, OUT); }
    else { r(-1, hy + 5, 1, 2, OUT); r(2, hy + 5, 1, 2, OUT); r(-1, hy + 5, 1, 1, '#ffffff'); }
    r(-3, hy + 8, 2, 1, '#f39a9a'); r(3, hy + 8, 1, 1, '#f39a9a');
    const talking = (anim === 'talk' || anim === 'sitTalk' || anim === 'phone' || anim === 'sitPhone') && f;
    if (anim === 'celebrate') r(0, hy + 8, 3, 2, '#7a2a3e');
    else if (talking) r(0, hy + 8, 2, 2, '#7a2a3e');
    else if (anim === 'sad') r(0, hy + 9, 2, 1, '#7a2a3e');
    else { r(0, hy + 9, 2, 1, '#a8445a'); }
    const H = look.hair;
    switch (look.hairStyle) {
      case 'long': r(-6, hy - 1, 12, 4, H); r(-6, hy + 3, 2, 12, H); r(4, hy + 3, 2, 12, H); r(-4, hy + 3, 3, 1, H); break;
      case 'bob': r(-6, hy - 1, 12, 4, H); r(-6, hy + 3, 2, 7, H); r(4, hy + 3, 2, 7, H); r(-5, hy + 3, 4, 1, H); break;
      case 'slick': r(-5, hy - 1, 10, 3, H); r(-5, hy + 2, 1, 3, H); r(4, hy + 2, 1, 2, H); r(-2, hy - 1, 4, 1, shade(H, 1.12)); break;
      default: r(-5, hy - 1, 10, 3, H); r(-5, hy + 2, 2, 2, H); r(3, hy + 2, 2, 1, H); r(-1, hy - 2, 3, 1, H);
    }
    if (look.bow) { r(3, hy - 2, 3, 2, look.bow); r(6, hy - 1, 1, 1, look.bow); }
    if (look.headset) { r(-6, hy - 2, 12, 1, '#2f2f3a'); r(-7, hy + 3, 2, 4, '#2f2f3a'); r(-6, hy + 7, 4, 1, '#2f2f3a'); r(-3, hy + 7, 1, 1, '#ff4d6d'); }
  }
}

const avCache = new Map();
function avatarSprite(a, view, anim, f, carry, flip) {
  const key = `${a.id}|${view}|${anim}|${f}|${carry || ''}|${flip}`;
  let s = avCache.get(key);
  if (s) return s;
  const [c, g] = mk(AV_W, AV_H);
  drawAvatar(g, a.look, view, anim, f, carry);
  let o = outlined(c);
  if (flip === -1) { const [m, mg] = mk(AV_W, AV_H); mg.scale(-1, 1); mg.drawImage(o, -AV_W, 0); o = m; }
  s = { c: o, ax: flip === -1 ? AV_W - FX : FX, ay: FY };
  avCache.set(key, s);
  return s;
}
const portraitCache = {};
function portrait(a, size) {
  const pk = `${a.id}|${size}`; if (portraitCache[pk]) return portraitCache[pk];
  const [c, g] = mk(size, size);
  const s = avatarSprite(a, 'front', 'stand', 0, null, 1);
  g.fillStyle = shade(a.color, 1.0); g.globalAlpha = 0.22; g.fillRect(0, 0, size, size); g.globalAlpha = 1;
  const k = size / 22;
  g.drawImage(s.c, 4, 6, 22, 22, 0, 0, size, size);
  return (portraitCache[pk] = c.toDataURL());
}

/* ============ gato de la oficina ============ */
function catSprite(frame, flip) {
  const key = `cat|${frame}|${flip}`; let s = avCache.get(key); if (s) return s;
  const [c, g] = mk(16, 12);
  const r = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  const O = '#f39a3c', S = '#d9792a', Wt = '#fff3e0';
  if (frame === 'sleep') {
    r(3, 6, 10, 4, O); r(5, 6, 2, 1, S); r(9, 6, 2, 1, S); r(10, 5, 4, 4, O); r(10, 4, 1, 1, O); r(13, 4, 1, 1, O); r(11, 7, 2, 1, OUT); r(2, 8, 3, 2, O);
  } else if (frame === 'sit') {
    r(5, 5, 5, 6, O); r(6, 8, 3, 3, Wt); r(9, 1, 4, 4, O); r(9, 0, 1, 1, O); r(12, 0, 1, 1, O); r(11, 2, 1, 1, OUT); r(2, 9, 4, 1, O); r(6, 6, 1, 2, S);
  } else {
    const k = frame === 'walk1' ? 1 : 0;
    r(3, 4, 8, 4, O); r(5, 4, 1, 3, S); r(8, 4, 1, 3, S); r(10, 2, 4, 4, O); r(10, 1, 1, 1, O); r(13, 1, 1, 1, O); r(12, 3, 1, 1, OUT);
    r(1, 2 + k, 2, 1, O); r(2, 3, 1, 1, O); r(4, 8, 1, 2 - k, O); r(6, 8, 1, 1 + k, O); r(8, 8, 1, 2 - k, O); r(10, 8, 1, 1 + k, O);
  }
  let o = outlined(c);
  if (flip === -1) { const [m, mg] = mk(16, 12); mg.scale(-1, 1); mg.drawImage(o, -16, 0); o = m; }
  s = { c: o, ax: 8, ay: 11 }; avCache.set(key, s); return s;
}

/* ============ iconos de emoción (8x8) ============ */
const IC_PAL = { k: OUT, w: '#ffffff', b: '#8a5a3c', r: '#ff4d6d', y: '#ffd23f', g: '#22c27a', u: '#3d6ef5', c: '#3fc6f5', p: '#a463f2', o: '#ff9f43' };
const ICONS = {
  coffee: ['.w..w...', '..w..w..', '........', 'kkkkkk..', 'kwwwwkkk', 'kwbbwk.k', 'kwwwwkkk', '.kkkk...'],
  heart: ['.rr..rr.', 'rrrrrrrr', 'rrrrrrrr', 'rrrrrrrr', '.rrrrrr.', '..rrrr..', '...rr...', '........'],
  idea: ['..yyyy..', '.yyyyyy.', '.yywyyy.', '.yyyyyy.', '..yyyy..', '..kkkk..', '..kkkk..', '...kk...'],
  chart: ['........', '......g.', '....u.g.', '..o.u.g.', '..o.u.g.', 'o.o.u.g.', 'o.o.u.g.', 'kkkkkkkk'],
  check: ['........', '......g.', '.....gg.', 'g...gg..', 'gg.gg...', '.ggg....', '..g.....', '........'],
  alert: ['...rr...', '...rr...', '...rr...', '...rr...', '...rr...', '........', '...rr...', '...rr...'],
  music: ['...pppp.', '...p..p.', '...p..p.', '...p..p.', '.ppp.pp.', 'pppppppp', '.pp..pp.', '........'],
  star: ['...y....', '...y....', 'yyyyyyy.', '.yyyyy..', '..yyy...', '.yy.yy..', 'y.....y.', '........'],
  drop: ['...c....', '...c....', '..ccc...', '.ccccc..', '.cwccc..', '.ccccc..', '..ccc...', '........'],
  apple: ['....g...', '...g....', '.rr.rr..', 'rrrrrrr.', 'rrrwrrr.', 'rrrrrrr.', '.rrrrr..', '..r.r...'],
  paper: ['.kkkkk..', '.kwwwkk.', '.kwkkwk.', '.kwwwwk.', '.kwkkwk.', '.kwwwwk.', '.kkkkkk.', '........'],
  smile: ['..yyyy..', '.yyyyyy.', 'yykyykyy', 'yyyyyyyy', 'ykyyyyky', 'yykkkkyy', '.yyyyyy.', '..yyyy..'],
  dots: ['........', '........', '........', 'u..u..u.', '........', '........', '........', '........'],
  sun: ['...y....', '.y.y.y..', '..yyy...', 'yyyyyyy.', '..yyy...', '.y.y.y..', '...y....', '........'],
  full: ['kkk..kkk', 'k......k', 'k......k', '........', '........', 'k......k', 'k......k', 'kkk..kkk'],
  clock: ['..kkkk..', '.kwwwwk.', 'kwwkwwwk', 'kwwkwwwk', 'kwwkkkwk', 'kwwwwwwk', '.kwwwwk.', '..kkkk..'],
  box: ['........', '.kkkkkk.', 'kbbbbbbk', 'kbbkkbbk', 'kbbbbbbk', 'kbbbbbbk', 'kbbbbbbk', '.kkkkkk.'],
  zzz: ['.kkkk...', '...k....', '..k.....', '.kkkk...', '.....kkk', '......k.', '.....kkk', '........'],
};
const iconCache = {};
function iconSprite(name) {
  if (iconCache[name]) return iconCache[name];
  const [c, g] = mk(14, 15);
  g.fillStyle = OUT; g.fillRect(1, 0, 12, 13); g.fillRect(0, 1, 14, 11); g.fillRect(5, 13, 4, 1); g.fillRect(6, 14, 2, 1);
  g.fillStyle = '#ffffff'; g.fillRect(1, 1, 12, 11); g.fillRect(6, 12, 2, 1);
  const rows = ICONS[name] || ICONS.dots;
  rows.forEach((row, y) => [...row].forEach((k, x) => { if (k !== '.') { g.fillStyle = IC_PAL[k]; g.fillRect(3 + x, 3 + y - 1, 1, 1); } }));
  iconCache[name] = c; return c;
}

/* ============ agentes ============ */
const SHOES = '#3a2d4f';
const AGENTS = [
  { id: 'maria', name: 'María', role: 'Inventario y PM', color: '#2bb3a3', seat: '1',
    look: { skin: '#f2c7a5', hair: '#5a3624', hairStyle: 'long', bow: '#ff7aa8', shirt: '#2bb3a3', pants: '#34405e', shoes: SHOES },
    stages: ['Cargando inventario', 'Revisando sanidad por PM', 'Detectando roturas', 'Redactando hallazgos'], finding: 'Dos carteras de PM con cobertura por debajo de 7 días' },
  { id: 'lucia', name: 'Lucía', role: 'Ventas', color: '#ff6f61', seat: '2',
    look: { skin: '#e2a77f', hair: '#c4492e', hairStyle: 'bob', headset: true, shirt: '#ff6f61', pants: '#3b3550', shoes: SHOES },
    stages: ['Cargando ventas', 'Analizando clientes', 'Redactando hallazgos'], finding: 'Una cadena concentra la caída semanal' },
  { id: 'mattia', name: 'Mattia', role: 'Finanzas', color: '#e6a019', seat: '3',
    look: { skin: '#f0c09a', hair: '#2b2230', hairStyle: 'short', glasses: true, shirt: '#f2b134', collar: '#fff4d6', pants: '#2f3a5c', shoes: SHOES },
    stages: ['Calculando MG y MGD', 'Analizando rentabilidad', 'Redactando hallazgos'], finding: 'El margen bruto mejora frente a la semana anterior' },
  { id: 'ceo', name: 'CEO', role: 'Dirección', color: '#3d6ef5', seat: '4',
    look: { skin: '#c98a62', hair: '#d8d4cc', hairStyle: 'slick', suit: true, tie: '#e0413a', shirt: '#2d3e8a', pants: '#26315f', shoes: SHOES },
    stages: ['Consolidando hallazgos', 'Proponiendo decisiones'], finding: 'Tres decisiones propuestas para esta semana' },
];
const AG = {};
for (const def of AGENTS) {
  const s = SEATS[def.seat];
  AG[def.id] = Object.assign(def, {
    x: s.x + 0.5, y: s.y + 0.5, z: 0, lineTo: null, path: [], facing: facingTo(0, 1), anim: 'sit', queue: [], cur: null, stepEnd: 0,
    hidden: false, carry: null, mugOnDesk: false, reserved: null, lastSay: 0, nextAmbient: rand(0.5, 3), ambient: 'En su puesto',
    real: { status: 'idle', stage: '', progress: 0, lastTask: 'Sin ejecuciones hoy', finding: '' }, blinkAt: rand(1, 4), chat: null,
  });
}
const AG_LIST = Object.values(AG);
if (OPT.stages) for (const [id, st] of Object.entries(OPT.stages)) if (AG[id]) AG[id].stages = st;
const seatOf = (a) => SEATS[a.seat];
const tileOf = (a) => ({ x: Math.floor(a.x), y: Math.floor(a.y) });

/* ============ rutas (8 direcciones, sin cortar esquinas) ============ */
const DIR8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
function findPath(from, to) {
  if (!walkable(to.x, to.y)) return [];
  const key = (x, y) => y * MW + x, start = key(from.x, from.y), goal = key(to.x, to.y);
  if (start === goal) return [];
  const prev = new Int32Array(MW * MH).fill(-1); prev[start] = start;
  const q = [start];
  for (let i = 0; i < q.length; i++) {
    const cur = q[i]; if (cur === goal) break;
    const cx = cur % MW, cy = (cur - cx) / MW;
    for (const [dx, dy] of DIR8) {
      const nx = cx + dx, ny = cy + dy;
      if (!walkable(nx, ny)) continue;
      if (dx && dy && (!walkable(cx + dx, cy) || !walkable(cx, cy + dy))) continue;
      const k = key(nx, ny); if (prev[k] !== -1) continue;
      prev[k] = cur; q.push(k);
    }
  }
  if (prev[goal] === -1) return [];
  const path = [];
  for (let k = goal; k !== start; k = prev[k]) path.push({ x: k % MW, y: Math.floor(k / MW) });
  return path.reverse();
}

/* ============ reservas de sitios ============ */
const RES = new Map();
const sk = (p) => `${p.x},${p.y}`;
function reserve(a, p) { const k = sk(p), o = RES.get(k); if (o && o !== a.id) return false; release(a); RES.set(k, a.id); a.reserved = k; return true; }
function release(a) { if (a.reserved && RES.get(a.reserved) === a.id) RES.delete(a.reserved); a.reserved = null; }
const free = (p, a) => { const o = RES.get(sk(p)); return !o || o === a.id; };

/* ============ efectos: partículas, papeles, emociones, bocadillos ============ */
const parts = [], flights = [], emotes = [], bubbles = [];
function puff(x, y, c, vy = -6) { parts.push({ x, y, vx: rand(-1.5, 1.5), vy, life: 0, max: rand(0.8, 1.4), c, s: 1 }); }
function sparkle(x, y, c, max = 0.7) { parts.push({ x, y, vx: rand(-4, 4), vy: rand(-14, -6), life: 0, max, c, s: 1 }); }
function confetti(x, y, n = 30) {
  if (REDUCED) n = Math.min(n, 8);
  const cols = ['#ff4d6d', '#ffd23f', '#3df5a8', '#3fc6f5', '#a463f2', '#ff9f43'];
  for (let i = 0; i < n; i++) parts.push({ x, y, vx: rand(-40, 40), vy: rand(-70, -30), life: 0, max: rand(1.2, 2.2), c: pick(cols), s: 2, g: 90 });
}
function emote(target, icon, dur = 2.2) { emotes.push({ target, icon, t0: W.t, dur }); }
function say(a, text, force = false) {
  if (!force && W.t - a.lastSay < 2.5) return;
  a.lastSay = W.t;
  const h = 34;
  for (const b of bubbles) b.off += h + 6;
  bubbles.push({ a, text, t0: W.t, dur: 4.6, off: 0, wx: iso(a.x, a.y).x });
  if (bubbles.length > 7) bubbles.shift();
}
function fly(from, to, onDone, dur = 0.9) { flights.push({ from, to, t0: W.t, dur, onDone }); }

/* ============ pasos de comportamiento ============ */
const S = {
  go: (to, faceTo) => ({ k: 'go', to, faceTo }),
  face: (to) => ({ k: 'face', to }),
  anim: (anim, dur, tick) => ({ k: 'anim', anim, dur, tick }),
  say: (text, chance = 1) => ({ k: 'say', text, chance }),
  emote: (icon) => ({ k: 'emote', icon }),
  call: (fn) => ({ k: 'call', fn }),
  wait: (dur) => ({ k: 'wait', dur }),
  until: (cond, max = 8) => ({ k: 'until', cond, max }),
  hide: (dur, where = 'bath') => ({ k: 'hide', dur, where }),
  lift: (z) => ({ k: 'lift', z }),
  line: (to) => ({ k: 'line', to }),
};
const lines = (arr) => typeof arr === 'string' ? arr : pick(arr);

function startStep(a, s) {
  const t = W.t;
  switch (s.k) {
    case 'go': {
      const p = findPath(tileOf(a), s.to);
      const here = tileOf(a);
      const off = Math.abs(a.x - (here.x + 0.5)) + Math.abs(a.y - (here.y + 0.5)) > 0.04;
      a.path = off ? [here, ...p] : p;
      return;
    }
    case 'face': a.facing = facingTo(s.to.x - Math.floor(a.x), s.to.y - Math.floor(a.y)); s.done = true; return;
    case 'anim': a.anim = s.anim; a.stepEnd = t + (s.dur ?? Infinity); return;
    case 'say': if (Math.random() < s.chance) say(a, lines(s.text)); s.done = true; return;
    case 'emote': emote(a, s.icon); s.done = true; return;
    case 'call': s.fn(a); s.done = true; return;
    case 'wait': a.stepEnd = t + s.dur; return;
    case 'until': a.stepEnd = t + s.max; return;
    case 'hide': a.hidden = true; if (s.where === 'store') W.inStore = a.id; else W.bathroom = a.id; a.stepEnd = t + s.dur; return;
    case 'lift': s.from = a.z; s.t0 = t; a.stepEnd = t + 1.1; a.anim = 'stand'; return;
    case 'line': a.lineTo = s.to; a.path = []; return;
  }
}
function stepDone(a, s) {
  const t = W.t;
  if (s.done) return true;
  switch (s.k) {
    case 'go':
      if (a.path.length) return false;
      if (s.faceTo) a.facing = facingTo(s.faceTo.x - Math.floor(a.x), s.faceTo.y - Math.floor(a.y));
      a.anim = 'stand';
      return true;
    case 'anim': if (s.tick) s.tick(a, t); return t >= a.stepEnd;
    case 'wait': return t >= a.stepEnd;
    case 'until': return s.cond(a) || t >= a.stepEnd;
    case 'hide':
      if (t >= a.stepEnd) { a.hidden = false; if (s.where === 'store') W.inStore = null; else { W.bathroom = null; W.doorOpen = t + 0.7; } return true; }
      return false;
    case 'lift': {
      const k = clamp((t - s.t0) / 1.1, 0, 1), e = k * k * (3 - 2 * k);
      a.z = lerp(s.from, s.z, e); W.liftZ = a.z;
      return k >= 1;
    }
    case 'line': return !a.lineTo;
  }
  return true;
}

/* ============ catálogo de vida ambiental ============ */
const L_DESK = ['Repasando notas', 'Ordenando el correo', 'Echo un ojo a los datos', 'A ver qué hay hoy'];
const L_COFFEE = ['Voy a por un café', '¿Alguien quiere café?', 'Café y seguimos', 'Necesito cafeína'];
const L_BREAK = ['Ahora vuelvo', 'Un momento', 'Vuelvo enseguida'];
const L_BOARD = ['Lo dibujo y se entiende mejor', 'Esquema rápido', 'A ver si cuadra'];
const L_GAME = ['¡Una partida rápida!', '¡Nuevo récord!', 'Solo una más'];
const L_SUPER = ['¿Cómo vamos, equipo?', 'Buen trabajo hoy', 'Luego lo vemos en la mesa'];
const L_PHONE = ['Sí, te lo envío hoy', 'Perfecto, lo vemos', 'Te llamo luego'];
const CHATS = [
  ['¿Viste el dashboard de hoy?', 'Sí, la tendencia pinta bien'], ['¿Café después?', '¡Hecho!'],
  ['Me quedan dos detectores por revisar', 'Te paso mis notas'], ['¿Qué tal el finde?', 'Corto, como siempre'],
  ['Hoy toca informe semanal', 'Lo tengo casi'], ['¿Has visto al gato?', 'Está durmiendo otra vez'],
];

const deskFace = (a) => DESK_OF[a.id];
const backToDesk = (a, anim = 'type', dur = rand(4, 8)) => [S.go(seatOf(a), deskFace(a)), S.anim(anim, dur)];

const ACTIVITIES = {
  desk: { w: 30, label: 'En su puesto', make: (a) => [S.say(L_DESK, 0.35), ...backToDesk(a, pick(['type', 'type', 'sit']), rand(5, 10))] },
  coffee: { w: 12, label: 'Tomando café', spot: { x: 2, y: 3 }, make: (a, sp) => [
    S.say(L_COFFEE, 0.7), S.go(sp, { x: 1, y: 3 }), S.call(() => { W.coffeeBusy = W.t + 1.8; }), S.anim('use', 1.8),
    S.call((x) => { x.carry = 'mug'; }), S.emote('coffee'), S.anim('drink', 1.3),
    S.go(seatOf(a), deskFace(a)), S.call((x) => { x.carry = null; x.mugOnDesk = true; }), S.anim('sitDrink', 2.4), S.anim('type', rand(3, 6))] },
  water: { w: 6, label: 'Bebiendo agua', spot: { x: 2, y: 5 }, make: (a, sp) => [
    S.go(sp, { x: 1, y: 5 }), S.call(() => { W.waterBusy = W.t + 1.4; }), S.anim('use', 1.4), S.emote('drop'), S.anim('drink', 1.1)] },
  fridge: { w: 4, label: 'Picando algo', spot: { x: 2, y: 4 }, make: (a, sp) => [
    S.go(sp, { x: 1, y: 4 }), S.call(() => { W.fridgeOpen = W.t + 2; }), S.anim('use', 2), S.emote('apple'), S.say(['¿De quién es este yogur?', 'Mmm…'], 0.4)] },
  bathroom: { w: 5, label: 'Fuera un momento', spot: { x: 14, y: 1 }, make: (a, sp) => [
    S.say(L_BREAK, 0.7), S.go(sp, { x: 14, y: 0 }), S.call(() => { W.doorOpen = W.t + 0.6; }), S.wait(0.35), S.hide(rand(5, 9)), S.wait(0.3)] },
  board: { w: 6, label: 'En la pizarra', spot: { x: 2, y: 1 }, make: (a, sp) => [
    S.go(sp, { x: 1, y: 1 }), S.emote('idea'), S.say(L_BOARD, 0.4), S.anim('write', rand(3, 5), boardTick)] },
  arcade: { w: 5, label: 'Jugando a la recreativa', spot: { x: 9, y: 2 }, make: (a, sp) => {
    const d = rand(5, 8);
    return [S.go(sp, { x: 9, y: 1 }), S.call(() => { W.arcadePlaying = W.t + d; }), S.anim('play', d), S.emote(pick(['star', 'smile'])), S.say(L_GAME, 0.6)];
  } },
  window: { w: 5, label: 'Mirando por la ventana', spot: () => pick([{ x: 5, y: 1 }, { x: 12, y: 1 }]), make: (a, sp) => [
    S.go(sp, { x: sp.x, y: 0 }), S.anim('stretch', 2.4), S.emote(nightness(W.hour) > 0.5 ? 'star' : 'smile')] },
  printer: { w: 5, label: 'Imprimiendo', spot: { x: 13, y: 3 }, make: (a, sp) => [
    S.go(sp, { x: 14, y: 3 }), S.call(() => { W.printing = W.t + 1.8; W.printStart = W.t; }), S.anim('use', 1.8),
    S.call((x) => { x.carry = 'paper'; }), S.emote('paper'), S.go(seatOf(a), deskFace(a)), S.call((x) => { x.carry = null; }), S.anim('type', rand(3, 5))] },
  sofa: { w: 6, label: 'Descansando en el sofá', spot: () => pick([{ x: 1, y: 8 }, { x: 1, y: 9 }, { x: 6, y: 9 }, { x: 8, y: 9 }]), make: (a, sp) => [
    S.go(sp, sp.x === 1 ? { x: 2, y: sp.y } : { x: 7, y: 10 }), S.anim(a.id === 'lucia' || a.id === 'ceo' ? 'sitPhone' : 'sit', rand(6, 9)), S.emote('music')] },
  cat: { w: 5, label: 'Saludando al gato', make: (a) => {
    const c = W.cat; if (!c) return null;
    const ct = { x: Math.floor(c.x), y: Math.floor(c.y) };
    const n = DIR8.slice(0, 4).map(([dx, dy]) => ({ x: ct.x + dx, y: ct.y + dy })).find((p) => walkable(p.x, p.y) && free(p, a));
    if (!n) return null;
    return [S.go(n, ct), S.anim('pet', 2.2), S.call(() => { emote(c, 'heart'); c.mode = 'sit'; c.until = W.t + 3; }), S.say(['¿Quién es un buen gato?', 'Hola, pequeño'], 0.5)];
  } },
  chat: { w: 10, label: 'Charlando', make: (a) => startChat(a) },
  warehouse: { w: 2, label: 'Ronda por el almacén', spot: { x: 14, y: 2 }, make: (a, sp) => [
    S.say(['Voy a revisar el almacén', 'Ronda de stock', 'Bajo a ver los palés'], 0.8), S.go(sp, { x: 15, y: 2 }), S.lift(BRIDGE.z),
    S.line({ x: 22.3, y: 2.5 }), S.hide(rand(6, 10), 'store'), S.line({ x: 14.5, y: 2.5 }), S.lift(0),
    S.say(['Todo en orden ahí abajo', 'He contado las cajas', 'Hay palés por colocar', 'El stock cuadra'], 0.9), S.emote(pick(['check', 'paper']))] },
  supervise: { w: 0, label: 'Pasando por las mesas', make: (a) => {
    const target = pick(AG_LIST.filter((x) => x.id !== 'ceo')); const d = DESK_OF[target.id];
    return [S.go({ x: d.x, y: d.y + 1 }, d), S.anim('talk', 2.2), S.say(L_SUPER, 0.8), S.emote(pick(['smile', 'idea']))];
  } },
  phone: { w: 0, label: 'Al teléfono', make: (a) => [S.go(pick([{ x: 12, y: 9 }, { x: 13, y: 9 }, { x: 12, y: 7 }]), { x: 14, y: 9 }), S.anim('phone', rand(4, 6)), S.say(L_PHONE, 0.7)] },
};
const WEIGHTS = {
  maria: { printer: 9, warehouse: 12 }, lucia: { chat: 14 },
  ceo: { desk: 22, supervise: 16, phone: 12, arcade: 2, printer: 0, board: 3, fridge: 2, warehouse: 3 },
  mattia: { board: 12, warehouse: 3 },
};

function boardTick(a, t) {
  if (Math.random() < 0.06) {
    const y0 = rand(0.14, 0.7), z = rand(18, 40);
    W.board.push({ y0, y1: y0 + rand(0.06, 0.2), z, dz: rand(-3, 3), c: pick(['#3d6ef5', '#ff4d6d', '#22c27a', '#2a2140']) });
    if (W.board.length > 26) W.board.splice(0, 6);
  }
}

function startChat(a) {
  const partner = pick(AG_LIST.filter((b) => b !== a && !b.hidden && !b.chat && b.real.status !== 'working' && !b.cur?.important && !b.queue.some((q) => q.important)));
  if (!partner) return null;
  const pairs = [[{ x: 2, y: 9 }, { x: 4, y: 9 }, { x: 3, y: 9 }], [{ x: 3, y: 8 }, { x: 3, y: 10 }, { x: 3, y: 9 }], [{ x: 9, y: 7 }, { x: 10, y: 8 }, { x: 10, y: 7 }], [{ x: 6, y: 9 }, { x: 8, y: 9 }, { x: 7, y: 9 }, true]];
  const pr = pick(pairs.filter(([p, q]) => free(p, a) && free(q, partner)));
  if (!pr) return null;
  const [pa, pb, mid, seated] = pr;
  const TK = seated ? 'sitTalk' : 'talk', ST = seated ? 'sit' : 'stand';
  const conv = pick(CHATS), chat = { ready: 0 };
  interrupt(partner);
  reserve(partner, pb); partner.chat = chat; a.chat = chat;
  partner.ambient = `Charlando con ${a.name}`;
  partner.queue = [S.go(pb, mid), S.call(() => chat.ready++), S.until(() => chat.ready >= 2),
    S.anim(ST, 1.7), S.anim(TK, 1.8), S.call((x) => say(x, conv[1], true)), S.anim(TK, 1.6), S.emote(pick(['smile', 'heart'])), S.anim(ST, 0.8), S.call((x) => { x.chat = null; })];
  a.ambientPartner = partner.name;
  return [S.say('¿Tienes un minuto?', 0.5), S.go(pa, mid), S.call(() => chat.ready++), S.until(() => chat.ready >= 2),
    S.call((x) => say(x, conv[0], true)), S.anim(TK, 1.7), S.anim(ST, 1.8), S.anim(TK, 1.2), S.emote('smile'), S.anim(ST, 0.8), S.call((x) => { x.chat = null; })];
}

function chooseActivity(a) {
  const ws = WEIGHTS[a.id] || {};
  const opts = Object.entries(ACTIVITIES).map(([k, v]) => [k, v, ws[k] ?? v.w]).filter(([, , w]) => w > 0);
  for (let tries = 0; tries < 6; tries++) {
    let total = opts.reduce((s, o) => s + o[2], 0), r = Math.random() * total, chosen = opts[0];
    for (const o of opts) { r -= o[2]; if (r <= 0) { chosen = o; break; } }
    const [name, act] = chosen;
    let sp = typeof act.spot === 'function' ? act.spot() : act.spot;
    if (sp && !reserve(a, sp)) continue;
    if (!sp) release(a);
    const steps = act.make(a, sp);
    if (!steps) { release(a); continue; }
    a.queue = steps;
    a.ambient = name === 'chat' ? `Charlando con ${a.ambientPartner}` : act.label;
    return;
  }
  a.queue = backToDesk(a, 'sit', 3); a.ambient = 'En su puesto';
}

function interrupt(a) {
  release(a);
  if (a.hidden) { a.hidden = false; if (W.inStore === a.id) W.inStore = null; if (W.bathroom === a.id) { W.bathroom = null; W.doorOpen = W.t + 0.7; } }
  a.lineTo = null;
  if (a.chat) { const c = a.chat; a.chat = null; for (const b of AG_LIST) if (b !== a && b.chat === c) { b.chat = null; b.queue = []; b.cur = null; release(b); } }
  a.queue = []; a.cur = null; a.path = [];
  a.carry = a.carry === 'mug' ? null : a.carry;
}

/* ============ flujo real del análisis ============ */
function tableSeatFor(a) {
  const c = TABLE_SEATS.filter((p) => free(p, a));
  c.sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y));
  return c[0] || TABLE_SEATS[0];
}
const TABLE_CENTER = { x: 7, y: 5 };

function realStart(a) {
  interrupt(a);
  Object.assign(a.real, { status: 'working', stage: 'Preparando', progress: 0.05 });
  a.ambient = 'Trabajando en el análisis';
  if (a.id === 'ceo') {
    const sp = { x: 9, y: 5 }; reserve(a, sp);
    a.queue = [S.say('Vamos a consolidar', 1), S.go(sp, TABLE_CENTER), S.anim('type', Infinity)];
  } else {
    a.queue = [S.say(['Me pongo con ello', '¡Vamos allá!', 'Abro los datos'], 1), S.go(seatOf(a), deskFace(a)), S.anim('type', Infinity)];
  }
  a.queue.forEach((s) => { s.important = true; });
}
function realStage(a, stage) {
  if (a.real.status !== 'working') realStart(a);
  const i = a.stages.indexOf(stage);
  a.real.stage = stage; a.real.progress = i >= 0 ? (i + 1) / (a.stages.length + 1) : Math.min(0.9, a.real.progress + 0.25);
  emote(a, pick(['chart', 'idea']));
}
function realEnd(a, ok) {
  a.real.progress = 1; a.real.lastTask = a.real.stage || a.real.lastTask;
  interrupt(a);
  if (!ok) {
    a.real.status = 'error'; a.real.stage = 'Revisión necesaria';
    a.queue = [S.go(seatOf(a), deskFace(a)), S.emote('alert'), S.say('Algo ha fallado, lo reviso', 1), S.anim('sad', 8)];
    toast(`${a.name}: la ejecución terminó con error`);
    return;
  }
  a.real.status = 'done'; a.real.finding = a.finding; a.real.doneAt = W.t;
  if (a.id === 'ceo') {
    a.real.stage = 'Informe ejecutivo listo';
    a.queue = [S.call((x) => { collectPapers(x); }), S.anim('stand', 0.9), S.say('¡Informe ejecutivo listo!', 1), S.call(() => celebrateAll()), S.anim('celebrate', 2.6), S.go(seatOf(a), deskFace(a)), S.anim('sit', 3)];
    a.queue.forEach((s) => { s.important = true; });
    return;
  }
  a.real.stage = 'Informe entregado';
  const sp = tableSeatFor(a); reserve(a, sp);
  a.queue = [S.emote('check'), S.say(['¡Hallazgos listos!', 'Informe terminado', 'Listo por mi parte'], 1), S.anim('stretch', 0.8),
    S.call((x) => { x.carry = 'paper'; }), S.go(sp, TABLE_CENTER), S.anim('use', 0.5),
    S.call((x) => { x.carry = null; const p = iso(x.x, x.y, 16), q = iso(TABLE_CENTER.x + 0.5, TABLE_CENTER.y + 0.4, 18); fly(p, q, () => { W.stack = Math.min(3, W.stack + 1); sparkle(q.x, q.y, '#ffd23f'); sparkle(q.x, q.y, '#ffffff'); }); }),
    S.say(['Os lo dejo en la mesa', 'Para el CEO'], 0.6), S.anim('stand', 0.6)];
  a.queue.forEach((s) => { s.important = true; });
}
function collectPapers(ceo) {
  const n = W.stack; W.stack = 0;
  const q = iso(ceo.x, ceo.y, 18);
  for (let i = 0; i < n; i++) { const p = iso(TABLE_CENTER.x + 0.5 + i * 0.12, TABLE_CENTER.y + 0.4, 18 + i); setTimeout(() => fly(p, q, () => sparkle(q.x, q.y, '#3fc6f5'), 0.6), i * 150); }
}
function celebrateAll() {
  for (const a of AG_LIST) {
    if (a.hidden || a.real.status === 'working') continue;
    if (a.id !== 'ceo') interrupt(a);
    if (a.id !== 'ceo') a.queue = [S.anim('celebrate', 2.6), S.emote(pick(['star', 'heart', 'smile']))];
    const p = iso(a.x, a.y, 40); confetti(p.x, p.y, 26);
  }
  const c = iso(TABLE_CENTER.x + 0.5, TABLE_CENTER.y + 0.5, 30); confetti(c.x, c.y, 50);
  showBanner();
}

/* ============ reacciones a lo que hace el usuario en el panel ============ */
function react(agentId, kind, text) {
  const a = AG[agentId]; if (!a) return;
  if (a.real.status === 'working') { emote(a, kind === 'bad' ? 'dots' : kind === 'good' ? 'heart' : 'check'); if (text) say(a, text, true); return; }
  if (a.queue.some((s) => s.important) || a.cur?.important) { emote(a, 'smile'); return; }
  interrupt(a);
  const steps = [];
  if (kind === 'phone') steps.push(S.go(seatOf(a), deskFace(a)), S.say(text, 1), S.anim('sitPhone', 4), S.emote('check'));
  else if (kind === 'celebrate') steps.push(S.say(text, 1), S.anim('celebrate', 2.2), S.emote('star'));
  else if (kind === 'good') steps.push(S.emote('heart'), S.say(text, 1), S.anim('stretch', 1.2));
  else if (kind === 'bad') steps.push(S.emote('dots'), S.say(text, 1), S.anim('stand', 1.2));
  else steps.push(S.emote('check'), S.say(text, 1), S.anim('talk', 1.4));
  a.queue = steps; a.ambient = 'Atendiéndote';
}

/* ============ el gato ============ */
function initCat() {
  W.cat = { x: 4.5, y: 10.5, path: [], mode: 'sleep', until: 12, flip: 1, frameT: 0 };
}
function updateCat(dt) {
  const c = W.cat; if (!c) return;
  const t = W.t;
  if (c.path.length) {
    c.mode = 'walk';
    const n = c.path[0], tx = n.x + 0.5, ty = n.y + 0.5, dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy), st = 2.4 * dt;
    if (d > 0.001) c.flip = facingTo(dx, dy).flip;
    if (d <= st) { c.x = tx; c.y = ty; c.path.shift(); } else { c.x += dx / d * st; c.y += dy / d * st; }
    if (!c.path.length) {
      if (c.after === 'sleep') { c.mode = 'sleep'; c.until = t + rand(10, 18); } else { c.mode = 'sit'; c.until = t + rand(2, 5); }
      c.after = null;
    }
    return;
  }
  if (t < c.until) return;
  const from = { x: Math.floor(c.x), y: Math.floor(c.y) };
  const r = Math.random();
  if (r < 0.3) { c.path = findPath(from, { x: 4, y: 10 }); c.after = 'sleep'; }
  else if (r < 0.55) { const a = pick(AG_LIST.filter((x) => !x.hidden)); if (a) c.path = findPath(from, nearestWalk({ x: Math.floor(a.x) + 1, y: Math.floor(a.y) + 1 })); if (Math.random() < 0.4) catSay('Miau'); }
  else { const tiles = []; for (let y = 1; y < MH - 1; y++) for (let x = 1; x < MW - 1; x++) if ('.,~:'.includes(ch(x, y))) tiles.push({ x, y }); c.path = findPath(from, pick(tiles)); }
  if (!c.path.length) { if (c.after === 'sleep') { c.mode = 'sleep'; c.until = t + rand(10, 18); } else { c.mode = 'sit'; c.until = t + 3; } c.after = null; }
}
function nearestWalk(p) { for (const [dx, dy] of [[0, 0], ...DIR8]) if (walkable(p.x + dx, p.y + dy)) return { x: p.x + dx, y: p.y + dy }; return { x: 4, y: 10 }; }
function catSay(text) { const c = W.cat; bubbles.forEach((b) => { b.off += 30; }); bubbles.push({ cat: true, text, t0: W.t, dur: 2.6, off: 0, wx: iso(c.x, c.y).x }); }

/* ============ actualización de agentes ============ */
const SPEED = 3.6;
function updateAgent(a, dt) {
  const t = W.t;
  if (a.lineTo) {
    const dx = a.lineTo.x - a.x, dy = a.lineTo.y - a.y, d = Math.hypot(dx, dy), st = SPEED * dt;
    if (d > 0.001) a.facing = facingTo(dx, dy);
    if (d <= st) { a.x = a.lineTo.x; a.y = a.lineTo.y; a.lineTo = null; } else { a.x += dx / d * st; a.y += dy / d * st; }
    a.walking = true;
  } else if (a.path.length) {
    const n = a.path[0], tx = n.x + 0.5, ty = n.y + 0.5, dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy), st = SPEED * dt;
    if (d > 0.001) a.facing = facingTo(dx, dy);
    if (d <= st) { a.x = tx; a.y = ty; a.path.shift(); } else { a.x += dx / d * st; a.y += dy / d * st; }
    a.walking = true;
    if (!REDUCED && Math.random() < 0.04) { const p = iso(a.x, a.y); puff(p.x + rand(-3, 3), p.y, '#ffffff', -3); }
  } else a.walking = false;

  if (!a.cur && a.queue.length) {
    let nx = a.queue.shift();
    // si está en la pasarela o en el ascensor, primero vuelve a la oficina
    if (nx.k === 'go' && (a.z > 0.5 || a.x >= 15)) { a.queue.unshift(S.lift(0), nx); nx = a.x >= 15 ? S.line({ x: 14.5, y: 2.5 }) : a.queue.shift(); }
    a.cur = nx; startStep(a, a.cur);
  }
  if (a.cur && !a.walking) { if (stepDone(a, a.cur)) { a.cur = null; } }
  else if (a.cur && a.cur.k !== 'go' && stepDone(a, a.cur)) a.cur = null;

  if (!a.cur && !a.queue.length && !a.walking) {
    if (a.real.status === 'working') { a.queue = [S.go(seatOf(a), deskFace(a)), S.anim('type', Infinity)]; return; }
    if (!a.idleSince) a.idleSince = t;
    const atSeat = Math.floor(a.x) === seatOf(a).x && Math.floor(a.y) === seatOf(a).y && a.z < 0.5;
    a.anim = atSeat ? 'sit' : 'stand';
    if (t - a.idleSince > a.nextAmbient) { a.idleSince = 0; a.nextAmbient = rand(0.6, 2.4); chooseActivity(a); }
  } else a.idleSince = 0;

  if (!a.hidden && t > (a.nextAlertEmote || 8) && typeof openCritical === 'function' && openCritical(a.id) > 0) { a.nextAlertEmote = t + rand(10, 16); emote(a, 'alert', 1.6); }
  if (a.real.status === 'working' && !a.walking && a.anim === 'type' && Math.random() < dt * 5) {
    const d = DESK_OF[a.id] || seatOf(a); const p = iso(d.x + 0.75, d.y + 0.3, 30);
    sparkle(p.x + rand(-2, 2), p.y, pick(['#3fc6f5', '#3d6ef5', '#ffffff', '#3df5a8']), 0.9);
  }
}

/* ============ render ============ */
const view = $('scene');
const vctx = view.getContext('2d');
const [low, lg] = mk(LW, LH);
const { bg: BG, walls: WALLS } = buildBackground();
buildProps();
buildOutdoor();
initCat();
initOutdoorLife();
const ROOM = { x0: iso(1, MH - 1).x - 12, x1: iso(20, 2).x + 12, y0: iso(1, 1).y - WALL_H - 26, y1: iso(MW - 1, MH - 1).y + 18 };

let dpr = 1, vw = 0, vh = 0, scale = 2, zoom = 2, autoFit = true, minZoom = 0.5;
const cam = { x: LW / 2, y: LH / 2 + 4 }, camGoal = { x: cam.x, y: cam.y };
let selected = null, hovered = null;

function resize() {
  dpr = window.devicePixelRatio || 1;
  vw = view.clientWidth; vh = view.clientHeight;
  view.width = Math.round(vw * dpr); view.height = Math.round(vh * dpr);
  minZoom = Math.max(0.5, vw / (LW - 40), vh / (LH - 40));
  if (autoFit) {
    const narrow = vw < 820;
    const availW = narrow ? vw - 8 : vw - 330, availH = narrow ? vh - 330 : vh - 210;
    let z = Math.min(availW / (ROOM.x1 - ROOM.x0), availH / (ROOM.y1 - ROOM.y0));
    if (z >= 1) z = dpr >= 2 ? Math.floor(z * 2) / 2 : Math.floor(z);
    zoom = clamp(z, minZoom, 6);
    const sc = screenScale();
    camGoal.x = (ROOM.x0 + ROOM.x1) / 2 - (narrow ? 0 : 150 / sc);
    camGoal.y = (ROOM.y0 + ROOM.y1) / 2 + (narrow ? 110 / sc : -6 / sc);
  }
  zoom = Math.max(zoom, minZoom);
}
window.addEventListener('resize', resize);
CLEAN.push(() => window.removeEventListener('resize', resize));
{ const ro = new ResizeObserver(() => resize()); ro.observe(ROOT); CLEAN.push(() => ro.disconnect()); }

const devScale = () => Math.max(1, zoom >= 1 ? Math.round(zoom * dpr) : Math.floor(zoom * dpr));
const screenScale = () => devScale() / dpr;
function toScreen(lx, ly) { const s = screenScale(); return { x: vw / 2 + (lx - cam.x) * s, y: vh / 2 + (ly - cam.y) * s }; }
function toLow(sx, sy) { const s = screenScale(); return { x: (sx - vw / 2) / s + cam.x, y: (sy - vh / 2) / s + cam.y }; }

function frameOf(a) {
  const t = W.t;
  if (a.walking) return { anim: 'walk', f: Math.floor(t / 0.09) % 4 };
  const an = a.anim;
  const per = { type: 0.12, play: 0.1, talk: 0.18, sitTalk: 0.18, phone: 0.22, sitPhone: 0.22, celebrate: 0.2, stretch: 0.6, write: 0.25, use: 0.3, pet: 0.3, drink: 0.7, sitDrink: 0.7 }[an];
  if (per) return { anim: an, f: Math.floor(t / per) % 2 };
  if (an === 'stand' && !a.facing.back && (t % a.blinkAt) < 0.12) return { anim: 'blink', f: 0 };
  return { anim: an, f: 0 };
}

function drawBackdrop(g, t, n) {
  const sky = W.dayNight ? keyframe(W.hour, SKY) : '#9fd6f5';
  g.fillStyle = mix(sky, '#ffffff', 0.22); g.fillRect(0, 0, LW, LH);
  if (n > 0.55) {
    for (let i = 0; i < 40; i++) { const x = (i * 97) % LW, y = (i * 53) % (LH - 40); if ((Math.floor(t * 2) + i) % 7) P.rect(g, x, y, 1, 1, '#fff6c8'); }
  } else {
    for (let i = 0; i < 6; i++) {
      const w = 26 + (i % 3) * 10, x = ((i * 131 + t * (3 + i % 3)) % (LW + 120)) - 60, y = 18 + ((i * 47) % (LH - 60));
      g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillRect(Math.round(x), y, w, 6); g.fillRect(Math.round(x) + 6, y - 4, w - 12, 4); g.fillRect(Math.round(x) + 12, y - 7, 10, 3);
    }
  }
}

function drawHolo(g, a, t) {
  let L, ox = 0.5;
  if (a.id === 'ceo' && Math.floor(a.y) === 5) L = WL(TABLE_CENTER.x, TABLE_CENTER.y), ox = 0.5;
  else { const d = DESK_OF[a.id]; L = WL(d.x, d.y); }
  const z0 = 34, z1 = 52, x0 = 0.12, x1 = 0.88, y = 0.5;
  const q = [L(x0, y, z0), L(x1, y, z0), L(x1, y, z1), L(x0, y, z1)];
  P.poly(g, q, 'rgba(20,60,160,0.55)');
  for (let i = 0; i < 4; i++) { const p0 = q[i], p1 = q[(i + 1) % 4]; P.line(g, p0.x, p0.y, p1.x, p1.y, 'rgba(120,200,255,0.9)'); }
  for (let i = 0; i < 6; i++) {
    const u = 0.2 + i * 0.11, h = 3 + Math.round((Math.sin(t * 3 + i * 1.3 + a.x) + 1) * 5);
    const b0 = L(u, y, z0 + 3), b1 = L(u + 0.07, y, z0 + 3), b2 = L(u + 0.07, y, z0 + 3 + h), b3 = L(u, y, z0 + 3 + h);
    P.poly(g, [b0, b1, b2, b3], i % 2 ? 'rgba(80,240,200,0.85)' : 'rgba(120,190,255,0.9)');
  }
  const sc = (t * 0.6) % 1, s0 = L(x0, y, lerp(z0, z1, sc)), s1 = L(x1, y, lerp(z0, z1, sc));
  P.line(g, s0.x, s0.y, s1.x, s1.y, 'rgba(255,255,255,0.35)');
}
function glow(g, x, y, r, rgb, a) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
}

function render() {
  const t = W.t, n = W.dayNight ? nightness(W.hour) : 0;
  lg.fillStyle = GC.grass[0]; lg.fillRect(0, 0, LW, LH);
  lg.drawImage(BG, 0, 0);
  drawDucks(lg, t);
  for (let i = 0; i < 5; i++) { const k = (t * 0.3 + i * 0.21) % 1, p = iso(POND.cx - 1.6 + k * 2.8, POND.cy - 1 + ((i * 0.37) % 1) * 1.8); P.rect(lg, p.x, p.y, 3, 1, '#c8ecff'); }
  drawSunPatches(lg);

  const items = [];
  for (const p of props) items.push({ d: p.depth, p });
  for (const a of AG_LIST) if (!a.hidden) items.push({ d: a.x + a.y + 0.05, a });
  if (W.cat) items.push({ d: W.cat.x + W.cat.y + 0.02, cat: W.cat });
  outdoorItems(items);
  items.sort((m, k) => m.d - k.d);
  const behind = (it) => (it.p && it.p.out && (it.p.tx < 1 || it.p.ty < 1)) || (it.veh && it.veh.y < 1);
  const drawIt = (it) => {
    if (it.p) {
      const p = it.p, s = iso(p.tx, p.ty);
      if (p.spr) lg.drawImage(p.spr.c, s.x - p.spr.ax, s.y - p.spr.ay);
      if (p.dyn) p.dyn(lg, t);
    } else if (it.a) {
      const a = it.a, s = iso(a.x, a.y, a.z);
      lg.fillStyle = 'rgba(42,33,64,0.22)'; lg.fillRect(Math.round(s.x) - 6, Math.round(s.y) - 1, 13, 3);
      if (a === selected) { P.rect(lg, s.x - 9, s.y - 1, 19, 1, '#3d6ef5'); P.rect(lg, s.x - 7, s.y - 2, 15, 1, '#3d6ef5'); P.rect(lg, s.x - 7, s.y + 1, 15, 1, '#3d6ef5'); }
      const { anim, f } = frameOf(a);
      const spr = avatarSprite(a, a.facing.back ? 'back' : 'front', anim, f, a.carry, a.facing.flip);
      lg.drawImage(spr.c, Math.round(s.x) - spr.ax, Math.round(s.y) - spr.ay);
    } else if (it.cat) {
      const c = it.cat, s = iso(c.x, c.y);
      const fr = c.mode === 'walk' ? (Math.floor(t / 0.15) % 2 ? 'walk1' : 'walk0') : c.mode === 'sleep' ? 'sleep' : 'sit';
      const spr = catSprite(fr, c.flip);
      lg.drawImage(spr.c, Math.round(s.x) - spr.ax, Math.round(s.y) - spr.ay);
    } else drawOutdoorItem(lg, it, t);
  };
  for (const it of items) if (behind(it)) drawIt(it);
  lg.drawImage(WALLS, 0, 0);
  drawWallDyn(lg, t);
  for (const it of items) if (!behind(it)) drawIt(it);
  drawCloudShadows(lg, t);

  // papeles volando
  for (const fl of flights) {
    const k = clamp((t - fl.t0) / fl.dur, 0, 1), x = lerp(fl.from.x, fl.to.x, k), y = lerp(fl.from.y, fl.to.y, k) - Math.sin(k * Math.PI) * 18;
    P.rect(lg, x - 4, y - 3, 8, 6, OUT); P.rect(lg, x - 3, y - 2, 6, 4, '#ffffff'); P.rect(lg, x - 2, y - 1, 4, 1, '#9aa1b8');
  }
  // partículas
  for (const p of parts) {
    if (p.glow) continue;
    const a = 1 - p.life / p.max; if (a <= 0) continue;
    lg.globalAlpha = Math.min(1, a * 1.4); P.rect(lg, p.x, p.y, p.s, p.s, p.c);
  }
  lg.globalAlpha = 1;

  // luz del momento del día
  if (W.dayNight) { lg.globalCompositeOperation = 'multiply'; lg.fillStyle = keyframe(W.hour, TINT); lg.fillRect(0, 0, LW, LH); }
  // pantallas holográficas (trabajo real) y brillos
  lg.globalCompositeOperation = 'source-over';
  for (const a of AG_LIST) if (a.real.status === 'working' && !a.hidden) drawHolo(lg, a, t);
  lg.globalCompositeOperation = 'lighter';
  for (const a of AG_LIST) {
    if (a.real.status === 'working' && !a.hidden) {
      const d = a.id === 'ceo' && Math.floor(a.y) === 5 ? TABLE_CENTER : DESK_OF[a.id], p = iso(d.x + 0.5, d.y + 0.5, 30);
      glow(lg, p.x, p.y, 34, '70,140,255', 0.28 + 0.06 * Math.sin(t * 4));
    }
  }
  if (n > 0.05) {
    for (const id of Object.keys(DESK_OF)) { const d = DESK_OF[id], p = iso(d.x + 0.5, d.y + 0.5, 14); glow(lg, p.x, p.y, 30, '255,190,110', 0.32 * n); }
    const ar = iso(9.5, 1.4, 46); glow(lg, ar.x, ar.y, 22, '255,80,160', 0.35 * n);
    const cm = iso(1.5, 3.5, 30); glow(lg, cm.x, cm.y, 16, '255,120,80', 0.3 * n);
    const tb = iso(7.5, 5.5, 20); glow(lg, tb.x, tb.y, 40, '255,210,150', 0.22 * n);
    const ce = iso(13.5, 7.5, 20); glow(lg, ce.x, ce.y, 30, '255,200,120', 0.3 * n);
  }
  outdoorGlows(lg, n, t);
  for (const p of parts) if (p.glow) { const a = Math.sin((p.life / p.max) * Math.PI); lg.globalAlpha = a; P.rect(lg, p.x, p.y, 1, 1, p.c); glow(lg, p.x, p.y, 5, '255,250,150', 0.5 * a); }
  lg.globalAlpha = 1;
  if (W.fridgeOpen > t) { const f = iso(1.9, 4.5, 24); glow(lg, f.x, f.y, 18, '255,250,200', 0.45); }
  lg.globalCompositeOperation = 'source-over';

  // emociones y flecha de selección (sin oscurecer)
  for (const e of emotes) {
    const tg = e.target; if (tg.hidden) continue;
    const s = iso(tg.x, tg.y, tg.z || 0), age = t - e.t0, up = age < 0.15 ? (1 - age / 0.15) * 5 : 0;
    const icon = iconSprite(e.icon), isCat = tg === W.cat;
    lg.drawImage(icon, Math.round(s.x) - 7, Math.round(s.y - (isCat ? 26 : 56) + up - Math.min(3, age * 2)));
  }
  if (selected && !selected.hidden) {
    const s = iso(selected.x, selected.y, selected.z), b = Math.round(Math.sin(t * 5) * 2), y = Math.round(s.y) - (SIT.has(selected.anim) && !selected.walking ? 44 : 48) + b, x = Math.round(s.x);
    P.rect(lg, x - 4, y - 1, 9, 1, OUT); P.rect(lg, x - 3, y, 7, 1, '#3d6ef5'); P.rect(lg, x - 4, y, 1, 1, OUT); P.rect(lg, x + 4, y, 1, 1, OUT);
    P.rect(lg, x - 2, y + 1, 5, 1, '#3d6ef5'); P.rect(lg, x - 3, y + 1, 1, 1, OUT); P.rect(lg, x + 3, y + 1, 1, 1, OUT);
    P.rect(lg, x - 1, y + 2, 3, 1, '#3d6ef5'); P.rect(lg, x - 2, y + 2, 1, 1, OUT); P.rect(lg, x + 2, y + 2, 1, 1, OUT); P.rect(lg, x, y + 3, 1, 1, OUT);
  }

  // volcado escalado a pantalla

  vctx.setTransform(1, 0, 0, 1, 0, 0);
  vctx.imageSmoothingEnabled = false;
  vctx.fillStyle = W.dayNight ? multiplyHex(GC.grass[0], keyframe(W.hour, TINT)) : GC.grass[0];
  vctx.fillRect(0, 0, view.width, view.height);
  const S = devScale();
  const ox = Math.round(view.width / 2 - cam.x * S), oy = Math.round(view.height / 2 - cam.y * S);
  const sx0 = clamp(Math.floor(-ox / S), 0, LW - 1), sy0 = clamp(Math.floor(-oy / S), 0, LH - 1);
  const sw = Math.min(LW - sx0, Math.ceil(view.width / S) + 2), sh = Math.min(LH - sy0, Math.ceil(view.height / S) + 2);
  if (sw > 0 && sh > 0) vctx.drawImage(low, sx0, sy0, sw, sh, ox + sx0 * S, oy + sy0 * S, sw * S, sh * S);

  vctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawLabels(vctx, t);
  placeVineta();
}
function multiplyHex(a, b) { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex(A[0] * B[0] / 255, A[1] * B[1] / 255, A[2] * B[2] / 255); }

/* ============ textos en pantalla: bocadillos, estados, nombres ============ */
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
const STATUS_COL = { working: '#3d6ef5', done: '#22a86f', error: '#e5484d' };

function drawLabels(g, t) {
  const sc = screenScale(), small = sc < 2;
  // estados y nombres
  for (const a of AG_LIST) {
    if (a.hidden) continue;
    const head = iso(a.x, a.y, a.z).y - (SIT.has(a.anim) && !a.walking ? 40 : 44);
    const p = toScreen(iso(a.x, a.y).x, head);
    let y = p.y - 6;
    const st = a.real.status;
    const showBadge = st === 'working' || st === 'error' || (st === 'done' && W.t - (a.real.doneAt || 0) < (a.id === 'ceo' ? 12 : 7));
    a.badgeH = 0;
    if (showBadge) {
      const label = st === 'working' ? a.real.stage : st === 'done' ? (a.id === 'ceo' ? 'Informe ejecutivo listo' : 'Informe entregado') : 'Revisión necesaria';
      g.font = `800 ${small ? 11 : 12}px Nunito, system-ui, sans-serif`;
      const tw = g.measureText(label).width, w = tw + (st === 'working' ? 30 : 26), h = small ? 20 : 22;
      roundRect(g, p.x - w / 2, y - h, w, h, h / 2); g.fillStyle = STATUS_COL[st]; g.fill();
      g.lineWidth = 2; g.strokeStyle = OUT; g.stroke();
      g.fillStyle = '#ffffff'; g.textBaseline = 'middle'; g.textAlign = 'left';
      if (st === 'working') {
        for (let i = 0; i < 3; i++) { g.globalAlpha = 0.35 + 0.65 * ((Math.floor(t * 4) % 3) === i ? 1 : 0); g.fillRect(p.x - w / 2 + 8 + i * 4, y - h / 2 - 1, 3, 3); }
        g.globalAlpha = 1; g.fillText(label, p.x - w / 2 + 22, y - h / 2 + 1);
      } else { g.fillText(st === 'done' ? '✓' : '!', p.x - w / 2 + 9, y - h / 2 + 1); g.fillText(label, p.x - w / 2 + 19, y - h / 2 + 1); }
      y -= h + 5; a.badgeH = h + 5;
    }
    if (a === hovered || a === selected) {
      const label = `${a.name} · ${a.role}`;
      g.font = '600 13px "Pixelify Sans", ui-monospace, monospace';
      const w = g.measureText(label).width + 16, h = 20;
      roundRect(g, p.x - w / 2, y - h, w, h, 6); g.fillStyle = 'rgba(42,33,64,0.9)'; g.fill();
      g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, p.x, y - h / 2 + 1);
    }
  }
  // bocadillos tipo Habbo (suben y se apilan)
  g.textBaseline = 'middle';
  for (const b of bubbles) {
    const age = t - b.t0; if (age > b.dur) continue;
    const src = b.cat ? W.cat : b.a; if (!src) continue;
    const anchorY = iso(src.x, src.y, src.z || 0).y - (b.cat ? 22 : 50);
    const p = toScreen(b.wx, anchorY);
    const rise = REDUCED ? 0 : age * 9;
    const x = p.x, y = p.y - 30 - (b.cat ? 0 : (b.a.badgeH || 0)) - b.off - rise;
    const name = b.cat ? 'Gato' : b.a.name;
    g.font = '700 13px "Pixelify Sans", ui-monospace, monospace';
    const nw = g.measureText(name + ': ').width;
    g.font = '600 13px Nunito, system-ui, sans-serif';
    const tw = g.measureText(b.text).width;
    const w = nw + tw + 18, h = 26;
    const pop = age < 0.14 && !REDUCED ? 0.7 + (age / 0.14) * 0.3 : 1;
    const fade = age > b.dur - 0.6 ? (b.dur - age) / 0.6 : 1;
    g.save(); g.globalAlpha = fade; g.translate(x, y); g.scale(pop, pop);
    roundRect(g, -w / 2, -h / 2, w, h, 8); g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 2; g.strokeStyle = OUT; g.stroke();
    if (b.off === 0) { g.beginPath(); g.moveTo(-5, h / 2 - 1); g.lineTo(5, h / 2 - 1); g.lineTo(0, h / 2 + 6); g.closePath(); g.fillStyle = '#ffffff'; g.fill(); g.stroke(); g.fillRect(-4, h / 2 - 3, 8, 3); }
    g.textAlign = 'left';
    g.font = '700 13px "Pixelify Sans", ui-monospace, monospace'; g.fillStyle = b.cat ? '#e07b23' : shade(b.a.color, 0.8); g.fillText(name + ':', -w / 2 + 9, 1);
    g.font = '600 13px Nunito, system-ui, sans-serif'; g.fillStyle = '#2a2140'; g.fillText(b.text, -w / 2 + 9 + nw, 1);
    g.restore();
  }
}

/* ============ bucle ============ */
let last = performance.now(), uiT = 0;
W.day = 25;
{
  const h = OPT.demo ? parseFloat(new URLSearchParams(location.search).get('hora')) : NaN;
  if (!Number.isNaN(h)) {
    const hh = h < 7.5 ? h + 24 : h;
    W.day = hh <= 22 ? ((hh - 7.5) / 14.5) * 0.94 * CYCLE : (0.94 + ((hh - 22) / 9.5) * 0.06) * CYCLE;
  }
}
let realH = 9, realAt = -1;
const fmtTz = new Intl.DateTimeFormat('es-ES', { timeZone: OPT.timeZone, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });
function realHour() {
  if (W.t - realAt > 1 || realAt < 0) {
    realAt = W.t;
    const p = fmtTz.formatToParts(new Date());
    realH = (Number(p.find((x) => x.type === 'hour').value) % 24) + Number(p.find((x) => x.type === 'minute').value) / 60;
  }
  return realH;
}
function update(dt) {
  W.t += dt; W.day += dt;
  W.hour = W.dayNight ? (OPT.clock === 'real' ? realHour() : hourAt(W.day)) : 11;
  for (const a of AG_LIST) updateAgent(a, dt);
  updateCat(dt);
  updateOutdoor(dt);
  for (const p of parts) { p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.g) p.vy += p.g * dt; else if (p.fly || p.glow) { p.vx += rand(-30, 30) * dt; p.vy += rand(-30, 30) * dt; p.vx = clamp(p.vx, -8, 8); p.vy = clamp(p.vy, -8, 8); } else p.vx *= 0.98; }
  for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life > parts[i].max) parts.splice(i, 1);
  if (parts.length > 400) parts.splice(0, parts.length - 400);
  for (let i = flights.length - 1; i >= 0; i--) { const f = flights[i]; if (W.t - f.t0 >= f.dur) { flights.splice(i, 1); f.onDone?.(); } }
  for (let i = emotes.length - 1; i >= 0; i--) if (W.t - emotes[i].t0 > emotes[i].dur) emotes.splice(i, 1);
  for (let i = bubbles.length - 1; i >= 0; i--) if (W.t - bubbles[i].t0 > bubbles[i].dur) bubbles.splice(i, 1);
  if (selected && autoFollow) { const s = iso(selected.x, selected.y - 1); camGoal.x = s.x; camGoal.y = s.y; }
  { const s = screenScale(), hw = vw / 2 / s, hh = vh / 2 / s;
    camGoal.x = clamp(camGoal.x, Math.min(hw, LW / 2), Math.max(LW - hw, LW / 2)); camGoal.y = clamp(camGoal.y, Math.min(hh, LH / 2), Math.max(LH - hh, LH / 2)); }
  cam.x = lerp(cam.x, camGoal.x, Math.min(1, dt * 6)); cam.y = lerp(cam.y, camGoal.y, Math.min(1, dt * 6));
}
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  update(dt); render();
  uiT += dt; if (uiT > 0.25) { uiT = 0; updateUI(); }
  if (!destroyed) rafId = requestAnimationFrame(loop);
}

/* ============ interacción con el mundo ============ */
let autoFollow = false;
let drag = null;
function hitAgent(sx, sy) {
  const l = toLow(sx, sy);
  let best = null, bd = -Infinity;
  for (const a of AG_LIST) {
    if (a.hidden) continue;
    const s = iso(a.x, a.y, a.z);
    if (l.x >= s.x - 10 && l.x <= s.x + 10 && l.y >= s.y - 38 && l.y <= s.y + 3 && a.x + a.y > bd) { best = a; bd = a.x + a.y; }
  }
  return best;
}
function hitCat(sx, sy) { const c = W.cat; if (!c) return false; const l = toLow(sx, sy), s = iso(c.x, c.y); return Math.abs(l.x - s.x) < 9 && l.y > s.y - 12 && l.y < s.y + 3; }
function tileAt(lx, ly, z = 0) { const u = (lx - OX) / 16, v = (ly + z - OY) / 8; return { x: Math.floor((u + v) / 2), y: Math.floor((v - u) / 2) }; }
/** Objetos del mundo que abren secciones del centro de mando. */
function hitSpot(sx, sy) {
  const l = toLow(sx, sy);
  for (const p of OUT_PROPS) {
    if (p.kind !== 'warehouse' && p.kind !== 'market') continue;
    const s = iso(p.tx, p.ty), x0 = s.x - p.spr.ax, y0 = s.y - p.spr.ay;
    if (l.x >= x0 && l.x <= x0 + p.spr.c.width && l.y >= y0 && l.y <= y0 + p.spr.c.height) {
      const g = p.spr.c.getContext('2d').getImageData(Math.floor(l.x - x0), Math.floor(l.y - y0), 1, 1).data;
      if (g[3] > 0) return p.kind === 'warehouse' ? { tab: 'almacen', label: 'Almacén: inventario' } : { tab: 'lucia', label: 'Hipermercado: ventas y clientes' };
    }
  }
  for (const z of [16, 8, 0, 28]) {
    const t = tileAt(l.x, l.y, z), k = ch(t.x, t.y);
    if (k === 'T') return { tab: 'decisiones', label: 'Mesa central: decisiones' };
    if (k === 'B') return { tab: 'resumen', label: 'Pizarra: resumen' };
    if (k === 'D') { const o = SEAT_OWNER[ch(t.x, t.y - 1)]; if (o) return { tab: o, label: `Mesa de ${AG[o].name}` }; }
    if (k === 'E') return { tab: 'ceo', label: 'Despacho del CEO' };
    if (k === 'R') return { tab: 'historial', label: 'Impresora: historial' };
    if (k === 'V') return { tab: 'almacen', label: 'Ascensor al almacén' };
    if (t.y === BRIDGE.y && t.x >= BRIDGE.x0 && t.x < BRIDGE.x1) return { tab: 'almacen', label: 'Pasarela al almacén' };
  }
  return null;
}
view.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, cx: camGoal.x, cy: camGoal.y, moved: false }; view.setPointerCapture(e.pointerId); });
view.addEventListener('pointermove', (e) => {
  const r = view.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) { drag.moved = true; autoFit = false; autoFollow = false; view.classList.add('dragging'); }
    if (drag.moved) { const s = screenScale(); camGoal.x = drag.cx - dx / s; camGoal.y = drag.cy - dy / s; cam.x = camGoal.x; cam.y = camGoal.y; }
    return;
  }
  hovered = hitAgent(sx, sy);
  view.classList.toggle('hover', !!hovered || hitCat(sx, sy) || !!hitSpot(sx, sy));
});
view.addEventListener('pointerup', (e) => {
  view.classList.remove('dragging');
  const r = view.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
  if (drag && !drag.moved) {
    const ag = hitAgent(sx, sy);
    if (ag) select(ag);
    else if (hitCat(sx, sy)) { emote(W.cat, 'heart'); catSay(pick(['Miau', 'Prrr', 'Miau miau'])); W.cat.mode = 'sit'; W.cat.until = W.t + 3; }
    else { const sp = hitSpot(sx, sy); if (sp) { feed(sp.label); openMenu(sp.tab); } else select(null); }
  }
  drag = null;
});
view.addEventListener('pointerleave', () => { hovered = null; });
view.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = view.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
  const before = toLow(sx, sy);
  const nz = clamp((zoom >= 2 ? Math.round(zoom) : zoom) + (e.deltaY < 0 ? 1 : -1), minZoom, 6);
  if (nz === zoom) return;
  zoom = nz; autoFit = false;
  const after = toLow(sx, sy);
  cam.x += before.x - after.x; cam.y += before.y - after.y; camGoal.x = cam.x; camGoal.y = cam.y;
}, { passive: false });
view.addEventListener('dblclick', () => { autoFit = true; autoFollow = false; select(null); resize(); });

/* ============ HUD ============ */
const team = $('team'), cards = {};
for (const a of AGENTS) {
  const b = document.createElement('button');
  b.className = 'panel card'; b.type = 'button'; b.setAttribute('aria-pressed', 'false');
  b.innerHTML = `<span class="badge" hidden></span><img class="avatar" alt="" src="${portrait(a, 48)}"><div><div class="who">${a.name} · ${a.role}</div><div class="state"><span class="dot"></span><span class="st">Libre</span></div><div class="bar"><i></i></div></div>`;
  b.addEventListener('click', () => select(selected === AG[a.id] ? null : AG[a.id], true));
  team.appendChild(b); cards[a.id] = b;
}
function stateText(a) {
  const s = a.real.status;
  if (s === 'working') return a.real.stage;
  if (s === 'done') return a.id === 'ceo' ? 'Informe ejecutivo listo' : 'Informe entregado';
  if (s === 'error') return 'Revisión necesaria';
  return 'Libre';
}
function select(a, fromCard = false) {
  selected = a || null;
  for (const id in cards) cards[id].setAttribute('aria-pressed', String(selected?.id === id));
  const f = $('ficha');
  if (!selected) { f.hidden = true; return; }
  f.hidden = false;
  $('fAvatar').src = portrait(selected, 64);
  if (fromCard) { const s = iso(selected.x, selected.y - 1); camGoal.x = s.x; camGoal.y = s.y; autoFit = false; }
  updateUI();
}
function updateUI() {
  for (const a of AG_LIST) {
    const c = cards[a.id]; c.dataset.s = a.real.status;
    c.querySelector('.st').textContent = stateText(a);
    c.querySelector('.bar i').style.width = `${Math.round((a.real.status === 'idle' ? 0 : a.real.progress) * 100)}%`;
    const n = openAlerts(a.id), bd = c.querySelector('.badge'); bd.hidden = n === 0; bd.textContent = n;
  }
  const hh = Math.floor(W.hour), mm = Math.floor((W.hour % 1) * 60);
  $('time').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  $('sky').textContent = nightness(W.hour) > 0.5 ? '☾' : W.hour >= 17.5 ? '◐' : '☀';
  if (selected) {
    const a = selected, n = openAlerts(a.id), c = openCritical(a.id);
    $('fName').textContent = a.name; $('fRole').textContent = a.role;
    $('fState').textContent = stateText(a);
    $('fAlerts').textContent = n ? `${n} abiertas${c ? `, ${c} de prioridad alta` : ''}` : 'Ninguna';
    $('fFind').textContent = topFinding(a.id);
    $('fAmb').textContent = a.hidden ? 'Fuera un momento' : a.walking && a.real.status !== 'working' ? `De camino: ${a.ambient.toLowerCase()}` : a.ambient;
    $('fOpen').textContent = a.id === 'ceo' ? 'Ver informe ejecutivo' : 'Ver expediente';
  }
  updateHotbar();
}
$('closeFicha').addEventListener('click', () => select(null));
let toastTimer = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600); }
$('fPanel').addEventListener('click', () => selected && openMenu(selected.id));
$('fOpen').addEventListener('click', () => selected && openExp(selected.id));
$('fChat').addEventListener('click', () => selected && openChatWith(selected.id));
function showBanner() { const b = $('banner'); b.classList.add('show'); setTimeout(() => b.classList.remove('show'), 5200); }
$('bannerBtn').addEventListener('click', () => { $('banner').classList.remove('show'); openMenu('decisiones'); });
function feed(text) {
  const hh = Math.floor(W.hour), mm = Math.floor((W.hour % 1) * 60);
  $('feedText').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}  ${text}`;
}

/* ============ pantalla completa ============ */
async function toggleFullscreen() {
  const app = $('app');
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (app.requestFullscreen) await app.requestFullscreen();
    else throw new Error('sin soporte');
  } catch {
    app.classList.toggle('immersive');
    toast(app.classList.contains('immersive') ? 'Modo inmersivo: aquí el navegador no permite pantalla completa' : 'Modo normal');
  }
  setTimeout(() => { autoFit = true; resize(); }, 120);
}
const onFs = () => { autoFit = true; resize(); updateHotbar(); };
document.addEventListener('fullscreenchange', onFs);
CLEAN.push(() => document.removeEventListener('fullscreenchange', onFs));

/* ============ barra de accesos rápidos ============ */
const SLOTS = [
  { id: 'resumen', label: 'Resumen', icon: 'chart', act: () => openMenu('resumen') },
  { id: 'alertas', label: 'Alertas', icon: 'alert', act: () => openMenu('alertas') },
  { id: 'decisiones', label: 'Decisiones', icon: 'star', act: () => openMenu('decisiones') },
  { id: 'pm', label: 'Almacén', icon: 'box', act: () => openMenu('almacen') },
  { id: 'historial', label: 'Historial', icon: 'clock', act: () => openMenu('historial') },
  { id: 'luz', label: 'Día/noche', icon: 'sun', act: () => { W.dayNight = !W.dayNight; updateHotbar(); } },
  { id: 'full', label: 'Pantalla', icon: 'full', act: toggleFullscreen },
];
const iconURL = (name) => iconSprite(name).toDataURL();
SLOTS.forEach((s, i) => {
  const b = document.createElement('button');
  b.className = 'slot'; b.type = 'button'; b.dataset.slot = s.id; b.title = `${s.label} (${i + 1})`; b.setAttribute('aria-label', s.label);
  b.innerHTML = `<kbd>${i + 1}</kbd><img alt="" src="${iconURL(s.icon)}"><small>${s.label}</small><span class="badge" hidden></span>`;
  b.addEventListener('click', s.act);
  $('hotbar').appendChild(b);
});
function updateHotbar() {
  const al = ROOT.querySelector('[data-slot="alertas"] .badge'), n = openAlerts();
  al.hidden = n === 0; al.textContent = n;
  ROOT.querySelector('[data-slot="luz"]').setAttribute('aria-pressed', String(W.dayNight));
  ROOT.querySelector('[data-slot="full"]').setAttribute('aria-pressed', String(!!document.fullscreenElement || $('app').classList.contains('immersive')));
}
const onKey = (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target?.isContentEditable) return;
  if (!ROOT.isConnected || ROOT.offsetParent === null) return;
  if (!$('menu').hidden) return;
  const i = Number(e.key) - 1;
  if (i >= 0 && i < SLOTS.length) { SLOTS[i].act(); e.preventDefault(); }
  else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
  else if (e.key === 'm' || e.key === 'M') openMenu('resumen');
  else if (e.key === 'Escape') select(null);
};
window.addEventListener('keydown', onKey);
CLEAN.push(() => window.removeEventListener('keydown', onKey));

/* ============ API de integración ============ */
function apply(ev) {
  const a = AG[ev.agentId];
  switch (ev.type) {
    case 'run.start':
      W.stack = 0;
      for (const x of AG_LIST) if (x.real.status !== 'working') Object.assign(x.real, { status: 'idle', stage: '', progress: 0, finding: '' });
      feed('Nuevo análisis en marcha'); break;
    case 'agent.start': if (a) { realStart(a); feed(`${a.name} empieza su parte del análisis`); } break;
    case 'agent.stage': if (a) { realStage(a, ev.stage); feed(`${a.name}: ${ev.stage}`); } break;
    case 'agent.end': if (a) { realEnd(a, ev.ok !== false); feed(ev.ok === false ? `${a.name}: la ejecución terminó con error` : `${a.name} ha terminado`); } break;
    default: break;
  }
  updateUI();
}

/* ============ demostración ============ */
let demo = false;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function analyst(id, fail) {
  const a = AG[id];
  apply({ type: 'agent.start', agentId: id });
  for (let i = 0; i < a.stages.length; i++) {
    await sleep(rand(1800, 2600));
    apply({ type: 'agent.stage', agentId: id, stage: a.stages[i] });
    await sleep(rand(3200, 4600));
    if (fail && i === 1) { apply({ type: 'agent.end', agentId: id, ok: false }); return false; }
  }
  apply({ type: 'agent.end', agentId: id, ok: true });
  return true;
}
async function runDemo(failId) {
  if (demo) return; demo = true;
  const run = $('run'); run.disabled = true; run.textContent = 'Análisis en curso…';
  const started = Date.now();
  apply({ type: 'run.start' });
  const res = await Promise.all(['maria', 'lucia', 'mattia'].map((id, i) => sleep(i * 1300).then(() => analyst(id, id === failId))));
  let ok = res.every(Boolean);
  if (ok) {
    const t0 = Date.now(); while (W.stack < 3 && Date.now() - t0 < 15000) await sleep(300);
    await sleep(1500);
    apply({ type: 'agent.start', agentId: 'ceo' });
    for (const s of AG.ceo.stages) { await sleep(rand(2600, 3400)); apply({ type: 'agent.stage', agentId: 'ceo', stage: s }); await sleep(3800); }
    apply({ type: 'agent.end', agentId: 'ceo', ok: true });
  }
  await DATA.recordRun({ start: new Date(started), durMin: Math.max(1, Math.round((Date.now() - started) / 60000)), status: ok ? 'ok' : 'error', alerts: ok ? 2 : 1 });
  if (ok) await DATA.addFreshAlerts();
  await sleep(ok ? 6000 : 3000);
  demo = false; run.disabled = false; run.textContent = 'Iniciar análisis';
  refreshMenu();
}
$('run').addEventListener('click', () => (OPT.demo ? runDemo() : requestRun()));
async function requestRun() {
  if (!OPT.onRunRequested) return;
  const b = $('run'); b.disabled = true; b.textContent = 'Análisis en curso…';
  try { await OPT.onRunRequested(); } catch (err) { toast('No se ha podido iniciar el análisis'); OPT.onError?.(err); b.disabled = false; b.textContent = 'Iniciar análisis'; }
}
function updateRunButton() {
  if (OPT.demo) return;
  const running = AG_LIST.some((a) => a.real.status === 'working'), b = $('run');
  b.disabled = running; b.textContent = running ? 'Análisis en curso…' : 'Iniciar análisis';
}
const openExp = (id) => (id === 'ceo' ? (OPT.onOpenInforme ? OPT.onOpenInforme() : toast('Aquí se abre el informe ejecutivo')) : (OPT.onOpenExpediente ? OPT.onOpenExpediente(id) : toast(`Aquí se abre el expediente de ${AG[id].name}`)));
const openChatWith = (id) => (OPT.onOpenChat ? OPT.onOpenChat(id) : toast(`Aquí se abre el chat con ${AG[id].name}`));

/* ============ datos (simulados) — en la app se sustituye por el origen real ============ */
const fmtEur = (v) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
const fmtNum = (v, d = 1) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: d, minimumFractionDigits: d }).format(v);
const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
function ago(d) {
  const min = Math.round((d.getTime() - Date.now()) / 60000);
  if (Math.abs(min) < 1) return 'ahora mismo';
  if (Math.abs(min) < 60) return rtf.format(min, 'minute');
  const h = Math.round(min / 60); if (Math.abs(h) < 24) return rtf.format(h, 'hour');
  return rtf.format(Math.round(h / 24), 'day');
}
function normSpark(arr) {
  if (!arr || !arr.length) return [];
  const mn = Math.min(...arr), mx = Math.max(...arr);
  return arr.map((v) => Math.round(18 + (mx === mn ? 0.5 : (v - mn) / (mx - mn)) * 82));
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function createMockData() {
  const now = Date.now(), H = (n) => new Date(now - n * 3600e3);
  let n = 0; const id = (p) => `${p}${++n}`;
  const st = {
    pms: [
      { id: 'pm-dro', name: 'Droguería y limpieza', skus: 296, cov: 6, breaks: 17, over: 2, dead: 5, score: 48, issues: ['17 referencias con rotura en tienda', 'Cobertura media de 6 días en almacén', '2 pedidos de proveedor sin confirmar'] },
      { id: 'pm-bzr', name: 'Bazar y hogar', skus: 351, cov: 41, breaks: 2, over: 19, dead: 58, score: 51, issues: ['19 % del valor con más de 60 días de cobertura', '58 referencias sin venta en 90 días'] },
      { id: 'pm-fre', name: 'Frescos y refrigerados', skus: 184, cov: 4, breaks: 12, over: 1, dead: 0, score: 54, issues: ['Cobertura media de 4 días', '3 pedidos de proveedor retrasados'] },
      { id: 'pm-ali', name: 'Alimentación seca', skus: 538, cov: 24, breaks: 4, over: 11, dead: 31, score: 66, issues: ['31 referencias sin venta en 90 días', 'Sobrestock moderado en conservas'] },
      { id: 'pm-beb', name: 'Bebidas', skus: 412, cov: 18, breaks: 9, over: 6, dead: 14, score: 72, issues: ['Roturas puntuales en formatos grandes'] },
      { id: 'pm-per', name: 'Perfumería', skus: 221, cov: 15, breaks: 3, over: 4, dead: 9, score: 83, issues: ['Sin incidencias relevantes'] },
    ],
    alerts: [
      { agent: 'maria', sev: 'alta', title: 'Cobertura por debajo de 7 días en Droguería y limpieza', detail: '17 referencias con rotura en tienda y 6 días de cobertura media en almacén.', since: H(2), pm: 'pm-dro' },
      { agent: 'maria', sev: 'alta', title: 'Frescos: riesgo de rotura antes del fin de semana', detail: 'La cobertura cae a 4 días y hay 3 pedidos de proveedor retrasados.', since: H(5), pm: 'pm-fre' },
      { agent: 'maria', sev: 'media', title: 'Sobrestock en Bazar y hogar', detail: 'El 19 % del valor del stock de esta cartera supera los 60 días de cobertura.', since: H(26), pm: 'pm-bzr' },
      { agent: 'maria', sev: 'baja', title: 'Referencias sin movimiento en Alimentación seca', detail: '31 referencias sin venta en 90 días, candidatas a descatalogar.', since: H(50), pm: 'pm-ali' },
      { agent: 'lucia', sev: 'alta', title: 'Caída del sell-out en Cadena Sur', detail: '−8,2 % frente a la semana anterior, concentrada en bebidas y droguería.', since: H(3) },
      { agent: 'lucia', sev: 'media', title: 'Promoción con baja respuesta en Cadena Norte', detail: 'La promoción de la semana rinde un 35 % por debajo de lo previsto.', since: H(9) },
      { agent: 'lucia', sev: 'baja', title: 'Nuevo máximo de ventas en Cadena Este', detail: '+12 % frente a la media de las últimas 8 semanas.', since: H(30) },
      { agent: 'mattia', sev: 'alta', title: 'Margen negativo en 6 referencias de bebidas', detail: 'El precio neto tras rappel queda por debajo del coste.', since: H(4) },
      { agent: 'mattia', sev: 'media', title: 'MGD por debajo del objetivo en Frescos', detail: 'Margen después de descuentos del 14,2 % frente a un objetivo del 17 %.', since: H(28) },
      { agent: 'mattia', sev: 'baja', title: 'Mejora del margen en Perfumería', detail: '+1,4 puntos tras la renegociación con proveedor.', since: H(52) },
      { agent: 'ceo', sev: 'media', title: 'Decisión sin responsable desde hace 5 días', detail: 'La revisión de la política de reposición de Frescos sigue sin asignar.', since: H(120) },
    ].map((a) => ({ id: id('al'), status: 'abierta', owner: null, feedback: null, ...a })),
    findings: {
      maria: [{ t: 'Dos carteras de PM en zona roja', e: 'Droguería y limpieza y Frescos combinan baja cobertura con roturas.', m: '2 de 6' }, { t: 'Stock inmovilizado en Bazar y hogar', e: 'Valor con más de 60 días de cobertura.', m: fmtEur(184000) }, { t: 'Rotura media en tienda', e: 'Referencias activas sin stock en el lineal.', m: '3,1 %' }],
      lucia: [{ t: 'Cadena Sur explica la caída semanal', e: 'Aporta el 70 % de la variación negativa.', m: '−8,2 %' }, { t: 'Los 20 primeros clientes, estables', e: 'Sin cambios relevantes en su cuota.', m: '62 % de la venta' }, { t: 'Bebidas tira de la semana', e: 'Mejor categoría frente al año anterior.', m: '+5,6 %' }],
      mattia: [{ t: 'El margen bruto mejora', e: 'Margen bruto medio de la semana.', m: '23,1 %' }, { t: 'Los rappels erosionan bebidas', e: '6 referencias con margen negativo tras rappel.', m: '−0,4 pts' }, { t: 'Perfumería, la más rentable', e: 'Margen después de descuentos.', m: '31,8 %' }],
      ceo: [{ t: 'Prioridad: reposición de Frescos', e: 'Une el riesgo de rotura de María con la caída de Lucía en Cadena Sur.', m: 'Alta' }, { t: 'Revisar rappels de bebidas', e: 'Propuesta de Mattia para recuperar margen.', m: '+0,4 pts' }],
    },
    sales: [['Cadena Norte', 412, 1.2], ['Cadena Sur', 298, -8.2], ['Cadena Este', 356, 12], ['Cadena Oeste', 218, 0.4]],
    mgWeeks: [21.8, 22.1, 22.4, 21.9, 22.6, 22.8, 22.5, 23.1],
    mgd: [['Perfumería', 31.8], ['Bebidas', 18.4], ['Alimentación seca', 19.6], ['Frescos', 14.2], ['Droguería', 21.3]],
    decisions: [
      { title: 'Adelantar la reposición de Frescos', why: 'Riesgo de rotura antes del fin de semana y caída en Cadena Sur.', impact: 'Evitar en torno al 2 % de venta perdida', agents: ['maria', 'lucia'], status: 'propuesta', owner: null, steps: [['Confirmar pedidos retrasados con proveedor', false], ['Subir el stock de seguridad dos días', false], ['Revisar el lunes la rotura en tienda', false]] },
      { title: 'Renegociar rappels de bebidas', why: '6 referencias con margen negativo tras rappel.', impact: '+0,4 puntos de margen', agents: ['mattia'], status: 'aceptada', owner: 'Dirección comercial', steps: [['Listar referencias afectadas', true], ['Reunión con proveedor', false], ['Actualizar condiciones', false]] },
      { title: 'Liquidar stock inmovilizado de Bazar', why: 'Más de 60 días de cobertura en el 19 % del valor.', impact: 'Liberar unos 184.000 € de stock', agents: ['maria', 'mattia'], status: 'en_curso', owner: 'Compras', steps: [['Seleccionar referencias', true], ['Acordar acción con cadenas', true], ['Medir resultado a 4 semanas', false]] },
      { title: 'Reforzar la promoción en Cadena Norte', why: 'La promoción rinde un 35 % por debajo de lo previsto.', impact: 'Recuperar volumen promocional', agents: ['lucia'], status: 'hecha', owner: 'Ventas', steps: [['Revisar mecánica', true], ['Ampliar cartelería', true]] },
    ].map((d) => ({ id: id('dc'), ...d })),
    runs: [0, 1, 2, 3, 4].map((i) => ({ id: id('rn'), start: new Date(now - (i + 1) * 86400e3 + 3600e3 * 0.3), durMin: 6 + (i * 3) % 4, status: i === 2 ? 'error' : 'ok', alerts: [4, 3, 1, 5, 2][i] })),
    kpis: { sales: { value: 1284000, delta: 3.4, spark: [1.08, 1.15, 1.12, 1.19, 1.17, 1.22, 1.24, 1.28] }, stockHealth: { delta: -3, spark: [74, 72, 70, 71, 68, 66, 65, 62] }, margin: { delta: 0.6 }, alertsSpark: [3, 5, 4, 6, 8, 7, 9, 11] },
    notified: {},
    inventory: {
      valueEur: 4820000, valueDelta: -1.8, units: 1236400, unitsDelta: -0.9, agingDays: 47, agingDelta: 2,
      deadEur: 312000, deadDays: 180, coverageDays: 38, updatedAt: new Date(now - 40 * 60e3),
      trend: [5.12, 5.08, 5.01, 4.97, 4.99, 4.93, 4.95, 4.9, 4.88, 4.86, 4.91, 4.82],
      aging: [['0-30 días', 2310000, '#22a86f'], ['31-90 días', 1420000, '#3d6ef5'], ['91-180 días', 778000, '#e8962a'], ['Más de 180 días', 312000, '#e5484d']],
      deadByCat: [['Bazar y hogar', 148000], ['Alimentación seca', 71000], ['Droguería', 39000], ['Perfumería', 24000], ['Resto', 30000]],
    },
  };
  const wait = () => new Promise((r) => setTimeout(r, 120));
  return {
    state: st,
    async updateAlert(alertId, patch) { await wait(); const a = st.alerts.find((x) => x.id === alertId); Object.assign(a, patch); return a; },
    async updateDecision(decId, patch) { await wait(); const d = st.decisions.find((x) => x.id === decId); Object.assign(d, patch); return d; },
    async toggleStep(decId, i) {
      await wait(); const d = st.decisions.find((x) => x.id === decId); d.steps[i][1] = !d.steps[i][1];
      const done = d.steps.filter((s) => s[1]).length;
      d.status = done === d.steps.length ? 'hecha' : done > 0 ? 'en_curso' : 'aceptada';
      return d;
    },
    async notifyPM(pmId) { await wait(); st.notified[pmId] = new Date(); },
    async recordRun(run) { await wait(); st.runs.unshift({ id: id('rn'), ...run }); },
    async addFreshAlerts() {
      await wait();
      st.alerts.unshift({ id: id('al'), agent: 'ceo', sev: 'media', title: 'Nuevas decisiones propuestas tras el análisis', detail: 'El informe ejecutivo incluye una propuesta para revisar con dirección.', since: new Date(), status: 'abierta', owner: null, feedback: null });
    },
  };
}
function createLiveData() {
  const st = { kpis: null, pms: [], alerts: [], findings: {}, sales: [], mgWeeks: [], mgd: [], decisions: [], runs: [], notified: {}, inventory: null };
  const remote = async (name, payload) => {
    if (!OPT.onAction) return;
    try { await OPT.onAction(name, payload); } catch (err) { toast('No se ha podido guardar el cambio'); OPT.onError?.(err); throw err; }
  };
  const statusOf = (d) => { const done = d.steps.filter((x) => x[1]).length; return done === d.steps.length ? 'hecha' : done > 0 ? 'en_curso' : 'aceptada'; };
  return {
    state: st,
    async updateAlert(id, patch) { const a = st.alerts.find((x) => x.id === id), prev = { ...a }; Object.assign(a, patch); try { await remote('alert.update', { id, patch }); } catch { Object.assign(a, prev); } return a; },
    async updateDecision(id, patch) { const d = st.decisions.find((x) => x.id === id), prev = { ...d }; Object.assign(d, patch); try { await remote('decision.update', { id, patch }); } catch { Object.assign(d, prev); } return d; },
    async toggleStep(id, i) {
      const d = st.decisions.find((x) => x.id === id), prev = d.status;
      d.steps[i][1] = !d.steps[i][1]; d.status = statusOf(d);
      try { await remote('decision.step', { id, index: i, done: d.steps[i][1], status: d.status }); } catch { d.steps[i][1] = !d.steps[i][1]; d.status = prev; }
      return d;
    },
    async notifyPM(pmId) { st.notified[pmId] = new Date(); try { await remote('pm.notify', { pmId }); } catch { delete st.notified[pmId]; } },
    async recordRun() {}, async addFreshAlerts() {},
  };
}
const DATA = OPT.demo ? createMockData() : createLiveData();
const toDate = (v) => (v instanceof Date ? v : v ? new Date(v) : null);
const AGING_COLS = ['#22a86f', '#3d6ef5', '#e8962a', '#e5484d', '#a463f2'];
function setData(partial = {}) {
  const st = DATA.state, p = { ...partial };
  if (p.alerts) p.alerts = p.alerts.map((a) => ({ status: 'abierta', owner: null, feedback: null, ...a, since: toDate(a.since) || new Date() }));
  if (p.runs) p.runs = p.runs.map((r) => ({ ...r, start: toDate(r.start) }));
  if (p.decisions) p.decisions = p.decisions.map((d) => ({ owner: null, ...d, steps: (d.steps || []).map((x) => (Array.isArray(x) ? x : [x.label, !!x.done])) }));
  if (p.notified) p.notified = Object.fromEntries(Object.entries(p.notified).map(([k, v]) => [k, toDate(v)]));
  if (p.inventory) {
    const inv = { deadDays: 180, ...p.inventory };
    inv.updatedAt = toDate(inv.updatedAt) || new Date();
    if (inv.trendEur) inv.trend = inv.trendEur.map((v) => v / 1e6);
    inv.aging = (inv.aging || []).map((x, i) => [x[0], x[1], x[2] || AGING_COLS[i % AGING_COLS.length]]);
    inv.deadByCat = inv.deadByCat || [];
    p.inventory = inv;
  }
  Object.assign(st, p);
  renderVineta(); refreshMenu();
}
let synced = false;
const progressOf = (a, stage) => { const i = a.stages.indexOf(stage); return i >= 0 ? (i + 1) / (a.stages.length + 1) : 0.3; };
/** Estado real que llega del servidor (polling o tiempo real). Calcula los cambios y anima solo lo nuevo. */
function syncAgents(list = []) {
  if (synced) {
    const startingNow = list.some((s) => s.status === 'working' && AG[s.id] && AG[s.id].real.status !== 'working');
    if (startingNow && !AG_LIST.some((a) => a.real.status === 'working')) apply({ type: 'run.start' });
  }
  for (const s of list) {
    const a = AG[s.id]; if (!a) continue;
    const prev = a.real.status, stage = s.stage || '';
    if (s.lastTask) a.real.lastTask = s.lastTask;
    if (s.finding) a.real.finding = s.finding;
    if (!synced) {
      Object.assign(a.real, { status: s.status || 'idle', stage: stage || (s.status === 'working' ? 'Trabajando' : ''), progress: s.progress ?? (s.status === 'done' ? 1 : s.status === 'working' ? progressOf(a, stage) : 0), doneAt: -100 });
      if (s.status === 'working') { interrupt(a); a.queue = a.id === 'ceo' ? [S.go({ x: 9, y: 5 }, TABLE_CENTER), S.anim('type', Infinity)] : [S.go(seatOf(a), deskFace(a)), S.anim('type', Infinity)]; a.queue.forEach((q) => { q.important = true; }); }
      continue;
    }
    if (s.status === 'working' && prev !== 'working') apply({ type: 'agent.start', agentId: s.id });
    if (s.status === 'working' && stage && stage !== a.real.stage) apply({ type: 'agent.stage', agentId: s.id, stage });
    if ((s.status === 'done' || s.status === 'error') && prev === 'working') apply({ type: 'agent.end', agentId: s.id, ok: s.status === 'done' });
    if (s.status === 'idle' && prev !== 'idle' && prev !== 'working') Object.assign(a.real, { status: 'idle', stage: '', progress: 0 });
    if (typeof s.progress === 'number' && s.status === 'working') a.real.progress = s.progress;
  }
  if (!synced) {
    const ceoDone = list.find((s) => s.id === 'ceo')?.status === 'done';
    W.stack = ceoDone ? 0 : list.filter((s) => s.id !== 'ceo' && s.status === 'done').length;
    synced = true;
  }
  updateRunButton(); updateUI();
}

function openAlerts(agentId) { return DATA.state.alerts.filter((a) => a.status !== 'resuelta' && (!agentId || a.agent === agentId)).length; }
function openCritical(agentId) { return DATA.state.alerts.filter((a) => a.status === 'abierta' && a.sev === 'alta' && a.agent === agentId).length; }
function topFinding(agentId) { return DATA.state.findings[agentId]?.[0]?.t || 'Aún sin hallazgos'; }

/* ============ centro de mando (menú de juego) ============ */
const TABS = [
  { id: 'resumen', label: 'Resumen', icon: 'chart' },
  { id: 'almacen', label: 'Almacén', icon: 'box' },
  { id: 'maria', agent: true }, { id: 'lucia', agent: true }, { id: 'mattia', agent: true }, { id: 'ceo', agent: true },
  { id: 'alertas', label: 'Alertas', icon: 'alert' },
  { id: 'decisiones', label: 'Decisiones', icon: 'star' },
  { id: 'historial', label: 'Historial', icon: 'clock' },
];
let curTab = 'resumen', lastFocus = null, openPm = null;
const filt = { agent: 'all', sev: 'all', st: 'open' };
const menu = $('menu'), tabsEl = $('tabs'), body = $('menuBody');

function openMenu(tab = 'resumen') {
  curTab = tab; lastFocus = document.activeElement;
  menu.hidden = false; renderMenu();
  tabsEl.querySelector(`[data-tab="${tab}"]`)?.focus();
  if (AG[tab]) react(tab, 'ok', pick(['¿Vemos mis datos?', 'Te lo enseño', 'Aquí lo tienes']));
}
function closeMenu() { menu.hidden = true; lastFocus?.focus?.(); }
function refreshMenu() { if (!menu.hidden) renderMenu(); updateUI(); }
$('menuClose').addEventListener('click', closeMenu);
menu.addEventListener('click', (e) => { if (e.target === menu) closeMenu(); });
menu.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.stopPropagation(); closeMenu(); }
  if (e.target.classList?.contains('tab') && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    const i = TABS.findIndex((t) => t.id === curTab), j = (i + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
    curTab = TABS[j].id; renderMenu(); tabsEl.querySelector(`[data-tab="${curTab}"]`)?.focus();
  }
});

function renderMenu() {
  tabsEl.innerHTML = TABS.map((t) => {
    const a = t.agent ? AG[t.id] : null, n = a ? openAlerts(t.id) : t.id === 'alertas' ? openAlerts() : 0;
    const icon = a ? portrait(a, 40) : iconURL(t.icon);
    return `<button class="tab" role="tab" data-tab="${t.id}" aria-selected="${curTab === t.id}" tabindex="${curTab === t.id ? 0 : -1}"><img alt="" src="${icon}">${esc(a ? a.name : t.label)}${n ? `<span class="n">${n}</span>` : ''}</button>`;
  }).join('');
  const r = { resumen: viewResumen, almacen: viewAlmacen, alertas: viewAlertas, decisiones: viewDecisiones, historial: viewHistorial }[curTab];
  body.innerHTML = r ? r() : viewAgent(curTab);
  body.scrollTop = 0;
}
tabsEl.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) { curTab = b.dataset.tab; renderMenu(); if (AG[curTab]) emote(AG[curTab], 'smile'); } });

/* ---------- piezas de interfaz ---------- */
const AGENT_COL = (id) => AG[id]?.color || '#6c6584';
const chipFor = (a) => `<span class="chip ${a.real.status}">${esc(stateText(a))}</span>`;
function barsHTML(title, rows, { unit = '', digits = 0, max, colorFn } = {}) {
  const m = max ?? Math.max(...rows.map((r) => Math.abs(r[1])), 1);
  return `<h4>${esc(title)}</h4><div class="chart">${rows.map(([l, v]) => {
    const col = colorFn ? colorFn(v) : 'var(--blue)';
    return `<div class="row"><span>${esc(l)}</span><div class="track"><div class="fill" style="width:${Math.round(Math.abs(v) / m * 100)}%;background:${col}"></div></div><span class="val">${v > 0 && unit.includes('pp') ? '+' : ''}${fmtNum(v, digits)}${unit}</span></div>`;
  }).join('')}</div>`;
}
const scoreCol = (v) => (v >= 75 ? 'var(--ok)' : v >= 55 ? 'var(--warn)' : 'var(--err)');
function alertHTML(a, showAgent = false) {
  const ag = AG[a.agent];
  const owner = a.owner ? `Asignada a ${a.owner}` : 'Sin asignar';
  const pmBtn = a.pm && !OPT.readOnly ? `<button class="btn sm" data-act="notify" data-id="${a.pm}">Avisar al PM</button>` : '';
  const acts = OPT.readOnly ? '' : a.status === 'resuelta'
    ? `<button class="btn sm" data-act="reopen" data-id="${a.id}">Reabrir</button>`
    : `${a.status === 'abierta' ? `<button class="btn sm" data-act="ack" data-id="${a.id}">Reconocer</button>` : ''}
       ${a.owner ? '' : `<button class="btn sm" data-act="mine" data-id="${a.id}">Asignarme</button>`}
       <button class="btn sm ok" data-act="resolve" data-id="${a.id}">Resolver</button>${pmBtn}`;
  return `<li class="alert" data-sev="${a.sev}" data-st="${a.status}">
    <span class="sev">${a.sev.toUpperCase()}</span>
    <div><b>${showAgent ? `<span class="who-tag" style="background:${AGENT_COL(a.agent)}"></span>${esc(ag.name)}: ` : ''}${esc(a.title)}</b>
      <p>${esc(a.detail)}</p>
      <small>${esc(ago(a.since))} · ${a.status === 'abierta' ? 'Abierta' : a.status === 'reconocida' ? 'Reconocida' : 'Resuelta'} · ${esc(owner)}</small></div>
    <div class="a-act">${acts}
      ${OPT.readOnly ? '' : `<button class="btn sm" data-act="fb" data-v="util" data-id="${a.id}" aria-pressed="${a.feedback === 'util'}" aria-label="Señal útil">👍</button>
      <button class="btn sm" data-act="fb" data-v="no_util" data-id="${a.id}" aria-pressed="${a.feedback === 'no_util'}" aria-label="Señal no útil">👎</button>`}
    </div></li>`;
}
function questHTML(d) {
  const done = d.steps.filter((s) => s[1]).length, pct = Math.round(done / d.steps.length * 100);
  const lbl = { propuesta: 'Propuesta', aceptada: 'Aceptada', en_curso: 'En curso', hecha: 'Hecha', rechazada: 'Rechazada' }[d.status];
  const cls = d.status === 'hecha' ? 'done' : d.status === 'rechazada' ? 'error' : d.status === 'propuesta' ? '' : 'working';
  const canSteps = !OPT.readOnly && d.status === 'aceptada' || d.status === 'en_curso' || d.status === 'hecha';
  return `<article class="quest"><header><h4>${esc(d.title)}</h4><span class="chip ${cls}">${lbl}</span></header>
    <p>${esc(d.why)}</p><p><b>Impacto esperado:</b> ${esc(d.impact)}${d.owner ? ` · <b>Responsable:</b> ${esc(d.owner)}` : ''}</p>
    <div>${d.agents.map((x) => `<span class="chip"><span class="who-tag" style="background:${AGENT_COL(x)}"></span>${esc(AG[x].name)}</span>`).join(' ')}</div>
    <div class="score"><div class="track"><div class="fill" style="width:${pct}%;background:var(--ok)"></div></div><small>${done}/${d.steps.length}</small></div>
    <ul class="steps">${d.steps.map(([t, ok], i) => `<li><label><input type="checkbox" data-act="step" data-id="${d.id}" data-i="${i}" ${ok ? 'checked' : ''} ${canSteps ? '' : 'disabled'}>${esc(t)}</label></li>`).join('')}</ul>
    ${d.status === 'propuesta' && !OPT.readOnly ? `<div class="a-act" style="grid-column:auto"><button class="btn sm primary" data-act="accept" data-id="${d.id}">Aceptar</button><button class="btn sm bad" data-act="reject" data-id="${d.id}">Rechazar</button></div>` : ''}
  </article>`;
}

/* ---------- pestañas ---------- */
function viewResumen() {
  const s = DATA.state, open = openAlerts();
  const K = s.kpis || {};
  const pmScore = s.pms.length ? Math.round(s.pms.reduce((t, p) => t + p.score, 0) / s.pms.length) : null;
  const health = K.stockHealth?.value ?? pmScore, margin = K.margin?.value ?? s.mgWeeks.at(-1);
  const kpis = [
    { tab: 'lucia', l: 'Ventas de la semana', v: K.sales ? fmtEur(K.sales.value) : '—', d: K.sales?.delta ?? null, sp: normSpark(K.sales?.spark) },
    { tab: 'maria', l: 'Salud del stock', v: health != null ? `${Math.round(health)}/100` : '—', d: K.stockHealth?.delta ?? null, sp: normSpark(K.stockHealth?.spark) },
    { tab: 'mattia', l: 'Margen bruto', v: margin != null ? `${fmtNum(margin)} %` : '—', d: K.margin?.delta ?? null, sp: normSpark(K.margin?.spark || s.mgWeeks) },
    { tab: 'alertas', l: 'Alertas abiertas', v: String(open), d: null, sp: normSpark(K.alertsSpark) },
  ];
  const urgent = s.alerts.filter((a) => a.status !== 'resuelta' && a.sev === 'alta').slice(0, 4);
  const last = s.runs[0];
  return `<div class="grid g4">${kpis.map((k) => `<button class="box kpi" data-act="tab" data-id="${k.tab}"><div class="l">${esc(k.l)}</div><div class="v">${esc(k.v)}</div>${k.d === null ? '<span class="delta">&nbsp;</span>' : `<span class="delta ${k.d >= 0 ? 'up' : 'down'}">${k.d >= 0 ? '▲' : '▼'} ${fmtNum(Math.abs(k.d))}${k.tab === 'maria' ? ' pts' : ' %'} vs semana anterior</span>`}<div class="spark">${k.sp.map((v) => `<i style="height:${v}%"></i>`).join('')}</div></button>`).join('')}</div>
  <div class="grid g2" style="margin-top:14px">
    <div class="box"><h3>Lo más urgente <small>${urgent.length} de prioridad alta</small></h3>${urgent.length ? `<ul class="alerts">${urgent.map((a) => alertHTML(a, true)).join('')}</ul>` : '<p class="empty">No hay alertas de prioridad alta. Buen trabajo.</p>'}</div>
    <div class="grid" style="align-content:start">
      <div class="box"><h3>Equipo</h3><table><thead><tr><th>Agente</th><th>Estado</th><th>Alertas</th></tr></thead><tbody>${AG_LIST.map((a) => `<tr><td><b>${esc(a.name)}</b> · ${esc(a.role)}</td><td>${chipFor(a)}</td><td><button class="btn sm" data-act="tab" data-id="${a.id}">${openAlerts(a.id)} abiertas</button></td></tr>`).join('')}</tbody></table></div>
      <div class="box"><h3>Último análisis</h3>${last ? `<p style="margin:0;font-size:14px"><b>${esc(ago(last.start))}</b> · ${last.durMin} min · ${last.status === 'ok' ? 'Completado' : 'Con errores'} · ${last.alerts} alertas nuevas</p>` : '<p class="empty">Sin ejecuciones registradas.</p>'}
      <div class="a-act" style="grid-column:auto"><button class="btn sm" data-act="tab" data-id="historial">Ver historial</button><button class="btn sm" data-act="tab" data-id="decisiones">Ver decisiones</button></div></div>
    </div>
  </div>`;
}
function viewAgent(id) {
  const a = AG[id], s = DATA.state, al = s.alerts.filter((x) => x.agent === id);
  const openN = al.filter((x) => x.status !== 'resuelta').length;
  let stats = '';
  if (id === 'maria') stats = barsHTML('Salud del stock por PM (0-100)', s.pms.map((p) => [p.name, p.score]), { max: 100, colorFn: (v) => scoreCol(v) }) + barsHTML('Cobertura media (días)', s.pms.map((p) => [p.name, p.cov]), { unit: ' d', colorFn: (v) => (v < 7 ? 'var(--err)' : v > 35 ? 'var(--warn)' : 'var(--ok)') });
  if (id === 'lucia') stats = barsHTML('Ventas por cadena (miles de €)', s.sales.map((r) => [r[0], r[1]])) + barsHTML('Variación frente a la semana anterior', s.sales.map((r) => [r[0], r[2]]), { unit: ' %', digits: 1, colorFn: (v) => (v < 0 ? 'var(--err)' : 'var(--ok)') });
  if (id === 'mattia') stats = `<h4>Margen bruto, últimas 8 semanas</h4><div class="spark" style="height:70px">${normSpark(s.mgWeeks).map((h, i) => `<i style="height:${h}%" title="${fmtNum(s.mgWeeks[i])} %"></i>`).join('')}</div>` + barsHTML('MGD por categoría', s.mgd, { unit: ' %', digits: 1, max: 35, colorFn: (v) => (v < 17 ? 'var(--warn)' : 'var(--ok)') });
  if (id === 'ceo') stats = barsHTML('Alertas abiertas por agente', AG_LIST.map((x) => [x.name, openAlerts(x.id)]), { colorFn: () => 'var(--blue)' }) + barsHTML('Decisiones por estado', [['Propuestas', 'propuesta'], ['Aceptadas', 'aceptada'], ['En curso', 'en_curso'], ['Hechas', 'hecha']].map(([l, k]) => [l, s.decisions.filter((d) => d.status === k).length]), { colorFn: () => 'var(--ok)' });
  const pmTable = id !== 'maria' ? '' : `<div class="box" style="margin-top:14px"><h3>Sanidad del stock por PM <small>Revisión de María en el último análisis</small></h3>
    <div style="overflow-x:auto"><table><thead><tr><th>Cartera del PM</th><th>Salud</th><th>Referencias</th><th>Cobertura</th><th>Roturas</th><th>Sobrestock</th><th>Sin venta 90 d</th><th></th></tr></thead><tbody>
    ${s.pms.map((p) => `<tr><td><b>${esc(p.name)}</b></td><td><div class="score"><div class="track"><div class="fill" style="width:${p.score}%;background:${scoreCol(p.score)}"></div></div><b>${p.score}</b></div></td><td>${p.skus}</td><td>${p.cov} d</td><td>${p.breaks}</td><td>${p.over} %</td><td>${p.dead}</td>
      <td style="white-space:nowrap"><button class="btn sm" data-act="pm" data-id="${p.id}" aria-expanded="${openPm === p.id}">Detalle</button> ${OPT.readOnly ? '' : `<button class="btn sm" data-act="notify" data-id="${p.id}">${s.notified[p.id] ? `Avisado ${esc(ago(s.notified[p.id]))}` : 'Avisar al PM'}</button>`}</td></tr>
      ${openPm === p.id ? `<tr class="pm-detail"><td colspan="8"><ul>${p.issues.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></td></tr>` : ''}`).join('')}
    </tbody></table></div><p class="note">La salud combina cobertura, roturas, sobrestock y referencias sin venta. Por debajo de 55, la cartera necesita acción.</p></div>`;
  const ceoBox = id !== 'ceo' ? '' : `<div class="box" style="margin-top:14px"><h3>Decisiones propuestas <small>${s.decisions.filter((d) => d.status === 'propuesta').length} pendientes</small></h3><div class="grid g2">${s.decisions.filter((d) => d.status === 'propuesta' || d.status === 'aceptada').map(questHTML).join('') || '<p class="empty">Nada pendiente.</p>'}</div></div>`;
  return `<div class="agent-head"><img alt="" src="${portrait(a, 64)}"><div class="grow"><h3>${esc(a.name)}</h3><div class="role">${esc(a.role)}</div></div>${chipFor(a)}
      <button class="btn" data-act="chat" data-id="${id}">Hablar con ${esc(a.name)}</button><button class="btn" data-act="exp" data-id="${id}">${id === 'ceo' ? 'Informe ejecutivo' : 'Ver expediente'}</button></div>
    <div class="grid g2"><div class="box"><h3>Alertas <small>${openN} abiertas</small></h3>${al.length ? `<ul class="alerts">${al.map((x) => alertHTML(x)).join('')}</ul>` : '<p class="empty">Sin alertas.</p>'}</div>
      <div class="box"><h3>Estadísticas</h3>${stats}</div></div>
    ${pmTable}${ceoBox}
    <div class="box" style="margin-top:14px"><h3>Hallazgos del último análisis</h3><div class="finds">${(s.findings[id] || []).map((f) => `<div class="find"><b>${esc(f.t)}</b><p>${esc(f.e)}</p><div class="m">${esc(f.m)}</div></div>`).join('')}</div></div>`;
}
const fmtM = (v) => `${fmtNum(v / 1e6, 2)} M€`;
function trendSVG(vals, h = 46, labels = false) {
  const W2 = labels ? 480 : 240, min = Math.min(...vals), max = Math.max(...vals), n = vals.length;
  const top = labels ? 26 : 8;
  const pts = vals.map((v, i) => [Math.round(i * (W2 - 8) / (n - 1)) + 4, Math.round(h - 6 - (v - min) / (max - min || 1) * (h - 6 - top))]);
  const line = pts.map((p) => p.join(',')).join(' ');
  const area = `4,${h} ${line} ${pts.at(-1)[0]},${h}`;
  const last = pts.at(-1);
  return `<svg viewBox="0 0 ${W2} ${h}" preserveAspectRatio="${labels ? 'xMidYMid meet' : 'none'}" shape-rendering="crispEdges" role="img" aria-label="Tendencia del inventario en euros, de ${fmtNum(vals[0], 2)} a ${fmtNum(vals.at(-1), 2)} millones">
    <polygon points="${area}" fill="rgba(61,110,245,.14)"/><polyline points="${line}" fill="none" stroke="#3d6ef5" stroke-width="3" stroke-linejoin="round"/>
    <rect x="${last[0] - 4}" y="${last[1] - 4}" width="8" height="8" fill="#ffffff" stroke="#2a2140" stroke-width="2"/>
    ${labels ? pts.map((p, i) => i % 3 === 0 || i === n - 1 ? `<text x="${Math.min(Math.max(p[0], 16), W2 - 16)}" y="${Math.max(p[1] - 9, 12)}" font-size="12" font-weight="700" text-anchor="middle" fill="#6c6584">${fmtNum(vals[i], 2)}</text>` : '').join('') : ''}</svg>`;
}
function agingBar(inv) {
  const total = inv.aging.reduce((t, a) => t + a[1], 0);
  return `<div class="v-aging" role="img" aria-label="Reparto del stock por antigüedad">${inv.aging.map(([l, v, c]) => `<span style="width:${(v / total * 100).toFixed(1)}%;background:${c}" title="${esc(l)}: ${fmtEur(v)}"></span>`).join('')}</div>
    <div class="v-legend">${inv.aging.map(([l, v, c]) => `<span><i style="background:${c}"></i>${esc(l)} ${Math.round(v / total * 100)} %</span>`).join('')}</div>`;
}
function viewAlmacen() {
  const inv = DATA.state.inventory;
  if (!inv) return '<p class="empty">Aún no hay snapshot de inventario.</p>';
  const deadPct = inv.deadEur / inv.valueEur * 100;
  const k = (l, v, d, unit, goodDown) => `<div class="box kpi" style="cursor:default"><div class="l">${esc(l)}</div><div class="v">${esc(v)}</div>${d === null ? '<span class="delta">&nbsp;</span>' : `<span class="delta ${(goodDown ? d <= 0 : d >= 0) ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'} ${fmtNum(Math.abs(d))}${unit} vs semana anterior</span>`}</div>`;
  return `<div class="grid g4">${k('Inventario hoy', fmtM(inv.valueEur), inv.valueDelta, ' %', true)}${k('Unidades en stock', new Intl.NumberFormat('es-ES').format(inv.units), inv.unitsDelta, ' %', true)}${k('Aging medio', `${inv.agingDays} días`, inv.agingDelta, ' d', true)}${k(`Aging muerto (>${inv.deadDays} d)`, fmtEur(inv.deadEur), null)}</div>
    <div class="grid g2" style="margin-top:14px">
      <div class="box trend-big"><h3>Inventario en euros <small>Últimas 12 semanas, en millones</small></h3>${trendSVG(inv.trend, 170, true)}</div>
      <div class="box"><h3>Antigüedad del stock <small>${fmtNum(deadPct)} % muerto</small></h3>${agingBar(inv)}
        ${barsHTML('Valor por tramo (miles de €)', inv.aging.map(([l, v]) => [l, v / 1000]), { colorFn: (v) => (v < 400 ? 'var(--err)' : 'var(--blue)') })}</div>
    </div>
    <div class="grid g2" style="margin-top:14px">
      <div class="box"><h3>Aging muerto por categoría</h3>${barsHTML('Miles de €', inv.deadByCat.map(([l, v]) => [l, v / 1000]), { colorFn: () => 'var(--err)' })}</div>
      <div class="box"><h3>Acciones</h3>
        <p class="note" style="margin-top:0">Snapshot de inventario cargado ${esc(ago(inv.updatedAt))}. Cobertura media: ${inv.coverageDays} días.</p>
        <div class="a-act" style="grid-column:auto">
          <button class="btn sm primary" data-act="ronda">Pedir a María una ronda por el almacén</button>
          <button class="btn sm" data-act="tab" data-id="maria">Ver sanidad por PM</button>
          <button class="btn sm" data-act="export">Exportar aging muerto</button>
        </div></div>
    </div>`;
}

function viewAlertas() {
  const s = DATA.state;
  const list = s.alerts.filter((a) => (filt.agent === 'all' || a.agent === filt.agent) && (filt.sev === 'all' || a.sev === filt.sev) && (filt.st === 'all' || (filt.st === 'open' ? a.status !== 'resuelta' : a.status === 'resuelta')));
  const order = { alta: 0, media: 1, baja: 2 };
  list.sort((p, q) => order[p.sev] - order[q.sev] || q.since - p.since);
  const fb = (k, v, l) => `<button class="btn sm" data-act="filter" data-k="${k}" data-v="${v}" aria-pressed="${filt[k] === v}">${esc(l)}</button>`;
  return `<div class="filters">${fb('agent', 'all', 'Todos')}${AG_LIST.map((a) => fb('agent', a.id, a.name)).join('')}</div>
    <div class="filters">${fb('sev', 'all', 'Toda prioridad')}${fb('sev', 'alta', 'Alta')}${fb('sev', 'media', 'Media')}${fb('sev', 'baja', 'Baja')} ${fb('st', 'open', 'Pendientes')}${fb('st', 'done', 'Resueltas')}${fb('st', 'all', 'Todas')}</div>
    ${list.length ? `<ul class="alerts">${list.map((a) => alertHTML(a, true)).join('')}</ul>` : '<p class="empty">No hay alertas con estos filtros.</p>'}
    <p class="note">👍 y 👎 alimentan el feedback sobre señales: el agente aprende qué alertas te resultan útiles.</p>`;
}
function viewDecisiones() {
  const s = DATA.state, col = (k, l) => `<div class="grid" style="align-content:start"><h3 style="margin:0;font:700 15px var(--pixel)">${l}</h3>${s.decisions.filter((d) => k.includes(d.status)).map(questHTML).join('') || '<p class="empty">Vacío.</p>'}</div>`;
  return `<div class="grid g4">${col(['propuesta'], 'Propuestas')}${col(['aceptada'], 'Aceptadas')}${col(['en_curso'], 'En curso')}${col(['hecha', 'rechazada'], 'Cerradas')}</div>
    <p class="note">Cada decisión es una misión: marca los pasos y el CEO la cierra cuando están todos hechos.</p>`;
}
function viewHistorial() {
  const s = DATA.state;
  return `<div class="box"><h3>Ejecuciones <small>${s.runs.length} registradas</small></h3><table><thead><tr><th>Inicio</th><th>Duración</th><th>Estado</th><th>Alertas nuevas</th></tr></thead><tbody>
    ${s.runs.map((r) => `<tr><td>${esc(r.start.toLocaleString('es-ES', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }))}</td><td>${r.durMin} min</td><td><span class="chip ${r.status === 'ok' ? 'done' : 'error'}">${r.status === 'ok' ? 'Completado' : 'Con errores'}</span></td><td>${r.alerts}</td></tr>`).join('')}
    </tbody></table>
    ${OPT.demo ? '<div class="a-act" style="grid-column:auto;margin-top:12px"><button class="btn sm" data-act="demo-error">Simular ejecución con error (demo)</button></div>' : ''}</div>`;
}

/* ---------- acciones: tocan los datos y la oficina reacciona ---------- */
body.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const act = b.dataset.act, idv = b.dataset.id, s = DATA.state;
  const al = s.alerts.find((x) => x.id === idv);
  switch (act) {
    case 'tab': curTab = idv; renderMenu(); return;
    case 'filter': filt[b.dataset.k] = b.dataset.v; renderMenu(); return;
    case 'pm': openPm = openPm === idv ? null : idv; renderMenu(); return;
    case 'chat': openChatWith(idv); react(idv, 'ok', '¡Te escucho!'); return;
    case 'exp': openExp(idv); return;
    case 'demo-error': closeMenu(); runDemo('mattia'); return;
    case 'ronda': { const m = AG.maria; if (m.real.status === 'working') { toast('María está con el análisis; irá al terminar'); return; } interrupt(m); reserve(m, { x: 14, y: 2 }); m.queue = ACTIVITIES.warehouse.make(m, { x: 14, y: 2 }); m.ambient = 'Ronda por el almacén'; closeMenu(); toast('María va al almacén por la pasarela'); select(m, true); return; }
    case 'export': if (OPT.onAction) { try { await OPT.onAction('inventory.export', {}); } catch (err) { toast('No se ha podido exportar'); OPT.onError?.(err); } } else toast('Aquí se descarga el detalle del aging muerto'); return;
    case 'ack': await DATA.updateAlert(idv, { status: 'reconocida' }); react(al.agent, 'ok', 'Vale, queda reconocida'); break;
    case 'mine': await DATA.updateAlert(idv, { owner: 'ti', status: al.status === 'abierta' ? 'reconocida' : al.status }); react(al.agent, 'ok', 'Te la dejo asignada'); break;
    case 'resolve': await DATA.updateAlert(idv, { status: 'resuelta' }); react(al.agent, 'good', pick(['¡Una menos!', '¡Resuelta!', 'Genial, gracias'])); { const p = iso(AG[al.agent].x, AG[al.agent].y, 40); confetti(p.x, p.y, 14); } break;
    case 'reopen': await DATA.updateAlert(idv, { status: 'abierta' }); react(al.agent, 'bad', 'La vuelvo a abrir'); break;
    case 'fb': { const v = al.feedback === b.dataset.v ? null : b.dataset.v; await DATA.updateAlert(idv, { feedback: v }); if (v) react(al.agent, v === 'util' ? 'good' : 'bad', v === 'util' ? '¡Gracias! Me sirve' : 'Lo tendré en cuenta'); break; }
    case 'notify': { const pm = s.pms.find((p) => p.id === idv); await DATA.notifyPM(idv); react('maria', 'phone', `Aviso al PM de ${pm.name}`); toast(`María avisa al PM de ${pm.name}`); break; }
    case 'accept': await DATA.updateDecision(idv, { status: 'aceptada', owner: 'Dirección' }); react('ceo', 'celebrate', '¡Adelante con ello!'); break;
    case 'reject': await DATA.updateDecision(idv, { status: 'rechazada' }); react('ceo', 'bad', 'Entendido, la descarto'); break;
    default: return;
  }
  refreshMenu();
});
body.addEventListener('change', async (e) => {
  const c = e.target.closest('[data-act="step"]'); if (!c) return;
  const before = DATA.state.decisions.find((d) => d.id === c.dataset.id).status;
  const d = await DATA.toggleStep(c.dataset.id, Number(c.dataset.i));
  if (d.status === 'hecha' && before !== 'hecha') { react('ceo', 'celebrate', '¡Misión cumplida!'); const p = iso(AG.ceo.x, AG.ceo.y, 40); confetti(p.x, p.y, 40); toast(`Decisión cerrada: ${d.title}`); }
  else react(d.agents[0], 'ok', c.checked ? 'Paso hecho' : 'Lo desmarco');
  refreshMenu();
});

/* ============ viñeta del almacén ============ */
const vin = $('vineta'), vBody = $('vBody'), vMin = $('vMin'), vTail = $('vTail');
let vinSize = { w: 290, h: 300 };
$('vIcon').src = iconURL('box');
function renderVineta() {
  const inv = DATA.state.inventory;
  if (!inv) { $('vChip').textContent = 'Sin datos'; vBody.innerHTML = '<p class="empty" style="margin:0">Esperando el primer snapshot de inventario.</p>'; return; }
  const deadPct = inv.deadEur / inv.valueEur * 100;
  $('vChip').textContent = `${fmtM(inv.valueEur)} ${inv.valueDelta < 0 ? '▼' : '▲'}${fmtNum(Math.abs(inv.valueDelta))} %`;
  vBody.innerHTML = `<div class="v-big"><strong>${fmtM(inv.valueEur)}</strong><span class="delta ${inv.valueDelta <= 0 ? 'up' : 'down'}">${inv.valueDelta < 0 ? '▼' : '▲'} ${fmtNum(Math.abs(inv.valueDelta))} % vs semana anterior</span></div>
    <div class="v-trend">${trendSVG(inv.trend)}<div class="v-cap"><span>Hace 12 semanas</span><span>Hoy</span></div></div>
    <dl class="v-grid">
      <div><dt>Unidades</dt><dd>${new Intl.NumberFormat('es-ES').format(inv.units)}</dd></div>
      <div><dt>Aging medio</dt><dd>${inv.agingDays} días</dd></div>
      <div><dt>Aging muerto</dt><dd>${fmtEur(inv.deadEur)} · ${fmtNum(deadPct)} %</dd></div>
      <div><dt>Cobertura</dt><dd>${inv.coverageDays} días</dd></div>
    </dl>${agingBar(inv)}
    <button class="btn sm primary" id="vOpen">Ver almacén</button>`;
  $('vOpen').addEventListener('click', () => openMenu('almacen'));
}
function setVinetaMin(min) {
  vin.classList.toggle('min', min); vMin.textContent = min ? '+' : '–';
  vMin.setAttribute('aria-expanded', String(!min)); vMin.setAttribute('aria-label', min ? 'Desplegar la viñeta' : 'Plegar la viñeta');
}
vMin.addEventListener('click', () => setVinetaMin(!vin.classList.contains('min')));
new ResizeObserver(() => { vinSize = { w: vin.offsetWidth, h: vin.offsetHeight }; }).observe(vin);
function placeVineta() {
  const narrow = vw < 820;
  const hide = !$('ficha').hidden && !narrow;
  const a = iso(18.5, 2.5, BRIDGE.z + 32), p = toScreen(a.x, a.y);
  const off = p.x < -60 || p.x > vw + 60 || p.y < -40 || p.y > vh + 200;
  vin.hidden = hide || off;
  if (vin.hidden) return;
  const { w, h } = vinSize;
  const left = clamp(p.x - w / 2, 8, vw - w - 8), top = clamp(p.y - h - 14, 72, Math.max(72, vh - h - 100));
  vin.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  const tl = p.x - left - 7;
  vTail.style.left = `${clamp(tl, 14, w - 28)}px`;
  vTail.style.visibility = top + h + 14 <= p.y + 4 && tl > 10 && tl < w - 20 ? 'visible' : 'hidden';
}
renderVineta();
if (ROOT.clientWidth < 820) setVinetaMin(true);

/* ============ arranque ============ */
resize();
cam.x = camGoal.x; cam.y = camGoal.y;
updateUI();
let rafId = requestAnimationFrame((t) => { last = t; rafId = requestAnimationFrame(loop); });
if (OPT.demo) setTimeout(() => { if (!destroyed && !demo && menu.hidden) { toast('Demostración: así se ve un análisis completo'); runDemo(); } }, 9000);

const API = {
  apply, syncAgents, setData,
  select: (id) => select(AG[id] || null, true),
  openMenu, closeMenu,
  setTheme(theme) { if (theme === 'auto') delete container.dataset.theme; else container.dataset.theme = theme; },
  setReadOnly(v) { OPT.readOnly = !!v; refreshMenu(); },
  setCanRun(v) { OPT.canRun = !!v; $('run').closest('.top-right').style.display = v ? '' : 'none'; },
  destroy() {
    destroyed = true; cancelAnimationFrame(rafId);
    CLEAN.forEach((f) => { try { f(); } catch { /* nada */ } });
    container.innerHTML = ''; container.classList.remove('fm-office'); delete container.dataset.theme;
  },
};
API.setCanRun(OPT.canRun);
return API;

}

const MARKUP = `<div class="app" id="app">
  <canvas id="scene" aria-label="Oficina de Five Minutes con los agentes María, Lucía, Mattia y el CEO, rodeada del almacén y el hipermercado"></canvas>

  <header class="panel top-left">
    <div class="logo" aria-hidden="true">5</div>
    <div class="brand"><strong>Five Minutes</strong><p>Oficina de agentes</p></div>
    <div class="clock" aria-label="Hora de la oficina"><span id="sky">☀</span><span id="time">08:00</span></div>
  </header>

  <div class="panel top-right">
    <button class="btn primary" id="run">Iniciar análisis</button>
  </div>

  <div class="panel feed" id="feed"><b>En directo</b><span id="feedText">La oficina está abierta. Pulsa a un agente o un edificio.</span></div>

  <section class="team" id="team" aria-label="Equipo"></section>

  <aside class="panel ficha" id="ficha" hidden aria-live="polite">
    <button class="btn close" id="closeFicha" aria-label="Cerrar ficha">✕</button>
    <header><img class="avatar" id="fAvatar" alt=""><div><h2 id="fName"></h2><div class="role" id="fRole"></div></div></header>
    <dl class="rows">
      <div><dt>Estado del análisis</dt><dd id="fState"></dd></div>
      <div><dt>Alertas abiertas</dt><dd id="fAlerts"></dd></div>
      <div><dt>Hallazgo principal</dt><dd id="fFind"></dd></div>
      <div><dt>Ahora mismo en la oficina</dt><dd class="ambient" id="fAmb"></dd></div>
    </dl>
    <div class="actions">
      <button class="btn primary" id="fPanel">Abrir panel</button>
      <button class="btn" id="fOpen">Ver expediente</button>
      <button class="btn" id="fChat">Abrir chat</button>
    </div>
  </aside>

  <aside class="panel vineta" id="vineta" aria-label="Inventario del almacén">
    <header><img alt="" id="vIcon"><b>Almacén · stock hoy</b><span class="v-chip" id="vChip"></span><button class="btn mini" id="vMin" aria-expanded="true" aria-label="Plegar la viñeta">–</button></header>
    <div class="v-body" id="vBody"></div>
    <i class="tail" id="vTail" aria-hidden="true"></i>
  </aside>

  <nav class="panel hotbar" id="hotbar" aria-label="Accesos rápidos"></nav>

  <div class="menu" id="menu" hidden role="dialog" aria-modal="true" aria-labelledby="menuTitle">
    <div class="panel menu-frame">
      <div class="menu-head"><h2 id="menuTitle">Centro de mando</h2><div class="tabs" role="tablist" id="tabs"></div></div>
      <button class="btn close menu-close" id="menuClose" aria-label="Cerrar menú">✕</button>
      <div class="menu-body" id="menuBody" role="tabpanel"></div>
    </div>
  </div>

  <div class="panel banner" id="banner" role="status"><strong>Informe ejecutivo listo</strong><p>El CEO ha consolidado los hallazgos de inventario, ventas y finanzas.</p><button class="btn primary" id="bannerBtn">Ver decisiones</button></div>
  <div class="panel toast" id="toast" role="status"></div>
</div>
`;
