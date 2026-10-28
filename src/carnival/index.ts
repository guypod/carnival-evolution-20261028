export { createRegistry, type CarnivalGame } from './registry';
export {
  recordScore,
  bestScore,
  topScores,
  onScoreRecorded,
  createScoreBoard,
  type ScoreEntry,
  type ScoreListener,
} from './scores';
export { prizeFor, type PrizeTier } from './prizes';
export { theme, canvasFont, applyTheme } from './theme';
