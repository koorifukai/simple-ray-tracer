/**
 * Optical system parser and manager
 * Converts YAML definitions to renderable optical surfaces
 */

import { Vector3 } from '../math/Matrix4';
import type { OpticalSurface } from './surfaces';
import * as Surfaces from './surfaces';
import { LightSource as LightSourceClass, LightSourceFactory } from './LightSource';
import { RayTracer } from './RayTracer';
import type { Ray } from './LightSource';
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
  static parseYAML(yamlContent: string): OpticalSystem {
    try {
      const data = yaml.load(yamlContent) as any;
      return OpticalSystemParser.parseData(data);
    } catch (error) {
      throw new Error(`Failed to parse YAML: ${error}`);
    }
  }

  /**
   * Parse optical system from parsed YAML data
   */
  static parseData(data: any): OpticalSystem {
    const system: OpticalSystem = {
      name: data.name || 'Untitled System',
      surfaces: [],
      lightSources: [],
      materials: {},
      opticalTrains: []
    };

    // Parse display settings
    if (data.display_settings) {
      system.displaySettings = {
        showGrid: data.display_settings.show_grid,
        densityForIntensity: data.display_settings.density_for_intensity,
        rayResolution: data.display_settings.ray_resolution || 10,
        surfaceResolution: data.display_settings.surface_resolution || 20
      };
    }

    // FIRST PASS: Parse optical_trains to store each element's data for surface creation
    const referencedLights = new Set<string>();
    const assemblyElements: Array<{ trainName: string; trainData: any; position: Vector3; angles: Vector3; normal?: Vector3; dial?: number }> = [];
    const surfaceElements: Array<{ trainName: string; trainData: any; position: Vector3; angles: Vector3; normal?: Vector3; dial?: number }> = [];

    if (data.optical_trains && Array.isArray(data.optical_trains)) {
      data.optical_trains.forEach((trainGroup: any) => {
        Object.entries(trainGroup).forEach(([trainName, trainData]: [string, any]) => {
          console.log(`\n=== Processing optical train element: ${trainName} ===`);
          
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
            console.log(`  Normal from angles [${trainData.angles[0]}, ${trainData.angles[1]}]: [${normal.x.toFixed(3)}, ${normal.y.toFixed(3)}, ${normal.z.toFixed(3)}]`);
          }
          
          if (trainData.lid !== undefined) {
            referencedLights.add(trainData.lid.toString());
            console.log(`  Referenced light: lid ${trainData.lid} at position (${absolutePosition.x}, ${absolutePosition.y}, ${absolutePosition.z})`);
          }
          
          if (trainData.aid !== undefined) {
            assemblyElements.push({ trainName, trainData, position: absolutePosition.clone(), angles, normal, dial });
            console.log(`  Referenced assembly: aid ${trainData.aid} at position (${absolutePosition.x}, ${absolutePosition.y}, ${absolutePosition.z})`);
            if (dial !== undefined) {
              console.log(`    Assembly dial: ${dial}°`);
            }
          }
          
          if (trainData.sid !== undefined) {
            surfaceElements.push({ trainName, trainData, position: absolutePosition.clone(), angles, normal, dial });
            console.log(`  Referenced surface: sid ${trainData.sid} at position (${absolutePosition.x}, ${absolutePosition.y}, ${absolutePosition.z})`);
            if (dial !== undefined) {
              console.log(`    Surface dial: ${dial}°`);
            }
          }
        });
      });
    }

    console.log(`\n=== Reference Summary ===`);
    console.log(`Surface elements: ${surfaceElements.length}`);
    console.log(`Assembly elements: ${assemblyElements.length}`);
    console.log(`Referenced lights: [${Array.from(referencedLights).join(', ')}]`);

    // Parse display settings
    if (data.display_settings) {
      system.displaySettings = {
        showGrid: data.display_settings.show_grid,
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
            console.log(`Creating referenced light source "${key}" (lid ${lid}) with data:`, sourceData);
            const lightSource = LightSourceFactory.createFromYAML(key, sourceData);
            console.log(`Created light source:`, lightSource);
            system.lightSources.push(lightSource);
          } else {
            console.log(`Skipping unreferenced light source "${key}" (lid ${lid || 'undefined'})`);
          }
        });
      });
    }

    // THIRD PASS: Create surfaces from optical train elements
    console.log(`\n=== Creating surfaces from optical train elements ===`);
    
    // Create surfaces from surface elements
    surfaceElements.forEach((element) => {
      const sid = element.trainData.sid.toString();
      const template = surfaceTemplates.get(sid);
      
      if (!template) {
        console.warn(`No surface template found for sid ${sid} in element "${element.trainName}"`);
        return;
      }
      
      console.log(`Creating surface "${element.trainName}" from sid ${sid} template "${template.key}"`);
      
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
        element.position
      );
      
      system.surfaces.push(surface);
      console.log(`  Added surface "${element.trainName}" at position (${surface.position.x}, ${surface.position.y}, ${surface.position.z})`);
    });
    
    // Create surfaces from assembly elements  
    assemblyElements.forEach((element) => {
      const aid = element.trainData.aid.toString();
      const template = assemblyTemplates.get(aid);
      
      if (!template) {
        console.warn(`No assembly template found for aid ${aid} in element "${element.trainName}"`);
        return;
      }
      
      console.log(`Creating assembly "${element.trainName}" from aid ${aid} template`);
      if (element.dial !== undefined) {
        console.log(`  Assembly dial: ${element.dial}°`);
      }
      
      const assemblySurfaces = Surfaces.OpticalSurfaceFactory.createAssemblySurfaces(
        template, 
        element.position, 
        element.normal, 
        element.trainName, // Use train element name as unique identifier prefix
        element.dial       // Pass assembly-level dial for two-stage rotation
      );
      
      system.surfaces.push(...assemblySurfaces);
      console.log(`  Added ${assemblySurfaces.length} surfaces from assembly "${element.trainName}"`);
    });

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
    
    // Get surfaces in order along optical axis
    const orderedSurfaces = this.getSurfacesInOrder(system);
    
    // Trace rays from each light source
    system.lightSources.forEach((lightSource) => {
      const source = lightSource as any; // Cast to bypass TypeScript interface confusion
      console.log(`Tracing rays for light source:`, source);
      console.log(`Source has generateRays:`, typeof source.generateRays);
      
      const rays = source.generateRays(source.numberOfRays);
      console.log(`Generated ${rays.length} rays`);
      
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
    
    return results;
  }
}
