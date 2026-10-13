import { handle } from './handler.mjs'

export default { fetch: (request, env) => handle(request, env) }
