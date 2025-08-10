import React, { useState, useCallback, useRef, useEffect } from 'react';
import { YamlEditor } from './YamlEditor';
import { EmptyPlot3D } from '../visualization/EmptyPlot3D';
import { IntersectionPlot } from './IntersectionPlot';
import { RayIntersectionCollector } from './RayIntersectionCollector';
import * as yaml from 'js-yaml';

// Default optical system YAML
const defaultYaml = `
# Gaussian 28 example
display_settings:
  show_grid: True
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
      {sid: 0, shape: plano, height: 50, width: 50, mode: absorption}
  - stop:
      {sid: 1, shape: plano, height: 6, width: 3, mode: aperture}
  
light_sources:
  - l1:
      {lid: 0, position: [-10,0,-16], vector: [1,0,0.249328], number: 18, wavelength: 633, type: uniform, param: 18}
  - l2:
      {lid: 1, position: [-10,0,-12], vector: [1,0,0.176327], number: 18, wavelength: 532, type: uniform, param: 18}
  - l3:
      {lid: 2, position: [-10,0,0], vector: [1,0,0], number: 18, wavelength: 488, type: uniform, param: 18}
  
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
  const [selectedLight, setSelectedLight] = useState<string>(''); // For spot diagram light source selection
  const [intersectionDataTrigger, setIntersectionDataTrigger] = useState(0); // Track intersection data updates
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize with default system
  useEffect(() => {
    try {
      const defaultSystem = yaml.load(defaultYaml) as any;
      setParsedData(defaultSystem);
      
      // Clear any existing intersection data when initializing
      const collector = RayIntersectionCollector.getInstance();
      collector.clearData();
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
        
        // Clear intersection data when YAML changes
        const collector = RayIntersectionCollector.getInstance();
        collector.clearData();
        
        // Restart collection if we're in analysis mode
        if (analysisType === 'Ray Hit Map' || analysisType === 'Spot Diagram') {
          collector.startCollection(true); // Clear data for new system
        }
        
        // Reset selected surface to prevent stale selections
        setSelectedSurface('');
        
        // Reset intersection data trigger to unlock UI from old state
        setIntersectionDataTrigger(0);
        
        // Single trigger for all updates - no conditional logic for analysis type
        setRefreshTrigger(prev => prev + 1);
        
      } catch (err) {
        setParsedData(null);
      }
    } else if (!autoUpdate) {
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
        
        // Clear intersection data when importing new file
        const collector = RayIntersectionCollector.getInstance();
        collector.clearData();
        
        // Reset intersection data trigger to unlock UI from old state
        setIntersectionDataTrigger(0);
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
    
    // Clear intersection data when creating new system
    const collector = RayIntersectionCollector.getInstance();
    collector.clearData();
    
    // Reset intersection data trigger to unlock UI from old state
    setIntersectionDataTrigger(0);
  }, []);

  const handleToggleAutoUpdate = useCallback(() => {
    const newAutoUpdate = !autoUpdate;
    setAutoUpdate(newAutoUpdate);
    
    if (newAutoUpdate && isYamlValid) {
      try {
        const parsed = yaml.load(yamlContent) as any;
        setParsedData(parsed);
        setLastRayTracedYaml(yamlContent);
        
        // Reset selected surface when toggling auto-update
        setSelectedSurface('');
        
        // Single trigger for all updates - no conditional logic for analysis type
        setRefreshTrigger(prev => prev + 1);
        console.log('✅ Auto-update re-enabled - ray tracing updated immediately and surface selection reset');
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
        
        // Clear intersection data when manually updating to prevent accumulation
        const collector = RayIntersectionCollector.getInstance();
        collector.clearData();
        
        // Reset selected surface to prevent stale selections
        setSelectedSurface('');
        
        // Reset intersection data trigger to unlock UI from old state
        setIntersectionDataTrigger(0);
        
        // Single trigger for all updates - no conditional logic for analysis type
        setRefreshTrigger(prev => prev + 1);
        
      } catch (err) {
        console.error('❌ Failed to manually update ray tracing:', err);
      }
    }
  }, [isYamlValid, yamlContent]);

  // Keyboard shortcut for manual update (Ctrl+S)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === 's') {
        event.preventDefault(); // Prevent browser's save dialog
        if (!autoUpdate && isYamlValid) {
          handleManualUpdate();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [autoUpdate, isYamlValid, handleManualUpdate]);

  const handleTutorial = useCallback(() => {
    window.open('https://github.com/koorifukai/simple-ray-tracer', '_blank');
  }, []);

  const handleAnalysisChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const newAnalysisType = event.target.value as 'None' | 'Spot Diagram' | 'Ray Hit Map' | 'Tabular Display';
    
    // Check if we have existing data before switching
    const collector = RayIntersectionCollector.getInstance();
    const existingData = collector.getAvailableSurfaces();
    console.log(`🔄 Analysis type change: ${analysisType} → ${newAnalysisType}, existing data: ${existingData.length} surfaces`);
    
    setAnalysisType(newAnalysisType);
    
    // Reset selected surface/light when analysis type changes
    setSelectedSurface('');
    setSelectedLight('');
    console.log('🔄 Reset selected surface/light due to analysis type change');
  }, [analysisType]);

  // Control ray intersection data collection based on analysis type
  useEffect(() => {
    const collector = RayIntersectionCollector.getInstance();
    
    if (analysisType === 'Ray Hit Map' || analysisType === 'Spot Diagram') {
      // Only start collection if not already collecting to avoid duplicates
      if (!collector.isCollectionActive()) {
        // Don't clear data when switching analysis types - preserve existing data
        collector.startCollection(false);
      }
    } else {
      // Only stop collection when explicitly switching to 'None' or other non-analysis types
      if (collector.isCollectionActive()) {
        collector.stopCollection();
      }
    }
    
    // NO cleanup function - let data persist across analysis type switches
    // Data will only be cleared when explicitly switching to 'None' or component unmounts
  }, [analysisType]);

  // Monitor intersection data availability and trigger re-renders
  useEffect(() => {
    if (analysisType === 'Ray Hit Map' || analysisType === 'Spot Diagram') {
      const collector = RayIntersectionCollector.getInstance();
      
      // Check if we already have data immediately
      const existingData = collector.getAvailableSurfaces();
      if (existingData.length > 0) {
        setIntersectionDataTrigger(prev => prev + 1);
        return; // No need to monitor if we already have data
      }
      
      console.log(`🔍 Starting intersection data monitoring for ${analysisType} (no existing data)`);
      let lastCount = 0;
      let checkCount = 0;
      
      const checkInterval = setInterval(() => {
        const availableSurfaces = collector.getAvailableSurfaces();
        checkCount++;
        
        // Only trigger update if surface count actually changed
        if (availableSurfaces.length !== lastCount && availableSurfaces.length > 0) {
          lastCount = availableSurfaces.length;
          setIntersectionDataTrigger(prev => prev + 1);
        }
        
        // Stop checking after 20 attempts (10 seconds) if no data appears
        if (checkCount > 20 && availableSurfaces.length === 0) {
          clearInterval(checkInterval);
        }
        
        // If we have data and it's stable for 3 checks, reduce frequency
        if (availableSurfaces.length > 0 && checkCount > 3) {
          clearInterval(checkInterval);
          // Switch to less frequent monitoring for updates
          const slowInterval = setInterval(() => {
            const currentSurfaces = collector.getAvailableSurfaces();
            if (currentSurfaces.length !== lastCount) {
              lastCount = currentSurfaces.length;
              setIntersectionDataTrigger(prev => prev + 1);
            }
          }, 2000); // Check every 2 seconds instead of 500ms
          
          return () => clearInterval(slowInterval);
        }
      }, 500); // Initial fast checking for first 10 seconds
      
      return () => clearInterval(checkInterval);
    }
  }, [analysisType, refreshTrigger]); // Add refreshTrigger dependency to reset monitoring on YAML changes

  // Extract available surfaces from parsed YAML data and hit data
  const getAvailableSurfaces = useCallback(() => {
    if (!parsedData) return [];
    
    const surfaces: Array<{id: string, label: string}> = [];
    
    // PRIORITY 1: If we're in intersection analysis mode and have collected data, use that
    if (analysisType === 'Ray Hit Map' || analysisType === 'Spot Diagram') {
      const collector = RayIntersectionCollector.getInstance();
      const availableSurfaces = collector.getAvailableSurfaces();
      
      console.log(`📊 OpticalDesignApp: Available surfaces from collector:`, availableSurfaces);
      
      if (availableSurfaces.length > 0) {
        // Use numerical IDs as the primary reference for surface selection
        return availableSurfaces.map(surface => ({
          id: surface.numericalId?.toString() || surface.id, // Use numerical ID as primary key
          label: surface.assemblyName 
            ? `Assem: ${surface.assemblyName}, Surf: ${surface.name} (${surface.intersectionCount} hits)`
            : `Surf: ${surface.name} (${surface.intersectionCount} hits)`
        }));
      } else {
        console.log(`📊 OpticalDesignApp: No intersection data available yet - ray tracing may still be in progress`);
        // Return empty array instead of fallback when ray tracing is in progress
        return [];
      }
    }
    
    // PRIORITY 2: Fallback to YAML structure if no hit data available (for display purposes only)
    console.log(`📊 OpticalDesignApp: Falling back to YAML structure for surface list`);
    
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
        
        // Add each surface in the assembly - use simple surface key as ID (matches ray tracing)
        Object.keys(assembly).forEach(surfaceKey => {
          if (surfaceKey !== 'aid') {
            surfaces.push({
              id: surfaceKey, // Use the actual surface key (s1, s2, etc.) that matches ray tracing
              label: assemblyName !== `assembly ${assemblyId}` 
                ? `Assem: ${assemblyName}, Surf: ${surfaceKey}`
                : `Surf: ${surfaceKey}`
            });
          }
        });
      });
    }
    
    // Add standalone surfaces - use train element names as IDs (matches ray tracing)
    if (parsedData.optical_trains && Array.isArray(parsedData.optical_trains)) {
      parsedData.optical_trains.forEach((trainGroup: any) => {
        Object.entries(trainGroup).forEach(([trainName, trainData]: [string, any]) => {
          // Only include surface elements (have sid property)
          if (trainData.sid !== undefined) {
            surfaces.push({
              id: trainName, // Use train element name (matches ray tracing surface ID)
              label: `Surf: ${trainName}`
            });
          }
        });
      });
    }
    
    return surfaces;
  }, [parsedData, analysisType, intersectionDataTrigger]); // Added intersectionDataTrigger dependency

  // Extract available light sources for spot diagram
  const getAvailableLightSources = useCallback(() => {
    if (!parsedData) return [];
    
    const lightSources: Array<{id: string, label: string, wavelength?: number}> = [];
    
    // For spot diagram, we need to get light sources that have intersection data
    if (analysisType === 'Spot Diagram') {
      const collector = RayIntersectionCollector.getInstance();
      const availableSurfaces = collector.getAvailableSurfaces();
      
      // Extract unique light IDs from intersection data
      const lightIds = new Set<string>();
      
      availableSurfaces.forEach(surface => {
        const surfaceData = collector.getSurfaceIntersectionData(surface.id);
        if (surfaceData && surfaceData.intersectionPoints) {
          surfaceData.intersectionPoints.forEach(point => {
            lightIds.add(point.lightId.toString());
          });
        }
      });
      
      // Convert to light source array with labels
      Array.from(lightIds).sort((a, b) => parseInt(a) - parseInt(b)).forEach(lightId => {
        // Try to get wavelength from YAML data
        let wavelength = 'unknown';
        if (parsedData.light_sources && Array.isArray(parsedData.light_sources)) {
          parsedData.light_sources.forEach((sourceGroup: any) => {
            Object.entries(sourceGroup).forEach(([, sourceData]: [string, any]) => {
              if (sourceData.lid?.toString() === lightId) {
                wavelength = `${sourceData.wavelength}nm`;
              }
            });
          });
        }
        
        lightSources.push({
          id: lightId,
          label: `Light ${lightId} (${wavelength})`,
          wavelength: wavelength !== 'unknown' ? parseInt(wavelength.replace('nm', '')) : undefined
        });
      });
      
      console.log(`📊 OpticalDesignApp: Available light sources for spot diagram:`, lightSources);
    }
    
    return lightSources;
  }, [parsedData, analysisType, intersectionDataTrigger]);

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
                title="Manually update ray tracing with current YAML (Ctrl+S)"
              >
                Update (Ctrl+S)
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
                        <h3>Surfaces</h3>
                        {getAvailableSurfaces().map(surface => (
                          <div 
                            key={surface.id}
                            className={`surface-item ${selectedSurface === surface.id ? 'selected' : ''}`}
                            onClick={() => setSelectedSurface(surface.id)}
                          >
                            {surface.label}
                          </div>
                        ))}
                        {getAvailableSurfaces().length === 0 && (
                          <div className="no-surfaces">
                            <p>No surfaces with ray hits available</p>
                            <p>Ray trace must complete first</p>
                          </div>
                        )}
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
                ) : analysisType === 'Spot Diagram' ? (
                  <div className="hit-map-layout">
                    {/* Left side - Compact light source list */}
                    <div className="surface-list-container">
                      <div className="surface-list">
                        <h3>Light Sources</h3>
                        {getAvailableLightSources().map(lightSource => (
                          <div 
                            key={lightSource.id}
                            className={`surface-item ${selectedLight === lightSource.id ? 'selected' : ''}`}
                            onClick={() => setSelectedLight(lightSource.id)}
                          >
                            {lightSource.label}
                          </div>
                        ))}
                        {getAvailableLightSources().length === 0 && (
                          <div className="no-surfaces">
                            <p>No light sources with ray hits available</p>
                            <p>Ray trace must complete first</p>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Right side - Spot diagram plot */}
                    <div className="hit-map-container">
                      {selectedLight ? (
                        <IntersectionPlot 
                          surfaceId={selectedLight} // Pass light ID for spot diagram
                          analysisType={'Spot Diagram' as 'Hit Map' | 'Spot Diagram'}
                          yamlContent={yamlContent}
                          systemData={parsedData}
                        />
                      ) : (
                        <div className="hit-map-empty">
                          <p>Select a light source</p>
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
