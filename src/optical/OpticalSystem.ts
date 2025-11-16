/**
 * Optical system parser and manager
 * Converts YAML definitions to renderable optical surfaces
 */

import { Vector3 } from '../math/Vector3';
import type { OpticalSurface } from './surfaces';
import * as Surfaces from './surfaces';
import { LightSource as LightSourceClass, LightSourceFactory } from './LightSource';
import { RayTracer } from './RayTracer';
import type { Ray } from './LightSource';
import { GlassCatalog, MaterialParser } from './materials/GlassCatalog';
import * as yaml from 'js-yaml';

/**
 * Optical train definition - defines the path light takes through the system
 */
export interface OpticalTrain {
  lightSources: { [key: string]: number }; // e.g., {r: 0, g: 1, b: 2}
  assemblies: { aid: number; position: Vector3; angles?: Vector3; normal?: Vector3 }[];
}

/**
 * Parsed optical system representation
 */
export interface OpticalSystem {
  name?: string;
  surfaces: OpticalSurface[];
  lightSources: LightSourceClass[];
  materials: { [key: string]: Material };
  opticalTrains?: OpticalTrain[];
  displaySettings?: DisplaySettings;
}

/**
 * Material optical properties
 */
export interface Material {
  name: string;
  refractiveIndex: number;  // nd - refractive index at d-line
  abbeNumber?: number;      // vd - Abbe number for dispersion
}

/**
 * Display and rendering settings
 */
export interface DisplaySettings {
  showGrid?: boolean;
  showCorners?: boolean;
  densityForIntensity?: boolean;
  rayResolution?: number;
  surfaceResolution?: number;
}

/**
 * Optical system parser for YAML data
 */
export class OpticalSystemParser {
  
  /**
   * Parse a complete optical system from YAML string
   */
  static async parseYAML(yamlContent: string): Promise<OpticalSystem> {
    try {
      const data = yaml.load(yamlContent) as any;
      return await OpticalSystemParser.parseData(data);
    } catch (error) {
      throw new Error(`Failed to parse YAML: ${error}`);
    }
  }

  /**
   * Parse optical system from parsed YAML data
   */
  static async parseData(data: any): Promise<OpticalSystem> {
    const system: OpticalSystem = {
      name: data.name || 'Untitled System',
      surfaces: [],
      lightSources: [],
      materials: {},
      opticalTrains: []
    };

    // Counter for numerical surface IDs (assigned in order of creation)
    let surfaceCounter = 0;

    // Parse display settings
    if (data.display_settings) {
      system.displaySettings = {
        showGrid: data.display_settings.show_grid !== false, // Default to true if not specified
        showCorners: data.display_settings.show_corners !== false, // Default to true if not specified
        densityForIntensity: data.display_settings.density_for_intensity,
        rayResolution: data.display_settings.ray_resolution || 10,
        surfaceResolution: data.display_settings.surface_resolution || 20
      };
    }

    // FIRST PASS: Parse optical_trains to store each element's data for surface creation
    const referencedLights = new Set<string>();
    const opticalTrainElements: Array<{ 
      trainName: string; 
      trainData: any; 
      position: Vector3; 
      angles: Vector3; 
      normal?: Vector3; 
      dial?: number;
      type: 'light' | 'assembly' | 'surface';
    }> = [];

    if (data.optical_trains && Array.isArray(data.optical_trains)) {
      data.optical_trains.forEach((trainGroup: any) => {
        Object.entries(trainGroup).forEach(([trainName, trainData]: [string, any]) => {
          
          // Get absolute position for this element (independent positioning)
          const absolutePosition = new Vector3(
            trainData.position?.[0] || 0,
            trainData.position?.[1] || 0,
            trainData.position?.[2] || 0
          );
          
          const angles = new Vector3(
            trainData.angles?.[0] || 0,
            trainData.angles?.[1] || 0,
            trainData.angles?.[2] || 0
          );
          
          // Extract dial value if specified
          const dial = trainData.dial;
          
          // Parse normal vector if specified
          let normal: Vector3 | undefined;
          if (trainData.normal && Array.isArray(trainData.normal)) {
            normal = new Vector3(
              trainData.normal[0] || 0,
              trainData.normal[1] || 0,
              trainData.normal[2] || 0
            ).normalize();
            console.log(`  Normal vector specified: [${normal.x.toFixed(2)}, ${normal.y.toFixed(2)}, ${normal.z.toFixed(2)}]`);
          } else if (trainData.angles && Array.isArray(trainData.angles)) {
            // Convert angles to normal vector (same logic as surfaces.ts)
            // angles[0]: Azimuth (rotation about Z-axis)
            // angles[1]: Elevation (tilts up/down)
            const azimuthRad = (trainData.angles[0] || 0) * Math.PI / 180;
            const elevationRad = (trainData.angles[1] || 0) * Math.PI / 180;
            
            // Convert spherical coordinates to Cartesian normal vector
            normal = new Vector3(
              -Math.cos(elevationRad) * Math.cos(azimuthRad),  // X component
              -Math.cos(elevationRad) * Math.sin(azimuthRad),  // Y component  
              Math.sin(elevationRad)                           // Z component
            ).normalize();
          }
          
          if (trainData.lid !== undefined) {
            referencedLights.add(trainData.lid.toString());
            opticalTrainElements.push({ trainName, trainData, position: absolutePosition.clone(), angles, normal, dial, type: 'light' });
          }
          
          if (trainData.aid !== undefined) {
            opticalTrainElements.push({ trainName, trainData, position: absolutePosition.clone(), angles, normal, dial, type: 'assembly' });
          }
          
          if (trainData.sid !== undefined) {
            opticalTrainElements.push({ trainName, trainData, position: absolutePosition.clone(), angles, normal, dial, type: 'surface' });
          }
        });
      });
    }

    console.log(`\n=== Reference Summary ===`);
    console.log(`Optical train elements: ${opticalTrainElements.length}`);
    console.log(`Referenced lights: [${Array.from(referencedLights).join(', ')}]`);

    // Parse display settings
    if (data.display_settings) {
      system.displaySettings = {
        showGrid: data.display_settings.show_grid !== false, // Default to true if not specified
        showCorners: data.display_settings.show_corners !== false, // Default to true if not specified
        densityForIntensity: data.display_settings.density_for_intensity,
        rayResolution: data.display_settings.ray_resolution || 10,
        surfaceResolution: data.display_settings.surface_resolution || 20
      };
    }

    // Parse materials (if present)
    if (data.materials) {
      Object.entries(data.materials).forEach(([name, materialData]: [string, any]) => {
        system.materials[name] = {
          name,
          refractiveIndex: materialData.nd || materialData.n || 1.5,
          abbeNumber: materialData.vd || materialData.abbe
        };
      });
    }

    // SECOND PASS: Create surface template lookup from surface definitions
    const surfaceTemplates = new Map<string, any>();
    if (data.surfaces && Array.isArray(data.surfaces)) {
      data.surfaces.forEach((surfaceGroup: any) => {
        Object.entries(surfaceGroup).forEach(([key, surfaceData]: [string, any]) => {
          if (surfaceData.sid !== undefined) {
            surfaceTemplates.set(surfaceData.sid.toString(), { key, data: surfaceData });
            console.log(`Surface template: sid ${surfaceData.sid} → "${key}" template`);
          }
        });
      });
    }

    // Create assembly template lookup
    const assemblyTemplates = new Map<string, any>();
    if (data.assemblies && Array.isArray(data.assemblies)) {
      data.assemblies.forEach((assembly: any) => {
        if (assembly.aid !== undefined) {
          assemblyTemplates.set(assembly.aid.toString(), assembly);
          console.log(`Assembly template: aid ${assembly.aid}`);
        }
      });
    }

    // SECOND PASS: Create light sources (only those referenced)
    // First, create a mapping from lid to string key
    const lidToKeyMap = new Map<string, string>();
    if (data.light_sources && Array.isArray(data.light_sources)) {
      data.light_sources.forEach((sourceGroup: any) => {
        Object.entries(sourceGroup).forEach(([key, sourceData]: [string, any]) => {
          if (sourceData.lid !== undefined) {
            lidToKeyMap.set(sourceData.lid.toString(), key);
            console.log(`Light source mapping: lid ${sourceData.lid} → key "${key}"`);
          }
        });
      });
    }

    // Now create light sources for referenced lids
    if (data.light_sources && Array.isArray(data.light_sources)) {
      data.light_sources.forEach((sourceGroup: any) => {
        Object.entries(sourceGroup).forEach(([key, sourceData]: [string, any]) => {
          const lid = sourceData.lid?.toString();
          if (lid && referencedLights.has(lid)) {
            const lightSource = LightSourceFactory.createFromYAML(key, sourceData);
            system.lightSources.push(lightSource);
          }
        });
      });
    }

    // THIRD PASS: Create surfaces from optical train elements in their original order
    // === Creating surfaces from optical train elements ===
    
    for (const element of opticalTrainElements) {
      if (element.type === 'surface') {
        const sid = element.trainData.sid.toString();
        const template = surfaceTemplates.get(sid);
        
        if (!template) {
          console.warn(`No surface template found for sid ${sid} in element "${element.trainName}"`);
          continue;
        }
        
        // console.log(`Creating surface "${element.trainName}" from sid ${sid} template "${template.key}"`);
        
        // Merge optical train dial and normal with surface definition
        const mergedSurfaceData = { ...template.data };
        if (element.dial !== undefined) {
          mergedSurfaceData.dial = element.dial; // Optical train dial overrides surface dial
          console.log(`  Applied dial from optical train: ${element.dial}°`);
        }
        
        // Apply normal from optical train if specified
        if (element.normal) {
          mergedSurfaceData.normal = [element.normal.x, element.normal.y, element.normal.z];
          console.log(`  Applied normal from optical train: [${element.normal.x.toFixed(3)}, ${element.normal.y.toFixed(3)}, ${element.normal.z.toFixed(3)}]`);
        }
        
        // Apply angles from optical train if specified (and no normal)
        if (!element.normal && (element.angles.x !== 0 || element.angles.y !== 0 || element.angles.z !== 0)) {
          mergedSurfaceData.angles = [element.angles.x, element.angles.y, element.angles.z];
          console.log(`  Applied angles from optical train: [${element.angles.x}°, ${element.angles.y}°, ${element.angles.z}°]`);
        }
        
        // Create surface with optical train position and merged data
        const surface = Surfaces.OpticalSurfaceFactory.createSurface(
          element.trainName, // Use train element name as unique identifier
          mergedSurfaceData, 
          element.position,
          surfaceCounter++   // Assign numerical ID and increment
        );
        
        system.surfaces.push(surface);
        console.log(`  Added surface "${element.trainName}" at position (${surface.position.x}, ${surface.position.y}, ${surface.position.z})`);
      } else if (element.type === 'assembly') {
        const aid = element.trainData.aid.toString();
        const template = assemblyTemplates.get(aid);
        
        if (!template) {
          console.warn(`No assembly template found for aid ${aid} in element "${element.trainName}"`);
          continue;
        }
        
        // console.log(`Creating assembly "${element.trainName}" from aid ${aid} template`);
        if (element.dial !== undefined) {
          console.log(`  Assembly dial: ${element.dial}°`);
        }
        
        const assemblySurfaces = Surfaces.OpticalSurfaceFactory.createAssemblySurfaces(
          template, 
          element.position, 
          element.normal, 
          element.trainName, // Use train element name as unique identifier prefix
          element.dial,      // Pass assembly-level dial for two-stage rotation
          surfaceCounter     // Pass current surface counter for numerical IDs
        );
        
        // Update counter with the number of surfaces created
        surfaceCounter += assemblySurfaces.length;
        
        system.surfaces.push(...assemblySurfaces);
        console.log(`  Added ${assemblySurfaces.length} surfaces from assembly "${element.trainName}"`);
      }
      // Skip 'light' type elements as they don't create surfaces
    }

    // 🚀 PHASE 2: Pre-compute wavelength-dependent refractive indices for performance
    // Pre-compute all wavelength-dependent refractive indices
    await OpticalSystemParser.precomputeWavelengthTables(system);

    return system;
  }

  /**
   * Get all surfaces in order along optical axis
   */
  static getSurfacesInOrder(system: OpticalSystem): OpticalSurface[] {
    return system.surfaces.slice().sort((a, b) => a.position.x - b.position.x);
  }

  /**
   * Find surface intersections for ray tracing
   */
  static findSurfaceIntersections(system: OpticalSystem, rayOrigin: Vector3, rayDirection: Vector3): {
    surface: OpticalSurface;
    distance: number;
    point: Vector3;
  }[] {
    const intersections: {
      surface: OpticalSurface;
      distance: number;
      point: Vector3;
    }[] = [];

    system.surfaces.forEach(surface => {
      const intersection = OpticalSystemParser.raySurfaceIntersection(
        rayOrigin, rayDirection, surface
      );
      
      if (intersection) {
        intersections.push({
          surface,
          distance: intersection.distance,
          point: intersection.point
        });
      }
    });

    // Sort by distance along ray
    return intersections.sort((a, b) => a.distance - b.distance);
  }

  /**
   * Calculate ray-surface intersection (basic implementation)
   */
  private static raySurfaceIntersection(
    rayOrigin: Vector3, 
    rayDirection: Vector3, 
    surface: OpticalSurface
  ): { distance: number; point: Vector3; } | null {
    
    // For now, implement simple planar intersection
    // More complex surface intersections will be added later
    
    if (surface.shape === 'plano') {
      // Plane intersection at surface X position
      const planeX = surface.position.x;
      const dirX = rayDirection.x;
      
      if (Math.abs(dirX) < 1e-10) return null; // Ray parallel to plane
      
      const distance = (planeX - rayOrigin.x) / dirX;
      if (distance < 0) return null; // Behind ray origin
      
      const point = new Vector3(
        rayOrigin.x + distance * rayDirection.x,
        rayOrigin.y + distance * rayDirection.y,
        rayOrigin.z + distance * rayDirection.z
      );
      
      // Check if within aperture
      const localY = point.y - surface.position.y;
      const localZ = point.z - surface.position.z;
      const radius = Math.sqrt(localY * localY + localZ * localZ);
      
      if (surface.semidia && radius > surface.semidia) {
        return null; // Outside aperture
      }
      
      return { distance, point };
    }
    
    // Spherical intersection - more complex, implement later
    return null;
  }

  /**
   * Trace all rays from light sources through the optical system
   */
  static traceOpticalSystem(system: OpticalSystem): { source: LightSourceClass; rayPaths: Ray[][] }[] {
    const results: { source: LightSourceClass; rayPaths: Ray[][] }[] = [];
    
    // Initialize ray accountability system
    RayTracer.initializeRayAccountability(system);
    
    // Get surfaces in order along optical axis
    const orderedSurfaces = this.getSurfacesInOrder(system);
    
    // Trace rays from each light source
    system.lightSources.forEach((lightSource) => {
      const source = lightSource as any; // Cast to bypass TypeScript interface confusion
      
      const rays = source.generateRays(source.numberOfRays);
      
      // Reset first ray tracking for simplified logging
      RayTracer.resetFirstRayTracking();
      
      const rayPaths: Ray[][] = [];
      
      rays.forEach((ray: Ray) => {
        try {
          const rayPath = RayTracer.traceRaySequential(ray, orderedSurfaces);
          rayPaths.push(rayPath);
        } catch (error) {
          console.warn(`Failed to trace ray from source ${source.id}:`, error);
        }
      });
      
      results.push({ source: lightSource, rayPaths });
    });
    
    // Log ray accountability statistics
    const accountability = RayTracer.getRayAccountability();
    const systemStats = this.getSystemRayAccountability(system);
    
    console.log('📊 RAY ACCOUNTABILITY SUMMARY:');
    console.log(`   Light Sources: ${systemStats.systemTotals.totalSources}`);
    console.log(`   Total System Rays: ${systemStats.systemTotals.totalSystemRays}`);
    if (accountability.totalBranchedRays > 0) {
      console.log(`   Branching Events: ${accountability.branchingEvents}`);
    }
    
    return results;
  }

  /**
   * 🚀 Pre-compute wavelength-dependent refractive index lookup tables
   * Called once during system build for optimal runtime performance
   */
  static async precomputeWavelengthTables(system: OpticalSystem): Promise<void> {
    // Ensure glass catalog is loaded before pre-computation
    if (!GlassCatalog.isLoaded()) {
      try {
        await GlassCatalog.initialize();
      } catch (error) {
        // Glass catalog failed to load - proceeding with numeric values only
      }
    }

    // Extract all unique wavelengths from light sources
    const wavelengths = new Set<number>();
    system.lightSources.forEach(source => {
      const wavelength = (source as any).wavelength;
      if (wavelength && typeof wavelength === 'number') {
        wavelengths.add(wavelength);
      }
    });

    // Found unique wavelengths for pre-computation

    if (wavelengths.size === 0) {
      // No wavelengths found - skipping pre-computation
      return;
    }

    // Pre-compute refractive indices for each surface
    let materialLookups = 0;
    let numericFallbacks = 0;
    
    system.surfaces.forEach((surface) => {
      // Initialize wavelength tables
      surface.n1_wavelength_table = new Map();
      surface.n2_wavelength_table = new Map();

      wavelengths.forEach(wavelength => {
        // Pre-compute n1 for this wavelength
        try {
          const n1 = MaterialParser.parseN1(surface, wavelength);
          surface.n1_wavelength_table!.set(wavelength, n1);
          if ((surface as any).n1_material) {
            materialLookups++;
          } else {
            numericFallbacks++;
          }
        } catch (error) {
          // Fallback to legacy n1 or 1.0
          const fallbackN1 = surface.n1 || 1.0;
          surface.n1_wavelength_table!.set(wavelength, fallbackN1);
          numericFallbacks++;
        }

        // Pre-compute n2 for this wavelength  
        try {
          const n2 = MaterialParser.parseN2(surface, wavelength);
          surface.n2_wavelength_table!.set(wavelength, n2);
          if ((surface as any).n2_material) {
            materialLookups++;
          } else {
            numericFallbacks++;
          }
        } catch (error) {
          // Fallback to legacy n2 or 1.0
          const fallbackN2 = surface.n2 || 1.0;
          surface.n2_wavelength_table!.set(wavelength, fallbackN2);
          numericFallbacks++;
        }
      });
    });

    // Summary log removed - user is confident with IOR lookup
    console.log(`🏆 Wavelength tables ready - O(1) runtime material access!`);
  }
  
  /**
   * Get comprehensive ray accountability for the entire optical system
   */
  static getSystemRayAccountability(system: OpticalSystem): {
    lightSources: Array<{
      lid: number;
      totalRays: number;
    }>;
    systemTotals: {
      totalSources: number;
      totalSystemRays: number;
    };
  } {
    const lightSources = system.lightSources.map(source => ({
      lid: source.lid,
      totalRays: (source as any).getRayCount()
    }));
    
    const systemTotals = lightSources.reduce((totals, source) => ({
      totalSources: totals.totalSources + 1,
      totalSystemRays: totals.totalSystemRays + source.totalRays
    }), {
      totalSources: 0,
      totalSystemRays: 0
    });
    
    return { lightSources, systemTotals };
  }
  
  /**
   * Find light source that owns a specific ray by lightId
   */
  static findRayOwner(system: OpticalSystem, lightId: number): LightSourceClass | null {
    // Extract base light ID (remove generation and surface order)
    const baseLightId = Math.floor(lightId) % 1000;
    const decimalPart = lightId - Math.floor(lightId);
    
    // For original lights (0-9), check decimal conversion
    let targetLid = baseLightId;
    if (decimalPart > 0 && decimalPart < 1 && baseLightId < 100) {
      // This might be a decimal-converted original light (0.1 → lid 1)
      targetLid = Math.floor(decimalPart * 10);
    }
    
    return system.lightSources.find(source => {
      // ROBUST LID MATCHING: Tolerance of 0.05 handles single decimal precision
      return Math.abs(source.lid - targetLid) < 0.05;
    }) || null;
  }
  
  /**
   * MAIN WORKFLOW FUNCTION: Get all rays in the system efficiently
   * Use this for analysis: spot diagrams, ray intersection counts, etc.
   */
  static getAllSystemRays(system: OpticalSystem): {
    allRays: Ray[];              // Every ray in the system
    raysByLight: Map<number, Ray[]>; // Organized by light source
  } {
    const allRays: Ray[] = [];
    const raysByLight = new Map<number, Ray[]>();
    
    system.lightSources.forEach(source => {
      const lightRays = (source as any).getAllRays();
      allRays.push(...lightRays);
      raysByLight.set(source.lid, lightRays);
    });
    
    return { allRays, raysByLight };
  }
}
