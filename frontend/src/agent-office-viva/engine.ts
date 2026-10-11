// @ts-nocheck
// Port mechanically separated from the approved office prototype. Canvas-only by design.
import { MAX_EFFECT_PARTICLES } from './effects';
import { OFFICE_GRID } from './map';

export function createOfficeEngine(canvas, options) {
  let rafId = 0;
  let destroyed = false;
  const timers = new Set();
  const schedule = (callback, delay) => {
    const timer = window.setTimeout(() => {
      timers.delete(timer);
      if (!destroyed) callback();
    }, delay);
    timers.add(timer);
    return timer;
  };
  const emitActivity = () => undefined;
  const notifyInformeReady = () => undefined;
/* ============ utilidades ============ */
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
let REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
const MAP = OFFICE_GRID; /* Prototype map moved to map.ts. */
/*
  '################',
  '#B.1...2.A.3..x#',
  '#..D...D...D..R#',
  '#K.............#',
  '#F...:t:t:.....#',
  '#w...tTTTt.GGGG#',
  '#....:t:t:.G~4~#',
  '#P..........~E~#',
  '#s,,,......G~~L#',
  '#s,c,.o.o..G~~P#',
  '#P,,,.....PG~~~#',
  '################',
*/
const MH = MAP.length, MW = MAP[0].length;
const ch = (x, y) => (MAP[y] && MAP[y][x]) || '#';
const WALK = new Set(['.', ',', '~', ':', 'x', '1', '2', '3', '4', 't', 's', 'o']);
const walkable = (x, y) => WALK.has(ch(x, y));
const SEATS = {};
for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) { const c = ch(x, y); if (/[1-4]/.test(c)) SEATS[c] = { x, y }; }
const TABLE_SEATS = []; for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (ch(x, y) === 't') TABLE_SEATS.push({ x, y });

/* ============ proyección isométrica 2:1 (resolución baja) ============ */
const OX = MH * 16 + 24, OY = 76;
const LW = (MW + MH) * 16 + 48, LH = OY + (MW + MH) * 8 + 24;
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
  U: ['101', '101', '101', '101', '111'], T: ['111', '010', '010', '010', '010'], S: ['111', '100', '111', '001', '111'], ' ': ['00', '00', '00', '00', '00'],
};
function skewText(g, text, x0, y0, color) {
  let cx = 0;
  for (const chr of text) {
    const glyph = FONT[chr]; if (!glyph) continue;
    for (let r = 0; r < 5; r++) for (let c = 0; c < glyph[r].length; c++) {
      if (glyph[r][c] === '1') { const px = cx + c; P.rect(g, x0 + px, y0 + r + Math.floor(px / 2), 1, 1, color); }
    }
    cx += glyph[0].length + 1;
  }
}

function buildBackground() {
  const [c, g] = mk(LW, LH);
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

  // pared del fondo (plano y=1) y pared izquierda (plano x=1)
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
  return c;
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
      default: break;
    }
  }
  // cama del gato (decoración)
  addProp(4, 10, makeSprite(1, 1, 10, (g, L) => {
    box(g, L, 0.22, 0.25, 0.78, 0.75, 0, 4, '#ffd166', { left: '#e5b54c' });
    box(g, L, 0.3, 0.33, 0.7, 0.67, 4, 1, '#fff0c2', { noLines: true });
  }), null, -0.4);
}

/* ============ estado del mundo compartido por los efectos ============ */
const W = {
  t: 0, hour: 9, dayNight: true, stack: 0,
  coffeeBusy: 0, fridgeOpen: 0, waterBusy: 0, printing: 0, printStart: 0, arcadePlaying: 0,
  board: [], doorOpen: 0, bathroom: null, cat: null,
};
W.dayNight = options.dayNight ?? true;
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
function portrait(a, size) {
  const [c, g] = mk(size, size);
  const s = avatarSprite(a, 'front', 'stand', 0, null, 1);
  g.fillStyle = shade(a.color, 1.0); g.globalAlpha = 0.22; g.fillRect(0, 0, size, size); g.globalAlpha = 1;
  const k = size / 22;
  g.drawImage(s.c, 4, 6, 22, 22, 0, 0, size, size);
  return c.toDataURL();
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
  { id: 'maria', name: 'María', role: 'Inventario', color: '#2bb3a3', seat: '1',
    look: { skin: '#f2c7a5', hair: '#5a3624', hairStyle: 'long', bow: '#ff7aa8', shirt: '#2bb3a3', pants: '#34405e', shoes: SHOES },
    stages: ['Cargando inventario', 'Detectando roturas', 'Redactando hallazgos'], finding: 'Riesgo de rotura en el surtido de alta rotación' },
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
    x: s.x + 0.5, y: s.y + 0.5, path: [], facing: facingTo(0, 1), anim: 'sit', queue: [], cur: null, stepEnd: 0,
    hidden: false, carry: null, mugOnDesk: false, reserved: null, lastSay: 0, nextAmbient: rand(0.5, 3), ambient: 'En su puesto',
    real: { status: 'idle', stage: '', progress: 0, lastTask: 'Sin ejecuciones hoy', finding: '' }, blinkAt: rand(1, 4), chat: null,
  });
}
const AG_LIST = Object.values(AG);
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
  hide: (dur) => ({ k: 'hide', dur }),
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
    case 'hide': a.hidden = true; W.bathroom = a.id; a.stepEnd = t + s.dur; return;
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
      if (t >= a.stepEnd) { a.hidden = false; W.bathroom = null; W.doorOpen = t + 0.7; return true; }
      return false;
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
  printer: { w: 5, label: 'Imprimiendo', spot: { x: 13, y: 2 }, make: (a, sp) => [
    S.go(sp, { x: 14, y: 2 }), S.call(() => { W.printing = W.t + 1.8; W.printStart = W.t; }), S.anim('use', 1.8),
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
  supervise: { w: 0, label: 'Pasando por las mesas', make: (a) => {
    const target = pick(AG_LIST.filter((x) => x.id !== 'ceo')); const d = DESK_OF[target.id];
    return [S.go({ x: d.x, y: d.y + 1 }, d), S.anim('talk', 2.2), S.say(L_SUPER, 0.8), S.emote(pick(['smile', 'idea']))];
  } },
  phone: { w: 0, label: 'Al teléfono', make: (a) => [S.go(pick([{ x: 12, y: 9 }, { x: 13, y: 9 }, { x: 12, y: 7 }]), { x: 14, y: 9 }), S.anim('phone', rand(4, 6)), S.say(L_PHONE, 0.7)] },
};
const WEIGHTS = {
  maria: { printer: 9 }, mattia: { board: 12 }, lucia: { chat: 14 },
  ceo: { desk: 22, supervise: 16, phone: 12, arcade: 2, printer: 0, board: 3, fridge: 2 },
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
  if (a.hidden) { a.hidden = false; W.bathroom = null; W.doorOpen = W.t + 0.7; }
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
    emitActivity(`${a.name}: la ejecución terminó con error`);
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
  for (let i = 0; i < n; i++) { const p = iso(TABLE_CENTER.x + 0.5 + i * 0.12, TABLE_CENTER.y + 0.4, 18 + i); schedule(() => fly(p, q, () => sparkle(q.x, q.y, '#3fc6f5'), 0.6), i * 150); }
}
function celebrateAll() {
  for (const a of AG_LIST) {
    if (a.hidden || a.real.status === 'working') continue;
    if (a.id !== 'ceo') interrupt(a);
    if (a.id !== 'ceo') a.queue = [S.anim('celebrate', 2.6), S.emote(pick(['star', 'heart', 'smile']))];
    const p = iso(a.x, a.y, 40); confetti(p.x, p.y, 26);
  }
  const c = iso(TABLE_CENTER.x + 0.5, TABLE_CENTER.y + 0.5, 30); confetti(c.x, c.y, 50);
  notifyInformeReady();
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
  if (a.path.length) {
    const n = a.path[0], tx = n.x + 0.5, ty = n.y + 0.5, dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy), st = SPEED * dt;
    if (d > 0.001) a.facing = facingTo(dx, dy);
    if (d <= st) { a.x = tx; a.y = ty; a.path.shift(); } else { a.x += dx / d * st; a.y += dy / d * st; }
    a.walking = true;
    if (!REDUCED && Math.random() < 0.04) { const p = iso(a.x, a.y); puff(p.x + rand(-3, 3), p.y, '#ffffff', -3); }
  } else a.walking = false;

  if (!a.cur && a.queue.length) { a.cur = a.queue.shift(); startStep(a, a.cur); }
  if (a.cur && !a.walking) { if (stepDone(a, a.cur)) { a.cur = null; } }
  else if (a.cur && a.cur.k !== 'go' && stepDone(a, a.cur)) a.cur = null;

  if (!a.cur && !a.queue.length && !a.walking) {
    if (a.real.status === 'working') { a.queue = [S.go(seatOf(a), deskFace(a)), S.anim('type', Infinity)]; return; }
    if (!a.idleSince) a.idleSince = t;
    const atSeat = Math.floor(a.x) === seatOf(a).x && Math.floor(a.y) === seatOf(a).y;
    a.anim = atSeat ? 'sit' : 'stand';
    if (t - a.idleSince > a.nextAmbient) { a.idleSince = 0; a.nextAmbient = rand(0.6, 2.4); chooseActivity(a); }
  } else a.idleSince = 0;

  if (a.real.status === 'working' && !a.walking && a.anim === 'type' && Math.random() < dt * 5) {
    const d = DESK_OF[a.id] || seatOf(a); const p = iso(d.x + 0.75, d.y + 0.3, 30);
    sparkle(p.x + rand(-2, 2), p.y, pick(['#3fc6f5', '#3d6ef5', '#ffffff', '#3df5a8']), 0.9);
  }
}

/* ============ render ============ */
const view = canvas;
const vctx = view.getContext('2d');
const [low, lg] = mk(LW, LH);
const BG = buildBackground();
buildProps();
initCat();

let dpr = 1, vw = 0, vh = 0, scale = 2, zoom = 2, autoFit = true;
const cam = { x: LW / 2, y: LH / 2 + 4 }, camGoal = { x: cam.x, y: cam.y };
let selected = null, hovered = null;
let meetingRevision = 0;

function resize() {
  dpr = window.devicePixelRatio || 1;
  vw = view.clientWidth; vh = view.clientHeight;
  view.width = Math.round(vw * dpr); view.height = Math.round(vh * dpr);
  if (autoFit) {
    const narrow = vw < 820;
    const availW = narrow ? vw - 8 : vw - 330, availH = narrow ? vh - 300 : vh - 150;
    let z = Math.min(availW / (LW - 40), availH / (LH - 30));
    if (z >= 1) z = dpr >= 2 ? Math.floor(z * 2) / 2 : Math.floor(z);
    zoom = clamp(z, 0.5, 6);
    const sc = screenScale();
    camGoal.x = LW / 2 - (narrow ? 0 : 150 / sc);
    camGoal.y = LH / 2 + (narrow ? 120 / sc : 4 / sc);
  }
}


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
  drawBackdrop(lg, t, n);
  lg.drawImage(BG, 0, 0);
  drawSunPatches(lg);
  drawWallDyn(lg, t);

  const items = [];
  for (const p of props) items.push({ d: p.depth, p });
  for (const a of AG_LIST) if (!a.hidden) items.push({ d: a.x + a.y + 0.05, a });
  if (W.cat) items.push({ d: W.cat.x + W.cat.y + 0.02, cat: W.cat });
  items.sort((m, k) => m.d - k.d);

  for (const it of items) {
    if (it.p) {
      const p = it.p, s = iso(p.tx, p.ty);
      if (p.spr) lg.drawImage(p.spr.c, s.x - p.spr.ax, s.y - p.spr.ay);
      if (p.dyn) p.dyn(lg, t);
    } else if (it.a) {
      const a = it.a, s = iso(a.x, a.y);
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
    }
  }

  // papeles volando
  for (const fl of flights) {
    const k = clamp((t - fl.t0) / fl.dur, 0, 1), x = lerp(fl.from.x, fl.to.x, k), y = lerp(fl.from.y, fl.to.y, k) - Math.sin(k * Math.PI) * 18;
    P.rect(lg, x - 4, y - 3, 8, 6, OUT); P.rect(lg, x - 3, y - 2, 6, 4, '#ffffff'); P.rect(lg, x - 2, y - 1, 4, 1, '#9aa1b8');
  }
  // partículas
  for (const p of parts) {
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
  if (W.fridgeOpen > t) { const f = iso(1.9, 4.5, 24); glow(lg, f.x, f.y, 18, '255,250,200', 0.45); }
  lg.globalCompositeOperation = 'source-over';

  // emociones y flecha de selección (sin oscurecer)
  for (const e of emotes) {
    const tg = e.target; if (tg.hidden) continue;
    const s = iso(tg.x, tg.y), age = t - e.t0, up = age < 0.15 ? (1 - age / 0.15) * 5 : 0;
    const icon = iconSprite(e.icon), isCat = tg === W.cat;
    lg.drawImage(icon, Math.round(s.x) - 7, Math.round(s.y - (isCat ? 26 : 56) + up - Math.min(3, age * 2)));
  }
  if (selected && !selected.hidden) {
    const s = iso(selected.x, selected.y), b = Math.round(Math.sin(t * 5) * 2), y = Math.round(s.y) - (SIT.has(selected.anim) && !selected.walking ? 44 : 48) + b, x = Math.round(s.x);
    P.rect(lg, x - 4, y - 1, 9, 1, OUT); P.rect(lg, x - 3, y, 7, 1, '#3d6ef5'); P.rect(lg, x - 4, y, 1, 1, OUT); P.rect(lg, x + 4, y, 1, 1, OUT);
    P.rect(lg, x - 2, y + 1, 5, 1, '#3d6ef5'); P.rect(lg, x - 3, y + 1, 1, 1, OUT); P.rect(lg, x + 3, y + 1, 1, 1, OUT);
    P.rect(lg, x - 1, y + 2, 3, 1, '#3d6ef5'); P.rect(lg, x - 2, y + 2, 1, 1, OUT); P.rect(lg, x + 2, y + 2, 1, 1, OUT); P.rect(lg, x, y + 3, 1, 1, OUT);
  }

  // volcado escalado a pantalla
  const back = W.dayNight ? mix(mix(keyframe(W.hour, SKY), '#ffffff', 0.22), '#000000', 0) : '#c4e6f8';
  view.style.backgroundColor = back;
  vctx.setTransform(1, 0, 0, 1, 0, 0);
  vctx.imageSmoothingEnabled = false;
  vctx.fillStyle = W.dayNight ? multiplyHex(mix(keyframe(W.hour, SKY), '#ffffff', 0.22), keyframe(W.hour, TINT)) : '#c4e6f8';
  vctx.fillRect(0, 0, view.width, view.height);
  const S = devScale();
  const ox = Math.round(view.width / 2 - cam.x * S), oy = Math.round(view.height / 2 - cam.y * S);
  vctx.drawImage(low, ox, oy, LW * S, LH * S);

  vctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawLabels(vctx, t);
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
    const head = iso(a.x, a.y).y - (SIT.has(a.anim) && !a.walking ? 40 : 44);
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
    const anchorY = iso(src.x, src.y).y - (b.cat ? 22 : 50);
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
let last = performance.now();
W.day = 25;
{
  const h = import.meta.env.DEV ? parseFloat(new URLSearchParams(location.search).get('hora') || '') : Number.NaN;
  if (!Number.isNaN(h)) {
    const hh = h < 7.5 ? h + 24 : h;
    W.day = hh <= 22 ? ((hh - 7.5) / 14.5) * 0.94 * CYCLE : (0.94 + ((hh - 22) / 9.5) * 0.06) * CYCLE;
  }
}
function update(dt) {
  W.t += dt; W.day += dt;
  W.hour = W.dayNight ? hourAt(W.day) : 11;
  for (const a of AG_LIST) updateAgent(a, dt);
  updateCat(dt);
  for (const p of parts) { p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.g) p.vy += p.g * dt; else p.vx *= 0.98; }
  for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life > parts[i].max) parts.splice(i, 1);
  if (parts.length > MAX_EFFECT_PARTICLES) parts.splice(0, parts.length - MAX_EFFECT_PARTICLES);
  for (let i = flights.length - 1; i >= 0; i--) { const f = flights[i]; if (W.t - f.t0 >= f.dur) { flights.splice(i, 1); f.onDone?.(); } }
  for (let i = emotes.length - 1; i >= 0; i--) if (W.t - emotes[i].t0 > emotes[i].dur) emotes.splice(i, 1);
  for (let i = bubbles.length - 1; i >= 0; i--) if (W.t - bubbles[i].t0 > bubbles[i].dur) bubbles.splice(i, 1);
  if (selected && autoFollow) { const s = iso(selected.x, selected.y - 1); camGoal.x = s.x; camGoal.y = s.y; }
  cam.x = lerp(cam.x, camGoal.x, Math.min(1, dt * 6)); cam.y = lerp(cam.y, camGoal.y, Math.min(1, dt * 6));
}
function loop(now) { if (destroyed) return;
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  update(dt); render();
  rafId = requestAnimationFrame(loop);
}


/* ============ interacción ============ */
let autoFollow = false;
let drag = null;
function hitAgent(sx, sy) {
  const l = toLow(sx, sy);
  let best = null, bd = -Infinity;
  for (const a of AG_LIST) {
    if (a.hidden) continue;
    const s = iso(a.x, a.y);
    if (l.x >= s.x - 10 && l.x <= s.x + 10 && l.y >= s.y - 38 && l.y <= s.y + 3 && a.x + a.y > bd) { best = a; bd = a.x + a.y; }
  }
  return best;
}
function hitCat(sx, sy) { const c = W.cat; if (!c) return false; const l = toLow(sx, sy), s = iso(c.x, c.y); return Math.abs(l.x - s.x) < 9 && l.y > s.y - 12 && l.y < s.y + 3; }

  const onPointerDown = (e) => {
    drag = { x: e.clientX, y: e.clientY, cx: camGoal.x, cy: camGoal.y, moved: false };
    view.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    const r = view.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) { drag.moved = true; autoFit = false; autoFollow = false; view.classList.add('dragging'); }
      if (drag.moved) { const s = screenScale(); camGoal.x = drag.cx - dx / s; camGoal.y = drag.cy - dy / s; cam.x = camGoal.x; cam.y = camGoal.y; }
      return;
    }
    hovered = hitAgent(sx, sy);
    view.classList.toggle('hover', !!hovered || hitCat(sx, sy));
  };
  const onPointerUp = (e) => {
    view.classList.remove('dragging');
    const r = view.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
    if (drag && !drag.moved) {
      if (hitCat(sx, sy)) { emote(W.cat, 'heart'); catSay(pick(['Miau', 'Prrr', 'Miau miau'])); W.cat.mode = 'sit'; W.cat.until = W.t + 3; }
      else select(hitAgent(sx, sy));
    }
    drag = null;
  };
  const onPointerLeave = () => { hovered = null; };
  const onWheel = (e) => {
    e.preventDefault();
    const r = view.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
    const before = toLow(sx, sy);
    const nz = clamp((zoom >= 2 ? Math.round(zoom) : zoom) + (e.deltaY < 0 ? 1 : -1), 1, 6);
    if (nz === zoom) return;
    zoom = nz; autoFit = false;
    const after = toLow(sx, sy);
    cam.x += before.x - after.x; cam.y += before.y - after.y; camGoal.x = cam.x; camGoal.y = cam.y;
  };
  const onDoubleClick = () => { autoFit = true; autoFollow = false; select(null); resize(); };
  const onResize = () => resize();

  function select(a, fromCanvas = false) {
    selected = a || null;
    if (selected && fromCanvas) {
      const s = iso(selected.x, selected.y - 1);
      camGoal.x = s.x; camGoal.y = s.y; autoFit = false;
    }
    options.onSelect?.(selected?.id ?? null);
  }

  function apply(ev) {
    const a = AG[ev.agentId];
    switch (ev.type) {
      case 'run.start':
        W.stack = 0;
        for (const x of AG_LIST) if (x.real.status !== 'working') Object.assign(x.real, { status: 'idle', stage: '', progress: 0, finding: '' });
        break;
      case 'agent.start': if (a) realStart(a); break;
      case 'agent.stage': if (a) realStage(a, ev.stage); break;
      case 'agent.end': if (a) realEnd(a, ev.ok !== false); break;
      default: break;
    }
  }

  function hydrate(snapshot) {
    W.stack = 0;
    for (const a of AG_LIST) {
      const next = snapshot.agents[a.id];
      interrupt(a);
      a.x = SEATS[a.seat].x + 0.5;
      a.y = SEATS[a.seat].y + 0.5;
      a.hidden = false;
      a.carry = null;
      a.real.status = next.status;
      a.real.stage = next.stage;
      a.real.progress = next.status === 'idle' ? 0 : next.status === 'working' ? 0.5 : 1;
      a.real.finding = '';
      a.anim = next.status === 'working' ? 'type' : next.status === 'error' ? 'sad' : 'sit';
      a.ambient = next.status === 'working' ? 'Trabajando en el análisis' : 'En su puesto';
      if (a.id !== 'ceo' && next.delivered) W.stack = Math.min(3, W.stack + 1);
    }
  }

  function resumeFromMeeting(a) {
    interrupt(a);
    if (a.real.status === 'working') {
      if (a.id === 'ceo') {
        const spot = { x: 9, y: 5 };
        reserve(a, spot);
        a.queue = [S.go(spot, TABLE_CENTER), S.anim('type', Infinity)];
      } else a.queue = [S.go(seatOf(a), deskFace(a)), S.anim('type', Infinity)];
      return;
    }
    a.queue = [S.go(seatOf(a), deskFace(a)), S.anim('sit', 2)];
  }

  function endMeeting() {
    meetingRevision += 1;
    for (const attendee of AG_LIST) resumeFromMeeting(attendee);
  }

  function meeting(type, agentId) {
    endMeeting();
    const revision = meetingRevision;
    const attendees = type === 'executive'
      ? AG_LIST
      : [AG[agentId], AG.ceo].filter(Boolean);
    const lines = type === 'executive'
      ? {
          maria: 'Inventario: hallazgo listo para revisar',
          lucia: 'Ventas: conclusión preparada',
          mattia: 'Finanzas: conclusión preparada',
          ceo: 'CEO: priorizo las decisiones del equipo',
        }
      : {
          maria: 'María comparte su hallazgo principal',
          lucia: 'Lucía comparte su hallazgo principal',
          mattia: 'Mattia comparte su hallazgo principal',
          ceo: 'CEO: revisamos la conclusión juntos',
        };
    attendees.forEach((attendee, index) => {
      const spot = TABLE_SEATS[index % TABLE_SEATS.length];
      reserve(attendee, spot);
      attendee.ambient = 'En reunión';
      attendee.queue = [
        S.go(spot, TABLE_CENTER),
        S.say(lines[attendee.id], 1),
        S.anim(attendee.id === 'ceo' ? 'sitTalk' : 'sitTalk', Infinity),
      ];
      attendee.queue.forEach((step) => { step.important = true; });
    });
    if (type === 'executive') {
      schedule(() => {
        if (meetingRevision !== revision) return;
        const ceo = AG.ceo;
        if (ceo) say(ceo, 'CEO: consolido lo esencial para decidir', true);
      }, 4200);
    }
  }

  resize();
  cam.x = camGoal.x; cam.y = camGoal.y;
  view.addEventListener('pointerdown', onPointerDown);
  view.addEventListener('pointermove', onPointerMove);
  view.addEventListener('pointerup', onPointerUp);
  view.addEventListener('pointerleave', onPointerLeave);
  view.addEventListener('wheel', onWheel, { passive: false });
  view.addEventListener('dblclick', onDoubleClick);
  window.addEventListener('resize', onResize);
  rafId = requestAnimationFrame((t) => { last = t; rafId = requestAnimationFrame(loop); });

  return {
    apply,
    select: (agentId) => select(AG[agentId] || null, true),
    hydrate,
    meeting,
    endMeeting,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(rafId);
      for (const timer of timers) window.clearTimeout(timer);
      timers.clear();
      window.removeEventListener('resize', onResize);
      view.removeEventListener('pointerdown', onPointerDown);
      view.removeEventListener('pointermove', onPointerMove);
      view.removeEventListener('pointerup', onPointerUp);
      view.removeEventListener('pointerleave', onPointerLeave);
      view.removeEventListener('wheel', onWheel);
      view.removeEventListener('dblclick', onDoubleClick);
      view.classList.remove('dragging', 'hover');
    },
  };
}
