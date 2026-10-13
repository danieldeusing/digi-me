import { test } from 'node:test'
import assert from 'node:assert/strict'
import { select } from '../src/rules.mjs'

const audiences = {
  'my-agents': { members: ['a'], circle: 'any' },
  'work-agents': { members: ['a'], circle: 'arbeit' },
  friends: { members: ['a'], circle: 'freunde' },
}
const fact = (id, sees, domain = 'food') => ({ id, sees, domain, text: id, where: `facts/${domain}.md:1` })
const ids = (facts) => facts.map((f) => f.id)

test('rule 1: a fact for no circle (Nur ich) never enters a bundle', () => {
  assert.deepEqual(ids(select([fact('o', [])], 'my-agents', audiences)), [])
})

test('rule 2: any takes every other fact', () => {
  const facts = [fact('f', ['familie']), fact('w', ['arbeit']), fact('o', [])]
  assert.deepEqual(ids(select(facts, 'my-agents', audiences)), ['f', 'w'])
})

test('rule 3: a circle takes the facts that name it or alle', () => {
  const facts = [fact('w', ['arbeit']), fact('a', ['alle']), fact('f', ['familie', 'freunde']), fact('k', ['arbeitsfreunde'])]
  assert.deepEqual(ids(select(facts, 'work-agents', audiences)), ['w', 'a'])
  assert.deepEqual(ids(select(facts, 'friends', audiences)), ['a', 'f'])
})

test('an unknown audience has no bundle', () => {
  assert.throws(() => select([], 'nobody', audiences), /no bundle for audience nobody/)
})
