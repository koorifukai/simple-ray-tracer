/**
 * Ground Truth Validation Test Component
 * Tests our optical system implementation against the reference results
 */

import React, { useState, useEffect } from 'react';
import { GroundTruthValidator } from '../utils/GroundTruthValidator';

// Test data embedded directly (since we have the file contents)
const surfaceTestsYaml = `name: Test Set 1 - Surface Testing

materials:
  BK7:
    nd: 1.5168
    vd: 64.17

surfaces:
  - sid: 0
    type: plane
    width: 30
    height: 30
  - sid: 1
    type: plane
    width: 25
    height: 25

assemblies:
  - aid: 0
    components:
      - sid: 0
        position: [2, 0, 0]
      - sid: 1
        position: [5, 0, 0]

optical_trains:
  - a:
      position: [-50, 0, 0]
      sid: 0
      angles: [30, 50]
  - b:
      position: [0, 0, 0]
      sid: 1
      normal: [-1, -1, -1]
  - c:
      position: [0, 0, 0]
      sid: 0
      normal: [1, -1, 1]
  - d:
      position: [100, 0, 0]
      aid: 0
      angles: [130, -50]
  - e:
      position: [0, 0, 0]
      sid: 0
      normal: [0, 1, 0]
      dial: 90
  - f:
      position: [0, 0, 0]
      sid: 1
      normal: [0, 1, 0]
      dial: -90
  - g:
      position: [200, 0, 0]
      aid: 0
      normal: [0, 0, 1]
  - h:
      position: [0, 0, 0]
      sid: 0
      normal: [1, 0, 0]
      dial: 180`;

const surfaceTestsExpected = `Surface;Position;Normal;Corners
0;[-50, 0, 0];[0.321, 0.643, 0.766];[[-50, -9.642, -12.856], [-50, 9.642, -12.856], [-50, 9.642, 12.856], [-50, -9.642, 12.856]]
1;[0, 0, 0];[-0.577, -0.577, -0.577];[[0, 8.165, 8.165], [0, -8.165, 8.165], [0, -8.165, -8.165], [0, 8.165, -8.165]]
2;[0, 0, 0];[0.577, -0.577, 0.577];[[0, 8.165, -8.165], [0, -8.165, -8.165], [0, -8.165, 8.165], [0, 8.165, 8.165]]
3;[102, 0, 0];[-0.259, 0.518, -0.816];[[102, -8.165, -12.246], [102, 8.165, -12.246], [102, 8.165, 12.246], [102, -8.165, 12.246]]
4;[107, 0, 0];[-0.259, 0.518, -0.816];[[107, -6.454, -9.681], [107, 6.454, -9.681], [107, 6.454, 9.681], [107, -6.454, 9.681]]
5;[0, 0, 0];[0, 0, 1];[[0, -15, 0], [0, 15, 0], [0, 15, 0], [0, -15, 0]]
6;[0, 0, 0];[0, 0, 1];[[0, -12.5, 0], [0, 12.5, 0], [0, 12.5, 0], [0, -12.5, 0]]
7;[200, 0, 0];[0, 0, 1];[[200, -15, 0], [200, 15, 0], [200, 15, 0], [200, -15, 0]]`;

export const GroundTruthTest: React.FC = () => {
  const [testResults, setTestResults] = useState<any>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runValidation = async () => {
    setIsRunning(true);
    setError(null);
    
    try {
      console.log('🚀 Starting ground truth validation...');
      
      const results = await GroundTruthValidator.validateSystem(
        surfaceTestsYaml,
        surfaceTestsExpected
      );
      
      setTestResults(results);
      
    } catch (err) {
      console.error('❌ Validation failed:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsRunning(false);
    }
  };

  useEffect(() => {
    // Auto-run validation on mount
    runValidation();
  }, []);

  return (
    <div style={{ 
      padding: '20px', 
      fontFamily: 'monospace',
      backgroundColor: '#1e1e1e',
      color: '#d4d4d4',
      minHeight: '100vh'
    }}>
      <h1>🔬 Ground Truth Validation Test</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={runValidation}
          disabled={isRunning}
          style={{
            padding: '10px 20px',
            backgroundColor: isRunning ? '#666' : '#007acc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isRunning ? 'not-allowed' : 'pointer'
          }}
        >
          {isRunning ? '🔄 Running...' : '🧪 Run Validation'}
        </button>
      </div>

      {error && (
        <div style={{ 
          backgroundColor: '#4c1f1f', 
          padding: '15px', 
          borderRadius: '4px',
          marginBottom: '20px',
          border: '1px solid #f14c4c'
        }}>
          <h3>❌ Error</h3>
          <pre>{error}</pre>
        </div>
      )}

      {testResults && (
        <div>
          <div style={{ 
            backgroundColor: testResults.passed ? '#2d4a2d' : '#4c1f1f',
            padding: '15px',
            borderRadius: '4px',
            marginBottom: '20px',
            border: testResults.passed ? '1px solid #4f8a4f' : '1px solid #f14c4c'
          }}>
            <h2>
              {testResults.passed ? '✅' : '❌'} 
              {' '}Overall Result: {testResults.passedSurfaces}/{testResults.totalSurfaces} Surfaces Passed
            </h2>
          </div>

          <h3>📊 Detailed Results</h3>
          {testResults.results.map((result: any) => (
            <div 
              key={result.surfaceId}
              style={{
                backgroundColor: result.passed ? '#1e2d1e' : '#2d1e1e',
                padding: '15px',
                marginBottom: '10px',
                borderRadius: '4px',
                border: result.passed ? '1px solid #4a6a4a' : '1px solid #6a4a4a'
              }}
            >
              <h4>
                {result.passed ? '✅' : '❌'} Surface {result.surfaceId}
              </h4>
              
              {result.passed ? (
                <p style={{ color: '#90ee90' }}>All parameters match within tolerance ±1e-4</p>
              ) : (
                <div>
                  <h5>❌ Issues:</h5>
                  <ul>
                    {result.issues.map((issue: string, i: number) => (
                      <li key={i} style={{ color: '#ff6b6b' }}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}

              <details style={{ marginTop: '10px' }}>
                <summary style={{ cursor: 'pointer' }}>📋 Show Details</summary>
                <div style={{ marginTop: '10px', fontSize: '12px' }}>
                  <div style={{ marginBottom: '10px' }}>
                    <strong>Expected:</strong>
                    <pre>Position: [{result.expected.position.join(', ')}]</pre>
                    <pre>Normal:   [{result.expected.normal.join(', ')}]</pre>
                    <pre>Corners:  {result.expected.corners.length} points</pre>
                  </div>
                  
                  {result.actual && (
                    <div>
                      <strong>Actual:</strong>
                      <pre>Position: [{result.actual.position.join(', ')}]</pre>
                      <pre>Normal:   [{result.actual.normal.join(', ')}]</pre>
                      <pre>Corners:  {result.actual.corners.length} points</pre>
                    </div>
                  )}
                </div>
              </details>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: '30px', fontSize: '12px', color: '#888' }}>
        <h4>📝 Test Description</h4>
        <p>
          This test validates our optical system implementation against the reference 
          program's output. It tests 8 different surface configurations including:
        </p>
        <ul>
          <li>Surfaces with <code>angles</code> vs <code>normal</code> specifications</li>
          <li>Dial rotations combined with normals</li>
          <li>Assembly positioning</li>
          <li>Various coordinate transforms</li>
        </ul>
        <p>
          All numeric comparisons use a tolerance of ±1e-4 as specified.
        </p>
      </div>
    </div>
  );
};
