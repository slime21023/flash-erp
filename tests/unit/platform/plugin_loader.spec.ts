import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'vitest'
import {
  AddonRegistry,
  CustomFieldsEngine,
  LifecycleHooksEngine,
  LocalPluginLoader,
} from '@platform/addons/index.js'

test('local plugin loader discovers a manifest and runs setup/dispose lifecycle', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flasherp-plugin-'))
  const pluginDirectory = join(root, 'plugin-a')
  const previousDirectory = process.env.FLASHERP_PLUGIN_DIR
  process.env.FLASHERP_PLUGIN_DIR = root

  try {
    await mkdir(pluginDirectory)
    await writeFile(
      join(pluginDirectory, 'manifest.json'),
      JSON.stringify({
        apiVersion: '1',
        id: 'plugin-a',
        name: 'Plugin A',
        version: '1.0.0',
        summary: 'test plugin',
        category: 'Operations',
        author: 'test',
        dependsOn: [],
        installable: true,
        autoInstall: false,
        entry: 'entry.mjs',
      })
    )
    await writeFile(
      join(pluginDirectory, 'entry.mjs'),
      "export default { setup: ({ customFields }) => customFields.registerFields('PluginEntity', [{ name: 'enabled', label: 'Enabled', type: 'boolean' }]), dispose: async () => {} }"
    )

    const registry = new AddonRegistry()
    const customFields = new CustomFieldsEngine()
    const loader = new LocalPluginLoader(registry, customFields, new LifecycleHooksEngine())
    await loader.onModuleInit()

    assert.equal(registry.getManifest('plugin-a')?.id, 'plugin-a')
    assert.deepEqual(customFields.getFields('PluginEntity'), [
      { name: 'enabled', label: 'Enabled', type: 'boolean' },
    ])
    await loader.onModuleDestroy()
  } finally {
    if (previousDirectory === undefined) delete process.env.FLASHERP_PLUGIN_DIR
    else process.env.FLASHERP_PLUGIN_DIR = previousDirectory
    await rm(root, { recursive: true, force: true })
  }
})
