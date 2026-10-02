import { defineConfig, loadEnv } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build`               -> dist/ (normal static site, hashed assets)
// `vite build --mode single` -> dist-single/fronts.html (everything inlined, opens from disk)
//
// The production build reads `.env.production` (VITE_BASE=/fronts/ and
// VITE_PUBLIC_URL=https://tstockham96.github.io/fronts/ for GitHub Pages). Override
// either with real env vars, e.g. `VITE_BASE=/ VITE_PUBLIC_URL=https://your.domain/ npm run build`.
// The single-file build always uses a relative base so it keeps working from disk.
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
  return {
    base: single ? './' : env.VITE_BASE || './',
    plugins: [
      preact(),
      single && viteSingleFile({ removeViteModuleLoader: true }),
      single && {
        name: 'rename-to-fronts-html',
        enforce: 'post' as const,
        generateBundle(_: unknown, bundle: Record<string, { fileName: string }>) {
          const html = bundle['index.html'];
          if (html) html.fileName = 'fronts.html';
        },
      },
    ].filter(Boolean),
    build: {
      outDir: single ? 'dist-single' : 'dist',
      emptyOutDir: true,
      target: 'es2020',
      ...(single ? { assetsInlineLimit: 100_000_000, cssCodeSplit: false } : {}),
    },
    test: {
      include: ['tests/**/*.test.ts'],
    },
  };
});
