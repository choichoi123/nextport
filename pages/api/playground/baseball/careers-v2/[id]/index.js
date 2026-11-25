import { createBaseballCareerV2ApiHandler } from '@/lib/server/baseball-career-v2-api.mjs'

export const config = { api:{ bodyParser:false } }
export default createBaseballCareerV2ApiHandler()
