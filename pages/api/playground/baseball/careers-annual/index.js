import { createBaseballCareerAnnualApiHandler } from '@/lib/server/baseball-career-annual-api.mjs'

// The project's Vercel Hobby configuration allows up to 60 seconds per function.
export const config = { maxDuration:60, api:{ bodyParser:false } }
export default createBaseballCareerAnnualApiHandler()
