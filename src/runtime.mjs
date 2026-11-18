import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
const require=createRequire(import.meta.url);
export const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function fromPath(name){for(const d of (process.env.PATH||'').split(path.delimiter)){const p=path.join(d,process.platform==='win32'?name+'.exe':name);if(fs.existsSync(p))return p;}return null;}
export function getRuntime(){
 let ffmpeg=process.env.VIDEO_FFMPEG,ffprobe=process.env.VIDEO_FFPROBE;
 if(!ffmpeg)try{ffmpeg=require('ffmpeg-static');}catch{}
 if(!ffprobe)try{ffprobe=require('ffprobe-static').path;}catch{}
 if(!ffmpeg||!fs.existsSync(ffmpeg))ffmpeg=fromPath('ffmpeg');
 if(!ffprobe||!fs.existsSync(ffprobe))ffprobe=fromPath('ffprobe');
 const fontPath=process.env.VIDEO_FONT||path.join(projectRoot,'assets/fonts/NotoSansSC.ttf');
 if(!ffmpeg||!ffprobe||!fs.existsSync(ffmpeg)||!fs.existsSync(ffprobe))throw Error('FFmpeg/ffprobe not installed. Run Setup.ps1 or npm ci; optional VIDEO_FFMPEG / VIDEO_FFPROBE must be absolute executable paths.');
 if(!fs.existsSync(fontPath))throw Error('Missing bundled OFL font. Restore assets/fonts/NotoSansSC.ttf.');
 return{ffmpeg,ffprobe,ffmpegPath:ffmpeg,ffprobePath:ffprobe,fontPath};
}
export function run(exe,args,{cwd,input,maxBuffer=16*1024*1024,env=process.env}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(exe,args,{cwd,env,windowsHide:true,stdio:['pipe','pipe','pipe']});
  let stdout='',stderr='',tooLarge=false;
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',s=>{stdout+=s;if(stdout.length>maxBuffer){tooLarge=true;child.kill();}});
  child.stderr.on('data',s=>{stderr+=s;if(stderr.length>maxBuffer)stderr=stderr.slice(-maxBuffer);});
  child.on('error',reject);
  child.on('close',code=>code===0&&!tooLarge?resolve({stdout,stderr}):reject(Error(`${path.basename(exe)} failed (${code}): ${tooLarge?'output limit exceeded':stderr.slice(-5000)}`)));
  child.stdin.on('error',()=>{});if(input!==undefined)child.stdin.end(input);else child.stdin.end();
 });
}
export async function probe(file){const{ffprobe}=getRuntime();return JSON.parse((await run(ffprobe,['-v','error','-show_format','-show_streams','-of','json',file])).stdout);}
