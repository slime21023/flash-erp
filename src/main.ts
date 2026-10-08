import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import type { Response } from 'express'
import swaggerUi from 'swagger-ui-express'
import { AppModule } from './app.module.js'
import { configureHttpApp } from './platform/http/configure_http_app.js'
import { createOpenApiDocument } from './platform/http/openapi_document.js'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false })
  configureHttpApp(app)
  app.enableShutdownHooks()

  const document = await createOpenApiDocument()
  app.use('/api/openapi.json', (_request: unknown, response: Response) => response.json(document))
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(document))

  const port = process.env.PORT ?? 3333
  await app.listen(port)
  console.log(`FlashERP is listening on port ${port}; API documentation: /api/docs`)
}

bootstrap().catch((error) => {
  console.error('Fatal error during FlashERP bootstrap:', error)
  process.exit(1)
})
