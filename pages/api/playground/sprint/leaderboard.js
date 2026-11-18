import { createSprintApiHandler } from '../../../../lib/server/sprint-api.mjs'

export const config = { api: { bodyParser: false } }
export default createSprintApiHandler('leaderboard')
