import { createBaseballCareerRecoveryHandler } from '@/lib/server/baseball-career-recovery-api.mjs'

export const config={api:{bodyParser:false}}
export default createBaseballCareerRecoveryHandler({mode:'redeem'})
