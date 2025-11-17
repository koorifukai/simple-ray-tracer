import { Ray } from './LightSource';

/**
 * Represents a single ray path with its light ID and sequential ray points
 */
export interface RayPath {
  lightId: number;
  rays: Ray[];
  pathType: 'primary' | 'shadow' | 'diffuse';
  parentLightId?: number; // For branched rays
}

/**
 * Collection of ray paths that preserves structure and eliminates flattening chaos
 * Handles ray tracing results without losing light ID relationships or path integrity
 */
export class RayPathCollection {
  private paths: RayPath[] = [];

  /**
   * Add a complete ray path to the collection
   */
  addPath(lightId: number, rays: Ray[], pathType: RayPath['pathType'] = 'primary', parentLightId?: number): void {
    if (rays.length === 0) return;

    this.paths.push({
      lightId,
      rays: [...rays], // Clone to prevent external modification
      pathType,
      parentLightId
    });
  }

  /**
   * Get all paths in the collection
   */
  getAllPaths(): RayPath[] {
    return [...this.paths]; // Return copy to prevent external modification
  }

  /**
   * Get paths for a specific light ID (with tolerance matching)
   */
  getPathsForLight(targetLightId: number, tolerance: number = 0.05): RayPath[] {
    return this.paths.filter(path => 
      Math.abs(path.lightId - targetLightId) < tolerance
    );
  }

  /**
   * Get all unique light IDs in the collection
   */
  getLightIds(): number[] {
    const uniqueIds = new Set(this.paths.map(path => path.lightId));
    return Array.from(uniqueIds).sort((a, b) => a - b);
  }

  /**
   * Get total number of paths
   */
  getPathCount(): number {
    return this.paths.length;
  }

  /**
   * Get total number of ray points across all paths
   */
  getTotalRayCount(): number {
    return this.paths.reduce((total, path) => total + path.rays.length, 0);
  }

  /**
   * Clear all paths
   */
  clear(): void {
    this.paths = [];
  }

  /**
   * Log path analysis (no-op for performance)
   */
  logPathAnalysis(): void {
    // Logging disabled - paths are analyzed via getVisualizationData() instead
  }

  /**
   * Get visualization data for Plotly (structured by light ID)
   */
  getVisualizationData(): Array<{ lightId: number; rays: Ray[]; pathType: string }> {
    return this.paths.map(path => ({
      lightId: path.lightId,
      rays: [...path.rays],
      pathType: path.pathType
    }));
  }

  /**
   * Legacy compatibility: get flattened ray array (use sparingly!)
   */
  getFlattenedRays(): Ray[] {
    console.warn('⚠️ Using deprecated flattened ray array - consider using structured paths instead');
    const flattened: Ray[] = [];
    this.paths.forEach(path => {
      flattened.push(...path.rays);
    });
    return flattened;
  }
}