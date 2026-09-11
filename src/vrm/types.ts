import type { AvatarMetadata, AvatarMetadataResolver } from '../contracts/index.js'

export interface VrmParseResult {
  readonly metadata: AvatarMetadata
  readonly warnings: readonly string[]
}

export interface VrmMetadataResolverOptions {
  readonly strict?: boolean
  readonly onWarning?: (message: string) => void
}

export type VrmMetadataResolver = AvatarMetadataResolver
