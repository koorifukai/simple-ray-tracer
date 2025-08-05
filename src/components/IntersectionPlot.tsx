import React, { useEffect, useRef } from 'react';
import Plotly from 'plotly.js-dist-min';
import { RayIntersectionCollector } from './RayIntersectionCollector';

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
}

export const IntersectionPlot: React.FC<IntersectionPlotProps> = ({ 
  surfaceId, 
  analysisType, 
  yamlContent 
}) => {
  const plotRef = useRef<HTMLDivElement>(null);
  const plotlyInstanceRef = useRef<any>(null);

  // Get intersection data from collector
  const getIntersectionData = (): IntersectionPoint[] => {
    const collector = RayIntersectionCollector.getInstance();
    const surfaceData = collector.getSurfaceIntersectionData(surfaceId);
    
    if (!surfaceData || surfaceData.intersectionPoints.length === 0) {
      return [];
    }
    
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

  // Color map for wavelengths
  const getWavelengthColor = (wavelength: number): string => {
    switch (wavelength) {
      case 633: return '#ff4444'; // Red
      case 532: return '#44ff44'; // Green  
      case 488: return '#4444ff'; // Blue
      case 587: return '#ffff44'; // Yellow
      case 656: return '#ff6644'; // Deep Red
      case 486: return '#4466ff'; // Deep Blue
      default: return '#ffffff'; // White for unknown wavelengths
    }
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

    // Group by wavelength for hit map
    const wavelengthGroups = new Map<number, IntersectionPoint[]>();
    data.forEach(point => {
      if (!wavelengthGroups.has(point.wavelength)) {
        wavelengthGroups.set(point.wavelength, []);
      }
      wavelengthGroups.get(point.wavelength)!.push(point);
    });

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
      name: `${wavelength}nm`,
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
        margin: { l: 60, r: 80, t: 40, b: 50 }
      }
    };
  };

  // Create multiple plots for Spot Diagram (grouped by lid)
  const createSpotDiagramPlots = (data: IntersectionPoint[]) => {
    if (data.length === 0) {
      return createHitMapPlot(data); // Fallback to hit map layout for no data
    }

    // Group by light ID (lid)
    const lightGroups = new Map<number, IntersectionPoint[]>();
    data.forEach(point => {
      const lid = Math.floor(point.lightId); // Use base light ID
      if (!lightGroups.has(lid)) {
        lightGroups.set(lid, []);
      }
      lightGroups.get(lid)!.push(point);
    });

    // Take first 3 light sources only
    const lightIds = Array.from(lightGroups.keys()).sort().slice(0, 3);
    const numPlots = lightIds.length;

    if (numPlots === 1) {
      // Single plot case
      const lightId = lightIds[0];
      const points = lightGroups.get(lightId)!;
      
      // Group by wavelength within this light source
      const wavelengthGroups = new Map<number, IntersectionPoint[]>();
      points.forEach(point => {
        if (!wavelengthGroups.has(point.wavelength)) {
          wavelengthGroups.set(point.wavelength, []);
        }
        wavelengthGroups.get(point.wavelength)!.push(point);
      });

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
        name: `${wavelength}nm`,
        hovertemplate: `Y: %{x:.3f}mm<br>Z: %{y:.3f}mm<br>λ: ${wavelength}nm<extra></extra>`
      }));

      return {
        data: traces,
        layout: {
          title: {
            text: `${getSurfaceName()} - Spot Diagram (Light ${lightId})`,
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
          margin: { l: 60, r: 80, t: 40, b: 50 }
        }
      };
    }

    // Multiple plots case - create subplot layout
    // For now, return the first light source data
    // TODO: Implement proper subplot layout for multiple light sources
    const firstLightId = lightIds[0];
    const firstLightPoints = lightGroups.get(firstLightId)!;
    
    return createSpotDiagramPlots(firstLightPoints);
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
      if (plotlyInstanceRef.current) {
        Plotly.purge(plotRef.current!);
        plotlyInstanceRef.current = null;
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
