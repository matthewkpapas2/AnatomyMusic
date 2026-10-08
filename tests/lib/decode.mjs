// Decode an audio file to stereo float PCM with ffmpeg (must be on PATH; on a Mac: `brew install ffmpeg`).
// The page decodes with the browser instead (decodeAudioData at the AudioContext's rate), so Node results
// can differ from the page by resampling and mp3-decoder details. The harness in tests/measure/ uses the
// browser's own decoder; this is for the Node-only reports.
import { spawn } from 'node:child_process';

export function decode(file, sr = 44100) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-acodec', 'pcm_f32le', '-ac', '2', '-ar', String(sr), 'pipe:1']);
    const chunks = []; let err = '';
    ff.stdout.on('data', (c) => chunks.push(c));
    ff.stderr.on('data', (c) => { err += c; });
    ff.on('error', (e) => reject(new Error(`ffmpeg not available: ${e.message}`)));
    ff.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg failed on ${file}: ${err.trim()}`));
      const buf = Buffer.concat(chunks), x = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength >> 2), n = x.length >> 1;
      const L = new Float32Array(n), R = new Float32Array(n);
      for (let i = 0; i < n; i++) { L[i] = x[2 * i]; R[i] = x[2 * i + 1]; }
      resolve({ L, R, sr });
    });
  });
}
