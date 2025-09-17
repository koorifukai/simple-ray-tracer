/**
 * Ray and Light Source definitions for optical ray tracing
 * Based on the Python EUREKA light class architecture
 */

import { Matrix4, Vector3 } from '../math/Matrix4';
import { getWavelengthColor } from './wavelength';

/**
 * Individual ray in the optical system
 */
export class Ray {
  public position: Vector3;
  public direction: Vector3;
  public wavelength: number;
  public intensity: number;
  public lightId: number;
  public pathLength: number;
  public isActive: boolean;
  public startsAt: number;  // Surface numerical ID where ray starts (usually 0)
  public stopsAt: number;   // Surface numerical ID where ray stops (undefined if reaches end)

  constructor(
    position: Vector3,
    direction: Vector3,
    wavelength: number = 587.6,
    lightId: number = -1,
    intensity: number = 1.0
  ) {
    this.position = position.clone();
    this.direction = direction.normalize();
    this.wavelength = wavelength;
    this.intensity = intensity;
    this.lightId = lightId;
    this.pathLength = 0;
    this.isActive = true;
    this.startsAt = 0;       // Usually starts from surface 0
    this.stopsAt = -1;       // -1 means ray reaches the end, positive number means stopped at that surface
  }

  /**
   * Propagate ray by distance along its direction
   */
  propagate(distance: number): void {
    this.position = this.position.add(this.direction.multiply(distance));
    this.pathLength += distance;
  }

  /**
   * Get color for visualization based on wavelength
   */
  getColor(): string {
    return getWavelengthColor(this.wavelength);
  }

  /**
   * Create a copy of this ray
   */
  clone(): Ray {
    return new Ray(
      this.position.clone(),
      this.direction.clone(),
      this.wavelength,
      this.lightId,
      this.intensity
    );
  }
}

/**
 * Light source types supported
 */
export type LightSourceType = 'linear' | 'ring' | 'uniform' | 'gaussian' | 'point';

/**
 * Simple seeded pseudo-random number generator for deterministic ray generation
 */
class SeededRNG {
  private seed: number;
  
  constructor(seed: number = 12345) {
    this.seed = seed;
  }
  
  random(): number {
    // Linear congruential generator (simple but effective for our needs)
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }
  
  setSeed(seed: number): void {
    this.seed = seed;
  }
}

/**
 * Light source - collection of rays with specific pattern
 */
export class LightSource {
  public lid: number;
  public position: Vector3;
  public direction: Vector3;
  public wavelength: number;
  public numberOfRays: number;
  public rays: Ray[];
  public sourceType: LightSourceType;
  public divergence: number;
  
  // Transformation matrices for proper 3D positioning (like surfaces)
  public forwardTransform: Matrix4 = new Matrix4();
  public inverseTransform: Matrix4 = new Matrix4();
  
  // Seeded RNG for deterministic ray generation during optimization
  private rng: SeededRNG = new SeededRNG(Date.now()); // Use current time as seed

  constructor(
    lid: number,
    position: Vector3,
    direction: Vector3,
    wavelength: number = 587.6,
    numberOfRays: number = 8
  ) {
    this.lid = lid;
    this.position = position.clone();
    this.direction = direction.normalize();
    this.wavelength = wavelength;
    this.numberOfRays = numberOfRays;
    this.rays = [];
    this.sourceType = 'linear';
    this.divergence = 0;
    
    // Create transformation matrices for this light source
    this.createTransformationMatrices();
  }

  /**
   * Reset RNG seed for deterministic ray generation (useful for optimization)
   */
  public resetSeed(seed: number = 12345): void {
    this.rng.setSeed(seed);
  }

  /**
   * Create transformation matrices for light source positioning
   * Creates proper rotation + translation to transform rays from local [1,0,0] to desired direction
   */
  private createTransformationMatrices(): void {
    // Create rotation matrix to align local +X axis with desired direction
    const localForward = new Vector3(1, 0, 0); // Default forward direction
    const targetDirection = this.direction.normalize();
    
    // If direction is already [1,0,0], no rotation needed
    if (Math.abs(targetDirection.dot(localForward) - 1.0) < 1e-10) {
      this.forwardTransform = Matrix4.translation(this.position.x, this.position.y, this.position.z);
    } else if (Math.abs(targetDirection.dot(localForward) + 1.0) < 1e-10) {
      // Direction is [-1,0,0], need 180° rotation
      const rotationMatrix = Matrix4.rotationFromAxisAngle(new Vector3(0, 0, 1), Math.PI);
      const translationMatrix = Matrix4.translation(this.position.x, this.position.y, this.position.z);
      this.forwardTransform = translationMatrix.multiply(rotationMatrix);
    } else {
      // General case: create rotation matrix using cross product
      const axis = localForward.cross(targetDirection).normalize();
      const angle = Math.acos(Math.max(-1, Math.min(1, localForward.dot(targetDirection))));
      
      const rotationMatrix = Matrix4.rotationFromAxisAngle(axis, angle);
      const translationMatrix = Matrix4.translation(this.position.x, this.position.y, this.position.z);
      this.forwardTransform = translationMatrix.multiply(rotationMatrix);
    }
    
    this.inverseTransform = this.forwardTransform.inverse();
  }

  /**
   * Set direction from angles: [azimuth, elevation] in degrees
   * [0,0] = parallel to +X axis
   * [45,-45] = 45° right-handed rotation about Z, then -45° elevation
   */
  setDirectionFromAngles(azimuth: number, elevation: number): void {
    const azimuthRad = azimuth * Math.PI / 180;
    const elevationRad = elevation * Math.PI / 180;
    
    // Start with +X direction [1,0,0]
    // Apply azimuth rotation about Z-axis (right-handed)
    // Then apply elevation rotation (negative elevation = downward)
    const cosAz = Math.cos(azimuthRad);
    const sinAz = Math.sin(azimuthRad);
    const cosEl = Math.cos(elevationRad);
    const sinEl = Math.sin(elevationRad);
    
    this.direction = new Vector3(
      cosAz * cosEl,  // X component
      sinAz * cosEl,  // Y component  
      sinEl           // Z component
    ).normalize();
  }

  /**
   * Generate linear array of rays (equivalent to Python linear())
   * Creates rays in local coordinate system with +X as forward direction
   */
  linear(width: number, dial: number = 0): void {
    this.sourceType = 'linear';
    this.rays = [];

    console.log(`🔍 LINEAR: Generating ${this.numberOfRays} rays with width=${width}, dial=${dial}`);

    // Generate rays in local coordinate system: +X = forward, Y-Z plane = perpendicular
    // Add 90° offset so dial=0 points to 12 o'clock (positive Z)
    const dialRad = (dial + 90) * Math.PI / 180;
    const rayData: { position: Vector3, direction: Vector3 }[] = [];

    for (let i = 0; i < this.numberOfRays; i++) {
      const t = this.numberOfRays > 1 ? (i / (this.numberOfRays - 1)) * 2 - 1 : 0; // -1 to 1
      const localOffset = (t * width) / 2;
      
      // Apply dial rotation in the Y-Z plane (perpendicular to light direction)
      const localY = localOffset * Math.cos(dialRad);
      const localZ = localOffset * Math.sin(dialRad);
      
      // Local position offset, local direction is always +X
      const localPosition = new Vector3(0, localY, localZ);
      const localDirection = new Vector3(1, 0, 0); // Always forward in local space
      
      if (i < 3 || i >= this.numberOfRays - 3) { // Log first and last few rays
        console.log(`  Ray ${i}: t=${t.toFixed(3)}, offset=${localOffset.toFixed(3)}, localPos=(${localPosition.x.toFixed(3)}, ${localPosition.y.toFixed(3)}, ${localPosition.z.toFixed(3)})`);
      }
      
      rayData.push({ position: localPosition, direction: localDirection });
    }

    // Transform all rays to world coordinates
    this.createRaysFromLocalData(rayData);
  }

  /**
   * Generate ring pattern of rays (equivalent to Python ring())
   * Creates rays in local coordinate system with +X as forward direction
   */
  ring(radius: number, aspectRatio: number = 1, dial: number = 0): void {
    this.sourceType = 'ring';
    this.rays = [];

    const dialRad = (dial * Math.PI) / 180;
    const rayData: { position: Vector3, direction: Vector3 }[] = [];

    // Calculate ellipse parameters
    let w = 1, h = 1;
    if (aspectRatio > 1) {
      h = h / aspectRatio;
    } else if (aspectRatio < 1) {
      w *= aspectRatio;
    }

    for (let i = 0; i < this.numberOfRays; i++) {
      const theta = (i / this.numberOfRays) * 2 * Math.PI;
      let localY = Math.cos(theta) * radius * w;
      let localZ = Math.sin(theta) * radius * h;

      // Apply dial rotation
      const rotY = localY * Math.cos(dialRad) - localZ * Math.sin(dialRad);
      const rotZ = localY * Math.sin(dialRad) + localZ * Math.cos(dialRad);

      // Local position offset, local direction is always +X
      const localPosition = new Vector3(0, rotY, rotZ);
      const localDirection = new Vector3(1, 0, 0); // Always forward in local space
      
      rayData.push({ position: localPosition, direction: localDirection });
    }

    this.createRaysFromLocalData(rayData);
  }

  /**
   * Generate uniform hexagonal grid (equivalent to Python uniform())
   * Creates rays in local coordinate system with +X as forward direction
   */
  uniform(radius: number): void {
    this.sourceType = 'uniform';
    this.rays = [];

    const rayData: { position: Vector3, direction: Vector3 }[] = [];
    
    // Center point
    if (this.numberOfRays > 0) {
      rayData.push({ 
        position: new Vector3(0, 0, 0), 
        direction: new Vector3(1, 0, 0) 
      });
    }

    // Generate remaining rays in concentric circles
    let raysAdded = 1;
    let layer = 1;
    
    while (raysAdded < this.numberOfRays) {
      const layerRadius = (layer * radius) / Math.max(1, Math.ceil(Math.sqrt(this.numberOfRays / 3.14))); // Approximate scaling
      const raysInThisLayer = Math.min(6 * layer, this.numberOfRays - raysAdded);
      
      for (let i = 0; i < raysInThisLayer; i++) {
        const angle = (i / raysInThisLayer) * 2 * Math.PI;
        const localY = layerRadius * Math.cos(angle);
        const localZ = layerRadius * Math.sin(angle);
        
        rayData.push({ 
          position: new Vector3(0, localY, localZ), 
          direction: new Vector3(1, 0, 0) 
        });
        raysAdded++;
        
        if (raysAdded >= this.numberOfRays) break;
      }
      layer++;
    }

    this.createRaysFromLocalData(rayData);
  }

  /**
   * Generate Gaussian distribution (equivalent to Python gaussian())
   * Creates rays in local coordinate system with +X as forward direction
   */
  gaussian(halfESquare: number): void {
    this.sourceType = 'gaussian';
    this.rays = [];

    const sigma = halfESquare / (2 * Math.sqrt(2));
    const rayData: { position: Vector3, direction: Vector3 }[] = [];

    for (let i = 0; i < this.numberOfRays; i++) {
      // Box-Muller transform for normal distribution using seeded RNG
      const u1 = this.rng.random();
      const u2 = this.rng.random();
      const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const z1 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);

      const localY = z0 * sigma;
      const localZ = z1 * sigma;
      
      rayData.push({ 
        position: new Vector3(0, localY, localZ), 
        direction: new Vector3(1, 0, 0) 
      });
    }

    this.createRaysFromLocalData(rayData);
  }

  /**
   * Generate point source with divergence (equivalent to Python point())
   * Creates divergent rays from a single point in local coordinate system
   */
  point(divergence: number = 0): void {
    this.sourceType = 'point';
    this.divergence = divergence;
    this.rays = [];

    const rayData: { position: Vector3, direction: Vector3 }[] = [];

    if (divergence > 0) {
      // Generate exactly numberOfRays directions within cone
      for (let i = 0; i < this.numberOfRays; i++) {
        // Generate random direction within cone using spherical coordinates
        const theta = this.rng.random() * 2 * Math.PI; // Azimuthal angle
        const phi = Math.acos(1 - this.rng.random() * (1 - Math.cos(divergence))); // Polar angle within cone
        
        // Local coordinate system: X = forward (main direction), Y = right, Z = up
        const localX = Math.cos(phi); // Forward component
        const localY = Math.sin(phi) * Math.cos(theta); // Right component  
        const localZ = Math.sin(phi) * Math.sin(theta); // Up component
        
        rayData.push({ 
          position: new Vector3(0, 0, 0), // All rays start from origin in local space
          direction: new Vector3(localX, localY, localZ) 
        });
      }
    } else {
      // No divergence: generate numberOfRays identical rays all pointing in +X direction
      for (let i = 0; i < this.numberOfRays; i++) {
        rayData.push({ 
          position: new Vector3(0, 0, 0), 
          direction: new Vector3(1, 0, 0) 
        });
      }
    }

    this.createRaysFromLocalData(rayData);
  }

  /**
   * Create rays from local position and direction data
   * Applies unified transformation to both position and direction
   */
  private createRaysFromLocalData(rayData: { position: Vector3, direction: Vector3 }[]): void {
    this.rays = [];
    
    rayData.forEach(data => {
      // Transform local position to world coordinates
      const worldPosition = this.forwardTransform.transformPointV3(data.position);
      
      // Transform local direction to world coordinates  
      const worldDirection = this.forwardTransform.transformVectorV3(data.direction);
      
      const ray = new Ray(worldPosition, worldDirection, this.wavelength, this.lid);
      this.rays.push(ray);
    });
  }

  /**
   * Get ray positions for visualization
   */
  getRayPositions(): { x: number[], y: number[], z: number[] } {
    const x: number[] = [];
    const y: number[] = [];
    const z: number[] = [];

    this.rays.forEach(ray => {
      if (ray.isActive) {
        x.push(ray.position.x);
        y.push(ray.position.y);
        z.push(ray.position.z);
      }
    });

    return { x, y, z };
  }

  /**
   * Get ray traces for visualization (position + short segment)
   */
  getRayTraces(length: number = 10): { x: number[][], y: number[][], z: number[][] } {
    const x: number[][] = [];
    const y: number[][] = [];
    const z: number[][] = [];

    this.rays.forEach(ray => {
      if (ray.isActive) {
        const start = ray.position;
        const end = start.add(ray.direction.multiply(length));
        
        x.push([start.x, end.x]);
        y.push([start.y, end.y]);
        z.push([start.z, end.z]);
      }
    });

    return { x, y, z };
  }

  /**
   * Generate and return rays for ray tracing visualization
   * Returns a limited number of rays for performance
   */
  generateRays(maxRays?: number): Ray[] {
    if (this.rays.length === 0) {
      // If no rays generated yet, create a default linear pattern
      this.linear(10);
    }
    
    if (maxRays && maxRays < this.rays.length) {
      return this.rays.slice(0, maxRays);
    }
    
    return this.rays;
  }
}

/**
 * Factory for creating light sources from YAML data
 */
export class LightSourceFactory {
  static createFromYAML(_id: string, sourceData: any): LightSource {
    const position = new Vector3(
      sourceData.position?.[0] || 0,
      sourceData.position?.[1] || 0,
      sourceData.position?.[2] || 0
    );

    let direction: Vector3;
    
    // Support both vector and angles for direction specification
    if (sourceData.angles && Array.isArray(sourceData.angles)) {
      // Use angles: [azimuth, elevation] in degrees
      const azimuth = sourceData.angles[0] || 0;
      const elevation = sourceData.angles[1] || 0;
      
      // Calculate direction from angles
      const azimuthRad = azimuth * Math.PI / 180;
      const elevationRad = elevation * Math.PI / 180;
      
      const cosAz = Math.cos(azimuthRad);
      const sinAz = Math.sin(azimuthRad);
      const cosEl = Math.cos(elevationRad);
      const sinEl = Math.sin(elevationRad);
      
      direction = new Vector3(
        cosAz * cosEl,  // X component
        sinAz * cosEl,  // Y component  
        sinEl           // Z component
      ).normalize();
    } else {
      // Use vector direction (existing behavior)
      direction = new Vector3(
        sourceData.vector?.[0] || 1,
        sourceData.vector?.[1] || 0,
        sourceData.vector?.[2] || 0
      ).normalize();
    }

    const light = new LightSource(
      sourceData.lid || 0,
      position,
      direction,
      sourceData.wavelength || 587.6,
      sourceData.number || 8
    );

    // Generate rays based on type with proper parameter parsing
    const type = sourceData.type || 'linear';
    let param = sourceData.param;

    // Ensure param is an array for consistent processing
    if (param !== null && param !== undefined && !Array.isArray(param)) {
      param = [param];
    }

    switch (type) {
      case 'linear':
        {
          const width = param?.[0] !== undefined ? param[0] : 20;
          const dial = param?.[1] !== undefined ? param[1] : 0;  // deg_cw (clockwise degrees)
          light.linear(width, dial);
        }
        break;
      case 'ring':
        {
          const radius = param?.[0] !== undefined ? param[0] : 20;
          const aspectRatio = param?.[1] !== undefined ? param[1] : 1;  // wh (width/height ratio)
          const dial = param?.[2] !== undefined ? param[2] : 0;  // deg_cw (clockwise degrees)
          light.ring(radius, aspectRatio, dial);
        }
        break;
      case 'uniform':
        {
          const radius = param?.[0] !== undefined ? param[0] : 20;
          light.uniform(radius);
        }
        break;
      case 'gaussian':
        {
          const halfESquare = param?.[0] || 20;
          light.gaussian(halfESquare);
        }
        break;
      case 'point':
        {
          if (param === null || param === undefined) {
            light.point(); // No divergence
          } else {
            const divergenceRadians = param?.[0] || 0; // Already in radians from Python
            light.point(divergenceRadians); // No conversion needed
          }
        }
        break;
      default:
        light.linear(20); // Default linear with width 20
    }

    return light;
  }
}
