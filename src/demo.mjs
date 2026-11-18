import fs from 'node:fs';
import path from 'node:path';
import {getRuntime,run} from './runtime.mjs';
export async function createDemo(dir){
 if(fs.existsSync(dir))throw Error('Demo directory already exists. Choose a new --out directory.');
 fs.mkdirSync(dir,{recursive:true});
 const{ffmpeg}=getRuntime();
 await run(ffmpeg,['-n','-v','error','-f','lavfi','-i','testsrc2=size=720x1280:rate=30:duration=6','-f','lavfi','-i','sine=frequency=220:sample_rate=48000:duration=6','-c:v','libx264','-preset','ultrafast','-crf','22','-c:a','aac','-shortest',path.join(dir,'source.mp4')]);
 await run(ffmpeg,['-n','-v','error','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=6','-af','volume=0.3','-c:a','pcm_s16le',path.join(dir,'music.wav')]);
 const p={version:1,source:{video:'source.mp4',start:0,end:6},output:{width:720,height:1280,fps:30},theme:'paper',captions:[{start:0.1,end:2.8,text:'这是公开流程的合成测试'},{start:3,end:5.9,text:'画面、音乐和封面一起交付'}],scenes:[{start:0,end:3,kind:'title',title:'从素材到成片',items:[]},{start:3,end:6,kind:'steps',title:'一起交付',items:['视频','配乐','封面'],cues:[3,4,5]}],music:{file:'music.wav',gainDb:-25,license:'CC0-1.0',source:'Generated sine-wave test tone; not a licensed song or real voice'},sfx:{enabled:true,gainDb:-32},cover:{titleLines:['视频与封面','一次交付'],kicker:'公开流程 · 合成测试',deck:'画面、音乐和封面一起交付',visual:{kind:'process',label:'固定交付步骤',labels:['整理素材','生成成片','交付封面']},themeSummary:'演示完整技术交付，不代表真人口播质量验收',evidence:['画面、音乐和封面一起交付']},review:{transcriptChecked:true,semanticPlanChecked:true,coverSelectionChecked:true},demo:true};
 const file=path.join(dir,'project.json');fs.writeFileSync(file,JSON.stringify(p,null,2));return file;
}
