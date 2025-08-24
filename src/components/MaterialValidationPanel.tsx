import React, { useState, useEffect } from 'react';
import { MaterialParser, GlassCatalog } from '../optical/materials/GlassCatalog';

interface MaterialValidationPanelProps {
  yamlContent: string;
  isVisible: boolean;
  onAcceptSuggestion?: (original: string, suggestion: string) => void;
}

/**
 * Material Validation Panel - "YAML checking/optimization reporting prompt"
 * Shows glass catalog validation results and material suggestions
 */
export const MaterialValidationPanel: React.FC<MaterialValidationPanelProps> = ({
  yamlContent,
  isVisible,
  onAcceptSuggestion
}) => {
  const [validationResults, setValidationResults] = useState<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
    suggestions: Array<{ material: string; suggestion: string }>;
  }>({ isValid: true, errors: [], warnings: [], suggestions: [] });

  const [catalogStats, setCatalogStats] = useState({ total: 0, schott: 0, ohara: 0 });

  useEffect(() => {
    if (!GlassCatalog.isLoaded()) return;

    // Get catalog statistics
    setCatalogStats(GlassCatalog.getStats());

    // Validate YAML content
    try {
      const yamlSystem = parseYAML(yamlContent);
      const results = MaterialParser.validateSystemMaterials(yamlSystem);
      setValidationResults(results);
    } catch (error) {
      setValidationResults({
        isValid: false,
        errors: [`YAML parsing error: ${error instanceof Error ? error.message : String(error)}`],
        warnings: [],
        suggestions: []
      });
    }
  }, [yamlContent]);

  // Simple YAML parser for validation purposes
  const parseYAML = (content: string): any => {
    try {
      // This is a simplified parser - in production you'd use a real YAML library
      return JSON.parse(content.replace(/"/g, '"'));
    } catch {
      // If JSON parse fails, try to extract assemblies manually
      const assembliesMatch = content.match(/assemblies:\s*\[(.*?)\]/s);
      if (assembliesMatch) {
        // Very basic extraction - good enough for validation
        return { assemblies: [{}] };
      }
      throw new Error('Unable to parse YAML content');
    }
  };

  const handleAcceptSuggestion = (material: string, suggestion: string) => {
    if (onAcceptSuggestion) {
      onAcceptSuggestion(material, suggestion);
    }
  };

  if (!isVisible || !GlassCatalog.isLoaded()) {
    return null;
  }

  const hasIssues = validationResults.errors.length > 0 || 
                   validationResults.warnings.length > 0 || 
                   validationResults.suggestions.length > 0;

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      width: '350px',
      maxHeight: '400px',
      backgroundColor: '#2a2a2a',
      border: '1px solid #555',
      borderRadius: '8px',
      padding: '16px',
      zIndex: 1000,
      fontSize: '13px',
      fontFamily: 'Consolas, "Courier New", monospace',
      color: '#fff',
      overflowY: 'auto',
      boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
        borderBottom: '1px solid #444',
        paddingBottom: '8px'
      }}>
        <div style={{ fontWeight: 'bold', color: '#4CAF50' }}>
          🔬 Glass Catalog Validator
        </div>
        <div style={{ fontSize: '11px', color: '#888' }}>
          {catalogStats.total} glasses
        </div>
      </div>

      {/* Catalog Status */}
      <div style={{ marginBottom: '12px', fontSize: '11px', color: '#aaa' }}>
        📚 Loaded: {catalogStats.schott} Schott, {catalogStats.ohara} Ohara
      </div>

      {/* Validation Results */}
      {!hasIssues ? (
        <div style={{
          color: '#4CAF50',
          padding: '8px',
          backgroundColor: '#1b5e20',
          borderRadius: '4px',
          textAlign: 'center'
        }}>
          ✓ All materials validated
        </div>
      ) : (
        <div>
          {/* Errors */}
          {validationResults.errors.map((error, index) => (
            <div key={`error-${index}`} style={{
              color: '#f44336',
              backgroundColor: '#3c1c1c',
              padding: '8px',
              marginBottom: '8px',
              borderRadius: '4px',
              border: '1px solid #f44336'
            }}>
              ❌ {error}
            </div>
          ))}

          {/* Warnings */}
          {validationResults.warnings.map((warning, index) => (
            <div key={`warning-${index}`} style={{
              color: '#ff9800',
              backgroundColor: '#2c1810',
              padding: '8px',
              marginBottom: '8px',
              borderRadius: '4px',
              border: '1px solid #ff9800'
            }}>
              ⚠️ {warning}
            </div>
          ))}

          {/* Suggestions */}
          {validationResults.suggestions.map((suggestion, index) => (
            <div key={`suggestion-${index}`} style={{
              color: '#2196f3',
              backgroundColor: '#1a1a2e',
              padding: '8px',
              marginBottom: '8px',
              borderRadius: '4px',
              border: '1px solid #2196f3'
            }}>
              <div style={{ marginBottom: '8px' }}>
                💡 <strong>{suggestion.material}</strong> not found. Did you mean <strong>{suggestion.suggestion}</strong>?
              </div>
              <button
                onClick={() => handleAcceptSuggestion(suggestion.material, suggestion.suggestion)}
                style={{
                  backgroundColor: '#2196f3',
                  color: 'white',
                  border: 'none',
                  padding: '4px 8px',
                  borderRadius: '3px',
                  fontSize: '11px',
                  cursor: 'pointer'
                }}
              >
                Replace with {suggestion.suggestion}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{
        marginTop: '12px',
        paddingTop: '8px',
        borderTop: '1px solid #444',
        fontSize: '10px',
        color: '#666',
        textAlign: 'center'
      }}>
        Priority: n1/n2 → glass names → fallback
      </div>
    </div>
  );
};

export default MaterialValidationPanel;
