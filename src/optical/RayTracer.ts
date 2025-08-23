/**
 * Classical Ray Tracing Engine (1960s methodology)
 * Following the transform-to-local, calculate, transform-back approach
 * used in modern optical design software like Zemax and Code V
 */

import { Vector3 } from '../math/Matrix4';
import { Ray } from './LightSource';
import type { OpticalSurface } from './surfaces';
import { RayIntersectionCollector } from '../components/RayIntersectionCollector';

/**
 * Surface warning for optical design issues
 */
export interface SurfaceWarning {
  surfaceId: string;
  warningType: 'geometry' | 'ray_anomaly' | 'physics' | 'aperture';
  message: string;
  severity: 'info' | 'warning' | 'error';
  timestamp: number;
}

/**
 * Ray intersection result
 */
export interface RayIntersection {
  point: Vector3;
  normal: Vector3;
  distance: number;
  isValid: boolean;
}

/**
 * Ray tracing result after surface interaction
 */
export interface RayTraceResult {
  ray: Ray;
  intersection: RayIntersection;
  transmitted?: Ray;
  reflected?: Ray;
  isBlocked: boolean;
  // Partial surface coefficients
  transmissionCoeff?: number;
  reflectionCoeff?: number;
}

/**
 * Classical ray tracing engine implementing 1960s methodology
 */
export class RayTracer {
  // Logging categories
  static logConfig = {
    general: false,   // Disabled general logs
    surface: false,   // Disabled verbose surface logs
    ray: false,       // Disabled ray logs
    simplified: false, // Disabled simplified ray tracing logs
    intersection: false, // Disabled verbose intersection calculations
  };
  static log(category: 'general'|'surface'|'ray'|'simplified'|'intersection', ...args: any[]) {
    if (this.logConfig[category]) {
      console.log(...args);
    }
  }
  private static readonly EPSILON = 1e-10;
  private static readonly MAX_DISTANCE = 1000.0;
  
  // Warning system for optical design issues
  private static warnings: SurfaceWarning[] = [];
  
  // Track first ray for simplified logging
  private static firstRayProcessed = new Set<number>();

  /**
   * Clear first ray tracking (call at start of new ray tracing session)
   */
  static resetFirstRayTracking(): void {
    this.firstRayProcessed.clear();
  }

  /**
   * Get all accumulated warnings
   */
  static getWarnings(): SurfaceWarning[] {
    return [...this.warnings];
  }

  /**
   * Clear all warnings
   */
  static clearWarnings(): void {
    this.warnings = [];
  }

  /**
   * Generate next cascading light ID for ray branching (EUREKA methodology)
   * Examples: 1 -> 1.1, 1.1 -> 1.11, 1.2 -> 1.21, etc.
   * This prevents ID collisions when rays split multiple times
   */
  static getNextCascadingLightId(currentLightId: number): number {
    const lightIdStr = currentLightId.toString();
    
    // Count decimal places to determine next level
    const decimalIndex = lightIdStr.indexOf('.');
    if (decimalIndex === -1) {
      // No decimal places: 1 -> 1.1
      return currentLightId + 0.1;
    } else {
      // Has decimal places: add one more digit level
      const decimalPart = lightIdStr.substring(decimalIndex + 1);
      // Create increment for next level: 0.01, 0.001, 0.0001, etc.
      const nextIncrement = Math.pow(10, -(decimalPart.length + 1));
      return currentLightId + nextIncrement;
    }
  }

  /**
   * Check if a wavelength should interact with a surface based on the 'sel' parameter
   * @param wavelength - Wavelength in nanometers
   * @param sel - Selection string (e.g., 'o532', 'x633', 'o488-x532-o633', or undefined)
   * @returns true if the wavelength should interact with the surface
   */
  static shouldWavelengthInteract(wavelength: number, sel?: string): boolean {
    if (!sel) {
      return true; // No selection criteria - all wavelengths interact
    }
    
    // Split by hyphens to handle multiple conditions: "o488-x532-o633"
    const conditions = sel.split('-');
    let shouldInteract = true; // Default for broadband
    
    for (const condition of conditions) {
      const match = condition.trim().match(/^([ox])(\d+)$/);
      if (!match) {
        console.warn(`Invalid wavelength selection format: ${condition}. Expected format: o532 or x633`);
        continue; // Skip invalid conditions
      }
      
      const mode = match[1]; // 'o' for only, 'x' for exclude
      const targetWavelength = parseInt(match[2], 10);
      
      if (mode === 'o') {
        // Only this wavelength interacts - if wavelength matches, allow interaction
        if (wavelength === targetWavelength) {
          shouldInteract = true;
        } else {
          // For 'only' conditions, if wavelength doesn't match any 'o' condition, block it
          // But we need to check if there are other 'o' conditions first
          const hasOnlyConditions = conditions.some(c => c.trim().startsWith('o'));
          if (hasOnlyConditions) {
            const matchesAnyOnly = conditions.some(c => {
              const m = c.trim().match(/^o(\d+)$/);
              return m && parseInt(m[1], 10) === wavelength;
            });
            if (!matchesAnyOnly) {
              shouldInteract = false;
            }
          }
        }
      } else if (mode === 'x') {
        // Exclude this wavelength - if wavelength matches, block interaction
        if (wavelength === targetWavelength) {
          shouldInteract = false;
        }
      }
    }
    
    return shouldInteract;
  }

  /**
   * Log a surface warning
   */
  private static logSurfaceWarning(
    surface: OpticalSurface, 
    message: string, 
    type: SurfaceWarning['warningType'] = 'ray_anomaly',
    severity: SurfaceWarning['severity'] = 'warning'
  ): void {
    const warning: SurfaceWarning = {
      surfaceId: surface.id,
      warningType: type,
      message,
      severity,
      timestamp: Date.now()
    };
    
    this.warnings.push(warning);
    
    // Also log to console with appropriate level
    const prefix = severity === 'error' ? '❌' : severity === 'warning' ? '⚠️' : 'ℹ️';
    console.warn(`${prefix} SURFACE WARNING [${surface.id}]: ${message}`);
  }

  /**
   * Trace a ray through a single optical surface
   */
  static traceThroughSurface(ray: Ray, surface: OpticalSurface, isFirstRayOfLight = false): RayTraceResult {
    const useSimplifiedLog = isFirstRayOfLight && this.logConfig.simplified;
    
    // Check wavelength selection first - if this wavelength shouldn't interact, ray passes through unchanged
    if (!this.shouldWavelengthInteract(ray.wavelength, surface.sel)) {
      if (!useSimplifiedLog) {
        this.log('surface', `Wavelength ${ray.wavelength}nm skips surface due to selection criteria: ${surface.sel}`);
      }
      return {
        ray,
        intersection: { point: new Vector3(0,0,0), normal: new Vector3(0,0,1), distance: 0, isValid: false },
        transmitted: ray, // Ray continues unchanged
        isBlocked: false
      };
    }
    
    if (useSimplifiedLog) {
      this.log('simplified', `\n--- Surface: ${surface.id} ---`);
      this.log('simplified', `World ray: (${ray.position.x.toFixed(3)}, ${ray.position.y.toFixed(3)}, ${ray.position.z.toFixed(3)}) → (${ray.direction.x.toFixed(3)}, ${ray.direction.y.toFixed(3)}, ${ray.direction.z.toFixed(3)})`);
    } else {
      this.log('ray', `Tracing ray through surface ${surface.id}`);
      this.log('ray', `Ray:`, { position: ray.position, direction: ray.direction });
      this.log('surface', `Surface:`, { position: surface.position, shape: surface.shape, mode: surface.mode });
    }
    
    // === CLASSICAL RAY TRACING: WORLD → LOCAL → WORLD TRANSFORMATION ===
    
    // 1. Transform incoming ray from world coordinates to surface local coordinates
    const localRay = this.transformRayToLocal(ray, surface);
    
    if (useSimplifiedLog) {
      this.log('simplified', `Local ray:  (${localRay.position.x.toFixed(3)}, ${localRay.position.y.toFixed(3)}, ${localRay.position.z.toFixed(3)}) → (${localRay.direction.x.toFixed(3)}, ${localRay.direction.y.toFixed(3)}, ${localRay.direction.z.toFixed(3)})`);
    } else {
      this.log('ray', `Local ray:`, { position: localRay.position, direction: localRay.direction });
    }
    
    // 2. Calculate intersection in local coordinates (where surface apex is at origin)
    const intersection = this.calculateIntersection(localRay, surface);
    
    if (useSimplifiedLog) {
      if (intersection.isValid) {
        this.log('simplified', `Intersection: (${intersection.point.x.toFixed(3)}, ${intersection.point.y.toFixed(3)}, ${intersection.point.z.toFixed(3)})`);
      } else {
        this.log('simplified', `Intersection: MISS`);
      }
    } else {
      this.log('surface', `Intersection:`, intersection);
    }
    
    // 3. Check if ray actually hits the surface geometry and aperture
    const rayHitsSurface = intersection.isValid && 
                          localRay.direction.dot(intersection.normal) < 0 && 
                          this.isWithinAperture(intersection.point, surface);
    
    if (!rayHitsSurface) {
      if (!useSimplifiedLog) {
        this.log('surface', `Ray misses surface - no interaction, continues with original trajectory`);
      }
      
      // Special case: aperture surfaces need intersection check with aperture plane
      if (surface.mode === 'aperture') {
        // Calculate intersection with aperture plane (YZ plane at X=0 in local coordinates)
        const localRay = this.transformRayToLocal(ray, surface);
        
        if (Math.abs(localRay.direction.x) > this.EPSILON) {
          const t = -localRay.position.x / localRay.direction.x;
          if (t > this.EPSILON) {
            const hitPoint = localRay.position.add(localRay.direction.multiply(t));
            const globalHitPoint = this.transformPointToGlobal(hitPoint, surface);
            
            // Check if hit point is within aperture bounds
            const isWithinAperture = this.isWithinAperture(hitPoint, surface);
            
            if (isWithinAperture) {
              // Ray passes through aperture - continue tracing
              if (!useSimplifiedLog) {
                this.log('surface', `Aperture: ray passes through at (${hitPoint.y.toFixed(3)}, ${hitPoint.z.toFixed(3)})`);
              }
              return {
                ray,
                intersection: { point: new Vector3(0,0,0), normal: new Vector3(0,0,1), distance: 0, isValid: false },
                isBlocked: false
              };
            } else {
              // Ray blocked by aperture - stop here
              if (!useSimplifiedLog) {
                this.log('surface', `Aperture: ray blocked at (${hitPoint.y.toFixed(3)}, ${hitPoint.z.toFixed(3)})`);
              }
              
              // Set ray stopsAt to this surface's numerical ID
              ray.stopsAt = surface.numericalId || -1;
              
              return {
                ray,
                intersection: { 
                  point: globalHitPoint, 
                  normal: surface.normal || new Vector3(-1, 0, 0), 
                  distance: globalHitPoint.subtract(ray.position).length(), 
                  isValid: true 
                },
                isBlocked: true
              };
            }
          }
        }
        
        // Ray doesn't intersect aperture plane - continue
        return {
          ray,
          intersection: { point: new Vector3(0,0,0), normal: new Vector3(0,0,1), distance: 0, isValid: false },
          isBlocked: false
        };
      }
      
      // For all other surface types: ray continues with original trajectory
      return {
        ray,
        intersection: { point: new Vector3(0,0,0), normal: new Vector3(0,0,1), distance: 0, isValid: false },
        transmitted: ray, // Ray continues unchanged
        isBlocked: false
      };
    }

    // 4. Ray hits surface - apply surface physics in local coordinates
    const result = this.applySurfacePhysics(localRay, intersection, surface);
    
    if (!useSimplifiedLog) {
      this.log('surface', `Physics result:`, { 
        blocked: result.isBlocked, 
        hasTransmitted: !!result.transmitted,
        hasReflected: !!result.reflected 
      });
    }
    
    // 5. Transform result rays back to global coordinates
    if (result.transmitted) {
      result.transmitted = this.transformRayToGlobal(result.transmitted, surface);
      if (useSimplifiedLog) {
        this.log('simplified', `Output ray:  (${result.transmitted.position.x.toFixed(3)}, ${result.transmitted.position.y.toFixed(3)}, ${result.transmitted.position.z.toFixed(3)}) → (${result.transmitted.direction.x.toFixed(3)}, ${result.transmitted.direction.y.toFixed(3)}, ${result.transmitted.direction.z.toFixed(3)})`);
      } else {
        this.log('ray', `Transmitted ray (global):`, { 
          position: result.transmitted.position, 
          direction: result.transmitted.direction 
        });
      }
    }
    if (result.reflected) {
      result.reflected = this.transformRayToGlobal(result.reflected, surface);
      if (useSimplifiedLog) {
        this.log('simplified', `Output ray:  (${result.reflected.position.x.toFixed(3)}, ${result.reflected.position.y.toFixed(3)}, ${result.reflected.position.z.toFixed(3)}) → (${result.reflected.direction.x.toFixed(3)}, ${result.reflected.direction.y.toFixed(3)}, ${result.reflected.direction.z.toFixed(3)})`);
      }
    }

    // Transform intersection back to global coordinates
    const localHitPoint = intersection.point.clone(); // Preserve local coordinates for analysis
    result.intersection.point = this.transformPointToGlobal(intersection.point, surface);
    result.intersection.normal = this.transformVectorToGlobal(intersection.normal, surface);

    // Collect hit data for analysis (if collection is active)
    if (intersection.isValid && rayHitsSurface) {
      const collector = RayIntersectionCollector.getInstance();
      collector.recordHit(
        ray,
        surface,
        result.intersection.point,         // Global hit point
        result.intersection.normal,       // Global normal
        intersection.distance,
        true, // isValid
        result.isBlocked,
        ray.direction,
        result.transmitted?.direction || result.reflected?.direction,
        localHitPoint                     // TRUE local coordinates (before transform)
      );
    }

    return result;
  }

  /**
   * Trace a ray through multiple surfaces sequentially
   * Returns array of rays representing the complete ray path with proper segments
   * Now handles partial surface branching properly
   */
  static traceRaySequential(ray: Ray, surfaces: OpticalSurface[]): Ray[] {
    // Clear warnings at the start of each ray trace
    this.clearWarnings();
    
    // Record ray tracing for statistics
    const collector = RayIntersectionCollector.getInstance();
    collector.recordRayTrace(ray);
    
    // Check if this is the first ray of this light source
    const isFirstRayOfLight = !this.firstRayProcessed.has(ray.lightId);
    if (isFirstRayOfLight) {
      this.firstRayProcessed.add(ray.lightId);
    }

    // Handle ray branching for partial surfaces
    const allRayPaths = this.traceRayWithBranching(ray, surfaces, 0, isFirstRayOfLight);
    
    // Flatten all ray paths into a single array for visualization
    // Each path represents an independent ray that travels through the system
    // Light IDs are already properly assigned (fractional IDs for branches)
    const combinedRays: Ray[] = [];
    
    for (let pathIndex = 0; pathIndex < allRayPaths.length; pathIndex++) {
      const path = allRayPaths[pathIndex];
    // Remove the excessive ray path debugging - too verbose
    // console.log(`🔍 RAY PATH ${pathIndex} (Light ID: ${path[0]?.lightId}): ${path.length} segments`);
      // Processing ray path segments - logging disabled for performance
      // Variables removed since verbose logging was disabled
      combinedRays.push(...path);
    }
    
    return combinedRays;
  }

  /**
   * Recursive ray tracing that handles partial surface branching
   * Returns multiple ray paths when partial surfaces create reflected and transmitted rays
   */
  private static traceRayWithBranching(
    ray: Ray, 
    surfaces: OpticalSurface[], 
    startSurfaceIndex: number,
    isFirstTrace: boolean
  ): Ray[][] {
    const rayPath: Ray[] = [ray.clone()]; // Start with initial ray
    let rayWasBlocked = false; // Track if ray was blocked during propagation
    let currentRay = ray;
    let lastSuccessfulRayDirection = ray.direction; // Track the last successful outgoing ray direction

    if (isFirstTrace && this.logConfig.simplified && startSurfaceIndex === 0) {
      this.log('simplified', `\n=== Ray Trace: Light ${ray.lightId} ===`);
    } else if (startSurfaceIndex === 0) {
      this.log('general', `Starting ray trace with ${surfaces.length} surfaces`);
      this.log('ray', `Initial ray:`, { position: currentRay.position, direction: currentRay.direction });
    }

    // CRITICAL FIX: For branched rays (startSurfaceIndex > 0), the ray direction is already the correct direction
    // This ensures reflected and transmitted rays extend in the right direction when they don't hit surfaces
    if (startSurfaceIndex > 0) {
      lastSuccessfulRayDirection = ray.direction.normalize();
      if (!isFirstTrace) {
        this.log('ray', `Branched ray starting at surface ${startSurfaceIndex} with direction:`, lastSuccessfulRayDirection);
      }
    }

    for (let i = startSurfaceIndex; i < surfaces.length; i++) {
      const surface = surfaces[i];
      
      // Optimization: Stop tracing if ray has been blocked at a specific surface
      if (currentRay.stopsAt >= 0 && (surface.numericalId || i) >= currentRay.stopsAt) {
        if (!isFirstTrace) {
          this.log('general', `Ray stopped at surface ${currentRay.stopsAt}, skipping remaining surfaces`);
        }
        break;
      }
      
      if (!isFirstTrace) {
        this.log('general', `Processing surface ${i}: ${surface.id}, mode: ${surface.mode}, shape: ${surface.shape}`);
      }
      
      const result = this.traceThroughSurface(currentRay, surface, isFirstTrace && startSurfaceIndex === 0);
      
      if (!isFirstTrace) {
        this.log('surface', `Surface ${i} result:`, { 
          blocked: result.isBlocked, 
          hasTransmitted: !!result.transmitted,
          hasReflected: !!result.reflected 
        });
      }
      
      if (result.isBlocked) {
        rayWasBlocked = true; // Mark that ray was blocked during propagation
        if (!isFirstTrace) {
          this.log('ray', `Ray blocked at surface ${i} (${surface.mode} surface) - stopping propagation`);
        }
        
        // For blocked rays, add the intersection point to show where the ray was blocked
        if (result.intersection.isValid) {
          const intersectionRay = new Ray(
            result.intersection.point, 
            currentRay.direction, // Direction approaching this intersection
            currentRay.wavelength, 
            currentRay.lightId, 
            currentRay.intensity
          );
          rayPath.push(intersectionRay);
          if (!isFirstTrace) {
            this.log('ray', `Ray terminated at intersection point:`, result.intersection.point);
          }
        }
        // CRITICAL: Ray is blocked (absorption hit or aperture miss) - stop processing all subsequent surfaces
        break;
      }

      // Store intersection point in ray path with the incoming ray direction
      if (result.intersection.isValid) {
        // Create a ray at the intersection point with the incoming direction
        const intersectionRay = new Ray(
          result.intersection.point, 
          currentRay.direction, // Direction approaching this intersection
          currentRay.wavelength, 
          currentRay.lightId, 
          currentRay.intensity
        );
        rayPath.push(intersectionRay);
        if (!isFirstTrace) {
          this.log('ray', `Added intersection point to path:`, result.intersection.point);
        }
      }

      // *** CRITICAL: Handle partial surface branching ***
      if (surface.mode === 'partial' && result.transmitted && result.reflected) {
        const transmissionCoeff = result.transmissionCoeff ?? 0.5;
        
        if (!isFirstTrace) {
          this.log('ray', `Partial surface: creating reflected AND transmitted rays (transmission coeff: ${transmissionCoeff})`);
        }
        
        // EUREKA-style cascading light ID assignment for branching:
        // Calculate next available fractional ID level to avoid collisions
        const originalLightId = currentRay.lightId; // Use current ray's light ID
        const shadowLightId = this.getNextCascadingLightId(originalLightId);
        
        if (!isFirstTrace) {
          console.log(`🔍 LIGHT ID CASCADING: ${originalLightId} -> ${originalLightId} & ${shadowLightId} (PARTIAL surface)`);
        }
        
        let transmittedRayForTracing: Ray;
        let reflectedRayForTracing: Ray;
        
        if (transmissionCoeff > 0.5) {
          // Transmission dominant: transmitted keeps original LID, reflected gets +0.1
          transmittedRayForTracing = new Ray(
            result.transmitted.position,
            result.transmitted.direction,
            result.transmitted.wavelength,
            originalLightId, // Keeps original LID
            result.transmitted.intensity
          );
          reflectedRayForTracing = new Ray(
            result.reflected.position,
            result.reflected.direction,
            result.reflected.wavelength,
            shadowLightId, // Gets LID+0.1
            result.reflected.intensity
          );
        } else {
          // Reflection dominant: reflected keeps original LID, transmitted gets +0.1
          reflectedRayForTracing = new Ray(
            result.reflected.position,
            result.reflected.direction,
            result.reflected.wavelength,
            originalLightId, // Keeps original LID
            result.reflected.intensity
          );
          transmittedRayForTracing = new Ray(
            result.transmitted.position,
            result.transmitted.direction,
            result.transmitted.wavelength,
            shadowLightId, // Gets LID+0.1
            result.transmitted.intensity
          );
        }
        
        // Continue tracing transmitted ray through remaining surfaces
        const transmittedPaths = this.traceRayWithBranching(
          transmittedRayForTracing, 
          surfaces, 
          i + 1, // Continue from next surface
          false
        );
        
        // Continue tracing reflected ray through remaining surfaces
        const reflectedPaths = this.traceRayWithBranching(
          reflectedRayForTracing, 
          surfaces, 
          i + 1, // Continue from next surface
          false
        );
        
        // Debug: Log reflected ray path information
        if (reflectedPaths.length > 0 && reflectedPaths[0].length > 0) {
          console.log(`🔍 DEBUG: Reflected ray path has ${reflectedPaths[0].length} segments`);
          console.log(`🔍 DEBUG: Transmitted ray ID: ${transmittedRayForTracing.lightId} (original: ${result.transmitted.lightId})`);
          console.log(`🔍 DEBUG: Reflected ray ID: ${reflectedRayForTracing.lightId} (original: ${result.reflected.lightId})`);
          console.log(`🔍 DEBUG: First reflected ray: (${reflectedRayForTracing.position.x.toFixed(3)}, ${reflectedRayForTracing.position.y.toFixed(3)}, ${reflectedRayForTracing.position.z.toFixed(3)}) → (${reflectedRayForTracing.direction.x.toFixed(3)}, ${reflectedRayForTracing.direction.y.toFixed(3)}, ${reflectedRayForTracing.direction.z.toFixed(3)})`);
          if (reflectedPaths[0].length > 1) {
            const lastReflectedRay = reflectedPaths[0][reflectedPaths[0].length - 1];
            console.log(`🔍 DEBUG: Last reflected ray: (${lastReflectedRay.position.x.toFixed(3)}, ${lastReflectedRay.position.y.toFixed(3)}, ${lastReflectedRay.position.z.toFixed(3)}) → (${lastReflectedRay.direction.x.toFixed(3)}, ${lastReflectedRay.direction.y.toFixed(3)}, ${lastReflectedRay.direction.z.toFixed(3)})`);
          }
          
          // Additional debug: Check if last ray looks like it was extended or if it's connected back to source
          const firstRay = reflectedPaths[0][0];
          const lastRay = reflectedPaths[0][reflectedPaths[0].length - 1];
          const pathDistance = firstRay.position.distanceTo(lastRay.position);
          console.log(`🔍 DEBUG: Total reflected path distance: ${pathDistance.toFixed(3)}`);
          
          // Check if last ray direction is pointing away from source (should be reflected direction)
          const isPointingAwayFromSource = reflectedRayForTracing.direction.dot(firstRay.direction) < 0;
          console.log(`🔍 DEBUG: Last ray pointing away from source: ${isPointingAwayFromSource}`);
        }
        
        // Combine current ray path with both branches
        const allPaths: Ray[][] = [];
        
        // Add transmitted branch paths - continue from current path
        for (const path of transmittedPaths) {
          // Update ALL rays in the transmitted path to have the correct light ID
          const correctedPath = path.map(ray => new Ray(
            ray.position,
            ray.direction,
            ray.wavelength,
            transmittedRayForTracing.lightId, // Use transmitted ray's light ID
            ray.intensity
          ));
          // Combine with current ray path, updating light IDs
          const updatedRayPath = rayPath.map(ray => new Ray(
            ray.position,
            ray.direction,
            ray.wavelength,
            transmittedRayForTracing.lightId, // Update original path to transmitted ID
            ray.intensity
          ));
          allPaths.push([...updatedRayPath, ...correctedPath]);
        }
        
        // Fallback for empty transmitted paths
        if (transmittedPaths.length === 0) {
          const updatedRayPath = rayPath.map(ray => new Ray(
            ray.position,
            ray.direction,
            ray.wavelength,
            transmittedRayForTracing.lightId,
            ray.intensity
          ));
          allPaths.push(updatedRayPath);
        }
        
        // Add reflected branch paths - start independently from intersection point
        for (const path of reflectedPaths) {
          // Update ALL rays in the reflected path to have the correct light ID
          const correctedPath = path.map(ray => new Ray(
            ray.position,
            ray.direction,
            ray.wavelength,
            reflectedRayForTracing.lightId, // Use reflected ray's fractional light ID
            ray.intensity
          ));
          allPaths.push(correctedPath);
        }
        
        // Fallback for empty reflected paths  
        if (reflectedPaths.length === 0) {
          // Create a minimal reflected path starting from the intersection
          if (rayPath.length >= 2) {
            const intersectionPoint = rayPath[rayPath.length - 1];
            const reflectedPath = [new Ray(
              intersectionPoint.position,
              reflectedRayForTracing.direction,
              intersectionPoint.wavelength,
              reflectedRayForTracing.lightId,
              intersectionPoint.intensity
            )];
            allPaths.push(reflectedPath);
          }
        }
        
        return allPaths;
      }

      // Handle single ray continuation (transmitted or reflected)
      if (result.transmitted) {
        currentRay = result.transmitted;
        lastSuccessfulRayDirection = result.transmitted.direction; // Update last successful outgoing direction
        if (!isFirstTrace) {
          this.log('ray', `Ray transmitted, new direction:`, currentRay.direction);
          this.log('ray', `Added transmitted ray segment to path`);
          // Debug: Show light ID continuation
          if (currentRay.lightId !== Math.floor(currentRay.lightId)) {
            console.log(`🔍 FRACTIONAL RAY CONTINUES: Light ID ${currentRay.lightId} continues through ${surface.mode} surface (${surface.id})`);
          }
        }
        
      } else if (result.reflected) {
        currentRay = result.reflected;
        lastSuccessfulRayDirection = result.reflected.direction; // Update last successful outgoing direction
        if (!isFirstTrace) {
          this.log('ray', `Ray reflected, new direction:`, currentRay.direction);
          this.log('ray', `Added reflected ray segment to path`);
          // Debug: Show light ID continuation  
          if (currentRay.lightId !== Math.floor(currentRay.lightId)) {
            console.log(`🔍 FRACTIONAL RAY CONTINUES: Light ID ${currentRay.lightId} continues through ${surface.mode} surface (${surface.id})`);
          }
        }
        
      } else {
        if (!isFirstTrace) {
          this.log('ray', `No continuing ray from surface ${i}`);
        }
        break;
      }
    }

    // Complete the ray path using the existing logic
    this.completeRayPath(rayPath, rayWasBlocked, surfaces, lastSuccessfulRayDirection, isFirstTrace);
    
    return [rayPath]; // Return single path array
  }

  /**
   * Complete a ray path with proper extension logic
   */
  private static completeRayPath(
    rayPath: Ray[], 
    rayWasBlocked: boolean, 
    surfaces: OpticalSurface[], 
    lastSuccessfulRayDirection: Vector3,
    isFirstTrace: boolean
  ): void {
    // Add a final ray segment based on the last surface interaction
    if (rayPath.length > 0) {
      const lastRay = rayPath[rayPath.length - 1];
      
      // CRITICAL: If ray was blocked during propagation (absorption hit or aperture miss), NO EXTENSION
      if (rayWasBlocked) {
        if (!isFirstTrace) {
          this.log('general', `Ray was blocked during propagation - terminating at intersection point (no extension)`);
        }
        // Ray path ends exactly where it was blocked - no extension
        
      } else {
        // Ray completed full propagation through all surfaces - apply extension rules
        
        // Calculate accumulative distance travelled through all ray segments
        let accumulativeDistance = 0;
        for (let i = 1; i < rayPath.length; i++) {
          const segmentDistance = rayPath[i-1].position.distanceTo(rayPath[i].position);
          accumulativeDistance += segmentDistance;
        }
        
        // Use 10% of accumulative distance for extension, fallback to 50 if no valid distance
        const extensionLength = accumulativeDistance > 1e-6 ? accumulativeDistance * 0.1 : 50;
        
        // Determine last surface that was processed
        const lastProcessedSurfaceIndex = Math.min(surfaces.length - 1, Math.floor((rayPath.length - 1) / 2));
        const lastProcessedSurface = surfaces[lastProcessedSurfaceIndex];
        const isLastSurface = lastProcessedSurfaceIndex === surfaces.length - 1;
        const lastSurface = surfaces[surfaces.length - 1];
        
        // SCENARIO 1: Last surface is absorption and ray hit it (final detector)
        if (isLastSurface && lastProcessedSurface && lastProcessedSurface.mode === 'absorption') {
          if (!isFirstTrace) {
            this.log('general', `Ray completed path and hit final absorption surface (detector) - terminating at intersection point (no extension)`);
          }
          // For final absorption surfaces, the ray path should end exactly at the intersection point
          
        // SCENARIO 2: Ray didn't reach last surface, but last surface is aperture
        } else if (!isLastSurface && lastSurface.mode === 'aperture') {
          // Calculate YZ plane intersection with aperture surface
          const aperture = lastSurface;
          const localRay = this.transformRayToLocal(lastRay, aperture);
          
          // Check if ray intersects YZ plane (X=0) of aperture
          if (Math.abs(localRay.direction.x) > this.EPSILON) {
            const t = -localRay.position.x / localRay.direction.x;
            if (t > this.EPSILON) {
              const hitPoint = localRay.position.add(localRay.direction.multiply(t));
              const worldHitPoint = this.transformPointToGlobal(hitPoint, aperture);
              
              const apertureEndRay = new Ray(
                worldHitPoint,
                lastSuccessfulRayDirection,
                lastRay.wavelength,
                lastRay.lightId,
                lastRay.intensity
              );
              rayPath.push(apertureEndRay);
              
              // CRITICAL: Record this intersection in the collector for optimization
              const collector = RayIntersectionCollector.getInstance();
              if (collector.isCollectionActive()) {
                collector.recordHit(
                  lastRay,           // Original ray
                  aperture,          // Last surface (aperture)
                  worldHitPoint,     // Hit point
                  aperture.normal || new Vector3(-1, 0, 0),  // Normal
                  worldHitPoint.subtract(lastRay.position).length(), // Distance
                  true,              // isValid
                  false,             // wasBlocked - ray reached the surface
                  lastRay.direction, // Incoming direction
                  lastSuccessfulRayDirection, // Outgoing direction
                  hitPoint           // Local hit point
                );
              }
              
              if (!isFirstTrace) {
                this.log('ray', `Ray didn't hit aperture - terminated at YZ plane intersection:`, worldHitPoint);
              }
            } else {
              // Ray moving away from aperture, extend normally
              const finalPosition = lastRay.position.add(lastSuccessfulRayDirection.multiply(extensionLength));
              const finalRay = new Ray(
                finalPosition,
                lastSuccessfulRayDirection,
                lastRay.wavelength,
                lastRay.lightId,
                lastRay.intensity
              );
              rayPath.push(finalRay);
              if (!isFirstTrace) {
                this.log('ray', `Ray moving away from aperture - extended ${extensionLength.toFixed(1)} units to:`, finalPosition);
              }
            }
          } else {
            // Ray parallel to aperture, extend normally
            const finalPosition = lastRay.position.add(lastSuccessfulRayDirection.multiply(extensionLength));
            const finalRay = new Ray(
              finalPosition,
              lastSuccessfulRayDirection,
              lastRay.wavelength,
              lastRay.lightId,
              lastRay.intensity
            );
            rayPath.push(finalRay);
            if (!isFirstTrace) {
              this.log('ray', `Ray parallel to aperture - extended ${extensionLength.toFixed(1)} units to:`, finalPosition);
            }
          }
          
        // SCENARIO 3: All other cases - extend ray by 10% of accumulative distance
        } else {
          // For refraction, reflection, or if ray didn't reach final surface
          // Extend the ray into free space using the LAST SUCCESSFUL OUTGOING DIRECTION
          const finalPosition = lastRay.position.add(lastSuccessfulRayDirection.multiply(extensionLength));
          const finalRay = new Ray(
            finalPosition,
            lastSuccessfulRayDirection,
            lastRay.wavelength,
            lastRay.lightId,
            lastRay.intensity
          );
          rayPath.push(finalRay);
          
          // CRITICAL: If ray was extended to reach the last surface, record intersection for optimization
          const collector = RayIntersectionCollector.getInstance();
          if (collector.isCollectionActive() && lastProcessedSurfaceIndex < surfaces.length - 1) {
            const lastSurface = surfaces[surfaces.length - 1];
            // Record intersection at the extended position as if ray hit the last surface
            collector.recordHit(
              lastRay,           // Original ray
              lastSurface,       // Last surface
              finalPosition,     // Extended hit point
              lastSurface.normal || new Vector3(-1, 0, 0),  // Normal
              finalPosition.subtract(lastRay.position).length(), // Distance
              true,              // isValid
              false,             // wasBlocked - ray was extended to reach surface
              lastRay.direction, // Incoming direction
              lastSuccessfulRayDirection, // Outgoing direction
              finalPosition      // Local hit point (approximate)
            );
          }
          
          if (!isFirstTrace) {
            this.log('ray', `Extended ray ${extensionLength.toFixed(1)} units in last successful outgoing direction to:`, finalPosition);
          }
          
          // Check if ray didn't reach the final surface and log warning
          if (lastProcessedSurfaceIndex < surfaces.length - 1) {
            const missedSurfaces = surfaces.length - 1 - lastProcessedSurfaceIndex;
            this.logSurfaceWarning(
              surfaces[surfaces.length - 1], 
              `Ray terminated early, missed ${missedSurfaces} surface(s) including final surface`,
              'ray_anomaly',
              'warning'
            );
          }
        }
      }
    }

    // Display any warnings that occurred during ray tracing
    const warnings = this.getWarnings();
    if (warnings.length > 0 && !isFirstTrace) {
      this.log('general', `\n⚠️ ${warnings.length} optical design warning(s):`);
      warnings.forEach((warning, index) => {
        const icon = warning.severity === 'error' ? '❌' : warning.severity === 'warning' ? '⚠️' : 'ℹ️';
        this.log('general', `  ${index + 1}. ${icon} [${warning.surfaceId}] ${warning.message}`);
      });
      this.log('general', ''); // Empty line for spacing
    }
  }

  /**
   * Transform ray from global to surface local coordinates
   * Uses precomputed transformation matrix for efficiency
   */
  private static transformRayToLocal(ray: Ray, surface: OpticalSurface): Ray {
    // Use precomputed forward transformation matrix
    const transform = surface.forwardTransform;
    
    // Transform ray origin point directly
    const localOrigin = transform.transformPointV3(ray.position);
    
    // Transform ray direction vector (not as a point)
    const localDirection = transform.transformVectorV3(ray.direction.normalize());
    
    return new Ray(localOrigin, localDirection, ray.wavelength, ray.lightId, ray.intensity);
  }

  /**
   * Transform ray from surface local to global coordinates
   * Uses precomputed inverse transformation matrix for efficiency
   */
  private static transformRayToGlobal(ray: Ray, surface: OpticalSurface): Ray {
    // Use precomputed inverse transformation matrix
    const inverseTransform = surface.inverseTransform;
    
    // Transform local ray origin and direction back to world coordinates
    const worldOrigin = inverseTransform.transformPointV3(ray.position);
    const worldDirection = inverseTransform.transformVectorV3(ray.direction.normalize());
    
    return new Ray(worldOrigin, worldDirection, ray.wavelength, ray.lightId, ray.intensity);
  }

  /**
   * Transform point from local to global coordinates
   * Uses precomputed inverse transformation matrix for efficiency
   */
  private static transformPointToGlobal(point: Vector3, surface: OpticalSurface): Vector3 {
    return surface.inverseTransform.transformPointV3(point);
  }

  /**
   * Transform vector from local to global coordinates
   * Uses precomputed inverse transformation matrix for efficiency
   */
  private static transformVectorToGlobal(vector: Vector3, surface: OpticalSurface): Vector3 {
    return surface.inverseTransform.transformVectorV3(vector);
  }

  /**
   * Calculate ray-surface intersection in local coordinates
   */
  private static calculateIntersection(ray: Ray, surface: OpticalSurface): RayIntersection {
    switch (surface.shape) {
      case 'spherical':
        return this.intersectSphere(ray, surface);
      case 'plano':
      case 'flat':
        return this.intersectPlane(ray, surface);
      case 'cylindrical':
        return this.intersectCylinder(ray, surface);
      default:
        return {
          point: new Vector3(0, 0, 0),
          normal: new Vector3(0, 0, 1),
          distance: 0,
          isValid: false
        };
    }
  }

  /**
   * Intersect ray with spherical surface (in local coordinates)
   * 
   * CLASSICAL SPHERE GEOMETRY:
   * - Transformation matrix places sphere CENTER at origin [0,0,0]
   * - Sphere equation: x² + y² + z² = R²
   * - For CONVEX (R > 0): rays from outside, use first intersection
   * - For CONCAVE (R < 0): rays from inside, use second intersection
   */
  private static intersectSphere(ray: Ray, surface: OpticalSurface): RayIntersection {
    const radius = surface.radius || 0;
    if (Math.abs(radius) < this.EPSILON) {
      return this.intersectPlane(ray, surface); // Treat as flat if radius ≈ 0
    }
    
    // Ray position and direction in local coordinates (sphere center at origin)
    const O = ray.position;
    const D = ray.direction.normalize();
    
    // === RAY-SPHERE INTERSECTION CALCULATION ===
    // Sphere equation: x² + y² + z² = R²
    // Ray equation: P = O + t*D
    // Substitute: (Ox + t*Dx)² + (Oy + t*Dy)² + (Oz + t*Dz)² = R²
    const a = D.dot(D); // Should be 1 since D is normalized
    const b = 2 * O.dot(D);
    const c = O.dot(O) - radius * radius;

    const discriminant = b * b - 4 * a * c;
    
    if (discriminant < 0) {
      return { point: new Vector3(0, 0, 0), normal: new Vector3(0, 0, 1), distance: 0, isValid: false };
    }

    const sqrt_discriminant = Math.sqrt(discriminant);
    const t1 = (-b - sqrt_discriminant) / (2 * a); // First intersection (closer)
    const t2 = (-b + sqrt_discriminant) / (2 * a); // Second intersection (farther)

    // === DETERMINE VALID INTERSECTION BASED ON SURFACE TYPE ===
    const rayDistanceFromCenter = O.length();
    const sphereRadius = Math.abs(radius);
    const isRayInsideSphere = rayDistanceFromCenter < sphereRadius;

    // Apply sphere intersection rules
    let t: number;
    let warningMessage = '';
    
    if (radius > 0) {
      // POSITIVE RADIUS = CONVEX SURFACE
      if (isRayInsideSphere) {
        // ANOMALY: Ray inside convex sphere
        warningMessage = `⚠️ ANOMALY: Ray inside convex sphere (R=${radius.toFixed(3)}, ray at distance ${rayDistanceFromCenter.toFixed(3)})`;
        this.logSurfaceWarning(surface, warningMessage);
        return { point: new Vector3(0, 0, 0), normal: new Vector3(0, 0, 1), distance: 0, isValid: false };
      } else {
        // Ray outside convex sphere: use FIRST intersection
        t = t1 > this.EPSILON ? t1 : (t2 > this.EPSILON ? t2 : -1);
      }
    } else {
      // NEGATIVE RADIUS = CONCAVE SURFACE
      // For concave surface: always use SECOND intersection (back side)
      t = t2 > this.EPSILON ? t2 : (t1 > this.EPSILON ? t1 : -1);
    }
    
    if (t <= this.EPSILON || t > this.MAX_DISTANCE) {
      return { point: new Vector3(0, 0, 0), normal: new Vector3(0, 0, 1), distance: 0, isValid: false };
    }

    // === CALCULATE INTERSECTION POINT AND NORMAL ===
    // Hit point in local coordinates (sphere center at origin)
    const hitPoint = O.add(D.multiply(t));
    
    // Calculate local normal at hit point (vector from sphere center to hit point)
    let localNormal = hitPoint.normalize(); // Normal from center to hit point
    if (radius < 0) {
      localNormal = localNormal.multiply(-1); // Flip for concave surfaces
    }

    // Check circular aperture (semidia) using radial distance from origin
    const radiusSquared = hitPoint.y * hitPoint.y + hitPoint.z * hitPoint.z;
    const aperture = surface.semidia || 10;
    const apertureSquared = aperture * aperture;
    
    // Fix 3: For sphere, y²+z² should be smaller than semidia² (avoid sqrt)
    if (radiusSquared > apertureSquared + 1e-12) {
      return { point: new Vector3(0, 0, 0), normal: new Vector3(0, 0, 1), distance: 0, isValid: false };
    }

    return {
      point: hitPoint,
      normal: localNormal,
      distance: t,
      isValid: true
    };
  }

  /**
   * Intersect ray with planar surface (in local coordinates)
   * Handles both circular and rectangular apertures
   */
  private static intersectPlane(ray: Ray, surface: OpticalSurface): RayIntersection {
    // Plane is at X = 0 with normal [-1, 0, 0] (facing negative X)
    const localNormal = new Vector3(-1, 0, 0);
    
    // Check if ray is moving toward the surface
    const dotProduct = ray.direction.dot(localNormal);
    
    if (dotProduct >= 0) {
      this.logSurfaceWarning(
        surface,
        `Ray moving away from or parallel to plane surface (Ray·Normal = ${dotProduct.toFixed(6)})`,
        'ray_anomaly',
        'warning'
      );
      return { point: new Vector3(0, 0, 0), normal: localNormal, distance: 0, isValid: false };
    }
    
    // Calculate intersection: solve for t where ray.position.x + t * ray.direction.x = 0
    if (Math.abs(ray.direction.x) < this.EPSILON) {
      this.logSurfaceWarning(
        surface,
        `Ray parallel to plane surface (direction.x = ${ray.direction.x})`,
        'geometry',
        'warning'
      );
      return { point: new Vector3(0, 0, 0), normal: localNormal, distance: 0, isValid: false };
    }
    
    const t = -ray.position.x / ray.direction.x;
    
    if (t <= this.EPSILON) {
      return { point: new Vector3(0, 0, 0), normal: localNormal, distance: 0, isValid: false };
    }
    
    // Calculate intersection point in YZ plane
    const hitPoint = ray.position.add(ray.direction.multiply(t));
    
    // Check aperture bounds based on surface type
    const withinAperture = this.checkPlaneAperture(hitPoint, surface);
    if (!withinAperture) {
      this.logSurfaceWarning(
        surface,
        `Ray hit outside aperture bounds at (${hitPoint.y.toFixed(3)}, ${hitPoint.z.toFixed(3)})`,
        'aperture',
        'info'
      );
      return { point: new Vector3(0, 0, 0), normal: localNormal, distance: 0, isValid: false };
    }
    
    return {
      point: hitPoint,
      normal: localNormal,
      distance: t,
      isValid: true
    };
  }

  /**
   * Check if hit point is within planar surface aperture
   * Handles both circular (semidia) and rectangular (width/height) apertures
   */
  private static checkPlaneAperture(hitPoint: Vector3, surface: OpticalSurface): boolean {
    const y = hitPoint.y;
    const z = hitPoint.z;
    
    // Check for rectangular aperture (width/height specified)
    if (surface.width !== undefined && surface.height !== undefined) {
      const halfWidth = surface.width / 2;
      const halfHeight = surface.height / 2;
      // Fix 1: For plano rectangle, magnitude of YZ should be smaller than half of height in Z, half of width in Y
      return Math.abs(y) <= halfWidth && Math.abs(z) <= halfHeight;
    }
    
    // Check for circular aperture (semidia specified)
    if (surface.semidia !== undefined) {
      const radiusSquared = y * y + z * z;
      const semidiaSquared = surface.semidia * surface.semidia;
      // Fix 2: For plano sphere, YZ intersects should be smaller than semidia² (avoid sqrt)
      return radiusSquared <= semidiaSquared;
    }
    
    // Default circular aperture
    const defaultRadius = 10;
    const radiusSquared = y * y + z * z;
    const defaultRadiusSquared = defaultRadius * defaultRadius;
    return radiusSquared <= defaultRadiusSquared;
  }

  /**
   * Intersect ray with cylindrical surface (in local coordinates)
   * Following EUREKA interact_cylinder methodology exactly
   * 
   * CYLINDRICAL GEOMETRY:
   * - Cylinder axis along X direction, centered at origin
   * - Height h extends ±h/2 along Z-axis  
   * - Width w extends ±w/2 along Y-axis (normalized by radius)
   * - Radius r defines circular cross-section in YZ plane
   * 
   * INTERSECTION STRATEGY (EUREKA Method):
   * 1. Backstabbing check: ray.direction · (-1,0,0) >= 0 rejects
   * 2. Solve quadratic for YZ plane cylinder intersection
   * 3. Choose correct root based on radius sign
   * 4. Validate Y coordinate within width limits
   * 5. Validate Z coordinate within height limits
   */
  private static intersectCylinder(ray: Ray, surface: OpticalSurface): RayIntersection {
    const radius = Math.abs(surface.radius || 10);
    const height = surface.height || 20;
    const width = surface.width || 20;
    
    const O = ray.position;
    const D = ray.direction.normalize();

    // === EUREKA STEP 1: Backstabbing check ===
    if (D.dot(new Vector3(-1, 0, 0)) >= 0) {
      return { point: new Vector3(0, 0, 0), normal: new Vector3(0, 0, 1), distance: 0, isValid: false };
    }

    // === EUREKA STEP 2: XY plane circle intersection ===
    const a = D.x * D.x + D.y * D.y;
    const b = 2.0 * (O.x * D.x + O.y * D.y);
    const c = O.x * O.x + O.y * O.y - radius * radius;
    
    if (Math.abs(a) < this.EPSILON) {
      return { point: new Vector3(0, 0, 0), normal: new Vector3(0, 0, 1), distance: 0, isValid: false };
    }
    
    const discriminant = b * b - 4.0 * a * c;
    if (discriminant < 0) {
      return { point: new Vector3(0, 0, 0), normal: new Vector3(0, 0, 1), distance: 0, isValid: false };
    }

    // === EUREKA STEP 3: Choose intersection based on radius sign ===
    const sqrt_discriminant = Math.sqrt(discriminant);
    const t1 = (-b - sqrt_discriminant) / (2.0 * a);
    const t2 = (-b + sqrt_discriminant) / (2.0 * a);
    const t_selected = (surface.radius || 0) > 0 ? t1 : t2;
    
    if (t_selected <= this.EPSILON) {
      return { point: new Vector3(0, 0, 0), normal: new Vector3(0, 0, 1), distance: 0, isValid: false };
    }
    
    const intersection3D = O.add(D.multiply(t_selected));

    // === EUREKA STEP 4: Width validation ===
    if (Math.abs(intersection3D.y) > width / 2) {
      return { point: new Vector3(0, 0, 0), normal: new Vector3(0, 0, 1), distance: 0, isValid: false };
    }

    // === EUREKA STEP 5: Height validation ===
    if (Math.abs(intersection3D.z) > height / 2) {
      return { point: new Vector3(0, 0, 0), normal: new Vector3(0, 0, 1), distance: 0, isValid: false };
    }

    // === EUREKA STEP 6: Calculate surface normal ===
    const normalVector = new Vector3(intersection3D.x, intersection3D.y, 0);
    let localNormal = normalVector.normalize();
    
    // For concave cylinder (negative radius), flip normal inward
    if ((surface.radius || 0) < 0) {
      localNormal = localNormal.multiply(-1);
    }

    // Ensure normal points toward the incoming ray for proper refraction
    const dotProduct = localNormal.dot(ray.direction);
    if (dotProduct > 0) {
      localNormal = localNormal.multiply(-1);
    }
    
    return {
      point: intersection3D,
      normal: localNormal,
      distance: t_selected,
      isValid: true
    };
  }

  /**
   * Check if intersection point is within surface aperture
   * Handles different surface types correctly
   */
  private static isWithinAperture(point: Vector3, surface: OpticalSurface): boolean {
    // For planar surfaces, use the specific aperture checking logic
    if (surface.shape === 'plano' || surface.shape === 'flat') {
      return this.checkPlaneAperture(point, surface);
    }
    
    // For cylindrical surfaces, use rectangular bounds checking (height/width)
    if (surface.shape === 'cylindrical') {
      const halfHeight = (surface.height || 20) / 2;
      const halfWidth = (surface.width || 20) / 2;
      return Math.abs(point.y) <= halfWidth && Math.abs(point.z) <= halfHeight;
    }
    
    // For spherical surfaces, use radial distance check
    const aperture = surface.semidia || surface.aperture || 10; // semidia is the radius
    const apertureSquared = aperture * aperture;
    
    // Check radial distance² in Y-Z plane vs semidia²
    const radiusSquared = point.y * point.y + point.z * point.z;
    return radiusSquared <= apertureSquared;
  }

  /**
   * Apply surface physics (Following EUREKA interact_vhnrs methodology)
   */
  private static applySurfacePhysics(
    ray: Ray, 
    intersection: RayIntersection, 
    surface: OpticalSurface
  ): RayTraceResult {
    const mode = surface.mode || 'refraction';
    
    // Handle different surface modes from EUREKA
    switch (mode) {
      case 'refraction':
        const transmitted = this.calculateRefraction(ray, intersection, surface);
        return {
          ray,
          intersection,
          transmitted: transmitted || undefined,
          isBlocked: !transmitted
        };
      
      case 'reflection':
        const reflected = this.calculateReflection(ray, intersection);
        return {
          ray,
          intersection,
          reflected,
          isBlocked: false
        };
      
      case 'partial':
        // Implement partial reflection/transmission with transmission coefficient
        const transmissionCoeff = surface.transmission ?? 0.5; // Default 50/50 split
        const reflectionCoeff = 1.0 - transmissionCoeff;
        
        // Calculate both reflected and transmitted rays
        const partialReflected = this.calculateReflection(ray, intersection);
        const partialTransmitted = this.calculateRefraction(ray, intersection, surface);
        
        // Return both rays for potential branching (visualization will choose one)
        return {
          ray,
          intersection,
          reflected: partialReflected,
          transmitted: partialTransmitted || undefined,
          transmissionCoeff,
          reflectionCoeff,
          isBlocked: !partialTransmitted && !partialReflected
        };
      
      case 'absorption':
        return {
          ray,
          intersection,
          isBlocked: true // Ray is absorbed
        };
      
      case 'aperture':
        // Ray passes through without deflection
        return {
          ray,
          intersection,
          transmitted: new Ray(
            intersection.point,
            ray.direction,
            ray.wavelength,
            ray.lightId,
            ray.intensity
          ),
          isBlocked: false
        };
      
      case 'inactive':
      default:
        return {
          ray,
          intersection,
          isBlocked: true
        };
    }
  }

  /**
   * Calculate reflected ray using law of reflection
   * Uses local normal at the exact intersection point
   * Following EUREKA reflect methodology: R = I - 2(I·N)N
   */
  private static calculateReflection(ray: Ray, intersection: RayIntersection): Ray {
    const incident = ray.direction.normalize();
    const localNormal = intersection.normal.normalize(); // This is the local normal at hit point
    
    // Law of reflection: reflected = incident - 2 * (incident · normal) * normal
    // The angle of incidence equals angle of reflection
    const dotProduct = incident.dot(localNormal);
    const reflected = incident.subtract(localNormal.multiply(2 * dotProduct));
    
    return new Ray(
      intersection.point,
      reflected.normalize(),
      ray.wavelength,
      ray.lightId,
      ray.intensity
    );
  }

  /**
   * Calculate refracted ray using Snell's law with surface n1/n2 properties
   * Uses local normal at the exact intersection point
   * Following EUREKA interact_vhnrs methodology
   */
  private static calculateRefraction(
    ray: Ray, 
    intersection: RayIntersection, 
    surface: OpticalSurface
  ): Ray | null {
    // Get refractive indices from surface properties
    const n1 = surface.n1 || 1.0; // Incident medium
    const n2 = surface.n2 || 1.0; // Transmitted medium
    
    const incident = ray.direction.normalize();
    let localNormal = intersection.normal.normalize(); // Local normal at hit point
    
    // Snell's law: n1 * sin(θ1) = n2 * sin(θ2)
    const snellRatio = n1 / n2;
    
    // Calculate cosine of incident angle (dot product with normal)
    let cosIncident = -localNormal.dot(incident);
    
    // If cosIncident < 0, ray is hitting from back side - flip normal
    if (cosIncident < 0) {
      localNormal = localNormal.multiply(-1);
      cosIncident = -localNormal.dot(incident);
    }
    
    // Calculate incident angle
    
    // Check for total internal reflection
    const discriminant = 1 - snellRatio * snellRatio * (1 - cosIncident * cosIncident);
    if (discriminant < 0) {
      RayTracer.log('intersection', `  Total internal reflection (discriminant < 0)`);
      // Fall back to reflection
      return this.calculateReflection(ray, { ...intersection, normal: localNormal });
    }
    
    // Calculate cosine of refracted angle
    const cosRefracted = Math.sqrt(discriminant);
    
    // Calculate refracted direction using vector form of Snell's law
    // T = (n1/n2) * I + [(n1/n2) * cos(θ1) - cos(θ2)] * N
    const refracted = incident.multiply(snellRatio)
      .add(localNormal.multiply(snellRatio * cosIncident - cosRefracted));
    
    // console.log(`🔍 Refraction debug: n1=${n1}, n2=${n2}, snellRatio=${snellRatio.toFixed(6)}`);
    // console.log(`🔍 Refracted:(${refracted.x.toFixed(6)}, ${refracted.y.toFixed(6)}, ${refracted.z.toFixed(6)})`);
    
    return new Ray(
      intersection.point,
      refracted.normalize(),
      ray.wavelength,
      ray.lightId,
      ray.intensity
    );
  }
}
