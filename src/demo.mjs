import fs from 'node:fs';
import path from 'node:path';
import {createCanvas} from '@napi-rs/canvas';
import {getRuntime,run} from './runtime.mjs';

// A stationary subject makes camera movement visible and measurable in the MP4.
// The blue square is the tracking mark used by the end-to-end check.
function drawTestCard(file) {
 const canvas=createCanvas(720,1280);
 const ctx=canvas.getContext('2d');
 ctx.fillStyle='#d6d7c6'; ctx.fillRect(0,0,720,1280);
 ctx.fillStyle='#c2cabc';
 for(let y=120;y<1280;y+=120) ctx.fillRect(0,y,720,2);
 ctx.fillStyle='#447368';
 ctx.beginPath(); ctx.roundRect(134,580,452,570,115); ctx.fill();
 ctx.fillStyle='#eacbab';
 ctx.beginPath(); ctx.ellipse(360,440,121,156,0,0,Math.PI*2); ctx.fill();
 ctx.fillStyle='#214138';
 ctx.beginPath(); ctx.arc(360,427,124,Math.PI,2*Math.PI); ctx.fill();
 ctx.fillStyle='#2054ec'; ctx.fillRect(324,615,72,72);
 fs.writeFileSync(file,canvas.toBuffer('image/png'));
}

export async function createDemo(dir){
 if(fs.existsSync(dir))throw Error('Demo directory already exists. Choose a new --out directory.');
 fs.mkdirSync(dir,{recursive:true});
 const{ffmpeg}=getRuntime();
 const testCard=path.join(dir,'stationary-test-card.png');drawTestCard(testCard);
 await run(ffmpeg,['-n','-v','error','-loop','1','-framerate','30','-i',testCard,'-f','lavfi','-i','sine=frequency=220:sample_rate=48000:duration=6','-t','6','-pix_fmt','yuv420p','-c:v','libx264','-preset','ultrafast','-crf','22','-c:a','aac',path.join(dir,'source.mp4')]);
 await run(ffmpeg,['-n','-v','error','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=6','-af','volume=0.3','-c:a','pcm_s16le',path.join(dir,'music.wav')]);
 const p={version:1,source:{video:'source.mp4',start:0,end:6},output:{width:720,height:1280,fps:30},theme:'paper',captions:[{start:0.1,end:2.8,text:'这是公开流程的合成测试'},{start:3,end:5.9,text:'画面、音乐和封面一起交付'}],scenes:[{start:0,end:3,kind:'title',title:'从素材到成片',items:[]},{start:3,end:6,kind:'steps',title:'一起交付',items:['视频','配乐','封面'],cues:[3,4,5]}],music:{file:'music.wav',gainDb:-25,license:'CC0-1.0',source:'Generated sine-wave test tone; not a licensed song or real voice'},sfx:{enabled:true,gainDb:-32},cover:{titleLines:['视频与封面','一次交付'],kicker:'公开流程 · 合成测试',deck:'画面、音乐和封面一起交付',visual:{kind:'process',label:'固定交付步骤',labels:['整理素材','生成成片','交付封面']},themeSummary:'演示完整技术交付，不代表真人口播质量验收',evidence:['画面、音乐和封面一起交付']},review:{transcriptChecked:true,semanticPlanChecked:true,coverSelectionChecked:true},demo:true};
 const file=path.join(dir,'project.json');fs.writeFileSync(file,JSON.stringify(p,null,2));return file;
}
