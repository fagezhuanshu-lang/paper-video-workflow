// Measure the blue mark on the stationary demo subject after MP4 encoding.
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {getRuntime} from '../src/runtime.mjs';

if (!process.argv[2]) throw new Error('Pass the encoded synthetic demo MP4.');
const target = path.resolve(process.argv[2]);
const width = 360;
const height = 640;
const {ffmpeg} = getRuntime();

function locateMark(time) {
  const rgb = execFileSync(ffmpeg, ['-v','error','-ss',String(time),'-i',target,
    '-frames:v','1','-vf',`scale=${width}:${height}`,'-f','rawvideo','-pix_fmt','rgb24','pipe:1'],
    {windowsHide:true, maxBuffer:width*height*4});
  if (rgb.length !== width*height*3) throw new Error('Could not decode test frame at '+time);
  let left=width, top=height, right=-1, bottom=-1;
  for (let y=0; y<height; y++) for (let x=0; x<width; x++) {
    const i=(y*width+x)*3;
    if (rgb[i+2]>160 && rgb[i+2]-rgb[i]>85 && rgb[i+2]-rgb[i+1]>70) {
      left=Math.min(left,x); right=Math.max(right,x); top=Math.min(top,y); bottom=Math.max(bottom,y);
    }
  }
  if (right-left<3 || bottom-top<3) throw new Error('Tracking mark not visible at '+time);
  return {time, x:(left+right)/2, y:(top+bottom)/2, width:right-left+1};
}

const samples=[1.5,2.5,2.8,2.9,2.97,3,3.07,3.13,3.2,3.3,3.5,4.5,5.5].map(locateMark);
const wide=samples[0], small=samples.at(-1);
const centers=samples.map(s=>s.y);
const displacement=Math.max(...centers)-Math.min(...centers);
const hasIntermediatePose=samples.some(s=>s.y>wide.y+2 && s.y<small.y-2);
if (displacement<8 || wide.width/small.width<1.12 || !hasIntermediatePose)
  throw new Error('Expected the presenter to move and change scale across title/steps scenes: '+JSON.stringify(samples));
console.log(JSON.stringify({passed:true,coordinates:'360x640 decoded pixels',samples},null,2));
