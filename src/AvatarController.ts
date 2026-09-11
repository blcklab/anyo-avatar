import type { PluginRuntimeContext } from '@blcklab/anyo'
import { createAvatarDiagnostic } from './diagnostics.js'
import { avatarConfigKey, parseAvatarComponent } from './schema.js'
import {
  ANYO_AVATAR_COMPONENT,
  ANYO_AVATAR_SNAPSHOT_VERSION,
  type AvatarAttachmentConfig,
  type AvatarAttachmentSlot,
  type AvatarComponentConfig,
  type AvatarDiagnostic,
  type AvatarEntityBinding,
  type AvatarEntityRuntimeSnapshot,
  type AvatarEntitySnapshot,
  type AvatarLocomotionState,
  type AvatarLookTarget,
  type AvatarPluginOptions,
  type AvatarRuntimeAdapter,
  type AvatarRuntimeSnapshot,
} from './types.js'

interface AvatarRecord {
  entityId: string
  config: AvatarComponentConfig
  configKey: string
  binding: AvatarEntityBinding | null
  expressions: Map<string, number>
  lookTarget: AvatarLookTarget | null
  locomotion: AvatarLocomotionState
}

export class AvatarController {
  private readonly records = new Map<string, AvatarRecord>()
  private context: PluginRuntimeContext | null = null

  constructor(
    readonly adapter: AvatarRuntimeAdapter,
    private readonly options: Pick<AvatarPluginOptions, 'animation' | 'onDiagnostic' | 'strict'> = {},
  ) {}

  bind(context: PluginRuntimeContext): void {
    this.context = context
    this.reconcile(context)
  }

  reconcile(context = this.context): void {
    if (!context) return
    this.context = context
    const seen = new Set<string>()
    for (const match of context.query.components(ANYO_AVATAR_COMPONENT)) {
      const entityId = match.entity.id
      seen.add(entityId)
      let config: AvatarComponentConfig
      try {
        config = parseAvatarComponent(match.component)
      } catch (error) {
        this.report('error', 'ANYO_AVATAR_COMPONENT_INVALID', errorMessage(error), entityId, { sourcePath: match.component.sourcePath })
        const stale = this.records.get(entityId)
        if (stale) this.disposeRecord(stale)
        this.records.delete(entityId)
        if (this.options.strict) throw error
        continue
      }
      const key = avatarConfigKey(config)
      let record = this.records.get(entityId)
      if (record?.binding?.isAvailable && !record.binding.isAvailable()) {
        record.binding.dispose()
        record.binding = null
      }
      if (!record) {
        record = { entityId, config, configKey: key, binding: null, expressions: new Map(), lookTarget: null, locomotion: {} }
        this.records.set(entityId, record)
      } else if (record.configKey !== key) {
        record.binding?.dispose()
        record.binding = null
        record.config = config
        record.configKey = key
      }
      if (!record.binding) this.attachRecord(record, match.entity, context)
      else this.applyConfig(record)
    }
    for (const [entityId, record] of this.records) {
      if (seen.has(entityId)) continue
      this.disposeRecord(record)
      this.records.delete(entityId)
    }
  }

  update(deltaSeconds: number): void {
    this.adapter.update?.(deltaSeconds)
    for (const record of this.records.values()) {
      if (!record.binding) continue
      this.resolveAuthoredLookTarget(record)
      record.binding.setLookTarget(record.lookTarget, record.config.lookAt)
      record.binding.updateLookAt?.(deltaSeconds)
    }
  }

  setExpression(entityId: string, name: string, weight: number): boolean {
    const record = this.requireRecord(entityId)
    const resolved = clampFinite(weight, 0, 1, 'weight')
    record.expressions.set(name, resolved)
    if (!record.binding) return false
    const applied = record.binding.setExpression(name, resolved)
    if (!applied) this.report('warning', 'ANYO_AVATAR_EXPRESSION_NOT_FOUND', `Avatar expression "${name}" is unavailable.`, entityId)
    return applied
  }

  clearExpression(entityId: string, name: string): boolean {
    const record = this.requireRecord(entityId)
    record.expressions.delete(name)
    return record.binding?.setExpression(name, 0) ?? false
  }

  resetExpressions(entityId: string): boolean {
    const record = this.requireRecord(entityId)
    record.expressions.clear()
    record.binding?.resetExpressions()
    return Boolean(record.binding)
  }

  setLookTarget(entityId: string, target: AvatarLookTarget | null): boolean {
    const record = this.requireRecord(entityId)
    record.lookTarget = target ? Object.freeze({ position: tuple3(target.position) }) : null
    record.binding?.setLookTarget(record.lookTarget, record.config.lookAt)
    return Boolean(record.binding)
  }

  attach(entityId: string, slot: AvatarAttachmentSlot, config: AvatarAttachmentConfig): boolean {
    const record = this.requireRecord(entityId)
    if (!record.binding) return false
    const applied = record.binding.attach(slot, config)
    if (!applied) this.report('warning', 'ANYO_AVATAR_ATTACHMENT_FAILED', `Avatar attachment "${slot}" could not be applied.`, entityId)
    return applied
  }

  detach(entityId: string, slot: AvatarAttachmentSlot): boolean {
    const record = this.requireRecord(entityId)
    return record.binding?.detach(slot) ?? false
  }

  setLocomotion(entityId: string, state: AvatarLocomotionState): boolean {
    const record = this.requireRecord(entityId)
    record.locomotion = Object.freeze({ ...record.locomotion, ...state })
    const animation = this.options.animation
    if (!animation) return false
    const mapping = record.config.locomotion
    if (state.speed !== undefined && mapping.speedParameter) animation.setNumber(entityId, mapping.speedParameter, finite(state.speed, 'speed'))
    if (state.moving !== undefined && mapping.movingParameter) animation.setBoolean(entityId, mapping.movingParameter, state.moving)
    if (state.grounded !== undefined && mapping.groundedParameter) animation.setBoolean(entityId, mapping.groundedParameter, state.grounded)
    if (state.directionX !== undefined && mapping.directionXParameter) animation.setNumber(entityId, mapping.directionXParameter, finite(state.directionX, 'directionX'))
    if (state.directionY !== undefined && mapping.directionYParameter) animation.setNumber(entityId, mapping.directionYParameter, finite(state.directionY, 'directionY'))
    if (state.falling !== undefined && mapping.fallingParameter) animation.setBoolean(entityId, mapping.fallingParameter, state.falling)
    if (state.jump && mapping.jumpTrigger) animation.setTrigger(entityId, mapping.jumpTrigger)
    return true
  }

  get(entityId: string): AvatarEntitySnapshot | null {
    const record = this.records.get(entityId)
    if (!record) return null
    const binding = record.binding
    return Object.freeze({
      entityId,
      status: binding ? 'ready' : 'pending',
      ...(binding ? { measurement: binding.measure() } : {}),
      bones: binding?.availableBones ?? [],
      expressions: Object.freeze(Object.fromEntries(record.expressions)),
      ...(record.lookTarget ? { lookTarget: record.lookTarget } : {}),
      attachments: binding?.listAttachments?.() ?? [],
      ...(binding?.metadata ? { metadataFormat: binding.metadata.format } : {}),
    })
  }

  list(): readonly AvatarEntitySnapshot[] {
    return Object.freeze([...this.records.keys()].map((id) => this.get(id) as AvatarEntitySnapshot))
  }

  createSnapshot(): AvatarRuntimeSnapshot {
    const entities: AvatarEntityRuntimeSnapshot[] = []
    for (const record of this.records.values()) {
      entities.push(Object.freeze({
        entityId: record.entityId,
        expressions: Object.freeze(Object.fromEntries(record.expressions)),
        ...(record.lookTarget ? { lookTarget: record.lookTarget } : {}),
        locomotion: Object.freeze({ ...record.locomotion }),
      }))
    }
    return Object.freeze({ version: ANYO_AVATAR_SNAPSHOT_VERSION, entities: Object.freeze(entities) })
  }

  restoreSnapshot(snapshot: AvatarRuntimeSnapshot): void {
    if (snapshot.version !== ANYO_AVATAR_SNAPSHOT_VERSION || !Array.isArray(snapshot.entities)) {
      const error = new Error('Avatar snapshot schema is invalid.')
      this.report('error', 'ANYO_AVATAR_SNAPSHOT_INVALID', error.message)
      if (this.options.strict) throw error
      return
    }
    for (const saved of snapshot.entities) {
      const record = this.records.get(saved.entityId)
      if (!record) continue
      record.expressions.clear()
      for (const [name, weight] of Object.entries(saved.expressions) as [string, number][]) this.setExpression(saved.entityId, name, weight)
      record.lookTarget = saved.lookTarget ?? null
      record.locomotion = Object.freeze({ ...saved.locomotion })
      if (record.lookTarget) record.binding?.setLookTarget(record.lookTarget, record.config.lookAt)
      this.setLocomotion(saved.entityId, saved.locomotion)
    }
  }

  dispose(): void {
    for (const record of this.records.values()) this.disposeRecord(record)
    this.records.clear()
    this.context = null
  }

  private attachRecord(record: AvatarRecord, entity: Parameters<AvatarRuntimeAdapter['attachEntity']>[0]['entity'], context: PluginRuntimeContext): void {
    try {
      const binding = this.adapter.attachEntity({ entity, primitiveIds: entity.primitiveIds, config: record.config, context })
      if (!binding) {
        this.report('info', 'ANYO_AVATAR_ASSET_PENDING', 'Avatar model is not available yet.', record.entityId)
        return
      }
      record.binding = binding
      this.applyConfig(record)
      for (const [name, weight] of record.expressions) binding.setExpression(name, weight)
      binding.setLookTarget(record.lookTarget, record.config.lookAt)
    } catch (error) {
      this.report('error', 'ANYO_AVATAR_ADAPTER_ERROR', errorMessage(error), record.entityId)
      if (this.options.strict) throw error
    }
  }

  private applyConfig(record: AvatarRecord): void {
    const binding = record.binding
    if (!binding) return
    const measurement = binding.normalize({
      ...(record.config.targetHeight !== undefined ? { targetHeight: record.config.targetHeight } : {}),
      grounding: record.config.grounding,
      forward: record.config.forward,
    })
    if (!(measurement.height > 0)) this.report('warning', 'ANYO_AVATAR_NORMALIZATION_INVALID', 'Avatar height could not be measured.', record.entityId)
    for (const bone of Object.keys(record.config.bones)) {
      if (!binding.availableBones.some((entry) => entry.humanoidBone === bone)) {
        this.report('warning', 'ANYO_AVATAR_BONE_MISSING', `Humanoid bone "${bone}" is unavailable.`, record.entityId)
      }
    }
    for (const [slot, attachment] of Object.entries(record.config.attachments)) binding.attach(slot, attachment)
  }

  private resolveAuthoredLookTarget(record: AvatarRecord): void {
    const config = record.config.lookAt
    if (config.mode === 'direction' && config.direction) {
      record.lookTarget = { position: config.direction }
      return
    }
    if (config.mode !== 'target' || !config.targetEntity || !this.context) return
    const target = this.context.query.entity(config.targetEntity)
    if (!target) return
    record.lookTarget = { position: tuple3(target.transform.position) }
  }

  private disposeRecord(record: AvatarRecord): void {
    record.binding?.dispose()
    record.binding = null
    record.expressions.clear()
  }

  private requireRecord(entityId: string): AvatarRecord {
    const record = this.records.get(entityId)
    if (record) return record
    const message = `Avatar entity "${entityId}" is not registered.`
    this.report('error', 'ANYO_AVATAR_ENTITY_NOT_FOUND', message, entityId)
    throw new Error(message)
  }

  private report(
    severity: AvatarDiagnostic['severity'],
    code: AvatarDiagnostic['code'],
    message: string,
    entityId?: string,
    details?: Readonly<Record<string, unknown>>,
  ): void {
    this.options.onDiagnostic?.(createAvatarDiagnostic(severity, code, message, entityId, details))
  }
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error) }
function finite(value: number, field: string): number { if (!Number.isFinite(value)) throw new Error(`${field} must be finite.`); return value }
function clampFinite(value: number, min: number, max: number, field: string): number { return Math.max(min, Math.min(max, finite(value, field))) }
function tuple3(value: readonly number[]): readonly [number, number, number] { return Object.freeze([value[0] ?? 0, value[1] ?? 0, value[2] ?? 0]) }
