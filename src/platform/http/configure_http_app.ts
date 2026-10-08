import { UnsupportedMediaTypeException, type INestApplication } from '@nestjs/common'
import { json, type NextFunction, type Request, type Response } from 'express'
import { AuthGuard, CsrfGuard, RbacGuard } from '../security/index.js'
import { ProductionExceptionFilter } from './production_exception.filter.js'

export function configureHttpApp(app: INestApplication): void {
  app.use((request: Request, response: Response, next: NextFunction) => {
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('X-Frame-Options', 'DENY')
    response.setHeader('Referrer-Policy', 'no-referrer')
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    if (process.env.NODE_ENV === 'production')
      response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    next()
  })
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    exposedHeaders: ['x-request-id'],
  })
  app.use((request: Request, _response: Response, next: NextFunction) => {
    const hasBody =
      Number(request.headers['content-length'] ?? 0) > 0 ||
      request.headers['transfer-encoding'] !== undefined
    if (hasBody && !request.is('application/json')) return next(new UnsupportedMediaTypeException())
    next()
  })
  app.use(json({ limit: '1mb' }))
  app.useGlobalFilters(new ProductionExceptionFilter())
  app.useGlobalGuards(app.get(AuthGuard), app.get(CsrfGuard), app.get(RbacGuard))
}
