import { createBaseballApiHandler } from '@/lib/server/baseball-api.mjs'

export const config = { api:{ bodyParser:false } }
export default createBaseballApiHandler()
