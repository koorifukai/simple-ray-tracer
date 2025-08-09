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
      // For spot diagram, surfaceId is actually a light ID
      const lightId = parseInt(surfaceId);
      console.log(`📊 IntersectionPlot: Creating spot diagram for light ID: ${lightId}`);
      
      // Find all surfaces that this light intersects
      const availableSurfaces = collector.getAvailableSurfaces();
      const surfacesWithLight: {surfaceId: string, points: any[]}[] = [];
      
      availableSurfaces.forEach(surface => {
        const surfaceData = collector.getSurfaceIntersectionData(surface.id);
        if (surfaceData && surfaceData.intersectionPoints) {
          const lightPoints = surfaceData.intersectionPoints.filter(point => point.lightId === lightId);
          if (lightPoints.length > 0) {
            surfacesWithLight.push({
              surfaceId: surface.id,
              points: lightPoints
            });
          }
        }
      });
      
      console.log(`📊 IntersectionPlot: Light ${lightId} intersects ${surfacesWithLight.length} surfaces:`, 
        surfacesWithLight.map(s => s.surfaceId));
      
      if (surfacesWithLight.length === 0) {
        console.log(`📊 IntersectionPlot: No intersection data for light ${lightId}`);
        return [];
      }
      
      // Use the last surface (highest numerical ID or last in array)
      const lastSurface = surfacesWithLight[surfacesWithLight.length - 1];
      console.log(`📊 IntersectionPlot: Using last surface "${lastSurface.surfaceId}" with ${lastSurface.points.length} points for spot diagram`);
      
      return lastSurface.points.map(hit => ({
        y: hit.crossSectionY,
        z: hit.crossSectionZ,
        wavelength: hit.wavelength,
        intensity: hit.intensity,
        rayId: hit.rayId,
        lightId: hit.lightId
      }));
      
    } else {
      // Original logic for hit map
      console.log(`📊 IntersectionPlot: Requesting data for surface ID: "${surfaceId}"`);
      console.log(`📊 IntersectionPlot: Available surfaces in collector:`, collector.getAvailableSurfaces().map(s => ({
        id: s.id,
        numericalId: s.numericalId ?? 'undefined',
        name: s.name
      })));
      
      const surfaceData = collector.getSurfaceIntersectionData(surfaceId);
      
      console.log(`📊 IntersectionPlot: Surface data for "${surfaceId}":`, surfaceData);
      
      if (!surfaceData || surfaceData.intersectionPoints.length === 0) {
        console.log(`📊 IntersectionPlot: No intersection data available for surface "${surfaceId}"`);
        return [];
      }
      
      console.log(`📊 IntersectionPlot: Found ${surfaceData.intersectionPoints.length} intersection points for surface "${surfaceId}"`);
      
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

  // Get surface from intersection data and generate 2D cross-section
  const getSurfaceShape = (): any[] => {
    console.log(`🎨 SURFACE RENDERING: Starting surface cross-section rendering for surface ID: "${surfaceId}"`);
    
    // Check if this is a numerical ID (indicates we're using the unified system)
    const isNumericalId = /^\d+$/.test(surfaceId);
    
    // PRIORITY 1: Get surface from intersection data using numerical ID lookup
    const collector = RayIntersectionCollector.getInstance();
    const surfaceData = collector.getSurfaceIntersectionData(surfaceId);
    
    if (surfaceData && surfaceData.surface) {
      const surface = surfaceData.surface;
      console.log(`✅ SURFACE LOOKUP: Found surface "${surfaceId}" (numerical ID: ${surface.numericalId}) in intersection data`);
      console.log('🎨 Surface properties:', {
        shape: surface.shape,
        height: surface.height,
        width: surface.width,
        semidia: surface.semidia,
        radius: surface.radius
      });
      
      // Generate 2D cross-section geometry using the surface object
      return generateSurfaceGeometry(surface);
    }
    
    // If we're using numerical IDs but no intersection data yet, wait for ray tracing to complete
    if (isNumericalId) {
      console.log(`⏳ SURFACE RENDERING: Numerical ID "${surfaceId}" detected but no intersection data available yet - waiting for ray tracing to complete`);
      return []; // Return empty shapes, don't try YAML fallback for numerical IDs
    }
    
    // PRIORITY 2: Fallback to YAML lookup (for fallback cases when no intersection data)
    console.log('🎨 SURFACE RENDERING: No intersection data available, falling back to YAML lookup...');
    
    let system: any = systemData;
    
    // If no system data provided, try to parse YAML
    if (!system && yamlContent) {
      try {
        if (typeof (window as any).jsyaml !== 'undefined') {
          system = (window as any).jsyaml.load(yamlContent);
          console.log('🎨 SURFACE RENDERING: Parsed YAML for surface lookup');
        } else {
          console.warn('🎨 SURFACE RENDERING: js-yaml not available in window, cannot parse YAML');
          return [];
        }
      } catch (error) {
        console.error('🎨 SURFACE RENDERING: Failed to parse YAML:', error);
        return [];
      }
    }

    if (!system) {
      console.warn('🎨 SURFACE RENDERING: No system data available');
      return [];
    }

    console.log('🎨 SURFACE RENDERING: System data available, looking for surface:', surfaceId);

    // YAML structure lookup for assemblies with direct surface properties
    let targetSurface: any = null;
    
    // If surfaceId is a numerical ID (like "4"), we need to map it back to surface names
    let surfaceKeyToFind = surfaceId;
    
    if (isNumericalId) {
      console.log(`🔍 SURFACE LOOKUP: Numerical ID "${surfaceId}" detected, mapping to surface names...`);
      
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
      console.log(`🔍 SURFACE MAPPING: Numerical ID "${surfaceId}" maps to surface "${surfaceKeyToFind}"`);
      console.log(`🔍 Full mapping:`, surfaceMapping);
      
      if (!surfaceKeyToFind) {
        console.warn(`❌ NUMERICAL ID MAPPING FAILED: No surface found for numerical ID "${surfaceId}"`);
        return [];
      }
    }

    // Method 1: Look in assemblies (each assembly has direct surface properties s1, s2, etc.)
    if (system.assemblies && Array.isArray(system.assemblies)) {
      for (const assembly of system.assemblies) {
        if (assembly[surfaceKeyToFind]) {
          console.log(`✅ SURFACE LOOKUP: Found surface "${surfaceKeyToFind}" in assembly aid=${assembly.aid}`);
          targetSurface = assembly[surfaceKeyToFind];
          break;
        }
      }
    }

    // Method 2: Look in standalone surfaces (surfaces array with named objects)
    if (!targetSurface && system.surfaces && Array.isArray(system.surfaces)) {
      for (const surfaceGroup of system.surfaces) {
        if (surfaceGroup[surfaceKeyToFind]) {
          console.log(`✅ SURFACE LOOKUP: Found surface "${surfaceKeyToFind}" in standalone surfaces`);
          targetSurface = surfaceGroup[surfaceKeyToFind];
          break;
        }
      }
    }

    if (!targetSurface) {
      console.warn(`❌ SURFACE LOOKUP FAILED: Could not find surface "${surfaceKeyToFind}" (original: "${surfaceId}") in system data`);
      console.log('🔍 Available surfaces:', {
        assemblies: system.assemblies ? system.assemblies.map((a: any) => Object.keys(a).filter((k: string) => k !== 'aid')) : 'none',
        surfaces: system.surfaces ? system.surfaces.map((s: any) => Object.keys(s)) : 'none'
      });
      return [];
    }

    // Generate 2D cross-section geometry using the found surface
    console.log('🎨 SURFACE RENDERING: Generating geometry for found surface:', {
      originalSurfaceId: surfaceId,
      actualSurfaceKey: surfaceKeyToFind,
      shape: targetSurface.shape,
      height: targetSurface.height,
      width: targetSurface.width,
      semidia: targetSurface.semidia
    });

    return generateSurfaceGeometry(targetSurface);
  };

  // Create hit map plot
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

    console.log(`📊 RAY PLOTTING: Processing ${data.length} points from ${new Set(data.map(p => Math.floor(p.lightId))).size} light sources`);
    console.log(`📊 RAY PLOTTING: Wavelength groups:`, Array.from(wavelengthGroups.keys()));
    console.log(`📊 RAY PLOTTING: Light source breakdown:`, [...new Set(data.map(p => Math.floor(p.lightId)))].map(lid => ({
      lightId: lid,
      count: data.filter(p => Math.floor(p.lightId) === lid).length
    })));

    const traces = Array.from(wavelengthGroups.entries()).map(([wavelength, points]) => {
      console.log(`📊 RAY PLOTTING: Creating trace for λ=${wavelength}nm with ${points.length} points`);
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
        console.log(`🎯 GLOBAL BOUNDS: Using surface "${surface.id}" (numerical: ${surface.numericalId}) as last surface with ${surfaceData.intersectionPoints.length} intersections`);
        break;
      }
    }
    
    if (!lastSurfaceData) {
      console.log('🎯 GLOBAL BOUNDS: No surface data found, using 0.6mm default view');
      return { yMin: -0.3, yMax: 0.3, zMin: -0.3, zMax: 0.3, center: { y: 0, z: 0 } };
    }
    
    const validSurfaceData: SurfaceIntersectionData = lastSurfaceData;
    
    if (validSurfaceData.intersectionPoints.length === 0) {
      console.log('🎯 GLOBAL BOUNDS: No intersection points found, using 0.6mm default view');
      return { yMin: -0.3, yMax: 0.3, zMin: -0.3, zMax: 0.3, center: { y: 0, z: 0 } };
    }
    
    // EUREKA APPROACH: Group points by light ID and find maximum extent of any light
    const allPoints: RayIntersectionPoint[] = validSurfaceData.intersectionPoints;
    console.log(`🎯 GLOBAL BOUNDS: Analyzing ${allPoints.length} total intersection points on final surface`);
    
    // Group intersection points by light ID
    const lightGroups = new Map<number, RayIntersectionPoint[]>();
    allPoints.forEach(point => {
      const lightId = Math.floor(point.lightId);
      if (!lightGroups.has(lightId)) {
        lightGroups.set(lightId, []);
      }
      lightGroups.get(lightId)!.push(point);
    });
    
    console.log(`🎯 GLOBAL BOUNDS: Found ${lightGroups.size} light sources:`, Array.from(lightGroups.keys()));
    
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
      
      console.log(`🎯 LIGHT ${lightId}: Y:[${minY.toFixed(6)}, ${maxY.toFixed(6)}] range=${yRange.toFixed(6)}mm, Z:[${minZ.toFixed(6)}, ${maxZ.toFixed(6)}] range=${zRange.toFixed(6)}mm, max extent=${lightExtent.toFixed(6)}mm`);
    });
    
    // Handle edge case: if all lights have zero extent
    if (maxLightExtent === 0) {
      console.log('🎯 GLOBAL BOUNDS: All lights have zero extent, using 0.6mm default view');
      return { yMin: -0.3, yMax: 0.3, zMin: -0.3, zMax: 0.3, center: { y: 0, z: 0 } };
    }
    
    // Use 1.2x padding around the maximum light extent
    const paddedRange = maxLightExtent * 1.2;
    
    console.log(`🎯 GLOBAL BOUNDS: Maximum light extent = ${maxLightExtent.toFixed(6)}mm`);
    console.log(`🎯 GLOBAL BOUNDS: Final view range = ${paddedRange.toFixed(6)}mm (1.2x padding)`);
    console.log(`🎯 GLOBAL BOUNDS: Light extents:`, lightExtents.map(l => `Light ${l.lightId}: ${l.maxExtent.toFixed(6)}mm`));
    
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
    console.log(`🎯 SPOT DIAGRAM: Creating plot with ${data.length} intersection points`);
    
    if (data.length === 0) {
      console.log('🎯 SPOT DIAGRAM: No data available, using 0.6mm default view');
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

    console.log(`🎯 SPOT DIAGRAM: Found ${wavelengthGroups.size} wavelengths:`, Array.from(wavelengthGroups.keys()));

    // Create traces for each wavelength
    const traces: any[] = [];
    
    wavelengthGroups.forEach((points, wavelength) => {
      const color = getWavelengthColor(wavelength);
      
      traces.push({
        x: points.map(p => p.y), // Y position on surface
        y: points.map(p => p.z), // Z position on surface
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
    const allY = data.map(p => p.y);
    const allZ = data.map(p => p.z);
    const lightYCenter = allY.length > 0 ? (Math.min(...allY) + Math.max(...allY)) / 2 : globalBounds.center.y;
    const lightZCenter = allZ.length > 0 ? (Math.min(...allZ) + Math.max(...allZ)) / 2 : globalBounds.center.z;
    
    // Use global scale but center on this light's data
    const rangeSize = globalBounds.yMax - globalBounds.yMin;
    const yMin = lightYCenter - rangeSize / 2;
    const yMax = lightYCenter + rangeSize / 2;
    const zMin = lightZCenter - rangeSize / 2;
    const zMax = lightZCenter + rangeSize / 2;

    console.log(`🎯 SPOT DIAGRAM: Using global scale (${rangeSize.toFixed(6)}mm), centered on light data: Y:[${yMin.toFixed(6)}, ${yMax.toFixed(6)}], Z:[${zMin.toFixed(6)}, ${zMax.toFixed(6)}]`);

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
    console.log('📊 PLOT UPDATE: Starting plot update...');
    if (!plotRef.current) {
      console.warn('📊 PLOT UPDATE: Plot ref not available, skipping update');
      return;
    }

    const data = getIntersectionData();
    console.log(`📊 PLOT UPDATE: Retrieved ${data.length} intersection points for analysis`);

    let plotConfig: any;

    if (analysisType === 'Hit Map') {
      plotConfig = createHitMapPlot(data);
    } else {
      console.log('📊 PLOT UPDATE: Creating spot diagram for selected light source');
      plotConfig = createSpotDiagram(data);
    }

    console.log(`📊 PLOT UPDATE: Created plot config with ${plotConfig.data.length} traces`);

    // Create or update plot
    if (!plotlyInstanceRef.current) {
      console.log('📊 PLOT UPDATE: Creating new plot...');
      Plotly.newPlot(plotRef.current, plotConfig.data, plotConfig.layout, {
        responsive: true,
        displayModeBar: true,
        modeBarButtonsToRemove: ['select2d', 'lasso2d', 'autoScale2d'],
        modeBarButtonsToAdd: ['resetScale2d']
      }).then((plotDiv: any) => {
        plotlyInstanceRef.current = plotDiv;
        console.log('📊 PLOT UPDATE: New plot created successfully');
        
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
            console.log('✅ PLOT UPDATE: Applied post-creation equal axis constraints');
          }
        }, 100);
      });
    } else {
      console.log('📊 PLOT UPDATE: Updating existing plot...');
      Plotly.react(plotRef.current, plotConfig.data, plotConfig.layout).then(() => {
        console.log('📊 PLOT UPDATE: Existing plot updated successfully');
      });
    }
  };

  useEffect(() => {
    console.log(`📊 IntersectionPlot EFFECT: Component mounted/updated for surface ${surfaceId}, analysis: ${analysisType}`);
    updatePlot();
  }, [surfaceId, analysisType, yamlContent, systemData]);

  useEffect(() => {
    console.log('📊 IntersectionPlot EFFECT: Setting up ray trace listener...');
    const handleRayTraceComplete = () => {
      console.log('📊 IntersectionPlot LISTENER: Ray trace completed, updating plot...');
      setTimeout(() => updatePlot(), 100); // Small delay to ensure data collection is complete
    };

    // Listen for ray trace completion events
    window.addEventListener('rayTraceComplete', handleRayTraceComplete);

    return () => {
      console.log('📊 IntersectionPlot CLEANUP: Removing ray trace listener...');
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
