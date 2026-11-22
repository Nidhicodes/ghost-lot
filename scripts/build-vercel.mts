/**
 * Produce a Vercel Build Output API (v3) directory at .vercel/output, ready for
 * `vercel deploy --prebuilt`. https://vercel.com/docs/build-output-api
 *
 * - static/: the Vite build (run `vite build` first; `npm run build:vercel` does both)
 * - functions/api/<name>.func/: each handler bundled by esbuild into one ESM file, so Node never
 *   resolves our extensionless TypeScript imports or JSON imports at runtime
 * - the sheet index is copied into the functions that read it
 */
import { build } from 'esbuild'
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = '.vercel/output'
const FUNCTIONS: { name: string; needsIndex: boolean; maxDuration: number; streaming?: boolean }[] = [
  { name: 'geocode', needsIndex: false, maxDuration: 15 },
  { name: 'sheets', needsIndex: true, maxDuration: 30 },
  { name: 'read', needsIndex: true, maxDuration: 60, streaming: true },
  { name: 'health', needsIndex: false, maxDuration: 5 },
]

if (!existsSync('dist/index.html')) throw new Error('Run `vite build` first (dist/ is missing)')
if (!existsSync('index/states.json')) throw new Error('Run `npm run build-index` first (index/ is missing)')

rmSync(OUT, { recursive: true, force: true })
mkdirSync(join(OUT, 'functions/api'), { recursive: true })
cpSync('dist', join(OUT, 'static'), { recursive: true })

for (const fn of FUNCTIONS) {
  const dir = join(OUT, 'functions/api', `${fn.name}.func`)
  mkdirSync(dir, { recursive: true })
  await build({
    entryPoints: [`src/api/${fn.name}.ts`],
    outfile: join(dir, 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    // some bundled CommonJS deps call require(); give ESM output a working one
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
    logLevel: 'warning',
  })
  if (fn.needsIndex) cpSync('index', join(dir, 'index'), { recursive: true })
  writeFileSync(
    join(dir, '.vc-config.json'),
    JSON.stringify({
      runtime: 'nodejs22.x',
      handler: 'index.mjs',
      launcherType: 'Nodejs',
      shouldAddHelpers: true,
      maxDuration: fn.maxDuration,
      ...(fn.streaming ? { supportsResponseStreaming: true } : {}),
    }, null, 1),
  )
}

writeFileSync(
  join(OUT, 'config.json'),
  JSON.stringify({
    version: 3,
    routes: [
      { src: '/(.*)', headers: { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY' }, continue: true },
      { handle: 'filesystem' },
    ],
  }, null, 1),
)
console.log(`Wrote ${OUT}: static + ${FUNCTIONS.map((f) => `api/${f.name}`).join(', ')}`)
