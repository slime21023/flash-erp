import * as v from 'valibot'
import { apiBase, domainErrors, idSchema } from '../../../platform/http/api_schemas.js'

const organizationKindSchema = v.picklist(['COMPANY', 'PLANT', 'WAREHOUSE'])
export const organizationUnitSchema = v.strictObject({
  id: idSchema,
  code: idSchema,
  name: idSchema,
  kind: organizationKindSchema,
  parentId: v.nullable(idSchema),
})

export const organizationApiContract = {
  units: {
    register: apiBase
      .route({ method: 'POST', path: '/api/organization/units', successStatus: 201 })
      .input(
        v.strictObject({
          id: idSchema,
          code: idSchema,
          name: idSchema,
          kind: organizationKindSchema,
          parentId: v.nullish(v.string()),
        })
      )
      .output(organizationUnitSchema)
      .errors(
        domainErrors([
          'INVALID_ORGANIZATION_UNIT',
          'ORGANIZATION_UNIT_ALREADY_EXISTS',
          'ORGANIZATION_UNIT_NOT_FOUND',
        ])
      ),
    find: apiBase
      .route({ method: 'GET', path: '/api/organization/units/{id}' })
      .input(v.strictObject({ id: idSchema }))
      .output(organizationUnitSchema)
      .errors(domainErrors(['ORGANIZATION_UNIT_NOT_FOUND'])),
  },
}
