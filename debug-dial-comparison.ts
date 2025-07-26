// Debug script to directly compare GroundTruthValidator vs SurfaceRenderer dial calculations
// for the same surface to find the exact discrepancy

import fs from 'fs';
import { OpticalSystemParser } from './src/optical/OpticalSystem.js';
import { SurfaceRenderer } from './src/optical/surfaces.js';
import { GroundTruthValidator } from './src/utils/GroundTruthValidator.js';

console.log('🔍 COMPARING DIAL CALCULATION METHODS');
console.log('================================================================');

// Load Amici test file to get surfaces with known dial rotations
const amiciYaml = fs.readFileSync('./src/tests/Amici.yml', 'utf8');
console.log('📂 Loaded Amici.yml test file');

try {
  // Parse the test system
  const opticalSystem = OpticalSystemParser.parseYAML(amiciYaml);
  console.log(`✅ Successfully parsed optical system with ${opticalSystem.surfaces.length} surfaces`);
  
  // Focus on surface s2 which has dial: 35.25°
  const testSurface = opticalSystem.surfaces.find(s => s.id === 's2');
  if (!testSurface) {
    console.error('❌ Could not find surface s2 for testing');
    process.exit(1);
  }
  
  console.log(`\n🔍 Analyzing Surface s2 (dial: 35.25°):`);
  console.log(`  Position: [${testSurface.position.x.toFixed(6)}, ${testSurface.position.y.toFixed(6)}, ${testSurface.position.z.toFixed(6)}]`);
  console.log(`  Normal: [${testSurface.normal?.x.toFixed(6)}, ${testSurface.normal?.y.toFixed(6)}, ${testSurface.normal?.z.toFixed(6)}]`);
  console.log(`  localDialAngle: ${(testSurface as any).localDialAngle} radians = ${((testSurface as any).localDialAngle * 180 / Math.PI).toFixed(2)}°`);
  console.log(`  Width: ${testSurface.width || 'default'}, Height: ${testSurface.height || 'default'}, Semidia: ${testSurface.semidia || 'none'}`);
  console.log(`  normalTransform exists: ${(testSurface as any).normalTransform !== undefined}`);
  console.log(`  transform exists: ${testSurface.transform !== undefined}`);
  
  // Show detailed surface properties for coordinate calculation understanding
  console.log(`\n📋 DETAILED SURFACE PROPERTIES FOR COORDINATE CALCULATION:`);
  console.log(`  Surface mode: ${testSurface.mode}`);
  console.log(`  Surface shape: ${testSurface.shape}`);
  console.log(`  Assembly ID: ${(testSurface as any).assemblyId || 'none'}`);
  console.log(`  Element index: ${(testSurface as any).elementIndex || 'none'}`);
  
  // Show aperture dimensions used in calculations
  const width = testSurface.width || (testSurface.semidia ? testSurface.semidia * 2 : 50);
  const height = testSurface.height || (testSurface.semidia ? testSurface.semidia * 2 : 50);
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  
  console.log(`\n📐 APERTURE DIMENSIONS USED:`);
  console.log(`  Width: ${width} (halfWidth: ${halfWidth})`);
  console.log(`  Height: ${height} (halfHeight: ${halfHeight})`);
  console.log(`  Local corner pattern [X, Y, Z]:`);
  console.log(`    Corner 1: [0, ${-halfWidth}, ${-halfHeight}]`);
  console.log(`    Corner 2: [0, ${halfWidth}, ${-halfHeight}]`);
  console.log(`    Corner 3: [0, ${halfWidth}, ${halfHeight}]`);
  console.log(`    Corner 4: [0, ${-halfWidth}, ${halfHeight}]`);
  
  // METHOD 1: GroundTruthValidator approach
  console.log('\n🧮 METHOD 1: GroundTruthValidator.getSurfaceCorners()');
  const validatorCorners = (GroundTruthValidator as any).getSurfaceCorners(testSurface);
  console.log('  Validator corners:');
  validatorCorners.forEach((corner: number[], i: number) => {
    console.log(`    C${i+1}: [${corner[0].toFixed(6)}, ${corner[1].toFixed(6)}, ${corner[2].toFixed(6)}]`);
  });
  
  // METHOD 2: SurfaceRenderer approach
  console.log('\n🎨 METHOD 2: SurfaceRenderer.generatePlanarMesh()');
  const meshData = SurfaceRenderer.generatePlanarMesh(testSurface);
  console.log('  Mesh corners (first 4 vertices):');
  for (let i = 0; i < Math.min(4, meshData.x.length); i++) {
    console.log(`    V${i}: [${meshData.x[i].toFixed(6)}, ${meshData.y[i].toFixed(6)}, ${meshData.z[i].toFixed(6)}]`);
  }
  
  // COMPARISON
  console.log('\n⚖️ DETAILED COMPARISON:');
  console.log('Terminal coordinates vs Browser coordinates (should be identical):');
  const maxCorners = Math.min(validatorCorners.length, meshData.x.length);
  let maxDifference = 0;
  
  for (let i = 0; i < maxCorners; i++) {
    const vCorner = validatorCorners[i];
    const mCorner = [meshData.x[i], meshData.y[i], meshData.z[i]];
    
    const dx = Math.abs(vCorner[0] - mCorner[0]);
    const dy = Math.abs(vCorner[1] - mCorner[1]);
    const dz = Math.abs(vCorner[2] - mCorner[2]);
    const totalDiff = Math.sqrt(dx*dx + dy*dy + dz*dz);
    
    console.log(`  Corner ${i+1}:`);
    console.log(`    TERMINAL (GroundTruthValidator): [${vCorner[0].toFixed(6)}, ${vCorner[1].toFixed(6)}, ${vCorner[2].toFixed(6)}]`);
    console.log(`    TERMINAL (SurfaceRenderer):     [${mCorner[0].toFixed(6)}, ${mCorner[1].toFixed(6)}, ${mCorner[2].toFixed(6)}]`);
    console.log(`    DIFF:                           [${dx.toFixed(6)}, ${dy.toFixed(6)}, ${dz.toFixed(6)}] → ${totalDiff.toFixed(6)}`);
    console.log(`    👆 These coordinates should appear in F12 browser console for surface s2`);
    
    maxDifference = Math.max(maxDifference, totalDiff);
  }
  
  console.log(`\n📊 RESULT:`);
  console.log(`  Maximum difference: ${maxDifference.toFixed(6)}`);
  
  if (maxDifference < 1e-6) {
    console.log(`  ✅ IDENTICAL: Both methods produce the same results`);
    console.log(`  🔍 If browser shows different coordinates, check:`);
    console.log(`     1. F12 Console for "PLOTLY VISUALIZATION: Surface s2 Corner Analysis"`);
    console.log(`     2. Make sure you're hovering over s2's yellow circles (not other surfaces)`);
    console.log(`     3. Check for browser caching issues (hard refresh: Ctrl+Shift+R)`);
  } else if (maxDifference < 1e-3) {
    console.log(`  ⚠️ SMALL DIFFERENCE: Methods differ by ${maxDifference.toFixed(6)}`);
  } else {
    console.log(`  🚨 SIGNIFICANT DIFFERENCE: Methods produce different results!`);
    console.log(`     This explains why browser visualization doesn't match terminal debug output.`);
  }
  
  // DEEPER ANALYSIS: Check intermediate calculations
  console.log('\n🔬 DEEPER ANALYSIS: Intermediate Values');
  
  // Check normalTransform vs transform
  const normalTransform = (testSurface as any).normalTransform;
  const fullTransform = testSurface.transform;
  
  console.log('  normalTransform matrix:');
  if (normalTransform) {
    const nt = normalTransform.elements;
    console.log(`    [${nt[0].toFixed(6)}, ${nt[4].toFixed(6)}, ${nt[8].toFixed(6)}, ${nt[12].toFixed(6)}]`);
    console.log(`    [${nt[1].toFixed(6)}, ${nt[5].toFixed(6)}, ${nt[9].toFixed(6)}, ${nt[13].toFixed(6)}]`);
    console.log(`    [${nt[2].toFixed(6)}, ${nt[6].toFixed(6)}, ${nt[10].toFixed(6)}, ${nt[14].toFixed(6)}]`);
    console.log(`    [${nt[3].toFixed(6)}, ${nt[7].toFixed(6)}, ${nt[11].toFixed(6)}, ${nt[15].toFixed(6)}]`);
  } else {
    console.log(`    Not available (will use fullTransform)`);
  }
  
  console.log('  fullTransform matrix:');
  if (fullTransform) {
    const ft = fullTransform.elements;
    console.log(`    [${ft[0].toFixed(6)}, ${ft[4].toFixed(6)}, ${ft[8].toFixed(6)}, ${ft[12].toFixed(6)}]`);
    console.log(`    [${ft[1].toFixed(6)}, ${ft[5].toFixed(6)}, ${ft[9].toFixed(6)}, ${ft[13].toFixed(6)}]`);
    console.log(`    [${ft[2].toFixed(6)}, ${ft[6].toFixed(6)}, ${ft[10].toFixed(6)}, ${ft[14].toFixed(6)}]`);
    console.log(`    [${ft[3].toFixed(6)}, ${ft[7].toFixed(6)}, ${ft[11].toFixed(6)}, ${ft[15].toFixed(6)}]`);
  }
  
  // Test transforming the same local point with both matrices
  console.log('\n  Testing transformation of local point [0, -25, -25]:');
  const testPoint = [0, -25, -25];
  
  if (normalTransform) {
    const [ntX, ntY, ntZ] = normalTransform.transformPoint(testPoint[0], testPoint[1], testPoint[2]);
    console.log(`    normalTransform result: [${ntX.toFixed(6)}, ${ntY.toFixed(6)}, ${ntZ.toFixed(6)}]`);
  }
  
  if (fullTransform) {
    const [ftX, ftY, ftZ] = fullTransform.transformPoint(testPoint[0], testPoint[1], testPoint[2]);
    console.log(`    fullTransform result: [${ftX.toFixed(6)}, ${ftY.toFixed(6)}, ${ftZ.toFixed(6)}]`);
  }
  
} catch (error) {
  console.error('\n❌ Error:', error);
}
