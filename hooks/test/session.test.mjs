import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chooseAudience, coreSection, bundleFrom, answerCounts, coverage, digivolved } from '../lib/session.js'

test('a session inside a work folder gets work-agents, any other my-agents', () => {
  const work = ['~/Work/acme/**', '/srv/client']
  assert.equal(chooseAudience('/Users/d/Work/acme/app/src', work, '/Users/d'), 'work-agents')
  assert.equal(chooseAudience('/Users/d/Work/acme', work, '/Users/d'), 'work-agents')
  assert.equal(chooseAudience('/srv/client/app', work, '/Users/d'), 'work-agents')
  assert.equal(chooseAudience('/Users/d/Work/acmeville', work, '/Users/d'), 'my-agents')
  assert.equal(chooseAudience('/Users/d/Work/danieldeusing/digi-me', work, '/Users/d'), 'my-agents')
  assert.equal(chooseAudience('/anything', [], '/Users/d'), 'my-agents')
})

test('workPaths may be a comma-joined string, an empty string or undefined', () => {
  const joined = '~/Work/acme/**, ~/Work/client/**'
  assert.equal(chooseAudience('/Users/d/Work/client/sales', joined, '/Users/d'), 'work-agents')
  assert.equal(chooseAudience('/Users/d/Work/acme/app', joined, '/Users/d'), 'work-agents')
  assert.equal(chooseAudience('/Users/d/Work/danieldeusing', joined, '/Users/d'), 'my-agents')
  assert.equal(chooseAudience('/Users/d/Work', '', '/Users/d'), 'my-agents')
  assert.equal(chooseAudience('/Users/d/Work', undefined, '/Users/d'), 'my-agents')
})

test('work folders are globs, matched case-insensitively and only at folder boundaries', () => {
  assert.equal(chooseAudience('/Users/d/Work/acme/app/x', '~/Work/*/app/**', '/Users/d'), 'work-agents')
  assert.equal(chooseAudience('/Users/d/Work/acme/app', '$HOME/Work/acme', '/Users/d'), 'work-agents')
  assert.equal(chooseAudience('/Users/d/Work/acme/app', '~/Work/acme/**', '/Users/d/'), 'work-agents')
  assert.equal(chooseAudience('/Users/d/Work/acme/app', '~/work/acme', '/Users/d'), 'work-agents')
  assert.equal(chooseAudience('/Users/d/Work/acmeville', '~/Work/acme', '/Users/d'), 'my-agents')
  assert.equal(chooseAudience('/Users/d/Work/a+b/x', '~/Work/a+b', '/Users/d'), 'work-agents')
  assert.equal(chooseAudience('/Users/d/Work/aab', '~/Work/a+b', '/Users/d'), 'my-agents')
  assert.equal(chooseAudience('/Users/d/Work/a+bc', '~/Work/a+b', '/Users/d'), 'my-agents')
  assert.equal(chooseAudience('/Users/d//Work/acme/', '~/Work//acme/', '/Users/d'), 'work-agents')
})

test('the core section names the audience, the rule and the domain files', () => {
  const text = coreSection({ audience: 'work-agents', folder: '/h/.digi-me/bundles/work-agents', core: '- Writes plain English. {id: f-1, sees: [familie, freunde]}\n', domains: ['work', 'voice'] })
  assert.equal(text, [
    '# digi-me',
    'The facts below describe the person you work for (digi-me audience: work-agents). Use them to match their language, tone and choices.',
    'In text that other people read (commits, tickets, documents, posts, messages), use only facts whose `sees` includes those readers; in public text only facts whose `sees` holds `alle`.',
    'More facts, one file per domain, are in /h/.digi-me/bundles/work-agents/: work.md, voice.md. The digi-me skill says when to read them.',
    '',
    '- Writes plain English. {id: f-1, sees: [familie, freunde]}',
  ].join('\n'))
  assert.ok(!coreSection({ audience: 'my-agents', folder: '/f', core: '- A. {id: a, sees: [alle]}', domains: [] }).includes('More facts'))
})

test('bundleFrom splits the cache files of one audience', () => {
  const b = bundleFrom({ 'core.md': 'C', 'food.md': 'F', 'interview.json': '{"counts":{"food":2}}', 'meta.json': '{"version":3}', 'broken.json': '{' })
  assert.deepEqual(b, { core: 'C', domains: { food: 'F' }, interview: { counts: { food: 2 } }, meta: { version: 3 } })
  assert.deepEqual(bundleFrom({}), { core: '', domains: {}, interview: null, meta: null })
})

test('answers newer than the bundle count towards the coverage', () => {
  const interview = { counts: { food: 2 } }
  const recent = [
    { domain: 'food', ts: '2026-10-09T10:00:00Z' },
    { domain: 'food', ts: '2026-10-10T10:00:00Z' },
    { domain: 'work', ts: '2026-10-10T11:00:00Z', skipped: true },
    { domain: 'work', ts: '2026-10-10T12:00:00Z' },
  ]
  assert.deepEqual(answerCounts(interview, recent, '2026-10-09T12:00:00Z'), { food: 3, work: 1 })
  assert.deepEqual(answerCounts(null, [], ''), {})
})

test('coverage caps each domain at its target, digivolved names a new 10 % step', () => {
  assert.equal(coverage([{ id: 'food', target: 2 }, { id: 'work', target: 2 }], { food: 5, work: 1 }), 0.75)
  assert.equal(coverage([], {}), 0)
  assert.equal(digivolved(0.18, 0.21), 20)
  assert.equal(digivolved(0.21, 0.29), null)
  assert.equal(digivolved(0.3, 0.2), null)
})

test('? and character classes work in a work glob; a broken one counts as work', () => {
  const home = '/Users/d'
  assert.equal(chooseAudience('/Users/d/Work/acme/app', '~/Work/acm?/app', home), 'work-agents')
  assert.equal(chooseAudience('/Users/d/Work/acme/app', '~/Work/[a]cme', home), 'work-agents')
  assert.equal(chooseAudience('/Users/d/Work/acme/app', '~/Work/[!x]cme', home), 'work-agents')
  assert.equal(chooseAudience('/Users/d/Work/xxi', '~/Work/[!x]xi', home), 'my-agents')
  assert.equal(chooseAudience('/Users/d/Work/ac/me', '~/Work/ac?me', home), 'my-agents')
  assert.equal(chooseAudience('/Users/d/Private', '~/Work/[z-a]', home), 'work-agents')
})

test('odd bracket shapes count as work; a [..] also matches its literal text', () => {
  const home = '/Users/d'
  assert.equal(chooseAudience('/Users/d/Work/]', '~/Work/[]a]', home), 'work-agents')
  assert.equal(chooseAudience('/Users/d/Work/a', '~/Work/[!]a]', home), 'work-agents')
  assert.equal(chooseAudience('/Users/d/Work/ab', '~/Work/a[[:alpha:]]', home), 'work-agents')
  assert.equal(chooseAudience('/Users/d/Work/[x]', '~/Work/[x]', home), 'work-agents')
  assert.equal(chooseAudience('/Users/d/Work/x', '~/Work/[x]', home), 'work-agents')
  assert.equal(chooseAudience('/Users/d/Private', '~/Work/[ab', home), 'my-agents')
})
