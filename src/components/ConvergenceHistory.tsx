/**
 * Convergence History Component
 * Displays optimization convergence history in a compact table format
 */

import React from 'react';
import type { ConvergencePoint } from '../optimization/OptimizationTypes';

interface ConvergenceHistoryProps {
  convergenceHistory: ConvergencePoint[];
}

export const ConvergenceHistory: React.FC<ConvergenceHistoryProps> = ({ 
  convergenceHistory 
}) => {
  if (convergenceHistory.length === 0) {
    return (
      <div className="convergence-panel">
        <h4>Convergence History</h4>
        <p className="no-data">No optimization data available.</p>
      </div>
    );
  }

  // Calculate convergence metrics
  const initialObjective = convergenceHistory[0]?.objective || 0;
  const finalObjective = convergenceHistory[convergenceHistory.length - 1]?.objective || 0;
  const improvement = initialObjective > 0 ? ((initialObjective - finalObjective) / initialObjective * 100) : 0;
  const totalIterations = convergenceHistory.length - 1;
  
  // Calculate step sizes and derivative info
  const stepData = convergenceHistory.slice(1).map((point, i) => {
    const prevPoint = convergenceHistory[i];
    const objectiveChange = Math.abs(point.objective - prevPoint.objective);
    const relativeChange = prevPoint.objective !== 0 ? objectiveChange / Math.abs(prevPoint.objective) : 0;
    
    // Calculate variable step sizes
    const varSteps: { [key: string]: number } = {};
    Object.keys(point.variables).forEach(varName => {
      const currentVal = point.variables[varName];
      const prevVal = prevPoint.variables[varName];
      varSteps[varName] = Math.abs(currentVal - prevVal);
    });
    
    return {
      iteration: point.iteration,
      objective: point.objective,
      objectiveChange,
      relativeChange,
      variables: point.variables,
      varSteps
    };
  });
  
  return (
    <div className="convergence-panel">
      <h4>Levenberg-Marquardt Convergence Analysis</h4>
      
      <div className="convergence-stats">
        <div className="stat-grid">
          <div className="stat-row">
            <span>Total Iterations:</span>
            <span>{totalIterations}</span>
          </div>
          <div className="stat-row">
            <span>Initial Objective:</span>
            <span>{initialObjective.toExponential(3)}</span>
          </div>
          <div className="stat-row">
            <span>Final Objective:</span>
            <span>{finalObjective.toExponential(3)}</span>
          </div>
          <div className="stat-row">
            <span>Improvement:</span>
            <span className={improvement > 0 ? 'improvement-positive' : 'improvement-negative'}>
              {improvement.toFixed(2)}%
            </span>
          </div>
          <div className="stat-row">
            <span>Convergence Status:</span>
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
              <td>—</td>
              <td>—</td>
              <td className="variables-cell">
                {Object.entries(convergenceHistory[0].variables).map(([name, value]) => (
                  <span key={name} className="variable-value">
                    {name}: {value.toFixed(3)}
                  </span>
                ))}
              </td>
              <td>—</td>
            </tr>
            {stepData.map((step) => (
              <tr key={step.iteration} className={step.objectiveChange < 1e-10 ? 'stagnant-row' : ''}>
                <td>{step.iteration}</td>
                <td className={step.objective > 1e50 ? 'objective-diverged' : ''}>
                  {step.objective.toExponential(2)}
                </td>
                <td className="objective-change">
                  {step.objectiveChange.toExponential(1)}
                </td>
                <td className="relative-change">
                  {(step.relativeChange * 100).toFixed(2)}%
                </td>
                <td className="variables-cell">
                  {Object.entries(step.variables).map(([name, value]) => (
                    <span key={name} className="variable-value">
                      {name}: {value.toFixed(3)}
                    </span>
                  ))}
                </td>
                <td className="step-sizes-cell">
                  {Object.entries(step.varSteps).map(([name, stepSize]) => (
                    <span key={name} className="step-size">
                      Δ{name}: {stepSize.toExponential(1)}
                    </span>
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
    </div>
  );
};
