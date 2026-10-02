import { CONFIG } from '../config';

export type EventName =
  | 'play_started'
  | 'deployed'
  | 'shared'
  | 'duel_created'
  | 'duel_opened'
  | 'duel_completed'
  | 'practice_started'
  | 'warroom_opened'
  | 'warroom_cta';

declare global {
  interface Window {
    __frontsEvents?: { name: EventName; props: Record<string, unknown>; ts: number }[];
    dataLayer?: unknown[];
  }
}

/**
 * Analytics stub. Swap the body for Plausible/PostHog/GA. Events are kept in
 * window.__frontsEvents (handy for tests), pushed to dataLayer if present, and
 * beaconed to the optional backend.
 */
export function track(name: EventName, props: Record<string, unknown> = {}): void {
  const evt = { name, props, ts: Date.now() };
  if (typeof window === 'undefined') return;
  (window.__frontsEvents ??= []).push(evt);
  window.dataLayer?.push({ event: `fronts_${name}`, ...props });
  if (CONFIG.apiUrl && navigator.sendBeacon) {
    try {
      navigator.sendBeacon(`${CONFIG.apiUrl}/api/event`, JSON.stringify(evt));
    } catch {
      /* ignore */
    }
  }
  console.debug('[fronts:analytics]', name, props);
}
