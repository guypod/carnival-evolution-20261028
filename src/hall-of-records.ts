import { topScores, type CarnivalGame, type ScoreEntry } from './carnival';

/** How many rounds each booth shows in the Hall of Records. */
export const RECORDS_PER_BOOTH = 5;

/** One stored round, ready to show. */
export interface RecordRow {
  /** Competition rank: tied scores share a rank, and the next rank skips. */
  rank: number;
  score: number;
  /** When the round was recorded, or 'Unknown date' when that can't be read. */
  when: string;
}

/** One booth's card in the Hall of Records. */
export interface RecordBooth {
  gameId: string;
  name: string;
  rows: RecordRow[];
  /** The booth's best score, or undefined when it has no valid rounds. */
  best: number | undefined;
  playHref: string;
}

export interface HallOfRecords {
  booths: RecordBooth[];
  /** How many booths have at least one valid round, a score of 0 included. */
  playedBooths: number;
  /** The sum of each played booth's personal best. */
  personalBestTotal: number;
}

/** Formats a recorded time in the reader's own locale. */
export function localDateTime(at: number): string {
  return new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function validScore(entry: unknown): entry is ScoreEntry {
  const score = (entry as ScoreEntry | null)?.score;
  return typeof score === 'number' && Number.isFinite(score) && score >= 0;
}

function validTime(at: unknown): at is number {
  return typeof at === 'number' && !Number.isNaN(new Date(at).getTime());
}

/** Higher scores first; on a tie the earlier round first, unknown dates last. */
function byRecord(a: ScoreEntry, b: ScoreEntry): number {
  if (a.score !== b.score) return b.score - a.score;
  if (validTime(a.at) && validTime(b.at)) return a.at - b.at;
  return Number(validTime(b.at)) - Number(validTime(a.at));
}

function storedRounds(gameId: string, top: (gameId: string, count: number) => ScoreEntry[]) {
  try {
    return top(gameId, Number.MAX_SAFE_INTEGER);
  } catch {
    // Storage that can't be read at all shows as no rounds, not a broken page.
    return [];
  }
}

/**
 * The Hall of Records, read from each registered game's stored scores in the
 * shared scores module. Nothing is written: a new game joins on registration.
 */
export function hallOfRecords(
  games: readonly CarnivalGame[],
  top: (gameId: string, count: number) => ScoreEntry[] = topScores,
  format: (at: number) => string = localDateTime,
): HallOfRecords {
  const booths = games.map((game): RecordBooth => {
    // Read past the top five so a bad stored entry can't hide a good round.
    const entries = storedRounds(game.id, top)
      .filter(validScore)
      .sort(byRecord)
      .slice(0, RECORDS_PER_BOOTH);
    const rows = entries.map((entry): RecordRow => ({
      rank: entries.findIndex((other) => other.score === entry.score) + 1,
      score: entry.score,
      when: validTime(entry.at) ? format(entry.at) : 'Unknown date',
    }));
    return {
      gameId: game.id,
      name: game.name,
      rows,
      best: rows[0]?.score,
      playHref: `#/play/${game.id}`,
    };
  });
  const played = booths.filter((booth) => booth.best !== undefined);
  return {
    booths,
    playedBooths: played.length,
    personalBestTotal: played.reduce((sum, booth) => sum + (booth.best ?? 0), 0),
  };
}

/** The overview line at the top of the Hall of Records. */
export function overviewText(hall: HallOfRecords): string {
  const total = hall.booths.length;
  if (total === 0) return 'No booths are open yet.';
  if (hall.playedBooths === 0) return `No rounds recorded yet at any of the ${total} booths.`;
  const booths = `${hall.playedBooths} of ${total} ${total === 1 ? 'booth' : 'booths'} played`;
  return `${booths}. Personal bests added up: ${hall.personalBestTotal}.`;
}

/** The empty-state line for a booth with no rounds. */
export function emptyText(booth: RecordBooth): string {
  return `No rounds recorded at ${booth.name} yet. Play a round to set the first record.`;
}
