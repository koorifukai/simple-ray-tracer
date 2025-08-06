import React, { useState, useCallback, useRef, useEffect } from 'react';
import { YamlEditor } from './YamlEditor';
import { EmptyPlot3D } from '../visualization/EmptyPlot3D';
import { IntersectionPlot } from './IntersectionPlot';
import { RayIntersectionCollector } from './RayIntersectionCollector';
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
    s:
     {sid: 0, position: [133,0,0], angles: [0,0]}

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

interface OpticalDesignAppProps {}

export const OpticalDesignApp: React.FC<OpticalDesignAppProps> = () => {
  const [yamlContent, setYamlContent] = useState(defaultYaml);
  const [isYamlValid, setIsYamlValid] = useState(true);
  const [yamlError, setYamlError] = useState<string>('');
  const [parsedData, setParsedData] = useState<any>(null);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [lastRayTracedYaml, setLastRayTracedYaml] = useState(defaultYaml);
  const [analysisType, setAnalysisType] = useState<'None' | 'Spot Diagram' | 'Ray Hit Map' | 'Tabular Display'>('None');
  const [refreshTrigger, setRefreshTrigger] = useState(0); // Used to trigger secondary panel refresh
  const [selectedSurface, setSelectedSurface] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize with default system
  useEffect(() => {
    try {
      const defaultSystem = yaml.load(defaultYaml) as any;
      setParsedData(defaultSystem);
    } catch (error) {
      console.error('Failed to parse default YAML:', error);
    }
  }, []);

  const handleYamlChange = useCallback((newYaml: string) => {
    setYamlContent(newYaml);
  }, []);

  const handleYamlValidation = useCallback((isValid: boolean, error?: string) => {
    setIsYamlValid(isValid);
    setYamlError(error || '');
    
    if (isValid && autoUpdate) {
      try {
        const parsed = yaml.load(yamlContent) as any;
        setParsedData(parsed);
        setLastRayTracedYaml(yamlContent);
        
        // Clear intersection data when YAML changes to prevent accumulation
        const collector = RayIntersectionCollector.getInstance();
        collector.clearData();
        
        // Trigger secondary analysis refresh if active
        if (analysisType === 'Ray Hit Map' || analysisType === 'Spot Diagram') {
          setRefreshTrigger(prev => prev + 1);
          console.log('🧹 Cleared intersection data due to YAML update and triggered secondary analysis refresh');
        } else {
          console.log('🧹 Cleared intersection data due to YAML update');
        }
        
      } catch (err) {
        setParsedData(null);
      }
    } else if (!autoUpdate) {
      console.log('⏸️ Auto-update paused - YAML syntax valid but ray tracing not updated');
    } else {
      setParsedData(null);
    }
  }, [yamlContent, autoUpdate, analysisType]);

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
    
    if (newAutoUpdate && isYamlValid) {
      try {
        const parsed = yaml.load(yamlContent) as any;
        setParsedData(parsed);
        setLastRayTracedYaml(yamlContent);
        
        // Trigger secondary analysis refresh if active when re-enabling auto-update
        if (analysisType === 'Ray Hit Map' || analysisType === 'Spot Diagram') {
          setRefreshTrigger(prev => prev + 1);
          console.log('✅ Auto-update re-enabled - ray tracing updated immediately with secondary analysis refresh');
        } else {
          console.log('✅ Auto-update re-enabled - ray tracing updated immediately');
        }
      } catch (err) {
        console.error('❌ Failed to update ray tracing when re-enabling auto-update:', err);
      }
    }
  }, [autoUpdate, isYamlValid, yamlContent, analysisType]);

  const handleManualUpdate = useCallback(() => {
    if (isYamlValid) {
      try {
        const parsed = yaml.load(yamlContent) as any;
        setParsedData(parsed);
        setLastRayTracedYaml(yamlContent);
        
        // Clear intersection data when manually updating to prevent accumulation
        const collector = RayIntersectionCollector.getInstance();
        collector.clearData();
        
        // Trigger secondary analysis refresh if active
        if (analysisType === 'Ray Hit Map' || analysisType === 'Spot Diagram') {
          setRefreshTrigger(prev => prev + 1);
          console.log('🔄 Manual ray tracing update triggered - intersection data cleared and secondary analysis refreshed');
        } else {
          console.log('🔄 Manual ray tracing update triggered - intersection data cleared');
        }
        
      } catch (err) {
        console.error('❌ Failed to manually update ray tracing:', err);
      }
    }
  }, [isYamlValid, yamlContent, analysisType]);

  const handleTutorial = useCallback(() => {
    window.open('https://github.com/koorifukai/simple-ray-tracer', '_blank');
  }, []);

  const handleAnalysisChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    setAnalysisType(event.target.value as 'None' | 'Spot Diagram' | 'Ray Hit Map' | 'Tabular Display');
  }, []);

  // Control ray intersection data collection based on analysis type
  useEffect(() => {
    const collector = RayIntersectionCollector.getInstance();
    
    if (analysisType === 'Ray Hit Map' || analysisType === 'Spot Diagram') {
      collector.startCollection();
      console.log(`🎯 Started ray intersection data collection for ${analysisType.toLowerCase()} analysis`);
    } else {
      collector.stopCollection();
      if (analysisType !== 'None') {
        console.log('🔄 Stopped ray intersection data collection (analysis type changed)');
      }
    }
    
    // Cleanup function
    return () => {
      collector.stopCollection();
    };
  }, [analysisType]);

  // Refresh secondary analysis when needed (only when auto-refresh is enabled)
  useEffect(() => {
    const startTime = performance.now();
    console.log(`🔄 Secondary analysis useEffect triggered: analysisType=${analysisType}, isYamlValid=${isYamlValid}, autoUpdate=${autoUpdate}`);
    
    if (analysisType === 'Ray Hit Map' || analysisType === 'Spot Diagram') {
      if (isYamlValid && parsedData && autoUpdate) { // Only refresh when auto-update is enabled
        // Trigger secondary analysis refresh - data should already be available from ray tracing
        console.log(`🔄 Starting secondary analysis refresh for ${analysisType}...`);
        
        // Increment refresh trigger to force re-render of visualization
        setRefreshTrigger(prev => prev + 1);
        
        const endTime = performance.now();
        console.log(`🔄 Secondary analysis refresh completed for ${analysisType} in ${(endTime - startTime).toFixed(2)}ms (auto-refresh enabled)`);
      } else {
        console.log(`⏸️ Secondary analysis refresh skipped: autoUpdate=${autoUpdate}, isYamlValid=${isYamlValid}, hasParsedData=${!!parsedData}`);
      }
    }
  }, [analysisType, isYamlValid, parsedData, autoUpdate]); // Now includes autoUpdate dependency

  // Extract available surfaces from parsed YAML data and hit data
  const getAvailableSurfaces = useCallback(() => {
    if (!parsedData) return [];
    
    const surfaces: Array<{id: string, label: string}> = [];
    
    // If we're in intersection analysis mode and have collected data, use that
    if (analysisType === 'Ray Hit Map' || analysisType === 'Spot Diagram') {
      const collector = RayIntersectionCollector.getInstance();
      const availableSurfaces = collector.getAvailableSurfaces();
      
      if (availableSurfaces.length > 0) {
        return availableSurfaces.map(surface => ({
          id: surface.id,
          label: surface.assemblyName 
            ? `Assem: ${surface.assemblyName}, Surf: ${surface.name} (${surface.intersectionCount} hits)`
            : `Surf: ${surface.name} (${surface.intersectionCount} hits)`
        }));
      }
    }
    
    // Fallback to YAML structure if no hit data available
    // Add surfaces from assemblies
    if (parsedData.assemblies && Array.isArray(parsedData.assemblies)) {
      parsedData.assemblies.forEach((assembly: any, assemblyIndex: number) => {
        const assemblyId = assembly.aid?.toString() || `${assemblyIndex}`;
        
        // Check if assembly has a name/identifier from optical trains
        let assemblyName = `assembly ${assemblyId}`;
        if (parsedData.optical_trains && Array.isArray(parsedData.optical_trains)) {
          // Find optical train element that references this assembly
          parsedData.optical_trains.forEach((trainGroup: any) => {
            Object.entries(trainGroup).forEach(([trainName, trainData]: [string, any]) => {
              if (trainData.aid?.toString() === assemblyId) {
                assemblyName = trainName;
              }
            });
          });
        }
        
        // Add each surface in the assembly
        Object.keys(assembly).forEach(surfaceKey => {
          if (surfaceKey !== 'aid') {
            surfaces.push({
              id: `assembly_${assemblyId}_${surfaceKey}`,
              label: assemblyName !== `assembly ${assemblyId}` 
                ? `Assem: ${assemblyName}, Surf: ${surfaceKey}`
                : `Surf: ${surfaceKey}`
            });
          }
        });
      });
    }
    
    // Add standalone surfaces
    if (parsedData.surfaces && Array.isArray(parsedData.surfaces)) {
      parsedData.surfaces.forEach((surfaceGroup: any) => {
        Object.keys(surfaceGroup).forEach(surfaceKey => {
          surfaces.push({
            id: `surface_${surfaceKey}`,
            label: `Surf: ${surfaceKey}`
          });
        });
      });
    }
    
    return surfaces;
  }, [parsedData, analysisType]);

  return (
    <div className="app-container">
      {/* Menu Bar */}
      <div className="menubar">
        <div className="menubar-left">
          <h1 className="menubar-title">Simple Ray Tracer</h1>
          <div className="menubar-buttons">
            <button className="menu-button" onClick={handleTutorial}>
              Tutorial
            </button>
            <button className="menu-button" onClick={handleNewSystem}>
              New System
            </button>
            <button className="menu-button" onClick={handleImport}>
              Import YAML
            </button>
            <button className="menu-button" onClick={handleExport} disabled={!isYamlValid}>
              Export YAML
            </button>

            {/* Secondary dropdown */}
            <div className="analysis-control">
              <label htmlFor="analysis-select">Secondary:</label>
              <select 
                id="analysis-select"
                value={analysisType}
                onChange={handleAnalysisChange}
                className="analysis-dropdown"
              >
                <option value="None">None</option>
                <option value="Spot Diagram">Spot Diagram</option>
                <option value="Ray Hit Map">Ray Hit Map</option>
                <option value="Tabular Display">Tabular Display</option>
              </select>
            </div>
          </div>
        </div>

        {/* Auto-update toggle switch - moved to rightmost */}
        <div className="menubar-right">
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
              Auto Refresh: {autoUpdate ? 'ON' : 'OFF'}
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
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {/* Left Column */}
        <div className="left-column">
          {/* YAML Editor Panel */}
          <div className={`yaml-panel ${analysisType !== 'None' ? 'with-analysis' : ''}`}>
            <div className="yaml-editor-container">
              <YamlEditor 
                value={yamlContent}
                onChange={handleYamlChange}
                onValidationChange={handleYamlValidation}
              />
              <div className={`yaml-status ${isYamlValid ? 'success' : 'error'}`}>
                {isYamlValid ? (
                  <>
                    <span>✓</span>
                    <span>
                      Valid YAML - {parsedData?.assemblies?.[0] ? Object.keys(parsedData.assemblies[0]).filter(k => k !== 'aid').length : 0} surfaces, 
                      {' '}{parsedData?.light_sources?.length || 0} light sources,
                      {' '}{parsedData?.surfaces?.length || 0} standalone surfaces
                    </span>
                  </>
                ) : (
                  <div>
                    <span>✗</span>
                    <span>{yamlError}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Analysis Panel */}
          {analysisType !== 'None' && (
            <div className={`analysis-panel ${analysisType.toLowerCase().replace(/ /g, '-')}`}>
              <div className="analysis-content">
                {analysisType === 'Ray Hit Map' ? (
                  <div className="hit-map-layout">
                    {/* Left side - Compact surface list */}
                    <div className="surface-list-container">
                      <div className="surface-list">
                        {getAvailableSurfaces().map(surface => (
                          <div 
                            key={surface.id}
                            className={`surface-item ${selectedSurface === surface.id ? 'selected' : ''}`}
                            onClick={() => setSelectedSurface(surface.id)}
                          >
                            {surface.label}
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* Right side - Full height intersection plot */}
                    <div className="hit-map-container">
                      {selectedSurface ? (
                        <IntersectionPlot 
                          surfaceId={selectedSurface}
                          analysisType={'Hit Map' as 'Hit Map' | 'Spot Diagram'}
                          yamlContent={yamlContent}
                          systemData={parsedData}
                        />
                      ) : (
                        <div className="hit-map-empty">
                          <p>Select a surface</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="placeholder-content">
                    <p>{analysisType} functionality will be implemented here</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Visualization Panel */}
        <div className="visualization-panel">
          <div className="visualization-container">
            <EmptyPlot3D 
              title="Ray Tracer Visualization"
              yamlContent={autoUpdate ? (isYamlValid ? yamlContent : undefined) : lastRayTracedYaml}
              key={refreshTrigger} // Force re-render when secondary analysis changes
            />
          </div>
        </div>
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
