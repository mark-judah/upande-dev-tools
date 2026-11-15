import { call } from '@/core/api/call';

export type Badge = { key: string; label: string; description: string; earned: boolean };
export type Contributor = { user: string; full_name: string; points: number; closed: number };
export type Achievements = {
  points_today: number;
  points_week: number;
  points_total: number;
  streak: number;
  best_streak: number;
  closed_today: number;
  closed_week: number;
  badges: Badge[];
  leaderboard: Contributor[];
};

export const STREAK_MILESTONES = [3, 5, 10];

export function fetchAchievements(): Promise<Achievements> {
  return call<Achievements>('achievements.get_achievements', {}, true);
}
