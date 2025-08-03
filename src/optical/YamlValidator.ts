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
}
