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
      
      // Get target surface based on obj setting
      const targetSurface = ObjectiveFunctions.getTargetSurface(system, settings.obj);
      if (!targetSurface) {
        return {
          value: 1000.0, // Use reasonable penalty instead of MAX_VALUE
          valid: false,
          details: 'Target surface not found'
        };
      }
      
      // Debug: Log target surface details
      // Target surface details
      console.log(`📋 Total surfaces in system: ${system.surfaces.length}`);

      // Generate and trace rays through the system
      const rayResults = ObjectiveFunctions.traceSystemRays(system, targetSurface);
      
      // Evaluate based on optimization mode
      switch (settings.mode) {
        case 'aberrations':
          return ObjectiveFunctions.evaluateAberrations(rayResults);
        case 'angle':
          // param = angle from normal in degrees
          // param = 0 means normal incidence (0° from normal, perpendicular to surface)
          // param = 90 means grazing incidence (90° from normal, parallel to surface)  
          const targetAngleFromNormal = typeof settings.param === 'number' ? settings.param : 0;
          return ObjectiveFunctions.evaluateAngle(rayResults, targetAngleFromNormal);
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
    console.log(`🔄 Evaluation #${ObjectiveFunctions.evaluationCounter} starting`);

    const results: Array<{
      sourceRays: Ray[];
      tracedPaths: Ray[][];
      targetIntersections: Array<{ point: Vector3; normal: Vector3; ray: Ray; valid: boolean }>;
    }> = [];
    
    const orderedSurfaces = OpticalSystemParser.getSurfacesInOrder(system);
    
    // Optimization target surface identified
    console.log(`📋 Available surfaces: ${orderedSurfaces.map(s => `"${s.id}"`).join(', ')}`);
    console.log(`🔍 Target surface details: mode="${targetSurface.mode}", shape="${targetSurface.shape}", numericalId=${targetSurface.numericalId}, index=${orderedSurfaces.indexOf(targetSurface)}`);
    
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
          const rayPathCollection = RayTracer.traceRaySequential(ray, orderedSurfaces);
          // Convert structured collection to legacy format for optimization compatibility
          const legacyPaths = rayPathCollection.getAllPaths().map(path => path.rays);
          tracedPaths.push(...legacyPaths);
          
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
            // Collector statistics
          }
          
          // Debug: Check if surface data exists and has intersections
          if (sourceIndex === 0 && targetIntersections.length < 3) { // Log first few rays
            console.log(`🔍 Ray ${targetIntersections.length}: targetSurfaceData=${!!targetSurfaceData}, intersectionPoints=${targetSurfaceData?.intersectionPoints.length || 0}`);
            if (targetSurfaceData && targetSurfaceData.intersectionPoints.length > 0) {
              const hit = targetSurfaceData.intersectionPoints[targetSurfaceData.intersectionPoints.length - 1];
              console.log(`🔍 Ray ${targetIntersections.length}: Last intersection at surface "${targetSurface.id}" - hitPoint=(${hit.hitPoint.x.toFixed(3)}, ${hit.hitPoint.y.toFixed(3)}, ${hit.hitPoint.z.toFixed(3)})`);
            } else {
              console.log(`🔍 Ray ${targetIntersections.length}: No intersection data found for surface "${targetSurface.id}"`);
              if (targetSurfaceData) {
                console.log(`🔍 Ray ${targetIntersections.length}: Surface data exists but has ${targetSurfaceData.intersectionPoints.length} intersection points`);
              } else {
                console.log(`🔍 Ray ${targetIntersections.length}: No surface data found for key "${targetSurfaceKey}"`);
              }
            }
          }
          
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
            
            // Debug: Log the validation properties to see why rays are invalid
            if (sourceIndex === 0 && targetIntersections.length < 3) { // Log first few rays
              console.log(`🔍 Ray ${targetIntersections.length}: isValid=${hit.isValid}, wasBlocked=${hit.wasBlocked}, isAbsorption=${isAbsorptionSurface}, final valid=${isValidHit}`);
              console.log(`🔍 Ray ${targetIntersections.length}: hit point=(${hit.hitPoint.x.toFixed(3)}, ${hit.hitPoint.y.toFixed(3)}, ${hit.hitPoint.z.toFixed(3)})`);
              console.log(`🔍 Ray ${targetIntersections.length}: tracedPaths length=${tracedPaths.length}, using final segment`);
              console.log(`🔍 Ray ${targetIntersections.length}: final ray dir=(${finalRaySegment.direction.x.toFixed(3)}, ${finalRaySegment.direction.y.toFixed(3)}, ${finalRaySegment.direction.z.toFixed(3)})`);
            }
            
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
      console.log(`⚠️  ${totalValidHits}/${totalRays} rays hit target (${(missedRayFraction*100).toFixed(1)}% missed), adding penalty: ${missedRayPenalty.toFixed(6)}`);
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
      console.log(`❌ Angle mode: No rays reaching target surface`);
      return {
        value: 10000.0, // MUCH STRONGER penalty for missing rays
        valid: false,
        rayCount: 0,
        details: 'No rays reaching target surface'
      };
    }
    
    console.log(`🎯 Angle mode: Target angle = ${targetAngleDegrees.toFixed(1)}° from normal, ${validIntersections.length}/${totalRays} rays hit target`);
    
    const targetCos = Math.cos(targetAngleDegrees * Math.PI / 180);
    console.log(`🎯 Target cos(angle) = ${targetCos.toFixed(4)}`);
    
    // Calculate angles for each ray using surface normals directly (both in global coordinates)
    const angles = validIntersections.map((intersection, index) => {
      // Get normalized ray direction and surface normal (both in global coordinates)
      const rayDir = intersection.ray.direction.normalize();
      const surfaceNormal = intersection.normal.normalize();
      
      // Calculate angle between ray direction and surface normal
      // Use -rayDir to get the "incident" direction (toward surface)
      const incidentRayDir = new Vector3(-rayDir.x, -rayDir.y, -rayDir.z);
      const actualCos = surfaceNormal.dot(incidentRayDir);
      
      // Clamp to valid range for acos
      const clampedCos = Math.min(1, Math.max(-1, actualCos));
      
      // Cosine deviation from target cosine  
      const cosDeviation = actualCos - targetCos;
      
      // For logging, also calculate the actual angle in degrees
      const actualAngleRad = Math.acos(clampedCos);
      const actualAngleDeg = actualAngleRad * 180 / Math.PI;
      
      // Calculate angular deviation in degrees for better understanding
      const angularDeviationDeg = Math.abs(actualAngleDeg - targetAngleDegrees);
      
      // Debug logging for first few rays
      if (index < 3) {
        console.log(`🔍 Ray ${index}: rayDir=(${rayDir.x.toFixed(3)}, ${rayDir.y.toFixed(3)}, ${rayDir.z.toFixed(3)}) |mag|=${rayDir.length().toFixed(3)}`);
        console.log(`🔍 Ray ${index}: surfaceNormal=(${surfaceNormal.x.toFixed(3)}, ${surfaceNormal.y.toFixed(3)}, ${surfaceNormal.z.toFixed(3)}) |mag|=${surfaceNormal.length().toFixed(3)}`);
        console.log(`🔍 Ray ${index}: incidentDir=(${incidentRayDir.x.toFixed(3)}, ${incidentRayDir.y.toFixed(3)}, ${incidentRayDir.z.toFixed(3)}) |mag|=${incidentRayDir.length().toFixed(3)}`);
        console.log(`🔍 Ray ${index}: dot(normal, -ray)=${actualCos.toFixed(4)}, angle=${actualAngleDeg.toFixed(1)}°, target=${targetAngleDegrees.toFixed(1)}°`);
        console.log(`🔍 Ray ${index}: angularDev=${angularDeviationDeg.toFixed(1)}°, cosDeviation=${cosDeviation.toFixed(4)}, squared=${(cosDeviation * cosDeviation).toFixed(6)}`);
      }
      
      return { cosDeviation, actualAngleDeg, actualAngleRad, actualCos, angularDeviationDeg };
    });
    
    // Use RMS angular deviation as objective (more intuitive than cosine deviation)
    const angularDeviations = angles.map(item => item.angularDeviationDeg);
    const meanSquaredAngularDeviation = angularDeviations.reduce(
      (sum: number, dev: number) => sum + dev * dev, 0
    ) / angularDeviations.length;
    const rmsAngularDeviation = Math.sqrt(meanSquaredAngularDeviation);
    
    // Use RMS angular deviation directly as objective (no scaling needed)
    let objective = rmsAngularDeviation;
    
    // Add penalty for rays that miss the target surface
    const missedRayFraction = (totalRays - validIntersections.length) / totalRays;
    if (missedRayFraction > 0) {
      const MISSED_RAY_PENALTY = 90.0; // Heavy penalty in degrees for missed rays
      const missedRayPenalty = missedRayFraction * MISSED_RAY_PENALTY;
      objective += missedRayPenalty;
      console.log(`⚠️  ${validIntersections.length}/${totalRays} rays hit target (${(missedRayFraction*100).toFixed(1)}% missed), adding penalty: ${missedRayPenalty.toFixed(3)}°`);
    }
    
    const actualAngles = angles.map(item => item.actualAngleDeg);
    const avgActualAngle = actualAngles.reduce((sum: number, angle: number) => sum + angle, 0) / actualAngles.length;
    const actualCosAngles = angles.map(item => item.actualCos);
    const avgActualCos = actualCosAngles.reduce((sum: number, cos: number) => sum + cos, 0) / actualCosAngles.length;
    const cosDeviations = angles.map(item => item.cosDeviation);
    const avgCosDeviation = cosDeviations.reduce((sum: number, dev: number) => sum + dev, 0) / cosDeviations.length;
    const avgAngularDeviation = angularDeviations.reduce((sum: number, dev: number) => sum + dev, 0) / angularDeviations.length;
    const maxAngularDeviation = Math.max(...angularDeviations);
    
    console.log(`📐 Angle analysis: Avg=${avgActualAngle.toFixed(1)}° (target=${targetAngleDegrees.toFixed(1)}°), Avg angular dev=${avgAngularDeviation.toFixed(2)}°`);
    console.log(`📐 Angular deviation: RMS=${rmsAngularDeviation.toFixed(3)}°, Max=${maxAngularDeviation.toFixed(3)}°`);
    console.log(`📐 Cosine analysis: Avg cos=${avgActualCos.toFixed(4)} (target=${targetCos.toFixed(4)}), Avg cos dev=${avgCosDeviation.toFixed(4)}`);
    console.log(`📐 Final objective: ${objective.toFixed(3)}° (RMS angular deviation + missed ray penalty)`);
    
    return {
      value: objective, // Use RMS angular deviation as objective
      valid: true,
      rayCount: validIntersections.length,
      details: {
        totalRays,
        validIntersections: validIntersections.length,
        targetAngleDegrees,
        targetCos,
        avgActualAngleDegrees: avgActualAngle,
        avgActualCos: avgActualCos,
        avgCosDeviation: avgCosDeviation,
        avgAngularDeviation: avgAngularDeviation,
        rmsAngularDeviation: rmsAngularDeviation,
        maxAngularDeviation: maxAngularDeviation,
        meanSquaredAngularDeviation: meanSquaredAngularDeviation
      }
    };
  }
}
