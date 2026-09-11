import type {
  AvatarAttachmentConfig,
  AvatarAttachmentSlot,
  AvatarBoneBinding,
  AvatarComponentConfig,
  AvatarForwardAxis,
  AvatarGroundingMode,
  AvatarLookAtConfig,
  AvatarLookTarget,
  AvatarMeasurement,
  AvatarMetadata,
  HumanoidBoneName,
} from '../../contracts/index.js'
import type {
  Camera,
  Engine,
  EngineOptions,
  FrameInfo,
  Node,
  PerspectiveCamera,
  Scene,
} from '@blcklab/sekai64'
import type { AssetProgress } from '@blcklab/sekai64/assets'
import type {
  AnimationAction,
  AnimationLoopMode,
  AnimationRendererModule,
  GltfAnimationSet,
} from '@blcklab/sekai64/animation'
import type { GltfModelNode } from '@blcklab/sekai64/gltf'
import type { RendererRecoveryModule } from '@blcklab/sekai64/recovery'

export type VrmRuntimeBackend = 'auto' | 'webgl2' | 'webgpu'

export interface Sekai64VrmRuntimeOptions {
  readonly canvas: EngineOptions['canvas']
  readonly backend?: VrmRuntimeBackend
  readonly antialias?: boolean
  readonly alpha?: boolean
  readonly autoResize?: boolean
  readonly autoStart?: boolean
  readonly pixelRatio?: number
  readonly maxPixelRatio?: number
  readonly development?: boolean
  readonly clearColor?: string | number
  readonly scene?: Scene
  readonly camera?: Camera
  readonly cameraPosition?: readonly [number, number, number]
  readonly fieldOfView?: number
  readonly near?: number
  readonly far?: number
  readonly recovery?: boolean | { readonly maxAttempts?: number }
  readonly onFrame?: (frame: FrameInfo, runtime: Sekai64VrmRuntimeView) => void
  readonly onDiagnostic?: (diagnostic: StandaloneVrmDiagnostic) => void
}

export interface Sekai64VrmRuntimeView {
  readonly engine: Engine
  readonly scene: Scene
  readonly camera: Camera
  readonly animationModule: AnimationRendererModule
  readonly recoveryModule: RendererRecoveryModule | undefined
  readonly avatars: readonly StandaloneVrmAvatarView[]
}

export interface StandaloneVrmLoadOptions {
  readonly id?: string
  readonly name?: string
  readonly signal?: AbortSignal
  readonly onProgress?: (progress: AssetProgress) => void
  readonly strict?: boolean
  readonly position?: readonly [number, number, number]
  readonly rotation?: readonly [number, number, number]
  readonly scale?: readonly [number, number, number]
  readonly humanoidBones?: Readonly<Partial<Record<HumanoidBoneName, string>>>
  readonly expressions?: Readonly<Record<string, string | readonly string[]>>
  readonly targetHeight?: number
  readonly grounding?: AvatarGroundingMode
  readonly forward?: AvatarForwardAxis
  readonly lookAt?: Partial<AvatarLookAtConfig>
  readonly autoplay?: boolean
  readonly defaultClip?: string
  readonly loop?: AnimationLoopMode
  readonly speed?: number
}

export interface StandaloneVrmPlayOptions {
  readonly loop?: AnimationLoopMode
  readonly speed?: number
  readonly startTime?: number
  readonly weight?: number
}

export interface StandaloneVrmCrossFadeOptions extends StandaloneVrmPlayOptions {
  readonly duration: number
}

export interface StandaloneVrmAttachmentLoadOptions extends AvatarAttachmentConfig {
  readonly signal?: AbortSignal
  readonly onProgress?: (progress: AssetProgress) => void
}

export interface StandaloneVrmAvatarView {
  readonly id: string
  readonly model: GltfModelNode
  readonly metadata: AvatarMetadata
  readonly availableBones: readonly AvatarBoneBinding[]
  readonly availableExpressions: readonly string[]
  readonly availableClips: readonly string[]
  readonly activeClip: string | undefined
  readonly disposed: boolean
  measure(): AvatarMeasurement
}

export interface StandaloneVrmAvatarSnapshot {
  readonly version: 1
  readonly id: string
  readonly activeClip?: string
  readonly time?: number
  readonly speed: number
  readonly paused: boolean
  readonly expressions: Readonly<Record<string, number>>
  readonly lookTarget?: AvatarLookTarget
  readonly attachments: readonly AvatarAttachmentSlot[]
}

export type StandaloneVrmEvent =
  | { readonly type: 'loaded'; readonly avatar: StandaloneVrmAvatarView }
  | { readonly type: 'marker'; readonly avatar: StandaloneVrmAvatarView; readonly name: string; readonly time: number; readonly data?: unknown }
  | { readonly type: 'complete'; readonly avatar: StandaloneVrmAvatarView; readonly clip: string }
  | { readonly type: 'disposed'; readonly avatarId: string }

export interface StandaloneVrmDiagnostic {
  readonly severity: 'info' | 'warning' | 'error'
  readonly code:
    | 'ANYO_VRM_LOAD_FAILED'
    | 'ANYO_VRM_METADATA_MISSING'
    | 'ANYO_VRM_METADATA_WARNING'
    | 'ANYO_VRM_CLIP_NOT_FOUND'
    | 'ANYO_VRM_EXPRESSION_NOT_FOUND'
    | 'ANYO_VRM_ATTACHMENT_FAILED'
    | 'ANYO_VRM_RUNTIME_DISPOSED'
  readonly message: string
  readonly avatarId?: string
  readonly details?: Readonly<Record<string, unknown>>
}

export interface StandaloneVrmInternalState {
  readonly config: AvatarComponentConfig
  readonly animation: GltfAnimationSet
  readonly action: AnimationAction | null
  readonly attachmentNodes: ReadonlyMap<AvatarAttachmentSlot, Node>
}

export type StandaloneVrmCamera = PerspectiveCamera | Camera
