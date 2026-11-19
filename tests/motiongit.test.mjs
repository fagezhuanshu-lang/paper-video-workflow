import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {getRuntime} from '../src/runtime.mjs';
import {loadJob, stageCommand, runStage} from '../src/motiongit-workflow.mjs';
import {finishOfficial} from '../src/motiongit-finish.mjs';

let root, silentMaster, voicedMaster;
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
before(() => {
  const work = fileURLToPath(new URL('../.work/', import.meta.url));
  fs.mkdirSync(work, {recursive:true});
  root = fs.mkdtempSync(path.join(work, 'test-motiongit-'));
  const {ffmpeg} = getRuntime();
  for (const sound of [false,true]) {
    const target = path.join(root, sound ? 'voiced.mp4' : 'silent.mp4');
    const args = ['-v','error','-nostdin','-f','lavfi','-i','color=c=green:s=36x64:r=30:d=0.6'];
    if (sound) args.push('-f','lavfi','-i','sine=frequency=400:sample_rate=48000:duration=0.6');
    args.push('-t','0.6','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p');
    if (sound) args.push('-c:a','aac');
    args.push(target);
    execFileSync(ffmpeg,args,{windowsHide:true});
    if (sound) voicedMaster=target; else silentMaster=target;
  }
});
after(() => { if(root) fs.rmSync(root,{recursive:true,force:true}); });

function fixture(name, {silent=false, reviewed=true, evidence='超过额度才收费'}={}) {
  const base=path.join(root,name), instance=path.join(base,'instance');
  fs.mkdirSync(instance,{recursive:true});
  fs.copyFileSync(silent?silentMaster:voicedMaster,path.join(instance,'master.mp4'));
  const project={
    version:1, theme:'paper', source:{video:'instance/master.mp4',start:0,end:0.6},
    output:{width:720,height:1280,fps:30}, music:null,
    captions:[{start:0,end:0.6,text:'免费版有额度，超过额度才收费。'}],
    scenes:[{start:0,end:0.6,kind:'title',title:'免费有边界'}],
    cover:{titleLines:['免费有额度','使用先看配额'],kicker:'使用说明',deck:'超过额度才收费',
      visual:{kind:'claim',label:'收费条件',labels:['超过额度']},
      themeSummary:'免费额度与收费边界',evidence:[evidence]},
    review:{transcriptChecked:true,semanticPlanChecked:true,coverSelectionChecked:reviewed},
  };
  fs.writeFileSync(path.join(base,'cover.json'),JSON.stringify(project));
  const job={instance:'instance',inputs:'instance/inputs.json',params:'instance/params.json',
    plan:'instance/plan.json',project:'instance/project.json',master:'instance/master.mp4',
    delivery:'delivery',coverProject:'cover.json',previewTimes:[0.2],
    review:{previewChecked:true,masterChecked:true}};
  const file=path.join(base,'job.local.json');
  fs.writeFileSync(file,JSON.stringify(job));
  return {base,file,job,project,delivery:path.join(base,'delivery')};
}

test('native stages require real preview times and completed preview review',()=>{
  const {file}=fixture('stage-guards');
  const job=loadJob(file);
  assert.equal(stageCommand(job,'render')[0],'run');
  assert.throws(()=>stageCommand({...job,review:{}},'render'),/previewChecked/);
  assert.throws(()=>stageCommand({...job,previewTimes:[]},'preview'),/previewTimes/);
  assert.throws(()=>stageCommand({...job,previewTimes:[-1]},'preview'),/previewTimes/);
  assert.throws(()=>stageCommand(job,'unknown'),/Stage must be/);
});

test('native jobs reject instance escapes and preserve existing render outputs',async()=>{
  const {file,job}=fixture('path-guards');
  await assert.rejects(runStage({},file,'render'),/already exists/);
  fs.writeFileSync(file,JSON.stringify({...job,params:'outside-instance.json'}));
  assert.throws(()=>loadJob(file),/must stay inside instance/);
});

test('native delivery rejects a silent master before creating a delivery',async()=>{
  const {file,delivery}=fixture('silent',{silent:true});
  await assert.rejects(finishOfficial({},file),/no original audio stream/);
  assert.equal(fs.existsSync(delivery),false);
});

test('native delivery rejects unchecked cover selection before creating a delivery',async()=>{
  const {file,delivery}=fixture('unreviewed',{reviewed:false});
  await assert.rejects(finishOfficial({},file),/Cover selection review is pending/);
  assert.equal(fs.existsSync(delivery),false);
});

test('native cover evidence must occur in the supplied narration',async()=>{
  const {file,delivery}=fixture('unsupported',{evidence:'所有功能永久免费'});
  await assert.rejects(finishOfficial({},file),/Every cover evidence quote/);
  assert.equal(fs.existsSync(delivery),false);
});

test('native delivery preserves the official master bytes and produces independent covers',async()=>{
  const {file,delivery}=fixture('valid');
  const job=loadJob(file), beforeHash=hash(job.master);
  const result=await finishOfficial({packageSha256:'a'.repeat(64),helperSha256:'b'.repeat(64)},file);
  assert.equal(hash(job.master),beforeHash);
  assert.equal(hash(path.join(delivery,'official-final.mp4')),beforeHash);
  assert.equal(result.masterPreservedByteForByte,true);
  assert.equal(result.firstFrameReplaced,false);
  assert.equal(result.review.coverVisualReviewPending,true);
  for(const file of ['cover/cover-9x16.png','cover/cover-3x4.jpg','captions.srt','delivery.json'])
    assert.ok(fs.statSync(path.join(delivery,file)).size>0);
  await assert.rejects(finishOfficial({},job.file),/already exists/);
});
