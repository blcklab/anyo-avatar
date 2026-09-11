import {
  PerspectiveCamera,
  createEngine,
  createScene,
  type Camera,
  type Engine,
  type Scene,
} from '@blcklab/sekai64'
import { AssetManager } from '@blcklab/sekai64/assets'
import {
  GLTF_ANIMATION_EXTENSION_ID,
  createAnimationRendererModule,
  createGltfAnimationAdapter,
  type GltfAnimationSet,
} from '@blcklab/sekai64/animation'
import { GltfLoader } from '@blcklab/sekai64/gltf'
import { createRendererRecoveryModule, type RendererRecoveryModule } from '@blcklab/sekai64/recovery'
import {
  Sekai64AvatarBinding,
} from '../../sekai64-binding/index.js'
import type {
  AvatarComponentConfig,
  AvatarLookAtConfig,
  AvatarMetadata,
} from '../../contracts/index.js'
import { parseVrmMetadata } from '../index.js'
import { StandaloneVrmAvatar } from './StandaloneVrmAvatar.js'
import type {
  Sekai64VrmRuntimeOptions,
  Sekai64VrmRuntimeView,
  StandaloneVrmAttachmentLoadOptions,
  StandaloneVrmDiagnostic,
  StandaloneVrmEvent,
  StandaloneVrmLoadOptions,
} from './types.js'

export class Sekai64VrmRuntime implements Sekai64VrmRuntimeView {
  readonly engine: Engine
  readonly scene: Scene
  readonly camera: Camera
  readonly animationModule
  readonly recoveryModule: RendererRecoveryModule | undefined
  private readonly loader: GltfLoader
  private readonly records = new Map<string, StandaloneVrmAvatar>()
  private readonly eventListeners = new Set<(event: StandaloneVrmEvent) => void>()
  private running = false
  private disposed = false
  private nextId = 1
  private readonly ownsScene: boolean
  private readonly ownsCamera: boolean

  private constructor(
    private readonly options: Sekai64VrmRuntimeOptions,
    engine: Engine,
    scene: Scene,
    camera: Camera,
    animation: ReturnType<typeof createAnimationRendererModule>,
    recovery?: RendererRecoveryModule,
  ) {
    this.engine = engine
    this.scene = scene
    this.camera = camera
    this.animationModule = animation
    this.recoveryModule = recovery
    this.loader = new GltfLoader(new AssetManager())
    this.ownsScene = !options.scene
    this.ownsCamera = !options.camera
  }

  static async create(options: Sekai64VrmRuntimeOptions): Promise<Sekai64VrmRuntime> {
    const animation = createAnimationRendererModule()
    const recovery = options.recovery
      ? createRendererRecoveryModule(typeof options.recovery === 'object' ? options.recovery : {})
      : undefined
    const modules = recovery ? [animation, recovery] : [animation]
    const engine = await createEngine({
      canvas: options.canvas,
      renderer: options.backend ?? 'auto',
      modules,
      ...(options.antialias !== undefined ? { antialias: options.antialias } : {}),
      ...(options.alpha !== undefined ? { alpha: options.alpha } : {}),
      ...(options.autoResize !== undefined ? { autoResize: options.autoResize } : {}),
      ...(options.pixelRatio !== undefined ? { pixelRatio: options.pixelRatio } : {}),
      ...(options.maxPixelRatio !== undefined ? { maxPixelRatio: options.maxPixelRatio } : {}),
      ...(options.development !== undefined ? { development: options.development } : {}),
    })
    const scene = options.scene ?? createScene({ name: 'Standalone VRM scene' })
    const camera = options.camera ?? createDefaultCamera(options)
    const runtime = new Sekai64VrmRuntime(options, engine, scene, camera, animation, recovery)
    if (options.clearColor !== undefined) engine.setClearColor(options.clearColor)
    if (options.autoStart !== false) runtime.start(options.onFrame)
    return runtime
  }

  get avatars(): readonly StandaloneVrmAvatar[] { return Object.freeze([...this.records.values()]) }

  async load(source: string | URL, options: StandaloneVrmLoadOptions = {}): Promise<StandaloneVrmAvatar> {
    this.assertAlive()
    const id = options.id?.trim() || `vrm-avatar-${this.nextId++}`
    if (this.records.has(id)) throw new Error(`A standalone VRM avatar with id "${id}" already exists.`)
    let model
    try {
      model = await this.loader.loadNode(source, {
        id,
        name: options.name ?? id,
        ...(options.signal ? { signal: options.signal } : {}),
        ...(options.onProgress ? { onProgress: options.onProgress } : {}),
        ...(options.strict !== undefined ? { strict: options.strict } : {}),
        animation: createGltfAnimationAdapter(this.animationModule),
      })
      applyTransform(model, options)
      const parsed = parseVrmMetadata(model.asset.document, {
        ...(options.strict !== undefined ? { strict: options.strict } : {}),
        onWarning: (message) => this.report({ severity: 'warning', code: 'ANYO_VRM_METADATA_WARNING', message, avatarId: id }),
      })
      if (!parsed) throw new Error('The loaded glTF document does not contain VRM 0.x or VRM 1.0 metadata.')
      const metadata = parsed.metadata
      const config = createAvatarConfig(metadata, options)
      this.scene.add(model)
      let avatar: StandaloneVrmAvatar
      const binding = new Sekai64AvatarBinding(
        id,
        model,
        config,
        metadata,
        (attachment) => attachment.entityId ? this.scene.get(attachment.entityId) ?? null : null,
        () => undefined,
      )
      binding.normalize({
        ...(config.targetHeight !== undefined ? { targetHeight: config.targetHeight } : {}),
        grounding: config.grounding,
        forward: config.forward,
      })
      const animation = model.asset.getExtension<GltfAnimationSet>(GLTF_ANIMATION_EXTENSION_ID)
        ?? Object.freeze({ clips: Object.freeze([]), skeletons: Object.freeze([]) })
      avatar = new StandaloneVrmAvatar({
        id,
        model,
        scene: this.scene,
        metadata,
        binding,
        animation,
        lookAt: config.lookAt,
        onEvent: (event) => this.emit(event),
        onDiagnostic: (diagnostic) => this.report(diagnostic),
        onDispose: () => this.records.delete(id),
      })
      this.records.set(id, avatar)
      if (options.autoplay !== false && animation.clips.length > 0) {
        const clip = options.defaultClip ?? animation.clips[0]?.name ?? animation.clips[0]?.id
        if (clip) avatar.play(clip, { loop: options.loop ?? 'repeat', speed: options.speed ?? 1 })
      }
      this.emit({ type: 'loaded', avatar })
      return avatar
    } catch (error) {
      model?.dispose()
      this.report({ severity: 'error', code: 'ANYO_VRM_LOAD_FAILED', message: errorMessage(error), avatarId: id, details: { source: String(source) } })
      throw error
    }
  }

  async loadAttachment(avatarId: string, slot: string, source: string | URL, options: StandaloneVrmAttachmentLoadOptions): Promise<boolean> {
    this.assertAlive()
    const avatar = this.requireAvatar(avatarId)
    const node = await this.loader.loadNode(source, {
      id: `${avatarId}:attachment:${slot}`,
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.onProgress ? { onProgress: options.onProgress } : {}),
      animatedFallback: 'static-pose',
    })
    this.scene.add(node)
    const applied = avatar.attachNode(slot, node, {
      position: options.position,
      rotation: options.rotation,
      scale: options.scale,
      ...(options.bone ? { bone: options.bone } : {}),
    })
    if (!applied) node.dispose()
    return applied
  }

  get(id: string): StandaloneVrmAvatar | undefined { return this.records.get(id) }

  remove(id: string): boolean {
    const avatar = this.records.get(id)
    if (!avatar) return false
    avatar.dispose()
    return true
  }

  start(onFrame?: Sekai64VrmRuntimeOptions['onFrame']): void {
    this.assertAlive()
    if (this.running) return
    this.running = true
    this.engine.start((frame) => {
      for (const avatar of this.records.values()) avatar.update(frame.deltaTime)
      onFrame?.(frame, this)
      this.engine.render(this.scene, this.camera)
    })
  }

  stop(): void { if (!this.disposed) { this.engine.stop(); this.running = false } }

  render(): void { this.assertAlive(); this.engine.render(this.scene, this.camera) }

  onEvent(listener: (event: StandaloneVrmEvent) => void): () => void {
    this.eventListeners.add(listener)
    return () => { this.eventListeners.delete(listener) }
  }

  async recover(reason?: unknown): Promise<void> {
    this.assertAlive()
    if (!this.recoveryModule) throw new Error('Renderer recovery was not enabled for this standalone VRM runtime.')
    await this.recoveryModule.recover(reason)
  }

  async disposeAsync(): Promise<void> {
    if (this.disposed) return
    this.stop()
    this.disposed = true
    for (const avatar of [...this.records.values()]) avatar.dispose()
    this.records.clear()
    this.eventListeners.clear()
    this.loader.dispose()
    if (this.ownsScene) this.scene.dispose()
    if (this.ownsCamera) this.camera.dispose()
    await this.engine.disposeAsync()
  }

  dispose(): void { void this.disposeAsync() }

  private requireAvatar(id: string): StandaloneVrmAvatar {
    const avatar = this.records.get(id)
    if (!avatar) throw new Error(`Standalone VRM avatar "${id}" does not exist.`)
    return avatar
  }

  private emit(event: StandaloneVrmEvent): void { for (const listener of [...this.eventListeners]) listener(event) }
  private report(diagnostic: StandaloneVrmDiagnostic): void { this.options.onDiagnostic?.(diagnostic) }
  private assertAlive(): void { if (this.disposed) throw new Error('Standalone VRM runtime is disposed.') }
}

export function createSekai64VrmRuntime(options: Sekai64VrmRuntimeOptions): Promise<Sekai64VrmRuntime> {
  return Sekai64VrmRuntime.create(options)
}

function createDefaultCamera(options: Sekai64VrmRuntimeOptions): PerspectiveCamera {
  const camera = new PerspectiveCamera({
    fieldOfView: options.fieldOfView ?? 45,
    near: options.near ?? 0.01,
    far: options.far ?? 1000,
  })
  camera.position.set(...(options.cameraPosition ?? [0, 1.4, 3]))
  return camera
}

function createAvatarConfig(metadata: AvatarMetadata, options: StandaloneVrmLoadOptions): AvatarComponentConfig {
  const lookAt: AvatarLookAtConfig = Object.freeze({
    mode: options.lookAt?.mode ?? metadata.lookAt?.mode ?? 'disabled',
    eyes: options.lookAt?.eyes ?? metadata.lookAt?.eyes ?? true,
    head: options.lookAt?.head ?? metadata.lookAt?.head ?? true,
    neck: options.lookAt?.neck ?? metadata.lookAt?.neck ?? true,
    weight: clamp(options.lookAt?.weight ?? metadata.lookAt?.weight ?? 1, 0, 1),
    smoothing: Math.max(0, options.lookAt?.smoothing ?? metadata.lookAt?.smoothing ?? 10),
    maxYaw: Math.max(0, options.lookAt?.maxYaw ?? metadata.lookAt?.maxYaw ?? 60),
    maxPitch: Math.max(0, options.lookAt?.maxPitch ?? metadata.lookAt?.maxPitch ?? 35),
    ...(options.lookAt?.targetEntity ? { targetEntity: options.lookAt.targetEntity } : {}),
    ...(options.lookAt?.direction ? { direction: options.lookAt.direction } : {}),
  })
  return Object.freeze({
    humanoid: true,
    bones: Object.freeze({ ...(metadata.bones ?? {}), ...(options.humanoidBones ?? {}) }),
    ...(options.targetHeight !== undefined ? { targetHeight: positive(options.targetHeight, 'targetHeight') } : {}),
    grounding: options.grounding ?? 'feet',
    forward: options.forward ?? '-z',
    expressions: Object.freeze({ ...(metadata.expressions ?? {}), ...(options.expressions ?? {}) }),
    lookAt,
    attachments: Object.freeze({}),
    locomotion: Object.freeze({}),
  })
}

function applyTransform(model: { position: { set(x:number,y:number,z:number): unknown }; rotation: { set(x:number,y:number,z:number): unknown }; scale: { set(x:number,y:number,z:number): unknown } }, options: StandaloneVrmLoadOptions): void {
  if (options.position) model.position.set(...options.position)
  if (options.rotation) model.rotation.set(...options.rotation)
  if (options.scale) model.scale.set(...options.scale)
}
function positive(value: number, field: string): number { if (!Number.isFinite(value) || value <= 0) throw new Error(`${field} must be greater than zero.`); return value }
function clamp(value: number, min: number, max: number): number { if (!Number.isFinite(value)) return min; return Math.max(min, Math.min(max, value)) }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error) }
