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
