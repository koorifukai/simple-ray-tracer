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
  private surfaceOrder: string[] = []; // Track surface insertion order
  private lastLoggedCount = 0; // Track last logged surface count to reduce spam
  
  // Performance optimization: cache surface list to avoid repeated array operations
  private cachedSurfaceList: Array<{id: string, name: string, assemblyName?: string, intersectionCount: number, numericalId?: number}> | null = null;
  private cachedSurfaceCount = 0;
  private cachedTotalIntersections = 0;
  
  private constructor() {}
  
  static getInstance(): RayIntersectionCollector {
    if (!RayIntersectionCollector.instance) {
      RayIntersectionCollector.instance = new RayIntersectionCollector();
    }
    return RayIntersectionCollector.instance;
  }
  
  /**
   * Start collecting ray intersection data
   */
  startCollection(): void {
    const startTime = performance.now();
    this.isCollecting = true;
    this.clearData();
    const endTime = performance.now();
    console.log(`🎯 RayIntersectionCollector: Collection started, data cleared in ${(endTime - startTime).toFixed(2)}ms`);
  }
  
  /**
   * Stop collecting ray intersection data
   */
  stopCollection(): void {
    this.isCollecting = false;
    console.log('🔄 RayIntersectionCollector: Collection stopped');
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
    const beforeCount = this.intersectionData.totalIntersections;
    const beforeSurfaces = this.intersectionData.surfaces.size;
    
    this.intersectionData = {
      surfaces: new Map(),
      totalRays: 0,
      totalIntersections: 0,
      wavelengths: new Set(),
      lightSources: new Set()
    };
    this.surfaceOrder = []; // Clear surface order tracking
    this.lastLoggedCount = 0; // Reset logged count
    
    // Invalidate cache
    this.cachedSurfaceList = null;
    this.cachedSurfaceCount = 0;
    this.cachedTotalIntersections = 0;
    
    console.log(`🧹 RayIntersectionCollector: Cleared data - removed ${beforeCount} intersections from ${beforeSurfaces} surfaces`);
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
    exitDirection?: Vector3,
    localHitPoint?: Vector3  // Add local coordinates parameter
  ): void {
    if (!this.isCollecting) {
      console.log('🔕 RayIntersectionCollector: Not collecting, ignoring hit');
      return;
    }
    
    if (!isValid) {
      console.log('🔕 RayIntersectionCollector: Invalid hit, ignoring');
      return;
    }
    
    console.log(`🎯 RayIntersectionCollector: Recording hit on surface ${surface.id} (numerical ID: ${surface.numericalId})`);
    console.log(`🎯 RayIntersectionCollector: Local hit point: (${localHitPoint?.x.toFixed(3)}, ${localHitPoint?.y.toFixed(3)}, ${localHitPoint?.z.toFixed(3)})`);
    console.log(`🎯 RayIntersectionCollector: Global hit point: (${hitPoint.x.toFixed(3)}, ${hitPoint.y.toFixed(3)}, ${hitPoint.z.toFixed(3)})`);
    
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
      
      // Calculate cross-section coordinates in local surface coordinate system
      // MUST use provided local coordinates - no fallback transformation
      crossSectionY: localHitPoint ? 
        (console.log(`✅ RayIntersectionCollector: Using direct local coordinates Y=${localHitPoint.y.toFixed(3)} for surface ${surface.id}`), localHitPoint.y) : 
        (console.error(`❌ MISSING LOCAL COORDINATES for surface ${surface.id} - intersection points will be incorrect!`), 0),
      crossSectionZ: localHitPoint ? 
        (console.log(`✅ RayIntersectionCollector: Using direct local coordinates Z=${localHitPoint.z.toFixed(3)} for surface ${surface.id}`), localHitPoint.z) : 
        (console.error(`❌ MISSING LOCAL COORDINATES for surface ${surface.id} - intersection points will be incorrect!`), 0)
    };
    
    // Use numerical ID as the primary storage key
    const surfaceKey = surface.numericalId?.toString() || surface.id;
    if (!this.intersectionData.surfaces.has(surfaceKey)) {
      this.intersectionData.surfaces.set(surfaceKey, {
        surfaceId: surface.id,
        surfaceName,
        assemblyName,
        surface,
        intersectionPoints: []
      });
      // Track surface insertion order for consistent display
      this.surfaceOrder.push(surfaceKey);
    }
    
    const surfaceData = this.intersectionData.surfaces.get(surfaceKey)!;
    surfaceData.intersectionPoints.push(intersectionRecord);
    
    // Update statistics
    this.intersectionData.totalIntersections++;
    this.intersectionData.wavelengths.add(ray.wavelength);
    this.intersectionData.lightSources.add(Math.floor(ray.lightId));
    
    console.log(`📊 RayIntersectionCollector: Total intersections: ${this.intersectionData.totalIntersections}, Surface: ${surface.id} (numerical: ${surface.numericalId})`);
  }
  
  /**
   * Record that a ray was traced (for statistics)
   */
  recordRayTrace(_ray: Ray): void {
    if (!this.isCollecting) return;
    this.intersectionData.totalRays++;
    
    if (this.intersectionData.totalRays % 10 === 0) {
      console.log(`📊 RayIntersectionCollector: Total rays traced: ${this.intersectionData.totalRays}`);
    }
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
   * Get intersection data for a specific surface by numerical ID or string ID
   */
  getSurfaceIntersectionData(surfaceId: string): SurfaceIntersectionData | undefined {
    console.log(`🔍 RayIntersectionCollector: Looking for surface "${surfaceId}"`);
    console.log(`🔍 Available surface keys in storage:`, Array.from(this.intersectionData.surfaces.keys()));
    
    // First try exact match (for numerical IDs)
    let surfaceData = this.intersectionData.surfaces.get(surfaceId);
    
    if (!surfaceData) {
      // If no exact match, try to find by string ID (fallback)
      for (const [, data] of this.intersectionData.surfaces) {
        if (data.surfaceId === surfaceId || data.surface.id === surfaceId) {
          console.log(`🔍 Found surface by string ID match: ${data.surface.id} (numerical: ${data.surface.numericalId})`);
          surfaceData = data;
          break;
        }
      }
    }
    
    console.log(`🔍 RayIntersectionCollector: Surface lookup for "${surfaceId}" - ${surfaceData ? 'FOUND' : 'NOT FOUND'}`);
    if (surfaceData) {
      console.log(`🔍 Found surface details: string ID="${surfaceData.surface.id}", numerical ID=${surfaceData.surface.numericalId}`);
    }
    return surfaceData;
  }
  
  /**
   * Get list of all surfaces with intersection data
   * OPTIMIZED: Cached result with invalidation strategy
   */
  getAvailableSurfaces(): Array<{id: string, name: string, assemblyName?: string, intersectionCount: number, numericalId?: number}> {
    // Cache the result to avoid repeated array operations during monitoring
    const currentCount = this.intersectionData.surfaces.size;
    const currentTotalIntersections = this.intersectionData.totalIntersections;
    
    // Only rebuild the array if the data has actually changed
    if (this.cachedSurfaceList && 
        this.cachedSurfaceCount === currentCount && 
        this.cachedTotalIntersections === currentTotalIntersections) {
      return this.cachedSurfaceList;
    }
    
    const surfaces: Array<{id: string, name: string, assemblyName?: string, intersectionCount: number, numericalId?: number}> = [];
    
    // Use surface insertion order to preserve optical train sequence
    for (const surfaceId of this.surfaceOrder) {
      const surfaceData = this.intersectionData.surfaces.get(surfaceId);
      if (surfaceData) {
        surfaces.push({
          id: surfaceId, // This is now the numerical ID or fallback string ID
          name: surfaceData.surfaceName,
          assemblyName: surfaceData.assemblyName,
          intersectionCount: surfaceData.intersectionPoints.length,
          numericalId: surfaceData.surface.numericalId
        });
      }
    }
    
    // Cache the result
    this.cachedSurfaceList = surfaces;
    this.cachedSurfaceCount = currentCount;
    this.cachedTotalIntersections = currentTotalIntersections;
    
    // Only log when explicitly requested or when surface count changes significantly
    if (surfaces.length !== this.lastLoggedCount) {
      console.log(`📊 RayIntersectionCollector: Available surfaces (${surfaces.length}):`, 
        surfaces.map(s => `${s.id} (${s.name}, numerical: ${s.numericalId})`));
      this.lastLoggedCount = surfaces.length;
    }
    
    return surfaces;
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
}
