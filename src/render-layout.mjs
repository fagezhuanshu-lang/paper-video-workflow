const PALETTE = {paper: '#f3f0e5', ink: '#183f35', accent: '#287c61', muted: '#64776c', line: '#d4dbcd', white: '#fcfcf7'};
export const PERSON = {x: 118, y: 456, width: 484, height: 602};
const clamp = value => Math.min(1, Math.max(0, value));

export function linesFor(ctx, text, maxWidth) {
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    let line = '';
    for (const character of Array.from(paragraph)) {
      if (line && ctx.measureText(line + character).width > maxWidth) {
        lines.push(line); line = character;
      } else line += character;
    }
    lines.push(line);
  }
  return lines;
}

function font(ctx, size, weight = 700) { ctx.font = `${weight} ${size}px WorkflowSans`; }

function textBlock(ctx, text, x, y, maxWidth, size, lineHeight, maxLines, color = PALETTE.ink) {
  font(ctx, size);
  const lines = linesFor(ctx, text, maxWidth);
  if (lines.length > maxLines) throw new Error(`Text exceeds this layout's ${maxLines} lines: ${text}`);
  ctx.fillStyle = color;
  for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], x, y + i * lineHeight);
  return lines.length;
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
}

export function sceneItems(scene) {
  return (scene.items ?? []).map((item, index) => ({
    text: typeof item === 'string' ? item : String(item.text ?? ''),
    at: Number.isFinite(scene.cues?.[index]) ? scene.cues[index]
      : Number.isFinite(item?.cue) ? item.cue : scene.start,
  }));
}

export function validateLayout(project, ctx) {
  for (const scene of project.scenes) {
    font(ctx, 51);
    if (linesFor(ctx, scene.title, 604).length > 2) throw new Error(`Scene title is too long for a readable two-line title: ${scene.title}`);
    const items = sceneItems(scene);
    if (items.length > (scene.kind === 'compare' ? 2 : 3)) throw new Error('Use at most three items, or two comparison items, per scene');
    for (const item of items) {
      if (!item.text.trim()) throw new Error('Scene items must contain text');
      if (item.at < scene.start || item.at >= scene.end) throw new Error('Item cues must be output seconds within the scene');
      font(ctx, scene.kind === 'compare' ? 27 : 28);
      const maxLines = scene.kind === 'compare' ? 3 : items.length === 3 ? 1 : 2;
      if (linesFor(ctx, item.text, scene.kind === 'compare' ? 234 : 500).length > maxLines) {
        throw new Error(`Scene item is too long; split the scene or rewrite only the graphic copy: ${item.text}`);
      }
    }
  }
  font(ctx, 34);
  for (const caption of project.captions) {
    if (linesFor(ctx, caption.text, 592).length > 3) throw new Error(`Caption exceeds the three-line reading area; supply complete shorter caption cues: ${caption.text}`);
  }
}

export function paintFrame(ctx, personCanvas, project, time) {
  const scene = project.scenes.find(s => time >= s.start && time < s.end) ?? project.scenes.at(-1);
  const width = project.output.width;
  ctx.save();
  ctx.scale(width / 720, width / 720);
  ctx.fillStyle = PALETTE.paper;
  ctx.fillRect(0, 0, 720, 1280);
  // Geometric paper details are drawn here; no upstream assets or animations.
  ctx.strokeStyle = '#e4e7dc'; ctx.lineWidth = 1;
  for (let y = 30; y < 1280; y += 30) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(720, y); ctx.stroke();
  }
  ctx.fillStyle = PALETTE.accent;
  ctx.fillRect(58, 72, 36, 5);
  font(ctx, 17, 600); ctx.fillStyle = PALETTE.muted;
  ctx.fillText('观点 · 讲解', 108, 82);
  const entrance = clamp((time - scene.start) / 0.28);
  const eased = 1 - (1 - entrance) ** 3;
  ctx.save(); ctx.globalAlpha = entrance; ctx.translate(0, (1 - eased) * 15);
  textBlock(ctx, scene.title, 58, 151, 604, 51, 65, 2);
  const items = sceneItems(scene);
  if (scene.kind === 'compare') {
    items.forEach((item, index) => {
      const alpha = clamp((time - item.at) / 0.22);
      if (!alpha) return;
      ctx.save(); ctx.globalAlpha *= alpha;
      const x = 58 + index * 310;
      roundedRect(ctx, x, 258, 294, 164, 16);
      ctx.fillStyle = index ? '#e4efe5' : PALETTE.white; ctx.fill();
      ctx.strokeStyle = PALETTE.line; ctx.stroke();
      textBlock(ctx, item.text, x + 30, 305, 234, 27, 36, 3);
      ctx.restore();
    });
  } else if (items.length) {
    const rowHeight = 154 / items.length;
    items.forEach((item, index) => {
      const alpha = clamp((time - item.at) / 0.22);
      if (!alpha) return;
      ctx.save(); ctx.globalAlpha *= alpha;
      const y = 258 + index * rowHeight;
      roundedRect(ctx, 58, y, 604, rowHeight - 7, 12);
      ctx.fillStyle = PALETTE.white; ctx.fill();
      ctx.fillStyle = PALETTE.accent;
      ctx.beginPath(); ctx.arc(83, y + (rowHeight - 7) / 2, 4, 0, Math.PI * 2); ctx.fill();
      font(ctx, 28);
      const lineCount = linesFor(ctx, item.text, 500).length;
      // Short three-row cards must stay one line; use fewer rows for longer copy.
      if (lineCount === 2 && rowHeight < 68) throw new Error(`Two-line item requires fewer rows: ${item.text}`);
      textBlock(ctx, item.text, 105, y + (rowHeight - 7) / 2 + 10 - (lineCount - 1) * 17, 500, 28, 34, 2);
      ctx.restore();
    });
  } else if (scene.kind === 'quote') {
    font(ctx, 95); ctx.fillStyle = '#bccdbd'; ctx.fillText('“', 58, 335);
    ctx.strokeStyle = PALETTE.accent; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(58, 391); ctx.lineTo(662, 391); ctx.stroke();
  } else {
    ctx.strokeStyle = PALETTE.line;
    ctx.beginPath(); ctx.moveTo(58, 299); ctx.lineTo(662, 299); ctx.stroke();
  }
  ctx.restore();
  ctx.shadowColor = '#183f3520'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 8;
  roundedRect(ctx, PERSON.x - 8, PERSON.y - 8, PERSON.width + 16, PERSON.height + 16, 18);
  ctx.fillStyle = PALETTE.white; ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.save(); roundedRect(ctx, PERSON.x, PERSON.y, PERSON.width, PERSON.height, 10); ctx.clip();
  ctx.drawImage(personCanvas, PERSON.x, PERSON.y, PERSON.width, PERSON.height); ctx.restore();
  const caption = project.captions.find(c => time >= c.start && time < c.end);
  if (caption) {
    font(ctx, 34);
    const lines = linesFor(ctx, caption.text, 592);
    const boxHeight = lines.length * 44 + 26;
    const boxY = 1100;
    roundedRect(ctx, 44, boxY, 632, boxHeight, 15);
    ctx.fillStyle = PALETTE.ink; ctx.fill();
    ctx.fillStyle = PALETTE.white; ctx.textAlign = 'center';
    lines.forEach((line, index) => ctx.fillText(line, 360, boxY + 44 + 44 * index));
    ctx.textAlign = 'left';
  }
  ctx.restore();
}
