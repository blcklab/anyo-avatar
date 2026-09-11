import { GltfModelNode } from '@blcklab/sekai64/gltf'
import { Mesh, Node } from '@blcklab/sekai64'
import { SkinnedGeometry } from '@blcklab/sekai64/animation'
import {
  HUMANOID_BONES,
  type AvatarAttachmentConfig,
  type AvatarAttachmentSlot,
  type AvatarBoneBinding,
  type AvatarComponentConfig,
  type AvatarEntityBinding,
  type AvatarForwardAxis,
  type AvatarGroundingMode,
  type AvatarLookAtConfig,
  type AvatarLookTarget,
  type AvatarMeasurement,
  type AvatarMetadata,
  type HumanoidBoneName,
} from '../standalone-types.js'

const AUTO_BONE_ALIASES: Readonly<Record<HumanoidBoneName, readonly string[]>> = Object.freeze({
  hips: ['hips','pelvis','j_bip_c_hips'], spine: ['spine','spine1','j_bip_c_spine'], chest: ['chest','spine2','upperbody','j_bip_c_chest'],
  upperChest: ['upperchest','spine3','j_bip_c_upperchest'], neck: ['neck','j_bip_c_neck'], head: ['head','j_bip_c_head'],
  leftEye: ['lefteye','eye_l','j_adj_l_faceeye'], rightEye: ['righteye','eye_r','j_adj_r_faceeye'], jaw: ['jaw','mouth','j_bip_c_jaw'],
  leftShoulder: ['leftshoulder','shoulder_l','clavicle_l','j_bip_l_shoulder'], leftUpperArm: ['leftupperarm','upperarm_l','arm_l','j_bip_l_upperarm'], leftLowerArm: ['leftlowerarm','lowerarm_l','forearm_l','j_bip_l_lowerarm'], leftHand: ['lefthand','hand_l','j_bip_l_hand'],
  rightShoulder: ['rightshoulder','shoulder_r','clavicle_r','j_bip_r_shoulder'], rightUpperArm: ['rightupperarm','upperarm_r','arm_r','j_bip_r_upperarm'], rightLowerArm: ['rightlowerarm','lowerarm_r','forearm_r','j_bip_r_lowerarm'], rightHand: ['righthand','hand_r','j_bip_r_hand'],
  leftUpperLeg: ['leftupperleg','upleg_l','thigh_l','j_bip_l_upperleg'], leftLowerLeg: ['leftlowerleg','leg_l','calf_l','j_bip_l_lowerleg'], leftFoot: ['leftfoot','foot_l','j_bip_l_foot'], leftToes: ['lefttoes','toe_l','j_bip_l_toe'],
  rightUpperLeg: ['rightupperleg','upleg_r','thigh_r','j_bip_r_upperleg'], rightLowerLeg: ['rightlowerleg','leg_r','calf_r','j_bip_r_lowerleg'], rightFoot: ['rightfoot','foot_r','j_bip_r_foot'], rightToes: ['righttoes','toe_r','j_bip_r_toe'],
})

export class Sekai64AvatarBinding implements AvatarEntityBinding {
  readonly availableBones: readonly AvatarBoneBinding[]
  readonly availableExpressions: readonly string[]
  readonly metadata: AvatarMetadata | undefined
  private readonly bones = new Map<HumanoidBoneName, Node>()
  private readonly expressionTargets = new Map<string, readonly MorphBinding[]>()
  private readonly attachments = new Map<AvatarAttachmentSlot, AttachmentState>()
  private lookTarget: AvatarLookTarget | null = null
  private lookConfig: AvatarLookAtConfig
  private currentYaw = 0
  private currentPitch = 0
  private disposed = false
  private baseScale: readonly [number, number, number]
  private basePosition: readonly [number, number, number]
  private baseRotationY: number

  constructor(
    readonly entityId: string,
    private readonly model: GltfModelNode,
    config: AvatarComponentConfig,
    metadata: AvatarMetadata | undefined,
    private readonly resolveAttachmentNode: ((config: AvatarAttachmentConfig, model: GltfModelNode) => Node | null) | undefined,
    private readonly onDispose: () => void,
  ) {
    this.metadata = metadata
    this.lookConfig = config.lookAt
    this.baseScale = [model.scale.x, model.scale.y, model.scale.z]
    this.basePosition = [model.position.x, model.position.y, model.position.z]
    this.baseRotationY = model.rotation.y
    this.indexBones(config)
    this.indexExpressions(config)
    this.availableBones = Object.freeze([...this.bones].map(([humanoidBone, node]) => Object.freeze({ humanoidBone, nodeName: node.name, ...(node.id ? { nodeId: node.id } : {}) })))
    this.availableExpressions = Object.freeze([...this.expressionTargets.keys()].sort())
    model.asset.onDispose(() => this.dispose())
  }

  isAvailable(): boolean { return !this.disposed && !this.model.disposed && !this.model.asset.disposed }

  measure(): AvatarMeasurement {
    this.model.updateWorldFromRoot()
    let minY = Number.POSITIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    this.model.traverse((node) => {
      const y = worldY(node)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    })
    if (!Number.isFinite(minY) || !Number.isFinite(maxY)) { minY = 0; maxY = 0 }
    const head = this.bones.get('head')
    const hips = this.bones.get('hips')
    const leftEye = this.bones.get('leftEye')
    const rightEye = this.bones.get('rightEye')
    const eyeHeight = leftEye || rightEye ? average([leftEye, rightEye].filter(Boolean).map((node) => worldY(node as Node))) - minY : head ? worldY(head) - minY : undefined
    const hipsHeight = hips ? worldY(hips) - minY : undefined
    return Object.freeze({ height: Math.max(0, maxY - minY), ...(eyeHeight !== undefined ? { eyeHeight } : {}), ...(hipsHeight !== undefined ? { hipsHeight } : {}), minY, maxY })
  }

  normalize(options: { readonly targetHeight?: number; readonly grounding: AvatarGroundingMode; readonly forward: AvatarForwardAxis }): AvatarMeasurement {
    this.assertAlive()
    this.model.scale.set(...this.baseScale)
    this.model.position.set(...this.basePosition)
    this.model.rotation.y = this.baseRotationY + forwardYaw(options.forward)
    let measurement = this.measure()
    if (options.targetHeight && measurement.height > 1e-6) {
      const factor = options.targetHeight / measurement.height
      this.model.scale.set(this.baseScale[0] * factor, this.baseScale[1] * factor, this.baseScale[2] * factor)
      measurement = this.measure()
    }
    if (options.grounding === 'feet') this.model.position.y += -measurement.minY
    else if (options.grounding === 'hips') {
      const hips = this.bones.get('hips')
      if (hips) this.model.position.y += -worldY(hips)
    }
    return this.measure()
  }

  setExpression(name: string, weight: number): boolean {
    this.assertAlive()
    const bindings = this.expressionTargets.get(name)
    if (!bindings) return false
    for (const binding of bindings) binding.geometry.setMorphWeight(binding.target, clamp(weight, 0, 1))
    return true
  }

  resetExpressions(): void {
    if (this.disposed) return
    for (const bindings of this.expressionTargets.values()) for (const binding of bindings) binding.geometry.setMorphWeight(binding.target, 0)
  }

  setLookTarget(target: AvatarLookTarget | null, config: AvatarLookAtConfig): void {
    this.lookTarget = target
    this.lookConfig = config
  }

  updateLookAt(deltaSeconds: number): void {
    if (this.disposed || !this.lookTarget || this.lookConfig.mode === 'disabled') return
    const direction = this.lookTarget.position
    const desiredYaw = clamp(Math.atan2(direction[0], Math.abs(direction[2]) < 1e-6 ? 1e-6 : direction[2]), deg(-this.lookConfig.maxYaw), deg(this.lookConfig.maxYaw)) * this.lookConfig.weight
    const horizontal = Math.hypot(direction[0], direction[2])
    const desiredPitch = clamp(-Math.atan2(direction[1], Math.max(1e-6, horizontal)), deg(-this.lookConfig.maxPitch), deg(this.lookConfig.maxPitch)) * this.lookConfig.weight
    const alpha = this.lookConfig.smoothing <= 0 ? 1 : 1 - Math.exp(-this.lookConfig.smoothing * Math.max(0, deltaSeconds))
    this.currentYaw += (desiredYaw - this.currentYaw) * alpha
    this.currentPitch += (desiredPitch - this.currentPitch) * alpha
    if (this.lookConfig.neck) applyLook(this.bones.get('neck'), this.currentYaw * 0.25, this.currentPitch * 0.2)
    if (this.lookConfig.head) applyLook(this.bones.get('head'), this.currentYaw * 0.55, this.currentPitch * 0.5)
    if (this.lookConfig.eyes) {
      applyLook(this.bones.get('leftEye'), this.currentYaw, this.currentPitch)
      applyLook(this.bones.get('rightEye'), this.currentYaw, this.currentPitch)
    }
  }

  attach(slot: AvatarAttachmentSlot, config: AvatarAttachmentConfig): boolean {
    this.assertAlive()
    this.detach(slot)
    const node = this.resolveAttachment(config)
    const bone = this.resolveSlotBone(slot, config.bone)
    if (!node || !bone || node === this.model || node === bone) return false
    const state: AttachmentState = {
      node,
      originalParent: node.parent,
      position: [node.position.x, node.position.y, node.position.z],
      rotation: [node.rotation.x, node.rotation.y, node.rotation.z],
      scale: [node.scale.x, node.scale.y, node.scale.z],
    }
    bone.add(node)
    node.position.set(...config.position)
    node.rotation.set(deg(config.rotation[0]), deg(config.rotation[1]), deg(config.rotation[2]))
    node.scale.set(...config.scale)
    this.attachments.set(slot, state)
    return true
  }

  detach(slot: AvatarAttachmentSlot): boolean {
    const state = this.attachments.get(slot)
    if (!state) return false
    state.node.removeFromParent()
    state.originalParent?.add(state.node)
    state.node.position.set(...state.position)
    state.node.rotation.set(...state.rotation)
    state.node.scale.set(...state.scale)
    this.attachments.delete(slot)
    return true
  }

  listAttachments(): readonly AvatarAttachmentSlot[] { return Object.freeze([...this.attachments.keys()]) }

  dispose(): void {
    if (this.disposed) return
    for (const slot of [...this.attachments.keys()]) this.detach(slot)
    this.resetExpressions()
    this.disposed = true
    this.onDispose()
  }

  private indexBones(config: AvatarComponentConfig): void {
    const byName = new Map<string, Node>()
    this.model.traverse((node) => {
      for (const key of nameKeys(node)) if (!byName.has(key)) byName.set(key, node)
    })
    const metadataBones = this.metadata?.bones ?? {}
    for (const bone of HUMANOID_BONES) {
      const explicit = config.bones[bone] ?? metadataBones[bone]
      const node = explicit ? findNode(byName, explicit) : findAliases(byName, AUTO_BONE_ALIASES[bone])
      if (node) this.bones.set(bone, node)
    }
  }

  private indexExpressions(config: AvatarComponentConfig): void {
    const morphs = new Map<string, MorphBinding[]>()
    this.model.traverse((node) => {
      if (!(node instanceof Mesh) || !(node.geometry instanceof SkinnedGeometry)) return
      for (const target of node.geometry.morphTargets) {
        const key = normalizeName(target.name)
        const list = morphs.get(key) ?? []
        list.push({ geometry: node.geometry, target: target.name })
        morphs.set(key, list)
      }
    })
    for (const [key, bindings] of morphs) this.expressionTargets.set(key, Object.freeze(bindings))
    const aliases = { ...(this.metadata?.expressions ?? {}), ...config.expressions }
    for (const [alias, rawTargets] of Object.entries(aliases)) {
      const targets = typeof rawTargets === 'string' ? [rawTargets] : rawTargets
      const bindings = targets.flatMap((target) => morphs.get(normalizeName(target)) ?? [])
      if (bindings.length > 0) this.expressionTargets.set(alias, Object.freeze(bindings))
    }
  }

  private resolveAttachment(config: AvatarAttachmentConfig): Node | null {
    const custom = this.resolveAttachmentNode?.(config, this.model)
    if (custom) return custom
    if (config.entityId) return findByName(this.model, config.entityId)
    return null
  }

  private resolveSlotBone(slot: AvatarAttachmentSlot, override?: string): Node | null {
    if (override) return this.bones.get(override as HumanoidBoneName) ?? findByName(this.model, override)
    const defaults: Record<string, HumanoidBoneName> = {
      head: 'head', face: 'head', back: 'chest', chest: 'chest', hips: 'hips',
      leftHand: 'leftHand', rightHand: 'rightHand', leftFoot: 'leftFoot', rightFoot: 'rightFoot',
    }
    return this.bones.get(defaults[slot] ?? 'hips') ?? null
  }

  private assertAlive(): void { if (!this.isAvailable()) throw new Error(`Avatar binding "${this.entityId}" is disposed.`) }
}

interface MorphBinding { readonly geometry: SkinnedGeometry; readonly target: string }
interface AttachmentState {
  readonly node: Node
  readonly originalParent: Node | null
  readonly position: readonly [number, number, number]
  readonly rotation: readonly [number, number, number]
  readonly scale: readonly [number, number, number]
}

function nameKeys(node: Node): string[] { return [node.name, node.id].filter(Boolean).map(normalizeName) }
function normalizeName(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]/g, '') }
function findNode(index: ReadonlyMap<string, Node>, name: string): Node | undefined { return index.get(normalizeName(name)) }
function findAliases(index: ReadonlyMap<string, Node>, aliases: readonly string[]): Node | undefined { for (const alias of aliases) { const node = index.get(normalizeName(alias)); if (node) return node } return undefined }
function findByName(root: Node, name: string): Node | null { let match: Node | null = null; const key = normalizeName(name); root.traverse((node) => { if (!match && nameKeys(node).includes(key)) match = node }); return match }
function worldY(node: Node): number { node.updateWorldFromRoot(); const elements = node.worldMatrix.elements; return elements[13] ?? node.position.y }
function average(values: readonly number[]): number { return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length) }
function deg(value: number): number { return value * Math.PI / 180 }
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)) }
function forwardYaw(axis: AvatarForwardAxis): number { return axis === '-z' ? 0 : axis === '+z' ? Math.PI : axis === '+x' ? -Math.PI / 2 : Math.PI / 2 }
function applyLook(node: Node | undefined, yaw: number, pitch: number): void { if (!node) return; node.rotation.y = yaw; node.rotation.x = pitch }
