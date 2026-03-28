/**
 * Animate Panel – Sequence animation for the optical ray tracer.
 *
 * Reads `sequence_settings` from YAML (same convention as HRT.py):
 *   sequence_settings:
 *     step: 30          # number of frames
 *     A1: [start, end]  # linspace range substituted for every occurrence of A1
 *     A2: [start, end]
 *     ...up to A4
 *
 * Workflow:
 *  1. Parse sequence_settings, compute per-frame values via linspace.
 *  2. For each frame, text-substitute A1..A4 into the YAML (skipping
 *     sequence_settings itself), parse → render → capture PNG from Plotly.
 *  3. Encode captured frames as WebM video → auto-download.
 *  4. Show each frame sequentially in the 3D plot, then resume normal mode.
 */

import React, { useState, useCallback } from 'react';
import { OpticalSystemParser } from '../optical/OpticalSystem';
import { VariableParser } from '../optimization';
import type { EmptyPlot3DHandle } from '../visualization/EmptyPlot3D';

// ── helpers ──────────────────────────────────────────────────────────────

/** np.linspace equivalent */
function linspace(start: number, end: number, n: number): number[] {
  if (n <= 1) return [start];
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(start + (end - start) * i / (n - 1));
  return out;
}

interface SeqVars {
  [key: string]: number[]; // A1 → [val_frame0, val_frame1, …]
}

/** Parse sequence_settings from parsed YAML data.
 *  Returns null if no valid sequence_settings found. */
function parseSequenceSettings(data: any): { steps: number; vars: SeqVars } | null {
  if (!data?.sequence_settings) return null;
  const ss = data.sequence_settings;
  const steps = parseInt(ss.step, 10);
  if (!steps || steps < 1) return null;

  const vars: SeqVars = {};
  for (const [k, v] of Object.entries(ss)) {
    if (k === 'step') continue;
    if (Array.isArray(v) && (v as number[]).length === 2) {
      vars[k] = linspace((v as number[])[0], (v as number[])[1], steps);
    }
  }
  if (Object.keys(vars).length === 0) return null;
  return { steps, vars };
}

/** Substitute A-variables AND V-variables in YAML text for a single frame.
 *  Skips the sequence_settings and optimization_settings blocks. */
function substituteFrame(rawYaml: string, frameVars: Record<string, number>): string {
  let out = rawYaml;

  // Identify blocks to protect (sequence_settings, optimization_settings)
  // We'll split and only substitute in non-protected sections.

  // Actually, let's do it the clean HRT way — work on the parsed dict.
  // But for simplicity (and matching V-variable handling), we'll do text substitution
  // on the part of the YAML that's NOT sequence_settings or optimization_settings.

  // Split the YAML into sections (top-level blocks start at col 0 with a key:)
  const sections = splitYamlTopLevel(out);
  const rebuilt: string[] = [];
  for (const sec of sections) {
    const trimmed = sec.trimStart();
    if (trimmed.startsWith('sequence_settings:') || trimmed.startsWith('optimization_settings:')) {
      rebuilt.push(sec); // keep as-is
    } else {
      let replaced = sec;
      for (const [tag, val] of Object.entries(frameVars)) {
        const regex = new RegExp(`\\b${tag}\\b`, 'g');
        replaced = replaced.replace(regex, val.toString());
      }
      rebuilt.push(replaced);
    }
  }
  return rebuilt.join('');
}

/** Split YAML string into top-level sections (each starting at column 0 with non-space char).
 *  Returns array of string chunks that concatenate to the original. */
function splitYamlTopLevel(text: string): string[] {
  const sections: string[] = [];
  const lines = text.split('\n');
  let current = '';
  for (const line of lines) {
    // A top-level key starts at col 0, is not a comment, and contains ':'
    if (current.length > 0 && /^[a-zA-Z_]/.test(line) && line.includes(':')) {
      sections.push(current);
      current = '';
    }
    current += line + '\n';
  }
  if (current.length > 0) sections.push(current);
  return sections;
}

type OutputFormat = 'webm' | 'mp4' | 'avi' | 'gif' | 'png-zip';

/** Encode frames as WebM video with explicit high bitrate to avoid blur. */
async function framesToWebm(
  dataUrls: string[],
  fps: number,
  width: number,
  height: number
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const stream = canvas.captureStream(0);
  // High bitrate — ~8 Mbps for HD, ~3 Mbps for SD. Prevents blur.
  const bps = width >= 1920 ? 10_000_000 : 5_000_000;
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bps });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
  });

  recorder.start();
  const delayMs = 1000 / fps;

  for (const url of dataUrls) {
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height);
        (stream.getVideoTracks()[0] as any).requestFrame?.();
        setTimeout(resolve, delayMs);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  recorder.stop();
  return done;
}

/** Encode frames as animated GIF using canvas (basic approach — larger files). */
async function framesToGif(
  dataUrls: string[],
  fps: number,
  width: number,
  height: number
): Promise<Blob> {
  // GIF encoding in-browser without a library is non-trivial.
  // Fallback: produce a WebM anyway but label it .gif for now,
  // or create individual PNGs in a zip.
  // For a real GIF we'd need a library like gif.js.
  // Let's fall back to WebM encoding but the caller will name it .gif.
  return framesToWebm(dataUrls, fps, width, height);
}

/** Bundle frames as a zip of individual PNGs. */
async function framesToPngZip(dataUrls: string[]): Promise<Blob> {
  // Without a zip library, concatenate PNGs as a simple download approach.
  // We'll create an HTML file that embeds all PNGs as a flipbook.
  const parts: string[] = [
    '<!DOCTYPE html><html><head><title>Animation Frames</title>',
    '<style>body{background:#1a1a1a;margin:0;text-align:center}img{max-width:100%;display:none}img.active{display:inline}',
    '#controls{color:#fff;padding:10px;font-family:monospace}</style></head><body>',
    `<div id="controls">Frame <span id="num">1</span>/${dataUrls.length} — Arrow keys or click to navigate</div>`
  ];
  dataUrls.forEach((url, i) => {
    parts.push(`<img id="f${i}" src="${url}" class="${i === 0 ? 'active' : ''}">`);
  });
  parts.push(`<script>
    let cur=0,n=${dataUrls.length};
    const show=i=>{document.getElementById('f'+cur).className='';cur=((i%n)+n)%n;document.getElementById('f'+cur).className='active';document.getElementById('num').textContent=cur+1};
    document.addEventListener('keydown',e=>{if(e.key==='ArrowRight')show(cur+1);if(e.key==='ArrowLeft')show(cur-1)});
    document.addEventListener('click',()=>show(cur+1));
  </script></body></html>`);
  return new Blob(parts, { type: 'text/html' });
}

/** Encode frames as MP4 using MediaRecorder (H.264 where supported, WebM fallback). */
async function framesToMp4(
  dataUrls: string[],
  fps: number,
  width: number,
  height: number
): Promise<{ blob: Blob; actualFormat: 'mp4' | 'webm' }> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const stream = canvas.captureStream(0);
  const bps = width >= 1920 ? 10_000_000 : 5_000_000;

  // Try H.264 MP4 MIME types in order of preference
  const mp4Types = [
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4;codecs=avc1',
    'video/mp4'
  ];
  let chosenMime = '';
  let isMp4 = false;
  for (const mt of mp4Types) {
    if (MediaRecorder.isTypeSupported(mt)) {
      chosenMime = mt;
      isMp4 = true;
      break;
    }
  }
  if (!chosenMime) {
    // Fallback to WebM
    chosenMime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';
  }

  const recorder = new MediaRecorder(stream, { mimeType: chosenMime, videoBitsPerSecond: bps });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: isMp4 ? 'video/mp4' : 'video/webm' }));
  });

  recorder.start();
  const delayMs = 1000 / fps;

  for (const url of dataUrls) {
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height);
        (stream.getVideoTracks()[0] as any).requestFrame?.();
        setTimeout(resolve, delayMs);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  recorder.stop();
  const blob = await done;
  return { blob, actualFormat: isMp4 ? 'mp4' : 'webm' };
}

// ── AVI (Motion JPEG) encoder ────────────────────────────────────────────

/** Convert a PNG data-URL to JPEG bytes via canvas re-encode. */
async function dataUrlToJpegBytes(dataUrl: string, width: number, height: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      c.toBlob(blob => {
        if (!blob) { reject(new Error('JPEG encode failed')); return; }
        blob.arrayBuffer().then(ab => resolve(new Uint8Array(ab)));
      }, 'image/jpeg', 0.92);
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/** Write a little-endian 32-bit unsigned int into a DataView. */
function writeU32(dv: DataView, off: number, val: number) { dv.setUint32(off, val, true); }
/** Write a little-endian 16-bit unsigned int into a DataView. */
function writeU16(dv: DataView, off: number, val: number) { dv.setUint16(off, val, true); }
/** Write a 4-byte ASCII tag. */
function writeFourCC(dv: DataView, off: number, tag: string) {
  for (let i = 0; i < 4; i++) dv.setUint8(off + i, tag.charCodeAt(i));
}

/** Encode frames as a Motion-JPEG AVI file (no external dependencies). */
async function framesToAvi(
  dataUrls: string[],
  fps: number,
  width: number,
  height: number
): Promise<Blob> {
  // Convert all frames to JPEG
  const jpegFrames: Uint8Array[] = [];
  for (const url of dataUrls) {
    jpegFrames.push(await dataUrlToJpegBytes(url, width, height));
  }

  const numFrames = jpegFrames.length;
  const usPerFrame = Math.round(1_000_000 / fps);

  // Compute padded frame sizes (AVI chunks must be 2-byte aligned)
  const paddedSizes = jpegFrames.map(f => f.length + (f.length % 2));

  // 'movi' list payload: each frame = 4 (fourcc '00dc') + 4 (size) + data + pad
  const moviPayload = paddedSizes.reduce((s, ps) => s + 8 + ps, 0);
  const moviListSize = 4 /* 'movi' tag */ + moviPayload;

  // idx1 chunk: 16 bytes per entry
  const idx1Size = 16 * numFrames;

  // hdrl sizes
  const avihSize = 56;       // MainAVIHeader
  const strhSize = 56;       // AVIStreamHeader
  const strfSize = 40;       // BITMAPINFOHEADER
  const strlListPayload = 4 + (8 + strhSize) + (8 + strfSize);
  const hdrlListPayload = 4 + (8 + avihSize) + (8 + 4 + strlListPayload);

  // Total RIFF size
  const riffPayload = 4 /* 'AVI ' */
    + (8 + hdrlListPayload)    // LIST hdrl
    + (8 + moviListSize)       // LIST movi
    + (8 + idx1Size);          // idx1

  const totalBytes = 8 + riffPayload;
  const buf = new ArrayBuffer(totalBytes);
  const dv = new DataView(buf);
  let o = 0;

  // RIFF header
  writeFourCC(dv, o, 'RIFF'); o += 4;
  writeU32(dv, o, riffPayload); o += 4;
  writeFourCC(dv, o, 'AVI '); o += 4;

  // LIST hdrl
  writeFourCC(dv, o, 'LIST'); o += 4;
  writeU32(dv, o, hdrlListPayload); o += 4;
  writeFourCC(dv, o, 'hdrl'); o += 4;

  // avih (Main AVI Header)
  writeFourCC(dv, o, 'avih'); o += 4;
  writeU32(dv, o, avihSize); o += 4;
  const avihStart = o;
  writeU32(dv, o, usPerFrame); o += 4;           // dwMicroSecPerFrame
  writeU32(dv, o, 0); o += 4;                    // dwMaxBytesPerSec (0 = unspecified)
  writeU32(dv, o, 0); o += 4;                    // dwPaddingGranularity
  writeU32(dv, o, 0x10); o += 4;                 // dwFlags: AVIF_HASINDEX
  writeU32(dv, o, numFrames); o += 4;            // dwTotalFrames
  writeU32(dv, o, 0); o += 4;                    // dwInitialFrames
  writeU32(dv, o, 1); o += 4;                    // dwStreams
  writeU32(dv, o, Math.max(...jpegFrames.map(f => f.length))); o += 4; // dwSuggestedBufferSize
  writeU32(dv, o, width); o += 4;                // dwWidth
  writeU32(dv, o, height); o += 4;               // dwHeight
  writeU32(dv, o, 0); o += 4; writeU32(dv, o, 0); o += 4;
  writeU32(dv, o, 0); o += 4; writeU32(dv, o, 0); o += 4; // dwReserved[4]
  console.assert(o - avihStart === avihSize);

  // LIST strl
  writeFourCC(dv, o, 'LIST'); o += 4;
  writeU32(dv, o, 4 + strlListPayload); o += 4;
  writeFourCC(dv, o, 'strl'); o += 4;

  // strh (Stream Header)
  writeFourCC(dv, o, 'strh'); o += 4;
  writeU32(dv, o, strhSize); o += 4;
  const strhStart = o;
  writeFourCC(dv, o, 'vids'); o += 4;            // fccType
  writeFourCC(dv, o, 'MJPG'); o += 4;            // fccHandler
  writeU32(dv, o, 0); o += 4;                    // dwFlags
  writeU16(dv, o, 0); o += 2;                    // wPriority
  writeU16(dv, o, 0); o += 2;                    // wLanguage
  writeU32(dv, o, 0); o += 4;                    // dwInitialFrames
  writeU32(dv, o, 1); o += 4;                    // dwScale
  writeU32(dv, o, fps); o += 4;                  // dwRate
  writeU32(dv, o, 0); o += 4;                    // dwStart
  writeU32(dv, o, numFrames); o += 4;            // dwLength
  writeU32(dv, o, Math.max(...jpegFrames.map(f => f.length))); o += 4; // dwSuggestedBufferSize
  writeU32(dv, o, 0xFFFFFFFF); o += 4;           // dwQuality (-1 = default)
  writeU32(dv, o, 0); o += 4;                    // dwSampleSize
  writeU16(dv, o, 0); o += 2; writeU16(dv, o, 0); o += 2; // rcFrame left,top
  writeU16(dv, o, width); o += 2; writeU16(dv, o, height); o += 2; // rcFrame right,bottom
  console.assert(o - strhStart === strhSize);

  // strf (BITMAPINFOHEADER)
  writeFourCC(dv, o, 'strf'); o += 4;
  writeU32(dv, o, strfSize); o += 4;
  const strfStart = o;
  writeU32(dv, o, strfSize); o += 4;             // biSize
  writeU32(dv, o, width); o += 4;                // biWidth
  writeU32(dv, o, height); o += 4;               // biHeight
  writeU16(dv, o, 1); o += 2;                    // biPlanes
  writeU16(dv, o, 24); o += 2;                   // biBitCount
  writeFourCC(dv, o, 'MJPG'); o += 4;            // biCompression
  writeU32(dv, o, width * height * 3); o += 4;   // biSizeImage
  writeU32(dv, o, 0); o += 4;                    // biXPelsPerMeter
  writeU32(dv, o, 0); o += 4;                    // biYPelsPerMeter
  writeU32(dv, o, 0); o += 4;                    // biClrUsed
  writeU32(dv, o, 0); o += 4;                    // biClrImportant
  console.assert(o - strfStart === strfSize);

  // LIST movi
  writeFourCC(dv, o, 'LIST'); o += 4;
  writeU32(dv, o, moviListSize); o += 4;
  writeFourCC(dv, o, 'movi'); o += 4;

  const moviStart = o - 4; // offset of 'movi' fourCC (for idx1 offsets)
  const frameOffsets: number[] = [];

  for (let i = 0; i < numFrames; i++) {
    frameOffsets.push(o - moviStart - 4); // offset from start of 'movi' data
    writeFourCC(dv, o, '00dc'); o += 4;   // stream 0, compressed video
    writeU32(dv, o, jpegFrames[i].length); o += 4;
    const dst = new Uint8Array(buf, o, jpegFrames[i].length);
    dst.set(jpegFrames[i]);
    o += jpegFrames[i].length;
    if (jpegFrames[i].length % 2 !== 0) {
      dv.setUint8(o, 0); o += 1; // padding byte
    }
  }

  // idx1
  writeFourCC(dv, o, 'idx1'); o += 4;
  writeU32(dv, o, idx1Size); o += 4;
  for (let i = 0; i < numFrames; i++) {
    writeFourCC(dv, o, '00dc'); o += 4;
    writeU32(dv, o, 0x10); o += 4;                 // AVIIF_KEYFRAME
    writeU32(dv, o, frameOffsets[i]); o += 4;
    writeU32(dv, o, jpegFrames[i].length); o += 4;
  }

  return new Blob([buf], { type: 'video/avi' });
}

// ── component ────────────────────────────────────────────────────────────

export interface AnimatePanelProps {
  yamlContent: string;
  parsedData: any;
  plotRef: React.RefObject<EmptyPlot3DHandle | null>;
  /** Called to override the parsedSystem shown in EmptyPlot3D.
   *  Pass null to resume normal rendering. */
  onSystemOverride: (system: any) => void;
  /** Called when animation finishes and normal mode should resume. */
  onAnimationDone: () => void;
}

export const AnimatePanel: React.FC<AnimatePanelProps> = ({
  yamlContent,
  parsedData,
  plotRef,
  onSystemOverride,
  onAnimationDone
}) => {
  const [status, setStatus] = useState('Idle');
  const [isAnimating, setIsAnimating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [fps, setFps] = useState(20);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('webm');
  const [resolution, setResolution] = useState<'640x480' | '1920x1080'>('640x480');

  const seqInfo = parseSequenceSettings(parsedData);

  const [resW, resH] = resolution === '1920x1080' ? [1920, 1080] : [640, 480];

  const handleAnimate = useCallback(async () => {
    if (!seqInfo || isAnimating) return;
    setIsAnimating(true);
    setStatus('Preparing…');

    const { steps, vars } = seqInfo;
    const frameImages: string[] = [];

    try {
      // Also handle V-variables (use midpoints, same as normal rendering)
      const vProblem = VariableParser.parseOptimizationProblem(yamlContent);
      const vMap: Record<string, number> = {};
      if (vProblem) {
        vProblem.variables.forEach(v => { vMap[v.name] = (v.min + v.max) / 2; });
      }

      for (let frame = 0; frame < steps; frame++) {
        setProgress({ current: frame + 1, total: steps });
        setStatus(`Rendering frame ${frame + 1}/${steps}…`);

        // Build per-frame substitution map (A-vars + V-vars)
        const frameMap: Record<string, number> = { ...vMap };
        for (const [tag, vals] of Object.entries(vars)) {
          frameMap[tag] = vals[frame];
        }

        // Substitute into YAML text
        const frameYaml = substituteFrame(yamlContent, frameMap);

        // Parse & render
        const system = await OpticalSystemParser.parseYAML(frameYaml);
        onSystemOverride(system);

        // Wait for Plotly to finish rendering
        await new Promise(r => setTimeout(r, 350));

        // Capture image at chosen resolution
        if (plotRef.current) {
          const dataUrl = await plotRef.current.toImage({ width: resW, height: resH });
          frameImages.push(dataUrl);
        }
      }

      // Encode & download FIRST, then playback
      setStatus(`Encoding as ${outputFormat}…`);
      try {
        let blob: Blob;
        let ext: string;
        if (outputFormat === 'png-zip') {
          blob = await framesToPngZip(frameImages);
          ext = 'html';
        } else if (outputFormat === 'gif') {
          blob = await framesToGif(frameImages, fps, resW, resH);
          ext = 'webm'; // GIF not natively supported in browser; WebM container
        } else if (outputFormat === 'mp4') {
          const result = await framesToMp4(frameImages, fps, resW, resH);
          blob = result.blob;
          ext = result.actualFormat;
        } else if (outputFormat === 'avi') {
          blob = await framesToAvi(frameImages, fps, resW, resH);
          ext = 'avi';
        } else {
          blob = await framesToWebm(frameImages, fps, resW, resH);
          ext = 'webm';
        }
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `animation_${ts}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setStatus(`Downloaded as .${ext}. Now playing back…`);
      } catch (err) {
        console.warn('Encoding failed, skipping download:', err);
        setStatus('Encoding failed. Playing back frames…');
      }

      // Playback AFTER download: show each frame sequentially in the 3D view
      const playbackDelay = 1000 / fps;
      for (let frame = 0; frame < steps; frame++) {
        setProgress({ current: frame + 1, total: steps });
        setStatus(`Playback ${frame + 1}/${steps}`);

        const frameMap: Record<string, number> = { ...vMap };
        for (const [tag, vals] of Object.entries(vars)) {
          frameMap[tag] = vals[frame];
        }
        const frameYaml = substituteFrame(yamlContent, frameMap);
        const system = await OpticalSystemParser.parseYAML(frameYaml);
        onSystemOverride(system);
        await new Promise(r => setTimeout(r, playbackDelay));
      }

      // Resume normal
      setStatus('Done — resuming normal mode');
      onSystemOverride(null as any);
      onAnimationDone();
    } catch (err) {
      console.error('Animation error:', err);
      setStatus(`Error: ${err instanceof Error ? err.message : 'unknown'}`);
      onSystemOverride(null as any);
    } finally {
      setIsAnimating(false);
    }
  }, [seqInfo, yamlContent, isAnimating, plotRef, onSystemOverride, onAnimationDone, fps, outputFormat, resW, resH]);

  return (
    <div className="animate-panel">
      <h3>Animate It</h3>

      {seqInfo ? (
        <div className="animate-info">
          <div className="animate-detail"><b>Frames:</b> {seqInfo.steps}</div>
          {Object.entries(seqInfo.vars).map(([tag, vals]) => (
            <div className="animate-detail" key={tag}>
              <b>{tag}:</b> {vals[0].toFixed(4)} → {vals[vals.length - 1].toFixed(4)}
            </div>
          ))}
        </div>
      ) : (
        <div className="animate-no-seq">
          <p>No <code>sequence_settings</code> found in YAML.</p>
          <p>Add a block like:</p>
          <pre>{`sequence_settings:\n  step: 30\n  A1: [0, 90]\n  A2: [-10, 10]`}</pre>
          <p>Then use <code>A1</code>, <code>A2</code> etc. as values anywhere in optical_trains or light_sources.</p>
        </div>
      )}

      {/* Settings */}
      <div className="animate-settings">
        <div className="animate-setting-row">
          <label htmlFor="anim-fps">FPS</label>
          <input
            id="anim-fps"
            type="number"
            min={1}
            max={60}
            value={fps}
            onChange={e => setFps(Math.max(1, Math.min(60, parseInt(e.target.value) || 20)))}
            disabled={isAnimating}
          />
        </div>
        <div className="animate-setting-row">
          <label htmlFor="anim-format">Format</label>
          <select
            id="anim-format"
            value={outputFormat}
            onChange={e => setOutputFormat(e.target.value as OutputFormat)}
            disabled={isAnimating}
          >
            <option value="webm">WebM video</option>
            <option value="mp4">MP4 video</option>
            <option value="avi">AVI (Motion JPEG)</option>
            <option value="gif">GIF (via WebM)</option>
            <option value="png-zip">PNG flipbook (HTML)</option>
          </select>
        </div>
        <div className="animate-setting-row">
          <label htmlFor="anim-res">Resolution</label>
          <select
            id="anim-res"
            value={resolution}
            onChange={e => setResolution(e.target.value as '640x480' | '1920x1080')}
            disabled={isAnimating}
          >
            <option value="640x480">640 × 480</option>
            <option value="1920x1080">1920 × 1080</option>
          </select>
        </div>
      </div>

      <div className="animate-controls">
        <button
          className="menu-button animate-button"
          disabled={!seqInfo || isAnimating}
          onClick={handleAnimate}
        >
          {isAnimating ? 'Animating…' : 'Animate It'}
        </button>
      </div>

      {(isAnimating || status !== 'Idle') && (
        <div className="animate-status">
          <div className="animate-status-text">{status}</div>
          {progress.total > 0 && (
            <div className="animate-progress-bar">
              <div
                className="animate-progress-fill"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          )}
        </div>
      )}

      <style>{`
        .animate-panel {
          height: 100%;
          display: flex;
          flex-direction: column;
          padding: 12px;
          background: #1a1a1a;
          color: #fff;
          font-family: 'Monaco','Consolas',monospace;
          overflow-y: auto;
        }
        .animate-panel h3 {
          margin: 0 0 10px;
          font-size: 14px;
        }
        .animate-info {
          margin-bottom: 12px;
        }
        .animate-detail {
          font-size: 12px;
          padding: 3px 0;
          color: #ccc;
        }
        .animate-detail b {
          color: #88dd88;
        }
        .animate-no-seq {
          font-size: 12px;
          color: #999;
          line-height: 1.5;
        }
        .animate-no-seq code {
          color: #88dd88;
          background: #2a2a2a;
          padding: 1px 4px;
          border-radius: 2px;
        }
        .animate-no-seq pre {
          background: #2a2a2a;
          padding: 8px;
          border-radius: 4px;
          color: #88dd88;
          font-size: 11px;
          overflow-x: auto;
        }
        .animate-settings {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 10px;
        }
        .animate-setting-row {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
        }
        .animate-setting-row label {
          min-width: 70px;
          color: #aaa;
        }
        .animate-setting-row input,
        .animate-setting-row select {
          flex: 1;
          padding: 3px 6px;
          background: #2a2a2a;
          border: 1px solid #555;
          color: #fff;
          border-radius: 3px;
          font-size: 12px;
          font-family: inherit;
        }
        .animate-setting-row input:disabled,
        .animate-setting-row select:disabled {
          opacity: 0.5;
        }
        .animate-controls {
          margin: 8px 0;
        }
        .animate-button {
          padding: 6px 16px;
          font-size: 13px;
          border: 1px solid #555;
          background: #333;
          color: #fff;
          cursor: pointer;
          border-radius: 3px;
          transition: background 0.2s;
        }
        .animate-button:hover:not(:disabled) { background: #444; }
        .animate-button:disabled { opacity: 0.5; cursor: not-allowed; }
        .animate-status {
          margin-top: 10px;
        }
        .animate-status-text {
          font-size: 12px;
          color: #aaa;
          margin-bottom: 6px;
        }
        .animate-progress-bar {
          height: 6px;
          background: #333;
          border-radius: 3px;
          overflow: hidden;
        }
        .animate-progress-fill {
          height: 100%;
          background: #4caf50;
          transition: width 0.15s;
        }
      `}</style>
    </div>
  );
};
