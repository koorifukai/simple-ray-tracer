/**
 * 3D Vector class for ray tracing calculations
 */
export class Vector3 {
  public x: number;
  public y: number;
  public z: number;

  constructor(x: number = 0, y: number = 0, z: number = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  // Vector addition
  add(v: Vector3): Vector3 {
    return new Vector3(this.x + v.x, this.y + v.y, this.z + v.z);
  }

  // Vector subtraction
  subtract(v: Vector3): Vector3 {
    return new Vector3(this.x - v.x, this.y - v.y, this.z - v.z);
  }

  // Scalar multiplication
  multiply(scalar: number): Vector3 {
    return new Vector3(this.x * scalar, this.y * scalar, this.z * scalar);
  }

  // Dot product
  dot(v: Vector3): number {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }

  // Cross product
  cross(v: Vector3): Vector3 {
    return new Vector3(
      this.y * v.z - this.z * v.y,
      this.z * v.x - this.x * v.z,
      this.x * v.y - this.y * v.x
    );
  }

  // Vector magnitude/length
  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }

  // Normalize vector
  normalize(): Vector3 {
    const len = this.length();
    if (len === 0) return new Vector3(0, 0, 0);
    return new Vector3(this.x / len, this.y / len, this.z / len);
  }

  // Reflect vector around normal
  reflect(normal: Vector3): Vector3 {
    return this.subtract(normal.multiply(2 * this.dot(normal)));
  }

  // Linear interpolation
  lerp(v: Vector3, t: number): Vector3 {
    return this.add(v.subtract(this).multiply(t));
  }

  // Convert to array for Plotly
  toArray(): [number, number, number] {
    return [this.x, this.y, this.z];
  }

  // Clone vector
  clone(): Vector3 {
    return new Vector3(this.x, this.y, this.z);
  }

  /**
   * Distance to another vector
   */
  distanceTo(other: Vector3): number {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    const dz = this.z - other.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Check if vector is nearly equal to another (with tolerance)
   */
  equals(other: Vector3, tolerance: number = 1e-10): boolean {
    return Math.abs(this.x - other.x) < tolerance &&
           Math.abs(this.y - other.y) < tolerance &&
           Math.abs(this.z - other.z) < tolerance;
  }

  /**
   * Check if vector is nearly zero
   */
  isZero(tolerance: number = 1e-10): boolean {
    return this.length() < tolerance;
  }

  /**
   * Get string representation
   */
  toString(precision: number = 3): string {
    return `[${this.x.toFixed(precision)}, ${this.y.toFixed(precision)}, ${this.z.toFixed(precision)}]`;
  }

  /**
   * Linear interpolation between two vectors
   */
  static lerp(a: Vector3, b: Vector3, t: number): Vector3 {
    return new Vector3(
      a.x + (b.x - a.x) * t,
      a.y + (b.y - a.y) * t,
      a.z + (b.z - a.z) * t
    );
  }

  // Static methods for common vectors
  static zero(): Vector3 {
    return new Vector3(0, 0, 0);
  }

  static one(): Vector3 {
    return new Vector3(1, 1, 1);
  }

  // Standard basis vectors
  static up(): Vector3 {
    return new Vector3(0, 1, 0);
  }

  static forward(): Vector3 {
    return new Vector3(0, 0, 1);
  }

  static right(): Vector3 {
    return new Vector3(1, 0, 0);
  }

  // Optical engineering coordinate system (X forward, Y right, Z up)
  static get OPTICAL_FORWARD(): Vector3 { return new Vector3(-1, 0, 0); }  // Optical axis forward
  static get OPTICAL_BACKWARD(): Vector3 { return new Vector3(1, 0, 0); }   // Optical axis backward
  static get OPTICAL_UP(): Vector3 { return new Vector3(0, 0, 1); }         // Optical up
  static get OPTICAL_RIGHT(): Vector3 { return new Vector3(0, 1, 0); }      // Optical right
}
