// Debug script to investigate dial rotation visualization issue
// User reports: "rotate around [-1,0,0] instead of final normal" visually

import fs from 'fs';
import { OpticalSystemParser } from './src/optical/OpticalSystem.js';
import { SurfaceRenderer } from './src/optical/surfaces.js';

console.log('🔍 DEBUGGING DIAL ROTATION VISUALIZATION ISSUE');
console.log('================================================================');

// Load Amici test file to get surfaces with known dial rotations
const amiciYaml = fs.readFileSync('./src/tests/Amici.yml', 'utf8');
console.log('� Loaded Amici.yml test file');

try {
  // Parse the test system
  const opticalSystem = OpticalSystemParser.parseYAML(amiciYaml);
  console.log('\n✅ Successfully parsed optical system');
  console.log(`📊 Found ${opticalSystem.surfaces.length} surfaces`);
  
  // Find a surface with dial rotation - s2 has dial: 35.25°
  const testSurface = opticalSystem.surfaces.find(s => s.id === 's2');
  if (!testSurface) {
    console.error('❌ Could not find surface s2 for testing');
    process.exit(1);
  }
  
  console.log('\n🔍 Testing Surface s2 (has dial rotation):');
  console.log(`  ID: ${testSurface.id}`);
  console.log(`  Position: [${testSurface.position.x.toFixed(3)}, ${testSurface.position.y.toFixed(3)}, ${testSurface.position.z.toFixed(3)}]`);
  console.log(`  Normal: [${testSurface.normal?.x.toFixed(6)}, ${testSurface.normal?.y.toFixed(6)}, ${testSurface.normal?.z.toFixed(6)}]`);
  console.log(`  Has localDialAngle: ${(testSurface as any).localDialAngle !== undefined}`);
  if ((testSurface as any).localDialAngle !== undefined) {
    console.log(`  localDialAngle: ${(testSurface as any).localDialAngle} radians = ${((testSurface as any).localDialAngle * 180 / Math.PI).toFixed(1)}°`);
  }
  console.log(`  Has normalTransform: ${(testSurface as any).normalTransform !== undefined}`);
  
  // Generate mesh using current implementation
  console.log('\n🎨 Generating mesh...');
  const meshData = SurfaceRenderer.generatePlanarMesh(testSurface);
  
  console.log('\n📊 Generated Mesh Vertices (first 4):');
  for (let i = 0; i < Math.min(4, meshData.x.length); i++) {
    console.log(`  V${i}: [${meshData.x[i].toFixed(3)}, ${meshData.y[i].toFixed(3)}, ${meshData.z[i].toFixed(3)}]`);
  }
  
  // Now check the issue: is the rotation being applied around the wrong axis?
  console.log('\n🧮 INVESTIGATING ROTATION AXIS ISSUE:');
  
  // Check if the normal being used for rotation is correct
  const normal = testSurface.normal;
  if (normal) {
    console.log(`Current normal used for dial rotation: [${normal.x.toFixed(6)}, ${normal.y.toFixed(6)}, ${normal.z.toFixed(6)}]`);
    
    // Check if it looks like [-1,0,0] instead of the actual normal
    const isDefaultNormal = Math.abs(normal.x + 1) < 0.001 && Math.abs(normal.y) < 0.001 && Math.abs(normal.z) < 0.001;
    if (isDefaultNormal) {
      console.log('🚨 ISSUE DETECTED: Normal appears to be default [-1,0,0] instead of actual surface normal!');
    } else {
      console.log('✅ Normal appears to be correctly calculated (not default [-1,0,0])');
    }
    
    // Calculate what the normal SHOULD be for s2 in Amici
    console.log('\n📐 Expected normal for s2 in Amici assembly:');
    console.log('   s2 should have normal around [0.830, 0.471, 0.297] based on assembly transformation');
    
    const expectedNormal = [0.830273, 0.471401, 0.297368];
    const actualNormal = [normal.x, normal.y, normal.z];
    const normalDiff = [
      Math.abs(actualNormal[0] - expectedNormal[0]),
      Math.abs(actualNormal[1] - expectedNormal[1]),
      Math.abs(actualNormal[2] - expectedNormal[2])
    ];
    const maxNormalDiff = Math.max(...normalDiff);
    
    console.log(`   Expected: [${expectedNormal[0].toFixed(6)}, ${expectedNormal[1].toFixed(6)}, ${expectedNormal[2].toFixed(6)}]`);
    console.log(`   Actual:   [${actualNormal[0].toFixed(6)}, ${actualNormal[1].toFixed(6)}, ${actualNormal[2].toFixed(6)}]`);
    console.log(`   Difference: ${maxNormalDiff.toFixed(6)}`);
    
    if (maxNormalDiff < 0.001) {
      console.log('✅ Normal calculation appears correct');
    } else {
      console.log('🚨 ISSUE: Normal calculation appears incorrect!');
    }
  }
  
  // Let's also check what transform is being used
  console.log('\n🔧 Transform Analysis:');
  if ((testSurface as any).normalTransform) {
    console.log('   Has normalTransform (excludes dial) ✅');
  } else {
    console.log('   Missing normalTransform (using full transform) ⚠️');
  }
  
  console.log('\n� ANALYSIS:');
  console.log('If dial rotation appears wrong visually, possible causes:');
  console.log('1. Normal vector calculation is incorrect');
  console.log('2. Dial rotation is being applied around wrong axis (e.g., [-1,0,0] instead of actual normal)');
  console.log('3. Transform matrix order/application is wrong');
  console.log('4. normalTransform vs transform confusion');
  
} catch (error) {
  console.error('\n❌ Error:', error);
}
