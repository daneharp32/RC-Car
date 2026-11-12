// Long, closed forest single-track course with instanced woodland vegetation.
function makeForestRandom(seed = 1) {
  let value = seed >>> 0;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
}
function forestValueNoise(x, z, seed = 1) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fade = (v) => v * v * (3 - 2 * v);
  const fx = fade(x - ix), fz = fade(z - iz);
  const hash = (a, b) => { const n = Math.sin(a * 127.1 + b * 311.7 + seed * 74.7) * 43758.5453; return (n - Math.floor(n)) * 2 - 1; };
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  const top = a + (b - a) * fx, bottom = c + (d - c) * fx;
  return top + (bottom - top) * fz;
}
function makeForestTexture(THREE, random, trail = false) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create forest texture canvas.");
  const colors = trail
    ? ["#a17a53", "#5b402e", "#c09a6e", "#654632", "#8b6546", "#46362b"]
    : ["#526244", "#66734b", "#34422f", "#716b45", "#4b583c", "#806e4a", "#293b2d"];
  ctx.fillStyle = trail ? "#79543b" : "#3f4b34";
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < (trail ? 18000 : 24000); i++) {
    const r = 0.35 + random() * 2.8;
    ctx.globalAlpha = 0.10 + random() * (trail ? 0.30 : 0.34);
    ctx.fillStyle = colors[Math.floor(random() * colors.length)];
    ctx.beginPath();
    ctx.ellipse(random() * 512, random() * 512, r * (0.7 + random() * 1.8), r * (0.45 + random()), random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(trail ? 72 : 38, trail ? 3 : 38);
  texture.anisotropy = 4;
  return texture;
}
function makeForestRibbon(THREE, route, length, heightAt, offset, width, material, lift = 0.035) {
  const segments = Math.max(700, Math.ceil(length / 1.65));
  const positions = [], uvs = [], indices = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, point = route.getPointAt(t), tangent = route.getTangentAt(t).normalize();
    const nx = -tangent.z, nz = tangent.x;
    const x0 = point.x + nx * (offset - width * 0.5), z0 = point.z + nz * (offset - width * 0.5);
    const x1 = point.x + nx * (offset + width * 0.5), z1 = point.z + nz * (offset + width * 0.5);
    positions.push(x0, heightAt(x0, z0) + lift, z0, x1, heightAt(x1, z1) + lift, z1);
    uvs.push(t * length / 11, 0, t * length / 11, 1);
    if (i < segments) { const a = i * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}
function makeForestGrassGeometry(THREE) {
  const positions = [];
  const blades = [
    [-0.10,0,0,-0.18,0.36,0.02,-0.01,0.42,0],
    [0.08,0,0,0.02,0.40,-0.03,0.18,0.32,0],
    [0,0,-0.07,-0.06,0.29,-0.17,0.02,0.40,0.03],
    [0,0,0.06,0.03,0.36,0.16,0.10,0.31,0]
  ];
  for (const b of blades) {
    positions.push(b[0],b[1],b[2],b[3],b[4],b[5],b[6],b[7],b[8]);
    positions.push(b[0],b[1],b[2],b[6],b[7],b[8],b[3]*0.72,b[4]*0.72,b[5]*0.72);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}
export function createForestTrailSystem({ THREE, scene }) {
  const mapGroup = new THREE.Group();
  mapGroup.name = "deep-forest-single-track";
  mapGroup.userData.mapId = "forest-trail";
  mapGroup.visible = false;
  scene.add(mapGroup);

  const random = makeForestRandom(614209);
  const size = 860, half = size * 0.5, collisionSegments = 128;
  const elementSize = size / collisionSegments, trackHalfWidth = 4.65;
  const routePoints = [
    [0,-356],[92,-345],[188,-292],[252,-214],[270,-118],[225,-50],
    [145,4],[190,83],[258,165],[246,250],[176,319],[82,350],
    [-25,344],[-132,303],[-225,232],[-278,145],[-258,61],
    [-184,8],[-154,-72],[-220,-143],[-246,-231],[-180,-306],[-82,-350]
  ].map(([x,z]) => new THREE.Vector3(x,0,z));
  const route = new THREE.CatmullRomCurve3(routePoints,true,"centripetal",0.34);
  route.arcLengthDivisions = 2600;
  route.updateArcLengths();
  const trackLength = route.getLength();
  const routeBuckets = new Map(), cellSize = 22;
  const key = (x,z) => Math.floor(x/cellSize) + "," + Math.floor(z/cellSize);
  for (const point of route.getPoints(1800)) {
    const k = key(point.x,point.z);
    let bucket = routeBuckets.get(k);
    if (!bucket) routeBuckets.set(k,bucket=[]);
    bucket.push(point);
  }
  function distanceToTrail(x,z) {
    const ix=Math.floor(x/cellSize), iz=Math.floor(z/cellSize);
    let best=Infinity;
    for(let dx=-1;dx<=1;dx++) for(let dz=-1;dz<=1;dz++) {
      const bucket=routeBuckets.get((ix+dx)+","+(iz+dz));
      if(!bucket) continue;
      for(const p of bucket) { const ax=x-p.x, az=z-p.z; best=Math.min(best,ax*ax+az*az); }
    }
    return Math.sqrt(best);
  }
  function terrainHeight(x,z) {
    let h=0.72;
    h += forestValueNoise(x/78,z/78,17)*0.86;
    h += forestValueNoise(x/34,z/34,31)*0.38;
    h += forestValueNoise(x/13,z/13,53)*0.105;
    h += Math.sin(x*0.022+Math.sin(z*0.017))*0.12 + Math.sin(z*0.019-x*0.013)*0.10;
    h += 0.46*Math.exp(-((x+310)**2+(z-90)**2)/(2*75*75));
    h += 0.35*Math.exp(-((x-290)**2+(z+20)**2)/(2*95*95));
    return Math.max(0.04,h);
  }

  const heights=Array.from({length:collisionSegments+1},(_,xi)=>{
    const x=-half+xi*elementSize;
    return Array.from({length:collisionSegments+1},(_,zi)=>terrainHeight(x,half-zi*elementSize));
  });
  const visualSegments=220, visualStep=size/visualSegments;
  const positions=[],uvs=[],colors=[],indices=[];
  for(let xi=0;xi<=visualSegments;xi++) {
    const x=-half+xi*visualStep;
    for(let zi=0;zi<=visualSegments;zi++) {
      const z=half-zi*visualStep, h=terrainHeight(x,z);
      const broad=forestValueNoise(x/44,z/44,81), fine=forestValueNoise(x/9,z/9,93);
      const tone=THREE.MathUtils.clamp(0.92+broad*0.10+fine*0.055+(h-0.7)*0.018,0.72,1.08);
      positions.push(x,h,z); uvs.push(xi/visualSegments*38,zi/visualSegments*38);
      colors.push(tone*0.88,tone*0.97,tone*0.76);
      if(xi<visualSegments&&zi<visualSegments) {
        const a=xi*(visualSegments+1)+zi,b=a+visualSegments+1;
        indices.push(a,b,a+1,b,b+1,a+1);
      }
    }
  }
  const floorTexture=makeForestTexture(THREE,random,false);
  const floorGeometry=new THREE.BufferGeometry();
  floorGeometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
  floorGeometry.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));
  floorGeometry.setAttribute("color",new THREE.Float32BufferAttribute(colors,3));
  floorGeometry.setIndex(indices);
  floorGeometry.computeVertexNormals();
  const forestFloor=new THREE.Mesh(floorGeometry,new THREE.MeshStandardMaterial({
    map:floorTexture,bumpMap:floorTexture,bumpScale:0.024,vertexColors:true,color:0xffffff,roughness:1,metalness:0
  }));
  forestFloor.name="moss-leaf-litter-forest-floor";
  forestFloor.receiveShadow=true;
  mapGroup.add(forestFloor);

  const trailTexture=makeForestTexture(THREE,random,true);
  const trailMaterial=new THREE.MeshStandardMaterial({map:trailTexture,bumpMap:trailTexture,bumpScale:0.012,color:0xffffff,roughness:1});
  const shoulderMaterial=new THREE.MeshStandardMaterial({color:0x554331,roughness:1});
  const rutMaterial=new THREE.MeshStandardMaterial({color:0x4d3629,roughness:1});
  mapGroup.add(makeForestRibbon(THREE,route,trackLength,terrainHeight,0,trackHalfWidth*2,trailMaterial,0.055));
  for(const side of [-1,1]) {
    mapGroup.add(makeForestRibbon(THREE,route,trackLength,terrainHeight,side*(trackHalfWidth+0.78),1.5,shoulderMaterial,0.042));
    mapGroup.add(makeForestRibbon(THREE,route,trackLength,terrainHeight,side*1.82,0.20,rutMaterial,0.068));
  }

  const treeSpots=[], broadleafSpots=[], treeStep=7.15;
  for(let x=-half+10;x<=half-10;x+=treeStep) for(let z=-half+10;z<=half-10;z+=treeStep) {
    const px=x+(random()-0.5)*4.5, pz=z+(random()-0.5)*4.5;
    if(distanceToTrail(px,pz)<trackHalfWidth+4.2 || random()<0.10) continue;
    const spot={x:px,z:pz,scale:1.55+random()*0.95,yaw:random()*Math.PI*2};
    if(random()<0.24) broadleafSpots.push(spot); else treeSpots.push(spot);
  }
  const treeGroup=new THREE.Group(), dummy=new THREE.Object3D();
  treeGroup.name="dense-mixed-evergreen-canopy";
  const allTrees=treeSpots.concat(broadleafSpots);
  const trunkGeometry=new THREE.CylinderGeometry(0.16,0.30,1,8,1);
  const trunks=new THREE.InstancedMesh(trunkGeometry,new THREE.MeshStandardMaterial({color:0x57412e,roughness:1}),allTrees.length);
  const trunkObstacles=[];
  for(let i=0;i<allTrees.length;i++) {
    const tree=allTrees[i], ground=terrainHeight(tree.x,tree.z), trunkHeight=tree.scale*4.5;
    dummy.position.set(tree.x,ground+trunkHeight*0.5,tree.z);
    dummy.rotation.set(0,tree.yaw,0);
    dummy.scale.set(tree.scale*0.78,trunkHeight,tree.scale*0.78);
    dummy.updateMatrix(); trunks.setMatrixAt(i,dummy.matrix);
    if(distanceToTrail(tree.x,tree.z)<48 && random()<0.22) {
      trunkObstacles.push({
        x:tree.x,y:ground+trunkHeight*0.5,z:tree.z,yaw:tree.yaw,
        halfWidth:0.30+tree.scale*0.045,halfHeight:trunkHeight*0.5,halfLength:0.30+tree.scale*0.045
      });
    }
  }
  trunks.castShadow=false; trunks.receiveShadow=false;
  trunks.instanceMatrix.needsUpdate=true; trunks.computeBoundingSphere();
  treeGroup.add(trunks);

  const pineMaterials=[
    new THREE.MeshStandardMaterial({color:0x24432f,roughness:1}),
    new THREE.MeshStandardMaterial({color:0x31563a,roughness:1}),
    new THREE.MeshStandardMaterial({color:0x3a6341,roughness:1})
  ];
  const pineLayers=[
    {y:4.8,sx:2.45,sy:3.55,sz:2.45},
    {y:6.25,sx:1.90,sy:3.10,sz:1.90},
    {y:7.55,sx:1.30,sy:2.65,sz:1.30}
  ];
  for(let li=0;li<pineLayers.length;li++) {
    const layer=pineLayers[li];
    const mesh=new THREE.InstancedMesh(new THREE.ConeGeometry(1,1,8,1),pineMaterials[li],treeSpots.length);
    for(let i=0;i<treeSpots.length;i++) {
      const tree=treeSpots[i], ground=terrainHeight(tree.x,tree.z), s=tree.scale;
      dummy.position.set(tree.x,ground+layer.y*s,tree.z);
      dummy.rotation.set(0,tree.yaw+li*0.17,0);
      dummy.scale.set(layer.sx*s,layer.sy*s,layer.sz*s);
      dummy.updateMatrix(); mesh.setMatrixAt(i,dummy.matrix);
      mesh.setColorAt(i,new THREE.Color().setHSL(0.285+random()*0.035,0.31+random()*0.16,0.18+random()*0.10));
    }
    mesh.castShadow=false; mesh.receiveShadow=false; mesh.instanceMatrix.needsUpdate=true;
    if(mesh.instanceColor) mesh.instanceColor.needsUpdate=true;
    mesh.computeBoundingSphere(); treeGroup.add(mesh);
  }
  const broadleafCanopies=new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1,1),
    new THREE.MeshStandardMaterial({color:0x466744,roughness:1,flatShading:true}),
    broadleafSpots.length
  );
  for(let i=0;i<broadleafSpots.length;i++) {
    const tree=broadleafSpots[i], ground=terrainHeight(tree.x,tree.z), s=tree.scale;
    dummy.position.set(tree.x,ground+5.1*s,tree.z);
    dummy.rotation.set(random()*0.18,tree.yaw,random()*0.12);
    dummy.scale.set(2.65*s,2.18*s,2.45*s);
    dummy.updateMatrix(); broadleafCanopies.setMatrixAt(i,dummy.matrix);
    broadleafCanopies.setColorAt(i,new THREE.Color().setHSL(0.255+random()*0.055,0.26+random()*0.18,0.20+random()*0.12));
  }
  broadleafCanopies.castShadow=false; broadleafCanopies.receiveShadow=false;
  broadleafCanopies.instanceMatrix.needsUpdate=true;
  if(broadleafCanopies.instanceColor) broadleafCanopies.instanceColor.needsUpdate=true;
  broadleafCanopies.computeBoundingSphere(); treeGroup.add(broadleafCanopies);
  mapGroup.add(treeGroup);

  const bushSpots=[], bushStep=3.55;
  for(let x=-half+7;x<=half-7;x+=bushStep) for(let z=-half+7;z<=half-7;z+=bushStep) {
    if(random()>0.23) continue;
    const px=x+(random()-0.5)*2.9,pz=z+(random()-0.5)*2.9;
    if(distanceToTrail(px,pz)<trackHalfWidth+1.4) continue;
    bushSpots.push({x:px,z:pz,scale:0.58+random()*0.84,yaw:random()*Math.PI*2});
  }
  const bushMesh=new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.48,1),
    new THREE.MeshStandardMaterial({color:0x41613a,roughness:1,flatShading:true}),
    bushSpots.length
  );
  for(let i=0;i<bushSpots.length;i++) {
    const bush=bushSpots[i], ground=terrainHeight(bush.x,bush.z);
    dummy.position.set(bush.x,ground+0.24*bush.scale,bush.z);
    dummy.rotation.set(0,bush.yaw,0);
    dummy.scale.set(1.38*bush.scale,0.80*bush.scale,1.18*bush.scale);
    dummy.updateMatrix(); bushMesh.setMatrixAt(i,dummy.matrix);
    bushMesh.setColorAt(i,new THREE.Color().setHSL(0.23+random()*0.07,0.26+random()*0.27,0.17+random()*0.15));
  }
  bushMesh.castShadow=false; bushMesh.receiveShadow=false; bushMesh.instanceMatrix.needsUpdate=true;
  if(bushMesh.instanceColor) bushMesh.instanceColor.needsUpdate=true;
  bushMesh.computeBoundingSphere(); mapGroup.add(bushMesh);

  const grassSpots=[], grassStep=2.55;
  for(let x=-half+5;x<=half-5;x+=grassStep) for(let z=-half+5;z<=half-5;z+=grassStep) {
    if(random()>0.17) continue;
    const px=x+(random()-0.5)*2.0,pz=z+(random()-0.5)*2.0;
    if(distanceToTrail(px,pz)<trackHalfWidth+0.18) continue;
    grassSpots.push({x:px,z:pz,scale:0.55+random()*1.15,yaw:random()*Math.PI*2});
  }
  const grassMesh=new THREE.InstancedMesh(
    makeForestGrassGeometry(THREE),
    new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,side:THREE.DoubleSide}),
    grassSpots.length
  );
  for(let i=0;i<grassSpots.length;i++) {
    const grass=grassSpots[i];
    dummy.position.set(grass.x,terrainHeight(grass.x,grass.z)+0.025,grass.z);
    dummy.rotation.set(0,grass.yaw,0); dummy.scale.setScalar(grass.scale);
    dummy.updateMatrix(); grassMesh.setMatrixAt(i,dummy.matrix);
    grassMesh.setColorAt(i, new THREE.Color().setHSL(
      0.23 + random() * 0.08, 0.42 + random() * 0.25, 0.22 + random() * 0.18
    ));
  }
  grassMesh.castShadow=false; grassMesh.receiveShadow=false;
  grassMesh.instanceMatrix.needsUpdate=true;
  if(grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate=true;
  grassMesh.computeBoundingSphere(); mapGroup.add(grassMesh);

  const rockSpots=[];
  for(let i=0;i<1150;i++) {
    const x=(random()-0.5)*(size-30),z=(random()-0.5)*(size-30);
    if(distanceToTrail(x,z)<trackHalfWidth+1.2) continue;
    rockSpots.push({x,z,s:0.10+random()*0.34,yaw:random()*Math.PI*2});
  }
  const rocks=new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.5,0),
    new THREE.MeshStandardMaterial({color:0x696857,roughness:1,flatShading:true}),
    rockSpots.length
  );
  for(let i=0;i<rockSpots.length;i++) {
    const rock=rockSpots[i];
    dummy.position.set(rock.x,terrainHeight(rock.x,rock.z)+rock.s*0.22,rock.z);
    dummy.rotation.set(random()*0.6,rock.yaw,random()*0.5);
    dummy.scale.set(rock.s*1.45,rock.s*0.62,rock.s);
    dummy.updateMatrix(); rocks.setMatrixAt(i,dummy.matrix);
  }
  rocks.castShadow=false; rocks.receiveShadow=false; rocks.instanceMatrix.needsUpdate=true;
  rocks.computeBoundingSphere(); mapGroup.add(rocks);

  const gateTs=[0.20,0.40,0.60,0.80,0.015];
  const raceGates=gateTs.map((t,index)=>{
    const point=route.getPointAt(t), tangent=route.getTangentAt(t).normalize();
    return {index,t,x:point.x,z:point.z,tangentX:tangent.x,tangentZ:tangent.z,
      normalX:-tangent.z,normalZ:tangent.x,finish:index===gateTs.length-1};
  });
  const centerlineSamples=Array.from({length:600},(_,index)=>{
    const t=index/600,p=route.getPointAt(t); return {t,x:p.x,z:p.z};
  });
  const spawnPoint=route.getPointAt(0.006), spawnTangent=route.getTangentAt(0.006).normalize();
  const spawn={
    x:spawnPoint.x,z:spawnPoint.z,y:terrainHeight(spawnPoint.x,spawnPoint.z),
    tangentX:spawnTangent.x,tangentZ:spawnTangent.z,
    normalX:-spawnTangent.z,normalZ:spawnTangent.x,
    yaw:Math.atan2(-spawnTangent.x,-spawnTangent.z)
  };
  return {
    arenaVisuals:[mapGroup],
    trackLayout:{
      id:"forest-trail",name:"Whispering Pines Trail",
      trackWidth:trackHalfWidth*2,trackHalfWidth,trackLength,
      jumps:[],barriers:[],
      heightfield:{heights,elementSize,originX:-half,originZ:half},
      obstacles:trunkObstacles,staticBoxes:[],spawn,
      standCamera:{x:spawn.x+4,y:spawn.y+8,z:spawn.z+12},
      raceGates,centerlineSamples
    }
  };
}