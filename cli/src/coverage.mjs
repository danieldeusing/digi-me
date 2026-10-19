import { isCircleList } from './circles.mjs'

export function parseDomains(text) {
  return text.split('\n').filter((line) => line.startsWith('- ')).map((line) => {
    const [id, description, target, circles = ''] = line.slice(2).split('|').map((part) => part.trim())
    const count = Number(target)
    const sees = circles.split(/\s+/).filter(Boolean)
    if (!id || !Number.isInteger(count) || count < 1 || !isCircleList(sees)) throw new Error(`domains.md: bad line: ${line}`)
    return { id, description, target: count, sees }
  })
}

export const parseAnswers = (text) => text.split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line))

export function answerCounts(entries) {
  const counts = {}
  for (const entry of entries) if (!entry.skipped) counts[entry.domain] = (counts[entry.domain] ?? 0) + 1
  return counts
}

export function coverage(domains, counts) {
  const total = domains.reduce((sum, d) => sum + d.target, 0)
  const reached = domains.reduce((sum, d) => sum + Math.min(counts[d.id] ?? 0, d.target), 0)
  return total ? reached / total : 0
}

export const stopTopics = (entries) => [...new Set(entries.filter((e) => e.stop && e.topic).map((e) => e.topic))].sort()

// Every question asked, newest kept, for the interview's "asked before". One whose answer only the
// owner may see (no circles, or none at all) goes by its topic alone.
const ASKED = 1000
export const askedQuestions = (entries) =>
  entries
    .filter((e) => e.domain && e.topic)
    .map((e) => ({ domain: e.domain, topic: e.topic, question: !Array.isArray(e.sees) || !e.sees.length ? null : e.question ?? null }))
    .slice(-ASKED)
