/**
 * Debug program to analyze dial transformation matrices
 * Tests why dial parameter doesn't affect world→local transformation in ray tracing
 */

import { Vector3 } from '../math/Vector3';
import { Matrix4 } from '../math/Matrix4';
import { OpticalSurfaceFactory } from '../optical/surfaces';
import { Ray } from '../optical/LightSource';
import type { OpticalSurface } from '../optical/surfaces';

interface DialDebugResult {
  dialDegrees: number;
  surface: OpticalSurface;
  testRay: Ray;
  
  // Transformation matrices
  visualTransform: Matrix4;           // surface.transform (unified for both ray tracing and visualization)
  forwardTransform: Matrix4;          // surface.forwardTransform (for ray tracing)
  inverseTransform: Matrix4;          // surface.inverseTransform
  
  // Local ray after transformation
  localRayPosition: Vector3;
  localRayDirection: Vector3;
  
  // Expected vs actual local intersection points
  expectedLocalIntersection?: Vector3;
  actualLocalIntersection?: Vector3;
}

class DialDebugAnalyzer {
  
  /**
   * Test dial transformations with varying dial parameters
   */
  static runDialAnalysis(): void {
    console.log('🔍 DIAL TRANSFORMATION DEBUG ANALYSIS');
    console.log('=====================================\n');
    
    // Test parameters from dial_bug.yaml
    const testRay = new Ray(
      new Vector3(-10, 0, 0),    // position: [-10,0,0]
      new Vector3(1, 0.5, 0.3).normalize(), // vector: [1,0.5,0.3] normalized
      488,                       // wavelength: 488nm
      0,                         // lightId: 0
      1.0                        // intensity: 1.0
    );
    
    const surfacePosition = new Vector3(20, -3, -5);    // position: [20,-3,-5]
    const surfaceAngles = [5, -10];                     // angles: [5,-10]
    
    // Test different dial values
    const dialValues = [0, 25, 50, 75];
    const results: DialDebugResult[] = [];
    
    console.log(`Test Ray: position=(${testRay.position.x}, ${testRay.position.y}, ${testRay.position.z}), direction=(${testRay.direction.x.toFixed(3)}, ${testRay.direction.y.toFixed(3)}, ${testRay.direction.z.toFixed(3)})`);
    console.log(`Surface Base: position=(${surfacePosition.x}, ${surfacePosition.y}, ${surfacePosition.z}), angles=[${surfaceAngles[0]}, ${surfaceAngles[1]}]`);
    console.log('');
    
    // Generate surfaces with different dial values
    dialValues.forEach(dialDegrees => {
      console.log(`--- Testing Dial = ${dialDegrees}° ---`);
      
      const surfaceData = {
        shape: 'plano',
        height: 100,
        width: 50,
        mode: 'reflection',
        angles: surfaceAngles,
        dial: dialDegrees
      };
      
      // Create surface using the factory (EUREKA methodology)
      const surface = OpticalSurfaceFactory.createSurface(
        `s1_dial${dialDegrees}`,
        surfaceData,
        surfacePosition
      );
      
      // Transform test ray to local coordinates using the surface's forward transform
      const forwardTransform = surface.forwardTransform;
      const localRayPos = new Vector3(
        ...forwardTransform.transformPoint(testRay.position.x, testRay.position.y, testRay.position.z)
      );
      const localRayDir = new Vector3(
        ...forwardTransform.transformVector(testRay.direction.x, testRay.direction.y, testRay.direction.z)
      ).normalize();
      
      // Calculate expected local intersection for planar surface (z=0 plane)
      const expectedLocalIntersection = this.calculatePlaneIntersection(localRayPos, localRayDir);
      
      const result: DialDebugResult = {
        dialDegrees,
        surface,
        testRay,
        visualTransform: surface.transform,
        forwardTransform: surface.forwardTransform,
        inverseTransform: surface.inverseTransform,
        localRayPosition: localRayPos,
        localRayDirection: localRayDir,
        expectedLocalIntersection: expectedLocalIntersection || undefined
      };
      
      results.push(result);
      
      // Print detailed analysis
      this.printResultAnalysis(result);
      console.log('');
    });
    
    // Compare results across different dial values
    console.log('\n🔬 COMPARATIVE ANALYSIS');
    console.log('=======================');
    this.compareResults(results);
  }
  
  /**
   * Calculate intersection with z=0 plane in local coordinates
   */
  private static calculatePlaneIntersection(rayPos: Vector3, rayDir: Vector3): Vector3 | null {
    // For z=0 plane: intersection when ray.z + t * dir.z = 0
    // Solve for t: t = -ray.z / dir.z
    
    if (Math.abs(rayDir.z) < 1e-6) {
      // Ray is parallel to plane
      return null;
    }
    
    const t = -rayPos.z / rayDir.z;
    
    if (t < 0) {
      // Intersection is behind ray origin
      return null;
    }
    
    return new Vector3(
      rayPos.x + t * rayDir.x,
      rayPos.y + t * rayDir.y,
      0  // z = 0 for plane intersection
    );
  }
  
  /**
   * Print detailed analysis for a single dial value
   */
  private static printResultAnalysis(result: DialDebugResult): void {
    console.log(`Surface Normal: [${result.surface.normal?.x.toFixed(6)}, ${result.surface.normal?.y.toFixed(6)}, ${result.surface.normal?.z.toFixed(6)}]`);
    console.log(`Local Dial Angle: ${((result.surface as any).localDialAngle * 180 / Math.PI).toFixed(2)}°`);
    
    // Matrix comparisons
    console.log('\nTransformation Matrices:');
    console.log('Unified Transform (includes dial, for both ray tracing and visualization):');
    this.printMatrix4x4(result.visualTransform);
    
    console.log('Forward Transform (World→Local, for ray tracing):');
    this.printMatrix4x4(result.forwardTransform);
    
    // Local ray transformation results
    console.log(`\nLocal Ray: pos=(${result.localRayPosition.x.toFixed(3)}, ${result.localRayPosition.y.toFixed(3)}, ${result.localRayPosition.z.toFixed(3)}), dir=(${result.localRayDirection.x.toFixed(3)}, ${result.localRayDirection.y.toFixed(3)}, ${result.localRayDirection.z.toFixed(3)})`);
    
    if (result.expectedLocalIntersection) {
      console.log(`Local Intersection: (${result.expectedLocalIntersection.x.toFixed(3)}, ${result.expectedLocalIntersection.y.toFixed(3)}, ${result.expectedLocalIntersection.z.toFixed(3)})`);
    } else {
      console.log('Local Intersection: MISS (parallel or behind)');
    }
  }
  
  /**
   * Compare results across different dial values to identify inconsistencies
   */
  private static compareResults(results: DialDebugResult[]): void {
    if (results.length < 2) return;
    
    const baseline = results[0];  // Dial = 0°
    
    console.log('Checking which matrices change with dial parameter:\n');
    
    for (let i = 1; i < results.length; i++) {
      const current = results[i];
      console.log(`--- Comparing Dial ${baseline.dialDegrees}° vs Dial ${current.dialDegrees}° ---`);
      
      // Compare visual transforms (should change with dial)
      const visualSame = this.matricesEqual(baseline.visualTransform, current.visualTransform);
      console.log(`Unified Transform (includes dial): ${visualSame ? '❌ SAME (WRONG!)' : '✅ DIFFERENT (correct)'}`);
      
      // Compare forward transforms (CRITICAL - should change with dial)
      const forwardSame = this.matricesEqual(baseline.forwardTransform, current.forwardTransform);
      console.log(`Forward Transform (ray tracing): ${forwardSame ? '❌ SAME (BUG!)' : '✅ DIFFERENT (correct)'}`);
      
      // Compare inverse transforms (should also change with dial)
      const inverseSame = this.matricesEqual(baseline.inverseTransform, current.inverseTransform);
      console.log(`Inverse Transform (visualization): ${inverseSame ? '❌ SAME (BUG!)' : '✅ DIFFERENT (correct)'}`);
      
      // Compare local ray positions (should change with dial)
      const localPosSame = this.vectorsEqual(baseline.localRayPosition, current.localRayPosition);
      console.log(`Local Ray Position: ${localPosSame ? '❌ SAME (BUG!)' : '✅ DIFFERENT (correct)'}`);
      
      // Compare local ray directions (should change with dial)
      const localDirSame = this.vectorsEqual(baseline.localRayDirection, current.localRayDirection);
      console.log(`Local Ray Direction: ${localDirSame ? '❌ SAME (BUG!)' : '✅ DIFFERENT (correct)'}`);
      
      // Compare local intersections (should change with dial)
      if (baseline.expectedLocalIntersection && current.expectedLocalIntersection) {
        const intersectionSame = this.vectorsEqual(baseline.expectedLocalIntersection, current.expectedLocalIntersection);
        console.log(`Local Intersection: ${intersectionSame ? '❌ SAME (BUG!)' : '✅ DIFFERENT (correct)'}`);
      }
      
      console.log('');
    }
    
    // Diagnostic summary
    console.log('🎯 DIAGNOSIS SUMMARY:');
    console.log('If Forward Transform stays SAME across different dial values,');
    console.log('then computeForwardTransform() is NOT including dial rotation!');
    console.log('This would cause ray intersections to ignore dial geometry.');
  }
  
  /**
   * Check if two matrices are approximately equal
   */
  private static matricesEqual(m1: Matrix4, m2: Matrix4, tolerance: number = 1e-6): boolean {
    const e1 = m1.elements;
    const e2 = m2.elements;
    
    for (let i = 0; i < 16; i++) {
      if (Math.abs(e1[i] - e2[i]) > tolerance) {
        return false;
      }
    }
    return true;
  }
  
  /**
   * Check if two vectors are approximately equal
   */
  private static vectorsEqual(v1: Vector3, v2: Vector3, tolerance: number = 1e-6): boolean {
    return Math.abs(v1.x - v2.x) < tolerance &&
           Math.abs(v1.y - v2.y) < tolerance &&
           Math.abs(v1.z - v2.z) < tolerance;
  }
  
  /**
   * Print a 4x4 matrix in readable format
   */
  private static printMatrix4x4(matrix: Matrix4): void {
    const e = matrix.elements;
    console.log(`  [${e[0].toFixed(3)}, ${e[4].toFixed(3)}, ${e[8].toFixed(3)}, ${e[12].toFixed(3)}]`);
    console.log(`  [${e[1].toFixed(3)}, ${e[5].toFixed(3)}, ${e[9].toFixed(3)}, ${e[13].toFixed(3)}]`);
    console.log(`  [${e[2].toFixed(3)}, ${e[6].toFixed(3)}, ${e[10].toFixed(3)}, ${e[14].toFixed(3)}]`);
    console.log(`  [${e[3].toFixed(3)}, ${e[7].toFixed(3)}, ${e[11].toFixed(3)}, ${e[15].toFixed(3)}]`);
  }
}

// Export for use in other modules
export { DialDebugAnalyzer };

// Auto-run if this file is executed directly
if (typeof window === 'undefined') {
  // Running in Node.js environment
  DialDebugAnalyzer.runDialAnalysis();
}
