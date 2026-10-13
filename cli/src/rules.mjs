// Spec §17.3: a fact for no circle (Nur ich) never enters a bundle; `any` (the owner's own
// assistants) takes every other fact; a circle takes the facts that name it or `alle`.
export function select(facts, name, audiences) {
  const audience = audiences[name]
  if (!audience) throw new Error(`no bundle for audience ${name}`)
  return facts.filter((fact) =>
    fact.sees.length > 0 && (audience.circle === 'any' || fact.sees.includes(audience.circle) || fact.sees.includes('alle')),
  )
}
