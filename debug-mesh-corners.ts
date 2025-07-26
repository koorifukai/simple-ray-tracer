/**
 * Debug script to compare mesh generation corners with test validation corners
 */

import { OpticalSystemParser } from './src/optical/OpticalSystem';
import { SurfaceRenderer } from './src/optical/surfaces';
import { GroundTruthValidator } from './src/utils/GroundTruthValidator';

// Simple test YAML with surfaces that have dial rotation
const testYaml = `
surfaces:
  - s1: 
      {sid: 0, shape: plano, width: 35, height: 70, mode: refraction}
  - s2:
      {sid: 1, shape: plano, width: 10, height: 20, mode: refraction}

optical_trains:
  - e:
      {sid: 1, position: [30, 5, 0], normal: [0.58, -0.58, 0.58], dial: 30}
  - g: 
      {sid: 0, position: [50, 0, -5], angles: [130, -50], dial: -30}
`;

console.log('🔧 Debug: Mesh Corners vs Test Validation Corners');
console.log('='.repeat(60));

try {
  // Parse the optical system
  const opticalSystem = OpticalSystemParser.parseYAML(testYaml);
  console.log(`📊 Parsed optical system with ${opticalSystem.surfaces.length} surfaces`);
  
  opticalSystem.surfaces.forEach((surface, index) => {
    console.log(`\n🔍 Surface ${surface.id} (${index + 1}/${opticalSystem.surfaces.length}):`);
    console.log(`   Position: [${surface.position.x.toFixed(6)}, ${surface.position.y.toFixed(6)}, ${surface.position.z.toFixed(6)}]`);
    console.log(`   Normal: [${surface.normal?.x.toFixed(6)}, ${surface.normal?.y.toFixed(6)}, ${surface.normal?.z.toFixed(6)}]`);
    console.log(`   Dial: ${(surface as any).localDialAngle ? (surface as any).localDialAngle.toFixed(6) : 'none'}`);
    
    // Get corners from test validation method
    const testCorners = (GroundTruthValidator as any).getSurfaceCorners(surface);
    console.log(`\n   📐 Test Validation Corners (${testCorners.length}):`);
    testCorners.forEach((corner: number[], i: number) => {
      console.log(`     C${i+1}: [${corner[0].toFixed(6)}, ${corner[1].toFixed(6)}, ${corner[2].toFixed(6)}]`);
    });
    
    // Get corners from mesh generation
    try {
      const mesh = SurfaceRenderer.generatePlanarMesh(surface, 10);
      console.log(`\n   🎨 Mesh Generation Corners (${mesh.x.length}):`);
      for (let i = 0; i < Math.min(4, mesh.x.length); i++) {
        console.log(`     M${i+1}: [${mesh.x[i].toFixed(6)}, ${mesh.y[i].toFixed(6)}, ${mesh.z[i].toFixed(6)}]`);
      }
      
      // Compare first 4 mesh vertices with test corners
      let maxDifference = 0;
      let allMatch = true;
      
      for (let i = 0; i < Math.min(4, testCorners.length, mesh.x.length); i++) {
        const testCorner = testCorners[i];
        const meshCorner = [mesh.x[i], mesh.y[i], mesh.z[i]];
        
        const dx = Math.abs(testCorner[0] - meshCorner[0]);
        const dy = Math.abs(testCorner[1] - meshCorner[1]);
        const dz = Math.abs(testCorner[2] - meshCorner[2]);
        const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
        
        maxDifference = Math.max(maxDifference, distance);
        
        if (distance > 1e-6) {
          allMatch = false;
        }
      }
      
      console.log(`\n   ✅ Corner Comparison:`);
      console.log(`     Max difference: ${maxDifference.toExponential(3)}`);
      console.log(`     All match (within 1e-6): ${allMatch ? '✅ YES' : '❌ NO'}`);
      
    } catch (meshError: any) {
      console.warn(`   ⚠️ Failed to generate mesh: ${meshError.message}`);
    }
  });
  
} catch (error: any) {
  console.error('❌ Error:', error.message);
  console.error(error.stack);
}
