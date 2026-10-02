/**
 * Runtime config. Override at build time with VITE_* env vars, or at runtime by
 * defining `window.FRONTS_CONFIG = {...}` before the app script runs.
 */
export interface FrontsConfig {
  /** Optional backend (Cloudflare Worker). Empty = pure static mode. */
  apiUrl: string;
  /** Canonical public URL used in share/duel links. Empty = current page URL. */
  publicUrl: string;
  features: {
    warRoom: boolean;
    ads: boolean;
  };
}

declare global {
  interface Window {
    FRONTS_CONFIG?: Partial<FrontsConfig>;
  }
}

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
const runtime = (typeof window !== 'undefined' && window.FRONTS_CONFIG) || {};

export const CONFIG: FrontsConfig = {
  apiUrl: runtime.apiUrl ?? env.VITE_API_URL ?? '',
  publicUrl: runtime.publicUrl ?? env.VITE_PUBLIC_URL ?? '',
  features: {
    warRoom: runtime.features?.warRoom ?? env.VITE_FEATURE_WAR_ROOM !== '0',
    ads: runtime.features?.ads ?? env.VITE_FEATURE_ADS !== '0',
  },
};

export function baseUrl(): string {
  if (CONFIG.publicUrl) return CONFIG.publicUrl.replace(/#.*$/, '');
  if (typeof location === 'undefined') return 'https://tstockham96.github.io/fronts/';
  return location.href.replace(/[?#].*$/, '');
}
