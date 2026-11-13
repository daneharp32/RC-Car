import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js";
import * as CANNON from "https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js";
import { createPhysicsSystem } from "./physics.js";
import { createCarVisualFactory } from "./car.js";
import { createControlsSystem } from "./controls.js";
import { createImpactDamageSystem } from "./damage-system.js";
import { createMultiplayerSystem } from "./multiplayer.js";
import { createGarageSystem } from "./garage.js";
import { createSandboxSystem } from "./sandbox.js";
import { createTrackSystem } from "./track.js";
import { createGravelBasinSystem } from "./gravel-map.js";
import { createRaceSystem } from "./race.js";

import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/utils/BufferGeometryUtils.js";
import { cleanRangerShellGeometry } from "./shell-cleanup.js";
import rangerShellPart0 from "./ranger-shell-data-00.js";
import rangerShellPart1 from "./ranger-shell-data-01.js";
import rangerShellPart2 from "./ranger-shell-data-02.js";
import rangerShellPart3 from "./ranger-shell-data-03.js";
import rangerShellPart4 from "./ranger-shell-data-04.js";
import rangerShellPart5 from "./ranger-shell-data-05.js";

// Main application entry: renderer, track visuals, shared state, and frame loop.
const $ = (id) => document.getElementById(id);
const canvas = $("gameCanvas");
const joinPanel = $("joinPanel");
const mainMenuPanel = $("mainMenuPanel");
const modeSelectPanel = $("modeSelectPanel");
const garagePanel = $("garagePanel");
const joinButton = $("joinButton");
const joinError = $("joinError");
const hud = $("hud");
const toast = $("toast");
const FIXED_STEP = 1 / 60;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance"
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();
// Open blue sky with a matching distant haze above the dirt field.
scene.background = new THREE.Color(0x83c5ef);
scene.fog = new THREE.Fog(0x83c5ef, 135, 265);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 320);
camera.position.set(0, 3.1, 5.8);

const hemi = new THREE.HemisphereLight(0xe7f1f4, 0x6b5943, 1.45);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffe2bd, 2.15);
sun.position.set(-8, 15, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
// The map scenery is static. Refresh the directional shadow map on a small
// schedule while driving instead of rendering thousands of static casters
// again on every animation frame.
sun.shadow.autoUpdate = false;
function requestShadowRefresh() {
  renderer.shadowMap.needsUpdate = true;
  sun.shadow.needsUpdate = true;
}
requestShadowRefresh();
sun.shadow.camera.left = -116;
sun.shadow.camera.right = 116;
sun.shadow.camera.top = 116;
sun.shadow.camera.bottom = -116;
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 250;
sun.shadow.bias = -0.00022;
sun.shadow.normalBias = 0.025;
sun.shadow.radius = 2.0;
scene.add(sun);
scene.add(sun.target);
let activeLighting = { sunOffset: [-8, 15, 8] };

// Gravel Basin is a much larger view with dense scenery, so cap render
// resolution and shadow-map size only while that map is active. Its shadow
// frustum follows the RC truck to give nearby terrain shadows more detail
// without increasing the shadow-map resolution or redraw cost.
const DEFAULT_PIXEL_RATIO_CAP = 1.35;
function applyMapRenderQuality(mapId) {
  const isGravelBasin = mapId === "gravel-basin";
  const pixelRatioCap = isGravelBasin ? 1.05 : DEFAULT_PIXEL_RATIO_CAP;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, pixelRatioCap);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  const shadowSize = 1024;
  if (sun.shadow.mapSize.x !== shadowSize || sun.shadow.mapSize.y !== shadowSize) {
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    sun.shadow.mapSize.set(shadowSize, shadowSize);
  }

  const shadowExtent = isGravelBasin ? 58 : 116;
  sun.shadow.camera.left = -shadowExtent;
  sun.shadow.camera.right = shadowExtent;
  sun.shadow.camera.top = shadowExtent;
  sun.shadow.camera.bottom = -shadowExtent;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = isGravelBasin ? 145 : 250;
  sun.shadow.camera.updateProjectionMatrix();

  if (!isGravelBasin) {
    sun.target.position.set(0, 0, 0);
    sun.position.set(
      sun.target.position.x + activeLighting.sunOffset[0],
      sun.target.position.y + activeLighting.sunOffset[1],
      sun.target.position.z + activeLighting.sunOffset[2]
    );
  }
  sun.target.updateMatrixWorld();
  sun.updateMatrixWorld();
  requestShadowRefresh();
}

const fill = new THREE.DirectionalLight(0xb8d8e9, 0.65);
fill.position.set(8, 6, -10);
scene.add(fill);

const TIME_OF_DAY_PRESETS = {
  day: {
    sky: 0x83c5ef, fog: 0x83c5ef,
    hemiSky: 0xe7f1f4, hemiGround: 0x6b5943, hemiIntensity: 1.45,
    sunColor: 0xffe2bd, sunIntensity: 2.15, sunOffset: [18, 2.5, -14],
    fillColor: 0xb8d8e9, fillIntensity: 0.65, exposure: 1.08
  },
  "golden-hour": {
    sky: 0xd89a70, fog: 0xc78d69,
    hemiSky: 0xffd3a7, hemiGround: 0x57402f, hemiIntensity: 1.12,
    sunColor: 0xffa45f, sunIntensity: 2.0, sunOffset: [18, 1.8, -14],
    fillColor: 0xf0a875, fillIntensity: 0.42, exposure: 1.10
  },
  night: {
    sky: 0x101a2b, fog: 0x172338,
    hemiSky: 0x788db7, hemiGround: 0x111824, hemiIntensity: 0.72,
    sunColor: 0xa3c2ff, sunIntensity: 0.82, sunOffset: [17, 11, -14],
    fillColor: 0x536fae, fillIntensity: 0.34, exposure: 0.92
  }
};

let activeTimeOfDay = "day";

// A lightweight camera-distant sun disc and soft halo make the directional
// light source visible in the sky. Its direction is derived from the same
// preset vector used by the shadow-casting directional light.
const visibleSun = new THREE.Group();
visibleSun.name = "visible-sun";
visibleSun.frustumCulled = false;

const sunGlowCanvas = document.createElement("canvas");
sunGlowCanvas.width = 128;
sunGlowCanvas.height = 128;
const sunGlowContext = sunGlowCanvas.getContext("2d");
if (sunGlowContext) {
  const glowGradient = sunGlowContext.createRadialGradient(64, 64, 2, 64, 64, 64);
  glowGradient.addColorStop(0, "rgba(255,255,255,0.96)");
  glowGradient.addColorStop(0.2, "rgba(255,255,255,0.84)");
  glowGradient.addColorStop(0.52, "rgba(255,255,255,0.24)");
  glowGradient.addColorStop(1, "rgba(255,255,255,0)");
  sunGlowContext.fillStyle = glowGradient;
  sunGlowContext.fillRect(0, 0, 128, 128);
}
const sunGlowTexture = new THREE.CanvasTexture(sunGlowCanvas);
sunGlowTexture.colorSpace = THREE.SRGBColorSpace;
const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
  map: sunGlowTexture,
  color: 0xffe7b5,
  transparent: true,
  opacity: 0.62,
  depthWrite: false,
  fog: false,
  toneMapped: false
}));
sunGlow.scale.set(17, 17, 1);
sunGlow.renderOrder = 10;
visibleSun.add(sunGlow);

const sunDisc = new THREE.Mesh(
  new THREE.SphereGeometry(2.35, 28, 18),
  new THREE.MeshBasicMaterial({
    color: 0xfff2d1,
    fog: false,
    toneMapped: false
  })
);
sunDisc.frustumCulled = false;
sunDisc.renderOrder = 11;
visibleSun.add(sunDisc);
scene.add(visibleSun);

const visibleSunDirection = new THREE.Vector3();
const visibleSunCameraPosition = new THREE.Vector3();
function syncVisibleSun() {
  if (activeTimeOfDay === "night") {
    visibleSun.visible = false;
    return;
  }

  const offset = activeLighting.sunOffset;
  visibleSunDirection.set(offset[0], offset[1], offset[2]).normalize();
  camera.getWorldPosition(visibleSunCameraPosition);
  visibleSun.position.copy(visibleSunCameraPosition)
    .addScaledVector(visibleSunDirection, 190);

  const goldenHour = activeTimeOfDay === "golden-hour";
  sunGlow.material.color.setHex(goldenHour ? 0xffa45f : 0xffe6ad);
  sunDisc.material.color.setHex(goldenHour ? 0xffb06b : 0xfff2d1);
  visibleSun.visible = true;
}

function setTimeOfDay(presetName, notify = true) {
  const preset = TIME_OF_DAY_PRESETS[presetName];
  if (!preset) return false;

  activeTimeOfDay = presetName;
  activeLighting = preset;
  scene.background.setHex(preset.sky);
  if (scene.fog) scene.fog.color.setHex(preset.fog);
  hemi.color.setHex(preset.hemiSky);
  hemi.groundColor.setHex(preset.hemiGround);
  hemi.intensity = preset.hemiIntensity;
  sun.color.setHex(preset.sunColor);
  sun.intensity = preset.sunIntensity;
  sun.position.set(
    sun.target.position.x + preset.sunOffset[0],
    sun.target.position.y + preset.sunOffset[1],
    sun.target.position.z + preset.sunOffset[2]
  );
  fill.color.setHex(preset.fillColor);
  fill.intensity = preset.fillIntensity;
  renderer.toneMappingExposure = preset.exposure;
  sun.target.updateMatrixWorld();
  sun.updateMatrixWorld();
  requestShadowRefresh();
  syncVisibleSun();

  if (notify) {
    const label = presetName === "golden-hour" ? "GOLDEN HOUR" : presetName.toUpperCase();
    console.info("Time of day changed to", label);
  }
  return true;
}
setTimeOfDay("day", false);

// The track module owns the complete closed-course scenery and its shared layout.
const trackSystem = createTrackSystem({ THREE, scene });
const gravelBasinSystem = createGravelBasinSystem({ THREE, scene });
const arenaVisuals = [
  ...trackSystem.arenaVisuals,
  ...gravelBasinSystem.arenaVisuals
];
let trackLayout = trackSystem.trackLayout;
trackLayout.id = "closed-course";
trackLayout.name = "Club Dirt Circuit";
const mapLayouts = {
  "closed-course": trackLayout,
  "gravel-basin": gravelBasinSystem.trackLayout
};

// Load the painted prerunner shell before creating physics so its measured
// envelope can shape the rollover colliders and preserve tire/body clearance.
// Merge the GLTF's many small pieces by material/attribute layout once.
// This keeps the paint, decal texture, and lamp materials intact while
// reducing draw calls for every local and remote vehicle.
function buildMergedPrerunnerVisual(sourceScene) {
  sourceScene.updateMatrixWorld(true);
  const buckets = new Map();
  const detailObjectName = "desert racing details";
  const bodySurfaceMeshes = [];
  const detailSeatRaycaster = new THREE.Raycaster();
  detailSeatRaycaster.near = 0;
  detailSeatRaycaster.far = 0.9;

  function splitConnectedTriangleComponents(indices) {
    const parent = new Map();
    function find(value) {
      if (!parent.has(value)) parent.set(value, value);
      let root = value;
      while (parent.get(root) !== root) root = parent.get(root);
      let current = value;
      while (parent.get(current) !== current) {
        const next = parent.get(current);
        parent.set(current, root);
        current = next;
      }
      return root;
    }
    function unite(left, right) {
      const a = find(left);
      const b = find(right);
      if (a !== b) parent.set(b, a);
    }

    const triangleCount = Math.floor(indices.length / 3);
    for (let triangle = 0; triangle < triangleCount; triangle++) {
      const offset = triangle * 3;
      const i0 = Number(indices[offset]);
      const i1 = Number(indices[offset + 1]);
      const i2 = Number(indices[offset + 2]);
      unite(i0, i1);
      unite(i0, i2);
    }

    const components = new Map();
    for (let triangle = 0; triangle < triangleCount; triangle++) {
      const offset = triangle * 3;
      const i0 = Number(indices[offset]);
      const root = find(i0);
      let component = components.get(root);
      if (!component) {
        component = [];
        components.set(root, component);
      }
      component.push(i0, Number(indices[offset + 1]), Number(indices[offset + 2]));
    }
    return [...components.values()];
  }

  function makeCompactPiece(sourceGeometry, componentIndices) {
    const vertexIds = [...new Set(componentIndices)];
    const remap = new Map(vertexIds.map((vertexId, index) => [vertexId, index]));
    const piece = new THREE.BufferGeometry();

    for (const [name, attribute] of Object.entries(sourceGeometry.attributes)) {
      const itemSize = attribute.itemSize;
      const array = new attribute.array.constructor(vertexIds.length * itemSize);
      for (let index = 0; index < vertexIds.length; index++) {
        const sourceOffset = vertexIds[index] * itemSize;
        const destinationOffset = index * itemSize;
        array.set(attribute.array.subarray(sourceOffset, sourceOffset + itemSize), destinationOffset);
      }
      const copied = new THREE.BufferAttribute(array, itemSize, attribute.normalized);
      copied.name = attribute.name;
      piece.setAttribute(name, copied);
    }

    const remappedIndices = new Uint32Array(componentIndices.length);
    for (let index = 0; index < componentIndices.length; index++) {
      remappedIndices[index] = remap.get(componentIndices[index]);
    }
    piece.setIndex(new THREE.BufferAttribute(remappedIndices, 1));
    return { geometry: piece, vertexIds };
  }


  // Index the real front-shell triangles once so every exposed trim vertex
  // can be fitted to the curved body instead of shifting a complete part.
  function buildFrontSurfaceProjector(meshes) {
    const cellSize = 0.12, cells = new Map(), values = [];
    const key = (x,y,z) => `${x},${y},${z}`;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    let count = 0;
    for (const object of meshes) {
      const geometry = object.geometry, positions = geometry.attributes.position;
      const index = geometry.index, elementCount = index ? index.count : positions.count;
      for (let offset=0; offset+2<elementCount; offset+=3) {
        const ia=index?index.getX(offset):offset;
        const ib=index?index.getX(offset+1):offset+1;
        const ic=index?index.getX(offset+2):offset+2;
        a.fromBufferAttribute(positions,ia).applyMatrix4(object.matrixWorld);
        b.fromBufferAttribute(positions,ib).applyMatrix4(object.matrixWorld);
        c.fromBufferAttribute(positions,ic).applyMatrix4(object.matrixWorld);
        const cx=(a.x+b.x+c.x)/3, cy=(a.y+b.y+c.y)/3, cz=(a.z+b.z+c.z)/3;
        if (cz<=1.5 || Math.abs(cx)>=1.5 || cy<=0.04 || cy>=1.25) continue;
        const id=count++;
        values.push(a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z);
        const minX=Math.floor(Math.min(a.x,b.x,c.x)/cellSize), maxX=Math.floor(Math.max(a.x,b.x,c.x)/cellSize);
        const minY=Math.floor(Math.min(a.y,b.y,c.y)/cellSize), maxY=Math.floor(Math.max(a.y,b.y,c.y)/cellSize);
        const minZ=Math.floor(Math.min(a.z,b.z,c.z)/cellSize), maxZ=Math.floor(Math.max(a.z,b.z,c.z)/cellSize);
        for(let x=minX;x<=maxX;x++) for(let y=minY;y<=maxY;y++) for(let z=minZ;z<=maxZ;z++) {
          const k=key(x,y,z); let list=cells.get(k);
          if(!list){list=[];cells.set(k,list);} list.push(id);
        }
      }
    }
    if(!count)return null;
    const data=new Float32Array(values), seen=new Int32Array(count);
    let stamp=0;
    const ta=new THREE.Vector3(),tb=new THREE.Vector3(),tc=new THREE.Vector3();
    const candidate=new THREE.Vector3(),ab=new THREE.Vector3(),ac=new THREE.Vector3();
    const pa=new THREE.Vector3(),pb=new THREE.Vector3(),pc=new THREE.Vector3(),cb=new THREE.Vector3();
    function closest(point,a,b,c,target){
      ab.subVectors(b,a);ac.subVectors(c,a);pa.subVectors(point,a);
      const d1=ab.dot(pa),d2=ac.dot(pa);
      if(d1<=0&&d2<=0)return target.copy(a);
      pb.subVectors(point,b);
      const d3=ab.dot(pb),d4=ac.dot(pb);
      if(d3>=0&&d4<=d3)return target.copy(b);
      const vc=d1*d4-d3*d2;
      if(vc<=0&&d1>=0&&d3<=0)return target.copy(a).addScaledVector(ab,d1/(d1-d3));
      pc.subVectors(point,c);
      const d5=ab.dot(pc),d6=ac.dot(pc);
      if(d6>=0&&d5<=d6)return target.copy(c);
      const vb=d5*d2-d1*d6;
      if(vb<=0&&d2>=0&&d6<=0)return target.copy(a).addScaledVector(ac,d2/(d2-d6));
      const va=d3*d6-d5*d4;
      if(va<=0&&d4-d3>=0&&d5-d6>=0){
        cb.subVectors(c,b);
        return target.copy(b).addScaledVector(cb,(d4-d3)/((d4-d3)+(d5-d6)));
      }
      const inv=1/(va+vb+vc),v=vb*inv,w=vc*inv;
      return target.copy(a).addScaledVector(ab,v).addScaledVector(ac,w);
    }
    function findClosestSurfacePoint(point,target){
      const ix=Math.floor(point.x/cellSize),iy=Math.floor(point.y/cellSize),iz=Math.floor(point.z/cellSize);
      let best=Infinity;
      stamp++;
      if(stamp>=2147483647){seen.fill(0);stamp=1;}
      for(let x=ix-4;x<=ix+4;x++)for(let y=iy-4;y<=iy+4;y++)for(let z=iz-4;z<=iz+4;z++){
        const list=cells.get(key(x,y,z));if(!list)continue;
        for(const id of list){
          if(seen[id]===stamp)continue;seen[id]=stamp;
          const o=id*9;
          ta.set(data[o],data[o+1],data[o+2]);
          tb.set(data[o+3],data[o+4],data[o+5]);
          tc.set(data[o+6],data[o+7],data[o+8]);
          closest(point,ta,tb,tc,candidate);
          const d=point.distanceToSquared(candidate);
          if(d<best){best=d;target.copy(candidate);}
        }
      }
      return Number.isFinite(best)?Math.sqrt(best):null;
    }
    console.info("Concept4 front detail surface index:",count,"triangles,",cells.size,"cells");
    return {findClosestSurfacePoint};
  }

  function seatFrontDetailComponent(piece, materialName) {
    const positions=piece.attributes.position;
    if(!positions||!frontSurfaceProjector)return;
    let clearance=0.01;
    if(materialName.includes("light housings"))clearance=0.006;
    else if(materialName.includes("silver trim"))clearance=0.009;
    else if(materialName.includes("LED lens"))clearance=0.013;
    else if(materialName.includes("marker LED"))clearance=0.018;
    else if(materialName.includes("front grille"))clearance=0.007;
    else if(materialName.includes("front bumper"))clearance=0.012;
    else if(materialName.includes("Safety orange accent"))clearance=0.014;
    const point=new THREE.Vector3(),nearest=new THREE.Vector3(),outward=new THREE.Vector3();
    const normals=piece.attributes.normal;
    for(let i=0;i<positions.count;i++){
      point.fromBufferAttribute(positions,i);
      const gap=frontSurfaceProjector.findClosestSurfacePoint(point,nearest);
      if(gap===null||gap>0.4)continue;
      outward.subVectors(point,nearest);
      if(outward.lengthSq()<1e-8&&normals)outward.fromBufferAttribute(normals,i);
      if(outward.lengthSq()<1e-8)outward.set(0,0,1);else outward.normalize();
      point.copy(nearest).addScaledVector(outward,clearance);
      positions.setXYZ(i,point.x,point.y,point.z);
    }
    positions.needsUpdate=true;
    piece.computeVertexNormals();
    piece.computeBoundingBox();
    piece.computeBoundingSphere();
  }
  function seatDetailComponent(piece) {
    const positions = piece.attributes.position;
    const normals = piece.attributes.normal;
    if (!positions || !normals || !bodySurfaceMeshes.length) return;

    const center = new THREE.Vector3();
    const averageNormal = new THREE.Vector3();
    for (let index = 0; index < positions.count; index++) {
      center.x += positions.getX(index);
      center.y += positions.getY(index);
      center.z += positions.getZ(index);
      averageNormal.x += normals.getX(index);
      averageNormal.y += normals.getY(index);
      averageNormal.z += normals.getZ(index);
    }
    center.multiplyScalar(1 / positions.count);
    if (averageNormal.lengthSq() < 1e-8) return;
    averageNormal.normalize();

    let normalMin = Infinity;
    let normalMax = -Infinity;
    for (let index = 0; index < positions.count; index++) {
      const point = new THREE.Vector3(
        positions.getX(index),
        positions.getY(index),
        positions.getZ(index)
      );
      const distance = point.sub(center).dot(averageNormal);
      normalMin = Math.min(normalMin, distance);
      normalMax = Math.max(normalMax, distance);
    }

    // Project each separate lamp, bumper, trim, and decal component back onto
    // the actual shell surface. This replaces fragile hand-tuned offsets that
    // could move one part inward while leaving another visibly floating.
    const rayOrigin = center.clone().addScaledVector(averageNormal, 0.42);
    detailSeatRaycaster.set(rayOrigin, averageNormal.clone().negate());
    detailSeatRaycaster.near = 0;
    detailSeatRaycaster.far = 0.9;
    const intersections = detailSeatRaycaster.intersectObjects(bodySurfaceMeshes, false);
    const contact = intersections.find((hit) => hit.distance <= 0.9);
    if (!contact) return;

    const halfThickness = Math.max(0, normalMax - normalMin) * 0.5;
    const clearance = Math.max(0.004, halfThickness + 0.003);
    const offset = contact.point.clone()
      .addScaledVector(averageNormal, clearance)
      .sub(center);
    if (offset.lengthSq() > 0.48 * 0.48) return;
    piece.translate(offset.x, offset.y, offset.z);
  }

  sourceScene.traverse((object) => {
    if (!object.isMesh || !object.geometry?.attributes?.position) return;
    if (!object.name.toLowerCase().includes(detailObjectName)) bodySurfaceMeshes.push(object);
  });
  const frontSurfaceProjector = buildFrontSurfaceProjector(bodySurfaceMeshes);

  sourceScene.traverse((object) => {
    if (!object.isMesh || !object.geometry?.attributes?.position) return;
    const geometry = object.geometry;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const groups = geometry.groups.length
      ? geometry.groups
      : [{
          start: 0,
          count: geometry.index?.count ?? geometry.attributes.position.count,
          materialIndex: 0
        }];
    const isDetailObject = object.name.toLowerCase().includes(detailObjectName);

    for (const group of groups) {
      if (!group.count) continue;
      const material = materials[group.materialIndex] || materials[0];
      if (!material) continue;

      const start = group.start || 0;
      const count = group.count ?? (geometry.index?.count ?? geometry.attributes.position.count);
      const sourceIndex = geometry.index?.array;
      const groupIndices = sourceIndex
        ? sourceIndex.slice(start, start + count)
        : Uint32Array.from({ length: count }, (_, index) => start + index);
      const components = isDetailObject
        ? splitConnectedTriangleComponents(groupIndices)
        : [Array.from(groupIndices)];

      for (const componentIndices of components) {
        if (!componentIndices.length) continue;
        let piece;
        let componentVertexIds;

        if (isDetailObject) {
          const compact = makeCompactPiece(geometry, componentIndices);
          piece = compact.geometry;
          componentVertexIds = compact.vertexIds;
        } else {
          piece = new THREE.BufferGeometry();
          for (const [name, attribute] of Object.entries(geometry.attributes)) {
            piece.setAttribute(name, attribute.clone());
          }
          piece.setIndex(new THREE.BufferAttribute(new Uint32Array(componentIndices), 1));
          componentVertexIds = null;
        }

        piece.applyMatrix4(object.matrixWorld);
        if (isDetailObject && componentVertexIds) {
          const materialName = material.name || "";
          const uv = piece.attributes.uv;

          // Determine each decal's horizontal orientation from its outward
          // side normal, and its vertical orientation from the actual UV/Y
          // relationship in the source surface.
          if (materialName.includes("Printed side race-number decal") && uv) {
            const positions = piece.attributes.position, normals = piece.attributes.normal;
            let normalX = 0, meanY = 0, meanV = 0;
            for (let i = 0; i < positions.count; i++) {
              meanY += positions.getY(i);
              meanV += uv.getY(i);
              if (normals) normalX += normals.getX(i);
            }
            meanY /= positions.count;
            meanV /= uv.count;
            let verticalCorrelation = 0;
            for (let i = 0; i < positions.count; i++) {
              verticalCorrelation += (positions.getY(i) - meanY) * (uv.getY(i) - meanV);
            }
            const reverseU = normalX > 0;
            const reverseV = verticalCorrelation > 0;
            for (let i = 0; i < uv.count; i++) {
              const u = uv.getX(i), v = uv.getY(i);
              uv.setXY(i, reverseU ? 1 - u : u, reverseV ? 1 - v : v);
            }
            uv.needsUpdate = true;
            console.info("Corrected side decal mapping:", {
              sideNormalX: normalX / positions.count, reverseU, reverseV
            });
          }

          // Fit each front component to the nose's actual curved surface. Keep
          // the previously stable placement for all non-front details.
          let centerZ = 0;
          const positions = piece.attributes.position;
          for (let i = 0; i < positions.count; i++) centerZ += positions.getZ(i);
          centerZ /= positions.count;
          if (centerZ > 1.8) seatFrontDetailComponent(piece, materialName);
          else seatDetailComponent(piece);
        }

        const attributeSignature = Object.keys(piece.attributes).sort().map((name) => {
          const attribute = piece.attributes[name];
          return [
            name,
            attribute.itemSize,
            attribute.normalized ? 1 : 0,
            attribute.array.constructor.name
          ].join(":");
        }).join("|");
        const key = material.uuid + "|" + attributeSignature;
        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = { material, geometries: [] };
          buckets.set(key, bucket);
        }
        bucket.geometries.push(piece);
      }
    }
  });

  const mergedRoot = new THREE.Group();
  mergedRoot.name = "Concept4 prerunner shell - optimized shared geometry";
  let triangleCount = 0;
  let meshCount = 0;

  for (const bucket of buckets.values()) {
    const merged = bucket.geometries.length > 1
      ? mergeGeometries(bucket.geometries, false)
      : bucket.geometries[0];

    if (merged) {
      if (merged !== bucket.geometries[0]) {
        for (const geometry of bucket.geometries) geometry.dispose();
      }
      const mesh = new THREE.Mesh(merged, bucket.material);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = true;
      mergedRoot.add(mesh);
      triangleCount += (merged.index?.count ?? 0) / 3;
      meshCount++;
    } else {
      // Safe fallback for any unusual attribute layout the utility cannot merge.
      for (const geometry of bucket.geometries) {
        const mesh = new THREE.Mesh(geometry, bucket.material);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mergedRoot.add(mesh);
        triangleCount += (geometry.index?.count ?? 0) / 3;
        meshCount++;
      }
    }
  }

  // The source shell has an open rear cab aperture. Build a shallow back
  // panel that follows the cab's rearward rake and meets the side pillars and
  // roof, then layer a fitted rubber seal and tinted trapezoidal glass over it.
  // This replaces the old flat, upright boxes that sat away from the body.
  function makeRearCabShape(halfWidthBottom, halfWidthTop, bottomY, topY, radius, depthOffset) {
    const shape = new THREE.Shape();
    shape.moveTo(-halfWidthBottom + radius, bottomY);
    shape.lineTo(halfWidthBottom - radius, bottomY);
    shape.quadraticCurveTo(halfWidthBottom, bottomY, halfWidthBottom, bottomY + radius);
    shape.lineTo(halfWidthTop, topY - radius);
    shape.quadraticCurveTo(halfWidthTop, topY, halfWidthTop - radius, topY);
    shape.lineTo(-halfWidthTop + radius, topY);
    shape.quadraticCurveTo(-halfWidthTop, topY, -halfWidthTop, topY - radius);
    shape.lineTo(-halfWidthBottom, bottomY + radius);
    shape.quadraticCurveTo(-halfWidthBottom, bottomY, -halfWidthBottom + radius, bottomY);
    const geometry = new THREE.ShapeGeometry(shape, 16);
    const positions = geometry.attributes.position;
    for (let index = 0; index < positions.count; index++) {
      const y = positions.getY(index);
      // The rear face leans forward as it rises to meet the rear roof edge.
      const rise = y - 0.8374;
      const z = -0.7334 + rise * 0.24 + rise * rise * 0.30 + depthOffset;
      positions.setZ(index, z);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  const rearCabBlue = new THREE.MeshStandardMaterial({
    color: 0x0872b4,
    roughness: 0.36,
    metalness: 0.30,
    side: THREE.DoubleSide
  });
  const rearWindowFrame = new THREE.MeshStandardMaterial({
    color: 0x101923,
    roughness: 0.40,
    metalness: 0.20,
    side: THREE.DoubleSide
  });
  const rearWindowGlass = new THREE.MeshStandardMaterial({
    color: 0x153247,
    roughness: 0.18,
    metalness: 0.10,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide
  });

  const rearPanelShape = new THREE.Shape();
  rearPanelShape.moveTo(-0.742, 0.832);
  rearPanelShape.lineTo(0.742, 0.832);
  rearPanelShape.quadraticCurveTo(0.776, 0.868, 0.754, 0.95);
  rearPanelShape.quadraticCurveTo(0.69, 1.18, 0.625, 1.292);
  rearPanelShape.lineTo(-0.625, 1.292);
  rearPanelShape.quadraticCurveTo(-0.69, 1.18, -0.754, 0.95);
  rearPanelShape.quadraticCurveTo(-0.776, 0.868, -0.742, 0.832);
  const rearPanelGeometry = new THREE.ShapeGeometry(rearPanelShape, 18);
  const rearPanelPositions = rearPanelGeometry.attributes.position;
  for (let index = 0; index < rearPanelPositions.count; index++) {
    const y = rearPanelPositions.getY(index);
    const rise = y - 0.8374;
    rearPanelPositions.setZ(index, -0.7334 + rise * 0.24 + rise * rise * 0.30 + 0.002);
  }
  rearPanelPositions.needsUpdate = true;
  rearPanelGeometry.computeVertexNormals();
  rearPanelGeometry.computeBoundingBox();
  rearPanelGeometry.computeBoundingSphere();
  const rearPanel = new THREE.Mesh(rearPanelGeometry, rearCabBlue);
  rearPanel.name = "Concept4 sloped rear cab panel";
  const rearFrame = new THREE.Mesh(
    makeRearCabShape(0.585, 0.465, 0.895, 1.225, 0.032, -0.008),
    rearWindowFrame
  );
  rearFrame.name = "Concept4 fitted rear-window gasket";
  const rearGlass = new THREE.Mesh(
    makeRearCabShape(0.552, 0.432, 0.925, 1.195, 0.028, -0.013),
    rearWindowGlass
  );
  rearGlass.name = "Concept4 sloped tinted rear window";

  for (const mesh of [rearPanel, rearFrame, rearGlass]) {
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = true;
    mergedRoot.add(mesh);
  }

  return { visual: mergedRoot, triangleCount, meshCount: meshCount + 3 };
}

// Decode the original uploaded SCX30 single-cab Ranger shell. The source
// mesh is stored in six compressed modules so the original user-uploaded
// geometry remains available without re-uploading or procedurally rebuilding it.
async function loadRangerShellGeometry() {
  const encoded = [
    rangerShellPart0, rangerShellPart1, rangerShellPart2,
    rangerShellPart3, rangerShellPart4, rangerShellPart5
  ].join("");
  if (!encoded || encoded.length % 4 !== 0) {
    throw new Error("The original Ranger shell data is incomplete.");
  }

  const compressed = Uint8Array.from(
    atob(encoded),
    (character) => character.charCodeAt(0)
  );
  if (typeof DecompressionStream !== "function") {
    throw new Error("This browser does not support the Ranger mesh decompressor.");
  }

  const rawStream = new Blob([compressed]).stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  const buffer = await new Response(rawStream).arrayBuffer();
  const view = new DataView(buffer);
  const byteLength = buffer.byteLength;

  if (byteLength < 40 ||
      view.getUint32(0, false) !== 0x52435351 ||
      view.getUint32(4, true) !== 1) {
    throw new Error("The original Ranger shell has an invalid data header.");
  }

  const vertexCount = view.getUint32(8, true);
  const faceCount = view.getUint32(12, true);
  if (!vertexCount || !faceCount || vertexCount > 100000 || faceCount > 200000) {
    throw new Error("The original Ranger shell has invalid mesh dimensions.");
  }

  const minimum = [
    view.getFloat32(16, true),
    view.getFloat32(20, true),
    view.getFloat32(24, true)
  ];
  const maximum = [
    view.getFloat32(28, true),
    view.getFloat32(32, true),
    view.getFloat32(36, true)
  ];
  const positionOffset = 40;
  const normalOffset = positionOffset + vertexCount * 6;
  const indexOffset = normalOffset + vertexCount * 3 +
    ((normalOffset + vertexCount * 3) % 2);
  const indexCount = faceCount * 3;
  if (indexOffset + indexCount * 2 !== byteLength) {
    throw new Error("The original Ranger shell data length is inconsistent.");
  }

  const positions = new Float32Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i++) {
    for (let axis = 0; axis < 3; axis++) {
      const quantized = view.getUint16(positionOffset + (i * 3 + axis) * 2, true);
      positions[i * 3 + axis] =
        minimum[axis] + (quantized / 65535) * (maximum[axis] - minimum[axis]);
    }
  }

  const normalBytes = new Int8Array(buffer, normalOffset, vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i++) {
    const nx = normalBytes[i * 3] / 127;
    const ny = normalBytes[i * 3 + 1] / 127;
    const nz = normalBytes[i * 3 + 2] / 127;
    const magnitude = Math.hypot(nx, ny, nz) || 1;
    normals[i * 3] = nx / magnitude;
    normals[i * 3 + 1] = ny / magnitude;
    normals[i * 3 + 2] = nz / magnitude;
  }

  const indices = new Uint16Array(buffer, indexOffset, indexCount);
  for (let i = 0; i < indices.length; i++) {
    if (indices[i] >= vertexCount) {
      throw new Error("The original Ranger shell contains an invalid triangle index.");
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  // Preserve the earlier, proven cleanup routine. The +0.15 seating offset
  // is applied to the shell object's transform later, not by distorting vertices.
  console.info(
    "Original orange Ranger shell decoded:",
    vertexCount,
    "vertices,",
    faceCount,
    "triangles"
  );
  return cleanRangerShellGeometry(THREE, geometry);
}

let rangerShellGeometry = null;
try {
  rangerShellGeometry = await loadRangerShellGeometry();
} catch (error) {
  console.warn("Original uploaded Ranger shell unavailable:", error);
}

async function loadPrerunnerShell() {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync("./FF_SC_Concept4_Desert_Racer.gltf");
  const optimized = buildMergedPrerunnerVisual(gltf.scene);

  // Measured wheel-arch centers in the source GLTF: rear -1.70, front +1.55.
  // A single uniform scale fits that 3.25-unit spacing to the existing
  // 0.951282-unit chassis wheelbase. The body is rotated to the game's -Z
  // forward axis, then centered between the two arches without deforming it.
  const sourceRearArchZ = -1.70;
  const sourceFrontArchZ = 1.55;
  const sourceCenterZ = (sourceRearArchZ + sourceFrontArchZ) * 0.5;
  const shellScale = 0.9512820513 / (sourceFrontArchZ - sourceRearArchZ);

  const shellModel = new THREE.Group();
  shellModel.name = "Concept4 Desert Racer fitted shell";
  shellModel.rotation.y = Math.PI;
  shellModel.scale.setScalar(shellScale);
  shellModel.position.set(0, 0.035, sourceCenterZ * shellScale);
  shellModel.add(optimized.visual);
  shellModel.updateMatrixWorld(true);

  // Physics receives only this transformed envelope; the visible shell keeps
  // every original vertex and is never stretched to meet the chassis.
  const shellBounds = new THREE.Box3().setFromObject(shellModel);
  const shellGeometry = { boundingBox: shellBounds };

  console.info(
    "Concept4 prerunner shell loaded:",
    optimized.meshCount,
    "merged meshes,",
    Math.round(optimized.triangleCount),
    "triangles, uniform scale",
    shellScale.toFixed(4),
    "×"
  );
  console.info("Prerunner shell fitted bounds:", shellBounds.getSize(new THREE.Vector3()).toArray());
  return { shellModel, shellGeometry };
}

let shellModel = null;
let shellGeometry = null;
try {
  const loadedShell = await loadPrerunnerShell();
  shellModel = loadedShell.shellModel;
  shellGeometry = loadedShell.shellGeometry;
} catch (error) {
  console.warn("Concept4 prerunner shell unavailable; using the stable procedural body:", error);
}

// Physics: Cannon's RaycastVehicle applies suspension and tire impulses only
// when each wheel ray has actually found a surface to touch.

const rangerPhysicsBounds = rangerShellGeometry?.boundingBox?.clone?.() || null;
if (rangerPhysicsBounds) {
  rangerPhysicsBounds.translate(new THREE.Vector3(0, 0.15, 0));
}
const shellPhysicsGeometry = shellGeometry ||
  (rangerPhysicsBounds ? { boundingBox: rangerPhysicsBounds } : null);

const physicsSystem = createPhysicsSystem({
  CANNON,
  trackLayout,
  additionalLayouts: {
    "gravel-basin": gravelBasinSystem.trackLayout
  },
  shellFit: !!(shellGeometry || rangerShellGeometry),
  shellGeometry: shellPhysicsGeometry
});
const {
  world,
  chassisBody,
  vehicle,
  wheelPositions,
  VISUAL_CHASSIS_LENGTH_SCALE,
  spawnX,
  spawnZ,
  spawnYaw
} = physicsSystem;
const impactDamageSystem = createImpactDamageSystem({ chassisBody });
const previousLaunchVelocity = chassisBody.velocity.clone();
const previousLaunchAngularVelocity = chassisBody.angularVelocity.clone();
let lastLaunchStressAt = -Infinity;

function resetLaunchStressBaseline() {
  previousLaunchVelocity.copy(chassisBody.velocity);
  previousLaunchAngularVelocity.copy(chassisBody.angularVelocity);
  lastLaunchStressAt = typeof performance !== "undefined" ? performance.now() : Date.now();
}

const makeCarVisual = createCarVisualFactory({
  THREE, CANNON, world, chassisBody, scene,
  VISUAL_CHASSIS_LENGTH_SCALE, vehicle, renderer, shellModel, rangerShellGeometry
});
const localCar = makeCarVisual(0xffa33d);
let selectedChassisStyle = "standard";
localCar.setChassisStyle(selectedChassisStyle);
let selectedShellStyle = shellModel ? "prerunner" : "ranger";
function setSelectedShellStyle(style) {
  selectedShellStyle = style === "ranger" ? "ranger" : "prerunner";
  selectedShellStyle = localCar.setShellStyle(selectedShellStyle);
  return selectedShellStyle;
}
function setSelectedChassisStyle(style) {
  selectedChassisStyle = physicsSystem.setChassisStyle(style === "solid-axle" ? "solid-axle" : "standard");
  localCar.setChassisStyle(selectedChassisStyle);
  updateLocalVisual();
  return selectedChassisStyle;
}
localCar.setShellStyle(selectedShellStyle);


function updateLocalVisual() {
  localCar.root.position.set(chassisBody.position.x, chassisBody.position.y, chassisBody.position.z);
  localCar.root.quaternion.set(
    chassisBody.quaternion.x,
    chassisBody.quaternion.y,
    chassisBody.quaternion.z,
    chassisBody.quaternion.w
  );

  const inverseRoot = localCar.root.quaternion.clone().invert();
  const localPosition = new THREE.Vector3();
  const worldWheelQuaternion = new THREE.Quaternion();
  const wheelPartIds = ["front-left-wheel", "front-right-wheel", "rear-left-wheel", "rear-right-wheel"];
  for (let i = 0; i < 4; i++) {
    if (localCar.isPartDetached?.(wheelPartIds[i])) continue;
    vehicle.updateWheelTransform(i);
    const transform = vehicle.wheelInfos[i].worldTransform;
    localPosition.set(
      transform.position.x - chassisBody.position.x,
      transform.position.y - chassisBody.position.y,
      transform.position.z - chassisBody.position.z
    );
    localPosition.applyQuaternion(inverseRoot);
    localPosition.z *= VISUAL_CHASSIS_LENGTH_SCALE;
    localPosition.divideScalar(localCar.root.scale.x || 1);
    worldWheelQuaternion.set(
      transform.quaternion.x,
      transform.quaternion.y,
      transform.quaternion.z,
      transform.quaternion.w
    );
    localCar.wheelPivots[i].position.copy(localPosition);
    localCar.wheelPivots[i].quaternion.copy(inverseRoot).multiply(worldWheelQuaternion);
  }
  localCar.updateChassisSuspensionVisuals?.(physicsSystem.getRearSuspensionState?.());
}


let lastToastTimer = 0;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(lastToastTimer);
  lastToastTimer = window.setTimeout(() => toast.classList.remove("show"), 2300);
}

const game = {
  THREE,
  CANNON,
  $,
  canvas,
  renderer,
  scene,
  camera,
  mainMenuPanel,
  modeSelectPanel,
  garagePanel,
  joinPanel,
  joinButton,
  joinError,
  hud,
  toast,
  world,
  chassisBody,
  vehicle,
  wheelPositions,
  VISUAL_CHASSIS_LENGTH_SCALE,
  physicsSystem,
  impactDamageSystem,
  resetLaunchStressBaseline,
  trackLayout,
  activeMapId: "closed-course",
  mapLayouts,
  spawnX,
  spawnZ,
  spawnYaw,
  arenaVisuals,
  localCar,
  makeCarVisual,
  getShellStyle: () => selectedShellStyle,
  setShellStyle: setSelectedShellStyle,
  getChassisStyle: () => selectedChassisStyle,
  setChassisStyle: setSelectedChassisStyle,
  updateLocalVisual,
  showToast
};

game.setActiveMap = (mapId, options = {}) => {
  if (!Object.prototype.hasOwnProperty.call(mapLayouts, mapId)) return false;
  if (game.activeMapId === mapId) return true;
  if (!physicsSystem.setActiveMap(mapId)) return false;

  game.activeMapId = mapId;
  applyMapRenderQuality(mapId);
  scene.background.setHex(0x83c5ef);
  scene.fog.color.setHex(0x83c5ef);
  scene.fog.near = 135;
  scene.fog.far = 265;
  trackLayout = mapLayouts[mapId];
  game.trackLayout = trackLayout;
  if (game.race?.setTrackLayout) game.race.setTrackLayout(trackLayout);
  // Keep the showroom vehicle parked in the garage while the player is still
  // choosing a map. Multiplayer entry performs the actual arena spawn reset.
  if (game.garage?.viewMode === "drive" && game.controls?.resetCar) {
    game.controls.resetCar();
    game.race?.onCarReset?.();
  }
  updateLocalVisual();
  if (!options.silent) {
    showToast("DRIVING AREA: " + (trackLayout.name || mapId.toUpperCase()));
  }
  // Prepare the selected arena's shaders, geometry buffers, and shadow map
  // while the player is still in the menu rather than on the first drive frame.
  game.prepareMapGraphics?.(mapId);
  return true;
};

const controls = createControlsSystem(game);
game.controls = controls;

// Chase remains the default camera. The selector changes only the view and
// never alters steering, throttle, suspension, or vehicle physics.
const CAMERA_MODES = ["chase", "hood", "interior", "stand"];
const CAMERA_MODE_LABELS = {
  chase: "CHASE",
  hood: "HOOD",
  interior: "INTERIOR",
  stand: "STAND POV"
};
let cameraMode = "chase";

function setCameraMode(mode) {
  if (!CAMERA_MODES.includes(mode)) return;
  cameraMode = mode;
  for (const button of document.querySelectorAll("[data-camera-mode]")) {
    const active = button.dataset.cameraMode === cameraMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  }
}

function cycleCameraMode() {
  const currentIndex = CAMERA_MODES.indexOf(cameraMode);
  const nextMode = CAMERA_MODES[(currentIndex + 1) % CAMERA_MODES.length];
  setCameraMode(nextMode);
  showToast("CAMERA: " + CAMERA_MODE_LABELS[nextMode]);
}

for (const button of document.querySelectorAll("[data-camera-mode]")) {
  button.addEventListener("click", () => setCameraMode(button.dataset.cameraMode));
}

// C cycles cameras while driving. Ignore text fields so the shortcut never
// interferes with typing a driver name or lobby name.
window.addEventListener("keydown", (event) => {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey ||
      event.key.toLowerCase() !== "c" || !multiplayer?.joined) return;
  const activeElement = document.activeElement;
  if (activeElement && (
    ["INPUT", "TEXTAREA", "SELECT"].includes(activeElement.tagName) ||
    activeElement.isContentEditable
  )) return;
  event.preventDefault();
  cycleCameraMode();
});

function easeCameraFov(targetFov, delta, response) {
  const nextFov = camera.fov + (targetFov - camera.fov) * (1 - Math.exp(-response * delta));
  if (Math.abs(nextFov - camera.fov) > 0.025) {
    camera.fov = nextFov;
    camera.updateProjectionMatrix();
  }
}

const race = createRaceSystem(game);
game.race = race;
const multiplayer = createMultiplayerSystem(game);
game.multiplayer = multiplayer;
const garage = createGarageSystem(game);
game.garage = garage;
const sandbox = createSandboxSystem(game);
game.sandbox = sandbox;

const warmedMapGraphics = new Set();
const SHADOW_REFRESH_INTERVAL_MS = 180;
let lastShadowRefreshAt = 0;

function prepareMapGraphics(mapId = game.activeMapId) {
  if (warmedMapGraphics.has(mapId)) return true;
  const layout = mapLayouts[mapId];
  const mapVisual = arenaVisuals.find((item) => item.userData?.mapId === mapId);
  if (!layout?.spawn || !mapVisual ||
      mapId !== game.activeMapId || garage.viewMode === "drive") return false;

  const previousCameraPosition = camera.position.clone();
  const previousCameraQuaternion = camera.quaternion.clone();
  const previousCameraUp = camera.up.clone();
  const previousCameraFov = camera.fov;
  const previousCameraNear = camera.near;
  const previousCameraFar = camera.far;
  const previousRenderTarget = renderer.getRenderTarget();
  const cullingStates = [];
  let prewarmTarget = null;

  try {
    // Make only the selected map visible. Its full area is rendered to a small
    // off-screen target so all map textures and geometry buffers reach the GPU
    // before the player enters, without flashing the arena over the menu.
    garage.setArenaVisible(true);
    const spawn = layout.spawn;

    // A high overhead view fits either complete map in one inexpensive pass.
    // This deliberately covers distant scenery too, where new materials would
    // otherwise compile lazily as the player drives around the map.
    camera.position.set(0, 240, 0);
    camera.up.set(0, 0, -1);
    camera.fov = 58;
    camera.near = 0.1;
    camera.far = 420;
    camera.updateProjectionMatrix();
    camera.lookAt(0, 0, 0);

    mapVisual.traverse((object) => {
      if (typeof object.frustumCulled !== "boolean") return;
      cullingStates.push([object, object.frustumCulled]);
      object.frustumCulled = false;
    });

    // Gravel Basin tracks the shadow frustum around the truck. Prewarm it at
    // its real spawn point so entering the map does not immediately invalidate
    // the shadow map and trigger another expensive first-frame update.
    if (mapId === "gravel-basin") {
      const offset = activeLighting.sunOffset;
      sun.target.position.set(spawn.x, 0, spawn.z);
      sun.position.set(
        spawn.x + offset[0],
        offset[1],
        spawn.z + offset[2]
      );
      sun.target.updateMatrixWorld();
      sun.updateMatrixWorld();
    }
    requestShadowRefresh();

    // Compile all map materials and draw the complete map once at low
    // resolution. Keeping culling disabled through this render also uploads
    // textures and buffers for scenery outside the original spawn view.
    renderer.compile(scene, camera);
    prewarmTarget = new THREE.WebGLRenderTarget(384, 216, {
      depthBuffer: true,
      stencilBuffer: false
    });
    renderer.setRenderTarget(prewarmTarget);
    renderer.render(scene, camera);
    warmedMapGraphics.add(mapId);
    lastShadowRefreshAt = performance.now();
    return true;
  } catch (error) {
    console.warn("Map graphics prewarm failed; the map will load normally:", error);
    return false;
  } finally {
    renderer.setRenderTarget(previousRenderTarget);
    prewarmTarget?.dispose();
    garage.setArenaVisible(false);
    for (const [object, wasCulled] of cullingStates) {
      object.frustumCulled = wasCulled;
    }
    camera.position.copy(previousCameraPosition);
    camera.quaternion.copy(previousCameraQuaternion);
    camera.up.copy(previousCameraUp);
    camera.fov = previousCameraFov;
    camera.near = previousCameraNear;
    camera.far = previousCameraFar;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  }
}
game.prepareMapGraphics = prepareMapGraphics;

let isPaused = false;
game.isPaused = () => isPaused;
function setPaused(nextPaused) {
  const shouldPause = Boolean(nextPaused) && multiplayer.joined;
  if (isPaused === shouldPause) return;
  isPaused = shouldPause;

  const pauseOverlay = $("pauseOverlay");
  const pauseButton = $("pauseButton");
  const sandboxEditButton = $("sandboxEditButton");
  pauseOverlay.style.display = isPaused ? "grid" : "none";
  if (sandboxEditButton) {
    sandboxEditButton.style.display =
      isPaused && sandbox.active && sandbox.inMap ? "block" : "none";
  }
  pauseButton.setAttribute("aria-expanded", isPaused ? "true" : "false");
  pauseButton.textContent = isPaused ? "PAUSED" : "PAUSE · ESC";

  // Clear held keys when entering or leaving the menu so a key held while
  // paused cannot unexpectedly accelerate the truck after resuming.
  for (const key of Object.keys(controls.keys)) controls.keys[key] = false;

  if (isPaused) {
    sandbox.clearHeldControls?.();
    chassisBody.velocity.set(0, 0, 0);
    chassisBody.angularVelocity.set(0, 0, 0);
    for (let i = 0; i < 4; i++) {
      vehicle.applyEngineForce(0, i);
      vehicle.setBrake(0, i);
    }
    vehicle.setSteeringValue(0, 0);
    vehicle.setSteeringValue(0, 1);
  }
}
game.setPaused = setPaused;
$("pauseButton").addEventListener("click", () => setPaused(!isPaused));
$("resumeButton").addEventListener("click", () => setPaused(false));
$("sandboxEditButton").addEventListener("click", () => {
  if (!multiplayer.joined || !sandbox.active || !sandbox.inMap) return;
  setPaused(false);
  sandbox.showBuilder();
  showToast("Back in the workshop — edit your truck, then re-enter the map");
});
$("leaveButton").addEventListener("click", () => setPaused(false));

const timeOfDaySelect = $("timeOfDaySelect");
timeOfDaySelect.value = activeTimeOfDay;
timeOfDaySelect.addEventListener("change", () => {
  if (setTimeOfDay(timeOfDaySelect.value)) {
    const label = timeOfDaySelect.options[timeOfDaySelect.selectedIndex].textContent;
    showToast("TIME OF DAY: " + label);
  }
});

window.addEventListener("keydown", (event) => {
  if (event.repeat || event.key !== "Escape" || !multiplayer.joined ||
      (sandbox.active && !sandbox.inMap)) return;
  // Let Escape close the native select dropdown first when it has focus.
  if (event.target === timeOfDaySelect && isPaused) return;
  event.preventDefault();
  setPaused(!isPaused);
});

// Drive opens the live lobby browser. Users can join an existing lobby
// or open the separate Create Lobby panel.
$("menuDriveButton").addEventListener("click", () => garage.showModeSelect());
const arenaSelect = $("arenaSelect");
const arenaDescription = $("arenaDescription");
const arenaDescriptions = {
  "closed-course": "A closed dirt circuit with marked corners, jumps and red/white curbs.",
  "gravel-basin": "A huge open gravel area with rolling terrain, natural jumps, parked full-size vehicles and a tree-lined edge."
};
if (arenaSelect) {
  arenaSelect.value = game.activeMapId;
  if (arenaDescription) arenaDescription.textContent = arenaDescriptions[game.activeMapId];
  arenaSelect.addEventListener("change", () => {
    if (game.setActiveMap(arenaSelect.value)) {
      game.multiplayer?.updateAvailableModes?.();
      if (arenaDescription) arenaDescription.textContent = arenaDescriptions[game.activeMapId];
    } else {
      arenaSelect.value = game.activeMapId;
    }
  });
}
$("openCreateLobbyButton").addEventListener("click", () => {
  multiplayer.updateAvailableModes();
  garage.showCreateLobby();
});
$("modeBackButton").addEventListener("click", () => garage.showMainMenu());
$("menuGarageButton").addEventListener("click", () => garage.showGarage());
$("garageBackButton").addEventListener("click", () => garage.showMainMenu());
$("driveBackButton").addEventListener("click", () => garage.showModeSelect());

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  applyMapRenderQuality(game.activeMapId || "closed-course");
}
window.addEventListener("resize", resize);

const CATASTROPHIC_DAMAGE_THRESHOLD = 25;
let lastTime = performance.now();
let drivingControlErrorReported = false;
function animate(now) {
  requestAnimationFrame(animate);
  const delta = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  const drivingActive = garage.viewMode === "drive";
  try {
    if (!isPaused && drivingActive) {
      controls.updateDrivingControls(delta);
    } else {
      // The showroom and builder are display-only: clear stale input and wheel
      // forces instead of letting controls keep acting on the parked truck.
      for (const key of Object.keys(controls.keys)) controls.keys[key] = false;
      for (let i = 0; i < 4; i++) {
        vehicle.applyEngineForce(0, i);
        vehicle.setBrake(0, i);
      }
      vehicle.setSteeringValue(0, 0);
      vehicle.setSteeringValue(0, 1);
    }
  } catch (error) {
    // A control bug must not stop the render loop or turn the track screen
    // into a blank background. Remove drive force and report the error once.
    for (let i = 0; i < 4; i++) {
      vehicle.applyEngineForce(0, i);
      vehicle.setBrake(0, i);
    }
    vehicle.setSteeringValue(0, 0);
    vehicle.setSteeringValue(0, 1);
    if (!drivingControlErrorReported) {
      console.error("Driving controls failed; keeping the game running:", error);
      showToast("Driving input error — please reload the game");
      drivingControlErrorReported = true;
    }
  }
  garage.updateGarageShellAnimation(now);
  sandbox.update(delta, now);
  // The physics world is only active while the truck is on a driving screen.
  // This keeps showroom, menus, and the Sandbox builder completely stationary.
  if (drivingActive && !isPaused) {
    world.step(FIXED_STEP, delta, 3);

    const deltaVelocity = [
      chassisBody.velocity.x - previousLaunchVelocity.x,
      chassisBody.velocity.y - previousLaunchVelocity.y,
      chassisBody.velocity.z - previousLaunchVelocity.z
    ];
    const deltaAngular = [
      chassisBody.angularVelocity.x - previousLaunchAngularVelocity.x,
      chassisBody.angularVelocity.y - previousLaunchAngularVelocity.y,
      chassisBody.angularVelocity.z - previousLaunchAngularVelocity.z
    ];
    const cheatModifiers = sandbox.getCheatModifiers?.() || { flingResistance: 0, damageEnabled: true, invincible: false, damageMultiplier: 1 };
    if (cheatModifiers.flingResistance > 0) {
      const factor = 1 - THREE.MathUtils.clamp(cheatModifiers.flingResistance, 0, 1);
      chassisBody.velocity.set(previousLaunchVelocity.x + deltaVelocity[0] * factor, previousLaunchVelocity.y + deltaVelocity[1] * factor, previousLaunchVelocity.z + deltaVelocity[2] * factor);
      chassisBody.angularVelocity.set(previousLaunchAngularVelocity.x + deltaAngular[0] * factor, previousLaunchAngularVelocity.y + deltaAngular[1] * factor, previousLaunchAngularVelocity.z + deltaAngular[2] * factor);
      for (let i = 0; i < 3; i++) { deltaVelocity[i] *= factor; deltaAngular[i] *= factor; }
    }
    const linearChange = Math.hypot(...deltaVelocity);
    const angularChange = Math.hypot(...deltaAngular);
    previousLaunchVelocity.copy(chassisBody.velocity);
    previousLaunchAngularVelocity.copy(chassisBody.angularVelocity);

    const stressNow = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (
      stressNow - lastLaunchStressAt >= 280 &&
      (linearChange >= 4.1 || angularChange >= 7.0)
    ) {
      lastLaunchStressAt = stressNow;
      localCar.setDamageMultiplier?.(cheatModifiers.damageMultiplier);
      const stressResult = (!cheatModifiers.invincible && cheatModifiers.damageEnabled) ? localCar.applyLaunchStress?.({
        deltaVelocity,
        deltaAngular,
        linearChange,
        angularChange,
        velocity: [chassisBody.velocity.x, chassisBody.velocity.y, chassisBody.velocity.z]
      }) : null;
      if (stressResult?.damaged?.length) {
        const detached = stressResult.detached.length
          ? " · " + stressResult.detached.join(", ").toUpperCase() + " DISCONNECTED"
          : "";
        showToast("SUDDEN-LAUNCH STRESS · " + stressResult.damaged[0].toUpperCase() + " DAMAGED" + detached);
      }
    }

    for (const impact of impactDamageSystem.drain()) {
      localCar.setDamageMultiplier?.(cheatModifiers.damageMultiplier);
      const damageResult = (!cheatModifiers.invincible && cheatModifiers.damageEnabled) ? localCar.applyImpact?.(impact) : null;
      if (damageResult) {
        const detachedText = damageResult.detached.length
          ? " · " + damageResult.detached.join(", ").toUpperCase() + " DISCONNECTED"
          : "";
        showToast(damageResult.primary.toUpperCase() + " DAMAGED" + detachedText);
      }
    }
  } else {
    previousLaunchVelocity.copy(chassisBody.velocity);
    previousLaunchAngularVelocity.copy(chassisBody.angularVelocity);
  }
  const damageRules = sandbox.getCheatModifiers?.() || { damageEnabled: true };
  const damageBeforeFailure = damageRules.damageEnabled ? localCar.getDamageSummary?.() : null;
  if (
    damageBeforeFailure &&
    !damageBeforeFailure.totalled &&
    damageBeforeFailure.damagePercent >= CATASTROPHIC_DAMAGE_THRESHOLD
  ) {
    localCar.triggerCatastrophicFailure?.();
    showToast("VEHICLE TOTALLED · ALL COMPONENTS RELEASED · PRESS R TO RESET");
  }
  localCar.updateDebris?.(delta);
  // Stabilize the Sandbox chassis after physics so contact forces cannot build into a flip.
  sandbox.postPhysicsUpdate(delta);
  // Read wheel contact and sliding flags before visual wheel transforms refresh them.

  updateLocalVisual();
  race.update(delta, now);
  multiplayer.updateRemoteVisuals(delta);

  const speedMph = chassisBody.velocity.length() * 2.236936;
  $("speedValue").textContent = String(Math.round(speedMph));
  const touching = vehicle.wheelInfos.filter((wheel) => wheel.isInContact).length;
  $("wheelStatus").textContent = touching + " / 4 TIRES IN CONTACT";
  const damageSummary = localCar.getDamageSummary?.() || {
    damaged: 0, detached: 0, damagePercent: 0, totalled: false, damagedNames: []
  };
  $("damageValue").textContent = damageSummary.totalled
    ? "VEHICLE TOTALLED · PRESS R"
    : damageSummary.detached
      ? damageSummary.detached + " PART" + (damageSummary.detached === 1 ? "" : "S") + " DETACHED"
      : damageSummary.damaged
        ? damageSummary.damaged + " PART" + (damageSummary.damaged === 1 ? "" : "S") + " DAMAGED"
        : "ALL SYSTEMS NOMINAL";
  $("damageDetails").textContent = damageSummary.totalled
    ? "ALL COMPONENTS RELEASED · RESET REQUIRED"
    : damageSummary.damagePercent
      ? damageSummary.damagePercent + "% OVERALL DAMAGE · TOTAL-OUT AT " + CATASTROPHIC_DAMAGE_THRESHOLD + "%"
      : "0 COMPONENTS DAMAGED";
  $("damageCard").classList.toggle("damaged", damageSummary.damaged > 0);
  $("damageCard").classList.toggle("totalled", damageSummary.totalled);

  // The showroom camera presents the parked truck in menu and garage views.
  if (garage.viewMode === "menu" || garage.viewMode === "mode-select" || garage.viewMode === "create-lobby" || garage.viewMode === "garage" || garage.viewMode === "sandbox-builder") {
    easeCameraFov(58, delta, 4.0);
    const showroomScale = Math.max(1, localCar.root.scale.x || 1);
    const distance = (garage.viewMode === "sandbox-builder" ? 3.45 : garage.viewMode === "garage" ? 2.35 : 5.1) * showroomScale;
    const height = (garage.viewMode === "sandbox-builder" ? 1.55 : garage.viewMode === "garage" ? 1.18 : 2.15) * showroomScale;
    const orbitDirection = new THREE.Vector3(0, 0, 1)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), controls.cameraOrbitYaw + (garage.viewMode === "menu" ? -0.18 : 0));
    const showroomCamera = localCar.root.position.clone()
      .addScaledVector(orbitDirection, distance)
      .add(new THREE.Vector3(0, height, 0));
    camera.position.lerp(showroomCamera, 1 - Math.exp(-3.2 * delta));
    camera.lookAt(localCar.root.position.clone().add(new THREE.Vector3(0, 0.12 * showroomScale, 0)));
    garage.updateHoverBounds();
  } else {
  // Finished drivers can spectate a live opponent; otherwise each camera
  // follows the local truck. Remote car visuals are already interpolated.
  const spectatedPlayer = race.getSpectateTarget();
  const followedCar = spectatedPlayer?.visual || localCar;
  const followedRoot = followedCar.root;
  const worldUp = new THREE.Vector3(0, 1, 0);
  const fullCarForward = new THREE.Vector3(0, 0, -1)
    .applyQuaternion(followedRoot.quaternion)
    .normalize();

  if (cameraMode === "stand") {
    // Fixed operator viewpoint above the wooden stand. The camera pans toward
    // the active car and optically zooms as the car moves farther around track.
    const mount = trackLayout.standCamera;
    if (mount) {
      const standPosition = new THREE.Vector3(mount.x, mount.y, mount.z);
      camera.position.lerp(standPosition, 1 - Math.exp(-4.0 * delta));
      const target = followedRoot.position.clone().add(new THREE.Vector3(0, 0.22, 0));
      const distance = Math.max(1, camera.position.distanceTo(target));
      const desiredFov = THREE.MathUtils.clamp(54 * (18 / distance), 12, 54);
      easeCameraFov(desiredFov, delta, 2.8);
      camera.up.copy(worldUp);
      camera.lookAt(target);
    }
  } else if (cameraMode === "hood") {
    // Rigid hood mount: position and field of view do not change with speed.
    // Copy the mount directly so acceleration cannot leave the camera lagging
    // behind the truck and create the impression of an unwanted zoom-out.
    const hoodPosition = followedRoot.localToWorld(
      new THREE.Vector3(0, 0.345, -0.34)
    );
    const cameraCarScale = Math.max(1, followedRoot.scale.x || 1);
    const hoodTarget = hoodPosition.clone()
      .addScaledVector(fullCarForward, 8.0 * cameraCarScale)
      .add(new THREE.Vector3(0, 0.08 * cameraCarScale, 0));
    camera.position.copy(hoodPosition);
    if (camera.fov !== 66) {
      camera.fov = 66;
      camera.updateProjectionMatrix();
    }
    camera.up.copy(worldUp);
    camera.lookAt(hoodTarget);
  } else if (cameraMode === "interior") {
    // Raised driver-eye position inside the cab, giving a clearer view over
    // the hood and farther down the track without changing the fixed FOV.
    const interiorPosition = followedRoot.localToWorld(
      new THREE.Vector3(0, 0.355, 0.025)
    );
    const cameraCarScale = Math.max(1, followedRoot.scale.x || 1);
    const interiorTarget = interiorPosition.clone()
      .addScaledVector(fullCarForward, 13.0 * cameraCarScale)
      .add(new THREE.Vector3(0, 0.045 * cameraCarScale, 0));
    camera.position.copy(interiorPosition);
    if (camera.fov !== 74) {
      camera.fov = 74;
      camera.updateProjectionMatrix();
    }
    camera.up.copy(worldUp);
    camera.lookAt(interiorTarget);
  } else {
    // Original Chase camera: same trailing distance, height, orbit control,
    // and follow target as before this selector was added.
    const carForward = fullCarForward.clone();
    carForward.y = 0;
    if (carForward.lengthSq() < 0.0001) carForward.set(0, 0, -1);
    carForward.normalize();
    const cameraDirection = carForward.clone().applyAxisAngle(worldUp, controls.cameraOrbitYaw);
    const cameraCarScale = Math.max(1, followedRoot.scale.x || 1);
    const desiredCamera = followedRoot.position.clone()
      .addScaledVector(cameraDirection, -5.8 * cameraCarScale)
      .add(new THREE.Vector3(0, 2.8 * cameraCarScale, 0));
    camera.position.lerp(desiredCamera, 1 - Math.exp(-2.8 * delta));
    easeCameraFov(58, delta, 4.0);
    const lookTarget = followedRoot.position.clone()
      .add(new THREE.Vector3(0, 0.28 * cameraCarScale, 0))
      .addScaledVector(carForward, 0.85 * cameraCarScale);
    camera.up.copy(worldUp);
    camera.lookAt(lookTarget);
  }
  }

  // The hidden Sandbox Orbital Laser warning adds a slowly intensifying
  // camera vibration on every client before the synchronized map reset.
  const orbitalLaserShake = sandbox.getCameraShakeOffset?.(Date.now());
  if (orbitalLaserShake?.lengthSq?.() > 0) camera.position.add(orbitalLaserShake);

  multiplayer.sendSnapshotIfReady(delta);

  // Keep the large outdoor-map shadow frusta centered near the truck.
  if (game.activeMapId === "gravel-basin" && garage.viewMode === "drive") {
    const focusX = Math.round(chassisBody.position.x / 3) * 3;
    const focusZ = Math.round(chassisBody.position.z / 3) * 3;
    sun.target.position.set(focusX, 0, focusZ);
    sun.position.set(
      focusX + activeLighting.sunOffset[0],
      activeLighting.sunOffset[1],
      focusZ + activeLighting.sunOffset[2]
    );
    sun.target.updateMatrixWorld();
    sun.updateMatrixWorld();
  }

  // Static map casters do not need a new shadow pass every frame. Refresh at
  // roughly 5-6 Hz while driving so the truck's moving shadow stays responsive
  // without spending the GPU budget rendering the full scenery 60 times/sec.
  if (drivingActive && !isPaused &&
      now - lastShadowRefreshAt >= SHADOW_REFRESH_INTERVAL_MS) {
    requestShadowRefresh();
    lastShadowRefreshAt = now;
  }

  // Keep the visible sun aligned with the active lighting preset and camera.
  syncVisibleSun();
  renderer.render(scene, camera);
}
updateLocalVisual();
garage.showMainMenu();
// Prewarm the default arena under the loading screen. Alternate maps are
// prepared as soon as they are selected in the lobby browser.
prepareMapGraphics(game.activeMapId);
$("loading").style.display = "none";
requestAnimationFrame(animate);

// Keep the driver's name in the multiplayer lobby browser between visits.
const DRIVER_NAME_STORAGE_KEY = "rc-car-driver-nickname";
function cleanDriverName(value) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 18);
}
let savedDriverName = "";
try {
  savedDriverName = cleanDriverName(window.localStorage.getItem(DRIVER_NAME_STORAGE_KEY));
} catch (error) {
  console.warn("Driver-name storage is unavailable in this browser:", error);
}
if (!savedDriverName) {
  savedDriverName = "Driver" + String(Math.floor(100 + Math.random() * 900));
}

const driverNameInput = $("driverName");
driverNameInput.value = savedDriverName;
multiplayer.setDriverName(savedDriverName);

function syncDriverName() {
  const driverName = cleanDriverName(driverNameInput.value);
  if (!driverName) return;
  driverNameInput.value = driverName;
  multiplayer.setDriverName(driverName);
  savedDriverName = driverName;
  try {
    window.localStorage.setItem(DRIVER_NAME_STORAGE_KEY, driverName);
  } catch (error) {
    console.warn("Could not save the driver name in this browser:", error);
  }
}
function restoreDriverName() {
  driverNameInput.value = savedDriverName;
  multiplayer.setDriverName(savedDriverName);
}
driverNameInput.addEventListener("input", syncDriverName);
driverNameInput.addEventListener("blur", restoreDriverName);
