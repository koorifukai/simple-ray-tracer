import React, { useCallback } from 'react';
import Editor from '@monaco-editor/react';
import * as yaml from 'js-yaml';

interface YamlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onValidationChange: (isValid: boolean, error?: string) => void;
  fontSize?: number;
}

export const YamlEditor: React.FC<YamlEditorProps> = ({
  value,
  onChange,
  onValidationChange,
  fontSize = 13
}) => {
  const handleEditorChange = useCallback((newValue: string | undefined) => {
    const yamlContent = newValue || '';
    onChange(yamlContent);
    
    // Validate YAML
    try {
      yaml.load(yamlContent);
      onValidationChange(true);
    } catch (error) {
      onValidationChange(false, error instanceof Error ? error.message : 'Invalid YAML');
    }
  }, [onChange, onValidationChange]);

  const handleEditorDidMount = useCallback(() => {
    // Editor is ready
  }, []);

  return (
    <div className="yaml-editor">
      <Editor
        height="100%"
        defaultLanguage="yaml"
        theme="vs-dark"
        value={value}
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
        options={{
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: fontSize,
          lineNumbers: 'on',
          renderWhitespace: 'selection',
          tabSize: 2,
          insertSpaces: true,
          wordWrap: 'on',
          automaticLayout: true,
          bracketPairColorization: { enabled: true },
        }}
        loading={
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            height: '100%',
            color: 'var(--text-muted)'
          }}>
            Loading editor...
          </div>
        }
      />
    </div>
  );
};
