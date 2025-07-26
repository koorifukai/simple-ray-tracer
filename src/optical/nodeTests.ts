/**
 * Node.js test runner for Surface Geometry Tests
 * This runs the tests in Node.js environment for easier debugging
 */

// Import required modules
import { Vector3 } from '../math/Matrix4';
import { OpticalSurfaceFactory } from './surfaces';

/**
 * Test result for a single geometry test
 */
interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  tolerance?: number;
  actual?: number;
  expected?: number;
}

/**
 * Surface corner coordinates (C1-C4) for testing
 */
interface SurfaceCorners {
  C1: Vector3; // Bottom-left corner (or enclosing square corner)
  C2: Vector3; // Bottom-right corner
  C3: Vector3; // Top-right corner  
  C4: Vector3; // Top-left corner
}

/**
 * Surface geometry test suite for Node.js
 */
class NodeSurfaceTests {
  private static readonly TOLERANCE = 1e-6;

  /**
   * Get corner coordinates for a surface
   */
  private static getSurfaceCorners(surface: any): SurfaceCorners {
    // Determine surface dimensions
    let halfWidth: number, halfHeight: number;
    
    if (surface.semidia) {
      halfWidth = halfHeight = surface.semidia;
    } else {
      const width = surface.width || 50;
      const height = surface.height || 50;
      halfWidth = width / 2;
      halfHeight = height / 2;
    }

    // Local corner coordinates (before transformation)
    const localCorners = {
      C1: new Vector3(0, -halfWidth, -halfHeight), // Bottom-left
      C2: new Vector3(0, halfWidth, -halfHeight),  // Bottom-right
      C3: new Vector3(0, halfWidth, halfHeight),   // Top-right
      C4: new Vector3(0, -halfWidth, halfHeight)   // Top-left
    };

    // Transform corners to world coordinates
    const worldCorners: SurfaceCorners = {
      C1: new Vector3(0, 0, 0),
      C2: new Vector3(0, 0, 0),
      C3: new Vector3(0, 0, 0),
      C4: new Vector3(0, 0, 0)
    };

    // Apply surface transformation to each corner
    Object.keys(localCorners).forEach(key => {
      const localCorner = localCorners[key as keyof typeof localCorners];
      const [worldX, worldY, worldZ] = surface.transform.transformPoint(
        localCorner.x, localCorner.y, localCorner.z
      );
      worldCorners[key as keyof SurfaceCorners] = new Vector3(worldX, worldY, worldZ);
    });

    return worldCorners;
  }

  /**
   * Get surface normal vector from transform matrix
   */
  private static getSurfaceNormal(surface: any): Vector3 {
    const normalLocal = new Vector3(-1, 0, 0);
    const [normalX, normalY, normalZ] = surface.transform.transformVector(
      normalLocal.x, normalLocal.y, normalLocal.z
    );
    return new Vector3(normalX, normalY, normalZ).normalize();
  }

  /**
   * Test a single cardinal normal direction
   */
  static testSingleCardinalNormal(normalName: string, normal: number[]): TestResult[] {
    const results: TestResult[] = [];
    
    console.log(`\n🧪 Testing ${normalName} normal [${normal.join(', ')}]`);
    
    try {
      // Create test surface
      const surfaceData = {
        shape: 'plano',
        height: 100,
        width: 50,
        mode: 'refraction',
        normal: normal,
        dial: 0
      };

      const surface = OpticalSurfaceFactory.createSurface(
        `test_${normalName}`,
        surfaceData,
        new Vector3(0, 0, 0),
        false
      );

      console.log(`   Surface created: ${surface.id}`);

      // Get corners and normal
      const corners = this.getSurfaceCorners(surface);
      const actualNormal = this.getSurfaceNormal(surface);

      console.log(`   Expected normal: [${normal.join(', ')}]`);
      console.log(`   Actual normal: [${actualNormal.x.toFixed(6)}, ${actualNormal.y.toFixed(6)}, ${actualNormal.z.toFixed(6)}]`);

      // Test 1: Normal direction
      const expectedNormal = new Vector3(normal[0], normal[1], normal[2]);
      const normalDiff = actualNormal.subtract(expectedNormal).length();
      const normalCorrect = normalDiff < this.TOLERANCE;
      
      results.push({
        name: `${normalName}: Normal direction`,
        passed: normalCorrect,
        message: normalCorrect
          ? `✓ Normal correct (diff: ${normalDiff.toExponential(2)})`
          : `✗ Normal wrong (diff: ${normalDiff.toFixed(6)})`,
        tolerance: this.TOLERANCE,
        actual: normalDiff,
        expected: 0
      });

      // Test 2: Corner perpendicularity
      const origin = surface.position;
      ['C1', 'C2', 'C3', 'C4'].forEach(cornerName => {
        const corner = corners[cornerName as keyof SurfaceCorners];
        const originToCorner = corner.subtract(origin);
        const dotProduct = Math.abs(originToCorner.dot(actualNormal));
        const passed = dotProduct < this.TOLERANCE;
        
        results.push({
          name: `${normalName}: Origin→${cornerName} ⊥ Normal`,
          passed,
          message: passed 
            ? `✓ Perpendicular (dot: ${dotProduct.toExponential(2)})` 
            : `✗ Not perpendicular (dot: ${dotProduct.toFixed(6)})`,
          tolerance: this.TOLERANCE,
          actual: dotProduct,
          expected: 0
        });
      });

      console.log(`   Completed ${results.length} tests for ${normalName}`);

    } catch (error) {
      console.error(`   ❌ Error testing ${normalName}:`, error);
      results.push({
        name: `${normalName}: Test execution`,
        passed: false,
        message: `✗ Test failed with error: ${error}`,
      });
    }

    return results;
  }

  /**
   * Run simple cardinal normal tests
   */
  static runSimpleTests(): void {
    console.log('🚀 Starting Simple Surface Geometry Tests...\n');
    
    const cardinalNormals = [
      { name: 'X-minus', normal: [-1, 0, 0] },
      { name: 'Y-plus', normal: [0, 1, 0] },
    ];

    let totalTests = 0;
    let totalPassed = 0;

    cardinalNormals.forEach(test => {
      const results = this.testSingleCardinalNormal(test.name, test.normal);
      const passed = results.filter(r => r.passed).length;
      
      totalTests += results.length;
      totalPassed += passed;
      
      console.log(`\n📋 ${test.name} Results: ${passed}/${results.length} passed`);
      
      // Show failed tests
      results.filter(r => !r.passed).forEach(result => {
        console.log(`   ❌ ${result.message}`);
      });
    });

    console.log(`\n🏁 Overall: ${totalPassed}/${totalTests} tests passed (${((totalPassed/totalTests)*100).toFixed(1)}%)`);
  }
}

// Run the tests
NodeSurfaceTests.runSimpleTests();
