// Keep the pinned v1 handler and its rule identity intact. Only the per-player
// access adapter changes which already-authorized owner reaches its RPCs.
import {createBaseballCareerApiHandler} from './baseball-career-api.mjs'
import {getBaseballCareerStore} from './baseball-career-db.mjs'
import {getBaseballCareerRecoveryStore,withBaseballCareerAccess} from './baseball-career-recovery-db.mjs'

export function createBaseballCareerAccessApiHandler(){
  return createBaseballCareerApiHandler({getStore:async config=>withBaseballCareerAccess(await getBaseballCareerStore(config),await getBaseballCareerRecoveryStore(config),{version:1})})
}
