import {getRuntime} from './runtime.mjs';
import {runProcess, numberRate, parseLoudness} from './render-process.mjs';

export async function verifyVideo(file, {expectedFrames, expectedFps, width, height, expectedDuration, requireAudio = true} = {}) {
  const paths = await getRuntime();
  const ffmpeg = paths.ffmpeg ?? paths.ffmpegPath;
  const ffprobe = paths.ffprobe ?? paths.ffprobePath;
  const result = {file, passed: false, checks: {}, errors: [], humanListeningPerformed: false, visualReviewPerformed: false};
  try {
    result.probe = JSON.parse((await runProcess(ffprobe, ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', file])).stdout);
  } catch (error) {
    result.errors.push(`probe: ${error.message}`); result.checks.probe = false; return result;
  }
  result.checks.probe = true;
  const video = result.probe.streams.find(stream => stream.codec_type === 'video');
  const audio = result.probe.streams.find(stream => stream.codec_type === 'audio');
  result.checks.video = !!video;
  result.checks.audio = !requireAudio || !!audio;
  if (!video) { result.errors.push('No video stream'); return result; }
  const fps = numberRate(video.avg_frame_rate || video.r_frame_rate);
  const frames = Number(video.nb_read_frames ?? video.nb_frames);
  const duration = Number(video.duration ?? result.probe.format.duration);
  const frameTolerance = 1 / fps + 0.002;
  result.observed = {width: video.width, height: video.height, fps, frames, duration,
    audioDuration: audio ? Number(audio.duration ?? result.probe.format.duration) : null};
  if (width !== undefined) result.checks.width = video.width === width;
  if (height !== undefined) result.checks.height = video.height === height;
  if (expectedFrames !== undefined) result.checks.frames = frames === expectedFrames;
  if (expectedFps !== undefined) result.checks.fps = Math.abs(fps - numberRate(expectedFps)) < 1e-6;
  if (expectedDuration !== undefined) result.checks.duration = Math.abs(duration - expectedDuration) <= frameTolerance;
  if (audio) result.checks.audioDuration = Math.abs(result.observed.audioDuration - duration) <= Math.max(frameTolerance, 1024 / Number(audio.sample_rate) + 0.005);
  try {
    await runProcess(ffmpeg, ['-hide_banner', '-v', 'error', '-nostdin', '-xerror', '-err_detect', 'explode', '-i', file, '-f', 'null', '-']);
    result.decode = {passed: true}; result.checks.completeDecode = true;
  } catch (error) {
    result.decode = {passed: false, error: error.message}; result.checks.completeDecode = false; result.errors.push(`decode: ${error.message}`);
  }
  if (audio) {
    try {
      result.loudness = parseLoudness((await runProcess(ffmpeg, ['-hide_banner', '-nostats', '-nostdin', '-i', file, '-vn',
        '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'])).stderr);
      const integrated = Number(result.loudness.input_i);
      const peak = Number(result.loudness.input_tp);
      result.checks.integratedLoudness = Number.isFinite(integrated) && Math.abs(integrated + 16) <= 1;
      result.checks.truePeak = Number.isFinite(peak) && peak <= -1;
    } catch (error) {
      result.checks.loudnessMeasurement = false; result.errors.push(`loudness: ${error.message}`);
    }
  }
  result.passed = Object.values(result.checks).every(Boolean);
  return result;
}
