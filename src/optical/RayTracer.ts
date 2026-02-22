/**
 * Classical Ray Tracing Engine (1960s methodology)
 * Following the transform-to-local, calculate, transform-back approach
 * used in modern optical design software like Zemax and Code V
 */

import { Vector3 } from '../math/Matrix4';
import { Ray } from './LightSource';
import type { OpticalSurface } from './surfaces';
import { RayIntersectionCollector } from '../components/RayIntersectionCollector';
import { MaterialParser } from './materials/GlassCatalog';
import { RayPathCollection } from './RayPathCollection';

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
    intersection: true, // ✅ ENABLED - Shows wavelength-dependent refractive indices!
  };
  
  /**
   * ROBUST LID MATCHING: Eliminates floating point precision issues
   * Always uses tolerance-based matching for maximum reliability
   * Tolerance of 0.05 handles single decimal precision with margin
   */
  private static readonly LID_TOLERANCE = 0.05;
  
  static lidEquals(lid1: number, lid2: number): boolean {
    // Always use tolerance-based comparison for foolproof matching
    // Handles both integer and decimal LIDs uniformly
    return Math.abs(lid1 - lid2) < this.LID_TOLERANCE;
  }
  
  static findLightByLid(lightSources: any[], targetLid: number): any | null {
    return lightSources.find(source => this.lidEquals(source.lid, targetLid)) || null;
  }
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
  
  // Surface sequence for diffuse scattering calculations
  private static surfaceSequence: OpticalSurface[] = [];
  
  // Ray accountability: track all created rays for efficient retrieval
  private static rayRegistry: Map<number, Ray[]> = new Map(); // lightId -> branched rays
  private static activeOpticalSystem: any = null; // Reference to current optical system

  /**
   * Set the surface sequence for diffuse scattering calculations
   */
  static setSurfaceSequence(surfaces: OpticalSurface[]): void {
    this.surfaceSequence = surfaces;
  }
  
  /**
   * Initialize ray accountability for a tracing session
   */
  static initializeRayAccountability(opticalSystem: any): void {
    this.activeOpticalSystem = opticalSystem;
    this.rayRegistry.clear();
  }
  
  /**
   * Register a branched ray with its parent light source for accountability
   */
  static registerBranchedRay(ray: Ray): void {
    if (!this.activeOpticalSystem) return;
    
    // CORRECTED LID ANALYSIS: [generation*1000 + surface_number + 0.ancestral_light_id]
    const lightId = ray.lightId;
    
    // Extract generation and ancestral LID
    const generation = Math.floor(lightId / 1000);
    const remainder = lightId - (generation * 1000);
    const surfaceNumber = Math.floor(remainder);
    const decimalPart = remainder - surfaceNumber;
    const ancestralLID = Math.round(decimalPart * 10);
    
    let originalLightId: number;
    if (generation === 0) {
      // Original ray: use lightId directly
      originalLightId = ray.lightId;
    } else {
      // Shadow ray: ancestral LID is the original
      originalLightId = ancestralLID;
    }
    
    // Find the light source that owns this ray
    const parentLight = this.findLightByLid(this.activeOpticalSystem.lightSources || [], originalLightId);
    
    if (parentLight && typeof parentLight.addBranchedRay === 'function') {
      parentLight.addBranchedRay(ray);
    } else {
      // Enhanced debugging for LID relationships
      const lidInfo = this.analyzeLIDRelationships(ray.lightId);
      console.warn(`Failed to find parent light for ray ${ray.lightId}`);
      console.warn(`  Generation: ${lidInfo.generation}, Ancestral: ${lidInfo.ancestralLID}, Immediate Parent: ${lidInfo.immediateParentLID || 'None'}, Surface: ${lidInfo.surfaceNumber || 'Unknown'}`);
    }
    
    // Also add to local registry for quick lookup
    const baseId = Math.floor(ray.lightId);
    if (!this.rayRegistry.has(baseId)) {
      this.rayRegistry.set(baseId, []);
    }
    this.rayRegistry.get(baseId)!.push(ray);
  }
  
  /**
   * Analyze LID relationships using corrected encoding (for debugging and accountability)
   */
  static analyzeLIDRelationships(rayLightId: number): {
    generation: number;
    ancestralLID: number;
    immediateParentLID: number | null;
    surfaceNumber?: number;
  } {
    // CORRECTED LID ANALYSIS: [generation*1000 + surface_number + 0.ancestral_light_id]
    const generation = Math.floor(rayLightId / 1000);
    const remainder = rayLightId - (generation * 1000);
    const surfaceNumber = Math.floor(remainder);
    const decimalPart = remainder - surfaceNumber;
    const ancestralLID = Math.round(decimalPart * 10);
    
    if (generation === 0) {
      // Original ray
      return {
        generation: 0,
        ancestralLID: rayLightId,
        immediateParentLID: null
      };
    } else {
      // Shadow ray: analyze relationships
      let immediateParentLID: number | null = null;
      
      if (generation === 1) {
        // Gen 1: parent is the ancestral light
        immediateParentLID = ancestralLID;
      } else {
        // Gen 2+: immediate parent cannot be determined from LID alone
        immediateParentLID = null;
      }
      
      return {
        generation,
        ancestralLID,
        immediateParentLID,
        surfaceNumber
      };
    }
  }
  
  /**
   * Get ray accountability statistics
   */
  static getRayAccountability(): { totalBranchedRays: number; branchingEvents: number } {
    const totalBranchedRays = Array.from(this.rayRegistry.values())
      .reduce((total, rays) => total + rays.length, 0);
    const branchingEvents = this.rayRegistry.size;
    
    return { totalBranchedRays, branchingEvents };
  }
  
  /**
   * Clear ray accountability (call between tracing sessions)
   */
  static clearRayAccountability(): void {
    this.rayRegistry.clear();
    this.activeOpticalSystem = null;
  }

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
    //console.log(`[TEST] Ray hitting surface ${surface.id} at local coordinates: (${intersection.point.x.toFixed(3)}, ${intersection.point.y.toFixed(3)}, ${intersection.point.z.toFixed(3)})`);
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
   * Returns structured ray path collection instead of flattened array
   */
  static traceRaySequential(ray: Ray, surfaces: OpticalSurface[]): RayPathCollection {
    // Clear warnings at the start of each ray trace
    this.clearWarnings();
    
    // Set surface sequence for diffuse scattering calculations
    this.setSurfaceSequence(surfaces);
    
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
    
    // Create structured ray path collection
    const rayPathCollection = new RayPathCollection();
    
    // Each path has ONE consistent lightId throughout
    // Classify by generation: gen 0 = primary (from light source), gen 1+ = shadow (branched)
    for (let pathIndex = 0; pathIndex < allRayPaths.length; pathIndex++) {
      const path = allRayPaths[pathIndex];
      if (path.length > 0) {
        // Extract consistent light ID from the path (should be same for all rays in path)
        const lightId = path[0].lightId;
        
        // Classify based on lightId generation
        const generation = Math.floor(lightId / 1000);
        const pathType = generation === 0 ? 'primary' : 'shadow';
        
        rayPathCollection.addPath(lightId, path, pathType);
      }
    }
    
    // Log structured path analysis instead of flattened chaos
    rayPathCollection.logPathAnalysis();
    
    return rayPathCollection;
  }



  /**
   * Log all ray segment lengths with proper path separation
   * Treats all rays equally while maintaining path integrity
   * LEGACY METHOD: Now replaced by RayPathCollection.logPathAnalysis()
   * @deprecated Use RayPathCollection.logPathAnalysis() instead
   */
  // @ts-ignore - Legacy method kept for compatibility
  private static logRaySegmentLengths(rays: Ray[]): void {
    if (rays.length === 0) {
      return;
    }

    console.log('\n📏 RAY PATH ANALYSIS BY LIGHT ID:');
    console.log('=' .repeat(60));

    // Group rays by their actual light ID (treats all rays equally)
    const raysByLight = new Map<number, Ray[]>();
    rays.forEach(ray => {
      const lightId = ray.lightId;
      if (!raysByLight.has(lightId)) {
        raysByLight.set(lightId, []);
      }
      raysByLight.get(lightId)!.push(ray);
    });

    // Process each light path independently (all rays treated the same way)
    const sortedLightIds = Array.from(raysByLight.keys()).sort((a, b) => a - b);
    
    sortedLightIds.forEach(lightId => {
      this.analyzeSingleRayPath(raysByLight.get(lightId)!);
    });

    console.log('\n' + '='.repeat(60));
    console.log(`📈 Summary: Analyzed ${raysByLight.size} independent light path(s) with ${rays.length} total ray points`);
  }

  /**
   * Analyze a single ray path with proper chronological ordering
   * Each ray is processed the same way regardless of origin
   */
  private static analyzeSingleRayPath(lightRays: Ray[]): void {
    // Sort rays chronologically (same logic for all rays)
    const sortedRays = this.sortRaysChronologically(lightRays);
    
    // Analyze path segments with proper validation
    const pathAnalysis = this.analyzePathSegments(sortedRays);
    
    // Display path segments (same format for all rays)
    this.displayPathSegments(sortedRays, pathAnalysis);
    
    // Display summary statistics (same calculations for all rays)
    this.displayPathSummary(pathAnalysis, sortedRays.length);
  }

  /**
   * Sort rays chronologically - same logic applied to all rays
   */
  private static sortRaysChronologically(rays: Ray[]): Ray[] {
    return rays.sort((a, b) => {
      // Primary: surface where ray starts
      const startsAtDiff = (a.startsAt || 0) - (b.startsAt || 0);
      if (startsAtDiff !== 0) return startsAtDiff;
      
      // Secondary: accumulated path length
      return (a.pathLength || 0) - (b.pathLength || 0);
    });
  }

  /**
   * Analyze path segments - consistent logic for all ray paths
   */
  private static analyzePathSegments(sortedRays: Ray[]): { 
    totalLength: number; 
    validSegments: number; 
    segments: Array<{ length: number; isValid: boolean }> 
  } {
    let totalLength = 0;
    let validSegments = 0;
    const segments: Array<{ length: number; isValid: boolean }> = [];

    for (let i = 0; i < sortedRays.length - 1; i++) {
      const currentRay = sortedRays[i];
      const nextRay = sortedRays[i + 1];
      const segmentLength = currentRay.position.distanceTo(nextRay.position);
      const isValid = segmentLength > 1e-6;
      
      segments.push({ length: segmentLength, isValid });
      
      if (isValid) {
        validSegments++;
        totalLength += segmentLength;
      }
    }

    return { totalLength, validSegments, segments };
  }

  /**
   * Display path segments - same format for all rays
   */
  private static displayPathSegments(sortedRays: Ray[], pathAnalysis: { segments: Array<{ length: number; isValid: boolean }> }): void {
    for (let i = 0; i < sortedRays.length; i++) {
      const ray = sortedRays[i];
      const isLastRay = i === sortedRays.length - 1;
      
      if (!isLastRay) {
        const nextRay = sortedRays[i + 1];
        const segment = pathAnalysis.segments[i];
        
        if (segment.isValid) {
          console.log(`  Path ${i + 1}→${i + 2}: ${segment.length.toFixed(3)} units [${ray.position.x.toFixed(2)},${ray.position.y.toFixed(2)},${ray.position.z.toFixed(2)}] → [${nextRay.position.x.toFixed(2)},${nextRay.position.y.toFixed(2)},${nextRay.position.z.toFixed(2)}]`);
        } else {
          console.log(`  Path ${i + 1}→${i + 2}: ${segment.length.toFixed(6)} units (too small) [${ray.position.x.toFixed(2)},${ray.position.y.toFixed(2)},${ray.position.z.toFixed(2)}] → [${nextRay.position.x.toFixed(2)},${nextRay.position.y.toFixed(2)},${nextRay.position.z.toFixed(2)}]`);
        }
      } else {
        console.log(`  Final point: [${ray.position.x.toFixed(2)},${ray.position.y.toFixed(2)},${ray.position.z.toFixed(2)}] (Path length: ${ray.pathLength?.toFixed(3) || 'N/A'})`);
      }
    }
  }

  /**
   * Display path summary - same statistics for all rays
   */
  private static displayPathSummary(pathAnalysis: { totalLength: number; validSegments: number; segments: Array<{ length: number; isValid: boolean }> }, totalPoints: number): void {
    console.log(`  Total optical path length: ${pathAnalysis.totalLength.toFixed(3)} units`);
    console.log(`  Valid segments: ${pathAnalysis.validSegments} (${totalPoints - 1} expected)`);
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
    // CRITICAL: Original rays start with initial ray position, branched rays start at intersection
    // Branched rays must also have their starting position in the path for proper extension
    const rayPath: Ray[] = startSurfaceIndex === 0 ? [ray.clone()] : [ray.clone()];
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
            currentRay.intensity,
            currentRay.startsAt // Preserve original startsAt
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
        // Check if this intersection point is significantly different from the last ray position
        const lastRay = rayPath.length > 0 ? rayPath[rayPath.length - 1] : null;
        const distanceFromLast = lastRay ? 
          lastRay.position.distanceTo(result.intersection.point) : Infinity;
        
        // Only add intersection ray if it represents actual movement (> EPSILON)
        if (distanceFromLast > this.EPSILON) {
          const intersectionRay = new Ray(
            result.intersection.point, 
            currentRay.direction, // Direction approaching this intersection
            currentRay.wavelength, 
            currentRay.lightId, 
            currentRay.intensity,
            currentRay.startsAt // Preserve original startsAt
          );
          rayPath.push(intersectionRay);
          if (!isFirstTrace) {
            this.log('ray', `Added intersection point to path:`, result.intersection.point);
          }
        } else if (!isFirstTrace) {
          this.log('ray', `Skipped duplicate intersection point (distance: ${distanceFromLast.toFixed(6)}):`, result.intersection.point);
        }
      }

      // *** CRITICAL: Handle partial surface branching ***
      if (surface.mode === 'partial' && result.transmitted && result.reflected) {
        const transmissionCoeff = result.transmissionCoeff ?? 0.5;
        
        if (!isFirstTrace) {
          this.log('ray', `Partial surface: creating reflected AND transmitted rays (transmission coeff: ${transmissionCoeff})`);
        }
        
        // CORRECTED LID ENCODING: [generation*1000 + surface_number + 0.ancestral_light_id]
        const originalLightId = currentRay.lightId;
        const surfaceOrder = surface.numericalId || i;
        
        // Extract current generation and calculate next generation
        const currentGeneration = Math.floor(originalLightId / 1000);
        const nextGeneration = currentGeneration + 1;
        
        // Extract ancestral LID from current ray
        let ancestralLID: number;
        if (currentGeneration === 0) {
          // Original ray: itself is the ancestral
          ancestralLID = originalLightId;
        } else {
          // Shadow ray: extract ancestral from decimal part
          const remainder = originalLightId - (currentGeneration * 1000);
          const decimalPart = remainder - Math.floor(remainder);
          ancestralLID = Math.round(decimalPart * 10);
        }
        
        // Generate shadow LID: generation*1000 + surface + 0.ancestral
        const shadowLightId = nextGeneration * 1000 + surfaceOrder + (ancestralLID / 10);
        
        // Always show LID SPLIT for partial surfaces, regardless of first trace status
        console.log(`🔍 LID SPLIT [${surface.id}]: ${originalLightId} → ${originalLightId} (${transmissionCoeff > 0.5 ? 'transmitted' : 'reflected'}) & ${shadowLightId} (${transmissionCoeff > 0.5 ? 'reflected' : 'transmitted'})`);        
        
        // Determine which ray keeps original LID and which gets shadow LID
        const keepOriginalLID = transmissionCoeff > 0.5 ? 'transmitted' : 'reflected';
        
        // CORRECTED LOGIC: One ray continues original path, other starts fresh
        let transmittedRayForTracing: Ray;
        let reflectedRayForTracing: Ray;
        
        if (keepOriginalLID === 'transmitted') {
          // Transmitted ray continues with original LID and path
          transmittedRayForTracing = new Ray(
            result.transmitted!.position,
            result.transmitted!.direction,
            result.transmitted!.wavelength,
            originalLightId,  // Keep original LID
            result.transmitted!.intensity,
            result.transmitted!.startsAt
          );
          transmittedRayForTracing.pathLength = currentRay.pathLength; // Continue path length
          
          // Reflected ray gets fresh start with shadow LID
          reflectedRayForTracing = this.createFreshBranchedRay(
            result.reflected!, originalLightId, shadowLightId, false, i + 1  // BUG FIX: i + 1
          );
        } else {
          // Reflected ray continues with original LID and path
          reflectedRayForTracing = new Ray(
            result.reflected!.position,
            result.reflected!.direction,
            result.reflected!.wavelength,
            originalLightId,  // Keep original LID
            result.reflected!.intensity,
            result.reflected!.startsAt
          );
          reflectedRayForTracing.pathLength = currentRay.pathLength; // Continue path length
          
          // Transmitted ray gets fresh start with shadow LID
          transmittedRayForTracing = this.createFreshBranchedRay(
            result.transmitted!, originalLightId, shadowLightId, false, i + 1  // BUG FIX: i + 1
          );
        }        // Continue tracing transmitted ray through remaining surfaces
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
        
        // CORRECTED LOGIC: Each recursive call returns COMPLETE paths already
        // The continuing ray (original LID) needs its history prepended
        // New branched rays (shadow LID) start fresh from branching point
        const allPaths: Ray[][] = [];
        
        // Process transmitted paths
        for (const transmittedPath of transmittedPaths) {
          if (transmittedPath.length === 0) continue;
          
          const pathLID = transmittedPath[0].lightId;
          
          if (this.lidEquals(pathLID, originalLightId)) {
            // This path continues with original LID - prepend history up to split point
            // Skip first point of transmittedPath to avoid duplicate (intersection already in rayPath)
            allPaths.push([...rayPath, ...transmittedPath.slice(1)]);
          } else {
            // This path has a NEW shadow LID - already complete from branching point
            allPaths.push(transmittedPath);
          }
        }
        
        // Process reflected paths
        for (const reflectedPath of reflectedPaths) {
          if (reflectedPath.length === 0) continue;
          
          const pathLID = reflectedPath[0].lightId;
          
          if (this.lidEquals(pathLID, originalLightId)) {
            // This path continues with original LID - prepend history up to split point
            // Skip first point of reflectedPath to avoid duplicate (intersection already in rayPath)
            allPaths.push([...rayPath, ...reflectedPath.slice(1)]);
          } else {
            // This path has a NEW shadow LID - already complete from branching point
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
          if (Math.abs(currentRay.lightId - Math.round(currentRay.lightId)) > 1e-10) {
            // Light continues through surface
          }
        }
        
      } else if (result.reflected) {
        currentRay = result.reflected;
        lastSuccessfulRayDirection = result.reflected.direction; // Update last successful outgoing direction
        if (!isFirstTrace) {
          this.log('ray', `Ray reflected, new direction:`, currentRay.direction);
          this.log('ray', `Added reflected ray segment to path`);
          // Debug: Show light ID continuation  
          if (Math.abs(currentRay.lightId - Math.round(currentRay.lightId)) > 1e-10) {
            // Light continues through surface
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
   * Create a fresh branched ray with appropriate LID assignment
   * BEAM SPLITTER PHYSICS: New rays start with empty path, only inheriting intersection position and direction
   */
  private static createFreshBranchedRay(
    physicsRay: Ray,
    originalLightId: number,
    shadowLightId: number,
    keepOriginalLID: boolean,
    startSurfaceIndex: number
  ): Ray {
    const branchedRay = new Ray(
      physicsRay.position,     // Only inherit intersection position
      physicsRay.direction,    // Only inherit new direction
      physicsRay.wavelength,
      keepOriginalLID ? originalLightId : shadowLightId,
      physicsRay.intensity,
      startSurfaceIndex
    );
    // Fresh ray: NO path length inheritance - starts at 0
    branchedRay.pathLength = 0;
    branchedRay.stopsAt = -1; // Ensure ray continues independently
    
    // Register branched ray for accountability
    this.registerBranchedRay(branchedRay);
    
    return branchedRay;
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
        return; // Exit immediately, don't process any extension logic
        
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
                lastRay.intensity,
                lastRay.startsAt // Preserve original startsAt
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
                lastRay.intensity,
                lastRay.startsAt // Preserve original startsAt
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
              lastRay.intensity,
              lastRay.startsAt // Preserve original startsAt
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
            lastRay.intensity,
            lastRay.startsAt // Preserve original startsAt
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
    
    const localRay = new Ray(localOrigin, localDirection, ray.wavelength, ray.lightId, ray.intensity, ray.startsAt);
    localRay.stopsAt = ray.stopsAt; // Preserve stopsAt as well
    return localRay;
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
    
    const globalRay = new Ray(worldOrigin, worldDirection, ray.wavelength, ray.lightId, ray.intensity, ray.startsAt);
    globalRay.stopsAt = ray.stopsAt; // Preserve stopsAt as well
    return globalRay;
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
      // Ray moving away from or parallel to surface - no intersection
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
            ray.intensity,
            ray.startsAt // Preserve original startsAt
          ),
          isBlocked: false
        };
      
      case 'diffuse':
        // Diffuse scattering: rays scatter toward next surface in sequence
        // Physics: when ray hits diffuse surface, it scatters with Gaussian distribution
        // centered around vector connecting diffuse surface to next surface center
        const diffuseRays = this.calculateDiffuseScattering(ray, intersection, surface);
        if (diffuseRays && diffuseRays.length > 0) {
          // CRITICAL: The diffuse ray is already in GLOBAL coordinates!
          // We need to transform it to LOCAL coordinates for consistency with the pipeline
          const localDiffuseRay = this.transformRayToLocal(diffuseRays[0], surface);
          
          // For single ray mode, return the local diffuse ray (will be transformed back to global)
          return {
            ray,
            intersection,
            transmitted: localDiffuseRay, // Local coordinates for pipeline consistency
            isBlocked: false
          };
        } else {
          return {
            ray,
            intersection,
            isBlocked: true // No valid diffuse rays generated
          };
        }
      
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
      ray.intensity,
      ray.startsAt // Preserve original startsAt
    );
  }

  /**
   * Calculate refracted ray using Snell's law with surface n1/n2 properties
   * Uses local normal at the exact intersection point
   * Following EUREKA interact_vhnrs methodology
   * Supports both numeric n1/n2 and glass catalog materials
   */
  private static calculateRefraction(
    ray: Ray, 
    intersection: RayIntersection, 
    surface: OpticalSurface
  ): Ray | null {
    // Get refractive indices using pre-computed wavelength tables for O(1) performance
    let n1: number, n2: number;
    
    // First try to use pre-computed wavelength tables (optimal performance)
    if (surface.n1_wavelength_table && surface.n1_wavelength_table.has(ray.wavelength)) {
      n1 = surface.n1_wavelength_table.get(ray.wavelength)!;
      n2 = surface.n2_wavelength_table?.get(ray.wavelength) || 1.0;
      
      // RayTracer.log('intersection', `  ⚡ Using pre-computed: n1=${n1.toFixed(4)}, n2=${n2.toFixed(4)} @ ${ray.wavelength}nm`);
    } else {
      // Fallback to real-time material parsing (slower but always works)
      try {
        n1 = MaterialParser.parseN1(surface, ray.wavelength);
        n2 = MaterialParser.parseN2(surface, ray.wavelength);
        
        // RayTracer.log('intersection', `  🔍 Real-time lookup: n1=${n1.toFixed(4)}, n2=${n2.toFixed(4)} @ ${ray.wavelength}nm`);
      } catch (error) {
        // Final fallback to legacy behavior for compatibility
        n1 = surface.n1 || 1.0; // Incident medium
        n2 = surface.n2 || 1.0; // Transmitted medium
        
        // Log material parsing issues for user feedback
        if ((surface as any).n1_material || (surface as any).n2_material) {
          // const errorMessage = error instanceof Error ? error.message : String(error);
          // console.warn(`⚠️  Material parsing error: ${errorMessage}. Using fallback n1=${n1}, n2=${n2}`);
        }
        
        // RayTracer.log('intersection', `  📋 Legacy fallback: n1=${n1.toFixed(4)}, n2=${n2.toFixed(4)}`);
      }
    }
    
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
    
    // Enhanced logging for wavelength-dependent ray tracing
    // RayTracer.log('intersection', `  🌈 Refraction [${surface.id || 'unknown'}(sid:${surface.numericalId})]: λ=${ray.wavelength}nm, n1=${n1.toFixed(6)}, n2=${n2.toFixed(6)}, ratio=${snellRatio.toFixed(6)}`);
    
    return new Ray(
      intersection.point,
      refracted.normalize(),
      ray.wavelength,
      ray.lightId,
      ray.intensity,
      ray.startsAt // Preserve original startsAt
    );
  }

  /**
   * Calculate diffuse scattering towards the next surface
   * Handles surface orientation to determine proper scattering direction
   * Diffuse surfaces scatter light regardless of n1/n2 values
   * ALL CALCULATIONS IN GLOBAL COORDINATES
   */
  private static calculateDiffuseScattering(
    ray: Ray, 
    intersection: RayIntersection, 
    surface: OpticalSurface
  ): Ray[] {
    // Find the next surface in the sequence
    const nextSurface = this.findNextSurface(surface);
    if (!nextSurface) {
      this.log('surface', `No next surface found for diffuse surface ${surface.id} - ray will be absorbed`);
      return [];
    }

    // NOTE: intersection.point is LOCAL coordinates, but we need GLOBAL
    // Transform the local intersection point to global coordinates
    const globalIntersectionPoint = this.transformPointToGlobal(intersection.point, surface);

    // 1. Calculate vector V connecting this diffuse surface to next surface center
    // BOTH POINTS NOW IN GLOBAL COORDINATES
    const diffusePoint = globalIntersectionPoint;
    const nextSurfaceCenter = nextSurface.position;
    const V = nextSurfaceCenter.subtract(diffusePoint);
    const distance = V.length();
    const VNormalized = V.normalize();
    
    // Get surface normals (both already in global coordinates)
    const normal2 = nextSurface.normal || new Vector3(-1, 0, 0);
    
    // 2. Check if rays will likely interact with next surface (for info only)
    const VDotNormal2 = VNormalized.dot(normal2);
    
    this.log('surface', `Diffuse scattering analysis for ${surface.id} → ${nextSurface.id} (GLOBAL coords):`);
    this.log('surface', `  Global intersection: [${diffusePoint.x.toFixed(3)}, ${diffusePoint.y.toFixed(3)}, ${diffusePoint.z.toFixed(3)}]`);
    this.log('surface', `  V vector: [${VNormalized.x.toFixed(3)}, ${VNormalized.y.toFixed(3)}, ${VNormalized.z.toFixed(3)}]`);
    this.log('surface', `  Normal2: [${normal2.x.toFixed(3)}, ${normal2.y.toFixed(3)}, ${normal2.z.toFixed(3)}]`);
    this.log('surface', `  V · Normal2: ${VDotNormal2.toFixed(3)} (${VDotNormal2 > 0 ? 'rays may not interact' : 'rays will likely interact'})`);
    
    // Always allow scattering toward next surface - let the next surface decide interaction
    const scatterDirection = VNormalized;
    
    // 3. Calculate angular spread based on next surface aperture - CONSERVATIVE approach
    let theta = 0;
    if (nextSurface.semidia || nextSurface.height || nextSurface.width) {
      // Take MINIMUM aperture dimension for conservative spread
      const minAperture = Math.min(
        nextSurface.semidia || Infinity,
        (nextSurface.height || Infinity) / 2,
        (nextSurface.width || Infinity) / 2
      );
      
      if (minAperture > 0 && minAperture !== Infinity && distance > 0) {
        // Base angular view from minimum aperture
        let baseTheta = Math.atan(minAperture / distance);
        
        // Check angle between V and next surface normal to further limit spread
        const VDotNormal2 = VNormalized.dot(normal2);
        const angleVtoNormal2 = Math.acos(Math.abs(VDotNormal2)); // Always positive angle
        
        this.log('surface', `  Base angular view: ${(baseTheta * 180 / Math.PI).toFixed(1)}° (min_aperture=${minAperture.toFixed(1)}, distance=${distance.toFixed(1)})`);
        this.log('surface', `  Angle between V and Normal2: ${(angleVtoNormal2 * 180 / Math.PI).toFixed(1)}°`);
        
        // Further shrink based on surface alignment - more conservative if surfaces are misaligned
        const alignmentFactor = Math.cos(angleVtoNormal2); // 1.0 for parallel, 0.0 for perpendicular
        const conservativeTheta = baseTheta * alignmentFactor;
        
        // Calculate spread per sigma: conservativeTheta contains N-sigma worth of spread
        const sigmaCount = 3; // How many sigma fit into conservativeTheta (2-sigma = 95.4% coverage)
        theta = conservativeTheta / sigmaCount; // Spread per sigma for Gaussian distribution
        
        this.log('surface', `  Alignment factor: ${alignmentFactor.toFixed(3)}`);
        this.log('surface', `  Conservative spread (${sigmaCount}-sigma coverage): ${(theta * 180 / Math.PI).toFixed(1)}° per sigma`);
        
        if (VDotNormal2 < -0.9) {
          this.log('surface', `  V and Normal2 nearly antiparallel (${VDotNormal2.toFixed(3)}) - maximum spread case with conservative limit`);
        }
      } else {
        theta = Math.PI / 24; // 7.5 degrees conservative default
        this.log('surface', `  Zero/infinite aperture - using conservative default spread: ${(theta * 180 / Math.PI).toFixed(1)}°`);
      }
    } else {
      // Conservative default angular spread for diffuse scattering
      theta = Math.PI / 24; // 7.5 degrees 
      this.log('surface', `  No aperture defined - using conservative diffuse spread: ${(theta * 180 / Math.PI).toFixed(1)}°`);
    }
    
    // 4. Conservative spread - no additional safety factor needed
    this.log('surface', `  Final conservative scattering cone: ${(theta * 180 / Math.PI).toFixed(1)}°`);
    
    // 5. Generate diffuse ray with Gaussian distribution around scatterDirection
    const diffuseDirection = this.generateGaussianDirection(scatterDirection, theta);
    
    // 6. Verify ray is physically reasonable
    const alignment = diffuseDirection.dot(scatterDirection);
    if (alignment > 0.1) { // Ray points in roughly correct direction
      const diffuseRay = new Ray(
        diffusePoint, // This is now the GLOBAL intersection point
        diffuseDirection,
        ray.wavelength,
        ray.lightId,
        ray.intensity
      );
      
      this.log('surface', `  ✅ Generated diffuse ray: [${diffuseDirection.x.toFixed(3)}, ${diffuseDirection.y.toFixed(3)}, ${diffuseDirection.z.toFixed(3)}]`);
      this.log('surface', `  Alignment: ${(Math.acos(alignment) * 180 / Math.PI).toFixed(1)}°`);
      this.log('surface', `  Ray starts at GLOBAL point: [${diffusePoint.x.toFixed(3)}, ${diffusePoint.y.toFixed(3)}, ${diffusePoint.z.toFixed(3)}]`);
      
      return [diffuseRay];
    } else {
      this.log('surface', `  ❌ Generated ray misaligned - discarding`);
      return [];
    }
  }

  /**
   * Generate a direction vector with Gaussian distribution around a center direction
   * Uses the standard approach: generate in standard coordinates, then transform
   * @param centerDirection - Center direction vector (should be normalized)
   * @param spreadAngle - Angular spread (standard deviation) in radians
   * @returns Normalized direction vector
   */
  private static generateGaussianDirection(centerDirection: Vector3, spreadAngle: number): Vector3 {
    // 1. Generate Gaussian random angles as though V is [1,0,0]
    const u1 = Math.random();
    const u2 = Math.random();
    
    // Box-Muller transform for Gaussian random numbers
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const z1 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);
    
    // Scale by spread angle (limit to reasonable values)
    const maxAngle = Math.PI / 6; // 30 degrees max deviation
    const theta = Math.max(-maxAngle, Math.min(maxAngle, z0 * spreadAngle));
    const phi = Math.max(-maxAngle, Math.min(maxAngle, z1 * spreadAngle));
    
    // 2. Create direction vector as though center is [1,0,0]
    // Small angle rotations in Y and Z from X-axis
    const standardDirection = new Vector3(
      Math.cos(theta) * Math.cos(phi),  // X component (mostly 1)
      Math.sin(theta),                  // Y component (small perturbation)
      Math.sin(phi)                     // Z component (small perturbation)
    ).normalize();
    
    // 3. Create transformation matrix that converts [1,0,0] to centerDirection
    const center = centerDirection.normalize();
    
    // Handle special case where center is already [1,0,0] or [-1,0,0]
    if (Math.abs(center.x) > 0.999) {
      if (center.x > 0) {
        // Center is already [1,0,0], no transformation needed
        return standardDirection;
      } else {
        // Center is [-1,0,0], flip X
        return new Vector3(-standardDirection.x, standardDirection.y, standardDirection.z);
      }
    }
    
    // Find orthogonal basis vectors for transformation
    let temp = new Vector3(1, 0, 0);
    if (Math.abs(center.dot(temp)) > 0.9) {
      temp = new Vector3(0, 1, 0);
    }
    
    // Create orthonormal basis: center, u, v
    const u = center.cross(temp).normalize();  // Second axis
    const v = center.cross(u).normalize();     // Third axis
    
    // 4. Transform standardDirection using the basis matrix
    // [center u v] * standardDirection
    const transformedDirection = center.multiply(standardDirection.x)
      .add(u.multiply(standardDirection.y))
      .add(v.multiply(standardDirection.z));
    
    return transformedDirection.normalize();
  }

  /**
   * Find the next surface in the optical sequence
   * Returns the surface with the next higher numerical ID
   */
  private static findNextSurface(currentSurface: OpticalSurface): OpticalSurface | null {
    if (!this.surfaceSequence || this.surfaceSequence.length === 0) {
      this.logSurfaceWarning(
        currentSurface,
        'No surface sequence available for diffuse scattering',
        'physics',
        'error'
      );
      return null;
    }
    
    const currentIndex = this.surfaceSequence.findIndex(s => s.id === currentSurface.id);
    if (currentIndex === -1) {
      this.logSurfaceWarning(
        currentSurface,
        `Current surface ${currentSurface.id} not found in sequence`,
        'physics',
        'error'
      );
      return null;
    }
    
    // Return the next surface in the sequence
    if (currentIndex + 1 < this.surfaceSequence.length) {
      return this.surfaceSequence[currentIndex + 1];
    }
    
    // No next surface available
    this.logSurfaceWarning(
      currentSurface,
      `No next surface available after ${currentSurface.id} for diffuse scattering`,
      'physics',
      'warning'
    );
    return null;
  }
}
