import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const distRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

await rewriteDirectory(distRoot)

async function rewriteDirectory(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      await rewriteDirectory(path)
      continue
    }

    if (!entry.name.endsWith('.js')) continue

    const source = await readFile(path, 'utf8')
    const rewritten = source.replace(
      /(['"])@(platform|modules)\/([^'"]+)\1/g,
      (_match, quote: string, root: string, target: string) => {
        const absoluteTarget = resolve(distRoot, 'src', root, target)
        let importPath = relative(dirname(path), absoluteTarget).replaceAll('\\', '/')
        if (!importPath.startsWith('.')) importPath = `./${importPath}`
        return `${quote}${importPath}${quote}`
      }
    )

    if (rewritten !== source) await writeFile(path, rewritten)
  }
}
