/**
 * Debug script to verify Amici test surfaces corners match between test validation and mesh generation
 */

import { OpticalSystemParser } from './src/optical/OpticalSystem';
import { SurfaceRenderer } from './src/optical/surfaces';
import { GroundTruthValidator } from './src/utils/GroundTruthValidator';
import * as fs from 'fs';

console.log('🔧 Debug: Amici Test Surfaces - Mesh vs Validation Corners');
console.log('='.repeat(70));

try {
  // Read the actual Amici test YAML
  const amiciYaml = fs.readFileSync('./src/tests/Amici.yml', 'utf8');
  console.log('📂 Loaded Amici.yml test file');
  
  // Parse the optical system
  const opticalSystem = OpticalSystemParser.parseYAML(amiciYaml);
  console.log(`📊 Parsed Amici optical system with ${opticalSystem.surfaces.length} surfaces`);
  
  let allMatch = true;
  let maxOverallDifference = 0;
  
  opticalSystem.surfaces.forEach((surface, index) => {
    console.log(`\n🔍 Surface ${surface.id} (${index + 1}/${opticalSystem.surfaces.length}):`);
    console.log(`   Position: [${surface.position.x.toFixed(6)}, ${surface.position.y.toFixed(6)}, ${surface.position.z.toFixed(6)}]`);
    console.log(`   Normal: [${surface.normal?.x.toFixed(6)}, ${surface.normal?.y.toFixed(6)}, ${surface.normal?.z.toFixed(6)}]`);
    console.log(`   Dial: ${(surface as any).localDialAngle ? ((surface as any).localDialAngle * 180 / Math.PI).toFixed(3) + '°' : 'none'}`);
    
    // Get corners from test validation method (using the private method)
    const testCorners = (GroundTruthValidator as any).getSurfaceCorners(surface);
    console.log(`\n   📐 Test Validation Corners (${testCorners.length}):`);
    testCorners.forEach((corner: number[], i: number) => {
      console.log(`     C${i+1}: [${corner[0].toFixed(6)}, ${corner[1].toFixed(6)}, ${corner[2].toFixed(6)}]`);
    });
    
    // Get corners from mesh generation
    try {
      const mesh = SurfaceRenderer.generatePlanarMesh(surface, 10);
      console.log(`\n   🎨 Mesh Generation Structure:`);
      console.log(`     Total vertices: ${mesh.x.length}`);
      console.log(`     Faces (triangles): ${mesh.i.length}`);
      
      console.log(`\n   📍 ALL Mesh Vertices (${mesh.x.length}):`);
      for (let i = 0; i < mesh.x.length; i++) {
        console.log(`     V${i}: [${mesh.x[i].toFixed(6)}, ${mesh.y[i].toFixed(6)}, ${mesh.z[i].toFixed(6)}]`);
      }
      
      console.log(`\n   🔺 Mesh Faces (triangles):`);
      for (let i = 0; i < mesh.i.length; i++) {
        console.log(`     Face ${i}: triangle(${mesh.i[i]}, ${mesh.j[i]}, ${mesh.k[i]})`);
      }
      
      // Check if first 4 vertices match test corners
      let maxDifference = 0;
      let surfaceMatch = true;
      
      console.log(`\n   ⚖️ First 4 Vertices vs Test Corners:`);
      for (let i = 0; i < Math.min(4, testCorners.length, mesh.x.length); i++) {
        const testCorner = testCorners[i];
        const meshCorner = [mesh.x[i], mesh.y[i], mesh.z[i]];
        
        const dx = Math.abs(testCorner[0] - meshCorner[0]);
        const dy = Math.abs(testCorner[1] - meshCorner[1]);
        const dz = Math.abs(testCorner[2] - meshCorner[2]);
        const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
        
        maxDifference = Math.max(maxDifference, distance);
        maxOverallDifference = Math.max(maxOverallDifference, distance);
        
        console.log(`     Corner ${i+1}: Test[${testCorner[0].toFixed(3)}, ${testCorner[1].toFixed(3)}, ${testCorner[2].toFixed(3)}] vs Mesh[${meshCorner[0].toFixed(3)}, ${meshCorner[1].toFixed(3)}, ${meshCorner[2].toFixed(3)}] → diff: ${distance.toExponential(3)}`);
        
        if (distance > 1e-6) {
          surfaceMatch = false;
          allMatch = false;
          console.log(`     ⚠️ Corner ${i+1} difference: ${distance.toExponential(3)}`);
        }
      }
      
      console.log(`\n   ✅ Surface ${surface.id} Corner Comparison:`);
      console.log(`     Max difference: ${maxDifference.toExponential(3)}`);
      console.log(`     First 4 vertices match test corners: ${surfaceMatch ? '✅ YES' : '❌ NO'}`);
      
    } catch (meshError: any) {
      console.warn(`   ⚠️ Failed to generate mesh: ${meshError.message}`);
      allMatch = false;
    }
  });
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🎯 OVERALL AMICI CORNER VALIDATION:`);
  console.log(`   Max difference across all surfaces: ${maxOverallDifference.toExponential(3)}`);
  console.log(`   All surfaces match: ${allMatch ? '✅ YES' : '❌ NO'}`);
  
  if (!allMatch) {
    console.log(`\n❌ ISSUE: Mesh generation corners do not match test validation corners!`);
    console.log(`   This means the visualization will show surfaces in incorrect positions.`);
  } else {
    console.log(`\n✅ SUCCESS: All mesh corners perfectly match test validation corners!`);
    console.log(`   The visualization accurately represents the validated mathematical model.`);
  }
  
} catch (error: any) {
  console.error('❌ Error:', error.message);
  console.error(error.stack);
}
