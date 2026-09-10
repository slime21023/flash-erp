import { DynamicModule, Global, Module } from '@nestjs/common'
import { AddonRegistry } from './registry.js'
import { CustomFieldsEngine } from './custom_fields.js'
import { LifecycleHooksEngine } from './hooks.js'
import { AddonsController } from './addons.controller.js'
import type { ModuleManifest } from './manifest.js'
import { LocalPluginLoader } from './plugin_loader.js'

export const ADDON_MANIFESTS = Symbol('ADDON_MANIFESTS')

@Global()
@Module({
  controllers: [AddonsController],
  providers: [CustomFieldsEngine, LifecycleHooksEngine, LocalPluginLoader],
  exports: [CustomFieldsEngine, LifecycleHooksEngine],
})
export class AddonsModule {
  static forRoot(manifests: readonly ModuleManifest[]): DynamicModule {
    return {
      module: AddonsModule,
      providers: [
        { provide: ADDON_MANIFESTS, useValue: manifests },
        {
          provide: AddonRegistry,
          useFactory: (registered: readonly ModuleManifest[]) => {
            const registry = new AddonRegistry()
            for (const manifest of registered) registry.register(manifest)
            return registry
          },
          inject: [ADDON_MANIFESTS],
        },
      ],
      exports: [AddonRegistry, CustomFieldsEngine, LifecycleHooksEngine],
    }
  }
}
