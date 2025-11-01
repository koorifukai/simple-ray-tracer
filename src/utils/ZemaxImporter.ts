/**
 * Zemax TSV to YAML Assembly Converter
 * Converts Zemax lens prescription data to optical ray tracer YAML format
 */

export interface ZemaxSurface {
  surfaceNumber: number;
  type: string;
  comment: string;
  radius: number;
  thickness: number;
  material: string;
  coating: string;
  semiDiameter: number;
  conic: number;
}

export interface YamlSurface {
  relative: number;
  shape: 'spherical' | 'plano';
  radius?: number;
  semidia: number;
  mode: 'refraction' | 'aperture' | 'absorption';
  n1_material?: string;
  n2_material?: string;
}

export class ZemaxImporter {
  /**
   * Convert Zemax TSV data to YAML assembly format
   */
  static convertToYaml(tsvData: string): string {
    const surfaces = this.parseTSV(tsvData);
    const yamlSurfaces = this.convertSurfaces(surfaces);
    return this.generateYamlAssembly(yamlSurfaces);
  }

  /**
   * Parse TSV data from Zemax export
   */
  private static parseTSV(tsvData: string): ZemaxSurface[] {
    const lines = tsvData.trim().split('\n');
    
    // Skip header line and parse data
    const surfaces: ZemaxSurface[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const columns = line.split('\t');
      if (columns.length < 11) continue; // Ensure we have enough columns
      
      const surface: ZemaxSurface = {
        surfaceNumber: parseInt(columns[0]),
        type: columns[1],
        comment: columns[2],
        radius: this.parseScientificNumber(columns[3]),
        thickness: this.parseScientificNumber(columns[4]),
        material: columns[5] || '',
        coating: columns[6] || '',
        semiDiameter: this.parseScientificNumber(columns[7]),
        conic: this.parseScientificNumber(columns[10])
      };
      
      surfaces.push(surface);
    }
    
    return surfaces;
  }

  /**
   * Parse scientific notation numbers from Zemax
   */
  private static parseScientificNumber(value: string): number {
    if (!value || value === '') return 0;
    return parseFloat(value);
  }

  /**
   * Convert Zemax surfaces to YAML surface format
   */
  private static convertSurfaces(zemaxSurfaces: ZemaxSurface[]): YamlSurface[] {
    const yamlSurfaces: YamlSurface[] = [];
    
    // Skip surface 0 (object surface) and start from surface 1
    for (let i = 1; i < zemaxSurfaces.length; i++) {
      const current = zemaxSurfaces[i];
      const previous = zemaxSurfaces[i - 1];
      
      const yamlSurface: YamlSurface = {
        relative: this.getRelativeDistance(previous, i === 1), // Handle first surface specially
        shape: this.determineShape(current.radius),
        semidia: current.semiDiameter,
        mode: this.determineMode(current, i === zemaxSurfaces.length - 1) // Pass if it's the last surface
      };
      
      // Add radius for spherical surfaces
      if (yamlSurface.shape === 'spherical') {
        yamlSurface.radius = current.radius;
      }
      
      // Determine material transitions
      this.assignMaterials(yamlSurface, previous, current);
      
      yamlSurfaces.push(yamlSurface);
    }
    
    return yamlSurfaces;
  }

  /**
   * Get relative distance handling special cases
   */
  private static getRelativeDistance(previousSurface: ZemaxSurface, isFirstSurface: boolean): number {
    if (isFirstSurface) {
      // For the first surface, use 0 as starting position regardless of object distance
      return 0;
    }
    return previousSurface.thickness;
  }

  /**
   * Determine surface shape from radius
   */
  private static determineShape(radius: number): 'spherical' | 'plano' {
    // Infinity (represented as 0 in some systems) or very large radius = plano surface
    return radius === 0 || Math.abs(radius) > 1e10 ? 'plano' : 'spherical';
  }

  /**
   * Determine surface mode
   */
  private static determineMode(surface: ZemaxSurface, isImageSurface: boolean = false): 'refraction' | 'aperture' | 'absorption' {
    // Image surface (last surface) should be absorption
    if (isImageSurface) {
      return 'absorption';
    }
    
    // Aperture stops must be plano (infinity radius) and have no material
    // Spherical surfaces with radius cannot be apertures
    const isPlano = Math.abs(surface.radius) > 1e10 || surface.radius === 0;
    const hasNoMaterial = !surface.material || surface.material === '';
    const isSmallAperture = surface.semiDiameter < 15;
    
    // Only consider it an aperture if it's plano, has no material, and is small
    if (isPlano && hasNoMaterial && isSmallAperture) {
      return 'aperture';
    }
    
    // Default to refraction for all other cases
    return 'refraction';
  }

  /**
   * Assign n1_material and n2_material based on material transitions
   */
  private static assignMaterials(
    yamlSurface: YamlSurface,
    previousSurface: ZemaxSurface,
    currentSurface: ZemaxSurface
  ): void {
    // n1_material: material we're coming FROM (previous surface's material)
    if (previousSurface.material && previousSurface.material !== '') {
      yamlSurface.n1_material = previousSurface.material;
    }
    
    // n2_material: material we're going TO (current surface's material)
    if (currentSurface.material && currentSurface.material !== '') {
      yamlSurface.n2_material = currentSurface.material;
    }
    
    // Special case: Cemented surfaces (thickness = 0)
    // When thickness is 0, this is a cemented interface between two glass types
    if (previousSurface.thickness === 0) {
      // This is the second surface of a cemented doublet
      // n1 should be the material from the first element of the doublet
      if (previousSurface.material) {
        yamlSurface.n1_material = previousSurface.material;
      }
    }
    
    // Air-spaced surfaces: When no material is specified, it defaults to air
    // We typically don't need to explicitly specify air in the YAML
  }

  /**
   * Format number to 3 decimal places
   */
  private static formatNumber(value: number): string {
    return Number(value.toFixed(3)).toString();
  }

  /**
   * Generate YAML assembly string
   */
  private static generateYamlAssembly(surfaces: YamlSurface[]): string {
    let yaml = '  - aid: 0\n'; // Start directly with the assembly
    
    surfaces.forEach((surface, index) => {
      const surfaceId = `s${index + 1}`;
      yaml += `    ${surfaceId}:\n`;
      yaml += `      {`;
      
      const properties: string[] = [];
      properties.push(`relative: ${this.formatNumber(surface.relative)}`);
      properties.push(`shape: ${surface.shape}`);
      
      if (surface.radius !== undefined) {
        properties.push(`radius: ${this.formatNumber(surface.radius)}`);
      }
      
      properties.push(`semidia: ${this.formatNumber(surface.semidia)}`);
      properties.push(`mode: ${surface.mode}`);
      
      if (surface.n1_material) {
        properties.push(`n1_material: ${surface.n1_material}`);
      }
      
      if (surface.n2_material) {
        properties.push(`n2_material: ${surface.n2_material}`);
      }
      
      yaml += properties.join(', ');
      yaml += '}\n';
    });
    
    return yaml;
  }

  /**
   * Quick validation of converted YAML
   */
  static validateConversion(originalTsv: string, convertedYaml: string): {
    isValid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];
    
    try {
      const surfaces = this.parseTSV(originalTsv);
      const surfaceCount = surfaces.length - 1; // Exclude object surface (surface 0)
      
      // Count surfaces in YAML
      const yamlSurfaceCount = (convertedYaml.match(/s\d+:/g) || []).length;
      
      if (surfaceCount !== yamlSurfaceCount) {
        issues.push(`Surface count mismatch: Zemax has ${surfaceCount}, YAML has ${yamlSurfaceCount}`);
      }
      
      // Check for material assignments
      if (!convertedYaml.includes('n1_material') && !convertedYaml.includes('n2_material')) {
        issues.push('No material assignments found in YAML');
      }
      
      // Check for image surface (should have absorption mode)
      if (!convertedYaml.includes('mode: absorption')) {
        issues.push('No image surface (absorption mode) found - check if image surface is included');
      }
      
    } catch (error) {
      issues.push(`Validation error: ${error}`);
    }
    
    return {
      isValid: issues.length === 0,
      issues
    };
  }
}