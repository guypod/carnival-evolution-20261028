import { describe, expect, it, vi } from 'vitest';
import {
  POSTCARD_MESSAGES,
  POSTCARD_NAME_INPUT_MAX,
  POSTCARD_NAME_MAX,
  POSTCARD_SCALE,
  cleanVisitorName,
  drawPostcard,
  limitNameInput,
  postcardColors,
  postcardContent,
  postcardExporter,
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

  it('has a name field long enough for the limit in emoji', () => {
    const name = '🎡'.repeat(POSTCARD_NAME_MAX);
    expect(name.length).toBeLessThanOrEqual(POSTCARD_NAME_INPUT_MAX);
    expect(cleanVisitorName(name)).toBe(name);
  });

  it('cuts the name field to what the card shows', () => {
    const ascii = 'a'.repeat(30);
    expect(limitNameInput(ascii)).toBe('a'.repeat(POSTCARD_NAME_MAX));
    expect(cleanVisitorName(limitNameInput(ascii))).toBe(limitNameInput(ascii));
    const emoji = '🎡'.repeat(POSTCARD_NAME_MAX);
    expect(limitNameInput(emoji)).toBe(emoji);
    expect(limitNameInput(emoji + '🎡')).toBe(emoji);
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
