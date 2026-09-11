import { createWorld, entitiesPlugin } from '@blcklab/anyo'
import { createSekai64AnimationRuntime } from '@blcklab/anyo-animation/sekai64'
import { createSekai64AvatarPlugin } from '@blcklab/anyo-avatar/sekai64'

const canvas = document.querySelector('canvas') as HTMLCanvasElement
const animation = createSekai64AnimationRuntime({ canvas, backend: 'auto' })
const avatar = createSekai64AvatarPlugin({ renderer: animation.renderer, animation: animation.plugin })
const world = createWorld({ renderer: animation.renderer, plugins: [entitiesPlugin(), animation.plugin, avatar.plugin] })
void world
avatar.plugin.setExpression('hero', 'happy', 1)
avatar.plugin.setLocomotion('hero', { speed: 1.4, moving: true, grounded: true })
