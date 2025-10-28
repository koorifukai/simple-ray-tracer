import React, { useEffect, useRef } from 'react';
import { wavelengthToRGB, rgbToCSSColor } from '../optical/wavelength';
import { OpticalSystemParser } from '../optical/OpticalSystem';
import { SurfaceRenderer } from '../optical/surfaces';
import { Vector3 } from '../math/Matrix4';
import { Ray } from '../optical/LightSource';
import { RayTracer } from '../optical/RayTracer';
import { RayIntersectionCollector } from '../components/RayIntersectionCollector';

declare const Plotly: any;

// Global camera state storage to persist across component remounts
const CAMERA_STATE_KEY = 'opticalRayTracer_cameraState';
let globalCameraState: any = null;

// Load saved camera state from sessionStorage on module load
try {
  const savedState = sessionStorage.getItem(CAMERA_STATE_KEY);
  if (savedState) {
    globalCameraState = JSON.parse(savedState);
    console.log('📷 Loaded camera state from session:', globalCameraState);
  }
} catch (error) {
  console.warn('Failed to load camera state from session storage:', error);
}

// Utility functions for camera state persistence
const saveCameraState = (cameraState: any) => {
  try {
    globalCameraState = cameraState;
    sessionStorage.setItem(CAMERA_STATE_KEY, JSON.stringify(cameraState));
    console.log('📷 Camera state saved to session:', cameraState);
  } catch (error) {
    console.warn('Failed to save camera state to session storage:', error);
  }
};

const getCameraState = () => globalCameraState;

interface EmptyPlot3DProps {
  title?: string;
  yamlContent?: string;
  isRayTracingActive?: boolean;
  rayTracingTrigger?: number;
}

export const EmptyPlot3D: React.FC<EmptyPlot3DProps> = ({ 
  title = "Optical System Visualization",
  yamlContent,
  isRayTracingActive = false,
  rayTracingTrigger
}) => {
  const plotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!plotRef.current) return;

    // Load Plotly dynamically only when ray tracing is active
    const loadPlotly = async () => {
      try {
        const PlotlyModule = await import('plotly.js-dist-min');
        const PlotlyLib = PlotlyModule.default || PlotlyModule;

        // Create optical system visualization
        const plotData: any[] = [];
        
        // Parse optical system if YAML is provided
        let opticalSystem = null;
        if (yamlContent) {
          try {
            // console.log('🚀 EmptyPlot3D: Starting YAML parsing...');
            // console.log('YAML content length:', yamlContent.length);
            // console.log('YAML preview:', yamlContent.substring(0, 200) + '...');
            opticalSystem = await OpticalSystemParser.parseYAML(yamlContent);
            // console.log('✅ EmptyPlot3D: Parsed optical system successfully:', opticalSystem);
            // console.log('Number of surfaces created:', opticalSystem.surfaces.length);
          } catch (error) {
            console.error('❌ EmptyPlot3D: Failed to parse optical system:', error);
          }
        }

        // Add optical surfaces if system is parsed
        if (opticalSystem) {
          // Add surfaces
          opticalSystem.surfaces.forEach((surface) => {
            try {
              const mesh = SurfaceRenderer.generateMesh(surface);
              
              // Utility function to format numbers with 3 significant figures
              const formatNumber = (num: number): string => {
                if (Math.abs(num) === 0) return '0.00';
                const magnitude = Math.floor(Math.log10(Math.abs(num)));
                if (magnitude >= 3 || magnitude <= -3) {
                  // Use scientific notation for very large or very small numbers
                  return num.toExponential(2);
                } else {
                  // Use 3 significant figures for normal range numbers
                  const precision = Math.max(0, 2 - magnitude);
                  return num.toFixed(precision);
                }
              };
              
              // Calculate global normal vector for display - must be perpendicular to visible mesh
              let globalNormal: Vector3;
              // ALWAYS use surface.transform (includes dial) to match the visual mesh orientation
              // This ensures the displayed normal is perpendicular to what the user sees
              const normalLocal = new Vector3(-1, 0, 0);
              const [normalX, normalY, normalZ] = surface.transform.transformVector(normalLocal.x, normalLocal.y, normalLocal.z);
              globalNormal = new Vector3(normalX, normalY, normalZ).normalize();
              
              // Create display name and surface ID line
              let displayName: string;
              let surfaceIdLine: string;
              if (surface.assemblyId && surface.elementIndex) {
                displayName = `aid: ${surface.assemblyId} ele: ${surface.elementIndex}`;
                surfaceIdLine = `Surface ID: aid=${surface.assemblyId}; s=${surface.id}`;
              } else {
                displayName = `Surface ${surface.id}`;
                surfaceIdLine = `Surface ID: sid=${surface.id}`;
              }
              
              // Create detailed hover template (no redundant first line)
              const hoverLines: string[] = [
                `<b>${surfaceIdLine}</b>`,
                `Mode: ${surface.mode}`,
                `Global Position: (${formatNumber(surface.position.x)}, ${formatNumber(surface.position.y)}, ${formatNumber(surface.position.z)})`,
                `Global Normal: [${formatNumber(globalNormal.x)}, ${formatNumber(globalNormal.y)}, ${formatNumber(globalNormal.z)}]`
              ];
              
              // Add combined refractive indices if available
              if (surface.n1 !== undefined && surface.n2 !== undefined) {
                hoverLines.push(`n1/n2: ${formatNumber(surface.n1)}/${formatNumber(surface.n2)}`);
              } else if (surface.n1 !== undefined) {
                hoverLines.push(`n1: ${formatNumber(surface.n1)}`);
              } else if (surface.n2 !== undefined) {
                hoverLines.push(`n2: ${formatNumber(surface.n2)}`);
              }
              
              // Add radius if available
              if (surface.radius !== undefined) {
                hoverLines.push(`Radius: ${formatNumber(surface.radius)}`);
              }
              
              // Validate mesh data before adding to plotData
              const isValidMeshData = (mesh: any): boolean => {
                if (!mesh || typeof mesh !== 'object') return false;
                
                // Check for required coordinate arrays
                if (!Array.isArray(mesh.x) || !Array.isArray(mesh.y) || !Array.isArray(mesh.z)) {
                  return false;
                }
                
                // Check arrays have same length and contain valid numbers
                const length = mesh.x.length;
                if (length === 0 || mesh.y.length !== length || mesh.z.length !== length) {
                  return false;
                }
                
                // Check all coordinates are valid numbers (not NaN, not undefined, not infinite)
                for (let i = 0; i < length; i++) {
                  if (!Number.isFinite(mesh.x[i]) || !Number.isFinite(mesh.y[i]) || !Number.isFinite(mesh.z[i])) {
                    return false;
                  }
                }
                
                // Check face indices if they exist
                if (mesh.i && mesh.j && mesh.k) {
                  if (!Array.isArray(mesh.i) || !Array.isArray(mesh.j) || !Array.isArray(mesh.k)) {
                    return false;
                  }
                  
                  const faceLength = mesh.i.length;
                  if (mesh.j.length !== faceLength || mesh.k.length !== faceLength) {
                    return false;
                  }
                  
                  // Check face indices are valid integers within vertex range
                  for (let i = 0; i < faceLength; i++) {
                    const [fi, fj, fk] = [mesh.i[i], mesh.j[i], mesh.k[i]];
                    if (!Number.isInteger(fi) || !Number.isInteger(fj) || !Number.isInteger(fk) ||
                        fi < 0 || fj < 0 || fk < 0 || fi >= length || fj >= length || fk >= length) {
                      return false;
                    }
                  }
                }
                
                return true;
              };
              
              if (isValidMeshData(mesh)) {
                plotData.push({
                  ...mesh,
                  name: displayName,
                  hovertemplate: hoverLines.join('<br>') + '<extra></extra>',
                  showlegend: false
                });
              } else {
                console.warn(`⚠️ Invalid mesh data for surface ${surface.id}, skipping visualization`);
              }

              // Add normal vectors for this surface
              const normals = SurfaceRenderer.generateNormalVectors(surface);
              plotData.push(normals);

              // Add corner markers for debugging (only for rectangular planar and cylindrical surfaces)
              try {
                // Only show corner markers if enabled in display settings and for surfaces that have clearly defined corners
                if ((opticalSystem?.displaySettings?.showCorners !== false) && 
                    (surface.shape === 'cylindrical' || (surface.shape === 'plano' && !surface.semidia))) {
                  // console.log(`Adding corner markers for ${surface.shape} surface ${surface.id}`);
                  
                  let cornerX: number[], cornerY: number[], cornerZ: number[];
                  
                  // Use proper corners from mesh if available, otherwise fall back to first 4 vertices
                  if ((mesh as any).corners) {
                    cornerX = (mesh as any).corners.x;
                    cornerY = (mesh as any).corners.y;
                    cornerZ = (mesh as any).corners.z;
                    // console.log(`Using ${cornerX.length} proper corners from mesh data`);
                  } else {
                    // Fallback to first 4 vertices (for compatibility)
                    cornerX = mesh.x.slice(0, 4);
                    cornerY = mesh.y.slice(0, 4);
                    cornerZ = mesh.z.slice(0, 4);
                    // console.log(`Using first 4 vertices as corners (fallback)`);
                  }
                
                // COMPREHENSIVE DEBUGGING: Log everything needed to trace coordinate calculation
                // console.log(`🔍 PLOTLY VISUALIZATION: Surface ${surface.id} Corner Analysis`);
                // console.log(`================================================================`);
                // console.log(`Surface Properties:`);
                // console.log(`  ID: ${surface.id}`);
                // console.log(`  Shape: ${surface.shape}`);
                // console.log(`  Position: [${surface.position.x.toFixed(6)}, ${surface.position.y.toFixed(6)}, ${surface.position.z.toFixed(6)}]`);
                // console.log(`  Normal: [${surface.normal?.x.toFixed(6)}, ${surface.normal?.y.toFixed(6)}, ${surface.normal?.z.toFixed(6)}]`);
                // console.log(`  Radius: ${surface.radius || 'none'}, Dial: ${(surface as any).localDialAngle ? ((surface as any).localDialAngle * 180 / Math.PI).toFixed(2) + '°' : 'none'}`);
                // console.log(`  Width: ${surface.width || 'default'}, Height: ${surface.height || 'default'}, Semidia: ${surface.semidia || 'none'}`);
                // console.log(`  Transform matrices (EUREKA methodology):`);
                // console.log(`    - unified transform: ${surface.transform ? 'YES' : 'NO'}`);
                // console.log(`    - forwardTransform: ${surface.forwardTransform ? 'YES' : 'NO'}`);
                // console.log(`    - inverseTransform: ${surface.inverseTransform ? 'YES' : 'NO'}`);
                // 
                // console.log(`Mesh Generation Results:`);
                // console.log(`  Total mesh vertices: ${mesh.x.length}`);
                // console.log(`  Mesh type: ${mesh.type}`);
                // console.log(`  Corner coordinates being plotted in Plotly:`);
                // cornerX.forEach((x, i) => {
                //   console.log(`    Corner ${i+1}: [${x.toFixed(6)}, ${cornerY[i].toFixed(6)}, ${cornerZ[i].toFixed(6)}]`);
                // });
                
                // Create simplified hover text for each corner
                const cornerHoverText = cornerX.map((x, i) => 
                  `<b>${surface.id}</b><br>` +
                  `Coordinates: (${formatNumber(x)}, ${formatNumber(cornerY[i])}, ${formatNumber(cornerZ[i])})<br>` +
                  `Surface: ${displayName}<extra></extra>`
                );
                
                // Get surface color for corner markers (same as surface, with transparency)
                const surfaceColor = surface.color || '#5060ff'; // Default blue if no color
                let cornerColor = surfaceColor;
                let cornerOpacity = 0.3; // 30% transparency to match normal vectors
                
                // Convert hex to rgba if needed
                if (surfaceColor.startsWith('#')) {
                  const hex = surfaceColor.slice(1);
                  const r = parseInt(hex.slice(0, 2), 16);
                  const g = parseInt(hex.slice(2, 4), 16);
                  const b = parseInt(hex.slice(4, 6), 16);
                  cornerColor = `rgba(${r}, ${g}, ${b}, ${cornerOpacity})`;
                }
                
                plotData.push({
                  type: 'scatter3d',
                  mode: 'markers',
                  x: cornerX,
                  y: cornerY,
                  z: cornerZ,
                  marker: {
                    size: 1.6, // 5x smaller than original (8/5 = 1.6)
                    color: cornerColor, // Same color as surface with transparency
                    symbol: 'circle',
                    line: {
                      color: cornerColor, // Same color for border
                      width: 1 // Thinner border
                    }
                  },
                  hovertemplate: cornerHoverText,
                  hoverinfo: 'text',
                  name: `${surface.id} corners`,
                  showlegend: false
                  });
                  // console.log(`✅ Added corner markers for surface ${surface.id} to Plotly`);
                  // console.log(`================================================================\n`);
                } else {
                  // console.log(`Skipping corner markers for ${surface.shape} surface ${surface.id} (corners disabled or no defined corners)`);
                }
              } catch (cornerError) {
                console.warn(`Failed to add corner markers for surface ${surface.id}:`, cornerError);
              }
              
            } catch (error) {
              console.warn(`Failed to generate mesh for surface ${surface.id}:`, error);
            }
          });

          // Add light source indicators and trace rays
          try {
            // Clear ray tracing data at the beginning of each new session to prevent mixing data from different systems
            RayTracer.resetFirstRayTracking();
            RayTracer.clearWarnings();
            console.log('🧹 Cleared ray tracer state for new tracing session');
            
            // CRITICAL FIX: Clear and start intersection data collection BEFORE ray tracing
            // This ensures clean data for each ray tracing session
            const collector = RayIntersectionCollector.getInstance();
            
            // Always clear data before starting new ray tracing to prevent mixing
            collector.clearData();
            console.log('🧹 VISUALIZATION: Cleared intersection data for new ray tracing session');
            
            if (!collector.isCollectionActive()) {
              collector.startCollection();
              console.log('🎯 VISUALIZATION: Started intersection data collection for upcoming ray trace');
            } else {
              console.log('🎯 VISUALIZATION: Intersection collection already active');
            }
            
            // console.log('System light sources:', opticalSystem.lightSources);
            
            opticalSystem.lightSources.forEach((source, index) => {
              // console.log(`Processing light source ${index}:`, source);
              // console.log(`Source constructor:`, source.constructor.name);
              // console.log(`Source generateRays method:`, typeof source.generateRays);
              // console.log(`Source methods:`, Object.getOwnPropertyNames(Object.getPrototypeOf(source)));
              
              // Check if we have position and wavelength
              if (source && source.position && source.wavelength) {
                const color = rgbToCSSColor(wavelengthToRGB(source.wavelength));
                
                // Light source marker removed as requested

                // Try to generate and trace rays
                try {
                  if (source.generateRays && typeof source.generateRays === 'function') {
                    // console.log(`Generating rays for light source ${index}...`);
                    const rays = source.generateRays(source.numberOfRays || 10); // Generate all requested rays
                    // console.log(`Generated ${rays.length} rays`);
                    
                    rays.forEach((ray: Ray, rayIndex: number) => {
                      try {
                        
                        // Check if we have surfaces to trace through
                        if (opticalSystem && opticalSystem.surfaces && opticalSystem.surfaces.length > 0) {
                          // console.log(`Optical system surfaces:`, opticalSystem.surfaces.map(s => ({
                          //   id: s.id, shape: s.shape, mode: s.mode, position: s.position
                          // })));
                          // 
                          // console.log(`Tracing ray ${rayIndex} through ${opticalSystem.surfaces.length} surfaces`);
                          // console.log(`Initial ray:`, { position: ray.position, direction: ray.direction });
                          
                          // Trace ray through optical system
                          const rayPath = RayTracer.traceRaySequential(ray, opticalSystem.surfaces);
                          // console.log(`🔍 VISUALIZATION: Received ${rayPath.length} ray segments from RayTracer`);
                          
                          // Group rays by light ID to handle branching correctly
                          const rayGroups = new Map<number, Ray[]>();
                          for (const pathRay of rayPath) {
                            const lightId = pathRay.lightId;
                            if (!rayGroups.has(lightId)) {
                              rayGroups.set(lightId, []);
                            }
                            rayGroups.get(lightId)!.push(pathRay);
                          }
                          
                          // Ray grouping logging disabled for performance
                          
                          // Plot each ray group (light ID) separately
                          rayGroups.forEach((groupRays, lightId) => {
                            // All rays (original and branched) use the same wavelength-based color
                            // since branched rays have the same wavelength as the original ray
                            const rayColor = color;
                            
                            // Note: Branched rays (fractional light IDs) maintain the same wavelength
                            // and thus the same color as the original ray, just with different intensity
                            
                            // Plot the ray group as connected segments
                            // console.log(`🔍 PLOTTING: Light ID ${lightId} with ${groupRays.length} segments`);
                            for (let i = 0; i < groupRays.length - 1; i++) {
                              const startRay = groupRays[i];
                              const endRay = groupRays[i + 1];
                              
                              // console.log(`  Segment ${i}: (${startRay.position.x.toFixed(3)}, ${startRay.position.y.toFixed(3)}, ${startRay.position.z.toFixed(3)}) -> (${endRay.position.x.toFixed(3)}, ${endRay.position.y.toFixed(3)}, ${endRay.position.z.toFixed(3)})`);
                              
                              // Validate coordinates before plotting
                              const coords = [
                                startRay.position.x, startRay.position.y, startRay.position.z,
                                endRay.position.x, endRay.position.y, endRay.position.z
                              ];
                              
                              if (coords.some(coord => !isFinite(coord))) {
                                console.warn(`Invalid coordinates for light ID ${lightId} segment ${i + 1}:`, coords);
                                continue; // Skip this segment
                              }
                              
                              plotData.push({
                                type: 'scatter3d',
                                mode: 'lines',
                                x: [startRay.position.x, endRay.position.x],
                                y: [startRay.position.y, endRay.position.y],
                                z: [startRay.position.z, endRay.position.z],
                                line: {
                                  color: rayColor,
                                  width: 3 // Make thicker for easier visibility
                                },
                                name: `Light ${lightId} Seg ${i + 1}`,
                                showlegend: false,
                                hoverinfo: 'skip'
                              });
                            }
                          });
                        } else {
                          // No surfaces - just show simple ray extension
                          const startPoint = ray.position;
                          const endPoint = startPoint.add(ray.direction.multiply(50)); // Extend by 50 units
                          
                          // Validate coordinates before plotting
                          const coords = [
                            startPoint.x, startPoint.y, startPoint.z,
                            endPoint.x, endPoint.y, endPoint.z
                          ];
                          
                          if (coords.some(coord => !isFinite(coord))) {
                            console.warn(`Invalid coordinates for ray ${rayIndex}:`, coords);
                            return; // Skip this ray
                          }
                          
                          plotData.push({
                            type: 'scatter3d',
                            mode: 'lines',
                            x: [startPoint.x, endPoint.x],
                            y: [startPoint.y, endPoint.y],
                            z: [startPoint.z, endPoint.z],
                            line: {
                              color: color,
                              width: 2
                            },
                            name: `${source.lid || index} Ray ${rayIndex + 1}`,
                            showlegend: false,
                            hoverinfo: 'skip'
                          });
                        }
                        
                      } catch (rayError) {
                        console.warn(`Failed to create ray ${rayIndex} from source ${index}:`, rayError);
                      }
                    });
                  } else {
                    console.warn(`Light source ${index} does not have generateRays method:`, typeof source.generateRays);
                  }
                } catch (rayGenError) {
                  console.warn(`Failed to generate rays for source ${index}:`, rayGenError);
                }
              } else {
                console.warn(`Light source ${index} missing position or wavelength:`, source);
              }
            });
            
          } catch (error) {
            console.error('Error during light source visualization:', error);
            if (error instanceof Error) {
              console.error('Error stack:', error.stack);
            }
          }
        }

        // Add wavelength color demonstration if no optical system
        if (!opticalSystem) {
          const wavelengths = [486.1, 546.1, 587.6, 656.3]; // F, e, D, C lines
          const colors = wavelengths.map(wl => rgbToCSSColor(wavelengthToRGB(wl)));
          
          wavelengths.forEach((wl, i) => {
            plotData.push({
              x: [i * 10 - 15],
              y: [0],
              z: [0],
              mode: 'markers',
              marker: {
                size: 8,
                color: colors[i]
              },
              type: 'scatter3d',
              name: `${wl}nm`,
              showlegend: false,
              hoverinfo: 'skip'  // Disable hover for wavelength indicators
            });
          });
        }

        // Calculate data bounds for unified scaling
        let minX = -50, maxX = 150, minY = -50, maxY = 50, minZ = -50, maxZ = 50;  // Default optical range
        
        // Update bounds based on actual data
        plotData.forEach(trace => {
          if (trace.x && Array.isArray(trace.x)) {
            trace.x.forEach((x: number) => {
              if (isFinite(x)) {
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
              }
            });
          }
          if (trace.y && Array.isArray(trace.y)) {
            trace.y.forEach((y: number) => {
              if (isFinite(y)) {
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
              }
            });
          }
          if (trace.z && Array.isArray(trace.z)) {
            trace.z.forEach((z: number) => {
              if (isFinite(z)) {
                minZ = Math.min(minZ, z);
                maxZ = Math.max(maxZ, z);
              }
            });
          }
        });

        // Add 10% padding to bounds
        const paddingX = (maxX - minX) * 0.1;
        const paddingY = (maxY - minY) * 0.1;
        const paddingZ = (maxZ - minZ) * 0.1;
        
        minX -= paddingX; maxX += paddingX;
        minY -= paddingY; maxY += paddingY;
        minZ -= paddingZ; maxZ += paddingZ;

        // Calculate unified range for all axes (largest range)
        const rangeX = maxX - minX;
        const rangeY = maxY - minY;
        const rangeZ = maxZ - minZ;
        const maxRange = Math.max(rangeX, rangeY, rangeZ);

        // Center each axis range
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const centerZ = (minZ + maxZ) / 2;

        // Unified axis ranges for equal scaling
        const unifiedMinX = centerX - maxRange / 2;
        const unifiedMaxX = centerX + maxRange / 2;
        const unifiedMinY = centerY - maxRange / 2;
        const unifiedMaxY = centerY + maxRange / 2;
        const unifiedMinZ = centerZ - maxRange / 2;
        const unifiedMaxZ = centerZ + maxRange / 2;

        // console.log('Unified axis ranges:');
        // console.log(`X: ${unifiedMinX.toFixed(1)} to ${unifiedMaxX.toFixed(1)}`);
        // console.log(`Y: ${unifiedMinY.toFixed(1)} to ${unifiedMaxY.toFixed(1)}`);
        // console.log(`Z: ${unifiedMinZ.toFixed(1)} to ${unifiedMaxZ.toFixed(1)}`);

        // Log camera state usage
        if (getCameraState()) {
          console.log('📷 Using saved camera state for plot refresh:', getCameraState());
        } else {
          console.log('📷 Using default camera state (first render or no saved state)');
        }

        // Add empty point for axis setup
        plotData.push({
          x: [0],
          y: [0], 
          z: [0],
          mode: 'markers',
          marker: {
            size: 0.1,
            color: 'rgba(0,0,0,0)'
          },
          type: 'scatter3d',
          showlegend: false,
          hoverinfo: 'skip'
        });

        const layout = {
          // Remove title to save space for the plot area
          // title: {
          //   text: title,
          //   font: { 
          //     size: 16,
          //     color: '#e0e0e0'
          //   }
          // },
          scene: {
            xaxis: { 
              title: opticalSystem?.displaySettings?.showGrid !== false ? 'X (mm)' : '', // Hide title when grid is off
              gridcolor: '#606060',
              gridwidth: 2,
              showgrid: opticalSystem?.displaySettings?.showGrid !== false, // Default to true
              showline: opticalSystem?.displaySettings?.showGrid !== false, // Hide axis line when grid is off
              showticklabels: opticalSystem?.displaySettings?.showGrid !== false, // Hide tick labels when grid is off
              zeroline: opticalSystem?.displaySettings?.showGrid !== false, // Hide zero line when grid is off
              zerolinecolor: '#808080',
              zerolinewidth: 3,
              color: '#b0b0b0',
              showspikes: false,  // Disable axis projections
              range: [unifiedMinX, unifiedMaxX]  // Unified scale
            },
            yaxis: { 
              title: opticalSystem?.displaySettings?.showGrid !== false ? 'Y (mm)' : '', // Hide title when grid is off
              gridcolor: '#606060',
              gridwidth: 2,
              showgrid: opticalSystem?.displaySettings?.showGrid !== false, // Default to true
              showline: opticalSystem?.displaySettings?.showGrid !== false, // Hide axis line when grid is off
              showticklabels: opticalSystem?.displaySettings?.showGrid !== false, // Hide tick labels when grid is off
              zeroline: opticalSystem?.displaySettings?.showGrid !== false, // Hide zero line when grid is off
              zerolinecolor: '#808080',
              zerolinewidth: 3,
              color: '#b0b0b0',
              showspikes: false,  // Disable axis projections
              range: [unifiedMinY, unifiedMaxY]  // Unified scale
            },
            zaxis: { 
              title: opticalSystem?.displaySettings?.showGrid !== false ? 'Z (mm)' : '', // Hide title when grid is off
              gridcolor: '#606060',
              gridwidth: 2,
              showgrid: opticalSystem?.displaySettings?.showGrid !== false, // Default to true
              showline: opticalSystem?.displaySettings?.showGrid !== false, // Hide axis line when grid is off
              showticklabels: opticalSystem?.displaySettings?.showGrid !== false, // Hide tick labels when grid is off
              zeroline: opticalSystem?.displaySettings?.showGrid !== false, // Hide zero line when grid is off
              zerolinecolor: '#808080',
              zerolinewidth: 3,
              color: '#b0b0b0',
              showspikes: false,  // Disable axis projections
              range: [unifiedMinZ, unifiedMaxZ]  // Unified scale
            },
            showaxeslabels: opticalSystem?.displaySettings?.showGrid !== false, // Hide floating X,Y,Z labels when grid is off
            aspectmode: 'cube',  // Force equal aspect ratio on all axes
            bgcolor: '#1a1a1a',
            camera: getCameraState() || {
              eye: { x: 0, y: -2, z: 0 }  // Default view: parallel to X-axis, looking from negative Y
            }
          },
          paper_bgcolor: '#1a1a1a',
          plot_bgcolor: '#1a1a1a',
          font: {
            color: '#e0e0e0'
          },
          margin: { l: 0, r: 0, t: 40, b: 0 }
        };

        const config = {
          responsive: true,
          displayModeBar: true,
          modeBarButtonsToRemove: [
            'pan2d', 'select2d', 'lasso2d', 'resetCameraDefault3d'
          ],
          modeBarButtons: [[
            'zoom3d', 'pan3d', 'orbitRotation', 'tableRotation',
            'resetCameraLastSave3d', 'hoverClosest3d'
          ]],
          displaylogo: false,
          // Optimize hover behavior for surfaces only
          hovermode: 'closest'
        };

        await PlotlyLib.newPlot(plotRef.current, plotData, layout, config);

        // Set up camera state persistence - capture camera changes
        if (plotRef.current) {
          const plotElement = plotRef.current as any; // Cast to access PlotlyLib methods
          
          plotElement.on('plotly_relayout', (eventData: any) => {
            // Capture camera state when user interacts with the plot
            if (eventData['scene.camera']) {
              saveCameraState(eventData['scene.camera']);
              console.log('📷 Camera state saved:', eventData['scene.camera']);
            }
          });

          // Handle camera state restoration
          if (getCameraState()) {
            // We already have saved camera state - apply it immediately after plot creation
            setTimeout(() => {
              PlotlyLib.relayout(plotElement, {
                'scene.camera': getCameraState()
              });
              console.log('📷 Camera state restored after scene update:', getCameraState());
            }, 150);
          } else {
            // No saved camera state - capture initial state after first render
            setTimeout(() => {
              if (plotElement && plotElement._fullLayout && plotElement._fullLayout.scene) {
                const currentCamera = plotElement._fullLayout.scene.camera;
                if (currentCamera) {
                  const cameraState = {
                    eye: { ...currentCamera.eye },
                    center: { ...currentCamera.center },
                    up: { ...currentCamera.up }
                  };
                  saveCameraState(cameraState);
                  console.log('📷 Initial camera state captured:', cameraState);
                }
              }
            }, 150);
          }
        }

      } catch (error) {
        console.error('Failed to load PlotlyLib:', error);
        if (plotRef.current) {
          plotRef.current.innerHTML = `
            <div style="
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100%;
              color: #ff6b6b;
              text-align: center;
            ">
              <div>
                <div>Failed to load 3D visualization</div>
                <div style="font-size: 12px; margin-top: 8px;">Check console for details</div>
              </div>
            </div>
          `;
        }
      }
    };

    loadPlotly();

    return () => {
      if (plotRef.current && typeof Plotly !== 'undefined') {
        Plotly.purge(plotRef.current);
      }
    };
  }, [title, yamlContent, isRayTracingActive, rayTracingTrigger]);

  return (
    <div 
      ref={plotRef} 
      className="plotly-container"
      style={{ 
        width: '100%', 
        height: '100%',
        minHeight: '400px'
      }} 
    />
  );
};
