import { parse } from 'yaml'
import { CIRCLES, isCircleList } from './circles.mjs'

const LINE = /^- (.+?)\s*(\{[^{}]*\})\s*$/

export function parseFacts(text, domain) {
  const facts = []
  text.split('\n').forEach((line, i) => {
    if (!line.startsWith('- ')) return
    const where = `facts/${domain}.md:${i + 1}`
    const match = LINE.exec(line)
    if (!match) throw new Error(`${where}: fact without labels`)
    const labels = parse(match[2])
    if (!labels?.id) throw new Error(`${where}: fact without id`)
    if (!isCircleList(labels.sees)) throw new Error(`${where}: sees must be a list of ${CIRCLES.join(', ')} ([] for only you)`)
    facts.push({ ...labels, domain, text: match[1], where })
  })
  return facts
}
