import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildRequest, parseCards, answeredResult, parseFeedback, oldFacts, createInterview, systemPrompt } from '../lib/interview.js'
import { CIRCLES } from '../../cli/src/circles.mjs'

const NOW = Date.UTC(2026, 9, 10, 12, 0)
const DATA = {
  core: '- Writes plain English. {id: f-1, sees: [familie, beste-freunde, freunde, arbeitsfreunde], c: 1, t: 2026-10}\n',
  domains: {
    food: '- Likes dark roast. {id: f-2, sees: [familie, beste-freunde, freunde, arbeitsfreunde], c: 0.9, t: 2026-01}\n- Hates olives. {id: f-3, sees: [familie, beste-freunde, freunde, arbeitsfreunde], c: 1, t: 2026-09}\n',
    media: '- Loves Bossa Nova. {id: f-4, sees: [familie, beste-freunde, freunde, arbeitsfreunde], c: 0.5, t: 2025-12}\n',
  },
  interview: {
    domains: [
      { id: 'food', description: 'what you eat', target: 20, sees: ['familie', 'beste-freunde', 'freunde', 'arbeitsfreunde'] },
      { id: 'media', description: 'music, film', target: 30, sees: ['familie', 'beste-freunde', 'freunde', 'arbeitsfreunde'] },
      { id: 'health-sport', description: 'health', target: 15, sees: ['familie', 'beste-freunde'] },
    ],
    counts: { food: 4 },
    stops: ['olives'],
  },
  meta: { version: 3, published: '2026-10-09T12:00:00.000Z' },
}
const CTX = {
  now: NOW, learn: false, count: 10, queued: ['beer'],
  recent: [{ domain: 'food', topic: 'coffee', question: 'Kaffee oder Tee?', options: ['Kaffee', 'Tee'], answer: 0, text: null, ts: '2026-10-10T10:00:00Z', skipped: false, stop: false }],
  languages: { learn: 'Brazilian Portuguese', native: 'German' }, learner: 'has lived in Brazil for four years',
}

test('oldFacts lists facts not confirmed for six months, oldest first', () => {
  assert.deepEqual(oldFacts(DATA.domains, NOW), [
    { domain: 'media', line: 'Loves Bossa Nova.', t: '2025-12', sees: ['familie', 'beste-freunde', 'freunde', 'arbeitsfreunde'] },
    { domain: 'food', line: 'Likes dark roast.', t: '2026-01', sees: ['familie', 'beste-freunde', 'freunde', 'arbeitsfreunde'] },
  ])
})

test('the request carries the coverage map, stops, old facts, recent answers and the queue', () => {
  const req = buildRequest(DATA, CTX, 'de')
  assert.equal(req.call.model, 'claude-opus-5-5')
  for (const part of [
    'Today: 2026-10-10.',
    '- food | what you eat | 20 | familie beste-freunde freunde arbeitsfreunde | 5',
    '- health-sport | health | 15 | familie beste-freunde | 0',
    'Do not ask: olives',
    '- [media] Loves Bossa Nova. (last confirmed 2025-12; circles: familie beste-freunde freunde arbeitsfreunde)',
    '- [food/coffee] Kaffee oder Tee? → Kaffee',
    'Already queued: beer',
    'Write 10 cards.',
  ]) assert.ok(req.prompt.includes(part), part)
  assert.match(req.system, /Write "question" and all options in German\./)
})

test('in learn mode the questions are in the learned language with a note', () => {
  const s = systemPrompt({ ...CTX, learn: true }, 'de')
  assert.match(s, /in Brazilian Portuguese, at the owner's level \(the owner has lived in Brazil for four years\)/)
  assert.match(s, /"note": one line in German/)
})

test('without data the request says how to get it', () => {
  assert.throws(() => buildRequest(null, CTX, 'de'), /no digi-me data yet/)
})

test('parseCards keeps valid cards per format and normalises them', () => {
  const raw = [
    { format: 'either', domain: 'food', topic: 'Beer', question: 'Bier oder Wein?', options: ['Bier', 'Wein'], sees: ['familie', 'beste-freunde', 'freunde', 'arbeitsfreunde'] },
    { format: 'choice', domain: 'media', topic: 'music', question: 'Welche Musik?', options: ['Rock', 'Jazz', 'Andere …'], other: true, sees: ['familie', 'beste-freunde', 'freunde', 'arbeitsfreunde'] },
    { format: 'scale', domain: 'food', topic: 'spice', question: 'Wie scharf?', scaleLabels: ['mild', 'sehr scharf'], sees: ['alle'] },
    { format: 'confirm', domain: 'food', topic: 'roast', question: 'Du magst dunkle Röstung. Stimmt das?', options: ['ja', 'teilweise', 'nein'], sees: ['familie', 'beste-freunde', 'freunde', 'arbeitsfreunde'] },
    { format: 'free', domain: 'media', topic: 'film', question: 'Lieblingsfilm?', sees: ['familie', 'beste-freunde', 'freunde', 'arbeitsfreunde'], note: 'filme = Film' },
    { format: 'either', domain: 'nowhere', topic: 'x', question: 'X?', options: ['a', 'b'], sees: ['familie', 'beste-freunde', 'freunde', 'arbeitsfreunde'] },
    { format: 'choice', domain: 'food', topic: 'x', question: 'X?', options: ['a', 'b'], sees: ['familie', 'beste-freunde', 'freunde', 'arbeitsfreunde'] },
    { format: 'free', domain: 'food', topic: 'x', question: 'X?', sees: ['nachbarn'] },
  ]
  const cards = parseCards('Here:\n' + JSON.stringify(raw), ['food', 'media'])
  assert.deepEqual(cards.map((c) => [c.format, c.topic, c.options.length]), [['either', 'beer', 2], ['choice', 'music', 3], ['scale', 'spice', 5], ['confirm', 'roast', 3], ['free', 'film', 0]])
  assert.equal(cards[1].other, true)
  assert.deepEqual(cards[2].scaleLabels, ['mild', 'sehr scharf'])
  assert.equal(cards[4].note, 'filme = Film')
  assert.deepEqual(parseCards('no json', ['food']), [])
})

test('a typed answer in learn mode asks for feedback; anything else just thanks', () => {
  const card = { question: 'Você gosta de café?' }
  assert.deepEqual(answeredResult(card, { text: null, skipped: false }, { ...CTX, learn: true }, 'de'), { line: 'Danke, notiert.' })
  assert.deepEqual(answeredResult(card, { text: 'sim', skipped: false }, CTX, 'de'), { line: 'Danke, notiert.' })
  assert.deepEqual(answeredResult(card, { text: null, skipped: true }, CTX, 'de'), { line: '' })
  const r = answeredResult(card, { text: 'eu gosta', skipped: false }, { ...CTX, learn: true }, 'de')
  assert.equal(r.request.prompt, 'Question: Você gosta de café?\nAnswer: eu gosta')
  assert.match(r.request.system, /Brazilian Portuguese/)
})

test('parseFeedback reads the correction, or returns null', () => {
  assert.deepEqual(parseFeedback('{"corrected":"Eu gosto","meaning":"Ich mag","line":"✓ fast: Eu gosto"}'), { line: '✓ fast: Eu gosto', patch: { corrected: 'Eu gosto', meaning: 'Ich mag' } })
  assert.equal(parseFeedback('nonsense'), null)
  assert.equal(parseFeedback('{"corrected":"x"}'), null)
})

test('the noun has methods only and describes itself', async () => {
  const noun = createInterview({ data: () => DATA, options: () => ({ language: 'de', perDay: 7.6 }), root: () => '/plugin' })
  assert.ok(Object.values(noun).every((v) => typeof v === 'function'))
  const info = await noun.describe()
  assert.deepEqual([info.id, info.label, info.perDay, info.language, info.texts.skip], ['interview', 'digi-me', 7, 'de', 'überspringen'])
  assert.deepEqual(await noun.status(), [['Abdeckung', '6 %']])
  assert.deepEqual(await noun.recordArgv(), ['node', '/plugin/cli/dist/digi-me.mjs', 'answer'])
  assert.equal((await noun.parse(JSON.stringify([{ format: 'free', domain: 'food', topic: 't', question: 'Q?', sees: ['familie', 'beste-freunde', 'freunde', 'arbeitsfreunde'] }]))).length, 1)
})

test('in a work session the interview asks and shows coverage all the same', async () => {
  const noun = createInterview({ data: () => DATA, options: () => ({}), root: () => '/plugin' })
  assert.match((await noun.request(CTX)).prompt, /Write 10 cards\./)
  assert.deepEqual(await noun.status(), [['Abdeckung', '6 %']])
})

test('an answer cannot be recorded before the session started', async () => {
  const noun = createInterview({ data: () => DATA, options: () => ({}), root: () => '' })
  await assert.rejects(noun.recordArgv(), { message: 'digi-me is not started yet' })
})

test('the prompt shows the last 30 recent answers', () => {
  const recent = Array.from({ length: 31 }, (_, i) => ({ ...CTX.recent[0], topic: `t${i}`, question: `Frage ${i}?` }))
  const { prompt } = buildRequest(DATA, { ...CTX, recent }, 'de')
  assert.ok(!prompt.includes('Frage 0?'))
  for (let i = 1; i < 31; i++) assert.ok(prompt.includes(`] Frage ${i}? →`), `Frage ${i}`)
})

test('parseCards skips a bracket in the preamble', () => {
  const raw = [{ format: 'free', domain: 'food', topic: 't', question: 'Q?', sees: ['familie', 'beste-freunde', 'freunde', 'arbeitsfreunde'] }]
  assert.equal(parseCards('Here are the cards [JSON]:\n' + JSON.stringify(raw), ['food']).length, 1)
})

test('the noun is available when the my-agents bundle has an interview part, and says otherwise in its own words', async () => {
  let data = DATA
  const noun = createInterview({ data: () => data, options: () => ({ language: 'de' }), root: () => '/plugin' })
  assert.equal(await noun.available(), true)
  data = { ...DATA, interview: undefined }
  assert.equal(await noun.available(), false)
  data = { ...DATA, interview: {} }
  assert.equal(await noun.available(), false)
  data = null
  assert.equal(await noun.available(), false)
  assert.equal((await noun.describe()).texts.unavailable, 'Noch keine Fragen: digi-me ist hier noch nicht eingerichtet.')
  const en = createInterview({ data: () => null, options: () => ({ language: 'en' }), root: () => '/plugin' })
  assert.equal((await en.describe()).texts.unavailable, 'No questions yet: digi-me is not set up here.')
})

test('in a work session a typed answer in learn mode still asks for feedback', async () => {
  const noun = createInterview({ data: () => DATA, options: () => ({ language: 'de' }), root: () => '/plugin' })
  const r = await noun.answered({ card: { question: 'Você gosta de café?' }, entry: { text: 'eu gosta', skipped: false }, ctx: { ...CTX, learn: true } })
  assert.equal(r.line, 'Danke, notiert.')
  assert.match(r.request.prompt, /Answer: eu gosta/)
})

test('answered takes one object, as a call from another mod brings it', async () => {
  const noun = createInterview({ data: () => DATA, options: () => ({ language: 'de' }), root: () => '/plugin' })
  const r = await noun.answered({ card: { question: 'Kaffee oder Tee?' }, entry: { answer: 0, text: null, skipped: false }, ctx: CTX })
  assert.deepEqual(r, { line: 'Danke, notiert.' })
})

test('describe gives the host the circles and the words of the card', async () => {
  const noun = createInterview({ data: () => DATA, options: () => ({ language: 'de' }), root: () => '/plugin' })
  const info = await noun.describe()
  assert.deepEqual(info.circles.map((c) => [c.id, c.short]), [['familie', 'Familie'], ['beste-freunde', 'Beste'], ['freunde', 'Freunde'], ['arbeitsfreunde', 'Kollegen'], ['arbeit', 'Arbeit'], ['firmen', 'Firmen'], ['alle', 'Alle']])
  assert.equal(info.circles.find((c) => c.all)?.id, 'alle')
  assert.deepEqual([info.texts.sees, info.texts.onlyYou, info.texts.onlyMe], ['Sichtbar für', 'Das siehst nur du.', 'nur ich'])
  assert.deepEqual([info.texts.wait, info.texts.fail], ['Suche Fragen über dich … ☕', 'Etwas ist schiefgegangen'])
  const en = await createInterview({ data: () => DATA, options: () => ({ language: 'en' }), root: () => '/plugin' }).describe()
  assert.deepEqual(en.circles.map((c) => c.name), ['Family', 'Best friends', 'Friends', 'Work friends', 'Work', 'Companies', 'Everyone'])
  assert.deepEqual([en.texts.wait, en.texts.fail], ['Finding questions about you … ☕', 'Something went wrong'])
})

test('parseCards keeps known circles, expands alle, and drops unknown ones', () => {
  const raw = [
    { format: 'free', domain: 'food', topic: 'a', question: 'A?', sees: ['familie', 'familie', 'freunde'] },
    { format: 'free', domain: 'food', topic: 'b', question: 'B?', sees: ['alle'] },
    { format: 'free', domain: 'food', topic: 'c', question: 'C?', sees: [] },
    { format: 'free', domain: 'food', topic: 'd', question: 'D?', sees: ['nachbarn'] },
    { format: 'free', domain: 'food', topic: 'e', question: 'E?', s: 'personal' },
  ]
  assert.deepEqual(parseCards(JSON.stringify(raw), ['food']).map((c) => [c.topic, c.sees]), [
    ['a', ['familie', 'freunde']],
    ['b', ['familie', 'beste-freunde', 'freunde', 'arbeitsfreunde', 'arbeit', 'firmen', 'alle']],
    ['c', []],
  ])
})

test('the request shows default circles and asks for sees', () => {
  const req = buildRequest(DATA, CTX, 'de')
  assert.match(req.prompt, /- food \| what you eat \| 20 \| familie beste-freunde freunde arbeitsfreunde \| 5/)
  assert.match(req.system, /"sees": the circles that may see the answer/)
  assert.doesNotMatch(req.system, /"s": "public"/)
})

test('a fact to re-check shows its circles, and a confirm card suggests them', () => {
  const domains = { health: '- Has a bad knee. {id: f-7, sees: [], c: 1, t: 2025-01}\n- Runs on Sundays. {id: f-8, sees: [familie, beste-freunde], c: 1, t: 2025-02}\n' }
  const req = buildRequest({ ...DATA, domains }, CTX, 'de')
  assert.ok(req.prompt.includes('- [health] Has a bad knee. (last confirmed 2025-01; circles: none)'))
  assert.ok(req.prompt.includes('- [health] Runs on Sundays. (last confirmed 2025-02; circles: familie beste-freunde)'))
  assert.match(req.system, /- confirm: .*"sees": the circles the fact shows under "Facts to re-check"/)
})

test('a recent answer only the owner may see gives the model its topic, not its words', () => {
  const recent = [{ ...CTX.recent[0], domain: 'health-sport', topic: 'knee', question: 'Was ist mit deinem Knie?', text: 'Meniskusriss', answer: null, sees: [] }]
  const { prompt } = buildRequest(DATA, { ...CTX, recent }, 'de')
  assert.ok(prompt.includes('- [health-sport/knee] (only the owner may see this answer)'))
  assert.ok(!prompt.includes('Knie'))
  assert.ok(!prompt.includes('Meniskusriss'))
})

test('the card circles are the CLI circles, in both languages', async () => {
  for (const language of ['de', 'en']) {
    const info = await createInterview({ data: () => DATA, options: () => ({ language }), root: () => '/plugin' }).describe()
    assert.deepEqual(info.circles.map((c) => c.id), CIRCLES)
  }
})
