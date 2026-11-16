import { useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import { useToast } from '@/core/ui/Toast';
import { useMyDay } from '@/features/my-day/my-day-store';
import { useAchievements } from '@/features/gamification/achievements-store';
import { STREAK_MILESTONES } from '@/features/gamification/achievements-api';
import { NEXT_STAGE, type Stage } from '@/features/shared/types';

/**
 * The one way a task changes stage, so My Day, the backlog and task detail all behave and feel the same:
 * optimistic update, haptic, an Undo toast, and points/streak feedback when a task is closed.
 */
export function useTaskActions() {
  const toast = useToast();

  const setStage = useCallback(
    async (name: string, from: Stage, to: Stage): Promise<boolean> => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const ok = await useMyDay.getState().moveTask(name, to);
      if (!ok) {
        toast.showError('Could not update the task. Check your connection and try again.');
        return false;
      }
      const undo = {
        label: 'Undo',
        onPress: async () => {
          const back = await useMyDay.getState().moveTask(name, from);
          if (!back) toast.showError('Could not undo');
          useMyDay.getState().load();
        },
      };
      if (to !== 'Done') {
        toast.showInfo(`Moved to ${to}`, { action: undo });
        return true;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // Show the reward at once; points arrive a moment later, so the toast is never held up by a network call.
      toast.showSuccess('Task closed', { action: undo });
      const before = useAchievements.getState().data;
      useAchievements
        .getState()
        .load()
        .then((after) => {
          if (!after) return;
          const gained = before ? after.points_total - before.points_total : 0;
          if (gained > 0) toast.showInfo(`Task closed +${gained} pts`, { action: undo });
          if (after.streak > (before?.streak ?? 0) && STREAK_MILESTONES.includes(after.streak)) {
            toast.showInfo(`${after.streak} day streak. Keep it going!`);
          }
        })
        .catch(() => {});
      return true;
    },
    [toast],
  );

  /** Moves a task one step forward (Todo -> In Progress -> In Review -> Done). */
  const advance = useCallback(
    async (name: string, current: Stage): Promise<boolean> => {
      const next = NEXT_STAGE[current];
      return next ? setStage(name, current, next) : false;
    },
    [setStage],
  );

  return { setStage, advance };
}
