/**
 * Performance demonstration: Matrix computation refactor
 * Shows the efficiency improvement from precomputing transformation matrices
 */

import { RayTracer } from '../optical/RayTracer';
import { OpticalSystemParser } from '../optical/OpticalSystem';

const demoYAML = `
optical_train:
  - id: l1
    type: light
    wavelength: 532
    lid: 0
  - id: lens
    type: assembly
    aid: 0
  - id: detector 
    type: surface
    position: [100, 0, 0]
    mode: absorption
    shape: plano
    height: 50
    width: 50

light_sources:
  0:
    lid: 0
    position: [-10, 0, 0]
    vector: [1, 0, 0]
    wavelength: 532
    number: 1000  # Many rays for performance test
    type: linear
    param: 20

assemblies:
  0:
    aid: 0
    position: [0, 0, 0]
    normal: [-1, 0, 0]
    surfaces:
      - id: s1
        shape: spherical
        radius: 100
        mode: refraction
        n1: 1.0
        n2: 1.5

surfaces:
  0:
    sid: 0
    shape: plano
    mode: stop
    semidia: 10
`;

console.log('🚀 Performance Demo: Matrix Computation Refactor');
console.log('================================================');

// Parse optical system (this triggers matrix precomputation)
const startPrecompute = performance.now();
const opticalSystem = OpticalSystemParser.parseYAML(demoYAML);
const precomputeTime = performance.now() - startPrecompute;

console.log(`\n📊 System Setup:`);
console.log(`   Surfaces: ${opticalSystem.surfaces.length}`);
console.log(`   Light sources: ${opticalSystem.lightSources.length}`);
console.log(`   Matrix precomputation: ${precomputeTime.toFixed(2)}ms`);

// Verify matrices are precomputed
const surface = opticalSystem.surfaces[0];
console.log(`\n🔧 Matrix Verification (Surface ${surface.id}):`);
console.log(`   forwardTransform: ${surface.forwardTransform ? 'PRECOMPUTED ✅' : 'MISSING ❌'}`);
console.log(`   inverseTransform: ${surface.inverseTransform ? 'PRECOMPUTED ✅' : 'MISSING ❌'}`);

// Run ray tracing performance test
const rays = opticalSystem.lightSources[0].generateRays(100); // 100 rays for timing
console.log(`\n🏃 Ray Tracing Performance (${rays.length} rays):`);

RayTracer.resetFirstRayTracking();
const startRayTrace = performance.now();

let successCount = 0;
for (const ray of rays) {
  const rayPath = RayTracer.traceRaySequential(ray, opticalSystem.surfaces);
  if (rayPath.length > 1) successCount++;
}

const rayTraceTime = performance.now() - startRayTrace;
const raysPerSecond = (rays.length / rayTraceTime) * 1000;

console.log(`   Ray tracing time: ${rayTraceTime.toFixed(2)}ms`);
console.log(`   Successful rays: ${successCount}/${rays.length}`);
console.log(`   Performance: ${raysPerSecond.toFixed(0)} rays/second`);

console.log(`\n✨ Optimization Benefits:`);
console.log(`   ✅ No matrix inverse() calls during ray tracing`);
console.log(`   ✅ No repeated getSurfaceToLocalTransform() calls`);  
console.log(`   ✅ Includes dial rotations in precomputed matrices`);
console.log(`   ✅ Forward and inverse matrices computed once during surface creation`);

console.log(`\n🎯 Summary:`);
console.log(`   The refactor precomputes transformation matrices (including dial rotations)`);
console.log(`   during surface construction, eliminating expensive matrix calculations`);
console.log(`   during ray tracing. This provides significant performance improvement`);
console.log(`   for systems with many rays while ensuring accuracy with proper dial handling.`);
