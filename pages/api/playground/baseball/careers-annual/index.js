import { createBaseballCareerAnnualApiHandler } from '@/lib/server/baseball-career-annual-api.mjs'

export const config = { maxDuration:180, api:{ bodyParser:false } }
export default createBaseballCareerAnnualApiHandler()
