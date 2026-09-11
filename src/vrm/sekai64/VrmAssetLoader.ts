import { AssetManager, type AssetLoadRequest, type AssetLoaderRegistration } from '@blcklab/sekai64/assets'
import {
  GltfLoader,
  type GltfAnimationAdapter,
  type GltfDiagnostic,
  type GltfLoadOptions,
  type GltfModelNode,
} from '@blcklab/sekai64/gltf'
import { createGltfAnimationAdapter, type AnimationRendererModule } from '@blcklab/sekai64/animation'
import { parseVrmMetadata } from '../index.js'
import type { VrmMetadataResolverOptions } from '../types.js'

export interface Sekai64VrmAssetLoaderDiagnostic {
  readonly severity: 'warning' | 'error'
  readonly code:
    | 'ANYO_VRM_ASSET_METADATA_WARNING'
    | 'ANYO_VRM_ASSET_METADATA_MISSING'
    | 'ANYO_VRM_ASSET_LOAD_FAILED'
    | 'ANYO_VRM_ASSET_GLTF_DIAGNOSTIC'
  readonly message: string
  readonly source: string
  readonly assetId?: string
  readonly details?: Readonly<Record<string, unknown>>
}

export interface Sekai64VrmAssetLoaderOptions extends VrmMetadataResolverOptions {
  /** Reuse a host-owned Sekai64 asset manager. The loader will not dispose it. */
  readonly assets?: AssetManager
  /** Optional prebuilt animation adapter. Prefer animationModule for concurrent loads. */
  readonly animation?: GltfAnimationAdapter
  /** Renderer-owned animation module used to create an isolated adapter per VRM load. */
  readonly animationModule?: AnimationRendererModule
  /** Create a glTF mixer when animationModule is supplied. Defaults to true. */
  readonly createMixer?: boolean
  readonly animatedFallback?: GltfLoadOptions['animatedFallback']
  readonly onGltfDiagnostic?: (diagnostic: GltfDiagnostic) => void
  readonly onDiagnostic?: (diagnostic: Sekai64VrmAssetLoaderDiagnostic) => void
}

/**
 * Creates a disposable Sekai64 `model/vrm` loader registration.
 *
 * A fresh registration should be created for every renderer lifecycle. This
 * keeps its internal AssetManager, cache, abort state, and disposal isolated.
 */
export function createSekai64VrmAssetLoader(
  options: Sekai64VrmAssetLoaderOptions = {},
): AssetLoaderRegistration<GltfModelNode> {
  const loader = new GltfLoader(options.assets)
  let disposed = false
  let virtualSourceId = 0

  return {
    type: 'model',
    formats: Object.freeze(['vrm']),
    async load(request: AssetLoadRequest): Promise<GltfModelNode> {
      if (disposed) throw new Error('The Sekai64 VRM asset loader has been disposed.')
      const strict = requestBoolean(request.options?.strict) ?? options.strict
      const source = String(request.src)
      const prepared = prepareVrmSource(loader.assets, source, ++virtualSourceId)
      let model: GltfModelNode | undefined
      try {
        const animation = options.animationModule
          ? createGltfAnimationAdapter(options.animationModule, { createMixer: options.createMixer !== false })
          : options.animation
        const animatedFallback = options.animatedFallback ?? (animation ? 'error' : 'static-pose')
        model = await loader.loadNode(prepared.source, {
          ...(request.id ? { id: request.id, name: request.id } : {}),
          ...(request.signal ? { signal: request.signal } : {}),
          ...(strict !== undefined ? { strict } : {}),
          ...(animation ? { animation } : {}),
          animatedFallback,
          onDiagnostic: (diagnostic) => {
            options.onGltfDiagnostic?.(diagnostic)
            options.onDiagnostic?.({
              severity: diagnostic.severity,
              code: 'ANYO_VRM_ASSET_GLTF_DIAGNOSTIC',
              message: diagnostic.message,
              source,
              ...(request.id ? { assetId: request.id } : {}),
              details: Object.freeze({ diagnostic }),
            })
          },
        })
        const parsed = parseVrmMetadata(model.asset.document, {
          ...(strict !== undefined ? { strict } : {}),
          onWarning: (message) => {
            options.onWarning?.(message)
            options.onDiagnostic?.({
              severity: 'warning',
              code: 'ANYO_VRM_ASSET_METADATA_WARNING',
              message,
              source,
              ...(request.id ? { assetId: request.id } : {}),
            })
          },
        })
        if (!parsed) {
          throw new Error('The loaded model does not contain VRM 0.x or VRM 1.0 metadata.')
        }
        return model
      } catch (cause) {
        model?.dispose()
        const message = errorMessage(cause)
        const missingMetadata = message.includes('does not contain VRM')
        options.onDiagnostic?.({
          severity: 'error',
          code: missingMetadata ? 'ANYO_VRM_ASSET_METADATA_MISSING' : 'ANYO_VRM_ASSET_LOAD_FAILED',
          message,
          source,
          ...(request.id ? { assetId: request.id } : {}),
        })
        throw cause
      } finally {
        prepared.cleanup()
      }
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      loader.dispose()
    },
  }
}

interface PreparedVrmSource {
  readonly source: string | URL
  readonly cleanup: () => void
}

function prepareVrmSource(assets: AssetManager, source: string, id: number): PreparedVrmSource {
  const url = new URL(source, typeof location !== 'undefined' ? location.href : 'file:///')
  if (url.pathname.toLowerCase().endsWith('.vrm')) return { source: url, cleanup: () => undefined }

  // Embedded editor assets are data/blob URLs and therefore have no `.vrm`
  // pathname. Give GltfLoader a virtual filename while resolving the bytes
  // from the original URL through the same AssetManager.
  const virtual = new URL(`https://anyo-vrm-loader.invalid/embedded-${id}.vrm`)
  const cleanup = assets.addResolver({
    canResolve(candidate): boolean { return candidate.href === virtual.href },
    async fetch(_candidate, loadOptions): Promise<Response> {
      return fetch(url, {
        ...(loadOptions.signal ? { signal: loadOptions.signal } : {}),
        ...(loadOptions.headers ? { headers: loadOptions.headers } : {}),
      })
    },
  })
  return { source: virtual, cleanup }
}

function requestBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}
