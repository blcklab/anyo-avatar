import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AvatarController,
  createAvatarPlugin,
  parseAvatarComponent,
  ANYO_AVATAR_COMPONENT,
} from '../dist/esm/index.js'
import {
  avatarBoneCoverage,
  createAvatarComponentDefinition,
  validateAvatarComponentData,
} from '../dist/esm/authoring/index.js'

function compiledComponent(data) { return { type: ANYO_AVATAR_COMPONENT, enabled: true, data, sourcePath: '/entities/0/components/0' } }
function entity(id='hero') { return { id, authoringId:id, type:'model', childIds:[], transform:{ position:[0,0,0], rotation:[0,0,0], scale:[1,1,1] }, sourcePath:'/entities/0', authoring:{id,sourcePath:'/entities/0',editable:true}, primitiveIds:[`${id}:model`], components:[] } }
function context(componentData) {
  const target = entity('target'); target.transform = { position:[2,1,3], rotation:[0,0,0], scale:[1,1,1] }
  const hero = entity(); const component = compiledComponent(componentData); hero.components=[component]
  return { world:{}, renderer:{}, document:{}, compiled:{}, transforms:{}, query:{
    components(type){ return type === ANYO_AVATAR_COMPONENT ? [{entity:hero, component}] : [] },
    entity(id){ return id === 'hero' ? hero : id === 'target' ? target : null }, entities(){return [hero,target]}, tagged(){return[]}, primitives(){return[]},
  }}
}

class Binding {
  entityId='hero'; availableBones=[{humanoidBone:'hips',nodeName:'Hips'},{humanoidBone:'head',nodeName:'Head'}]; availableExpressions=['happy','blink']; metadata=undefined
  expressions=new Map(); attachments=new Set(); look=null; disposed=false; measurement={height:1.8,eyeHeight:1.65,hipsHeight:0.9,minY:0,maxY:1.8}
  isAvailable(){return !this.disposed} measure(){return this.measurement} normalize(){return this.measurement}
  setExpression(name,weight){ if(!this.availableExpressions.includes(name)) return false; this.expressions.set(name,weight); return true }
  resetExpressions(){this.expressions.clear()} setLookTarget(target){this.look=target} attach(slot){this.attachments.add(slot);return true} detach(slot){return this.attachments.delete(slot)} listAttachments(){return [...this.attachments]} dispose(){this.disposed=true}
}
class Adapter { binding=new Binding(); listeners=new Set(); attachEntity(){return this.binding} onAvailabilityChange(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn)} }

const componentData = {
  humanoid:true, targetHeight:1.75, grounding:'feet', forward:'-z',
  humanoidBones:{hips:'Hips',head:'Head'}, expressions:{happy:'Smile'},
  lookAt:{mode:'target',targetEntity:'target',eyes:true,head:true,neck:true,weight:1,smoothing:10,maxYaw:60,maxPitch:35},
  attachments:{rightHand:{entityId:'sword',position:[0,0,0],rotation:[0,0,90],scale:[1,1,1]}},
  locomotion:{speedParameter:'speed',movingParameter:'moving',jumpTrigger:'jump'},
}

test('parses complete avatar component', () => {
  const config = parseAvatarComponent(compiledComponent(componentData))
  assert.equal(config.targetHeight, 1.75)
  assert.equal(config.lookAt.mode, 'target')
  assert.equal(config.attachments.rightHand?.entityId, 'sword')
})

test('controller drives expressions, look-at, attachments, locomotion and snapshots', () => {
  const adapter = new Adapter()
  const calls=[]
  const animation={ setBoolean:(...a)=>{calls.push(['boolean',...a]);return true}, setNumber:(...a)=>{calls.push(['number',...a]);return true}, setTrigger:(...a)=>{calls.push(['trigger',...a]);return true} }
  const controller = new AvatarController(adapter, { animation })
  controller.bind(context(componentData))
  assert.equal(controller.get('hero')?.status, 'ready')
  assert.equal(controller.setExpression('hero','happy',0.8), true)
  assert.equal(adapter.binding.expressions.get('happy'), 0.8)
  controller.update(1/60)
  assert.deepEqual(adapter.binding.look, {position:[2,1,3]})
  controller.setLocomotion('hero',{speed:2,moving:true,jump:true})
  assert.deepEqual(calls.map(c=>c[0]), ['number','boolean','trigger'])
  assert.equal(controller.attach('hero','rightHand',{entityId:'sword',position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}), true)
  const snapshot = JSON.parse(JSON.stringify(controller.createSnapshot()))
  controller.resetExpressions('hero')
  controller.restoreSnapshot(snapshot)
  assert.equal(controller.get('hero')?.expressions.happy, 0.8)
})


test('plugin bridges physics character locomotion events into avatar animation parameters', async () => {
  const listeners = new Map()
  const runtime = context({
    ...componentData,
    locomotion: { speedParameter: 'speed', movingParameter: 'moving', groundedParameter: 'grounded', directionXParameter: 'directionX', directionYParameter: 'directionY', fallingParameter: 'falling', jumpTrigger: 'jump' },
  })
  runtime.world = {
    on(event, listener) { listeners.set(event, listener); return () => listeners.delete(event) },
  }
  const calls = []
  const animation = {
    setBoolean: (...args) => { calls.push(['boolean', ...args]); return true },
    setNumber: (...args) => { calls.push(['number', ...args]); return true },
    setTrigger: (...args) => { calls.push(['trigger', ...args]); return true },
  }
  const plugin = createAvatarPlugin({ adapter: new Adapter(), animation })
  await plugin.setup(runtime)
  listeners.get('character:locomotion')({ entityId: 'hero', speed: 4, moving: true, grounded: false, falling: true, directionX: 0.25, directionY: -1, jump: true })
  assert.deepEqual(calls.map(call => call[0]), ['number', 'boolean', 'boolean', 'number', 'number', 'boolean', 'trigger'])
  await plugin.disposeAsync()
  assert.equal(listeners.has('character:locomotion'), false)
})

test('plugin disposes adapter asynchronously', async () => {
  let disposed=false
  const adapter=new Adapter(); adapter.dispose=async()=>{disposed=true}
  const plugin=createAvatarPlugin({adapter})
  await plugin.setup(context(componentData))
  await plugin.disposeAsync()
  assert.equal(disposed,true)
})

test('authoring helpers create and validate canonical data', () => {
  const component=createAvatarComponentDefinition()
  assert.equal(component.type, ANYO_AVATAR_COMPONENT)
  const result=validateAvatarComponentData(component)
  assert.equal(result.valid,true)
  const coverage=avatarBoneCoverage({hips:'Hips',head:'Head'})
  assert.ok(coverage.completeness > 0)
  assert.ok(coverage.missingRequired.includes('leftHand'))
})

test('Sekai64 adapter reuses the mounted glTF node for bones, normalization, and attachments', async () => {
  const [{ Sekai64AvatarAdapter }, { GltfAsset, GltfModelNode }, { Scene, Node }] = await Promise.all([
    import('../dist/esm/sekai64/index.js'),
    import('@blcklab/sekai64/gltf'),
    import('@blcklab/sekai64'),
  ])
  const sourceScene = new Scene({ name: 'AvatarScene' })
  const hips = new Node({ id: 'hips-node', name: 'Hips' }); hips.position.y = 0.9
  const head = new Node({ id: 'head-node', name: 'Head' }); head.position.y = 1.8
  const hand = new Node({ id: 'hand-node', name: 'RightHand' }); hand.position.y = 1.1
  sourceScene.add(hips); sourceScene.add(head); sourceScene.add(hand)
  const asset = new GltfAsset(sourceScene, { asset: { version: '2.0' }, scenes: [{ nodes: [] }], nodes: [] }, [])
  const model = new GltfModelNode(asset, { id: 'hero:model', name: 'Hero' })
  const sword = new Node({ id: 'sword', name: 'Sword' })
  const native = { scene: { get(id) { return id === 'sword' ? sword : null } }, getPrimitiveNode(id) { return id === 'hero:model' ? model : id === 'sword' ? sword : null } }
  const renderer = { getNativeAccess: () => native, onAssetProgress: () => () => {} }
  const adapter = new Sekai64AvatarAdapter({ getRenderer: () => renderer })
  adapter.setup({})
  const config = parseAvatarComponent(compiledComponent({
    humanoid: true,
    humanoidBones: { hips: 'Hips', head: 'Head', rightHand: 'RightHand' },
    targetHeight: 1.75,
    grounding: 'feet',
    forward: '-z',
    expressions: {},
    lookAt: { mode: 'disabled', eyes: true, head: true, neck: true, weight: 1, smoothing: 10, maxYaw: 60, maxPitch: 35 },
    attachments: {}, locomotion: {},
  }))
  const binding = adapter.attachEntity({ entity: { id: 'hero' }, primitiveIds: ['hero:model'], config, context: {} })
  assert.ok(binding)
  assert.equal(binding.availableBones.some((entry) => entry.humanoidBone === 'hips' && entry.nodeName === 'Hips'), true)
  const measurement = binding.normalize({ targetHeight: 1.75, grounding: 'feet', forward: '-z' })
  assert.ok(Math.abs(measurement.height - 1.75) < 1e-6)
  assert.equal(binding.attach('rightHand', { entityId: 'sword', position: [0,0,0], rotation: [0,0,0], scale: [1,1,1] }), true)
  assert.equal(sword.parent, hand)
  assert.equal(binding.isAvailable(), true)
  asset.dispose()
  assert.equal(binding.isAvailable(), false)
  adapter.dispose()
})
