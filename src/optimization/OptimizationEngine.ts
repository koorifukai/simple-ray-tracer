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
        // Variables and mode info
        // Mode and target info
        
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
    const lambda_factor = 2.5;

    let variables = [...problem.variables];
    let convergenceHistory: ConvergencePoint[] = [];

    // Create normalization factors for variables based on their ranges
    const normalizationFactors = variables.map(variable => {
      const range = variable.max - variable.min;
      return range > 0 ? range : 1;
    });

    // Evaluate initial objective
    let currentObjective = await this.evaluateObjective(problem, variables);
    convergenceHistory.push({
      iteration: 0,
      objective: currentObjective.value,
      variables: Object.fromEntries(variables.map(v => [v.name, v.current]))
    });

    let iteration = 0;
    let bestVariables = [...variables];
    let bestObjective = currentObjective.value;
    let stuckCounter = 0;

    // Compute initial gradient + Hessian to set lambda scale
    const { gradient: initGrad, hessian: initHessian } =
      await this.calculateGradientAndHessian(problem, variables, normalizationFactors, currentObjective.value);
    const maxDiag = Math.max(...initHessian.map((row, i) => row[i]));
    // Scale-aware initial lambda: 1% of max curvature (tau=0.01 standard LM init)
    let lambda = Math.max(0.01 * maxDiag, 1e-4);

    let firstIterGrad = initGrad;
    let firstIterHessian = initHessian;
    let gradientNeedsRecompute = false; // Reuse initial gradient/hessian for iteration 0

    for (iteration = 0; iteration < maxIterations; iteration++) {
      let gradient: number[];
      let hessian: number[][];

      if (gradientNeedsRecompute) {
        const result = await this.calculateGradientAndHessian(
          problem, variables, normalizationFactors, currentObjective.value);
        gradient = result.gradient;
        hessian = result.hessian;
      } else {
        gradient = firstIterGrad;
        hessian = firstIterHessian;
        gradientNeedsRecompute = true;
      }

      // Solve LM update: (H + λI)δ = -g in normalized space
      const normalizedDelta = this.solveLMUpdate(hessian, gradient, lambda);

      
      // Line search: up to 6 halvings for a better chance of finding a descent step
      let stepAccepted = false;
      let stepSize = 1.0;
      let newVariables = variables;
      let newObjective = currentObjective;

      for (let lineSearchIter = 0; lineSearchIter < 6; lineSearchIter++) {
        const scaledDelta = normalizedDelta.map(delta => delta * stepSize);
        const candidateVariables = this.applyNormalizedUpdate(variables, scaledDelta, normalizationFactors);
        const candidateObjective = await this.evaluateObjective(problem, candidateVariables);

        if (candidateObjective.valid && candidateObjective.value < currentObjective.value) {
          newVariables = candidateVariables;
          newObjective = candidateObjective;
          stepAccepted = true;
          break;
        }
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
        
        // console.log(`✅ Iteration ${iteration + 1}: objective = ${newObjective.value.toExponential(3)} ...`);
        
        // Check convergence
        if (Math.abs(improvement) < tolerance) {
          console.log(`🎉 Converged after ${iteration + 1} iterations (improvement < ${tolerance})`);
          break;
        }
      } else {
        // Reject step - use more sophisticated lambda increase
        
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

        // Stagnation restart: after 7 consecutive rejections, jump to best + small random perturbation
        if (stuckCounter >= 7 && bestObjective < 1000.0) {
          variables = bestVariables.map(v => {
            const range = v.max - v.min;
            const perturb = (Math.random() - 0.5) * 0.05 * range; // ±2.5% of range
            return { ...v, current: Math.max(v.min, Math.min(v.max, v.current + perturb)) };
          });
          currentObjective = await this.evaluateObjective(problem, variables);
          lambda = Math.max(0.01 * maxDiag, 1e-4); // Reset lambda
          stuckCounter = 0;
          gradientNeedsRecompute = true;
          console.log(`🔄 Stagnation restart at iter ${iteration + 1}, restarting from best + perturbation`);
        }
      }

      convergenceHistory.push({
        iteration: iteration + 1,
        objective: currentObjective.value,
        variables: Object.fromEntries(variables.map(v => [v.name, v.current]))
      });

      // Emergency stop for very high damping (likely stuck)
      if (lambda > 1e10) {
        console.log(`⚠️ High damping detected (λ=${lambda.toExponential(2)}), stopping optimization`);
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
    // Current variables
    
    // Substitute variables in YAML
    const substitutedYaml = VariableParser.substituteVariables(problem.originalYaml, variableMap);
    
    // Evaluate objective function
    const result = await ObjectiveFunctions.evaluate(substitutedYaml, problem.settings);
    
    return {
      value: result.valid ? result.value : 1000.0, // Use reasonable penalty for invalid results
      valid: result.valid
    };
  }
  
  /**
   * Calculate gradient and full Hessian in one pass.
   *
   * Gradient:  central differences  g_i = (f(x+h_i) – f(x–h_i)) / (2h)
   * Diagonal:  proper 2nd derivative H_ii = (f(x+h_i) – 2f(x) + f(x–h_i)) / h²  (reuses same evals)
   * Off-diag:  3-point mixed formula  H_ij ≈ (f(x+h_i+h_j) – f(x+h_i) – f(x+h_j) + f(x)) / h²
   *            (one extra eval per variable pair; for n=4 that is 6 extra evaluations)
   */
  private static async calculateGradientAndHessian(
    problem: OptimizationProblem,
    variables: OptimizationVariable[],
    normalizationFactors: number[],
    currentObjectiveValue: number
  ): Promise<{ gradient: number[]; hessian: number[][] }> {
    const n = variables.length;
    const h = 0.01; // 1 % of normalised range

    const fwdValues: number[] = new Array(n);
    const bwdValues: number[] = new Array(n);

    // 2n evaluations (forward + backward for each variable)
    for (let i = 0; i < n; i++) {
      const step = h * normalizationFactors[i];
      const fwd = [...variables];
      fwd[i] = { ...fwd[i], current: Math.min(fwd[i].max, fwd[i].current + step) };
      const bwd = [...variables];
      bwd[i] = { ...bwd[i], current: Math.max(bwd[i].min, bwd[i].current - step) };

      const [fo, bo] = await Promise.all([
        this.evaluateObjective(problem, fwd),
        this.evaluateObjective(problem, bwd)
      ]);
      fwdValues[i] = fo.value;
      bwdValues[i] = bo.value;
    }

    // Build gradient and diagonal Hessian (zero extra evaluations)
    const gradient: number[] = [];
    const hessian: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

    for (let i = 0; i < n; i++) {
      gradient.push((fwdValues[i] - bwdValues[i]) / (2 * h));
      const d2 = (fwdValues[i] - 2 * currentObjectiveValue + bwdValues[i]) / (h * h);
      hessian[i][i] = Math.max(Math.abs(d2), 1e-6);
    }

    // Off-diagonal cross-derivatives: one additional eval per pair
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const stepI = h * normalizationFactors[i];
        const stepJ = h * normalizationFactors[j];

        // f(x + h_i + h_j)
        const bothFwd = variables.map((v, k) => {
          if (k === i) return { ...v, current: Math.min(v.max, v.current + stepI) };
          if (k === j) return { ...v, current: Math.min(v.max, v.current + stepJ) };
          return v;
        });
        const bfo = await this.evaluateObjective(problem, bothFwd);

        // H_ij ≈ (f(x+h_i+h_j) – f(x+h_i) – f(x+h_j) + f(x)) / (h²)
        const cross = (bfo.value - fwdValues[i] - fwdValues[j] + currentObjectiveValue) / (h * h);

        // Cap off-diagonal to preserve positive semi-definiteness
        const maxOff = 0.5 * Math.sqrt(hessian[i][i] * hessian[j][j]);
        const capped = Math.max(-maxOff, Math.min(maxOff, cross));
        hessian[i][j] = capped;
        hessian[j][i] = capped;
      }
    }

    return { gradient, hessian };
  }

  /**
   * Apply normalised parameter update with denormalisation and bounds checking
   */
  private static applyNormalizedUpdate(
    variables: OptimizationVariable[],
    normalizedDelta: number[],
    normalizationFactors: number[]
  ): OptimizationVariable[] {
    return variables.map((variable, i) => {
      const actualDelta = normalizedDelta[i] * normalizationFactors[i];
      const newValue = variable.current + actualDelta;
      const clampedValue = Math.max(variable.min, Math.min(variable.max, newValue));
      return { ...variable, current: clampedValue };
    });
  }

  /**
   * Solve Levenberg-Marquardt update equation: (H + λI)δ = -g
   */
  private static solveLMUpdate(hessian: number[][], gradient: number[], lambda: number): number[] {
    const A = hessian.map((row, i) =>
      row.map((val, j) => i === j ? val + lambda : val)
    );
    const b = gradient.map(g => -g);
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
