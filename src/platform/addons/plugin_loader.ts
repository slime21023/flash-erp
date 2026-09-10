import { readdir, readFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { CustomFieldsEngine } from './custom_fields.js'
import { AddonRegistry } from './registry.js'
import type { ModuleManifest } from './manifest.js'
import { LifecycleHooksEngine } from './hooks.js'

export const ADDON_API_VERSION = '1'

export type LocalPluginManifest = ModuleManifest &
  Readonly<{
    apiVersion: string
    entry: string
  }>

export type AddonPluginContext = Readonly<{
  registry: AddonRegistry
  customFields: CustomFieldsEngine
  hooks: LifecycleHooksEngine
}>

export type AddonPlugin = Readonly<{
  setup?: (context: AddonPluginContext) => void | Promise<void>
  dispose?: (context: AddonPluginContext) => void | Promise<void>
}>

type LoadedPlugin = Readonly<{
  manifest: LocalPluginManifest
  plugin: AddonPlugin
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertManifest(value: unknown, pluginDirectory: string): LocalPluginManifest {
  if (!isRecord(value)) throw new Error(`Invalid plugin manifest: ${pluginDirectory}`)

  const requiredStrings = [
    'id',
    'name',
    'version',
    'summary',
    'category',
    'author',
    'apiVersion',
    'entry',
  ]
  for (const field of requiredStrings) {
    if (typeof value[field] !== 'string' || value[field].trim().length === 0) {
      throw new Error(`Plugin manifest field '${field}' is required: ${pluginDirectory}`)
    }
  }

  if (value.apiVersion !== ADDON_API_VERSION) {
    throw new Error(`Unsupported plugin API version '${value.apiVersion}': ${pluginDirectory}`)
  }

  const id = value.id as string
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    throw new Error(`Invalid plugin id '${id}': ${pluginDirectory}`)
  }

  const dependsOn = value.dependsOn
  if (!Array.isArray(dependsOn) || dependsOn.some((dependency) => typeof dependency !== 'string')) {
    throw new Error(`Plugin dependsOn must be an array of strings: ${pluginDirectory}`)
  }
  if (new Set(dependsOn).size !== dependsOn.length) {
    throw new Error(`Plugin dependencies must be unique: ${pluginDirectory}`)
  }

  return {
    id,
    name: value.name as string,
    version: value.version as string,
    summary: value.summary as string,
    category: value.category as LocalPluginManifest['category'],
    author: value.author as string,
    dependsOn,
    installable: value.installable === true,
    autoInstall: value.autoInstall === true,
    ...(typeof value.icon === 'string' ? { icon: value.icon } : {}),
    apiVersion: value.apiVersion as string,
    entry: value.entry as string,
  }
}

@Injectable()
export class LocalPluginLoader implements OnModuleInit, OnModuleDestroy {
  private readonly loaded: LoadedPlugin[] = []

  constructor(
    private readonly registry: AddonRegistry,
    private readonly customFields: CustomFieldsEngine,
    private readonly hooks: LifecycleHooksEngine
  ) {}

  async onModuleInit(): Promise<void> {
    const root = resolve(process.env.FLASHERP_PLUGIN_DIR ?? join(process.cwd(), 'plugins'))
    const enabled = this.enabledPlugins()
    const discovered = await this.discover(root, enabled)

    if (enabled) {
      const discoveredIds = new Set(discovered.map(({ manifest }) => manifest.id))
      for (const id of enabled) {
        if (!discoveredIds.has(id)) throw new Error(`Enabled plugin was not found: ${id}`)
      }
    }

    for (const item of discovered) {
      if (this.registry.getManifest(item.manifest.id)) {
        throw new Error(`Duplicate addon id: ${item.manifest.id}`)
      }
      this.registry.register(item.manifest)
    }

    const dependencies = this.registry.resolveDependencies()
    if (dependencies.isErr) throw new Error(dependencies.error.message)

    const context: AddonPluginContext = {
      registry: this.registry,
      customFields: this.customFields,
      hooks: this.hooks,
    }
    const byId = new Map(discovered.map((item) => [item.manifest.id, item]))
    for (const manifest of dependencies.value) {
      const item = byId.get(manifest.id)
      if (!item) continue
      await item.plugin.setup?.(context)
      this.loaded.push(item)
    }
  }

  async onModuleDestroy(): Promise<void> {
    const context: AddonPluginContext = {
      registry: this.registry,
      customFields: this.customFields,
      hooks: this.hooks,
    }
    for (const item of [...this.loaded].reverse()) await item.plugin.dispose?.(context)
  }

  private enabledPlugins(): Set<string> | undefined {
    const raw = process.env.FLASHERP_ENABLED_PLUGINS
    if (raw === undefined) return undefined
    return new Set(
      raw
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    )
  }

  private async discover(root: string, enabled: Set<string> | undefined): Promise<LoadedPlugin[]> {
    let entries
    try {
      entries = await readdir(root, { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }

    const plugins: LoadedPlugin[] = []
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      if (enabled && !enabled.has(entry.name)) continue

      const pluginDirectory = resolve(root, entry.name)
      const manifest = assertManifest(
        JSON.parse(await readFile(join(pluginDirectory, 'manifest.json'), 'utf8')),
        pluginDirectory
      )
      if (manifest.id !== entry.name) {
        throw new Error(`Plugin directory and manifest id differ: ${pluginDirectory}`)
      }

      const entryPath = resolve(pluginDirectory, manifest.entry)
      const relativeEntry = relative(pluginDirectory, entryPath)
      if (
        isAbsolute(manifest.entry) ||
        relativeEntry.startsWith('..') ||
        isAbsolute(relativeEntry) ||
        !/\.(?:m?js)$/.test(entryPath)
      ) {
        throw new Error(
          `Plugin entry must stay inside its directory and be JavaScript: ${pluginDirectory}`
        )
      }

      const imported = await import(pathToFileURL(entryPath).href)
      const candidate = imported.default ?? imported
      const plugin: AddonPlugin =
        typeof candidate === 'function'
          ? { setup: candidate }
          : isRecord(candidate)
            ? candidate
            : {}
      plugins.push({ manifest, plugin })
    }
    return plugins
  }
}
