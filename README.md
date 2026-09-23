# @blcklab/anyo-avatar

Renderer-neutral humanoid avatar runtime for Anyo with generic humanoid mapping, VRM 0.x/1.0 support, expressions, look-at, attachments, normalization, and explicit Sekai64 integrations.

## Installation

```bash
npm install @blcklab/anyo-avatar
```

Install optional peers only for the integration you use:

```bash
npm install @blcklab/anyo@next @blcklab/anyo-animation @blcklab/sekai64@next
```

## Features

- Generic GLB humanoid mapping with explicit overrides and name matching
- Deterministic target-height and grounding normalization
- Morph-target expressions and aliases
- Smoothed head, neck, and eye look-at
- Bone attachment slots
- Locomotion parameters bridged to `@blcklab/anyo-animation`
- Plain JSON snapshots and complete world/entity disposal
- VRM 0.x and VRM 1.0 metadata support
- Explicit Sekai64 integrations while the root entry remains renderer-neutral

## Anyo component

```json
{
  "id": "hero",
  "type": "animated-model",
  "src": "/avatars/hero.glb",
  "components": [
    {
      "type": "anyo.avatar",
      "targetHeight": 1.75,
      "grounding": "feet",
      "forward": "-z",
      "lookAt": { "mode": "camera", "weight": 0.8 },
      "locomotion": { "speedParameter": "speed", "movingParameter": "moving" }
    }
  ]
}
```

## Sekai64 integration

Create Anyo Animation first, then attach Avatar to the same renderer. The adapter reuses the mounted model instead of fetching or decoding it again.

```ts
const animation = createSekai64AnimationRuntime({ canvas })
const avatar = createSekai64AvatarPlugin({
  renderer: animation.renderer,
  animation: animation.plugin,
})
```

## VRM

```ts
import { parseVrmMetadata } from '@blcklab/anyo-avatar/vrm'
import { createSekai64VrmRuntime } from '@blcklab/anyo-avatar/vrm/sekai64'
```

The historical `@blcklab/anyo-avatar-vrm` package is a compatibility facade for these exports.

## Recommended package layering

Use `@blcklab/anyo-avatar` as the reusable avatar-domain package. Keep application UI, camera controls, portfolio/studio presentation, and framework lifecycle outside the core.

```text
@blcklab/anyo-avatar
  └─ avatar contracts, humanoid/VRM semantics, normalization, expressions, look-at, attachments
     and explicit renderer integration subpaths

@blcklab/anyo-avatar-viewer
  └─ framework-independent viewer/presentation runtime: camera, navigation, rendering profile,
     animation playback, recovery, screenshots/fullscreen and browser lifecycle

@blcklab/anyo-avatar-vue
  └─ Vue host adapter/components/composables and optional UI
```

For an Anyo world or game runtime, prefer the core package directly. For a standalone portfolio/avatar screen, prefer Avatar Viewer. In a Vue application, use Avatar Vue and let it delegate avatar behavior to Viewer/Core rather than duplicating avatar logic in Vue.

## Package entry points

```text
@blcklab/anyo-avatar
@blcklab/anyo-avatar/contracts
@blcklab/anyo-avatar/authoring
@blcklab/anyo-avatar/sekai64
@blcklab/anyo-avatar/sekai64-binding
@blcklab/anyo-avatar/vrm
@blcklab/anyo-avatar/vrm/sekai64
```

## Compatibility

See [Compatibility](docs/COMPATIBILITY.md).

## License

MIT
