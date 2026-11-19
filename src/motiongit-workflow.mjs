import fs from 'node:fs';
import path from 'node:path';
import {runOfficial} from './motiongit.mjs';

export function loadJob(file){
 if(!file)throw Error('Supply a private JOB.local.json');
 const absolute=path.resolve(file),base=path.dirname(absolute),job=JSON.parse(fs.readFileSync(absolute,'utf8'));
 for(const key of ['instance','inputs','params','plan','project','master','delivery']){
  if(typeof job[key]!=='string'||!job[key])throw Error(`Job requires ${key}`);
  job[key]=path.resolve(base,job[key]);
 }
 for(const key of ['inputs','params','plan','project','master']){
  const relative=path.relative(job.instance,job[key]);
  if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error(`Official ${key} path must stay inside instance`);
 }
 if(!['zh','en'].includes(job.language??'zh'))throw Error('language must be zh or en');
 job.language??='zh';if(job.coverProject)job.coverProject=path.resolve(base,job.coverProject);
 job.file=absolute;return job;
}
export function stageCommand(job,stage){
 const p=['--instance',job.instance],l=['--language',job.language];
 const commands={
  init:['new',[job.instance]],
  setup:['run',[...p,'setup',...l]],
  doctor:['run',[...p,'doctor',...l]],
  'check-params':['run',[...p,'check-params',job.params,'--inputs',job.inputs,...l]],
  plan:['run',[...p,'plan',job.params,'--inputs',job.inputs,'--out',job.plan,...l]],
  prepare:['run',[...p,'prepare','@vault','--inputs','@vault','--plan',job.plan,'--out',job.project,...l]],
  preview:['run',[...p,'preview',job.project,'--times',(job.previewTimes||[]).join(','),...l]],
  render:['run',[...p,'render',job.project,'--out',job.master,...l]],
 };
 if(!commands[stage])throw Error('Stage must be init, setup, doctor, check-params, plan, prepare, preview or render');
 if(stage==='preview'&&(!Array.isArray(job.previewTimes)||!job.previewTimes.length||job.previewTimes.some(t=>!Number.isFinite(t)||t<0)))throw Error('previewTimes needs actual nonnegative output seconds');
 if(stage==='render'&&job.review?.previewChecked!==true)throw Error('Inspect official previews before setting review.previewChecked=true and rendering');
 return commands[stage];
}
export async function runStage(cfg,file,stage){
 const job=loadJob(file),[action,args]=stageCommand(job,stage);
 const newOutput={init:job.instance,plan:job.plan,prepare:job.project,render:job.master}[stage];
 if(newOutput&&fs.existsSync(newOutput))throw Error(`Stage output already exists; preserve it and use new revision paths: ${newOutput}`);
 if(stage!=='init'&&!fs.existsSync(job.instance))throw Error('Instance missing; run stage JOB init with the official helper first');
 if(['plan','check-params'].includes(stage)&&(!fs.existsSync(job.params)||!fs.existsSync(job.inputs)))throw Error('Real params and inputs are required; the structural example is not ready for user narration');
 if(stage==='render')fs.mkdirSync(path.dirname(job.master),{recursive:true});
 await runOfficial(cfg,action,args,{cwd:path.dirname(job.file)});
 return{stage,officialHelperUsed:true};
}
