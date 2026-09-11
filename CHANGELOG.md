# Changelog

## 0.2.0 — Complete Avatar package

- Publish-prep: accept Anyo 0.10 prereleases in the peer range.
- Validate development against Anyo 0.10.0-rc.1, Anyo Animation 0.1.1, and Sekai64 0.8.0-rc.33.

- Moved the maintained VRM 0.x/1.0 parser, direct asset loader, standalone Avatar controller, and standalone Sekai64 runtime into `@blcklab/anyo-avatar/vrm` and `@blcklab/anyo-avatar/vrm/sekai64`.
- Preserved renderer-neutral root and authoring imports.
- Kept independent VRM loading without requiring Anyo Player or Editor.
- Designated `@blcklab/anyo-avatar-vrm` as a compatibility facade with no duplicate implementation.

## 0.1.2

- Consume `character:locomotion` events from Anyo Physics and forward speed, movement, grounded, direction, falling, and jump state into configured Avatar animation parameters.
- Dispose the locomotion bridge with the Avatar plugin lifecycle.

## 0.1.1

- Add `@blcklab/anyo-avatar/sekai64-binding` for standalone Sekai64 avatar controllers.
- Make the Anyo peer optional for standalone consumers.


## 0.1.0

- Added optional Avatar plugin and controller.
- Added humanoid mapping, normalization, expressions, look-at, attachment slots, locomotion, snapshots, authoring helpers, and explicit Sekai64 integration.
