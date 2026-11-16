import { useEffect, useState } from 'react';
import { call } from '@/core/api/call';
import { storage } from '@/core/storage';

export type Project = { name: string; project_name: string };

export type CaptureOptions = {
  requestTypes: string[];
  tags: string[];
  priorities: string[];
  /** Priority is a triage field: only Dev Team and Projects Manager may set it on a request. */
  canTriage: boolean;
  projects: Project[];
};

const FALLBACK: CaptureOptions = {
  requestTypes: ['Bug', 'Feature', 'Question', 'Note', 'Chore'],
  tags: [],
  priorities: [],
  canTriage: false,
  projects: [],
};

let cached: CaptureOptions | null = null;

type FormOptions = {
  request_types?: string[];
  tags?: string[];
  priorities?: string[];
  triage_fields?: boolean;
};

async function fetchOptions(): Promise<CaptureOptions> {
  const [form, projects, tags] = await Promise.all([
    call<FormOptions>('v2.requests.get_form_options', {}, true).catch(() => null),
    // Board roles only: anyone else gets a refusal and simply has no project picker.
    call<Project[]>('board.get_projects', {}, true).catch(() => [] as Project[]),
    call<string[]>('board.get_work_tags', {}, true).catch(() => [] as string[]),
  ]);
  return {
    requestTypes: form?.request_types?.length ? form.request_types : FALLBACK.requestTypes,
    tags: form?.tags?.length ? form.tags : tags,
    priorities: form?.priorities ?? [],
    canTriage: !!form?.triage_fields,
    projects: Array.isArray(projects) ? projects : [],
  };
}

/** Loads (and caches for the session) what the pickers offer. Refreshes in the background each time the sheet opens. */
export function useCaptureOptions(open: boolean): CaptureOptions {
  const [opts, setOpts] = useState<CaptureOptions>(cached ?? FALLBACK);
  useEffect(() => {
    if (!open) return;
    let live = true;
    fetchOptions()
      .then((o) => {
        cached = o;
        if (live) setOpts(o);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [open]);
  return opts;
}

export type Mode = 'task' | 'request';
export type Due = 'today' | 'tomorrow' | 'week' | 'none';

export type Prefs = { mode: Mode; due: Due; project?: string; tag?: string; requestType?: string };
export type Draft = { mode: Mode; title: string; description: string };

// Keyed by account so a draft or default never leaks to the next person on this phone.
const prefsKey = (who: string) => `capture_prefs:${who}`;
const draftKey = (who: string) => `capture_draft:${who}`;

async function read<T>(key: string): Promise<T | null> {
  try {
    const raw = await storage.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export const loadPrefs = (who: string) => read<Prefs>(prefsKey(who));
export const loadDraft = (who: string) => read<Draft>(draftKey(who));
export const savePrefs = (who: string, p: Prefs) => storage.set(prefsKey(who), JSON.stringify(p)).catch(() => {});
export const saveDraft = (who: string, d: Draft | null) =>
  (d ? storage.set(draftKey(who), JSON.stringify(d)) : storage.remove(draftKey(who))).catch(() => {});

/** Very rough title similarity (shared words) for the non-blocking duplicate hint. */
export function similar(a: string, b: string): boolean {
  const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
  const x = words(a);
  const y = words(b);
  if (x.size < 2 || y.size < 2) return a.trim().toLowerCase() === b.trim().toLowerCase();
  let shared = 0;
  x.forEach((w) => y.has(w) && (shared += 1));
  return shared / Math.min(x.size, y.size) >= 0.8;
}
