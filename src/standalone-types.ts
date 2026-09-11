export type AvatarJsonPrimitive = string | number | boolean | null
export type AvatarJsonValue = AvatarJsonPrimitive | AvatarJsonValue[] | { readonly [key: string]: AvatarJsonValue }

export const ANYO_AVATAR_COMPONENT = 'anyo.avatar' as const
export const ANYO_AVATAR_SNAPSHOT_VERSION = 1 as const

export const HUMANOID_BONES = Object.freeze([
  'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
  'leftEye', 'rightEye', 'jaw',
  'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand',
  'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
  'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'leftToes',
  'rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'rightToes',
] as const)

export type HumanoidBoneName = typeof HUMANOID_BONES[number]
export type AvatarGroundingMode = 'none' | 'feet' | 'hips'
export type AvatarForwardAxis = '+z' | '-z' | '+x' | '-x'
export type AvatarLookAtMode = 'disabled' | 'target' | 'camera' | 'pointer' | 'direction'
export type AvatarAttachmentSlot =
  | 'head' | 'face' | 'back' | 'chest' | 'hips'
  | 'leftHand' | 'rightHand' | 'leftFoot' | 'rightFoot'
  | string

export interface AvatarLookAtConfig {
  readonly mode: AvatarLookAtMode
  readonly eyes: boolean
  readonly head: boolean
  readonly neck: boolean
  readonly weight: number
  readonly smoothing: number
  readonly maxYaw: number
  readonly maxPitch: number
  readonly targetEntity?: string
  readonly direction?: readonly [number, number, number]
}

export interface AvatarAttachmentConfig {
  readonly entityId?: string
  readonly asset?: string
  readonly src?: string
  readonly position: readonly [number, number, number]
  readonly rotation: readonly [number, number, number]
  readonly scale: readonly [number, number, number]
  readonly bone?: HumanoidBoneName | string
}

export interface AvatarLocomotionConfig {
  readonly speedParameter?: string
  readonly movingParameter?: string
  readonly groundedParameter?: string
  readonly directionXParameter?: string
  readonly directionYParameter?: string
  readonly fallingParameter?: string
  readonly jumpTrigger?: string
}

export interface AvatarComponentConfig {
  readonly humanoid: boolean
  readonly bones: Readonly<Partial<Record<HumanoidBoneName, string>>>
  readonly targetHeight?: number
  readonly grounding: AvatarGroundingMode
  readonly forward: AvatarForwardAxis
  readonly expressions: Readonly<Record<string, string | readonly string[]>>
  readonly lookAt: AvatarLookAtConfig
  readonly attachments: Readonly<Record<AvatarAttachmentSlot, AvatarAttachmentConfig>>
  readonly locomotion: AvatarLocomotionConfig
  readonly metadata?: Readonly<Record<string, AvatarJsonValue>>
}

export interface AvatarMeasurement {
  readonly height: number
  readonly eyeHeight?: number
  readonly hipsHeight?: number
  readonly minY: number
  readonly maxY: number
}

export interface AvatarBoneBinding {
  readonly humanoidBone: HumanoidBoneName
  readonly nodeName: string
  readonly nodeId?: string
}

export interface AvatarExpressionBinding {
  readonly name: string
  readonly targets: readonly string[]
}

export interface AvatarMetadata {
  readonly format: 'generic' | 'vrm0' | 'vrm1' | string
  readonly bones?: Readonly<Partial<Record<HumanoidBoneName, string>>>
  readonly expressions?: Readonly<Record<string, string | readonly string[]>>
  readonly lookAt?: Partial<AvatarLookAtConfig>
  readonly firstPerson?: Readonly<Record<string, AvatarJsonValue>>
  readonly springBones?: Readonly<Record<string, AvatarJsonValue>>
  readonly license?: Readonly<Record<string, AvatarJsonValue>>
  readonly raw?: Readonly<Record<string, AvatarJsonValue>>
}

export interface AvatarMetadataResolverContext {
  readonly document: unknown
  readonly entityId: string
}

export type AvatarMetadataResolver = (
  context: AvatarMetadataResolverContext,
) => AvatarMetadata | null | undefined

export interface AvatarLookTarget {
  readonly position: readonly [number, number, number]
}

export interface AvatarLocomotionState {
  readonly speed?: number
  readonly moving?: boolean
  readonly grounded?: boolean
  readonly directionX?: number
  readonly directionY?: number
  readonly falling?: boolean
  readonly jump?: boolean
}

export interface AvatarEntityBinding {
  readonly entityId: string
  readonly availableBones: readonly AvatarBoneBinding[]
  readonly availableExpressions: readonly string[]
  readonly metadata: AvatarMetadata | undefined
  isAvailable?(): boolean
  measure(): AvatarMeasurement
  normalize(options: {
    readonly targetHeight?: number
    readonly grounding: AvatarGroundingMode
    readonly forward: AvatarForwardAxis
  }): AvatarMeasurement
  setExpression(name: string, weight: number): boolean
  resetExpressions(): void
  setLookTarget(target: AvatarLookTarget | null, config: AvatarLookAtConfig): void
  updateLookAt?(deltaSeconds: number): void
  attach(slot: AvatarAttachmentSlot, config: AvatarAttachmentConfig): boolean
  detach(slot: AvatarAttachmentSlot): boolean
  listAttachments?(): readonly AvatarAttachmentSlot[]
  dispose(): void
}

