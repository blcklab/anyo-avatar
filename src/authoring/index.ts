import type { ComponentDefinition, EntityDefinition, JsonValue } from '@blcklab/anyo'
import { parseAvatarComponent } from '../schema.js'
import {
  ANYO_AVATAR_COMPONENT,
  HUMANOID_BONES,
  type AvatarComponentConfig,
  type AvatarDiagnostic,
  type AvatarForwardAxis,
  type AvatarGroundingMode,
  type AvatarLookAtMode,
  type HumanoidBoneName,
} from '../types.js'

export interface AvatarAuthoringValidationResult {
  readonly valid: boolean
  readonly diagnostics: readonly AvatarDiagnostic[]
  readonly config?: AvatarComponentConfig
}

export interface AvatarBoneCoverage {
  readonly mapped: readonly HumanoidBoneName[]
  readonly missingRequired: readonly HumanoidBoneName[]
  readonly completeness: number
}

const REQUIRED: readonly HumanoidBoneName[] = Object.freeze([
  'hips', 'spine', 'head',
  'leftUpperArm', 'leftLowerArm', 'leftHand',
  'rightUpperArm', 'rightLowerArm', 'rightHand',
  'leftUpperLeg', 'leftLowerLeg', 'leftFoot',
  'rightUpperLeg', 'rightLowerLeg', 'rightFoot',
])

export function createAvatarComponentDefinition(overrides: Readonly<Record<string, JsonValue>> = {}): ComponentDefinition {
  return {
    type: ANYO_AVATAR_COMPONENT,
    enabled: true,
    humanoid: true,
    targetHeight: 1.7,
    grounding: 'feet',
    forward: '-z',
    humanoidBones: {},
    expressions: {},
    lookAt: {
      mode: 'disabled', eyes: true, head: true, neck: true,
      weight: 1, smoothing: 10, maxYaw: 60, maxPitch: 35,
    },
    attachments: {},
    locomotion: {},
    ...overrides,
  }
}

export function validateAvatarComponentData(data: Readonly<Record<string, JsonValue>>): AvatarAuthoringValidationResult {
  try {
    const config = parseAvatarComponent({ type: ANYO_AVATAR_COMPONENT, enabled: true, data, sourcePath: '/components/anyo.avatar' })
    return Object.freeze({ valid: true, diagnostics: Object.freeze([]), config })
  } catch (error) {
    return Object.freeze({
      valid: false,
      diagnostics: Object.freeze([{
        severity: 'error' as const, code: 'ANYO_AVATAR_COMPONENT_INVALID' as const,
        message: error instanceof Error ? error.message : String(error),
      }]),
    })
  }
}

export function findAvatarComponent(entity: EntityDefinition): { component: ComponentDefinition; index: number } | null {
  const index = entity.components?.findIndex((component) => component.type === ANYO_AVATAR_COMPONENT) ?? -1
  if (index < 0) return null
  return { component: entity.components?.[index] as ComponentDefinition, index }
}

export function ensureAvatarComponent(entity: EntityDefinition): EntityDefinition {
  if (findAvatarComponent(entity)) return entity
  return { ...entity, components: [...(entity.components ?? []), createAvatarComponentDefinition()] }
}

export function avatarBoneCoverage(bones: Readonly<Partial<Record<HumanoidBoneName, string>>>): AvatarBoneCoverage {
  const mapped = HUMANOID_BONES.filter((bone) => Boolean(bones[bone]))
  const missingRequired = REQUIRED.filter((bone) => !bones[bone])
  return Object.freeze({
    mapped: Object.freeze(mapped),
    missingRequired: Object.freeze(missingRequired),
    completeness: REQUIRED.length === 0 ? 1 : (REQUIRED.length - missingRequired.length) / REQUIRED.length,
  })
}

export const AVATAR_GROUNDING_OPTIONS: readonly AvatarGroundingMode[] = Object.freeze(['none', 'feet', 'hips'])
export const AVATAR_FORWARD_OPTIONS: readonly AvatarForwardAxis[] = Object.freeze(['-z', '+z', '+x', '-x'])
export const AVATAR_LOOK_AT_OPTIONS: readonly AvatarLookAtMode[] = Object.freeze(['disabled', 'target', 'camera', 'pointer', 'direction'])
