import { readFile, writeFile } from 'node:fs/promises'
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
await writeFile(new URL('../src/version.ts', import.meta.url), `export const ANYO_AVATAR_VERSION = ${JSON.stringify(pkg.version)} as const\n`)
console.log(`Generated ANYO_AVATAR_VERSION ${pkg.version}.`)
