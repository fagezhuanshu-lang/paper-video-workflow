import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = '1.2.1';
const avVersion = '18.1.0'; // PyAV 19 removed an argument still used by faster-whisper 1.2.1.
const names = new Set(['tiny', 'tiny.en', 'base', 'base.en', 'small', 'small.en', 'medium', 'medium.en', 'large-v1', 'large-v2', 'large-v3', 'large-v3-turbo']);

function childRun(executable, args, {env, timeoutMs = 30 * 60 * 1000, onEvent} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '', stderr = '', pending = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      stdout = (stdout + chunk).slice(-1000000);
      pending += chunk;
      const lines = pending.split(/\r?\n/); pending = lines.pop();
      if (onEvent) for (const line of lines) {
        try { const event = JSON.parse(line); if (event.stage) onEvent(event); } catch {}
      }
    });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-20000); });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0 && !timedOut) resolve({stdout, stderr});
      else reject(new Error(timedOut ? 'Transcription/dependency process timed out; cached downloads remain available for an explicit retry.' : `${path.basename(executable)} failed (${code}): ${stderr.slice(-10000)}`));
    });
  });
}

function pathExecutables(name) {
  const suffix = process.platform === 'win32' ? '.exe' : '';
  return (process.env.PATH ?? '').split(path.delimiter).map(dir => path.join(dir, name + suffix))
    .filter(file => fs.existsSync(file) && !/[/\\]WindowsApps[/\\]/i.test(file));
}

async function findPython(pythonPath, env) {
  const explicit = pythonPath || process.env.VIDEO_PYTHON;
  const candidates = explicit ? [explicit] : [...pathExecutables('python'), ...pathExecutables('python3')];
  for (const executable of [...new Set(candidates)]) {
    try {
      const result = await childRun(executable, ['-c', 'import json,sys; print(json.dumps(list(sys.version_info[:3])))'], {env, timeoutMs: 15000});
      const v = JSON.parse(result.stdout.trim());
      if (v[0] === 3 && v[1] >= 11 && v[1] <= 13) return executable;
    } catch {}
  }
  throw new Error('Use Python 3.11–3.13 for optional transcription (Python 3.12 recommended). Install Python from https://www.python.org/downloads/, enable Add Python to PATH, or set VIDEO_PYTHON to the absolute python executable. This workflow does not install Python or change system packages.');
}

function speechEnvironment(runtimeDir) {
  const env = {...process.env,
    PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1',
    TEMP: path.join(runtimeDir, 'tmp'), TMP: path.join(runtimeDir, 'tmp'), TMPDIR: path.join(runtimeDir, 'tmp'),
    PIP_CACHE_DIR: path.join(runtimeDir, 'pip-cache'), PIP_DISABLE_PIP_VERSION_CHECK: '1', PIP_NO_INPUT: '1',
    PIP_CONFIG_FILE: process.platform === 'win32' ? 'NUL' : '/dev/null',
    PIP_INDEX_URL: 'https://pypi.org/simple', PIP_EXTRA_INDEX_URL: '',
    HF_HOME: path.join(runtimeDir, 'models'), HF_HUB_CACHE: path.join(runtimeDir, 'models', 'hub'),
    HF_HUB_DISABLE_IMPLICIT_TOKEN: '1', HF_HUB_DISABLE_TELEMETRY: '1', HF_HUB_DISABLE_XET: '1',
    HF_HUB_ETAG_TIMEOUT: '15', HF_HUB_DOWNLOAD_TIMEOUT: '30',
  };
  delete env.HF_TOKEN; delete env.HUGGING_FACE_HUB_TOKEN;
  return env;
}

async function ensureSpeechRuntime(pythonPath, runtimeDir, env, onProgress) {
  const venv = path.join(runtimeDir, 'speech');
  const python = path.join(venv, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const lock = path.join(runtimeDir, 'speech-setup.lock');
  let handle;
  try { handle = await fsp.open(lock, 'wx'); }
  catch (error) { if (error.code === 'EEXIST') throw new Error(`Another speech setup is active, or was interrupted. Check the recorded process before removing ${lock}.`); throw error; }
  await handle.writeFile(JSON.stringify({pid: process.pid, createdAt: new Date().toISOString()}));
  try {
    if (!fs.existsSync(python)) {
      const base = await findPython(pythonPath, env);
      onProgress({stage: 'speech-setup', action: 'create-local-venv'});
      await childRun(base, ['-m', 'venv', venv], {env, timeoutMs: 120000});
    }
    const inspectVersions = 'import json,importlib.metadata; import faster_whisper,av; print(json.dumps({k:importlib.metadata.version(k) for k in ("faster-whisper","av")}))';
    let installed;
    try { installed = JSON.parse((await childRun(python, ['-c', inspectVersions], {env, timeoutMs: 30000})).stdout); } catch {}
    if (installed?.['faster-whisper'] !== version || installed?.av !== avVersion) {
      onProgress({stage: 'speech-setup', action: 'install-faster-whisper', version, avVersion});
      await childRun(python, ['-m', 'pip', 'install', '--disable-pip-version-check', '--no-input', '--retries', '1', '--timeout', '30',
        '--only-binary=:all:', `faster-whisper==${version}`, `av==${avVersion}`], {env, timeoutMs: 15 * 60 * 1000});
      const actual = JSON.parse((await childRun(python, ['-c', inspectVersions], {env, timeoutMs: 30000})).stdout);
      if (actual['faster-whisper'] !== version || actual.av !== avVersion) throw new Error('The local transcription packages do not match the pinned versions');
    }
    const packages = JSON.parse((await childRun(python, ['-m', 'pip', 'list', '--format=json', '--disable-pip-version-check'], {env, timeoutMs: 30000})).stdout);
    await fsp.writeFile(path.join(runtimeDir, 'speech-installed.json'), JSON.stringify({python, fasterWhisper: version, pyAv: avVersion, packages}, null, 2));
    return python;
  } finally { await handle.close(); await fsp.unlink(lock); }
}

export async function transcribeVideo(video, {outDir, model = 'base', pythonPath, onProgress = () => {}} = {}) {
  if (!path.isAbsolute(video) || !fs.statSync(video).isFile()) throw new Error('transcribeVideo needs an existing absolute video path');
  if (!outDir || !path.isAbsolute(outDir)) throw new Error('Use an absolute outDir, normally inside .work or output');
  if (!names.has(model)) throw new Error('Use a supported Whisper model name, or supply VIDEO_WHISPER_MODEL_PATH for a local converted model');
  const runtimeDir = path.join(root, '.runtime');
  for (const directory of [runtimeDir, outDir, path.join(runtimeDir, 'tmp'), path.join(runtimeDir, 'pip-cache'), path.join(runtimeDir, 'models')]) await fsp.mkdir(directory, {recursive: true});
  for (const file of ['captions.json', 'captions.srt', 'full-transcript.txt', 'transcription-report.json']) {
    if (fs.existsSync(path.join(outDir, file))) throw new Error(`Transcription output already exists: ${file}. Use a new output directory to preserve the earlier review.`);
  }
  const env = speechEnvironment(runtimeDir);
  const localModel = process.env.VIDEO_WHISPER_MODEL_PATH;
  if (localModel && (!path.isAbsolute(localModel) || !fs.existsSync(path.join(localModel, 'model.bin')) || !fs.existsSync(path.join(localModel, 'config.json')))) {
    throw new Error('VIDEO_WHISPER_MODEL_PATH must be an absolute CTranslate2 Whisper model directory containing model.bin and config.json, not a .pt file');
  }
  const python = await ensureSpeechRuntime(pythonPath, runtimeDir, env, onProgress);
  const args = [path.join(root, 'scripts/transcribe.py'), '--video', video, '--out-dir', outDir, '--model', model,
    '--model-cache', path.join(runtimeDir, 'models')];
  if (localModel) args.push('--local-model', localModel);
  await childRun(python, args, {env, onEvent: onProgress});
  const reportPath = path.join(outDir, 'transcription-report.json');
  const report = JSON.parse(await fsp.readFile(reportPath, 'utf8'));
  return {captionsPath: path.join(outDir, 'captions.json'), srtPath: path.join(outDir, 'captions.srt'),
    transcriptPath: path.join(outDir, 'full-transcript.txt'), reportPath, ...report};
}
