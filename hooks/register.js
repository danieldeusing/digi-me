// digi-me in Claude Code: the owner's core facts in every session's system prompt, the
// local bundles kept fresh with `digi-me pull`, and the interview deck lent to a host mod.
//
// Where things live:
//   <home>/.digi-me/bundles/<audience>/  the files `digi-me pull` writes (home: DIGI_ME_HOME or HOME)
//   $.store 'coverage'                   the interview coverage last seen, for the digivolve toast

import { createInterview } from './lib/interview.js'
import { chooseAudience, coreSection, bundleFrom, coverage, digivolved } from './lib/session.js'

const PULL_TIMEOUT_MS = 45_000
const AUDIENCES = ['my-agents', 'work-agents']

let options = {}
let root = ''
let home = ''
// The audience last computed (session.start, then every prompt); work-agents until the first.
let audience = 'work-agents'
let bundles = {}

const folderOf = (a) => `${home}/.digi-me/bundles/${a}`

export function register(on, opts) {
  options = opts ?? {}
  const personal = () => audience === 'my-agents'
  const interview = createInterview({ data: () => (personal() ? bundles['my-agents'] ?? null : null), options: () => options, root: () => root, personal })

  on('engine.create', async ($, e, next) => ({ ...(await next(e)), digiMe: interview }))

  on('session.start', async ($, e, next) => {
    root = $.plugin.root
    home = (await $.env.get('DIGI_ME_HOME')) || (await $.env.get('HOME')) || ''
    await chooseNow($)
    await load($)
    // Not awaited: the relay may be slow or offline; the cached bundles serve meanwhile.
    void refresh($)
    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    const a = await chooseNow($)
    const b = bundles[a]
    if (!b?.core.trim()) return result
    const text = coreSection({ audience: a, folder: folderOf(a), core: b.core, domains: Object.keys(b.domains) })
    return { ...result, sections: [...result.sections, { id: 'digi-me:core', text, scope: 'session' }] }
  })
}

// Work-agents when the session's folder or its project root lies in a work folder (fails closed).
async function chooseNow($) {
  const dirs = [await $.session.cwd(), await $.session.root()]
  audience = dirs.some((d) => chooseAudience(d, options.workPaths, home) === 'work-agents') ? 'work-agents' : 'my-agents'
  return audience
}

async function load($) {
  const next = {}
  for (const a of AUDIENCES) {
    let listing
    try {
      listing = await $.fs.list(folderOf(a))
    } catch {
      continue // this device is not a member of that audience, or nothing was pulled yet
    }
    const files = {}
    for (const f of listing) {
      if (f.kind !== 'file' || !/\.(md|json)$/.test(f.name)) continue
      try {
        files[f.name] = await $.fs.read(`${folderOf(a)}/${f.name}`)
      } catch (err) {
        $.ui.log(`digi-me: ${a}/${f.name} not readable (${err?.message ?? err})`)
      }
    }
    next[a] = bundleFrom(files)
  }
  bundles = next
}

async function refresh($) {
  try {
    const r = await $.process.run(['node', `${root}/cli/dist/digi-me.mjs`, 'pull'], { timeoutMs: PULL_TIMEOUT_MS })
    if (r.exitCode !== 0) {
      // A device that never joined has no config: digi-me is simply not set up here.
      if (!/no config/.test(r.stderr)) $.ui.toast(`digi-me: pull failed (${r.stderr.trim().split('\n').pop()})`)
      return
    }
    for (const line of r.stdout.split('\n')) if (/cannot decrypt|invalid bundle/.test(line)) $.ui.toast(`digi-me: ${line.trim()}`)
  } catch (err) {
    $.ui.toast(`digi-me: pull failed (${err?.message ?? err})`)
    return
  }
  await load($)
  const iv = bundles['my-agents']?.interview
  const now = Array.isArray(iv?.domains) ? coverage(iv.domains, iv.counts ?? {}) : 0
  const before = (await $.store.get('coverage')) ?? now
  await $.store.set('coverage', now)
  const step = digivolved(before, now)
  if (step) $.ui.toast(`🪞 digi-me digivolved: ${step} % coverage`)
}
