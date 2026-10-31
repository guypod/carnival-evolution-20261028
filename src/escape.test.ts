import { describe, expect, it } from 'vitest';
import { onEscapeKey } from './escape';

function press(target: EventTarget, key: string) {
  target.dispatchEvent(Object.assign(new Event('keydown'), { key }));
}

describe('onEscapeKey', () => {
  it('calls back on Escape and ignores other keys', () => {
    const target = new EventTarget();
    let calls = 0;
    onEscapeKey(target, () => calls++);
    press(target, 'a');
    press(target, 'Enter');
    expect(calls).toBe(0);
    press(target, 'Escape');
    expect(calls).toBe(1);
  });

  it('stops listening once cleaned up', () => {
    const target = new EventTarget();
    let calls = 0;
    const stop = onEscapeKey(target, () => calls++);
    stop();
    press(target, 'Escape');
    expect(calls).toBe(0);
  });

  it('does not pile up listeners over repeated enter and leave cycles', () => {
    const target = new EventTarget();
    let calls = 0;
    for (let i = 0; i < 5; i++) onEscapeKey(target, () => calls++)();
    const stop = onEscapeKey(target, () => calls++);
    press(target, 'Escape');
    expect(calls).toBe(1);
    stop();
  });
});
