/**
 * Variable Parser for Optimization System
 * Handles detection and substitution of optimization variables (V1-V4) in YAML content
 */

import * as yaml from 'js-yaml';
import type { 
  OptimizationSettings, 
  OptimizationProblem, 
  OptimizationVariable, 
  VariableReference, 
  VariableMap 
} from './OptimizationTypes';

export class VariableParser {
  
  /**
   * Parse YAML content and extract optimization problem
   */
  static parseOptimizationProblem(yamlContent: string): OptimizationProblem | null {
    try {
      const data = yaml.load(yamlContent) as any;
      
      // Check if optimization_settings exists
      if (!data.optimization_settings) {
        return null; // No optimization requested
      }
      
      const settings = this.parseOptimizationSettings(data.optimization_settings);
      const variableReferences = this.findVariableReferences(data);
      const variables = this.createOptimizationVariables(settings, variableReferences);
      
      return {
        variables,
        settings,
        originalYaml: yamlContent,
        variablePositions: variableReferences
      };
      
    } catch (error) {
      console.error('Failed to parse optimization problem:', error);
      return null;
    }
  }
  
  /**
   * Parse optimization_settings section from YAML data
   */
  private static parseOptimizationSettings(optimizationData: any): OptimizationSettings {
    const settings: OptimizationSettings = {
      iterations: optimizationData.iterations || 20,
      variables: {},
      obj: optimizationData.obj || -1,
      mode: optimizationData.mode || 'aberrations',
      param: optimizationData.param
    };
    
    // Parse variable definitions (V1, V2, V3, V4)
    ['V1', 'V2', 'V3', 'V4'].forEach(varName => {
      if (optimizationData[varName] && Array.isArray(optimizationData[varName])) {
        const [min, max, unused] = optimizationData[varName];
        settings.variables[varName] = [min, max, unused];
      }
    });
    
    return settings;
  }
  
  /**
   * Recursively find all variable references in the YAML data
   */
  private static findVariableReferences(data: any, path: string[] = []): VariableReference[] {
    const references: VariableReference[] = [];
    
    if (typeof data === 'string') {
      // Check if this string is a variable reference (V1, V2, V3, V4)
      const match = data.match(/^(V[1-4])$/);
      if (match) {
        references.push({
          variableName: match[1],
          path: [...path],
          originalValue: data
        });
      }
    } else if (Array.isArray(data)) {
      data.forEach((item, index) => {
        references.push(...this.findVariableReferences(item, [...path, index.toString()]));
      });
    } else if (typeof data === 'object' && data !== null) {
      Object.entries(data).forEach(([key, value]) => {
        // Skip optimization_settings to avoid self-reference
        if (key !== 'optimization_settings') {
          references.push(...this.findVariableReferences(value, [...path, key]));
        }
      });
    }
    
    return references;
  }
  
  /**
   * Create optimization variables from settings and references
   */
  private static createOptimizationVariables(
    settings: OptimizationSettings,
    references: VariableReference[]
  ): OptimizationVariable[] {
    const variables: OptimizationVariable[] = [];
    const referencedVariables = new Set(references.map(ref => ref.variableName));
    
    // Only create variables that are both defined in settings AND referenced in YAML
    Object.entries(settings.variables).forEach(([varName, bounds]) => {
      if (referencedVariables.has(varName)) {
        const [min, max] = bounds;
        variables.push({
          name: varName,
          min,
          max,
          current: (min + max) / 2 // Start at midpoint
        });
      }
    });
    
    return variables;
  }
  
  /**
   * Substitute variables in YAML content with current values
   * Preserves optimization_settings section unchanged
   */
  static substituteVariables(yamlContent: string, variableMap: VariableMap): string {
    let substitutedContent = yamlContent;
    
    // Replace each variable with its current value, but skip optimization_settings section
    Object.entries(variableMap).forEach(([varName, value]) => {
      // Split content to preserve optimization_settings
      const optimizationStart = substitutedContent.indexOf('optimization_settings:');
      
      if (optimizationStart !== -1) {
        // Process content before optimization_settings
        const beforeOptimization = substitutedContent.substring(0, optimizationStart);
        const afterOptimization = substitutedContent.substring(optimizationStart);
        
        // Only substitute in the part before optimization_settings
        const regex = new RegExp(`\\b${varName}\\b`, 'g');
        const processedBefore = beforeOptimization.replace(regex, value.toString());
        
        substitutedContent = processedBefore + afterOptimization;
      } else {
        // No optimization_settings found, substitute everywhere
        const regex = new RegExp(`\\b${varName}\\b`, 'g');
        substitutedContent = substitutedContent.replace(regex, value.toString());
      }
    });
    
    return substitutedContent;
  }
  
  /**
   * Create variable map from optimization variables
   */
  static createVariableMap(variables: OptimizationVariable[]): VariableMap {
    const map: VariableMap = {};
    variables.forEach(variable => {
      map[variable.name] = variable.current;
    });
    return map;
  }
  
  /**
   * Update optimization variables with new values
   */
  static updateVariables(
    variables: OptimizationVariable[], 
    newValues: { [varName: string]: number }
  ): OptimizationVariable[] {
    return variables.map(variable => {
      if (newValues.hasOwnProperty(variable.name)) {
        // Clamp to bounds
        const newValue = Math.max(variable.min, Math.min(variable.max, newValues[variable.name]));
        return { ...variable, current: newValue };
      }
      return variable;
    });
  }
  
  /**
   * Validate that all referenced variables are defined in optimization settings
   */
  static validateVariableReferences(problem: OptimizationProblem): string[] {
    const errors: string[] = [];
    const definedVariables = new Set(problem.variables.map(v => v.name));
    
    problem.variablePositions.forEach(ref => {
      if (!definedVariables.has(ref.variableName)) {
        errors.push(
          `Variable ${ref.variableName} referenced at ${ref.path.join('.')} but not defined in optimization_settings`
        );
      }
    });
    
    return errors;
  }
}
