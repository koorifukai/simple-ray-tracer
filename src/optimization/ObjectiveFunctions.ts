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
  private static lastYamlContent: string | undefined;
  
  /**
   * Evaluate objective function for given YAML content and settings
   */
  static async evaluate(yamlContent: string, settings: OptimizationSettings): Promise<ObjectiveResult> {
    // Reset evaluation counter on new YAML (detect by checking if this is a fresh evaluation)
    if (!ObjectiveFunctions.lastYamlContent || ObjectiveFunctions.lastYamlContent !== yamlContent) {
      ObjectiveFunctions.evaluationCounter = 0;
      ObjectiveFunctions.lastYamlContent = yamlContent;
    }

    try {
      // Parse optical system from substituted YAML
      const system = await OpticalSystemParser.parseYAML(yamlContent);
      
      // Evaluate based on optimization mode
      switch (settings.mode) {
        case 'aberrations': {
          // Get target surface based on obj setting (static surface order by X position)
          const targetSurface = ObjectiveFunctions.getTargetSurface(system, settings.obj);
          if (!targetSurface) {
            return {
              value: 1000.0,
              valid: false,
              details: 'Target surface not found'
            };
          }
          const rayResults = ObjectiveFunctions.traceSystemRays(system, targetSurface);
          return ObjectiveFunctions.evaluateAberrations(rayResults);
        }
        case 'angle': {
          // For angle mode, use the actual ray hit map order
          // obj: -1 means last surface each ray hits, -2 means second-to-last, etc.
          const targetAngleFromNormal = typeof settings.param === 'number' ? settings.param : 0;
          const rayResults = ObjectiveFunctions.traceSystemRaysForAngleMode(system, settings.obj);
          return ObjectiveFunctions.evaluateAngle(rayResults, targetAngleFromNormal);
        }
        case 'centering': {
          const targetSurface = ObjectiveFunctions.getTargetSurface(system, settings.obj);
          if (!targetSurface) {
            return {
              value: 1000.0,
              valid: false,
              details: 'Target surface not found'
            };
          }
          const axisParam = typeof settings.param === 'string' ? settings.param.toUpperCase() : 'YZ';
          const rayResults = ObjectiveFunctions.traceSystemRays(system, targetSurface);
          return ObjectiveFunctions.evaluateCentering(rayResults, targetSurface, axisParam);
        }
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
    
    if (objIndex < 0) {
      // Negative indexing from end
      const index = surfaces.length + objIndex;
      const targetSurface = index >= 0 ? surfaces[index] : null;
      // Negative indexing
      return targetSurface;
    } else {
      // Positive indexing from start
      const targetSurface = objIndex < surfaces.length ? surfaces[objIndex] : null;
      // Positive indexing
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
    // Reset evaluation counter on each new optimization run
    ObjectiveFunctions.evaluationCounter = 0;
    
    // Track evaluation calls for debugging duplication
    ObjectiveFunctions.evaluationCounter++;
    // console.log(`🔄 Evaluation #${ObjectiveFunctions.evaluationCounter} starting`);

    const results: Array<{
      sourceRays: Ray[];
      tracedPaths: Ray[][];
      targetIntersections: Array<{ point: Vector3; normal: Vector3; ray: Ray; valid: boolean }>;
    }> = [];
    
    const orderedSurfaces = OpticalSystemParser.getSurfacesInOrder(system);
    
    // Optimization target surface identified
    
    // Clear and prepare ray intersection collector
    const collector = RayIntersectionCollector.getInstance();
    collector.clearData();
    collector.startCollection(true);
    
    // Trace rays from each light source
    system.lightSources.forEach((lightSource) => {
      const source = lightSource as any;
      const sourceRays = source.generateRays(source.numberOfRays);
      const tracedPaths: Ray[][] = [];
      const targetIntersections: Array<{ point: Vector3; normal: Vector3; ray: Ray; valid: boolean }> = [];
      
      // Reset first ray tracking for cleaner logging during optimization
      RayTracer.resetFirstRayTracking();
      
      sourceRays.forEach((ray: Ray) => {
        try {
          const rayPathCollection = RayTracer.traceRaySequential(ray, orderedSurfaces);
          // Convert structured collection to legacy format for optimization compatibility
          const legacyPaths = rayPathCollection.getAllPaths().map(path => path.rays);
          tracedPaths.push(...legacyPaths);
          
          // Extract intersection with TARGET surface from collector using same key logic as collector
          const intersectionData = collector.getIntersectionData();
          
          // Use same key logic as RayIntersectionCollector: numericalId?.toString() || surface.id
          const targetSurfaceKey = targetSurface.numericalId?.toString() || targetSurface.id;
          const targetSurfaceData = intersectionData.surfaces.get(targetSurfaceKey);
          
          if (targetSurfaceData && targetSurfaceData.intersectionPoints.length > 0) {
            const hit = targetSurfaceData.intersectionPoints[targetSurfaceData.intersectionPoints.length - 1]; // Get last intersection
            
            // CRITICAL FIX: For absorption surfaces (detectors), accept rays even if marked as "blocked"
            // because they may be blocked AFTER hitting the detector (which is correct behavior)
            const isAbsorptionSurface = targetSurface.mode === 'absorption';
            const isValidHit = hit.isValid && (isAbsorptionSurface || !hit.wasBlocked);
            
            // CRITICAL: Use the FINAL ray segment from traced paths
            // This is the ray segment AFTER all refractions/reflections from previous surfaces
            const finalPath = tracedPaths.length > 0 ? tracedPaths[tracedPaths.length - 1] : [];
            const finalRaySegment = finalPath.length > 0 ? finalPath[finalPath.length - 1] : ray;
            
            targetIntersections.push({
              point: new Vector3(hit.hitPoint.x, hit.hitPoint.y, hit.hitPoint.z),
              normal: new Vector3(hit.hitNormal.x, hit.hitNormal.y, hit.hitNormal.z),
              ray: finalRaySegment, // Use the final ray segment, not the original source ray
              valid: isValidHit
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
   * Trace rays for angle mode optimization
   * Uses the actual ray hit map order to determine target surface per ray
   * surfaceIndexFromEnd: -1 = last surface each ray hits, -2 = second-to-last, etc.
   */
  private static traceSystemRaysForAngleMode(
    system: OpticalSystem,
    surfaceIndexFromEnd: number
  ): Array<{
    sourceRays: Ray[];
    tracedPaths: Ray[][];
    targetIntersections: Array<{ point: Vector3; normal: Vector3; ray: Ray; valid: boolean }>;
  }> {
    ObjectiveFunctions.evaluationCounter++;
    
    console.log(`[AngleMode] === traceSystemRaysForAngleMode called, surfaceIndexFromEnd=${surfaceIndexFromEnd} ===`);
    console.log(`[AngleMode] Light sources: ${system.lightSources.length}, Surfaces: ${system.surfaces.length}`);

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
    system.lightSources.forEach((lightSource) => {
      const source = lightSource as any;
      const sourceRays = source.generateRays(source.numberOfRays);
      const tracedPaths: Ray[][] = [];
      const targetIntersections: Array<{ point: Vector3; normal: Vector3; ray: Ray; valid: boolean }> = [];
      
      RayTracer.resetFirstRayTracking();
      
      let rayIndex = 0;
      const logFirstN = 3; // Log details for first N rays
      
      sourceRays.forEach((ray: Ray) => {
        try {
          // Clear collector for this individual ray to track its specific hit sequence
          collector.clearData();
          
          const rayPathCollection = RayTracer.traceRaySequential(ray, orderedSurfaces);
          const legacyPaths = rayPathCollection.getAllPaths().map(path => path.rays);
          tracedPaths.push(...legacyPaths);
          
          // Get the surface hit order for THIS ray from the collector
          const intersectionData = collector.getIntersectionData();
          const hitSurfaceKeys = collector.getAvailableSurfaces();
          
          const shouldLog = rayIndex < logFirstN;
          
          if (shouldLog) {
            console.log(`[AngleMode] Ray ${rayIndex}: Hit ${hitSurfaceKeys.length} surfaces:`, 
              hitSurfaceKeys.map(s => `${s.name}(${s.id})`).join(' -> '));
          }
          
          if (hitSurfaceKeys.length === 0) {
            if (shouldLog) console.log(`[AngleMode] Ray ${rayIndex}: No surfaces hit, skipping`);
            rayIndex++;
            return; // Ray didn't hit any surface
          }
          
          // surfaceIndexFromEnd is negative: -1 = last, -2 = second-to-last
          const targetIndex = hitSurfaceKeys.length + surfaceIndexFromEnd;
          if (targetIndex < 0 || targetIndex >= hitSurfaceKeys.length) {
            if (shouldLog) console.log(`[AngleMode] Ray ${rayIndex}: targetIndex ${targetIndex} out of bounds`);
            rayIndex++;
            return; // Index out of bounds
          }
          
          const targetSurfaceKey = hitSurfaceKeys[targetIndex].id;
          const targetSurfaceData = intersectionData.surfaces.get(targetSurfaceKey);
          
          if (shouldLog) {
            console.log(`[AngleMode] Ray ${rayIndex}: surfaceIndexFromEnd=${surfaceIndexFromEnd}, targetIndex=${targetIndex}, targetSurface=${hitSurfaceKeys[targetIndex].name}(${targetSurfaceKey})`);
          }
          
          if (targetSurfaceData && targetSurfaceData.intersectionPoints.length > 0) {
            // Get the last intersection on this target surface
            const hit = targetSurfaceData.intersectionPoints[targetSurfaceData.intersectionPoints.length - 1];
            
            // For absorption surfaces, accept rays even if marked as "blocked"
            const isAbsorptionSurface = targetSurfaceData.surface.mode === 'absorption';
            const isValidHit = hit.isValid && (isAbsorptionSurface || !hit.wasBlocked);
            
            // Use the FINAL ray segment from traced paths
            const finalPath = legacyPaths.length > 0 ? legacyPaths[legacyPaths.length - 1] : [];
            const finalRaySegment = finalPath.length > 0 ? finalPath[finalPath.length - 1] : ray;
            
            if (shouldLog) {
              console.log(`[AngleMode] Ray ${rayIndex}: Hit point=(${hit.hitPoint.x.toFixed(3)}, ${hit.hitPoint.y.toFixed(3)}, ${hit.hitPoint.z.toFixed(3)})`);
              console.log(`[AngleMode] Ray ${rayIndex}: Hit normal=(${hit.hitNormal.x.toFixed(6)}, ${hit.hitNormal.y.toFixed(6)}, ${hit.hitNormal.z.toFixed(6)})`);
              console.log(`[AngleMode] Ray ${rayIndex}: Final ray dir=(${finalRaySegment.direction.x.toFixed(6)}, ${finalRaySegment.direction.y.toFixed(6)}, ${finalRaySegment.direction.z.toFixed(6)})`);
              console.log(`[AngleMode] Ray ${rayIndex}: isValidHit=${isValidHit}, isAbsorption=${isAbsorptionSurface}, wasBlocked=${hit.wasBlocked}`);
            }
            
            targetIntersections.push({
              point: new Vector3(hit.hitPoint.x, hit.hitPoint.y, hit.hitPoint.z),
              normal: new Vector3(hit.hitNormal.x, hit.hitNormal.y, hit.hitNormal.z),
              ray: finalRaySegment,
              valid: isValidHit
            });
          } else {
            if (shouldLog) console.log(`[AngleMode] Ray ${rayIndex}: No intersection data for target surface`);
          }
          
        } catch (error) {
          console.warn(`Ray tracing failed for angle optimization:`, error);
        }
        rayIndex++;
      });
      
      results.push({
        sourceRays,
        tracedPaths,
        targetIntersections
      });
      
      console.log(`[AngleMode] Light source done: ${sourceRays.length} rays, ${targetIntersections.length} valid intersections collected`);
    });
    
    collector.stopCollection();
    
    const totalIntersections = results.reduce((sum, r) => sum + r.targetIntersections.length, 0);
    console.log(`[AngleMode] === Tracing complete: ${totalIntersections} total intersections ===`);
    
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
      
      // console.log(`Light source ${sourceIndex}: Centroid Y=${centroidY.toFixed(6)}, Z=${centroidZ.toFixed(6)}`);
      
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
      
      // console.log(`Light source ${sourceIndex}: RMS = ${rmsSpotSize.toFixed(6)}, hits = ${validHits.length}`);
      
      // Add this source's contribution to total RMS (sum of squares for proper combining)
      totalRmsSquared += rmsSpotSize * rmsSpotSize;
      totalValidSources++;
    });
    
    if (totalValidSources === 0) {
      console.warn('No light sources produced sufficient valid hits on target surface');
      return {
        value: 10000.0, // MUCH STRONGER penalty for missing rays
        valid: false,
        rayCount: totalValidHits,
        details: 'No light sources produced sufficient valid hits on target surface'
      };
    }
    
    // Combined RMS across all light sources
    let combinedRms = Math.sqrt(totalRmsSquared);
    
    // Add penalty for rays that miss the target surface
    const missedRayFraction = (totalRays - totalValidHits) / totalRays;
    if (missedRayFraction > 0) {
      const MISSED_RAY_PENALTY = 1.0; // Penalty per missed ray fraction (in RMS units)
      const missedRayPenalty = missedRayFraction * MISSED_RAY_PENALTY;
      combinedRms += missedRayPenalty;
      // console.log(`⚠️  ${totalValidHits}/${totalRays} rays hit target (${(missedRayFraction*100).toFixed(1)}% missed), adding penalty: ${missedRayPenalty.toFixed(6)}`);
    }
    
    // Final sanity check
    if (!isFinite(combinedRms) || isNaN(combinedRms)) {
      console.error(`Invalid combined RMS: ${combinedRms}`);
      console.error(`  Total RMS squared: ${totalRmsSquared}`);
      console.error(`  Valid sources: ${totalValidSources}`);
      return {
        value: 10000.0, // Use stronger penalty
        valid: false,
        rayCount: totalValidHits,
        details: 'Numerical instability in RMS calculation'
      };
    }
    
    // console.log(`Combined RMS: ${combinedRms.toFixed(6)} from ${totalValidSources} sources`);
    
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
   * Evaluate angle mode (deviation from target incidence angle at surface)
   * targetAngleDegrees: angle between ray and surface normal (0° = normal incidence, 90° = grazing)
   * Uses surface normals directly - no coordinate transformations needed
   */
  private static evaluateAngle(
    rayResults: Array<{
      sourceRays: Ray[];
      tracedPaths: Ray[][];
      targetIntersections: Array<{ point: Vector3; normal: Vector3; ray: Ray; valid: boolean }>;
    }>,
    targetAngleDegrees: number = 0
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
      console.log(`[AngleMode] ❌ No valid intersections found`);
      return {
        value: 10000.0, // MUCH STRONGER penalty for missing rays
        valid: false,
        rayCount: 0,
        details: 'No rays reaching target surface'
      };
    }
    
    const targetAngleClamped = Math.max(0, Math.min(90, targetAngleDegrees));
    console.log(`[AngleMode] ✅ ${validIntersections.length}/${totalRays} valid intersections, target angle = ${targetAngleClamped.toFixed(1)}°`);
    
    const targetCos = Math.cos(targetAngleClamped * Math.PI / 180);
    console.log(`[AngleMode] Target cos(angle) = ${targetCos.toFixed(4)}`);
    
    // Calculate cosines for each ray using surface normals directly (both in global coordinates)
    const stats = validIntersections.map((intersection, i) => {
      // Get normalized ray direction and surface normal (both in global coordinates)
      // rayDir needs to be explicitly converted to our local Vector3 type for the dot product
      const rayDirRaw = intersection.ray.direction.normalize();
      const rayDir = new Vector3(rayDirRaw.x, rayDirRaw.y, rayDirRaw.z);
      const surfaceNormal = intersection.normal.normalize();
      
      // Calculate dot product. Use Math.abs because normal might point "with" or "against" the ray,
      // and we just want the intersection angle between 0 and 90 degrees (cos from 1 to 0)
      const actualCos = Math.abs(surfaceNormal.dot(rayDir));
      
      // Cosine deviation from target cosine  
      const cosDeviation = actualCos - targetCos;
      
      // Log first few ray calculations
      if (i < 3) {
        console.log(`[AngleMode] Ray ${i}: rayDir=(${rayDir.x.toFixed(6)}, ${rayDir.y.toFixed(6)}, ${rayDir.z.toFixed(6)}), normal=(${surfaceNormal.x.toFixed(6)}, ${surfaceNormal.y.toFixed(6)}, ${surfaceNormal.z.toFixed(6)})`);
        console.log(`[AngleMode] Ray ${i}: actualCos=${actualCos.toFixed(6)}, cosDeviation=${cosDeviation.toFixed(6)}`);
      }
      
      return { actualCos, cosDeviation };
    });
    
    // Use RMS cosine deviation as objective
    const meanSquaredCosDeviation = stats.reduce(
      (sum, item) => sum + item.cosDeviation * item.cosDeviation, 0
    ) / stats.length;
    const rmsCosDeviation = Math.sqrt(meanSquaredCosDeviation);
    
    let objective = rmsCosDeviation;
    
    // Add penalty for rays that miss the target surface
    const missedRayFraction = (totalRays - validIntersections.length) / totalRays;
    if (missedRayFraction > 0) {
      const MISSED_RAY_PENALTY = 2.0; // Penalty in cosine units (max difference is 1, so 2 is strong)
      const missedRayPenalty = missedRayFraction * MISSED_RAY_PENALTY;
      objective += missedRayPenalty;
    }
    
    const avgActualCos = stats.reduce((sum, item) => sum + item.actualCos, 0) / stats.length;
    const avgCosDeviation = stats.reduce((sum, item) => sum + item.cosDeviation, 0) / stats.length;
    
    console.log(`[AngleMode] 📐 Summary: avgCos=${avgActualCos.toFixed(4)}, avgCosDev=${avgCosDeviation.toFixed(4)}, rmsCosDev=${rmsCosDeviation.toFixed(6)}`);
    console.log(`[AngleMode] 📐 Final objective = ${objective.toFixed(6)} (rms=${rmsCosDeviation.toFixed(6)} + missedPenalty=${(objective - rmsCosDeviation).toFixed(6)})`);
    
    return {
      value: objective, // Use RMS cosine deviation as objective
      valid: true,
      rayCount: validIntersections.length,
      details: {
        totalRays,
        validIntersections: validIntersections.length,
        targetAngleDegrees: targetAngleClamped,
        targetCos,
        avgActualCos,
        avgCosDeviation,
        rmsCosDeviation,
        meanSquaredCosDeviation
      }
    };
  }

  /**
   * Evaluate centering mode (minimize distance from surface center in local coordinates)
   * axisParam: 'Y', 'Z', or 'YZ' (default)
   */
  private static evaluateCentering(
    rayResults: Array<{
      sourceRays: Ray[];
      tracedPaths: Ray[][];
      targetIntersections: Array<{ point: Vector3; normal: Vector3; ray: Ray; valid: boolean }>;
    }>,
    targetSurface: OpticalSurface,
    axisParam: string
  ): ObjectiveResult {
    let validIntersections: Array<{ point: Vector3 }> = [];
    let totalRays = 0;
    
    // Collect all valid intersections
    rayResults.forEach(result => {
      totalRays += result.sourceRays.length;
      result.targetIntersections.forEach(intersection => {
        if (intersection.valid) {
          validIntersections.push(intersection);
        }
      });
    });
    
    if (validIntersections.length === 0) {
      console.log(`[CenteringMode] ❌ No valid intersections found`);
      return {
        value: 10000.0, // STRONGER penalty for missing rays
        valid: false,
        rayCount: 0,
        details: 'No rays reaching target surface'
      };
    }
    
    let useY = axisParam.includes('Y');
    let useZ = axisParam.includes('Z');
    if (!useY && !useZ) {
      // Default to YZ if param is invalid or missing
      useY = true;
      useZ = true;
      axisParam = 'YZ';
    }
    
    // Transform all points to local surface coordinates and compute squared distance
    let sumSquaredDistances = 0;
    
    validIntersections.forEach(intersection => {
      // Convert global hit point to surface local coordinates
      const localPoint = targetSurface.forwardTransform.transformPointV3(intersection.point);
      
      let sqDist = 0;
      if (useY) sqDist += localPoint.y * localPoint.y;
      if (useZ) sqDist += localPoint.z * localPoint.z;
      
      sumSquaredDistances += sqDist;
    });
    
    const meanSquaredDistance = sumSquaredDistances / validIntersections.length;
    const rmsDistance = Math.sqrt(meanSquaredDistance);
    
    let objective = rmsDistance;
    
    // Add penalty for rays that miss the target surface
    const missedRayFraction = (totalRays - validIntersections.length) / totalRays;
    if (missedRayFraction > 0) {
      const MISSED_RAY_PENALTY = 50.0; // Moderate physical penalty for missed rays (generic length units)
      const missedRayPenalty = missedRayFraction * MISSED_RAY_PENALTY;
      objective += missedRayPenalty;
    }
    
    console.log(`[CenteringMode] 🎯 Summary: axis=${axisParam}, validHits=${validIntersections.length}/${totalRays}, rmsDistance=${rmsDistance.toFixed(6)}`);
    console.log(`[CenteringMode] 🎯 Final objective = ${objective.toFixed(6)} (rms=${rmsDistance.toFixed(6)} + missedPenalty=${(objective - rmsDistance).toFixed(6)})`);
    
    return {
      value: objective,
      valid: true,
      rayCount: validIntersections.length,
      details: {
        totalRays,
        validIntersections: validIntersections.length,
        axisParam,
        rmsDistance,
        meanSquaredDistance
      }
    };
  }
}
