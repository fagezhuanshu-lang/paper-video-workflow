// Original cover composition. It does not use MotionGit code or protected assets.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { getRuntime, run } from './runtime.mjs';
import { validateCover } from './cover-contract.mjs';

const FONT = 'Workflow Cover Noto Sans SC';
const palettes = {
  paper: { bg: '#eeeadd', paper: '#faf8ef', ink: '#142e24', muted: '#586b60', accent: '#247b55', line: '#c6cdbd', light: '#e2eadb' },
  tech: { bg: '#071321', paper: '#101f32', ink: '#f1f7ff', muted: '#adc0db', accent: '#53e2db', line: '#36536c', light: '#17384c' },
};
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function rounded(ctx, x, y, width, height, radius, fill, stroke) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}

function drawCover(cover, height, photo, palette) {
  const canvas = createCanvas(1080, height);
  const ctx = canvas.getContext('2d');
  ctx.lang = 'zh-CN';
  const textBounds = [];
  const offset = (height - 1440) / 2;
  const text = (value, x, y, size, color, maxWidth, weight = 700, align = 'left', field = '') => {
    ctx.font = `${weight} ${size}px "${FONT}"`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    const metric = ctx.measureText(String(value));
    if (metric.width > maxWidth) throw new Error(`Cover text does not fit at its readable font size: ${field || value}. Shorten the phrase or change layout.`);
    ctx.fillStyle = color;
    ctx.fillText(String(value), x, y);
    textBounds.push({ field, text: String(value), width: metric.width, allowedWidth: maxWidth, fontSize: size });
  };
  const gradient = ctx.createLinearGradient(0, 0, 1080, 0);
  gradient.addColorStop(0, palette.bg);
  gradient.addColorStop(0.54, palette.paper);
  gradient.addColorStop(0.55, palette.bg);
  gradient.addColorStop(1, palette.paper);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1080, height);
  ctx.strokeStyle = palette.line;
  ctx.globalAlpha = 0.35;
  ctx.beginPath(); ctx.moveTo(654, 0); ctx.lineTo(540, height); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.save(); ctx.translate(0, offset);
  ctx.strokeStyle = palette.accent; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(82, 132); ctx.lineTo(144, 132); ctx.stroke();
  text(cover.kicker, 166, 144, 27, palette.muted, 820, 600, 'left', 'kicker');
  text(cover.titleLines[0], 76, 310, 120, palette.ink, 928, 700, 'left', 'titleLines.0');
  text(cover.titleLines[1], 76, 460, 120, palette.accent, 928, 700, 'left', 'titleLines.1');
  ctx.strokeStyle = palette.line; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(82, 495); ctx.lineTo(966, 495); ctx.stroke();
  text(cover.deck, 82, 554, 35, palette.muted, 924, 500, 'left', 'deck');

  const cardX = photo ? 80 : 180;
  const cardWidth = photo ? 410 : 720;
  ctx.save();
  ctx.translate(cardX + cardWidth / 2, 925); ctx.rotate(-3 * Math.PI / 180); ctx.translate(-cardX - cardWidth / 2, -925);
  ctx.save(); ctx.shadowColor = '#00000024'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 8;
  rounded(ctx, cardX, 686, cardWidth, 518, 24, palette.paper, palette.line);
  ctx.restore();
  text(cover.visual.label, cardX + 30, 747, 28, palette.muted, cardWidth - 60, 500, 'left', 'visual.label');
  ctx.strokeStyle = palette.line;
  ctx.beginPath(); ctx.moveTo(cardX + 30, 776); ctx.lineTo(cardX + cardWidth - 30, 776); ctx.stroke();
  const labels = cover.visual.labels;
  const spacing = labels.length === 1 ? 190 : labels.length === 2 ? 150 : 112;
  const firstY = labels.length === 1 ? 884 : 828;
  labels.forEach((label, i) => {
    const y = firstY + i * spacing;
    rounded(ctx, cardX + 26, y - 24, cardWidth - 52, 78, 12, palette.light);
    if (cover.visual.kind === 'process') {
      ctx.fillStyle = palette.accent;
      ctx.beginPath(); ctx.arc(cardX + 62, y + 15, 20, 0, Math.PI * 2); ctx.fill();
      text(i + 1, cardX + 62, y + 23, 24, palette.bg, 35, 700, 'center', `step-number.${i}`);
      text(label, cardX + 99, y + 29, 35, palette.ink, cardWidth - 125, 700, 'left', `visual.labels.${i}`);
      if (i < labels.length - 1) {
        const x = cardX + cardWidth / 2;
        ctx.strokeStyle = palette.accent; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x, y + 60); ctx.lineTo(x, y + 82); ctx.moveTo(x - 7, y + 75); ctx.lineTo(x, y + 82); ctx.lineTo(x + 7, y + 75); ctx.stroke();
      }
    } else {
      text(label, cardX + cardWidth / 2, y + 29, labels.length === 1 ? 43 : 38, palette.ink, cardWidth - 80, 700, 'center', `visual.labels.${i}`);
    }
  });
  ctx.restore();

  if (photo) {
    ctx.save(); ctx.translate(764, 970); ctx.rotate(3 * Math.PI / 180); ctx.translate(-764, -970);
    ctx.save(); ctx.shadowColor = '#00000030'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 8;
    rounded(ctx, 522, 637, 482, 696, 8, palette.paper);
    ctx.restore();
    const box = { x: 532, y: 647, width: 462, height: 630 };
    const scale = Math.min(box.width / photo.width, box.height / photo.height);
    const width = photo.width * scale, photoHeight = photo.height * scale;
    ctx.fillStyle = palette.light; ctx.fillRect(box.x, box.y, box.width, box.height);
    ctx.drawImage(photo, box.x + (box.width - width) / 2, box.y + (box.height - photoHeight) / 2, width, photoHeight);
    text('原片画面', 551, 1311, 20, palette.muted, 400, 500, 'left', 'photo-label');
    ctx.restore();
  }
  ctx.strokeStyle = palette.line; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(82, 1375); ctx.lineTo(996, 1375); ctx.stroke();
  ctx.fillStyle = palette.accent; ctx.beginPath(); ctx.arc(90, 1405, 5, 0, Math.PI * 2); ctx.fill();
  text(cover.kicker, 108, 1413, 22, palette.muted, 880, 500, 'left', 'footer');
  ctx.restore();
  return { canvas, textBounds };
}

async function writeNew(file, bytes) {
  await fs.writeFile(file, bytes, { flag: 'wx' });
  return { path: file, bytes: bytes.length, sha256: digest(bytes) };
}

/** Prepare fixed-ratio independent covers from an already reviewed content plan. */
export async function renderCovers(project, { workDir, onProgress } = {}) {
  validateCover(project?.cover);
  if (!workDir) throw new Error('renderCovers needs a workDir.');
  const runtime = await getRuntime();
  if (!runtime.fontPath || !GlobalFonts.registerFromPath(runtime.fontPath, FONT)) throw new Error('The configured open font could not be registered. Run doctor before building.');
  const coverDir = path.join(path.resolve(workDir), 'cover');
  await fs.mkdir(path.dirname(coverDir), { recursive: true });
  try { await fs.mkdir(coverDir); } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Cover output already exists: ${coverDir}. Use a new build directory; prior covers and reviews are preserved.`);
    throw error;
  }
  const cover = project.cover;
  let photo = null, photoRecord = null;
  if (cover.photoTime != null) {
    const sourceVideo = project.source?.video;
    if (!sourceVideo || !path.isAbsolute(sourceVideo)) throw new Error('Resolve source.video to an absolute local path before renderCovers.');
    const probe = JSON.parse((await run(runtime.ffprobe, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', sourceVideo])).stdout);
    const stream = probe.streams?.find((entry) => entry.codec_type === 'video');
    const duration = Number(stream?.duration || probe.format?.duration);
    if (!stream || !Number.isFinite(duration) || cover.photoTime >= duration) throw new Error('cover.photoTime is outside the actual source video.');
    if (['smpte2084', 'arib-std-b67'].includes(stream.color_transfer)) throw new Error('HDR cover extraction needs a declared colour conversion; this renderer accepts SDR sources.');
    const photoFile = path.join(coverDir, 'source-frame.png');
    onProgress?.({ phase: 'cover', message: 'Extracting the selected real source frame.' });
    await run(runtime.ffmpeg, ['-n', '-hide_banner', '-loglevel', 'error', '-ss', String(cover.photoTime), '-i', sourceVideo, '-map', '0:v:0', '-frames:v', '1', '-update', '1', photoFile]);
    photo = await loadImage(photoFile);
    photoRecord = { path: photoFile, sourceVideo, sourceTime: cover.photoTime, sha256: digest(await fs.readFile(photoFile)), fit: 'contain', synthesized: false };
  }
  const palette = ['tech', 'tech-console'].includes(project.theme) ? palettes.tech : palettes.paper;
  const files = [], typography = [];
  for (const [name, height] of [['9x16', 1920], ['3x4', 1440]]) {
    onProgress?.({ phase: 'cover', message: `Rendering ${name} cover and thumbnail.` });
    const { canvas, textBounds } = drawCover(cover, height, photo, palette);
    for (const [extension, format] of [['png', 'png'], ['jpg', 'jpeg']]) {
      const bytes = format === 'png' ? await canvas.encode('png') : await canvas.encode('jpeg', 95);
      files.push({ ...(await writeNew(path.join(coverDir, `cover-${name}.${extension}`), bytes)), width: 1080, height });
    }
    const thumbnail = createCanvas(270, height / 4);
    thumbnail.getContext('2d').drawImage(canvas, 0, 0, 270, height / 4);
    files.push({ ...(await writeNew(path.join(coverDir, `cover-${name}-thumbnail.jpg`), await thumbnail.encode('jpeg', 92))), width: 270, height: height / 4 });
    typography.push({ ratio: name, textBounds });
  }
  const report = {
    version: 1, method: 'Original local Canvas composition; not a MotionGit animation or cover export',
    theme: project.theme || 'paper', themeSummary: cover.themeSummary, evidence: cover.evidence,
    titleLines: cover.titleLines, briefSha256: digest(JSON.stringify(cover)),
    font: { family: FONT, path: runtime.fontPath, sha256: digest(await fs.readFile(runtime.fontPath)) },
    photo: photoRecord, files, typography,
    review: { semantic: false, fullSize: false, thumbnail: false, sourceFrameSelection: false, ownerArtisticApproval: false },
    limitation: 'Successful generation and text-width checks do not establish semantic accuracy, face quality or platform visibility.',
  };
  await writeNew(path.join(coverDir, 'cover-report.json'), Buffer.from(JSON.stringify(report, null, 2)));
  return {
    portraitPng: path.join(coverDir, 'cover-9x16.png'), portraitJpg: path.join(coverDir, 'cover-9x16.jpg'),
    socialPng: path.join(coverDir, 'cover-3x4.png'), socialJpg: path.join(coverDir, 'cover-3x4.jpg'), report,
  };
}
