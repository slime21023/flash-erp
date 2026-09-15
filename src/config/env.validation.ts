export function validateEnvironment(config: Record<string, unknown>): Record<string, unknown> {
  const port = Number(config.PORT ?? 3333)
  const dbPort = Number(config.DB_PORT ?? 5433)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('PORT is invalid')
  if (!Number.isInteger(dbPort) || dbPort < 1 || dbPort > 65_535) {
    throw new Error('DB_PORT is invalid')
  }

  if (config.NODE_ENV === 'production') {
    if (!config.DB_PASSWORD || config.DB_PASSWORD === 'flash_erp') {
      throw new Error('DB_PASSWORD must be set to a non-default value in production')
    }
    if (!config.CORS_ORIGINS) throw new Error('CORS_ORIGINS is required in production')
  }
  return config
}
