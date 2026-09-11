import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(pkg.version, '0.2.0')
assert.equal(pkg.dependencies, undefined)
assert.equal(pkg.peerDependencies['@blcklab/anyo-animation'], '>=0.1.0 <0.2.0')
const types = `${await readFile(new URL('../dist/types/types.d.ts', import.meta.url), 'utf8')}
${await readFile(new URL('../dist/types/standalone-types.d.ts', import.meta.url), 'utf8')}`
for (const contract of ['AvatarComponentConfig','AvatarMetadata','AvatarEntityBinding','AvatarRuntimeSnapshot']) assert.ok(types.includes(contract))
assert.ok(pkg.exports['./sekai64-binding'])
assert.ok(pkg.exports['./vrm'])
assert.ok(pkg.exports['./vrm/sekai64'])
console.log('Verified Anyo Avatar 0.2.0 complete Avatar and VRM contract.')
