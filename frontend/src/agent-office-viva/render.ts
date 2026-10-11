/** Canvas rendering is intentionally dependency-free and pixelated. */
export const OFFICE_RENDERING = Object.freeze({
  renderer: 'canvas-2d',
  smoothing: false,
  depthOrder: 'tile-x-plus-y',
} as const);
