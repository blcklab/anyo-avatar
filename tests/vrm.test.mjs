import test from 'node:test'
import assert from 'node:assert/strict'
import { parseVrmMetadata, createVrmMetadataResolver } from '../dist/esm/vrm/index.js'

test('parses VRM 1.0 humanoid, expressions, look-at, meta and spring bones', () => {
  const document={
    nodes:[{name:'Hips'},{name:'Head',mesh:0}], meshes:[{primitives:[{}]}],
    extensions:{
      VRMC_vrm:{specVersion:'1.0',meta:{name:'Hero',authors:['blcklab']},humanoid:{humanBones:{hips:{node:0},head:{node:1}}},lookAt:{type:'bone'},expressions:{preset:{happy:{morphTargetBinds:[{node:1,index:0,weight:1}]}}}},
      VRMC_springBone:{specVersion:'1.0',springs:[]},
    },
  }
  const result=parseVrmMetadata(document)
  assert.equal(result?.metadata.format,'vrm1')
  assert.equal(result?.metadata.bones?.hips,'Hips')
  assert.deepEqual(result?.metadata.expressions?.happy,['target-0'])
  assert.equal(result?.metadata.license?.name,'Hero')
  assert.equal(result?.warnings.length,0)
})

test('parses legacy VRM 0.x metadata', () => {
  const document={nodes:[{name:'J_Bip_C_Hips'}],meshes:[{}],extensions:{VRM:{humanoid:{humanBones:[{bone:'hips',node:0}]},blendShapeMaster:{blendShapeGroups:[{name:'Joy',presetName:'joy',binds:[{mesh:0,index:2,weight:100}]}]},meta:{title:'Legacy'}}}}
  const result=parseVrmMetadata(document)
  assert.equal(result?.metadata.format,'vrm0')
  assert.equal(result?.metadata.bones?.hips,'J_Bip_C_Hips')
  assert.deepEqual(result?.metadata.expressions?.joy,['target-2'])
})

test('resolver returns null for plain glTF', () => {
  const resolver=createVrmMetadataResolver()
  assert.equal(resolver({document:{asset:{version:'2.0'}},entityId:'hero'}),undefined)
})

test('standalone avatar controller reuses Avatar binding and Sekai64 animation', async () => {
  const [standalone, avatarContracts, avatarBinding, sekai, gltf, animation] = await Promise.all([
    import('../dist/esm/vrm/sekai64/index.js'),
    import('@blcklab/anyo-avatar/contracts'),
    import('@blcklab/anyo-avatar/sekai64-binding'),
    import('@blcklab/sekai64'),
    import('@blcklab/sekai64/gltf'),
    import('@blcklab/sekai64/animation'),
  ])
  const sourceScene = new sekai.Scene({ name: 'VRM' })
  const hips = new sekai.Node({ id: 'hips', name: 'Hips' }); hips.position.y = 0.8
  const head = new sekai.Node({ id: 'head', name: 'Head' }); head.position.y = 1.7
  const geometry = new animation.SkinnedGeometry({
    positions: new Float32Array([0,0,0, 1,0,0, 0,1,0]),
    morphTargets: [{ name: 'target-0', positions: new Float32Array([0,0,0, 0,0,0, 0,0.2,0]) }],
  })
  const face = new sekai.Mesh({ id: 'face', name: 'Face', geometry, material: new sekai.BasicMaterial(), ownsResources: true })
  sourceScene.add(hips); sourceScene.add(head); head.add(face)
  const document = {
    asset: { version: '2.0' }, nodes: [{name:'Hips'},{name:'Head',mesh:0}], meshes:[{primitives:[{}]}], scenes:[{nodes:[0,1]}], scene:0,
    extensions: { VRMC_vrm: { specVersion:'1.0', humanoid:{humanBones:{hips:{node:0},head:{node:1}}}, expressions:{preset:{happy:{morphTargetBinds:[{node:1,index:0,weight:1}]}}} } },
  }
  const asset = new gltf.GltfAsset(sourceScene, document, [])
  const model = new gltf.GltfModelNode(asset, { id: 'hero', name: 'Hero' })
  const metadata = parseVrmMetadata(document).metadata
  const config = {
    humanoid: true,
    bones: metadata.bones ?? {},
    grounding: 'feet', forward: '-z',
    expressions: metadata.expressions ?? {},
    lookAt: { mode:'disabled', eyes:true, head:true, neck:true, weight:1, smoothing:10, maxYaw:60, maxPitch:35 },
    attachments: {}, locomotion: {},
  }
  const binding = new avatarBinding.Sekai64AvatarBinding('hero', model, config, metadata, undefined, () => {})
  const clip = new animation.AnimationClip({ id:'idle', name:'Idle', tracks:[new animation.AnimationTrack({ target:'head', path:'translation', times:new Float32Array([0,1]), values:new Float32Array([0,1.7,0, 0,1.8,0]) })] })
  const mixer = new animation.AnimationMixer(model, [clip])
  const controller = new standalone.StandaloneVrmAvatar({ id:'hero', model, scene:new sekai.Scene(), metadata, binding, animation:{ clips:[clip], skeletons:[], mixer }, lookAt:config.lookAt, onEvent:()=>{}, onDiagnostic:()=>{}, onDispose:()=>{} })
  assert.equal(controller.setExpression('happy', 1), true)
  assert.equal(geometry.morphWeights[0], 1)
  controller.play('Idle')
  mixer.update(0.5)
  assert.ok(head.position.y > 1.7)
  const snapshot = controller.createSnapshot()
  assert.equal(snapshot.activeClip, 'Idle')
  controller.dispose()
  assert.equal(controller.disposed, true)
  void avatarContracts
})

test('Sekai64 asset loader accepts embedded binary VRM data URLs', async () => {
  const [{ createSekai64VrmAssetLoader }, gltf] = await Promise.all([
    import('../dist/esm/vrm/sekai64/index.js'),
    import('@blcklab/sekai64/gltf'),
  ])
  const document = {
    asset: { version: '2.0' },
    scenes: [{ nodes: [0] }],
    scene: 0,
    nodes: [{ name: 'Hips' }],
    extensions: {
      VRMC_vrm: {
        specVersion: '1.0',
        humanoid: { humanBones: { hips: { node: 0 } } },
      },
    },
  }
  const json = new TextEncoder().encode(JSON.stringify(document))
  const paddedLength = Math.ceil(json.byteLength / 4) * 4
  const totalLength = 12 + 8 + paddedLength
  const bytes = new Uint8Array(totalLength)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, totalLength, true)
  view.setUint32(12, paddedLength, true)
  view.setUint32(16, 0x4e4f534a, true)
  bytes.fill(0x20, 20, 20 + paddedLength)
  bytes.set(json, 20)
  const source = `data:model/vrm;base64,${Buffer.from(bytes).toString('base64')}`
  const registration = createSekai64VrmAssetLoader()
  const model = await registration.load({ type: 'model', format: 'vrm', src: source, id: 'embedded-hero' })
  assert.ok(model instanceof gltf.GltfModelNode)
  assert.equal(model.asset.document.extensions.VRMC_vrm.specVersion, '1.0')
  model.dispose()
  registration.dispose()
})

test('Sekai64 asset loader rejects plain GLB content labeled as VRM', async () => {
  const { createSekai64VrmAssetLoader } = await import('../dist/esm/vrm/sekai64/index.js')
  const document = { asset: { version: '2.0' }, scenes: [{ nodes: [] }], scene: 0 }
  const json = new TextEncoder().encode(JSON.stringify(document))
  const paddedLength = Math.ceil(json.byteLength / 4) * 4
  const totalLength = 12 + 8 + paddedLength
  const bytes = new Uint8Array(totalLength)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, totalLength, true)
  view.setUint32(12, paddedLength, true)
  view.setUint32(16, 0x4e4f534a, true)
  bytes.fill(0x20, 20, 20 + paddedLength)
  bytes.set(json, 20)
  const source = `data:model/vrm;base64,${Buffer.from(bytes).toString('base64')}`
  const registration = createSekai64VrmAssetLoader()
  await assert.rejects(
    registration.load({ type: 'model', format: 'vrm', src: source, id: 'not-vrm' }),
    /does not contain VRM 0\.x or VRM 1\.0 metadata/,
  )
  registration.dispose()
})

test('Sekai64 asset loader renders real skinned VRM geometry with a shared animation module', async () => {
  const [{ createSekai64VrmAssetLoader }, animation] = await Promise.all([
    import('../dist/esm/vrm/sekai64/index.js'),
    import('@blcklab/sekai64/animation'),
  ])
  const animationModule = animation.createAnimationRendererModule()
  const registration = createSekai64VrmAssetLoader({ animationModule })
  const model = await registration.load({
    type: 'model',
    format: 'vrm',
    src: createSkinnedVrmDataUrl(),
    id: 'skinned-hero',
  })
  const meshes = model.findByTag('gltf-mesh')
  assert.equal(meshes.length, 1)
  assert.ok(meshes[0].geometry instanceof animation.SkinnedGeometry)
  const extension = model.asset.getExtension(animation.GLTF_ANIMATION_EXTENSION_ID)
  assert.ok(extension)
  assert.equal(animationModule.bindings.size, 1)
  model.dispose()
  registration.dispose()
})

test('Sekai64 asset loader keeps skinned VRM visible in static pose without an animation module', async () => {
  const { createSekai64VrmAssetLoader } = await import('../dist/esm/vrm/sekai64/index.js')
  const registration = createSekai64VrmAssetLoader()
  const model = await registration.load({
    type: 'model',
    format: 'vrm',
    src: createSkinnedVrmDataUrl(),
    id: 'static-hero',
  })
  assert.equal(model.findByTag('gltf-mesh').length, 1)
  model.dispose()
  registration.dispose()
})

function createSkinnedVrmDataUrl() {
  const positions = new Float32Array([
    -0.25, 0, 0,
    0.25, 0, 0,
    0, 1, 0,
  ])
  const joints = new Uint16Array([
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ])
  const weights = new Float32Array([
    1, 0, 0, 0,
    1, 0, 0, 0,
    1, 0, 0, 0,
  ])
  const indices = new Uint16Array([0, 1, 2])
  const chunks = [
    new Uint8Array(positions.buffer),
    new Uint8Array(joints.buffer),
    new Uint8Array(weights.buffer),
    new Uint8Array(indices.buffer),
  ]
  const offsets = []
  let byteLength = 0
  for (const chunk of chunks) {
    byteLength = align4(byteLength)
    offsets.push(byteLength)
    byteLength += chunk.byteLength
  }
  const binary = new Uint8Array(align4(byteLength))
  chunks.forEach((chunk, index) => binary.set(chunk, offsets[index]))
  const document = {
    asset: { version: '2.0' },
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews: chunks.map((chunk, index) => ({
      buffer: 0,
      byteOffset: offsets[index],
      byteLength: chunk.byteLength,
    })),
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 1, componentType: 5123, count: 3, type: 'VEC4' },
      { bufferView: 2, componentType: 5126, count: 3, type: 'VEC4' },
      { bufferView: 3, componentType: 5123, count: 3, type: 'SCALAR' },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, JOINTS_0: 1, WEIGHTS_0: 2 }, indices: 3 }] }],
    nodes: [
      { name: 'Body', mesh: 0, skin: 0 },
      { name: 'Hips' },
    ],
    skins: [{ joints: [1], skeleton: 1 }],
    scenes: [{ nodes: [0, 1] }],
    scene: 0,
    extensions: {
      VRMC_vrm: {
        specVersion: '1.0',
        humanoid: { humanBones: { hips: { node: 1 } } },
      },
    },
  }
  return createGlbDataUrl(document, binary)
}

function createGlbDataUrl(document, binary = new Uint8Array()) {
  const json = new TextEncoder().encode(JSON.stringify(document))
  const jsonLength = align4(json.byteLength)
  const binaryLength = binary.byteLength ? align4(binary.byteLength) : 0
  const totalLength = 12 + 8 + jsonLength + (binaryLength ? 8 + binaryLength : 0)
  const bytes = new Uint8Array(totalLength)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, totalLength, true)
  view.setUint32(12, jsonLength, true)
  view.setUint32(16, 0x4e4f534a, true)
  bytes.fill(0x20, 20, 20 + jsonLength)
  bytes.set(json, 20)
  if (binaryLength) {
    const chunkOffset = 20 + jsonLength
    view.setUint32(chunkOffset, binaryLength, true)
    view.setUint32(chunkOffset + 4, 0x004e4942, true)
    bytes.set(binary, chunkOffset + 8)
  }
  return `data:model/vrm;base64,${Buffer.from(bytes).toString('base64')}`
}

function align4(value) { return Math.ceil(value / 4) * 4 }
