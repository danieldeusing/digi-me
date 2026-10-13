// The circles of people a fact may reach (spec §17.1). `alle` includes every other circle; a fact
// for no circle stays with its owner (Nur ich).
export const CIRCLES = ['familie', 'beste-freunde', 'freunde', 'arbeitsfreunde', 'arbeit', 'firmen', 'alle']

export const isCircleList = (v) => Array.isArray(v) && v.every((c) => CIRCLES.includes(c))
