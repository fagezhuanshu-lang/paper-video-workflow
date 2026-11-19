import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPresenterTrack, presenterAt, validatePresenter} from '../src/presenter.mjs';

test('short neighboring scenes produce ordered keys and a continuous return to the lead shot',()=>{
  const scenes=[{start:0,end:2,kind:'title'},{start:2,end:2.12,kind:'steps'},{start:2.12,end:4,kind:'quote'}];
  const keys=buildPresenterTrack(scenes);
  assert.ok(keys.every((k,i)=>!i||k.time>keys[i-1].time));
  const lead=presenterAt(keys,1), compact=presenterAt(keys,2.06), restored=presenterAt(keys,3);
  assert.ok(compact.width<lead.width && compact.y>lead.y);
  assert.equal(restored.width,lead.width);
  assert.equal(restored.y,lead.y);
  for(const time of [1.97,2.1]) {
    const box=presenterAt(keys,time);
    assert.ok(box.width>compact.width && box.width<lead.width);
  }
});

test('explicit matching shot sizes hold still across a change of scene',()=>{
  const scenes=[{start:0,end:2,kind:'title'},{start:2,end:4,kind:'steps',presenter:'large'}];
  const keys=buildPresenterTrack(scenes);
  assert.deepEqual(presenterAt(keys,1),presenterAt(keys,3));
  assert.throws(()=>validatePresenter({scenes,presenter:{anchorY:2}}),/anchorY/);
  assert.throws(()=>validatePresenter({scenes,presenter:null}),/object/);
});
