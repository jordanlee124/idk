export const fmt = (n: number): string => Math.round(n).toLocaleString('en-US');
export const stageLabel = { band: 'Band', tribe: 'Tribe', village: 'Village' } as const;
export function foodWord(ratio: number): { word: string; level: 'good' | 'ok' | 'bad' } {
  if (ratio >= 1.15) return { word: 'Plenty', level: 'good' };
  if (ratio >= 1.0) return { word: 'Fed', level: 'ok' };
  if (ratio >= 0.85) return { word: 'Lean', level: 'ok' };
  return { word: 'Starving', level: 'bad' };
}
