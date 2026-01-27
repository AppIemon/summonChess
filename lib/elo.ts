export const K_FACTOR = 8;

export function calculateElo(
  ratingA: number,
  ratingB: number,
  actualScoreA: number // 1 for win, 0 for loss, 0.5 for draw
): { newRatingA: number; newRatingB: number } {
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const expectedB = 1 / (1 + Math.pow(10, (ratingA - ratingB) / 400));

  const newRatingA = Math.round(ratingA + K_FACTOR * (actualScoreA - expectedA));
  const actualScoreB = 1 - actualScoreA;
  const newRatingB = Math.round(ratingB + K_FACTOR * (actualScoreB - expectedB));

  return { newRatingA, newRatingB };
}
