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
  }

  /**
   * Generate linear array of rays (equivalent to Python linear())
   */
  linear(width: number, dial: number = 0): void {
    this.sourceType = 'linear';
    this.rays = [];

    // Create linear array in local Y-Z plane
    // Add 90° offset so dial=0 points to 12 o'clock (positive Z)
    const dialRad = (dial + 90) * Math.PI / 180;
    const positions: Vector3[] = [];

    for (let i = 0; i < this.numberOfRays; i++) {
      const t = this.numberOfRays > 1 ? (i / (this.numberOfRays - 1)) * 2 - 1 : 0; // -1 to 1
      const localY = (t * width) / 2;
      
      // Apply dial rotation with 90° offset for 12 o'clock default
      const rotatedY = localY * Math.cos(dialRad);
      const rotatedZ = localY * Math.sin(dialRad);
      
      positions.push(new Vector3(0, rotatedY, rotatedZ));
    }

    // Transform to world coordinates and create rays
    this.createRaysFromPositions(positions);
  }

  /**
   * Generate ring pattern of rays (equivalent to Python ring())
   */
  ring(radius: number, aspectRatio: number = 1, dial: number = 0): void {
    this.sourceType = 'ring';
    this.rays = [];

    const dialRad = (dial * Math.PI) / 180;
    const positions: Vector3[] = [];

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

      positions.push(new Vector3(0, rotY, rotZ));
    }

    this.createRaysFromPositions(positions);
  }

  /**
   * Generate uniform hexagonal grid (equivalent to Python uniform())
   */
  uniform(radius: number): void {
    this.sourceType = 'uniform';
    this.rays = [];

    const positions: Vector3[] = [];
    
    // Center point
    if (this.numberOfRays > 0) {
      positions.push(new Vector3(0, 0, 0));
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
        positions.push(new Vector3(0, localY, localZ));
        raysAdded++;
        
        if (raysAdded >= this.numberOfRays) break;
      }
      layer++;
    }

    this.createRaysFromPositions(positions);
  }

  /**
   * Generate Gaussian distribution (equivalent to Python gaussian())
   */
  gaussian(halfESquare: number): void {
    this.sourceType = 'gaussian';
    this.rays = [];

    const sigma = halfESquare / (2 * Math.sqrt(2));
    const positions: Vector3[] = [];

    for (let i = 0; i < this.numberOfRays; i++) {
      // Box-Muller transform for normal distribution
      const u1 = Math.random();
      const u2 = Math.random();
      const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const z1 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);

      const localY = z0 * sigma;
      const localZ = z1 * sigma;
      positions.push(new Vector3(0, localY, localZ));
    }

    this.createRaysFromPositions(positions);
  }

  /**
   * Generate point source with divergence (equivalent to Python point())
   */
  point(divergence: number = 0): void {
    this.sourceType = 'point';
    this.divergence = divergence;
    this.rays = [];

    if (divergence > 0) {
      const directions: Vector3[] = [];
      
      // Generate exactly numberOfRays directions
      for (let i = 0; i < this.numberOfRays; i++) {
        // Generate random direction within cone
        const theta = Math.random() * 2 * Math.PI;
        const phi = Math.acos(1 - Math.random() * (1 - Math.cos(divergence)));
        
        const localX = Math.cos(phi);
        const localY = Math.sin(phi) * Math.cos(theta);
        const localZ = Math.sin(phi) * Math.sin(theta);
        
        directions.push(new Vector3(localX, localY, localZ));
      }

      this.createRaysFromDirections(directions);
    } else {
      // Generate numberOfRays identical rays at position
      for (let i = 0; i < this.numberOfRays; i++) {
        this.rays.push(new Ray(this.position, this.direction, this.wavelength, this.lid));
      }
    }
  }

  /**
   * Create rays from local positions (transform and orient)
   */
  private createRaysFromPositions(localPositions: Vector3[]): void {
    const rotationMatrix = this.getRotationMatrix();

    localPositions.forEach(localPos => {
      // Transform position to world coordinates
      const [worldY, worldZ, worldX] = rotationMatrix.transformPoint(localPos.y, localPos.z, localPos.x);
      const worldPosition = new Vector3(
        this.position.x + worldX,
        this.position.y + worldY,
        this.position.z + worldZ
      );

      // All rays have same direction for position-based sources
      const ray = new Ray(worldPosition, this.direction, this.wavelength, this.lid);
      this.rays.push(ray);
    });
  }

  /**
   * Create rays from local directions (for divergent sources)
   */
  private createRaysFromDirections(localDirections: Vector3[]): void {
    const rotationMatrix = this.getRotationMatrix();

    localDirections.forEach(localDir => {
      // Transform direction to world coordinates
      const [worldY, worldZ, worldX] = rotationMatrix.transformVector(localDir.y, localDir.z, localDir.x);
      const worldDirection = new Vector3(worldX, worldY, worldZ);

      // All rays start from same position for direction-based sources
      const ray = new Ray(this.position, worldDirection, this.wavelength, this.lid);
      this.rays.push(ray);
    });
  }

  /**
   * Get rotation matrix to transform from local coordinates to world coordinates
   */
  private getRotationMatrix(): Matrix4 {
    // Create rotation matrix to align [1,0,0] with this.direction
    const up = new Vector3(1, 0, 0);
    const target = this.direction.normalize();

    // If direction is already aligned with X-axis, return identity
    if (Math.abs(up.dot(target)) > 0.99999) {
      return target.x > 0 ? new Matrix4() : Matrix4.scaling(-1, 1, 1);
    }

    // Create rotation axis (cross product of up and target)
    const axis = up.cross(target).normalize();
    const angle = Math.acos(Math.max(-1, Math.min(1, up.dot(target))));

    // Create rotation matrix around axis
    return this.createRotationMatrix(axis, angle);
  }

  /**
   * Create rotation matrix around arbitrary axis
   */
  private createRotationMatrix(axis: Vector3, angle: number): Matrix4 {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const t = 1 - c;
    const x = axis.x, y = axis.y, z = axis.z;

    const matrix = new Matrix4();
    matrix.set(0, 0, t * x * x + c);
    matrix.set(0, 1, t * x * y - s * z);
    matrix.set(0, 2, t * x * z + s * y);
    matrix.set(1, 0, t * x * y + s * z);
    matrix.set(1, 1, t * y * y + c);
    matrix.set(1, 2, t * y * z - s * x);
    matrix.set(2, 0, t * x * z - s * y);
    matrix.set(2, 1, t * y * z + s * x);
    matrix.set(2, 2, t * z * z + c);

    return matrix;
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

    const direction = new Vector3(
      sourceData.vector?.[0] || 1,
      sourceData.vector?.[1] || 0,
      sourceData.vector?.[2] || 0
    ).normalize();

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
          const width = param?.[0] || 20;
          const dial = param?.[1] || 0;  // deg_cw (clockwise degrees)
          light.linear(width, dial);
        }
        break;
      case 'ring':
        {
          const radius = param?.[0] || 20;
          const aspectRatio = param?.[1] || 1;  // wh (width/height ratio)
          const dial = param?.[2] || 0;  // deg_cw (clockwise degrees)
          light.ring(radius, aspectRatio, dial);
        }
        break;
      case 'uniform':
        {
          const radius = param?.[0] || 20;
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
