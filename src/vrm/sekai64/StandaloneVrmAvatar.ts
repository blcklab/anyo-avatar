import type {
  AvatarAttachmentConfig,
  AvatarAttachmentSlot,
  AvatarLookAtConfig,
  AvatarLookTarget,
  AvatarMetadata,
} from '../../contracts/index.js'
import { Sekai64AvatarBinding } from '../../sekai64-binding/index.js'
import type { Node, Scene } from '@blcklab/sekai64'
import type {
  AnimationAction,
  AnimationLoopMode,
  GltfAnimationSet,
} from '@blcklab/sekai64/animation'
import type { GltfModelNode } from '@blcklab/sekai64/gltf'
import type {
  StandaloneVrmAvatarSnapshot,
  StandaloneVrmAvatarView,
  StandaloneVrmCrossFadeOptions,
  StandaloneVrmDiagnostic,
  StandaloneVrmEvent,
  StandaloneVrmPlayOptions,
} from './types.js'

export interface StandaloneVrmAvatarOptions {
  readonly id: string
  readonly model: GltfModelNode
  readonly scene: Scene
  readonly metadata: AvatarMetadata
  readonly binding: Sekai64AvatarBinding
  readonly animation: GltfAnimationSet
  readonly lookAt: AvatarLookAtConfig
  readonly onEvent: (event: StandaloneVrmEvent) => void
  readonly onDiagnostic: (diagnostic: StandaloneVrmDiagnostic) => void
  readonly onDispose: () => void
}

export class StandaloneVrmAvatar implements StandaloneVrmAvatarView {
  readonly model: GltfModelNode
  readonly metadata: AvatarMetadata
  readonly availableBones
  readonly availableExpressions
  readonly availableClips: readonly string[]
  disposed = false
  activeClip: string | undefined
  private action: AnimationAction | null = null
  private readonly clipIds = new Map<string, string>()
  private readonly expressions = new Map<string, number>()
  private readonly ownedAttachments = new Map<AvatarAttachmentSlot, Node>()
  private readonly cleanups: Array<() => void> = []
  private lookTarget: AvatarLookTarget | null = null
  private speed = 1
  private paused = false

  constructor(private readonly options: StandaloneVrmAvatarOptions) {
    this.model = options.model
    this.metadata = options.metadata
    this.availableBones = options.binding.availableBones
    this.availableExpressions = options.binding.availableExpressions
    const clips: string[] = []
    for (const clip of options.animation.clips) {
      this.clipIds.set(clip.id, clip.id)
      this.clipIds.set(clip.name, clip.id)
      clips.push(clip.id)
      if (clip.name !== clip.id) clips.push(clip.name)
    }
    this.availableClips = Object.freeze([...new Set(clips)])
    const mixer = options.animation.mixer
    if (mixer) {
      this.cleanups.push(
        mixer.on('marker', ({ action, marker }) => {
          if (action !== this.action) return
          options.onEvent({ type: 'marker', avatar: this, name: marker.name, time: marker.time, ...(marker.data !== undefined ? { data: marker.data } : {}) })
        }),
        mixer.on('complete', ({ action }) => {
          if (action !== this.action) return
          options.onEvent({ type: 'complete', avatar: this, clip: action.clip.name })
        }),
      )
    }
  }

  get id(): string { return this.options.id }

  measure() { return this.options.binding.measure() }

  play(clip: string, options: StandaloneVrmPlayOptions = {}): this {
    this.assertAlive()
    const mixer = this.requireMixer()
    const clipId = this.resolveClip(clip)
    mixer.stopAll()
    this.speed = finitePositiveOrZero(options.speed ?? this.speed, 'speed')
    this.action = mixer.play(clipId, {
      loop: options.loop ?? 'repeat',
      speed: this.speed,
      ...(options.startTime !== undefined ? { startTime: finitePositiveOrZero(options.startTime, 'startTime') } : {}),
      ...(options.weight !== undefined ? { weight: finitePositiveOrZero(options.weight, 'weight') } : {}),
    })
    this.paused = false
    this.activeClip = clip
    return this
  }

  crossFadeTo(clip: string, options: StandaloneVrmCrossFadeOptions): this {
    this.assertAlive()
    if (!this.action || options.duration <= 0) return this.play(clip, options)
    const clipId = this.resolveClip(clip)
    const next = this.action.crossFadeTo(clipId, { duration: finitePositiveOrZero(options.duration, 'duration') })
    next.loop = options.loop ?? this.action.loop
    next.speed = finitePositiveOrZero(options.speed ?? this.speed, 'speed')
    if (options.startTime !== undefined) next.seek(finitePositiveOrZero(options.startTime, 'startTime'))
    if (options.weight !== undefined) next.setWeight(finitePositiveOrZero(options.weight, 'weight'))
    this.action = next
    this.speed = next.speed
    this.paused = false
    this.activeClip = clip
    return this
  }

  pause(): this { this.assertAlive(); this.action?.pause(); this.paused = true; return this }
  resume(): this { this.assertAlive(); this.action?.resume(); this.paused = false; return this }
  stop(): this { if (!this.disposed) { this.action?.stop(); this.action = null; this.activeClip = undefined; this.paused = false } return this }
  seek(time: number): this { this.assertAlive(); this.action?.seek(finitePositiveOrZero(time, 'time')); return this }
  setSpeed(speed: number): this { this.assertAlive(); this.speed = finitePositiveOrZero(speed, 'speed'); if (this.action) this.action.speed = this.speed; return this }
  getTime(): number | undefined { return this.action?.time }
  getDuration(): number | undefined { return this.action?.clip.duration }

  setExpression(name: string, weight: number): boolean {
    this.assertAlive()
    const resolved = clamp(weight, 0, 1)
    const applied = this.options.binding.setExpression(name, resolved)
    if (applied) this.expressions.set(name, resolved)
    else this.options.onDiagnostic({ severity: 'warning', code: 'ANYO_VRM_EXPRESSION_NOT_FOUND', message: `VRM expression "${name}" is unavailable.`, avatarId: this.id })
    return applied
  }

  clearExpression(name: string): boolean {
    this.assertAlive()
    this.expressions.delete(name)
    return this.options.binding.setExpression(name, 0)
  }

  resetExpressions(): this { this.assertAlive(); this.expressions.clear(); this.options.binding.resetExpressions(); return this }

  lookAt(target: AvatarLookTarget | readonly [number, number, number] | null, config: Partial<AvatarLookAtConfig> = {}): this {
    this.assertAlive()
    this.lookTarget = target === null ? null : Object.freeze({ position: Object.freeze(isVec3(target) ? [...target] : [...target.position]) as readonly [number, number, number] })
    this.options.binding.setLookTarget(this.lookTarget, Object.freeze({ ...this.options.lookAt, ...config }))
    return this
  }

  update(deltaSeconds: number): void { if (!this.disposed) this.options.binding.updateLookAt?.(Math.max(0, deltaSeconds)) }

  attachNode(slot: AvatarAttachmentSlot, node: Node, config: Omit<AvatarAttachmentConfig, 'entityId' | 'asset' | 'src'>): boolean {
    this.assertAlive()
    if (!node.id) throw new Error('Standalone attachment nodes require a stable id.')
    if (!node.parent) this.options.scene.add(node)
    const applied = this.options.binding.attach(slot, { entityId: node.id, ...config })
    if (applied) this.ownedAttachments.set(slot, node)
    else this.options.onDiagnostic({ severity: 'warning', code: 'ANYO_VRM_ATTACHMENT_FAILED', message: `VRM attachment "${slot}" could not be mounted.`, avatarId: this.id })
    return applied
  }

  detach(slot: AvatarAttachmentSlot, dispose = false): boolean {
    this.assertAlive()
    const node = this.ownedAttachments.get(slot)
    const detached = this.options.binding.detach(slot)
    if (detached) this.ownedAttachments.delete(slot)
    if (detached && dispose) node?.dispose()
    return detached
  }

  listAttachments(): readonly AvatarAttachmentSlot[] { return this.options.binding.listAttachments?.() ?? [] }

  createSnapshot(): StandaloneVrmAvatarSnapshot {
    this.assertAlive()
    return Object.freeze({
      version: 1,
      id: this.id,
      ...(this.activeClip ? { activeClip: this.activeClip } : {}),
      ...(this.action ? { time: this.action.time } : {}),
      speed: this.speed,
      paused: this.paused,
      expressions: Object.freeze(Object.fromEntries(this.expressions)),
      ...(this.lookTarget ? { lookTarget: this.lookTarget } : {}),
      attachments: Object.freeze([...this.listAttachments()]),
    })
  }

  restoreSnapshot(snapshot: StandaloneVrmAvatarSnapshot): this {
    this.assertAlive()
    if (snapshot.version !== 1 || snapshot.id !== this.id) throw new Error(`Snapshot does not belong to avatar "${this.id}".`)
    this.resetExpressions()
    for (const [name, weight] of Object.entries(snapshot.expressions)) this.setExpression(name, weight)
    if (snapshot.lookTarget) this.lookAt(snapshot.lookTarget)
    if (snapshot.activeClip) {
      this.play(snapshot.activeClip, { speed: snapshot.speed, ...(snapshot.time !== undefined ? { startTime: snapshot.time } : {}) })
      if (snapshot.paused) this.pause()
    }
    return this
  }

  dispose(): void {
    if (this.disposed) return
    this.stop()
    this.disposed = true
    for (const cleanup of this.cleanups.splice(0).reverse()) cleanup()
    for (const slot of [...this.ownedAttachments.keys()]) this.detachDuringDispose(slot)
    this.options.binding.dispose()
    this.model.removeFromParent()
    this.model.dispose()
    this.options.onDispose()
    this.options.onEvent({ type: 'disposed', avatarId: this.id })
  }

  private detachDuringDispose(slot: AvatarAttachmentSlot): void {
    const node = this.ownedAttachments.get(slot)
    this.options.binding.detach(slot)
    this.ownedAttachments.delete(slot)
    node?.dispose()
  }

  private resolveClip(reference: string): string {
    const clipId = this.clipIds.get(reference)
    if (!clipId) {
      const message = `VRM animation clip "${reference}" is unavailable. Available clips: ${this.availableClips.join(', ') || 'none'}.`
      this.options.onDiagnostic({ severity: 'error', code: 'ANYO_VRM_CLIP_NOT_FOUND', message, avatarId: this.id })
      throw new Error(message)
    }
    return clipId
  }

  private requireMixer() {
    const mixer = this.options.animation.mixer
    if (!mixer) throw new Error(`VRM avatar "${this.id}" has no animation mixer.`)
    return mixer
  }

  private assertAlive(): void { if (this.disposed) throw new Error(`VRM avatar "${this.id}" is disposed.`) }
}

function finitePositiveOrZero(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field} must be a finite number greater than or equal to zero.`)
  return value
}
function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) throw new Error('Expression weight must be finite.')
  return Math.max(min, Math.min(max, value))
}

function isVec3(value: AvatarLookTarget | readonly [number, number, number]): value is readonly [number, number, number] { return Array.isArray(value) }
