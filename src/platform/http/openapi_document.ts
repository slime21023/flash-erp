import { OpenAPIGenerator } from '@orpc/openapi'
import { experimental_ValibotToJsonSchemaConverter } from '@orpc/valibot'
import { apiContract } from '../../api_contract.js'

export function createOpenApiDocument() {
  return new OpenAPIGenerator({
    schemaConverters: [new experimental_ValibotToJsonSchemaConverter()],
  }).generate(apiContract, {
    info: { title: 'FlashERP API', version: '1.0.0' },
    servers: [{ url: '/' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer' },
        cookieAuth: { type: 'apiKey', in: 'cookie', name: 'flash_erp_session' },
      },
    },
    security: [{ bearerAuth: [] }, { cookieAuth: [] }],
  })
}
