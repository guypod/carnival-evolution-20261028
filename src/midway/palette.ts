import { theme } from '../carnival';

const { colors } = theme;

/**
 * The midway map's daytime palette. Tent reds, creams and golds come from the
 * carnival theme; the sky, grass, paths and other scenery shades only the map
 * uses live here.
 */
export const palette = {
  sky: '#f3a35c',
  skyHigh: '#6a3f7d',
  cloud: '#bfeafc',
  cloudShade: '#94d8f4',
  haze: '#5fc3b8',

  grass: '#a5c43a',
  grassDark: '#8aab2a',
  grassEdge: '#7a9a22',
  grassLight: '#b6d24c',
  path: '#f3e28e',
  pathShade: '#e2cd70',
  hedge: '#6f9a2c',
  hedgeDark: '#5a8122',
  hedgeLight: '#86b236',
  shadow: 'rgba(60, 90, 10, 0.28)',

  red: colors.stripeA,
  redShade: '#b8283a',
  cream: colors.stripeB,
  creamShade: '#e3d9c2',
  gold: colors.accent,
  goldShade: '#e0a91c',
  blue: '#2b8ccc',
  blueShade: '#1f6aa0',
  sky2: colors.water,
  pink: '#f59ac0',
  pinkShade: '#e076a4',
  wood: colors.wood,
  woodDark: '#6b4429',
  woodLight: '#b7834f',
  board: '#c8955b',
  metal: '#e9e4f2',
  metalShade: '#b9b0cc',
  ink: colors.background,
  opening: '#4a2a28',
  closed: '#a99cc4',
  closedShade: '#8a7daa',
  white: '#ffffff',

  skins: ['#f1c27d', '#c68642', '#8d5524', '#e0ac69', '#ffdbac'],
  hairs: ['#3b2219', '#1b1035', '#a55728', '#e6c35c', '#6b4429'],
  shirts: [colors.water, '#7bd389', '#b48ee0', colors.danger, '#2b8ccc', colors.stripeB],
  pants: ['#2d3a6b', '#3b2a4f', '#5a4a3a'],
  bunting: [colors.stripeA, colors.accent, '#2b8ccc', colors.stripeB],
  balloons: [colors.stripeA, colors.accent, '#2b8ccc', colors.water, '#f59ac0'],
} as const;

/**
 * The lantern evening scene: a dusk sky, a wash that dims the ground, and the
 * warm glow of the lanterns along the paths. Booths, people and labels are
 * drawn over the wash, so they stay as clear as by day.
 */
export const evening = {
  sky: '#c2566b',
  skyHigh: '#1f1a45',
  wash: 'rgba(28, 22, 70, 0.42)',
  glow: 'rgba(255, 196, 92, 0.55)',
  glowEdge: 'rgba(255, 196, 92, 0)',
} as const;

/** The light garden's lantern colours, steady glows for lantern evening. */
export const gardenLights = {
  warm: colors.accent,
  cool: colors.water,
  warmGlow: 'rgba(255, 204, 51, 0.45)',
  coolGlow: 'rgba(94, 200, 242, 0.4)',
  glowEdge: 'rgba(0, 0, 0, 0)',
  garland: colors.stripeB,
  bed: 'rgba(255, 248, 231, 0.12)',
  editGrid: 'rgba(255, 248, 231, 0.35)',
  selected: colors.stripeB,
} as const;

/** The locate marker: a light ring on a dark edge, readable by day and by evening. */
export const locator = {
  ring: colors.stripeB,
  edge: colors.background,
} as const;

/** The waterside: the river, its sandy banks, the piers and the ferry. */
export const waterside = {
  water: colors.water,
  waterDeep: '#3aa6d6',
  ripple: 'rgba(255, 255, 255, 0.55)',
  sand: '#f0d9a0',
  sandShade: '#d9bd7a',
  boards: '#c8955b',
  boardsShade: '#9c6b3d',
  hull: '#2b8ccc',
  hullShade: '#1f6aa0',
  deck: colors.stripeB,
  rope: '#e3d9c2',
} as const;
