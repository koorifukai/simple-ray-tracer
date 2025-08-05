import React, { useEffect, useRef } from 'react';
import { RayIntersectionCollector } from './RayIntersectionCollector';

interface HitPoint {
  y: number;
  z: number;
  wavelength: number;
  intensity: number;
  rayId: string;
}

interface SurfaceInfo {
  type: 'spherical' | 'plano' | 'cylindrical';
  radius?: number;
  semidia?: number;
  width?: number;
  height?: number;
  name: string;
  assemblyName?: string;
}

interface HitMapCanvasProps {
  surfaceId: string;
  yamlContent?: string;
}

export const HitMapCanvas: React.FC<HitMapCanvasProps> = ({ surfaceId, yamlContent }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Get surface info from surface ID using real data
  const getSurfaceInfo = (id: string): SurfaceInfo => {
    const collector = RayIntersectionCollector.getInstance();
    const surfaceData = collector.getSurfaceIntersectionData(id);
    
    if (surfaceData) {
      const surface = surfaceData.surface;
      return {
        type: surface.shape as 'spherical' | 'plano' | 'cylindrical',
        radius: surface.radius,
        semidia: surface.semidia,
        width: surface.width,
        height: surface.height,
        name: surfaceData.surfaceName,
        assemblyName: surfaceData.assemblyName
      };
    }
    
    // Fallback for unknown surfaces
    return { 
      type: 'plano', 
      width: 40, 
      height: 40,
      name: id 
    };
  };

  // Get real ray hit data instead of mock data
  const getHitData = (): HitPoint[] => {
    const collector = RayIntersectionCollector.getInstance();
    const surfaceData = collector.getSurfaceIntersectionData(surfaceId);
    
    if (!surfaceData || surfaceData.intersectionPoints.length === 0) {
      return [];
    }
    
    // Convert collected intersection points to display format
    return surfaceData.intersectionPoints.map(hit => ({
      y: hit.crossSectionY,
      z: hit.crossSectionZ,
      wavelength: hit.wavelength,
      intensity: hit.intensity,
      rayId: hit.rayId
    }));
  };

  // Draw grid with appropriate scale
  const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number, scale: number, centerY: number, centerZ: number) => {
    // Determine grid spacing based on scale
    const viewRange = Math.min(width, height) / scale;
    let gridSpacing = 1;
    
    if (viewRange > 50) gridSpacing = 10;
    else if (viewRange > 20) gridSpacing = 5;
    else if (viewRange > 10) gridSpacing = 2;
    
    const gridPixelSpacing = gridSpacing * scale;

    // Draw major grid lines (every 2 grid units) - medium thickness
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1.5; // Reduced from 2
    ctx.setLineDash([]);

    // Major vertical grid lines
    for (let i = -20; i <= 20; i += 2) {
      const x = centerY + i * gridPixelSpacing;
      if (x >= 0 && x <= width) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
    }

    // Major horizontal grid lines
    for (let i = -20; i <= 20; i += 2) {
      const y = centerZ + i * gridPixelSpacing;
      if (y >= 0 && y <= height) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    }

    // Draw minor grid lines - slightly thicker
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1.2; // Increased from 1
    ctx.setLineDash([2, 2]);

    // Minor vertical grid lines
    for (let i = -20; i <= 20; i++) {
      if (i % 2 === 0) continue; // Skip major grid positions
      const x = centerY + i * gridPixelSpacing;
      if (x >= 0 && x <= width) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
    }

    // Minor horizontal grid lines
    for (let i = -20; i <= 20; i++) {
      if (i % 2 === 0) continue; // Skip major grid positions
      const y = centerZ + i * gridPixelSpacing;
      if (y >= 0 && y <= height) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    }

    ctx.setLineDash([]);

    // Draw tick labels - larger and more visible
    ctx.fillStyle = '#aaa';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    
    // Y axis labels (only major ticks)
    for (let i = -10; i <= 10; i += 2) {
      if (i === 0) continue;
      const x = centerY + i * gridPixelSpacing;
      const value = i * gridSpacing;
      if (x >= 30 && x <= width - 30) {
        ctx.fillText(value.toString(), x, height - 8);
      }
    }
    
    // Z axis labels (only major ticks)
    ctx.textAlign = 'right';
    for (let i = -10; i <= 10; i += 2) {
      if (i === 0) continue;
      const y = centerZ - i * gridPixelSpacing; // Flip for screen coordinates
      const value = i * gridSpacing;
      if (y >= 20 && y <= height - 20) {
        ctx.fillText(value.toString(), width - 8, y + 4);
      }
    }
  };

  // Draw surface cross-section
  const drawSurfaceCrossSection = (ctx: CanvasRenderingContext2D, surfaceInfo: SurfaceInfo, _width: number, _height: number, scale: number, centerY: number, centerZ: number) => {
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);

    if (surfaceInfo.type === 'spherical' && surfaceInfo.semidia) {
      // Draw circle for spherical surface
      const radius = surfaceInfo.semidia * scale;
      ctx.beginPath();
      ctx.arc(centerY, centerZ, radius, 0, 2 * Math.PI);
      ctx.stroke();
    } else if (surfaceInfo.type === 'plano' && surfaceInfo.width && surfaceInfo.height) {
      // Draw rectangle for plano surface
      const w = surfaceInfo.width * scale;
      const h = surfaceInfo.height * scale;
      ctx.beginPath();
      ctx.rect(centerY - w/2, centerZ - h/2, w, h);
      ctx.stroke();
    }

    ctx.setLineDash([]);
  };

  const drawHitMap = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match container
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Clear canvas
    ctx.fillStyle = '#1e1e1e'; // Dark background like Plotly
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Get surface info and hit data
    const surfaceInfo = getSurfaceInfo(surfaceId);
    const hitPoints = getHitData();
    
    if (hitPoints.length === 0) {
      // Draw empty state with grid and message
      const centerY = rect.width / 2;
      const centerZ = rect.height / 2;
      const scale = 10; // Default scale for empty state
      
      // Draw grid for reference
      drawGrid(ctx, rect.width, rect.height, scale, centerY, centerZ);
      
      // Draw surface cross-section if available
      drawSurfaceCrossSection(ctx, surfaceInfo, rect.width, rect.height, scale, centerY, centerZ);
      
      // Draw coordinate axes
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, centerZ);
      ctx.lineTo(rect.width, centerZ);
      ctx.moveTo(centerY, 0);
      ctx.lineTo(centerY, rect.height);
      ctx.stroke();
      
      // Draw axis labels
      ctx.fillStyle = '#ccc';
      ctx.font = '14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('0', centerY - 15, centerZ - 5);
      ctx.fillText('Z', centerY - 15, 15);
      
      ctx.textAlign = 'left';
      ctx.fillText('Y', rect.width - 15, centerZ - 5);
      
      // Draw "No data" message
      ctx.fillStyle = '#888';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('No ray intersection data available', centerY, centerZ + 30);
      ctx.fillText('Run ray tracing to collect data', centerY, centerZ + 50);
      
      return;
    }

    // Calculate bounds
    const yValues = hitPoints.map((p: HitPoint) => p.y);
    const zValues = hitPoints.map((p: HitPoint) => p.z);
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);
    const minZ = Math.min(...zValues);
    const maxZ = Math.max(...zValues);

    // Add padding
    const padding = 25;
    const plotWidth = rect.width - 2 * padding;
    const plotHeight = rect.height - 2 * padding;

    // Scale factors to fit data in canvas
    const yRange = Math.max(maxY - minY, 10); // Minimum range
    const zRange = Math.max(maxZ - minZ, 10);
    const scale = Math.min(plotWidth / yRange, plotHeight / zRange) * 0.6; // Scale for grid visibility

    // Center point
    const centerY = rect.width / 2;
    const centerZ = rect.height / 2;

    // Draw grid first
    drawGrid(ctx, rect.width, rect.height, scale, centerY, centerZ);

    // Draw surface cross-section
    drawSurfaceCrossSection(ctx, surfaceInfo, rect.width, rect.height, scale, centerY, centerZ);

    // Draw main coordinate axes (thicker than grid)
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 2;
    
    // Y axis (vertical)
    ctx.beginPath();
    ctx.moveTo(centerY, padding);
    ctx.lineTo(centerY, rect.height - padding);
    ctx.stroke();
    
    // Z axis (horizontal)
    ctx.beginPath();
    ctx.moveTo(padding, centerZ);
    ctx.lineTo(rect.width - padding, centerZ);
    ctx.stroke();

    // Color map for wavelengths
    const getColor = (wavelength: number): string => {
      switch (wavelength) {
        case 633: return '#ff4444'; // Red
        case 532: return '#44ff44'; // Green  
        case 488: return '#4444ff'; // Blue
        default: return '#ffffff';
      }
    };

    // Draw hit points
    hitPoints.forEach((point: HitPoint) => {
      const screenY = centerY + (point.y - (minY + maxY) / 2) * scale;
      const screenZ = centerZ - (point.z - (minZ + maxZ) / 2) * scale; // Flip Z for screen coordinates

      ctx.fillStyle = getColor(point.wavelength);
      ctx.beginPath();
      ctx.arc(screenY, screenZ, 4, 0, 2 * Math.PI);
      ctx.fill();
      
      // Add slight glow effect
      ctx.shadowColor = getColor(point.wavelength);
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(screenY, screenZ, 2, 0, 2 * Math.PI);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Draw axis labels
    ctx.fillStyle = '#aaa';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Y', centerY, rect.height - 8);
    ctx.save();
    ctx.translate(12, centerZ);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Z', 0, 0);
    ctx.restore();
  };

  useEffect(() => {
    if (surfaceId) {
      drawHitMap();
    }
  }, [surfaceId, yamlContent]);

  // Redraw on window resize
  useEffect(() => {
    const handleResize = () => {
      if (surfaceId) {
        setTimeout(drawHitMap, 100);
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [surfaceId]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: '100%',
        borderRadius: '4px'
      }}
    />
  );
};
