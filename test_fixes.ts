import { RayTracer } from './src/optical/RayTracer';
import { Ray } from './src/optical/LightSource';
import { Vector3 } from './src/math/Matrix4';
import type { OpticalSurface } from './src/optical/surfaces';

// Create a simple test with an absorption surface
const ray = new Ray(
  new Vector3(-10, 0, 0),
  new Vector3(1, 0, 0),
  532,
  0,
  1.0
);

const surfaces: OpticalSurface[] = [
  {
    id: 'lens',
    position: new Vector3(0, 0, 0),
    normal: new Vector3(-1, 0, 0),
    shape: 'spherical',
    mode: 'refraction',
    curvatureRadius: 50,
    semiDiameter: 20,
    thickness: 0,
    material: 'glass'
  },
  {
    id: 'detector',
    position: new Vector3(60, 0, 0),
    normal: new Vector3(-1, 0, 0),
    shape: 'plano',
    mode: 'absorption',
    height: 50,
    width: 50,
    thickness: 0,
    material: 'glass'
  }
];

console.log('🔬 Testing Ray Tracing Fixes');
console.log('============================');

console.log('\n1. Testing absorption surface fix...');
const rayPath = RayTracer.traceRaySequential(ray, surfaces);

console.log(`\n📊 Results:`);
console.log(`Ray path has ${rayPath.length} segments`);

console.log('\n📍 Ray path points:');
rayPath.forEach((pathRay, i) => {
  console.log(`  ${i}: (${pathRay.position.x.toFixed(3)}, ${pathRay.position.y.toFixed(3)}, ${pathRay.position.z.toFixed(3)})`);
});

console.log('\n🔍 Checking for zero-length segments:');
for (let i = 1; i < rayPath.length; i++) {
  const prev = rayPath[i-1];
  const curr = rayPath[i];
  const distance = prev.position.distanceTo(curr.position);
  
  if (distance < 1e-6) {
    console.log(`  ⚠️  Zero-length segment between points ${i-1} and ${i}: distance = ${distance}`);
  } else {
    console.log(`  ✅ Segment ${i-1} -> ${i}: distance = ${distance.toFixed(6)}`);
  }
}

const lastPoint = rayPath[rayPath.length - 1];
console.log(`\n🎯 Final ray position: (${lastPoint.position.x.toFixed(3)}, ${lastPoint.position.y.toFixed(3)}, ${lastPoint.position.z.toFixed(3)})`);
console.log(`Expected detector at: (60, 0, 0)`);

const reachedDetector = Math.abs(lastPoint.position.x - 60) < 0.1;
console.log(`${reachedDetector ? '✅' : '❌'} Ray ${reachedDetector ? 'reached' : 'did not reach'} the absorption surface`);
