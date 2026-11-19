import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
export function loadBinding(file) {
 const absolute=path.resolve(file),base=path.dirname(absolute),cfg=JSON.parse(fs.readFileSync(absolute,'utf8'));
 for(const[key,hash]of[['packagePath','packageSha256'],['helperPath','helperSha256']]){
  if(typeof cfg[key]!=='string'||!cfg[key])throw Error(`Missing binding: ${key}`);
  cfg[key]=path.resolve(base,cfg[key]);
  if(!fs.existsSync(cfg[key])||!fs.statSync(cfg[key]).isFile())throw Error(`Missing user-supplied file: ${key}`);
  if(!/^[a-f0-9]{64}$/i.test(cfg[hash]||''))throw Error(`Supply an independently verified SHA256 for ${key}`);
  if(sha(cfg[key])!==cfg[hash].toLowerCase())throw Error(`Hash mismatch for ${key}; verify official provenance before changing the binding`);
 }
 if(cfg.helperBytes!==undefined&&fs.statSync(cfg.helperPath).size!==cfg.helperBytes)throw Error('Helper byte count differs from verified metadata');
 for(const key of ['npmDirectory','pythonDirectory','tempDirectory','localAppData'])if(cfg[key])cfg[key]=path.resolve(base,cfg[key]);
 cfg.nodePath=cfg.nodePath?path.resolve(base,cfg.nodePath):process.execPath;
 if(!fs.existsSync(cfg.nodePath))throw Error('Configured nodePath does not exist');
 cfg.base=base;return cfg;
}
export function bindingEnvironment(cfg){
 const env={...process.env},key=Object.keys(env).find(k=>k.toLowerCase()==='path')||'PATH';
 env[key]=[path.dirname(cfg.nodePath),cfg.npmDirectory,cfg.pythonDirectory,env[key]].filter(Boolean).join(path.delimiter);
 if(cfg.tempDirectory){env.TEMP=cfg.tempDirectory;env.TMP=cfg.tempDirectory;env.npm_config_cache=path.join(cfg.tempDirectory,'npm-cache');}
 if(cfg.localAppData)env.LOCALAPPDATA=cfg.localAppData;
 env.PYTHONUTF8='1';env.PYTHONIOENCODING='utf-8';env.PYTHONDONTWRITEBYTECODE='1';return env;
}
export function capture(exe,args,{env=process.env,cwd,inherit=false}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(exe,args,{env,cwd,windowsHide:true,stdio:inherit?'inherit':['ignore','pipe','pipe']});let stdout='',stderr='';
  if(!inherit){child.stdout.on('data',b=>stdout+=b.toString());child.stderr.on('data',b=>{stderr=(stderr+b.toString()).slice(-32000);});}
  child.on('error',reject);child.on('close',code=>code===0?resolve({stdout,stderr}):reject(Error(`${path.basename(exe)} failed (${code}): ${inherit?'see the official diagnostic above':stderr.slice(-6000)}`)));
 });
}
export async function checkBinding(cfg){
 const env=bindingEnvironment(cfg),checks={packageHash:true,helperHash:true};
 const node=await capture(cfg.nodePath,['-p','process.versions.node'],{env});checks.node22OrNewer=Number(node.stdout.trim().split('.')[0])>=22;
 const npmCli=[cfg.npmDirectory,path.dirname(cfg.nodePath)].filter(Boolean).map(d=>path.join(d,'node_modules/npm/bin/npm-cli.js')).find(p=>fs.existsSync(p));
 checks.standardNpmLayout=!!npmCli;
 checks.npmRuns=npmCli?await capture(cfg.nodePath,[npmCli,'--version'],{env}).then(()=>true,()=>false):false;
 for(const exe of ['ffmpeg','ffprobe'])checks[exe]=await capture(exe,['-version'],{env}).then(()=>true,()=>false);
 checks.python=await capture(process.platform==='win32'?'python.exe':'python3',['--version'],{env}).then(()=>true,()=>false);
 return{checks,ready:Object.values(checks).every(Boolean),networkUsed:false,credentialsRead:false,entitlementChecked:false,runtimeCacheChecked:false,note:'Local hashes do not establish publisher identity or entitlement. Official start/doctor remains necessary. No download/setup was performed.'};
}
export async function runOfficial(cfg,action,args=[],options={}){
 for(const key of ['tempDirectory','localAppData'])if(cfg[key])fs.mkdirSync(cfg[key],{recursive:true});
 return capture(cfg.nodePath,[cfg.helperPath,action,cfg.packagePath,...args],{env:bindingEnvironment(cfg),inherit:options.inherit??true,cwd:options.cwd});
}
export async function motiongit(args){
 const[file,action='check',...rest]=args;
 if(!file)throw Error('Usage: motiongit CONFIG.local.json check|stage JOB STAGE|finish JOB|OFFICIAL_ACTION [args]');
 const cfg=loadBinding(file);
 if(action==='check'){const report=await checkBinding(cfg);console.log(JSON.stringify(report,null,2));if(!report.ready)throw Error('Official template environment incomplete; correct the reported dependencies/bindings. Nothing was downloaded.');return report;}
 if(action==='stage'){const{runStage}=await import('./motiongit-workflow.mjs');return runStage(cfg,rest[0],rest[1]);}
 if(action==='finish'){const{finishOfficial}=await import('./motiongit-finish.mjs');return finishOfficial(cfg,rest[0]);}
 return runOfficial(cfg,action,rest);
}
