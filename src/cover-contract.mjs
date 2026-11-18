// Shared, side-effect-free cover structure checks for planning and rendering.
function requireText(value, max, field) {
  if (typeof value !== 'string' || !value.trim() || Array.from(value).length > max || /[\r\n]/u.test(value)) {
    throw new Error(`${field} must be one nonempty line of at most ${max} characters.`);
  }
}

export function validateCover(cover) {
  if (!cover || typeof cover !== 'object') throw new Error('project.cover is required.');
  if (!Array.isArray(cover.titleLines) || cover.titleLines.length !== 2) throw new Error('cover.titleLines requires exactly two lines.');
  cover.titleLines.forEach((text, i) => requireText(text, 7, `cover.titleLines[${i}]`));
  requireText(cover.kicker, 16, 'cover.kicker');
  requireText(cover.deck, 21, 'cover.deck');
  requireText(cover.themeSummary, 500, 'cover.themeSummary');
  if (!Array.isArray(cover.evidence) || !cover.evidence.length || cover.evidence.some((quote) => typeof quote !== 'string' || !quote.trim())) {
    throw new Error('cover.evidence must be a nonempty array of actual transcript quotation strings.');
  }
  const visual = cover.visual;
  if (!visual || !['process', 'contrast', 'claim'].includes(visual.kind)) throw new Error('cover.visual.kind must be process, contrast or claim.');
  requireText(visual.label, 12, 'cover.visual.label');
  if (!Array.isArray(visual.labels) || visual.labels.length < 1 || visual.labels.length > 3) throw new Error('cover.visual.labels requires one to three entries.');
  if (visual.kind === 'contrast' && visual.labels.length !== 2) throw new Error('A contrast needs exactly two source-supported sides.');
  if (visual.kind === 'claim' && visual.labels.length !== 1) throw new Error('A claim needs exactly one statement.');
  visual.labels.forEach((text, i) => requireText(text, 7, `cover.visual.labels[${i}]`));
  if (cover.photoTime !== undefined && (!Number.isFinite(cover.photoTime) || cover.photoTime < 0)) throw new Error('cover.photoTime must be an absolute source time in seconds.');
}
