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

    // Smart unified surface lookup system (Method 1-4)
    let targetSurface: any = null;

    // Method 1: Direct lookup in optical_trains (element names, which may reference surfaces by sid)
    if (system.optical_trains) {
      for (const [trainName, trainElements] of Object.entries(system.optical_trains)) {
        if (Array.isArray(trainElements)) {
          const foundElement = trainElements.find((element: any) => {
            // Check if element name matches our surface ID
            if (typeof element === 'string') {
              return element === surfaceId;
            } else if (typeof element === 'object' && element !== null) {
              // Check if object has name or id that matches
              return element.name === surfaceId || element.id === surfaceId;
            }
            return false;
          });
          
          if (foundElement) {
            console.log(`🎨 SURFACE LOOKUP (Method 1): Found element "${surfaceId}" in optical train "${trainName}"`);
            
            // Found element in train - now look up actual surface definition
            // Check if element references a surface (by sid)
            let surfaceReference = null;
            if (typeof foundElement === 'string') {
              surfaceReference = foundElement;
            } else if (foundElement.sid) {
              surfaceReference = foundElement.sid;
            }
            
            if (surfaceReference && system.surfaces) {
              targetSurface = system.surfaces[surfaceReference];
              if (targetSurface) {
                console.log(`✅ SURFACE LOOKUP (Method 1): Found surface definition for "${surfaceReference}":`, {
                  shape: targetSurface.shape,
                  height: targetSurface.height,
                  width: targetSurface.width,
                  semidia: targetSurface.semidia
                });
                break;
              }
            }
          }
        }
      }
    }

    // Method 2: Direct lookup in assemblies (if element is an assembly surface)
    if (!targetSurface && system.assemblies) {
      for (const [assemblyName, assembly] of Object.entries(system.assemblies)) {
        if (typeof assembly === 'object' && assembly !== null && (assembly as any).surfaces) {
          const assemblyObject = assembly as { surfaces?: any };
          if (assemblyObject.surfaces) {
            const foundSurface = assemblyObject.surfaces[surfaceId];
            if (foundSurface) {
              console.log(`✅ SURFACE LOOKUP (Method 2): Found surface "${surfaceId}" in assembly "${assemblyName}"`);
              targetSurface = foundSurface;
              break;
            }
          }
        }
      }
    }

    // Method 3: Direct lookup in surfaces (standalone surfaces)
    if (!targetSurface && system.surfaces) {
      targetSurface = system.surfaces[surfaceId];
      if (targetSurface) {
        console.log(`✅ SURFACE LOOKUP (Method 3): Found surface "${surfaceId}" in surfaces definitions`);
      }
    }

    // Method 4: Fallback - search all surfaces for any match
    if (!targetSurface) {
      console.log('🎨 SURFACE LOOKUP (Method 4): Attempting comprehensive search...');
      
      // Search in assemblies first
      if (system.assemblies) {
        for (const [assemblyName, assembly] of Object.entries(system.assemblies)) {
          if (typeof assembly === 'object' && assembly !== null && (assembly as any).surfaces) {
            const assemblyObject = assembly as { surfaces?: any };
            if (assemblyObject.surfaces) {
              for (const [sid, surface] of Object.entries(assemblyObject.surfaces)) {
                if (sid === surfaceId) {
                  console.log(`✅ SURFACE LOOKUP (Method 4): Found surface "${surfaceId}" in assembly "${assemblyName}"`);
                  targetSurface = surface;
                  break;
                }
              }
              if (targetSurface) break;
            }
          }
        }
      }
      
      // Search in standalone surfaces
      if (!targetSurface && system.surfaces) {
        for (const [sid, surface] of Object.entries(system.surfaces)) {
          if (sid === surfaceId) {
            console.log(`✅ SURFACE LOOKUP (Method 4): Found surface "${surfaceId}" in surfaces`);
            targetSurface = surface;
            break;
          }
        }
      }
    }

    if (!targetSurface) {
      console.warn(`❌ SURFACE LOOKUP FAILED: Could not find surface "${surfaceId}" in system data`);
      console.log('🔍 Available surfaces:', {
        surfaces: system.surfaces ? Object.keys(system.surfaces) : 'none',
        assemblies: system.assemblies ? Object.keys(system.assemblies) : 'none',
        optical_trains: system.optical_trains ? Object.keys(system.optical_trains) : 'none'
      });
      return [];
    }

    // Generate 2D cross-section geometry using the found surface
    console.log('🎨 SURFACE RENDERING: Generating geometry for found surface:', {
      surfaceId,
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
      console.log('📊 PLOT UPDATE: Spot diagram analysis not displayed (keeping blank as requested)');
      // Return empty plot for spot diagram to keep it blank
      plotConfig = {
        data: [{
          x: [],
          y: [],
          type: 'scatter',
          mode: 'markers',
          name: 'Spot Diagram (blank)'
        }],
        layout: {
          xaxis: { title: 'Y Position (mm)', color: '#ccc' },
          yaxis: { title: 'Z Position (mm)', color: '#ccc' },
          plot_bgcolor: '#1e1e1e',
          paper_bgcolor: '#1e1e1e',
          font: { color: '#ccc' },
          showlegend: false,
          margin: { l: 60, r: 80, t: 40, b: 50 }
        }
      };
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
