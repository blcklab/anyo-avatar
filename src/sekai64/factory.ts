import type { AnyoAnimationPlugin } from '@blcklab/anyo-animation'
import { Sekai64Renderer } from '@blcklab/anyo/renderer-sekai64'
import { createAvatarPlugin, type AnyoAvatarPlugin } from '../plugin.js'
import type { AvatarPluginOptions } from '../types.js'
import { Sekai64AvatarAdapter, type Sekai64AvatarAdapterOptions } from './Sekai64AvatarAdapter.js'

export interface CreateSekai64AvatarPluginOptions
  extends Pick<AvatarPluginOptions, 'onDiagnostic' | 'strict'>,
    Pick<Sekai64AvatarAdapterOptions, 'metadataResolvers' | 'resolveAttachmentNode'> {
  readonly renderer: Sekai64Renderer
  readonly animation?: Pick<AnyoAnimationPlugin, 'setBoolean' | 'setNumber' | 'setTrigger'>
}

export interface Sekai64AvatarRuntime {
  readonly adapter: Sekai64AvatarAdapter
  readonly plugin: AnyoAvatarPlugin
}

export function createSekai64AvatarPlugin(options: CreateSekai64AvatarPluginOptions): Sekai64AvatarRuntime {
  const adapter = new Sekai64AvatarAdapter({
    getRenderer: () => options.renderer,
    ...(options.metadataResolvers ? { metadataResolvers: options.metadataResolvers } : {}),
    ...(options.resolveAttachmentNode ? { resolveAttachmentNode: options.resolveAttachmentNode } : {}),
  })
  const plugin = createAvatarPlugin({
    adapter,
    ...(options.animation ? { animation: options.animation } : {}),
    ...(options.onDiagnostic ? { onDiagnostic: options.onDiagnostic } : {}),
    ...(options.strict !== undefined ? { strict: options.strict } : {}),
  })
  return Object.freeze({ adapter, plugin })
}
