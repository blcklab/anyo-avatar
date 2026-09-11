import type { PluginRuntimeContext } from '@blcklab/anyo'
import {
  Sekai64Renderer,
  type Sekai64RendererNativeAccess,
} from '@blcklab/anyo/renderer-sekai64'
import { GltfModelNode } from '@blcklab/sekai64/gltf'
import { Node } from '@blcklab/sekai64'
import type {
  AvatarAttachRequest,
  AvatarAttachmentConfig,
  AvatarEntityBinding,
  AvatarMetadata,
  AvatarMetadataResolver,
  AvatarRuntimeAdapter,
} from '../types.js'
import { Sekai64AvatarBinding } from './Sekai64AvatarBinding.js'

export interface Sekai64AvatarAdapterOptions {
  readonly getRenderer: () => Sekai64Renderer
  readonly metadataResolvers?: readonly AvatarMetadataResolver[]
  readonly resolveAttachmentNode?: (config: AvatarAttachmentConfig, native: Sekai64RendererNativeAccess) => Node | null
}

export class Sekai64AvatarAdapter implements AvatarRuntimeAdapter {
  private readonly listeners = new Set<() => void>()
  private readonly bindings = new Set<Sekai64AvatarBinding>()
  private context: PluginRuntimeContext | null = null
  private assetCleanup: (() => void) | null = null

  constructor(private readonly options: Sekai64AvatarAdapterOptions) {}

  setup(context: PluginRuntimeContext): void {
    this.context = context
    this.assetCleanup?.()
    this.assetCleanup = this.options.getRenderer().onAssetProgress?.(() => this.notify()) ?? null
  }

  attachEntity(request: AvatarAttachRequest): AvatarEntityBinding | null {
    const native = this.nativeAccess()
    for (const primitiveId of request.primitiveIds) {
      const node = native.getPrimitiveNode(primitiveId)
      if (!(node instanceof GltfModelNode)) continue
      const metadata = this.resolveMetadata(node, request.entity.id)
      const binding = new Sekai64AvatarBinding(
        request.entity.id,
        node,
        request.config,
        metadata,
        (config) => {
          const custom = this.options.resolveAttachmentNode?.(config, native)
          if (custom) return custom
          if (!config.entityId) return null
          return native.scene.get(config.entityId) ?? native.getPrimitiveNode(config.entityId) ?? null
        },
        () => this.bindings.delete(binding),
      )
      this.bindings.add(binding)
      return binding
    }
    return null
  }

  update(deltaSeconds: number): void {
    for (const binding of [...this.bindings]) {
      if (!binding.isAvailable()) binding.dispose()
      else binding.updateLookAt(deltaSeconds)
    }
  }

  onAvailabilityChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  dispose(): void {
    this.assetCleanup?.()
    this.assetCleanup = null
    for (const binding of [...this.bindings]) binding.dispose()
    this.bindings.clear()
    this.listeners.clear()
    this.context = null
  }

  private nativeAccess(): Sekai64RendererNativeAccess {
    const native = this.options.getRenderer().getNativeAccess()
    if (!native) throw new Error('Sekai64 avatar integration requires a mounted Sekai64Renderer scene.')
    return native
  }

  private resolveMetadata(model: GltfModelNode, entityId: string): AvatarMetadata | undefined {
    for (const resolver of this.options.metadataResolvers ?? []) {
      const metadata = resolver({ document: model.asset.document, entityId })
      if (metadata) return metadata
    }
    return undefined
  }

  private notify(): void { for (const listener of [...this.listeners]) listener() }
}

