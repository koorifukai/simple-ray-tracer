/**
 * Simple Ground Truth Debug Test
 * Basic test to debug our validation system step by step
 */

import React, { useState } from 'react';
import { OpticalSystemParser } from '../optical/OpticalSystem';

const simpleYaml = `name: Simple Test

materials:
  BK7:
    nd: 1.5168

surfaces:
  - sid: 0
    type: plane
    width: 10
    height: 10

optical_trains:
  - a:
      position: [0, 0, 0]
      sid: 0
      normal: [0, 1, 0]`;

export const SimpleGroundTruthDebug: React.FC = () => {
  const [parseResult, setParseResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const testParsing = async () => {
    setError(null);
    
    try {
      console.log('🧪 Testing simple YAML parsing...');
      console.log('YAML Content:');
      console.log(simpleYaml);
      
      const opticalSystem = OpticalSystemParser.parseYAML(simpleYaml);
      
      console.log('✅ Parsed successfully:');
      console.log('Name:', opticalSystem.name);
      console.log('Surfaces count:', opticalSystem.surfaces.length);
      
      if (opticalSystem.surfaces.length > 0) {
        const surface = opticalSystem.surfaces[0];
        console.log('First surface:');
        console.log('- Position:', [surface.position.x, surface.position.y, surface.position.z]);
        console.log('- Transform matrix exists:', !!surface.transform);
        
        if (surface.transform) {
          // Test normal calculation
          const normalLocal = { x: -1, y: 0, z: 0 };
          const [nx, ny, nz] = surface.transform.transformVector(
            normalLocal.x, normalLocal.y, normalLocal.z
          );
          console.log('- Calculated normal:', [nx, ny, nz]);
        }
      }
      
      setParseResult({
        name: opticalSystem.name,
        surfaceCount: opticalSystem.surfaces.length,
        firstSurface: opticalSystem.surfaces[0] ? {
          position: [
            opticalSystem.surfaces[0].position.x,
            opticalSystem.surfaces[0].position.y,
            opticalSystem.surfaces[0].position.z
          ],
          hasTransform: !!opticalSystem.surfaces[0].transform
        } : null
      });
      
    } catch (err) {
      console.error('❌ Parse failed:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  return (
    <div style={{ 
      padding: '20px', 
      fontFamily: 'monospace',
      backgroundColor: '#2d2d2d',
      color: '#d4d4d4',
      marginTop: '20px',
      borderRadius: '8px'
    }}>
      <h2>🔬 Simple Ground Truth Debug</h2>
      
      <button 
        onClick={testParsing}
        style={{
          padding: '10px 20px',
          backgroundColor: '#007acc',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          marginBottom: '20px'
        }}
      >
        🧪 Test Simple Parsing
      </button>

      {error && (
        <div style={{ 
          backgroundColor: '#4c1f1f', 
          padding: '15px', 
          borderRadius: '4px',
          marginBottom: '20px',
          border: '1px solid #f14c4c'
        }}>
          <h3>❌ Error</h3>
          <pre style={{ fontSize: '12px', overflow: 'auto' }}>{error}</pre>
        </div>
      )}

      {parseResult && (
        <div style={{ 
          backgroundColor: '#1e2d1e', 
          padding: '15px', 
          borderRadius: '4px',
          border: '1px solid #4a6a4a'
        }}>
          <h3>✅ Parse Results</h3>
          <pre style={{ fontSize: '12px' }}>
            {JSON.stringify(parseResult, null, 2)}
          </pre>
        </div>
      )}

      <div style={{ marginTop: '20px', fontSize: '11px', color: '#888' }}>
        <h4>📋 Test Description</h4>
        <p>
          This is a simplified test to verify basic optical system parsing.
          It tests a single surface with normal: [0, 1, 0] specification.
        </p>
        <details>
          <summary>Show YAML</summary>
          <pre style={{ fontSize: '10px', backgroundColor: '#1a1a1a', padding: '10px' }}>
            {simpleYaml}
          </pre>
        </details>
      </div>
    </div>
  );
};
