// Glass Catalog System for Optical Ray Tracer
// Supports both Schott and Ohara glass catalogs with different Sellmeier coefficient formats

export interface GlassData {
  name: string;
  manufacturer: string;
  
  // Basic optical properties
  nd: number;  // Refractive index at d-line (587.6nm)
  ne: number;  // Refractive index at e-line (546.1nm)
  vd: number;  // Abbe number at d-line
  ve: number;  // Abbe number at e-line
  
  // Sellmeier coefficients (different formats for different manufacturers)
  // Schott format: n² = 1 + B1λ²/(λ²-C1) + B2λ²/(λ²-C2) + B3λ²/(λ²-C3)
  // Ohara format: n² = A1 + A2λ² + A3λ⁻² + A4λ⁻⁴ + A5λ⁻⁶ + A6λ⁻⁸
  sellmeier: {
    // For Schott: store B1,B2,B3,C1,C2,C3
    // For Ohara: store A1,A2,A3,A4,A5,A6 in b1,b2,b3,c1,c2,c3 fields
    b1: number; b2: number; b3: number;
    c1: number; c2: number; c3: number;
  };
}

export interface MaterialValidationResult {
  found: boolean;
  exactMatch?: string;
  suggestions: string[];
  message: string;
}

// Surface type for YAML parsing
export interface OpticalSurface {
  n1?: number;
  n2?: number;
  n1_material?: string;
  n2_material?: string;
  [key: string]: any;
}

/**
 * Glass catalog management system with fuzzy matching and validation
 * For optical engineering ray tracing (not computer graphics)
 */
export class GlassCatalog {
  private static glasses = new Map<string, GlassData>();
  private static catalogsLoaded = false;
  private static loadPromise: Promise<void> | null = null;
  
  /**
   * Initialize the glass catalog - loads both Schott and Ohara catalogs
   * Called once per application session
   */
  static async initialize(): Promise<void> {
    if (this.catalogsLoaded) {
      return;
    }
    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = this.loadCatalogs();
    await this.loadPromise;
    this.catalogsLoaded = true;
  }

  /**
   * Load glass catalogs from CSV files
   */
  private static async loadCatalogs(): Promise<void> {
    try {
      // Load catalogs in parallel with cache busting
      const cacheBuster = `?v=${Date.now()}`;
      const [schottData, oharaData] = await Promise.all([
        fetch(`/simple-ray-tracer/data/glass_catalogs/schott-optical-glass-20250521.csv${cacheBuster}`).then(r => r.text()),
        fetch(`/simple-ray-tracer/data/glass_catalogs/OHARA_20250312_5.csv${cacheBuster}`).then(r => r.text())
      ]);

      // Parse each catalog with manufacturer-specific logic
      this.parseSchottCSV(schottData);
      this.parseOharaCSV(oharaData);
    } catch (error) {
      console.warn('⚠️  Failed to load glass catalogs:', error);
      console.log('Application will continue with manual n1/n2 values only');
      // App continues to work with manual n1/n2 values
    }
  }

  /**
   * Parse Schott CSV format
   * Format: Glass,nd,ne,vd,ve,Colour code,B1,B2,B3,C1,C2,C3,...
   */
  private static parseSchottCSV(csvData: string): void {
    const lines = csvData.split('\n');
    let glassCount = 0;

    // Skip header rows (first 2 lines)
    for (let i = 2; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const columns = line.split(',');
      if (columns.length < 12) continue;

      try {
        const glassName = columns[0].trim();
        if (!glassName || glassName.startsWith(' ')) continue;

        const glass: GlassData = {
          name: glassName,
          manufacturer: 'SCHOTT',
          nd: parseFloat(columns[1]),
          ne: parseFloat(columns[2]),
          vd: parseFloat(columns[3]),
          ve: parseFloat(columns[4]),
          sellmeier: {
            b1: parseFloat(columns[6]),  // B1
            b2: parseFloat(columns[7]),  // B2  
            b3: parseFloat(columns[8]),  // B3
            c1: parseFloat(columns[9]),  // C1
            c2: parseFloat(columns[10]), // C2
            c3: parseFloat(columns[11])  // C3
          }
        };

        // Validate data
        if (this.isValidGlassData(glass)) {
          this.glasses.set(glassName.toUpperCase(), glass);
          glassCount++;
        }
      } catch (error) {
        // Skip invalid rows silently
        continue;
      }
    }
  }

  /**
   * Parse Ohara CSV format  
   * Ohara uses A1,A2,A3,B1,B2,B3 coefficients - we convert to Schott B,C format
   */
  private static parseOharaCSV(csvData: string): void {
    const lines = csvData.split('\n');
    let glassCount = 0;

    // Skip header rows (first 3 lines - ignore first row as requested)  
    for (let i = 3; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const columns = line.split(',');
      if (columns.length < 66) continue;  // Need at least 66 columns for BN (column 65)

      try {
        const glassName = columns[1].trim(); // Column 2 in 1-based indexing
        if (!glassName || glassName.startsWith(' ')) continue;

        const glass: GlassData = {
          name: glassName,
          manufacturer: 'OHARA', 
          nd: parseFloat(columns[16]),  // Column 16: nd
          ne: parseFloat(columns[17]),  // Column 17: ne
          vd: parseFloat(columns[24]),  // Column 24: vd
          ve: parseFloat(columns[25]),  // Column 25: ve
          sellmeier: {
            // Ohara Sellmeier coefficients in columns BI-BN (60-65 in 0-based indexing)
            b1: parseFloat(columns[60]),  // BI: A1
            b2: parseFloat(columns[61]),  // BJ: A2
            b3: parseFloat(columns[62]),  // BK: A3
            c1: parseFloat(columns[63]),  // BL: B1
            c2: parseFloat(columns[64]),  // BM: B2
            c3: parseFloat(columns[65])   // BN: B3
          }
        };

        // Validate data
        if (this.isValidGlassData(glass)) {
          this.glasses.set(glassName.toUpperCase(), glass);
          glassCount++;
        }
      } catch (error) {
        // Skip invalid rows silently
        continue;
      }
    }
  }

  /**
   * Validate glass data for completeness
   */
  private static isValidGlassData(glass: GlassData): boolean {
    return !!(
      glass.name &&
      !isNaN(glass.nd) && glass.nd > 1.0 && glass.nd < 3.0 &&
      !isNaN(glass.ne) && glass.ne > 1.0 && glass.ne < 3.0 &&
      !isNaN(glass.vd) && glass.vd > 10 && glass.vd < 200 &&
      glass.sellmeier.b1 !== undefined &&
      glass.sellmeier.c1 !== undefined
    );
  }

  /**
   * Get refractive index for a material at specified wavelength
   * Supports both glass names and numeric values for backward compatibility
   */
  static getRefractiveIndex(
    material: string | number, 
    wavelength: number = 587.6  // Default to d-line
  ): number {
    // Backward compatibility: if it's already a number, return it
    if (typeof material === 'number') {
      return material;
    }

    // Handle special cases
    if (material.toLowerCase() === 'air') {
      return 1.0;
    }
    if (material.toLowerCase() === 'vacuum') {
      return 1.0;
    }

    // Try to find in catalog
    const glass = this.glasses.get(material.toUpperCase());
    if (glass) {
      const refractiveIndex = this.calculateRefractiveIndex(glass, wavelength);
      return refractiveIndex;
    }

    // If not found, provide detailed error logging
    console.log(`❌ Material "${material}" not found in catalog`);
    console.log(`   Catalog status: ${this.catalogsLoaded ? 'loaded' : 'not loaded'}`);
    console.log(`   Total materials in catalog: ${this.glasses.size}`);
    
    // Try to find similar materials
    const searchName = material.toUpperCase();
    const similarMaterials = this.findSimilarGlasses(searchName);
    if (similarMaterials.length > 0) {
      console.log(`   Similar materials found: ${similarMaterials.slice(0, 5).join(', ')}`);
    }

    // If not found, throw descriptive error with suggestions
    const validation = this.validateMaterial(material);
    console.log(`❌ Error: ${validation.message}`);
    throw new Error(`❌ ${validation.message}`);
  }

  /**
   * Calculate refractive index using appropriate dispersion formula
   * Schott: n² = 1 + B1λ²/(λ²-C1) + B2λ²/(λ²-C2) + B3λ²/(λ²-C3)
   * Ohara: n² = A1 + A2λ² + A3λ⁻² + A4λ⁻⁴ + A5λ⁻⁶ + A6λ⁻⁸
   */
  private static calculateRefractiveIndex(glass: GlassData, wavelength: number): number {
    const λ = wavelength / 1000; // Convert nm to μm
    
    if (glass.manufacturer === 'SCHOTT') {
      // Schott Sellmeier formula
      const λ2 = λ * λ;
      const { b1, b2, b3, c1, c2, c3 } = glass.sellmeier;
      
      const term1 = (b1 * λ2) / (λ2 - c1);
      const term2 = (b2 * λ2) / (λ2 - c2);
      const term3 = (b3 * λ2) / (λ2 - c3);
      
      const n2 = 1 + term1 + term2 + term3;
      const n = Math.sqrt(Math.max(n2, 1.0));
      
      return n;
    } else if (glass.manufacturer === 'OHARA') {
      // Ohara uses same Sellmeier formula as Schott: n² - 1 = {A1 λ²/(λ² - B1)} + {A2 λ²/(λ² - B2)} + {A3 λ²/(λ² - B3)}
      // We store A1,A2,A3 in b1,b2,b3 and B1,B2,B3 in c1,c2,c3
      const λ2 = λ * λ;
      const { b1, b2, b3, c1, c2, c3 } = glass.sellmeier;
      
      console.log(`  OHARA Sellmeier coefficients:`, { 
        A1: b1, A2: b2, A3: b3, 
        B1: c1, B2: c2, B3: c3 
      });
      
      const term1 = (b1 * λ2) / (λ2 - c1);
      const term2 = (b2 * λ2) / (λ2 - c2);
      const term3 = (b3 * λ2) / (λ2 - c3);
      
      console.log(`  Terms: ${term1.toFixed(6)}, ${term2.toFixed(6)}, ${term3.toFixed(6)}`);
      
      const n2 = 1 + term1 + term2 + term3;
      const n = Math.sqrt(Math.max(n2, 1.0));
      
      console.log(`  n² = ${n2.toFixed(6)}, n = ${n.toFixed(6)}`);
      
      return n;
    } else {
      // Fallback to nd line value
      // Use fallback nd value if calculation fails
      return glass.nd;
    }
  }

  /**
   * Validate material name and provide suggestions
   * Implements fuzzy matching as requested
   */
  static validateMaterial(materialName: string): MaterialValidationResult {
    const upperName = materialName.toUpperCase();
    
    // Exact match
    if (this.glasses.has(upperName)) {
      return {
        found: true,
        exactMatch: upperName,
        suggestions: [],
        message: `✓ Found ${materialName} in catalog`
      };
    }

    // Fuzzy matching - find similar names
    const suggestions = this.findSimilarGlasses(upperName);
    
    if (suggestions.length > 0) {
      const topSuggestion = suggestions[0];
      return {
        found: false,
        suggestions: suggestions.slice(0, 3), // Top 3 suggestions
        message: `${materialName} not found in catalogs. Did you mean ${topSuggestion}?`
      };
    }

    return {
      found: false,
      suggestions: [],
      message: `${materialName} not found in catalogs. Use numeric refractive index or valid glass name.`
    };
  }

  /**
   * Find similar glass names using fuzzy matching
   * Prioritizes common glasses like BK7 → N-BK7
   */
  private static findSimilarGlasses(searchName: string): string[] {
    const allNames = Array.from(this.glasses.keys());
    const candidates: { name: string; score: number }[] = [];

    for (const glaseName of allNames) {
      const score = this.calculateSimilarity(searchName, glaseName);
      if (score > 0.5) { // Minimum similarity threshold
        candidates.push({ name: glaseName, score });
      }
    }

    // Sort by similarity score (descending)
    candidates.sort((a, b) => b.score - a.score);
    
    return candidates.slice(0, 5).map(c => c.name);
  }

  /**
   * Calculate string similarity for fuzzy matching
   * Uses a combination of substring matching and edit distance
   */
  private static calculateSimilarity(str1: string, str2: string): number {
    // Exact substring match gets high score
    if (str2.includes(str1)) return 0.9;
    if (str1.includes(str2)) return 0.8;

    // Common prefixes (N-BK7 vs BK7)
    if (str2.startsWith('N-' + str1)) return 0.85;
    if (str2.startsWith('S-' + str1)) return 0.85;

    // Edit distance based similarity
    const editDistance = this.levenshteinDistance(str1, str2);
    const maxLength = Math.max(str1.length, str2.length);
    return 1 - (editDistance / maxLength);
  }

  /**
   * Calculate Levenshtein distance for fuzzy matching
   */
  private static levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,     // deletion
          matrix[j - 1][i] + 1,     // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Get all available glasses, optionally filtered by manufacturer
   */
  static getAllGlasses(manufacturer?: string): GlassData[] {
    const allGlasses = Array.from(this.glasses.values());
    
    if (manufacturer) {
      return allGlasses.filter(g => 
        g.manufacturer.toUpperCase() === manufacturer.toUpperCase()
      );
    }
    
    return allGlasses;
  }

  /**
   * Get glass data by name
   */
  static getGlass(name: string): GlassData | undefined {
    const searchName = name.toUpperCase();
    return this.glasses.get(searchName);
  }

  /**
   * Check if catalog is loaded
   */
  static isLoaded(): boolean {
    return this.catalogsLoaded;
  }

  /**
   * Get catalog statistics
   */
  static getStats(): { total: number; schott: number; ohara: number } {
    const allGlasses = Array.from(this.glasses.values());
    return {
      total: allGlasses.length,
      schott: allGlasses.filter(g => g.manufacturer === 'SCHOTT').length,
      ohara: allGlasses.filter(g => g.manufacturer === 'OHARA').length
    };
  }

  /**
   * Force reload the catalogs (useful for debugging)
   */
  static async forceReload(): Promise<void> {
    console.log('🔄 Force reloading glass catalogs...');
    this.catalogsLoaded = false;
    this.loadPromise = null;
    this.glasses.clear();
    await this.initialize();
  }

  /**
   * Test material lookup functionality
   * Useful for debugging in the browser console
   */
  static testMaterialLookup(materials: string[] = ['Fluorite', 'Silica', 'BK7', 'SF11']): void {
    console.log('🧪 Testing material lookup functionality...');
    console.log(`   Catalog loaded: ${this.catalogsLoaded}`);
    console.log(`   Total materials: ${this.glasses.size}`);
    
    for (const material of materials) {
      console.log(`\n🔍 Testing material: "${material}"`);
      try {
        const glass = this.getGlass(material);
        if (glass) {
          console.log(`✅ Found: ${glass.name} (${glass.manufacturer}), nd=${glass.nd}, vd=${glass.vd}`);
          
          // Test refractive index calculation
          try {
            const n = this.getRefractiveIndex(material, 587.6);
            console.log(`✅ Refractive index at 587.6nm: ${n.toFixed(6)}`);
          } catch (error) {
            console.log(`❌ Refractive index calculation failed: ${error instanceof Error ? error.message : error}`);
          }
        }
      } catch (error) {
        console.log(`❌ Material lookup failed: ${error instanceof Error ? error.message : error}`);
      }
    }
    
    console.log('\n🧪 Material lookup test complete');
  }
}

/**
 * YAML Material Parser - handles both old n1/n2 and new material system
 */
export class MaterialParser {
  /**
   * Parse material specification from YAML surface definition
   * Prioritizes n1/n2 over material names as requested
   */
  static parseN1(surface: any, wavelength: number = 587.6): number {
    // Priority 1: numeric n1 value (backward compatibility)
    if (typeof surface.n1 === 'number') {
      return surface.n1;
    }

    // Priority 2: n1_material name
    if (surface.n1_material) {
      try {
        const result = GlassCatalog.getRefractiveIndex(surface.n1_material, wavelength);
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`n1_material error: ${errorMessage}`);
      }
    }

    // Fallback: Default to air (n=1.0) if no specification
    return 1.0;
  }

  /**
   * Parse n2 material specification
   */
  static parseN2(surface: any, wavelength: number = 587.6): number {
    // Priority 1: numeric n2 value (backward compatibility)
    if (typeof surface.n2 === 'number') {
      return surface.n2;
    }

    // Priority 2: n2_material name
    if (surface.n2_material) {
      try {
        const result = GlassCatalog.getRefractiveIndex(surface.n2_material, wavelength);
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`n2_material error: ${errorMessage}`);
      }
    }

    // Fallback: Default to air (n=1.0) if no specification
    return 1.0;
  }

  /**
   * Validate all materials in a YAML optical system
   * Returns validation results for user feedback
   */
  static validateSystemMaterials(yamlSystem: any): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    suggestions: Array<{ material: string; suggestion: string }>;
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: Array<{ material: string; suggestion: string }> = [];

    if (!yamlSystem.assemblies) {
      return { isValid: true, errors, warnings, suggestions };
    }

    // Check each assembly and surface
    for (const assembly of yamlSystem.assemblies) {
      if (!assembly) continue;

      // Check all surface properties (s1, s2, s3, etc.)
      for (const [key, surface] of Object.entries(assembly)) {
        if (key === 'aid' || !surface || typeof surface !== 'object') continue;

        const typedSurface = surface as OpticalSurface;

        // Validate n1_material
        if (typedSurface.n1_material && typeof typedSurface.n1 === 'undefined') {
          const validation = GlassCatalog.validateMaterial(typedSurface.n1_material);
          if (!validation.found) {
            if (validation.suggestions.length > 0) {
              suggestions.push({
                material: typedSurface.n1_material,
                suggestion: validation.suggestions[0]
              });
              warnings.push(`${key}.n1_material: ${validation.message}`);
            } else {
              errors.push(`${key}.n1_material: ${validation.message}`);
            }
          }
        }

        // Validate n2_material  
        if (typedSurface.n2_material && typeof typedSurface.n2 === 'undefined') {
          const validation = GlassCatalog.validateMaterial(typedSurface.n2_material);
          if (!validation.found) {
            if (validation.suggestions.length > 0) {
              suggestions.push({
                material: typedSurface.n2_material,
                suggestion: validation.suggestions[0]
              });
              warnings.push(`${key}.n2_material: ${validation.message}`);
            } else {
              errors.push(`${key}.n2_material: ${validation.message}`);
            }
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions
    };
  }
}
