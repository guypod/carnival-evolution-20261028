export { createRegistry, type CarnivalGame } from './registry';
export {
  recordScore,
  bestScore,
  topScores,
  onScoreRecorded,
  beginScopedRound,
  createScoreBoard,
  type ScoreEntry,
  type ScoreListener,
  type ScopedRound,
  type ScopedRoundListener,
} from './scores';
export { prizeFor, type PrizeTier } from './prizes';
export { theme, canvasFont, applyTheme } from './theme';
export {
  createSaveSlot,
  browserSaveStorage,
  type SaveSlot,
  type SaveSlotOptions,
  type SaveStorage,
} from './saves';
