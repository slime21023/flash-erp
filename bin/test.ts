process.env.NODE_ENV = 'test'

import 'reflect-metadata'
import { configure, processCLIArgs, run } from '@japa/runner'

processCLIArgs(process.argv.splice(2))

configure({
  files: ['tests/**/*.spec.ts'],
  exclude: ['node_modules/**', 'build/**'],
  forceExit: true,
  reporters: {
    activated: ['spec'],
  },
})

await run()
