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
  private static evaluationCounter = 0;
  
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
          value: 1000.0, // Use reasonable penalty instead of MAX_VALUE
          valid: false,
          details: 'Target surface not found'
        };
      }
      
      // Generate and trace rays through the system
      const rayResults = this.traceSystemRays(system, targetSurface);
      
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
        value: 1000.0, // Use reasonable penalty instead of MAX_VALUE
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
    
    console.log(`🔍 Target surface selection: obj=${objIndex}, total surfaces=${surfaces.length}`);
    console.log(`📋 Surface order: ${surfaces.map((s, i) => `[${i}]="${s.id}"`).join(', ')}`);
    
    if (objIndex < 0) {
      // Negative indexing from end
      const index = surfaces.length + objIndex;
      const targetSurface = index >= 0 ? surfaces[index] : null;
      console.log(`🎯 Negative indexing: obj=${objIndex} → index=${index} → surface="${targetSurface?.id || 'NOT_FOUND'}"`);
      return targetSurface;
    } else {
      // Positive indexing from start
      const targetSurface = objIndex < surfaces.length ? surfaces[objIndex] : null;
      console.log(`🎯 Positive indexing: obj=${objIndex} → surface="${targetSurface?.id || 'NOT_FOUND'}"`);
      return targetSurface;
    }
  }
  
  /**
   * Trace rays through the optical system efficiently for optimization
   */
  private static traceSystemRays(system: OpticalSystem, targetSurface: OpticalSurface): Array<{
    sourceRays: Ray[];
    tracedPaths: Ray[][];
    targetIntersections: Array<{ point: Vector3; normal: Vector3; ray: Ray; valid: boolean }>;
  }> {
    // Track evaluation calls for debugging duplication
    ObjectiveFunctions.evaluationCounter++;
    console.log(`🔄 Evaluation #${ObjectiveFunctions.evaluationCounter} starting`);

    const results: Array<{
      sourceRays: Ray[];
      tracedPaths: Ray[][];
      targetIntersections: Array<{ point: Vector3; normal: Vector3; ray: Ray; valid: boolean }>;
    }> = [];
    
    const orderedSurfaces = OpticalSystemParser.getSurfacesInOrder(system);
    
    console.log(`🎯 Optimization target surface: "${targetSurface.id}"`);
    console.log(`📋 Available surfaces: ${orderedSurfaces.map(s => `"${s.id}"`).join(', ')}`);
    
    // Clear and prepare ray intersection collector
    const collector = RayIntersectionCollector.getInstance();
    collector.clearData();
    collector.startCollection(true);
    
    // Trace rays from each light source
    system.lightSources.forEach((lightSource, sourceIndex) => {
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
          
          // Extract intersection with TARGET surface from collector using same key logic as collector
          const intersectionData = collector.getIntersectionData();
          
          // Use same key logic as RayIntersectionCollector: numericalId?.toString() || surface.id
          const targetSurfaceKey = targetSurface.numericalId?.toString() || targetSurface.id;
          const targetSurfaceData = intersectionData.surfaces.get(targetSurfaceKey);
          
          // Debug: Log available surface keys vs target key
          if (sourceIndex === 0 && targetIntersections.length === 0) { // Only log once per light source
            const availableKeys = Array.from(intersectionData.surfaces.keys());
            console.log(`🔍 Target key: "${targetSurfaceKey}" (numericalId=${targetSurface.numericalId}, id="${targetSurface.id}")`);
            console.log(`📋 Available keys in collector: [${availableKeys.map(k => `"${k}"`).join(', ')}]`);
          }
          
          // Debug: Check if surface data exists and has intersections
          if (sourceIndex === 0 && targetIntersections.length < 3) { // Log first few rays
            console.log(`🔍 Ray ${targetIntersections.length}: targetSurfaceData=${!!targetSurfaceData}, intersectionPoints=${targetSurfaceData?.intersectionPoints.length || 0}`);
          }
          
          if (targetSurfaceData && targetSurfaceData.intersectionPoints.length > 0) {
            const hit = targetSurfaceData.intersectionPoints[targetSurfaceData.intersectionPoints.length - 1]; // Get last intersection
            const isValidHit = hit.isValid && !hit.wasBlocked;
            
            // Debug: Log the validation properties to see why rays are invalid
            if (sourceIndex === 0 && targetIntersections.length < 3) { // Log first few rays
              console.log(`🔍 Ray ${targetIntersections.length}: isValid=${hit.isValid}, wasBlocked=${hit.wasBlocked}, final valid=${isValidHit}`);
              console.log(`🔍 Ray ${targetIntersections.length}: hit point=(${hit.hitPoint.x.toFixed(3)}, ${hit.hitPoint.y.toFixed(3)}, ${hit.hitPoint.z.toFixed(3)})`);
            }
            
            targetIntersections.push({
              point: new Vector3(hit.hitPoint.x, hit.hitPoint.y, hit.hitPoint.z),
              normal: new Vector3(hit.hitNormal.x, hit.hitNormal.y, hit.hitNormal.z),
              ray: ray,
              valid: isValidHit
            });
          }
          
        } catch (error) {
          console.warn(`Ray tracing failed for optimization:`, error);
        }
      });
      
      console.log(`🔍 Light source ${sourceIndex}: ${sourceRays.length} rays traced, ${targetIntersections.length} hit target surface "${targetSurface.id}"`);
      
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
   * Uses only Y,Z coordinates (transverse) as per optical engineering convention
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
      
      // Calculate centroid for this light source (Y,Z coordinates only)
      let sumY = 0, sumZ = 0;
      validHits.forEach(intersection => {
        sumY += intersection.point.y;
        sumZ += intersection.point.z;
      });
      const centroidY = sumY / validHits.length;
      const centroidZ = sumZ / validHits.length;
      
      console.log(`Light source ${sourceIndex}: Centroid Y=${centroidY.toFixed(6)}, Z=${centroidZ.toFixed(6)}`);
      
      // Calculate RMS spot size for this light source (transverse coordinates only)
      let sumSquaredDistances = 0;
      validHits.forEach(intersection => {
        const deltaY = intersection.point.y - centroidY;
        const deltaZ = intersection.point.z - centroidZ;
        const squaredDistance = deltaY * deltaY + deltaZ * deltaZ;
        sumSquaredDistances += squaredDistance;
      });
      
      const meanSquaredDistance = sumSquaredDistances / validHits.length;
      const rmsSpotSize = Math.sqrt(meanSquaredDistance);
      
      // Check for numerical issues
      if (!isFinite(rmsSpotSize) || isNaN(rmsSpotSize)) {
        console.error(`Light source ${sourceIndex}: Invalid RMS calculation - ${rmsSpotSize}`);
        console.error(`  Mean squared distance: ${meanSquaredDistance}`);
        console.error(`  Sum squared distances: ${sumSquaredDistances}`);
        console.error(`  Valid hits: ${validHits.length}`);
        return; // Skip this source
      }
      
      console.log(`Light source ${sourceIndex}: RMS = ${rmsSpotSize.toFixed(6)}, hits = ${validHits.length}`);
      
      // Add this source's contribution to total RMS (sum of squares for proper combining)
      totalRmsSquared += rmsSpotSize * rmsSpotSize;
      totalValidSources++;
    });
    
    if (totalValidSources === 0) {
      console.warn('No light sources produced sufficient valid hits on target surface');
      return {
        value: 1000.0, // Use a large but reasonable penalty instead of MAX_VALUE
        valid: false,
        rayCount: totalValidHits,
        details: 'No light sources produced sufficient valid hits on target surface'
      };
    }
    
    // Combined RMS across all light sources
    const combinedRms = Math.sqrt(totalRmsSquared);
    
    // Final sanity check
    if (!isFinite(combinedRms) || isNaN(combinedRms)) {
      console.error(`Invalid combined RMS: ${combinedRms}`);
      console.error(`  Total RMS squared: ${totalRmsSquared}`);
      console.error(`  Valid sources: ${totalValidSources}`);
      return {
        value: 1000.0, // Use a large but reasonable penalty
        valid: false,
        rayCount: totalValidHits,
        details: 'Numerical instability in RMS calculation'
      };
    }
    
    console.log(`Combined RMS: ${combinedRms.toFixed(6)} from ${totalValidSources} sources`);
    
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
        value: 1000.0, // Use reasonable penalty instead of MAX_VALUE
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
