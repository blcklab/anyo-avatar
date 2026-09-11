import type { CompiledComponent, JsonValue } from '@blcklab/anyo'
import {
  ANYO_AVATAR_COMPONENT,
  HUMANOID_BONES,
  type AvatarAttachmentConfig,
  type AvatarComponentConfig,
  type AvatarForwardAxis,
  type AvatarGroundingMode,
  type AvatarLookAtConfig,
  type AvatarLookAtMode,
  type AvatarLocomotionConfig,
  type HumanoidBoneName,
} from './types.js'

const BONE_SET = new Set<string>(HUMANOID_BONES)
const GROUNDING = new Set<AvatarGroundingMode>(['none', 'feet', 'hips'])
const FORWARD = new Set<AvatarForwardAxis>(['+z', '-z', '+x', '-x'])
const LOOK_MODES = new Set<AvatarLookAtMode>(['disabled', 'target', 'camera', 'pointer', 'direction'])

export function parseAvatarComponent(component: CompiledComponent): AvatarComponentConfig {
  if (component.type !== ANYO_AVATAR_COMPONENT) throw new Error(`Expected ${ANYO_AVATAR_COMPONENT}.`)
  const data = component.data
  const humanoid = optionalBoolean(data.humanoid, true, 'humanoid')
  const bones = readBones(data.humanoidBones ?? data.bones)
  const targetHeight = optionalPositive(data.targetHeight ?? data.height, 'targetHeight')
  const grounding = optionalEnum(data.grounding, GROUNDING, 'feet', 'grounding')
  const forward = optionalEnum(data.forward, FORWARD, '-z', 'forward')
  const expressions = readExpressions(data.expressions)
  const lookAt = readLookAt(data.lookAt)
  const attachments = readAttachments(data.attachments)
  const locomotion = readLocomotion(data.locomotion)
  const metadata = isRecord(data.metadata) ? Object.freeze({ ...data.metadata }) : undefined
  return Object.freeze({
    humanoid,
    bones: Object.freeze(bones),
    ...(targetHeight !== undefined ? { targetHeight } : {}),
    grounding,
    forward,
    expressions: Object.freeze(expressions),
    lookAt,
    attachments: Object.freeze(attachments),
    locomotion,
    ...(metadata ? { metadata } : {}),
  })
}

export function avatarConfigKey(config: AvatarComponentConfig): string {
  return JSON.stringify(config)
}

function readBones(value: JsonValue | undefined): Partial<Record<HumanoidBoneName, string>> {
  if (value === undefined) return {}
  if (!isRecord(value)) throw new Error('humanoidBones must be an object.')
  const output: Partial<Record<HumanoidBoneName, string>> = {}
  for (const [bone, node] of Object.entries(value)) {
    if (!BONE_SET.has(bone)) throw new Error(`Unknown humanoid bone "${bone}".`)
    if (typeof node !== 'string' || !node.trim()) throw new Error(`humanoidBones.${bone} must be a non-empty string.`)
    output[bone as HumanoidBoneName] = node.trim()
  }
  return output
}

function readExpressions(value: JsonValue | undefined): Record<string, string | readonly string[]> {
  if (value === undefined) return {}
  if (!isRecord(value)) throw new Error('expressions must be an object.')
  const output: Record<string, string | readonly string[]> = {}
  for (const [name, raw] of Object.entries(value)) {
    if (!name.trim()) throw new Error('Expression names cannot be empty.')
    if (typeof raw === 'string' && raw.trim()) output[name] = raw.trim()
    else if (Array.isArray(raw) && raw.every((entry) => typeof entry === 'string' && entry.trim())) {
      output[name] = Object.freeze(raw.map((entry) => String(entry).trim()))
    } else throw new Error(`expressions.${name} must be a string or string array.`)
  }
  return output
}

function readLookAt(value: JsonValue | undefined): AvatarLookAtConfig {
  if (value === undefined) return defaultLookAt()
  if (typeof value === 'string') {
    if (!LOOK_MODES.has(value as AvatarLookAtMode)) throw new Error('lookAt mode is invalid.')
    return Object.freeze({ ...defaultLookAt(), mode: value as AvatarLookAtMode })
  }
  if (!isRecord(value)) throw new Error('lookAt must be a mode string or object.')
  const mode = optionalEnum(value.mode, LOOK_MODES, 'disabled', 'lookAt.mode')
  const direction = readVec3(value.direction, 'lookAt.direction')
  const targetEntity = optionalString(value.targetEntity, 'lookAt.targetEntity')
  return Object.freeze({
    mode,
    eyes: optionalBoolean(value.eyes, true, 'lookAt.eyes'),
    head: optionalBoolean(value.head, true, 'lookAt.head'),
    neck: optionalBoolean(value.neck, true, 'lookAt.neck'),
    weight: clamp(optionalFinite(value.weight, 1, 'lookAt.weight'), 0, 1),
    smoothing: Math.max(0, optionalFinite(value.smoothing, 10, 'lookAt.smoothing')),
    maxYaw: Math.max(0, optionalFinite(value.maxYaw, 60, 'lookAt.maxYaw')),
    maxPitch: Math.max(0, optionalFinite(value.maxPitch, 35, 'lookAt.maxPitch')),
    ...(targetEntity ? { targetEntity } : {}),
    ...(direction ? { direction } : {}),
  })
}

function readAttachments(value: JsonValue | undefined): Record<string, AvatarAttachmentConfig> {
  if (value === undefined) return {}
  if (!isRecord(value)) throw new Error('attachments must be an object.')
  const output: Record<string, AvatarAttachmentConfig> = {}
  for (const [slot, raw] of Object.entries(value)) {
    if (!isRecord(raw)) throw new Error(`attachments.${slot} must be an object.`)
    const entityId = optionalString(raw.entityId, `attachments.${slot}.entityId`)
    const asset = optionalString(raw.asset, `attachments.${slot}.asset`)
    const src = optionalString(raw.src, `attachments.${slot}.src`)
    if (!entityId && !asset && !src) throw new Error(`attachments.${slot} requires entityId, asset, or src.`)
    const bone = optionalString(raw.bone, `attachments.${slot}.bone`)
    output[slot] = Object.freeze({
      ...(entityId ? { entityId } : {}),
      ...(asset ? { asset } : {}),
      ...(src ? { src } : {}),
      position: readVec3(raw.position, `attachments.${slot}.position`) ?? ([0, 0, 0] as const),
      rotation: readVec3(raw.rotation, `attachments.${slot}.rotation`) ?? ([0, 0, 0] as const),
      scale: readVec3(raw.scale, `attachments.${slot}.scale`) ?? ([1, 1, 1] as const),
      ...(bone ? { bone } : {}),
    })
  }
  return output
}

function readLocomotion(value: JsonValue | undefined): AvatarLocomotionConfig {
  if (value === undefined) return Object.freeze({})
  if (!isRecord(value)) throw new Error('locomotion must be an object.')
  const keys = ['speedParameter','movingParameter','groundedParameter','directionXParameter','directionYParameter','fallingParameter','jumpTrigger'] as const
  const output: Record<string, string> = {}
  for (const key of keys) {
    const resolved = optionalString(value[key], `locomotion.${key}`)
    if (resolved) output[key] = resolved
  }
  return Object.freeze(output)
}

function defaultLookAt(): AvatarLookAtConfig {
  return Object.freeze({ mode: 'disabled', eyes: true, head: true, neck: true, weight: 1, smoothing: 10, maxYaw: 60, maxPitch: 35 })
}

function readVec3(value: JsonValue | undefined, field: string): readonly [number, number, number] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length !== 3 || !value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))) {
    throw new Error(`${field} must be a finite 3-number tuple.`)
  }
  return Object.freeze([value[0] as number, value[1] as number, value[2] as number])
}

function optionalEnum<T extends string>(value: JsonValue | undefined, values: Set<T>, fallback: T, field: string): T {
  if (value === undefined) return fallback
  if (typeof value !== 'string' || !values.has(value as T)) throw new Error(`${field} is invalid.`)
  return value as T
}

function optionalString(value: JsonValue | undefined, field: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} must be a non-empty string.`)
  return value.trim()
}

function optionalBoolean(value: JsonValue | undefined, fallback: boolean, field: string): boolean {
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') throw new Error(`${field} must be boolean.`)
  return value
}

function optionalFinite(value: JsonValue | undefined, fallback: number, field: string): number {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${field} must be finite.`)
  return value
}

function optionalPositive(value: JsonValue | undefined, field: string): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error(`${field} must be greater than zero.`)
  return value
}

function isRecord(value: unknown): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)) }
