/**
 * 4x4 Homogeneous matrix mathematics for optical ray tracing
 * Proper 3D transformations using homogeneous coordinates
 */

/**
 * 4x4 Matrix representation in row-major order
 * [m00 m01 m02 m03]
 * [m10 m11 m12 m13]
 * [m20 m21 m22 m23]
 * [m30 m31 m32 m33]
 */
export class Matrix4 {
  public elements: Float64Array;

  constructor(elements?: number[]) {
    this.elements = new Float64Array(16);
    if (elements && elements.length === 16) {
      this.elements.set(elements);
    } else {
      this.identity();
    }
  }

  /**
   * Set to identity matrix
   */
  identity(): Matrix4 {
    this.elements.fill(0);
    this.elements[0] = 1;  // m00
    this.elements[5] = 1;  // m11
    this.elements[10] = 1; // m22
    this.elements[15] = 1; // m33
    return this;
  }

  /**
   * Create translation matrix
   */
  static translation(x: number, y: number, z: number): Matrix4 {
    const m = new Matrix4();
    m.elements[3] = x;   // m03
    m.elements[7] = y;   // m13
    m.elements[11] = z;  // m23
    return m;
  }

  /**
   * Create rotation matrix around X axis
   */
  static rotationX(angle: number): Matrix4 {
    const m = new Matrix4();
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    m.elements[5] = c;   // m11
    m.elements[6] = -s;  // m12
    m.elements[9] = s;   // m21
    m.elements[10] = c;  // m22
    return m;
  }

  /**
   * Create rotation matrix around Y axis
   */
  static rotationY(angle: number): Matrix4 {
    const m = new Matrix4();
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    m.elements[0] = c;   // m00
    m.elements[2] = s;   // m02
    m.elements[8] = -s;  // m20
    m.elements[10] = c;  // m22
    return m;
  }

  /**
   * Create rotation matrix around Z axis
   */
  static rotationZ(angle: number): Matrix4 {
    const m = new Matrix4();
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    m.elements[0] = c;   // m00
    m.elements[1] = -s;  // m01
    m.elements[4] = s;   // m10
    m.elements[5] = c;   // m11
    return m;
  }

  /**
   * Create scaling matrix
   */
  static scaling(x: number, y: number, z: number): Matrix4 {
    const m = new Matrix4();
    m.elements[0] = x;   // m00
    m.elements[5] = y;   // m11
    m.elements[10] = z;  // m22
    return m;
  }

  /**
   * Create transformation matrix from position and rotation
   */
  static createTransformation(position: Vector3, rotation: Vector3): Matrix4 {
    // Create rotation matrices for each axis
    const rotX = Matrix4.rotationX(rotation.x);
    const rotY = Matrix4.rotationY(rotation.y);
    const rotZ = Matrix4.rotationZ(rotation.z);
    
    // Create translation matrix
    const trans = Matrix4.translation(position.x, position.y, position.z);
    
    // Combine: T * Rz * Ry * Rx
    return trans.multiply(rotZ.multiply(rotY.multiply(rotX)));
  }

  /**
   * Create rotation matrix from axis and angle (Rodrigues' formula)
   */
  static rotationFromAxisAngle(axis: Vector3, angle: number): Matrix4 {
    const m = new Matrix4();
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const oneMinusCos = 1 - cos;
    
    const x = axis.x;
    const y = axis.y;
    const z = axis.z;
    
    // Rodrigues' rotation matrix formula
    m.elements[0] = cos + x * x * oneMinusCos;
    m.elements[1] = x * y * oneMinusCos - z * sin;
    m.elements[2] = x * z * oneMinusCos + y * sin;
    m.elements[3] = 0;
    
    m.elements[4] = y * x * oneMinusCos + z * sin;
    m.elements[5] = cos + y * y * oneMinusCos;
    m.elements[6] = y * z * oneMinusCos - x * sin;
    m.elements[7] = 0;
    
    m.elements[8] = z * x * oneMinusCos - y * sin;
    m.elements[9] = z * y * oneMinusCos + x * sin;
    m.elements[10] = cos + z * z * oneMinusCos;
    m.elements[11] = 0;
    
    m.elements[12] = 0;
    m.elements[13] = 0;
    m.elements[14] = 0;
    m.elements[15] = 1;
    
    return m;
  }

  /**
   * Matrix multiplication (this * other)
   */
  multiply(other: Matrix4): Matrix4 {
    const result = new Matrix4();
    const a = this.elements;
    const b = other.elements;
    const r = result.elements;

    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const i = row * 4 + col;
        r[i] = a[row * 4 + 0] * b[0 * 4 + col] +
               a[row * 4 + 1] * b[1 * 4 + col] +
               a[row * 4 + 2] * b[2 * 4 + col] +
               a[row * 4 + 3] * b[3 * 4 + col];
      }
    }
    return result;
  }

  /**
   * Transform a 3D point (homogeneous coordinates)
   */
  transformPoint(x: number, y: number, z: number): [number, number, number] {
    const m = this.elements;
    const w = m[12] * x + m[13] * y + m[14] * z + m[15];
    
    return [
      (m[0] * x + m[1] * y + m[2] * z + m[3]) / w,
      (m[4] * x + m[5] * y + m[6] * z + m[7]) / w,
      (m[8] * x + m[9] * y + m[10] * z + m[11]) / w
    ];
  }

  /**
   * Transform a 3D vector (direction, no translation)
   */
  transformVector(x: number, y: number, z: number): [number, number, number] {
    const m = this.elements;
    return [
      m[0] * x + m[1] * y + m[2] * z,
      m[4] * x + m[5] * y + m[6] * z,
      m[8] * x + m[9] * y + m[10] * z
    ];
  }

  /**
   * Transform a Vector3 point (homogeneous coordinates)
   */
  transformPointV3(point: Vector3): Vector3 {
    const [x, y, z] = this.transformPoint(point.x, point.y, point.z);
    return new Vector3(x, y, z);
  }

  /**
   * Transform a Vector3 direction (no translation)
   */
  transformVectorV3(vector: Vector3): Vector3 {
    const [x, y, z] = this.transformVector(vector.x, vector.y, vector.z);
    return new Vector3(x, y, z);
  }

  /**
   * Get inverse matrix (for coordinate transformations)
   */
  inverse(): Matrix4 {
    const m = this.elements;
    const inv = new Float64Array(16);
    
    // Calculate the inverse using cofactor expansion
    // This is the standard 4x4 matrix inversion algorithm
    inv[0] = m[5] * (m[10] * m[15] - m[11] * m[14]) -
             m[9] * (m[6] * m[15] - m[7] * m[14]) +
             m[13] * (m[6] * m[11] - m[7] * m[10]);
             
    inv[4] = -m[4] * (m[10] * m[15] - m[11] * m[14]) +
              m[8] * (m[6] * m[15] - m[7] * m[14]) -
              m[12] * (m[6] * m[11] - m[7] * m[10]);
              
    inv[8] = m[4] * (m[9] * m[15] - m[11] * m[13]) -
             m[8] * (m[5] * m[15] - m[7] * m[13]) +
             m[12] * (m[5] * m[11] - m[7] * m[9]);
             
    inv[12] = -m[4] * (m[9] * m[14] - m[10] * m[13]) +
               m[8] * (m[5] * m[14] - m[6] * m[13]) -
               m[12] * (m[5] * m[10] - m[6] * m[9]);

    inv[1] = -m[1] * (m[10] * m[15] - m[11] * m[14]) +
              m[9] * (m[2] * m[15] - m[3] * m[14]) -
              m[13] * (m[2] * m[11] - m[3] * m[10]);
              
    inv[5] = m[0] * (m[10] * m[15] - m[11] * m[14]) -
             m[8] * (m[2] * m[15] - m[3] * m[14]) +
             m[12] * (m[2] * m[11] - m[3] * m[10]);
             
    inv[9] = -m[0] * (m[9] * m[15] - m[11] * m[13]) +
              m[8] * (m[1] * m[15] - m[3] * m[13]) -
              m[12] * (m[1] * m[11] - m[3] * m[9]);
              
    inv[13] = m[0] * (m[9] * m[14] - m[10] * m[13]) -
              m[8] * (m[1] * m[14] - m[2] * m[13]) +
              m[12] * (m[1] * m[10] - m[2] * m[9]);

    inv[2] = m[1] * (m[6] * m[15] - m[7] * m[14]) -
             m[5] * (m[2] * m[15] - m[3] * m[14]) +
             m[13] * (m[2] * m[7] - m[3] * m[6]);
             
    inv[6] = -m[0] * (m[6] * m[15] - m[7] * m[14]) +
              m[4] * (m[2] * m[15] - m[3] * m[14]) -
              m[12] * (m[2] * m[7] - m[3] * m[6]);
              
    inv[10] = m[0] * (m[5] * m[15] - m[7] * m[13]) -
              m[4] * (m[1] * m[15] - m[3] * m[13]) +
              m[12] * (m[1] * m[7] - m[3] * m[5]);
              
    inv[14] = -m[0] * (m[5] * m[14] - m[6] * m[13]) +
               m[4] * (m[1] * m[14] - m[2] * m[13]) -
               m[12] * (m[1] * m[6] - m[2] * m[5]);

    inv[3] = -m[1] * (m[6] * m[11] - m[7] * m[10]) +
              m[5] * (m[2] * m[11] - m[3] * m[10]) -
              m[9] * (m[2] * m[7] - m[3] * m[6]);
              
    inv[7] = m[0] * (m[6] * m[11] - m[7] * m[10]) -
             m[4] * (m[2] * m[11] - m[3] * m[10]) +
             m[8] * (m[2] * m[7] - m[3] * m[6]);
             
    inv[11] = -m[0] * (m[5] * m[11] - m[7] * m[9]) +
               m[4] * (m[1] * m[11] - m[3] * m[9]) -
               m[8] * (m[1] * m[7] - m[3] * m[5]);
               
    inv[15] = m[0] * (m[5] * m[10] - m[6] * m[9]) -
              m[4] * (m[1] * m[10] - m[2] * m[9]) +
              m[8] * (m[1] * m[6] - m[2] * m[5]);

    // Calculate determinant
    const det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
    
    if (Math.abs(det) < 1e-15) {
      throw new Error('Matrix is not invertible (determinant is zero)');
    }

    // Scale by 1/determinant
    const result = new Matrix4();
    for (let i = 0; i < 16; i++) {
      result.elements[i] = inv[i] / det;
    }
    
    return result;
  }

  /**
   * Copy matrix
   */
  clone(): Matrix4 {
    return new Matrix4(Array.from(this.elements));
  }

  /**
   * Get matrix element at row, col (0-indexed)
   */
  get(row: number, col: number): number {
    return this.elements[row * 4 + col];
  }

  /**
   * Set matrix element at row, col (0-indexed)
   */
  set(row: number, col: number, value: number): void {
    this.elements[row * 4 + col] = value;
  }

  /**
   * Check if matrix is nearly equal to another (with tolerance)
   */
  equals(other: Matrix4, tolerance: number = 1e-10): boolean {
    for (let i = 0; i < 16; i++) {
      if (Math.abs(this.elements[i] - other.elements[i]) > tolerance) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get determinant of the matrix
   */
  determinant(): number {
    const m = this.elements;
    return m[0] * (m[5] * (m[10] * m[15] - m[11] * m[14]) -
                   m[9] * (m[6] * m[15] - m[7] * m[14]) +
                   m[13] * (m[6] * m[11] - m[7] * m[10])) -
           m[1] * (m[4] * (m[10] * m[15] - m[11] * m[14]) -
                   m[8] * (m[6] * m[15] - m[7] * m[14]) +
                   m[12] * (m[6] * m[11] - m[7] * m[10])) +
           m[2] * (m[4] * (m[9] * m[15] - m[11] * m[13]) -
                   m[8] * (m[5] * m[15] - m[7] * m[13]) +
                   m[12] * (m[5] * m[11] - m[7] * m[9])) -
           m[3] * (m[4] * (m[9] * m[14] - m[10] * m[13]) -
                   m[8] * (m[5] * m[14] - m[6] * m[13]) +
                   m[12] * (m[5] * m[10] - m[6] * m[9]));
  }

  /**
   * Get translation component from transformation matrix
   */
  getTranslation(): Vector3 {
    return new Vector3(this.elements[3], this.elements[7], this.elements[11]);
  }

  /**
   * Extract rotation matrix (upper-left 3x3) as new Matrix4
   */
  getRotationMatrix(): Matrix4 {
    const result = new Matrix4();
    result.elements[0] = this.elements[0];   // m00
    result.elements[1] = this.elements[1];   // m01
    result.elements[2] = this.elements[2];   // m02
    result.elements[4] = this.elements[4];   // m10
    result.elements[5] = this.elements[5];   // m11
    result.elements[6] = this.elements[6];   // m12
    result.elements[8] = this.elements[8];   // m20
    result.elements[9] = this.elements[9];   // m21
    result.elements[10] = this.elements[10]; // m22
    // Translation and homogeneous parts remain identity
    return result;
  }

  /**
   * Get string representation for debugging
   */
  toString(precision: number = 3): string {
    const e = this.elements;
    return `Matrix4:\n` +
           `[${e[0].toFixed(precision)}, ${e[1].toFixed(precision)}, ${e[2].toFixed(precision)}, ${e[3].toFixed(precision)}]\n` +
           `[${e[4].toFixed(precision)}, ${e[5].toFixed(precision)}, ${e[6].toFixed(precision)}, ${e[7].toFixed(precision)}]\n` +
           `[${e[8].toFixed(precision)}, ${e[9].toFixed(precision)}, ${e[10].toFixed(precision)}, ${e[11].toFixed(precision)}]\n` +
           `[${e[12].toFixed(precision)}, ${e[13].toFixed(precision)}, ${e[14].toFixed(precision)}, ${e[15].toFixed(precision)}]`;
  }
}

/**
 * 3D Vector class for optical calculations
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

  /**
   * Vector length (magnitude)
   */
  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }

  /**
   * Normalize vector to unit length
   */
  normalize(): Vector3 {
    const len = this.length();
    if (len < 1e-10) return new Vector3(1, 0, 0); // Default to X-axis for zero vectors
    return new Vector3(this.x / len, this.y / len, this.z / len);
  }

  /**
   * Dot product
   */
  dot(other: Vector3): number {
    return this.x * other.x + this.y * other.y + this.z * other.z;
  }

  /**
   * Cross product
   */
  cross(other: Vector3): Vector3 {
    return new Vector3(
      this.y * other.z - this.z * other.y,
      this.z * other.x - this.x * other.z,
      this.x * other.y - this.y * other.x
    );
  }

  /**
   * Vector addition
   */
  add(other: Vector3): Vector3 {
    return new Vector3(this.x + other.x, this.y + other.y, this.z + other.z);
  }

  /**
   * Vector subtraction
   */
  subtract(other: Vector3): Vector3 {
    return new Vector3(this.x - other.x, this.y - other.y, this.z - other.z);
  }

  /**
   * Scalar multiplication
   */
  multiply(scalar: number): Vector3 {
    return new Vector3(this.x * scalar, this.y * scalar, this.z * scalar);
  }

  /**
   * Copy vector
   */
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
}
