import {spawn} from 'node:child_process';

// Each invocation is an argument array: paths never become shell commands.
export function startProcess(executable, args, {cwd, stdin = 'ignore', stdout = 'pipe'} = {}) {
  const child = spawn(executable, args.map(String), {
    cwd, windowsHide: true, stdio: [stdin, stdout, 'pipe'],
  });
  let diagnostic = '';
  child.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk.toString()).slice(-200000); });
  const completed = new Promise(resolve => {
    child.once('error', error => resolve({code: null, error, stderr: diagnostic}));
    child.once('close', (code, signal) => resolve({code, signal, stderr: diagnostic}));
  });
  return {child, completed};
}

export async function runProcess(executable, args, options = {}) {
  const process = startProcess(executable, args, options);
  const chunks = [];
  let bytes = 0;
  if (process.child.stdout) {
    process.child.stdout.on('data', chunk => {
      bytes += chunk.length;
      if (bytes <= (options.maxBuffer ?? 16 * 1024 * 1024)) chunks.push(chunk);
      else process.child.kill();
    });
  }
  const result = await process.completed;
  if (result.error || result.code !== 0) {
    throw new Error(`${executable} failed: ${result.error?.message ?? result.stderr.slice(-12000)}`);
  }
  return {stdout: Buffer.concat(chunks).toString('utf8'), stderr: result.stderr};
}

export async function assertProcess(process, label) {
  const result = await process.completed;
  if (result.error || result.code !== 0) {
    throw new Error(`${label}: ${result.error?.message ?? result.stderr.slice(-12000)}`);
  }
  return result;
}

export async function* readFixedFrames(stream, frameBytes) {
  let frame = Buffer.allocUnsafe(frameBytes);
  let filled = 0;
  for await (const chunk of stream) {
    let offset = 0;
    while (offset < chunk.length) {
      const take = Math.min(frameBytes - filled, chunk.length - offset);
      chunk.copy(frame, filled, offset, offset + take);
      offset += take;
      filled += take;
      if (filled === frameBytes) {
        yield frame;
        frame = Buffer.allocUnsafe(frameBytes);
        filled = 0;
      }
    }
  }
  if (filled) throw new Error('Source decoder returned an incomplete video frame');
}

export function parseLoudness(stderr) {
  const blocks = [...stderr.matchAll(/\{\s*"input_i"[\s\S]*?\}/g)];
  if (!blocks.length) throw new Error('FFmpeg did not return a loudness measurement');
  return JSON.parse(blocks.at(-1)[0]);
}

export function numberRate(value) {
  if (typeof value === 'number') return value;
  const [numerator, denominator = 1] = String(value).split('/').map(Number);
  return numerator / denominator;
}
