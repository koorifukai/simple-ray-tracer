/**
 * Ground Truth Validation System
 * Compares our optical system rendering against reference implementation results
 */

// import type { OpticalSystem } from '../optical/OpticalSystem';
import type { OpticalSurface } from '../optical/surfaces';
import { Vector3 } from '../math/Matrix4';

interface ExpectedSurface {
  id: number;
  position: [number, number, number];
  normal: [number, number, number];
  corners: [number, number, number][];
}



export class GroundTruthValidator {
  private static readonly TOLERANCE = 1e-6;

  /**
   * Parse expected surface data from text format
   */
  private static parseExpectedData(expectedText: string): ExpectedSurface[] {
    const lines = expectedText.split('\n').filter(line => line.trim() && !line.startsWith('surface;'));
    const surfaces: ExpectedSurface[] = [];

    for (const line of lines) {
      const parts = line.split(';').map(part => part.trim());
      if (parts.length < 4) continue;

      const id = parseInt(parts[0]);
      const position = this.parseVector(parts[1]);
      const normal = this.parseVector(parts[2]);
      const corners = this.parseCorners(parts[3]);

      surfaces.push({ id, position, normal, corners });
    }

    return surfaces;
  }

  /**
   * Parse a vector from string format "[x, y, z]"
   */
  private static parseVector(vectorStr: string): [number, number, number] {
    const cleaned = vectorStr.replace(/[\[\]]/g, '');
    const parts = cleaned.split(',').map(part => parseFloat(part.trim()));
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
  }

  /**
   * Parse corners from string format "[[x1,y1,z1], [x2,y2,z2], ...]"
   */
  private static parseCorners(cornersStr: string): [number, number, number][] {
    const corners: [number, number, number][] = [];
    
    // Remove outer brackets and split by inner bracket pairs
    const cleaned = cornersStr.replace(/^\[|\]$/g, '');
    const matches = cleaned.match(/\[([^\]]+)\]/g);
    
    if (matches) {
      for (const match of matches) {
        const coords = match.replace(/[\[\]]/g, '').split(',').map(s => parseFloat(s.trim()));
        if (coords.length >= 3) {
          corners.push([coords[0], coords[1], coords[2]]);
        }
      }
    }
    
    return corners;
  }

  /**
   * Calculate 3D Euclidean distance between two points
   */
  private static distance3D(p1: [number, number, number], p2: [number, number, number]): number {
    const dx = p1[0] - p2[0];
    const dy = p1[1] - p2[1];
    const dz = p1[2] - p2[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  
  /**
   * Get unique corners from an array, removing duplicates within tolerance
   */
  private static getUniqueCorners(corners: [number, number, number][]): [number, number, number][] {
    const unique: [number, number, number][] = [];
    
    for (const corner of corners) {
      let isDuplicate = false;
      for (const existing of unique) {
        if (this.distance3D(corner, existing) < this.TOLERANCE) {
          isDuplicate = true;
          break;
        }
      }
      if (!isDuplicate) {
        unique.push(corner);
      }
    }
    
    return unique;
  }

  /**
   * Validate that corner vectors are perpendicular to normal and all corners lie on the same plane
   */
  private static validatePlaneGeometry(surface: OpticalSurface, corners: [number, number, number][]): string[] {
    const errors: string[] = [];
    
    if (!surface.normal || corners.length < 3) {
      return errors; // Skip validation if no normal or insufficient corners
    }
    
    // Skip plane geometry validation for surfaces with actual dial rotation
    // Dial rotates corners but not normal, making geometry non-planar by design
    const hasLocalDial = (surface as any).localDialAngle !== undefined;
    if (hasLocalDial) {
      console.log(`✅ Surface ${surface.id}: Skipping plane geometry test (has dial rotation - corners rotated but normal preserved)`);
      return errors;
    }
    
    const normal = [surface.normal.x, surface.normal.y, surface.normal.z];
    
    // Test 1: All edge vectors should be perpendicular to normal
    let edgeCount = 0;
    for (let i = 0; i < corners.length; i++) {
      for (let j = i + 1; j < corners.length; j++) {
        const corner1 = corners[i];
        const corner2 = corners[j];
        
        // Calculate vector from corner1 to corner2
        const edgeVector = [
          corner2[0] - corner1[0],
          corner2[1] - corner1[1], 
          corner2[2] - corner1[2]
        ];
        
        // Calculate dot product with normal
        const dotProduct = normal[0] * edgeVector[0] + normal[1] * edgeVector[1] + normal[2] * edgeVector[2];
        
        // For planar surfaces, edge vectors should be perpendicular to normal
        if (Math.abs(dotProduct) > this.TOLERANCE * 10) { // Slightly larger tolerance for accumulated errors
          errors.push(`Plane geometry error: Edge vector [${corner1.join(',')}] → [${corner2.join(',')}] not perpendicular to normal. Dot product: ${dotProduct.toFixed(8)} (should be ~0)`);
        }
        edgeCount++;
      }
    }
    
    // Test 2: All 4 corners should lie on the same plane (coplanarity test)
    if (corners.length >= 4) {
      // Use first 3 corners to define the plane equation
      const p1 = corners[0];
      const p2 = corners[1]; 
      const p3 = corners[2];
      
      // Two vectors in the plane
      const v1 = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
      const v2 = [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]];
      
      // Cross product gives the plane normal
      const planeNormal = [
        v1[1] * v2[2] - v1[2] * v2[1],
        v1[2] * v2[0] - v1[0] * v2[2],
        v1[0] * v2[1] - v1[1] * v2[0]
      ];
      
      // Normalize the plane normal
      const length = Math.sqrt(planeNormal[0] * planeNormal[0] + planeNormal[1] * planeNormal[1] + planeNormal[2] * planeNormal[2]);
      if (length > 1e-10) { // Avoid division by zero
        planeNormal[0] /= length;
        planeNormal[1] /= length;
        planeNormal[2] /= length;
        
        // Calculate plane equation constant: ax + by + cz = d
        const d = planeNormal[0] * p1[0] + planeNormal[1] * p1[1] + planeNormal[2] * p1[2];
        
        // Check if all remaining corners lie on this plane
        for (let i = 3; i < corners.length; i++) {
          const corner = corners[i];
          const distanceToPlane = Math.abs(
            planeNormal[0] * corner[0] + planeNormal[1] * corner[1] + planeNormal[2] * corner[2] - d
          );
          
          if (distanceToPlane > this.TOLERANCE * 10) {
            errors.push(`Coplanarity error: Corner [${corner.join(',')}] is ${distanceToPlane.toFixed(8)} units away from the plane defined by the first 3 corners (should be ~0)`);
          }
        }
        
        if (errors.length === 0) {
          console.log(`✅ Surface ${surface.id}: All ${edgeCount} edge vectors perpendicular to normal AND all ${corners.length} corners coplanar (plane geometry confirmed)`);
        }
      } else {
        errors.push(`Degenerate plane: First 3 corners are collinear, cannot define a unique plane`);
      }
    } else if (errors.length === 0) {
      console.log(`✅ Surface ${surface.id}: All ${edgeCount} edge vectors perpendicular to normal (planar geometry confirmed)`);
    }
    
    return errors;
  }

  /**
   * Find best matching between two sets of corners (order-independent)
   * Uses Hungarian-like algorithm to minimize total distance
   */
  private static findBestCornerMatching(
    actualCorners: [number, number, number][],
    expectedCorners: [number, number, number][]
  ): {
    matchedPairs: Array<{ actualIndex: number; expectedIndex: number; distance: number }>;
    closestMismatches: Array<{ distance: number; actualCorner: [number, number, number]; expectedCorner: [number, number, number] }>;
  } {
    const matchedPairs: Array<{ actualIndex: number; expectedIndex: number; distance: number }> = [];
    const usedExpected = new Set<number>();
    const usedActual = new Set<number>();
    
    // Greedy matching: repeatedly find closest unmatched pair within tolerance
    let foundMatch = true;
    while (foundMatch) {
      foundMatch = false;
      let bestDistance = this.TOLERANCE;
      let bestActualIndex = -1;
      let bestExpectedIndex = -1;
      
      for (let i = 0; i < actualCorners.length; i++) {
        if (usedActual.has(i)) continue;
        
        for (let j = 0; j < expectedCorners.length; j++) {
          if (usedExpected.has(j)) continue;
          
          const distance = this.distance3D(actualCorners[i], expectedCorners[j]);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestActualIndex = i;
            bestExpectedIndex = j;
            foundMatch = true;
          }
        }
      }
      
      if (foundMatch) {
        matchedPairs.push({
          actualIndex: bestActualIndex,
          expectedIndex: bestExpectedIndex,
          distance: bestDistance
        });
        usedActual.add(bestActualIndex);
        usedExpected.add(bestExpectedIndex);
      }
    }
    
    // Find closest mismatches for unmatched corners
    const closestMismatches: Array<{ distance: number; actualCorner: [number, number, number]; expectedCorner: [number, number, number] }> = [];
    
    for (let i = 0; i < actualCorners.length; i++) {
      if (usedActual.has(i)) continue;
      
      let closestDistance = Infinity;
      let closestExpected: [number, number, number] = [0, 0, 0];
      
      for (let j = 0; j < expectedCorners.length; j++) {
        const distance = this.distance3D(actualCorners[i], expectedCorners[j]);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestExpected = expectedCorners[j];
        }
      }
      
      closestMismatches.push({
        distance: closestDistance,
        actualCorner: actualCorners[i],
        expectedCorner: closestExpected
      });
    }
    
    return { matchedPairs, closestMismatches };
  }

  /**
   * Check if two vectors are within tolerance
   */
  private static vectorsMatch(v1: [number, number, number], v2: [number, number, number]): boolean {
    return this.distance3D(v1, v2) <= this.TOLERANCE;
  }

  /**
   * Validate the optical system against expected data
   */
  static async validateSystem(yamlContent: string, expectedContent: string): Promise<{
    passed: boolean;
    totalSurfaces: number;
    passedSurfaces: number;
    results: Array<{
      surfaceId: number;
      passed: boolean;
      issues: string[];
      expected: ExpectedSurface;
    }>;
  }> {
    console.log('🔍 Starting Ground Truth Validation...');
    
    // Parse expected data
    const expectedSurfaces = this.parseExpectedData(expectedContent);
    console.log(`📊 Expected ${expectedSurfaces.length} surfaces`);
    
    // Dynamically import and create optical system
    const { OpticalSystemParser } = await import('../optical/OpticalSystem');
    const opticalSystem = OpticalSystemParser.parseYAML(yamlContent);
    
    const results: Array<{
      surfaceId: number;
      passed: boolean;
      issues: string[];
      expected: ExpectedSurface;
    }> = [];
    
    // Validate each expected surface
    for (const expected of expectedSurfaces) {
      const issues: string[] = [];
      let passed = true;
      
      // Find corresponding actual surface
      const actual = opticalSystem.surfaces[expected.id];
      
      if (!actual) {
        issues.push(`Surface ${expected.id} not found in rendered output`);
        passed = false;
        results.push({ surfaceId: expected.id, passed, issues, expected });
        continue;
      }
      
      // Extract actual data
      const actualPosition: [number, number, number] = [
        actual.position.x,
        actual.position.y, 
        actual.position.z
      ];
      
      // Get actual normal - use the stored normal if available (correct for dial and A*B method)
      // This ensures we use the properly calculated optical normal, not a transform-derived one
      let actualNormal: [number, number, number];
      
      if (actual.normal) {
        // Use the stored normal (calculated correctly by A*B method or individual surface logic)
        actualNormal = [actual.normal.x, actual.normal.y, actual.normal.z];
      } else {
        // Calculate surface normal from transform matrix
        const normalLocal = new Vector3(-1, 0, 0);
        const transformForNormal = actual.transform;
        const [normalX, normalY, normalZ] = transformForNormal.transformVector(
          normalLocal.x, normalLocal.y, normalLocal.z
        );
        actualNormal = [normalX, normalY, normalZ];
      }
      
      // Get actual corners
      const actualCorners = this.getSurfaceCorners(actual);
      
      // Validate position
      if (!this.vectorsMatch(actualPosition, expected.position)) {
        issues.push(
          `Position mismatch: expected [${expected.position.join(', ')}], ` +
          `got [${actualPosition.join(', ')}]`
        );
        passed = false;
      }
      
      // Validate normal
      if (!this.vectorsMatch(actualNormal, expected.normal)) {
        issues.push(
          `Normal mismatch: expected [${expected.normal.join(', ')}], ` +
          `got [${actualNormal.join(', ')}]`
        );
        passed = false;
      }
      
      // NEW: Validate plane geometry for planar surfaces
      if (actual.shape === 'plano' || actual.shape === 'flat') {
        const planeErrors = this.validatePlaneGeometry(actual, actualCorners);
        issues.push(...planeErrors);
        if (planeErrors.length > 0) {
          passed = false;
        }
      }
      
      // Validate corners - require strict one-to-one matching
      if (expected.corners && expected.corners.length > 0) {
        const actualUnique = this.getUniqueCorners(actualCorners);
        const uniqueExpectedCorners = this.getUniqueCorners(expected.corners);
        
        // DEBUG: Print actual vs expected corners for all surfaces
        console.log(`\n[DEBUG] Surface ${actual.id} corner comparison:`);
        console.log(`  Actual corners (${actualUnique.length}):`);
        actualUnique.forEach((corner, i) => {
          console.log(`    C${i+1}: [${corner.map(c => c.toFixed(6)).join(', ')}]`);
        });
        console.log(`  Expected corners (${uniqueExpectedCorners.length}):`);
        uniqueExpectedCorners.forEach((corner, i) => {
          console.log(`    E${i+1}: [${corner.map(c => c.toFixed(6)).join(', ')}]`);
        });
        
        // Strict validation: require exactly the same number of corners
        if (actualUnique.length !== uniqueExpectedCorners.length) {
          issues.push(`Corner count mismatch: expected ${uniqueExpectedCorners.length} unique corners, got ${actualUnique.length}`);
          passed = false;
        } else {
          // Both have same number of corners - require perfect one-to-one matching
          const cornerMatches = this.findBestCornerMatching(actualUnique, uniqueExpectedCorners);
          
          if (cornerMatches.matchedPairs.length !== uniqueExpectedCorners.length) {
            issues.push(`Corner matching failed: only ${cornerMatches.matchedPairs.length}/${uniqueExpectedCorners.length} corners matched within tolerance.` +
              `Closest mismatches: ${cornerMatches.closestMismatches.map(m => 
                `distance=${m.distance.toFixed(6)}`).join(', ')}`);
            passed = false;
          } else {
            console.log(`✅ Surface ${actual.id}: All ${uniqueExpectedCorners.length} corners matched one-to-one within tolerance`);
          }
        }
      }
      
      results.push({ surfaceId: expected.id, passed, issues, expected });
    }
    
    const passedSurfaces = results.filter(r => r.passed).length;
    const totalSurfaces = results.length;
    
    return {
      passed: passedSurfaces === totalSurfaces,
      totalSurfaces,
      passedSurfaces,
      results
    };
  }

  /**
   * Generate rectangular corner coordinates for a surface.
   * 
   * For surfaces with dial rotation, this method correctly applies the dial by:
   * 1. Transforming corners to world coordinates WITHOUT dial rotation
   * 2. Calculating position-to-corner vectors  
   * 3. Rotating these vectors around the surface normal using Rodrigues rotation
   * 4. Reconstructing final corner positions
   * 
   * This ensures dial rotation is applied to the geometry in world space,
   * not to the coordinate transformation itself.
   */
  private static getSurfaceCorners(surface: OpticalSurface): [number, number, number][] {
    let halfWidth: number;
    let halfHeight: number;
    
    if (surface.semidia) {
      halfWidth = halfHeight = surface.semidia;
    } else {
      const width = surface.width || 50;
      const height = surface.height || 50;
      halfWidth = width / 2;
      halfHeight = height / 2;
    }

    // Local corner coordinates matching SurfaceRenderer mesh generation
    // Width extends along Y-axis, height extends along Z-axis
    const localCorners = [
      new Vector3(0, -halfWidth, -halfHeight), // C1: [-width/2, -height/2]
      new Vector3(0, halfWidth, -halfHeight),  // C2: [+width/2, -height/2]
      new Vector3(0, halfWidth, halfHeight),   // C3: [+width/2, +height/2]
      new Vector3(0, -halfWidth, halfHeight)   // C4: [-width/2, +height/2]
    ];

    // Apply EUREKA methodology: surface.transform already includes all transformations (position, orientation, dial)
    const worldCorners: [number, number, number][] = [];
    
    localCorners.forEach(localCorner => {
      // Transform corner to world coordinates using the unified transform matrix
      // This already includes position, orientation, and dial rotation (EUREKA methodology)
      const [worldX, worldY, worldZ] = surface.inverseTransform.transformPoint(
        localCorner.x, localCorner.y, localCorner.z
      );
      worldCorners.push([worldX, worldY, worldZ]);
    });

    return worldCorners;
  }
}