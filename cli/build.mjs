import { build } from 'esbuild'

await build({
  entryPoints: ['cli/src/bin.mjs'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: 'cli/dist/digi-me.mjs',
  banner: { js: "#!/usr/bin/env node\nimport { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
})
