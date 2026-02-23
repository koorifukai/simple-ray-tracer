import * as yaml from 'js-yaml';

export interface ValidationError {
  line: number;
  column: number;
  message: string;
  type: 'error' | 'warning';
  startColumn?: number;
  endColumn?: number;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  parsedData?: any;
}

/**
 * Simple YAML validator that only catches critical formatting errors
 * Not overly strict - focuses on syntax issues that would break parsing
 */
export class YamlValidator {
  
  /**
   * Validate YAML content and return detailed errors with positions
   */
  static validate(yamlContent: string): ValidationResult {
    const errors: ValidationError[] = [];
    
    try {
      // First, check for basic YAML parsing
      const parsedData = yaml.load(yamlContent);
      
      // Only check for critical formatting issues
      this.validateInlineObjectFormat(yamlContent, errors);
      
      // Perform semantic validation (e.g., refractive index consistency)
      if (parsedData) {
        this.validateSemanticRules(parsedData, errors);
      }
      
      return {
        isValid: errors.length === 0,
        errors,
        parsedData
      };
      
    } catch (error) {
      // Handle YAML parsing errors
      const yamlError = error as any;
      const line = yamlError.mark?.line ? yamlError.mark.line + 1 : 1;
      const column = yamlError.mark?.column ? yamlError.mark.column + 1 : 1;
      
      errors.push({
        line,
        column,
        message: yamlError.message || 'YAML parsing error',
        type: 'error'
      });
      
      return {
        isValid: false,
        errors,
        parsedData: null
      };
    }
  }

  /**
   * Check for common inline object formatting issues that break YAML parsing
   * Only flags real syntax errors, not missing optional parameters
   */
  private static validateInlineObjectFormat(content: string, errors: ValidationError[]): void {
    const lines = content.split('\n');
    
    lines.forEach((line, lineIndex) => {
      const lineNumber = lineIndex + 1;
      
      // Check for missing space after colon in inline objects {key:value} -> should be {key: value}
      const missingSpaceAfterColon = /\{[^}]*\w+:[^}\s]/g;
      let match;
      while ((match = missingSpaceAfterColon.exec(line)) !== null) {
        const colonIndex = line.indexOf(':', match.index);
        errors.push({
          line: lineNumber,
          column: colonIndex + 2,
          message: 'Missing space after colon in inline object. Use "key: value" instead of "key:value"',
          type: 'error',
          startColumn: colonIndex + 1,
          endColumn: colonIndex + 2
        });
      }
      
      // Check for missing comma between inline object properties {key: value key2: value2} -> should be {key: value, key2: value2}
      const missingComma = /\{[^}]*\w+:\s*[^,}]+\s+\w+:/g;
      while ((match = missingComma.exec(line)) !== null) {
        // Find the position where comma should be
        const beforeSecondKey = line.lastIndexOf(' ', match.index + match[0].length - 1);
        if (beforeSecondKey > match.index) {
          errors.push({
            line: lineNumber,
            column: beforeSecondKey,
            message: 'Missing comma between properties in inline object',
            type: 'error',
            startColumn: beforeSecondKey,
            endColumn: beforeSecondKey + 1
          });
        }
      }
      
      // Check for unmatched braces
      const openBraces = (line.match(/\{/g) || []).length;
      const closeBraces = (line.match(/\}/g) || []).length;
      if (openBraces !== closeBraces) {
        errors.push({
          line: lineNumber,
          column: line.length,
          message: 'Unmatched braces in inline object',
          type: 'error'
        });
      }
    });
  }

  /**
   * Perform semantic validation on the parsed YAML data
   * Checks for physical consistency like matching refractive indices between adjacent surfaces
   */
  private static validateSemanticRules(data: any, errors: ValidationError[]): void {
    if (!data || !data.assemblies || !Array.isArray(data.assemblies)) {
      return;
    }

    // We need to check the sequence of surfaces in assemblies
    // For now, we'll just check within each assembly
    data.assemblies.forEach((assembly: any, assemblyIndex: number) => {
      // Extract surfaces from assembly (excluding 'aid')
      const surfaceKeys = Object.keys(assembly).filter(key => key !== 'aid');
      
      // Sort keys to ensure sequential processing (s1, s2, s3...)
      // This assumes keys are named like 's1', 's2', etc.
      surfaceKeys.sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.replace(/\D/g, '')) || 0;
        return numA - numB;
      });

      let currentMedium: string | number = 1.0;

      for (let i = 0; i < surfaceKeys.length; i++) {
        const key = surfaceKeys[i];
        const surface = assembly[key];
        
        if (!surface || typeof surface !== 'object') {
          continue;
        }

        // Determine explicit n1
        let explicitN1: string | number | undefined = undefined;
        if (surface.n1_material !== undefined) {
          explicitN1 = surface.n1_material;
        } else if (surface.n1 !== undefined) {
          explicitN1 = surface.n1;
        }

        // Check for mismatch
        if (explicitN1 !== undefined && explicitN1 !== currentMedium) {
          errors.push({
            line: 1,
            column: 1,
            message: `Refractive index mismatch in assembly ${assembly.aid !== undefined ? assembly.aid : assemblyIndex} at ${key}: entrance index (${explicitN1}) does not match previous medium (${currentMedium}).`,
            type: 'warning'
          });
        }

        // Determine n2 for the next iteration
        if (surface.n2_material !== undefined) {
          currentMedium = surface.n2_material;
        } else if (surface.n2 !== undefined) {
          currentMedium = surface.n2;
        } else {
          currentMedium = 1.0;
        }
      }
    });
  }
}
