import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const moduleNamePattern = /^[a-z][a-z0-9_]*$/
const moduleDirectories = [
  'contracts',
  'services',
  'entities',
  'controllers',
  'dto',
  'events',
  'listeners',
] as const

async function run() {
  const rawName = process.argv[2]
  if (!rawName) {
    console.error('Usage: npm run make:module <module_name>')
    process.exitCode = 1
    return
  }

  const moduleName = rawName.trim().toLowerCase()
  if (!moduleNamePattern.test(moduleName)) {
    console.error('Module name must use snake_case, for example: sales_order')
    process.exitCode = 1
    return
  }

  const modulesRoot = fileURLToPath(new URL('../src/modules/', import.meta.url))
  const targetDir = join(modulesRoot, moduleName)

  await mkdir(targetDir, { recursive: true })

  for (const dir of moduleDirectories) {
    await mkdir(join(targetDir, dir), { recursive: true })
  }

  // Create default contracts/index.ts if it doesn't exist
  const contractsIndexPath = join(targetDir, 'contracts', 'index.ts')
  const pascalName = moduleName
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')

  const contractStub = `export abstract class ${pascalName}Contract {}\n`
  await writeFile(contractsIndexPath, contractStub, { flag: 'wx' }).catch(() => {})

  // Create default <module_name>.module.ts if it doesn't exist
  const moduleFilePath = join(targetDir, `${moduleName}.module.ts`)
  const moduleStub = `import { Module } from '@nestjs/common'
import { ${pascalName}Contract } from './contracts/index.js'

@Module({
  imports: [],
  controllers: [],
  providers: [
    {
      provide: ${pascalName}Contract,
      useValue: {},
    },
  ],
  exports: [${pascalName}Contract],
})
export class ${pascalName}Module {}
`
  await writeFile(moduleFilePath, moduleStub, { flag: 'wx' }).catch(() => {})

  console.log(`Created module boundary: src/modules/${moduleName}`)
}

run().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
