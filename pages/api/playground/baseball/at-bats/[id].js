import { createBaseballAtBatApiHandler } from '@/lib/server/baseball-at-bat-api.mjs'

export const config = { api:{ bodyParser:false } }
export default createBaseballAtBatApiHandler()
