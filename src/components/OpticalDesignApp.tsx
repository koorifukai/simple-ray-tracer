import React, { useState, useCallback, useRef, useEffect } from 'react';
import { YamlEditor } from './YamlEditor';
import { EmptyPlot3D } from '../visualization/EmptyPlot3D';
import { wavelengthToRGB, rgbToCSSColor } from '../optical/wavelength';
import * as yaml from 'js-yaml';

// Default optical system YAML
const defaultYaml = `
display_settings:
  show_grid: False
  density_for_intensity: True

assemblies:
  - aid: 0
    s1: 
      {relative: 0, shape: spherical, radius: 54.153, semidia: 30, mode: refraction, n2: 1.60738}
    s2:
      {relative: 8.747, shape: spherical, radius: 152.522,  semidia: 28,  mode: refraction, n1: 1.60738}
    s3:
      {relative: 0.5, shape: spherical, radius: 35.951,  semidia: 25,  mode: refraction, n2: 1.62041}
    s4:
      {relative: 14, shape: plano, semidia: 22,  mode: refraction, n1: 1.62041, n2: 1.60342}
    s5:
      {relative: 3.777, shape: spherical, radius: 22.27,  semidia: 20,  mode: refraction, n1: 1.60342}
    s6: #stop
      {relative: 14.253, shape: plano, semidia: 10.229,  mode: aperture}
    s7:
      {relative: 12.428, shape: spherical, radius: -25.685, semidia: 20,  mode: refraction, n2: 1.60342}
    s8:
      {relative: 3.777, shape: plano, semidia: 20,  mode: refraction, n1: 1.60342, n2: 1.62041}
    s9:
      {relative: 10.834, shape: spherical, radius: -36.98,  semidia: 20,  mode: refraction, n1: 1.62041}
    s10:
      {relative: 0.5, shape: spherical, radius: 196.417,  semidia: 20,  mode: refraction, n2: 1.62041}
    s11:
      {relative: 6.858, shape: spherical, radius: -67.148, semidia: 20,  mode: refraction, n1: 1.62041}
    s12:
      {relative: [57.315,0,0], shape: plano, height: 50, width: 50,  mode: absorption}

surfaces:
  - focus:
      {sid: 0, shape: plano, height: 50, width: 50, mode: refraction}
  - stop:
      {sid: 1, shape: plano, height: 6, width: 3, mode: aperture}
  
light_sources:
  - l1:
      {lid: 0, position: [-10,0,-16], vector: [1,0,0.249328], number: 8, wavelength: 633, type: linear, param: 20}
  - l2:
      {lid: 1, position: [-10,0,-12], vector: [1,0,0.176327], number: 8, wavelength: 532, type: linear, param: 20}
  - l3:
      {lid: 2, position: [-10,0,0], vector: [1,0,0], number: 8, wavelength: 488, type: linear, param: 20}
  
optical_trains:
  - r: 
     {lid: 0}
    g: 
     {lid: 1}
    b: 
     {lid: 2}
    l:
     {aid: 0, position: [0,0,0], angles: [0,0]}

optimization_settings:
  iterations: 20
  V1: [96,98,20]
  V2: [15,25,5]
  V3: [80,90,5]
  V4: [-25,-15,5]
  obj: -1
  mode: aberrations
  #mode: angle
  param: None`;

import type { ValidationError } from '../optical/YamlValidator';

interface OpticalDesignAppProps {}

export const OpticalDesignApp: React.FC<OpticalDesignAppProps> = () => {
  const [yamlContent, setYamlContent] = useState(defaultYaml);
  const [isYamlValid, setIsYamlValid] = useState(true);
  const [yamlError, setYamlError] = useState<string>('');
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [parsedData, setParsedData] = useState<any>(null);
  const [lastValidSystem, setLastValidSystem] = useState<any>(null);
  const [fontSize, setFontSize] = useState(13);
  const [autoUpdate, setAutoUpdate] = useState(true); // Toggle for auto ray tracing
  const [lastRayTracedYaml, setLastRayTracedYaml] = useState(defaultYaml); // Track last ray traced content
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize with default system
  useEffect(() => {
    try {
      const defaultSystem = yaml.load(defaultYaml) as any;
      setParsedData(defaultSystem);
      setLastValidSystem(defaultSystem);
    } catch (error) {
      console.error('Failed to parse default YAML:', error);
    }
  }, []);

  const handleYamlChange = useCallback((newYaml: string) => {
    setYamlContent(newYaml);
  }, []);

  const handleYamlValidation = useCallback((isValid: boolean, error?: string, errors?: ValidationError[]) => {
    setIsYamlValid(isValid);
    setYamlError(error || '');
    setValidationErrors(errors || []);
    
    if (isValid && autoUpdate) {
      try {
        const parsed = yaml.load(yamlContent) as any;
        setParsedData(parsed);
        setLastRayTracedYaml(yamlContent);
        // Keep track of the last valid system
        if (parsed && typeof parsed === 'object' && parsed.name) {
          setLastValidSystem(parsed);
        }
      } catch (err) {
        setParsedData(null);
      }
    } else if (!autoUpdate) {
      // When auto-update is off, don't update ray tracing but still validate YAML syntax
      console.log('⏸️ Auto-update paused - YAML syntax valid but ray tracing not updated');
    } else {
      setParsedData(null);
    }
  }, [yamlContent, autoUpdate]);

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileImport = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setYamlContent(content);
      };
      reader.readAsText(file);
    }
    // Reset the file input
    if (event.target) {
      event.target.value = '';
    }
  }, []);

  const handleExport = useCallback(() => {
    const blob = new Blob([yamlContent], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'optical_system.yaml';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [yamlContent]);

  const handleNewSystem = useCallback(() => {
    setYamlContent(defaultYaml);
  }, []);

  const handleToggleAutoUpdate = useCallback(() => {
    const newAutoUpdate = !autoUpdate;
    setAutoUpdate(newAutoUpdate);
    console.log(`🔄 Auto-update ${newAutoUpdate ? 'enabled' : 'disabled'}`);
    
    // If turning auto-update back on and YAML is valid, immediately update ray tracing
    if (newAutoUpdate && isYamlValid) {
      try {
        const parsed = yaml.load(yamlContent) as any;
        setParsedData(parsed);
        setLastRayTracedYaml(yamlContent);
        if (parsed && typeof parsed === 'object' && parsed.name) {
          setLastValidSystem(parsed);
        }
        console.log('✅ Auto-update re-enabled - ray tracing updated immediately');
      } catch (err) {
        console.error('❌ Failed to update ray tracing when re-enabling auto-update:', err);
      }
    }
  }, [autoUpdate, isYamlValid, yamlContent]);

  const handleManualUpdate = useCallback(() => {
    if (isYamlValid) {
      try {
        const parsed = yaml.load(yamlContent) as any;
        setParsedData(parsed);
        setLastRayTracedYaml(yamlContent);
        if (parsed && typeof parsed === 'object' && parsed.name) {
          setLastValidSystem(parsed);
        }
        console.log('🔄 Manual ray tracing update triggered');
      } catch (err) {
        console.error('❌ Failed to manually update ray tracing:', err);
      }
    }
  }, [isYamlValid, yamlContent]);





  const increaseFontSize = useCallback(() => {
    setFontSize(prev => Math.min(prev + 1, 24));
  }, []);

  const decreaseFontSize = useCallback(() => {
    setFontSize(prev => Math.max(prev - 1, 8));
  }, []);

  return (
    <div className="app-container">
      {/* Menu Bar */}
      <div className="menubar">
        <div className="menubar-left">
          <h1 className="menubar-title">Simple Ray Tracer</h1>
          <div className="menubar-buttons">
            <button className="menu-button" onClick={handleNewSystem}>
              New System
            </button>
            <button className="menu-button" onClick={handleImport}>
              Import YAML
            </button>
            <button className="menu-button" onClick={handleExport} disabled={!isYamlValid}>
              Export YAML
            </button>

            {/* Auto-update toggle switch */}
            <div className="auto-update-control">
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={autoUpdate}
                  onChange={handleToggleAutoUpdate}
                />
                <span className="toggle-slider"></span>
              </label>
              <span className="toggle-label">
                Auto Ray Trace: {autoUpdate ? 'ON' : 'OFF'}
              </span>
              {!autoUpdate && (
                <button 
                  className="menu-button manual-update-btn" 
                  onClick={handleManualUpdate}
                  disabled={!isYamlValid}
                  title="Manually update ray tracing with current YAML"
                >
                  Update Now
                </button>
              )}
            </div>

            <div className="font-controls">
              Font:
              <button 
                className="font-button" 
                onClick={decreaseFontSize}
                title="Decrease font size"
              >
                ↓
              </button>
              <span style={{ minWidth: '24px', textAlign: 'center' }}>{fontSize}</span>
              <button 
                className="font-button" 
                onClick={increaseFontSize}
                title="Increase font size"
              >
                ↑
              </button>
            </div>
          </div>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          {parsedData?.assemblies?.[0] ? ' ' : 'No system loaded'}
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {/* YAML Editor Panel */}
        <div className="yaml-panel">
          <div className="yaml-editor-container">
            <YamlEditor 
              value={yamlContent}
              onChange={handleYamlChange}
              onValidationChange={handleYamlValidation}
              fontSize={fontSize}
            />
            <div className={`yaml-status ${isYamlValid ? 'success' : 'error'}`}>
              {isYamlValid ? (
                <>
                  <span>✓</span>
                  <span>
                    Valid YAML - {parsedData?.assemblies?.[0] ? Object.keys(parsedData.assemblies[0]).filter(k => k !== 'aid').length : 0} surfaces, 
                    {' '}{parsedData?.light_sources?.length || 0} light sources,
                    {' '}{parsedData?.surfaces?.length || 0} standalone surfaces
                    {parsedData?.light_sources && parsedData.light_sources.length > 0 && (
                      <span style={{ marginLeft: '8px' }}>
                        λ: {parsedData.light_sources.map((source: any, i: number) => {
                          const sourceObj = Object.values(source)[0] as any;
                          const wavelength = sourceObj?.wavelength;
                          if (wavelength) {
                            const color = rgbToCSSColor(wavelengthToRGB(wavelength));
                            return (
                              <span 
                                key={i}
                                title={`${wavelength}nm`}
                                style={{ 
                                  display: 'inline-block',
                                  width: '12px',
                                  height: '12px',
                                  backgroundColor: color,
                                  border: '1px solid #666',
                                  marginLeft: '2px',
                                  borderRadius: '2px'
                                }}
                              />
                            );
                          }
                          return null;
                        })}
                      </span>
                    )}
                  </span>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div>
                    <span>✗</span>
                    <span>{yamlError}</span>
                  </div>
                  {validationErrors.length > 1 && (
                    <div style={{ fontSize: '0.9em', color: '#ffaa44', marginLeft: '16px' }}>
                      {validationErrors.slice(1, 4).map((error, index) => (
                        <div key={index}>
                          Line {error.line}: {error.message}
                        </div>
                      ))}
                      {validationErrors.length > 4 && (
                        <div>... and {validationErrors.length - 4} more errors</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Visualization Panel */}
        <div className="visualization-panel">
          <div className="visualization-container">
            <EmptyPlot3D 
              title={
                parsedData?.assemblies?.[0] 
                  ? `   `
                  : lastValidSystem?.assemblies?.[0] 
                    ? `  `
                    : "Optical System Visualization"
              }
              yamlContent={autoUpdate ? (isYamlValid ? yamlContent : undefined) : lastRayTracedYaml}
            />
          </div>
        </div>
      </div>

      {/* Lower Panel (for future expansion) */}
      <div className="lower-panel">
        <div className="panel-header">
          Analysis Tools (Spot Diagrams, Sequential Design)
        </div>
        {/* Future: Spot diagrams, ray fans, etc. */}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".yaml,.yml"
        onChange={handleFileImport}
        className="file-input"
      />
    </div>
  );
};
