// The interview deck: the questions the host mod asks the owner, built from the pulled my-agents
// bundle. Pure functions; createInterview() wraps them as the `digiMe` noun the host mod draws.

import { answerCounts, coverage } from './session.js'

// The circles of spec §17.1, in the order the card shows them; `alle` includes every other one.
const CIRCLES = {
  de: [
    { id: 'familie', icon: '🏠', short: 'Familie', name: 'Familie' },
    { id: 'beste-freunde', icon: '💛', short: 'Beste', name: 'Beste Freunde' },
    { id: 'freunde', icon: '👥', short: 'Freunde', name: 'Persönliche Freunde' },
    { id: 'arbeitsfreunde', icon: '🤝', short: 'Kollegen', name: 'Arbeitsfreunde' },
    { id: 'arbeit', icon: '💼', short: 'Arbeit', name: 'Arbeit' },
    { id: 'firmen', icon: '🏢', short: 'Firmen', name: 'Firmen' },
    { id: 'alle', icon: '🌍', short: 'Alle', name: 'Alle', all: true },
  ],
  en: [
    { id: 'familie', icon: '🏠', short: 'Family', name: 'Family' },
    { id: 'beste-freunde', icon: '💛', short: 'Best', name: 'Best friends' },
    { id: 'freunde', icon: '👥', short: 'Friends', name: 'Friends' },
    { id: 'arbeitsfreunde', icon: '🤝', short: 'Colleagues', name: 'Work friends' },
    { id: 'arbeit', icon: '💼', short: 'Work', name: 'Work' },
    { id: 'firmen', icon: '🏢', short: 'Companies', name: 'Companies' },
    { id: 'alle', icon: '🌍', short: 'Everyone', name: 'Everyone', all: true },
  ],
}
const CIRCLE_IDS = CIRCLES.de.map((c) => c.id)
const REQUEST = { model: 'claude-opus-5-5', effort: 'medium', maxTokens: 8000, timeoutMs: 180_000 }
const FEEDBACK = { model: 'claude-opus-5-5', effort: 'low', maxTokens: 1500, timeoutMs: 60_000 }
const LANGUAGES = { de: 'German', en: 'English' }
const SIX_MONTHS = 183 * 86_400_000
const TEXTS = {
  de: {
    wait: 'Suche Fragen über dich … ☕', empty: 'Gerade keine Fragen. Gleich kommen neue.', fail: 'Etwas ist schiefgegangen',
    doneToday: 'Für heute genug gefragt. Bis morgen!', skip: 'überspringen', stop: 'nicht mehr fragen', next: 'weiter',
    placeholder: 'deine Antwort …', send: 'senden', thanks: 'Danke, notiert.', coverage: 'Abdeckung',
    unavailable: 'Noch keine Fragen: digi-me ist hier noch nicht eingerichtet.',
    sees: 'Sichtbar für', suggested: 'Vorschlag', seenBy: 'Das sehen', notSeenBy: 'Nicht', onlyYou: 'Das siehst nur du.', othersNot: 'alle anderen', onlyMe: 'nur ich',
  },
  en: {
    wait: 'Finding questions about you … ☕', empty: 'No questions right now. More soon.', fail: 'Something went wrong',
    doneToday: 'Enough questions for today. See you tomorrow!', skip: 'skip', stop: "don't ask again", next: 'next',
    placeholder: 'your answer …', send: 'send', thanks: 'Thanks, noted.', coverage: 'coverage',
    unavailable: 'No questions yet: digi-me is not set up here.',
    sees: 'Visible to', suggested: 'suggestion', seenBy: 'Seen by', notSeenBy: 'Not', onlyYou: 'Only you see this.', othersNot: 'everyone else', onlyMe: 'only me',
  },
}
const textsFor = (language) => TEXTS[language] ?? TEXTS.en
const isText = (v) => typeof v === 'string' && v.trim() !== ''

export function systemPrompt(ctx, language) {
  const languageRule = ctx.learn
    ? `Write "question" and all options in ${ctx.languages.learn}, at the owner's level (the owner ${ctx.learner}). Add "note": one line in ${ctx.languages.native} that explains one useful word or phrase of the question.`
    : `Write "question" and all options in ${LANGUAGES[language] ?? language}. Leave out "note".`
  return [
    'You write interview cards for digi-me, the digital twin of one person, the owner. Each card asks the owner ONE short question about themselves, so that agents and chats can later act the way the owner would.',
    '',
    'Return ONLY a JSON array of cards. Each card is an object:',
    '- "format": "either", "choice", "scale", "confirm" or "free";',
    '- "domain": one id from the coverage map;',
    '- "topic": 1 to 3 lowercase English words that name what the card is about;',
    '- "question": at most 25 words;',
    '- "options": see the formats;',
    '- "sees": the circles that may see the answer, a list of ids from familie, beste-freunde, freunde, arbeitsfreunde, arbeit, firmen, alle ([] = only the owner); start from the domain\'s default circles and adjust them to the question (for example [] for a medical detail, [alle] for a public fact);',
    '- "note": only when the language rule asks for it.',
    '',
    'Formats:',
    '- either: exactly 2 options.',
    '- choice: 3 or 4 options. When the last option means "something else, let me type it", add "other": true.',
    '- scale: no options; "scaleLabels": [the low end, the high end] of a 1 to 5 scale.',
    '- confirm: checks a fact from "Facts to re-check" ("I think you … Right?"); exactly 3 options: yes, partly, no; "sees": the circles the fact shows under "Facts to re-check".',
    '- free: no options; the owner types a short answer.',
    '',
    'Choose the cards in this order:',
    '1. At most one follow-up on a recent answer that was surprising, vague or typed.',
    '2. At most two confirm cards for facts under "Facts to re-check".',
    '3. New questions for the domains furthest below their target (answers so far against target). In a domain with fewer than 5 answers use either, choice or scale; free only after that.',
    '',
    'Never ask about a topic under "Do not ask", and never repeat a topic from the recent answers or the queue. Ask about the owner only: about people in their life, ask only what the owner feels or prefers, never for those people\'s private details. Questions are warm, short and answerable in seconds.',
    '',
    `Language: ${languageRule}`,
  ].join('\n')
}

export function oldFacts(domains, now) {
  const found = []
  for (const [domain, text] of Object.entries(domains ?? {})) {
    for (const line of String(text).split('\n')) {
      const m = /^- (.+?)\s*\{([^{}]*)\}\s*$/.exec(line)
      const d = m && /\bt: (\d{4})-(\d{2})\b/.exec(m[2])
      if (!d) continue
      const t = `${d[1]}-${d[2]}`
      const sees = (/\bsees: \[([^\]]*)\]/.exec(m[2])?.[1] ?? '').split(',').map((c) => c.trim()).filter(Boolean)
      if (Date.UTC(Number(d[1]), Number(d[2]) - 1) < now - SIX_MONTHS) found.push({ domain, line: m[1], t, sees })
    }
  }
  return found.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0)).slice(0, 10)
}

export function buildRequest(data, ctx, language) {
  if (!data?.interview) throw new Error('no digi-me data yet: run `digi-me pull`, or the digi-me-setup skill')
  const iv = data.interview
  const counts = answerCounts(iv, ctx.recent, data.meta?.published ?? '')
  const stops = [...new Set([...(iv.stops ?? []), ...ctx.recent.filter((e) => e.stop && e.topic).map((e) => e.topic)])]
  const old = oldFacts(data.domains, ctx.now)
  const said = (e) => (e.skipped ? '(skipped)' : isText(e.text) ? e.text : (e.options?.[e.answer] ?? '?'))
  // An answer only the owner may see gives the model its topic, never its words.
  const recentLine = (e) => (Array.isArray(e.sees) && !e.sees.length ? `- [${e.domain}/${e.topic}] (only the owner may see this answer)` : `- [${e.domain}/${e.topic}] ${e.question} → ${said(e)}`)
  const lines = [
    `Today: ${new Date(ctx.now).toISOString().slice(0, 10)}.`,
    '',
    'Coverage map (id | description | target | default circles | answers so far):',
    ...iv.domains.map((d) => `- ${d.id} | ${d.description} | ${d.target} | ${d.sees.join(' ')} | ${counts[d.id] ?? 0}`),
    '',
    `Do not ask: ${stops.join(', ') || 'nothing yet'}`,
    '',
    'Facts to re-check (older than six months):',
    ...(old.length ? old.map((f) => `- [${f.domain}] ${f.line} (last confirmed ${f.t}; circles: ${f.sees.join(' ') || 'none'})`) : ['- none']),
    '',
    'Recent answers (newest last):',
    ...(ctx.recent.length ? ctx.recent.slice(-30).map(recentLine) : ['- none']),
    '',
    `Already queued: ${ctx.queued.join(', ') || 'nothing'}`,
    '',
    `Write ${ctx.count} cards.`,
  ]
  return { system: systemPrompt(ctx, language), prompt: lines.join('\n'), call: REQUEST }
}

function normalize(c, domainIds) {
  if (!c || typeof c !== 'object' || !isText(c.question) || !isText(c.topic)) return null
  const sees = Array.isArray(c.sees) && c.sees.every((x) => CIRCLE_IDS.includes(x)) ? c.sees : null
  if (!domainIds.includes(c.domain) || !sees) return null
  const base = {
    format: c.format, domain: c.domain, topic: c.topic.trim().toLowerCase(), question: c.question.trim(),
    sees: sees.includes('alle') ? [...CIRCLE_IDS] : CIRCLE_IDS.filter((x) => sees.includes(x)),
  }
  if (isText(c.note)) base.note = c.note.trim()
  const options = Array.isArray(c.options) && c.options.every(isText) ? c.options.map((o) => o.trim()) : null
  if (c.format === 'either') return options?.length === 2 ? { ...base, options } : null
  if (c.format === 'choice') return options && options.length >= 3 && options.length <= 4 ? { ...base, options, other: c.other === true } : null
  if (c.format === 'confirm') return options?.length === 3 ? { ...base, options } : null
  if (c.format === 'scale') {
    const labels = Array.isArray(c.scaleLabels) && c.scaleLabels.length === 2 && c.scaleLabels.every(isText) ? c.scaleLabels.map((t) => t.trim()) : null
    return labels ? { ...base, options: ['1', '2', '3', '4', '5'], scaleLabels: labels } : null
  }
  if (c.format === 'free') return { ...base, options: [] }
  return null
}

export function parseCards(text, domainIds) {
  const s = String(text ?? '')
  const first = s.search(/\[\s*\{/)
  const start = first >= 0 ? first : s.indexOf('[')
  const end = s.lastIndexOf(']')
  let raw = []
  try {
    raw = start >= 0 && end > start ? JSON.parse(s.slice(start, end + 1)) : []
  } catch {
    raw = []
  }
  return (Array.isArray(raw) ? raw : []).map((c) => normalize(c, domainIds)).filter(Boolean)
}

function feedbackPrompt(ctx) {
  return [
    `The owner answered an interview question in ${ctx.languages.learn}, a language they are learning (the owner ${ctx.learner}).`,
    'Return ONLY a JSON object:',
    `- "corrected": the answer in correct, natural ${ctx.languages.learn} with the same meaning (unchanged when it was correct);`,
    `- "meaning": what the owner meant, one sentence in ${ctx.languages.native};`,
    `- "line": one short line in ${ctx.languages.native}: "✓" when the answer was correct, else the corrected answer and the main fix.`,
  ].join('\n')
}

export function answeredResult(card, entry, ctx, language) {
  if (entry.skipped) return { line: '' }
  const thanks = textsFor(language).thanks
  if (!ctx.learn || !isText(entry.text)) return { line: thanks }
  return { line: thanks, request: { system: feedbackPrompt(ctx), prompt: `Question: ${card.question}\nAnswer: ${entry.text}`, call: FEEDBACK } }
}

export function parseFeedback(text) {
  const s = String(text ?? '')
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  try {
    const v = JSON.parse(s.slice(start, end + 1))
    if (!isText(v?.line)) return null
    return { line: v.line.trim(), patch: { corrected: isText(v.corrected) ? v.corrected.trim() : null, meaning: isText(v.meaning) ? v.meaning.trim() : null } }
  } catch {
    return null
  }
}

// The `digiMe` noun: methods only (a data field would unload the plugin, spike 1).
// data(): the pulled my-agents bundle, or null; the interview runs in every session.
export function createInterview({ data, options, root }) {
  const language = () => options().language ?? 'de'
  return {
    available: async () => Array.isArray(data()?.interview?.domains),
    describe: async () => ({
      id: 'interview',
      label: 'digi-me',
      icon: '🪞',
      perDay: Math.max(0, Math.floor(Number(options().perDay ?? 10))),
      language: language(),
      texts: textsFor(language()),
      circles: CIRCLES[language()] ?? CIRCLES.en,
    }),
    status: async () => {
      const iv = data()?.interview
      if (!iv) return []
      return [[textsFor(language()).coverage, `${Math.round(coverage(iv.domains, iv.counts ?? {}) * 100)} %`]]
    },
    request: async (ctx) => {
      return buildRequest(data(), ctx, language())
    },
    parse: async (text) => parseCards(text, (data()?.interview?.domains ?? []).map((d) => d.id)),
    answered: async ({ card, entry, ctx }) => answeredResult(card, entry, ctx, language()),
    parseFeedback: async (text) => parseFeedback(text),
    recordArgv: async () => {
      if (!root()) throw new Error('digi-me is not started yet')
      return ['node', `${root()}/cli/dist/digi-me.mjs`, 'answer']
    },
  }
}
