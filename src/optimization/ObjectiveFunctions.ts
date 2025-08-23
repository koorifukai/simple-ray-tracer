/**
 * Objective Functions for Optical System Optimization
 * Implements aberrations (RMS spot size) and angle optimization modes
 */

import { Vector3 } from '../math/Vector3';
import { OpticalSystemParser } from '../optical/OpticalSystem';
import { RayTracer } from '../optical/RayTracer';
import { RayIntersectionCollector } from '../components/RayIntersectionCollector';
import type { OpticalSystem } from '../optical/OpticalSystem';
import type { OpticalSurface } from '../optical/surfaces';
import type { Ray } from '../optical/LightSource';
import type { OptimizationSettings, ObjectiveResult } from './OptimizationTypes';

export class ObjectiveFunctions {
  
  /**
   * Evaluate objective function for given YAML content and settings
   */
  static evaluate(yamlContent: string, settings: OptimizationSettings): ObjectiveResult {
    try {
      // Parse optical system from substituted YAML
      const system = OpticalSystemParser.parseYAML(yamlContent);
      
      // Get target surface based on obj setting
      const targetSurface = this.getTargetSurface(system, settings.obj);
      if (!targetSurface) {
        return {
          value: Number.MAX_VALUE,
          valid: false,
          details: 'Target surface not found'
        };
      }
      
      // Generate and trace rays through the system
      const rayResults = this.traceSystemRays(system);
      
      // Evaluate based on optimization mode
      switch (settings.mode) {
        case 'aberrations':
          return this.evaluateAberrations(rayResults);
        case 'angle':
          return this.evaluateAngle(rayResults, settings.param || 90);
        default:
          throw new Error(`Unknown optimization mode: ${settings.mode}`);
      }
      
    } catch (error) {
      console.warn('Objective function evaluation failed:', error);
      return {
        value: Number.MAX_VALUE,
        valid: false,
        details: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Get target surface based on obj index (-1 = last, -2 = second-to-last, etc.)
   */
  private static getTargetSurface(system: OpticalSystem, objIndex: number): OpticalSurface | null {
    const surfaces = OpticalSystemParser.getSurfacesInOrder(system);
    
    if (objIndex < 0) {
      // Negative indexing from end
      const index = surfaces.length + objIndex;
      return index >= 0 ? surfaces[index] : null;
    } else {
      // Positive indexing from start
      return objIndex < surfaces.length ? surfaces[objIndex] : null;
    }
  }
  
  /**
   * Trace rays through the optical system efficiently for optimization
   */
  private static traceSystemRays(system: OpticalSystem): Array<{
    sourceRays: Ray[];
    tracedPaths: Ray[][];
    targetIntersections: Array<{ point: Vector3; normal: Vector3; ray: Ray; valid: boolean }>;
  }> {
    const results: Array<{
      sourceRays: Ray[];
      tracedPaths: Ray[][];
      targetIntersections: Array<{ point: Vector3; normal: Vector3; ray: Ray; valid: boolean }>;
    }> = [];
    
    const orderedSurfaces = OpticalSystemParser.getSurfacesInOrder(system);
    
    // Clear and prepare ray intersection collector
    const collector = RayIntersectionCollector.getInstance();
    collector.clearData();
    collector.startCollection(true);
    
    // Trace rays from each light source
    system.lightSources.forEach(lightSource => {
      const source = lightSource as any;
      const sourceRays = source.generateRays(source.numberOfRays);
      const tracedPaths: Ray[][] = [];
      const targetIntersections: Array<{ point: Vector3; normal: Vector3; ray: Ray; valid: boolean }> = [];
      
      // Reset first ray tracking for cleaner logging during optimization
      RayTracer.resetFirstRayTracking();
      
      sourceRays.forEach((ray: Ray) => {
        try {
          const rayPath = RayTracer.traceRaySequential(ray, orderedSurfaces);
          tracedPaths.push(rayPath);
          
          // Extract intersection with target surface from collector
          // This is more efficient than re-calculating intersections
          const intersectionData = collector.getIntersectionData();
          const targetSurfaceId = orderedSurfaces[orderedSurfaces.length - 1]?.id;
          const targetSurfaceData = intersectionData.surfaces.get(targetSurfaceId || '');
          
          if (targetSurfaceData && targetSurfaceData.intersectionPoints.length > 0) {
            const hit = targetSurfaceData.intersectionPoints[targetSurfaceData.intersectionPoints.length - 1]; // Get last intersection
            targetIntersections.push({
              point: new Vector3(hit.hitPoint.x, hit.hitPoint.y, hit.hitPoint.z),
              normal: new Vector3(hit.hitNormal.x, hit.hitNormal.y, hit.hitNormal.z),
              ray: ray,
              valid: hit.isValid && !hit.wasBlocked
            });
          }
          
        } catch (error) {
          console.warn(`Ray tracing failed for optimization:`, error);
        }
      });
      
      results.push({
        sourceRays,
        tracedPaths,
        targetIntersections
      });
    });
    
    collector.stopCollection();
    
    return results;
  }
  
  /**
   * Evaluate aberrations mode (RMS spot size on target surface)
   * Calculate RMS for each light source separately, then sum them
   */
  private static evaluateAberrations(
    rayResults: Array<{
      sourceRays: Ray[];
      tracedPaths: Ray[][];
      targetIntersections: Array<{ point: Vector3; normal: Vector3; ray: Ray; valid: boolean }>;
    }>
  ): ObjectiveResult {
    let totalRmsSquared = 0;
    let totalValidSources = 0;
    let totalRays = 0;
    let totalValidHits = 0;
    
    // Calculate RMS for each light source separately
    rayResults.forEach((result, sourceIndex) => {
      const validHits = result.targetIntersections.filter(intersection => intersection.valid);
      totalRays += result.sourceRays.length;
      totalValidHits += validHits.length;
      
      if (validHits.length < 2) {
        console.warn(`Light source ${sourceIndex}: insufficient rays (${validHits.length}) reaching target surface`);
        return; // Skip this source
      }
      
      // Calculate centroid for this light source
      const centroid = validHits.reduce(
        (sum, intersection) => sum.add(intersection.point),
        new Vector3(0, 0, 0)
      ).multiply(1 / validHits.length);
      
      // Calculate RMS spot size for this light source
      const squaredDistances = validHits.map(intersection => {
        const diff = intersection.point.subtract(centroid);
        return diff.x * diff.x + diff.y * diff.y + diff.z * diff.z;
      });
      
      const meanSquaredDistance = squaredDistances.reduce((sum, dist) => sum + dist, 0) / squaredDistances.length;
      const rmsSpotSize = Math.sqrt(meanSquaredDistance);
      
      console.log(`Light source ${sourceIndex}: RMS = ${rmsSpotSize.toFixed(6)}, hits = ${validHits.length}`);
      
      // Add this source's contribution to total RMS (sum of squares for proper combining)
      totalRmsSquared += rmsSpotSize * rmsSpotSize;
      totalValidSources++;
    });
    
    if (totalValidSources === 0) {
      return {
        value: Number.MAX_VALUE,
        valid: false,
        rayCount: totalValidHits,
        details: 'No light sources produced sufficient valid hits on target surface'
      };
    }
    
    // Combined RMS across all light sources
    const combinedRms = Math.sqrt(totalRmsSquared);
    
    return {
      value: combinedRms,
      valid: true,
      rayCount: totalValidHits,
      details: {
        totalRays,
        totalValidHits,
        validSources: totalValidSources,
        combinedRms,
        perSourceRms: totalRmsSquared / totalValidSources
      }
    };
  }
  
  /**
   * Evaluate angle mode (deviation from target angle at surface)
   */
  private static evaluateAngle(
    rayResults: Array<{
      sourceRays: Ray[];
      tracedPaths: Ray[][];
      targetIntersections: Array<{ point: Vector3; normal: Vector3; ray: Ray; valid: boolean }>;
    }>,
    targetAngleDegrees: number = 90
  ): ObjectiveResult {
    let validIntersections: Array<{ point: Vector3; normal: Vector3; ray: Ray }> = [];
    let totalRays = 0;
    
    // Collect all valid intersections with ray directions
    rayResults.forEach(result => {
      totalRays += result.sourceRays.length;
      result.targetIntersections.forEach(intersection => {
        if (intersection.valid) {
          validIntersections.push(intersection);
        }
      });
    });
    
    if (validIntersections.length === 0) {
      return {
        value: Number.MAX_VALUE,
        valid: false,
        rayCount: 0,
        details: 'No rays reaching target surface'
      };
    }
    
    const targetAngleRad = targetAngleDegrees * Math.PI / 180;
    
    // Calculate angle deviations for each ray
    const angleDeviations = validIntersections.map(intersection => {
      // Get ray direction at intersection (from the traced path)
      const rayDirection = intersection.ray.direction.normalize();
      const surfaceNormal = intersection.normal.normalize();
      
      // Calculate angle between ray and surface normal
      const cosAngle = Math.abs(rayDirection.dot(surfaceNormal));
      const actualAngle = Math.acos(Math.min(1, cosAngle));
      
      // Calculate deviation from target angle
      const deviation = Math.abs(actualAngle - targetAngleRad);
      return deviation;
    });
    
    // Use RMS of angle deviations as objective
    const meanSquaredDeviation = angleDeviations.reduce(
      (sum, dev) => sum + dev * dev, 0
    ) / angleDeviations.length;
    
    const rmsAngleDeviation = Math.sqrt(meanSquaredDeviation);
    
    return {
      value: rmsAngleDeviation,
      valid: true,
      rayCount: validIntersections.length,
      details: {
        totalRays,
        validIntersections: validIntersections.length,
        targetAngleDegrees,
        rmsAngleDeviationDegrees: rmsAngleDeviation * 180 / Math.PI,
        maxDeviationDegrees: Math.max(...angleDeviations) * 180 / Math.PI
      }
    };
  }
}
