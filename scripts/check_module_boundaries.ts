import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const allowedApiFiles =
  /^(?:src\/api_contract\.ts|src\/modules\/[^/]+\/contracts\/[^/]+_api_contract\.ts|src\/platform\/http\/(?:api_schemas|system_api_contract)\.ts)$/
const allowedApiPackages = new Set(['@orpc/contract', 'valibot'])

export async function checkModuleBoundaries(projectRoot: string): Promise<string[]> {
  const modulesRoot = join(projectRoot, 'src', 'modules')
  const moduleNames = await readDirectories(modulesRoot)
  const violations: string[] = []
  const apiEntries = [join(projectRoot, 'src', 'api_contract.ts')]

  for (const moduleName of moduleNames) {
    for (const file of await readTypeScriptFiles(join(modulesRoot, moduleName))) {
      if (file.endsWith('_api_contract.ts')) apiEntries.push(file)
      const source = await readFile(file, 'utf8')
      for (const dependency of dependencies(source, file)) {
        if (!dependency) continue
        const target = resolveLocalImport(file, dependency, projectRoot)
        if (!target) continue
        const path = relative(modulesRoot, target).replace(/\\/g, '/')
        if (path.startsWith('../')) continue
        const [targetModule, ...parts] = path.split('/')
        if (!targetModule || !moduleNames.includes(targetModule) || targetModule === moduleName)
          continue
        const targetPath = parts.join('/')
        const isModuleWiring =
          file.endsWith('.module.ts') && targetPath === `${targetModule}.module.ts`
        if (!targetPath.startsWith('contracts/') && !isModuleWiring) {
          violations.push(
            `${relative(projectRoot, file)} imports ${dependency} instead of ${targetModule}/contracts/`
          )
        }
      }
    }
  }

  const visited = new Set<string>()
  async function visitApi(file: string): Promise<void> {
    if (visited.has(file)) return
    visited.add(file)
    const path = relative(projectRoot, file).replace(/\\/g, '/')
    if (!allowedApiFiles.test(path)) {
      violations.push(`Browser API contract graph imports server-only or unapproved file: ${path}`)
      return
    }
    let source: string
    try {
      source = await readFile(file, 'utf8')
    } catch {
      violations.push(`Browser API contract file is missing: ${path}`)
      return
    }
    for (const dependency of dependencies(source, file)) {
      if (!dependency) {
        violations.push(`${path} has a non-literal dependency in the browser API contract graph`)
        continue
      }
      const target = resolveLocalImport(file, dependency, projectRoot)
      if (target) {
        await visitApi(target)
      } else if (!allowedApiPackages.has(dependency)) {
        violations.push(`${path} imports unapproved browser API package: ${dependency}`)
      }
    }
  }
  for (const entry of apiEntries) await visitApi(entry)
  return violations
}

function dependencies(source: string, file: string): (string | undefined)[] {
  const imports: (string | undefined)[] = []
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const add = (node: ts.Node | undefined) =>
    imports.push(node && ts.isStringLiteralLike(node) ? node.text : undefined)
  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) add(node.moduleSpecifier)
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      add(node.argument.literal)
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      add(node.moduleReference.expression)
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      add(node.arguments[0])
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return imports
}

function resolveLocalImport(
  file: string,
  specifier: string,
  projectRoot: string
): string | undefined {
  let target: string
  if (specifier.startsWith('.')) {
    target = resolve(dirname(file), specifier)
  } else if (/^(?:@|#)(?:modules|platform)\//.test(specifier)) {
    target = resolve(projectRoot, 'src', specifier.slice(1))
  } else if (specifier.startsWith('@/')) {
    target = resolve(projectRoot, 'src', specifier.slice(2))
  } else {
    return undefined
  }
  return /\.(?:js|ts)$/.test(target) ? target.replace(/\.js$/, '.ts') : `${target}.ts`
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
  return entries.filter((entry) => entry.endsWith('.ts')).map((entry) => join(root, entry))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const violations = await checkModuleBoundaries(fileURLToPath(new URL('../', import.meta.url)))
  if (violations.length > 0) {
    console.error('Architecture violations found:')
    for (const violation of violations) console.error(`- ${violation}`)
    process.exitCode = 1
  } else {
    console.log('Architecture check passed: module boundaries and browser API contract graph.')
  }
}
