import { CONFIG } from '../config';
import type { DuelPayload } from '../core/duel';

/**
 * Optional backend client. Every call resolves to null when no API is
 * configured or the network fails, so callers always have a static fallback.
 */
async function call<T>(path: string, init?: RequestInit, timeoutMs = 2500): Promise<T | null> {
  if (!CONFIG.apiUrl) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${CONFIG.apiUrl}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface PlayResponse {
  /** Real armies submitted today (yours included), revealed only after you play. */
  armies: number[][];
}

export const api = {
  enabled: () => !!CONFIG.apiUrl,
  submitPlay: (puzzle: number, army: number[], deviceId: number) =>
    call<PlayResponse>('/api/play', { method: 'POST', body: JSON.stringify({ puzzle, army, device: String(deviceId) }) }),
  pool: (puzzle: number, deviceId: number) => call<PlayResponse>(`/api/pool?puzzle=${puzzle}&device=${deviceId}`),
  createDuel: (p: DuelPayload) => call<{ id: string }>('/api/duel', { method: 'POST', body: JSON.stringify(p) }),
  /** Duel metadata only: the challenger's army stays on the server until you commit. */
  getDuel: (id: string) => call<Omit<DuelPayload, 'army'>>(`/api/duel/${encodeURIComponent(id)}`),
  fightDuel: (id: string, army: number[]) =>
    call<{ army: number[] }>(`/api/duel/${encodeURIComponent(id)}/fight`, { method: 'POST', body: JSON.stringify({ army }) }),
};
