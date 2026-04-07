/**
 * Recentre Panel - Generates transformed optical_trains & light_sources YAML
 * with a selected surface moved to [0,0,0] facing a chosen target direction.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Matrix4, Vector3 } from '../math/Matrix4';
import type { OpticalSystem } from '../optical/OpticalSystem';
import * as yaml from 'js-yaml';

interface RecentrePanelProps {
  parsedData: any;
  parsedSystem: OpticalSystem | null;
  yamlContent: string;
  onYamlChange: (newYaml: string) => void;
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
 * and rotates surfaceNormal → targetDir.
 *
 * For any world point P:   P' = R * (P - P_s)
 * For any world vector V:  V' = R * V
 */
function buildRecentreTransform(surfacePosition: Vector3, surfaceNormal: Vector3, targetDir: Vector3) {
  const target = targetDir.normalize();
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
/** Return only the transformed optical_trains and light_sources sections as YAML text. */
function generateRecentredYaml(parsedData: any, surfacePosition: Vector3, surfaceNormal: Vector3, targetDir: Vector3): string {
  const T = buildRecentreTransform(surfacePosition, surfaceNormal, targetDir);

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

  // Only output the two affected sections
  const partial: any = {};
  if (out.optical_trains) partial.optical_trains = out.optical_trains;
  if (out.light_sources) partial.light_sources = out.light_sources;

  return yaml.dump(partial, {
    lineWidth: -1,       // no line wrapping
    flowLevel: 3,        // inline arrays but keep structure indented
    indent: 2,           // match typical source indentation
    noRefs: true,
    sortKeys: false,
    quotingType: '"'
  });
}

// ─── Text-level YAML section helpers ─────────────────────────────────────

/**
 * Extract top-level YAML sections from text into a map.
 * e.g. "optical_trains:\n  - …\nlight_sources:\n  - …" →
 *   { optical_trains: "optical_trains:\n  - …\n", light_sources: "light_sources:\n  - …\n" }
 */
function extractTopLevelSections(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  // Match top-level keys: non-indented lines starting with a word followed by ':'
  const lines = text.split('\n');
  let currentKey: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    const m = line.match(/^([a-zA-Z_]\w*):\s*/);
    if (m) {
      // Flush previous section
      if (currentKey !== null) {
        result[currentKey] = currentLines.join('\n') + '\n';
      }
      currentKey = m[1];
      currentLines = [line];
    } else if (currentKey !== null) {
      currentLines.push(line);
    }
  }
  if (currentKey !== null) {
    // Trim trailing empty lines then add single newline
    while (currentLines.length > 0 && currentLines[currentLines.length - 1].trim() === '') {
      currentLines.pop();
    }
    result[currentKey] = currentLines.join('\n') + '\n';
  }
  return result;
}

/**
 * In `sourceYaml`, find the top-level section `sectionKey:` and replace
 * its entire block (key line + all indented/continuation lines until the
 * next top-level key or EOF) with `replacement`.
 * Returns the modified YAML text. If the section isn't found, appends it.
 */
function replaceTopLevelSection(sourceYaml: string, sectionKey: string, replacement: string): string {
  const lines = sourceYaml.split('\n');
  const startPattern = new RegExp(`^${sectionKey}:\\s*`);

  let sectionStart = -1;
  let sectionEnd = lines.length; // default: to EOF

  for (let i = 0; i < lines.length; i++) {
    if (sectionStart === -1) {
      if (startPattern.test(lines[i])) {
        sectionStart = i;
      }
    } else {
      // We're inside the section — look for the next top-level key
      if (/^[a-zA-Z_]\w*:\s*/.test(lines[i])) {
        sectionEnd = i;
        break;
      }
    }
  }

  if (sectionStart === -1) {
    // Section not found — append
    return sourceYaml.trimEnd() + '\n' + replacement;
  }

  // Remove trailing blank lines from replacement before inserting
  const cleanReplacement = replacement.trimEnd();

  const before = lines.slice(0, sectionStart);
  const after = lines.slice(sectionEnd);

  // Preserve a blank line separator between sections if the original had one
  return [...before, cleanReplacement, ...after].join('\n');
}

// ─── Component ───────────────────────────────────────────────────────────

export const RecentrePanel: React.FC<RecentrePanelProps> = ({ parsedData, parsedSystem, yamlContent, onYamlChange }) => {
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

  const handleRecentre = useCallback((targetDir: Vector3) => {
    if (selectedSurfaceIdx === null || !parsedData) return;
    const surf = surfaceList[selectedSurfaceIdx];
    if (!surf) return;

    const result = generateRecentredYaml(parsedData, surf.position, surf.normal, targetDir);
    setYamlOutput(result);
  }, [selectedSurfaceIdx, parsedData, surfaceList]);

  const handleCopy = useCallback(async () => {
    if (!yamlOutput) return;
    try { await navigator.clipboard.writeText(yamlOutput); } catch { /* ignore */ }
  }, [yamlOutput]);

  /**
   * Surgically replace only the optical_trains and light_sources top-level
   * sections in the raw YAML text, leaving everything else byte-for-byte intact.
   */
  const handleApply = useCallback(() => {
    if (!yamlOutput || !yamlContent) return;

    // Extract the replacement text for each section from yamlOutput
    const newSections = extractTopLevelSections(yamlOutput);

    let result = yamlContent;
    for (const sectionKey of ['optical_trains', 'light_sources']) {
      const replacement = newSections[sectionKey];
      if (!replacement) continue;
      result = replaceTopLevelSection(result, sectionKey, replacement);
    }

    onYamlChange(result);
  }, [yamlOutput, yamlContent, onYamlChange]);

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
          <div className="recentre-buttons-row">
            <button
              className="menu-button recentre-button"
              disabled={selectedSurfaceIdx === null}
              onClick={() => handleRecentre(new Vector3(-1, 0, 0))}
              title="Recentre with surface normal → [-1,0,0]"
            >
              Recentre X−
            </button>
            <button
              className="menu-button recentre-button"
              disabled={selectedSurfaceIdx === null}
              onClick={() => handleRecentre(new Vector3(0, 0, 1))}
              title="Recentre with surface normal → [0,0,1]"
            >
              Recentre Z+
            </button>
          </div>
        )}
      </div>

      {/* Right – YAML output */}
      <div className="recentre-yaml-output-container">
        <div className="recentre-yaml-header">
          <label>Recentred YAML</label>
          <div className="recentre-yaml-header-buttons">
            {yamlOutput && (
              <>
                <button className="copy-button" onClick={handleApply} title="Apply to source YAML">
                  ✅ Apply
                </button>
                <button className="copy-button" onClick={handleCopy} title="Copy to clipboard">
                  📋 Copy
                </button>
              </>
            )}
          </div>
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
        .recentre-buttons-row {
          display: flex;
          gap: 4px;
          padding: 6px 8px;
        }
        .recentre-button {
          flex: 1;
          padding: 6px 4px;
          font-size: 11px;
          border: 1px solid #555;
          background: #333;
          color: #fff;
          cursor: pointer;
          border-radius: 3px;
          text-align: center;
          transition: background 0.2s;
          white-space: nowrap;
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
        .recentre-yaml-header-buttons {
          display: flex;
          gap: 4px;
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
