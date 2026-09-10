import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const modulesRoot = fileURLToPath(new URL('../src/modules/', import.meta.url))
const moduleNames = await readDirectories(modulesRoot)
const violations: string[] = []

for (const moduleName of moduleNames) {
  const moduleDir = join(modulesRoot, moduleName)
  const files = await readTypeScriptFiles(moduleDir)

  for (const file of files) {
    const source = await readFile(file, 'utf8')
    const importPattern = /from\s+['"](?:@modules|#modules)\/([^/'"]+)\/([^'"]+)['"]/g
    let match: RegExpExecArray | null

    while ((match = importPattern.exec(source)) !== null) {
      const targetModule = match[1]
      const targetPath = match[2]
      if (!targetModule || !targetPath) {
        continue
      }

      const isModuleWiring =
        file.endsWith('.module.ts') &&
        (targetPath === `${targetModule}.module.js` ||
          targetPath === `${targetModule}.module` ||
          targetPath === `${targetModule}.module.ts`)

      if (targetModule !== moduleName && !targetPath.startsWith('contracts/') && !isModuleWiring) {
        violations.push(
          `${relative(process.cwd(), file)} imports from ${targetModule}/${targetPath} instead of ${targetModule}/contracts/`
        )
      }
    }

    // Also check relative imports that cross module boundary
    const relativePattern = /from\s+['"](\.[^'"]+)['"]/g
    let relMatch: RegExpExecArray | null
    while ((relMatch = relativePattern.exec(source)) !== null) {
      const relPath = relMatch[1]
      if (!relPath) continue

      const absoluteTarget = resolve(dirname(file), relPath)
      const relToModulesRoot = relative(modulesRoot, absoluteTarget).replace(/\\/g, '/')
      if (relToModulesRoot.startsWith('..')) {
        continue
      }

      const parts = relToModulesRoot.split('/')
      const targetModule = parts[0]
      if (!targetModule || !moduleNames.includes(targetModule)) {
        continue
      }

      if (targetModule !== moduleName) {
        const restPath = parts.slice(1).join('/')
        const isModuleWiring =
          file.endsWith('.module.ts') &&
          (restPath === `${targetModule}.module` ||
            restPath === `${targetModule}.module.js` ||
            restPath === `${targetModule}.module.ts`)

        if (
          !restPath.startsWith('contracts/') &&
          !restPath.startsWith('contracts') &&
          !isModuleWiring
        ) {
          violations.push(
            `${relative(process.cwd(), file)} relatively imports ${targetModule}/${restPath} instead of contracts/`
          )
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error('Module boundary violations found:')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exitCode = 1
} else {
  console.log('Module boundary check passed. All cross-module interactions adhere to contracts/.')
}

async function readDirectories(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true })
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  } catch {
    return []
  }
}

async function readTypeScriptFiles(root: string): Promise<string[]> {
  const entries = (await readdir(root, { recursive: true })).map(String)
  return entries.filter((e) => e.endsWith('.ts')).map((e) => join(root, e))
}
