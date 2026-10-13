import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDomains, parseAnswers, answerCounts, coverage, stopTopics } from '../src/coverage.mjs'

test('parses the coverage map with its default circles', () => {
  assert.deepEqual(parseDomains('# map\n- food | what you eat | 20 | familie beste-freunde freunde arbeitsfreunde\n'), [
    { id: 'food', description: 'what you eat', target: 20, sees: ['familie', 'beste-freunde', 'freunde', 'arbeitsfreunde'] },
  ])
})

test('refuses a bad coverage line', () => {
  assert.throws(() => parseDomains('- food | what you eat | many | familie\n'), /domains\.md: bad line/)
  assert.throws(() => parseDomains('- food | what you eat | 20 | nachbarn\n'), /domains\.md: bad line/)
})

test('counts answers per domain without skipped ones', () => {
  const entries = parseAnswers('{"id":"a1","domain":"food","skipped":false}\n{"id":"a2","domain":"food","skipped":true}\n{"id":"a3","domain":"work"}\n')
  assert.deepEqual(answerCounts(entries), { food: 1, work: 1 })
})

test('coverage caps each domain at its target', () => {
  const domains = [{ id: 'food', target: 2 }, { id: 'work', target: 2 }]
  assert.equal(coverage(domains, { food: 5, work: 1 }), 0.75)
  assert.equal(coverage([], {}), 0)
})

test('lists stop topics once, sorted', () => {
  assert.deepEqual(stopTopics([{ stop: true, topic: 'tea' }, { stop: true, topic: 'coffee' }, { stop: true, topic: 'tea' }, { stop: false, topic: 'beer' }]), ['coffee', 'tea'])
})
