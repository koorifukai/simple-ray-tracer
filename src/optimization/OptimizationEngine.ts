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
    const lambda_initial = 0.01;    // Start with higher damping (more conservative)
    const lambda_factor = 2.5;      // More moderate lambda changes for stability
    
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
    let stuckCounter = 0; // Track consecutive rejected steps
    
    for (iteration = 0; iteration < maxIterations; iteration++) {
      // Calculate normalized gradient using finite differences
      const gradient = await this.calculateNormalizedGradient(problem, variables, normalizationFactors);
      
      // Calculate Hessian approximation (Gauss-Newton) in normalized space
      const hessian = await this.calculateHessianApproximation(problem, variables, gradient);
      
      // Solve LM update: (H + λI)δ = -g in normalized space
      const normalizedDelta = this.solveLMUpdate(hessian, gradient, lambda);
      
      // Try step with line search if we've been stuck
      let stepAccepted = false;
      let stepSize = 1.0;
      let newVariables = variables;
      let newObjective = currentObjective;
      
      // Line search to find acceptable step size
      for (let lineSearchIter = 0; lineSearchIter < 3; lineSearchIter++) {
        // Apply scaled update
        const scaledDelta = normalizedDelta.map(delta => delta * stepSize);
        const candidateVariables = this.applyNormalizedUpdate(variables, scaledDelta, normalizationFactors);
        
        // Evaluate candidate
        const candidateObjective = await this.evaluateObjective(problem, candidateVariables);
        
        if (candidateObjective.valid && candidateObjective.value < currentObjective.value) {
          // Accept this step size
          newVariables = candidateVariables;
          newObjective = candidateObjective;
          stepAccepted = true;
          break;
        }
        
        // Reduce step size for next attempt
        stepSize *= 0.5;
      }
      
      if (stepAccepted) {
        // Accept step
        const improvement = currentObjective.value - newObjective.value;
        const relativeImprovement = improvement / Math.abs(currentObjective.value);
        
        variables = newVariables;
        currentObjective = newObjective;
        stuckCounter = 0; // Reset stuck counter on successful step
        
        // Adaptive lambda reduction based on improvement quality
        if (relativeImprovement > 0.1) {
          // Great improvement - reduce lambda aggressively
          lambda = Math.max(lambda / (lambda_factor * 2), 1e-10);
        } else if (relativeImprovement > 0.01) {
          // Good improvement - normal reduction
          lambda = Math.max(lambda / lambda_factor, 1e-10);
        } else {
          // Small improvement - conservative reduction
          lambda = Math.max(lambda / Math.sqrt(lambda_factor), 1e-10);
        }
        
        // Track best solution
        if (newObjective.value < bestObjective) {
          bestVariables = [...variables];
          bestObjective = newObjective.value;
        }
        
        console.log(`✅ Iteration ${iteration + 1}: objective = ${newObjective.value.toExponential(3)} (Δ=${improvement.toExponential(2)}, ${(relativeImprovement*100).toFixed(2)}%), λ = ${lambda.toExponential(2)}, step = ${stepSize.toFixed(2)}`);
        
        // Check convergence
        if (Math.abs(improvement) < tolerance) {
          console.log(`🎉 Converged after ${iteration + 1} iterations (improvement < ${tolerance})`);
          break;
        }
      } else {
        // Reject step - use more sophisticated lambda increase
        const oldLambda = lambda;
        
        if (stuckCounter === 0) {
          // First rejection - moderate increase
          lambda = Math.min(lambda * lambda_factor, 1e10);
        } else if (stuckCounter < 3) {
          // Multiple rejections - more aggressive increase
          lambda = Math.min(lambda * (lambda_factor * 1.5), 1e10);
        } else {
          // Many rejections - try different approach
          lambda = Math.min(lambda * lambda_factor * lambda_factor, 1e10);
        }
        
        stuckCounter++;
        console.log(`❌ Iteration ${iteration + 1}: step rejected, λ: ${oldLambda.toExponential(2)} → ${lambda.toExponential(2)} (stuck: ${stuckCounter})`);
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
      success: bestObjective < 1000.0, // Success if we found a better solution than penalty value
      iterations: iteration + 1,
      finalObjective: bestObjective,
      optimizedVariables,
      convergenceHistory,
      errorMessage: iteration >= maxIterations ? `Maximum iterations reached (best objective: ${bestObjective.toExponential(3)})` : undefined
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
    
    // Debug: Log the current variable values
    console.log(`📊 Current variables:`, Object.entries(variableMap).map(([name, value]) => `${name}=${value.toFixed(6)}`).join(', '));
    
    // Substitute variables in YAML
    const substitutedYaml = VariableParser.substituteVariables(problem.originalYaml, variableMap);
    
    // Evaluate objective function
    const result = ObjectiveFunctions.evaluate(substitutedYaml, problem.settings);
    
    return {
      value: result.valid ? result.value : 1000.0, // Use reasonable penalty for invalid results
      valid: result.valid
    };
  }
  
  /**
   * Calculate normalized gradient using central finite differences for better accuracy
   * Uses (f(x+h) - f(x-h))/(2h) instead of forward differences
   */
  private static async calculateNormalizedGradient(
    problem: OptimizationProblem, 
    variables: OptimizationVariable[],
    normalizationFactors: number[]
  ): Promise<number[]> {
    const gradient: number[] = [];
    const h = 1e-4; // Finite difference step size in normalized space
    
    for (let i = 0; i < variables.length; i++) {
      // Calculate step size in actual variable space
      const actualStepSize = h * normalizationFactors[i];
      
      // Forward perturbation: x + h
      const forwardVariables = [...variables];
      forwardVariables[i] = { 
        ...forwardVariables[i], 
        current: Math.min(forwardVariables[i].max, forwardVariables[i].current + actualStepSize)
      };
      
      // Backward perturbation: x - h  
      const backwardVariables = [...variables];
      backwardVariables[i] = { 
        ...backwardVariables[i], 
        current: Math.max(backwardVariables[i].min, backwardVariables[i].current - actualStepSize)
      };
      
      // Evaluate both perturbations
      const [forwardObjective, backwardObjective] = await Promise.all([
        this.evaluateObjective(problem, forwardVariables),
        this.evaluateObjective(problem, backwardVariables)
      ]);
      
      // Central difference: (f(x+h) - f(x-h)) / (2h)
      const centralDifference = (forwardObjective.value - backwardObjective.value) / (2 * h);
      gradient.push(centralDifference);
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
      
      // Clamp to bounds and warn about boundary hits
      const clampedValue = Math.max(variable.min, Math.min(variable.max, newValue));
      const hitBoundary = (newValue <= variable.min || newValue >= variable.max);
      
      // Log significant updates for debugging
      if (Math.abs(actualDelta) > normalizationFactors[i] * 0.01) {
        const boundaryWarning = hitBoundary ? ' ⚠️ HIT BOUNDARY' : '';
        console.log(`   ${variable.name}: ${variable.current.toFixed(4)} → ${clampedValue.toFixed(4)} (Δ=${actualDelta.toFixed(4)})${boundaryWarning}`);
      }
      
      return { ...variable, current: clampedValue };
    });
  }
  
  /**
   * Calculate Hessian approximation using BFGS-like update
   * More sophisticated than simple diagonal but still stable
   */
  private static async calculateHessianApproximation(
    _problem: OptimizationProblem,
    variables: OptimizationVariable[],
    gradient: number[]
  ): Promise<number[][]> {
    const n = variables.length;
    const hessian: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));
    
    // Use improved diagonal approximation with gradient magnitude scaling
    for (let i = 0; i < n; i++) {
      // Scale diagonal based on gradient magnitude for better conditioning
      const gradMagnitude = Math.abs(gradient[i]);
      hessian[i][i] = Math.max(gradMagnitude, 1e-6); // Ensure positive definite
    }
    
    // Add small off-diagonal coupling terms based on gradient correlation
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        // Small coupling term proportional to product of gradients
        const coupling = 0.1 * Math.sign(gradient[i] * gradient[j]) * 
                        Math.sqrt(Math.abs(gradient[i] * gradient[j]));
        hessian[i][j] = coupling;
        hessian[j][i] = coupling; // Symmetric
      }
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
