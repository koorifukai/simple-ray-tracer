/**
 * TypeScript interfaces for optical system optimization
 * Supporting Levenberg-Marquardt optimization with variable substitution
 */

/**
 * Optimization variable definition
 * For LM optimization, we only need min and max bounds
 */
export interface OptimizationVariable {
  name: string;        // V1, V2, V3, V4
  min: number;         // Lower bound
  max: number;         // Upper bound
  current: number;     // Current value during optimization
}

/**
 * Optimization settings from YAML
 */
export interface OptimizationSettings {
  iterations: number;
  variables: { [key: string]: [number, number, number] }; // V1: [min, max, unused]
  obj: number;         // Target surface index (-1 = last, -2 = second-to-last)
  mode: 'aberrations' | 'angle';
  param?: any;         // Additional parameters (e.g., target angle for angle mode)
}

/**
 * Optimization result
 */
export interface OptimizationResult {
  success: boolean;
  iterations: number;
  finalObjective: number;
  optimizedVariables: { [key: string]: number };
  convergenceHistory: ConvergencePoint[];
  errorMessage?: string;
}

/**
 * Single point in optimization convergence history
 */
export interface ConvergencePoint {
  iteration: number;
  objective: number;
  variables: { [key: string]: number };
}

/**
 * Variable substitution map
 * Maps variable names to their current values
 */
export interface VariableMap {
  [variableName: string]: number;
}

/**
 * Parsed optimization problem
 */
export interface OptimizationProblem {
  variables: OptimizationVariable[];
  settings: OptimizationSettings;
  originalYaml: string;           // Original YAML with variables
  variablePositions: VariableReference[];  // Where variables appear in YAML
}

/**
 * Reference to where a variable appears in the YAML structure
 */
export interface VariableReference {
  variableName: string;
  path: string[];      // JSON path to the field (e.g., ['surfaces', 0, 'position', 0])
  originalValue: string; // Original string value (e.g., "V1")
}

/**
 * Objective function evaluation result
 */
export interface ObjectiveResult {
  value: number;       // Objective function value (lower is better)
  valid: boolean;      // Whether the evaluation was successful
  rayCount?: number;   // Number of rays that reached the target
  details?: any;       // Additional diagnostic information
}
