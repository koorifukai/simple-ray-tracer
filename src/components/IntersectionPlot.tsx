import React, { useEffect, useRef } from 'react';
import Plotly from 'plotly.js-dist-min';
import { RayIntersectionCollector } from './RayIntersectionCollector';
import { getWavelengthColor } from '../optical/wavelength';

interface IntersectionPoint {
  y: number;
  z: number;
  wavelength: number;
  intensity: number;
  rayId: string;
  lightId: number;
}

interface IntersectionPlotProps {
  surfaceId: string;
  analysisType: 'Hit Map' | 'Spot Diagram';
  yamlContent?: string;
  systemData?: any; // Parsed YAML system data
}

export const IntersectionPlot: React.FC<IntersectionPlotProps> = ({ 
  surfaceId, 
  analysisType, 
  yamlContent,
  systemData 
}) => {
  const plotRef = useRef<HTMLDivElement>(null);
  const plotlyInstanceRef = useRef<any>(null);

  // Get intersection data from collector
  const getIntersectionData = (): IntersectionPoint[] => {
    const collector = RayIntersectionCollector.getInstance();
    const surfaceData = collector.getSurfaceIntersectionData(surfaceId);
    
    console.log(`📊 IntersectionPlot: Checking data for surface ${surfaceId}`);
    console.log(`📊 IntersectionPlot: Surface data:`, surfaceData);
    
    if (!surfaceData || surfaceData.intersectionPoints.length === 0) {
      console.log('📊 IntersectionPlot: No intersection data available');
      return [];
    }
    
    console.log(`📊 IntersectionPlot: Found ${surfaceData.intersectionPoints.length} intersection points`);
    
    return surfaceData.intersectionPoints.map(hit => ({
      y: hit.crossSectionY,
      z: hit.crossSectionZ,
      wavelength: hit.wavelength,
      intensity: hit.intensity,
      rayId: hit.rayId,
      lightId: hit.lightId
    }));
  };

  // Generate 2D surface cross-section geometry for background rendering
  const generateSurfaceGeometry = (surface: any): any[] => {
    const shapes: any[] = [];
    const surfaceColor = 'rgba(255,255,255,0.2)'; // Standard background color
    
    console.log('🎨 Generating 2D surface geometry:', {
      shape: surface.shape,
      semidia: surface.semidia,
      height: surface.height,
      width: surface.width
    });
    
    // Determine surface type and create appropriate 2D cross-section
    const shape = surface.shape || 'plano'; // Default to plano if not specified
    
    // Priority 1: Check if surface has explicit height and width (rectangular)
    if (surface.height && surface.width) {
      // Surfaces with explicit height/width: render as rectangle
      const height = surface.height;
      const width = surface.width;
      
      shapes.push({
        type: 'rect',
        xref: 'x',
        yref: 'y',
        x0: -width/2,
        y0: -height/2,
        x1: width/2,
        y1: height/2,
        line: {
          color: 'rgba(255,255,255,0.4)',
          width: 1
        },
        fillcolor: surfaceColor,
        layer: 'below'
      });
      
      console.log(`✅ Generated rectangular cross-section (priority): ${width}×${height}mm for shape="${shape}"`);
      
    } else if (shape === 'cylindrical') {
      // Cylindrical surfaces: render as rectangle using height × width
      const height = surface.height || 50;
      const width = surface.width || 50;
      
      shapes.push({
        type: 'rect',
        xref: 'x',
        yref: 'y',
        x0: -width/2,
        y0: -height/2,
        x1: width/2,
        y1: height/2,
        line: {
          color: 'rgba(255,255,255,0.4)',
          width: 1
        },
        fillcolor: surfaceColor,
        layer: 'below'
      });
      
      console.log(`✅ Generated rectangular cross-section: ${width}×${height}mm`);
      
    } else if (shape === 'spherical' || shape === 'plano') {
      // Spherical and plano surfaces without explicit dimensions: render as circle using semidia
      const radius = surface.semidia || 25; // Default 25mm radius if not specified
      
      shapes.push({
        type: 'circle',
        xref: 'x',
        yref: 'y',
        x0: -radius,
        y0: -radius,
        x1: radius,
        y1: radius,
        line: {
          color: 'rgba(255,255,255,0.4)', // Slightly visible border
          width: 1
        },
        fillcolor: surfaceColor,
        layer: 'below'
      });
      
      console.log(`✅ Generated circular cross-section: radius=${radius}mm for shape="${shape}" (no explicit dimensions)`);
      
    } else if (surface.height && surface.width) {
      // Surfaces with explicit height/width: render as rectangle
      const height = surface.height;
      const width = surface.width;
      
      shapes.push({
        type: 'rect',
        xref: 'x',
        yref: 'y',
        x0: -width/2,
        y0: -height/2,
        x1: width/2,
        y1: height/2,
        line: {
          color: 'rgba(255,255,255,0.4)',
          width: 1
        },
        fillcolor: surfaceColor,
        layer: 'below'
      });
      
      console.log(`✅ Generated explicit rectangular cross-section: ${width}×${height}mm`);
      
    } else if (surface.semidia) {
      // Fallback: if we have semidia, render as circle
      const radius = surface.semidia;
      
      shapes.push({
        type: 'circle',
        xref: 'x',
        yref: 'y',
        x0: -radius,
        y0: -radius,
        x1: radius,
        y1: radius,
        line: {
          color: 'rgba(255,255,255,0.4)',
          width: 1
        },
        fillcolor: surfaceColor,
        layer: 'below'
      });
      
      console.log(`✅ Generated fallback circular cross-section: radius=${radius}mm`);
    }
    
    return shapes;
  };

  // Get surface from YAML data and generate 2D cross-section
  const getSurfaceShape = (): any[] => {
    console.log('🎨 SURFACE RENDERING: Starting surface cross-section rendering...');
    let system: any = systemData;
    
    // If no system data provided, try to parse YAML
    if (!system && yamlContent) {
      try {
        if (typeof (window as any).jsyaml !== 'undefined') {
          system = (window as any).jsyaml.load(yamlContent);
          console.log('🎨 SURFACE RENDERING: Parsed YAML for surface lookup');
        } else {
          console.warn('🎨 SURFACE RENDERING: YAML parser not available and no system data provided, skipping surface shape');
          return [];
        }
      } catch (error) {
        console.warn('🎨 SURFACE RENDERING: Could not parse YAML for surface shape:', error);
        return [];
      }
    }
    
    if (!system || !surfaceId) {
      console.warn('🎨 SURFACE RENDERING: No system data available for surface shape');
      return [];
    }
    
    // Find the surface in the system
    let targetSurface: any = null;
    
    console.log('🎨 SURFACE RENDERING: Looking for surface:', surfaceId);
    console.log('🎨 SURFACE RENDERING: System structure:', {
      assemblies: system.assemblies ? 'present' : 'missing',
      surfaces: system.surfaces ? 'present' : 'missing'
    });
    
    // Handle different surface ID formats from OpticalDesignApp
    if (surfaceId.startsWith('assembly_')) {
      // Format: assembly_0_s1, assembly_0_s2, etc.
      const parts = surfaceId.split('_');
      if (parts.length >= 3) {
        const assemblyId = parts[1];
        const surfaceKey = parts.slice(2).join('_'); // Handle surface keys with underscores
        
        console.log('🎨 SURFACE RENDERING: Assembly surface lookup:', { assemblyId, surfaceKey });
        
        if (system.assemblies && Array.isArray(system.assemblies)) {
          const assembly = system.assemblies.find((a: any) => a.aid?.toString() === assemblyId);
          if (assembly && assembly[surfaceKey]) {
            targetSurface = assembly[surfaceKey];
            console.log('✅ SURFACE RENDERING: Found assembly surface:', targetSurface);
          } else {
            console.warn('❌ SURFACE RENDERING: Assembly or surface key not found');
          }
        } else {
          console.warn('❌ SURFACE RENDERING: No assemblies array found');
        }
      }
    } else if (surfaceId.startsWith('surface_')) {
      // Format: surface_focus, surface_stop, etc.
      const surfaceKey = surfaceId.replace('surface_', '');
      
      console.log('🎨 SURFACE RENDERING: Standalone surface lookup:', { surfaceKey });
      
      if (system.surfaces && Array.isArray(system.surfaces)) {
        for (const surfaceGroup of system.surfaces) {
          if (surfaceGroup[surfaceKey]) {
            targetSurface = surfaceGroup[surfaceKey];
            console.log('✅ SURFACE RENDERING: Found standalone surface:', targetSurface);
            break;
          }
        }
        if (!targetSurface) {
          console.warn('❌ SURFACE RENDERING: Standalone surface not found in any surface group');
        }
      } else {
        console.warn('❌ SURFACE RENDERING: No surfaces array found');
      }
    } else {
      // Legacy/direct surface key format - search all assemblies for this surface key
      console.log('🎨 SURFACE RENDERING: Direct surface key format, searching all assemblies...');
      
      if (system.assemblies && Array.isArray(system.assemblies)) {
        console.log(`🎨 SURFACE RENDERING: Searching ${system.assemblies.length} assemblies for surface key "${surfaceId}"`);
        
        for (const assembly of system.assemblies) {
          if (assembly[surfaceId]) {
            targetSurface = assembly[surfaceId];
            const assemblyId = assembly.aid?.toString() || 'unknown';
            console.log(`✅ SURFACE RENDERING: Found surface "${surfaceId}" in assembly ${assemblyId}:`, targetSurface);
            break;
          }
        }
        
        if (!targetSurface) {
          console.warn(`🎨 SURFACE RENDERING: Surface key "${surfaceId}" not found in any assembly`);
        }
      } else {
        console.warn('🎨 SURFACE RENDERING: No assemblies array found for direct surface lookup');
      }
      
      // Also check standalone surfaces if not found in assemblies
      if (!targetSurface && system.surfaces && Array.isArray(system.surfaces)) {
        console.log(`🎨 SURFACE RENDERING: Surface not found in assemblies, checking ${system.surfaces.length} standalone surface groups`);
        
        for (const surfaceGroup of system.surfaces) {
          if (surfaceGroup[surfaceId]) {
            targetSurface = surfaceGroup[surfaceId];
            console.log(`✅ SURFACE RENDERING: Found standalone surface "${surfaceId}":`, targetSurface);
            break;
          }
        }
      }
    }
    
    if (!targetSurface) {
      console.error(`❌ SURFACE RENDERING: Target surface "${surfaceId}" not found after exhaustive search, returning empty shapes`);
      return [];
    }
    
    // Use the new 2D surface geometry generator
    console.log('🎨 SURFACE RENDERING: Generating geometry for surface:', targetSurface);
    const shapes = generateSurfaceGeometry(targetSurface);
    console.log('🎨 SURFACE RENDERING: Generated', shapes.length, 'shapes for background');
    return shapes;
  };

  // Create single plot for Hit Map
  const createHitMapPlot = (data: IntersectionPoint[]) => {
    if (data.length === 0) {
      console.log('📊 HIT MAP: No intersection data, creating empty plot with surface background');
      const surfaceShapes = getSurfaceShape();
      console.log(`🎨 BACKGROUND (empty): Retrieved ${surfaceShapes.length} surface shapes for empty plot background`);
      
      return {
        data: [{
          x: [],
          y: [],
          type: 'scatter',
          mode: 'markers',
          name: 'No data'
        }],
        layout: {
          xaxis: {
            title: 'Y Position (mm)', // This is actually Y coordinate from 3D space
            color: '#ccc',
            gridcolor: '#444',
            showgrid: true,
            zeroline: true,
            zerolinecolor: '#666'
          },
          yaxis: {
            title: 'Z Position (mm)', // This is actually Z coordinate from 3D space
            color: '#ccc',
            gridcolor: '#444',
            showgrid: true,
            zeroline: true,
            zerolinecolor: '#666',
            scaleanchor: 'x', // Equal aspect ratio - Y axis anchored to X axis
            scaleratio: 1,    // 1:1 aspect ratio
            constrain: 'domain' // Robust equal scaling constraint
          },
          plot_bgcolor: '#1e1e1e',
          paper_bgcolor: '#1e1e1e',
          font: { color: '#ccc' },
          showlegend: false,
          margin: { l: 60, r: 20, t: 40, b: 50 },
          shapes: surfaceShapes, // Add surface cross-section shape even for empty plot
          autosize: true,
          dragmode: 'pan'
        }
      };
    }

    // Group by wavelength for hit map (include ALL light sources)
    const wavelengthGroups = new Map<number, IntersectionPoint[]>();
    data.forEach(point => {
      if (!wavelengthGroups.has(point.wavelength)) {
        wavelengthGroups.set(point.wavelength, []);
      }
      wavelengthGroups.get(point.wavelength)!.push(point);
    });

    console.log(`📊 RAY PLOTTING: Processing ${data.length} points from ${new Set(data.map(p => Math.floor(p.lightId))).size} light sources`);
    console.log(`📊 RAY PLOTTING: Wavelength groups:`, Array.from(wavelengthGroups.keys()));
    console.log(`📊 RAY PLOTTING: Light source breakdown:`, [...new Set(data.map(p => Math.floor(p.lightId)))].map(lid => ({
      lightId: lid,
      count: data.filter(p => Math.floor(p.lightId) === lid).length
    })));

    const traces = Array.from(wavelengthGroups.entries()).map(([wavelength, points]) => {
      console.log(`📊 RAY PLOTTING: Creating trace for λ=${wavelength}nm with ${points.length} points`);
      return {
        x: points.map(p => p.y),
        y: points.map(p => p.z),
        type: 'scatter' as const,
        mode: 'markers' as const,
        marker: {
          color: getWavelengthColor(wavelength),
          size: 6,
          opacity: 0.8
        },
        name: `${wavelength}nm (${points.length} pts)`,
        hovertemplate: `Y: %{x:.3f}mm<br>Z: %{y:.3f}mm<br>λ: ${wavelength}nm<extra></extra>`
      };
    });

    console.log(`📊 RAY PLOTTING: Created ${traces.length} traces for plotting`);
    
    // Get surface shapes for background
    const surfaceShapes = getSurfaceShape();
    console.log(`🎨 BACKGROUND: Retrieved ${surfaceShapes.length} surface shapes for background`);
    
    // Debug: Log the actual shapes being passed to Plotly
    if (surfaceShapes.length > 0) {
      console.log('🎨 BACKGROUND: Shape details:', surfaceShapes.map(shape => ({
        type: shape.type,
        coordinates: shape.type === 'circle' ? { x0: shape.x0, y0: shape.y0, x1: shape.x1, y1: shape.y1 } :
                    shape.type === 'rect' ? { x0: shape.x0, y0: shape.y0, x1: shape.x1, y1: shape.y1 } : 'unknown',
        fillcolor: shape.fillcolor,
        layer: shape.layer
      })));
    } else {
      console.warn('🎨 BACKGROUND: No surface shapes generated - background will be empty');
    }

    return {
      data: traces,
      layout: {
        xaxis: {
          title: 'Y Position (mm)', // This is actually Y coordinate from 3D space
          color: '#ccc',
          gridcolor: '#444',
          showgrid: true,
          zeroline: true,
          zerolinecolor: '#666'
        },
        yaxis: {
          title: 'Z Position (mm)', // This is actually Z coordinate from 3D space
          color: '#ccc',
          gridcolor: '#444',
          showgrid: true,
          zeroline: true,
          zerolinecolor: '#666',
          scaleanchor: 'x', // Equal aspect ratio - Y axis anchored to X axis
          scaleratio: 1,    // 1:1 aspect ratio
          constrain: 'domain' // Robust equal scaling constraint
        },
        plot_bgcolor: '#1e1e1e',
        paper_bgcolor: '#1e1e1e',
        font: { color: '#ccc' },
        showlegend: false, // Hide legend as requested
        margin: { l: 60, r: 80, t: 40, b: 50 },
        shapes: surfaceShapes, // Add surface cross-section shape
        autosize: true, // Let plot size to container
        // Enforce strict aspect ratio maintenance
        dragmode: 'pan', // Prevent zoom distortion
        selectdirection: 'any'
      }
    };
  };

  // Create multiple plots for Spot Diagram (grouped by lid)
  const createSpotDiagramPlots = (data: IntersectionPoint[]) => {
    if (data.length === 0) {
      return createHitMapPlot(data); // Fallback to hit map layout for no data
    }

    console.log('🎯 Spot Diagram: Processing', data.length, 'intersection points');

    // Group by light ID (lid) first to see what we have
    const lightGroups = new Map<number, IntersectionPoint[]>();
    data.forEach(point => {
      const lid = Math.floor(point.lightId); // Use base light ID
      if (!lightGroups.has(lid)) {
        lightGroups.set(lid, []);
      }
      lightGroups.get(lid)!.push(point);
    });

    console.log('🎯 Spot Diagram: Found', lightGroups.size, 'light sources:', Array.from(lightGroups.keys()));

    // Instead of limiting to specific light sources, show ALL of them combined like the hit map
    // Group by wavelength across ALL light sources
    const wavelengthGroups = new Map<number, IntersectionPoint[]>();
    data.forEach(point => {
      if (!wavelengthGroups.has(point.wavelength)) {
        wavelengthGroups.set(point.wavelength, []);
      }
      wavelengthGroups.get(point.wavelength)!.push(point);
    });

    console.log('🎯 Spot Diagram: Creating traces for wavelengths:', Array.from(wavelengthGroups.keys()));

    const traces = Array.from(wavelengthGroups.entries()).map(([wavelength, wavePoints]) => ({
      x: wavePoints.map(p => p.y),
      y: wavePoints.map(p => p.z),
      type: 'scatter' as const,
      mode: 'markers' as const,
      marker: {
        color: getWavelengthColor(wavelength),
        size: 6,
        opacity: 0.8
      },
      name: `${wavelength}nm (${wavePoints.length} pts)`,
      hovertemplate: `Y: %{x:.3f}mm<br>Z: %{y:.3f}mm<br>λ: ${wavelength}nm<extra></extra>`
    }));

    return {
      data: traces,
      layout: {
        xaxis: {
          title: 'Y Position (mm)',
          color: '#ccc',
          gridcolor: '#444',
          showgrid: true,
          zeroline: true,
          zerolinecolor: '#666'
        },
        yaxis: {
          title: 'Z Position (mm)',
          color: '#ccc',
          gridcolor: '#444',
          showgrid: true,
          zeroline: true,
          zerolinecolor: '#666',
          scaleanchor: 'x',
          scaleratio: 1,
          constrain: 'domain' // Robust equal scaling constraint
        },
        plot_bgcolor: '#1e1e1e',
        paper_bgcolor: '#1e1e1e',
        font: { color: '#ccc' },
        showlegend: false,
        margin: { l: 60, r: 80, t: 40, b: 50 },
        shapes: getSurfaceShape(), // Add surface cross-section shape
        autosize: true, // Let plot size to container
        // Enforce strict aspect ratio maintenance
        dragmode: 'pan', // Prevent zoom distortion  
        selectdirection: 'any'
      }
    };
  };

  const updatePlot = () => {
    console.log('📊 PLOT UPDATE: Starting plot update...');
    if (!plotRef.current) {
      console.warn('📊 PLOT UPDATE: Plot ref not available, skipping update');
      return;
    }

    const data = getIntersectionData();
    console.log(`📊 PLOT UPDATE: Retrieved ${data.length} intersection points`);
    
    const plotConfig = analysisType === 'Hit Map' 
      ? createHitMapPlot(data)
      : createSpotDiagramPlots(data);
    
    console.log(`📊 PLOT UPDATE: Created plot config for ${analysisType}:`, {
      dataTraces: plotConfig.data.length,
      hasShapes: plotConfig.layout.shapes ? plotConfig.layout.shapes.length : 0,
      aspectRatio: {
        scaleanchor: plotConfig.layout.yaxis.scaleanchor,
        scaleratio: plotConfig.layout.yaxis.scaleratio,
        constrain: plotConfig.layout.yaxis.constrain
      }
    });

    const config = {
      displayModeBar: false,
      responsive: true,
      doubleClick: 'reset',
      showTips: false
    };

    console.log('⚖️ AXES SETTING: Enforcing equal axes - Y axis (plotly Y) anchored to X axis (plotly X) with 1:1 ratio');

    if (plotlyInstanceRef.current) {
      console.log('📊 PLOT UPDATE: Updating existing plot with Plotly.react');
      Plotly.react(plotRef.current, plotConfig.data, plotConfig.layout, config);
    } else {
      console.log('📊 PLOT UPDATE: Creating new plot with Plotly.newPlot');
      Plotly.newPlot(plotRef.current, plotConfig.data, plotConfig.layout, config)
        .then((plot: any) => {
          plotlyInstanceRef.current = plot;
          console.log('📊 PLOT UPDATE: New plot created successfully');
          
          // Force equal axis constraints after plot creation
          setTimeout(() => {
            console.log('⚖️ AXES SETTING: Post-creation axis equality enforcement...');
            const axisUpdate = {
              'yaxis.scaleanchor': 'x',
              'yaxis.scaleratio': 1,
              'yaxis.constrain': 'domain',
              'xaxis.constrain': 'domain'
            };
            
            Plotly.relayout(plotRef.current, axisUpdate).then(() => {
              console.log('✅ AXES SETTING: Post-creation axis constraints applied successfully');
            }).catch((error: any) => {
              console.warn('⚠️ AXES SETTING: Error applying post-creation axis constraints:', error);
            });
          }, 100);
        });
    }
  };

  useEffect(() => {
    if (surfaceId) {
      updatePlot();
    }

    return () => {
      if (plotlyInstanceRef.current && plotRef.current) {
        try {
          Plotly.purge(plotRef.current);
          plotlyInstanceRef.current = null;
        } catch (error) {
          console.warn('Error cleaning up Plotly instance:', error);
          plotlyInstanceRef.current = null;
        }
      }
    };
  }, [surfaceId, analysisType, yamlContent]);

  // Handle window resize with robust aspect ratio enforcement
  useEffect(() => {
    const handleResize = () => {
      console.log('⚖️ RESIZE: Window resize detected, enforcing equal axes...');
      if (plotlyInstanceRef.current && plotRef.current) {
        // First resize the plot
        Plotly.Plots.resize(plotRef.current);
        console.log('⚖️ RESIZE: Plot resized, now re-enforcing aspect ratio constraints');
        
        // Then re-enforce aspect ratio constraints with additional safeguards
        const update = {
          'yaxis.scaleanchor': 'x',
          'yaxis.scaleratio': 1,
          'yaxis.constrain': 'domain',
          // Additional constraints to prevent axis collapse
          'xaxis.fixedrange': false,
          'yaxis.fixedrange': false,
          'dragmode': 'pan'
        };
        
        console.log('⚖️ RESIZE: Applying aspect ratio update:', update);
        
        // Use a timeout to ensure the resize completes before enforcing constraints
        setTimeout(() => {
          Plotly.relayout(plotRef.current, update).then(() => {
            console.log('⚖️ RESIZE: Aspect ratio constraints applied successfully');
          }).catch((error: any) => {
            console.warn('⚖️ RESIZE: Error updating plot aspect ratio after resize:', error);
          });
        }, 100);
      } else {
        console.warn('⚖️ RESIZE: Plot instance not available for resize handling');
      }
    };

    // Add debouncing to prevent excessive relayout calls
    let resizeTimeout: NodeJS.Timeout;
    const debouncedHandleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(handleResize, 150);
    };

    window.addEventListener('resize', debouncedHandleResize);
    return () => {
      window.removeEventListener('resize', debouncedHandleResize);
      clearTimeout(resizeTimeout);
    };
  }, []);

  return (
    <div 
      ref={plotRef}
      style={{
        width: '100%',
        height: '100%',
        minHeight: '250px'
      }}
    />
  );
};
