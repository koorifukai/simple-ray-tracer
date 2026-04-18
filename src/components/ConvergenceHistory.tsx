/**
 * Optimization Panel
 * Provides manual variable evaluation inputs and displays convergence history
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { VariableParser, ObjectiveFunctions } from '../optimization';
import type { ConvergencePoint, OptimizationResult, OptimizationProblem } from '../optimization/OptimizationTypes';

interface OptimizationPanelProps {
  yamlContent: string;
  optimizationResult: OptimizationResult | null;
  onRunPreview?: (substitutedYaml: string) => void;
}

export const OptimizationPanel: React.FC<OptimizationPanelProps> = ({
  yamlContent,
  optimizationResult,
  onRunPreview
}) => {
  const [problem, setProblem] = useState<OptimizationProblem | null>(null);
  const [manualValues, setManualValues] = useState<{ [name: string]: number }>({});
  const [inputStrings, setInputStrings] = useState<{ [name: string]: string }>({});
  const [manualObjective, setManualObjective] = useState<number | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const evalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Parse optimization problem from YAML whenever YAML changes
  useEffect(() => {
    const parsed = VariableParser.parseOptimizationProblem(yamlContent);
    setProblem(parsed);
    if (parsed) {
      const initValues: { [name: string]: number } = {};
      const initStrings: { [name: string]: string } = {};
      parsed.variables.forEach(v => {
        initValues[v.name] = v.current;
        initStrings[v.name] = String(v.current);
      });
      setManualValues(initValues);
      setInputStrings(initStrings);
      setManualObjective(null);
    } else {
      setManualValues({});
      setInputStrings({});
      setManualObjective(null);
    }
  }, [yamlContent]);

  // When optimization completes, populate inputs with the optimized values
  useEffect(() => {
    if (!optimizationResult?.optimizedVariables) return;
    const vars = optimizationResult.optimizedVariables;
    if (Object.keys(vars).length === 0) return;
    setManualValues(prev => ({ ...prev, ...vars }));
    setInputStrings(prev => {
      const next = { ...prev };
      Object.entries(vars).forEach(([k, v]) => { next[k] = String(v); });
      return next;
    });
    if (optimizationResult.finalObjective !== undefined) {
      setManualObjective(optimizationResult.finalObjective);
    }
  }, [optimizationResult]);

  const triggerEvaluation = useCallback((values: { [name: string]: number }, currentProblem: OptimizationProblem) => {
    if (evalTimerRef.current) clearTimeout(evalTimerRef.current);
    evalTimerRef.current = setTimeout(async () => {
      setIsEvaluating(true);
      try {
        const varMap: { [name: string]: number } = {};
        currentProblem.variables.forEach(v => { varMap[v.name] = values[v.name] ?? v.current; });
        const substituted = VariableParser.substituteVariables(yamlContent, varMap);
        const result = await ObjectiveFunctions.evaluate(substituted, currentProblem.settings);
        setManualObjective(result.value);
      } catch {
        setManualObjective(null);
      } finally {
        setIsEvaluating(false);
      }
    }, 400);
  }, [yamlContent]);

  const handleValueChange = useCallback((name: string, raw: string) => {
    if (!problem) return;
    // Always update the raw string so partial input like "-" or "-." is preserved
    setInputStrings(prev => ({ ...prev, [name]: raw }));
    const value = parseFloat(raw);
    if (isNaN(value)) return;
    setManualValues(prev => {
      const next = { ...prev, [name]: value };
      triggerEvaluation(next, problem);
      return next;
    });
  }, [problem, triggerEvaluation]);

  const handleRunPreview = useCallback(() => {
    if (!problem || !onRunPreview) return;
    const varMap: { [name: string]: number } = {};
    problem.variables.forEach(v => { varMap[v.name] = manualValues[v.name] ?? v.current; });
    const substituted = VariableParser.substituteVariables(yamlContent, varMap);
    onRunPreview(substituted);
  }, [problem, manualValues, yamlContent, onRunPreview]);

  // Ctrl+S inside the panel triggers Run Preview
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        handleRunPreview();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleRunPreview]);

  const convergenceHistory: ConvergencePoint[] = optimizationResult?.convergenceHistory ?? [];

  if (convergenceHistory.length === 0 && !problem) {
    return (
      <div className="convergence-panel">
        <h4>Optimization</h4>
        <p className="no-data">No optimization settings found in YAML.</p>
      </div>
    );
  }

  // --- Manual evaluation section variables ---
  const hasVariables = problem !== null && problem.variables.length > 0;

  // --- Convergence history section ---
  const initialObjective = convergenceHistory[0]?.objective || 0;
  const finalObjective = convergenceHistory[convergenceHistory.length - 1]?.objective || 0;
  const improvement = initialObjective > 0 ? ((initialObjective - finalObjective) / initialObjective * 100) : 0;
  const totalIterations = convergenceHistory.length - 1;

  const stepData = convergenceHistory.slice(1).map((point, i) => {
    const prevPoint = convergenceHistory[i];
    const objectiveChange = Math.abs(point.objective - prevPoint.objective);
    const relativeChange = prevPoint.objective !== 0 ? objectiveChange / Math.abs(prevPoint.objective) : 0;
    const varSteps: { [key: string]: number } = {};
    Object.keys(point.variables).forEach(varName => {
      varSteps[varName] = Math.abs(point.variables[varName] - prevPoint.variables[varName]);
    });
    return { iteration: point.iteration, objective: point.objective, objectiveChange, relativeChange, variables: point.variables, varSteps };
  });

  return (
    <div className="convergence-panel">
      <h4>Optimization</h4>

      {/* ── Manual Evaluation ── */}
      <div className="manual-eval-section">
        <div className="manual-eval-inline">
          {(['V1', 'V2', 'V3', 'V4'] as const).map(name => {
            const v = problem?.variables.find(x => x.name === name);
            const val = v ? (inputStrings[name] ?? String(manualValues[name] ?? v.current)) : '';
            const step = v ? (v.max - v.min) / 1000 : 1;
            return (
              <React.Fragment key={name}>
                <span className="manual-var-label">{name}</span>
                <input
                  type="number"
                  className="manual-var-number"
                  value={val}
                  step={step}
                  disabled={!v}
                  onChange={e => handleValueChange(name, e.target.value)}
                />
              </React.Fragment>
            );
          })}
          <span className="manual-objective-label">obj</span>
          {isEvaluating ? (
            <span className="manual-objective-evaluating">…</span>
          ) : manualObjective !== null ? (
            <span className="manual-objective-value">{manualObjective.toExponential(4)}</span>
          ) : (
            <span className="manual-objective-value" style={{ color: '#555' }}>—</span>
          )}
          {onRunPreview && (
            <button
              className="menu-button manual-run-btn"
              onClick={handleRunPreview}
              disabled={!problem}
              title="Substitute current values into 3D plot without changing YAML (Ctrl+S)"
            >
              Run (Ctrl+S)
            </button>
          )}
        </div>
      </div>

      {/* ── Convergence History ── */}
      {convergenceHistory.length > 0 ? (
        <>
          <div className="convergence-stats">
            <div className="stat-grid">
              <div className="stat-row"><span>Total Iterations:</span><span>{totalIterations}</span></div>
              <div className="stat-row"><span>Initial Objective:</span><span>{initialObjective.toExponential(3)}</span></div>
              <div className="stat-row"><span>Final Objective:</span><span>{finalObjective.toExponential(3)}</span></div>
              <div className="stat-row">
                <span>Improvement:</span>
                <span className={improvement > 0 ? 'improvement-positive' : 'improvement-negative'}>
                  {improvement.toFixed(2)}%
                </span>
              </div>
              <div className="stat-row">
                <span>Convergence:</span>
                <span className={improvement > 0.1 ? 'status-converged' : 'status-struggling'}>
                  {improvement > 0.1 ? 'Converged' : finalObjective > 1e100 ? 'Diverged' : 'Slow Progress'}
                </span>
              </div>
            </div>
          </div>

          <div className="convergence-table-container">
            <table className="convergence-table">
              <thead>
                <tr>
                  <th>Iter</th>
                  <th>Objective</th>
                  <th>Obj. Change</th>
                  <th>Rel. Change</th>
                  <th>Variables</th>
                  <th>Step Sizes</th>
                </tr>
              </thead>
              <tbody>
                <tr className="initial-row">
                  <td>0</td>
                  <td>{convergenceHistory[0].objective.toExponential(2)}</td>
                  <td>—</td><td>—</td>
                  <td className="variables-cell">
                    {Object.entries(convergenceHistory[0].variables).map(([name, value]) => (
                      <span key={name} className="variable-value">{name}: {value.toFixed(3)}</span>
                    ))}
                  </td>
                  <td>—</td>
                </tr>
                {stepData.map(step => (
                  <tr key={step.iteration} className={step.objectiveChange < 1e-10 ? 'stagnant-row' : ''}>
                    <td>{step.iteration}</td>
                    <td className={step.objective > 1e50 ? 'objective-diverged' : ''}>{step.objective.toExponential(2)}</td>
                    <td className="objective-change">{step.objectiveChange.toExponential(1)}</td>
                    <td className="relative-change">{(step.relativeChange * 100).toFixed(2)}%</td>
                    <td className="variables-cell">
                      {Object.entries(step.variables).map(([name, value]) => (
                        <span key={name} className="variable-value">{name}: {value.toFixed(3)}</span>
                      ))}
                    </td>
                    <td className="step-sizes-cell">
                      {Object.entries(step.varSteps).map(([name, sz]) => (
                        <span key={name} className="step-size">Δ{name}: {sz.toExponential(1)}</span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {convergenceHistory.length > 20 && (
              <p className="truncation-note">Showing all {convergenceHistory.length} iterations</p>
            )}
          </div>
        </>
      ) : (
        <p className="no-data" style={{ marginTop: '12px' }}>
          {hasVariables ? 'Run optimization to see convergence history.' : ''}
        </p>
      )}
    </div>
  );
};
