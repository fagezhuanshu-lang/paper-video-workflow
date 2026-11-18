import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {getRuntime,run,projectRoot} from './src/runtime.mjs';
import {loadProject,makeSrt} from './src/project.mjs';
const args=process.argv.slice(2),command=args.shift()||'help';
const option=(name,fallback)=>{const i=args.indexOf(name);if(i<0)return fallback;if(!args[i+1])throw Error('Missing value: '+name);return args[i+1];};
const progress=p=>console.log(JSON.stringify({progress:p}));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
async function build(file,out){
 const{project,facts}=await loadProject(file,{requireReview:true});
 if(fs.existsSync(out))throw Error('Output directory exists; choose a new version to preserve previous delivery');
 fs.mkdirSync(out,{recursive:true});
 const statusFile=path.join(out,'status.json');
 const status={state:'running',stages:[],version:'2.0.0',ownerArtisticApproval:false};
 const save=()=>fs.writeFileSync(statusFile,JSON.stringify(status,null,2));save();
 try{
  const{renderCovers}=await import('./src/cover.mjs');
  const{renderProject}=await import('./src/render.mjs');
  const{verifyVideo}=await import('./src/verify.mjs');
  progress({stage:'cover'});const covers=await renderCovers(project,{workDir:out,onProgress:progress});status.stages.push('cover');save();
  const output=path.join(out,'final.mp4');
  const render=await renderProject(project,{workDir:out,outputPath:output,coverPath:covers.portraitPng,onProgress:progress});status.stages.push('render');save();
  progress({stage:'verify'});const verification=await verifyVideo(output,{expectedFrames:facts.frames,expectedFps:30,width:project.output.width,height:project.output.height,expectedDuration:facts.duration,requireAudio:true});
  fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(verification,null,2));
  if(!verification.passed)throw Error('Final verification failed; inspect verification.json');
  fs.writeFileSync(path.join(out,'captions.srt'),makeSrt(project.captions));
  const files=[output,covers.portraitPng,covers.portraitJpg,covers.socialPng,covers.socialJpg,path.join(out,'captions.srt')];
  const manifest={version:'2.0.0',engine:'original-open-paper',projectHash:sha(file),duration:facts.duration,frames:facts.frames,music:project.music?{source:project.music.source,license:project.music.license,gainDb:project.music.gainDb}:null,files:files.map(p=>({path:path.relative(out,p).replaceAll('\\','/'),bytes:fs.statSync(p).size,sha256:sha(p)})),technicalVerification:verification.passed,visualAndListeningReviewPending:true,ownerArtisticApproval:false,demo:!!project.demo};
  fs.writeFileSync(path.join(out,'delivery.json'),JSON.stringify(manifest,null,2));
  status.stages.push('verify');status.state='technical-checks-passed';status.visualAndListeningReviewPending=true;save();
  console.log(JSON.stringify({output,delivery:path.join(out,'delivery.json'),...facts,review:'Open the actual video and covers; technical checks do not establish artistic or semantic quality.'},null,2));
  return manifest;
 }catch(e){status.state='failed';status.error=e.message;save();throw e;}
}
try{
 if(command==='doctor'){
  const rt=getRuntime();const ff=(await run(rt.ffmpeg,['-hide_banner','-version'])).stdout.split('\n')[0];
  const enc=(await run(rt.ffmpeg,['-hide_banner','-encoders'])).stdout;
  if(!/\blibx264\b/.test(enc))throw Error('FFmpeg libx264 encoder is required');
  const{createCanvas,GlobalFonts}=await import('@napi-rs/canvas');if(!GlobalFonts.registerFromPath(rt.fontPath,'Paper Sans'))throw Error('Bundled font registration failed');
  const canvas=createCanvas(120,80);canvas.getContext('2d').fillText('中文',10,40);await canvas.encode('png');
  console.log(JSON.stringify({ready:true,node:process.versions.node,platform:process.platform,arch:process.arch,ffmpeg:ff,font:'bundled Noto Sans SC / OFL',speech:'optional separate dependency',motiongit:'optional user-supplied authorized package',workBuddyTested:false},null,2));
 }else if(command==='validate'){
  const result=await loadProject(args[0]);console.log(JSON.stringify({valid:true,...result.facts,review:result.project.review},null,2));
 }else if(command==='build'){
  const file=path.resolve(args[0]);await build(file,path.resolve(option('--out',path.join(path.dirname(file),'delivery'))));
 }else if(command==='demo'){
  const{createDemo}=await import('./src/demo.mjs');const dir=path.resolve(option('--out',path.join(projectRoot,'.work','demo-'+Date.now())));const file=await createDemo(dir);await build(file,path.join(dir,'delivery'));
 }else if(command==='transcribe'){
  const{transcribeVideo}=await import('./src/transcribe.mjs');console.log(await transcribeVideo(path.resolve(args[0]),{outDir:path.resolve(option('--out',path.join(projectRoot,'.work','transcript-'+Date.now()))),model:option('--model','base'),onProgress:progress}));
 }else if(command==='motiongit'){
  const{motiongit}=await import('./src/motiongit.mjs');await motiongit(args);
 }else{
  console.log('Commands:\n  node cli.mjs doctor\n  node cli.mjs demo [--out NEW_DIR]\n  node cli.mjs transcribe VIDEO --out NEW_DIR [--model base]\n  node cli.mjs validate project.json\n  node cli.mjs build project.json --out NEW_DIR\n  node cli.mjs motiongit CONFIG ACTION [official arguments]\nAll outputs are local; publication is never automatic.');
 }
}catch(e){console.error(JSON.stringify({error:e.message,next:'Correct the reported input/dependency; preserve failed output and use a new directory when rebuilding.'}));process.exitCode=1;}
