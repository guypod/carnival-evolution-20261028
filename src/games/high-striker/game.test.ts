import { describe, expect, it, vi } from 'vitest';
import { theme } from '../../carnival/theme';
import {
  BUTTON,
  METER,
  TOWER,
  FLIGHT_TIME,
  TIMING_LABELS,
  ZONES,
  MARKER_PERIOD,
  SWINGS,
  bestSwing,
  breakdown,
  breakdownRow,
  buttonLabel,
  createState,
  feedback,
  frameClock,
  isActionKey,
  lastStrike,
  listen,
  markerPosition,
  nextSwing,
  press,
  puckHeight,
  bellLit,
  saveFinalScore,
  scoreFor,
  signedOffset,
  step,
  strike,
  takeFinalScore,
  timingFor,
  total,
  zoneLabels,
  type StrikerState,
} from './game';

/** Moves the marker to `time` seconds into the swing and strikes, then lands the puck. */
function swingAt(state: StrikerState, time: number) {
  state.markerTime = time;
  strike(state);
  step(state, FLIGHT_TIME);
}

function aiming(): StrikerState {
  return press(createState(), frameClock(0), 0);
}

describe('high striker', () => {
  it('scores 100 at the centre and 10 at the edge', () => {
    expect(scoreFor(0)).toBe(100);
    expect(scoreFor(0.04)).toBe(100);
    expect(scoreFor(-0.1)).toBe(75);
    expect(scoreFor(0.3)).toBe(50);
    expect(scoreFor(-0.6)).toBe(25);
    expect(scoreFor(1)).toBe(10);
    expect(scoreFor(-1)).toBe(10);
  });

  it('sweeps the marker from the left end through the centre and back', () => {
    expect(markerPosition(0)).toBe(-1);
    expect(markerPosition(MARKER_PERIOD / 4)).toBeCloseTo(0);
    expect(markerPosition(MARKER_PERIOD / 2)).toBeCloseTo(1);
    expect(markerPosition(MARKER_PERIOD)).toBeCloseTo(-1);
  });

  it('waits for Start before the marker moves', () => {
    const state = createState();
    step(state, 5);
    expect(state.phase).toBe('ready');
    expect(strike(state)).toBe(false);
    expect(buttonLabel(state)).toMatch(/Start/);
  });

  it('does not charge idle time before Start', () => {
    const clock = frameClock(0);
    const state = press(createState(), clock, 10_000);
    step(state, clock.tick(10_016));
    expect(state.markerTime).toBeCloseTo(0.016);
  });

  it('does not charge aiming time to the puck flight', () => {
    const clock = frameClock(0);
    const state = press(createState(), clock, 0);
    step(state, clock.tick(100));
    press(state, clock, 900);
    expect(state.phase).toBe('flying');
    step(state, clock.tick(916));
    expect(state.flyTime).toBeCloseTo(0.016);
  });

  it('plays exactly three swings, showing each result until Next swing', () => {
    const state = aiming();
    swingAt(state, MARKER_PERIOD / 4);
    expect(state.phase).toBe('result');
    step(state, 10);
    expect(state.phase).toBe('result');
    expect(buttonLabel(state)).toMatch(/Next swing/);
    expect(nextSwing(state)).toBe(true);
    swingAt(state, 0);
    nextSwing(state);
    swingAt(state, MARKER_PERIOD / 4);
    expect(state.swings).toEqual([100, 10, 100]);
    expect(state.swings).toHaveLength(SWINGS);
    expect(state.phase).toBe('over');
    expect(total(state)).toBe(210);
    expect(nextSwing(state)).toBe(false);
    expect(strike(state)).toBe(false);
  });

  it('ignores repeated strikes while the puck flies', () => {
    const state = aiming();
    expect(strike(state)).toBe(true);
    expect(strike(state)).toBe(false);
    const clock = frameClock(0);
    expect(press(state, clock, 0)).toBe(state);
    expect(state.swings).toHaveLength(1);
    expect(nextSwing(state)).toBe(false);
    expect(buttonLabel(state)).toBeUndefined();
  });

  it("raises the puck to the swing's points, holds, then drops it back", () => {
    const state = aiming();
    state.markerTime = MARKER_PERIOD / 4;
    strike(state);
    expect(puckHeight(state)).toBe(0);
    step(state, FLIGHT_TIME * 0.2);
    expect(puckHeight(state)).toBeGreaterThan(0);
    expect(puckHeight(state)).toBeLessThan(1);
    step(state, FLIGHT_TIME * 0.3);
    expect(puckHeight(state)).toBe(1);
    step(state, FLIGHT_TIME * 0.3);
    expect(puckHeight(state)).toBeGreaterThan(0);
    expect(puckHeight(state)).toBeLessThan(1);
    step(state, FLIGHT_TIME);
    expect(puckHeight(state)).toBe(0);
    nextSwing(state);
    state.markerTime = 0;
    strike(state);
    step(state, FLIGHT_TIME * 0.5);
    expect(puckHeight(state)).toBeCloseTo(0.1);
  });

  it('flashes the bell at the top of a 100-point swing only', () => {
    const state = aiming();
    state.markerTime = MARKER_PERIOD / 4;
    strike(state);
    expect(bellLit(state)).toBe(false);
    step(state, FLIGHT_TIME * 0.45);
    expect(bellLit(state)).toBe(true);
    step(state, FLIGHT_TIME * 0.1);
    expect(bellLit(state)).toBe(false);
    step(state, FLIGHT_TIME * 0.1);
    expect(bellLit(state)).toBe(true);
    step(state, FLIGHT_TIME);
    expect(bellLit(state)).toBe(false);
    nextSwing(state);
    state.markerTime = MARKER_PERIOD / 8;
    strike(state);
    step(state, FLIGHT_TIME * 0.45);
    expect(bellLit(state)).toBe(false);
  });

  it('shows the final height and a steady bell in quiet mode', () => {
    const state = aiming();
    state.markerTime = MARKER_PERIOD / 4;
    strike(state);
    expect(puckHeight(state, true)).toBe(1);
    expect(bellLit(state, true)).toBe(true);
    step(state, FLIGHT_TIME);
    expect(puckHeight(state, true)).toBe(1);
    expect(bellLit(state, true)).toBe(true);
    nextSwing(state);
    expect(puckHeight(state, true)).toBe(0);
    expect(bellLit(state, true)).toBe(false);
    swingAt(state, 0);
    expect(puckHeight(state, true)).toBeCloseTo(0.1);
    expect(bellLit(state, true)).toBe(false);
  });

  it('saves the total once, and a failed save still allows replay', () => {
    const state = aiming();
    for (let i = 0; i < SWINGS; i++) {
      swingAt(state, MARKER_PERIOD / 4);
      nextSwing(state);
    }
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('quota');
    const record = vi.fn(() => {
      throw error;
    });
    try {
      expect(saveFinalScore(state, record)).toBe(error);
    } finally {
      consoleError.mockRestore();
    }
    expect(saveFinalScore(state, record)).toBeUndefined();
    expect(takeFinalScore(state)).toBeUndefined();
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(300);

    const replay = press(state, frameClock(0), 0);
    expect(replay).not.toBe(state);
    expect(replay.phase).toBe('aiming');
    expect(replay.swings).toEqual([]);
    expect(replay.scoreRecorded).toBe(false);
  });

  it('does not save before the round ends', () => {
    const state = aiming();
    swingAt(state, 0);
    const record = vi.fn();
    saveFinalScore(state, record);
    expect(record).not.toHaveBeenCalled();
  });

  it('leaves Enter and Space to a focused link or control', () => {
    expect(isActionKey('Space', ' ')).toBe(true);
    expect(isActionKey('Enter', 'Enter', 'CANVAS')).toBe(true);
    expect(isActionKey('Enter', 'Enter', 'A')).toBe(false);
    expect(isActionKey('Space', ' ', 'button')).toBe(false);
    expect(isActionKey('Escape', 'Escape')).toBe(false);
  });

  it('pauses the clock across a resume', () => {
    const clock = frameClock(0);
    expect(clock.tick(500)).toBe(0.5);
    clock.resume(60_000);
    expect(clock.tick(60_100)).toBeCloseTo(0.1);
  });

  it('removes every listener it adds', () => {
    const targets = [new EventTarget(), new EventTarget(), new EventTarget()];
    const handlers = { pointerdown: vi.fn(), keydown: vi.fn(), visibilitychange: vi.fn() };
    const stop = listen(targets[0], targets[1], targets[2], handlers);
    targets[0].dispatchEvent(new Event('pointerdown'));
    targets[1].dispatchEvent(new Event('keydown'));
    targets[2].dispatchEvent(new Event('visibilitychange'));
    stop();
    targets[0].dispatchEvent(new Event('pointerdown'));
    targets[1].dispatchEvent(new Event('keydown'));
    targets[2].dispatchEvent(new Event('visibilitychange'));
    expect(handlers.pointerdown).toHaveBeenCalledTimes(1);
    expect(handlers.keydown).toHaveBeenCalledTimes(1);
    expect(handlers.visibilitychange).toHaveBeenCalledTimes(1);
  });
});

describe('high striker timing feedback', () => {
  // The marker crosses the centre heading right at a quarter period.
  const centre = MARKER_PERIOD / 4;

  it('calls a strike at the centre perfect', () => {
    const state = aiming();
    swingAt(state, centre);
    expect(lastStrike(state)).toMatchObject({ points: 100, timing: 'perfect' });
    expect(feedback(lastStrike(state)!)).toBe(
      `DING! Bell rung: 100 points. ${TIMING_LABELS.perfect}`,
    );
  });

  it('calls a strike before the marker reaches the centre early, in either direction', () => {
    const rightward = aiming();
    swingAt(rightward, centre - MARKER_PERIOD * 0.04);
    expect(lastStrike(rightward)).toMatchObject({ timing: 'early' });
    expect(lastStrike(rightward)!.offset).toBeLessThan(0);

    const leftward = aiming();
    swingAt(leftward, centre * 3 - MARKER_PERIOD * 0.04);
    expect(lastStrike(leftward)).toMatchObject({ timing: 'early' });
    expect(lastStrike(leftward)!.position).toBeGreaterThan(0);
  });

  it('calls a strike after the marker passes the centre late, in either direction', () => {
    const rightward = aiming();
    swingAt(rightward, centre + MARKER_PERIOD * 0.04);
    expect(lastStrike(rightward)).toMatchObject({ points: 75, timing: 'late' });
    expect(feedback(lastStrike(rightward)!)).toContain('Late');

    const leftward = aiming();
    swingAt(leftward, centre * 3 + MARKER_PERIOD * 0.04);
    expect(lastStrike(leftward)).toMatchObject({ timing: 'late' });
    expect(lastStrike(leftward)!.position).toBeLessThan(0);
  });

  it('keeps the perfect boundary on the bell zone', () => {
    expect(timingFor(0)).toBe('perfect');
    expect(timingFor(0.05)).toBe('perfect');
    expect(timingFor(-0.05)).toBe('perfect');
    expect(timingFor(0.0501)).toBe('late');
    expect(timingFor(-0.0501)).toBe('early');
    expect(timingFor(1)).toBe('late');
    expect(timingFor(-1)).toBe('early');
  });

  it('measures the offset along the marker travel', () => {
    expect(signedOffset(0)).toBeCloseTo(-1);
    expect(signedOffset(centre)).toBeCloseTo(0);
    expect(signedOffset(MARKER_PERIOD * 0.49)).toBeCloseTo(0.96);
  });

  it('keeps the last strike on the meter while the puck flies and after it lands', () => {
    const state = aiming();
    state.markerTime = centre + MARKER_PERIOD * 0.04;
    strike(state);
    const struck = lastStrike(state);
    expect(state.phase).toBe('flying');
    expect(struck?.position).toBeCloseTo(0.16);
    step(state, FLIGHT_TIME);
    expect(lastStrike(state)).toBe(struck);
  });

  it('lists every swing with points, timing and the best swing', () => {
    const state = aiming();
    swingAt(state, centre - MARKER_PERIOD * 0.04);
    nextSwing(state);
    swingAt(state, centre);
    nextSwing(state);
    swingAt(state, 0);
    expect(state.phase).toBe('over');
    expect(bestSwing(state)?.index).toBe(1);
    expect(breakdown(state)).toEqual([
      'Swing 1: 75 points, Early',
      'Swing 2: 100 points, Perfect (best)',
      'Swing 3: 10 points, Early',
    ]);
    expect(total(state)).toBe(185);
  });

  it('keeps every breakdown line clear of the replay button and inside the canvas', () => {
    const size = theme.font.small;
    const legendBaseline = METER.y + METER.h + 26;
    let previous = legendBaseline;
    for (let i = 0; i < SWINGS; i++) {
      const row = breakdownRow(i);
      // Right-aligned at row.x, so the whole line ends left of the button.
      expect(row.x).toBeLessThan(BUTTON.x);
      // Each line starts a full line below the one above it, the legend first.
      expect(row.y - size).toBeGreaterThanOrEqual(previous);
      // Descenders stay above the tower's base and the bottom of the canvas.
      expect(row.y + size * 0.3).toBeLessThan(TOWER.bottom);
      expect(row.y).toBeLessThan(theme.canvas.height);
      previous = row.y;
    }
  });

  it('labels every zone on the meter with the points a strike there scores', () => {
    const labels = zoneLabels();
    // The bell once, every other zone once on each side of the centre.
    expect(labels).toHaveLength(ZONES.length * 2 - 1);
    expect(new Set(labels.map((l) => l.text))).toEqual(new Set(ZONES.map((z) => String(z.points))));
    for (const label of labels) {
      const position = ((label.x - METER.x) / METER.w) * 2 - 1;
      expect(String(scoreFor(position))).toBe(label.text);
    }
  });

  it('draws the zone values inside the meter, and the bell value just above it', () => {
    const size = theme.font.small;
    for (const label of zoneLabels()) {
      if (label.text === String(ZONES[0].points)) {
        // Clear of the markers, which reach 16px above the meter.
        expect(label.y).toBeLessThanOrEqual(METER.y - 16);
        expect(label.y - size).toBeGreaterThan(230);
      } else {
        expect(label.y - size * 0.75).toBeGreaterThanOrEqual(METER.y);
        expect(label.y).toBeLessThanOrEqual(METER.y + METER.h);
      }
    }
  });

  it('marks the first of tied swings as best', () => {
    const state = aiming();
    swingAt(state, 0);
    nextSwing(state);
    swingAt(state, 0);
    expect(bestSwing(state)?.index).toBe(0);
  });

  it('clears the swings and markers on replay', () => {
    const clock = frameClock(0);
    let state = aiming();
    for (let i = 0; i < SWINGS; i++) {
      swingAt(state, centre);
      nextSwing(state);
    }
    expect(state.phase).toBe('over');
    state = press(state, clock, 0);
    expect(state.phase).toBe('aiming');
    expect(state.strikes).toEqual([]);
    expect(lastStrike(state)).toBeUndefined();
    expect(bestSwing(state)).toBeUndefined();
    expect(breakdown(state)).toEqual([]);
  });
});
