import * as v from 'valibot'
import {
  apiBase,
  domainErrors,
  idSchema,
  timestampSchema,
} from '../../../platform/http/api_schemas.js'

export const principalSchema = v.object({
  id: idSchema,
  username: v.string(),
  displayName: v.string(),
  isActive: v.boolean(),
  roles: v.array(v.string()),
  organizationUnitIds: v.array(v.string()),
})
export const authSessionSchema = v.object({
  accessToken: v.string(),
  expiresAt: timestampSchema,
  user: principalSchema,
})
export const browserSessionSchema = v.omit(authSessionSchema, ['accessToken'])

export const identityApiContract = {
  login: apiBase
    .route({
      method: 'POST',
      path: '/api/identity/login',
      tags: ['Identity'],
      spec: (operation) => ({ ...operation, security: [] }),
    })
    .input(
      v.strictObject({
        username: v.pipe(idSchema, v.maxLength(96)),
        password: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
      })
    )
    .output(authSessionSchema)
    .errors(domainErrors(['AUTHENTICATION_FAILED'])),
  session: apiBase
    .route({ method: 'GET', path: '/api/identity/session', tags: ['Identity'] })
    .input(v.strictObject({}))
    .output(principalSchema),
  register: apiBase
    .route({ method: 'POST', path: '/api/identity/users', successStatus: 201, tags: ['Identity'] })
    .input(
      v.strictObject({
        id: idSchema,
        username: idSchema,
        displayName: idSchema,
        password: v.pipe(v.string(), v.minLength(12), v.maxLength(128)),
      })
    )
    .output(
      v.object({
        id: idSchema,
        username: v.string(),
        displayName: v.string(),
        isActive: v.boolean(),
      })
    )
    .errors(domainErrors(['INVALID_IDENTITY_INPUT', 'IDENTITY_ALREADY_EXISTS'])),
  logout: apiBase
    .route({ method: 'POST', path: '/api/identity/logout', successStatus: 204, tags: ['Identity'] })
    .input(v.strictObject({}))
    .output(v.void())
    .errors(domainErrors(['AUTHENTICATION_FAILED'])),
}
