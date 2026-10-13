// The parts of the digi-me hooks that need no engine: which bundle a session gets, the
// system prompt section, the cache files of one audience, and the interview's coverage.

const literal = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function globSource(glob) {
  let out = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        out += '.*'
        i++
      } else out += '[^/]*'
    } else if (c === '?') out += '[^/]'
    else if (c === '[' && glob.indexOf(']', i + 2) !== -1) {
      const end = glob.indexOf(']', i + 2)
      const text = glob.slice(i + 1, end)
      const set = text[0] === '!' ? text.slice(1) : text
      if (set === '' || set[0] === ']' || set.includes('[')) throw new Error(`odd bracket in glob: [${text}]`)
      out += `(?:[${text[0] === '!' ? '^' : ''}${set.replace(/\\/g, '\\\\')}]|\\[${literal(text)}\\])`
      i = end
    } else out += literal(c)
  }
  return out
}

// A session whose folder lies inside one of the work paths gets the work-agents bundle.
// workPaths: '' | string | string[] | undefined; the plugin dialog stores several folders comma-joined.
// A path is a glob (`*` one folder name, `**` any depth, `?` one character, `[…]`/`[!…]` one of a
// set) that matches the folder or one of its parents. Case is ignored: macOS file systems ignore
// it, and too wide a match only fails to work-agents; so does a pattern that does not compile or has an
// odd bracket (empty, starting with `]`, or holding another `[`). A `[..]` also matches its literal text.
export function chooseAudience(cwd, workPaths, home) {
  const paths = [workPaths ?? []].flat().flatMap((w) => String(w).split(',')).map((w) => w.trim()).filter(Boolean)
  const slashes = (p) => p.replace(/\/{2,}/g, '/').replace(/\/+$/, '')
  const h = String(home ?? '').replace(/\/+$/, '')
  const dir = slashes(String(cwd)) + '/'
  const matches = (p) => {
    const glob = slashes(p.replace(/^(~|\$HOME)(?=\/|$)/, h))
    try {
      return new RegExp(`^${globSource(glob)}(?:/|$)`, 'i').test(dir)
    } catch {
      return true
    }
  }
  return paths.some(matches) ? 'work-agents' : 'my-agents'
}

export function coreSection({ audience, folder, core, domains }) {
  const lines = [
    '# digi-me',
    `The facts below describe the person you work for (digi-me audience: ${audience}). Use them to match their language, tone and choices.`,
    'In text that other people read (commits, tickets, documents, posts, messages), use only facts whose `sees` includes those readers; in public text only facts whose `sees` holds `alle`.',
  ]
  if (domains.length) lines.push(`More facts, one file per domain, are in ${folder}/: ${domains.map((d) => d + '.md').join(', ')}. The digi-me skill says when to read them.`)
  return [...lines, '', core.trim()].join('\n')
}

// The files `digi-me pull` writes for one audience: core.md, <domain>.md, interview.json, meta.json.
export function bundleFrom(files) {
  const domains = {}
  for (const [name, text] of Object.entries(files)) if (name.endsWith('.md') && name !== 'core.md') domains[name.slice(0, -3)] = text
  const json = (name) => {
    try {
      return files[name] ? JSON.parse(files[name]) : null
    } catch {
      return null
    }
  }
  return { core: files['core.md'] ?? '', domains, interview: json('interview.json'), meta: json('meta.json') }
}

// The bundle's answer counts plus the answers given since it was published.
export function answerCounts(interview, recent = [], published = '') {
  const counts = { ...(interview?.counts ?? {}) }
  for (const e of recent) if (!e.skipped && (!published || e.ts > published)) counts[e.domain] = (counts[e.domain] ?? 0) + 1
  return counts
}

export function coverage(domains, counts) {
  const total = domains.reduce((sum, d) => sum + d.target, 0)
  const reached = domains.reduce((sum, d) => sum + Math.min(counts[d.id] ?? 0, d.target), 0)
  return total ? reached / total : 0
}

export function digivolved(before, after) {
  const step = Math.floor(after * 10)
  return step > Math.floor(before * 10) ? step * 10 : null
}
