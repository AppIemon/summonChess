
export enum Tier {
  Beginner = 'Beginner',
  Bronze = 'Bronze',
  Silver = 'Silver',
  Gold = 'Gold',
  Platinum = 'Platinum',
  Diamond = 'Diamond',
  Master = 'Master',
  Grandmaster = 'Grandmaster',
  Challenger = 'Challenger',
}

export const TIER_THRESHOLDS = [
  { tier: Tier.Beginner, min: 0 },
  { tier: Tier.Bronze, min: 800 },
  { tier: Tier.Silver, min: 1000 },
  { tier: Tier.Gold, min: 1200 },
  { tier: Tier.Platinum, min: 1400 },
  { tier: Tier.Diamond, min: 1600 },
  { tier: Tier.Master, min: 1800 },
  { tier: Tier.Grandmaster, min: 2000 },
  { tier: Tier.Challenger, min: 2200 },
];

export function getTier(elo: number): Tier {
  for (let i = TIER_THRESHOLDS.length - 1; i >= 0; i--) {
    if (elo >= TIER_THRESHOLDS[i].min) {
      return TIER_THRESHOLDS[i].tier;
    }
  }
  return Tier.Beginner;
}

// K-factor initially 64, reduces by sqrt(2) every X games until 8.
// Reducing 6 times: 64 -> 45.2 -> 32 -> 22.6 -> 16 -> 11.3 -> 8.
// Let's assume this reduction happens over the first 30 games (every 5 games).
export function getKFactor(gamesPlayed: number): number {
  if (gamesPlayed >= 30) return 8;

  const steps = Math.floor(gamesPlayed / 5);
  // 64 / (sqrt(2) ^ steps)
  // sqrt(2) ^ 2 = 2. So every 2 steps (10 games), it halves.

  const decay = Math.pow(Math.sqrt(2), steps);
  return Math.max(8, 64 / decay);
}

// Expected score: 1 / (1 + 10 ^ ((opponent - player) / 400))
export function getExpectedScore(playerElo: number, opponentElo: number): number {
  return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
}

export function calculateNewElo(
  currentElo: number,
  opponentElo: number,
  result: 0 | 0.5 | 1, // 0: Loss, 0.5: Draw, 1: Win
  gamesPlayed: number
): number {
  const k = getKFactor(gamesPlayed);
  const expected = getExpectedScore(currentElo, opponentElo);
  const change = k * (result - expected);
  return Math.round(currentElo + change);
}
