// Card positions in a 720x1280 design. Interpolate each edge independently:
// the compact speaking window is square, while the lead shot is portrait.
const poses = {
  large: {x:164, y:439, width:392, height:499},
  compact: {x:224, y:652, width:272, height:272},
};

export function validatePresenter(project) {
  const settings = project.presenter === undefined ? {} : project.presenter;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw Error('presenter must be an object');
  if (!['cover','contain'].includes(settings.fit ?? 'cover')) throw Error('presenter.fit must be cover or contain');
  const anchor = settings.anchorY ?? 0.5;
  if (!Number.isFinite(anchor) || anchor < 0 || anchor > 1) throw Error('presenter.anchorY must be between 0 and 1');
  for (const s of project.scenes) {
    if (s.presenter !== undefined && (typeof s.presenter !== 'string' || !Object.hasOwn(poses,s.presenter))) throw Error('scene.presenter must be large or compact');
  }
}

export function buildPresenterTrack(scenes) {
  const poseFor = s => poses[s.presenter ?? (['steps','compare'].includes(s.kind) ? 'compact' : 'large')];
  const first = poseFor(scenes[0]);
  const firstDuration = scenes[0].end-scenes[0].start;
  const keys = [{time:0, ...first, x:first.x+80},
    {time:Math.min(0.52, firstDuration/3), ...first}];
  for (let i=1; i<scenes.length; i++) {
    const prev=scenes[i-1], next=scenes[i];
    const from=poseFor(prev), to=poseFor(next);
    if (from === to) continue;
    keys.push({time:next.start-Math.min(0.29,(prev.end-prev.start)/3), ...from},
      {time:next.start+Math.min(0.14,(next.end-next.start)/3), ...to});
  }
  return keys;
}

export function presenterAt(keys,time) {
  let lo=0, hi=keys.length;
  while (lo<hi) { const mid=(lo+hi)>>>1; if (keys[mid].time<=time) lo=mid+1; else hi=mid; }
  const a=keys[Math.max(0,lo-1)], b=keys[lo];
  if (!b || time<=a.time) return a;
  const t=(time-a.time)/(b.time-a.time);
  const u=t*t*(3-2*t);
  const mix=field=>a[field]+(b[field]-a[field])*u;
  return {x:mix('x'),y:mix('y'),width:mix('width'),height:mix('height')};
}

export function drawPresenter(ctx,image,box,settings={}) {
  const {x,y,width,height}=box;
  ctx.save();
  ctx.shadowColor='#23342438'; ctx.shadowBlur=13; ctx.shadowOffsetY=7;
  ctx.fillStyle='#fffef5'; ctx.fillRect(x-3,y-3,width+6,height+6);
  ctx.shadowColor='transparent';
  ctx.beginPath(); ctx.rect(x,y,width,height); ctx.clip();
  const scale=(settings.fit==='contain'?Math.min:Math.max)(width/image.width,height/image.height);
  const w=image.width*scale, h=image.height*scale;
  ctx.drawImage(image,x+(width-w)/2,y+(height-h)*(settings.anchorY??0.5),w,h);
  ctx.restore();
}
