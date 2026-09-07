import env from '#start/env'
import { defineConfig } from '@adonisjs/lucid'

export default defineConfig({
  connection: 'postgres',
  connections: {
    postgres: {
      client: 'pg',
      migrations: {
        paths: [
          './database/migrations/modules/organization',
          './database/migrations/modules/platform',
          './database/migrations/modules/finance',
        ],
      },
      connection: {
        host: env.get('DB_HOST'),
        port: env.get('DB_PORT'),
        user: env.get('DB_USER'),
        password: env.get('DB_PASSWORD'),
        database: env.get('DB_DATABASE'),
      },
      pool: {
        min: 1,
        max: 10,
      },
    },
  },
})
