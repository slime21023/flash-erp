import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { args, BaseCommand } from '@adonisjs/core/ace'

const moduleNamePattern = /^[a-z][a-z0-9_]*$/
const moduleDirectories = [
  'contracts',
  'services',
  'models',
  'controllers',
  'validators',
  'events',
  'listeners',
] as const

export default class MakeModule extends BaseCommand {
  static commandName = 'make:module'
  static description = 'Create a FlashERP business module boundary'
  static options = {
    startApp: false,
    staysAlive: false,
  }

  @args.string({ description: 'Module name in snake_case' })
  declare name: string

  async run() {
    const moduleName = this.name.trim().toLowerCase()
    if (!moduleNamePattern.test(moduleName)) {
      this.logger.error('Module name must use snake_case, for example: sales_order')
      this.exitCode = 1
      return
    }

    const moduleRoot = fileURLToPath(new URL(`./app/modules/${moduleName}/`, this.app.appRoot))
    await mkdir(moduleRoot, { recursive: true })

    for (const directory of moduleDirectories) {
      await mkdir(`${moduleRoot}/${directory}`, { recursive: true })
    }

    this.logger.success(`Created module boundary: app/modules/${moduleName}`)
  }
}
