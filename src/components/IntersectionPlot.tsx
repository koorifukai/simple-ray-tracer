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

  // Get surface name for title
  const getSurfaceName = (): string => {
    const collector = RayIntersectionCollector.getInstance();
    const surfaceData = collector.getSurfaceIntersectionData(surfaceId);
    
    if (surfaceData) {
      return surfaceData.assemblyName 
        ? `${surfaceData.assemblyName}: ${surfaceData.surfaceName}`
        : surfaceData.surfaceName;
    }
    
    return surfaceId;
  };

  // Get surface shape for cross-section background
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
    let surfaceColor = 'rgba(255,255,255,0.1)'; // Default
    
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
            // Use consistent colors from main 3D plot
            const colors = ['rgba(255,0,0,0.15)', 'rgba(0,255,0,0.15)', 'rgba(0,0,255,0.15)', 
                           'rgba(255,255,0,0.15)', 'rgba(255,0,255,0.15)', 'rgba(0,255,255,0.15)'];
            const assemblyIndex = parseInt(assemblyId) || 0;
            surfaceColor = colors[assemblyIndex % colors.length];
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
            surfaceColor = 'rgba(255,165,0,0.15)'; // Orange for standalone
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
    
    // Create shape based on surface type
    const shapes: any[] = [];
    
    // Get surface properties - use semidia from YAML for radius
    const diameter = targetSurface.semidia ? targetSurface.semidia * 2 : (targetSurface.diameter || 50);
    const radius = diameter / 2;
    
    console.log('🎨 Surface shape debug:', {
      surfaceId,
      shape: targetSurface.shape,
      semidia: targetSurface.semidia,
      diameter,
      radius,
      width: targetSurface.width,
      height: targetSurface.height
    });
    
    if (targetSurface.shape === 'spherical' || targetSurface.shape === 'plano' || !targetSurface.shape) {
      // Draw circular aperture for spherical and plano surfaces
      shapes.push({
        type: 'circle',
        xref: 'x',
        yref: 'y',
        x0: -radius,
        y0: -radius,
        x1: radius,
        y1: radius,
        line: {
          color: surfaceColor.replace('0.15', '0.4'), // Slightly more opaque border
          width: 2
        },
        fillcolor: surfaceColor,
        layer: 'below'
      });
    } else if (targetSurface.width && targetSurface.height) {
      // Draw rectangular aperture for surfaces with width/height
      const width = targetSurface.width;
      const height = targetSurface.height;
      shapes.push({
        type: 'rect',
        xref: 'x',
        yref: 'y',
        x0: -width/2,
        y0: -height/2,
        x1: width/2,
        y1: height/2,
        line: {
          color: surfaceColor.replace('0.15', '0.4'),
          width: 2
        },
        fillcolor: surfaceColor,
        layer: 'below'
      });
    }
    
    console.log('🎨 Generated shapes:', shapes);
    
    return shapes;
  };

  // Use the same wavelength color function as the main 3D plot
  // (imported from '../optical/wavelength')

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
          title: {
            text: `${getSurfaceName()} - No Intersection Data`,
            font: { color: '#ccc', size: 14 }
          },
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
    
    // Calculate coordinate bounds for centering (to create local coordinate system)
    const yCoords = data.map(p => p.y);
    const zCoords = data.map(p => p.z);
    const centerY = yCoords.length > 0 ? (Math.min(...yCoords) + Math.max(...yCoords)) / 2 : 0;
    const centerZ = zCoords.length > 0 ? (Math.min(...zCoords) + Math.max(...zCoords)) / 2 : 0;
    
    console.log(`📊 Coordinate transformation: center Y=${centerY.toFixed(3)}, center Z=${centerZ.toFixed(3)}`);

    const traces = Array.from(wavelengthGroups.entries()).map(([wavelength, points]) => ({
      x: points.map(p => p.y - centerY), // Convert to local coordinates
      y: points.map(p => p.z - centerZ), // Convert to local coordinates
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
        title: {
          text: `${getSurfaceName()} - Ray Intersection Map`,
          font: { color: '#ccc', size: 14 }
        },
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
          scaleratio: 1
        },
        plot_bgcolor: '#1e1e1e',
        paper_bgcolor: '#1e1e1e',
        font: { color: '#ccc' },
        showlegend: true,
        legend: {
          x: 1.02,
          y: 1,
          bgcolor: 'rgba(30,30,30,0.8)',
          bordercolor: '#666',
          borderwidth: 1
        },
        margin: { l: 60, r: 80, t: 40, b: 50 },
        shapes: getSurfaceShape() // Add surface cross-section shape
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
        title: {
          text: `${getSurfaceName()} - Spot Diagram (All Light Sources)`,
          font: { color: '#ccc', size: 14 }
        },
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
          scaleratio: 1
        },
        plot_bgcolor: '#1e1e1e',
        paper_bgcolor: '#1e1e1e',
        font: { color: '#ccc' },
        showlegend: true,
        legend: {
          x: 1.02,
          y: 1,
          bgcolor: 'rgba(30,30,30,0.8)',
          bordercolor: '#666',
          borderwidth: 1
        },
        margin: { l: 60, r: 80, t: 40, b: 50 },
        shapes: getSurfaceShape() // Add surface cross-section shape
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

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (plotlyInstanceRef.current) {
        Plotly.Plots.resize(plotRef.current!);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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
