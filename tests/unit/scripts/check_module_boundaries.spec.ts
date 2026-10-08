import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'vitest'
import { checkModuleBoundaries } from '../../../scripts/check_module_boundaries.js'

test('architecture check keeps browser API contracts free of server imports, including transitive dependencies', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flasherp-architecture-'))
  async function source(path: string, content: string) {
    const file = join(root, path)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, content)
  }
  const contractPath = 'src/modules/alpha/contracts/alpha_api_contract.ts'
  const safeContract = [
    'import * as v from "valibot"',
    'export { idSchema } from "../../../platform/http/api_schemas.js"',
    'void import("valibot")',
    'export const alphaApiContract = {}',
  ].join('\n')
  try {
    await source(
      'src/api_contract.ts',
      'export { alphaApiContract } from "./modules/alpha/contracts/alpha_api_contract.js"'
    )
    await source(
      'src/platform/http/api_schemas.ts',
      'import { oc } from "@orpc/contract"; export const idSchema = oc'
    )
    await source(contractPath, safeContract)
    await source('src/modules/beta/entities/secret.entity.ts', 'export class SecretEntity {}')
    await source('src/modules/beta/beta.module.ts', 'export class BetaModule {}')
    assert.deepEqual(await checkModuleBoundaries(root), [])

    for (const unsafeImport of [
      'export * from "./index.js"',
      'import { SecretEntity } from "@modules/beta/entities/secret.entity.js"',
      'import { Controller } from "@nestjs/common"',
      'void import("node:fs")',
      'const target = "valibot"; void import(target)',
      'type Manager = import("typeorm").EntityManager',
      'require("node:crypto")',
    ]) {
      await source(contractPath, `${safeContract}\n${unsafeImport}`)
      assert.ok((await checkModuleBoundaries(root)).length > 0, unsafeImport)
    }

    await source(contractPath, safeContract)
    await source('src/platform/http/api_schemas.ts', 'export * from "node:fs"')
    assert.ok(
      (await checkModuleBoundaries(root)).some((violation) => violation.includes('node:fs'))
    )

    await source('src/platform/http/api_schemas.ts', 'export const idSchema = {}')
    await source(
      'src/modules/alpha/alpha.module.ts',
      'import { BetaModule } from "@modules/beta/beta.module.js"'
    )
    assert.deepEqual(await checkModuleBoundaries(root), [])
    await source(
      'src/modules/alpha/services/private.ts',
      'export { SecretEntity } from "../../beta/entities/secret.entity.js"'
    )
    assert.ok(
      (await checkModuleBoundaries(root)).some((violation) =>
        violation.includes('instead of beta/contracts/')
      )
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
