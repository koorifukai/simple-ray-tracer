/**
 * Convergence History Component
 * Displays optimization convergence history as a simple table
 */

import React from 'react';
import type { ConvergencePoint } from '../optimization/OptimizationTypes';

interface ConvergenceHistoryProps {
  convergenceHistory: ConvergencePoint[];
  onClose: () => void;
}

export const ConvergenceHistory: React.FC<ConvergenceHistoryProps> = ({ 
  convergenceHistory, 
  onClose 
}) => {
  if (convergenceHistory.length === 0) {
    return (
      <div className="convergence-modal">
        <div className="convergence-content">
          <h3>Convergence History</h3>
          <p>No convergence data available.</p>
          <button onClick={onClose} className="close-button">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="convergence-modal">
      <div className="convergence-content">
        <div className="convergence-header">
          <h3>Convergence History</h3>
          <button onClick={onClose} className="close-button">×</button>
        </div>
        
        <div className="convergence-stats">
          <p><strong>Total Iterations:</strong> {convergenceHistory.length - 1}</p>
          <p><strong>Initial Objective:</strong> {convergenceHistory[0]?.objective.toExponential(3)}</p>
          <p><strong>Final Objective:</strong> {convergenceHistory[convergenceHistory.length - 1]?.objective.toExponential(3)}</p>
          {convergenceHistory.length > 1 && (
            <p><strong>Improvement:</strong> {
              ((convergenceHistory[0].objective - convergenceHistory[convergenceHistory.length - 1].objective) / convergenceHistory[0].objective * 100).toFixed(2)
            }%</p>
          )}
        </div>

        <div className="convergence-table-container">
          <table className="convergence-table">
            <thead>
              <tr>
                <th>Iteration</th>
                <th>Objective Value</th>
                <th>Variables</th>
              </tr>
            </thead>
            <tbody>
              {convergenceHistory.map((point, index) => (
                <tr key={index} className={index === 0 ? 'initial-row' : ''}>
                  <td>{point.iteration}</td>
                  <td>{point.objective.toExponential(3)}</td>
                  <td>
                    <div className="variables-cell">
                      {Object.entries(point.variables).map(([name, value]) => (
                        <span key={name} className="variable-value">
                          {name}: {typeof value === 'number' ? value.toFixed(3) : value}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
