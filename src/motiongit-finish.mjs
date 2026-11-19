import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {loadJob} from './motiongit-workflow.mjs';
import {renderCovers} from './cover.mjs';
import {validateCover} from './cover-contract.mjs';
import {makeSrt} from './project.mjs';
import {getRuntime,run} from './runtime.mjs';
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

// This delivery step preserves every byte of the official master. It does not
// substitute the public renderer or modify original animation, audio or clocks.
export async function finishOfficial(cfg,file){
 const job=loadJob(file);
 if(!fs.existsSync(job.master))throw Error('Official master is missing; complete and inspect the official render first');
 if(!job.coverProject)throw Error('Set coverProject to a reviewed source/cover JSON for independent covers');
 if(job.review?.masterChecked!==true)throw Error('Review the official master before setting review.masterChecked=true');
 if(fs.existsSync(job.delivery))throw Error('Delivery directory already exists; use a new revision');
 const content=JSON.parse(fs.readFileSync(job.coverProject,'utf8'));
 validateCover(content.cover);
 if(content.review?.coverSelectionChecked!==true)throw Error('Cover selection review is pending');
 const clean=s=>String(s).replace(/[\s，。！？、,.!?；;：:]/gu,'');
 const evidenceText=clean((content.captions??[]).map(c=>c.text).join('')+' '+(content.transcript??''));
 if(content.cover.evidence.some(q=>typeof q!=='string'||!clean(q)||!evidenceText.includes(clean(q))))throw Error('Every cover evidence quote must occur in supplied captions/full transcript');
 if(content.source?.video)content.source.video=path.resolve(path.dirname(job.coverProject),content.source.video);
 const rt=getRuntime();
 const media=JSON.parse((await run(rt.ffprobe,['-v','error','-show_streams','-show_format','-of','json',job.master])).stdout);
 if(!media.streams.some(s=>s.codec_type==='video'))throw Error('Official master has no video stream');
 if(!media.streams.some(s=>s.codec_type==='audio'))throw Error('Official master has no original audio stream');
 await run(rt.ffmpeg,['-v','error','-nostdin','-xerror','-i',job.master,'-f','null','-']);
 fs.mkdirSync(job.delivery,{recursive:true});
 const covers=await renderCovers(content,{workDir:job.delivery});
 const final=path.join(job.delivery,'official-final.mp4');
 fs.copyFileSync(job.master,final,fs.constants.COPYFILE_EXCL);
 const masterSha256=sha(job.master);
 if(sha(final)!==masterSha256)throw Error('Copied master hash differs; delivery failed');
 if(Array.isArray(content.captions)&&content.captions.length)fs.writeFileSync(path.join(job.delivery,'captions.srt'),makeSrt(content.captions),{flag:'wx'});
 const report={engine:'official-user-supplied-motiongit',packageSha256:cfg.packageSha256,helperSha256:cfg.helperSha256,
  masterPreservedByteForByte:true,masterSha256,completeDecode:true,firstFrameReplaced:false,
  note:'Independent covers use this repository’s original layout. Official master animation and audio remain unchanged; select the cover separately when publishing.',
  files:['official-final.mp4','cover/cover-9x16.png','cover/cover-9x16.jpg','cover/cover-3x4.png','cover/cover-3x4.jpg'],
  review:{masterChecked:job.review.masterChecked,coverVisualReviewPending:true,ownerArtisticApproval:false}};
 fs.writeFileSync(path.join(job.delivery,'delivery.json'),JSON.stringify(report,null,2),{flag:'wx'});
 console.log(JSON.stringify({delivery:job.delivery,...report},null,2));return{...report,covers};
}
