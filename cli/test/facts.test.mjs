import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseFacts } from '../src/facts.mjs'

test('parses a fact with its labels', () => {
  const [fact] = parseFacts('# Food\n\n- Likes dark roast. {id: f-1, sees: [familie, freunde], c: 0.9, t: 2026-10, a: [a-1]}\n', 'food')
  assert.deepEqual(fact, {
    id: 'f-1', sees: ['familie', 'freunde'], c: 0.9, t: '2026-10', a: ['a-1'],
    domain: 'food', text: 'Likes dark roast.', where: 'facts/food.md:3',
  })
})

test('an empty sees is Nur ich, and core is read', () => {
  const [fact] = parseFacts('- Has a heart condition. {id: f-2, sees: [], core: true}\n', 'health-sport')
  assert.deepEqual([fact.sees, fact.core], [[], true])
})

test('ignores lines that are not facts', () => {
  assert.deepEqual(parseFacts('# Food\nSome note.\n\n', 'food'), [])
})

test('refuses a fact without labels', () => {
  assert.throws(() => parseFacts('- Likes tea.\n', 'food'), /facts\/food\.md:1: fact without labels/)
})

test('refuses a fact without id', () => {
  assert.throws(() => parseFacts('- Likes tea. {sees: [alle]}\n', 'food'), /facts\/food\.md:1: fact without id/)
})

test('refuses a fact without sees, or with an unknown circle', () => {
  assert.throws(() => parseFacts('- Likes tea. {id: f-3, s: personal}\n', 'food'), /facts\/food\.md:1: sees must be a list of familie, beste-freunde/)
  assert.throws(() => parseFacts('- Likes tea. {id: f-4, sees: [nachbarn]}\n', 'food'), /facts\/food\.md:1: sees must be a list of/)
})
