/**
 * Classical Ray Tracing Engine (1960s methodology)
 * Following the transform-to-local, calculate, transform-back approach
 * used in modern optical design software like Zemax and Code V
 */

import { Vector3 } from '../math/Matrix4';
import { Ray } from './LightSource';
import type { OpticalSurface } from './surfaces';

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
}

/**
 * Classical ray tracing engine implementing 1960s methodology
 */
export class RayTracer {
  // Logging categories
  static logConfig = {
    general: true,
    surface: false, // Disabled verbose surface logs
    ray: true,
    simplified: true, // For simplified ray tracing logs
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
      
      // Special case: aperture surfaces block rays that don't hit
      if (surface.mode === 'aperture') {
        if (!useSimplifiedLog) {
          this.log('surface', `Aperture surface blocks non-intersecting rays`);
        }
        return {
          ray,
          intersection: { point: new Vector3(0,0,0), normal: new Vector3(0,0,1), distance: 0, isValid: false },
          isBlocked: true
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
    const result = this.applySurfacePhysics(localRay, intersection, surface, isFirstRayOfLight);
    
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
    result.intersection.point = this.transformPointToGlobal(intersection.point, surface);
    result.intersection.normal = this.transformVectorToGlobal(intersection.normal, surface);

    return result;
  }

  /**
   * Trace a ray through multiple surfaces sequentially
   * Returns array of rays representing the complete ray path with proper segments
   */
  static traceRaySequential(ray: Ray, surfaces: OpticalSurface[]): Ray[] {
    // Clear warnings at the start of each ray trace
    this.clearWarnings();
    
    // Check if this is the first ray of this light source
    const isFirstRayOfLight = !this.firstRayProcessed.has(ray.lightId);
    if (isFirstRayOfLight) {
      this.firstRayProcessed.add(ray.lightId);
    }
    
    const rayPath: Ray[] = [ray.clone()]; // Start with initial ray
    let currentRay = ray;

    if (isFirstRayOfLight && this.logConfig.simplified) {
      this.log('simplified', `\n=== Ray Trace: Light ${ray.lightId} ===`);
    } else {
      this.log('general', `Starting ray trace with ${surfaces.length} surfaces`);
      this.log('ray', `Initial ray:`, { position: currentRay.position, direction: currentRay.direction });
    }

    for (let i = 0; i < surfaces.length; i++) {
      const surface = surfaces[i];
      if (!isFirstRayOfLight) {
        this.log('general', `Processing surface ${i}: ${surface.id}, mode: ${surface.mode}, shape: ${surface.shape}`);
      }
      
      const result = this.traceThroughSurface(currentRay, surface, isFirstRayOfLight);
      
      if (!isFirstRayOfLight) {
        this.log('surface', `Surface ${i} result:`, { 
          blocked: result.isBlocked, 
          hasTransmitted: !!result.transmitted,
          hasReflected: !!result.reflected 
        });
      }
      
      if (result.isBlocked) {
        if (!isFirstRayOfLight) {
          this.log('ray', `Ray blocked at surface ${i}`);
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
          if (!isFirstRayOfLight) {
            this.log('ray', `Added intersection point to path:`, result.intersection.point);
          }
        }
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
        if (!isFirstRayOfLight) {
          this.log('ray', `Added intersection point to path:`, result.intersection.point);
        }
      }

      // Continue with transmitted or reflected ray - these start from the ray after the surface
      if (result.transmitted) {
        currentRay = result.transmitted;
        if (!isFirstRayOfLight) {
          this.log('ray', `Ray transmitted, new direction:`, currentRay.direction);
          this.log('ray', `Added transmitted ray segment to path`);
        }
        
      } else if (result.reflected) {
        currentRay = result.reflected;
        if (!isFirstRayOfLight) {
          this.log('ray', `Ray reflected, new direction:`, currentRay.direction);
          this.log('ray', `Added reflected ray segment to path`);
        }
        
      } else {
        if (!isFirstRayOfLight) {
          this.log('ray', `No continuing ray from surface ${i}`);
        }
        break;
      }
    }

    // Add a final ray segment based on the last surface interaction
    if (rayPath.length > 0) {
      const lastRay = rayPath[rayPath.length - 1];
      
      // Check if the last surface processed was absorption (detector)
      const lastProcessedSurfaceIndex = Math.min(surfaces.length - 1, Math.floor((rayPath.length - 1) / 2));
      const lastProcessedSurface = surfaces[lastProcessedSurfaceIndex];
      
      if (lastProcessedSurface && lastProcessedSurface.mode === 'absorption') {
        if (!isFirstRayOfLight) {
          this.log('general', `Last surface is absorption (detector) - ray path terminates at intersection point`);
        }
        // For absorption surfaces, the ray path should end exactly at the intersection point
        // The last ray in rayPath already represents the intersection point, so we're done
      } else {
        // For refraction, reflection, or if ray didn't reach final surface
        // Extend the ray into free space
        const extensionLength = 50; // Extend 50 units into free space
        const finalPosition = lastRay.position.add(lastRay.direction.multiply(extensionLength));
        const finalRay = new Ray(
          finalPosition,
          lastRay.direction,
          lastRay.wavelength,
          lastRay.lightId,
          lastRay.intensity
        );
        rayPath.push(finalRay);
        if (!isFirstRayOfLight) {
          this.log('ray', `Added final ray segment extending ${extensionLength} units to:`, finalPosition);
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

    if (!isFirstRayOfLight) {
      console.log(`Final ray path has ${rayPath.length} points`);
    }
    
    // Display any warnings that occurred during ray tracing
    const warnings = this.getWarnings();
    if (warnings.length > 0 && !isFirstRayOfLight) {
      this.log('general', `\n⚠️ ${warnings.length} optical design warning(s):`);
      warnings.forEach((warning, index) => {
        const icon = warning.severity === 'error' ? '❌' : warning.severity === 'warning' ? '⚠️' : 'ℹ️';
        this.log('general', `  ${index + 1}. ${icon} [${warning.surfaceId}] ${warning.message}`);
      });
      this.log('general', ''); // Empty line for spacing
    }
    
    return rayPath;
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

    RayTracer.log('intersection', `Sphere intersection - radius: ${radius} (${radius > 0 ? 'CONVEX' : 'CONCAVE'})`);
    RayTracer.log('intersection', `Local ray: position=(${ray.position.x},${ray.position.y},${ray.position.z}), direction=(${ray.direction.x},${ray.direction.y},${ray.direction.z})`);
    
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

    RayTracer.log('intersection', `Quadratic: ${a}t² + ${b}t + ${c} = 0`);

    const discriminant = b * b - 4 * a * c;
    RayTracer.log('intersection', `Discriminant: ${discriminant}`);
    
    if (discriminant < 0) {
      RayTracer.log('intersection', `❌ No intersection (discriminant < 0)`);
      return { point: new Vector3(0, 0, 0), normal: new Vector3(0, 0, 1), distance: 0, isValid: false };
    }

    const sqrt_discriminant = Math.sqrt(discriminant);
    const t1 = (-b - sqrt_discriminant) / (2 * a); // First intersection (closer)
    const t2 = (-b + sqrt_discriminant) / (2 * a); // Second intersection (farther)
    RayTracer.log('intersection', `Solutions: t1=${t1} (first/closer), t2=${t2} (second/farther)`);

    // === DETERMINE VALID INTERSECTION BASED ON SURFACE TYPE ===
    const rayDistanceFromCenter = O.length();
    const sphereRadius = Math.abs(radius);
    const isRayInsideSphere = rayDistanceFromCenter < sphereRadius;
    
    RayTracer.log('intersection', `Ray distance from center: ${rayDistanceFromCenter.toFixed(3)}, sphere radius: ${sphereRadius.toFixed(3)}`);
    RayTracer.log('intersection', `Ray position: ${isRayInsideSphere ? 'INSIDE' : 'OUTSIDE'} sphere`);

    // Apply sphere intersection rules
    let t: number;
    let warningMessage = '';
    
    if (radius > 0) {
      // POSITIVE RADIUS = CONVEX SURFACE
      RayTracer.log('intersection', `🔵 CONVEX surface (R > 0)`);
      if (isRayInsideSphere) {
        // ANOMALY: Ray inside convex sphere
        warningMessage = `⚠️ ANOMALY: Ray inside convex sphere (R=${radius.toFixed(3)}, ray at distance ${rayDistanceFromCenter.toFixed(3)})`;
        RayTracer.log('intersection', `❌ ${warningMessage}`);
        this.logSurfaceWarning(surface, warningMessage);
        return { point: new Vector3(0, 0, 0), normal: new Vector3(0, 0, 1), distance: 0, isValid: false };
      } else {
        // Ray outside convex sphere: use FIRST intersection
        t = t1 > this.EPSILON ? t1 : (t2 > this.EPSILON ? t2 : -1);
        RayTracer.log('intersection', `✅ Ray outside convex sphere, using first intersection: t=${t}`);
      }
    } else {
      // NEGATIVE RADIUS = CONCAVE SURFACE
      RayTracer.log('intersection', `🔴 CONCAVE surface (R < 0)`);
      // For concave surface: always use SECOND intersection (back side)
      t = t2 > this.EPSILON ? t2 : (t1 > this.EPSILON ? t1 : -1);
      RayTracer.log('intersection', `✅ Concave surface, using second intersection (back side): t=${t}`);
    }
    
    if (t <= this.EPSILON || t > this.MAX_DISTANCE) {
      RayTracer.log('intersection', `❌ No valid intersection (t=${t} not in valid range [${this.EPSILON}, ${this.MAX_DISTANCE}])`);
      return { point: new Vector3(0, 0, 0), normal: new Vector3(0, 0, 1), distance: 0, isValid: false };
    }

    // === CALCULATE INTERSECTION POINT AND NORMAL ===
    // Hit point in local coordinates (sphere center at origin)
    const hitPoint = O.add(D.multiply(t));
    RayTracer.log('intersection', `Hit point: (${hitPoint.x.toFixed(3)}, ${hitPoint.y.toFixed(3)}, ${hitPoint.z.toFixed(3)})`);
    
    // Calculate local normal at hit point (vector from sphere center to hit point)
    let localNormal = hitPoint.normalize(); // Normal from center to hit point
    if (radius < 0) {
      localNormal = localNormal.multiply(-1); // Flip for concave surfaces
    }
    RayTracer.log('intersection', `Local normal: (${localNormal.x.toFixed(3)}, ${localNormal.y.toFixed(3)}, ${localNormal.z.toFixed(3)})`);

    // Check circular aperture (semidia) using radial distance from origin
    const radiusSquared = hitPoint.y * hitPoint.y + hitPoint.z * hitPoint.z;
    const aperture = surface.semidia || 10;
    const apertureSquared = aperture * aperture;
    RayTracer.log('intersection', `Radial distance²: ${radiusSquared.toFixed(6)}, semidia²: ${apertureSquared}`);
    
    // Fix 3: For sphere, y²+z² should be smaller than semidia² (avoid sqrt)
    if (radiusSquared > apertureSquared + 1e-12) {
      RayTracer.log('intersection', `❌ Hit outside circular aperture`);
      return { point: new Vector3(0, 0, 0), normal: new Vector3(0, 0, 1), distance: 0, isValid: false };
    }

    RayTracer.log('intersection', `✅ Valid spherical intersection found!`);
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
     console.log(`Plane intersection - surface at X=0, facing -1,0,0`);
     console.log(`Local ray: position=${ray.position.x},${ray.position.y},${ray.position.z}, direction=${ray.direction.x},${ray.direction.y},${ray.direction.z}`);
    
    // Plane is at X = 0 with normal [-1, 0, 0] (facing negative X)
    const localNormal = new Vector3(-1, 0, 0);
    
    // Check if ray is moving toward the surface
    const dotProduct = ray.direction.dot(localNormal);
    console.log(`Ray·Normal = ${dotProduct} (should be < 0 for approach)`);
    
    if (dotProduct >= 0) {
      console.log(`❌ Ray moving away from or parallel to surface`);
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
      console.log(`❌ Ray parallel to surface (direction.x ≈ 0)`);
      this.logSurfaceWarning(
        surface,
        `Ray parallel to plane surface (direction.x = ${ray.direction.x})`,
        'geometry',
        'warning'
      );
      return { point: new Vector3(0, 0, 0), normal: localNormal, distance: 0, isValid: false };
    }
    
    const t = -ray.position.x / ray.direction.x;
    console.log(`Intersection parameter t = ${t}`);
    
    if (t <= this.EPSILON) {
      console.log(`❌ Intersection behind ray (t ≤ 0)`);
      return { point: new Vector3(0, 0, 0), normal: localNormal, distance: 0, isValid: false };
    }
    
    // Calculate intersection point in YZ plane
    const hitPoint = ray.position.add(ray.direction.multiply(t));
    console.log(`Hit point: (${hitPoint.x}, ${hitPoint.y}, ${hitPoint.z})`);
    
    // Check aperture bounds based on surface type
    const withinAperture = this.checkPlaneAperture(hitPoint, surface);
    if (!withinAperture) {
      console.log(`❌ Hit outside aperture bounds`);
      this.logSurfaceWarning(
        surface,
        `Ray hit outside aperture bounds at (${hitPoint.y.toFixed(3)}, ${hitPoint.z.toFixed(3)})`,
        'aperture',
        'info'
      );
      return { point: new Vector3(0, 0, 0), normal: localNormal, distance: 0, isValid: false };
    }
    
    console.log(`✅ Valid plane intersection found!`);
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
      console.log(`Rectangular aperture: Y=[${-halfWidth}, ${halfWidth}], Z=[${-halfHeight}, ${halfHeight}]`);
      console.log(`Hit at Y=${y}, Z=${z}`);
      // Fix 1: For plano rectangle, magnitude of YZ should be smaller than half of height in Z, half of width in Y
      return Math.abs(y) <= halfWidth && Math.abs(z) <= halfHeight;
    }
    
    // Check for circular aperture (semidia specified)
    if (surface.semidia !== undefined) {
      const radiusSquared = y * y + z * z;
      const semidiaSquared = surface.semidia * surface.semidia;
      console.log(`Circular aperture: semidia=${surface.semidia}, hit radius²=${radiusSquared}, semidia²=${semidiaSquared}`);
      // Fix 2: For plano sphere, YZ intersects should be smaller than semidia² (avoid sqrt)
      return radiusSquared <= semidiaSquared;
    }
    
    // Default circular aperture
    const defaultRadius = 10;
    const radiusSquared = y * y + z * z;
    const defaultRadiusSquared = defaultRadius * defaultRadius;
    console.log(`Default circular aperture: radius=${defaultRadius}, hit radius²=${radiusSquared}`);
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
   * 1. Project to YZ plane intersection with circle of radius r
   * 2. Validate Y coordinate is within width limits (normalized)
   * 3. Calculate full 3D intersection and validate Z height limits
   */
  private static intersectCylinder(ray: Ray, surface: OpticalSurface): RayIntersection {
    const radius = Math.abs(surface.radius || 10);
    const height = surface.height || 20; // Total height of cylinder
    const width = surface.width || 20;   // Total width of cylinder
    
    console.log(`Cylinder intersection - radius: ${radius}, height: ${height}, width: ${width}`);
    console.log(`Local ray: position=(${ray.position.x},${ray.position.y},${ray.position.z}), direction=(${ray.direction.x},${ray.direction.y},${ray.direction.z})`);
    
    const O = ray.position;
    const D = ray.direction.normalize();

    // === EUREKA STEP 1: Backstabbing check ===
    // Check if np.dot(-v, np.array([-1, 0, 0])) < 0
    if (D.dot(new Vector3(1, 0, 0)) < 0) {
      console.log(`❌ Backstabbing detected - ray direction incompatible with surface`);
      return { point: new Vector3(0, 0, 0), normal: new Vector3(0, 0, 1), distance: 0, isValid: false };
    }

    // === EUREKA STEP 2: YZ plane circle intersection ===
    // v_flat = normalize(np.array([v[0], v[1], 0]))
    // t_flat = np.array([t_last[0], t_last[1], 0])
    const v_flat = new Vector3(D.x, D.y, 0).normalize();
    const t_flat = new Vector3(O.x, O.y, 0);
    
    // c = np.linalg.norm(t_flat)
    // c = c * c - r * r
    const c = t_flat.dot(t_flat) - radius * radius;
    
    // delta = (np.dot(v_flat, t_flat)) ** 2 - c
    const dot_v_t = v_flat.dot(t_flat);
    const delta = dot_v_t * dot_v_t - c;
    
    console.log(`YZ plane intersection: delta=${delta}`);
    
    if (delta <= 0) {
      console.log(`❌ No YZ circle intersection`);
      return { point: new Vector3(0, 0, 0), normal: new Vector3(0, 0, 1), distance: 0, isValid: false };
    }

    // === EUREKA STEP 3: Calculate intersection points ===
    // d = -np.dot(v_flat, t_flat)
    // d1 = d - np.sqrt(delta)
    // d2 = d + np.sqrt(delta)
    // d1 = t_flat + d1 * v_flat
    // d2 = t_flat + d2 * v_flat
    const d = -dot_v_t;
    const sqrt_delta = Math.sqrt(delta);
    const d1_param = d - sqrt_delta;
    const d2_param = d + sqrt_delta;
    
    const d1 = t_flat.add(v_flat.multiply(d1_param));
    const d2 = t_flat.add(v_flat.multiply(d2_param));
    
    console.log(`YZ intersections: d1=${d1_param} at (${d1.x.toFixed(3)}, ${d1.y.toFixed(3)}), d2=${d2_param} at (${d2.x.toFixed(3)}, ${d2.y.toFixed(3)})`);

    // === EUREKA STEP 4: Choose intersection based on radius sign ===
    // if sur.radius > 0: d = d1
    // else: d = d2
    const d_selected = (surface.radius || 0) > 0 ? d1 : d2;
    const d_param = (surface.radius || 0) > 0 ? d1_param : d2_param;
    
    console.log(`Selected intersection: (${d_selected.x.toFixed(3)}, ${d_selected.y.toFixed(3)}) at d=${d_param}`);

    // === EUREKA STEP 5: Width validation ===
    // if abs(d[1] / r) - 1e-6 > sur.width / r / 2: return
    const normalized_y = Math.abs(d_selected.y / radius);
    const width_limit = width / (2 * radius);
    
    console.log(`Width check: |Y/radius| = ${normalized_y.toFixed(6)}, limit = ${width_limit.toFixed(6)}`);
    
    if (normalized_y - 1e-6 > width_limit) {
      console.log(`❌ Hit outside width limits`);
      return { point: new Vector3(0, 0, 0), normal: new Vector3(0, 0, 1), distance: 0, isValid: false };
    }

    // === EUREKA STEP 6: Calculate 3D intersection ===
    // if v[0] == 0: return
    if (Math.abs(D.x) < this.EPSILON) {
      console.log(`❌ Ray parallel to cylinder axis (v[0] = 0)`);
      return { point: new Vector3(0, 0, 0), normal: new Vector3(0, 0, 1), distance: 0, isValid: false };
    }
    
    // dz = t_last + abs(d[0] - t_last[0]) / abs(v[0]) * v
    const t_3d = Math.abs(d_selected.x - O.x) / Math.abs(D.x);
    const dz = O.add(D.multiply(t_3d));
    
    console.log(`3D intersection point: (${dz.x.toFixed(3)}, ${dz.y.toFixed(3)}, ${dz.z.toFixed(3)}) at t=${t_3d}`);

    // === EUREKA STEP 7: Height validation ===
    // if abs(dz[2]) - 1e-6 > sur.height / 2: return
    if (Math.abs(dz.z) - 1e-6 > height / 2) {
      console.log(`❌ Hit outside height limits: |${dz.z}| > ${height/2}`);
      return { point: new Vector3(0, 0, 0), normal: new Vector3(0, 0, 1), distance: 0, isValid: false };
    }

    // === EUREKA STEP 8: Calculate surface normal ===
    // n = normalize(-1 * d)
    const d_for_normal = new Vector3(d_selected.x, d_selected.y, 0);
    let localNormal = d_for_normal.multiply(-1).normalize();
    
    // Ensure normal has negative X component to face incoming rays
    if (localNormal.x > 0) {
      localNormal = localNormal.multiply(-1);
    }
    
    console.log(`✅ Valid cylindrical intersection found!`);
    console.log(`Hit point: (${dz.x.toFixed(3)}, ${dz.y.toFixed(3)}, ${dz.z.toFixed(3)})`);
    console.log(`Normal: (${localNormal.x.toFixed(3)}, ${localNormal.y.toFixed(3)}, ${localNormal.z.toFixed(3)})`);
    
    return {
      point: dz,
      normal: localNormal,
      distance: t_3d,
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
    
    // For spherical and cylindrical surfaces, use radial distance check
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
    surface: OpticalSurface,
    isFirstRayOfLight: boolean = false
  ): RayTraceResult {
    const mode = surface.mode || 'refraction';
    
    // Handle different surface modes from EUREKA
    switch (mode) {
      case 'refraction':
        const transmitted = this.calculateRefraction(ray, intersection, surface, isFirstRayOfLight);
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
        // TODO: Implement Fresnel equations for partial reflection/transmission
        // For now, just do refraction
        const partialTransmitted = this.calculateRefraction(ray, intersection, surface, isFirstRayOfLight);
        return {
          ray,
          intersection,
          transmitted: partialTransmitted || undefined,
          isBlocked: !partialTransmitted
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
    
    console.log(`Reflection calculation:`);
    console.log(`  Incident direction:`, incident);
    console.log(`  Local normal at hit point:`, localNormal);
    
    // Law of reflection: reflected = incident - 2 * (incident · normal) * normal
    // The angle of incidence equals angle of reflection
    const dotProduct = incident.dot(localNormal);
    const reflected = incident.subtract(localNormal.multiply(2 * dotProduct));
    
    console.log(`  Dot product (I·N):`, dotProduct);
    console.log(`  Reflected direction:`, reflected);
    
    // Verify the reflection is correct (incident and reflected should make equal angles with normal)
    const incidentAngle = Math.acos(Math.abs(dotProduct)) * 180 / Math.PI;
    const reflectedDotNormal = reflected.normalize().dot(localNormal);
    const reflectedAngle = Math.acos(Math.abs(reflectedDotNormal)) * 180 / Math.PI;
    console.log(`  Incident angle: ${incidentAngle.toFixed(1)}°, Reflected angle: ${reflectedAngle.toFixed(1)}°`);
    
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
    surface: OpticalSurface,
    isFirstRayOfLight: boolean = false
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
    // Incident angle calculation removed for clean output
    
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
    
    if (isFirstRayOfLight) {
      console.log(`  Refracted direction:`, refracted);
    }
    
    // Verify Snell's law: n1*sin(θ1) should equal n2*sin(θ2)
    // const sinIncident = Math.sqrt(1 - cosIncident * cosIncident);
    // const sinRefracted = Math.sqrt(1 - cosRefracted * cosRefracted);
    // const snellCheck1 = n1 * sinIncident;
    // const snellCheck2 = n2 * sinRefracted;
    // console.log(`  Snell's law verification: n1*sin(θ1)=${snellCheck1.toFixed(4)}, n2*sin(θ2)=${snellCheck2.toFixed(4)}`);
    
    return new Ray(
      intersection.point,
      refracted.normalize(),
      ray.wavelength,
      ray.lightId,
      ray.intensity
    );
  }
}
