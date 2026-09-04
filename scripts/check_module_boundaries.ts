import { readFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const appModulesRoot = fileURLToPath(new URL('../app/modules/', import.meta.url))
const moduleNames = await readDirectories(appModulesRoot)
const violations: string[] = []

for (const moduleName of moduleNames) {
  const moduleRoot = join(appModulesRoot, moduleName)
  const files = await readTypeScriptFiles(moduleRoot)

  for (const file of files) {
    const source = await readFile(file, 'utf8')
    const importPattern = /from\s+['"]#modules\/([^/'"]+)\/([^'"]+)['"]/g
    let match: RegExpExecArray | null

    while ((match = importPattern.exec(source)) !== null) {
      const targetModule = match[1]
      const targetPath = match[2]
      if (!targetModule || !targetPath) {
        continue
      }

      if (targetModule !== moduleName && !targetPath.startsWith('contracts/')) {
        violations.push(
          `${relative(process.cwd(), file)} imports #modules/${targetModule}/${targetPath}`
        )
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
  console.log('Module boundary check passed.')
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
  const entries = await readdir(root, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await readTypeScriptFiles(path)))
    } else if (entry.name.endsWith('.ts')) {
      files.push(path)
    }
  }

  return files
}
