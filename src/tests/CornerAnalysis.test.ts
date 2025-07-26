import { createSurface } from '../optical/surfaces.js';
import { GroundTruthValidator } from '../utils/GroundTruthValidator.js';
import { readFileSync } from 'fs';
import { join } from 'path';

interface TestCase {
  name: string;
  surface: any;
  expectedCorners: number[][];
}

interface SurfaceTestData {
  name: string;
  position: number[];
  normal: number[];
  corners: number[][];
}

/**
 * Corner Analysis Test Suite
 * 
 * This test systematically investigates corner generation accuracy
 * by comparing our implementation against ground truth data.
 */
describe('Corner Generation Analysis', () => {
  let testCases: TestCase[] = [];
  let groundTruthData: SurfaceTestData[] = [];

  beforeAll(() => {
    // Load ground truth data
    const testDataPath = join(__dirname, 'SurfaceTests.txt');
    const testData = readFileSync(testDataPath, 'utf-8');
    
    // Parse ground truth data
    const lines = testData.split('\n');
    let currentSurface: Partial<SurfaceTestData> = {};
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      if (trimmed.startsWith('Surface ')) {
        if (currentSurface.name) {
          groundTruthData.push(currentSurface as SurfaceTestData);
        }
        currentSurface = { name: trimmed, corners: [] };
      } else if (trimmed.startsWith('Position:')) {
        const coords = trimmed.substring(9).trim().split(/\s+/).map(Number);
        currentSurface.position = coords;
      } else if (trimmed.startsWith('Normal:')) {
        const coords = trimmed.substring(7).trim().split(/\s+/).map(Number);
        currentSurface.normal = coords;
      } else if (trimmed.startsWith('Corner ')) {
        const coords = trimmed.split(':')[1].trim().split(/\s+/).map(Number);
        currentSurface.corners!.push(coords);
      }
    }
    
    if (currentSurface.name) {
      groundTruthData.push(currentSurface as SurfaceTestData);
    }

    // Load test surface definitions
    const yamlPath = join(__dirname, 'SurfaceTests.yml');
    const yamlContent = readFileSync(yamlPath, 'utf-8');
    
    // Parse YAML and create test cases
    // This is a simplified parser - in real implementation we'd use a proper YAML parser
    const yamlLines = yamlContent.split('\n');
    let currentTestSurface: any = {};
    let inSurfaces = false;
    
    for (const line of yamlLines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('surfaces:')) {
        inSurfaces = true;
        continue;
      }
      
      if (inSurfaces && trimmed.startsWith('- sid:')) {
        if (Object.keys(currentTestSurface).length > 0) {
          const groundTruth = groundTruthData.find(gt => 
            gt.name.includes(`Surface ${currentTestSurface.sid}`)
          );
          if (groundTruth) {
            testCases.push({
              name: `Surface ${currentTestSurface.sid}`,
              surface: currentTestSurface,
              expectedCorners: groundTruth.corners
            });
          }
        }
        currentTestSurface = {};
      }
      
      // Parse YAML properties (simplified)
      if (inSurfaces && trimmed.includes(':')) {
        const [key, value] = trimmed.split(':').map(s => s.trim());
        if (key && value && !value.startsWith('-')) {
          currentTestSurface[key] = isNaN(Number(value)) ? value.replace(/"/g, '') : Number(value);
        }
      }
    }
  });

  test('Analyze corner generation patterns', () => {
    console.log('\n=== CORNER GENERATION ANALYSIS ===\n');
    
    let totalSurfaces = 0;
    let passingCorners = 0;
    let failingCorners = 0;
    let dialSurfaces = 0;
    let nonDialSurfaces = 0;
    
    const results: Array<{
      name: string;
      hasDial: boolean;
      cornersMatch: boolean;
      maxError: number;
      details: string;
    }> = [];

    for (const testCase of testCases) {
      totalSurfaces++;
      
      try {
        // Create surface using our implementation
        const surface = createSurface(testCase.surface);
        
        // Generate corners using GroundTruthValidator
        const validator = new GroundTruthValidator();
        const actualCorners = validator.getSurfaceCorners(surface);
        
        // Check if surface has dial
        const hasDial = surface.localDialAngle !== undefined;
        if (hasDial) {
          dialSurfaces++;
        } else {
          nonDialSurfaces++;
        }
        
        // Compare corners
        let cornersMatch = true;
        let maxError = 0;
        let errorDetails = '';
        
        if (actualCorners.length !== testCase.expectedCorners.length) {
          cornersMatch = false;
          errorDetails = `Corner count mismatch: ${actualCorners.length} vs ${testCase.expectedCorners.length}`;
        } else {
          // Find best matching between actual and expected corners
          const used = new Array(testCase.expectedCorners.length).fill(false);
          
          for (let i = 0; i < actualCorners.length; i++) {
            let bestMatch = -1;
            let bestDistance = Infinity;
            
            for (let j = 0; j < testCase.expectedCorners.length; j++) {
              if (used[j]) continue;
              
              const distance = Math.sqrt(
                Math.pow(actualCorners[i][0] - testCase.expectedCorners[j][0], 2) +
                Math.pow(actualCorners[i][1] - testCase.expectedCorners[j][1], 2) +
                Math.pow(actualCorners[i][2] - testCase.expectedCorners[j][2], 2)
              );
              
              if (distance < bestDistance) {
                bestDistance = distance;
                bestMatch = j;
              }
            }
            
            if (bestMatch !== -1) {
              used[bestMatch] = true;
              maxError = Math.max(maxError, bestDistance);
              
              if (bestDistance > 1e-4) {
                cornersMatch = false;
                if (errorDetails) errorDetails += '; ';
                errorDetails += `Corner ${i} error: ${bestDistance.toFixed(6)}`;
              }
            }
          }
        }
        
        if (cornersMatch) {
          passingCorners++;
        } else {
          failingCorners++;
        }
        
        results.push({
          name: testCase.name,
          hasDial: hasDial,
          cornersMatch: cornersMatch,
          maxError: maxError,
          details: errorDetails || 'PASS'
        });
        
        // Detailed output
        console.log(`${testCase.name}:`);
        console.log(`  Dial: ${hasDial ? 'YES' : 'NO'}`);
        console.log(`  Match: ${cornersMatch ? 'PASS' : 'FAIL'}`);
        console.log(`  Max Error: ${maxError.toFixed(6)}`);
        if (!cornersMatch) {
          console.log(`  Details: ${errorDetails}`);
          console.log(`  Expected: ${JSON.stringify(testCase.expectedCorners)}`);
          console.log(`  Actual:   ${JSON.stringify(actualCorners)}`);
        }
        console.log('');
        
      } catch (error) {
        console.error(`Error processing ${testCase.name}:`, error);
        failingCorners++;
        results.push({
          name: testCase.name,
          hasDial: false,
          cornersMatch: false,
          maxError: Infinity,
          details: `Error: ${error}`
        });
      }
    }
    
    // Summary analysis
    console.log('=== SUMMARY ANALYSIS ===');
    console.log(`Total surfaces: ${totalSurfaces}`);
    console.log(`Passing corners: ${passingCorners}`);
    console.log(`Failing corners: ${failingCorners}`);
    console.log(`Surfaces with dial: ${dialSurfaces}`);
    console.log(`Surfaces without dial: ${nonDialSurfaces}`);
    console.log('');
    
    // Pattern analysis
    const dialPassing = results.filter(r => r.hasDial && r.cornersMatch).length;
    const dialFailing = results.filter(r => r.hasDial && !r.cornersMatch).length;
    const nonDialPassing = results.filter(r => !r.hasDial && r.cornersMatch).length;
    const nonDialFailing = results.filter(r => !r.hasDial && !r.cornersMatch).length;
    
    console.log('=== PATTERN ANALYSIS ===');
    console.log(`Dial surfaces - Passing: ${dialPassing}, Failing: ${dialFailing}`);
    console.log(`Non-dial surfaces - Passing: ${nonDialPassing}, Failing: ${nonDialFailing}`);
    
    if (dialFailing > 0 && nonDialPassing > nonDialFailing) {
      console.log('');
      console.log('🔍 PATTERN DETECTED: Dial surfaces are failing disproportionately');
      console.log('   This suggests the issue is specifically with dial rotation implementation');
    }
    
    if (nonDialFailing > 0) {
      console.log('');
      console.log('⚠️  WARNING: Some non-dial surfaces are also failing');
      console.log('   This suggests the issue may be broader than just dial rotation');
    }
    
    // Fail the test if any corners don't match (for CI/CD)
    expect(failingCorners).toBe(0);
  });

  test('Mathematical validation of dial rotation', () => {
    console.log('\n=== DIAL ROTATION MATHEMATICAL VALIDATION ===\n');
    
    // Test the mathematical properties of our dial rotation
    for (const testCase of testCases) {
      const surface = createSurface(testCase.surface);
      
      if (surface.localDialAngle !== undefined) {
        console.log(`Testing dial mathematics for ${testCase.name}:`);
        
        // Test 1: Normal should be preserved under dial rotation
        const originalNormal = [surface.normal.x, surface.normal.y, surface.normal.z];
        const normalMagnitude = Math.sqrt(
          originalNormal[0] * originalNormal[0] +
          originalNormal[1] * originalNormal[1] +
          originalNormal[2] * originalNormal[2]
        );
        
        console.log(`  Original normal: [${originalNormal.map(n => n.toFixed(6)).join(', ')}]`);
        console.log(`  Normal magnitude: ${normalMagnitude.toFixed(6)} (should be 1.0)`);
        
        expect(Math.abs(normalMagnitude - 1.0)).toBeLessThan(1e-10);
        
        // Test 2: If we have normalTransform, normal should match
        if (surface.normalTransform) {
          const baseNormal = [0, 0, 1]; // Assuming standard base normal
          const transformedNormal = surface.normalTransform.transformVector(
            baseNormal[0], baseNormal[1], baseNormal[2]
          );
          
          const normalError = Math.sqrt(
            Math.pow(transformedNormal.x - originalNormal[0], 2) +
            Math.pow(transformedNormal.y - originalNormal[1], 2) +
            Math.pow(transformedNormal.z - originalNormal[2], 2)
          );
          
          console.log(`  Normal transform error: ${normalError.toFixed(10)}`);
          expect(normalError).toBeLessThan(1e-10);
        }
        
        console.log('');
      }
    }
  });
});
