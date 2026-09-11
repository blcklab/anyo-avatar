import assert from 'node:assert/strict'
import { gzipSync } from 'node:zlib'
import { readFile } from 'node:fs/promises'

const entries = [
  ['root', ['../dist/esm/index.js', '../dist/esm/version.js', '../dist/esm/types.js', '../dist/esm/schema.js', '../dist/esm/diagnostics.js', '../dist/esm/AvatarController.js', '../dist/esm/plugin.js'], 20 * 1024],
  ['sekai64', ['../dist/esm/sekai64/index.js', '../dist/esm/sekai64/factory.js', '../dist/esm/sekai64/Sekai64AvatarAdapter.js', '../dist/esm/sekai64/Sekai64AvatarBinding.js'], 18 * 1024],
  ['authoring', ['../dist/esm/authoring/index.js'], 10 * 1024],
  ['vrm', ['../dist/esm/vrm/index.js', '../dist/esm/vrm/types.js'], 10 * 1024],
  ['vrm-sekai64', ['../dist/esm/vrm/sekai64/index.js', '../dist/esm/vrm/sekai64/types.js', '../dist/esm/vrm/sekai64/StandaloneVrmAvatar.js', '../dist/esm/vrm/sekai64/StandaloneVrmRuntime.js', '../dist/esm/vrm/sekai64/VrmAssetLoader.js'], 18 * 1024],
]

for (const [label, targets, budget] of entries) {
  const parts = await Promise.all(targets.map((target) => readFile(new URL(target, import.meta.url))))
  const bytes = gzipSync(Buffer.concat(parts.flatMap((part) => [part, Buffer.from('\n')]))).byteLength
  assert.ok(bytes <= budget, `${label} exceeds budget: ${bytes} > ${budget}`)
  console.log(`PASS ${label.padEnd(12)} ${(bytes / 1024).toFixed(1)} kB gzip · budget ${(budget / 1024).toFixed(1)} kB`)
}
