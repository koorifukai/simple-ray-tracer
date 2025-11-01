/**
 * Zemax to YAML Converter Panel
 * Split panel with Zemax TSV input (top) and YAML output (bottom)
 */

import React, { useState, useCallback } from 'react';
import { ZemaxImporter } from '../utils/ZemaxImporter';

interface Zemax2YamlPanelProps {
  className?: string;
}

export const Zemax2YamlPanel: React.FC<Zemax2YamlPanelProps> = ({ className = '' }) => {
  const [zemaxInput, setZemaxInput] = useState('');
  const [yamlOutput, setYamlOutput] = useState('');
  const [error, setError] = useState('');
  const [isConverting, setIsConverting] = useState(false);

  const handleConvert = useCallback(() => {
    if (!zemaxInput.trim()) {
      setError('Please paste Zemax TSV data in the input area');
      setYamlOutput('');
      return;
    }

    setIsConverting(true);
    setError('');

    try {
      const convertedYaml = ZemaxImporter.convertToYaml(zemaxInput);
      const validation = ZemaxImporter.validateConversion(zemaxInput, convertedYaml);
      
      setYamlOutput(convertedYaml);
      
      if (!validation.isValid) {
        setError(`Conversion warnings: ${validation.issues.join('; ')}`);
      }
    } catch (err) {
      setError(`Conversion failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setYamlOutput('');
    } finally {
      setIsConverting(false);
    }
  }, [zemaxInput]);

  const handleCopyYaml = useCallback(async () => {
    if (!yamlOutput) return;
    
    try {
      await navigator.clipboard.writeText(yamlOutput);
      // Could add a toast notification here
    } catch (err) {
      console.warn('Failed to copy to clipboard:', err);
    }
  }, [yamlOutput]);

  return (
    <div className={`zemax2yaml-panel ${className}`}>
      <div className="zemax2yaml-header">
        <h3>Zemax to YAML Converter</h3>
        <div className="zemax2yaml-controls">
          <button 
            onClick={handleConvert}
            disabled={isConverting || !zemaxInput.trim()}
            className="convert-button"
          >
            {isConverting ? 'Converting...' : 'Convert'}
          </button>
          {yamlOutput && (
            <button 
              onClick={handleCopyYaml}
              className="copy-button"
              title="Copy YAML to clipboard"
            >
              📋 Copy
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="zemax2yaml-error">
          ⚠️ {error}
        </div>
      )}

      <div className="zemax2yaml-content">
        {/* Zemax Input (Top) */}
        <div className="zemax-input-section">
          <div className="section-header">
            <label htmlFor="zemax-input">Zemax TSV Data (Copy from Zemax and paste here)</label>
            <small>Include column headers and all surface data</small>
          </div>
          <textarea
            id="zemax-input"
            value={zemaxInput}
            onChange={(e) => setZemaxInput(e.target.value)}
            placeholder="Paste Zemax TSV data here...
Example:
#	Type	Comment	Radius	Thickness	Material	Coating	Semi-Diameter
0	STANDARD		Infinity	1E+010			0
1	STANDARD		54.153	8.747	N-SK2	AR	29.225"
            className="zemax-textarea"
          />
        </div>

        {/* YAML Output (Bottom) */}
        <div className="yaml-output-section">
          <div className="section-header">
            <label htmlFor="yaml-output">Generated YAML Assembly</label>
            {yamlOutput && <small>Ready to use in optical ray tracer</small>}
          </div>
          <textarea
            id="yaml-output"
            value={yamlOutput}
            readOnly
            placeholder="Converted YAML will appear here..."
            className="yaml-textarea"
          />
        </div>
      </div>

      <style>{`
        .zemax2yaml-panel {
          height: 100%;
          display: flex;
          flex-direction: column;
          background: #1a1a1a;
          color: #ffffff;
          font-family: 'Monaco', 'Consolas', monospace;
        }

        .zemax2yaml-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 15px;
          background: #2a2a2a;
          border-bottom: 1px solid #444;
        }

        .zemax2yaml-header h3 {
          margin: 0;
          font-size: 14px;
          color: #ffffff;
        }

        .zemax2yaml-controls {
          display: flex;
          gap: 8px;
        }

        .convert-button, .copy-button {
          padding: 4px 12px;
          font-size: 12px;
          border: 1px solid #555;
          background: #333;
          color: #ffffff;
          cursor: pointer;
          border-radius: 3px;
          transition: background 0.2s;
        }

        .convert-button:hover:not(:disabled), .copy-button:hover {
          background: #444;
        }

        .convert-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .zemax2yaml-error {
          padding: 8px 15px;
          background: #ff4444;
          color: white;
          font-size: 12px;
          border-bottom: 1px solid #444;
        }

        .zemax2yaml-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }

        .zemax-input-section {
          flex: 0 0 150px; /* Fixed height of 150px (half of previous 300px) */
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        
        .yaml-output-section {
          flex: 1; /* Fill remaining space */
          display: flex;
          flex-direction: column;
          min-height: 0;
        }

        .section-header {
          padding: 8px 15px;
          background: #2a2a2a;
          border-bottom: 1px solid #444;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .section-header label {
          font-size: 12px;
          font-weight: bold;
          color: #cccccc;
        }

        .section-header small {
          font-size: 10px;
          color: #888;
        }

        .zemax-textarea, .yaml-textarea {
          flex: 1;
          resize: none;
          border: none;
          outline: none;
          padding: 10px;
          background: #1a1a1a;
          color: #ffffff;
          font-family: inherit;
          font-size: 11px;
          line-height: 1.4;
          min-height: 200px;
        }

        .zemax-textarea::placeholder, .yaml-textarea::placeholder {
          color: #666;
          font-style: italic;
        }

        .yaml-textarea {
          background: #0f0f0f;
          color: #88dd88;
        }

        .yaml-output-section {
          border-top: 2px solid #444;
        }
      `}</style>
    </div>
  );
};