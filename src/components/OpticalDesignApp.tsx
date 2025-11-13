import React, { useState, useCallback, useRef, useEffect } from 'react';
import { YamlEditor } from './YamlEditor';
import { EmptyPlot3D } from '../visualization/EmptyPlot3D';
import { IntersectionPlot } from './IntersectionPlot';
import { RayIntersectionCollector } from './RayIntersectionCollector';
import { ConvergenceHistory } from './ConvergenceHistory';
import { Zemax2YamlPanel } from './Zemax2YamlPanel';
import { OptimizationEngine, VariableParser } from '../optimization';
import { GlassCatalog } from '../optical/materials/GlassCatalog';
import type { OptimizationResult } from '../optimization';
import * as yaml from 'js-yaml';

// Default optical system YAML
const defaultYaml = `
# Gaussian 28 example
display_settings:
  show_grid: True
  show_corners: True
  density_for_intensity: True
assemblies:
  - aid: 0
    s1: 
      {relative: 0, shape: spherical, radius: 54.153, semidia: 30, mode: refraction, n2_material: N-SK2}
    s2:
      {relative: 8.747, shape: spherical, radius: 152.522,  semidia: 28,  mode: refraction, n1_material: N-SK2}
    s3:
      {relative: 0.5, shape: spherical, radius: 35.951,  semidia: 25,  mode: refraction, n2_material: N-SK16}
    s4:
      {relative: 14, shape: plano, semidia: 22,  mode: refraction, n1_material: N-SK16, n2_material: F5}
    s5:
      {relative: 3.777, shape: spherical, radius: 22.27,  semidia: 20,  mode: refraction, n1_material: F5}
    s6: #stop
      {relative: 14.253, shape: plano, semidia: 10.229,  mode: aperture}
    s7:
      {relative: 12.428, shape: spherical, radius: -25.685, semidia: 20,  mode: refraction, n2: 1.60342}#F5
    s8:
      {relative: 3.777, shape: plano, semidia: 20,  mode: refraction, n1: 1.60342, n2: 1.62041}#SK16
    s9:
      {relative: 10.834, shape: spherical, radius: -36.98,  semidia: 20,  mode: refraction, n1: 1.62041}#SK16
    s10:
      {relative: 0.5, shape: spherical, radius: 196.417,  semidia: 20,  mode: refraction, n2: 1.62041}#SK16
    s11:
      {relative: 6.858, shape: spherical, radius: -67.148, semidia: 20,  mode: refraction, n1: 1.62041}#SK16

surfaces:
  - focus:
      {sid: 0, shape: plano, height: 50, width: 50, mode: absorption}
    stop:
      {sid: 1, shape: plano, height: 6, width: 3, mode: aperture}

light_sources:
  - l1:
      {lid: 0, position: [-10,0,-16], vector: [1,0,0.249328], number: 5, wavelength: 633, type: linear, param: 20}
    l2:
      {lid: 1, position: [-10,0,-12], vector: [1,0,0.176327], number: 5, wavelength: 532, type: linear, param: 20}
    l3:
      {lid: 2, position: [-10,0,0], vector: [1,0,0], number: 5, wavelength: 488, type: linear, param: 20}

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
     {sid: 0, position: [V1,0,0], angles: [0,0]}
optimization_settings:
  iterations: 20
  V1: [120,140,20]
  V2: [15,25,5]
  V3: [80,90,5]
  V4: [-25,-15,5]
  obj: -1
  mode: aberrations
  #mode: angle
  param: None`;

interface OpticalDesignAppProps {}

export const OpticalDesignApp: React.FC<OpticalDesignAppProps> = () => {
  // Initialize with processed default YAML to avoid double rendering
  const initialProcessedResult = (() => {
    try {
      const problem = VariableParser.parseOptimizationProblem(defaultYaml);
      let processedYaml = defaultYaml;
      
      if (problem && problem.variables.length > 0) {
        problem.variables.forEach(variable => {
          const midValue = (variable.min + variable.max) / 2;
          const regex = new RegExp(`\\b${variable.name}\\b`, 'g');
          processedYaml = processedYaml.replace(regex, midValue.toString());
        });
      }
      
      return {
        processedYaml,
        parsedData: yaml.load(processedYaml) as any,
        hasOptimization: problem !== null && problem.variables.length > 0
      };
    } catch (error) {
      console.warn('Failed to process initial YAML:', error);
      return {
        processedYaml: defaultYaml,
        parsedData: null,
        hasOptimization: false
      };
    }
  })();

  const [yamlContent, setYamlContent] = useState(defaultYaml);
  const [isYamlValid, setIsYamlValid] = useState(true);
  const [parsedData, setParsedData] = useState<any>(initialProcessedResult.parsedData);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [privacyMode, setPrivacyMode] = useState(false);
  const [lastRayTracedYaml, setLastRayTracedYaml] = useState(initialProcessedResult.processedYaml);
  const [analysisType, setAnalysisType] = useState<'None' | 'System Overview' | 'Spot Diagram' | 'Ray Hit Map' | 'zemax2yaml' | 'Convergence History'>('None');
  const [refreshTrigger, setRefreshTrigger] = useState(0); // Used to trigger secondary panel refresh
  const [selectedSurface, setSelectedSurface] = useState<string>('');
  const [selectedLight, setSelectedLight] = useState<string>(''); // For spot diagram light source selection
  const [materialErrors, setMaterialErrors] = useState<string[]>([]); // Track material validation errors
  
  // Status tracking for chronological display
  const [latestStatus, setLatestStatus] = useState<{
    type: 'yaml-valid' | 'yaml-error' | 'material-error' | 'optimization-success' | 'optimization-error';
    message: string;
    timestamp: number;
  }>({ type: 'yaml-valid', message: '', timestamp: Date.now() });
  
  // Track YAML content changes to only update status when content actually changes
  const [lastValidatedYaml, setLastValidatedYaml] = useState<string>('');
  const [intersectionDataTrigger, setIntersectionDataTrigger] = useState(0); // Track intersection data updates
  
  // Optimization state
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationResult, setOptimizationResult] = useState<OptimizationResult | null>(null);
  const [hasOptimizationSettings, setHasOptimizationSettings] = useState(initialProcessedResult.hasOptimization);
  
  // Ray tracing statistics state
  const [rayStats, setRayStats] = useState<{
    totalRays: number;
    totalIntersections: number;
    intersectionRate: number;
    surfaceCount: number;
    wavelengthCount: number;
    lightSourceCount: number;
  } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clear intersection data on component mount for clean initialization
  useEffect(() => {
    const collector = RayIntersectionCollector.getInstance();
    collector.clearData();
  }, []);

  // Function to update ray tracing statistics
  // Update status when material errors change or YAML content changes
  useEffect(() => {
    if (materialErrors.length > 0 && isYamlValid) {
      setLatestStatus({
        type: 'material-error',
        message: `Material Error: ${materialErrors.join(', ')}`,
        timestamp: Date.now()
      });
    } else if (materialErrors.length === 0 && isYamlValid && parsedData && yamlContent !== lastValidatedYaml) {
      // Only update "Valid YAML" status when YAML content actually changes
      setLatestStatus({
        type: 'yaml-valid',
        message: `Valid YAML - ${parsedData?.assemblies?.[0] ? Object.keys(parsedData.assemblies[0]).filter(k => k !== 'aid').length : 0} surfaces, ${parsedData?.light_sources?.length || 0} light sources, ${parsedData?.surfaces?.length || 0} standalone surfaces`,
        timestamp: Date.now()
      });
      setLastValidatedYaml(yamlContent);
    }
  }, [materialErrors, isYamlValid, parsedData, yamlContent, lastValidatedYaml]);

  const updateRayStats = useCallback(() => {
    try {
      const collector = RayIntersectionCollector.getInstance();
      const stats = collector.getStatistics();
      setRayStats(stats);
    } catch (error) {
      console.warn('Failed to get ray statistics:', error);
      setRayStats(null);
    }
  }, []);

  // Material validation function
  const validateMaterials = useCallback((data: any) => {
    const errors: string[] = [];
    const surfaces: Array<{ id: string; n1_material?: string; n2_material?: string }> = [];
    
    // Collect all surfaces from assemblies
    if (data.assemblies) {
      data.assemblies.forEach((assembly: any) => {
        Object.keys(assembly).forEach(key => {
          if (key !== 'aid') {
            surfaces.push({ id: key, ...assembly[key] });
          }
        });
      });
    }
    
    // Check for unknown glass materials
    surfaces.forEach((surface) => {
      if (surface.n1_material && !surface.n1_material.match(/^\d+(\.\d+)?$/)) {
        if (!GlassCatalog.getGlass(surface.n1_material)) {
          if (!errors.includes(`Unknown glass: ${surface.n1_material}`)) {
            errors.push(`Unknown glass: ${surface.n1_material}`);
          }
        }
      }
      if (surface.n2_material && !surface.n2_material.match(/^\d+(\.\d+)?$/)) {
        if (!GlassCatalog.getGlass(surface.n2_material)) {
          if (!errors.includes(`Unknown glass: ${surface.n2_material}`)) {
            errors.push(`Unknown glass: ${surface.n2_material}`);
          }
        }
      }
    });
    
    setMaterialErrors(errors);
  }, []);

  // Centralized YAML processing function - processes once and returns everything needed
  const processYamlForVisualization = useCallback((yamlInput: string): {
    processedYaml: string;
    parsedData: any;
    hasOptimization: boolean;
    variables: any[];
  } => {
    try {
      console.log('� SINGLE YAML PROCESSING: Starting centralized YAML processing...');
      
      // STEP 1: Check for optimization variables
      const problem = VariableParser.parseOptimizationProblem(yamlInput);
      const hasOptimization = problem !== null && problem.variables.length > 0;
      
      if (hasOptimization) {
        console.log('✅ Found optimization variables:', problem.variables.map(v => v.name));
      }
      
      // STEP 2: Get processed YAML with variable substitution (if needed)
      let processedYaml = yamlInput;
      if (hasOptimization && problem.variables.length > 0) {
        // Create variable map with midpoint values for visualization
        const variableMap: { [key: string]: number } = {};
        problem.variables.forEach(variable => {
          variableMap[variable.name] = (variable.min + variable.max) / 2;
        });
        
        // Use VariableParser for proper substitution
        processedYaml = VariableParser.substituteVariables(yamlInput, variableMap);
        console.log('🔄 Variable substitution completed');
      }
      
      // STEP 3: Parse the final YAML once
      const parsedData = yaml.load(processedYaml) as any;
      
      console.log('✅ SINGLE YAML PROCESSING: Completed successfully');
      return {
        processedYaml,
        parsedData,
        hasOptimization,
        variables: problem?.variables || []
      };
      
    } catch (error) {
      console.warn('❌ YAML processing failed:', error);
      // Return safe defaults
      return {
        processedYaml: yamlInput,
        parsedData: null,
        hasOptimization: false,
        variables: []
      };
    }
  }, []);

  const handleYamlChange = useCallback((newYaml: string) => {
    setYamlContent(newYaml);
  }, []);

  const handleYamlValidation = useCallback((isValid: boolean, error?: string, _errors?: any, currentYaml?: string) => {
    setIsYamlValid(isValid);
    
    // Update chronological status for YAML validation
    if (!isValid) {
      setLatestStatus({
        type: 'yaml-error',
        message: `YAML Parse Error: ${error || 'Unknown error'}`,
        timestamp: Date.now()
      });
    }
    
    // Use currentYaml if provided, otherwise fall back to yamlContent state
    const yamlToProcess = currentYaml || yamlContent;
    
    if (isValid && autoUpdate) {
      try {
        // SINGLE PROCESSING: Get everything needed in one shot
        const result = processYamlForVisualization(yamlToProcess);
        
        // Only update if the processed YAML has actually changed
        if (result.processedYaml !== lastRayTracedYaml) {
          console.log('🔄 YAML content changed - updating visualization');
          
          // Update all state with results from single processing
          setParsedData(result.parsedData);
          setLastRayTracedYaml(result.processedYaml);
          setHasOptimizationSettings(result.hasOptimization);
          
          // Validate glass materials (status will be updated by useEffect)
          validateMaterials(result.parsedData);
          
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
          
          // Update ray statistics after processing
          setTimeout(updateRayStats, 100); // Small delay to ensure ray tracing completes
        } else {
          console.log('✅ YAML content unchanged - skipping duplicate processing');
        }
        
      } catch (err) {
        setParsedData(null);
      }
    } else if (isValid && !autoUpdate) {
      // When auto-update is off, still check optimization settings
      const result = processYamlForVisualization(yamlToProcess);
      setHasOptimizationSettings(result.hasOptimization);
      console.log('⏸️ Auto-update paused - YAML syntax valid but ray tracing not updated');
    } else {
      setHasOptimizationSettings(false);
      setParsedData(null);
    }
  }, [yamlContent, autoUpdate, analysisType, processYamlForVisualization, updateRayStats]); // Removed lastRayTracedYaml to prevent circular dependency // Removed lastRayTracedYaml to prevent circular dependency

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
        
        // CRITICAL: Force scene update after YAML import
        setTimeout(() => {
          handleYamlValidation(true, undefined, undefined, content);
        }, 100);
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
    
    // Process the default YAML with centralized processing  
    const result = processYamlForVisualization(defaultYaml);
    setParsedData(result.parsedData);
    setLastRayTracedYaml(result.processedYaml);
    setHasOptimizationSettings(result.hasOptimization);
    
    // Clear intersection data when creating new system
    const collector = RayIntersectionCollector.getInstance();
    collector.clearData();
    
    // Reset intersection data trigger to unlock UI from old state
    setIntersectionDataTrigger(0);
    
    // Trigger visualization update
    setRefreshTrigger(prev => prev + 1);
  }, [processYamlForVisualization]);

  const handleToggleAutoUpdate = useCallback(() => {
    const newAutoUpdate = !autoUpdate;
    setAutoUpdate(newAutoUpdate);
    
    if (newAutoUpdate && isYamlValid) {
      try {
        // Use centralized processing when re-enabling auto-update
        const result = processYamlForVisualization(yamlContent);
        setParsedData(result.parsedData);
        setLastRayTracedYaml(result.processedYaml);
        setHasOptimizationSettings(result.hasOptimization);
        
        // Reset selected surface when toggling auto-update
        setSelectedSurface('');
        
        // Single trigger for all updates - no conditional logic for analysis type
        setRefreshTrigger(prev => prev + 1);
        console.log('✅ Auto-update re-enabled - ray tracing updated immediately and surface selection reset');
      } catch (err) {
        console.error('❌ Failed to update ray tracing when re-enabling auto-update:', err);
      }
    }
  }, [autoUpdate, isYamlValid, yamlContent, processYamlForVisualization]);

  const handleTogglePrivacy = useCallback(() => {
    setPrivacyMode(!privacyMode);
  }, [privacyMode]);

  const handleManualUpdate = useCallback(() => {
    if (isYamlValid) {
      try {
        // Use centralized processing for manual update
        const result = processYamlForVisualization(yamlContent);
        
        // Update all state with single processing result
        setParsedData(result.parsedData);
        setLastRayTracedYaml(result.processedYaml);
        setHasOptimizationSettings(result.hasOptimization);
        
        // Validate glass materials
        validateMaterials(result.parsedData);
        
        // Clear intersection data when manually updating to prevent accumulation
        const collector = RayIntersectionCollector.getInstance();
        collector.clearData();
        
        // Reset selected surface to prevent stale selections
        setSelectedSurface('');
        
        // Reset intersection data trigger to unlock UI from old state
        setIntersectionDataTrigger(0);
        
        // Single trigger for all updates - no conditional logic for analysis type
        setRefreshTrigger(prev => prev + 1);
        
        // Update ray statistics after manual processing
        setTimeout(updateRayStats, 100); // Small delay to ensure ray tracing completes
        
      } catch (err) {
        console.error('❌ Failed to manually update ray tracing:', err);
      }
    }
  }, [isYamlValid, yamlContent, processYamlForVisualization, updateRayStats]);

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

  // Handle optimization
  const handleOptimize = useCallback(async () => {
    if (!isYamlValid || isOptimizing) return;
    
    console.log('🔧 Starting optimization...');
    setIsOptimizing(true);
    setOptimizationResult(null);
    
    try {
      // Use original YAML for optimization (preserves variables)
      const result = await OptimizationEngine.optimize(yamlContent);
      setOptimizationResult(result);
      
      // Update chronological status for optimization results
      if (result.success) {
        setLatestStatus({
          type: 'optimization-success',
          message: `Optimization Complete - ${result.iterations} iterations, Final objective: ${result.finalObjective.toExponential(3)}, ${parsedData?.assemblies?.[0] ? Object.keys(parsedData.assemblies[0]).filter(k => k !== 'aid').length : 0} surfaces`,
          timestamp: Date.now()
        });
      } else {
        setLatestStatus({
          type: 'optimization-error',
          message: `Optimization Failed: ${result.errorMessage}`,
          timestamp: Date.now()
        });
      }
      
      // Apply optimized variables to YAML if we found a better solution (even if "failed" due to max iterations)
      if (result.success || result.finalObjective < 1000.0) {
        // Apply optimized variables to YAML
        const problem = VariableParser.parseOptimizationProblem(yamlContent);
        if (problem) {
          const updatedVariables = VariableParser.updateVariables(problem.variables, result.optimizedVariables);
          const variableMap = VariableParser.createVariableMap(updatedVariables);
          const optimizedYaml = VariableParser.substituteVariables(yamlContent, variableMap);
          
          // Update the YAML editor with optimized values
          setYamlContent(optimizedYaml);
          
          // CRITICAL: Force scene update after optimization
          setTimeout(() => {
            handleYamlValidation(true, undefined, undefined, optimizedYaml);
          }, 100);
          
          if (result.success) {
            console.log('✅ Optimization successful! YAML updated with optimized values.');
          } else {
            console.log('⚠️ Optimization reached max iterations but found better values. YAML updated.');
          }
          console.log('📊 Final objective:', result.finalObjective.toExponential(3));
          console.log('🔧 Optimized variables:', result.optimizedVariables);
        }
      } else {
        console.warn('❌ Optimization failed:', result.errorMessage);
      }
    } catch (error) {
      console.error('💥 Optimization error:', error);
      const errorResult = {
        success: false,
        iterations: 0,
        finalObjective: Number.MAX_VALUE,
        optimizedVariables: {},
        convergenceHistory: [],
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      };
      setOptimizationResult(errorResult);
      
      // Update chronological status for optimization errors
      setLatestStatus({
        type: 'optimization-error',
        message: `Optimization Failed: ${errorResult.errorMessage}`,
        timestamp: Date.now()
      });
    } finally {
      setIsOptimizing(false);
    }
  }, [yamlContent, isYamlValid, isOptimizing]);

  const handleAnalysisChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const newAnalysisType = event.target.value as 'None' | 'System Overview' | 'Spot Diagram' | 'Ray Hit Map' | 'zemax2yaml' | 'Convergence History';
    
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
      
      // Extract unique light IDs from intersection data, filtering to only lights that reach the last surface
      const allLightIds = new Set<number>();
      
      // Find the last active surface (highest numerical ID, excluding "inactive" surfaces)
      let lastSurfaceId = '';
      let maxNumericalId = -1;
      availableSurfaces.forEach(surface => {
        // Get surface data to check mode
        const surfaceData = collector.getSurfaceIntersectionData(surface.id);
        if (surfaceData && surfaceData.surface && surfaceData.surface.mode !== 'inactive') {
          if (surface.numericalId !== undefined && surface.numericalId > maxNumericalId) {
            maxNumericalId = surface.numericalId;
            lastSurfaceId = surface.id;
          }
        }
      });
      
      console.log(`📊 OpticalDesignApp: Last active surface for spot diagram filtering: ${lastSurfaceId} (No.${maxNumericalId}) - excluding inactive surfaces`);
      
      // Only include lights that reach the last surface
      if (lastSurfaceId) {
        const lastSurfaceData = collector.getSurfaceIntersectionData(lastSurfaceId);
        if (lastSurfaceData && lastSurfaceData.intersectionPoints) {
          lastSurfaceData.intersectionPoints.forEach(point => {
            allLightIds.add(point.lightId); // Include both original and shadow LIDs that reach the last surface
          });
        }
      }
      
      console.log(`📊 OpticalDesignApp: Light IDs that reach last surface:`, [...allLightIds].sort((a, b) => a - b));
      
      // Convert to light source array with simple labels, sorted by light ID
      Array.from(allLightIds).sort((a, b) => a - b).forEach(lightId => {
        // Try to get wavelength from YAML data for original lights, or inherit for shadow lights
        let wavelength = 'unknown';
        let searchLightId = lightId;
        
        // For shadow lights, extract ancestral light ID for wavelength lookup
        if (lightId >= 1000) {
          const decimalPart = lightId - Math.floor(lightId);
          searchLightId = Math.round(decimalPart * 10); // Extract ancestral ID (0.0→0, 0.1→1, ..., 0.9→9)
        }
        
        if (parsedData.light_sources && Array.isArray(parsedData.light_sources)) {
          parsedData.light_sources.forEach((sourceGroup: any) => {
            Object.entries(sourceGroup).forEach(([, sourceData]: [string, any]) => {
              if (sourceData.lid === searchLightId) {
                wavelength = `${sourceData.wavelength}nm`;
              }
            });
          });
        }
        
        lightSources.push({
          id: lightId.toString(),
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
                <option value="System Overview">System Overview</option>
                <option value="Spot Diagram">Spot Diagram</option>
                <option value="Ray Hit Map">Ray Hit Map</option>
                <option value="zemax2yaml">Zemax2YAML</option>
                <option value="Convergence History">Convergence History</option>
              </select>
            </div>
            
            {/* Optimization button */}
            {hasOptimizationSettings && (
              <button 
                className="menu-button optimize-button" 
                onClick={handleOptimize}
                disabled={!isYamlValid || isOptimizing}
                title="Run Levenberg-Marquardt optimization"
              >
                {isOptimizing ? 'Optimizing...' : 'Optimize Vs'}
              </button>
            )}
          </div>
        </div>

        {/* Privacy toggle button */}
        <div className="menubar-right">
          <div className="privacy-control">
            <button 
              className={`privacy-button ${privacyMode ? 'active' : ''}`}
              onClick={handleTogglePrivacy}
              title="Toggle Privacy Mode (hide sensitive info for screenshots)"
            >
              {privacyMode ? 'Show' : 'Hide'}
            </button>
          </div>

        {/* Auto-update toggle switch - moved to rightmost */}
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
          {/* Privacy Overlay */}
          {privacyMode && (
            <div className="privacy-overlay"></div>
          )}
          
          {/* YAML Editor Panel */}
          <div className={`yaml-panel ${analysisType !== 'None' ? 'with-analysis' : ''}`}>
            <div className="yaml-editor-container">
              <YamlEditor 
                value={yamlContent}
                onChange={handleYamlChange}
                onValidationChange={handleYamlValidation}
              />
              
              {/* Unified Status Display - Shows latest message chronologically */}
              <div className={`yaml-status ${
                latestStatus.type === 'yaml-error' || latestStatus.type === 'material-error' || latestStatus.type === 'optimization-error' ? 'error' : 'success'
              }`} style={{
                backgroundColor: latestStatus.type === 'material-error' ? 'rgba(220, 53, 69, 0.25)' : undefined,
                borderLeft: latestStatus.type === 'material-error' ? '3px solid var(--error)' : undefined
              }}>
                {latestStatus.type === 'yaml-valid' && (
                  <>
                    <span>✓</span>
                    <span>{latestStatus.message}</span>
                  </>
                )}
                {latestStatus.type === 'yaml-error' && (
                  <>
                    <span>✗</span>
                    <span>{latestStatus.message}</span>
                  </>
                )}
                {latestStatus.type === 'material-error' && (
                  <>
                    <span>🔴</span>
                    <span>{latestStatus.message}</span>
                  </>
                )}
                {latestStatus.type === 'optimization-success' && (
                  <>
                    <span>🔧</span>
                    <span>{latestStatus.message}</span>
                  </>
                )}
                {latestStatus.type === 'optimization-error' && (
                  <>
                    <span>⚠️</span>
                    <span>{latestStatus.message}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Analysis Panel */}
          {analysisType !== 'None' && (
            <div className={`analysis-panel ${analysisType.toLowerCase().replace(/ /g, '-')}`}>
              <div className="analysis-content">
                {analysisType === 'System Overview' ? (
                  <div className="system-overview-panel">
                    <h3>System Overview</h3>
                    {rayStats ? (
                      <div className="system-stats-grid">
                        <div className="stat-card">
                          <div className="stat-label">Total Rays</div>
                          <div className="stat-value" title={`${rayStats.totalIntersections} intersections from ${rayStats.totalRays} rays`}>
                            {rayStats.totalRays.toLocaleString()}
                          </div>
                        </div>
                        <div className="stat-card">
                          <div className="stat-label">Light Sources</div>
                          <div className="stat-value">{rayStats.lightSourceCount}</div>
                        </div>
                        <div className="stat-card">
                          <div className="stat-label">Surfaces</div>
                          <div className="stat-value">{rayStats.surfaceCount}</div>
                        </div>
                        {rayStats.intersectionRate > 0 && (
                          <div className="stat-card">
                            <div className="stat-label">Hit Rate</div>
                            <div className="stat-value">{(rayStats.intersectionRate * 100).toFixed(1)}%</div>
                          </div>
                        )}
                        <div className="stat-card">
                          <div className="stat-label">Total Intersections</div>
                          <div className="stat-value">{rayStats.totalIntersections.toLocaleString()}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="no-stats">
                        <p>No ray tracing data available</p>
                        <p>Click "Ray Trace" to generate system statistics</p>
                      </div>
                    )}
                  </div>
                ) : analysisType === 'Ray Hit Map' ? (
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
                ) : analysisType === 'Convergence History' ? (
                  <div className="convergence-analysis-panel">
                    {optimizationResult && optimizationResult.convergenceHistory ? (
                      <ConvergenceHistory convergenceHistory={optimizationResult.convergenceHistory} />
                    ) : (
                      <div className="placeholder-content">
                        <p>No optimization data available. Run optimization to see convergence history.</p>
                      </div>
                    )}
                  </div>
                ) : analysisType === 'zemax2yaml' ? (
                  <div className="zemax2yaml-analysis-panel">
                    <Zemax2YamlPanel />
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
              yamlContent={autoUpdate ? (isYamlValid ? lastRayTracedYaml : undefined) : lastRayTracedYaml}
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
