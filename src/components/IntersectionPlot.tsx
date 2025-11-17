import React, { useEffect, useRef } from 'react';
import Plotly from 'plotly.js-dist-min';
import { RayIntersectionCollector, type RayIntersectionPoint, type SurfaceIntersectionData } from './RayIntersectionCollector';
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
    
    if (analysisType === 'Spot Diagram') {
      // For spot diagram, surfaceId contains a specific light ID (original or shadow)
      const selectedLightId = parseFloat(surfaceId);
      // Creating spot diagram for selected light
      
      // Find all surfaces that this specific light ID intersects
      const availableSurfaces = collector.getAvailableSurfaces();

      
      const surfacesWithLight: {surfaceId: string, points: any[]}[] = [];
      
      availableSurfaces.forEach(surface => {
        const surfaceData = collector.getSurfaceIntersectionData(surface.id);
        if (surfaceData && surfaceData.intersectionPoints) {
          const allPoints = surfaceData.intersectionPoints;
          const lightPoints = allPoints.filter(point => 
            Math.abs(point.lightId - selectedLightId) < 1e-10
          );
          
          if (lightPoints.length > 0) {
            surfacesWithLight.push({
              surfaceId: surface.id,
              points: lightPoints
            });
          }
        }
      });
      
      // Light intersects multiple surfaces
      
      if (surfacesWithLight.length === 0) {
        return [];
      }
      
      const lastSurface = surfacesWithLight[surfacesWithLight.length - 1];
      
      const spotData = lastSurface.points.map(hit => ({
        y: hit.crossSectionY,
        z: hit.crossSectionZ,
        wavelength: hit.wavelength,
        intensity: hit.intensity,
        rayId: hit.rayId,
        lightId: hit.lightId
      }));
        
      return spotData;
      
    } else {
      // Original logic for hit map
      const surfaceData = collector.getSurfaceIntersectionData(surfaceId);
      
      if (!surfaceData || surfaceData.intersectionPoints.length === 0) {
        // No intersection data available
        return [];
      }
      
      // Found intersection points for surface
      
      return surfaceData.intersectionPoints.map(hit => ({
        y: hit.crossSectionY,
        z: hit.crossSectionZ,
        wavelength: hit.wavelength,
        intensity: hit.intensity,
        rayId: hit.rayId,
        lightId: hit.lightId
      }));
    }
  };

  // Generate 2D surface cross-section geometry for background rendering
  const generateSurfaceGeometry = (surface: any): any[] => {
    const shapes: any[] = [];
    const surfaceColor = 'rgba(255,255,255,0.2)'; // Standard background color
    
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
    }
    
    return shapes;
  };

  // Get surface from intersection data and generate 2D cross-section
  const getSurfaceShape = (): any[] => {
    // Check if this is a numerical ID (indicates we're using the unified system)
    const isNumericalId = /^\d+$/.test(surfaceId);
    
    // PRIORITY 1: Get surface from intersection data using numerical ID lookup
    const collector = RayIntersectionCollector.getInstance();
    const surfaceData = collector.getSurfaceIntersectionData(surfaceId);
    
    if (surfaceData && surfaceData.surface) {
      const surface = surfaceData.surface;
      
      // Generate 2D cross-section geometry using the surface object
      return generateSurfaceGeometry(surface);
    }
    
    // If we're using numerical IDs but no intersection data yet, wait for ray tracing to complete
    if (isNumericalId) {
      return []; // Return empty shapes, don't try YAML fallback for numerical IDs
    }
    
    // PRIORITY 2: Fallback to YAML lookup (for fallback cases when no intersection data)
    
    let system: any = systemData;
    
    // If no system data provided, try to parse YAML
    if (!system && yamlContent) {
      try {
        if (typeof (window as any).jsyaml !== 'undefined') {
          system = (window as any).jsyaml.load(yamlContent);
        } else {
          console.warn('js-yaml not available in window, cannot parse YAML');
          return [];
        }
      } catch (error) {
        console.error('Failed to parse YAML:', error);
        return [];
      }
    }

    if (!system) {
      return [];
    }

    // YAML structure lookup for assemblies with direct surface properties
    let targetSurface: any = null;
    
    // If surfaceId is a numerical ID (like "4"), we need to map it back to surface names
    let surfaceKeyToFind = surfaceId;
    
    if (isNumericalId) {
      // Build a mapping of numerical IDs to surface names
      const surfaceMapping: {[key: string]: string} = {};
      let currentNumericalId = 0;
      
      // Map assembly surfaces (s1, s2, s3, etc.)
      if (system.assemblies && Array.isArray(system.assemblies)) {
        for (const assembly of system.assemblies) {
          Object.keys(assembly).forEach(surfaceKey => {
            if (surfaceKey !== 'aid') {
              surfaceMapping[currentNumericalId.toString()] = surfaceKey;
              currentNumericalId++;
            }
          });
        }
      }
      
      // Map standalone surfaces (focus, stop, etc.)
      if (system.optical_trains && Array.isArray(system.optical_trains)) {
        system.optical_trains.forEach((trainGroup: any) => {
          Object.entries(trainGroup).forEach(([trainName, trainData]: [string, any]) => {
            if (trainData.sid !== undefined) {
              surfaceMapping[currentNumericalId.toString()] = trainName;
              currentNumericalId++;
            }
          });
        });
      }
      
      surfaceKeyToFind = surfaceMapping[surfaceId];
      
      if (!surfaceKeyToFind) {
        return [];
      }
    }

    // Method 1: Look in assemblies (each assembly has direct surface properties s1, s2, etc.)
    if (system.assemblies && Array.isArray(system.assemblies)) {
      for (const assembly of system.assemblies) {
        if (assembly[surfaceKeyToFind]) {
          targetSurface = assembly[surfaceKeyToFind];
          break;
        }
      }
    }

    // Method 2: Look in standalone surfaces (surfaces array with named objects)
    if (!targetSurface && system.surfaces && Array.isArray(system.surfaces)) {
      for (const surfaceGroup of system.surfaces) {
        if (surfaceGroup[surfaceKeyToFind]) {
          targetSurface = surfaceGroup[surfaceKeyToFind];
          break;
        }
      }
    }

    if (!targetSurface) {
      return [];
    }

    // Generate 2D cross-section geometry using the found surface
    return generateSurfaceGeometry(targetSurface);
  };

  // Create hit map plot
  const createHitMapPlot = (data: IntersectionPoint[]) => {
    if (data.length === 0) {
      // No intersection data, creating empty plot
      const surfaceShapes = getSurfaceShape();
      
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
            zerolinecolor: '#666',
            tickmode: 'auto', // Automatic tick spacing
            tick0: 0,         // Start ticks at zero
            dtick: 5          // 5mm tick spacing for optical measurements
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
            constrain: 'domain', // Robust equal scaling constraint
            tickmode: 'auto', // Automatic tick spacing
            tick0: 0,         // Start ticks at zero
            dtick: 5          // 5mm tick spacing for optical measurements
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

    const traces = Array.from(wavelengthGroups.entries()).map(([wavelength, points]) => {
      // Creating trace for wavelength
      return {
        x: points.map(p => -p.y), // COORDINATE FIX: Mirror horizontal coordinates to match optical convention
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

    // Traces created for plotting
    
    // Get surface shapes for background
    const surfaceShapes = getSurfaceShape();

    return {
      data: traces,
      layout: {
        xaxis: {
          title: 'Y Position (mm)', // This is actually Y coordinate from 3D space
          color: '#ccc',
          gridcolor: '#444',
          showgrid: true,
          zeroline: true,
          zerolinecolor: '#666',
          tickmode: 'auto', // Automatic tick spacing
          tick0: 0,         // Start ticks at zero
          dtick: 5          // 5mm tick spacing for optical measurements
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
          constrain: 'domain', // Robust equal scaling constraint
          tickmode: 'auto', // Automatic tick spacing
          tick0: 0,         // Start ticks at zero
          dtick: 5          // 5mm tick spacing for optical measurements
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

  // Calculate global spot diagram bounds for consistent scaling across all light sources
  // EUREKA Approach: Find the maximum extent of any individual light source
  const getGlobalSpotDiagramBounds = () => {
    const collector = RayIntersectionCollector.getInstance();
    const availableSurfaces = collector.getAvailableSurfaces();
    
    if (availableSurfaces.length === 0) {
      return { yMin: -0.3, yMax: 0.3, zMin: -0.3, zMax: 0.3, center: { y: 0, z: 0 } };
    }
    
    // Find the actual last surface in the optical train (same logic as spot diagram)
    let lastSurfaceData: SurfaceIntersectionData | undefined = undefined;
    
    // Use the last surface in optical train sequence (highest numerical ID)
    for (let i = availableSurfaces.length - 1; i >= 0; i--) {
      const surface = availableSurfaces[i];
      const surfaceData = collector.getSurfaceIntersectionData(surface.id);
      if (surfaceData && surfaceData.intersectionPoints.length > 0) {
        lastSurfaceData = surfaceData;
        // Using surface as last surface
        break;
      }
    }
    
    if (!lastSurfaceData) {
      // No surface data found, using default view
      return { yMin: -0.3, yMax: 0.3, zMin: -0.3, zMax: 0.3, center: { y: 0, z: 0 } };
    }
    
    const validSurfaceData: SurfaceIntersectionData = lastSurfaceData;
    
    if (validSurfaceData.intersectionPoints.length === 0) {
      // No intersection points found, using default view
      return { yMin: -0.3, yMax: 0.3, zMin: -0.3, zMax: 0.3, center: { y: 0, z: 0 } };
    }
    
    // EUREKA APPROACH: Group points by light ID and find maximum extent of any light
    const allPoints: RayIntersectionPoint[] = validSurfaceData.intersectionPoints;
    // Analyzing intersection points on final surface
    
    // Helper function to extract base light ID for new 1000+ system
    const getBaseLightId = (lightId: number): number => {
      if (lightId >= 1000) {
        // CORRECTED: Extract ancestral LID from decimal part
        const fractionalPart = lightId - Math.floor(lightId);
        return Math.round(fractionalPart * 10); // 0.1 → 1, 0.2 → 2, etc.
      } else {
        return Math.floor(lightId);
      }
    };
    
    // Group intersection points by light ID using new 1000+ system
    const lightGroups = new Map<number, RayIntersectionPoint[]>();
    allPoints.forEach(point => {
      const baseLightId = getBaseLightId(point.lightId);
      if (!lightGroups.has(baseLightId)) {
        lightGroups.set(baseLightId, []);
      }
      lightGroups.get(baseLightId)!.push(point);
    });
    
    // Found light sources
    
    // Calculate extent (size) for each light source
    let maxLightExtent = 0;
    const lightExtents: {lightId: number, yRange: number, zRange: number, maxExtent: number}[] = [];
    
    lightGroups.forEach((points, lightId) => {
      const lightY = points.map(p => p.crossSectionY);
      const lightZ = points.map(p => p.crossSectionZ);
      
      const minY = Math.min(...lightY);
      const maxY = Math.max(...lightY);
      const minZ = Math.min(...lightZ);
      const maxZ = Math.max(...lightZ);
      
      const yRange = maxY - minY;
      const zRange = maxZ - minZ;
      const lightExtent = Math.max(yRange, zRange);
      
      lightExtents.push({ lightId, yRange, zRange, maxExtent: lightExtent });
      
      if (lightExtent > maxLightExtent) {
        maxLightExtent = lightExtent;
      }
      
      // Light extent calculated
    });
    
    // Handle edge case: if all lights have zero extent
    if (maxLightExtent === 0) {
      // All lights have zero extent, using default view
      return { yMin: -0.3, yMax: 0.3, zMin: -0.3, zMax: 0.3, center: { y: 0, z: 0 } };
    }
    
    // Use 1.2x padding around the maximum light extent
    const paddedRange = maxLightExtent * 1.2;
    
    const bounds = {
      yMin: -paddedRange / 2,
      yMax: paddedRange / 2,
      zMin: -paddedRange / 2,
      zMax: paddedRange / 2,
      center: { y: 0, z: 0 }
    };
    
    return bounds;
  };

  // Create spot diagram plot (pure spot pattern, no geometry)
  const createSpotDiagram = (data: IntersectionPoint[]) => {
    if (data.length === 0) {
      return {
        data: [{
          x: [],
          y: [],
          type: 'scatter',
          mode: 'markers',
          name: 'No Data'
        }],
        layout: {
          xaxis: {
            title: 'Y Position (mm)', 
            range: [-0.3, 0.3],
            constrain: 'domain',
            color: '#ccc' 
          },
          yaxis: { 
            title: 'Z Position (mm)', 
            range: [-0.3, 0.3],
            constrain: 'domain',
            color: '#ccc',
            scaleanchor: 'x',
            scaleratio: 1 
          },
          plot_bgcolor: '#1e1e1e',
          paper_bgcolor: '#1e1e1e',
          font: { color: '#ccc' },
          showlegend: false,
          margin: { l: 60, r: 80, t: 40, b: 50 },
          autosize: true,
          dragmode: 'pan'
        }
      };
    }

    // Group points by wavelength for color coding
    const wavelengthGroups = new Map<number, IntersectionPoint[]>();
    data.forEach(point => {
      if (!wavelengthGroups.has(point.wavelength)) {
        wavelengthGroups.set(point.wavelength, []);
      }
      wavelengthGroups.get(point.wavelength)!.push(point);
    });

    // Create traces for each wavelength
    const traces: any[] = [];
    
    wavelengthGroups.forEach((points, wavelength) => {
      const color = getWavelengthColor(wavelength);
      const xValues = points.map(p => -p.y);
      const yValues = points.map(p => p.z);
      
      traces.push({
        x: xValues,
        y: yValues,
        type: 'scatter',
        mode: 'markers',
        marker: {
          color: color,
          size: 6,
          opacity: 0.7
        },
        name: `${wavelength}nm`,
        hovertemplate: 
          '<b>Spot Position</b><br>' +
          'Y: %{x:.3f} mm<br>' +
          'Z: %{y:.3f} mm<br>' +
          'Wavelength: ' + wavelength + 'nm<br>' +
          '<extra></extra>',
        showlegend: wavelengthGroups.size > 1 // Only show legend if multiple wavelengths
      });
    });

    // Use global bounds for consistent scaling across all light sources
    const globalBounds = getGlobalSpotDiagramBounds();
    
    // For individual light centering, calculate the center of THIS light's data
    const allFlippedY = data.map(p => -p.y); // Flip Y coordinates to match plotting
    const allZ = data.map(p => p.z);
    const lightYCenter = allFlippedY.length > 0 ? (Math.min(...allFlippedY) + Math.max(...allFlippedY)) / 2 : globalBounds.center.y;
    const lightZCenter = allZ.length > 0 ? (Math.min(...allZ) + Math.max(...allZ)) / 2 : globalBounds.center.z;
    
    // Use global scale but center on this light's data
    const rangeSize = globalBounds.yMax - globalBounds.yMin;
    const yMin = lightYCenter - rangeSize / 2;
    const yMax = lightYCenter + rangeSize / 2;
    const zMin = lightZCenter - rangeSize / 2;
    const zMax = lightZCenter + rangeSize / 2;

    return {
      data: traces,
      layout: {
        xaxis: { 
          title: 'Y Position (mm)',
          range: [yMin, yMax],
          constrain: 'domain',
          color: '#ccc'
        },
        yaxis: { 
          title: 'Z Position (mm)',
          range: [zMin, zMax],
          constrain: 'domain',
          color: '#ccc',
          scaleanchor: 'x', // Ensure equal scaling with x-axis
          scaleratio: 1
        },
        plot_bgcolor: '#1e1e1e',
        paper_bgcolor: '#1e1e1e',
        font: { color: '#ccc' },
        showlegend: wavelengthGroups.size > 1,
        margin: { l: 60, r: 80, t: 40, b: 50 },
        autosize: true,
        dragmode: 'pan',
        selectdirection: 'any'
      }
    };
  };

  // Create multiple plots for Spot Diagram (grouped by lid) - UNUSED (Spot Diagram kept blank)
  // const createSpotDiagramPlots = (data: IntersectionPoint[]) => {
  //   if (data.length === 0) {
  //     return createHitMapPlot(data); // Fallback to hit map layout for no data
  //   }

  //   console.log('🎯 Spot Diagram: Processing', data.length, 'intersection points');

  //   // Group by light ID (lid) first to see what we have
  //   const lightGroups = new Map<number, IntersectionPoint[]>();
  //   data.forEach(point => {
  //     const lid = Math.floor(point.lightId); // Use base light ID
  //     if (!lightGroups.has(lid)) {
  //       lightGroups.set(lid, []);
  //     }
  //     lightGroups.get(lid)!.push(point);
  //   });

  //   console.log('🎯 Spot Diagram: Found', lightGroups.size, 'light sources:', Array.from(lightGroups.keys()));

  //   // For spot diagram, show only the first light source (lid = 1)
  //   const firstLightId = Math.min(...Array.from(lightGroups.keys()));
  //   const spotData = lightGroups.get(firstLightId) || [];
    
  //   console.log(`🎯 Spot Diagram: Using light source ${firstLightId} with ${spotData.length} points`);

  //   // Group by wavelength within the selected light source
  //   const wavelengthGroups = new Map<number, IntersectionPoint[]>();
  //   spotData.forEach(point => {
  //     if (!wavelengthGroups.has(point.wavelength)) {
  //       wavelengthGroups.set(point.wavelength, []);
  //     }
  //     wavelengthGroups.get(point.wavelength)!.push(point);
  //   });

  //   console.log('🎯 Spot Diagram: Creating traces for wavelengths:', Array.from(wavelengthGroups.keys()));

  //   const traces = Array.from(wavelengthGroups.entries()).map(([wavelength, wavePoints]) => ({
  //     x: wavePoints.map(p => -p.y), // COORDINATE FIX: Mirror horizontal coordinates to match optical convention
  //     y: wavePoints.map(p => p.z),
  //     type: 'scatter' as const,
  //     mode: 'markers' as const,
  //     marker: {
  //       color: getWavelengthColor(wavelength),
  //       size: 6,
  //       opacity: 0.8
  //     },
  //     name: `${wavelength}nm (${wavePoints.length} pts)`,
  //     hovertemplate: `Y: %{x:.3f}mm<br>Z: %{y:.3f}mm<br>λ: ${wavelength}nm<extra></extra>`
  //   }));

  //   return {
  //     data: traces,
  //     layout: {
  //       xaxis: {
  //         title: 'Y Position (mm)',
  //         color: '#ccc',
  //         gridcolor: '#444',
  //         showgrid: true,
  //         zeroline: true,
  //         zerolinecolor: '#666',
  //         tickmode: 'auto', // Automatic tick spacing
  //         tick0: 0,         // Start ticks at zero
  //         dtick: 5          // 5mm tick spacing for optical measurements
  //       },
  //       yaxis: {
  //         title: 'Z Position (mm)',
  //         color: '#ccc',
  //         gridcolor: '#444',
  //         showgrid: true,
  //         zeroline: true,
  //         zerolinecolor: '#666',
  //         scaleanchor: 'x',
  //         scaleratio: 1,
  //         constrain: 'domain', // Robust equal scaling constraint
  //         tickmode: 'auto', // Automatic tick spacing
  //         tick0: 0,         // Start ticks at zero
  //         dtick: 5          // 5mm tick spacing for optical measurements
  //       },
  //       plot_bgcolor: '#1e1e1e',
  //       paper_bgcolor: '#1e1e1e',
  //       font: { color: '#ccc' },
  //       showlegend: false,
  //       margin: { l: 60, r: 80, t: 40, b: 50 },
  //       shapes: getSurfaceShape(), // Add surface cross-section shape
  //       autosize: true, // Let plot size to container
  //       // Enforce strict aspect ratio maintenance
  //       dragmode: 'pan', // Prevent zoom distortion  
  //       selectdirection: 'any'
  //     }
  //   };
  // };

  const updatePlot = () => {
    if (!plotRef.current) {
      return;
    }

    const data = getIntersectionData();

    let plotConfig: any;

    if (analysisType === 'Hit Map') {
      plotConfig = createHitMapPlot(data);
    } else {
      plotConfig = createSpotDiagram(data);
    }

    // Create or update plot
    if (!plotlyInstanceRef.current) {
      Plotly.newPlot(plotRef.current, plotConfig.data, plotConfig.layout, {
        responsive: true,
        displayModeBar: true,
        modeBarButtonsToRemove: ['select2d', 'lasso2d', 'autoScale2d'],
        modeBarButtonsToAdd: ['resetScale2d']
      }).then((plotDiv: any) => {
        plotlyInstanceRef.current = plotDiv;
        
        // Force equal axis scaling after creation
        setTimeout(() => {
          if (plotRef.current && plotConfig.layout.yaxis) {
            Plotly.relayout(plotRef.current, {
              'yaxis.scaleanchor': plotConfig.layout.yaxis.scaleanchor,
              'yaxis.scaleratio': plotConfig.layout.yaxis.scaleratio,
              'yaxis.constrain': plotConfig.layout.yaxis.constrain,
              'xaxis.fixedrange': false,
              'yaxis.fixedrange': false,
              'dragmode': 'pan'
            });
          }
        }, 100);
      });
    } else {
      Plotly.react(plotRef.current, plotConfig.data, plotConfig.layout).then(() => {
      });
    }
  };

  useEffect(() => {
    updatePlot();
  }, [surfaceId, analysisType, yamlContent, systemData]);

  useEffect(() => {
    const handleRayTraceComplete = () => {
      setTimeout(() => updatePlot(), 100); // Small delay to ensure data collection is complete
    };

    // Listen for ray trace completion events
    window.addEventListener('rayTraceComplete', handleRayTraceComplete);

    return () => {
      window.removeEventListener('rayTraceComplete', handleRayTraceComplete);
    };
  }, []);

  return (
    <div 
      ref={plotRef} 
      style={{ 
        width: '100%', 
        height: '100%', 
        minHeight: '400px',
        backgroundColor: '#1e1e1e'
      }}
    />
  );
};
