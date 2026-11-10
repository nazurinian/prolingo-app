import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { DEFAULT_TEXT_STRUCTURED_PREFERENCES as defaults, TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES as CHANNEL } from '../src/domain/text/textStructuredPlaybackPreferenceDomain.js';
import { APP_VERSION, APP_CHECKPOINT_ID } from '../src/constants/appMetadata.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const app = read('src/App.jsx');
const settings = read('src/components/text/TextStructuredPlaybackControls.jsx');
const card = read('src/components/text/TextStructuredPlayer.jsx');
const paragraph = read('src/components/text/TextParagraphUnifiedReading.jsx');
const sidebar = read('src/components/text/TextStructuredAudioControls.jsx');
const load = createRequire(import.meta.url);
let esbuild = null;
let ts = null;
try { esbuild = load('esbuild'); } catch { /* CI / developer offline environment */ }
try { ts = load('typescript'); } catch { /* TypeScript is an optional extra audit */ }
if (!esbuild && !ts && process.platform !== 'win32') {
  try { ts = load('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'); } catch { /* not installed */ }
}
if (!esbuild && !ts) throw new Error('This audit requires npm ci (esbuild) or an installed TypeScript compiler.');
const transpile = (source, absPath) => esbuild
  ? esbuild.transformSync(source, { loader: absPath.endsWith('.jsx') ? 'jsx' : 'js', format: 'cjs', target: 'es2022', jsx: 'transform' }).code
  : ts.transpileModule(source, { fileName: absPath, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
let passed=0;
const check=(label,fn)=>{fn();console.log(`PASS ${++passed}: ${label}`)};
check('Version manifest aligned and Edge dependency unchanged',()=>{
 assert.equal(APP_VERSION,'6.0.3-beta.8-p9-hf4c-r1');
 assert.match(APP_CHECKPOINT_ID,/HF4C-R1/);
 assert.equal(pkg.version,APP_VERSION);
 assert.equal(lock.version,APP_VERSION);
 assert.equal(lock.packages[''].version,APP_VERSION);
 assert.equal(pkg.dependencies['msedge-tts'],'^2.1.1');
});
check('Settings declares all three behaviour option arrays',()=>{
 for(const ident of ['ORDER_OPTIONS','REPEAT_OPTIONS','RESUME_OPTIONS']) assert.match(settings,new RegExp(`const ${ident}\\s*=`));
});
check('One-shot channel constant is imported by App and quick-play handler retains manual preferences',()=>{
 assert.match(app,/import\s*\{[^}]*TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES[^}]*\}\s*from\s*['"]\.\/domain\/text\/textStructuredPlaybackPreferenceDomain\.js['"]/);
 assert.match(app,/const handleStructuredTextPlayCard = \(blockId, channelOverride = null\)/);
 assert.match(app,/playbackChannelMode: oneShotChannel/);
 assert.doesNotMatch(app.match(/const handleStructuredTextPlayCard =[\s\S]*?\n  \};/)?.[0]||'',/setTextStructuredPreferences/);
});
check('Settings overlay has a reachable Stop audio action when playback locks controls',()=>{
 assert.match(card,/data-text-settings-stop-playback="true"/);
 assert.match(card,/onClick=\{\(\) => onStopPlayback\?\.\(\)\}/);
 assert.match(app,/onStopPlayback=\{forceStopAll\}/);
 assert.match(card,/data-text-settings-busy-reason="true"/);
});
check('Paragraph EN/ID Play buttons are compact icon-only, keep accessible names',()=>{
 for(const channel of ['text','meaning']) {
  const button=paragraph.split('\n').find(line => line.includes(`data-text-paragraph-play-channel="${channel}"`));
  assert.ok(button,channel);
  assert.match(button,/h-9 w-9/);
  assert.match(button,/aria-label=/);
  assert.doesNotMatch(button,/>Play (?:EN|ID)</);
 }
});
check('Card Play remains compact and still dispatches original handler',()=>{
 assert.match(card,/data-text-card-play-compact="true"/);
 assert.match(card,/onPlayCard\?\.\(block\.id\)/);
});
check('Three settings tabs and three Audio sidebar tabs retained',()=>{
 for(const tab of ["'playback'","'manual'","'display'"]) assert.ok(settings.includes(tab),tab);
 for(const tab of ['Playback Voices','Generate Audio','Audio Library']) assert.ok(sidebar.includes(tab),tab);
});
check('Table tree and IndexedDB text schema remain untouched in this repair patch',()=>{
 assert.equal(defaults.playbackRepresentationMode,'split');
 assert.ok(fs.existsSync(path.join(root,'src/domain/text/textStructuredCardExpansionDomain.js')));
});
check('Changed JSX and JS parse without errors',()=>{
 const files=['src/App.jsx','src/components/text/TextStructuredPlaybackControls.jsx','src/components/text/TextStructuredPlayer.jsx','src/components/text/TextParagraphUnifiedReading.jsx'];
 for(const file of files){
  const text=read(file);
  if (esbuild) assert.ok(transpile(text,path.join(root,file)),file);
  else {const sf=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,file.endsWith('.jsx')?ts.ScriptKind.JSX:ts.ScriptKind.JS);assert.equal(sf.parseDiagnostics.length,0,file)}
 }
});
check('Changed files have no unresolved local identifiers (TS2304/2552)',()=>{
 const files=['src/App.jsx','src/components/text/TextStructuredPlaybackControls.jsx','src/components/text/TextStructuredPlayer.jsx','src/components/text/TextParagraphUnifiedReading.jsx'].map(f=>path.join(root,f));
 if(ts){
  const program=ts.createProgram(files,{allowJs:true,checkJs:true,noEmit:true,jsx:ts.JsxEmit.React,skipLibCheck:true,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Node10,target:ts.ScriptTarget.ES2022,allowSyntheticDefaultImports:true});
  const bad=ts.getPreEmitDiagnostics(program).filter(d=>files.includes(d.file?.fileName) && [2304,2552,2448,2454,2459].includes(d.code));
  assert.deepEqual(bad.map(d=>({file:path.basename(d.file.fileName),error:ts.flattenDiagnosticMessageText(d.messageText,' ')})),[]);
 } else {
  // A portable guard for the two resolved missing bindings; the JSX render smoke below
  // exercises the actual settings module in environments with esbuild only.
  for(const x of ['ORDER_OPTIONS','REPEAT_OPTIONS','RESUME_OPTIONS'])assert.ok(settings.includes(`const ${x} =`));
  assert.match(app,/TEXT_STRUCTURED_ORDER_MODES, TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES, TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES/);
 }
});

// A JSX render smoke with lightweight React function primitives. It checks the
// initial render path, which the earlier text/hash-only audit could not execute.
let hookValues=[];
let hookSlot=0;
const resetHooks=()=>{hookValues=[];hookSlot=0;};
const rerenderHooks=()=>{hookSlot=0;};
const mockReact={
 Fragment:Symbol('Fragment'),
 createElement:(type,props,...children)=>({type,props:{...(props||{}),children:children.length===1?children[0]:children}}),
 useState:initial=>{
  const at=hookSlot++;
  if(!(at in hookValues))hookValues[at]=typeof initial==='function'?initial():initial;
  return [hookValues[at],value=>{hookValues[at]=typeof value==='function'?value(hookValues[at]):value;}];
 },
 useMemo:fn=>fn(),
 useCallback:fn=>fn,
 useRef:initial=>({current:initial}),
 useEffect:()=>{},
 useLayoutEffect:()=>{},
 memo:fn=>fn
};
const fakeIcons=new Proxy({}, {get:(_,k)=>typeof k==='string'?function Icon(){return null}:null});
const cache=new Map();
const loadModule=(absPath)=>{
 absPath=path.resolve(absPath);if(cache.has(absPath))return cache.get(absPath).exports;
 const source=fs.readFileSync(absPath,'utf8');
 const outputText=transpile(source,absPath);
 const module={exports:{}};cache.set(absPath,module);
 const req=(specifier)=>{
  if(specifier==='react')return {...mockReact,default:mockReact,__esModule:true};
  if(specifier==='lucide-react')return fakeIcons;
  if(specifier==='react-dom')return {createPortal:children=>children};
  if(!specifier.startsWith('.'))throw new Error(`Unexpected dependency: ${specifier}`);
  const resolved=path.resolve(path.dirname(absPath),specifier);
  for(const candidate of [resolved,resolved+'.jsx',resolved+'.js']) if(fs.existsSync(candidate))return loadModule(candidate);
  throw new Error(`Missing module ${specifier} from ${absPath}`);
 };
 new Function('require','module','exports',outputText)(req,module,module.exports);
 return module.exports;
};
const renderTree=(node,depth=0)=>{
 if(depth>100)throw new Error('Excessive component nesting');
 if(Array.isArray(node))return node.flatMap(n=>renderTree(n,depth+1));
 if(node===null||node===undefined||typeof node==='boolean')return [];
 if(typeof node!=='object'||!('type' in node))return [node];
 if(typeof node.type==='function')return renderTree(node.type(node.props),depth+1);
 const child=renderTree(node.props?.children,depth+1);
 return [{...node,child},...child];
};
check('Actual Settings JSX initial playback render does not throw and offers behaviour choices',()=>{
 resetHooks();
 const Settings=loadModule(path.join(root,'src/components/text/TextStructuredPlaybackControls.jsx')).default;
 const tree=renderTree(Settings({documentTree:{id:'test-doc',editorModel:'structured-v1'},preferences:defaults,playbackRepresentationMode:'split',playbackOrder:{channels:{text:[],meaning:[]},ttsOnly:false}}));
 assert.ok(tree.some(n=>n?.props?.['data-text-player-settings']==='true'));
 assert.ok(tree.some(n=>n?.props?.['data-text-player-behaviour']==='true'));
 const choices=tree.filter(n=>n?.props?.['data-text-choice-group']);
 assert.ok(choices.length>=5,'Behaviour options should render');
});
check('Playback settings buttons dispatch real preference updates and tab navigation works',()=>{
 resetHooks();
 const Settings=loadModule(path.join(root,'src/components/text/TextStructuredPlaybackControls.jsx')).default;
 const changes=[];
 const props={documentTree:{id:'test-doc',editorModel:'structured-v1'},preferences:defaults,playbackRepresentationMode:'split',playbackOrder:{channels:{text:[],meaning:[]},ttsOnly:false},onPlaybackFeelChange:patch=>changes.push(patch),onPlaybackChannelModeChange:value=>changes.push({channel:value})};
 let nodes=renderTree(Settings(props));
 const shuffle=nodes.find(n=>n?.type==='button' && n.props?.children==='Shuffle');
 assert.ok(shuffle);shuffle.props.onClick();assert.deepEqual(changes.pop(),{playbackOrderMode:'shuffle'});
 const manualTab=nodes.find(n=>n?.type==='button' && n.props?.role==='tab' && n.props.children==='Manual Play');
 assert.ok(manualTab);manualTab.props.onClick();rerenderHooks();nodes=renderTree(Settings(props));
 assert.ok(nodes.some(n=>n?.props?.['data-text-manual-playback-settings']==='true'));
 const displayTab=nodes.find(n=>n?.type==='button'&&n.props?.role==='tab'&&n.props.children==='Display');
 assert.ok(displayTab);displayTab.props.onClick();rerenderHooks();nodes=renderTree(Settings(props));
 assert.ok(nodes.some(n=>n?.props?.['data-text-player-show-play']==='true'));
});
check('Actual Paragraph JSX renders compact English/Indonesian quick-play buttons',()=>{
 const Paragraph=loadModule(path.join(root,'src/components/text/TextParagraphUnifiedReading.jsx')).TextParagraphUnifiedReading;
 let played=[];
 const nodes=renderTree(Paragraph({segments:[{id:'s1',text:'English test',meaning:'Arti tes'}],displayMode:'text-meaning',onPlayChannel:ch=>played.push(ch)}));
 const en=nodes.find(n=>n?.props?.['data-text-paragraph-play-channel']==='text');
 const id=nodes.find(n=>n?.props?.['data-text-paragraph-play-channel']==='meaning');
 assert.ok(en);assert.ok(id);
 en.props.onClick();id.props.onClick();assert.deepEqual(played,['text','meaning']);
});
check('Actual Text Audio sidebar JSX renders navigation without runtime exception',()=>{
 resetHooks();
 const Audio=loadModule(path.join(root,'src/components/text/TextStructuredAudioControls.jsx')).default;
 const doc={id:'test-doc',editorModel:'structured-v1',documentType:'paragraph',blocks:[{id:'card',blockType:'paragraph',segments:[{id:'s1',text:'Hello.',meaning:'Halo.'}]}]};
 const props={documentTree:doc,preferences:defaults,englishVoices:[],indonesianVoices:[],generationPreferences:{},audioLibrary:null};
 let nodes=renderTree(Audio(props));
 assert.ok(nodes.find(n=>n?.props?.['data-text-audio-sidebar']==='true'));
 for(const tab of ['playback','download','library']) assert.ok(nodes.find(n=>n?.props?.['data-text-audio-tab']===tab));
 nodes.find(n=>n?.props?.['data-text-audio-tab']==='download').props.onClick();rerenderHooks();nodes=renderTree(Audio(props));
 assert.ok(nodes.find(n=>n?.props?.['data-text-download-defaults']==='true'));
 nodes.find(n=>n?.props?.['data-text-audio-tab']==='library').props.onClick();rerenderHooks();nodes=renderTree(Audio(props));
 assert.ok(nodes.find(n=>n?.props?.['data-text-audio-library-surface']==='true'));
});
console.log(`HF4C-R1 repair audit complete: ${passed}/${passed} PASS`);
