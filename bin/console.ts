import 'reflect-metadata'
import { Ignitor, prettyPrintError } from '@adonisjs/core'

const appRoot = new URL('../', import.meta.url)

const importer = (filePath: string) => {
  if (filePath.startsWith('./') || filePath.startsWith('../')) {
    return import(new URL(filePath, appRoot).href)
  }

  return import(filePath)
}

new Ignitor(appRoot, { importer })
  .tap((app) => {
    app.booting(async () => {
      await import('#start/env')
    })

    app.listen('SIGTERM', () => app.terminate())
    app.listenIf(app.managedByPm2, 'SIGINT', () => app.terminate())
  })
  .ace()
  .handle(process.argv.splice(2))
  .catch((error) => {
    process.exitCode = 1
    prettyPrintError(error)
  })
