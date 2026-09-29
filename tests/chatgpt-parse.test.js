import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const context = vm.createContext({ module: { exports: {} } });
vm.runInContext(readFileSync(new URL('../desktop-tray/src/chatgpt-parse.js', import.meta.url), 'utf8'), context);
const { parseChatGptCards } = context.module.exports;

test('separate windows and independent resets', () => {
  const windows = parseChatGptCards([
    { text: '5 hour usage 72% remaining Resets at 2026-09-30T02:00:00Z', percentText: '72%' },
    { text: '每周使用限额 31% 剩余 重置时间：2026年10月2日 15:20', percentText: '31%' }
  ]);
  assert.equal(windows.length, 2);
  assert.equal(windows[0].remainingPercentage, 72);
  assert.equal(windows[0].resetAt, Date.parse('2026-09-30T02:00:00Z'));
  assert.equal(windows[1].remainingPercentage, 31);
  assert.ok(windows[1].resetAt);
});

test('legacy weekly card without reset and unknown format downgrade', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(parseChatGptCards([{ text: 'Weekly usage 64% remaining' }]))), [
    { label: 'Weekly usage', remainingPercentage: 64, resetAt: null, resetText: null }
  ]);
  assert.equal(parseChatGptCards([{ text: 'Weekly usage 120% remaining' }, { text: 'Credits 45%' }]).length, 0);
});
