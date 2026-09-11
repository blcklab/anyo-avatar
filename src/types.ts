import type {
  CompiledEntityNode,
  PluginRuntimeContext,
} from '@blcklab/anyo'
import { ANYO_AVATAR_SNAPSHOT_VERSION } from './standalone-types.js'
import type {
  AvatarAttachmentSlot,
  AvatarBoneBinding,
  AvatarComponentConfig,
  AvatarEntityBinding,
  AvatarLocomotionState,
  AvatarLookTarget,
  AvatarMeasurement,
} from './standalone-types.js'

export * from './standalone-types.js'

export interface AvatarAttachRequest {
  readonly entity: CompiledEntityNode
  readonly primitiveIds: readonly string[]
  readonly config: AvatarComponentConfig
  readonly context: PluginRuntimeContext
}

export interface AvatarRuntimeAdapter {
  setup?(context: PluginRuntimeContext): void | Promise<void>
  attachEntity(request: AvatarAttachRequest): AvatarEntityBinding | null
  update?(deltaSeconds: number): void
  onAvailabilityChange?(listener: () => void): () => void
  dispose?(): void | Promise<void>
}

export interface AvatarAnimationBridge {
  setBoolean(entityId: string, parameter: string, value: boolean): boolean
  setNumber(entityId: string, parameter: string, value: number): boolean
  setTrigger(entityId: string, parameter: string): boolean
}

export type AvatarDiagnosticCode =
  | 'ANYO_AVATAR_COMPONENT_INVALID'
  | 'ANYO_AVATAR_ENTITY_NOT_FOUND'
  | 'ANYO_AVATAR_COMPONENT_NOT_FOUND'
  | 'ANYO_AVATAR_ASSET_PENDING'
  | 'ANYO_AVATAR_BONE_MISSING'
  | 'ANYO_AVATAR_BONE_DUPLICATE'
  | 'ANYO_AVATAR_EXPRESSION_NOT_FOUND'
  | 'ANYO_AVATAR_ATTACHMENT_FAILED'
  | 'ANYO_AVATAR_LOOK_AT_INVALID'
  | 'ANYO_AVATAR_NORMALIZATION_INVALID'
  | 'ANYO_AVATAR_ADAPTER_ERROR'
  | 'ANYO_AVATAR_SNAPSHOT_INVALID'

export interface AvatarDiagnostic {
  readonly severity: 'info' | 'warning' | 'error'
  readonly code: AvatarDiagnosticCode
  readonly message: string
  readonly entityId?: string
  readonly details?: Readonly<Record<string, unknown>>
}

export interface AvatarEntitySnapshot {
  readonly entityId: string
  readonly status: 'pending' | 'ready'
  readonly measurement?: AvatarMeasurement
  readonly bones: readonly AvatarBoneBinding[]
  readonly expressions: Readonly<Record<string, number>>
  readonly lookTarget?: AvatarLookTarget
  readonly attachments: readonly AvatarAttachmentSlot[]
  readonly metadataFormat?: string
}

export interface AvatarEntityRuntimeSnapshot {
  readonly entityId: string
  readonly expressions: Readonly<Record<string, number>>
  readonly lookTarget?: AvatarLookTarget
  readonly locomotion: AvatarLocomotionState
}

export interface AvatarRuntimeSnapshot {
  readonly version: typeof ANYO_AVATAR_SNAPSHOT_VERSION
  readonly entities: readonly AvatarEntityRuntimeSnapshot[]
}

export interface AvatarPluginOptions {
  readonly adapter: AvatarRuntimeAdapter
  readonly animation?: AvatarAnimationBridge
  readonly onDiagnostic?: (diagnostic: AvatarDiagnostic) => void
  readonly strict?: boolean
}
