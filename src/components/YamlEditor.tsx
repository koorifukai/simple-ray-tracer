import React, { useCallback, useRef } from 'react';
import Editor from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { YamlValidator } from '../optical/YamlValidator';
import type { ValidationError } from '../optical/YamlValidator';

interface YamlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onValidationChange: (isValid: boolean, error?: string, errors?: ValidationError[]) => void;
  fontSize?: number;
}

export const YamlEditor: React.FC<YamlEditorProps> = ({
  value,
  onChange,
  onValidationChange,
  fontSize = 13
}) => {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const updateMarkers = useCallback((errors: ValidationError[]) => {
    if (!editorRef.current) return;
    
    const monaco = (window as any).monaco;
    if (!monaco) return;

    const model = editorRef.current.getModel();
    if (!model) return;

    // Convert validation errors to Monaco markers
    const markers = errors.map(error => ({
      startLineNumber: error.line,
      startColumn: error.startColumn || error.column,
      endLineNumber: error.line,
      endColumn: error.endColumn || error.column + 1,
      message: error.message,
      severity: error.type === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
      source: 'yaml-validator'
    }));

    // Set markers on the model
    monaco.editor.setModelMarkers(model, 'yaml-validator', markers);
  }, []);

  const handleEditorChange = useCallback((newValue: string | undefined) => {
    const yamlContent = newValue || '';
    onChange(yamlContent);
    
    // Enhanced validation using YamlValidator
    const validationResult = YamlValidator.validate(yamlContent);
    
    // Update Monaco markers
    updateMarkers(validationResult.errors);
    
    // Report validation status
    if (validationResult.isValid) {
      onValidationChange(true, undefined, []);
    } else {
      const errorMessage = validationResult.errors.length > 0 
        ? validationResult.errors[0].message 
        : 'YAML validation failed';
      onValidationChange(false, errorMessage, validationResult.errors);
    }
  }, [onChange, onValidationChange, updateMarkers]);

  const handleEditorDidMount = useCallback((editor: editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;
    
    // Run initial validation
    const validationResult = YamlValidator.validate(value);
    updateMarkers(validationResult.errors);
  }, [value, updateMarkers]);

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
