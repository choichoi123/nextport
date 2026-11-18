import { createSprintApiHandler } from '../../../../lib/server/sprint-api.mjs'

// The shared handler parses JSON with a strict 128 KiB cap and JSON error responses.
export const config = { api: { bodyParser: false } }
export default createSprintApiHandler('attempts')
