import { call } from '@/core/api/call';

export type Badge = { key: string; label: string; description: string; earned: boolean; progress?: { current: number; target: number } };
export type Contributor = { user: string; full_name: string; points: number; closed: number };
export type Achievements = {
  points_today: number;
  points_week: number;
  points_total: number;
  streak: number;
  best_streak: number;
  closed_today: number;
  closed_week: number;
  /** ISO dates (this week) on which I closed something. */
  week_days?: string[];
  badges: Badge[];
  leaderboard: Contributor[];
};

export const STREAK_MILESTONES = [3, 5, 10];

export function fetchAchievements(): Promise<Achievements> {
  return call<Achievements>('achievements.get_achievements', {}, true);
}

/** Points per task priority, mirroring the server rules (`api/achievements.py`). */
export const PRIORITY_POINTS: [string, number][] = [['Low', 1], ['Medium', 2], ['High', 4], ['Urgent', 6]];
export const OVERDUE_BONUS = 1;

/** Level n starts at 10 * (n - 1)^2 points, so early levels come quickly and later ones take longer. */
export function levelOf(total: number): { level: number; from: number; to: number } {
  const level = Math.floor(Math.sqrt(Math.max(0, total) / 10)) + 1;
  return { level, from: 10 * (level - 1) ** 2, to: 10 * level ** 2 };
}
