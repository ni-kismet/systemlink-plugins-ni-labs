import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../app/public/time-range-control.js', import.meta.url), 'utf8');
const context = vm.createContext({});
vm.runInContext(source, context);
const { relativeRange } = context.TimeRangeControl;

test('future presets start now and end after the requested amount', () => {
    const now = new Date(2026, 0, 15, 10, 30);
    const day = relativeRange('+1d', now);
    const week = relativeRange('+7d', now);
    assert.equal(day.start.getTime(), now.getTime());
    assert.equal(day.end.getTime(), now.getTime() + 864e5);
    assert.equal(week.end.getTime(), now.getTime() + 7 * 864e5);
});

test('month presets use calendar months and clamp to the last day', () => {
    const next = relativeRange('+1M', new Date(2026, 0, 31, 9, 0));
    assert.equal(next.end.getMonth(), 1);
    assert.equal(next.end.getDate(), 28);
    assert.equal(next.end.getHours(), 9);
});

test('past presets keep ending now', () => {
    const now = new Date(2026, 0, 15);
    const range = relativeRange('30d', now);
    assert.equal(range.end.getTime(), now.getTime());
    assert.equal(range.start.getTime(), now.getTime() - 30 * 864e5);
    assert.equal(relativeRange('all', now), null);
});
