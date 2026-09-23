# Compatibility

`@blcklab/anyo-avatar` 0.2.x keeps the renderer-neutral Avatar contracts and explicit renderer integration boundary stable.

## Frozen S24 compatibility baseline

Validated package line:

- `@blcklab/anyo` `0.10.0-rc.3`
- `@blcklab/anyo-animation` `0.1.3`
- `@blcklab/sekai64` `0.8.0-rc.34`
- `@blcklab/anyo-avatar` `0.2.1`
- `@blcklab/anyo-avatar-viewer` `0.2.0-alpha.9`
- `@blcklab/anyo-avatar-vue` `0.2.0-alpha.3`

The Avatar core peer ranges intentionally admit compatible S24 prereleases. Renderer-specific behavior remains behind the explicit Sekai64 integration entry points; the root Avatar entry remains renderer-neutral.

## Stability boundary

The 0.2.x line preserves the `anyo.avatar` component name, renderer-neutral root, adapter lifecycle, snapshot shape, standard humanoid bone names, expressions, look-at modes, attachment transforms, locomotion bridge, VRM metadata parsing, and explicit Sekai64 integration entry points.
