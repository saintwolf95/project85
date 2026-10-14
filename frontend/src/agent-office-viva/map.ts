/** Canonical low-resolution layout used by the Canvas 2D renderer. */
export const OFFICE_GRID = Object.freeze([
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
] as const);

export const OFFICE_TILE = Object.freeze({ width: 32, height: 16 });
