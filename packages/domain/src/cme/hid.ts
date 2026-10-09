import type { ScanConfig } from './dto';

/**
 * Keyboard-wedge (HID) readers "type" the code into the focused field much faster than a person
 * and usually end with Enter or Tab. Given the time of each keystroke, this tells a reader burst
 * from human typing. It only labels the input method recorded with the reading: the server applies
 * the same rules either way, and stations decide which methods are accepted.
 */
export function classifyKeystrokes(times: number[], config: Pick<ScanConfig, 'maxKeyIntervalMs' | 'minLength'>): 'leitor' | 'manual' {
  if (times.length < config.minLength) return 'manual';
  const gaps = times.slice(1).map((t, i) => t - times[i]!);
  // Tolerate one slow gap (the first key after focus, or a scheduler hiccup).
  const slow = gaps.filter((g) => g > config.maxKeyIntervalMs).length;
  return slow <= 1 ? 'leitor' : 'manual';
}
