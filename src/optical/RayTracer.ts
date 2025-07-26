/**
 * Classical Ray Tracing Engine (1960s methodology)
 * Following the transform-to-local, calculate, transform-back approach
 * used in modern optical design software like Zemax and Code V
 */

import { Vector3 } from '../math/Matrix4';
import { Ray } from './LightSource';
import type { OpticalSurface } from './surfaces';

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

  /**
   * Trace a ray through a single optical surface
   */
  static traceThroughSurface(ray: Ray, surface: OpticalSurface): RayTraceResult {
    console.log(`Tracing ray through surface ${surface.id}`);
    console.log(`Ray:`, { position: ray.position, direction: ray.direction });
    console.log(`Surface:`, { position: surface.position, shape: surface.shape, mode: surface.mode });
    
    // 1. Transform ray to surface local coordinates (relative to apex)
    const localRay = this.transformRayToLocal(ray, surface);
    console.log(`Local ray:`, { position: localRay.position, direction: localRay.direction });
    
    // 2. Calculate intersection in local coordinates
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

    // 3. Check aperture limits
    if (!this.isWithinAperture(intersection.point, surface)) {
      console.log(`Ray outside aperture`);
      return {
        ray,
        intersection,
        isBlocked: true
      };
    }

    // 4. Apply surface physics (refraction/reflection) in local coordinates
    const result = this.applySurfacePhysics(localRay, intersection, surface);
    console.log(`Physics result:`, { 
      blocked: result.isBlocked, 
      hasTransmitted: !!result.transmitted,
      hasReflected: !!result.reflected 
    });
    
    // 5. Transform result rays back to global coordinates
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
   */
  static traceRaySequential(ray: Ray, surfaces: OpticalSurface[]): Ray[] {
    const rayPath: Ray[] = [ray.clone()];
    let currentRay = ray;

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
      
      if (result.isBlocked) {
        console.log(`Ray blocked at surface ${i}`);
        break;
      }

      if (result.transmitted) {
        currentRay = result.transmitted;
        rayPath.push(currentRay.clone());
        console.log(`Ray transmitted, new position:`, currentRay.position, 'direction:', currentRay.direction);
      } else {
        console.log(`No transmitted ray from surface ${i}`);
        break;
      }
    }

    console.log(`Final ray path has ${rayPath.length} segments`);
    return rayPath;
  }

  /**
   * Transform ray from global to surface local coordinates
   */
  private static transformRayToLocal(ray: Ray, surface: OpticalSurface): Ray {
    // TEMPORARY: Skip transformations to debug basic intersection
    console.log('TEMP: Skipping transformation, using global coordinates');
    
    // For plano surfaces positioned along X-axis, we can work in global coordinates
    // Create a translated ray where we subtract surface position
    const translatedPosition = ray.position.subtract(surface.position);
    
    console.log('Ray translated to surface origin:', translatedPosition);
    return new Ray(translatedPosition, ray.direction, ray.wavelength, ray.lightId, ray.intensity);
    
    /* ORIGINAL TRANSFORMATION CODE - COMMENTED OUT FOR DEBUGGING
    if (!surface.position || !surface.rotation) {
      console.log('Surface missing position or rotation, using ray as-is');
      return ray.clone();
    }
    
    try {
      // Create transformation matrix from surface position and orientation
      const transform = Matrix4.createTransformation(
        surface.position || new Vector3(0, 0, 0),
        surface.rotation || new Vector3(0, 0, 0)
      ).inverse();

      const localPosition = transform.transformPointV3(ray.position);
      const localDirection = transform.transformVectorV3(ray.direction);

      console.log('Transformation successful:', { 
        globalPos: ray.position, 
        localPos: localPosition,
        globalDir: ray.direction,
        localDir: localDirection
      });

      return new Ray(localPosition, localDirection, ray.wavelength, ray.lightId, ray.intensity);
    } catch (error) {
      console.error('Transformation failed, using ray as-is:', error);
      return ray.clone();
    }
    */
  }

  /**
   * Transform ray from surface local to global coordinates
   */
  private static transformRayToGlobal(ray: Ray, surface: OpticalSurface): Ray {
    // TEMPORARY: Skip back-transformation since we're working in global coordinates
    console.log('TEMP: Skipping back-transformation');
    
    // Add surface position back to ray position
    const globalPosition = ray.position.add(surface.position);
    
    console.log('Ray translated back to global:', globalPosition);
    return new Ray(globalPosition, ray.direction, ray.wavelength, ray.lightId, ray.intensity);
    
    /* ORIGINAL BACK-TRANSFORMATION CODE - COMMENTED OUT FOR DEBUGGING
    if (!surface.position || !surface.rotation) {
      console.log('Surface missing position or rotation, using ray as-is');
      return ray.clone();
    }
    
    try {
      const transform = Matrix4.createTransformation(
        surface.position || new Vector3(0, 0, 0),
        surface.rotation || new Vector3(0, 0, 0)
      );

      const globalPosition = transform.transformPointV3(ray.position);
      const globalDirection = transform.transformVectorV3(ray.direction);

      console.log('Back-transformation successful:', { 
        localPos: ray.position, 
        globalPos: globalPosition,
        localDir: ray.direction,
        globalDir: globalDirection
      });

      return new Ray(globalPosition, globalDirection, ray.wavelength, ray.lightId, ray.intensity);
    } catch (error) {
      console.error('Back-transformation failed, using ray as-is:', error);
      return ray.clone();
    }
    */
  }

  /**
   * Transform point from local to global coordinates
   */
  private static transformPointToGlobal(point: Vector3, surface: OpticalSurface): Vector3 {
    // TEMPORARY: Simple translation since we're skipping full transformations
    return point.add(surface.position);
    
    /* ORIGINAL CODE
    const transform = Matrix4.createTransformation(
      surface.position || new Vector3(0, 0, 0),
      surface.rotation || new Vector3(0, 0, 0)
    );
    return transform.transformPointV3(point);
    */
  }

  /**
   * Transform vector from local to global coordinates
   */
  private static transformVectorToGlobal(vector: Vector3, _surface: OpticalSurface): Vector3 {
    // TEMPORARY: No rotation, so vector stays the same
    return vector.clone();
    
    /* ORIGINAL CODE
    const transform = Matrix4.createTransformation(
      surface.position || new Vector3(0, 0, 0),
      surface.rotation || new Vector3(0, 0, 0)
    );
    return transform.transformVectorV3(vector);
    */
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
   */
  private static intersectSphere(ray: Ray, surface: OpticalSurface): RayIntersection {
    const radius = surface.radius || 0;
    if (Math.abs(radius) < this.EPSILON) {
      return this.intersectPlane(ray, surface); // Treat as flat if radius is zero
    }

    // Sphere equation: x² + y² + z² = R²
    // Ray: P = O + t*D
    const O = ray.position;
    const D = ray.direction;

    const a = D.dot(D);
    const b = 2 * O.dot(D);
    const c = O.dot(O) - radius * radius;

    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) {
      return { point: new Vector3(0, 0, 0), normal: new Vector3(0, 0, 1), distance: 0, isValid: false };
    }

    const sqrt_discriminant = Math.sqrt(discriminant);
    const t1 = (-b - sqrt_discriminant) / (2 * a);
    const t2 = (-b + sqrt_discriminant) / (2 * a);

    // Choose the appropriate intersection (closest positive distance)
    let t = t1 > this.EPSILON ? t1 : t2;
    if (t <= this.EPSILON || t > this.MAX_DISTANCE) {
      return { point: new Vector3(0, 0, 0), normal: new Vector3(0, 0, 1), distance: 0, isValid: false };
    }

    const point = O.add(D.multiply(t));
    const normal = point.normalize(); // For sphere centered at origin
    if (radius < 0) {
      normal.multiply(-1); // Flip normal for concave surfaces
    }

    return {
      point,
      normal,
      distance: t,
      isValid: true
    };
  }

  /**
   * Intersect ray with planar surface (in local coordinates)
   * Following EUREKA interact_plane methodology
   */
  private static intersectPlane(ray: Ray, surface: OpticalSurface): RayIntersection {
    console.log(`Plane intersection - ray:`, { position: ray.position, direction: ray.direction });
    
    // In EUREKA: plane is at X = 0 with normal [-1, 0, 0]
    // Check if ray is moving toward the surface (dot product with normal should be negative)
    const surfaceNormal = new Vector3(-1, 0, 0);
    const dotProduct = ray.direction.dot(surfaceNormal);
    console.log(`Dot product with surface normal:`, dotProduct);
    
    // Ray should be moving toward surface (positive X direction, negative dot with [-1,0,0])
    if (dotProduct >= 0) {
      console.log(`Ray moving away from surface (dot >= 0)`);
      return { point: new Vector3(0, 0, 0), normal: surfaceNormal, distance: 0, isValid: false };
    }
    
    // Calculate intersection: solve for t where ray.position.x + t * ray.direction.x = 0
    if (Math.abs(ray.direction.x) < this.EPSILON) {
      console.log(`Ray parallel to surface (direction.x too small)`);
      return { point: new Vector3(0, 0, 0), normal: surfaceNormal, distance: 0, isValid: false };
    }
    
    const t = -ray.position.x / ray.direction.x;
    console.log(`Intersection parameter t:`, t);
    
    if (t <= this.EPSILON) {
      console.log(`Intersection behind ray (t <= epsilon)`);
      return { point: new Vector3(0, 0, 0), normal: surfaceNormal, distance: 0, isValid: false };
    }
    
    const point = ray.position.add(ray.direction.multiply(t));
    console.log(`Intersection point:`, point);
    
    // Check if hit is within surface boundaries (Y-Z plane)
    const radius = Math.sqrt(point.y * point.y + point.z * point.z);
    const aperture = surface.aperture || surface.semidia || 10;
    console.log(`Hit radius: ${radius}, aperture: ${aperture}`);
    
    if (radius > aperture) {
      console.log(`Hit outside aperture`);
      return { point: new Vector3(0, 0, 0), normal: surfaceNormal, distance: 0, isValid: false };
    }
    
    console.log(`Valid intersection found!`);
    return {
      point,
      normal: surfaceNormal,
      distance: t,
      isValid: true
    };
  }

  /**
   * Intersect ray with cylindrical surface (in local coordinates)
   */
  private static intersectCylinder(ray: Ray, surface: OpticalSurface): RayIntersection {
    const radius = Math.abs(surface.radius || 10);
    
    // Cylinder equation: x² + y² = R² (infinite in z)
    const O = ray.position;
    const D = ray.direction;

    const a = D.x * D.x + D.y * D.y;
    const b = 2 * (O.x * D.x + O.y * D.y);
    const c = O.x * O.x + O.y * O.y - radius * radius;

    if (Math.abs(a) < this.EPSILON) {
      return { point: new Vector3(0, 0, 0), normal: new Vector3(0, 0, 1), distance: 0, isValid: false };
    }

    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) {
      return { point: new Vector3(0, 0, 0), normal: new Vector3(0, 0, 1), distance: 0, isValid: false };
    }

    const sqrt_discriminant = Math.sqrt(discriminant);
    const t1 = (-b - sqrt_discriminant) / (2 * a);
    const t2 = (-b + sqrt_discriminant) / (2 * a);

    const t = t1 > this.EPSILON ? t1 : t2;
    if (t <= this.EPSILON || t > this.MAX_DISTANCE) {
      return { point: new Vector3(0, 0, 0), normal: new Vector3(0, 0, 1), distance: 0, isValid: false };
    }

    const point = O.add(D.multiply(t));
    const normal = new Vector3(point.x, point.y, 0).normalize();

    return {
      point,
      normal,
      distance: t,
      isValid: true
    };
  }

  /**
   * Check if intersection point is within surface aperture
   */
  private static isWithinAperture(point: Vector3, surface: OpticalSurface): boolean {
    const aperture = surface.aperture || 10;
    const radius = Math.sqrt(point.x * point.x + point.y * point.y);
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
   */
  private static calculateReflection(ray: Ray, intersection: RayIntersection): Ray {
    const incident = ray.direction;
    const normal = intersection.normal;
    
    // R = I - 2(I·N)N
    const reflected = incident.subtract(normal.multiply(2 * incident.dot(normal)));
    
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
   */
  private static calculateRefraction(
    ray: Ray, 
    intersection: RayIntersection, 
    surface: OpticalSurface
  ): Ray | null {
    // Get refractive indices from surface properties (EUREKA style)
    const n1 = surface.n1 || 1.0; // Incident medium
    const n2 = surface.n2 || 1.0; // Transmitted medium
    
    const incident = ray.direction.normalize();
    const normal = intersection.normal.normalize();
    
    // Calculate angle of incidence
    const cosI = -incident.dot(normal);
    if (cosI < 0) {
      return null; // Ray hitting from wrong side
    }
    
    // Calculate refractive index ratio
    const eta = n1 / n2;
    
    // Check for total internal reflection
    const k = 1 - eta * eta * (1 - cosI * cosI);
    if (k < 0) {
      // Total internal reflection - return reflected ray instead
      return this.calculateReflection(ray, intersection);
    }
    
    // Calculate refracted direction using Snell's law
    const refracted = incident.multiply(eta).add(normal.multiply(eta * cosI - Math.sqrt(k)));
    
    return new Ray(
      intersection.point,
      refracted.normalize(),
      ray.wavelength,
      ray.lightId,
      ray.intensity
    );
  }
}
