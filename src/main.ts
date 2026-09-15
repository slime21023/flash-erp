import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { json } from 'express'
import type { NextFunction, Request, Response } from 'express'
import { AppModule } from './app.module.js'
import { AuthGuard, CsrfGuard, RbacGuard } from '@platform/security/index.js'
import { ProductionExceptionFilter } from '@platform/http/index.js'

import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'

if (typeof (BigInt.prototype as any).toJSON !== 'function') {
  ;(BigInt.prototype as any).toJSON = function () {
    return this.toString()
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false })

  app.use(json({ limit: '1mb' }))
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('X-Frame-Options', 'DENY')
    response.setHeader('Referrer-Policy', 'no-referrer')
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    if (process.env.NODE_ENV === 'production') {
      response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    }
    next()
  })
  app.useGlobalFilters(new ProductionExceptionFilter())
  app.enableShutdownHooks()

  app.useGlobalGuards(app.get(AuthGuard), app.get(CsrfGuard), app.get(RbacGuard))

  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  })

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    })
  )

  const swaggerConfig = new DocumentBuilder()
    .setTitle('FlashERP REST API')
    .setDescription('Enterprise Open-Source ERP Core API')
    .setVersion('1.0.0')
    .addBearerAuth()
    .addTag('System', 'System modules, manifest, and health')
    .addTag('Sales', 'Customers, Sales Orders, and Shipments')
    .addTag('Procurement', 'Purchase Orders, Goods Receipts, and 3-Way Match')
    .addTag('Inventory', 'Stock items, locations, ATP, and movements')
    .addTag('Manufacturing', 'BOM, Work Orders, and Overhead Costing')
    .addTag('Finance', 'Double-entry accounting, COA, and Trial Balance')
    .addTag('Treasury', 'Bank Accounts, Payments, Receipts, and Reconciliation')
    .addTag('Organization', 'Companies, Factories, and Warehouse hierarchy')
    .build()

  const document = SwaggerModule.createDocument(app, swaggerConfig)
  SwaggerModule.setup('api/docs', app, document)

  const port = process.env.PORT ?? 3333
  await app.listen(port)
  console.log(`FlashERP NestJS application is listening on port ${port}`)
  console.log(`Swagger OpenAPI documentation available at: http://localhost:${port}/api/docs`)
}

bootstrap().catch((err) => {
  console.error('Fatal error during FlashERP bootstrap:', err)
  process.exit(1)
})
