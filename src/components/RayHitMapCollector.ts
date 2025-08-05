/**
 * Ray-Surface Intersection Data Collector
 * Collects ray intersection data during ray tracing for analysis and visualization
 * Supports hit maps, spot diagrams, and other optical analysis functions
 */

import { Vector3 } from '../math/Matrix4';
import type { OpticalSurface } from '../optical/surfaces';
import type { Ray } from '../optical/LightSource';

/**
 * Individual ray-surface intersection point
 */
export interface RayIntersectionPoint {
  // Ray information
  rayId: string;         // Unique ray identifier (light ID + segment)
  lightId: number;       // Original light source ID
  wavelength: number;    // Ray wavelength (nm)
  intensity: number;     // Ray intensity
  
  // Surface information
  surfaceId: string;     // Surface identifier
  surfaceName: string;   // Human-readable surface name
  assemblyName?: string; // Assembly name if part of assembly
  
  // Hit location (global coordinates)
  hitPoint: Vector3;     // 3D intersection point
  hitNormal: Vector3;    // Surface normal at hit point
  
  // Ray data at intersection
  incidentDirection: Vector3;  // Ray direction before hit
  exitDirection?: Vector3;     // Ray direction after hit (if transmitted/reflected)
  
  // Intersection details
  hitDistance: number;   // Distance from ray origin to hit
  isValid: boolean;      // Whether intersection is valid
  wasBlocked: boolean;   // Whether ray was blocked at this surface
  
  // Analysis coordinates (for cross-sectional views)
  crossSectionY: number; // Y coordinate in cross-section view
  crossSectionZ: number; // Z coordinate in cross-section view
}

/**
 * Collection of intersection points for a specific surface
 */
export interface SurfaceIntersectionData {
  surfaceId: string;
  surfaceName: string;
  assemblyName?: string;
  surface: OpticalSurface;
  intersectionPoints: RayIntersectionPoint[];
}

/**
 * Complete ray-surface intersection dataset for analysis
 */
export interface RayIntersectionData {
  surfaces: Map<string, SurfaceIntersectionData>;
  totalRays: number;
  totalIntersections: number;
  wavelengths: Set<number>;
  lightSources: Set<number>;
}

/**
 * Ray Intersection Data Collector
 * Singleton class to collect intersection data during ray tracing
 */
export class RayIntersectionCollector {
  private static instance: RayIntersectionCollector;
  private intersectionData: RayIntersectionData = {
    surfaces: new Map(),
    totalRays: 0,
    totalIntersections: 0,
    wavelengths: new Set(),
    lightSources: new Set()
  };
  
  private isCollecting = false;
  
  private constructor() {}
  
  static getInstance(): RayIntersectionCollector {
    if (!RayIntersectionCollector.instance) {
      RayIntersectionCollector.instance = new RayIntersectionCollector();
    }
    return RayIntersectionCollector.instance;
  }
  
  /**
   * Start collecting ray hit data
   */
  startCollection(): void {
    this.isCollecting = true;
    this.clearData();
  }
  
  /**
   * Stop collecting ray hit data
   */
  stopCollection(): void {
    this.isCollecting = false;
  }
  
  /**
   * Check if currently collecting data
   */
  isCollectionActive(): boolean {
    return this.isCollecting;
  }
  
  /**
   * Clear all collected data
   */
  clearData(): void {
    this.intersectionData = {
      surfaces: new Map(),
      totalRays: 0,
      totalIntersections: 0,
      wavelengths: new Set(),
      lightSources: new Set()
    };
  }
  
  /**
   * Record a ray-surface intersection
   */
  recordHit(
    ray: Ray,
    surface: OpticalSurface,
    hitPoint: Vector3,
    hitNormal: Vector3,
    hitDistance: number,
    isValid: boolean,
    wasBlocked: boolean,
    incidentDirection: Vector3,
    exitDirection?: Vector3
  ): void {
    if (!this.isCollecting || !isValid) return;
    
    // Generate unique ray identifier
    const rayId = `${ray.lightId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Determine surface names
    const surfaceName = this.getSurfaceName(surface);
    const assemblyName = this.getAssemblyName(surface);
    
    // Create intersection point record
    const intersectionRecord: RayIntersectionPoint = {
      rayId,
      lightId: Math.floor(ray.lightId), // Use base light ID (remove fractional parts)
      wavelength: ray.wavelength,
      intensity: ray.intensity,
      
      surfaceId: surface.id,
      surfaceName,
      assemblyName,
      
      hitPoint: hitPoint.clone(),
      hitNormal: hitNormal.clone(),
      
      incidentDirection: incidentDirection.clone(),
      exitDirection: exitDirection?.clone(),
      
      hitDistance,
      isValid,
      wasBlocked,
      
      // Calculate cross-section coordinates (drop X component)
      crossSectionY: hitPoint.y,
      crossSectionZ: hitPoint.z
    };
    
    // Add to surface intersection data
    const surfaceKey = surface.id;
    if (!this.intersectionData.surfaces.has(surfaceKey)) {
      this.intersectionData.surfaces.set(surfaceKey, {
        surfaceId: surface.id,
        surfaceName,
        assemblyName,
        surface,
        intersectionPoints: []
      });
    }
    
    const surfaceData = this.intersectionData.surfaces.get(surfaceKey)!;
    surfaceData.intersectionPoints.push(intersectionRecord);
    
    // Update statistics
    this.intersectionData.totalIntersections++;
    this.intersectionData.wavelengths.add(ray.wavelength);
    this.intersectionData.lightSources.add(Math.floor(ray.lightId));
  }
  
  /**
   * Record that a ray was traced (for statistics)
   */
  recordRayTrace(_ray: Ray): void {
    if (!this.isCollecting) return;
    this.intersectionData.totalRays++;
  }
  
  /**
   * Get all collected intersection data
   */
  getIntersectionData(): RayIntersectionData {
    return {
      surfaces: new Map(this.intersectionData.surfaces),
      totalRays: this.intersectionData.totalRays,
      totalIntersections: this.intersectionData.totalIntersections,
      wavelengths: new Set(this.intersectionData.wavelengths),
      lightSources: new Set(this.intersectionData.lightSources)
    };
  }
  
  /**
   * Get intersection data for a specific surface
   */
  getSurfaceIntersectionData(surfaceId: string): SurfaceIntersectionData | undefined {
    return this.intersectionData.surfaces.get(surfaceId);
  }
  
  /**
   * Get list of all surfaces with intersection data
   */
  getAvailableSurfaces(): Array<{id: string, name: string, assemblyName?: string, intersectionCount: number}> {
    const surfaces: Array<{id: string, name: string, assemblyName?: string, intersectionCount: number}> = [];
    
    for (const [surfaceId, surfaceData] of this.intersectionData.surfaces) {
      surfaces.push({
        id: surfaceId,
        name: surfaceData.surfaceName,
        assemblyName: surfaceData.assemblyName,
        intersectionCount: surfaceData.intersectionPoints.length
      });
    }
    
    // Sort by intersection count (descending) then by name
    return surfaces.sort((a, b) => {
      if (b.intersectionCount !== a.intersectionCount) {
        return b.intersectionCount - a.intersectionCount;
      }
      return a.name.localeCompare(b.name);
    });
  }
  
  /**
   * Extract surface name from surface object
   */
  private getSurfaceName(surface: OpticalSurface): string {
    // Use the surface ID as the base name
    return surface.id;
  }
  
  /**
   * Extract assembly name from surface object
   */
  private getAssemblyName(surface: OpticalSurface): string | undefined {
    // Check if surface has assembly information
    if ((surface as any).assemblyId) {
      return (surface as any).assemblyId;
    }
    return undefined;
  }
  
  /**
   * Get intersection data statistics
   */
  getStatistics(): {
    totalRays: number;
    totalIntersections: number;
    intersectionRate: number;
    surfaceCount: number;
    wavelengthCount: number;
    lightSourceCount: number;
  } {
    return {
      totalRays: this.intersectionData.totalRays,
      totalIntersections: this.intersectionData.totalIntersections,
      intersectionRate: this.intersectionData.totalRays > 0 ? this.intersectionData.totalIntersections / this.intersectionData.totalRays : 0,
      surfaceCount: this.intersectionData.surfaces.size,
      wavelengthCount: this.intersectionData.wavelengths.size,
      lightSourceCount: this.intersectionData.lightSources.size
    };
  }
  
  // Backward compatibility methods for existing code
  
  /**
   * @deprecated Use getIntersectionData() instead
   */
  getHitData(): RayIntersectionData {
    return this.getIntersectionData();
  }
  
  /**
   * @deprecated Use getSurfaceIntersectionData() instead
   */
  getSurfaceHitData(surfaceId: string): SurfaceIntersectionData | undefined {
    return this.getSurfaceIntersectionData(surfaceId);
  }
}
