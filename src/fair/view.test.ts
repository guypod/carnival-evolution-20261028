import { describe, expect, it } from 'vitest';
import { bindActions, type ActionBar } from './view';

type Listener = (event: Event) => void;

function fakeBar() {
  const listeners = new Set<Listener>();
  const bar: ActionBar = {
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  };
  const click = (act: string | undefined) => {
    const button = { dataset: act ? { act } : {} };
    const target = { closest: () => (act ? button : null) };
    listeners.forEach((l) => l({ target } as unknown as Event));
  };
  return { bar, listeners, click };
}

describe('toolbar wiring', () => {
  it('sends clicks from every action bar to the dispatcher', () => {
    const builder = fakeBar();
    const visitors = fakeBar();
    const acts: string[] = [];
    bindActions([builder.bar, visitors.bar], (name) => acts.push(name));
    builder.click('undo');
    visitors.click('pause');
    visitors.click('next-group');
    visitors.click('reset-visitors');
    visitors.click(undefined);
    expect(acts).toEqual(['undo', 'pause', 'next-group', 'reset-visitors']);
  });

  it('removes every listener it added', () => {
    const builder = fakeBar();
    const visitors = fakeBar();
    const stop = bindActions([builder.bar, visitors.bar], () => {});
    stop();
    expect(builder.listeners.size + visitors.listeners.size).toBe(0);
  });
});
