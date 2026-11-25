import { createBaseballCareerAccessApiHandler } from '@/lib/server/baseball-career-access-api.mjs'

export const config = { api:{ bodyParser:false } }
export default createBaseballCareerAccessApiHandler()
