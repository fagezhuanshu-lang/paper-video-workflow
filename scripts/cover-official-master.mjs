// Create a publication copy with a cover at frame zero. Keep the official
// master, copy all original audio tracks, and check both clocks after muxing.
import fs from 'node:fs/promises';
import path from 'node:path';
import {getRuntime,probe,run} from '../src/runtime.mjs';

const [master,cover,out]=process.argv.slice(2);
if (!out || !cover || !master) throw Error('Usage: node scripts/cover-official-master.mjs MASTER.mp4 COVER.png NEW.mp4');
const {ffmpeg}=getRuntime();
const original=await probe(master);
const [video]=original.streams.filter(s=>s.codec_type==='video');
if (!video || video.width*16!==video.height*9 || ['smpte2084','arib-std-b67'].includes(video.color_transfer))
  throw Error('Select a portrait 9:16 SDR master.');
const audio=original.streams.filter(s=>s.codec_type==='audio');
if (!audio.length || !Number(video.nb_frames)) throw Error('Expected a master with original audio and a known video frame count.');
const image=(await probe(cover)).streams.find(s=>s.codec_type==='video');
if (!image || image.width*video.height!==image.height*video.width) throw Error('Choose the matching portrait cover.');
const rate=s=>{const [n,d]=s.split('/').map(Number);return n/d;};
if (Math.abs(rate(video.avg_frame_rate)-rate(video.r_frame_rate))>0.0001) throw Error('Expected a constant-frame-rate master.');
const dir=path.dirname(path.resolve(out));
await fs.mkdir(dir,{recursive:true});
const scratch=await fs.mkdtemp(path.join(dir,'.cover-'));
const partial=path.join(scratch,'verified.mp4');
try {
  const graph=`[1:v]scale=${video.width}:${video.height},setsar=1[cover];[0:v][cover]overlay=enable='eq(n,0)':eof_action=repeat[out]`;
  await run(ffmpeg,['-nostdin','-v','error','-i',master,'-i',cover,'-filter_complex',graph,
    '-map','[out]','-map','0:a','-c:a','copy','-c:v','libx264','-preset','fast','-crf','16',
    '-pix_fmt','yuv420p','-fps_mode','passthrough','-movie_timescale','48000','-movflags','+faststart',partial]);
  const result=await probe(partial);
  const encoded=result.streams.find(s=>s.codec_type==='video');
  const copied=result.streams.filter(s=>s.codec_type==='audio');
  const sameClock=(a,b,tol)=>Math.abs(Number(a.duration)-Number(b.duration))<=tol && Math.abs(Number(a.start_time)-Number(b.start_time))<=tol;
  if (Number(encoded.nb_frames)!==Number(video.nb_frames) || !sameClock(video,encoded,0.0001) || copied.length!==audio.length)
    throw Error('Output stream count or video clock changed.');
  const audioHash=async(file,i)=>(await run(ffmpeg,['-v','error','-i',file,'-map','0:a:'+i,'-c','copy','-f','hash','-hash','sha256','-'])).stdout.trim();
  for(let i=0;i<audio.length;i++){
    if (!sameClock(audio[i],copied[i],1/Number(audio[i].sample_rate)) || await audioHash(master,i)!==await audioHash(partial,i))
      throw Error('Audio timing or packet content changed.');
  }
  await run(ffmpeg,['-v','error','-xerror','-i',partial,'-f','null','-']);
  await fs.copyFile(partial,out,fs.constants.COPYFILE_EXCL);
  console.log(JSON.stringify({output:out,frames:Number(encoded.nb_frames),audioCopied:true,firstFrame:'cover'}));
} finally {
  await fs.rm(scratch,{recursive:true,force:true});
}
