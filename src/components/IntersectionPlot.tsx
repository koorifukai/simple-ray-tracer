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
    
    if (shape === 'spherical' || shape === 'plano') {
      // Spherical and plano surfaces: render as circle using semidia
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
      
      console.log(`✅ Generated circular cross-section: radius=${radius}mm`);
      
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
    let system: any = systemData;
    
    // If no system data provided, try to parse YAML
    if (!system && yamlContent) {
      try {
        if (typeof (window as any).jsyaml !== 'undefined') {
          system = (window as any).jsyaml.load(yamlContent);
        } else {
          console.warn('YAML parser not available and no system data provided, skipping surface shape');
          return [];
        }
      } catch (error) {
        console.warn('Could not parse YAML for surface shape:', error);
        return [];
      }
    }
    
    if (!system || !surfaceId) {
      console.warn('No system data available for surface shape');
      return [];
    }
    
    // Find the surface in the system
    let targetSurface: any = null;
    
    console.log('🔍 Looking for surface:', surfaceId);
    console.log('🔍 System structure:', {
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
        
        console.log('🔍 Assembly surface lookup:', { assemblyId, surfaceKey });
        
        if (system.assemblies && Array.isArray(system.assemblies)) {
          const assembly = system.assemblies.find((a: any) => a.aid?.toString() === assemblyId);
          if (assembly && assembly[surfaceKey]) {
            targetSurface = assembly[surfaceKey];
            console.log('✅ Found assembly surface:', targetSurface);
          }
        }
      }
    } else if (surfaceId.startsWith('surface_')) {
      // Format: surface_focus, surface_stop, etc.
      const surfaceKey = surfaceId.replace('surface_', '');
      
      console.log('🔍 Standalone surface lookup:', { surfaceKey });
      
      if (system.surfaces && Array.isArray(system.surfaces)) {
        for (const surfaceGroup of system.surfaces) {
          if (surfaceGroup[surfaceKey]) {
            targetSurface = surfaceGroup[surfaceKey];
            console.log('✅ Found standalone surface:', targetSurface);
            break;
          }
        }
      }
    } else {
      // Legacy format handling - might be direct surface ID
      console.log('🔍 Legacy surface ID format - not implemented');
    }
    
    if (!targetSurface) return [];
    
    // Use the new 2D surface geometry generator
    return generateSurfaceGeometry(targetSurface);
  };

  // Create single plot for Hit Map
  const createHitMapPlot = (data: IntersectionPoint[]) => {
    if (data.length === 0) {
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
            zerolinecolor: '#666'
          },
          plot_bgcolor: '#1e1e1e',
          paper_bgcolor: '#1e1e1e',
          font: { color: '#ccc' },
          showlegend: false,
          margin: { l: 60, r: 20, t: 40, b: 50 }
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

    console.log(`📊 Hit Map: Processing ${data.length} points from ${new Set(data.map(p => Math.floor(p.lightId))).size} light sources`);
    console.log(`📊 Hit Map: Wavelength groups:`, Array.from(wavelengthGroups.keys()));

    const traces = Array.from(wavelengthGroups.entries()).map(([wavelength, points]) => ({
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
          scaleanchor: 'x', // Equal aspect ratio
          scaleratio: 1,
          constrain: 'domain' // Robust equal scaling constraint
        },
        plot_bgcolor: '#1e1e1e',
        paper_bgcolor: '#1e1e1e',
        font: { color: '#ccc' },
        margin: { l: 60, r: 80, t: 40, b: 50 },
        shapes: getSurfaceShape(), // Add surface cross-section shape
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
    if (!plotRef.current) return;

    const data = getIntersectionData();
    const plotConfig = analysisType === 'Hit Map' 
      ? createHitMapPlot(data)
      : createSpotDiagramPlots(data);

    const config = {
      displayModeBar: false,
      responsive: true,
      doubleClick: 'reset',
      showTips: false
    };

    if (plotlyInstanceRef.current) {
      Plotly.react(plotRef.current, plotConfig.data, plotConfig.layout, config);
    } else {
      Plotly.newPlot(plotRef.current, plotConfig.data, plotConfig.layout, config)
        .then((plot: any) => {
          plotlyInstanceRef.current = plot;
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
      if (plotlyInstanceRef.current && plotRef.current) {
        // First resize the plot
        Plotly.Plots.resize(plotRef.current);
        
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
        
        // Use a timeout to ensure the resize completes before enforcing constraints
        setTimeout(() => {
          Plotly.relayout(plotRef.current, update).catch((error: any) => {
            console.warn('Error updating plot aspect ratio after resize:', error);
          });
        }, 100);
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
