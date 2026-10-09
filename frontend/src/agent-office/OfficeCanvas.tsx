import { Application, extend, useApplication, useTick } from '@pixi/react';
import { Container, Graphics, Rectangle, Text as PixiText, TextStyle, type Ticker } from 'pixi.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AgentId, Point } from './model';
import { depth, iso, MAP, pathfind, ROSTER, seats, TILE_H, TILE_W, tiles } from './model';
import { useOffice } from './store';

extend({ Container, Graphics, Text: PixiText });

type Palette = { background: number; floor: number; alternate: number; wall: number; trim: number; wood: number; woodSide: number; furniture: number; paper: number; ink: number; glass: number; screen: number; blue: number };
const LIGHT: Palette = { background: 0xe9edf2, floor: 0xe7d8c4, alternate: 0xe0cfb8, wall: 0xe7ebf0, trim: 0xc6ced8, wood: 0xb38b6a, woodSide: 0x967154, furniture: 0xa3b1bf, paper: 0xffffff, ink: 0x263445, glass: 0xbed9e7, screen: 0x88939f, blue: 0x0071e3 };
const DARK: Palette = { background: 0x121c2b, floor: 0x34404d, alternate: 0x2d3948, wall: 0x28354a, trim: 0x46556a, wood: 0x795f4d, woodSide: 0x5c473a, furniture: 0x68798d, paper: 0xe8edf4, ink: 0xe8edf4, glass: 0x5e8295, screen: 0x737e8d, blue: 0x44a5ff };
const shade = (value: number, factor: number) => Math.round(((value >> 16) & 255) * factor) << 16 | Math.round(((value >> 8) & 255) * factor) << 8 | Math.round((value & 255) * factor);
const raised = (p: Point, h: number) => ({ x: p.x, y: p.y - h });
function box(g: Graphics, x: number, y: number, width: number, height: number, elevation: number, color: number, top = 0) {
  const a = iso(x, y), b = iso(x + width, y), c = iso(x + width, y + height), d = iso(x, y + height);
  g.poly([raised(d, top), raised(c, top), raised(c, top + elevation), raised(d, top + elevation)]).fill(shade(color, 0.74));
  g.poly([raised(c, top), raised(b, top), raised(b, top + elevation), raised(c, top + elevation)]).fill(shade(color, 0.86));
  g.poly([raised(a, top + elevation), raised(b, top + elevation), raised(c, top + elevation), raised(d, top + elevation)]).fill(color);
}
function drawFloor(g: Graphics, palette: Palette) {
  g.clear();
  for (const tile of tiles) {
    if (tile.kind === '#') continue;
    g.poly([iso(tile.x, tile.y), iso(tile.x + 1, tile.y), iso(tile.x + 1, tile.y + 1), iso(tile.x, tile.y + 1)]).fill((tile.x + tile.y) % 2 ? palette.floor : palette.alternate);
  }
  box(g, 0.7, 0.7, MAP[0].length - 1.4, 0.3, 88, palette.wall);
  box(g, 0.7, 0.7, 0.3, MAP.length - 1.4, 88, palette.wall);
  box(g, 1, MAP.length - 1, MAP[0].length - 2, 0.25, 7, palette.trim);
  box(g, MAP[0].length - 1, 1, 0.25, MAP.length - 2, 7, palette.trim);
  for (const x of [3, 9, 16]) {
    const a = iso(x, 1), b = iso(x + 1.3, 1);
    g.poly([raised(a, 23), raised(b, 23), raised(b, 69), raised(a, 69)]).fill(palette.glass).stroke({ width: 3, color: palette.trim });
  }
}
function drawProp(g: Graphics, kind: string, x: number, y: number, palette: Palette, lit: boolean) {
  g.clear();
  if (kind === 'D') {
    box(g, x + .05, y + .12, .9, .78, 18, palette.wood);
    box(g, x + .28, y + .35, .42, .4, 17, palette.furniture, 18);
    box(g, x + .61, y + .36, .06, .38, 10, lit ? palette.blue : palette.screen, 22);
    if (lit) { const p = iso(x + .6, y + .54); g.circle(p.x, p.y - 43, 15).fill({ color: palette.blue, alpha: .16 }); }
  } else if (/[1-4]/.test(kind)) box(g, x + .28, y + .28, .44, .44, 9, palette.furniture);
  else if (kind === 'T') box(g, x + .02, y + .02, .96, .96, 16, palette.wood);
  else if (kind === 'S') { box(g, x + .08, y + .1, .84, .8, 12, palette.furniture); box(g, x + .08, y + .7, .84, .18, 15, palette.furniture, 12); }
  else if (kind === 'C') { box(g, x + .15, y + .12, .7, .75, 28, palette.furniture); box(g, x + .3, y + .3, .4, .45, 16, palette.screen, 28); }
  else if (kind === 'I') box(g, x + .1, y + .18, .8, .68, 27, palette.furniture);
  else if (kind === 'B') { box(g, x + .12, y + .56, .76, .25, 75, palette.trim); const p = iso(x + .5, y + .7); g.rect(p.x - 11, p.y - 74, 22, 40).fill(palette.woodSide); }
  else if (kind === 'W') { box(g, x + .12, y + .48, .76, .12, 45, palette.paper, 15); }
  else if (kind === 'P') { box(g, x + .3, y + .3, .4, .4, 17, palette.woodSide); const p = iso(x + .5, y + .5); g.circle(p.x, p.y - 35, 15).fill(0x73917b); }
}
function Bubble({ text, y, palette, status = false }: { text: string; y: number; palette: Palette; status?: boolean }) {
  const style = useMemo(() => new TextStyle({ fontFamily: 'Arial, sans-serif', fontSize: 11, fontWeight: status ? 'bold' : 'normal', fill: status ? palette.paper : palette.ink }), [palette, status]);
  const width = Math.min(185, Math.max(52, text.length * 6.4 + 15));
  const draw = useCallback((g: Graphics) => { g.clear(); g.roundRect(-width / 2, -18, width, 18, 4).fill(status ? palette.blue : palette.paper).stroke({ width: 1, color: palette.trim }); }, [palette, status, width]);
  return <pixiContainer y={y}><pixiGraphics draw={draw} /><pixiText text={text} style={style} anchor={.5} y={-9} /></pixiContainer>;
}
function drawPerson(g: Graphics, profile: typeof ROSTER[number], moving: boolean, seated: boolean, typing: boolean, frame: number, reduced: boolean, dark: boolean, activity: string | null) {
  g.clear();
  const sway = moving && !reduced && frame ? -2 : 0;
  g.ellipse(0, 0, 11, 5).fill({ color: 0, alpha: .22 });
  if (seated) g.rect(-6, -12, 12, 7).fill(0x344255);
  else { g.rect(-6, -14 + sway, 5, 14 - sway).fill(0x344255); g.rect(1, -14 - sway, 5, 14 + sway).fill(0x344255); }
  g.rect(-8, -28 + sway, 16, 16).fill(profile.shirt);
  g.rect(-10, -26 + sway + (typing && !reduced && frame ? 2 : 0), 4, 12).fill(shade(profile.shirt, .85));
  g.rect(6, -26 + sway + (typing && !reduced && !frame ? 2 : 0), 4, 12).fill(shade(profile.shirt, .85));
  g.rect(-6, -41 + sway, 12, 14).fill(profile.skin);
  g.rect(-7, -43 + sway, 14, 5).fill(profile.hair);
  g.rect(-7, -39 + sway, 3, 6).fill(profile.hair);
  g.rect(0, -34 + sway, 2, 2).fill(dark ? 0x202632 : 0x303640);
  g.rect(4, -34 + sway, 2, 2).fill(dark ? 0x202632 : 0x303640);
  if (profile.id === 'ceo') g.rect(-2, -25 + sway, 4, 8).fill(0xc9d6e2);
  if (activity === 'coffee' && !moving) { g.rect(10, -22, 8, 7).fill(0xf5f7fa); g.rect(17, -21, 2, 4).fill(0xc2cbd6); }
  if (activity === 'chat' && !moving) g.rect(8, -33 + (!reduced && frame ? -2 : 0), 4, 11).fill(shade(profile.shirt, .85));
  if (activity === 'printer' && !moving) g.rect(10, -23, 10, 12).fill(0xf5f7fa);
}
function AgentCharacter({ profile, palette, reduced, onAgentClick }: { profile: typeof ROSTER[number]; palette: Palette; reduced: boolean; onAgentClick: (id: AgentId) => void }) {
  const character = useOffice(state => state.characters[profile.id]);
  const real = useOffice(state => state.real[profile.id]);
  const arrived = useOffice(state => state.arrived);
  const root = useRef<Container>(null), body = useRef<Graphics>(null);
  const current = useRef({ x: seats[profile.seat].x + .5, y: seats[profile.seat].y + .5, path: [] as Point[], last: '', target: '' });
  const targetKey = `${character.target.x},${character.target.y},${character.phase}`;
  useEffect(() => {
    const sim = current.current;
    if (sim.target === targetKey) return;
    sim.target = targetKey;
    sim.path = reduced ? [] : pathfind({ x: Math.floor(sim.x), y: Math.floor(sim.y) }, character.target);
    if (reduced) { sim.x = character.target.x + .5; sim.y = character.target.y + .5; }
    if (!sim.path.length && character.phase !== 'seat' && character.phase !== 'real' && character.phase !== 'consolidate') arrived(profile.id, Date.now());
  }, [arrived, character.phase, character.target, profile.id, reduced, targetKey]);
  const tick = useCallback((ticker: Ticker) => {
    if (!root.current || !body.current) return;
    const sim = current.current;
    const next = sim.path[0];
    const moving = !!next;
    if (next) {
      const tx = next.x + .5, ty = next.y + .5, dx = tx - sim.x, dy = ty - sim.y;
      const length = Math.hypot(dx, dy), step = Math.min(length, 2.7 * ticker.deltaMS / 1000);
      if (length <= step) { sim.x = tx; sim.y = ty; sim.path.shift(); if (!sim.path.length) arrived(profile.id, Date.now()); }
      else { sim.x += dx / length * step; sim.y += dy / length * step; }
    }
    const p = iso(sim.x, sim.y);
    root.current.position.set(Math.round(p.x), Math.round(p.y));
    root.current.zIndex = depth({ x: sim.x, y: sim.y }) + 1;
    const seated = !moving && Math.floor(sim.x) === seats[profile.seat].x && Math.floor(sim.y) === seats[profile.seat].y;
    const typing = real.working && seated;
    const frame = Math.floor(performance.now() / 190) % 2;
    const key = `${moving}${seated}${typing}${character.activity}${reduced ? 0 : frame}${palette.background}`;
    if (key !== sim.last) { drawPerson(body.current, profile, moving, seated, typing, frame, reduced, palette === DARK, character.activity); sim.last = key; }
  }, [arrived, character.activity, palette, profile, real.working, reduced]);
  useTick(tick);
  const ring = useCallback((g: Graphics) => { g.clear(); if (real.working) g.ellipse(0, 0, 14, 7).stroke({ width: 2, color: palette.blue }); }, [palette, real.working]);
  const nameStyle = useMemo(() => new TextStyle({ fontFamily: 'Arial, sans-serif', fontSize: 11, fontWeight: 'bold', fill: palette.ink }), [palette]);
  return <pixiContainer ref={root} visible={!character.hidden} eventMode="static" cursor="pointer" hitArea={new Rectangle(-42, -68, 84, 75)} onPointerTap={() => onAgentClick(profile.id)}>
    <pixiGraphics draw={ring} /><pixiGraphics ref={body} draw={() => {}} /><pixiText text={profile.name} style={nameStyle} anchor={.5} y={-51} />
    {(character.bubble || real.working) && <Bubble text={real.working ? real.stage : character.bubble} y={-72} palette={palette} status={real.working} />}
  </pixiContainer>;
}
function Scene({ width, height, palette, reduced, onAgentClick }: { width: number; height: number; palette: Palette; reduced: boolean; onAgentClick: (id: AgentId) => void }) {
  const { app } = useApplication();
  const world = useRef<Container>(null);
  const real = useOffice(state => state.real);
  const draw = useCallback((g: Graphics) => drawFloor(g, palette), [palette]);
  useEffect(() => {
    const view = world.current;
    if (!view || !app) return;
    const mapWidth = (MAP[0].length + MAP.length) * TILE_W / 2;
    const mapHeight = (MAP[0].length + MAP.length) * TILE_H / 2 + 140;
    const scale = Math.min((width - 30) / mapWidth, (height - 30) / mapHeight);
    view.scale.set(scale);
    view.position.set(width / 2 - ((MAP[0].length - MAP.length) * TILE_W / 4) * scale, height / 2 - ((MAP[0].length + MAP.length) * TILE_H / 4 - 45) * scale);
  }, [app, width, height]);
  useEffect(() => {
    if (!app) return;
    const visibility = () => { if (document.hidden) app.ticker.stop(); else app.ticker.start(); };
    document.addEventListener('visibilitychange', visibility);
    visibility();
    return () => document.removeEventListener('visibilitychange', visibility);
  }, [app]);
  const logoStyle = useMemo(() => new TextStyle({ fontFamily: 'Arial, sans-serif', fontSize: 20, fontWeight: 'bold', fill: palette.ink }), [palette]);
  const logo = iso(5.5, 1);
  return <pixiContainer ref={world}>
    <pixiGraphics draw={draw} />
    <pixiText text="◕ five minutes" style={logoStyle} x={logo.x} y={logo.y - 80} />
    <pixiContainer sortableChildren>
      {tiles.filter(tile => !'.#V'.includes(tile.kind)).map(tile => {
        const lit = tile.kind === 'D' && ROSTER.some(a => real[a.id].working && (Math.abs(seats[a.seat].x - tile.x) + Math.abs(seats[a.seat].y - tile.y) === 1));
        return <pixiGraphics key={`${tile.x}-${tile.y}`} zIndex={depth(tile)} draw={g => drawProp(g, tile.kind, tile.x, tile.y, palette, lit)} />;
      })}
      {ROSTER.map(profile => <AgentCharacter key={profile.id} profile={profile} palette={palette} reduced={reduced} onAgentClick={onAgentClick} />)}
    </pixiContainer>
  </pixiContainer>;
}
export function OfficeCanvas({ dark, reduced, onAgentClick }: { dark: boolean; reduced: boolean; onAgentClick: (id: AgentId) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1000, height: 650 });
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setSize({ width: Math.max(320, el.clientWidth), height: Math.max(400, el.clientHeight) }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const palette = dark ? DARK : LIGHT;
  return <div ref={host} className="office-canvas" role="img" aria-label="Oficina isométrica animada de los cuatro agentes. Las tarjetas siguientes ofrecen el mismo estado en texto.">
    <Application width={size.width} height={size.height} backgroundColor={palette.background} antialias={false} resolution={Math.min(window.devicePixelRatio || 1, 2)}>
      <Scene width={size.width} height={size.height} palette={palette} reduced={reduced} onAgentClick={onAgentClick} />
    </Application>
  </div>;
}
