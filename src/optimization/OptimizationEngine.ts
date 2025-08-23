/**
 * Levenberg-Marquardt Optimization Engine
 * Implements LM algorithm for optical system optimization
 */

import { VariableParser } from './VariableParser';
import { ObjectiveFunctions } from './ObjectiveFunctions';
import type { 
  OptimizationProblem, 
  OptimizationResult, 
  OptimizationVariable,
  ConvergencePoint
} from './OptimizationTypes';

export class OptimizationEngine {
  
  /**
   * Optimize optical system using Levenberg-Marquardt algorithm
   */
  static optimize(yamlContent: string): Promise<OptimizationResult> {
    return new Promise((resolve) => {
      try {
        // Parse optimization problem from YAML
        const problem = VariableParser.parseOptimizationProblem(yamlContent);
        
        if (!problem) {
          resolve({
            success: false,
            iterations: 0,
            finalObjective: Number.MAX_VALUE,
            optimizedVariables: {},
            convergenceHistory: [],
            errorMessage: 'No optimization_settings found in YAML'
          });
          return;
        }
        
        // Validate the problem
        const validationErrors = VariableParser.validateVariableReferences(problem);
        if (validationErrors.length > 0) {
          resolve({
            success: false,
            iterations: 0,
            finalObjective: Number.MAX_VALUE,
            optimizedVariables: {},
            convergenceHistory: [],
            errorMessage: `Validation errors: ${validationErrors.join('; ')}`
          });
          return;
        }
        
        console.log(`🔧 Starting LM optimization with ${problem.variables.length} variables...`);
        console.log(`📊 Variables: ${problem.variables.map(v => `${v.name}=[${v.min}, ${v.max}]`).join(', ')}`);
        console.log(`🎯 Mode: ${problem.settings.mode}, Target: surface ${problem.settings.obj}`);
        
        // Run Levenberg-Marquardt optimization
        this.runLevenbergMarquardt(problem).then(resolve);
        
      } catch (error) {
        resolve({
          success: false,
          iterations: 0,
          finalObjective: Number.MAX_VALUE,
          optimizedVariables: {},
          convergenceHistory: [],
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  }
  
  /**
   * Levenberg-Marquardt optimization implementation with variable normalization
   */
  private static async runLevenbergMarquardt(problem: OptimizationProblem): Promise<OptimizationResult> {
    const maxIterations = problem.settings.iterations;
    const tolerance = 1e-6;
    const lambda_initial = 0.001;
    const lambda_factor = 10;
    
    let variables = [...problem.variables];
    let lambda = lambda_initial;
    let convergenceHistory: ConvergencePoint[] = [];
    
    // Create normalization factors for variables based on their ranges
    const normalizationFactors = variables.map(variable => {
      const range = variable.max - variable.min;
      return range > 0 ? range : 1; // Avoid division by zero
    });
    
    console.log(`📏 Variable normalization factors:`);
    variables.forEach((variable, i) => {
      console.log(`   ${variable.name}: range=[${variable.min}, ${variable.max}], factor=${normalizationFactors[i].toFixed(3)}`);
    });
    
    // Evaluate initial objective
    let currentObjective = await this.evaluateObjective(problem, variables);
    convergenceHistory.push({
      iteration: 0,
      objective: currentObjective.value,
      variables: Object.fromEntries(variables.map(v => [v.name, v.current]))
    });
    
    console.log(`🎯 Initial objective: ${currentObjective.value.toExponential(3)}`);
    
    let iteration = 0;
    let bestVariables = [...variables];
    let bestObjective = currentObjective.value;
    
    for (iteration = 0; iteration < maxIterations; iteration++) {
      // Calculate normalized gradient using finite differences
      const gradient = await this.calculateNormalizedGradient(problem, variables, normalizationFactors);
      
      // Calculate Hessian approximation (Gauss-Newton) in normalized space
      const hessian = await this.calculateHessianApproximation(problem, variables, gradient);
      
      // Solve LM update: (H + λI)δ = -g in normalized space
      const normalizedDelta = this.solveLMUpdate(hessian, gradient, lambda);
      
      // Denormalize and apply update with bounds checking
      const newVariables = this.applyNormalizedUpdate(variables, normalizedDelta, normalizationFactors);
      
      // Evaluate new objective
      const newObjective = await this.evaluateObjective(problem, newVariables);
      
      if (newObjective.valid && newObjective.value < currentObjective.value) {
        // Accept step
        variables = newVariables;
        currentObjective = newObjective;
        lambda = Math.max(lambda / lambda_factor, 1e-10);
        
        // Track best solution
        if (newObjective.value < bestObjective) {
          bestVariables = [...variables];
          bestObjective = newObjective.value;
        }
        
        const improvement = convergenceHistory[convergenceHistory.length - 1].objective - newObjective.value;
        console.log(`✅ Iteration ${iteration + 1}: objective = ${newObjective.value.toExponential(3)} (Δ=${improvement.toExponential(2)}), λ = ${lambda.toExponential(2)}`);
        
        // Check convergence
        if (Math.abs(improvement) < tolerance) {
          console.log(`🎉 Converged after ${iteration + 1} iterations (improvement < ${tolerance})`);
          break;
        }
      } else {
        // Reject step, increase damping
        lambda = Math.min(lambda * lambda_factor, 1e10);
        console.log(`❌ Iteration ${iteration + 1}: step rejected, increasing λ to ${lambda.toExponential(2)}`);
      }
      
      convergenceHistory.push({
        iteration: iteration + 1,
        objective: currentObjective.value,
        variables: Object.fromEntries(variables.map(v => [v.name, v.current]))
      });
      
      // Emergency stop for very high damping (likely stuck)
      if (lambda > 1e8) {
        console.log(`⚠️ High damping detected, stopping optimization`);
        break;
      }
    }
    
    // Use best variables found
    variables = bestVariables;
    
    const optimizedVariables: { [key: string]: number } = {};
    variables.forEach(variable => {
      optimizedVariables[variable.name] = variable.current;
    });
    
    console.log(`🏁 Optimization complete:`);
    console.log(`   Final objective: ${bestObjective.toExponential(3)}`);
    console.log(`   Optimized variables: ${Object.entries(optimizedVariables).map(([k, v]) => `${k}=${v.toFixed(4)}`).join(', ')}`);
    
    return {
      success: iteration < maxIterations || bestObjective < currentObjective.value,
      iterations: iteration + 1,
      finalObjective: bestObjective,
      optimizedVariables,
      convergenceHistory,
      errorMessage: iteration >= maxIterations ? 'Maximum iterations reached' : undefined
    };
  }
  
  /**
   * Evaluate objective function for given variables
   */
  private static async evaluateObjective(
    problem: OptimizationProblem, 
    variables: OptimizationVariable[]
  ): Promise<{ value: number; valid: boolean }> {
    // Create variable map
    const variableMap = VariableParser.createVariableMap(variables);
    
    // Substitute variables in YAML
    const substitutedYaml = VariableParser.substituteVariables(problem.originalYaml, variableMap);
    
    // Evaluate objective function
    const result = ObjectiveFunctions.evaluate(substitutedYaml, problem.settings);
    
    return {
      value: result.valid ? result.value : Number.MAX_VALUE,
      valid: result.valid
    };
  }
  
  /**
   * Calculate normalized gradient using finite differences
   * Normalizes variables to [0,1] range for consistent step sizes
   */
  private static async calculateNormalizedGradient(
    problem: OptimizationProblem, 
    variables: OptimizationVariable[],
    normalizationFactors: number[]
  ): Promise<number[]> {
    const gradient: number[] = [];
    const h = 1e-6; // Finite difference step size in normalized space
    
    const baseObjective = await this.evaluateObjective(problem, variables);
    
    for (let i = 0; i < variables.length; i++) {
      // Calculate step size in actual variable space (h * normalization factor)
      const actualStepSize = h * normalizationFactors[i];
      
      // Perturb variable
      const perturbedVariables = [...variables];
      perturbedVariables[i] = { 
        ...perturbedVariables[i], 
        current: Math.min(perturbedVariables[i].max, perturbedVariables[i].current + actualStepSize)
      };
      
      const perturbedObjective = await this.evaluateObjective(problem, perturbedVariables);
      
      // Calculate normalized finite difference (gradient in normalized space)
      const normalizedDerivative = (perturbedObjective.value - baseObjective.value) / h;
      gradient.push(normalizedDerivative);
    }
    
    return gradient;
  }
  
  /**
   * Apply normalized parameter update with denormalization and bounds checking
   */
  private static applyNormalizedUpdate(
    variables: OptimizationVariable[], 
    normalizedDelta: number[],
    normalizationFactors: number[]
  ): OptimizationVariable[] {
    return variables.map((variable, i) => {
      // Denormalize the update step
      const actualDelta = normalizedDelta[i] * normalizationFactors[i];
      const newValue = variable.current + actualDelta;
      
      // Clamp to bounds
      const clampedValue = Math.max(variable.min, Math.min(variable.max, newValue));
      
      // Log significant updates for debugging
      if (Math.abs(actualDelta) > normalizationFactors[i] * 0.01) {
        console.log(`   ${variable.name}: ${variable.current.toFixed(4)} → ${clampedValue.toFixed(4)} (Δ=${actualDelta.toFixed(4)})`);
      }
      
      return { ...variable, current: clampedValue };
    });
  }
  
  /**
   * Calculate Hessian approximation using Gauss-Newton method
   */
  private static async calculateHessianApproximation(
    _problem: OptimizationProblem,
    variables: OptimizationVariable[],
    gradient: number[]
  ): Promise<number[][]> {
    const n = variables.length;
    const hessian: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));
    
    // For now, use simple diagonal approximation (steepest descent direction)
    // This is less sophisticated than full Gauss-Newton but more stable
    for (let i = 0; i < n; i++) {
      hessian[i][i] = Math.abs(gradient[i]) + 1e-8; // Avoid singular matrix
    }
    
    return hessian;
  }
  
  /**
   * Solve Levenberg-Marquardt update equation: (H + λI)δ = -g
   */
  private static solveLMUpdate(hessian: number[][], gradient: number[], lambda: number): number[] {
    const A = hessian.map((row, i) => 
      row.map((val, j) => i === j ? val + lambda : val)
    );
    const b = gradient.map(g => -g);
    
    // Simple Gauss elimination (could be improved with LU decomposition)
    return this.solveLinearSystem(A, b);
  }
  
  /**
   * Simple linear system solver using Gauss elimination
   */
  private static solveLinearSystem(A: number[][], b: number[]): number[] {
    const n = A.length;
    const augmented = A.map((row, i) => [...row, b[i]]);
    
    // Forward elimination
    for (let i = 0; i < n; i++) {
      // Find pivot
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
          maxRow = k;
        }
      }
      [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];
      
      // Make all rows below this one 0 in current column
      for (let k = i + 1; k < n; k++) {
        const factor = augmented[k][i] / augmented[i][i];
        for (let j = i; j <= n; j++) {
          augmented[k][j] -= factor * augmented[i][j];
        }
      }
    }
    
    // Back substitution
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      x[i] = augmented[i][n];
      for (let j = i + 1; j < n; j++) {
        x[i] -= augmented[i][j] * x[j];
      }
      x[i] /= augmented[i][i];
    }
    
    return x;
  }
}
