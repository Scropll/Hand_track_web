// @ts-check
/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  SPELL CONFIG: edit shapes, text, colors and effects here.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * path   The wand motion, traced from "A Beginner's Guide to Wand Motions".
 *        Points are [x, y] inside a 0–1 box, with y going DOWN (0 = top).
 *        - The FIRST point is the start dot on the poster.
 *        - The LAST point is where the arrow ends.
 *        - The points are smoothed into a curve (Catmull-Rom). Add 'corner' as a
 *          third value to keep a sharp corner there, e.g. [0.5, 0.0, 'corner'].
 *        - Proportions matter (a wide shape stays wide), but the size you draw
 *          and where on screen you draw it don't.
 *
 * colors Three colors the particles turn while the spell is active.
 *
 * effect Which effect runs when the spell is cast (see src/spellEffects.ts):
 *        unlock, tongueTie, reveal, silence, spiral, fall, rise, dance, gather,
 *        freeze, levitate, grow, push, light, dark, clear, bolt, blast, attack,
 *        clearSky, revealWave
 */

/**
 * @typedef {[number, number] | [number, number, 'corner']} PathPoint
 * @typedef {{
 *   id: string,
 *   name: string,
 *   kind: string,
 *   description: string,
 *   path: PathPoint[],
 *   colors: [string, string, string],
 *   effect: string,
 * }} Spell
 */

/** @type {Spell[]} */
export const SPELLS = [
  {
    id: 'alohomora',
    name: 'Alohomora',
    kind: 'Charm',
    description: 'Opens locked objects',
    // A line down from the top, a loop around, then straight down through the circle.
    path: [[0.5, 0.0], [0.5, 0.18, 'corner'], [0.3, 0.25], [0.22, 0.42], [0.3, 0.6], [0.5, 0.67], [0.7, 0.6], [0.78, 0.42], [0.7, 0.25], [0.5, 0.18, 'corner'], [0.5, 1.0]],
    colors: ['#ffd36b', '#ffb02e', '#fff2c2'],
    effect: 'unlock',
  },
  {
    id: 'mimblewimble',
    name: 'Mimblewimble',
    kind: 'Curse',
    description: 'Tongue-ties the victim',
    // A hook on the left, then a wave up and over to a curl on the right.
    path: [[0.05, 0.5], [0.12, 0.72], [0.28, 0.68], [0.45, 0.42], [0.62, 0.22], [0.8, 0.25], [0.9, 0.45], [0.82, 0.62], [0.7, 0.55]],
    colors: ['#b6ff3b', '#7a2cff', '#e0b3ff'],
    effect: 'tongueTie',
  },
  {
    id: 'aparecium',
    name: 'Aparecium',
    kind: 'Charm',
    description: 'Reveals invisible ink',
    // A triangle: up the left side, down the right, back along the bottom.
    path: [[0.05, 0.95], [0.5, 0.05, 'corner'], [0.95, 0.95, 'corner'], [0.05, 0.95]],
    colors: ['#3a7bff', '#22e0ff', '#d6f6ff'],
    effect: 'reveal',
  },
  {
    id: 'silencio',
    name: 'Silencio',
    kind: 'Charm',
    description: 'Temporarily silences the victim',
    // Down, sharply back up, then a short flick down to the right.
    path: [[0.25, 0.0], [0.3, 1.0, 'corner'], [0.55, 0.1, 'corner'], [0.85, 0.4]],
    colors: ['#5b6b8c', '#9fb0d0', '#e3e8f5'],
    effect: 'silence',
  },
  {
    id: 'specialis-revelio',
    name: 'Specialis Revelio',
    kind: 'Charm',
    description: 'Reveals charms or hexes',
    // Starts in a small spiral at the top, swings round, and tails off in an S to the lower left.
    path: [[0.55, 0.32], [0.62, 0.25], [0.55, 0.17], [0.42, 0.22], [0.4, 0.38], [0.55, 0.48], [0.75, 0.42], [0.82, 0.22], [0.68, 0.04], [0.42, 0.02], [0.22, 0.15], [0.18, 0.38], [0.32, 0.55], [0.6, 0.68], [0.65, 0.85], [0.48, 0.98], [0.25, 0.95], [0.15, 0.85]],
    colors: ['#a35bff', '#3df0ff', '#f3d9ff'],
    effect: 'spiral',
  },
  {
    id: 'descendo',
    name: 'Descendo',
    kind: 'Charm',
    description: 'Lowers the caster down',
    // A loop at the top (like a P), then straight down.
    path: [[0.3, 0.0], [0.6, 0.03], [0.78, 0.2], [0.72, 0.42], [0.5, 0.52], [0.32, 0.5, 'corner'], [0.35, 1.0]],
    colors: ['#1d3cff', '#4f8bff', '#b9d0ff'],
    effect: 'fall',
  },
  {
    id: 'ascendio',
    name: 'Ascendio',
    kind: 'Charm',
    description: 'Lifts the caster into the air',
    // Down the right, round the bottom, and up high on the left.
    path: [[0.7, 0.35], [0.68, 0.7], [0.5, 0.95], [0.32, 0.8], [0.3, 0.45], [0.3, 0.0]],
    colors: ['#ff8a3d', '#ffd36b', '#9fe8ff'],
    effect: 'rise',
  },
  {
    id: 'tarantallegra',
    name: 'Tarantallegra',
    kind: 'Curse',
    description: 'Makes the victim’s legs dance',
    // A double wave, like a "w", rising at both ends.
    path: [[0.0, 0.25], [0.08, 0.6], [0.22, 0.78], [0.36, 0.62], [0.45, 0.42], [0.54, 0.62], [0.68, 0.78], [0.84, 0.6], [0.95, 0.25]],
    colors: ['#ff4fd8', '#ffe14d', '#3dffd0'],
    effect: 'dance',
  },
  {
    id: 'reparo',
    name: 'Reparo',
    kind: 'Charm',
    description: 'Repairs objects',
    // An "O": from the bottom left, up and round clockwise, almost closing.
    path: [[0.38, 0.95], [0.15, 0.7], [0.15, 0.3], [0.4, 0.03], [0.7, 0.08], [0.85, 0.4], [0.78, 0.78], [0.55, 0.97]],
    colors: ['#3dff9a', '#ffd36b', '#e9fff4'],
    effect: 'gather',
  },
  {
    id: 'arresto-momentum',
    name: 'Arresto Momentum',
    kind: 'Charm',
    description: 'Slows or stops a target',
    // A tall "M".
    path: [[0.05, 1.0], [0.28, 0.0, 'corner'], [0.5, 0.75, 'corner'], [0.72, 0.0, 'corner'], [0.95, 1.0]],
    colors: ['#7fe7ff', '#d8f8ff', '#ffffff'],
    effect: 'freeze',
  },
  {
    id: 'wingardium-leviosa',
    name: 'Wingardium Leviosa',
    kind: 'Charm',
    description: 'Makes objects fly',
    // Swish (a wave) and flick (up, then down).
    path: [[0.0, 0.5], [0.12, 0.3], [0.28, 0.32], [0.4, 0.55], [0.55, 0.62], [0.68, 0.45], [0.8, 0.15, 'corner'], [0.85, 0.85]],
    colors: ['#fff6d8', '#ffd98a', '#c9e6ff'],
    effect: 'levitate',
  },
  {
    id: 'herbivicus',
    name: 'Herbivicus',
    kind: 'Charm',
    description: 'Makes plants grow',
    // An "h": down the stem, back up halfway, over the arch and down.
    path: [[0.25, 0.0], [0.25, 1.0, 'corner'], [0.25, 0.55, 'corner'], [0.4, 0.4], [0.6, 0.4], [0.72, 0.55], [0.72, 1.0]],
    colors: ['#2fd14d', '#a6ff4d', '#fff27a'],
    effect: 'grow',
  },
  {
    id: 'locomotor',
    name: 'Locomotor',
    kind: 'Charm',
    description: 'Moves the target',
    // A "4": up the stem, diagonal down-left, then across to the right.
    path: [[0.65, 1.0], [0.65, 0.0, 'corner'], [0.05, 0.62, 'corner'], [0.95, 0.62]],
    colors: ['#ffb347', '#ff7a18', '#ffe0a8'],
    effect: 'push',
  },
  {
    id: 'lumos',
    name: 'Lumos',
    kind: 'Charm',
    description: 'Lights the wand tip',
    // A straight line upward.
    path: [[0.5, 1.0], [0.5, 0.0]],
    colors: ['#fff7e0', '#ffe6a3', '#ffffff'],
    effect: 'light',
  },
  {
    id: 'nox',
    name: 'Nox',
    kind: 'Charm',
    description: 'Darkens the wand tip',
    // A straight line downward.
    path: [[0.5, 0.0], [0.5, 1.0]],
    colors: ['#1a2350', '#2c3a7a', '#4a5aa0'],
    effect: 'dark',
  },
  {
    id: 'finite-incantatem',
    name: 'Finite Incantatem',
    kind: 'Counter-spell',
    description: 'Ends all spell effects',
    // A "Z": across, diagonal back, across again.
    path: [[0.05, 0.2], [0.9, 0.2, 'corner'], [0.2, 0.75, 'corner'], [0.95, 0.75]],
    colors: ['#ffffff', '#cfe3ff', '#ffe9b8'],
    effect: 'clear',
  },
  {
    id: 'stupefy',
    name: 'Stupefy',
    kind: 'Charm',
    description: 'Stuns the target',
    // Down-left diagonal, then a straight line to the right.
    path: [[0.85, 0.0], [0.05, 0.8, 'corner'], [1.0, 0.8]],
    colors: ['#ff1a1a', '#ff5a3d', '#ffc2b3'],
    effect: 'bolt',
  },
  {
    id: 'revelio',
    name: 'Revelio',
    kind: 'Charm',
    description: 'Reveals hidden objects',
    // An "R": up the stem, round the bowl, and out along the leg.
    path: [[0.15, 1.0], [0.15, 0.0, 'corner'], [0.55, 0.02], [0.75, 0.22], [0.55, 0.45], [0.2, 0.48, 'corner'], [0.8, 1.0]],
    colors: ['#e9fbff', '#7cf3ff', '#ffffff'],
    effect: 'revealWave',
  },
  {
    id: 'oppugno',
    name: 'Oppugno',
    kind: 'Jinx',
    description: 'Sends objects to attack',
    // Down the left, then one long stroke up to the top right.
    path: [[0.05, 0.08], [0.15, 1.0, 'corner'], [1.0, 0.0]],
    colors: ['#c21bff', '#ff2b6e', '#ffb3e1'],
    effect: 'attack',
  },
  {
    id: 'meteolojinx-recanto',
    name: 'Meteolojinx Recanto',
    kind: 'Counter-charm',
    description: 'Ends magical weather',
    // A small hook, then a high arch from left to right.
    path: [[0.1, 0.95], [0.02, 0.7], [0.15, 0.3], [0.5, 0.05], [0.85, 0.3], [0.98, 0.9]],
    colors: ['#8fd3ff', '#ffffff', '#ffe58a'],
    effect: 'clearSky',
  },
  {
    id: 'expelliarmus',
    name: 'Expelliarmus',
    kind: 'Charm',
    description: 'Disarms the opponent',
    // Across to the right, then down: a "7".
    path: [[0.05, 0.05], [0.95, 0.05, 'corner'], [0.85, 1.0]],
    colors: ['#ff3d00', '#ff8a00', '#ffd27a'],
    effect: 'blast',
  },
];
