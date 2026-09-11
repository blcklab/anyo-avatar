import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const root = await readFile(new URL('../dist/esm/index.js', import.meta.url), 'utf8')
const binding = await readFile(new URL('../dist/esm/sekai64-binding/index.js', import.meta.url), 'utf8')
const vrm = await readFile(new URL('../dist/esm/vrm/index.js', import.meta.url), 'utf8')
const vrmSekai64 = [
  await readFile(new URL('../dist/esm/vrm/sekai64/index.js', import.meta.url), 'utf8'),
  await readFile(new URL('../dist/esm/vrm/sekai64/StandaloneVrmRuntime.js', import.meta.url), 'utf8'),
  await readFile(new URL('../dist/esm/vrm/sekai64/VrmAssetLoader.js', import.meta.url), 'utf8'),
].join('\n')
const authoring = await readFile(new URL('../dist/esm/authoring/index.js', import.meta.url), 'utf8')
assert.equal(root.includes('@blcklab/sekai64'), false)
assert.equal(authoring.includes('@blcklab/sekai64'), false)
assert.equal(root.includes('/sekai64/'), false)
assert.equal(vrm.includes('@blcklab/sekai64'), false)
assert.ok(vrmSekai64.includes('@blcklab/sekai64'))
assert.ok(binding.includes('Sekai64AvatarBinding'))
assert.equal(binding.includes('@blcklab/anyo/'), false)
console.log('Verified renderer-neutral Avatar root and authoring boundaries.')
