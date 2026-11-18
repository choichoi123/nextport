import { createSprintMaintenanceHandler } from '../../../../lib/server/sprint-maintenance.mjs'

export const config = { api: { bodyParser: false } }
export default createSprintMaintenanceHandler()
