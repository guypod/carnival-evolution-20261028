import { describe, expect, it, vi } from 'vitest';
import {
  POSTCARD_MESSAGES,
  POSTCARD_NAME_MAX,
  POSTCARD_SCALE,
  cleanVisitorName,
  drawPostcard,
  limitNameInput,
  postcardColors,
  postcardContent,
  postcardExporter,
  postcardMarkLayout,
  type PostcardVisit,
} from './postcard';

const visit: PostcardVisit = {
  scene: 'day',
  landmarksFound: 1,
  landmarksTotal: 3,
  stampsPlayed: 2,
  stampsTotal: 9,
};

describe('cleanVisitorName', () => {
  it('trims and collapses spaces', () => {
    expect(cleanVisitorName('  Ada   Lovelace \n')).toBe('Ada Lovelace');
  });

  it('removes control and invisible formatting characters', () => {
    expect(cleanVisitorName('Ada\u0000‮​B')).toBe('Ada B');
  });

  it('keeps markup as plain text', () => {
    expect(cleanVisitorName('<b>Ada</b>')).toBe('<b>Ada</b>');
  });

  it('stops at the length limit without splitting an emoji', () => {
    const long = '🎡'.repeat(POSTCARD_NAME_MAX + 5);
    const name = cleanVisitorName(long);
    expect(Array.from(name)).toHaveLength(POSTCARD_NAME_MAX);
    expect(name).toBe('🎡'.repeat(POSTCARD_NAME_MAX));
  });

  it('cuts the name field to what the card shows', () => {
    const ascii = 'a'.repeat(30);
    expect(limitNameInput(ascii)).toBe('a'.repeat(POSTCARD_NAME_MAX));
    expect(cleanVisitorName(limitNameInput(ascii))).toBe(limitNameInput(ascii));
    const emoji = '🎡'.repeat(POSTCARD_NAME_MAX);
    expect(limitNameInput(emoji)).toBe(emoji);
    expect(limitNameInput(emoji + '🎡')).toBe(emoji);
  });

  it('normalizes the name field before it bounds it', () => {
    expect(limitNameInput('    Alexandria Montgomery')).toBe('Alexandria Montgomery');
    const visible = 'Abcdefghij Klmnopqrstuvw';
    expect(Array.from(visible)).toHaveLength(POSTCARD_NAME_MAX);
    const messy = '   Abcdefghij \u0000\t  \u200b Klmnopqrstuvw';
    expect(limitNameInput(messy)).toBe(visible);
    expect(cleanVisitorName(messy)).toBe(visible);
    expect(limitNameInput(messy + 'xyz')).toBe(visible);
  });

  it('keeps 24 supplementary characters through spaces and controls', () => {
    const letters = '𝒜'.repeat(12) + ' ' + '🎡'.repeat(11);
    expect(Array.from(letters)).toHaveLength(POSTCARD_NAME_MAX);
    const messy = '  \u0007' + '𝒜'.repeat(12) + ' \u202e  ' + '🎡'.repeat(11) + '🎡';
    expect(limitNameInput(messy)).toBe(letters);
    expect(cleanVisitorName(messy)).toBe(letters);
  });

  it('keeps one trailing space in the field so the next word can follow', () => {
    expect(limitNameInput('Ada   ')).toBe('Ada ');
    expect(cleanVisitorName('Ada   ')).toBe('Ada');
    expect(limitNameInput('Ada \n')).toBe('Ada ');
  });

  it('gives the field and the card the same name', () => {
    for (const raw of ['  Ada   Lovelace ', '\u0000\u0000' + 'b'.repeat(40), ' 🎡 '.repeat(20)]) {
      expect(cleanVisitorName(limitNameInput(raw))).toBe(cleanVisitorName(raw));
      expect(limitNameInput(limitNameInput(raw))).toBe(limitNameInput(raw));
    }
  });

  it('reads blank as no name', () => {
    expect(cleanVisitorName(' \t ')).toBe('');
  });
});

describe('postcardContent', () => {
  it('describes a visit in progress', () => {
    expect(postcardContent(visit)).toEqual({
      heading: "Greetings from Guy's Carnival",
      greeting: 'A visitor was here!',
      lines: [
        '1 of 3 landmarks found',
        'Midway Explorer: 2 landmarks to go',
        '2 of 9 booths stamped',
        'Sent on a sunny day',
      ],
      marks: [],
      scene: 'day',
      filename: 'tessl-carnival-postcard-day.png',
    });
  });

  it('shows the souvenir title once every landmark is found', () => {
    const content = postcardContent({ ...visit, landmarksFound: 3, scene: 'evening' });
    expect(content.lines).toContain('Title earned: Midway Explorer');
    expect(content.lines).toContain('Sent by lantern light');
    expect(content.filename).toBe('tessl-carnival-postcard-evening.png');
  });

  it('uses the singular for one', () => {
    const content = postcardContent({
      ...visit,
      landmarksFound: 0,
      landmarksTotal: 1,
      stampsPlayed: 1,
      stampsTotal: 1,
    });
    expect(content.lines.slice(0, 3)).toEqual([
      '0 of 1 landmark found',
      'Midway Explorer: 1 landmark to go',
      '1 of 1 booth stamped',
    ]);
  });

  it('greets the visitor by their cleaned name', () => {
    expect(postcardContent({ ...visit, name: '  Sam\u0007 ' }).greeting).toBe('Sam was here!');
  });

  it('is the same for the same visit', () => {
    expect(postcardContent(visit)).toEqual(postcardContent({ ...visit }));
  });
});

describe('postcardColors', () => {
  it('differs between day and evening', () => {
    expect(postcardColors('day')).not.toEqual(postcardColors('evening'));
  });
});

describe('drawPostcard', () => {
  it('draws every line of the card as text', () => {
    const texts: string[] = [];
    const transforms: number[][] = [];
    const ctx = {
      createLinearGradient: () => ({ addColorStop: () => {} }) as unknown as CanvasGradient,
      fillRect: () => {},
      strokeRect: () => {},
      fillText: (text: string) => void texts.push(text),
      setTransform: (...args: number[]) => void transforms.push(args),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: 'start',
      textBaseline: 'alphabetic',
      beginPath: () => {},
      arc: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      fill: () => {},
      stroke: () => {},
    } as unknown as Parameters<typeof drawPostcard>[0];
    const content = postcardContent({ ...visit, name: 'Ada' });
    drawPostcard(ctx, content);
    expect(texts).toEqual(
      expect.arrayContaining([content.heading, content.greeting, ...content.lines]),
    );
    expect(transforms[0]).toEqual([POSTCARD_SCALE, 0, 0, POSTCARD_SCALE, 0, 0]);
  });
});

function fakeExport() {
  const pending: ((blob: string | null) => void)[] = [];
  let urls = 0;
  const io = {
    encode: vi.fn((done: (blob: string | null) => void) => {
      pending.push(done);
    }),
    createUrl: vi.fn(() => `blob:${++urls}`),
    revokeUrl: vi.fn(),
    download: vi.fn(),
    report: vi.fn(),
  };
  return { io, pending, exporter: postcardExporter(io) };
}

describe('postcardExporter', () => {
  it('downloads under the file name asked for and says the download started', () => {
    const { io, pending, exporter } = fakeExport();
    exporter.export('day.png');
    expect(io.report).toHaveBeenLastCalledWith(POSTCARD_MESSAGES.making);
    pending[0]('png');
    expect(io.download).toHaveBeenCalledWith('blob:1', 'day.png');
    expect(io.report).toHaveBeenLastCalledWith(POSTCARD_MESSAGES.started('day.png'));
  });

  it('does nothing when the encoding finishes after dispose', () => {
    const { io, pending, exporter } = fakeExport();
    exporter.export('day.png');
    io.report.mockClear();
    exporter.dispose();
    pending[0]('png');
    expect(io.createUrl).not.toHaveBeenCalled();
    expect(io.download).not.toHaveBeenCalled();
    expect(io.report).not.toHaveBeenCalled();
  });

  it('ignores an older encoding once a newer export started', () => {
    const { io, pending, exporter } = fakeExport();
    exporter.export('day.png');
    exporter.export('evening.png');
    pending[0]('old');
    expect(io.createUrl).not.toHaveBeenCalled();
    pending[1]('new');
    expect(io.download).toHaveBeenCalledTimes(1);
    expect(io.download).toHaveBeenCalledWith('blob:1', 'evening.png');
  });

  it('revokes the previous URL on the next download and on dispose', () => {
    const { io, pending, exporter } = fakeExport();
    exporter.export('a.png');
    pending[0]('a');
    exporter.export('b.png');
    pending[1]('b');
    expect(io.revokeUrl).toHaveBeenCalledWith('blob:1');
    exporter.dispose();
    expect(io.revokeUrl).toHaveBeenLastCalledWith('blob:2');
    exporter.export('c.png');
    expect(io.encode).toHaveBeenCalledTimes(2);
  });

  it('reports a failure when the picture cannot be made', () => {
    const { io, pending, exporter } = fakeExport();
    exporter.export('day.png');
    pending[0](null);
    expect(io.report).toHaveBeenLastCalledWith(POSTCARD_MESSAGES.failed);
    io.encode.mockImplementationOnce(() => {
      throw new Error('tainted');
    });
    exporter.export('day.png');
    expect(io.report).toHaveBeenLastCalledWith(POSTCARD_MESSAGES.failed);
    expect(io.download).not.toHaveBeenCalled();
  });
});

const nine = Array.from({ length: 9 }, (_, i) => ({ name: `Booth ${i + 1}`, earned: false }));
const three = ['Carousel', 'Ferris Wheel', 'Fountain'].map((name) => ({ name, earned: false }));

describe('postcard marks', () => {
  it('lists nine stamps then three emblems, earned only where earned', () => {
    const stamps = nine.map((s, i) => ({ ...s, earned: i < 2 }));
    const emblems = three.map((e, i) => ({ ...e, earned: i === 1 }));
    const { marks } = postcardContent({ ...visit, stamps, emblems });
    expect(marks.map((m) => m.kind)).toEqual([
      ...Array(9).fill('stamp'),
      ...Array(3).fill('emblem'),
    ]);
    expect(marks.filter((m) => m.earned).map((m) => m.name)).toEqual([
      'Booth 1',
      'Booth 2',
      'Ferris Wheel',
    ]);
    expect(marks[2].label).toBe('Booth 3 booth: not stamped yet');
    expect(marks[10].label).toBe('Ferris Wheel landmark: found');
  });

  it('shows no earned marks at zero progress and all at full progress', () => {
    expect(
      postcardContent({ ...visit, stamps: nine, emblems: three }).marks.some((m) => m.earned),
    ).toBe(false);
    const full = postcardContent({
      ...visit,
      stamps: nine.map((s) => ({ ...s, earned: true })),
      emblems: three.map((e) => ({ ...e, earned: true })),
    });
    expect(full.marks.every((m) => m.earned)).toBe(true);
  });

  it('lays twelve marks out evenly and centred inside the card', () => {
    const spots = postcardMarkLayout(12, 300, 280);
    expect(spots[0].x + spots[11].x).toBe(600);
    expect(spots[0].x).toBeGreaterThan(40 + 24);
    expect(spots[11].x).toBeLessThan(560 - 24);
  });

  it('draws every stamp as a circle, and fills only the earned ones', () => {
    const arcs: number[][] = [];
    let fills = 0;
    const noop = () => {};
    const ctx = {
      createLinearGradient: () => ({ addColorStop: noop }) as unknown as CanvasGradient,
      fillRect: noop,
      strokeRect: noop,
      fillText: noop,
      setTransform: noop,
      beginPath: noop,
      arc: (...args: number[]) => void arcs.push(args),
      moveTo: noop,
      lineTo: noop,
      closePath: noop,
      fill: () => void fills++,
      stroke: noop,
    } as unknown as Parameters<typeof drawPostcard>[0];
    const draw = (earned: number) => {
      arcs.length = 0;
      fills = 0;
      const stamps = nine.map((s, i) => ({ ...s, earned: i < earned }));
      drawPostcard(ctx, postcardContent({ ...visit, stamps, emblems: three }));
      return { arcs: arcs.length, fills };
    };
    // Each earned mark fills its shape and its star.
    expect(draw(0)).toEqual({ arcs: 9, fills: 0 });
    expect(draw(3)).toEqual({ arcs: 9, fills: 6 });
  });
});
