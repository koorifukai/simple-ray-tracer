/**
 * Classical Ray Tracing Engine (1960s methodology)
 * Following the transform-to-local, calculate, transform-back approach
 * used in modern optical design software like Zemax and Code V
 */

import { Vector3 } from '../math/Matrix4';
import { Matrix4 } from '../math/Matrix4';
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
  private static readonly EPSILON = 1e-10;
  private static readonly MAX_DISTANCE = 1000.0;
  
  // Warning system for optical design issues
  private static warnings: SurfaceWarning[] = [];

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
  static traceThroughSurface(ray: Ray, surface: OpticalSurface): RayTraceResult {
    console.log(`Tracing ray through surface ${surface.id}`);
    console.log(`Ray:`, { position: ray.position, direction: ray.direction });
    console.log(`Surface:`, { position: surface.position, shape: surface.shape, mode: surface.mode });
    
    // === CLASSICAL RAY TRACING: WORLD → LOCAL → WORLD TRANSFORMATION ===
    
    // 1. Transform incoming ray from world coordinates to surface local coordinates
    const localRay = this.transformRayToLocal(ray, surface);
    console.log(`Local ray:`, { position: localRay.position, direction: localRay.direction });
    
    // 2. Calculate intersection in local coordinates (where surface apex is at origin)
    const intersection = this.calculateIntersection(localRay, surface);
    console.log(`Intersection:`, intersection);
    
    if (!intersection.isValid) {
      console.log(`No valid intersection found`);
      return {
        ray,
        intersection,
        isBlocked: true
      };
    }

    // 3. Check if ray is hitting surface from the correct side
    // Ray should be moving toward surface (ray direction dot surface normal < 0)
    const rayDotNormal = localRay.direction.dot(intersection.normal);
    console.log(`Ray·Normal = ${rayDotNormal} (should be < 0 for front-side hit)`);
    
    if (rayDotNormal >= 0) {
      console.log(`Ray hitting surface from back side - ignoring interaction`);
      return {
        ray,
        intersection,
        isBlocked: true
      };
    }

    // 4. Check aperture limits
    if (!this.isWithinAperture(intersection.point, surface)) {
      console.log(`Ray outside aperture`);
      return {
        ray,
        intersection,
        isBlocked: true
      };
    }

    // 5. Apply surface physics (refraction/reflection) in local coordinates
    const result = this.applySurfacePhysics(localRay, intersection, surface);
    console.log(`Physics result:`, { 
      blocked: result.isBlocked, 
      hasTransmitted: !!result.transmitted,
      hasReflected: !!result.reflected 
    });
    
    // 6. Transform result rays back to global coordinates
    if (result.transmitted) {
      result.transmitted = this.transformRayToGlobal(result.transmitted, surface);
      console.log(`Transmitted ray (global):`, { 
        position: result.transmitted.position, 
        direction: result.transmitted.direction 
      });
    }
    if (result.reflected) {
      result.reflected = this.transformRayToGlobal(result.reflected, surface);
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
    
    const rayPath: Ray[] = [ray.clone()]; // Start with initial ray
    let currentRay = ray;
    let lastProcessedSurface: OpticalSurface | null = null;
    let lastSurfaceWasBlocked = false;

    console.log(`Starting ray trace with ${surfaces.length} surfaces`);
    console.log(`Initial ray:`, { position: currentRay.position, direction: currentRay.direction });

    for (let i = 0; i < surfaces.length; i++) {
      const surface = surfaces[i];
      console.log(`Processing surface ${i}: ${surface.id}, mode: ${surface.mode}, shape: ${surface.shape}`);
      
      const result = this.traceThroughSurface(currentRay, surface);
      
      console.log(`Surface ${i} result:`, { 
        blocked: result.isBlocked, 
        hasTransmitted: !!result.transmitted,
        hasReflected: !!result.reflected 
      });
      
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
        console.log(`Added intersection point to path:`, result.intersection.point);
        
        // Track the last surface and if it blocked the ray
        lastProcessedSurface = surface;
        lastSurfaceWasBlocked = result.isBlocked;
      }

      if (result.isBlocked) {
        console.log(`Ray blocked at surface ${i}`);
        break;
      }

      // Continue with transmitted or reflected ray and add it as the next segment
      if (result.transmitted) {
        currentRay = result.transmitted;
        console.log(`Ray transmitted, new direction:`, currentRay.direction);
        console.log(`Added transmitted ray segment to path`);
        
      } else if (result.reflected) {
        currentRay = result.reflected;
        console.log(`Ray reflected, new direction:`, currentRay.direction);
        console.log(`Added reflected ray segment to path`);
        
      } else {
        console.log(`No continuing ray from surface ${i}`);
        break;
      }
    }

    // Add a final ray segment based on the last surface interaction
    if (rayPath.length > 0) {
      const lastRay = rayPath[rayPath.length - 1];
      
      if (lastProcessedSurface && lastProcessedSurface.mode === 'absorption' && lastSurfaceWasBlocked) {
        console.log(`Last surface is absorption (detector) - ray path ends at surface`);
        // For absorption surfaces, the ray path already ends at the correct point
        // No need to add extension since the ray is absorbed
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
        console.log(`Added final ray segment extending ${extensionLength} units to:`, finalPosition);
        
        // Check if ray didn't finish processing all surfaces and log warning
        if (lastProcessedSurface) {
          const lastProcessedIndex = surfaces.findIndex(s => s.id === lastProcessedSurface!.id);
          if (lastProcessedIndex < surfaces.length - 1) {
            const missedSurfaces = surfaces.length - 1 - lastProcessedIndex;
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

    console.log(`Final ray path has ${rayPath.length} points`);
    
    // Display any warnings that occurred during ray tracing
    const warnings = this.getWarnings();
    if (warnings.length > 0) {
      console.log(`\n⚠️ ${warnings.length} optical design warning(s):`);
      warnings.forEach((warning, index) => {
        const icon = warning.severity === 'error' ? '❌' : warning.severity === 'warning' ? '⚠️' : 'ℹ️';
        console.log(`  ${index + 1}. ${icon} [${warning.surfaceId}] ${warning.message}`);
      });
      console.log(''); // Empty line for spacing
    }
    
    return rayPath;
  }

  /**
   * Transform ray from global to surface local coordinates
   * Uses proper transformation matrix that aligns surface normal with [-1,0,0]
   */
  private static transformRayToLocal(ray: Ray, surface: OpticalSurface): Ray {
    console.log(`Transforming ray to local coordinates for surface ${surface.id}`);
    
    // Get the transformation matrix that moves the surface to origin and aligns normal with [-1,0,0]
    const transform = this.getSurfaceToLocalTransform(surface);
    
    // Get points A (ray start) and B (ray start + unit direction) in world coordinates
    const A = ray.position;
    const unitDirection = ray.direction.normalize();
    const B = A.add(unitDirection);
    
    console.log(`World ray: A=${A.x},${A.y},${A.z} -> B=${B.x},${B.y},${B.z}`);
    
    // Transform both A and B to local coordinates using the transformation matrix
    const A_local = transform.transformPointV3(A);
    const B_local = transform.transformPointV3(B);
    
    // Calculate local direction v' = B' - A'
    const v_local = B_local.subtract(A_local).normalize();
    
    console.log(`Local ray: A'=${A_local.x},${A_local.y},${A_local.z}, v'=${v_local.x},${v_local.y},${v_local.z}`);
    
    return new Ray(A_local, v_local, ray.wavelength, ray.lightId, ray.intensity);
  }

  /**
   * Transform ray from surface local to global coordinates
   * Transforms hit point C' and outgoing point D' back to world coordinates
   */
  private static transformRayToGlobal(ray: Ray, surface: OpticalSurface): Ray {
    console.log(`Transforming ray back to global coordinates`);
    
    // Get the inverse transformation matrix 
    const transform = this.getSurfaceToLocalTransform(surface);
    const inverseTransform = transform.inverse();
    
    // Get local points C' (hit) and D' (hit + unit direction) 
    const C_local = ray.position;
    const unitDirection = ray.direction.normalize();
    const D_local = C_local.add(unitDirection);
    
    console.log(`Local outgoing ray: C'=${C_local.x},${C_local.y},${C_local.z} -> D'=${D_local.x},${D_local.y},${D_local.z}`);
    
    // Transform back to world coordinates
    const C_world = inverseTransform.transformPointV3(C_local);
    const D_world = inverseTransform.transformPointV3(D_local);
    
    // Calculate world direction vector
    const worldDirection = D_world.subtract(C_world).normalize();
    
    console.log(`World outgoing ray: C=${C_world.x},${C_world.y},${C_world.z}, direction=${worldDirection.x},${worldDirection.y},${worldDirection.z}`);
    
    return new Ray(C_world, worldDirection, ray.wavelength, ray.lightId, ray.intensity);
  }

  /**
   * Transform point from local to global coordinates
   */
  private static transformPointToGlobal(point: Vector3, surface: OpticalSurface): Vector3 {
    const transform = this.getSurfaceToLocalTransform(surface);
    const inverseTransform = transform.inverse();
    return inverseTransform.transformPointV3(point);
  }

  /**
   * Transform vector from local to global coordinates
   */
  private static transformVectorToGlobal(vector: Vector3, surface: OpticalSurface): Vector3 {
    const transform = this.getSurfaceToLocalTransform(surface);
    const inverseTransform = transform.inverse();
    return inverseTransform.transformVectorV3(vector);
  }

  /**
   * Get transformation matrix that moves surface to origin and aligns normal with [-1,0,0]
   * This creates a coordinate system where the surface is at origin facing -X direction
   */
  private static getSurfaceToLocalTransform(surface: OpticalSurface): Matrix4 {
    // For spherical surfaces: position is VERTEX, but we need CENTER at origin
    // Center = vertex - radius * normal_direction
    let translationPoint = surface.position;
    
    if (surface.shape === 'spherical' && surface.radius) {
      const surfaceNormal = surface.normal || new Vector3(-1, 0, 0);
      const radius = surface.radius;
      // Calculate sphere center: vertex - radius * normal
      const sphereCenter = surface.position.subtract(surfaceNormal.multiply(radius));
      translationPoint = sphereCenter;
      console.log(`Spherical surface ${surface.id}: vertex at [${surface.position.x}, ${surface.position.y}, ${surface.position.z}], center at [${sphereCenter.x}, ${sphereCenter.y}, ${sphereCenter.z}]`);
    }
    
    // Start with translation to move sphere center (or surface) to origin
    const translation = Matrix4.translation(-translationPoint.x, -translationPoint.y, -translationPoint.z);
    
    // Get surface normal (should be stored in the surface object)
    const surfaceNormal = surface.normal || new Vector3(-1, 0, 0); // Default to -X facing
    console.log(`Surface ${surface.id} normal: [${surfaceNormal.x}, ${surfaceNormal.y}, ${surfaceNormal.z}]`); 
    
    // Create rotation matrix that aligns surface normal with [-1, 0, 0]
    const targetNormal = new Vector3(-1, 0, 0);
    const rotation = this.createRotationMatrixFromNormals(surfaceNormal, targetNormal);
    
    // Combined transformation: first translate, then rotate
    return rotation.multiply(translation);
  }

  /**
   * Create rotation matrix that rotates 'from' vector to 'to' vector
   * Uses Rodrigues' rotation formula for arbitrary axis rotation
   */
  private static createRotationMatrixFromNormals(from: Vector3, to: Vector3): Matrix4 {
    const fromNorm = from.normalize();
    const toNorm = to.normalize();
    
    // Check if vectors are already aligned
    const dot = fromNorm.dot(toNorm);
    if (Math.abs(dot - 1.0) < 1e-6) {
      // Already aligned, return identity
      return new Matrix4().identity();
    }
    
    if (Math.abs(dot + 1.0) < 1e-6) {
      // Vectors are opposite, rotate 180° around any perpendicular axis
      let perpendicular: Vector3;
      if (Math.abs(fromNorm.x) < 0.9) {
        perpendicular = new Vector3(1, 0, 0).cross(fromNorm).normalize();
      } else {
        perpendicular = new Vector3(0, 1, 0).cross(fromNorm).normalize();  
      }
      return Matrix4.rotationFromAxisAngle(perpendicular, Math.PI);
    }
    
    // General case: use Rodrigues' formula
    const axis = fromNorm.cross(toNorm).normalize();
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
    
    return Matrix4.rotationFromAxisAngle(axis, angle);
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

    console.log(`Sphere intersection - radius: ${radius} (${radius > 0 ? 'CONVEX' : 'CONCAVE'})`);
    console.log(`Local ray: position=(${ray.position.x},${ray.position.y},${ray.position.z}), direction=(${ray.direction.x},${ray.direction.y},${ray.direction.z})`);
    
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

    console.log(`Quadratic: ${a}t² + ${b}t + ${c} = 0`);

    const discriminant = b * b - 4 * a * c;
    console.log(`Discriminant: ${discriminant}`);
    
    if (discriminant < 0) {
      console.log(`❌ No intersection (discriminant < 0)`);
      return { point: new Vector3(0, 0, 0), normal: new Vector3(0, 0, 1), distance: 0, isValid: false };
    }

    const sqrt_discriminant = Math.sqrt(discriminant);
    const t1 = (-b - sqrt_discriminant) / (2 * a); // First intersection (closer)
    const t2 = (-b + sqrt_discriminant) / (2 * a); // Second intersection (farther)
    console.log(`Solutions: t1=${t1} (first/closer), t2=${t2} (second/farther)`);

    // === DETERMINE VALID INTERSECTION BASED ON SURFACE TYPE ===
    const rayDistanceFromCenter = O.length();
    const sphereRadius = Math.abs(radius);
    const isRayInsideSphere = rayDistanceFromCenter < sphereRadius;
    
    console.log(`Ray distance from center: ${rayDistanceFromCenter.toFixed(3)}, sphere radius: ${sphereRadius.toFixed(3)}`);
    console.log(`Ray position: ${isRayInsideSphere ? 'INSIDE' : 'OUTSIDE'} sphere`);

    // Apply sphere intersection rules
    let t: number;
    let warningMessage = '';
    
    if (radius > 0) {
      // POSITIVE RADIUS = CONVEX SURFACE
      console.log(`🔵 CONVEX surface (R > 0)`);
      if (isRayInsideSphere) {
        // ANOMALY: Ray inside convex sphere
        warningMessage = `⚠️ ANOMALY: Ray inside convex sphere (R=${radius.toFixed(3)}, ray at distance ${rayDistanceFromCenter.toFixed(3)})`;
        console.log(`❌ ${warningMessage}`);
        this.logSurfaceWarning(surface, warningMessage);
        return { point: new Vector3(0, 0, 0), normal: new Vector3(0, 0, 1), distance: 0, isValid: false };
      } else {
        // Ray outside convex sphere: use FIRST intersection
        t = t1 > this.EPSILON ? t1 : (t2 > this.EPSILON ? t2 : -1);
        console.log(`✅ Ray outside convex sphere, using first intersection: t=${t}`);
      }
    } else {
      // NEGATIVE RADIUS = CONCAVE SURFACE
      console.log(`🔴 CONCAVE surface (R < 0)`);
      // For concave surface: always use SECOND intersection (back side)
      t = t2 > this.EPSILON ? t2 : (t1 > this.EPSILON ? t1 : -1);
      console.log(`✅ Concave surface, using second intersection (back side): t=${t}`);
    }
    
    if (t <= this.EPSILON || t > this.MAX_DISTANCE) {
      console.log(`❌ No valid intersection (t=${t} not in valid range [${this.EPSILON}, ${this.MAX_DISTANCE}])`);
      return { point: new Vector3(0, 0, 0), normal: new Vector3(0, 0, 1), distance: 0, isValid: false };
    }

    // === CALCULATE INTERSECTION POINT AND NORMAL ===
    // Hit point in local coordinates (sphere center at origin)
    const hitPoint = O.add(D.multiply(t));
    console.log(`Hit point: (${hitPoint.x.toFixed(3)}, ${hitPoint.y.toFixed(3)}, ${hitPoint.z.toFixed(3)})`);
    
    // Calculate local normal at hit point (vector from sphere center to hit point)
    let localNormal = hitPoint.normalize(); // Normal from center to hit point
    if (radius < 0) {
      localNormal = localNormal.multiply(-1); // Flip for concave surfaces
    }
    console.log(`Local normal: (${localNormal.x.toFixed(3)}, ${localNormal.y.toFixed(3)}, ${localNormal.z.toFixed(3)})`);

    // Check circular aperture (semidia) using radial distance from origin
    const radialDistance = Math.sqrt(hitPoint.y * hitPoint.y + hitPoint.z * hitPoint.z);
    const aperture = surface.semidia || 10;
    console.log(`Radial distance: ${radialDistance.toFixed(3)}, semidia: ${aperture}`);
    
    if (radialDistance > aperture + 1e-6) {
      console.log(`❌ Hit outside circular aperture`);
      return { point: new Vector3(0, 0, 0), normal: new Vector3(0, 0, 1), distance: 0, isValid: false };
    }

    console.log(`✅ Valid spherical intersection found!`);
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
      return Math.abs(y) <= halfWidth && Math.abs(z) <= halfHeight;
    }
    
    // Check for circular aperture (semidia specified)
    if (surface.semidia !== undefined) {
      const radius = Math.sqrt(y * y + z * z);
      console.log(`Circular aperture: radius=${surface.semidia}, hit radius=${radius}`);
      return radius <= surface.semidia;
    }
    
    // Default circular aperture
    const defaultRadius = 10;
    const radius = Math.sqrt(y * y + z * z);
    console.log(`Default circular aperture: radius=${defaultRadius}, hit radius=${radius}`);
    return radius <= defaultRadius;
  }

  /**
   * Intersect ray with cylindrical surface (in local coordinates)
   * Decompose ray into XY plane (circle) and Z component (height check)
   */
  /**
   * Intersect ray with cylindrical surface (in local coordinates)
   * 
   * CYLINDRICAL GEOMETRY:
   * - Cylinder axis along X direction, centered at origin
   * - Height h extends ±h/2 along X-axis  
   * - Width w extends ±w/2 along Z-axis
   * - Radius r defines circular cross-section in YZ plane
   * 
   * INTERSECTION STRATEGY:
   * 1. Check XY plane intersection with circle of radius r
   * 2. Validate X coordinate is within width w limits  
   * 3. Calculate Z travel distance and validate height h limits
   */
  private static intersectCylinder(ray: Ray, surface: OpticalSurface): RayIntersection {
    const radius = Math.abs(surface.radius || 10);
    const height = surface.height || 20; // Total height of cylinder
    const width = surface.width || 20;   // Total width of cylinder
    
    console.log(`Cylinder intersection - radius: ${radius}, height: ${height}, width: ${width}`);
    console.log(`Local ray: position=(${ray.position.x},${ray.position.y},${ray.position.z}), direction=(${ray.direction.x},${ray.direction.y},${ray.direction.z})`);
    
    const O = ray.position;
    const D = ray.direction.normalize();

    // === STEP 1: XY PLANE CIRCLE INTERSECTION ===
    // Extract XY components for circle intersection (ignore Z initially)
    // Circle equation in XY plane: x² + y² = R²
    const a = D.x * D.x + D.y * D.y; // XY plane direction magnitude squared
    const b = 2 * (O.x * D.x + O.y * D.y); // XY plane: 2 * (pos·dir)
    const c = O.x * O.x + O.y * O.y - radius * radius; // XY distance from axis - R²

    console.log(`XY plane circle intersection: ${a}t² + ${b}t + ${c} = 0`);

    if (Math.abs(a) < this.EPSILON) {
      console.log(`❌ Ray parallel to cylinder axis (no XY intersection)`);
      return { point: new Vector3(0, 0, 0), normal: new Vector3(0, 0, 1), distance: 0, isValid: false };
    }

    const discriminant = b * b - 4 * a * c;
    console.log(`Discriminant: ${discriminant}`);
    
    if (discriminant < 0) {
      console.log(`❌ No XY circle intersection`);
      return { point: new Vector3(0, 0, 0), normal: new Vector3(0, 0, 1), distance: 0, isValid: false };
    }

    const sqrt_discriminant = Math.sqrt(discriminant);
    const t1 = (-b - sqrt_discriminant) / (2 * a); // First intersection
    const t2 = (-b + sqrt_discriminant) / (2 * a); // Second intersection
    console.log(`XY intersection parameters: t1=${t1}, t2=${t2}`);

    // === STEP 2: CHOOSE VALID INTERSECTION AND VALIDATE GEOMETRY ===
    // Try both intersections, prefer the closer valid one
    for (const t of [t1, t2]) {
      if (t <= this.EPSILON || t > this.MAX_DISTANCE) {
        console.log(`Skipping t=${t} (out of valid range)`);
        continue;
      }

      // Calculate 3D intersection point
      const hitPoint = O.add(D.multiply(t));
      console.log(`Testing hit point: (${hitPoint.x.toFixed(3)}, ${hitPoint.y.toFixed(3)}, ${hitPoint.z.toFixed(3)})`);
      
      // === STEP 3: WIDTH VALIDATION (X-axis limits) ===
      // Check if intersection X is within ±width/2
      const halfWidth = width / 2;
      if (Math.abs(hitPoint.x) > halfWidth + this.EPSILON) {
        console.log(`❌ Hit outside width limits: |${hitPoint.x}| > ${halfWidth}`);
        continue;
      }
      
      // === STEP 4: HEIGHT VALIDATION (Z-axis limits) ===
      // Check if intersection Z is within ±height/2
      const halfHeight = height / 2;
      if (Math.abs(hitPoint.z) > halfHeight + this.EPSILON) {
        console.log(`❌ Hit outside height limits: |${hitPoint.z}| > ${halfHeight}`);
        continue;
      }

      // === STEP 5: CALCULATE SURFACE NORMAL ===
      // Normal is radial vector in XY plane (pointing outward from cylinder axis)
      const radialVector = new Vector3(hitPoint.x, hitPoint.y, 0);
      const localNormal = radialVector.normalize();
      
      console.log(`✅ Valid cylindrical intersection found!`);
      console.log(`Hit point: (${hitPoint.x.toFixed(3)}, ${hitPoint.y.toFixed(3)}, ${hitPoint.z.toFixed(3)})`);
      console.log(`Normal: (${localNormal.x.toFixed(3)}, ${localNormal.y.toFixed(3)}, ${localNormal.z.toFixed(3)})`);
      
      return {
        point: hitPoint,
        normal: localNormal,
        distance: t,
        isValid: true
      };
    }

    // No valid intersection found within geometry constraints
    console.log(`❌ No valid cylindrical intersection found`);
    return { point: new Vector3(0, 0, 0), normal: new Vector3(0, 0, 1), distance: 0, isValid: false };
  }

  /**
   * Check if intersection point is within surface aperture
   */
  private static isWithinAperture(point: Vector3, surface: OpticalSurface): boolean {
    const aperture = surface.semidia || surface.aperture || 10; // semidia is the radius
    
    // For spherical surfaces, check radial distance in Y-Z plane
    if (surface.shape === 'spherical') {
      const radius = Math.sqrt(point.y * point.y + point.z * point.z);
      return radius <= aperture;
    }
    
    // For planar surfaces, check radial distance in Y-Z plane
    const radius = Math.sqrt(point.y * point.y + point.z * point.z);
    return radius <= aperture;
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
        // TODO: Implement Fresnel equations for partial reflection/transmission
        // For now, just do refraction
        const partialTransmitted = this.calculateRefraction(ray, intersection, surface);
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
    surface: OpticalSurface
  ): Ray | null {
    // Get refractive indices from surface properties
    const n1 = surface.n1 || 1.0; // Incident medium
    const n2 = surface.n2 || 1.0; // Transmitted medium
    
    console.log(`Refraction calculation:`);
    console.log(`  n1 (incident medium): ${n1}`);
    console.log(`  n2 (transmitted medium): ${n2}`);
    
    const incident = ray.direction.normalize();
    let localNormal = intersection.normal.normalize(); // Local normal at hit point
    
    console.log(`  Incident direction:`, incident);
    console.log(`  Local normal at hit point:`, localNormal);
    
    // Snell's law: n1 * sin(θ1) = n2 * sin(θ2)
    const snellRatio = n1 / n2;
    console.log(`  Snell ratio (n1/n2): ${snellRatio}`);
    
    // Calculate cosine of incident angle (dot product with normal)
    let cosIncident = -localNormal.dot(incident);
    console.log(`  cos(incident angle): ${cosIncident}`);
    
    // If cosIncident < 0, ray is hitting from back side - flip normal
    if (cosIncident < 0) {
      localNormal = localNormal.multiply(-1);
      cosIncident = -localNormal.dot(incident);
      console.log(`  Flipped normal for back-side hit, new cos(incident): ${cosIncident}`);
    }
    
    // Calculate incident angle
    const incidentAngle = Math.acos(Math.max(0, Math.min(1, cosIncident))) * 180 / Math.PI;
    console.log(`  Incident angle: ${incidentAngle.toFixed(1)}°`);
    
    // Check for total internal reflection
    const discriminant = 1 - snellRatio * snellRatio * (1 - cosIncident * cosIncident);
    if (discriminant < 0) {
      console.log(`  Total internal reflection (discriminant < 0)`);
      // Fall back to reflection
      return this.calculateReflection(ray, { ...intersection, normal: localNormal });
    }
    
    // Calculate cosine of refracted angle
    const cosRefracted = Math.sqrt(discriminant);
    console.log(`  cos(refracted angle): ${cosRefracted}`);
    
    const refractedAngle = Math.acos(Math.max(0, Math.min(1, cosRefracted))) * 180 / Math.PI;
    console.log(`  Refracted angle: ${refractedAngle.toFixed(1)}°`);
    
    // Calculate refracted direction using vector form of Snell's law
    // T = (n1/n2) * I + [(n1/n2) * cos(θ1) - cos(θ2)] * N
    const refracted = incident.multiply(snellRatio)
      .add(localNormal.multiply(snellRatio * cosIncident - cosRefracted));
    
    console.log(`  Refracted direction:`, refracted);
    
    // Verify Snell's law: n1*sin(θ1) should equal n2*sin(θ2)
    const sinIncident = Math.sqrt(1 - cosIncident * cosIncident);
    const sinRefracted = Math.sqrt(1 - cosRefracted * cosRefracted);
    const snellCheck1 = n1 * sinIncident;
    const snellCheck2 = n2 * sinRefracted;
    console.log(`  Snell's law verification: n1*sin(θ1)=${snellCheck1.toFixed(4)}, n2*sin(θ2)=${snellCheck2.toFixed(4)}`);
    
    return new Ray(
      intersection.point,
      refracted.normalize(),
      ray.wavelength,
      ray.lightId,
      ray.intensity
    );
  }
}
