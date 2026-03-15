/**
 * Recentre Panel - Generates a new YAML script with a selected surface
 * moved to [0,0,0] facing [-1,0,0] (default orientation).
 * All other elements are rigidly transformed to follow.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Matrix4, Vector3 } from '../math/Matrix4';
import type { OpticalSystem } from '../optical/OpticalSystem';
import * as yaml from 'js-yaml';

interface RecentrePanelProps {
  parsedData: any;
  parsedSystem: OpticalSystem | null;
}

/** Convert optical_train angles [azimuth, elevation] to normal vector (surface convention: default [-1,0,0]) */
function trainAnglesToNormal(angles: number[]): number[] {
  const azRad = (angles[0] || 0) * Math.PI / 180;
  const elRad = (angles[1] || 0) * Math.PI / 180;
  return [
    -Math.cos(elRad) * Math.cos(azRad),
    -Math.cos(elRad) * Math.sin(azRad),
    Math.sin(elRad)
  ];
}

/** Convert light_source angles [azimuth, elevation] to direction vector (light convention: default [1,0,0]) */
function lightAnglesToVector(angles: number[]): number[] {
  const azRad = (angles[0] || 0) * Math.PI / 180;
  const elRad = (angles[1] || 0) * Math.PI / 180;
  return [
    Math.cos(azRad) * Math.cos(elRad),
    Math.sin(azRad) * Math.cos(elRad),
    Math.sin(elRad)
  ];
}

/** Round array values, snapping near-zero to 0 */
function roundArr(arr: number[], decimals: number = 6): number[] {
  return arr.map(v => {
    const r = parseFloat(v.toFixed(decimals));
    return Math.abs(r) < 1e-9 ? 0 : r;
  });
}

/**
 * Compute the rigid-body transform that moves surfacePosition → origin
 * and rotates surfaceNormal → [-1,0,0].
 *
 * For any world point P:   P' = R * (P - P_s)
 * For any world vector V:  V' = R * V
 */
function buildRecentreTransform(surfacePosition: Vector3, surfaceNormal: Vector3) {
  const target = new Vector3(-1, 0, 0);
  const n = surfaceNormal.normalize();

  let R: Matrix4;
  const dot = n.dot(target);

  if (Math.abs(dot - 1.0) < 1e-10) {
    R = new Matrix4(); // identity – already aligned
  } else if (Math.abs(dot + 1.0) < 1e-10) {
    // Opposite direction → 180° around Z
    R = Matrix4.rotationFromAxisAngle(new Vector3(0, 0, 1), Math.PI);
  } else {
    const axis = n.cross(target).normalize();
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
    R = Matrix4.rotationFromAxisAngle(axis, angle);
  }

  return {
    /** Transform a position: P' = R(P - P_s) */
    point(p: number[]): number[] {
      const shifted = new Vector3(
        p[0] - surfacePosition.x,
        p[1] - surfacePosition.y,
        p[2] - surfacePosition.z
      );
      const out = R.transformPointV3(shifted);
      return [out.x, out.y, out.z];
    },
    /** Transform a direction vector: V' = R(V) */
    vector(v: number[]): number[] {
      const out = R.transformVectorV3(new Vector3(v[0], v[1], v[2]));
      return [out.x, out.y, out.z];
    }
  };
}

/**
 * Generate a new YAML string with the coordinate system recentred
 * on the chosen surface.
 */
function generateRecentredYaml(parsedData: any, surfacePosition: Vector3, surfaceNormal: Vector3): string {
  const T = buildRecentreTransform(surfacePosition, surfaceNormal);

  // Deep-clone so we don't mutate the live data
  const out: any = JSON.parse(JSON.stringify(parsedData));

  // --- Transform optical_trains ---
  if (out.optical_trains && Array.isArray(out.optical_trains)) {
    for (const trainGroup of out.optical_trains) {
      for (const key of Object.keys(trainGroup)) {
        const el = trainGroup[key];

        // Only transform assembly / standalone-surface placements
        if (el.aid !== undefined || el.sid !== undefined) {
          // Position
          if (el.position) {
            el.position = roundArr(T.point(el.position));
          } else {
            el.position = roundArr(T.point([0, 0, 0]));
          }

          // Direction → always express as "normal" vector after recentre
          let curNormal: number[];
          if (el.normal && Array.isArray(el.normal)) {
            curNormal = el.normal;
          } else if (el.angles && Array.isArray(el.angles)) {
            curNormal = trainAnglesToNormal(el.angles);
          } else {
            curNormal = [-1, 0, 0]; // default surface facing
          }
          el.normal = roundArr(T.vector(curNormal));
          delete el.angles;
        }
        // lid references have no position/direction – leave untouched
      }
    }
  }

  // --- Transform light_sources ---
  if (out.light_sources && Array.isArray(out.light_sources)) {
    for (const sourceGroup of out.light_sources) {
      for (const key of Object.keys(sourceGroup)) {
        const src = sourceGroup[key];

        // Position
        if (src.position) {
          src.position = roundArr(T.point(src.position));
        }

        // Direction → always express as "vector" after recentre
        let curVec: number[];
        if (src.vector && Array.isArray(src.vector)) {
          curVec = src.vector;
        } else if (src.angles && Array.isArray(src.angles)) {
          curVec = lightAnglesToVector(src.angles);
        } else {
          curVec = [1, 0, 0]; // default light direction
        }
        src.vector = roundArr(T.vector(curVec));
        delete src.angles;
      }
    }
  }

  return yaml.dump(out, {
    lineWidth: -1,       // no line wrapping
    flowLevel: 2,        // inline after depth 2 (keeps {key: val} style)
    noRefs: true,
    sortKeys: false,
    quotingType: '"'
  });
}

// ─── Component ───────────────────────────────────────────────────────────

export const RecentrePanel: React.FC<RecentrePanelProps> = ({ parsedData, parsedSystem }) => {
  const [selectedSurfaceIdx, setSelectedSurfaceIdx] = useState<number | null>(null);
  const [yamlOutput, setYamlOutput] = useState('');

  // Build surface list from parsedSystem
  const surfaceList = useMemo(() => {
    if (!parsedSystem || !parsedSystem.surfaces) return [];
    return parsedSystem.surfaces.map((s, idx) => ({
      idx,
      id: s.id,
      numericalId: s.numericalId ?? idx,
      assemblyId: s.assemblyId,
      label: s.assemblyId
        ? `Assem: ${s.assemblyId}, Surf: ${s.id}`
        : `Surf: ${s.id}`,
      position: s.position,
      normal: s.normal || new Vector3(-1, 0, 0)
    }));
  }, [parsedSystem]);

  const handleRecentre = useCallback(() => {
    if (selectedSurfaceIdx === null || !parsedData) return;
    const surf = surfaceList[selectedSurfaceIdx];
    if (!surf) return;

    const result = generateRecentredYaml(parsedData, surf.position, surf.normal);
    setYamlOutput(result);
  }, [selectedSurfaceIdx, parsedData, surfaceList]);

  const handleCopy = useCallback(async () => {
    if (!yamlOutput) return;
    try { await navigator.clipboard.writeText(yamlOutput); } catch { /* ignore */ }
  }, [yamlOutput]);

  return (
    <div className="recentre-panel">
      {/* Left – surface list */}
      <div className="recentre-surface-list-container">
        <div className="surface-list">
          <h3>Surfaces</h3>
          {surfaceList.length === 0 ? (
            <div className="no-surfaces">
              <p>No surfaces available</p>
              <p>Run ray trace first</p>
            </div>
          ) : (
            surfaceList.map((s, i) => (
              <div
                key={s.numericalId}
                className={`surface-item ${selectedSurfaceIdx === i ? 'selected' : ''}`}
                onClick={() => setSelectedSurfaceIdx(i)}
              >
                {s.label}
              </div>
            ))
          )}
        </div>
        {surfaceList.length > 0 && (
          <button
            className="menu-button recentre-button"
            disabled={selectedSurfaceIdx === null}
            onClick={handleRecentre}
          >
            Recentre
          </button>
        )}
      </div>

      {/* Right – YAML output */}
      <div className="recentre-yaml-output-container">
        <div className="recentre-yaml-header">
          <label>Recentred YAML</label>
          {yamlOutput && (
            <button className="copy-button" onClick={handleCopy} title="Copy to clipboard">
              📋 Copy
            </button>
          )}
        </div>
        <textarea
          className="yaml-textarea"
          readOnly
          value={yamlOutput}
          placeholder="Select a surface and click 'Recentre' to generate the transformed YAML..."
        />
      </div>

      <style>{`
        .recentre-panel {
          display: flex;
          gap: 8px;
          height: 100%;
          padding: 8px;
          min-height: 0;
        }
        .recentre-surface-list-container {
          flex: 0 0 200px;
          min-width: 180px;
          max-width: 220px;
          display: flex;
          flex-direction: column;
          min-height: 0;
          margin-right: 12px;
        }
        .recentre-surface-list-container .surface-list {
          flex: 1;
          overflow-y: auto;
          border: 1px solid var(--border);
          border-radius: 4px;
          background-color: var(--bg-secondary);
          min-height: 0;
        }
        .recentre-button {
          margin: 8px;
          padding: 6px 12px;
          font-size: 12px;
          border: 1px solid #555;
          background: #333;
          color: #fff;
          cursor: pointer;
          border-radius: 3px;
          text-align: center;
          transition: background 0.2s;
        }
        .recentre-button:hover:not(:disabled) {
          background: #444;
        }
        .recentre-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .recentre-yaml-output-container {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        .recentre-yaml-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 6px 8px;
          background: #2a2a2a;
          border: 1px solid var(--border);
          border-bottom: none;
          border-radius: 4px 4px 0 0;
        }
        .recentre-yaml-header label {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
        }
        .recentre-yaml-output-container .yaml-textarea {
          flex: 1;
          width: 100%;
          border: 1px solid var(--border);
          border-radius: 0 0 4px 4px;
          background: #1e1e1e;
          color: #88dd88;
          font-family: 'Monaco', 'Consolas', monospace;
          font-size: 12px;
          padding: 8px;
          resize: none;
          outline: none;
          min-height: 0;
        }
        .recentre-yaml-output-container .copy-button {
          padding: 2px 8px;
          font-size: 11px;
          border: 1px solid #555;
          background: #333;
          color: #fff;
          cursor: pointer;
          border-radius: 3px;
          transition: background 0.2s;
        }
        .recentre-yaml-output-container .copy-button:hover {
          background: #444;
        }
      `}</style>
    </div>
  );
};
