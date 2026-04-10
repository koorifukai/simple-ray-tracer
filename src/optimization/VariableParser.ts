/**
 * Variable Parser for Optimization System
 * Handles detection and substitution of optimization variables (V1-V4) in YAML content
 * Supports complex expressions like: V1, V1*3, V1+30, V1*-1, 180-V1, V1*-1+180, 0-V1
 * Rule: Each expression uses exactly ONE variable (V1-V4) but can have multiple operations
 */

import * as yaml from 'js-yaml';
import type { 
  OptimizationSettings, 
  OptimizationProblem, 
  OptimizationVariable, 
  VariableReference, 
  VariableMap 
} from './OptimizationTypes';

// Regex to detect if a string contains a variable (V1, V2, V3, or V4)
const HAS_VARIABLE_REGEX = /V[1-4]/;

// Regex to extract the variable name from an expression
const EXTRACT_VARIABLE_REGEX = /V[1-4]/;

// Regex to match a complete variable expression in text
// Matches patterns like: V1, V1*3, V1+30, V1*-1, 180-V1, V1*-1+180, 0-V1
// This captures: optional prefix (number and operator), variable, optional suffix (operators and numbers)
const VARIABLE_EXPR_GLOBAL_REGEX = /(?:[\d.]+[+\-*/])?V[1-4](?:[+\-*/][\d.\-]+)*/g;

// Safe math expression regex - only allows digits, operators, decimal, parentheses, whitespace, and minus for negatives
const SAFE_MATH_REGEX = /^[\d\s+\-*/.()]+$/;

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
   * Check if a string is a variable expression
   * @param expr Expression to check
   * @returns true if the expression contains a variable (V1-V4)
   */
  private static isVariableExpression(expr: string): boolean {
    return HAS_VARIABLE_REGEX.test(expr);
  }
  
  /**
   * Extract the base variable name from an expression
   * @param expr Expression like "V1*-1+180" or "180-V1"
   * @returns Variable name (V1, V2, V3, or V4) or null
   */
  private static extractVariableName(expr: string): string | null {
    const match = expr.match(EXTRACT_VARIABLE_REGEX);
    return match ? match[0] : null;
  }
  
  /**
   * Safely evaluate a numeric expression (no variables, just numbers and operators)
   * @param expr Expression like "10*-1+180" 
   * @returns Evaluated result or null if invalid
   */
  private static safeEvaluateNumeric(expr: string): number | null {
    // Validate expression only contains safe characters
    if (!SAFE_MATH_REGEX.test(expr)) {
      console.warn(`[VariableParser] Unsafe expression rejected: ${expr}`);
      return null;
    }
    
    try {
      // Use Function constructor for safe evaluation (no access to scope)
      const result = Function(`"use strict"; return (${expr})`)();
      if (typeof result === 'number' && isFinite(result)) {
        return result;
      }
      return null;
    } catch (e) {
      console.warn(`[VariableParser] Failed to evaluate expression: ${expr}`, e);
      return null;
    }
  }
  
  /**
   * Evaluate a variable expression by substituting the variable value
   * @param expr Expression like "V1*-1+180" or "180-V1"
   * @param varValue The value of the variable
   * @returns Evaluated numeric result
   */
  private static evaluateVariableExpression(expr: string, varValue: number): number | null {
    // Replace the variable with its value (wrapped in parentheses for safety)
    const numericExpr = expr.replace(/V[1-4]/, `(${varValue})`);
    
    // Evaluate the resulting numeric expression
    return this.safeEvaluateNumeric(numericExpr);
  }
  
  /**
   * Recursively find all variable references in the YAML data
   * Supports complex expressions like V1*-1, 180-V1, V1*-1+180, etc.
   */
  private static findVariableReferences(data: any, path: string[] = []): VariableReference[] {
    const references: VariableReference[] = [];
    
    if (typeof data === 'string') {
      // Check if this string contains a variable expression
      if (this.isVariableExpression(data)) {
        const varName = this.extractVariableName(data);
        if (varName) {
          references.push({
            variableName: varName,
            path: [...path],
            originalValue: data
          });
        }
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
   * Supports complex expressions like: V1*-1, 180-V1, V1*-1+180, 0-V1
   */
  static substituteVariables(yamlContent: string, variableMap: VariableMap): string {
    // Split content to preserve optimization_settings
    const optimizationStart = yamlContent.indexOf('optimization_settings:');
    
    let beforeOptimization: string;
    let afterOptimization: string;
    
    if (optimizationStart !== -1) {
      beforeOptimization = yamlContent.substring(0, optimizationStart);
      afterOptimization = yamlContent.substring(optimizationStart);
    } else {
      beforeOptimization = yamlContent;
      afterOptimization = '';
    }
    
    console.log('[VariableSub] Substituting variables:', variableMap);
    
    // Replace variable expressions with evaluated numeric values
    let expressionCount = 0;
    let failedCount = 0;
    
    const processedBefore = beforeOptimization.replace(VARIABLE_EXPR_GLOBAL_REGEX, (match) => {
      // Extract the variable name from the expression
      const varName = this.extractVariableName(match);
      if (!varName) {
        console.warn(`[VariableSub] Could not extract variable from: ${match}`);
        return match;
      }
      
      const varValue = variableMap[varName];
      if (varValue === undefined) {
        // Variable not in map, leave unchanged
        console.log(`[VariableSub] Variable ${varName} not in map, skipping: ${match}`);
        return match;
      }
      
      // Evaluate the expression
      const result = this.evaluateVariableExpression(match, varValue);
      
      if (result === null) {
        console.warn(`[VariableSub] Failed to evaluate: ${match} with ${varName}=${varValue}`);
        failedCount++;
        return match;
      }
      
      console.log(`[VariableSub] ${match} = ${result} (${varName}=${varValue})`);
      expressionCount++;
      return result.toString();
    });
    
    console.log(`[VariableSub] Total ${expressionCount} expressions substituted${failedCount > 0 ? `, ${failedCount} failed` : ''}`);
    
    return processedBefore + afterOptimization;
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
