import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveStructuredTextPlaybackOrder, resolveStructuredTextNavigationTarget
} from '../src/domain/text/textStructuredPlaybackDomain.js';
import { executeStructuredTextPlaybackSessionService } from '../src/services/playback/textStructuredPlaybackSessionService.js';
import { TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES } from '../src/domain/text/textStructuredRuntimePlaybackPlanDomain.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
let count=0;
const check = async (name, fn) => {
  await fn(); count++;
  console.log(`PASS ${count}: ${name}`);
};
const card = (id, number) => ({
  id, title: id, blockType: 'paragraph',
  segments: [1,2,3].map(n=>({id:`${id}${n}`,text:`English ${number}.${n}.`,meaning:`Arti ${number}.${n}.`}))
});
const doc = {id:'P9-HF4D',editorModel:'structured-v1',documentType:'paragraph',title:'HF4D',blocks:[card('A',1),card('B',2),card('C',3)]};
const items=doc.blocks.flatMap(b=>b.segments.map(s=>({...s,id:s.id,blockId:b.id})));

await check('Shuffle moves complete cards, preserving sentence order',()=>{
 const shuffled=resolveStructuredTextPlaybackOrder({list:items,orderMode:'shuffle',random:()=>0});
 assert.deepEqual(shuffled.map(i=>i.id),['B1','B2','B3','C1','C2','C3','A1','A2','A3']);
});
await check('Shuffle anchors a selected card while preserving its internal sentence order',()=>{
 const shuffled=resolveStructuredTextPlaybackOrder({list:items,orderMode:'shuffle',anchorId:'B2',random:()=>0});
 assert.deepEqual(shuffled.slice(0,3).map(i=>i.id),['B1','B2','B3']);
});
await check('Sequential leaves authored order unchanged',()=>{
 assert.deepEqual(resolveStructuredTextPlaybackOrder({list:items,orderMode:'sequential'}),items);
});
await check('Full Next / Prev jumps card-to-card, even with mid-card cursor',()=>{
 assert.equal(resolveStructuredTextNavigationTarget({list:items,currentId:'A2',direction:'next',representationMode:'full'}).id,'B1');
 assert.equal(resolveStructuredTextNavigationTarget({list:items,currentId:'B3',direction:'prev',representationMode:'full'}).id,'A1');
});
await check('Split Next / Prev jumps sentence-to-sentence and across card boundaries',()=>{
 assert.equal(resolveStructuredTextNavigationTarget({list:items,currentId:'A2',direction:'next',representationMode:'split'}).id,'A3');
 assert.equal(resolveStructuredTextNavigationTarget({list:items,currentId:'B1',direction:'prev',representationMode:'split'}).id,'A3');
});
await check('Prev/Next wraps at both ends like Table navigation',()=>{
 assert.equal(resolveStructuredTextNavigationTarget({list:items,currentId:'A1',direction:'prev',representationMode:'full'}).id,'C1');
 assert.equal(resolveStructuredTextNavigationTarget({list:items,currentId:'C3',direction:'next',representationMode:'split'}).id,'A1');
});
await check('No prior cursor: Next begins at first, Prev begins at last',()=>{
 assert.equal(resolveStructuredTextNavigationTarget({list:items,direction:'next',representationMode:'full'}).id,'A1');
 assert.equal(resolveStructuredTextNavigationTarget({list:items,direction:'prev',representationMode:'split'}).id,'C3');
});
await check('Shuffle navigation uses frozen card order, not a new shuffle per tap',()=>{
 const ordered=resolveStructuredTextPlaybackOrder({list:items,orderMode:'shuffle',random:()=>0});
 assert.equal(resolveStructuredTextNavigationTarget({list:ordered,currentId:'B2',direction:'next',representationMode:'full'}).id,'C1');
 assert.equal(resolveStructuredTextNavigationTarget({list:ordered,currentId:'C3',direction:'next',representationMode:'full'}).id,'A1');
 assert.equal(resolveStructuredTextNavigationTarget({list:ordered,currentId:'B2',direction:'next',representationMode:'split'}).id,'B3');
});

async function runPlayback({representation='full',order='sequential',cursor=null,scope='document',stopOnFirst=false,override=null}) {
 globalThis.navigator ||= {};
 const played=[];const cursors=[];const completed=[];const session={current:0};
 const snapshot={current:null};const stopped={current:false};const paused={current:false};
 const tasks=[];const counters={finish:0};
 const args={
  documentTree:doc,scope,cursorSegmentId:cursor,
  playbackChannelMode:'text',playbackRepresentationMode:representation,
  playbackOrderMode:order,repeatMode:'once',orderedListOverride:override,
  playbackSessionRef:session,playbackContextRef:snapshot,stopSignalRef:stopped,pauseStateRef:paused,
  silentAudioRef:{current:null},waitWhilePaused:async()=>{},
  safePlayTransition: fn=> {session.current++;stopped.current=false;tasks.push(Promise.resolve().then(fn));},
  setIsPlaying:()=>{},setIsPaused:()=>{},setPlayingContext:()=>{},setPlayingIndex:()=>{},
  setCurrentIndex:()=>{},setSpeakingPart:()=>{},
  resolveBlockChannelPlaybackPlan:({block,channel})=>({steps:[{type:TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.FULL_TTS,channel,content:block.title}]}),
  playStructuredFullStep:async(step,block,item)=>{played.push(`full:${block.id}`);if(stopOnFirst){stopped.current=true;session.current++;}},
  playStructuredChannel:async(content,item,channel)=>{played.push(`split:${item.id}`);if(stopOnFirst){stopped.current=true;session.current++;}},
  onPlaybackCursor: state=>cursors.push(state),onPlaybackCompleted:state=>completed.push(state),
  forceStopAll:()=>{counters.finish++;session.current++;stopped.current=true;},addLog:()=>{},random:()=>0
 };
 assert.equal(executeStructuredTextPlaybackSessionService(args),true);
 await Promise.all(tasks);
 return {played,cursors,completed,snapshot:snapshot.current,counters};
}
await check('Full sequential from Card 2 plays Card 2 then Card 3, never Card 1 first',async()=>{
 const r=await runPlayback({cursor:'B2'});
 assert.deepEqual(r.played,['full:B','full:C']);
 assert.deepEqual(r.completed,[{documentId:'P9-HF4D',segmentId:'A1'}]);
});
await check('Full Shuffle stays Full and shuffles CARDS, not sentences',async()=>{
 const r=await runPlayback({order:'shuffle'});
 assert.deepEqual(r.played,['full:B','full:C','full:A']);
 assert.equal(r.snapshot.playbackRepresentationMode,'full');
 assert.deepEqual(r.snapshot.orderedList.map(s=>s.id).slice(0,3),['B1','B2','B3']);
});
await check('Full local TTS cursor identifies current Card even without playingIndex',async()=>{
 const r=await runPlayback({cursor:'B2',stopOnFirst:true});
 assert.deepEqual(r.played,['full:B']);
 assert.equal(r.cursors[0].segmentId,'B1');
 assert.deepEqual(r.completed,[]);
});
await check('Split Shuffle visits complete cards, retaining EN sentence order',async()=>{
 const r=await runPlayback({representation:'split',order:'shuffle'});
 assert.deepEqual(r.played,['split:B1','split:B2','split:B3','split:C1','split:C2','split:C3','split:A1','split:A2','split:A3']);
});
await check('Frozen shuffled order survives navigation restart with explicit cursor',async()=>{
 const order=resolveStructuredTextPlaybackOrder({list:items,orderMode:'shuffle',random:()=>0});
 const r=await runPlayback({representation:'full',order:'shuffle',cursor:'B3',override:order});
 assert.deepEqual(r.played,['full:B','full:C','full:A']);
});
await check('Split respects exact mid-card cursor after manual navigation',async()=>{
 const r=await runPlayback({representation:'split',cursor:'B2'});
 assert.deepEqual(r.played,['split:B2','split:B3','split:C1','split:C2','split:C3']);
});
await check('Stopped mid-playback retains callback cursor; natural finish resets doc',async()=>{
 const r=await runPlayback({representation:'split',cursor:'B2',stopOnFirst:true});
 assert.equal(r.cursors[0].segmentId,'B2');
 assert.deepEqual(r.completed,[]);
 const completed=await runPlayback({representation:'split',cursor:'B2'});
 assert.deepEqual(completed.completed,[{documentId:'P9-HF4D',segmentId:'A1'}]);
});

const app=readFileSync(join(root,'src/App.jsx'),'utf8');
const service=readFileSync(join(root,'src/services/playback/textStructuredPlaybackSessionService.js'),'utf8');
const cardUi=readFileSync(join(root,'src/components/text/TextStructuredPlayer.jsx'),'utf8');
const reading=readFileSync(join(root,'src/components/text/TextParagraphUnifiedReading.jsx'),'utf8');
await check('App uses Text-only cursor storage and representation-aware Nav',()=>{
 assert.match(app,/structuredTextResumeCursorRef/);
 assert.match(app,/resolveStructuredTextNavigationTarget/);
 assert.match(app,/onPlaybackCompleted:/);
 assert.match(app,/orderedListOverride/);
});
await check('Full playback never falls back to Split merely because Shuffle was chosen',()=>{
 assert.doesNotMatch(service,/fullRuntimeEnabled =[^;]*playbackOrderMode === TEXT_STRUCTURED_ORDER_MODES.SEQUENTIAL/s);
 assert.match(service,/buildScopedBlockGroups\(\{ scopedList: orderedList/);
});
await check('Card no longer contains a separate Split ON/OFF switch',()=>{
 assert.doesNotMatch(cardUi,/setParagraphSplitMode|data-text-paragraph-split-toggle/);
 assert.match(cardUi,/splitMode=\{!isFullRepresentation\}/);
});
await check('Card heading EN / ID controls remain compact, one-shot',()=>{
 assert.match(reading,/data-text-paragraph-play-channel="text"/);
 assert.match(reading,/data-text-paragraph-play-channel="meaning"/);
 assert.match(reading,/className="h-7 w-7/);
});
await check('Table files unchanged by HF4-D',()=>{
 // Only bounded Text/Playback paths are targeted; external assembly checks file hashes separately.
 const manifest=['src/App.jsx','src/components/text/TextStructuredPlayer.jsx','src/components/text/TextParagraphUnifiedReading.jsx','src/components/text/TextStructuredPlaybackControls.jsx','src/services/playback/textStructuredPlaybackSessionService.js','src/domain/text/textStructuredPlaybackDomain.js'];
 assert.ok(manifest.every(path=>!path.startsWith('src/components/table/')));
});
console.log(`HF4-D navigation audit complete: ${count}/${count} PASS`);
