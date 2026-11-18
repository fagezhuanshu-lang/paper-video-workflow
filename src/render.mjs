import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {createCanvas, GlobalFonts, ImageData, loadImage} from '@napi-rs/canvas';
import {getRuntime} from './runtime.mjs';
import {startProcess, runProcess, assertProcess, readFixedFrames, parseLoudness} from './render-process.mjs';
import {PERSON, validateLayout, paintFrame, sceneItems} from './render-layout.mjs';

function finite(value, label) {
  if (!Number.isFinite(value)) throw new Error(`${label} must be a finite number`);
  return value;
}

function checkProject(project) {
  const {width, height, fps} = project.output;
  if (!((width === 720 && height === 1280) || (width === 1080 && height === 1920)) || fps !== 30) {
    throw new Error('This renderer supports 720×1280 or 1080×1920 at 30 fps');
  }
  if (project.theme !== 'paper') throw new Error('This renderer currently supports the original paper theme only');
  const start = finite(project.source.start ?? 0, 'source.start');
  const end = finite(project.source.end, 'source.end');
  if (start < 0 || end <= start) throw new Error('Select a positive continuous source interval');
  const frames = Math.round((end - start) * fps);
  if (frames < 2) throw new Error('The selected interval must contain at least two frames');
  const duration = frames / fps;
  let previous = 0;
  for (const scene of project.scenes) {
    finite(scene.start, 'scene.start'); finite(scene.end, 'scene.end');
    if (Math.abs(scene.start - previous) > 1e-5 || scene.end <= scene.start || scene.end > duration + 1 / fps) {
      throw new Error('Scenes must continuously cover the selected output interval');
    }
    if (!['title', 'steps', 'quote', 'compare'].includes(scene.kind) || typeof scene.title !== 'string' || !scene.title.trim()) {
      throw new Error('Each scene needs a supported kind and a nonempty title');
    }
    previous = scene.end;
  }
  if (!project.scenes.length || Math.abs(previous - duration) > 1 / fps) throw new Error('Scenes must reach the end of the output');
  previous = 0;
  for (const caption of project.captions) {
    finite(caption.start, 'caption.start'); finite(caption.end, 'caption.end');
    if (caption.start < previous - 1e-5 || caption.end <= caption.start || caption.end > duration + 1 / fps || typeof caption.text !== 'string' || !caption.text.trim()) {
      throw new Error('Captions must be nonempty, ordered, nonoverlapping, and inside the selected output');
    }
    previous = caption.end;
  }
  finite(project.source.volumeDb ?? 0, 'source.volumeDb');
  if (project.music) {
    if (!project.music.file) throw new Error('A music entry requires a real file path');
    finite(project.music.gainDb ?? -22, 'music.gainDb');
  }
  return {width, height, fps, frames, duration, start, end};
}

function writeSoftCues(file, duration, events, gainDb) {
  const rate = 48000;
  const count = Math.ceil(duration * rate);
  const samples = new Float32Array(count);
  const amplitude = 10 ** (gainDb / 20);
  for (const at of events) {
    const offset = Math.round(at * rate);
    const length = Math.round(0.075 * rate);
    for (let n = 0; n < length && offset + n < count; n++) {
      // A short sine with a smooth envelope; synthesized here, no sampled sound library.
      const envelope = Math.sin(Math.PI * n / length) ** 2 * Math.exp(-3 * n / length);
      samples[offset + n] += amplitude * envelope * (Math.sin(2 * Math.PI * 720 * n / rate) + 0.25 * Math.sin(2 * Math.PI * 1080 * n / rate));
    }
  }
  const wav = Buffer.alloc(44 + count * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVE', 8);
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(count * 2, 40);
  for (let n = 0; n < count; n++) wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[n])) * 32767), 44 + n * 2);
  fs.writeFileSync(file, wav);
}

async function makeAudio(project, runtime, timing, workDir, onProgress) {
  const {ffmpeg} = runtime;
  const {duration, start} = timing;
  onProgress({stage: 'audio', ratio: 0});
  const voicePath = path.join(workDir, 'voice.wav');
  await runProcess(ffmpeg, ['-hide_banner', '-v', 'error', '-nostdin', '-y', '-ss', start, '-i', project.source.video,
    '-map', '0:a:0', '-vn', '-af', `volume=${project.source.volumeDb ?? 0}dB,apad,atrim=duration=${duration},asetpts=PTS-STARTPTS`,
    '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le', voicePath]);
  const inputs = ['-i', voicePath];
  const filters = ['[0:a]asetpts=PTS-STARTPTS[voice]'];
  const labels = ['[voice]'];
  let inputCount = 1;
  let musicPath;
  if (project.music) {
    musicPath = path.join(workDir, 'music.wav');
    const fadeIn = Math.min(0.5, duration / 4);
    const fadeOut = Math.min(0.8, duration / 4);
    await runProcess(ffmpeg, ['-hide_banner', '-v', 'error', '-nostdin', '-y', '-stream_loop', '-1', '-i', project.music.file,
      '-map', '0:a:0', '-vn', '-af', `atrim=duration=${duration},asetpts=PTS-STARTPTS,volume=${project.music.gainDb ?? -22}dB,afade=t=in:d=${fadeIn},afade=t=out:st=${duration - fadeOut}:d=${fadeOut}`,
      '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le', musicPath]);
    inputs.push('-i', musicPath);
    filters.push(`[${inputCount++}:a]asetpts=PTS-STARTPTS[music]`); labels.push('[music]');
  }
  const sfxEnabled = project.sfx !== false && project.sfx?.enabled !== false;
  const cueTimes = [...new Set(project.scenes.flatMap(scene => [scene.start, ...sceneItems(scene).map(item => item.at)])
    .map(at => Math.ceil(at * timing.fps - 1e-7) / timing.fps))]
    .filter(at => at >= 0 && at < duration).sort((a, b) => a - b);
  let sfxPath;
  if (sfxEnabled) {
    sfxPath = path.join(workDir, 'soft-cues.wav');
    writeSoftCues(sfxPath, duration, cueTimes, finite(project.sfx?.gainDb ?? -32, 'sfx.gainDb'));
    inputs.push('-i', sfxPath);
    filters.push(`[${inputCount++}:a]asetpts=PTS-STARTPTS[sfx]`); labels.push('[sfx]');
  }
  const mixedPath = path.join(workDir, 'mix-before-normalization.wav');
  filters.push(`${labels.join('')}amix=inputs=${labels.length}:duration=first:normalize=0,atrim=duration=${duration}[mix]`);
  await runProcess(ffmpeg, ['-hide_banner', '-v', 'error', '-nostdin', '-y', ...inputs, '-filter_complex', filters.join(';'),
    '-map', '[mix]', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le', mixedPath]);
  const measured = parseLoudness((await runProcess(ffmpeg, ['-hide_banner', '-nostats', '-nostdin', '-i', mixedPath,
    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'])).stderr);
  if (!Number.isFinite(Number(measured.input_i))) throw new Error('The selected audio is silent; check the source and soundtrack');
  const normalizedPath = path.join(workDir, 'mix-normalized.wav');
  const normalization = `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=false`;
  // Flush loudnorm's look-ahead with input silence. Some FFmpeg builds otherwise
  // drop a final partial window. Trim only after normalization and 48 kHz
  // resampling, so the complete real tail stays at its original sample position.
  const targetSamples = Math.round(duration * 48000);
  const normalizedFilter = `apad=pad_dur=3,${normalization},aresample=48000,atrim=end_sample=${targetSamples},asetpts=N/SR/TB`;
  await runProcess(ffmpeg, ['-hide_banner', '-v', 'error', '-nostdin', '-y', '-i', mixedPath, '-af', normalizedFilter,
    '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le', normalizedPath]);
  onProgress({stage: 'audio', ratio: 1});
  return {voicePath, musicPath, sfxPath, normalizedPath, measured,
    music: project.music ? {file: project.music.file, gainDb: project.music.gainDb ?? -22, license: project.music.license, source: project.music.source} : null,
    sfx: {enabled: sfxEnabled, synthesis: 'original sine tones with smooth envelopes', gainDb: project.sfx?.gainDb ?? -32,
      events: sfxEnabled ? cueTimes : []}};
}

export async function renderProject(project, {workDir, outputPath, coverPath, onProgress = () => {}}) {
  const timing = checkProject(project);
  if (!coverPath) throw new Error('A selected coverPath is required before final rendering');
  if (!path.isAbsolute(workDir) || !path.isAbsolute(outputPath)) throw new Error('Use absolute workDir and outputPath');
  if (fs.existsSync(outputPath)) throw new Error('Output already exists; choose a new output path');
  await fsp.mkdir(workDir, {recursive: true});
  await fsp.mkdir(path.dirname(outputPath), {recursive: true});
  const resolved = await getRuntime();
  const runtime = {ffmpeg: resolved.ffmpeg ?? resolved.ffmpegPath, ffprobe: resolved.ffprobe ?? resolved.ffprobePath, fontPath: resolved.fontPath};
  const metadata = JSON.parse((await runProcess(runtime.ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', project.source.video])).stdout);
  const sourceVideo = metadata.streams.find(stream => stream.codec_type === 'video');
  if (!sourceVideo || !metadata.streams.some(stream => stream.codec_type === 'audio')) throw new Error('Source must include real video and an audio stream');
  if (['smpte2084', 'arib-std-b67'].includes(sourceVideo.color_transfer)) throw new Error('HDR requires a separately validated color conversion; this renderer accepts SDR');
  if (timing.end > Number(sourceVideo.duration ?? metadata.format.duration) + 1 / timing.fps) throw new Error('Selected interval exceeds the source duration');
  const registered = GlobalFonts.registerFromPath(runtime.fontPath, 'WorkflowSans');
  if (!registered) throw new Error('Could not load the configured Chinese font');
  const canvas = createCanvas(timing.width, timing.height);
  const ctx = canvas.getContext('2d');
  validateLayout(project, ctx);
  const cover = await loadImage(coverPath);
  if (Math.abs(cover.width / cover.height - timing.width / timing.height) > 0.00001) throw new Error('Cover aspect ratio must match output; independent portrait cover may be proportionally downscaled');
  const scale = timing.width / 720;
  const personWidth = Math.round(PERSON.width * scale);
  const personHeight = Math.round(PERSON.height * scale);
  const personCanvas = createCanvas(personWidth, personHeight);
  const personContext = personCanvas.getContext('2d');
  const picturePath = path.join(workDir, 'picture.mp4');
  const decoder = startProcess(runtime.ffmpeg, ['-hide_banner', '-v', 'error', '-nostdin', '-threads', '2', '-filter_threads', '1',
    '-ss', timing.start, '-i', project.source.video, '-an', '-sn', '-dn',
    '-vf', `fps=${timing.fps},scale=${personWidth}:${personHeight}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${personWidth}:${personHeight}:(ow-iw)/2:(oh-ih)/2:color=0xfcfcf7,setsar=1,format=rgba,tpad=stop_mode=clone:stop_duration=0.034`,
    '-frames:v', timing.frames, '-f', 'rawvideo', 'pipe:1']);
  const encoder = startProcess(runtime.ffmpeg, ['-hide_banner', '-v', 'error', '-nostdin', '-y', '-threads', '2', '-filter_threads', '1',
    '-f', 'rawvideo', '-pixel_format', 'rgba', '-video_size', `${timing.width}x${timing.height}`, '-framerate', timing.fps, '-i', 'pipe:0',
    '-an', '-vf', 'scale=in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', '-frames:v', timing.frames,
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', picturePath], {stdin: 'pipe', stdout: 'ignore'});
  let pipeError;
  encoder.child.stdin.on('error', error => { pipeError = error; });
  let count = 0;
  try {
    onProgress({stage: 'picture', frame: 0, totalFrames: timing.frames, ratio: 0});
    for await (const frame of readFixedFrames(decoder.child.stdout, personWidth * personHeight * 4)) {
      if (pipeError) throw pipeError;
      personContext.putImageData(new ImageData(new Uint8ClampedArray(frame.buffer, frame.byteOffset, frame.byteLength), personWidth, personHeight), 0, 0);
      if (count === 0) ctx.drawImage(cover, 0, 0, timing.width, timing.height);
      else paintFrame(ctx, personCanvas, project, count / timing.fps);
      const data = ctx.getImageData(0, 0, timing.width, timing.height).data;
      await new Promise((resolve, reject) => encoder.child.stdin.write(Buffer.from(data.buffer, data.byteOffset, data.byteLength), error => error ? reject(error) : resolve()));
      count++;
      if (count % timing.fps === 0 || count === timing.frames) onProgress({stage: 'picture', frame: count, totalFrames: timing.frames, ratio: count / timing.frames});
    }
    if (count !== timing.frames) throw new Error(`Source produced ${count} frames; expected ${timing.frames}`);
    encoder.child.stdin.end();
    await Promise.all([assertProcess(decoder, 'Source decoder failed'), assertProcess(encoder, 'Video encoder failed')]);
  } catch (error) {
    decoder.child.kill(); encoder.child.kill();
    await Promise.all([decoder.completed, encoder.completed]);
    throw error;
  }
  const audio = await makeAudio(project, runtime, timing, workDir, onProgress);
  onProgress({stage: 'mux', ratio: 0});
  const partial = path.join(workDir, 'delivery.partial.mp4');
  await runProcess(runtime.ffmpeg, ['-hide_banner', '-v', 'error', '-nostdin', '-y', '-i', picturePath, '-i', audio.normalizedPath,
    '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    // Keep MP4 edit-list duration at audio-sample precision, not the default 1 ms.
    '-t', timing.duration, '-movie_timescale', '48000', '-movflags', '+faststart', partial]);
  await fsp.copyFile(partial, outputPath, fs.constants.COPYFILE_EXCL);
  onProgress({stage: 'mux', ratio: 1});
  return {outputPath, ...timing, source: {video: project.source.video, start: timing.start, end: timing.end},
    theme: 'original-paper', voice: audio.voicePath, audio: audio.normalizedPath,
    music: audio.music, sfx: audio.sfx, cover: {path: coverPath, outputFrame: 0, holdFrames: 1, audioShiftSeconds: 0},
    continuousSourceInterval: true, generatedWordTimings: false, humanListeningPerformed: false};
}
