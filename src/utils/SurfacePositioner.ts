/**
 * Surface positioning utilities for optimization
 */

import * as yaml from 'js-yaml';

export class SurfacePositioner {
  /**
   * Insert a new surface at the midpoint between min and max Z positions
   */
  static insertMidSurface(yamlContent: string): string {
    try {
      const parsedYaml = yaml.load(yamlContent) as any;
      
      if (!parsedYaml.assemblies || parsedYaml.assemblies.length === 0) {
        console.warn('No assemblies found in YAML');
        return yamlContent;
      }
      
      const assembly = parsedYaml.assemblies[0];
      let minZ = Infinity;
      let maxZ = -Infinity;
      let surfacePositions: number[] = [];
      
      // Find all surface positions
      Object.keys(assembly).forEach(surfaceKey => {
        if (surfaceKey.startsWith('s') && surfaceKey !== 'stop') {
          const surface = assembly[surfaceKey];
          if (surface && typeof surface.relative === 'number') {
            surfacePositions.push(surface.relative);
            minZ = Math.min(minZ, surface.relative);
            maxZ = Math.max(maxZ, surface.relative);
          }
        }
      });
      
      if (surfacePositions.length === 0) {
        console.warn('No surfaces with positions found');
        return yamlContent;
      }
      
      // Calculate mid position
      const midZ = (minZ + maxZ) / 2;
      console.log(`📍 Inserting surface at mid position: ${midZ.toFixed(3)} (between ${minZ} and ${maxZ})`);
      
      // Find next available surface index
      let nextIndex = 1;
      while (assembly[`s${nextIndex}`]) {
        nextIndex++;
      }
      
      // Insert new surface at mid position
      assembly[`s${nextIndex}`] = {
        relative: midZ,
        shape: 'plano',
        semidia: 25,
        mode: 'refraction',
        n2: 1.5 // Default glass
      };
      
      // Convert back to YAML
      return yaml.dump(parsedYaml, {
        indent: 2,
        lineWidth: 120,
        noRefs: true,
        sortKeys: false
      });
      
    } catch (error) {
      console.error('Error inserting mid surface:', error);
      return yamlContent;
    }
  }
  
  /**
   * Calculate the Z range of all surfaces in the optical system
   */
  static getSurfaceRange(yamlContent: string): { min: number; max: number } | null {
    try {
      const parsedYaml = yaml.load(yamlContent) as any;
      
      if (!parsedYaml.assemblies || parsedYaml.assemblies.length === 0) {
        return null;
      }
      
      const assembly = parsedYaml.assemblies[0];
      let minZ = Infinity;
      let maxZ = -Infinity;
      
      Object.keys(assembly).forEach(surfaceKey => {
        if (surfaceKey.startsWith('s') && surfaceKey !== 'stop') {
          const surface = assembly[surfaceKey];
          if (surface && typeof surface.relative === 'number') {
            minZ = Math.min(minZ, surface.relative);
            maxZ = Math.max(maxZ, surface.relative);
          }
        }
      });
      
      return minZ !== Infinity ? { min: minZ, max: maxZ } : null;
    } catch (error) {
      console.error('Error calculating surface range:', error);
      return null;
    }
  }
}
