import { create } from 'zustand';

export type NetworkRecord = {
  status: 'success' | 'error';
  method?: string;
  url?: string;
  httpStatus?: number;
  durationMs?: number;
  payload?: unknown;
  response?: unknown;
  at: number;
};

const MAX = 100;

type DebugLogState = { network: NetworkRecord[] };

export const useDebugLog = create<DebugLogState>(() => ({ network: [] }));

/** Keeps the last MAX API calls in memory for the in-app diagnostics view. */
export function recordNetwork(entry: Omit<NetworkRecord, 'at'>): void {
  useDebugLog.setState((s) => ({ network: [{ ...entry, at: Date.now() }, ...s.network].slice(0, MAX) }));
}
