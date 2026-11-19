import fs from 'node:fs';
import path from 'node:path';
import {probe} from './runtime.mjs';
import {validateCover} from './cover-contract.mjs';
import {validatePresenter} from './presenter.mjs';
const fail=(message)=>{throw Error(message);};
const num=(x,name)=>Number.isFinite(x)?x:fail(name+' must be a finite number');
export function validatePlan(p){
 if(p.version!==1)fail('version must be 1');
 if(p.engine!==undefined && p.engine!=='original-open-paper')fail('This build uses original-open-paper. For MotionGit native rendering follow docs/motiongit-native.md.');
 if(!p.source?.video)fail('source.video is required');
 const start=num(p.source.start??0,'source.start'),end=num(p.source.end,'source.end');
 if(start<0||end<=start)fail('source interval is invalid');
 const duration=Math.round((end-start)*30)/30;
 if(duration>600)fail('This release supports a maximum 10-minute continuous interval');
 if(p.theme!=='paper')fail('theme must be paper; official MotionGit uses the separate adapter');
 if(!p.output||p.output.fps!==30||![[720,1280],[1080,1920]].some(([w,h])=>p.output.width===w&&p.output.height===h))fail('Supported output: 720x1280 or 1080x1920, 30fps');
 if(!Array.isArray(p.captions)||!p.captions.length)fail('Provide real captions; use transcribe/imported SRT then review them');
 let previous=0;
 for(const[c,i]of p.captions.map((c,i)=>[c,i])){
  num(c.start,'caption.start');num(c.end,'caption.end');
  if(c.start<previous-1e-6||c.end<=c.start||c.end>duration+.034||typeof c.text!=='string'||!c.text.trim())fail(`Invalid/overlapping caption ${i}`);
  previous=c.end;
 }
 if(!Array.isArray(p.scenes)||!p.scenes.length)fail('scenes required');
 validatePresenter(p);
 previous=0;
 for(const[s,i]of p.scenes.map((s,i)=>[s,i])){
  num(s.start,'scene.start');num(s.end,'scene.end');
  if(Math.abs(s.start-previous)>.001||s.end<=s.start||s.end>duration+.034)fail(`Scene ${i} must continue the previous scene without a gap/overlap`);
  if(!['title','steps','quote','compare'].includes(s.kind)||typeof s.title!=='string'||!s.title.trim())fail(`Invalid scene ${i} kind/title`);
  if(s.items!==undefined&&(!Array.isArray(s.items)||s.items.length>3||s.items.some(v=>typeof v!=='string'||!v.trim())))fail('scene.items must contain at most three nonempty text strings');
  if(s.kind==='compare'&&s.items?.length!==2)fail('compare needs exactly two supported items');
  if(s.cues&&(!Array.isArray(s.cues)||s.cues.some(t=>!Number.isFinite(t)||t<s.start||t>=s.end)))fail('Scene cues must use real times inside this scene');
  previous=s.end;
 }
 if(Math.abs(previous-duration)>.034)fail('Scenes must cover the complete selected interval');
 if(p.music!==null&&(!p.music?.file||!p.music.license||!p.music.source))fail('Music needs file, license and source; explicit music:null means no BGM');
 if(p.music){p.music.gainDb??=-22;if(!Number.isFinite(p.music.gainDb)||p.music.gainDb>0||p.music.gainDb< -60)fail('music.gainDb must be between -60 and 0');}
 validateCover(p.cover);
 const clean=s=>s.replace(/[\s，。！？、,.!?；;：:]/gu,'');
 const text=clean(p.captions.map(c=>c.text).join('')+' '+(p.transcript||''));
 if(p.cover.evidence.some(q=>typeof q!=='string'||!q.trim()||!text.includes(clean(q))))fail('Every cover evidence quote must occur in supplied captions/full transcript');
 if(p.cover.photoTime!==undefined&&(num(p.cover.photoTime,'photoTime')<start||p.cover.photoTime>end))fail('Cover photoTime must fall within the selected original interval');
 return {duration,frames:Math.round(duration*30),sceneCount:p.scenes.length,captionCount:p.captions.length};
}
export async function loadProject(file,{requireReview=false}={}){
 const absolute=path.resolve(file),base=path.dirname(absolute),p=JSON.parse(fs.readFileSync(absolute,'utf8'));
 const facts=validatePlan(p);
 p.source.start??=0;p.source.video=path.resolve(base,p.source.video);
 if(p.music)p.music.file=path.resolve(base,p.music.file);
 for(const f of [p.source.video,p.music?.file].filter(Boolean))if(!fs.existsSync(f))fail('Missing media file: '+f);
 const source=await probe(p.source.video),video=source.streams.find(s=>s.codec_type==='video'),audio=source.streams.find(s=>s.codec_type==='audio');
 if(!video||!audio)fail('Source must contain video and original audio');
 if(['smpte2084','arib-std-b67'].includes(video.color_transfer))fail('HDR is not supported by this SDR release');
 if(video.width/video.height>0.65||video.width/video.height<0.5)fail('This original layout expects a portrait talking-head source');
 if(p.source.end>Number(source.format.duration)+.04)fail('Selected interval exceeds the actual source');
 if(requireReview&&['transcriptChecked','semanticPlanChecked','coverSelectionChecked'].some(k=>p.review?.[k]!==true))fail('Actual source/semantic/cover review is pending. Review the content before setting the corresponding review fields; do not blindly bypass.');
 return {project:p,facts,sourceProbe:source,projectPath:absolute};
}
export function makeSrt(captions){
 const stamp=t=>{let n=Math.round(t*1000);return `${String(Math.floor(n/3600000)).padStart(2,'0')}:${String(Math.floor(n/60000)%60).padStart(2,'0')}:${String(Math.floor(n/1000)%60).padStart(2,'0')},${String(n%1000).padStart(3,'0')}`;};
 return captions.map((c,i)=>`${i+1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join('\n');
}
