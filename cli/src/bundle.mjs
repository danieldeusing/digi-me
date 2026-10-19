import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseFacts } from './facts.mjs'
import { NAME, parseAudiences } from './audiences.mjs'
import { select } from './rules.mjs'
import { parseDomains, parseAnswers, answerCounts, stopTopics, askedQuestions } from './coverage.mjs'

const filesIn = (dir, ext) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(ext)).sort() : [])
const read = (...parts) => readFileSync(join(...parts), 'utf8')

export function checkDomainNames(files) {
  const seen = new Map()
  for (const file of files) {
    const name = file.slice(0, -3)
    if (!NAME.test(name)) throw new Error(`facts/${file}: invalid domain name`)
    if (name.toLowerCase() === 'core') throw new Error(`facts/${file}: core is reserved`)
    const other = seen.get(name.toLowerCase())
    if (other) throw new Error(`facts/${file}: domain differs from ${other} only in case`)
    seen.set(name.toLowerCase(), file)
  }
}

export function loadData(dir) {
  const { owner, devices, audiences } = parseAudiences(read(dir, 'audiences.yaml'))
  const domains = parseDomains(read(dir, 'domains.md'))
  const factFiles = filesIn(join(dir, 'facts'), '.md')
  checkDomainNames(factFiles)
  const facts = factFiles.flatMap((f) => parseFacts(read(dir, 'facts', f), f.slice(0, -3)))
  const ids = new Map()
  for (const f of facts) {
    if (ids.has(f.id)) throw new Error(`${f.where}: id ${f.id} is used twice (also ${ids.get(f.id)})`)
    ids.set(f.id, f.where)
  }
  const answers = filesIn(join(dir, 'answers'), '.jsonl').flatMap((f) => parseAnswers(read(dir, 'answers', f)))
  return { owner, devices, audiences, domains, facts, answers }
}

const LABELS = ['id', 'sees', 'c', 't']
const label = (v) => (Array.isArray(v) ? `[${v.join(', ')}]` : v)
export const renderFact = (fact) =>
  `- ${fact.text} {${LABELS.filter((k) => fact[k] !== undefined).map((k) => `${k}: ${label(fact[k])}`).join(', ')}}`

export function buildBundles(data) {
  const interview = { domains: data.domains, counts: answerCounts(data.answers), stops: stopTopics(data.answers) }
  // The questions asked hold words of every circle: only an audience that sees them all gets them.
  const asked = askedQuestions(data.answers)
  const bundles = {}
  for (const name of Object.keys(data.audiences).sort()) {
    const chosen = select(data.facts, name, data.audiences)
    const domains = {}
    for (const fact of chosen.filter((f) => !f.core)) domains[fact.domain] = (domains[fact.domain] ?? '') + renderFact(fact) + '\n'
    bundles[name] = {
      owner: data.owner,
      audience: name,
      core: chosen.filter((f) => f.core).map((f) => renderFact(f) + '\n').join(''),
      domains,
      interview: data.audiences[name].interview ? { ...interview, asked: data.audiences[name].circle === 'any' ? asked : [] } : null,
    }
  }
  return bundles
}
