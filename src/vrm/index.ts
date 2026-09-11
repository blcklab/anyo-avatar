import type {
  AvatarLookAtConfig,
  AvatarMetadata,
  AvatarMetadataResolver,
  HumanoidBoneName,
} from '../contracts/index.js'
import type { VrmMetadataResolverOptions, VrmParseResult } from './types.js'

export const VRM1_EXTENSION = 'VRMC_vrm' as const
export const VRM0_EXTENSION = 'VRM' as const
export const VRM_SPRING_BONE_EXTENSION = 'VRMC_springBone' as const

export function createVrmMetadataResolver(options: VrmMetadataResolverOptions = {}): AvatarMetadataResolver {
  return ({ document }) => {
    const result = parseVrmMetadata(document, options)
    return result?.metadata
  }
}

export function parseVrmMetadata(document: unknown, options: VrmMetadataResolverOptions = {}): VrmParseResult | null {
  if (!isRecord(document)) return null
  const extensions = record(document.extensions)
  const vrm1 = record(extensions?.[VRM1_EXTENSION])
  const vrm0 = record(extensions?.[VRM0_EXTENSION])
  if (!vrm1 && !vrm0) return null
  const warnings: string[] = []
  const warn = (message: string) => { warnings.push(message); options.onWarning?.(message); if (options.strict) throw new Error(message) }
  const nodes = array(document.nodes)
  const meshes = array(document.meshes)
  const metadata = vrm1
    ? parseVrm1(vrm1, extensions ?? {}, nodes, meshes, warn)
    : parseVrm0(vrm0 as Record<string, unknown>, nodes, meshes, warn)
  return Object.freeze({ metadata, warnings: Object.freeze(warnings) })
}

function parseVrm1(
  vrm: Record<string, unknown>,
  rootExtensions: Record<string, unknown>,
  nodes: readonly unknown[],
  meshes: readonly unknown[],
  warn: (message: string) => void,
): AvatarMetadata {
  const humanBones = record(record(vrm.humanoid)?.humanBones)
  const bones: Partial<Record<HumanoidBoneName, string>> = {}
  for (const [bone, input] of Object.entries(humanBones ?? {})) {
    const nodeIndex = finiteIndex(record(input)?.node)
    const name = nodeName(nodes, nodeIndex)
    if (isHumanoidBone(bone) && name) bones[bone] = name
    else if (isHumanoidBone(bone)) warn(`VRM 1.0 bone "${bone}" references a missing node.`)
  }
  const expressions = parseVrm1Expressions(record(vrm.expressions), nodes, meshes, warn)
  const lookAt = parseLookAt(record(vrm.lookAt))
  const firstPerson = jsonRecord(record(vrm.firstPerson))
  const springBones = jsonRecord(record(rootExtensions[VRM_SPRING_BONE_EXTENSION]))
  const license = jsonRecord(record(vrm.meta))
  return Object.freeze({
    format: 'vrm1',
    bones: Object.freeze(bones),
    expressions: Object.freeze(expressions),
    ...(lookAt ? { lookAt } : {}),
    ...(firstPerson ? { firstPerson } : {}),
    ...(springBones ? { springBones } : {}),
    ...(license ? { license } : {}),
    raw: Object.freeze({ extension: VRM1_EXTENSION, specVersion: jsonValue(vrm.specVersion) ?? null }),
  })
}

function parseVrm0(
  vrm: Record<string, unknown>,
  nodes: readonly unknown[],
  meshes: readonly unknown[],
  warn: (message: string) => void,
): AvatarMetadata {
  const humanBones = array(record(vrm.humanoid)?.humanBones)
  const bones: Partial<Record<HumanoidBoneName, string>> = {}
  for (const input of humanBones) {
    const entry = record(input)
    const bone = string(entry?.bone)
    const nodeIndex = finiteIndex(entry?.node)
    const name = nodeName(nodes, nodeIndex)
    if (bone && isHumanoidBone(bone) && name) bones[bone] = name
    else if (bone && isHumanoidBone(bone)) warn(`VRM 0.x bone "${bone}" references a missing node.`)
  }
  const expressions = parseVrm0Expressions(record(vrm.blendShapeMaster), meshes, warn)
  const firstPerson = jsonRecord(record(vrm.firstPerson))
  const springBones = jsonRecord(record(vrm.secondaryAnimation))
  const license = jsonRecord(record(vrm.meta))
  return Object.freeze({
    format: 'vrm0', bones: Object.freeze(bones), expressions: Object.freeze(expressions),
    ...(firstPerson ? { firstPerson } : {}), ...(springBones ? { springBones } : {}), ...(license ? { license } : {}),
    raw: Object.freeze({ extension: VRM0_EXTENSION }),
  })
}

function parseVrm1Expressions(
  expressionsRoot: Record<string, unknown> | undefined,
  nodes: readonly unknown[],
  meshes: readonly unknown[],
  warn: (message: string) => void,
): Record<string, string | readonly string[]> {
  const output: Record<string, string | readonly string[]> = {}
  for (const bucket of ['preset', 'custom']) {
    for (const [name, input] of Object.entries(record(expressionsRoot?.[bucket]) ?? {})) {
      const targets = new Set<string>()
      for (const bind of array(record(input)?.morphTargetBinds)) {
        const entry = record(bind)
        const nodeIndex = finiteIndex(entry?.node)
        const targetIndex = finiteIndex(entry?.index)
        if (nodeIndex === undefined || targetIndex === undefined) { warn(`VRM 1.0 expression "${name}" contains an invalid morph target bind.`); continue }
        const node = record(nodes[nodeIndex])
        const meshIndex = finiteIndex(node?.mesh)
        if (meshIndex === undefined || !meshes[meshIndex]) { warn(`VRM 1.0 expression "${name}" references a missing mesh.`); continue }
        targets.add(`target-${targetIndex}`)
      }
      if (targets.size > 0) output[name] = Object.freeze([...targets])
    }
  }
  return output
}

function parseVrm0Expressions(
  master: Record<string, unknown> | undefined,
  meshes: readonly unknown[],
  warn: (message: string) => void,
): Record<string, string | readonly string[]> {
  const output: Record<string, string | readonly string[]> = {}
  for (const group of array(master?.blendShapeGroups)) {
    const entry = record(group)
    const name = string(entry?.presetName) || string(entry?.name)
    if (!name) continue
    const targets = new Set<string>()
    for (const bind of array(entry?.binds)) {
      const binding = record(bind)
      const mesh = finiteIndex(binding?.mesh)
      const index = finiteIndex(binding?.index)
      if (mesh === undefined || index === undefined || !meshes[mesh]) { warn(`VRM 0.x expression "${name}" contains an invalid bind.`); continue }
      targets.add(`target-${index}`)
    }
    if (targets.size > 0) output[name] = Object.freeze([...targets])
  }
  return output
}

function parseLookAt(value: Record<string, unknown> | undefined): Partial<AvatarLookAtConfig> | undefined {
  if (!value) return undefined
  const type = string(value.type)
  return Object.freeze({
    mode: 'target', eyes: true, head: type !== 'expression', neck: true,
  })
}

function nodeName(nodes: readonly unknown[], index: number | undefined): string | undefined {
  if (index === undefined) return undefined
  const node = record(nodes[index])
  return string(node?.name) || `node-${index}`
}

function isHumanoidBone(value: string): value is HumanoidBoneName {
  return new Set(['hips','spine','chest','upperChest','neck','head','leftEye','rightEye','jaw','leftShoulder','leftUpperArm','leftLowerArm','leftHand','rightShoulder','rightUpperArm','rightLowerArm','rightHand','leftUpperLeg','leftLowerLeg','leftFoot','leftToes','rightUpperLeg','rightLowerLeg','rightFoot','rightToes']).has(value)
}

function jsonRecord(value: Record<string, unknown> | undefined): Readonly<Record<string, VrmJsonValue>> | undefined {
  if (!value) return undefined
  const output: Record<string, VrmJsonValue> = {}
  for (const [key, input] of Object.entries(value)) { const resolved = jsonValue(input); if (resolved !== undefined) output[key] = resolved }
  return Object.freeze(output)
}

function jsonValue(value: unknown): VrmJsonValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) { const output: VrmJsonValue[] = []; for (const entry of value) { const resolved = jsonValue(entry); if (resolved !== undefined) output.push(resolved) } return output }
  if (isRecord(value)) { const output: Record<string, VrmJsonValue> = {}; for (const [key, entry] of Object.entries(value)) { const resolved = jsonValue(entry); if (resolved !== undefined) output[key] = resolved } return output }
  return undefined
}

function record(value: unknown): Record<string, unknown> | undefined { return isRecord(value) ? value : undefined }
function array(value: unknown): readonly unknown[] { return Array.isArray(value) ? value : [] }
function string(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim() : undefined }
function finiteIndex(value: unknown): number | undefined { return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }

export * from './types.js'

type VrmJsonPrimitive = string | number | boolean | null
type VrmJsonValue = VrmJsonPrimitive | VrmJsonValue[] | { [key: string]: VrmJsonValue }
