import type { PluginRuntimeContext, WorldChange, WorldPlugin } from '@blcklab/anyo'
import { AvatarController } from './AvatarController.js'
import type { AvatarPluginOptions } from './types.js'

interface PhysicsCharacterLocomotionEvent {
  entityId: string
  speed: number
  moving: boolean
  grounded: boolean
  falling: boolean
  directionX: number
  directionY: number
  jump: boolean
}

export class AnyoAvatarPlugin implements WorldPlugin {
  readonly name = 'anyo:avatar'
  readonly controller: AvatarController
  private availabilityCleanup: (() => void) | null = null
  private locomotionCleanup: (() => void) | null = null
  private activeContext: PluginRuntimeContext | null = null
  private disposal: Promise<void> | null = null

  constructor(readonly options: AvatarPluginOptions) {
    this.controller = new AvatarController(options.adapter, options)
  }

  async setup(context: PluginRuntimeContext): Promise<void> {
    this.activeContext = context
    await this.options.adapter.setup?.(context)
    this.availabilityCleanup?.()
    this.availabilityCleanup = this.options.adapter.onAvailabilityChange?.(() => {
      if (this.activeContext) this.controller.reconcile(this.activeContext)
    }) ?? null
    this.controller.bind(context)
    this.locomotionCleanup?.()
    this.locomotionCleanup = context.world.on?.<PhysicsCharacterLocomotionEvent>('character:locomotion', event => {
      if (!event || typeof event.entityId !== 'string' || !this.controller.get(event.entityId)) return
      this.controller.setLocomotion(event.entityId, {
        speed: event.speed,
        moving: event.moving,
        grounded: event.grounded,
        directionX: event.directionX,
        directionY: event.directionY,
        falling: event.falling,
        jump: event.jump,
      })
    })
  }

  update(deltaSeconds: number): void { this.controller.update(deltaSeconds) }

  applyChanges(_changes: readonly WorldChange[], context: PluginRuntimeContext): void {
    this.activeContext = context
    this.controller.reconcile(context)
  }

  dispose(): void { void this.disposeAsync() }

  async disposeAsync(): Promise<void> {
    if (this.disposal) return this.disposal
    this.disposal = (async () => {
      this.activeContext = null
      this.availabilityCleanup?.()
      this.availabilityCleanup = null
      this.locomotionCleanup?.()
      this.locomotionCleanup = null
      this.controller.dispose()
      await this.options.adapter.dispose?.()
    })()
    return this.disposal
  }

  setExpression(...args: Parameters<AvatarController['setExpression']>): ReturnType<AvatarController['setExpression']> { return this.controller.setExpression(...args) }
  clearExpression(...args: Parameters<AvatarController['clearExpression']>): ReturnType<AvatarController['clearExpression']> { return this.controller.clearExpression(...args) }
  resetExpressions(...args: Parameters<AvatarController['resetExpressions']>): ReturnType<AvatarController['resetExpressions']> { return this.controller.resetExpressions(...args) }
  setLookTarget(...args: Parameters<AvatarController['setLookTarget']>): ReturnType<AvatarController['setLookTarget']> { return this.controller.setLookTarget(...args) }
  attach(...args: Parameters<AvatarController['attach']>): ReturnType<AvatarController['attach']> { return this.controller.attach(...args) }
  detach(...args: Parameters<AvatarController['detach']>): ReturnType<AvatarController['detach']> { return this.controller.detach(...args) }
  setLocomotion(...args: Parameters<AvatarController['setLocomotion']>): ReturnType<AvatarController['setLocomotion']> { return this.controller.setLocomotion(...args) }
  get(...args: Parameters<AvatarController['get']>): ReturnType<AvatarController['get']> { return this.controller.get(...args) }
  list(): ReturnType<AvatarController['list']> { return this.controller.list() }
  createSnapshot(): ReturnType<AvatarController['createSnapshot']> { return this.controller.createSnapshot() }
  restoreSnapshot(...args: Parameters<AvatarController['restoreSnapshot']>): ReturnType<AvatarController['restoreSnapshot']> { return this.controller.restoreSnapshot(...args) }
}

export function createAvatarPlugin(options: AvatarPluginOptions): AnyoAvatarPlugin {
  return new AnyoAvatarPlugin(options)
}
