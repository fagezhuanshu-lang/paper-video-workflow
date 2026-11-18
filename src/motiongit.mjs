import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
export async function motiongit(args){
 const[configFile,action='check',...rest]=args;
 if(!configFile)throw Error('Usage: motiongit CONFIG.local.json check|OFFICIAL_ACTION [args]');
 const cfg=JSON.parse(fs.readFileSync(configFile,'utf8')),base=path.dirname(path.resolve(configFile));
 for(const[k,h]of[['packagePath','packageSha256'],['helperPath','helperSha256']]){
  cfg[k]=path.resolve(base,cfg[k]);if(!fs.existsSync(cfg[k]))throw Error('Missing user-supplied file: '+k);
  if(!/^[a-f0-9]{64}$/i.test(cfg[h]||''))throw Error('Supply a previously verified SHA256 for '+k);
  const hash=crypto.createHash('sha256').update(fs.readFileSync(cfg[k])).digest('hex');if(hash!==cfg[h].toLowerCase())throw Error('Hash mismatch for '+k+'; verify official provenance before changing the expected hash');
 }
 if(action==='check'){console.log(JSON.stringify({packageHashMatches:true,helperHashMatches:true,note:'Local binding only; this does not check account entitlement or establish publisher authenticity. Read the official start guide and verify the helper against official metadata first.'}));return;}
 const env={...process.env,PATH:path.dirname(process.execPath)+path.delimiter+process.env.PATH};
 const code=await new Promise((resolve,reject)=>{const c=spawn(process.execPath,[cfg.helperPath,action,cfg.packagePath,...rest],{windowsHide:true,stdio:'inherit',env});c.on('error',reject);c.on('close',resolve);});
 if(code!==0)throw Error('Official MotionGit helper failed with exit '+code);
}
