import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadData, buildBundles } from '../src/bundle.mjs'

const CIRCLES_WORK = '[familie, beste-freunde, freunde, arbeitsfreunde, arbeit]'
const CIRCLES_PERSONAL = '[familie, beste-freunde, freunde, arbeitsfreunde]'

function dataRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'digi-bundle-'))
  mkdirSync(join(dir, 'facts')); mkdirSync(join(dir, 'answers'))
  writeFileSync(join(dir, 'audiences.yaml'), `owner: daniel
devices:
  ddStudio: age1aaa
audiences:
  my-agents: { members: [ddStudio], circle: any, interview: true }
  work-agents: { members: [ddStudio], circle: arbeit }
`)
  writeFileSync(join(dir, 'domains.md'), '- food | food | 2 | familie beste-freunde freunde arbeitsfreunde\n- work | work | 2 | familie beste-freunde freunde arbeitsfreunde arbeit firmen\n- communication | talk | 2 | familie beste-freunde freunde arbeitsfreunde arbeit\n')
  writeFileSync(join(dir, 'facts', 'food.md'), `- Likes dark roast. {id: f-1, sees: ${CIRCLES_PERSONAL}, c: 0.9, t: 2026-10, a: [a-1]}\n- Diary. {id: f-2, sees: [], c: 1, t: 2026-10}\n`)
  writeFileSync(join(dir, 'facts', 'work.md'), `- Fears audits. {id: f-3, sees: [familie, beste-freunde], c: 1, t: 2026-10}\n- Likes Java. {id: f-4, sees: ${CIRCLES_WORK}, c: 1, t: 2026-10}\n`)
  writeFileSync(join(dir, 'facts', 'communication.md'), `- Writes plain English. {id: f-5, sees: ${CIRCLES_WORK}, c: 0.5, t: 2026-10, a: [seed], core: true}\n`)
  writeFileSync(join(dir, 'answers', '2026-10.jsonl'), '{"id":"a-1","domain":"food","topic":"coffee","stop":true}\n')
  return dir
}

test('builds one bundle per audience', () => {
  assert.deepEqual(Object.keys(buildBundles(loadData(dataRepo()))), ['my-agents', 'work-agents'])
})

test('applies the rules and splits core from the domains', () => {
  const b = buildBundles(loadData(dataRepo()))
  assert.equal(b['my-agents'].core, `- Writes plain English. {id: f-5, sees: ${CIRCLES_WORK}, c: 0.5, t: 2026-10}\n`)
  assert.deepEqual(b['my-agents'].domains, {
    food: `- Likes dark roast. {id: f-1, sees: ${CIRCLES_PERSONAL}, c: 0.9, t: 2026-10}\n`,
    work: `- Fears audits. {id: f-3, sees: [familie, beste-freunde], c: 1, t: 2026-10}\n- Likes Java. {id: f-4, sees: ${CIRCLES_WORK}, c: 1, t: 2026-10}\n`,
  })
  assert.deepEqual(b['work-agents'].domains, { work: `- Likes Java. {id: f-4, sees: ${CIRCLES_WORK}, c: 1, t: 2026-10}\n` })
  assert.equal(b['work-agents'].core, b['my-agents'].core)
})

test('a bundle line renders sees as a list, and Nur ich facts stay out', () => {
  const dir = dataRepo()
  writeFileSync(join(dir, 'facts', 'food.md'), '- Plays football. {id: f-1, sees: [familie, arbeit], c: 1, t: 2026-10}\n- Diary. {id: f-2, sees: [], c: 1, t: 2026-10}\n')
  const b = buildBundles(loadData(dir))
  assert.equal(b['my-agents'].domains.food, '- Plays football. {id: f-1, sees: [familie, arbeit], c: 1, t: 2026-10}\n')
  assert.equal(b['work-agents'].domains.food, '- Plays football. {id: f-1, sees: [familie, arbeit], c: 1, t: 2026-10}\n')
  assert.doesNotMatch(JSON.stringify(b), /Diary|f-2/)
})

test('the interview part passes the default circles of each domain on', () => {
  const b = buildBundles(loadData(dataRepo()))
  assert.deepEqual(b['my-agents'].interview.domains.find((d) => d.id === 'work').sees, ['familie', 'beste-freunde', 'freunde', 'arbeitsfreunde', 'arbeit', 'firmen'])
})

test('adds the interview part only where interview is true', () => {
  const b = buildBundles(loadData(dataRepo()))
  assert.deepEqual(b['my-agents'].interview.counts, { food: 1 })
  assert.deepEqual(b['my-agents'].interview.stops, ['coffee'])
  assert.equal(b['work-agents'].interview, null)
})

test('is deterministic', () => {
  const dir = dataRepo()
  assert.equal(JSON.stringify(buildBundles(loadData(dir))), JSON.stringify(buildBundles(loadData(dir))))
})
