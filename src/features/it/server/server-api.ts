import { callItMethod as callMethod } from '@/core/it-source/it-client';

const LEGACY = 'upande_core.api.it_dashboard';

export type Health = {
  scheduler_status?: string | null;
  background_workers?: number | null;
  queues?: { queue: string; pending: number | null }[];
  failing_jobs?: number | null;
  failing_jobs_list?: { job?: string; details?: string }[];
  total_errors?: number | null;
  top_errors?: { title: string; occurrences: number | null }[];
  pending_emails?: number | null;
  failed_emails?: number | null;
  active_sessions?: number | null;
  failed_logins?: number | null;
  total_users?: number | null;
  new_users?: number | null;
  db_storage_mb?: number | null;
  cache_memory?: string | null;
  public_files_mb?: number | null;
  private_files_mb?: number | null;
  onsite_backups?: number | null;
  backups_size_mb?: number | null;
  database_version?: string | null;
  socketio?: string | null;
  error?: string;
};

export type ErrorRow = { name: string; creation: string; method: string; owner: string; error: string };
export type ErrorLogs = { success: boolean; error?: string; days?: number; rows?: ErrorRow[]; total?: number; owners?: { owner: string; n: number }[] };

/** getSystemHealth answers `{error}` when the report cannot be built, so callers check for it. */
export const fetchHealth = () => callMethod<Health>(`${LEGACY}.getSystemHealth`, {}, true);

/** it_error_logs answers HTTP 200 with `{success:false}` when the caller may not read the log. */
export const fetchErrorLogs = (days: number) => callMethod<ErrorLogs>(`${LEGACY}.it_error_logs`, { days }, true);
