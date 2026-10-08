import * as v from 'valibot'
import { apiBase, domainErrors } from './api_schemas.js'

export const moduleManifestSchema = v.object({
  id: v.string(),
  name: v.string(),
  version: v.string(),
  summary: v.string(),
  category: v.picklist(['Operations', 'Supply Chain', 'Financials', 'System']),
  author: v.string(),
  dependsOn: v.array(v.string()),
  installable: v.boolean(),
  autoInstall: v.boolean(),
  icon: v.optional(v.string()),
})
export const systemApiContract = {
  getModules: apiBase
    .route({
      method: 'GET',
      path: '/api/system/modules',
      tags: ['System'],
      spec: (operation) => ({ ...operation, security: [] }),
    })
    .input(v.strictObject({}))
    .output(
      v.object({
        total: v.number(),
        modules: v.array(moduleManifestSchema),
        all: v.array(moduleManifestSchema),
      })
    )
    .errors(domainErrors(['CIRCULAR_MODULE_DEPENDENCY', 'MISSING_MODULE_DEPENDENCY'])),
}
