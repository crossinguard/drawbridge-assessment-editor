/**
 * "1 outcome" / "2 outcomes".
 *
 * Small, but the app writes counts in a bundle README, an import summary and several
 * delete confirmations, and "1 collections" in any of them reads as neglected. Shared
 * so it gets fixed once rather than in whichever place someone happens to notice.
 */
export function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}
