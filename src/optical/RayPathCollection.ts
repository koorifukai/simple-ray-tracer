import { Ray } from './LightSource';

/**
 * Represents a single ray path with its light ID and sequential ray points
 */
export interface RayPath {
  lightId: number;
  rays: Ray[];
  pathType: 'original' | 'transmitted' | 'reflected' | 'diffuse';
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
  addPath(lightId: number, rays: Ray[], pathType: RayPath['pathType'] = 'original', parentLightId?: number): void {
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
   * Analyze and log ray paths (replaces the old flattened logging)
   */
  logPathAnalysis(): void {
    console.log('\n📏 RAY PATH ANALYSIS BY LIGHT ID:');
    console.log('=' .repeat(60));

    if (this.paths.length === 0) {
      console.log('No ray paths to analyze');
      return;
    }

    // Group paths by light ID for analysis
    const pathsByLightId = new Map<number, RayPath[]>();
    this.paths.forEach(path => {
      if (!pathsByLightId.has(path.lightId)) {
        pathsByLightId.set(path.lightId, []);
      }
      pathsByLightId.get(path.lightId)!.push(path);
    });

    // Analyze each light ID separately
    const sortedLightIds = Array.from(pathsByLightId.keys()).sort((a, b) => a - b);
    
    sortedLightIds.forEach(lightId => {
      const lightPaths = pathsByLightId.get(lightId)!;
      this.analyzeSingleLight(lightId, lightPaths);
    });

    console.log('\n' + '='.repeat(60));
    console.log(`📈 Summary: Analyzed ${pathsByLightId.size} light ID(s) with ${this.paths.length} total path(s) and ${this.getTotalRayCount()} ray points`);
  }

  /**
   * Analyze paths for a single light ID
   */
  private analyzeSingleLight(lightId: number, paths: RayPath[]): void {
    // Classify light type
    const generation = Math.floor(lightId / 1000);
    const remainder = lightId - (generation * 1000);
    const surfaceNumber = Math.floor(remainder);
    const decimalPart = remainder - surfaceNumber;
    const ancestralLID = Math.round(decimalPart * 10);
    
    let classification: string;
    if (generation === 0) {
      classification = 'Original';
    } else {
      classification = `Shadow/Branched (Gen ${generation}, Surface ${surfaceNumber}, Ancestral ${ancestralLID})`;
    }

    console.log(`\n🔍 Light ID ${lightId}:`);
    console.log(`  Classification: ${classification}`);
    console.log(`  Path count: ${paths.length}`);
    
    // Analyze each path
    paths.forEach((path, pathIndex) => {
      console.log(`  Path ${pathIndex + 1} (${path.pathType}): ${path.rays.length} ray points`);
      
      // Calculate path segments
      let totalLength = 0;
      let validSegments = 0;
      
      for (let i = 0; i < path.rays.length - 1; i++) {
        const segmentLength = path.rays[i].position.distanceTo(path.rays[i + 1].position);
        
        if (segmentLength > 1e-6) {
          validSegments++;
          totalLength += segmentLength;
          console.log(`    Segment ${i + 1}→${i + 2}: ${segmentLength.toFixed(3)} units [${path.rays[i].position.x.toFixed(2)},${path.rays[i].position.y.toFixed(2)},${path.rays[i].position.z.toFixed(2)}] → [${path.rays[i + 1].position.x.toFixed(2)},${path.rays[i + 1].position.y.toFixed(2)},${path.rays[i + 1].position.z.toFixed(2)}]`);
        } else {
          console.log(`    Segment ${i + 1}→${i + 2}: ${segmentLength.toFixed(6)} units (too small) [${path.rays[i].position.x.toFixed(2)},${path.rays[i].position.y.toFixed(2)},${path.rays[i].position.z.toFixed(2)}] → [${path.rays[i + 1].position.x.toFixed(2)},${path.rays[i + 1].position.y.toFixed(2)},${path.rays[i + 1].position.z.toFixed(2)}]`);
        }
      }
      
      // Final point
      if (path.rays.length > 0) {
        const lastRay = path.rays[path.rays.length - 1];
        console.log(`    Final point: [${lastRay.position.x.toFixed(2)},${lastRay.position.y.toFixed(2)},${lastRay.position.z.toFixed(2)}] (Path length: ${lastRay.pathLength?.toFixed(3) || 'N/A'})`);
      }
      
      console.log(`    ✅ Total path length: ${totalLength.toFixed(3)} units`);
      console.log(`    📏 Valid segments: ${validSegments} (${path.rays.length - 1} expected)`);
      
      if (validSegments > 0) {
        console.log(`    📊 Average segment length: ${(totalLength / validSegments).toFixed(3)} units`);
      }
      
      const discontinuities = (path.rays.length - 1) - validSegments;
      if (discontinuities > 0) {
        console.log(`    ⚠️  Path discontinuities: ${discontinuities}`);
      }
    });
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