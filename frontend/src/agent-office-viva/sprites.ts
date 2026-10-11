/**
 * The renderer keeps the original procedural sprite generator in engine.ts so
 * the prototype's pixel output remains byte-for-byte equivalent while porting.
 * This catalogue is the isolated asset contract for a later illustrator pass.
 */
export const OFFICE_SPRITES = Object.freeze(['furniture', 'avatar', 'cat', 'emotion'] as const);
