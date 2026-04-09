/**
 * Variable Parser for Optimization System
 * Handles detection and substitution of optimization variables (V1-V4) in YAML content
 * Supports expressions like: V1, V1*3, V1+30, V4-15, V2/2
 */

import * as yaml from 'js-yaml';
import type { 
  OptimizationSettings, 
  OptimizationProblem, 
  OptimizationVariable, 
  VariableReference, 
  VariableMap 
} from './OptimizationTypes';

// Regex to match variable expressions: V1, V1*3, V1+30.5, V4-15, V2/2
// Captures: (1) variable name, (2) operator (optional), (3) operand (optional)
const VARIABLE_EXPR_REGEX = /^(V[1-4])([+\-*/])?([\d.]+)?$/;

// Regex to find variable expressions in text (for substitution)
// Matches: V1, V1*3, V1+30.5, V4-15, V2/2
const VARIABLE_EXPR_GLOBAL_REGEX = /\b(V[1-4])([+\-*/][\d.]+)?\b/g;

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
   * Parse a variable expression and return its components
   * @param expr Expression like "V1", "V1*3", "V1+30"
   * @returns { variable, operator, operand } or null if not a valid expression
   */
  private static parseVariableExpression(expr: string): { variable: string; operator?: string; operand?: number } | null {
    const match = expr.match(VARIABLE_EXPR_REGEX);
    if (!match) return null;
    
    const [, variable, operator, operandStr] = match;
    const operand = operandStr ? parseFloat(operandStr) : undefined;
    
    return { variable, operator, operand };
  }
  
  /**
   * Evaluate a variable expression with the given variable value
   * @param varValue Current value of the base variable
   * @param operator Operator (+, -, *, /)
   * @param operand Numeric operand
   * @returns Evaluated result
   */
  private static evaluateExpression(varValue: number, operator?: string, operand?: number): number {
    if (!operator || operand === undefined) {
      return varValue;
    }
    
    switch (operator) {
      case '+': return varValue + operand;
      case '-': return varValue - operand;
      case '*': return varValue * operand;
      case '/': return operand !== 0 ? varValue / operand : varValue;
      default: return varValue;
    }
  }
  
  /**
   * Recursively find all variable references in the YAML data
   * Now supports expressions like V1*3, V1+30, etc.
   */
  private static findVariableReferences(data: any, path: string[] = []): VariableReference[] {
    const references: VariableReference[] = [];
    
    if (typeof data === 'string') {
      // Check if this string contains a variable expression (V1, V1*3, V1+30, etc.)
      const parsed = this.parseVariableExpression(data);
      if (parsed) {
        references.push({
          variableName: parsed.variable,
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
   * Now supports expressions like V1*3, V1+30, V4-15, V2/2
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
    
    // Replace variable expressions with evaluated values
    let expressionCount = 0;
    const processedBefore = beforeOptimization.replace(VARIABLE_EXPR_GLOBAL_REGEX, (match, varName, operatorAndOperand) => {
      const varValue = variableMap[varName];
      
      if (varValue === undefined) {
        // Variable not in map, leave unchanged
        return match;
      }
      
      let result: number;
      
      if (operatorAndOperand) {
        // Parse operator and operand from the combined string (e.g., "+30", "*3")
        const operator = operatorAndOperand[0];
        const operand = parseFloat(operatorAndOperand.substring(1));
        result = this.evaluateExpression(varValue, operator, operand);
        console.log(`[VariableSub] ${match} = ${varName}(${varValue}) ${operator} ${operand} = ${result}`);
      } else {
        // Simple variable reference
        result = varValue;
        console.log(`[VariableSub] ${match} = ${result}`);
      }
      
      expressionCount++;
      return result.toString();
    });
    
    console.log(`[VariableSub] Total ${expressionCount} expressions substituted`);
    
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
