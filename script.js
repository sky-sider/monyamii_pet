'use strict';

// ちいさな同居人 v20 — お散歩先での多彩な行動・個別の好みと記憶。既存セーブキー・性格値と全機能を保持。
// 数値は内部でのみ扱います。プレイヤーには仕草と行動で伝えます。
const SAVE_KEY = 'mofuri-pet-save-v1'; // v1 / v2 のセーブデータを引き継ぐ
const canvas = document.getElementById('petCanvas');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);
const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, v));
const rand = (items) => items[Math.floor(Math.random() * items.length)];
const palettes = ['クリーム', '薄い水色', '淡い桃色', '灰色', '薄茶色', 'ミント'];
const quirkList = ['小さなものを集める', '窓辺を気にする', '寝る前にくるくる回る', 'クッションの端を調べる', '気になるものをつつく'];
const likes = ['丸いもの', '光るもの', '柔らかいもの', '葉っぱ', '小さな石', '四角いもの', '狭いところ'];
const names = ['モフリ', 'ポム', 'ルル', 'ネム', 'トト', 'ミミ', 'ピノ', 'ムク'];
const ROOM_ITEM_TYPES = {
  ball:    {label:'毛糸玉',    sprite:'ball.png',    tags:['丸いもの','柔らかいもの'], w:36, h:36, approach:23},
  cushion: {label:'クッション', sprite:'cushion.png', tags:['柔らかいもの'], w:62, h:45, approach:3},
  pebble:  {label:'きらきら小石',sprite:'pebble.png',  tags:['丸いもの','光るもの','小さな石'], w:39, h:39, approach:23},
  plant:   {label:'鉢植え',    sprite:'plant.png',   tags:['葉っぱ'], w:54, h:56, approach:32},
  mirror:  {label:'小さな鏡',   sprite:'mirror.png',  tags:['光るもの'], w:42,h:49,approach:29},
  bell:    {label:'小さな鈴',   sprite:'bell.png',    tags:['光るもの','丸いもの'], w:37,h:38,approach:22},
  plush:   {label:'ぬいぐるみ', sprite:'plush.png',   tags:['柔らかいもの'], w:44,h:46,approach:22},
  blocks:  {label:'積み木',     sprite:'blocks.png',  tags:['四角いもの'], w:48,h:44,approach:28},
  blanket: {label:'毛布',       sprite:'blanket.png', tags:['柔らかいもの'], w:53,h:39,approach:18},
  tunnel:  {label:'トンネル',   sprite:'tunnel.png',  tags:['柔らかいもの','狭いところ'], w:58,h:49,approach:23},
  bubbles: {label:'シャボン玉', sprite:'bubbles.png', tags:['丸いもの','光るもの'], w:39,h:46,approach:26},
  box:     {label:'小さな箱',   sprite:'box.png',     tags:['四角いもの','狭いところ'], w:50,h:47,approach:27}
};
const ROOM_MAX_PLACED = 6; // 部屋が混み合わないようにする。収納しても記憶は残る。
// 背景だけを模様替え。既存の家具座標・習慣・ペットの記憶は保持する。
const ROOM_THEMES = Object.freeze({
  western: {label:'洋風',file:'western.png'},
  japanese: {label:'和風',file:'japanese.png'},
  cute: {label:'可愛い',file:'cute.png'},
  cyber: {label:'サイバー',file:'cyber.png'}
});
// —— v16: おさんぽ先と探索対象。場所と対象を分けて記憶する。——
const WALK_DESTINATIONS={
 town:{label:'近所の街',image:'town.png',tags:['丸いもの','葉っぱ'],targets:[
   {id:'flowers',label:'花壇',x:72,y:139,verb:'花の香りを確かめる',souvenir:'花びら',itemId:'petal',tags:['葉っぱ']},
   {id:'sign',label:'お店の看板',x:162,y:115,verb:'看板をじっと見上げる',tags:['光るもの']},
   {id:'bench',label:'木のベンチ',x:251,y:151,verb:'ベンチの陰をのぞく',tags:['柔らかいもの']},
   {id:'button',label:'道端の小さなボタン',x:295,y:175,verb:'小さなボタンをつつく',souvenir:'小さなボタン',itemId:'button',tags:['丸いもの','小さな石']} ]},
 sea:{label:'海辺',image:'seaside.png',tags:['丸いもの','光るもの'],targets:[
   {id:'shell',label:'貝殻',x:62,y:165,verb:'貝殻の模様を確かめる',souvenir:'しましま貝殻',itemId:'shell',tags:['丸いもの']},
   {id:'waves',label:'波打ち際',x:158,y:135,verb:'寄せては返す波を見つめる',tags:['光るもの']},
   {id:'wood',label:'流木',x:248,y:169,verb:'流木の周りをぐるぐる回る',tags:['小さな石']},
   {id:'glass',label:'シーグラス',x:299,y:179,verb:'透き通るかけらを眺める',souvenir:'丸いシーグラス',itemId:'glass',tags:['光るもの']} ]},
 mountain:{label:'山の小道',image:'mountain.png',tags:['葉っぱ','小さな石'],targets:[
   {id:'mushroom',label:'小さなきのこ',x:82,y:164,verb:'きのこの周囲を回る',tags:['丸いもの']},
   {id:'stream',label:'小川',x:204,y:159,verb:'小川の音に耳を澄ます',tags:['光るもの']},
   {id:'acorn',label:'どんぐり',x:146,y:176,verb:'ころんとしたどんぐりをつつく',souvenir:'どんぐり',itemId:'acorn',tags:['丸いもの']},
   {id:'leaf',label:'落ち葉',x:288,y:171,verb:'風に揺れる葉っぱを追いかける',souvenir:'変わった形の葉っぱ',itemId:'leaf',tags:['葉っぱ']} ]}
};

// —— v20: 同じ対象にも3通りのふるまい。すべて実際の探索時にだけ選ぶ。——
// [識別子, 動作の説明, 基本アニメ, 特徴的な仕草, 周囲の小さな演出, 気持ち, 印象の変化, 記念行動]
const WALK_BEHAVIORS=Object.freeze({
 town:{
  flowers:[
   ['smell','花に近づき、そっと香りを確かめています。','sniff','tilt','petal','curious',2,false],
   ['petal','舞い落ちた花びらを、ぽよんと追いかけています。','play','bounce','petal','playful',3,true],
   ['rain','雨に濡れた花のそばで、静かに雨宿りしています。','idle','sitBeside','rain','calm',2,false,'rain']],
  sign:[
   ['watch','看板をじっと見上げて、形を確かめています。','look','stare','spark','curious',1,false],
   ['mimic','看板と同じ形になろうと、体をふくらませています。','happy','puff','spark','mimic',3,true],
   ['twice','看板が気になって、立ち去りかけてから二度見しました。','look','doubleTake','spark','cautious',1,false]],
  bench:[
   ['rest','ベンチの陰で、のんびり一休みしています。','sleep','doze','calm','calm',2,false],
   ['peek','ベンチの陰に隠れ、ときどきこちらをのぞきます。','look','peek','peek','cautious',1,true],
   ['circle','ベンチの脚を何度もくるくる回っています。','play','spin','dust','playful',2,false]],
  button:[
   ['nudge','小さなボタンを、体でこつんとつつきました。','sniff','tilt','spark','curious',1,false],
   ['line','ボタンを落ち着く位置まで動かして、じっと眺めています。','collect','stare','spark','orderly',3,true],
   ['hold','ボタンを大事そうに抱え、そばで動かずにいます。','collect','puff','heart','collector',3,false]]
 },
 sea:{
  shell:[
   ['pattern','貝殻の模様をじっくり眺めています。','look','tilt','spark','curious',1,false],
   ['roll','貝殻をそっと転がして、追いかけています。','play','bounce','sand','playful',3,true],
   ['line','貝殻をきれいに並べようとしています。','collect','stare','spark','orderly',2,false]],
  waves:[
   ['watch','波の音を聞きながら、寄せては返す水面を眺めています。','look','stare','wave','calm',2,false],
   ['chase','引いていく波を追いかけ、楽しそうに跳ねています。','happy','bounce','splash','playful',3,true,'sun'],
   ['startle','波が近づいて、びくっとして後ろへ下がりました。','wary','stepBack','splash','cautious',-3,false]],
  wood:[
   ['around','流木の周りをゆっくり一周しています。','walk','spin','sand','curious',1,false],
   ['climb','流木の上に乗ろうとして、小さくぴょんと跳ねました。','happy','bounce','dust','playful',3,true],
   ['shade','流木の陰に体を寄せて、ほっとしています。','idle','sitBeside','calm','calm',2,false]],
  glass:[
   ['glow','シーグラスに映る光をじっと追っています。','look','stare','spark','curious',2,false],
   ['collect','シーグラスをそっと持ち上げ、大切そうに眺めています。','collect','puff','spark','collector',3,true],
   ['peek','きらめきが気になって、少し近づいては戻っています。','wary','hesitate','spark','cautious',0,false]]
 },
 mountain:{
  mushroom:[
   ['circle','きのこの周りをくるくる回っています。','walk','spin','leaf','curious',2,false],
   ['imitate','きのこの形を真似しようと、ぽふっと体を膨らませます。','happy','puff','spark','mimic',3,true],
   ['caution','きのこが気になるのに、近づいてはそっと戻っています。','look','hesitate','leaf','cautious',0,false]],
  stream:[
   ['listen','小川の音を聞きながら、じっと佇んでいます。','look','stare','wave','calm',2,false],
   ['touch','水面へそっと近づき、水のきらめきを確かめています。','sniff','tilt','spark','curious',2,true,'sun'],
   ['back','水音に驚いて、びくっと後ずさりました。','wary','startle','splash','cautious',-2,false]],
  acorn:[
   ['sniff','どんぐりの匂いを、くんくん確かめています。','sniff','tilt','leaf','curious',1,false],
   ['roll','どんぐりをころころ転がして遊んでいます。','play','bounce','dust','playful',3,true],
   ['carry','どんぐりを大切そうに持ち上げ、形を眺めています。','collect','puff','heart','collector',3,false]],
  leaf:[
   ['chase','風に舞う落ち葉を、ぽよぽよと追いかけています。','play','bounce','leaf','playful',3,true,'autumn'],
   ['cover','落ち葉を頭に乗せて、しばらくじっとしています。','idle','puff','leaf','mimic',2,false],
   ['line','落ち葉を並べて、形の違いを確かめています。','collect','stare','leaf','orderly',2,false]]
 }
});
const WALK_MOTIVE_WEIGHT={
 curious:()=>pet.curiosity*.32+pet.emotions.interest*.15,
 playful:()=>pet.activity*.35+tendencyScores().mischievous*.18,
 cautious:()=>pet.caution*.28+pet.emotions.wariness*.23+tendencyScores().cautiousExplorer*.12,
 calm:()=>Math.max(0,100-pet.activity)*.29+pet.tired*.22+tendencyScores().relaxed*.18,
 collector:()=>pet.attachment*.24+tendencyScores().collector*.22,
 orderly:()=>tendencyScores().tidy*.36+pet.attachment*.12,
 mimic:()=>pet.curiosity*.2+tendencyScores().mischievous*.15
};
function newWalkTargetMemory(affinity=Math.round(Math.random()*20-10)){
 return {familiarity:0,affinity,good:0,wary:0,lastBehavior:null,behaviorCounts:{},favoriteNoted:false,cautiousNoted:false,lastAt:0};
}
function stableWalkTargetAffinity(locationId,targetId){
 // v19以前の子には古い個性値から安定生成。アップデートごとに変わらない。
 const text=[pet.name,pet.palette,pet.curiosity,pet.caution,pet.dayStarted,locationId,targetId].join('|');
 let h=2166136261;
 for(const letter of text)h=Math.imul(h^letter.charCodeAt(0),16777619)>>>0;
 return (h%21)-10;
}
function walkTargetMemory(w,target){return pet.walkMemory.locations[w.location].targetMemory[target.id];}
function selectWalkBehavior(w,target,now=Date.now()){
 const memory=walkTargetMemory(w,target),weather=weatherForTime(now),options=WALK_BEHAVIORS[w.location][target.id];
 const motiveScores=tendencyScores();
 const picks=options.map(([id,caption,sprite,pose,effect,motive,valence,notable,preferred])=>{
   let weight=11+(WALK_MOTIVE_WEIGHT[motive]?.()||15)*.62;
   if(motive==='cautious')weight*=Math.max(.4,1-memory.familiarity/155);
   if(motive==='playful'&&pet.tired>65)weight*=.4;
   if(motive==='calm'&&pet.tired>60)weight*=1.45;
   if(motive==='orderly')weight*=.65+motiveScores.tidy/150;
   if(motive==='collector')weight*=.65+motiveScores.collector/160;
   if(memory.affinity<-10 && motive==='cautious')weight*=1.55;
   if(memory.affinity>10 && (motive==='playful'||motive==='curious'||motive==='collector'))weight*=1.22;
   if(preferred && (weather.weather===preferred||weather.season===preferred))weight*=1.9;
   if(preferred==='rain' && weather.weather==='sun')weight*=.34;
   if((effect==='petal'||effect==='leaf')&&weather.weather==='rain')weight*=.70;
   // 同じ反応が続きすぎないようにする。好みは残しつつ行動には幅を持たせる。
   if(memory.lastBehavior===id)weight*=.37;
   return {id,weight:Math.max(1,weight)};
 });
 const chosen=weightedChoice(picks);
 const [id,caption,sprite,pose,effect,motive,valence,notable]=options.find(v=>v[0]===chosen);
 return {id,caption,sprite,pose,effect,motive,valence,notable,
   duration:3100+(motive==='calm'?1100:0)+Math.floor(Math.random()*1300)};
}
function walkTargetImpression(locationId,targetId){
 const memory=pet.walkMemory.locations[locationId].targetMemory[targetId];
 const target=WALK_DESTINATIONS[locationId].targets.find(t=>t.id===targetId);
 if(!memory||!target||memory.familiarity<3)return null;
 const name=target.label;
 if(memory.familiarity>=4&&memory.affinity>=10&&memory.good>=2)return `${name}を見つけると、よく足を止めるようです。お気に入りなのかもしれません。`;
 if(memory.familiarity>=4&&memory.affinity<=-9&&memory.wary>=2)return `${name}は気になるようですが、まだ少し距離を取りたがるようです。`;
 if(memory.familiarity>=3)return `${name}には何度か近づいています。まだ、どんな気持ちなのかはわかりません。`;
 return null;
}
function renderWalkImpressions(){
 const el=$('walkImpression');if(!el)return;
 if(!walkSession){el.textContent='';return;}
 const id=walkSession.location,targets=WALK_DESTINATIONS[id].targets;
 const best=targets.map(t=>({t,m:pet.walkMemory.locations[id].targetMemory[t.id]}))
  .filter(x=>x.m&&x.m.familiarity>=3)
  .sort((a,b)=>b.m.familiarity-a.m.familiarity)[0];
 el.textContent=best?`この子の小さな発見：${walkTargetImpression(id,best.t.id)}`:
 'この場所の何が気になるのでしょう。何度か歩くうちに、少しずつわかってくるかもしれません。';
}

function newWalkMemory(){return {locations:Object.fromEntries(Object.keys(WALK_DESTINATIONS).map(k=>[k,{visits:0,familiarity:0,affinity:Math.round(Math.random()*22-11),explored:{},favoriteNoted:false,targetMemory:Object.fromEntries(WALK_DESTINATIONS[k].targets.map(t=>[t.id,newWalkTargetMemory()]))}])),souvenirs:[],totalWalks:0};}
function normalizeWalkMemory(old){
 const basis=newWalkMemory(),source=old&&typeof old==='object'?old:{};
 for(const [id,location] of Object.entries(WALK_DESTINATIONS)){
  const value=source.locations?.[id];if(!value||typeof value!=='object')continue;
  const data=basis.locations[id];data.visits=clamp(Number(value.visits)||0,0,100000);
  data.familiarity=clamp(Number(value.familiarity)||0,0,100);
  data.affinity=clamp(Number.isFinite(value.affinity)?value.affinity:data.affinity,-35,35);
  data.favoriteNoted=!!value.favoriteNoted;
  data.explored=Object.fromEntries(location.targets.map(t=>[t.id,clamp(Number(value.explored?.[t.id])||0,0,9999)]));
  data.targetMemory=Object.fromEntries(location.targets.map(t=>{
   const old=value.targetMemory?.[t.id]||{};
   const fallback=newWalkTargetMemory(stableWalkTargetAffinity(id,t.id));
   return [t.id,{
    familiarity:clamp(Number(old.familiarity)||0,0,9999),
    affinity:clamp(Number.isFinite(old.affinity)?old.affinity:fallback.affinity,-35,35),
    good:clamp(Number(old.good)||0,0,9999),wary:clamp(Number(old.wary)||0,0,9999),
    lastBehavior:WALK_BEHAVIORS[id][t.id].some(b=>b[0]===old.lastBehavior)?old.lastBehavior:null,
    behaviorCounts:Object.fromEntries(WALK_BEHAVIORS[id][t.id].map(b=>[b[0],clamp(Number(old.behaviorCounts?.[b[0]])||0,0,9999)])),
    favoriteNoted:!!old.favoriteNoted,cautiousNoted:!!old.cautiousNoted,
    lastAt:Number.isFinite(old.lastAt)?old.lastAt:0
   }];
  }));
 }
 basis.souvenirs=Array.isArray(source.souvenirs)?source.souvenirs.filter(s=>s&&WALK_DESTINATIONS[s.location]&&typeof s.name==='string'&&Number.isFinite(s.at)).slice(-30).map(s=>({id:String(s.id||'').slice(0,30),name:s.name.slice(0,30),location:s.location,at:s.at})):[];
 basis.totalWalks=clamp(Number(source.totalWalks)||0,0,100000);
 return basis;
}
const DEFAULT_ROOM_THEME = 'western';
function validRoomTheme(id) { return Object.prototype.hasOwnProperty.call(ROOM_THEMES,id) ? id : DEFAULT_ROOM_THEME; }
// —— v14: 必要な画面にだけ移動する。ゲーム内の状態は切り替えません ——
const APP_TABS=['home','room','fashion','notes'];
let activeAppTab='home';
function openAppTab(tab,{focus=false,scroll=true}={}){
  if(!APP_TABS.includes(tab))return;
  if(tab!=='home' && walkSession)endWalk(); // 別画面へ移ると安全に帰宅。見ていない間の散歩イベントは起こさない。
  activeAppTab=tab;
  for(const id of APP_TABS){
    const selected=id===tab;
    const panel=$('page-'+id),button=$('tab-'+id);
    if(panel) panel.hidden=!selected;
    if(button){button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;}
  }
  if(scroll) window.scrollTo({top:0,behavior:'auto'});
  if(focus){const btn=$('tab-'+tab);if(btn)btn.focus({preventScroll:true});}
}
function refreshTodayHighlight(){
  const el=$('todayHighlight');if(!el||!pet)return;
  const latest=pet.logs && pet.logs[0];
  el.textContent=latest || `${pet.name}は今日も自分のペースで過ごしています。`;
}
function applyRoomTheme(){
  const id=validRoomTheme(pet.roomTheme);
  pet.roomTheme=id;
  const url=`assets/rooms/${ROOM_THEMES[id].file}`;
  $('roomScene').style.backgroundImage=`url("${url}")`;
  document.querySelector('.intro-scene').style.backgroundImage=`url("${url}")`;
  $('currentRoomTheme').textContent=`${ROOM_THEMES[id].label}のおへや`;
  document.querySelectorAll('[data-room-theme]').forEach(button=>{
    const chosen=button.dataset.roomTheme===id;
    button.setAttribute('aria-pressed',String(chosen));
    button.title=chosen?'今のおへや':`${ROOM_THEMES[button.dataset.roomTheme].label}のおへやにする`;
  });
}
function selectRoomTheme(id){
  const next=validRoomTheme(id);
  if(next===pet.roomTheme)return;
  pet.roomTheme=next;
  roomSpecialVisit=null;
  applyRoomTheme();
  renderWeather();
  const status=$('roomThemeStatus');if(status)status.textContent=`${ROOM_THEMES[next].label}のおへやに切り替えました。`;
  $('roomCaption').textContent=`おへやを${ROOM_THEMES[next].label}に模様替えしました。${pet.name}はいつもどおり過ごしています。`;
  save();
}

// —— v11: ゲーム内の空模様と、部屋固有の自発的なふるまい ——
// 6時間ごとに切り替わるローカル時間基準の空模様。気象APIは使いません。
const WEATHER_NAMES={sun:'晴れ',cloud:'くもり',rain:'雨',snow:'雪'};
const WEATHER_ICONS={sun:'☀',cloud:'☁',rain:'☂',snow:'❄'};
const SEASONS={spring:{name:'春',months:[3,4,5]},summer:{name:'夏',months:[6,7,8]},autumn:{name:'秋',months:[9,10,11]},winter:{name:'冬',months:[12,1,2]}};
const WEATHER_WEIGHTS={spring:[45,27,28,0],summer:[53,23,24,0],autumn:[42,34,24,0],winter:[30,31,19,20]};
// ウィンドウの範囲は各320x200の背景絵に合わせてあります。
const ROOM_WINDOWS={western:{x:53,y:27,w:66,h:77},japanese:{x:45,y:28,w:111,h:96},cute:{x:52,y:30,w:66,h:73},cyber:{x:41,y:29,w:114,h:94}};
const SPECIAL_PLACES={
  western:[{x:91,gesture:'window',action:'look',label:'窓から外を眺める'},
           {x:211,gesture:'rug',action:'happy',label:'ラグの模様を追う'}],
  japanese:[{x:98,gesture:'shoji',action:'look',label:'障子の向こうの気配を聞く'},
            {x:189,gesture:'tatami',action:'happy',label:'畳の上でゆっくり転がる'}],
  cute:[{x:105,gesture:'ribbon',action:'look',label:'壁のリボン飾りを眺める'},
        {x:225,gesture:'pattern',action:'play',label:'絨毯の柄を追いかける'}],
  cyber:[{x:86,gesture:'neon',action:'look',label:'窓のネオンを追う'},
         {x:245,gesture:'monitor',action:'play',label:'モニターの光を追いかける'}]
};
const WORLD_KEYS=['sun','cloud','rain','snow'];
const newWorldMemory=()=>({weatherSeed:Math.floor(Math.random()*2147483646)+1,
  weatherTastes:Object.fromEntries(WORLD_KEYS.map(k=>[k,Math.round(Math.random()*24-12)])),
  roomTastes:Object.fromEntries(Object.keys(ROOM_THEMES).map(k=>[k,Math.round(Math.random()*24-12)])),
  roomVisits:Object.fromEntries(Object.keys(ROOM_THEMES).map(k=>[k,0])),
  weatherVisits:Object.fromEntries(WORLD_KEYS.map(k=>[k,0])),
  lastSpecialAt:0, lastVisitedRoom:null});
function seasonForTime(at=Date.now()){
  const month=new Date(at).getMonth()+1;
  return Object.keys(SEASONS).find(k=>SEASONS[k].months.includes(month)) || 'spring';
}
function weatherPeriod(at=Date.now()){
  const d=new Date(at);
  return {key:`${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}-${Math.floor(d.getHours()/6)}`,
    end:new Date(d.getFullYear(),d.getMonth(),d.getDate(),(Math.floor(d.getHours()/6)+1)*6).getTime()};
}
function weatherForTime(at=Date.now()) {
  const period=weatherPeriod(at), season=seasonForTime(at);
  const seed=pet.worldMemory?.weatherSeed||1;
  let hash=seed|0;
  for(let i=0;i<period.key.length;i++) hash=Math.imul(hash^period.key.charCodeAt(i),16777619);
  const roll=(hash>>>0)%100;
  const weights=WEATHER_WEIGHTS[season];
  let threshold=0,weather='sun';
  for(let i=0;i<WORLD_KEYS.length;i++){
    threshold+=weights[i];
    if(roll<threshold){weather=WORLD_KEYS[i];break;}
  }
  return {weather,season,key:period.key,endsAt:period.end};
}
function worldObservation(w=weatherForTime()){
  const phrases={sun:'明るい光が窓から差し込んでいます。',cloud:'外の光がやわらいでいます。',
    rain:'窓の向こうに雨粒が流れています。',snow:'小さな雪が、ゆっくり舞っています。'};
  const seasonal={spring:'春の気配が漂っています。',summer:'夏らしい空気です。',
    autumn:'秋の静けさを感じます。',winter:'冬の冷たい空が広がっています。'};
  return phrases[w.weather]+seasonal[w.season];
}
function renderWeather(){
  const w=weatherForTime();
  const label=$('weatherLabel');
  if(label) label.textContent=`${WEATHER_ICONS[w.weather]} ${SEASONS[w.season].name}・${WEATHER_NAMES[w.weather]}（ゲーム内）`;
  const title=$('weatherNow');if(title) title.textContent=`${SEASONS[w.season].name}の${WEATHER_NAMES[w.weather]}`;
  const note=$('weatherDescription');if(note) note.textContent=worldObservation(w);
  const hint=$('weatherPetHint');
  if(hint) hint.textContent=pet.worldMemory.lastVisitedRoom===pet.roomTheme && pet.worldMemory.roomVisits[pet.roomTheme]>0 ?
    `${pet.name}はこの部屋で、自分なりの過ごし方を見つけ始めたようです。` :
    `${pet.name}はまだ、この部屋の様子を確かめているようです。`;
}
function drawWeatherInWindow(time,context=ctx){
  const w=weatherForTime(),windowArea=ROOM_WINDOWS[pet.roomTheme];
  if(!windowArea)return;
  const {x,y,w:width,h:height}=windowArea;
  context.save();context.imageSmoothingEnabled=false;
  context.beginPath();context.rect(x,y,width,height);context.clip();
  if(w.weather==='sun'){
    context.fillStyle=pet.roomTheme==='cyber'?'rgba(105,230,255,.38)':'rgba(255,246,178,.43)';
    for(let i=0;i<9;i++){
      const px=x+8+(i*23%Math.max(1,width-14)),py=y+8+(i*19%Math.max(1,height-13));
      if(Math.floor(time/630+i)%4<2)context.fillRect(px,py,2,2);
    }
  } else if(w.weather==='cloud'){
    context.fillStyle=pet.roomTheme==='cyber'?'rgba(92,126,187,.2)':'rgba(132,153,158,.12)';
    context.fillRect(x,y,width,height);
    context.fillStyle='rgba(233,239,237,.36)';
    for(let i=0;i<5;i++){
      const px=x+((Math.floor(time/2400)*2+i*27)%width),py=y+11+(i*15)%Math.max(1,height-18);
      context.fillRect(px,py,11,2);
    }
  } else {
    context.fillStyle=w.weather==='snow'?'rgba(224,236,255,.56)':'rgba(166,217,242,.59)';
    for(let i=0;i<24;i++){
      const px=x+((i*31+(i%3)*7)%width);
      const drift=Math.floor(time/(w.weather==='rain'?85:230));
      const py=y+((i*29+drift+(i%4)*8)%height);
      if(w.weather==='rain')context.fillRect(px,py,1,5);
      else context.fillRect(px,py,i%5===0?3:2,2);
    }
  }
  // 小さな季節の色粒は窓の内側に限る。室内の家具やペットを覆わない。
  if(w.season==='spring'||w.season==='autumn'){
    context.fillStyle=w.season==='spring'?'rgba(255,179,195,.6)':'rgba(220,164,85,.5)';
    for(let i=0;i<4;i++){
      const px=x+8+(i*29)%Math.max(1,width-12);
      const py=y+16+(i*21+Math.floor(time/560))%Math.max(1,height-23);
      context.fillRect(px,py,2,2);
    }
  }
  context.restore();
}
function specialActivityText(theme,spot,weather){
  const cloud={rain:'雨音を聞きながら、',snow:'舞う雪を追いながら、',sun:'窓の明るさに気づき、',cloud:'やわらかな光の中で、'}[weather.weather];
  const base={
    western:{window:'窓に映る景色をじっと眺めています。',rug:'ラグの模様の上を、ぽんぽん跳ねています。'},
    japanese:{shoji:'障子の向こうの音に耳をすましています。',tatami:'畳の上で、ごろんと体を揺らしています。'},
    cute:{ribbon:'壁の飾りを、体を傾けて眺めています。',pattern:'絨毯の模様を追いかけ、くるりと回っています。'},
    cyber:{neon:'ネオンの光を、じっと目で追っています。',monitor:'モニターの光が動くたびに、小さく跳ねています。'}
  };
  const opening=spot.gesture==='window'||spot.gesture==='shoji'||spot.gesture==='neon'?cloud:'';
  const seasonTail={spring:'春の気配に興味があるのかもしれません。',summer:'夏の明るさが気になるようです。',
    autumn:'秋の空気を楽しんでいるようです。',winter:'冬らしい静かな時間です。'}[weather.season];
  return {observed:`${pet.name}は${opening}${base[theme][spot.gesture]}`,note:seasonTail};
}
function specialWeight(theme,spot,w){
  const memory=pet.worldMemory;
  const calm=['window','shoji','neon','ribbon'].includes(spot.gesture);
  let weight=18+(calm?pet.curiosity*.27:pet.activity*.25);
  if(w.weather==='rain' && ['window','shoji','neon'].includes(spot.gesture))weight+=24;
  if(w.weather==='snow' && ['window','shoji'].includes(spot.gesture))weight+=18;
  if(w.weather==='sun' && ['rug','tatami','pattern'].includes(spot.gesture))weight+=15;
  if(w.season==='winter' && spot.gesture==='tatami')weight+=14;
  if(pet.quirk==='窓辺を気にする' && calm)weight+=17;
  weight+=memory.weatherTastes[w.weather]*.8+memory.roomTastes[theme]*.7;
  weight+=Math.min(12,memory.roomVisits[theme]*1.3);
  return Math.max(2,weight);
}
let roomSpecialVisit=null;
function beginRoomSpecial(now,forced=false){
  if(roomSpecialVisit||objectVisit||placeVisit||socialVisit||memoryInvitation||reaction)return false;
  const w=weatherForTime(now),theme=validRoomTheme(pet.roomTheme),memory=pet.worldMemory;
  if(!forced && (pet.tired>75||pet.hunger>85||now-memory.lastSpecialAt<35000))return false;
  const options=SPECIAL_PLACES[theme];
  const chosen=weightedChoice(options.map((spot,i)=>({id:i,weight:specialWeight(theme,spot,w)})));
  const spot=options[chosen],duration=Math.max(1300,Math.abs(spot.x-pet.x)/38*1000+800);
  roomSpecialVisit={theme,spot,weather:w.weather,season:w.season,stage:'approach',until:now+duration+600};
  memory.lastSpecialAt=now;
  startAction('walk',duration,'curious',spot.x);
  pet.nextDecision=now+duration+800;
  $('roomCaption').textContent=`${pet.name}は${ROOM_THEMES[theme].label}のおへやの${spot.label}ために、歩き始めました。`;
  return true;
}
function updateRoomSpecial(now){
  if(!roomSpecialVisit)return;
  const v=roomSpecialVisit;
  if(v.stage==='approach' && (Math.abs(pet.x-pet.targetX)<2.5 || now>=v.until)){
    pet.x=pet.targetX;
    v.stage='staying';v.until=now+4300;
    const action=v.spot.action==='happy'?'play':v.spot.action;
    startAction(action,4300,action==='play'?'happy':'curious',pet.x);
    pet.nextDecision=now+5000;
    const w={weather:v.weather,season:v.season},text=specialActivityText(v.theme,v.spot,w);
    $('roomCaption').textContent=text.observed;
    const mem=pet.worldMemory;
    mem.roomVisits[v.theme]=Math.min(9999,mem.roomVisits[v.theme]+1);
    mem.weatherVisits[v.weather]=Math.min(9999,mem.weatherVisits[v.weather]+1);
    mem.lastVisitedRoom=v.theme;
    // 居心地によって関心の方向が変わるが、どの個体も同じ性格に収束させない。
    const safe=v.weather==='rain'&&pet.caution>68?false:true;
    adjustEmotion({interest:1,safety:safe?1:0,wariness:safe?-1:1});
    recordMoment(`room_${v.theme}`,text.observed,
      `${ROOM_THEMES[v.theme].label}のおへやでの特別な行動を初めて観察しました。${text.note}`);
    recordMoment(`weather_${v.weather}`,text.observed,
      `${SEASONS[v.season].name}の${WEATHER_NAMES[v.weather]}の日に見られた行動です。`);
    if(mem.roomVisits[v.theme]===3)discover(`room-habit-${v.theme}`,
      `${pet.name}は${ROOM_THEMES[v.theme].label}のおへやで、気になるものを何度も見つけているようです。`);
    showThought(v.spot.action==='play'?'♪':'…？');
    renderUI();save();
  }else if(v.stage==='staying'&&now>=v.until){
    roomSpecialVisit=null;
  }
}

const initialRoomItems = () => [{id:'ball', x:100}, {id:'cushion', x:242}];
const initialObjectMemory = () => Object.fromEntries(Object.keys(ROOM_ITEM_TYPES).map(id=>[id,{familiarity:0, affinity:0, visits:0, lastUsed:0}]));
// 目に見える「生活の痕跡」。大切な関係性イベントは不在中には進めません。
const initialRoomTraces = () => ({
  yarnPaths: [], cushionWrinkles: 0, stones: [], leaves: [],
  itemMarks: {}, // 新しいおもちゃを遊んだときの小さな痕跡（片付けられる）
  lastNote: 'まだ静かな部屋です。どんな変化が残るでしょう？', lastAt: 0
});
// 居場所の記憶は座標ではなく対象IDで管理します。
// 家具が動いても、その家具との思い出や習慣は消えません。
const FREE_PLACES = {
  window: {label:'窓辺', x:79, type:'quiet'},
  corner: {label:'部屋の隅', x:268, type:'quiet'}
};
const placeKeys = [...Object.keys(ROOM_ITEM_TYPES), ...Object.keys(FREE_PLACES)];
const emptyPlaceExperience = () => ({visits:0, rests:0, idleTimes:0, comfort:0, lastVisited:0});
const newPlaceJournal = () => ({ startedAt: Date.now(), entries: [] });
const JOURNAL_MAX_ENTRIES = 72;
const JOURNAL_KINDS = ['first','return','rest','habit','later'];
const JOURNAL_LABELS = { first:'はじまり', return:'また来た', rest:'休息', habit:'いつもの場所', later:'その後' };
// v8 の思い出は新たに観察した事実だけを記録。今までの遊びを推測して捏造しない。
const MOMENT_DEFINITIONS = {
  item_first_mirror:{category:'object',label:'初めて鏡と遊んだ日'},
  item_first_bell:{category:'object',label:'初めて鈴と遊んだ日'},
  item_first_plush:{category:'object',label:'ぬいぐるみとの出会い'},
  item_first_blocks:{category:'object',label:'初めて積み木で遊んだ日'},
  item_first_blanket:{category:'object',label:'毛布を使い始めた日'},
  item_first_tunnel:{category:'object',label:'初めてトンネルをくぐった日'},
  item_first_bubbles:{category:'object',label:'初めてシャボン玉を追った日'},
  item_first_box:{category:'object',label:'小さな箱との出会い'},
  gesture_rollover:{category:'gesture',label:'はじめての寝返り'},
  gesture_doubleTake:{category:'gesture',label:'はじめての二度見'},
  gesture_nuzzle:{category:'gesture',label:'はじめてのすり寄り'},
  gesture_beg:{category:'gesture',label:'はじめての小さなおねだり'},
  gesture_spin:{category:'gesture',label:'はじめてのくるっと回る'},
  gesture_tumble:{category:'gesture',label:'はじめてのごろごろ転がる'},
  gesture_peek:{category:'gesture',label:'はじめての隠れてのぞく'},
  personality_affectionate:{category:'personality',label:'個性の発見'},
  personality_fickle:{category:'personality',label:'個性の発見'},
  personality_tidy:{category:'personality',label:'個性の発見'},
  personality_relaxed:{category:'personality',label:'個性の発見'},
  personality_mischievous:{category:'personality',label:'個性の発見'},
  personality_cautiousExplorer:{category:'personality',label:'個性の発見'},
  personality_collector:{category:'personality',label:'個性の発見'},
  personality_particular:{category:'personality',label:'個性の発見'},


  walk_town:{category:'walk',label:'初めて近所の街へ出かけた日'},
  walk_sea:{category:'walk',label:'初めて海辺へ出かけた日'},
  walk_mountain:{category:'walk',label:'初めて山へ出かけた日'},
  walk_petting:{category:'walk',label:'お散歩先でなでられた日'},
  walk_comfort:{category:'walk',label:'外で自分から近づいてきた日'},
  walk_town_flowers:{category:'walk',label:'お散歩で見つけたもの'},
  walk_town_sign:{category:'walk',label:'お散歩で見つけたもの'},
  walk_town_bench:{category:'walk',label:'お散歩で見つけたもの'},
  walk_town_button:{category:'walk',label:'お散歩で見つけたもの'},
  walk_town_souvenir:{category:'walk',label:'お散歩のおみやげ'},
  walk_town_favorite:{category:'walk',label:'お散歩のお気に入り'},
  walk_sea_shell:{category:'walk',label:'お散歩で見つけたもの'},
  walk_sea_waves:{category:'walk',label:'お散歩で見つけたもの'},
  walk_sea_wood:{category:'walk',label:'お散歩で見つけたもの'},
  walk_sea_glass:{category:'walk',label:'お散歩で見つけたもの'},
  walk_sea_souvenir:{category:'walk',label:'お散歩のおみやげ'},
  walk_sea_favorite:{category:'walk',label:'お散歩のお気に入り'},
  walk_mountain_mushroom:{category:'walk',label:'お散歩で見つけたもの'},
  walk_mountain_stream:{category:'walk',label:'お散歩で見つけたもの'},
  walk_mountain_acorn:{category:'walk',label:'お散歩で見つけたもの'},
  walk_mountain_leaf:{category:'walk',label:'お散歩で見つけたもの'},
  walk_mountain_souvenir:{category:'walk',label:'お散歩のおみやげ'},
  walk_mountain_favorite:{category:'walk',label:'お散歩のお気に入り'},

  // v20: 目撃した新しいふるまい／対象ごとの好みのみを追加。旧日時を創作しない。
  ...Object.fromEntries(Object.entries(WALK_BEHAVIORS).flatMap(([place,targets])=>
    Object.entries(targets).flatMap(([targetId,actions])=>[
      ...actions.filter(a=>a[7]).map(a=>[`walk_v20_${place}_${targetId}_${a[0]}`,{category:'walk',label:'お散歩の新しいしぐさ'}]),
      [`walk_v20_${place}_${targetId}_favorite`,{category:'walk',label:'気になる場所ができた日'}],
      [`walk_v20_${place}_${targetId}_cautious`,{category:'walk',label:'少し苦手なものがわかった日'}]
    ]))),
  yarn_play: {category:'object',label:'毛糸玉で遊んだ日'},
  yarn_self: {category:'object',label:'自分で毛糸玉を選んだ日'},
  food_first: {category:'interaction',label:'食べ物を受け取った日'},
  call_response: {category:'interaction',label:'呼び声に応えた日'},
  welcome_close: {category:'interaction',label:'そばで安心してくれた日'},
  first_petting: {category:'interaction',label:'初めてなでた日'},
  petting_request: {category:'interaction',label:'もっとなでて、と伝えてくれた日'},
  petting_answer: {category:'interaction',label:'なでてのおねだりに応えた日'},
  petting_sleep: {category:'interaction',label:'眠そうなときにそっとなでた日'},
  came_close: {category:'interaction',label:'自分から近づいてきた日'},
  came_close_again: {category:'interaction',label:'また自分から近づいてきた日'},
  first_meeting: {category:'interaction',label:'初めて出会った日'},
  play_invitation: {category:'interaction',label:'自分から遊びに誘ってくれた日'},
  invitation_answer: {category:'interaction',label:'誘いに応えて一緒に遊んだ日'},
  room_western:{category:'world',label:'洋風のおへやでの発見'},
  room_japanese:{category:'world',label:'和室での発見'},
  room_cute:{category:'world',label:'可愛いおへやでの発見'},
  room_cyber:{category:'world',label:'サイバーのおへやでの発見'},
  weather_sun:{category:'world',label:'晴れの日のふるまい'},
  weather_cloud:{category:'world',label:'くもりの日のふるまい'},
  weather_rain:{category:'world',label:'雨の日のふるまい'},
  weather_snow:{category:'world',label:'雪の日のふるまい'},
  fashion_first:{category:'fashion',label:'初めてのおめかし'},
  fashion_likes:{category:'fashion',label:'お気に入りの頭飾り'},
  fashion_self:{category:'fashion',label:'自分で選んだ頭飾り'},
  secret_collect:{category:'secret',label:'ひみつの小石ならべ'},
  secret_window:{category:'secret',label:'窓辺の小さな習慣'},
  secret_twirl:{category:'secret',label:'おやすみ前のくるくる'},
  secret_cushion:{category:'secret',label:'クッションのひみつ'},
  secret_tap:{category:'secret',label:'気になるものをこつこつ'}
};
const MOMENT_CATEGORIES = {interaction:'交流',object:'ものとの出会い',world:'季節とおへや',fashion:'おめかし',secret:'ひみつの習性',walk:'おさんぽ',gesture:'しぐさ',personality:'この子らしさ'};
const MOMENT_MAX_ENTRIES = 90;
const newMomentJournal = () => ({startedAt:Date.now(),entries:[],seen:[],approachesSinceStart:0,lastApproachRecord:0,prior:{play:false,food:false,near:false,call:false}});
// 同じ思い出が次の行動の重みになる。過去の経験を一律の「なつき度」にはしない。
const newBondMemory = () => ({
  sharedYarn: {times:0,lastAt:0},
  answeredCall: {times:0,lastAt:0},
  calmTogether: {times:0,lastAt:0},
  invitationCount:0, invitationAccepted:0, lastInvitationAt:0
});
const memoryCount = key => Math.min(30, Number(pet.bondMemory?.[key]?.times)||0);
function rememberSharedExperience(key) {
  const memory=pet.bondMemory?.[key];
  if(!memory) return;
  memory.times=Math.min(9999,memory.times+1);
  memory.lastAt=Date.now();
  renderMemoryHint();
}
function renderMemoryHint() {
  const node=$('memoryHabitText');
  if(!node) return;
  const yarn=memoryCount('sharedYarn'), call=memoryCount('answeredCall'), together=memoryCount('calmTogether');
  if(yarn) node.textContent=`一緒に毛糸玉で遊んだ経験を覚えているようです。ときどき、自分から遊びに誘ってくるかもしれません。`;
  else if(call>=2) node.textContent=`何度か名前を呼ぶと、こちらを気にすることが増えてきました。`;
  else if(together>=2) node.textContent=`そばで静かに過ごした経験が増えています。自分から近づくこともあるかもしれません。`;
  else node.textContent=`まだ一緒に過ごし始めたばかり。これからの出来事が、小さな習慣につながるかもしれません。`;
}

// v15: なでられることの記憶。生まれつきの触れあいへの気質は経験による学習と別に保存。
function newPettingMemory(){
  const base=Math.round(Math.random()*24-12);
  return {innate:base,affinity:0,familiarity:0,attempts:0,accepted:0,
    declined:0,strokes:0,begs:0,begAnswers:0,lastPetAt:0,lastBegAt:0};
}
function normalizePettingMemory(old){
  const def=newPettingMemory();
  const source=old&&typeof old==='object'?old:{};
  const counts=['attempts','accepted','declined','strokes','begs','begAnswers'];
  const value={...def,innate:clamp(Number.isFinite(source.innate)?source.innate:def.innate,-12,12),
    affinity:clamp(Number.isFinite(source.affinity)?source.affinity:0,-30,35),
    familiarity:clamp(Number.isFinite(source.familiarity)?source.familiarity:0,0,100),
    lastPetAt:Number.isFinite(source.lastPetAt)?source.lastPetAt:0,
    lastBegAt:Number.isFinite(source.lastBegAt)?source.lastBegAt:0};
  for(const key of counts)value[key]=clamp(Number.isFinite(source[key])?source[key]:0,0,100000);
  return value;
}
function pettingPreference(){
  const m=pet.pettingMemory;
  return pet.sociability*.20+pet.attachment*.18-pet.caution*.22+
    pet.emotions.safety*.34-pet.emotions.wariness*.31+m.innate+m.affinity;
}
function renderPettingHint(){
  const help=$('petTouchHelp'),habit=$('pettingHabitText'),button=$('strokePetBtn');
  const asking=pettingBeg?.stage==='offering'&&pettingBeg.until>Date.now();
  if(help){
    if(placingType)help.textContent='家具の場所をタップして決めてください。配置中はなでる操作をお休みします。';
    else if(asking)help.textContent=`${pet.name}がこちらをじっと見ています。もう一度なでてほしいのかもしれません。`;
    else if(socialVisit?.stage==='resting')help.textContent=`${pet.name}が自分からそばに来ています。タップや指でなぞって、そっとなでられます。`;
    else help.textContent='ペットを直接タップ、または指でそっとなぞってみましょう。';
  }
  if(button){button.querySelector('span:last-child').textContent=asking?'おねだりに応える':'そっとなでる';
    button.classList.toggle('petting-request-active',!!asking);}
  if(habit){
    const m=pet.pettingMemory;
    habit.textContent=m.accepted===0?'まだ、なでられたときにどう感じるかはわかりません。':
      m.begAnswers>0?`${pet.name}はなでられたあと、もう一度そばに来たことがあります。少しずつ甘え方を覚えているのかもしれません。`:
      m.declined>m.accepted?`${pet.name}は触られるより、そばで静かに過ごす方が落ち着くのかもしれません。`:
      m.strokes>=2?`${pet.name}は指でゆっくりなぞられると、体をゆるめることがあるようです。`:
      `${pet.name}はそっとなでると、時々安心したような仕草を見せます。`;
  }
}

const newPlaceMemory = () => ({
  spots: Object.fromEntries(placeKeys.map(key=>[key,emptyPlaceExperience()])),
  // 個体生成時に一度だけ決まり、経験とは別に保存される潜在的な好み。
  tastes: Object.fromEntries(placeKeys.map(key=>[key,Math.round(Math.random()*24-12)])),
  habitualSpot: null
});
function placeLabel(key) {
  return FREE_PLACES[key]?.label || (ROOM_ITEM_TYPES[key] ? ROOM_ITEM_TYPES[key].label+'のそば' : 'その場所');
}
function placeCoordinate(key) {
  if (FREE_PLACES[key]) return FREE_PLACES[key].x;
  const item = pet.roomItems.find(item=>item.id===key);
  if (!item) return null;
  if (key === 'cushion') return clamp(item.x,45,275);
  const side=pet.x>item.x?1:-1;
  return clamp(item.x + side * ROOM_ITEM_TYPES[key].approach,45,275);
}
function placeAvailable(key) { return FREE_PLACES[key] || pet.roomItems.some(item=>item.id===key); }


// v12: 頭飾り。実際のPNGは透明な32×28px、既存ペットの描画と一緒に移動します。
const HEADWEAR = Object.freeze([
  {id:'leaf',name:'ちいさな葉っぱ',price:0,description:'はじめから使える'},
  {id:'ribbon',name:'赤いリボン',price:25,description:'ふんわり結んだ飾り'},
  {id:'mikan',name:'頭の上のみかん',price:40,description:'ちょこんと一個'},
  {id:'star_pin',name:'星のヘアピン',price:55,description:'きらりと光る星'},
  {id:'beret',name:'ベレー帽',price:65,description:'お散歩に似合う帽子'},
  {id:'nightcap',name:'ナイトキャップ',price:80,description:'おやすみの帽子'},
  {id:'flower_crown',name:'お花のかんむり',price:95,description:'小さな花を編んで'},
  {id:'mushroom',name:'きのこの帽子',price:115,description:'赤い水玉のきのこ'},
  {id:'witch_hat',name:'魔女の帽子',price:135,description:'とんがり帽子'},
  {id:'crown',name:'金色の王冠',price:160,description:'ちょっと偉そうな王冠'}
]);
const HEADWEAR_BY_ID = Object.fromEntries(HEADWEAR.map(h=>[h.id,h]));
const POINT_DAILY_LIMIT=100, POINT_REWARD_COOLDOWN=45000;
function localDayKey(at=Date.now()) {
  const date=new Date(at);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function newWardrobe(){return {points:0,totalEarned:0,unlocked:['leaf'],equipped:null,dailyDate:localDayKey(),earnedToday:0,lastRewards:{}};}
function normalizeWardrobe(old){
  const source=old&&typeof old==='object'?old:{};
  const unlocked=[...new Set(['leaf',...(Array.isArray(source.unlocked)?source.unlocked:[])])].filter(id=>HEADWEAR_BY_ID[id]);
  const today=localDayKey();
  const lastRewards={};
  if(source.lastRewards&&typeof source.lastRewards==='object') for(const key of ['observe','call','food','play','approach','invitation','petting']) {
    if(Number.isFinite(source.lastRewards[key])&&source.lastRewards[key]>0) lastRewards[key]=source.lastRewards[key];
  }
  return {
    points:Math.max(0,Math.floor(Number(source.points)||0)),
    totalEarned:Math.max(0,Math.floor(Number(source.totalEarned)||0)),
    unlocked,
    equipped:unlocked.includes(source.equipped)?source.equipped:null,
    dailyDate:today,
    earnedToday:source.dailyDate===today?clamp(Math.floor(Number(source.earnedToday)||0),0,POINT_DAILY_LIMIT):0,
    lastRewards
  };
}

// v13: 頭飾りの好み。生まれつきの傾向と、身につけた経験は別々に保存。
const HEADWEAR_TAGS={leaf:['葉っぱ'],ribbon:['柔らかいもの'],mikan:['丸いもの'],
  star_pin:['光るもの'],beret:['柔らかいもの'],nightcap:['柔らかいもの'],
  flower_crown:['葉っぱ'],mushroom:['丸いもの'],witch_hat:['光るもの'],crown:['光るもの']};
function newFashionMemory(){
  return {tastes:Object.fromEntries(HEADWEAR.map(item=>[item.id,Math.floor(Math.random()*25)-12])),
    items:Object.fromEntries(HEADWEAR.map(item=>[item.id,{familiarity:0,affinity:0,wears:0,lastTryAt:0}])),
    autoChoose:true,lastManualAt:0,lastAutoAt:0};
}
function normalizeFashionMemory(old){
  const defaults=newFashionMemory(),source=old&&typeof old==='object'?old:{};
  return {tastes:Object.fromEntries(HEADWEAR.map(item=>[item.id,
      clamp(Number.isFinite(source.tastes?.[item.id])?source.tastes[item.id]:defaults.tastes[item.id],-12,12)])),
    items:Object.fromEntries(HEADWEAR.map(item=>{
      const value=source.items?.[item.id]||{};
      return [item.id,{familiarity:clamp(Number(value.familiarity)||0),
        affinity:clamp(Number(value.affinity)||0,-30,30),
        wears:clamp(Math.floor(Number(value.wears)||0),0,9999),
        lastTryAt:Number.isFinite(value.lastTryAt)?value.lastTryAt:0}];
    })),
    autoChoose:source.autoChoose!==false,
    lastManualAt:Number.isFinite(source.lastManualAt)?source.lastManualAt:0,
    lastAutoAt:Number.isFinite(source.lastAutoAt)?source.lastAutoAt:0};
}
function headwearPreference(id){
  const mem=pet.fashionMemory.items[id];
  const natural=(HEADWEAR_TAGS[id]||[]).includes(pet.favorite)?9:0;
  const wary=pet.emotions.wariness>70?-6:0;
  return pet.fashionMemory.tastes[id]+mem.affinity+natural+wary;
}
function fashionComment(id){
  const m=pet.fashionMemory.items[id];
  if(m.wears<2) return 'まだ、どんな反応をするかはわかりません。';
  const value=headwearPreference(id);
  if(value>=14) return 'この飾りをつけると、嬉しそうに弾むことが増えました。';
  if(value<=-10) return '身につけると気にしていることが多いようです。';
  return '少しずつ、この飾りに慣れてきたようです。';
}
function renderFashionHint(){
  const node=$('fashionHabitText');
  if(!node) return;
  const worn=pet.wardrobe.equipped;
  if(worn){
    const item=HEADWEAR_BY_ID[worn];
    node.textContent=`いまは「${item.name}」を身につけています。${fashionComment(worn)}`;
  } else {
    const favorites=HEADWEAR.filter(h=>pet.wardrobe.unlocked.includes(h.id) &&
      pet.fashionMemory.items[h.id].wears>=2 && headwearPreference(h.id)>=14);
    node.textContent=favorites.length?`最近は「${favorites[0].name}」を気に入っているようです。`:
      'まだ飾りの好みはわかりません。身につけたあとの仕草を観察してみましょう。';
  }
  $('autoHeadwearToggle').checked=pet.fashionMemory.autoChoose;
}
// ウェアを着けている実際のプレイ時間だけ学習。放置・再読み込みでは経験を捏造しない。
let wearSession={id:null,since:0,lastLearn:0};
function beginWearSession(now=Date.now()){
  wearSession={id:pet.wardrobe.equipped,since:now,lastLearn:now};
}
function reactToHeadwear(id,source='player'){
  const item=HEADWEAR_BY_ID[id],score=headwearPreference(id);
  const asleep=pet.action==='sleep';
  let kind,action,gesture,caption,thought;
  if(asleep){
    kind='sway';action='sleep';gesture='眠ったまま、少し身じろぎしている';
    caption=`${pet.name}は${item.name}をつけたまま、すやすや眠っています。`;thought='すぅ…';
  }else if(score>=11){
    kind='hop';action='play';gesture='飾りをつけて、ぽんぽん嬉しそうに跳ねている';
    caption=`${pet.name}は${item.name}をつけて、嬉しそうに跳ねました。`;thought='♪';
  }else if(score<=-8){
    kind='shrink';action='look';gesture='飾りが気になるようで、少し体を縮めている';
    caption=`${pet.name}は${item.name}を気にして、何度も頭を傾けています。`;thought='…？';
  }else{
    kind='tilt';action='look';gesture='何か変わったことに気づき、体を傾けている';
    caption=`${pet.name}は${item.name}をつけて、じっと様子を確かめています。`;thought='？';
  }
  // アイテムをプレイヤーが着せた場合も、眠りを無理に起こさない。
  performReaction({action,kind,duration:3000,mood:score>=11?'happy':'curious',gesture,caption,thought});
  if(source==='player')recordMoment('fashion_first',`${pet.name}に${item.name}をつけてみました。${caption}`,
    '着けたときの反応を記録しました。好みはこの一回だけでは決まりません。');
}
function maybeLearnFromWearing(now){
  const id=pet.wardrobe.equipped;
  if(!id){if(wearSession.id!==null)beginWearSession(now);return;}
  if(wearSession.id!==id){beginWearSession(now);return;}
  // 初回は25秒、次回以降は45秒ごと。非表示タブの時間を含めない。
  if(now-wearSession.since<25000 || now-wearSession.lastLearn<25000)return;
  const mem=pet.fashionMemory.items[id];
  const value=headwearPreference(id);
  const glad=pet.action!=='sleep' && value>=4 && pet.emotions.wariness<72;
  mem.wears=Math.min(9999,mem.wears+1);
  mem.familiarity=clamp(mem.familiarity+6);
  mem.affinity=clamp(mem.affinity+(glad?2:value<=-9?-2:0.75),-30,30);
  wearSession.lastLearn=now;
  wearSession.since=now-25000+45000; // 次は約45秒後
  if(mem.wears>=2 && headwearPreference(id)>=14){
    discover(`fashion-like-${id}`,`${pet.name}は${HEADWEAR_BY_ID[id].name}を身につけると、嬉しそうにすることが多いようです。`);
    recordMoment('fashion_likes',`${pet.name}は${HEADWEAR_BY_ID[id].name}をつけたまま、楽しそうに過ごしています。`,
      '何度か身につけた経験を通じて、この飾りへの好みが見えてきました。');
  }
  renderFashionHint();
  if(mem.wears===2||mem.wears%3===0)renderWardrobe();
  save();
}
function maybeChooseOwnHeadwear(now){
  const memory=pet.fashionMemory;
  if(!memory.autoChoose || pet.tired>68 || pet.emotions.wariness>72 ||
      now-memory.lastManualAt<180000 || now-memory.lastAutoAt<240000)return false;
  const candidates=pet.wardrobe.unlocked.filter(id=>id!==pet.wardrobe.equipped &&
    memory.items[id].wears>=2 && headwearPreference(id)>=14);
  if(!candidates.length || Math.random()>0.23)return false;
  const chosen=weightedChoice(candidates.map(id=>({id,weight:Math.max(1,headwearPreference(id))})));
  memory.lastAutoAt=now;
  pet.wardrobe.equipped=chosen;
  beginWearSession(now);
  reactToHeadwear(chosen,'pet');
  const observed=`${pet.name}は自分から${HEADWEAR_BY_ID[chosen].name}を選び、嬉しそうに身につけました。`;
  $('roomCaption').textContent=observed;
  recordMoment('fashion_self',observed,'これまで何度か身につけた飾りです。自分で選んだのは、初めて記録した出来事です。');
  setWardrobeMessage(`${pet.name}が自分から${HEADWEAR_BY_ID[chosen].name}を選びました。`);
  renderUI();save();return true;
}

// v13: 個体に生まれつきある癖が、生活中にたまに表に出る。
// 古いセーブの quirk を上書きせず、その子の元々の癖を活かす。
const SECRET_HABITS={
  '小さなものを集める':{id:'collect',title:'小石を一列に並べる',needed:['pebble']},
  '窓辺を気にする':{id:'window',title:'窓辺でじっと何かを待つ',needed:[]},
  '寝る前にくるくる回る':{id:'twirl',title:'眠る前にくるくる回る',needed:[]},
  'クッションの端を調べる':{id:'cushion',title:'クッションの下に何かを隠す',needed:['cushion']},
  '気になるものをつつく':{id:'tap',title:'気になるものをこつこつつつく',needed:[]}
};
function newSecretMemory(){return {observations:{},lastAt:0,hiddenBall:false,lastDescription:''};}
function normalizeSecretMemory(value){
  const old=value&&typeof value==='object'?value:{};
  const valid=Object.values(SECRET_HABITS).map(v=>v.id);
  return {observations:Object.fromEntries(valid.map(k=>[k,clamp(Math.floor(Number(old.observations?.[k])||0),0,9999)])),
    lastAt:Number.isFinite(old.lastAt)?old.lastAt:0,
    hiddenBall:!!old.hiddenBall,lastDescription:typeof old.lastDescription==='string'?old.lastDescription.slice(0,180):''};
}
let secretVisit=null; // 実行中の演出だけ。再起動で続きが捏造されないよう保存しない。
function renderSecretHint(){
  const node=$('secretHabitText');if(!node)return;
  const secret=SECRET_HABITS[pet.quirk],mem=pet.secretMemory;
  if(!secret){node.textContent='いつか、この子だけの不思議な癖が見つかるかもしれません。';return;}
  const count=mem.observations[secret.id]||0;
  node.textContent=count>=2?`${pet.name}には「${secret.title}」癖があるようです。${mem.lastDescription}`:
    count===1?`${pet.name}が、ちょっと変わったことをしていました。もう一度見られるでしょうか？`:
    'まだわからないことがたくさんあります。何も操作せずに見守っていると、ふしぎな癖が見つかるかもしれません。';
}
function secretSpot(id){
  if(id==='window')return FREE_PLACES.window.x;
  if(id==='collect')return findRoomItem('pebble')?.x ?? pet.x;
  if(id==='cushion')return findRoomItem('cushion')?.x ?? pet.x;
  if(id==='tap')return (findRoomItem('plant')||findRoomItem('ball')||findRoomItem('pebble'))?.x ?? pet.x;
  return pet.x;
}
function canDoSecret(id){
  if(id==='collect')return !!findRoomItem('pebble');
  if(id==='cushion')return !!findRoomItem('cushion');
  if(id==='twirl')return pet.tired>=52;
  if(id==='tap')return !!(findRoomItem('plant')||findRoomItem('ball')||findRoomItem('pebble'));
  return true;
}
function maybeBeginSecretHabit(now,forced=false){
  const habit=SECRET_HABITS[pet.quirk];if(!habit)return false;
  if(secretVisit||reaction||objectVisit||placeVisit||roomSpecialVisit||socialVisit||memoryInvitation)return false;
  if(!canDoSecret(habit.id) || pet.hunger>86 || (pet.tired>83 && habit.id!=='twirl'))return false;
  if(!forced && (now-pet.secretMemory.lastAt<65000 || Math.random()>(habit.id==='twirl'?0.46:0.19)))return false;
  pet.secretMemory.lastAt=now;
  const target=clamp(secretSpot(habit.id),45,275);
  const duration=habit.id==='twirl'?0:Math.max(1200,Math.abs(target-pet.x)/38*1000+500);
  secretVisit={id:habit.id,stage:'approach',until:now+duration+350,untilNext:0};
  if(duration){startAction('walk',duration,'curious',target);pet.nextDecision=now+duration+650;}
  else{startAction('idle',100,'calm',pet.x);pet.nextDecision=now+100;}
  $('roomCaption').textContent=habit.id==='twirl'?`${pet.name}は眠る前に、少しそわそわしています。`:
    `${pet.name}は何か思いついたように、ゆっくり動き出しました。`;
  return true;
}
function revealHiddenYarn(){
  if(!pet.secretMemory.hiddenBall)return;
  pet.secretMemory.hiddenBall=false;
  const ball=findRoomItem('ball'),cushion=findRoomItem('cushion');
  if(ball && cushion && Math.abs(ball.x-cushion.x)<34){
    ball.x=clamp(cushion.x+(cushion.x>160?-54:54),36,284);
  }
}
function finishSecretObservation(now,id,description){
  const type=id==='collect'?'tidy':id==='cushion'||id==='tap'?'mischievous':id==='window'?'particular':id==='twirl'?'particular':null;
  if(type && tendencyScores()[type]>=47)observePersonality(type,description,now);
  const memory=pet.secretMemory;
  memory.observations[id]=Math.min(9999,(memory.observations[id]||0)+1);
  memory.lastDescription=description;
  $('roomCaption').textContent=description;
  if(memory.observations[id]===1){
    recordMoment(`secret_${id}`,description,'初めて観察した不思議な行動。これだけで性格を決めつけることはできません。',
      {title:'ちょっと不思議な出来事'});
  }
  if(memory.observations[id]===2){
    discover(`secret-habit-${id}`,`${pet.name}には「${Object.values(SECRET_HABITS).find(h=>h.id===id).title}」習性があるのかもしれません。`);
  }
  renderSecretHint();save();
}
function updateSecretHabit(now){
  if(!secretVisit)return;
  const visit=secretVisit;
  if(visit.stage==='approach' && (Math.abs(pet.x-pet.targetX)<2.5 || now>=visit.until)){
    const id=visit.id;
    visit.stage='doing';
    visit.until=now+(id==='twirl'?3600:4600);
    let action='look',kind='tilt',mood='curious',thought='…？',text='';
    if(id==='collect'){
      action='collect';kind='sway';thought='♪';
      addRoomTrace('pebble',{behavior:'collect'});
      // 集めた小石の位置をそろえ、並べた癖を絵にも残す。
      const stones=pet.roomTraces.stones,base=clamp((findRoomItem('pebble')?.x||160)-14,45,252);
      stones.forEach((s,i)=>{s.x=base+i*10;s.y=177;});
      noteRoomTrace('小石が一列に並べられています。誰かが並べたようです。');
      text=`${pet.name}は小石をひとつずつつついて、一列に並べました。`;
    }else if(id==='window'){
      action='look';kind='tilt';text=`${pet.name}は窓辺で立ち止まり、何もないところをじっと見つめています。`;
    }else if(id==='twirl'){
      action='happy';kind='spin';mood='happy';thought='くる…';
      text=`${pet.name}は眠る前に、くるくると小さく回りました。`;
    }else if(id==='cushion'){
      action='collect';kind='sway';thought='…♪';
      const cushion=findRoomItem('cushion'),ball=findRoomItem('ball');
      if(ball && cushion){
        ball.x=clamp(cushion.x-(cushion.x>160?9:-9),36,284);
        pet.secretMemory.hiddenBall=true;
        text=`${pet.name}は毛糸玉をクッションの陰にそっと隠しました。`;
        noteRoomTrace('クッションの陰に、毛糸玉がこっそり隠されています。');
      }else{
        pet.roomTraces.cushionWrinkles=clamp(pet.roomTraces.cushionWrinkles+1,0,3);
        text=`${pet.name}はクッションの端を何度も折り返し、形を整えています。`;
        noteRoomTrace('クッションの端が少しめくれています。');
      }
    }else if(id==='tap'){
      action='sniff';kind='tilt';thought='こつ…';
      const target=findRoomItem('plant')||findRoomItem('ball')||findRoomItem('pebble');
      if(target?.id==='plant')addRoomTrace('plant',{behavior:'sniff'});
      text=`${pet.name}は${ROOM_ITEM_TYPES[target.id].label}を、こつ、こつ、と何度もつついています。`;
    }
    startAction(action,visit.until-now,mood,pet.x);
    pet.nextDecision=visit.until+1100;
    reaction={kind,gesture:text,start:now,until:visit.until,duration:visit.until-now};
    showThought(thought);
    finishSecretObservation(now,id,text);
    renderUI();
  }else if(visit.stage==='doing' && now>=visit.until){
    secretVisit=null;
    if(visit.id==='twirl'){
      if(!beginRestAtFavorite(now))startAction('sleep',14000,'calm');
    }
  }
}


// ===================== v17: 仕草と連続行動 =====================
// 気質は既存の5項目を使用。新しい内部数値がプレイヤーに公開されることはありません。
// 仕草は直接コマンドできず、行動の合間に自然に選択されます。
const LITTLE_GESTURES=Object.freeze({
  yawn:       {label:'あくび',group:'rest',sprite:'sleep',extra:'yawn',fx:'yawn',duration:2800,thought:'ふぁ…',caption:'小さなあくびをして、体をふわっと伸ばしました。'},
  stretch:    {label:'伸び',group:'rest',sprite:'idle',fx:'stretch',duration:2300,thought:'ん〜',caption:'体をぐーっと横に伸ばしてから、元に戻りました。'},
  rollover:   {label:'寝返り',group:'rest',sprite:'sleep',extra:'rollover',fx:'rollover',duration:2600,thought:'すぅ…',caption:'ころんと寝返りを打ち、また落ち着きました。',rare:true},
  doze:       {label:'うとうと',group:'rest',sprite:'sleep',extra:'doze',fx:'doze',duration:3300,thought:'…',caption:'眠りかけては、はっと目を開けています。'},
  doubleTake: {label:'二度見',group:'curiosity',sprite:'look',extra:'doubleTake',fx:'doubleTake',duration:2600,thought:'！？',caption:'気になるものを見つけ、一度通り過ぎかけてから二度見しました。',rare:true},
  tilt:       {label:'首をかしげる',group:'curiosity',sprite:'look',fx:'tilt',duration:2400,thought:'…？',caption:'不思議そうに体をかしげています。'},
  hesitate:   {label:'近づいては戻る',group:'curiosity',sprite:'walk',fx:'hesitate',duration:3000,thought:'…？',caption:'興味をひかれて少し進み、また慎重に戻りました。'},
  stare:      {label:'じっと見つめる',group:'curiosity',sprite:'look',fx:'stare',duration:3100,thought:'…',caption:'目をそらさず、じっと何かを見つめています。'},
  glance:     {label:'ちらっと見る',group:'affection',sprite:'look',fx:'glance',duration:1800,thought:'…',caption:'こちらをちらっと見て、目が合うと少し止まりました。'},
  nuzzle:     {label:'すり寄る',group:'affection',sprite:'happy',fx:'nuzzle',duration:3100,thought:'…♪',caption:'自分から近くに来て、ふわふわの体をそっと寄せています。',rare:true},
  beg:        {label:'小さくおねだり',group:'affection',sprite:'happy',fx:'beg',duration:2600,thought:'♡',caption:'体を小さく弾ませて、こちらを見上げています。',rare:true},
  sitBeside:  {label:'隣でくつろぐ',group:'affection',sprite:'idle',fx:'sitBeside',duration:3600,thought:'…♪',caption:'何も求めず、こちらのそばでのんびりしています。'},
  spin:       {label:'くるっと回る',group:'joy',sprite:'happy',fx:'spin',duration:2300,thought:'♪',caption:'楽しそうにその場でくるっと回りました。',rare:true},
  bounce:     {label:'ぽよぽよ跳ねる',group:'joy',sprite:'happy',fx:'bounce',duration:2800,thought:'♪',caption:'ぽよん、ぽよんと小さく弾んでいます。'},
  puff:       {label:'体を膨らませる',group:'joy',sprite:'idle',extra:'puff',fx:'puff',duration:2500,thought:'…♪',caption:'ふうっと体を膨らませ、満足げに元へ戻りました。'},
  tumble:     {label:'ごろごろ転がる',group:'joy',sprite:'play',extra:'rollover',fx:'tumble',duration:3100,thought:'♪',caption:'勢いよく、ごろんごろんと転がっています。',rare:true},
  startle:    {label:'びくっとする',group:'wary',sprite:'wary',fx:'startle',duration:1900,thought:'！',caption:'何かに気づいたのか、びくっと体が跳ねました。'},
  stepBack:   {label:'後ずさる',group:'wary',sprite:'wary',fx:'stepBack',duration:2400,thought:'…',caption:'少し警戒して、ゆっくり一歩後ろへ下がりました。'},
  freeze:     {label:'その場で固まる',group:'wary',sprite:'wary',fx:'freeze',duration:2800,thought:'……',caption:'ぴたりと動きを止めて、様子をうかがっています。'},
  peek:       {label:'隠れてのぞく',group:'wary',sprite:'look',extra:'peek',fx:'peek',duration:3400,thought:'…？',caption:'体を低くして、そっと顔をのぞかせています。',rare:true}
});
const GESTURE_GROUPS=Object.freeze({rest:['yawn','stretch','rollover','doze'],curiosity:['doubleTake','tilt','hesitate','stare'],affection:['glance','nuzzle','beg','sitBeside'],joy:['spin','bounce','puff','tumble'],wary:['startle','stepBack','freeze','peek']});
// スプライト画像は横4コマ×縦5種類。読み込めない場合は既存画像に戻ります。
const GESTURE_SPRITE_ROWS={yawn:0,doze:1,rollover:2,doubleTake:3,peek:4};
const gestureSpriteSheets={};
const newGestureMemory=()=>({counts:{},lastAt:{},total:0,latest:null});
function normalizeGestureMemory(old){
  const source=old&&typeof old==='object'?old:{},counts={},lastAt={};
  for(const id of Object.keys(LITTLE_GESTURES)){
    counts[id]=clamp(Number(source.counts?.[id])||0,0,9999);
    lastAt[id]=Number.isFinite(source.lastAt?.[id])?source.lastAt[id]:0;
  }
  return {counts,lastAt,total:clamp(Number(source.total)||0,0,999999),latest:
    source.latest&&LITTLE_GESTURES[source.latest.id]&&Number.isFinite(source.latest.at)?{id:source.latest.id,at:source.latest.at}:null};
}
let gestureState=null;  // 演出中だけ。ゲームを閉じた間に勝手に記録しません。
let gestureSequence=null;
const GESTURE_SEQUENCES=Object.freeze({
 affection:['glance','approach','nuzzle','sitBeside'],
 curiosity:['doubleTake','tilt','stare'],
 rest:['yawn','stretch','doze'],
 wary:['startle','stepBack','freeze','peek'],
 joy:['bounce','spin','puff']
});
function cancelLittleGestures(){gestureState=null;gestureSequence=null;if(walkSession)walkSession.gesture=null;}
function gestureScores(now,place='home'){
  const e=pet.emotions||{safety:50,wariness:50,interest:50,connection:50};
  const sleepy=pet.tired;
  const tendency=tendencyScores();
  const disposition=momentaryDisposition(now);
  return {
    rest:Math.max(2,(sleepy-23)*0.78+(100-pet.activity)*0.12+(pet.action==='sleep'?10:0)+tendency.relaxed*.15),
    curiosity:Math.max(3,pet.curiosity*.31+e.interest*.25-e.wariness*.1+(place==='walk'?12:0)+tendency.cautiousExplorer*.11+disposition*8),
    affection:Math.max(2,pet.sociability*.26+e.connection*.26+e.safety*.12-e.wariness*.20+Math.min(13,memoryCount('calmTogether')*2)+tendency.affectionate*.18),
    joy:Math.max(2,pet.activity*.32+e.interest*.14+e.safety*.14+Math.min(8,memoryCount('sharedYarn')*2)+tendency.mischievous*.12+disposition*8),
    wary:Math.max(2,pet.caution*.22+e.wariness*.35-e.safety*.15+(place==='walk'&&pet.walkMemory?.locations?.[walkSession?.location]?.visits<3?9:0)+tendency.cautiousExplorer*.09)
  };
}
function selectLittleGesture(now,place='home'){
  const groups=gestureScores(now,place);
  const options=[];
  for(const [group,ids] of Object.entries(GESTURE_GROUPS)){
    for(const id of ids){
      const g=LITTLE_GESTURES[id];
      let weight=(g.rare?5:11)*Math.max(0,groups[group]);
      const previous=pet.gestureMemory.lastAt[id];
      if(previous>0&&now-previous<90000)weight*=0.12;
      if(previous>0&&now-previous<22000)weight=0;
      if(id==='nuzzle'||id==='beg')weight*=clamp((pet.sociability+pet.emotions.connection)/130,.3,1.5);
      if(id==='peek'||id==='hesitate')weight*=clamp(pet.caution/55,.3,1.8);
      if(id==='rollover'||id==='doze')weight*=clamp((pet.tired-20)/50,.15,1.5);
      if(id==='tumble'||id==='spin')weight*=clamp(pet.activity/65,.2,1.5)*personalityFactor('mischievous',.7,1.65);
      if(id==='glance'||id==='nuzzle'||id==='sitBeside')weight*=personalityFactor('affectionate',.75,1.6);
      if(id==='stare')weight*=personalityFactor('particular',.7,1.6);
      if(id==='doze'||id==='rollover')weight*=personalityFactor('relaxed',.7,1.6);
      if(id==='hesitate'||id==='doubleTake')weight*=personalityFactor('cautiousExplorer',.6,1.7);
      options.push({id,weight});
    }
  }
  return options.some(option=>option.weight>0)?weightedChoice(options):null;
}
function noteLittleGesture(id,now=Date.now(),place='home'){
  const g=LITTLE_GESTURES[id];if(!g)return;
  const memory=pet.gestureMemory;
  memory.counts[id]=(memory.counts[id]||0)+1;
  memory.lastAt[id]=now;memory.total++;memory.latest={id,at:now};
  noteGesturePersonality(id,now,place);
  if(g.rare){
    const location=place==='walk'&&walkSession?`お散歩先の${WALK_DESTINATIONS[walkSession.location].label}で`:'お部屋で';
    recordMoment(`gesture_${id}`,`${pet.name}は${location}${g.caption}`,
      `実際に見られた「${g.label}」の仕草です。どんな気持ちだったのか、また観察してみましょう。`,{title:`はじめての「${g.label}」`});
  }
}
function beginLittleGesture(id,now=Date.now(),place='home',options={}){
  const g=LITTLE_GESTURES[id];if(!g)return false;
  if(place==='walk'){
    const w=walkSession;
    if(!w||w.stage==='approach'||w.stage==='explore'||w.petReaction)return false;
    w.gesture={id,start:now,until:now+g.duration,duration:g.duration};
    w.action=g.sprite;w.stage='gesture';w.targetX=w.x;
    w.nextDecision=now+g.duration+1000;
    walkNarrate(`${pet.name}は${g.caption}`);
  }else{
    if(walkSession||onboardingActive||placingType||reaction||objectVisit||placeVisit||secretVisit||roomSpecialVisit||socialVisit||memoryInvitation||pettingBeg)return false;
    gestureState={id,start:now,until:now+g.duration,duration:g.duration};
    startAction(g.sprite,g.duration,g.group==='joy'?'happy':g.group==='wary'?'wary':'calm');
    pet.nextDecision=now+g.duration+850;
    $('roomCaption').textContent=`${pet.name}は${g.caption}`;
    showThought(g.thought);
  }
  noteLittleGesture(id,now,place);
  return true;
}
function beginLittleSequence(now,place='home',requestedGroup=null){
  if(place!=='home'||gestureSequence||gestureState||walkSession)return false;
  const weights=gestureScores(now);
  const group=requestedGroup||weightedChoice(Object.entries(weights).map(([id,weight])=>({id,weight})));
  const stages=GESTURE_SEQUENCES[group];
  if(!stages)return false;
  gestureSequence={group,index:0,stages};
  if(!runNextLittleSequenceStage(now)){gestureSequence=null;return false;}
  return true;
}
function runNextLittleSequenceStage(now){
  const seq=gestureSequence;if(!seq)return false;
  if(seq.index>=seq.stages.length){gestureSequence=null;return false;}
  const id=seq.stages[seq.index++];
  if(id==='approach'){
    const destination=pet.x<160?150:170;
    const duration=Math.max(900,Math.abs(destination-pet.x)/38*1000+450);
    gestureState={id:'approach',start:now,until:now+duration+150,duration:duration+150};
    startAction('walk',duration,'calm',destination);
    pet.nextDecision=now+duration+400;
    $('roomCaption').textContent=`${pet.name}はそっとこちらに近づいてきました。`;
    return true;
  }
  return beginLittleGesture(id,now,'home',{sequence:true});
}
function updateLittleGestures(now){
 if(!gestureState||now<gestureState.until)return;
 const seq=gestureSequence;
 if(seq){
   if(gestureState.id==='approach'){pet.x=pet.targetX;}
   gestureState=null;
   if(runNextLittleSequenceStage(now))return;
 }else gestureState=null;
 if(pet.action!=='sleep'){pet.action='idle';pet.actionUntil=now;pet.targetX=pet.x;}
 pet.nextDecision=Math.max(pet.nextDecision,now+1600);
}
function maybeChooseLittleGesture(now){
 if(gestureState||gestureSequence||walkSession||onboardingActive||reaction||objectVisit||placeVisit||roomSpecialVisit||secretVisit||socialVisit||memoryInvitation||pettingBeg)return false;
 if(Math.random()>=0.31)return false;
 if(Math.random()<0.32)return beginLittleSequence(now);
 return beginLittleGesture(selectLittleGesture(now),now);
}
// 同じ演出をおへや・散歩先で利用。帽子とペットに同じ変形をかけます。
function littleGesturePose(id,elapsed,duration,face=1){
 const p=clamp(elapsed/Math.max(1,duration),0,1),envelope=Math.sin(Math.PI*p),wave=Math.sin(elapsed/180);
 let angle=0,sx=1,sy=1,lift=0,dx=0;
 switch(id){
  case 'yawn':sx=1+.09*envelope;sy=1-.06*envelope;break;
  case 'stretch':sx=1+.23*envelope;sy=1-.19*envelope;break;
  case 'rollover':angle=Math.sin(p*Math.PI*2)*.18;sy=.82;break;
  case 'doze':sy=.96+.04*Math.sin(elapsed/480);angle=.02*wave;break;
  case 'doubleTake':angle=(p<.45?-.12:.16)*envelope;dx=(p<.45?-4:3)*envelope;break;
  case 'tilt':angle=.13*envelope;break;
  case 'hesitate':dx=Math.sin(p*Math.PI*2)*10;angle=.04*wave;break;
  case 'stare':sx=.99;break;
  case 'glance':angle=-.07*envelope;dx=-2*envelope;break;
  case 'nuzzle':sx=1+.19*envelope;sy=1-.11*envelope;dx=face*4*envelope;break;
  case 'beg':lift=Math.abs(Math.sin(elapsed/230))*5*envelope;angle=.05*wave*envelope;break;
  case 'sitBeside':sy=.90; sx=1.06;break;
  case 'spin':angle=Math.PI*2*p;break;
  case 'bounce':lift=Math.abs(Math.sin(elapsed/230))*9*envelope;sy=1-.07*envelope;break;
  case 'puff':sx=1+.20*envelope;sy=1+.09*envelope;break;
  case 'tumble':angle=Math.PI*2*p;lift=Math.abs(Math.sin(p*Math.PI*2))*3;break;
  case 'startle':lift=9*envelope; sx=.9;sy=1.07;break;
  case 'stepBack':dx=-face*12*envelope;sy=.90;break;
  case 'freeze':sx=.95;sy=1.02;break;
  case 'peek':sy=1-.20*envelope;dx=-face*3*envelope;break;
 }
 return {angle,sx,sy,lift,dx};
}
function gestureSprite(id,color,defaultSheet,defaultRow){
 const row=GESTURE_SPRITE_ROWS[id],sheet=gestureSpriteSheets[color];
 if(row!==undefined&&sheet?.complete&&sheet?.naturalWidth)return {sheet,row};
 return {sheet:defaultSheet,row:defaultRow};
}
// ── v18: 生まれつきの気質 + 観察によってわかる個性 ──
// 旧5項目（curiosity/sociability/caution/activity/attachment）は変更しません。
// 追加する補助気質はひとつの個体に一度だけ決め、セーブします。
const PERSONALITY_TENDENCIES=Object.freeze({
 affectionate:{label:'甘えん坊',hint:'何かを求めるより、そばで一緒に過ごすのが好きなのかもしれません。'},
 fickle:{label:'気まぐれ',hint:'気分で寄り道や遊び方が変わることがあるようです。'},
 tidy:{label:'几帳面',hint:'小さなものの並びや、いつもの位置が気になるみたいです。'},
 relaxed:{label:'のんびり屋',hint:'お気に入りの場所で、時間をかけてくつろいでいます。'},
 mischievous:{label:'いたずら好き',hint:'身近なものを動かして、ちょっとした遊びを見つけるようです。'},
 cautiousExplorer:{label:'慎重な探検家',hint:'気になるものへ近づく前に、何度も様子を確かめます。'},
 collector:{label:'収集家',hint:'小さなものを見つけると、つい集めたり運んだりしています。'},
 particular:{label:'こだわり屋',hint:'気に入ったものや場所を、繰り返し選んでいます。'}
});
const PERSONALITY_KEYS=Object.keys(PERSONALITY_TENDENCIES);
const newTemperament=()=>({variability:Math.round(24+Math.random()*60),neatness:Math.round(24+Math.random()*60),mischief:Math.round(24+Math.random()*60),patience:Math.round(24+Math.random()*60)});
// 既存の個体の補助気質は、以前からあるデータだけで安定生成。
// 何度も起動しても、気質が変わらないためのシード計算です。
function legacyTemperamentSeed(){
 const input=[pet.name,pet.palette,pet.dayStarted,pet.curiosity,pet.caution,pet.sociability,pet.activity,pet.attachment].join('|');
 let h=2166136261;
 for(let i=0;i<input.length;i++)h=Math.imul(h^input.charCodeAt(i),16777619)>>>0;
 return h;
}
function normalizeTemperament(old){
 const keys=['variability','neatness','mischief','patience'];
 let seed=legacyTemperamentSeed();
 const fallback={};
 for(const key of keys){seed=(Math.imul(seed,1664525)+1013904223)>>>0;fallback[key]=24+seed%61;}
 return Object.fromEntries(keys.map(key=>[key,clamp(Number.isFinite(old?.[key])?old[key]:fallback[key],12,94)]));
}
const newPersonalityMemory=()=>({counts:{},lastAt:{},learned:[],lastObservation:'',lastActivityMode:null,lastActivityAt:0});
function normalizePersonalityMemory(old){
 const source=old&&typeof old==='object'?old:{};
 return {counts:Object.fromEntries(PERSONALITY_KEYS.map(id=>[id,clamp(Number(source.counts?.[id])||0,0,9999)])),
  lastAt:Object.fromEntries(PERSONALITY_KEYS.map(id=>[id,Number.isFinite(source.lastAt?.[id])?source.lastAt[id]:0])),
  learned:PERSONALITY_KEYS.filter(id=>Array.isArray(source.learned)&&source.learned.includes(id)),
  lastObservation:typeof source.lastObservation==='string'?source.lastObservation.slice(0,180):'',
  lastActivityMode:['active','quiet'].includes(source.lastActivityMode)?source.lastActivityMode:null,
  lastActivityAt:Number.isFinite(source.lastActivityAt)?source.lastActivityAt:0};
}
function tendencyScores(){
 const t=pet.temperament||{variability:50,neatness:50,mischief:50,patience:50};
 const favBall=pet.objectMemory?.ball?.affinity||0;
 const likeVisits=pet.placeMemory?.habitualSpot?10:0;
 return {
  affectionate:pet.sociability*.63+pet.emotions.connection*.19+Math.min(10,memoryCount('calmTogether')*2),
  fickle:t.variability*.84+(100-pet.attachment)*.12,
  tidy:t.neatness*.82+pet.attachment*.19,
  relaxed:(100-pet.activity)*.67+t.patience*.32,
  mischievous:t.mischief*.53+pet.curiosity*.25+pet.activity*.20,
  cautiousExplorer:Math.min(pet.curiosity,pet.caution)*.82+pet.emotions.interest*.13,
  collector:pet.attachment*.53+t.neatness*.15+pet.curiosity*.19,
  particular:pet.attachment*.56+t.patience*.27+likeVisits+Math.max(0,favBall)*.10
 };
}
const personalityFactor=(id,min=.55,max=1.7)=>clamp(.65+(tendencyScores()[id]||0)/100,min,max);
// 短い気分の揺らぎ。同じ時刻なら結果は安定し、旧性格そのものは変えない。
function momentaryDisposition(now=Date.now()){
 const seed=legacyTemperamentSeed()%1009;
 const segment=Math.floor(now/90000);
 const blend=Math.sin((segment+seed)*2.17)*.56+Math.sin((segment+seed)*.63)*.44;
 return blend*(pet.temperament?.variability||40)/100;
}
function observePersonality(id,description,now=Date.now()){
 if(!PERSONALITY_TENDENCIES[id]||onboardingActive)return false;
 const mem=pet.personalityMemory;
 // 反応を連打しても、すぐに「この子の性格」と確定しない。
 if(now-(mem.lastAt[id]||0)<65000)return false;
 mem.lastAt[id]=now;mem.counts[id]=Math.min(9999,(mem.counts[id]||0)+1);
 mem.lastObservation=description.slice(0,180);
 if(mem.counts[id]>=3 && !mem.learned.includes(id)){
   mem.learned.push(id);
   const info=PERSONALITY_TENDENCIES[id];
   recordMoment(`personality_${id}`,description,`${info.hint} これは一度の行動で決めた性格ではなく、繰り返し実際に観察した傾向です。`,
      {title:`${info.label}なところがあるかも？`});
   renderPersonalityHint();save();
 }
 return true;
}
function renderPersonalityHint(){
 const el=$('personalityHint');if(!el)return;
 const learned=pet.personalityMemory.learned;
 if(!learned.length){el.textContent='まだこの子のことを観察しているところです。同じ仕草や選び方を何度か見ると、小さな気づきが増えます。';return;}
 el.replaceChildren();
 const intro=document.createElement('p');intro.textContent='一緒に暮らしていて、こんな傾向に気づきました。';el.appendChild(intro);
 for(const id of learned.slice(-5).reverse()){
   const p=document.createElement('p');const strong=document.createElement('strong');
   strong.textContent=`${PERSONALITY_TENDENCIES[id].label}かも：`;
   p.append(strong,document.createTextNode(PERSONALITY_TENDENCIES[id].hint));el.appendChild(p);
 }
}
// 見えている行動の切り替わりを記録。短時間に行動を変えただけでは判定しません。
function observeActivityPreference(mode,now){
 const m=pet.personalityMemory;
 const previous=m.lastActivityMode;
 const passed=now-m.lastActivityAt;
 if(previous && previous!==mode && passed>65000 && passed<12*60000 && tendencyScores().fickle>54){
   observePersonality('fickle',mode==='active'?`${pet.name}はのんびりしたあと、思いついたように動き始めました。`:
    `${pet.name}はよく動き回っていたのに、急に立ち止まってくつろぎ始めました。`,now);
 }
 // 各行動を全部上書きせず、90秒以上続いた活動の傾向だけを比較します。
 if(!previous||passed>90000){m.lastActivityMode=mode;m.lastActivityAt=now;}
}
function noteGesturePersonality(id,now,place){
 const map={glance:'affectionate',nuzzle:'affectionate',sitBeside:'relaxed',beg:'affectionate',
  hesitate:'cautiousExplorer',doubleTake:'cautiousExplorer',peek:'cautiousExplorer',
  spin:'mischievous',tumble:'mischievous',rollover:'relaxed',doze:'relaxed',
  stare:'particular',freeze:'cautiousExplorer',puff:'fickle'};
 const tendency=map[id];
 if(tendency&&tendencyScores()[tendency]>=48){
  const location=place==='walk'?'お散歩の途中で':'おへやで';
  observePersonality(tendency,`${pet.name}は${location}${LITTLE_GESTURES[id].caption}`,now);
 }
}

// ===============================================================

function newPet() {
  const sociability = 20 + Math.floor(Math.random() * 65);
  const caution = 20 + Math.floor(Math.random() * 65);
  const curiosity = 25 + Math.floor(Math.random() * 65);
  const comfort = 45 + Math.random() * 15;
  return {
    name: rand(names), palette: rand(palettes), roomTheme:DEFAULT_ROOM_THEME, lifeRhythm:rand(['朝型','昼型','夜型']),
    curiosity, sociability, caution,
    activity: 25 + Math.floor(Math.random() * 65),
    attachment: 25 + Math.floor(Math.random() * 65),
    favorite: rand(likes), quirk: rand(quirkList),
    hunger: 30 + Math.random() * 25, tired: 10 + Math.random() * 15,
    comfort, mood: 'curious',
    // 学習で動く「現在の気持ち」。生まれつきの性格とは別。
    emotions: {
      interest: clamp(curiosity * 0.7 + 20),
      safety: clamp(comfort),
      wariness: clamp(caution * 0.48 + 10),
      connection: clamp(sociability * 0.55 + 14)
    },
    reactionStats: { call: 0, play: 0, near: 0, recoil: 0 },
    x: 160, targetX: 160, facing: 1,
    action: 'idle', actionUntil: 0, nextDecision: 0,
    lastRealTime: Date.now(), dayStarted: Date.now(), day: 1,
    foodCount: 0, playCount: 0, walkMemory:newWalkMemory(), gestureMemory:newGestureMemory(), temperament:newTemperament(), personalityMemory:newPersonalityMemory(), pettingMemory:newPettingMemory(), wardrobe:newWardrobe(), fashionMemory:newFashionMemory(), secretMemory:newSecretMemory(), bondMemory:newBondMemory(), worldMemory:newWorldMemory(), roomItems: initialRoomItems(), objectMemory: initialObjectMemory(), roomTraces: initialRoomTraces(), placeMemory: newPlaceMemory(), placeJournal: newPlaceJournal(), momentJournal: newMomentJournal(), discoveries: [],
    logs: ['小さな生き物が部屋にやってきました。']
  };
}
function loadPet() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !data.palette || !Number.isFinite(data.lastRealTime)) return null;
    return data;
  } catch (error) {
    console.warn('セーブデータを読み取れませんでした。', error);
    return null;
  }
}

// 保存済みの子には出会いイベントを再表示しない。
const savedAtBoot = loadPet();
let pet = savedAtBoot || newPet();
let onboardingActive = !savedAtBoot;
let introStep = 0;
let introChoice = null;
let introReactionText = '';
let introMeetingRecord = null;
let introPreviewOriginalPet = null; // セーブを消さずに出会い演出だけ試すときの退避先
let memoryInvitation = null; // 自発的なおもちゃの持参・お誘い（1回の起動中のみ）

let discovered = new Set(Array.isArray(pet.discoveries) ? pet.discoveries : []);
let lastFrame = 0;
let nextSaveAt = Date.now() + 15000;
let thoughtTimer = null;
let interactionUntil = 0;
let reaction = null; // 画面上の短いリアクションは保存しない
let objectVisit = null; // 自律的な家具への移動・交流（再起動時はリセット）
let placeVisit = null; // 窓辺や隅への自発的な移動（再起動時はリセット）
let placingType = null; // プレイヤーが設置しようとしている家具
let previewX = 160;
let roomSummaryVisible = false;
let journalFilter = 'all';
let journalCategory = 'all';
let socialVisit = null; // ペット自身がこちらへ歩いてくる行動（観察して記録する）
let pettingBeg = null; // またなでてほしいという一時的なお願い。保存しない。
let walkSession=null; // 散歩中の位置や探索状況は一時的。思い出とお土産だけ保存する。
let lastPetPointerAt=0;
let petPointer=null;
const objectSprites = {};
for (const [type, info] of Object.entries(ROOM_ITEM_TYPES)) {
  const image = new Image();
  image.src = `assets/items/${info.sprite}`;
  image.onerror = () => console.warn(`アイテム画像を読み込めません: ${info.sprite}`);
  objectSprites[type] = image;
}

function normalizePet() {
  // 旧バージョンのセーブデータへの、破壊しない追加・補完
  pet.roomTheme=validRoomTheme(pet.roomTheme); // v9以前は洋風を既定値にする
  const oldWorld=pet.worldMemory && typeof pet.worldMemory==='object' ? pet.worldMemory : {};
  const defaultWorld=newWorldMemory();
  const normalizeTaste=(source,defaults,ids)=>Object.fromEntries(ids.map(id=>[id,
    clamp(Number.isFinite(source?.[id])?source[id]:defaults[id],-12,12)]));
  pet.worldMemory={
    weatherSeed:Number.isSafeInteger(oldWorld.weatherSeed)&&oldWorld.weatherSeed>0 ? oldWorld.weatherSeed : defaultWorld.weatherSeed,
    weatherTastes:normalizeTaste(oldWorld.weatherTastes,defaultWorld.weatherTastes,WORLD_KEYS),
    roomTastes:normalizeTaste(oldWorld.roomTastes,defaultWorld.roomTastes,Object.keys(ROOM_THEMES)),
    roomVisits:Object.fromEntries(Object.keys(ROOM_THEMES).map(id=>[id,clamp(Number(oldWorld.roomVisits?.[id])||0,0,9999)])),
    weatherVisits:Object.fromEntries(WORLD_KEYS.map(id=>[id,clamp(Number(oldWorld.weatherVisits?.[id])||0,0,9999)])),
    lastSpecialAt:Number.isFinite(oldWorld.lastSpecialAt)?oldWorld.lastSpecialAt:0,
    lastVisitedRoom:ROOM_THEMES[oldWorld.lastVisitedRoom]?oldWorld.lastVisitedRoom:null
  };
  pet.curiosity = clamp(Number.isFinite(pet.curiosity) ? pet.curiosity : 55);
  pet.sociability = clamp(Number.isFinite(pet.sociability) ? pet.sociability : 50);
  pet.caution = clamp(Number.isFinite(pet.caution) ? pet.caution : 50);
  pet.activity = clamp(Number.isFinite(pet.activity) ? pet.activity : 55);
  pet.attachment = clamp(Number.isFinite(pet.attachment) ? pet.attachment : 50);
  // 旧データには生活リズムが存在しないので、一度だけ補い保存する。
  if(!['朝型','昼型','夜型'].includes(pet.lifeRhythm)) pet.lifeRhythm=rand(['朝型','昼型','夜型']);
  pet.comfort = clamp(Number.isFinite(pet.comfort) ? pet.comfort : 50);
  pet.hunger = clamp(Number.isFinite(pet.hunger) ? pet.hunger : 35);
  pet.tired = clamp(Number.isFinite(pet.tired) ? pet.tired : 20);
  const defaults = {
    interest: clamp(pet.curiosity * 0.7 + 20),
    safety: pet.comfort,
    wariness: clamp(pet.caution * 0.48 + 10),
    connection: clamp(pet.sociability * 0.55 + 14)
  };
  const saved = pet.emotions && typeof pet.emotions === 'object' ? pet.emotions : {};
  pet.emotions = Object.fromEntries(
    Object.entries(defaults).map(([key, value]) => [key, clamp(Number.isFinite(saved[key]) ? saved[key] : value)])
  );
  pet.reactionStats = { call: 0, play: 0, near: 0, recoil: 0, ...pet.reactionStats };
  pet.x = clamp(Number.isFinite(pet.x) ? pet.x : 160, 45, 275);
  pet.targetX = pet.x;
  pet.facing = pet.facing === -1 ? -1 : 1;
  pet.logs = Array.isArray(pet.logs) ? pet.logs.slice(0, 8) : [];
  // v1〜v3 のデータには部屋のアイテムと学習履歴を追加する。
  const existing = Array.isArray(pet.roomItems) ? pet.roomItems : initialRoomItems();
  pet.roomItems = existing.filter(item=>item && ROOM_ITEM_TYPES[item.id] && Number.isFinite(item.x))
    .filter((item,index,arr)=>arr.findIndex(other=>other.id===item.id)===index)
    .map(item=>({id:item.id,x:clamp(item.x,36,284)}));
  const oldMemory = pet.objectMemory && typeof pet.objectMemory === 'object' ? pet.objectMemory : {};
  pet.objectMemory = initialObjectMemory();
  for (const id of Object.keys(ROOM_ITEM_TYPES)) {
    const old = oldMemory[id] || {};
    pet.objectMemory[id] = {
      familiarity: clamp(Number.isFinite(old.familiarity) ? old.familiarity : 0),
      affinity: clamp(Number.isFinite(old.affinity) ? old.affinity : 0, -40, 40),
      visits: Math.max(0,Number.isFinite(old.visits) ? old.visits : 0),
      lastUsed: Number.isFinite(old.lastUsed) ? old.lastUsed : 0
    };
  }
  // v1～v4 のセーブデータは痕跡がないため、安全な初期値を追加。
  const traces = pet.roomTraces && typeof pet.roomTraces === 'object' ? pet.roomTraces : {};
  const defaultsTraces = initialRoomTraces();
  const boundedPoints = (arr, max) => Array.isArray(arr) ? arr.filter(p=>p && Number.isFinite(p.x))
    .slice(-max).map(p=>({x:clamp(p.x,24,296), y:clamp(Number.isFinite(p.y)?p.y:169,140,186)})) : [];
  pet.roomTraces = {
    ...defaultsTraces,
    yarnPaths: Array.isArray(traces.yarnPaths) ? traces.yarnPaths.filter(p=>p && Number.isFinite(p.from) && Number.isFinite(p.to))
      .slice(-3).map(p=>({from:clamp(p.from,36,284),to:clamp(p.to,36,284)})) : [],
    cushionWrinkles: clamp(Number.isFinite(traces.cushionWrinkles)?traces.cushionWrinkles:0,0,3),
    stones: boundedPoints(traces.stones,5), leaves: boundedPoints(traces.leaves,4),
    itemMarks: Object.fromEntries(['mirror','bell','plush','blocks','blanket','tunnel','bubbles','box']
      .map(id=>[id,clamp(Number(traces.itemMarks?.[id])||0,0,3)])),
    lastNote: typeof traces.lastNote==='string' ? traces.lastNote.slice(0,180) : defaultsTraces.lastNote,
    lastAt: Number.isFinite(traces.lastAt) ? traces.lastAt : 0
  };
  // v1〜v5のデータには、既存の個体を維持したまま居場所の記憶を追加。
  const storedPlaces=pet.placeMemory && typeof pet.placeMemory==='object' ? pet.placeMemory : {};
  const oldSpots=storedPlaces.spots && typeof storedPlaces.spots==='object' ? storedPlaces.spots : {};
  const oldTastes=storedPlaces.tastes && typeof storedPlaces.tastes==='object' ? storedPlaces.tastes : {};
  const defaultsPlaces=newPlaceMemory();
  pet.placeMemory={spots:{},tastes:{},habitualSpot:placeKeys.includes(storedPlaces.habitualSpot)?storedPlaces.habitualSpot:null};
  for(const key of placeKeys){
    const old=oldSpots[key] && typeof oldSpots[key]==='object' ? oldSpots[key] : {};
    pet.placeMemory.spots[key]={
      visits:clamp(Number.isFinite(old.visits)?old.visits:0,0,10000),
      rests:clamp(Number.isFinite(old.rests)?old.rests:0,0,10000),
      idleTimes:clamp(Number.isFinite(old.idleTimes)?old.idleTimes:0,0,10000),
      comfort:clamp(Number.isFinite(old.comfort)?old.comfort:0,-30,35),
      lastVisited:Number.isFinite(old.lastVisited)?old.lastVisited:0
    };
    pet.placeMemory.tastes[key]=clamp(Number.isFinite(oldTastes[key])?oldTastes[key]:defaultsPlaces.tastes[key],-12,12);
  }
  // v1〜v6では、訪問回数だけが残っています。存在しなかった日付や出来事は復元しません。
  const rawJournal = pet.placeJournal && typeof pet.placeJournal === 'object' ? pet.placeJournal : {};
  const entries = Array.isArray(rawJournal.entries) ? rawJournal.entries : [];
  pet.placeJournal = {
    startedAt: Number.isFinite(rawJournal.startedAt) && rawJournal.startedAt > 0 ? rawJournal.startedAt : Date.now(),
    entries: entries.filter(e => e && placeKeys.includes(e.place) && JOURNAL_KINDS.includes(e.kind) &&
      Number.isFinite(e.at) && e.at > 0 && typeof e.text === 'string')
      .slice(-JOURNAL_MAX_ENTRIES).map(e => ({
        place: e.place, kind: e.kind, at: e.at,
        text: e.text.slice(0,200),
        usage: e.usage === 'rest' ? 'rest' : 'linger',
        detail: typeof e.detail === 'string' ? e.detail.slice(0,200) : ''
      }))
  };
  // v8: 会話・おもちゃの思い出。v7以前の正確な日時は残っていないので新規作成しない。
  const rawMoments=pet.momentJournal && typeof pet.momentJournal==='object' ? pet.momentJournal : null;
  const defaultMoments=newMomentJournal();
  const prior=rawMoments && rawMoments.prior && typeof rawMoments.prior==='object' ? rawMoments.prior : {
    play:(Number(pet.playCount)||0)>0 || pet.objectMemory.ball.visits>0,
    food:(Number(pet.foodCount)||0)>0,
    near:(Number(pet.reactionStats.near)||0)>0,
    call:(Number(pet.reactionStats.call)||0)>0
  };
  const validMoments=rawMoments && Array.isArray(rawMoments.entries) ? rawMoments.entries
    .filter(e=>e && MOMENT_DEFINITIONS[e.key] && Number.isFinite(e.at) && e.at>0 && typeof e.text==='string')
    .slice(-MOMENT_MAX_ENTRIES).map(e=>({key:e.key,at:e.at,text:e.text.slice(0,220),
      detail:typeof e.detail==='string'?e.detail.slice(0,220):'',
      title:typeof e.title==='string'?e.title.slice(0,90):MOMENT_DEFINITIONS[e.key].label})) : [];
  const seen=rawMoments && Array.isArray(rawMoments.seen) ? rawMoments.seen.filter(key=>MOMENT_DEFINITIONS[key]) : [];
  pet.momentJournal={
    startedAt:rawMoments && Number.isFinite(rawMoments.startedAt) && rawMoments.startedAt>0?rawMoments.startedAt:defaultMoments.startedAt,
    entries:validMoments,
    seen:[...new Set([...seen,...validMoments.map(e=>e.key)])],
    approachesSinceStart:clamp(Number.isFinite(rawMoments?.approachesSinceStart)?rawMoments.approachesSinceStart:0,0,100000),
    lastApproachRecord:Number.isFinite(rawMoments?.lastApproachRecord)?rawMoments.lastApproachRecord:0,
    prior:{play:!!prior.play,food:!!prior.food,near:!!prior.near,call:!!prior.call}
  };
  // v8の実在する交流回数だけを行動傾向へ移し、過去の日付は新たに作らない。
  const oldBond=pet.bondMemory && typeof pet.bondMemory==='object'?pet.bondMemory:{};
  const seedCounts={sharedYarn:Math.max(0,Number(pet.playCount)||0),
    answeredCall:Math.max(0,Number(pet.reactionStats.call)||0),
    calmTogether:Math.max(0,Number(pet.reactionStats.near)||0)};
  const defaultsBond=newBondMemory();
  pet.bondMemory={...defaultsBond};
  for(const key of Object.keys(seedCounts)) {
    const old=oldBond[key] && typeof oldBond[key]==='object'?oldBond[key]:{};
    pet.bondMemory[key]={
      times:clamp(Number.isFinite(old.times)?old.times:seedCounts[key],0,9999),
      lastAt:Number.isFinite(old.lastAt)?old.lastAt:0
    };
  }
  pet.bondMemory.invitationCount=clamp(Number(oldBond.invitationCount)||0,0,9999);
  pet.bondMemory.invitationAccepted=clamp(Number(oldBond.invitationAccepted)||0,0,9999);
  pet.bondMemory.lastInvitationAt=Number.isFinite(oldBond.lastInvitationAt)?oldBond.lastInvitationAt:0;
  pet.walkMemory=normalizeWalkMemory(pet.walkMemory);
  pet.gestureMemory=normalizeGestureMemory(pet.gestureMemory);
  pet.temperament=normalizeTemperament(pet.temperament);
  pet.personalityMemory=normalizePersonalityMemory(pet.personalityMemory);
  pet.pettingMemory=normalizePettingMemory(pet.pettingMemory);
  pet.wardrobe = normalizeWardrobe(pet.wardrobe);
  pet.fashionMemory=normalizeFashionMemory(pet.fashionMemory);
  pet.secretMemory=normalizeSecretMemory(pet.secretMemory);
  // If a cushion or a yarn ball was removed, its 'hidden' state cannot persist.
  if(!pet.roomItems.some(i=>i.id==='ball') || !pet.roomItems.some(i=>i.id==='cushion'))pet.secretMemory.hiddenBall=false;
  pet.day = Math.max(1, Number.isFinite(pet.day) ? pet.day : 1);
  pet.dayStarted = Number.isFinite(pet.dayStarted) ? pet.dayStarted : Date.now();
  pet.action = 'idle';
  pet.mood = 'calm';
  pet.actionUntil = 0;
  pet.nextDecision = Date.now() + 1800;
}
normalizePet();
beginWearSession();

function save() {
  if(onboardingActive) return; // 出会いが終わるまで仮の個体をセーブしない。
  pet.lastRealTime = Date.now();
  pet.discoveries = [...discovered];
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(pet)); }
  catch (error) { console.warn('保存できませんでした。', error); }
}
function renderLog() {
  const el = $('log');
  el.replaceChildren();
  for (const line of pet.logs) {
    const p = document.createElement('p');
    p.textContent = line;
    el.appendChild(p);
  }
}
const headwearSprites={};
for(const h of HEADWEAR){
  const img=new Image();
  img.src=`assets/headwear/${h.id}.png`;
  img.onerror=()=>console.warn(`頭飾りを読み込めません: ${h.id}`);
  headwearSprites[h.id]=img;
}
function renderWardrobe(){
  const wallet=pet.wardrobe;
  if(!wallet) return;
  const today=localDayKey();
  if(wallet.dailyDate!==today){wallet.dailyDate=today;wallet.earnedToday=0;}
  $('bondPointBalance').innerHTML=`${wallet.points} <small>pt</small>`;
  const quick=$('headerBondPoints');if(quick)quick.textContent=`${wallet.points} pt`;
  const grid=$('headwearChoices');
  const fragment=document.createDocumentFragment();
  for(const item of HEADWEAR){
    const owned=wallet.unlocked.includes(item.id);
    const worn=wallet.equipped===item.id;
    const affordable=wallet.points>=item.price;
    const button=document.createElement('button');
    button.type='button';button.dataset.headwear=item.id;
    button.className=`headwear-card${worn?' equipped':''}${!owned&&affordable?' can-unlock':''}`;
    button.disabled=!owned&&!affordable;
    button.setAttribute('aria-pressed',String(worn));
    const img=document.createElement('img');img.src=`assets/headwear/${item.id}.png`;
    img.alt='';img.className='headwear-icon';
    const info=document.createElement('span');info.className='headwear-details';
    const title=document.createElement('span');title.className='headwear-name';title.textContent=item.name;
    const desc=document.createElement('span');desc.className='headwear-detail';desc.textContent=owned&&pet.fashionMemory.items[item.id].wears>=2?fashionComment(item.id):item.description;
    info.append(title,desc);
    const action=document.createElement('span');action.className='headwear-action';
    action.textContent=worn?'はずす':owned?'つける':affordable?`解放 ${item.price}pt`:`🔒 ${item.price}pt`;
    button.setAttribute('aria-label',`${item.name}：${action.textContent}`);
    button.append(img,info,action);fragment.append(button);
  }
  grid.replaceChildren(fragment);
  renderFashionHint();
}
function setWardrobeMessage(message){$('wardrobeMessage').textContent=message;}
function chooseHeadwear(id){
  const item=HEADWEAR_BY_ID[id];if(!item || onboardingActive)return;
  const wallet=pet.wardrobe;
  if(!wallet.unlocked.includes(id)){
    if(wallet.points<item.price){setWardrobeMessage(`${item.name}にはあと${item.price-wallet.points}pt必要です。`);return;}
    wallet.points-=item.price;
    wallet.unlocked.push(id);
    wallet.equipped=id;
    setWardrobeMessage(`${item.name}を解放しました！ そのまま頭につけてみました。`);
    addLog(`${pet.name}のおめかしに、${item.name}が仲間入りしました。`);
  }else{
    wallet.equipped=wallet.equipped===id?null:id;
    setWardrobeMessage(wallet.equipped?`${pet.name}に${item.name}をつけました。`:'頭飾りをそっとはずしました。');
  }
  const now=Date.now();
  pet.fashionMemory.lastManualAt=now;
  beginWearSession(now);
  if(wallet.equipped){
    const mem=pet.fashionMemory.items[id];
    if(now-mem.lastTryAt>=18000){mem.lastTryAt=now;mem.familiarity=clamp(mem.familiarity+1);}
    // 反応は見られても、繰り返し着けただけでは好感度を増やさない。
    reactToHeadwear(id,'player');
  }else{showThought('…');$('roomCaption').textContent=`${pet.name}の頭飾りをそっと外しました。`;}
  renderWardrobe();save();
}
// 成功した交流だけがポイント対象。連打・日付をまたぐケースも調整する。
function awardBondPoints(key, basePoints){
  if(onboardingActive)return 0;
  const wallet=pet.wardrobe,now=Date.now();
  const today=localDayKey(now);
  if(wallet.dailyDate!==today){wallet.dailyDate=today;wallet.earnedToday=0;}
  if(now-(wallet.lastRewards[key]||0)<(key==='observe'?120000:POINT_REWARD_COOLDOWN))return 0;
  const earned=Math.min(Math.max(0,basePoints),POINT_DAILY_LIMIT-wallet.earnedToday);
  if(earned<=0)return 0;
  wallet.points+=earned;
  wallet.totalEarned+=earned;
  wallet.earnedToday+=earned;
  wallet.lastRewards[key]=now;
  setWardrobeMessage(`ふれあいで +${earned}pt！ 今日は ${wallet.earnedToday}/${POINT_DAILY_LIMIT}pt 獲得しました。`);
  renderWardrobe();save();
  return earned;
}

function addLog(text) {
  pet.logs.unshift(text);
  pet.logs = pet.logs.slice(0, 8);
  renderLog();
  refreshTodayHighlight();
  save();
}
function showThought(text) {
  const el = $('thought');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(thoughtTimer);
  thoughtTimer = setTimeout(() => el.classList.remove('show'), 2300);
}
function discover(key, text) {
  if (discovered.has(key)) return;
  discovered.add(key);
  refreshJournalCount();
  $('discoveryText').textContent = text;
  addLog(`発見：${text}`);
}
function adjustEmotion(changes) {
  for (const [key, value] of Object.entries(changes)) {
    if (key in pet.emotions) pet.emotions[key] = clamp(pet.emotions[key] + value);
  }
  // comfortは旧セーブ形式との互換用。安心感と近い値で管理する。
  pet.comfort = pet.emotions.safety;
}
function visibleMood() {
  if(gestureState && LITTLE_GESTURES[gestureState.id])return LITTLE_GESTURES[gestureState.id].caption;
  // 名前やゲージではなく、観察できるサインのみ。
  if (pet.action === 'sleep') return '目を閉じ、ゆっくり上下している';
  if (reaction && Date.now() < reaction.until) return reaction.gesture;
  if (placeVisit && placeVisit.stage==='staying' && pet.action!=='sleep') return `${placeLabel(placeVisit.key)}で、のんびりしている`;
  if (pet.action === 'eat') return '食べ物に体を寄せている';
  if (pet.action === 'play') return '小さく弾みながら動いている';
  if (pet.action === 'sniff') return '何かの匂いを確かめている';
  if (pet.action === 'collect') return '小さなものに夢中になっている';
  if (pet.action === 'look') return '体を傾け、じっと見つめている';
  if (pet.action === 'walk') return 'ゆっくり部屋を歩いている';
  if (pet.emotions.wariness > 68) return '少し体を縮めている';
  if (pet.tired > 68) return 'ときどき目を細めている';
  if (pet.emotions.interest > 70) return '辺りをきょろきょろ見ている';
  return '自分のペースで過ごしている';
}
function renderUI() {
  applyRoomTheme();
  renderWeather();
  $('petNameHeading').textContent = pet.name;
  $('dayLabel').textContent = `${pet.day}日目`;
  $('petIntro').textContent = '仕草を眺めて、この子のことを知っていきましょう。';
  $('sleepSignal').textContent = pet.tired > 72 ? 'まばたきがゆっくりになっている' : pet.tired > 45 ? 'ときどき、うとうとしている' : '目を開けて辺りを見ている';
  $('moodSignal').textContent = visibleMood();
  refreshJournalCount();
  renderLog();
  updateItemTray();
  renderTraceUI();
  renderPlaceUI();
  renderPlaceJournal();
  renderMemoryHint();
  renderPersonalityHint();
  renderInvitationButton();
  renderWardrobe();
  renderSecretHint();
  renderPettingHint();
  refreshTodayHighlight();
  renderWalkCollection();
}

// 48x40px のスプライトシート：横4コマ × 縦10動作。旧版の画像素材をそのまま使用。
const SPRITE_ACTIONS = ['idle', 'walk', 'sleep', 'look', 'happy', 'wary', 'eat', 'play', 'collect', 'sniff'];
const SPRITE_W = 48, SPRITE_H = 40;
const spriteFiles = {
  'クリーム': 'cream.png', '薄い水色': 'sky_blue.png', '淡い桃色': 'peach.png',
  '灰色': 'gray.png', '薄茶色': 'tan.png', 'ミント': 'mint.png'
};
const spriteSheets = {};
for (const [color, filename] of Object.entries(spriteFiles)) {
  const image = new Image();
  image.src = `assets/sprites/${filename}`;
  image.onerror = () => console.warn(`ドット絵画像を読み込めません: ${filename}`);
  spriteSheets[color] = image;
}
for(const [color,filename] of Object.entries(spriteFiles)){
  const image=new Image();image.src=`assets/gestures/${filename}`;
  image.onerror=()=>console.warn(`追加しぐさ画像を読み込めません: ${filename}`);
  gestureSpriteSheets[color]=image;
}
function spriteAction() {
  if(gestureState&&LITTLE_GESTURES[gestureState.id])return LITTLE_GESTURES[gestureState.id].sprite;
  if (pet.action === 'sleep') return 'sleep';
  if (pet.action === 'eat') return 'eat';
  if (pet.action === 'play') return 'play';
  if (pet.action === 'collect') return 'collect';
  if (pet.action === 'sniff') return 'sniff';
  if (pet.action === 'walk') return 'walk';
  if (reaction && reaction.kind === 'hop') return 'happy';
  if (reaction && (reaction.kind === 'recoil' || reaction.kind === 'shrink')) return 'wary';
  if (pet.action === 'look') return 'look';
  return pet.mood === 'happy' ? 'happy' : 'idle';
}
function drawPet(time) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  drawWeatherInWindow(time);
  drawRoomItems(time);
  drawWalkSouvenirsInRoom();
  let image = spriteSheets[pet.palette] || spriteSheets['薄い水色'];
  if (!image || !image.complete || !image.naturalWidth) return;
  const action = spriteAction();
  let row = SPRITE_ACTIONS.indexOf(action);
  if(gestureState&&LITTLE_GESTURES[gestureState.id]){const alternate=gestureSprite(gestureState.id,pet.palette,image,row);image=alternate.sheet;row=alternate.row;}
  const speed = action === 'walk' || action === 'play' ? 145 : action === 'sleep' ? 650 : 350;
  const frame = Math.floor(time / speed) % 4;
  const elapsed = reaction ? Date.now() - reaction.start : 0;
  const active = reaction && Date.now() < reaction.until;
  let angle = 0, squashX = 1, squashY = 1, lift = 0;
  if (active) {
    const progress = clamp(elapsed / reaction.duration, 0, 1);
    const envelope = Math.sin(progress * Math.PI);
    if (reaction.kind === 'hop') {
      lift = Math.abs(Math.sin(elapsed / 170 * Math.PI)) * 10 * envelope;
      squashX = 1 + 0.10 * envelope;
      squashY = 1 - 0.075 * envelope;
    } else if (reaction.kind === 'tilt') {
      angle = Math.sin(elapsed / 430) * 0.085 * envelope;
    } else if (reaction.kind === 'recoil' || reaction.kind === 'shrink') {
      angle = -pet.facing * 0.055 * envelope;
      squashX = 1.08;
      squashY = 1 - 0.16 * envelope;
    } else if (reaction.kind === 'lean') {
      angle = pet.facing * 0.085 * envelope;
      squashX = 1.04;
      squashY = 0.96;
    } else if (reaction.kind === 'sway') {
      angle = Math.sin(elapsed / 250) * 0.055 * envelope;
    } else if(reaction.kind==='pet_cuddle'){
      // 吹き出し型の体を横にふわっと伸ばし、撫でる動作に応える。
      squashX=1+0.16*envelope;
      squashY=1-0.13*envelope;
      angle=Math.sin(elapsed/470)*0.023*envelope;
      lift=2.6*envelope;
    } else if(reaction.kind==='pet_sleep'){
      squashX=1+0.075*envelope;
      squashY=1-0.07*envelope;
      angle=Math.sin(elapsed/500)*0.018*envelope;
    } else if(reaction.kind==='pet_wiggle'){
      angle=Math.sin(elapsed/150)*0.075*envelope;
      lift=Math.abs(Math.sin(elapsed/240*Math.PI))*4.4*envelope;
      squashX=1+0.09*envelope;
    } else if (reaction.kind === 'spin') {
      angle = (elapsed / 600) * Math.PI * 2 * envelope;
      squashX = 0.93 + Math.abs(Math.cos(elapsed / 200)) * 0.07;
    }
  }
  // v17: 専用仕草の変形。ペット・頭飾りの両方に適用されます。
  let offsetX=0;
  if(gestureState && gestureState.id!=='approach'){
    const pose=littleGesturePose(gestureState.id,Date.now()-gestureState.start,gestureState.duration,pet.facing);
    angle+=pose.angle;squashX*=pose.sx;squashY*=pose.sy;lift+=pose.lift;offsetX=pose.dx;
  }
  if (action === 'walk') lift += Math.abs(Math.sin(time / 150)) * 1.6;
  if (action === 'sleep') squashY *= 0.96 + Math.sin(time / 580) * 0.02;

  ctx.save();
  ctx.translate(Math.round(pet.x+offsetX), Math.round(136 - lift));
  ctx.rotate(angle);
  if (pet.facing < 0) ctx.scale(-1, 1);
  ctx.scale(squashX, squashY);
  ctx.drawImage(image, frame * SPRITE_W, row * SPRITE_H, SPRITE_W, SPRITE_H, -48, -47, 96, 80);
  const chosenHat=pet.wardrobe?.equipped;
  const hat=headwearSprites[chosenHat];
  if(hat && hat.complete && hat.naturalWidth){
    // ペットと同じ座標・向き・傾き・ジャンプを共有。頭の上に透明PNGを重ねます。
    ctx.drawImage(hat,-32,-84,64,56);
  }
  ctx.restore();
  // 持ち運び中の毛糸玉。実物の家具スプライトを一つだけ表示する。
  if(memoryInvitation?.stage==='bring'){
    const ball=objectSprites.ball;
    if(ball?.complete && ball.naturalWidth) ctx.drawImage(ball,Math.round(pet.x+pet.facing*18-13),128,26,26);
  }
  if(active && ['pet_cuddle','pet_wiggle'].includes(reaction.kind)){
    // 体に寄り添うピクセルの小さなハート。数値ラベルは表示しない。
    const px=Math.round(pet.x+32),py=Math.round(91-4*Math.sin(time/300));
    ctx.fillStyle='#e49a9f';
    ctx.fillRect(px,py,3,3);ctx.fillRect(px+6,py,3,3);
    ctx.fillRect(px-2,py+3,13,4);ctx.fillRect(px,py+7,9,3);ctx.fillRect(px+3,py+10,3,3);
  }
  if (active && reaction.kind === 'hop') {
    // 喜びは文字のラベルでなく、小さなピクセルのきらめきでも表す。
    ctx.fillStyle = '#d6aa67';
    const flicker = Math.floor(time / 230) % 2;
    ctx.fillRect(Math.round(pet.x - 47), 83 - flicker * 3, 3, 3);
    ctx.fillRect(Math.round(pet.x + 43), 89 + flicker * 2, 3, 3);
  }
}
// 小石、落ち葉、毛糸の通り道を、ドット絵の解像感に合う四角いピクセルで描画。
function drawRoomTraces() {
  const t = pet.roomTraces;
  ctx.save();
  for (const path of t.yarnPaths) {
    const distance = path.to-path.from;
    const count = Math.max(2,Math.ceil(Math.abs(distance)/5));
    for(let i=0;i<=count;i++){
      const x=Math.round(path.from+distance*i/count);
      const y=171+(i%3===1 ? 2 : 0);
      ctx.fillStyle=i%2 ? '#d999a9' : '#c8889b';
      ctx.fillRect(x,y,3,2);
    }
  }
  for (const stone of t.stones) {
    const x=Math.round(stone.x), y=Math.round(stone.y);
    ctx.fillStyle='#827c86';ctx.fillRect(x-4,y-4,9,6);
    ctx.fillStyle='#bfcbd0';ctx.fillRect(x-3,y-5,7,4);
    ctx.fillStyle='#e8eef0';ctx.fillRect(x-1,y-5,3,2);
  }
  for (const leaf of t.leaves) {
    const x=Math.round(leaf.x), y=Math.round(leaf.y);
    ctx.fillStyle='#759a6c';ctx.fillRect(x-3,y-2,7,4);
    ctx.fillStyle='#9ab67b';ctx.fillRect(x-2,y-3,5,2);
    ctx.fillStyle='#8e7560';ctx.fillRect(x+3,y,3,1);
  }
  ctx.restore();
}
function drawRoomItems(time) {
  drawRoomTraces();
  for (const item of pet.roomItems) {
    const info = ROOM_ITEM_TYPES[item.id], img = objectSprites[item.id];
    if (!info || !img || !img.complete || !img.naturalWidth) continue;
    if(item.id==='ball' && memoryInvitation && memoryInvitation.stage==='bring') continue;
    const tucked=item.id==='ball' && pet.secretMemory.hiddenBall;
    const focus = objectVisit && objectVisit.id === item.id && objectVisit.stage === 'interact';
    const bounce = focus && ['ball','bubbles'].includes(item.id) ? Math.abs(Math.sin(time/170))*5 :
      focus && item.id==='plush'&&objectVisit.behavior!=='sleep'?Math.abs(Math.sin(time/420))*2:0;
    const sway = focus && item.id === 'plant' ? Math.sin(time/250)*0.05 :
      focus && item.id==='bell' ? Math.sin(time/90)*0.18 : 0;
    ctx.save();
    ctx.translate(Math.round(item.x), 164 - bounce);
    ctx.rotate(sway + (focus && ['blocks','box','blanket'].includes(item.id) ? Math.sin(time/380)*.026 : 0));
    if(tucked) ctx.drawImage(img,-12,-21,24,24); // クッションの奥に少しだけ見える毛糸玉
    else ctx.drawImage(img,-info.w/2,-info.h,info.w,info.h);
    if(item.id==='cushion' && pet.roomTraces.cushionWrinkles>0){
      // クッションを使ったあとに残る、短いピクセルのしわ。
      ctx.strokeStyle='#ba8c88';ctx.lineWidth=2;ctx.lineCap='butt';
      for(let n=0;n<pet.roomTraces.cushionWrinkles;n++){
        const sx=-14+n*12, sy=-info.h+20+(n%2)*5;
        ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(sx+5,sy+2);ctx.stroke();
      }
    }
    // 遊んだ痕跡が家具自体の小さな揺れや傾きに現れる。
    const marks=pet.roomTraces.itemMarks?.[item.id]||0;
    if(marks && ['plush','blocks','box','blanket'].includes(item.id)){
      ctx.fillStyle=item.id==='blocks'?'#e3a976':item.id==='blanket'?'#e7cdd5':'#bba292';
      for(let n=0;n<Math.min(3,marks);n++)ctx.fillRect(-16+n*9,-8-(n%2)*3,5,2);
    }
    ctx.restore();
    if(focus && ['mirror','bell','bubbles','tunnel','box'].includes(item.id)){
      const flutter=Math.floor(time/225)%2;
      ctx.fillStyle=item.id==='bubbles'?'#b8e7ed':'#ffe6a8';
      for(let n=0;n<3;n++)ctx.fillRect(Math.round(item.x-19+n*17),Math.round(97-(n*11)+flutter*3),2+(n%2),2+(n%2));
    }
    if (focus && (item.id==='pebble' || item.id==='plant')) {
      const shine = Math.floor(time / 260) % 2;
      ctx.fillStyle = item.id==='pebble' ? '#fff1ae' : '#e2cfa0';
      ctx.fillRect(Math.round(item.x + 20), 100 + shine*4, 3, 3);
    }
  }
  if (placingType) {
    const info=ROOM_ITEM_TYPES[placingType], img=objectSprites[placingType];
    ctx.fillStyle='rgba(255,251,232,0.14)';
    ctx.fillRect(0,139,320,61);
    ctx.strokeStyle='#a67b5d'; ctx.lineWidth=1; ctx.setLineDash([4,4]);
    ctx.strokeRect(8,143,304,47); ctx.setLineDash([]);
    if (img && img.complete && img.naturalWidth) {
      ctx.save();ctx.globalAlpha=0.66;
      ctx.drawImage(img,Math.round(previewX-info.w/2),164-info.h,info.w,info.h);
      ctx.restore();
    }
  }
}
function moveTowardTarget(dt) {
  const dx = pet.targetX - pet.x;
  if (Math.abs(dx) < 0.5) { pet.x = pet.targetX; return; }
  const speed = reaction && reaction.kind === 'recoil' ? 58 : 38; // pixel / second
  pet.x += Math.sign(dx) * Math.min(Math.abs(dx), speed * dt);
  pet.facing = dx > 0 ? 1 : -1;
}
function startAction(action, duration, mood, destination = pet.x) {
  pet.action = action;
  pet.actionUntil = Date.now() + duration;
  pet.mood = mood;
  pet.targetX = clamp(destination, 45, 275);
}
function performReaction({action = 'look', kind = 'tilt', duration = 2600, mood = 'curious',
                          destination = pet.x, gesture, caption, thought = '…', log}) {
  const now = Date.now();
  cancelLittleGestures();
  objectVisit = null; // プレイヤーが誘えば、家具への移動から気持ちを切り替える。
  placeVisit = null;
  socialVisit = null;
  roomSpecialVisit=null;
  secretVisit=null;
  memoryInvitation=null;
  renderInvitationButton();
  startAction(action, duration, mood, destination);
  reaction = { kind, gesture, start: now, until: now + duration, duration };
  $('roomCaption').textContent = caption;
  showThought(thought);
  if (log) addLog(log);
  pet.nextDecision = now + duration + 400;
  interactionUntil = now + 800;
  renderUI();
  save();
}
function weightedChoice(items) {
  const total = items.reduce((s, item) => s + Math.max(0, item.weight), 0);
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= Math.max(0, item.weight);
    if (roll <= 0) return item.id;
  }
  return items[items.length - 1].id;
}

// 「痕跡」は家具の位置とともに保存。プレイヤーの手で片づけるまで残る。
function noteRoomTrace(message, offline = false) {
  pet.roomTraces.lastNote = offline ? `留守の間に、${message}` : message;
  pet.roomTraces.lastAt = Date.now();
  roomSummaryVisible = false;
  renderTraceUI();
}
function findRoomItem(id) { return pet.roomItems.find(item=>item.id===id); }
function moveLooseObject(item, distance) {
  const from = item.x;
  let to=clamp(from+distance,36,284);
  if(Math.abs(to-from)<5) to=clamp(from-distance,36,284);
  item.x=Math.round(to);
  return {from,to:item.x};
}
function addRoomTrace(id, {offline=false, behavior=''}={}) {
  const item=findRoomItem(id);
  if(!item) return false;
  const t=pet.roomTraces;
  let note='';
  if(id==='ball' && (offline || behavior==='play')) {
    const direction=(Math.random()<0.5?-1:1), distance=10+Math.round(Math.random()*13);
    const path=moveLooseObject(item,direction*distance);
    if(path.from===path.to) return false;
    t.yarnPaths.push(path);t.yarnPaths=t.yarnPaths.slice(-3);
    note='毛糸玉がころころ転がり、床に毛糸の跡が残っていました。';
  } else if(id==='cushion' && (offline || behavior==='rest')) {
    t.cushionWrinkles=clamp(t.cushionWrinkles+1,0,3);
    moveLooseObject(item,(Math.random()<0.5?-1:1)*(2+Math.round(Math.random()*3)));
    note='クッションが少しずれ、表面に小さなしわができています。';
  } else if(id==='pebble' && (offline || behavior==='collect')) {
    if(t.stones.length>=5) return false;
    const cushion=findRoomItem('cushion');
    const anchor=cushion ? cushion.x+(cushion.x>160?-44:44) : item.x+(item.x>160?-30:30);
    const n=t.stones.length;
    t.stones.push({x:clamp(anchor+(n%3-1)*10,24,296),y:173-Math.floor(n/3)*7});
    note=cushion?'クッションのそばに、小さな石がひとつ増えています。':'部屋の片隅に、小さな石が集まっています。';
  } else if(id==='plant' && (offline || behavior==='sniff')) {
    if(t.leaves.length>=4) return false;
    const n=t.leaves.length;
    t.leaves.push({x:clamp(item.x+(n%2===0?-20:22)+(n-1)*3,24,296),y:169+(n%2)*5});
    note='鉢植えのそばに、小さな葉っぱが落ちています。';
  } else if(EXTRA_ITEM_BEHAVIORS[id] && !offline && behavior && behavior!=='look') {
    t.itemMarks[id]=clamp((t.itemMarks[id]||0)+1,0,3);
    const notes={mirror:'鏡のそばに、小さなきらめきが残っています。',bell:'鈴が少し揺れたままになっています。',
      plush:'ぬいぐるみが少し傾いています。',blocks:'積み木の並びが変わっています。',
      blanket:'毛布にふわふわの折り目ができています。',tunnel:'トンネルのそばに、小さな足跡があります。',
      bubbles:'床にシャボン玉の名残がきらめいています。',box:'箱のふたが少しずれています。'};
    note=notes[id];
  } else return false;
  noteRoomTrace(note,offline);
  return true;
}
function roomTraceSummary() {
  const t=pet.roomTraces;
  const results=[];
  if(t.yarnPaths.length) results.push('毛糸玉が動いた跡があります');
  if(t.cushionWrinkles) results.push('クッションにしわが残っています');
  if(t.stones.length) results.push('小石が集まっています');
  if(t.leaves.length) results.push('鉢植えのそばに葉っぱが落ちています');
  const marks=Object.entries(t.itemMarks||{}).filter(([id,count])=>count>0&&findRoomItem(id));
  if(marks.length) results.push(marks.slice(0,3).map(([id])=>ROOM_ITEM_TYPES[id].label+'に遊んだ跡があります').join('、'));
  return results.length ? results.join('。')+'。' : '今はきれいに片づいた部屋です。';
}
function renderTraceUI(){
  const node=$('roomTraceText');
  if(node) node.textContent=roomSummaryVisible ? roomTraceSummary() : pet.roomTraces.lastNote;
}
function tidyRoom() {
  if(placingType) {placingType=null;updateItemTray();}
  // プレイヤーが置いた家具の現在位置はそのまま。消えるのは生活の痕跡のみ。
  pet.roomTraces=initialRoomTraces();
  revealHiddenYarn();
  noteRoomTrace('散らばったものを片づけ、クッションのしわを整えました。');
  $('roomCaption').textContent='部屋を整えました。また新しい発見があるかもしれません。';
  addLog('部屋をそっと片づけました。');
  save();
}
// -------- v7: 発見ノートに残す「場所の思い出」 --------
// 観察していない留守中の出来事は記録しません。
// 事実（その場で見えた行動）と、推測（好きかもしれない）を区別します。
function addPlaceJournalEntry(key, kind, at, text, detail='', usage='linger') {
  const entries = pet.placeJournal.entries;
  entries.push({place:key,kind,at,text,detail,usage});
  if(entries.length>JOURNAL_MAX_ENTRIES) entries.splice(0,entries.length-JOURNAL_MAX_ENTRIES);
  renderPlaceJournal();
  refreshJournalCount();
}
function journalMomentText(key, usage, observation) {
  if(observation) return observation;
  return usage==='rest' ? `${pet.name}は${placeLabel(key)}で目を閉じました` :
    `${pet.name}は${placeLabel(key)}でしばらく過ごしました`;
}
function rememberPlaceStory(key, usage, now, previousVisits, wasSettled, observation='') {
  const entries=pet.placeJournal.entries.filter(e=>e.place===key);
  const m=pet.placeMemory.spots[key];
  const moment=journalMomentText(key,usage,observation);
  const visitedBeforeJournal=previousVisits>0 && entries.length===0;
  if(!entries.length) {
    addPlaceJournalEntry(key,'first',now,moment+'。',visitedBeforeJournal?
      'この場所には以前から通っていたようです。ただし、それ以前の詳しい出来事は残っていません。':
      'この場所で過ごした、最初の記録です。',usage);
  } else if(usage==='rest' && !entries.some(e=>e.kind==='rest' || (e.kind==='first' && e.usage==='rest'))) {
    addPlaceJournalEntry(key,'rest',now,moment+'。',
      'ここで休む姿を初めて記録しました。落ち着ける場所なのかもしれません。');
  } else if(!entries.some(e=>e.kind==='return')) {
    addPlaceJournalEntry(key,'return',now,moment+'。',
      '前にも選んだ場所へ、自分から戻ってきました。');
  }
  // 「いつもの場所」になった瞬間は、この操作以前の状態と比較します。
  const settled = m.visits>=4 && (m.rests>=2 || m.idleTimes>=3);
  if(settled && !wasSettled && !pet.placeJournal.entries.some(e=>e.place===key && e.kind==='habit')) {
    addPlaceJournalEntry(key,'habit',now,moment+'。',
      'この場所を繰り返し選んだことから、いつもの居場所になりつつあるようです。今日の出来事も、その一つかもしれません。');
  } else if (settled) {
    // 長い生活でも記録が途切れないよう、後日の自発的な再訪を控えめに記す。
    const recent=pet.placeJournal.entries.filter(e=>e.place===key);
    const latest=recent[recent.length-1];
    if(latest && now-latest.at>=3*86400000) {
      addPlaceJournalEntry(key,'later',now,moment+'。',
        '日がたっても、またこの場所を選びました。');
    }
  }
}
// -- v8: 日付付きの交流・おもちゃの思い出 --
function momentCount(){return pet.placeJournal.entries.length + pet.momentJournal.entries.length;}
function refreshJournalCount(){
  $('discoveryCount').textContent=`発見${discovered.size}・思い出${momentCount()}`;
}
function recordMoment(key, text, detail='', options={}) {
  if(!MOMENT_DEFINITIONS[key] || pet.momentJournal.seen.includes(key)) return false;
  const moment=pet.momentJournal;
  const title=options.title || MOMENT_DEFINITIONS[key].label;
  moment.seen.push(key); // 古い思い出が上限で整理されても再登録しない
  moment.entries.push({key,at:Date.now(),text,detail,title});
  if(moment.entries.length>MOMENT_MAX_ENTRIES) moment.entries.splice(0,moment.entries.length-MOMENT_MAX_ENTRIES);
  $('discoveryText').textContent=`思い出が増えました。「${title}」`;
  addLog(`思い出：${title}`);
  refreshJournalCount();
  renderPlaceJournal();
  save();
  return true;
}
function rememberYarnPlay({spontaneous=false}={}){
  const previouslyRecorded=pet.momentJournal.seen.includes('yarn_play');
  const prior=pet.momentJournal.prior.play;
  const text=spontaneous?
    `${pet.name}は自分から毛糸玉を選び、ころころ転がして遊びました。`:
    `${pet.name}は遊びの誘いに応えて、毛糸玉を追いかけて跳ねました。`;
  const detail=prior?'以前の遊びについては正確な日時が残っていません。これは今回の更新以降に見られた行動です。':
    (spontaneous?'誰にも誘われず、自分の意思で遊び始めた様子です。':'誘いかけに応えて、一緒に遊んだ出来事です。');
  if(!previouslyRecorded){
    recordMoment('yarn_play',text,detail,{title:prior?'毛糸玉で遊んだ記録':'初めて毛糸玉で遊んだ日'});
    if(spontaneous) pet.momentJournal.seen.push('yarn_self');
  } else if(spontaneous) {
    recordMoment('yarn_self',text,'自分からおもちゃを選んだ場面を記録しました。');
  }
}
function rememberSpontaneousApproach(now){
  const journal=pet.momentJournal;
  journal.approachesSinceStart++;
  const observed=`${pet.name}は誰にも呼ばれていないのに、こちらへ歩いてきて、そばで落ち着きました。`;
  if(!journal.seen.includes('came_close')){
    recordMoment('came_close',observed,'呼びかけやタップへの反応ではなく、自分から近づいた出来事です。');
  } else if(journal.approachesSinceStart>=3 && now-journal.lastApproachRecord>86400000){
    // 同じ日に何度も記録しない。3回以上、かつ前回から1日以上経った後の変化。
    recordMoment('came_close_again',observed,'繰り返しこちらを訪ねるようになりました。いつもの行動になりつつあるのかもしれません。');
  }
  journal.lastApproachRecord=now;
}
function formatJournalDate(timestamp) {
  const date=new Date(timestamp);
  return Number.isNaN(date.getTime()) ? '日時不明' :
    date.toLocaleString('ja-JP',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
}
function renderPlaceJournal() {
  const nav=$('placeJournalTabs'), categories=$('journalCategoryTabs'), list=$('placeJournalEntries'), intro=$('placeJournalIntro');
  if(!nav || !categories || !list || !intro) return;
  const placeEntries=pet.placeJournal.entries;
  const momentEntries=pet.momentJournal.entries;
  const recorded=placeKeys.filter(key=>placeEntries.some(e=>e.place===key));
  if(journalFilter!=='all' && !recorded.includes(journalFilter)) journalFilter='all';
  categories.replaceChildren();
  const filterList=[['all','すべて',placeEntries.length+momentEntries.length],
    ['place','居場所',placeEntries.length],
    ['interaction','交流',momentEntries.filter(e=>MOMENT_DEFINITIONS[e.key]?.category==='interaction').length],
    ['object','おもちゃ・もの',momentEntries.filter(e=>MOMENT_DEFINITIONS[e.key]?.category==='object').length],
    ['world','季節とおへや',momentEntries.filter(e=>MOMENT_DEFINITIONS[e.key]?.category==='world').length],
    ['fashion','おめかし',momentEntries.filter(e=>MOMENT_DEFINITIONS[e.key]?.category==='fashion').length],
    ['secret','ひみつの習性',momentEntries.filter(e=>MOMENT_DEFINITIONS[e.key]?.category==='secret').length],
    ['walk','おさんぽ',momentEntries.filter(e=>MOMENT_DEFINITIONS[e.key]?.category==='walk').length],
    ['gesture','しぐさ',momentEntries.filter(e=>MOMENT_DEFINITIONS[e.key]?.category==='gesture').length],
    ['personality','この子らしさ',momentEntries.filter(e=>MOMENT_DEFINITIONS[e.key]?.category==='personality').length]];
  for(const [category,label,count] of filterList){
    const button=document.createElement('button');button.type='button';button.className='journal-tab';
    button.textContent=`${label} ${count}`;
    button.setAttribute('aria-pressed',String(journalCategory===category));
    button.addEventListener('click',()=>{journalCategory=category;journalFilter='all';renderPlaceJournal();});
    categories.appendChild(button);
  }
  nav.hidden=journalCategory!=='place';
  nav.replaceChildren();
  if(journalCategory==='place') for(const key of ['all',...recorded]){
    const button=document.createElement('button');button.type='button';button.className='journal-tab';
    button.textContent=key==='all'?'すべての場所':placeLabel(key);
    button.setAttribute('aria-pressed',String(journalFilter===key));
    button.addEventListener('click',()=>{journalFilter=key;renderPlaceJournal();});
    nav.appendChild(button);
  }
  const chosenPlaces=journalCategory==='all' || journalCategory==='place' ?
    placeEntries.filter(e=>journalCategory!=='place'||journalFilter==='all'||e.place===journalFilter)
      .map(e=>({...e,source:'place'})) : [];
  const chosenMoments=journalCategory==='all' ? momentEntries :
    momentEntries.filter(e=>MOMENT_DEFINITIONS[e.key]?.category===journalCategory);
  const chosen=[...chosenPlaces,...chosenMoments.map(e=>({...e,source:'moment'}))]
    .sort((a,b)=>b.at-a.at);
  if(!chosen.length){
    intro.textContent=journalCategory==='all' ?
      'まだ思い出はありません。いっしょに過ごす中で、居場所や遊び・交流の出来事が記録されます。' :
      'この種類の思い出はまだありません。これからの行動を観察してみましょう。';
  }else if(journalCategory==='place' && journalFilter!=='all'){
    const spot=pet.placeMemory.spots[journalFilter];
    const familiar=spot && spot.visits>=4 && (spot.rests>=2||spot.idleTimes>=3);
    intro.textContent=`${placeLabel(journalFilter)}の思い出です。${familiar?'何度も戻ってくる、なじみの場所になっているようです。':'どんな場所になっていくのでしょう？'}`;
  }else{
    intro.textContent=`居場所 ${placeEntries.length}件、交流・ものとの思い出 ${momentEntries.length}件。新しい出来事から表示しています。`;
  }
  list.replaceChildren();
  for(const entry of chosen){
    const li=document.createElement('li');li.className='journal-entry';
    const meta=document.createElement('div');meta.className='journal-entry-meta';
    const time=document.createElement('time');time.dateTime=new Date(entry.at).toISOString();
    time.textContent=formatJournalDate(entry.at);
    const kind=document.createElement('span');kind.className='journal-tag';
    kind.textContent=entry.source==='place' ? JOURNAL_LABELS[entry.kind] : MOMENT_CATEGORIES[MOMENT_DEFINITIONS[entry.key].category];
    meta.append(time,kind);
    const title=document.createElement('p');title.className='journal-entry-title';
    title.textContent=entry.source==='place' ? placeLabel(entry.place) : entry.title;
    const observation=document.createElement('p');observation.className='journal-entry-text';
    observation.textContent=entry.text;
    li.append(meta,title,observation);
    if(entry.detail){const note=document.createElement('p');note.className='journal-entry-note';note.textContent=entry.detail;li.appendChild(note);}
    list.appendChild(li);
  }
}
function openFavoriteStory() {
  // 表示中の「いつもの居場所」と同じ場所のノートを開く。
  const listed=placeKeys.filter(k=>placeAvailable(k) && pet.placeMemory.spots[k].visits>=2);
  listed.sort((a,b)=>placeHabitStrength(b)-placeHabitStrength(a));
  const key=listed[0] || pet.placeMemory.habitualSpot;
  journalCategory='place';
  journalFilter=key && pet.placeJournal.entries.some(e=>e.place===key) ? key : 'all';
  renderPlaceJournal();
  openAppTab('notes');
  const section=$('discoveryNotebook');
  if(section && typeof section.scrollIntoView==='function') section.scrollIntoView({behavior:'smooth',block:'start'});
}
// ----------------------------------------------------

// -------- v6: お気に入りの場所 / 日々の習慣 --------
// 意図的な移動や休息を経験として積み重ね、選びやすさに反映します。
// 重要な発見は、プレイ中の実際の行動だけを観察したときに発生します。
function placePreference(key, now=Date.now()) {
  if(!placeAvailable(key)) return -Infinity;
  const m=pet.placeMemory.spots[key];
  const taste=pet.placeMemory.tastes[key];
  // 居心地は育つが、好き嫌いが一方向にしか進まないわけではありません。
  const learned=Math.min(28,m.visits*2.4 + m.rests*3.4 + m.idleTimes*1.3) + m.comfort*0.65;
  const base=(key==='cushion'?14:0) + (key==='window'?pet.curiosity*0.10:0) +
    (key==='corner'?pet.caution*0.12:0);
  const natural=(key==='cushion' && pet.favorite==='柔らかいもの'?16:0) +
    (key==='window' && pet.quirk==='窓辺を気にする'?22:0) +
    (key==='corner' && pet.caution>65?10:0);
  const fatigue=key==='cushion' ? pet.tired*0.23 : 0;
  // ごく最近いた場所には戻りにくい。ただし、特に眠いときはクッションを優先。
  const recently=now-m.lastVisited<14000 ? (key==='cushion'&&pet.tired>80?0:20) : 0;
  return 12+taste+learned+base+natural+fatigue-recently;
}
function rememberPlace(key, usage='linger', now=Date.now(), observation='') {
  const m=pet.placeMemory.spots[key];
  if(!m || !placeAvailable(key)) return;
  const previousVisits=m.visits;
  const wasSettled=m.visits>=4 && (m.rests>=2 || m.idleTimes>=3);
  m.visits=Math.min(10000,m.visits+1);
  m.lastVisited=now;
  if(usage==='rest') m.rests=Math.min(10000,m.rests+1);
  else m.idleTimes=Math.min(10000,m.idleTimes+1);
  const good=(usage==='rest'?3:1.6) + (pet.emotions.safety>52?1:0);
  const uneasy=pet.emotions.wariness>75 ? 2.5 : 0;
  m.comfort=clamp(m.comfort+good-uneasy,-30,35);
  // 複数の場所に住み分けてもよい。ここで好みを強制的に固定はしない。
  const available=placeKeys.filter(placeAvailable);
  const established=available.filter(k=>pet.placeMemory.spots[k].visits>=3);
  pet.placeMemory.habitualSpot=established.length?
    established.sort((a,b)=>placeHabitStrength(b)-placeHabitStrength(a))[0]:null;
  if(m.visits===2) {
    $('roomCaption').textContent=`${pet.name}は${placeLabel(key)}へ、また戻ってきました。`;
  }
  rememberPlaceStory(key,usage,now,previousVisits,wasSettled,observation);
  if(m.visits>=4&&m.visits%2===0&&tendencyScores().particular>=47)observePersonality('particular',`${pet.name}は今日も${placeLabel(key)}へ自分で戻ってきました。`,now);
  if(m.visits>=4 && (m.rests>=2 || m.idleTimes>=3)) {
    discover(`home-${key}`,`${pet.name}は${placeLabel(key)}で、何度も落ち着いて過ごしています。`);
  }
  renderPlaceUI();
}
function placeHabitStrength(key) {
  const m=pet.placeMemory.spots[key];
  return m.visits + m.rests*1.9 + m.idleTimes*0.7 + m.comfort*0.15;
}
function renderPlaceUI() {
  const node=$('favoritePlaceText');
  if(!node) return;
  const places=placeKeys.filter(key=>placeAvailable(key) && pet.placeMemory.spots[key].visits>=2);
  if(!places.length){
    node.textContent=`${pet.name}はまだ、部屋のあちこちを試しているようです。お気に入りはこれからわかるかもしれません。`;
    return;
  }
  places.sort((a,b)=>placeHabitStrength(b)-placeHabitStrength(a));
  const top=places[0], m=pet.placeMemory.spots[top];
  const settled=m.rests>=2 || m.visits>=4;
  const other=places.slice(1).find(k=>pet.placeMemory.spots[k].visits>=3);
  const second=other?` ときどき${placeLabel(other)}にも立ち寄ります。`:'';
  node.textContent=settled ?
    `${pet.name}は${placeLabel(top)}に戻ってきて、落ち着いて過ごすことが多いようです。${second}` :
    `${pet.name}は最近、${placeLabel(top)}で過ごすことが増えてきました。${second}`;
}
function beginFreePlaceVisit(key, now, reason='linger') {
  const x=placeCoordinate(key);
  if(x===null) return false;
  const duration=Math.max(1700,Math.abs(x-pet.x)/38*1000+700);
  objectVisit=null;
  placeVisit={key,stage:'approach',until:now+duration+450,reason};
  startAction('walk',duration,'calm',x);
  pet.nextDecision=now+duration+800;
  $('roomCaption').textContent=`${pet.name}は${placeLabel(key)}へ、ゆっくり向かっています。`;
  return true;
}
function updateFreePlaceVisit(now) {
  if(!placeVisit) return;
  if(placeVisit.stage==='approach' && (Math.abs(pet.x-pet.targetX)<2.5 || now>=placeVisit.until)){
    pet.x=pet.targetX;
    const rest=placeVisit.reason==='sleep'||(pet.tired>60 && Math.random()<0.45);
    const duration=rest?14000:3800+Math.round(Math.random()*1800);
    const key=placeVisit.key;
    placeVisit.stage='staying';placeVisit.until=now+duration;
    startAction(rest?'sleep':'idle',duration,'calm',pet.x);
    pet.nextDecision=now+duration+900;
    $('roomCaption').textContent=rest?
      `${pet.name}は${placeLabel(key)}で、ゆっくり目を閉じました。`:
      `${pet.name}は${placeLabel(key)}で、しばらくのんびりしています。`;
    rememberPlace(key,rest?'rest':'linger',now,rest?
      `${pet.name}は${placeLabel(key)}を選び、ゆっくり目を閉じました`:
      `${pet.name}は${placeLabel(key)}を自分から選び、しばらくくつろぎました`);
    renderUI();save();
  } else if(placeVisit.stage==='staying' && now>=placeVisit.until){
    placeVisit=null;
  }
}
function startAutonomousFreePlace(now){
  const options=Object.keys(FREE_PLACES).map(key=>({id:key,weight:Math.max(1,placePreference(key,now))}));
  return beginFreePlaceVisit(weightedChoice(options),now);
}
function beginRestAtFavorite(now){
  // 疲れている場合、覚えている休息場所へ向かう。置いたクッションが最優先とは限らない。
  const keys=['cushion','blanket','plush',...Object.keys(FREE_PLACES)].filter(placeAvailable);
  const choice=keys.map(key=>({id:key,weight:Math.max(1,placePreference(key,now) +
    (['cushion','blanket','plush'].includes(key)?25:0) + pet.placeMemory.spots[key].rests*2.5)}));
  const key=weightedChoice(choice);
  if(ROOM_ITEM_TYPES[key]) return beginObjectVisit(findRoomItem(key),now,'sleep');
  return beginFreePlaceVisit(key,now,'sleep');
}
// ------------------------------------------------------
// 家具との交流はプレイヤーが命令するのではなく、その子の気分・個性・経験で選ぶ。
function itemAttraction(item, now) {
  const info=ROOM_ITEM_TYPES[item.id], memory=pet.objectMemory[item.id], e=pet.emotions;
  if (now-memory.lastUsed < 22000) return 0; // 同じものを連続で調べない
  let score=14+pet.curiosity*0.16 + e.interest*0.12 + memory.affinity*0.75 + Math.min(16,memory.familiarity*0.14);
  const tendency=tendencyScores();
  if(item.id==='pebble')score+=tendency.collector*.18+tendency.tidy*.09;
  if(item.id==='cushion')score+=tendency.relaxed*.16;
  if(item.id==='ball')score+=tendency.mischievous*.12+momentaryDisposition(now)*7;
  if(item.id==='plant')score+=tendency.cautiousExplorer*.08;
  // v19: 同じものでも、気質と経験から選ばれやすさが異なる。
  if(item.id==='mirror')score+=tendency.cautiousExplorer*.12+pet.curiosity*.15;
  if(item.id==='bell')score+=tendency.mischievous*.14+pet.activity*.1;
  if(item.id==='plush')score+=tendency.affectionate*.15+tendency.relaxed*.15;
  if(item.id==='blocks')score+=tendency.tidy*.2+tendency.mischievous*.08;
  if(item.id==='blanket')score+=tendency.relaxed*.16+pet.tired*.38;
  if(item.id==='tunnel')score+=tendency.cautiousExplorer*.15+pet.curiosity*.11;
  if(item.id==='bubbles')score+=pet.activity*.20+tendency.fickle*.13;
  if(item.id==='box')score+=tendency.collector*.14+tendency.particular*.10;
  if (info.tags.includes(pet.favorite)) score+=32;
  // 何度も安心して過ごした家具を、自然と選び直すようになる。
  score+=Math.max(-14,Math.min(38,(placePreference(item.id,now)-22)*0.65));
  if (['cushion','blanket','plush'].includes(item.id)) score+=pet.tired*0.45 + (100-pet.activity)*0.1;
  if (item.id==='ball') score+=pet.activity*0.14 + e.connection*0.08 + Math.min(21,memoryCount('sharedYarn')*5);
  if (item.id==='pebble' && pet.quirk==='小さなものを集める') score+=22;
  if (item.id==='plant' && pet.quirk==='窓辺を気にする') score+=15;
  if (memory.visits===0) score+=pet.curiosity*0.17 - pet.caution*0.13;
  if (e.wariness>65 && memory.visits===0) score-=20;
  return Math.max(3,score);
}
function beginObjectVisit(item, now, reason='explore') {
  if(item.id==='ball')revealHiddenYarn();
  const info=ROOM_ITEM_TYPES[item.id];
  const side=pet.x > item.x ? 1 : -1;
  const target=clamp(item.x + side * info.approach,45,275);
  const duration=Math.max(1650,Math.abs(target-pet.x)/38*1000 + 900);
  placeVisit=null;
  objectVisit={id:item.id,stage:'approach',until:now+duration+600,reason};
  startAction('walk',duration,'curious',target);
  pet.nextDecision=now+duration+900;
  $('roomCaption').textContent=`${pet.name}は${info.label}のほうへ、ゆっくり近づいています。`;
}
// v19: 8つの家具専用の遊び。気分・生まれつきの性格・以前の経験で行動が分かれます。
// 実行した出来事だけを思い出に追加し、親しみと好き嫌いは別々に学習します。
const EXTRA_ITEM_BEHAVIORS={
 mirror:{rest:false,note:'鏡に映った姿を確かめました。'},
 bell:{rest:false,note:'鈴を鳴らしてみました。'},
 plush:{rest:true,note:'ぬいぐるみと過ごしました。'},
 blocks:{rest:false,note:'積み木で遊びました。'},
 blanket:{rest:true,note:'毛布の感触を確かめました。'},
 tunnel:{rest:false,note:'トンネルに近づきました。'},
 bubbles:{rest:false,note:'シャボン玉を眺めました。'},
 box:{rest:false,note:'箱の中を調べました。'}
};
function chooseNewItemBehavior(item, reason, memory){
 const id=item.id, trend=tendencyScores(), familiar=memory.familiarity;
 const cautious=pet.caution*.48+pet.emotions.wariness*.52-(familiar*.45);
 const playful=pet.activity*.4+pet.curiosity*.32+trend.mischievous*.2+momentaryDisposition(Date.now())*9;
 const tidy=trend.tidy*.57+pet.attachment*.24;
 const relax=pet.tired*.62+trend.relaxed*.29;
 const choice=Math.random()*100;
 let action='look',mood='curious',duration=4400,thought='…？',caption='',active=true;
 switch(id){
 case 'mirror':
  if(cautious>62 && familiar<40 && choice<56){action='look';mood='wary';caption=`${pet.name}は鏡の中の自分を見つけ、びくっとしてから二度見しました。`;}
  else if(choice<46 || familiar>57){action='happy';mood='happy';caption=`${pet.name}は鏡の前で左右に揺れて、映る動きを真似しています。`;thought='♪';}
  else caption=`${pet.name}は鏡に映る不思議な相手を、体を傾けて眺めています。`;
  break;
 case 'bell':
  if(cautious>66 && familiar<28 && choice<65){action='wary';mood='wary';caption=`${pet.name}は鈴の音にびくっとし、少し離れて耳を澄ませています。`;}
  else if(playful>52 && choice<72){action='play';mood='happy';caption=`${pet.name}は鈴をころころ揺らし、音が鳴るたびにぽよんと跳ねています。`;thought='♪';}
  else {action='look';caption=`${pet.name}は鈴を一度鳴らして、余韻をじっと聞いています。`;}
  break;
 case 'plush':
  if(reason==='sleep'||relax>57){action='sleep';duration=12500;mood='calm';thought='すぅ…';caption=`${pet.name}はぬいぐるみに身を寄せ、安心したようにうとうとしています。`;}
  else if(choice<58){action='idle';mood='happy';caption=`${pet.name}はぬいぐるみをそっと抱えるように、体をくっつけました。`;thought='♡';}
  else {action='look';caption=`${pet.name}はぬいぐるみを押してから、となりに並んで座りました。`;}
  break;
 case 'blocks':
  if(tidy>48 && choice<74){action='collect';caption=`${pet.name}は積み木をひとつずつ並べ、きれいな列を作っています。`;thought='✦';}
  else if(playful>50 && choice<85){action='play';mood='happy';caption=`${pet.name}は積み木を積んで、最後にぽんっと崩してしまいました。`;thought='♪';}
  else {action='look';caption=`${pet.name}は積み木の向きを変えながら、組み合わせを確かめています。`;}
  break;
 case 'blanket':
  if(reason==='sleep'||relax>49){action='sleep';duration=14000;mood='calm';thought='すぅ…';caption=`${pet.name}は毛布の端にもぐり、あたたかそうに眠っています。`;}
  else if(playful>57 && choice<48){action='play';mood='happy';caption=`${pet.name}は毛布の端を引っぱり、ずるずると運ぼうとしています。`;}
  else {action='idle';mood='calm';caption=`${pet.name}は毛布をふわりと広げ、上でくつろいでいます。`;}
  break;
 case 'tunnel':
  if(cautious>64&&familiar<32&&choice<72){action='look';mood='wary';caption=`${pet.name}はトンネルの入口から、そーっと中をのぞきました。`;}
  else if(playful>48&&choice<63){action='walk';mood='happy';duration=4800;caption=`${pet.name}はトンネルをくぐり抜け、反対側からひょこっと現れました。`;thought='♪';}
  else {action='idle';mood='calm';caption=`${pet.name}はトンネルの中でじっと隠れ、外の様子をうかがっています。`;}
  break;
 case 'bubbles':
  if(pet.tired>72){action='look';caption=`${pet.name}は浮かぶシャボン玉を、眠そうな目で追っています。`;}
  else if(playful>47&&choice<77){action='play';mood='happy';caption=`${pet.name}はシャボン玉を追いかけ、ぱちんと弾けると小さく跳ねました。`;thought='♪';}
  else {action='look';caption=`${pet.name}はシャボン玉の色を、長いあいだじっと眺めています。`;}
  break;
 case 'box':
  if(trend.collector>53 && choice<66){action='collect';caption=`${pet.name}は小さな箱へ、気に入ったものをしまおうとしています。`;thought='✦';}
  else if(cautious>52 && choice<65){action='idle';caption=`${pet.name}は箱の陰に隠れて、こちらをそっとのぞいています。`;}
  else {action='play';mood='happy';caption=`${pet.name}は箱の中へ入ろうとして、もこもこの体をぎゅっと縮めました。`;thought='♪';}
  break;
 }
 return {action,mood,duration,thought,caption,active};
}

function interactWithObject(now) {
  if (!objectVisit || objectVisit.stage!=='approach') return;
  const item=pet.roomItems.find(i=>i.id===objectVisit.id);
  if (!item) {objectVisit=null;return;}
  const memory=pet.objectMemory[item.id], e=pet.emotions, label=ROOM_ITEM_TYPES[item.id].label;
  const hesitant=objectVisit.reason!=='sleep' && e.wariness>64 && memory.familiarity<35 && Math.random()<0.58;
  let action='look', duration=3700, mood='curious', caption='', thought='？';
  if (hesitant) {
    caption=`${pet.name}は${label}を少し離れて眺めています。`; thought='…？';
    adjustEmotion({wariness:-1,interest:2});
  } else if (item.id==='ball') {
    if (pet.tired>66) {
      action='look'; caption=`${pet.name}は毛糸玉を見つめていますが、今は遊ばないようです。`;
    } else {
      action='play';mood='happy';duration=5200;thought='♪';
      caption=`${pet.name}は自分から毛糸玉を転がし、ぽんと跳ねました。`;
      pet.tired=clamp(pet.tired+4);
      adjustEmotion({interest:-5, safety:2});
    }
  } else if (item.id==='cushion') {
    action=objectVisit.reason==='sleep'||pet.tired>42?'sleep':'idle';mood='calm';duration=action==='sleep'?14000:4300;thought=action==='sleep'?'すぅ…':'…♪';
    caption=action==='sleep' ? `${pet.name}はクッションに落ち着き、うとうとしています。` : `${pet.name}はクッションの上で、くつろいでいます。`;
    adjustEmotion({safety:3,wariness:-2});
  } else if(EXTRA_ITEM_BEHAVIORS[item.id]) {
    const result=chooseNewItemBehavior(item,objectVisit.reason,memory);
    ({action,duration,mood,caption,thought}=result);
    if(['play','collect'].includes(action)) pet.tired=clamp(pet.tired+3);
    if(['sleep','idle'].includes(action) && ['plush','blanket'].includes(item.id))
      adjustEmotion({safety:3,wariness:-2});
    if(mood==='happy')adjustEmotion({interest:-3,connection:1});
  } else if (item.id==='pebble') {
    action=pet.attachment>56?'collect':'look';duration=4300;thought='✦';
    caption=action==='collect' ? `${pet.name}は小石をつつき、気に入った位置へころころ動かしました。` : `${pet.name}は小石のきらめきを、じっと眺めています。`;
  } else {
    action='sniff';duration=4600;thought='…';
    caption=`${pet.name}は鉢植えの周りを調べ、葉っぱをそっと揺らしました。`;
  }
  const liked=ROOM_ITEM_TYPES[item.id].tags.includes(pet.favorite);
  // 親しみと好き嫌いは別。慣れても好きになるとは限らない。
  memory.visits++;
  memory.familiarity=clamp(memory.familiarity+(hesitant?5:9));
  memory.affinity=clamp(memory.affinity + (liked ? (hesitant?1:5) : (hesitant?-1:2)),-40,40);
  memory.lastUsed=now;
  // 触れるだけでは跡は残らない。実際に遊んだ・休んだなどのときにのみ発生。
  const traceBehavior = item.id==='ball' && action==='play' ? 'play'
    : item.id==='cushion' ? 'rest'
    : item.id==='pebble' && action==='collect' ? 'collect'
    : item.id==='plant' && action==='sniff' ? 'sniff'
    : EXTRA_ITEM_BEHAVIORS[item.id] ? action : '';
  if(traceBehavior) addRoomTrace(item.id,{behavior:traceBehavior});
  if(EXTRA_ITEM_BEHAVIORS[item.id] && !hesitant){
    const first=memory.visits===1;
    if(first){
      recordMoment(`item_first_${item.id}`,caption,
        'この家具に初めて自分から関わった、実際に観察できた出来事です。');
    }
    if(item.id==='blocks'&&action==='collect' && tendencyScores().tidy>=45)
      observePersonality('tidy',`${pet.name}は積み木を丁寧に並べていました。`,now);
    if(['plush','blanket'].includes(item.id)&&action==='sleep')
      observePersonality('relaxed',`${pet.name}は柔らかい場所を自分で選んで眠っています。`,now);
    if(item.id==='box'&&action==='collect')
      observePersonality('collector',`${pet.name}は箱の中へ小さな宝物をしまおうとしました。`,now);
  }
  if(item.id==='ball' && action==='play'){
    rememberYarnPlay({spontaneous:true});
    if(tendencyScores().mischievous>=48)observePersonality('mischievous',`${pet.name}は毛糸玉を自分から見つけて、ころころ転がして遊びました。`,now);
  }
  if(item.id==='pebble'&&action==='collect'){
    observePersonality('collector',`${pet.name}は小さな石を自分から選び、ころころ動かして集めました。`,now);
    if(tendencyScores().tidy>=47)observePersonality('tidy',`${pet.name}は小さな石を気に入った位置に整えていました。`,now);
  }
  if(item.id==='cushion'&&action==='sleep')observePersonality('relaxed',`${pet.name}は自分でクッションを選び、そこでゆっくり眠り始めました。`,now);

  objectVisit.stage='interact'; objectVisit.behavior=action; objectVisit.until=now+duration;
  // 遠くから見るだけでは居場所として学ばない。実際に近くで過ごした経験を記録。
  if(!hesitant && !(item.id==='ball'&&action==='look')) rememberPlace(item.id,action==='sleep'?'rest':'linger',now,
    item.id==='cushion' ? (action==='sleep' ? `${pet.name}はクッションでうとうとし始めました` : `${pet.name}はクッションでゆっくり過ごしました`) :
    item.id==='ball' ? `${pet.name}は毛糸玉を自分で選び、転がして遊びました` :
    item.id==='pebble' ? (action==='collect'?`${pet.name}は小石をころころ動かして、そのそばで過ごしました`:`${pet.name}は小石のきらめきを眺めました`) :
    EXTRA_ITEM_BEHAVIORS[item.id] ? `${pet.name}は${label}で自分なりの時間を過ごしました` :
    `${pet.name}は鉢植えの葉を調べ、そばで過ごしました`);
  startAction(action,duration,mood,pet.x);
  pet.nextDecision=now+duration+1400;
  $('roomCaption').textContent=caption;
  if (memory.visits===1 || memory.visits%4===0) addLog(caption);
  if (memory.visits>=3 && memory.affinity>=12) {
    discover(`favorite-${item.id}`,`${pet.name}は${label}を自分から何度も選んでいるようです。`);
  }
  if (memory.visits>=2 && item.id==='cushion') discover('cushion-rest',`${pet.name}はクッションを、落ち着ける場所として使うようです。`);
  if (memory.visits>=2 && item.id==='pebble') discover('pebble-look',`${pet.name}は小さな石のきらめきを気にするようです。`);
  showThought(thought);
  renderUI();
  save();
}
function updateObjectVisit(now) {
  if (!objectVisit) return;
  if (objectVisit.stage==='approach' && (Math.abs(pet.x-pet.targetX)<2.5 || now>=objectVisit.until)) {
    pet.x=pet.targetX;
    interactWithObject(now);
  } else if (objectVisit.stage==='interact' && now>=objectVisit.until) {
    objectVisit=null;
  }
}
function startAutonomousItemAction(now) {
  if (!pet.roomItems.length) return false;
  const options=pet.roomItems.map(item=>({id:item.id,weight:itemAttraction(item,now)}));
  if (!options.some(item=>item.weight>0)) return false;
  const itemId=weightedChoice(options);
  const item=pet.roomItems.find(i=>i.id===itemId);
  if (!item || itemAttraction(item,now)<=0) return false;
  beginObjectVisit(item,now);
  return true;
}
// 呼ばれたときの反応とは別に、ペットが自分の意思でこちらへ歩く。
function beginAutonomousSocialVisit(now){
  if(socialVisit || objectVisit || placeVisit || reaction || pettingBeg || pet.tired>70) return false;
  if(Math.abs(pet.x-160)<38 || pet.emotions.wariness>76) return false;
  const learnedCompany=Math.min(24,memoryCount('answeredCall')*4+memoryCount('calmTogether')*3);
  const chance=clamp(((pet.sociability*0.38+pet.emotions.connection*0.48+pet.emotions.safety*0.22-pet.emotions.wariness*0.25+learnedCompany)/240)*personalityFactor('affectionate',.7,1.7),0.04,0.46);
  if(Math.random()>chance) return false;
  const destination=pet.x<160?150:170;
  const duration=Math.max(1300,Math.abs(destination-pet.x)/38*1000+850);
  socialVisit={stage:'approach',until:now+duration+600};
  startAction('walk',duration,'calm',destination);
  pet.nextDecision=now+duration+1600;
  $('roomCaption').textContent=`${pet.name}はふとこちらに気づき、自分から歩いてきました。`;
  return true;
}
function updateAutonomousSocialVisit(now){
  if(!socialVisit) return;
  if(socialVisit.stage==='approach' && (Math.abs(pet.x-pet.targetX)<2.5 || now>=socialVisit.until)){
    pet.x=pet.targetX;
    socialVisit.stage='resting';socialVisit.until=now+4200;
    startAction('idle',4200,'calm',pet.x);
    pet.nextDecision=now+4700;
    adjustEmotion({safety:1,connection:1,wariness:-1});
    rememberSharedExperience('calmTogether');
    $('roomCaption').textContent=`${pet.name}は自分からこちらへ来て、しばらくそばにいます。`;
    rememberSpontaneousApproach(now);
    observePersonality('affectionate',`${pet.name}は自分からこちらへ来て、しばらくそばにいました。`,now);
    maybeInviteToPet(now,'arrival');
    renderUI();save();
  }else if(socialVisit.stage==='resting' && now>=socialVisit.until){
    socialVisit=null;
  }
}

// —— v15: 直接なでる。タップ・スワイプ・ボタンのいずれからも同じ処理を使います ——
function maybeInviteToPet(now,reason='after_pet'){
  const m=pet.pettingMemory;
  if(pettingBeg || m.accepted===0 || pet.tired>80 || pet.hunger>88 ||
    pet.emotions.wariness>68 || now-m.lastBegAt<120000) return false;
  const base=(reason==='arrival' ? .09 : .25);
  const chance=clamp((base+m.accepted*.035+Math.max(0,pettingPreference())*.0035)*personalityFactor('affectionate',.65,1.55),0,.68);
  if(Math.random()>chance)return false;
  m.lastBegAt=now;m.begs++;
  pettingBeg={stage:'waiting',at:now,readyAt:now+(reason==='arrival'?950:3250),until:now+14500};
  return true;
}
function updatePettingBeg(now){
  if(!pettingBeg)return;
  if(onboardingActive||placingType||now>=pettingBeg.until||pet.tired>88){
    pettingBeg=null;renderPettingHint();return;
  }
  if(pettingBeg.stage==='waiting' && now>=pettingBeg.readyAt && !reaction){
    pettingBeg.stage='offering';
    const dest=clamp(pet.x+(pet.x<160?8:-8),45,275);
    startAction('idle',3200,'calm',dest);
    reaction={kind:'lean',gesture:'こちらをじっと見つめ、もう一度体を寄せている',start:now,until:now+3100,duration:3100};
    pet.nextDecision=now+3100;
    $('roomCaption').textContent=`${pet.name}は少し考えてから、もう一度体を寄せてきました。`;
    showThought('…♪');
    recordMoment('petting_request',`${pet.name}はなで終わったあと、もう一度こちらに寄ってきました。`,
      '呼ばれたのではなく、ペットの方から再び寄ってきた場面です。');
    renderPettingHint();
    save();
  }
}
function strokePet(mode='tap'){
  if(onboardingActive || placingType || !canInteract())return false;
  const now=Date.now(), e=pet.emotions,m=pet.pettingMemory;
  const answering=!!(pettingBeg?.stage==='offering'&&pettingBeg.until>now);
  const approached=!!(socialVisit?.stage==='resting');
  const asleep=pet.action==='sleep';
  // おねだりに応えるときだけ、先ほどのお願いが消える前に理由を記録する。
  pettingBeg=null;
  m.attempts++;m.lastPetAt=now;
  const preference=pettingPreference()+(approached?20:0)+(answering?23:0);
  const shy=e.wariness>72 || (pet.caution>70&&e.safety<44);
  const declines=!asleep && (shy && Math.random()<.65 || preference<4 && Math.random()<.68 || preference<16&&Math.random()<.23);
  if(declines){
    m.declined++;m.familiarity=clamp(m.familiarity+.7,0,100);
    adjustEmotion({wariness:1,interest:1});
    // 身を引かれた経験を罰にしない。ポイントも減らない。
    performReaction({action:'walk',kind:'recoil',duration:2500,mood:'wary',
      destination:clamp(pet.x+(pet.x<160?-15:15),45,275),
      gesture:'体をきゅっと縮めて、そっと離れている',
      caption:`${pet.name}は今はなでられたくないようで、少し離れました。`,thought:'…'});
    interactionUntil=now+1500;
    renderPettingHint();save();
    return true;
  }
  m.accepted++;
  if(answering||approached)observePersonality('affectionate',`${pet.name}は自分から近づいて、なでる手に体を預けました。`,now);
  m.familiarity=clamp(m.familiarity+(mode==='stroke'?3.2:2),0,100);
  m.affinity=clamp(m.affinity+(asleep?.35:mode==='stroke'?1.35:.9),-30,35);
  if(mode==='stroke')m.strokes++;
  adjustEmotion({safety:asleep?1:3,connection:asleep?0:2,wariness:-2,interest:asleep?0:-1});
  rememberSharedExperience('calmTogether');
  awardBondPoints('petting',6);
  if(asleep){
    performReaction({action:'sleep',kind:'pet_sleep',duration:3300,mood:'calm',
      gesture:'目を閉じたまま、呼吸に合わせてゆっくり体を伸ばしている',
      caption:`${pet.name}は眠ったまま、なでる手に合わせてほんの少し体を伸ばしました。`,thought:'すぅ…'});
    recordMoment('petting_sleep',`${pet.name}が眠っている間にそっとなでると、体がゆっくり伸びました。`,
      '眠りを邪魔せず、やさしくふれたときの反応です。');
  }else{
    const playful=e.interest>66&&pet.activity>60&&Math.random()<.27;
    const content=playful ?
      {kind:'pet_wiggle',action:'happy',gesture:'気持ちよさそうに体を揺らし、ぽよんと跳ねている',caption:`${pet.name}はなでられると、嬉しそうにぽよんと跳ねました！`,thought:'♪'} :
      {kind:'pet_cuddle',action:'idle',gesture:'ふわっと横に伸び、目を細めている',caption:`${pet.name}はなでる手に合わせて、ふわっと体を伸ばしました。`,thought:'…♪'};
    performReaction({...content,duration:3400,mood:'happy'});
  }
  if(m.accepted===1) recordMoment('first_petting',`${pet.name}を初めてそっとなでました。${asleep?'眠ったまま、小さく体を伸ばしました。':'体をふわっと伸ばして、なでる手に応えてくれました。'}`,
    'このゲームで初めて実際になでられた瞬間の記録です。以前の交流は推測して追加しません。');
  if(answering){
    m.begAnswers++;
    recordMoment('petting_answer',`${pet.name}が自分からもう一度そばに来たので、なでてあげました。`,
      'ペットからのおねだりに、プレイヤーが応えた出来事です。');
  }
  if(m.accepted>=3)discover('gentle-petting',`${pet.name}はそっとなでられると、体を伸ばしてくつろぐことがあるようです。`);
  interactionUntil=now+1500;
  // おねだりへの返答から連鎖して永遠に要求し続けないようにする。
  if(!asleep&&!answering)maybeInviteToPet(now,'after_pet');
  renderPettingHint();save();
  return true;
}

// —— v9: 一緒に遊んだ記憶から生まれる、自発的なお誘い ——
function renderInvitationButton() {
  const button=$('playBtn');
  if(!button) return;
  const active=!!(memoryInvitation && memoryInvitation.stage==='offering');
  const label=button.querySelector('span:last-child');
  if(label) label.textContent=active?'誘いに応える':'遊びに誘う';
  button.classList.toggle('invitation-active',active);
}
function maybeBeginYarnInvitation(now) {
  if(memoryInvitation || objectVisit || placeVisit || socialVisit || reaction || !findRoomItem('ball')) return false;
  const memory=pet.bondMemory;
  if(!memory.sharedYarn.times || pet.tired>68 || pet.hunger>80 || pet.emotions.wariness>69) return false;
  if(now-memory.sharedYarn.lastAt<40000 || now-memory.lastInvitationAt<150000) return false;
  const chance=clamp((0.10+memoryCount('sharedYarn')*0.048+(pet.emotions.connection-45)*0.0015)*personalityFactor('mischievous',.70,1.45),0.07,0.38);
  if(Math.random()>chance) return false;
  revealHiddenYarn();
  const ball=findRoomItem('ball');
  const target=clamp(ball.x+(pet.x>ball.x?25:-25),45,275);
  const duration=Math.max(1700,Math.abs(target-pet.x)/38*1000+800);
  memory.lastInvitationAt=now;
  memory.invitationCount=Math.min(9999,memory.invitationCount+1);
  memoryInvitation={stage:'approach',until:now+duration+500};
  startAction('walk',duration,'curious',target);
  pet.nextDecision=now+duration+500;
  $('roomCaption').textContent=`${pet.name}は、ふと思い出したように毛糸玉へ向かっています。`;
  save();
  return true;
}
function updateMemoryInvitation(now) {
  if(!memoryInvitation) return;
  const visit=memoryInvitation;
  const arrived=()=>Math.abs(pet.x-pet.targetX)<2.5 || now>=visit.until;
  if(visit.stage==='approach' && arrived()){
    const ball=findRoomItem('ball');
    if(!ball){memoryInvitation=null;renderInvitationButton();return;}
    pet.x=pet.targetX;
    visit.stage='bring';
    const destination=pet.x<160?146:174;
    const duration=Math.max(1800,Math.abs(destination-pet.x)/38*1000+700);
    visit.until=now+duration+500;
    startAction('walk',duration,'happy',destination);
    pet.nextDecision=now+duration+700;
    $('roomCaption').textContent=`${pet.name}は毛糸玉を運んで、こちらに来ようとしています。`;
  }else if(visit.stage==='bring' && arrived()){
    pet.x=pet.targetX;
    const ball=findRoomItem('ball');
    if(ball){
      const moved=moveLooseObject(ball,clamp(pet.x+(pet.x<160?18:-18),36,284)-ball.x);
      if(moved.from!==moved.to){
        pet.roomTraces.yarnPaths.push(moved);
        pet.roomTraces.yarnPaths=pet.roomTraces.yarnPaths.slice(-3);
        noteRoomTrace('毛糸玉がこちらの近くに運ばれていました。');
      }
    }
    visit.stage='offering';visit.until=now+23000;
    startAction('idle',23000,'happy',pet.x);
    pet.nextDecision=now+24000;
    $('roomCaption').textContent=`${pet.name}は毛糸玉を持ってきて、こちらをじっと見ています。遊びに誘っているのかもしれません。`;
    showThought('♪');
    recordMoment('play_invitation',`${pet.name}は毛糸玉を自分で運び、こちらを見つめました。`,
      '以前に一緒に遊んだことが、また遊ぼうとするきっかけになったのかもしれません。');
    renderInvitationButton();renderUI();save();
  }else if(visit.stage==='offering' && now>=visit.until){
    memoryInvitation=null;
    renderInvitationButton();
    pet.action='idle';pet.actionUntil=now;
    pet.nextDecision=now+1300;
    $('roomCaption').textContent=`${pet.name}は少し待ったあと、毛糸玉のそばでのんびりし始めました。`;
  }
}
function answerYarnInvitation(){
  if(!memoryInvitation || memoryInvitation.stage!=='offering' || !canInteract()) return false;
  memoryInvitation=null;
  pet.bondMemory.invitationAccepted=Math.min(9999,pet.bondMemory.invitationAccepted+1);
  awardBondPoints('invitation',12);
  rememberSharedExperience('sharedYarn');
  pet.playCount=(pet.playCount||0)+1;
  pet.tired=clamp(pet.tired+5);
  adjustEmotion({safety:3,connection:4,interest:-7,wariness:-2});
  recordMoment('invitation_answer',`${pet.name}が持ってきた毛糸玉で、一緒に遊びました。`,
    'この日はペットの方から誘いに来て、こちらが応えました。');
  performReaction({action:'play',kind:'hop',duration:4700,mood:'happy',gesture:'一緒にぽんぽん弾んでいる',
    caption:`${pet.name}は嬉しそうに毛糸玉を転がし、一緒に遊びました。`,thought:'♪',log:`${pet.name}の遊びの誘いに応えました。`});
  renderInvitationButton();save();
  return true;
}
function chooseAutonomousAction(now) {
  if(walkSession||gestureState||gestureSequence)return;
  if (now < pet.actionUntil || now < pet.nextDecision) return;
  // 目的地へ移動している途中は、他の行動を選んで中断しない。
  if (memoryInvitation || socialVisit || roomSpecialVisit || pettingBeg || (objectVisit && objectVisit.stage==='approach') || (placeVisit && placeVisit.stage==='approach')) return;
  // 同じ種族でも朝型・昼型・夜型があり、活動・休息の選びやすさに少し差がある。
  const hour=new Date(now).getHours();
  const activeHours=pet.lifeRhythm==='朝型' ? hour>=5&&hour<13 :
    pet.lifeRhythm==='夜型' ? hour>=19||hour<5 : hour>=9&&hour<20;
  if (pet.tired > (activeHours?82:72)) {
    if(pet.quirk==='寝る前にくるくる回る' && maybeBeginSecretHabit(now))return;
    if(!beginRestAtFavorite(now)) {
      startAction('sleep', 14000, 'calm');
      $('roomCaption').textContent = `${pet.name}は体を丸めて、ゆっくり目を閉じました。`;
    }
    return;
  }
  if (pet.hunger > 83) {
    startAction('sniff', 3600, 'curious');
    $('roomCaption').textContent = `${pet.name}は食べ物のありそうな場所を探しています。`;
    return;
  }
  // 季節と部屋の違いを見つける、自発的な特別行動。
  const world=weatherForTime(now);
  const weatherTaste=pet.worldMemory.weatherTastes[world.weather];
  const roomTaste=pet.worldMemory.roomTastes[pet.roomTheme];
  const specialChance=clamp(0.27+(weatherTaste+roomTaste)*0.007-(world.weather==='rain'&&pet.caution>70?0.08:0),0.07,0.49);
  if(Math.random()<specialChance && beginRoomSpecial(now)) return;
  // 一緒に遊んだ思い出があると、自分から毛糸玉を持ってくることがある。
  if(maybeBeginYarnInvitation(now)) return;
  // 自発的なおめかしと、個体に固有の珍しい行動。連続発生させない。
  if(maybeChooseOwnHeadwear(now))return;
  if(maybeBeginSecretHabit(now))return;
  // 自分の意思で人のほうへ来ることも。呼び声への反応とは区別します。
  if(beginAutonomousSocialVisit(now)) return;
  // v17: 生活のすき間で新しい仕草や連続行動を選ぶ。
  if(maybeChooseLittleGesture(now))return;
  // 家具だけでなく、窓辺・部屋の隅も日常の居場所として自分で選びます。
  // 好みが定着すると、同じ場所へ戻る傾向が少しずつ強まります。
  if(Math.random()<(activeHours?0.25:0.37) && startAutonomousFreePlace(now)) return;
  if (pet.roomItems.length && Math.random() < (activeHours?0.66:0.46) && startAutonomousItemAction(now)) return;
  const e = pet.emotions;
  const trend=tendencyScores(),shift=momentaryDisposition(now);
  const selected = weightedChoice([
    {id:'walk', weight: 18 + pet.activity * 0.27 + e.interest * 0.12 + trend.mischievous*.11+shift*9},
    {id:'look', weight: 8 + pet.curiosity * 0.23 + e.interest * 0.2 + trend.cautiousExplorer*.13},
    {id:'idle', weight: 18 + (100-pet.activity)*0.15 + e.safety*0.06 + trend.relaxed*.18-shift*8},
    {id:'collect', weight: 8 + pet.attachment * 0.17 + e.interest*0.08 + trend.collector*.23 + trend.tidy*.08},
    {id:'sniff', weight: 4 + pet.hunger*0.12}
  ]);
  if (selected === 'walk') {
    const target = clamp(pet.x + (Math.random() < 0.5 ? -1 : 1) * (36 + Math.random()*44), 45, 275);
    observeActivityPreference('active',now);
    startAction('walk', 2600 + Math.random()*1900, 'curious', target);
    $('roomCaption').textContent = `${pet.name}は部屋の中をてくてく歩いています。`;
  } else if (selected === 'look') {
    observeActivityPreference('quiet',now);
    startAction('look', (2600 + Math.random()*1200)*(0.83+pet.temperament.patience/230), 'curious');
    $('roomCaption').textContent = `${pet.name}は立ち止まり、何かをじっと見つめています。`;
    if (pet.curiosity > 60) discover('curiosity', `${pet.name}は気になるものを見つけると、じっと観察するようです。`);
  } else if (selected === 'collect') {
    observeActivityPreference('active',now);
    startAction('collect', 3300, 'happy');
    $('roomCaption').textContent = `${pet.name}は床の小さなものをつついています。`;
    discover('collector', `${pet.name}には小さなものを集める習性があるようです。`);
    if(trend.collector>=49)observePersonality('collector',`${pet.name}は床の小さなものに気づき、自分から集めようとしました。`,now);
  } else if (selected === 'sniff') {
    startAction('sniff', 2700, 'curious');
    $('roomCaption').textContent = `${pet.name}は何かの匂いを確かめているみたい。`;
  } else {
    observeActivityPreference('quiet',now);
    startAction('idle', (2800 + Math.random()*1700)*(0.8+pet.temperament.patience/180), 'calm');
    $('roomCaption').textContent = `${pet.name}はその場で、ぼんやりしています。`;
    if(trend.relaxed>=52)observePersonality('relaxed',`${pet.name}は慌てずに、のんびりと過ごしていました。`,now);
  }
}
function tick(timestamp) {
  if (!lastFrame) lastFrame = timestamp;
  const dt = Math.min((timestamp - lastFrame) / 1000, 0.1);
  lastFrame = timestamp;
  const now = Date.now();
  if(document.hidden) { wearSession.since=Date.now();wearSession.lastLearn=Date.now();requestAnimationFrame(tick);return;}
  if(onboardingActive){drawIntroScene(timestamp);requestAnimationFrame(tick);return;}
  // 実時間の進行（画面を閉じている間の変化は起動時に別途計算）
  if (pet.action === 'sleep') pet.tired = clamp(pet.tired - dt * 1.5);
  else pet.tired = clamp(pet.tired + dt * (0.025 + pet.activity * 0.0004));
  pet.hunger = clamp(pet.hunger + dt * 0.017);
  const e = pet.emotions;
  e.interest = clamp(e.interest + dt * (pet.curiosity * 0.0009 - 0.017));
  e.wariness = clamp(e.wariness - dt * (e.safety > 55 ? 0.032 : 0.014));
  e.connection = clamp(e.connection + dt * 0.006);
  if(walkSession){
    updateWalkSession(now,dt,timestamp);
    if(now>=nextSaveAt){save();nextSaveAt=now+15000;}
    requestAnimationFrame(tick);
    return;
  }


  if (reaction && now >= reaction.until) reaction = null;
  updatePettingBeg(now);
  if (now >= pet.actionUntil && pet.action !== 'idle' && !secretVisit &&
      !gestureState && !(objectVisit && objectVisit.stage==='approach') && !(placeVisit && placeVisit.stage==='approach') && !(socialVisit && socialVisit.stage==='approach') && !(roomSpecialVisit && roomSpecialVisit.stage==='approach')) {
    pet.action = 'idle';
    pet.mood = 'calm';
    pet.targetX = pet.x;
  }
  if (now >= pet.nextDecision && now >= pet.actionUntil) {
    chooseAutonomousAction(now);
    pet.nextDecision = now + 1700 + Math.random()*1300;
    renderUI();
  }
  moveTowardTarget(dt);
  updateLittleGestures(now);
  updateObjectVisit(now);
  updateFreePlaceVisit(now);
  updateAutonomousSocialVisit(now);
  updateMemoryInvitation(now);
  updateRoomSpecial(now);
  updateSecretHabit(now);
  maybeLearnFromWearing(now);
  drawPet(timestamp);
  if (now >= nextSaveAt) { renderWeather(); save(); nextSaveAt = now + 15000; }
  requestAnimationFrame(tick);
}
function canInteract() { return Date.now() >= interactionUntil; }
function recordReaction(kind) {
  pet.reactionStats[kind] = (pet.reactionStats[kind] || 0) + 1;
}
function observe() {
  const e = pet.emotions;
  let description;
  if(gestureState&&LITTLE_GESTURES[gestureState.id])description=`${pet.name}は${LITTLE_GESTURES[gestureState.id].caption}`;
  else if (pet.action === 'sleep') description = `${pet.name}は静かに眠っています。体がゆっくり上下しています。`;
  else if (reaction && Date.now() < reaction.until) description = `${pet.name}は${reaction.gesture}。`;
  else if (roomSpecialVisit && roomSpecialVisit.stage==='approach') description = `${pet.name}はこのおへやならではの場所へ向かっています。`;
  else if (roomSpecialVisit && roomSpecialVisit.stage==='staying') description = `${pet.name}は${roomSpecialVisit.spot.label}ことに夢中です。`;
  else if (socialVisit && socialVisit.stage==='approach') description = `${pet.name}は自分からこちらへ歩いてきています。`;
  else if (placeVisit && placeVisit.stage==='approach') description = `${pet.name}は${placeLabel(placeVisit.key)}へ、ゆっくり向かっています。`;
  else if (placeVisit && placeVisit.stage==='staying') description = `${pet.name}は${placeLabel(placeVisit.key)}で、しばらく落ち着いて過ごしています。`;
  else if (objectVisit && objectVisit.stage==='approach') description = `${pet.name}は${ROOM_ITEM_TYPES[objectVisit.id].label}のそばへ、ゆっくり向かっています。`;
  else if (objectVisit && objectVisit.stage==='interact') description = `${pet.name}は${ROOM_ITEM_TYPES[objectVisit.id].label}に夢中になっています。`;
  else if (pet.action === 'collect') description = `${pet.name}は拾ったものをじっと確かめています。`;
  else if (pet.action === 'walk') description = `${pet.name}は少しずつ場所を変えながら歩いています。`;
  else if (e.wariness > 65) description = `${pet.name}は少し体を縮め、辺りをうかがっています。`;
  else if (e.interest > 65) description = `${pet.name}は何かを探すように、辺りを見回しています。`;
  else description = `${pet.name}は自分のペースで過ごしています。`;
  $('roomCaption').textContent = description;
  $('moodSignal').textContent = visibleMood();
  showThought(pet.action === 'sleep' ? 'すぅ…' : '…');
  awardBondPoints('observe',2);
  // 観察はペットの行動を邪魔しないし、毎回ログを増やさない。
}
function callPet() {
  if (!canInteract()) return;
  if (pet.action === 'sleep') {
    performReaction({action:'sleep',kind:'sway',duration:2500,mood:'calm',gesture:'まぶたを少し動かしている',caption:`${pet.name}は寝返りを打ち、また眠っています。`,thought:'すぅ…'});
    return;
  }
  const e = pet.emotions;
  const hesitation = pet.caution*0.43 + e.wariness*0.68 - e.safety*0.35 - Math.min(16,memoryCount('answeredCall')*3);
  const approaching = e.connection*0.65 + pet.sociability*0.34 + e.safety*0.22 + Math.min(16,memoryCount('answeredCall')*3);
  if (hesitation > 48 && Math.random() < 0.7) {
    adjustEmotion({wariness: 3, interest: 2});
    recordReaction('recoil');
    performReaction({action:'walk',kind:'recoil',duration:3100,mood:'wary',destination:pet.x + (pet.x < 160 ? -26 : 26),gesture:'体を縮めて、一歩だけ下がっている',caption:`${pet.name}はこちらを見たあと、一歩だけ離れました。`,thought:'…？',log:`${pet.name}は声に気づき、少し距離をとりました。`});
  } else if (approaching > 70 && Math.random() < 0.72) {
    adjustEmotion({connection:2,safety:2,wariness:-3});
    recordReaction('call');
    rememberSharedExperience('answeredCall');
    awardBondPoints('call',5);
    recordMoment('call_response',`${pet.name}は名前を聞いて、こちらへ少し寄ってきました。`,
      '呼びかけに応じて近づいた場面です。自分から訪ねてくる行動とは区別して記録しています。',
      {title:pet.momentJournal.prior.call?'呼び声に応えた記録':'初めて呼び声に応えた日'});
    performReaction({action:'walk',kind:'lean',duration:3900,mood:'happy',destination:pet.x + (pet.x < 160 ? 31 : -31),gesture:'こちらへ少し近づき、体を傾けている',caption:`${pet.name}は声を聞くと、こちらへ寄ってきました。`,thought:'♪',log:`${pet.name}は呼び声を聞いて、自分から近づいてきました。`});
  } else {
    adjustEmotion({interest:4,connection:1,wariness:-1});
    recordReaction('call');
    rememberSharedExperience('answeredCall');
    awardBondPoints('call',5);
    recordMoment('call_response',`${pet.name}は名前を聞いて、こちらをじっと見つめました。`,
      'こちらから声をかけたときに見られた反応です。',
      {title:pet.momentJournal.prior.call?'呼び声に応えた記録':'初めて呼び声に応えた日'});
    performReaction({action:'look',kind:'tilt',duration:2800,mood:'curious',gesture:'首をかしげるように体を傾けている',caption:`${pet.name}は呼び声に気づき、こちらをじっと見ています。`,thought:'？',log:`${pet.name}は呼び声に気づいて、こちらを見ました。`});
  }
  if (pet.reactionStats.call >= 3) discover('responds-to-name', `${pet.name}は名前を呼ばれると、こちらを気にすることが多いようです。`);
}
function offerFood() {
  if (!canInteract()) return;
  if (pet.action === 'sleep') {
    performReaction({action:'sleep',kind:'sway',duration:2200,mood:'calm',gesture:'目を閉じたまま、少し身じろぎしている',caption:`${pet.name}はまだ眠っています。食べ物はそっと置いておきました。`,thought:'すぅ…'});
    return;
  }
  const e = pet.emotions;
  const wantsFood = pet.hunger > 58 || (pet.hunger > 28 && e.safety > 66 && Math.random() < 0.56);
  if (wantsFood && e.wariness < 80) {
    pet.hunger = clamp(pet.hunger - 36);
    pet.foodCount = (pet.foodCount || 0) + 1;
    awardBondPoints('food',7);
    adjustEmotion({safety:2,wariness:-2,interest:-3});
    performReaction({action:'eat',kind:'sway',duration:4700,mood:'happy',gesture:'食べ物に体を寄せ、小さく揺れている',caption:`${pet.name}は食べ物をそっとつついてから、食べ始めました。`,thought:'もぐ…',log:`${pet.name}は置いた食べ物を食べました。`});
    recordMoment('food_first',`${pet.name}は置いた食べ物を、そっとつついてから食べました。`,
      pet.momentJournal.prior.food?'以前の食事は日時が残っていません。これは更新後に見られた食事です。':'最初に食べ物を受け取った場面を記録しました。',
      {title:pet.momentJournal.prior.food?'食べ物を受け取った記録':'初めて食べ物を受け取った日'});
    if (pet.foodCount >= 2) discover('food', `${pet.name}は食べ物を置くと、自分のタイミングで食べるようです。`);
  } else if (e.wariness > 64) {
    adjustEmotion({interest:2,wariness:-1});
    performReaction({action:'sniff',kind:'shrink',duration:3100,mood:'wary',gesture:'少し離れたまま、匂いを確かめている',caption:`${pet.name}は近づかず、しばらく食べ物を見ています。`,thought:'…？',log:`${pet.name}は食べ物から少し距離をとっています。`});
  } else {
    adjustEmotion({interest:2});
    performReaction({action:'sniff',kind:'tilt',duration:3000,mood:'curious',gesture:'体を傾け、匂いだけ確かめている',caption:`${pet.name}は匂いを確かめて、また歩き始めました。`,thought:'くん…',log:`${pet.name}は今は食べずに、匂いだけ確かめました。`});
  }
}
function invitePlay() {
  if(answerYarnInvitation()) return;
  if (!canInteract()) return;
  revealHiddenYarn();
  const e = pet.emotions;
  if (pet.action === 'sleep' || pet.tired > 75) {
    performReaction({action:pet.action === 'sleep'?'sleep':'idle',kind:'sway',duration:3200,mood:'calm',gesture:'一度だけまぶたを動かし、じっとしている',caption:`${pet.name}は遊び道具を見たものの、動きませんでした。`,thought:'むにゃ…',log:`${pet.name}は今は遊ばずに、休んでいます。`});
    return;
  }
  if (e.wariness > 62 && pet.caution > 54 && Math.random()<0.67) {
    adjustEmotion({interest:3,wariness:2});
    performReaction({action:'look',kind:'shrink',duration:2900,mood:'wary',gesture:'少し体を縮め、おもちゃを遠くから見ている',caption:`${pet.name}は毛糸玉から少し離れた場所で様子を見ています。`,thought:'…？',log:`${pet.name}は遊び道具を離れたところから見ていました。`});
  } else if (e.interest > 52 && e.safety > 34 && Math.random() < 0.79) {
    adjustEmotion({interest:-13,safety:3,connection:3,wariness:-3});
    pet.tired = clamp(pet.tired + 7);
    pet.playCount = (pet.playCount || 0) + 1;
    rememberSharedExperience('sharedYarn');
    awardBondPoints('play',10);
    recordReaction('play');
    if(findRoomItem('ball')) addRoomTrace('ball',{behavior:'play'});
    rememberYarnPlay({spontaneous:false});
    performReaction({action:'play',kind:'hop',duration:5200,mood:'happy',gesture:'体をぽんぽん弾ませている',caption:`${pet.name}は毛糸玉の後ろを追いかけ、ぽんと跳ねました！`,thought:'♪',log:`${pet.name}は毛糸玉で遊び、何度も跳ねました。`});
    if (pet.playCount >= 2) discover('play', `${pet.name}は興味があるとき、毛糸玉を追いかけることがあるようです。`);
  } else if (e.connection > 63 && e.safety > 52) {
    adjustEmotion({connection:2,safety:1,interest:1});
    performReaction({action:'walk',kind:'lean',duration:3900,mood:'calm',destination:pet.x+(pet.x<160?22:-22),gesture:'おもちゃよりこちらに近づいてきている',caption:`${pet.name}は毛糸玉を素通りして、こちらに寄ってきました。`,thought:'…♪',log:`${pet.name}はおもちゃよりも、こちらの近くを選びました。`});
  } else {
    adjustEmotion({interest:5});
    performReaction({action:'look',kind:'tilt',duration:3000,mood:'curious',gesture:'毛糸玉を見つめ、そっと体を傾けている',caption:`${pet.name}は毛糸玉をしばらく見ています。今はまだ動きません。`,thought:'？',log:`${pet.name}は遊び道具が少し気になるようです。`});
  }
}
function approachPet() {
  if (!canInteract()) return;
  if (pet.action === 'sleep') {
    performReaction({action:'sleep',kind:'sway',duration:2600,mood:'calm',gesture:'ゆっくり呼吸している',caption:`${pet.name}はすやすや眠っています。そっと見守ることにしました。`,thought:'すぅ…'});
    return;
  }
  const e = pet.emotions;
  const unease = pet.caution*0.45 + e.wariness*0.6 - e.safety*0.42;
  if (unease > 42 && Math.random() < 0.8) {
    adjustEmotion({wariness:2,interest:1});
    recordReaction('recoil');
    performReaction({action:'walk',kind:'recoil',duration:3200,mood:'wary',destination:pet.x+(pet.x<160?-33:33),gesture:'体を縮め、ゆっくり後ずさっている',caption:`${pet.name}は少しだけ後ろに下がりました。`,thought:'…',log:`${pet.name}は近づく気配に気づき、少し離れました。`});
  } else if (e.safety > 62 && e.connection > 49) {
    adjustEmotion({safety:4,connection:2,wariness:-3});
    recordReaction('near');
    rememberSharedExperience('calmTogether');
    awardBondPoints('approach',7);
    recordMoment('welcome_close',`${pet.name}はこちらがそっと近づくと、逃げずに体を寄せてくれました。`,
      '近くにいることを心地よく感じてくれたのかもしれません。',
      {title:pet.momentJournal.prior.near?'そばで過ごした記録':'初めて体を寄せてくれた日'});
    performReaction({action:'idle',kind:'lean',duration:3500,mood:'happy',gesture:'身を寄せるように、体を傾けている',caption:`${pet.name}は逃げずに、そっと体を寄せてきました。`,thought:'…♪',log:`${pet.name}は安心したように、そばでじっとしています。`});
  } else {
    adjustEmotion({safety:3,wariness:-2,connection:1});
    recordReaction('near');
    awardBondPoints('approach',5);
    performReaction({action:'look',kind:'tilt',duration:2900,mood:'curious',gesture:'じっとこちらを見つめている',caption:`${pet.name}はその場にとどまり、こちらを見つめています。`,thought:'…？',log:`${pet.name}は近づいても、その場にいてくれました。`});
  }
  if (pet.reactionStats.near >= 3 && pet.emotions.safety > 58) {
    discover('nearby', `${pet.name}は人が近くにいることに、少しずつ慣れてきたようです。`);
  }
}


// v19: 12種類から最大6種類まで配置。収納しても家具への好み・思い出は削除しません。
function buildRoomItemTray(){
 const tray=$('itemTray');if(!tray)return;
 tray.replaceChildren();
 for(const [id,info] of Object.entries(ROOM_ITEM_TYPES)){
  const slot=document.createElement('div');slot.className='item-slot';
  const choice=document.createElement('button');choice.type='button';choice.className='item-choice';choice.dataset.placeItem=id;
  choice.setAttribute('aria-pressed','false');
  const img=document.createElement('img');img.alt='';img.loading='lazy';img.src=`assets/items/${info.sprite}`;
  const label=document.createElement('span');label.className='item-name';label.textContent=info.label;
  const sub=document.createElement('span');sub.className='item-sub';sub.textContent='配置する';
  choice.append(img,label,sub);
  const store=document.createElement('button');store.type='button';store.className='item-store';store.dataset.storeItem=id;
  store.textContent='しまう';store.setAttribute('aria-label',`${info.label}をしまう`);
  store.addEventListener('click',()=>storeRoomItem(id));
  slot.append(choice,store);tray.append(slot);
 }
}
function storeRoomItem(id){
 if(onboardingActive||!findRoomItem(id))return;
 const label=ROOM_ITEM_TYPES[id].label;
 pet.roomItems=pet.roomItems.filter(item=>item.id!==id);
 if(placingType===id)placingType=null;
 if(objectVisit?.id===id){objectVisit=null;pet.action='idle';pet.actionUntil=0;pet.targetX=pet.x;}
 if(memoryInvitation&&id==='ball'){memoryInvitation=null;renderInvitationButton();}
 if((id==='ball'||id==='cushion')&&pet.secretMemory.hiddenBall)revealHiddenYarn();
 pet.roomTraces.itemMarks[id]=0;
 // 意図せず消えた家具を休息先として指定しない。思い出の訪問履歴は保持する。
 if(placeVisit?.key===id)placeVisit=null;
 updateItemTray();renderPlaceUI();renderTraceUI();
 $('roomCaption').textContent=`${label}をしまいました。好きだったことや思い出は覚えています。`;
 addLog(`${label}をしまいました。`);save();
}

function updateItemTray() {
  document.querySelectorAll('[data-place-item]').forEach(btn=>{
    const id=btn.dataset.placeItem;
    const placed=pet.roomItems.some(item=>item.id===id);
    btn.classList.toggle('selected',placingType===id);
    btn.disabled=!placed && pet.roomItems.length>=ROOM_MAX_PLACED;
    btn.setAttribute('aria-label',`${ROOM_ITEM_TYPES[id].label}を${placed?'移動':'配置'}する`);
    const store=btn.parentElement.querySelector('[data-store-item]');if(store)store.hidden=!placed;
    btn.setAttribute('aria-pressed',String(placingType===id));
    const sub=btn.querySelector('.item-sub');
    if (sub) sub.textContent=placingType===id?'場所を選択中':placed?'移動できる':
      pet.roomItems.length>=ROOM_MAX_PLACED?'満員・入れ替えてね':'配置する';
  });
  canvas.classList.toggle('placement-active',!!placingType);
  const hint=$('placeHint');
  const amount=$('roomItemCount');if(amount)amount.textContent=`配置中 ${pet.roomItems.length}/${ROOM_MAX_PLACED}個`;
  hint.textContent=placingType ? `${ROOM_ITEM_TYPES[placingType].label}を置く場所を画面をタップすると、その横位置の床に置かれます。PCなら矢印キーとEnterでも配置できます。` : 'アイテムを選ぶと、床の左右の位置に置いたり、移動させたりできます。';
  $('cancelPlaceBtn').hidden=!placingType;
  const banner=$('placementBanner');
  if(banner) banner.hidden=!placingType;
  const bannerText=$('placementBannerText');
  if(bannerText&&placingType) bannerText.textContent=`${ROOM_ITEM_TYPES[placingType].label}を床の好きな位置に置いてください。`;
}
function selectPlaceItem(type) {
  if(!ROOM_ITEM_TYPES[type])return;
  if(!findRoomItem(type)&&pet.roomItems.length>=ROOM_MAX_PLACED){
    $('placeHint').textContent=`部屋には最大${ROOM_MAX_PLACED}個まで置けます。どれかを「しまう」で片づけてから置いてください。`;
    return;
  }
  placingType=placingType===type?null:type;
  previewX=(pet.roomItems.find(i=>i.id===type)||{}).x || 160;
  updateItemTray();
  if(placingType){openAppTab('home');}
}
function placeSelectedItem(x) {
  if (!placingType) return;
  const id=placingType;
  if(!findRoomItem(id)&&pet.roomItems.length>=ROOM_MAX_PLACED){placingType=null;updateItemTray();return;}
  if((id==='ball'||id==='cushion') && pet.secretMemory.hiddenBall) revealHiddenYarn();
  const pos=clamp(Math.round(x),36,284);
  const exists=pet.roomItems.find(i=>i.id===id);
  if (exists) exists.x=pos;
  else pet.roomItems.push({id,x:pos});
  // 手で毛糸玉を置き直した場合、古い軌跡は片づいたとみなす。
  if(id==='ball') pet.roomTraces.yarnPaths=[];
  if(id==='cushion') pet.roomTraces.cushionWrinkles=0;
  if(id==='plant') pet.roomTraces.leaves=[];
  if(memoryInvitation && id==='ball'){memoryInvitation=null;renderInvitationButton();}
  if (objectVisit && objectVisit.id===id) {
    objectVisit=null;pet.action='idle';pet.actionUntil=0;pet.targetX=pet.x;
  }
  placingType=null;
  updateItemTray();
  $('roomCaption').textContent=`${ROOM_ITEM_TYPES[id].label}を置きました。${pet.name}が興味を持つか、見守ってみましょう。`;
  // 置き直しても、その家具に結びついた好みと行動履歴は維持します。
  renderPlaceUI();
  showThought('…？');
  addLog(`${ROOM_ITEM_TYPES[id].label}を部屋に置きました。`);
  save();
}
function pointerToRoom(event){
  const rect=canvas.getBoundingClientRect();
  return {x:(event.clientX-rect.left)/rect.width*canvas.width,
    y:(event.clientY-rect.top)/rect.height*canvas.height};
}
function pointToX(event){return clamp(pointerToRoom(event).x,36,284);}
function pointerHitsPet(point){
  // 48x40ドットの拡大スプライトの体部分。帽子だけを触った場合は対象外。
  const dx=(point.x-pet.x)/43,dy=(point.y-132)/32;
  return dx*dx+dy*dy<=1.20;
}
canvas.addEventListener('pointerdown',event=>{
  if(placingType||onboardingActive||!event.isPrimary||!pointerHitsPet(pointerToRoom(event)))return;
  if(event.pointerType==='mouse'&&event.button!==0)return;
  const point=pointerToRoom(event);
  petPointer={id:event.pointerId,last:point,length:0};
  try{canvas.setPointerCapture(event.pointerId);}catch(_error){}
  event.preventDefault();
});
canvas.addEventListener('pointermove',event=>{
  if(placingType){previewX=pointToX(event);return;}
  if(!petPointer||event.pointerId!==petPointer.id)return;
  const next=pointerToRoom(event);
  petPointer.length+=Math.hypot(next.x-petPointer.last.x,next.y-petPointer.last.y);
  petPointer.last=next;
});
canvas.addEventListener('pointerup',event=>{
  if(!petPointer||petPointer.id!==event.pointerId)return;
  const stroke=petPointer.length>=12;
  petPointer=null;
  lastPetPointerAt=Date.now();
  strokePet(stroke?'stroke':'tap');
  event.preventDefault();
});
canvas.addEventListener('pointercancel',event=>{
  if(petPointer?.id===event.pointerId)petPointer=null;
});
canvas.addEventListener('click',event=>{
  if (placingType) { placeSelectedItem(pointToX(event));return; }
  if(Date.now()-lastPetPointerAt<650)return; // pointerupの直後のclickを重複処理しない
  const x=pointToX(event);
  const near=pet.roomItems.find(item=>Math.abs(item.x-x)<25);
  if (near) {
    const m=pet.objectMemory[near.id], label=ROOM_ITEM_TYPES[near.id].label;
    $('roomCaption').textContent=m.visits>0 ? `${label}には、これまでに${pet.name}が近づいた形跡があります。` : `${label}があります。${pet.name}はどんな反応をするでしょう？`;
  }
});
canvas.addEventListener('keydown',event=>{
  if(!placingType){
    if(event.key==='Enter'||event.key===' '){event.preventDefault();strokePet('tap');}
    return;
  }
  if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
    event.preventDefault();previewX=clamp(previewX+(event.key==='ArrowLeft'?-10:10),36,284);
  }else if(event.key==='Enter'||event.key===' '){event.preventDefault();placeSelectedItem(previewX);}
  else if(event.key==='Escape'){placingType=null;updateItemTray();}
});

// —— v16: 眺める散歩 + 気になるものへ誘う。屋内の位置と行動を破壊しない。——
const walkCanvas=$('walkCanvas'),walkCtx=walkCanvas.getContext('2d');
const walkBackground={};
for(const [id,info] of Object.entries(WALK_DESTINATIONS)){
 const image=new Image();image.src=`assets/walks/${info.image}`;
 image.onerror=()=>console.warn(`お散歩背景を読み込めません: ${info.image}`);walkBackground[id]=image;
}
const WALK_SOFT_COLORS={'shell':'#e7c0ac','glass':'#9ccdbd','acorn':'#ae8762','leaf':'#d9ae73','petal':'#e1a9b1','button':'#e1cba1'};
function drawWalkSouvenirsInRoom(){
 if(!pet.walkMemory?.souvenirs?.length)return;
 const displayed=pet.walkMemory.souvenirs.slice(-3);
 ctx.save();
 displayed.forEach((item,i)=>{
  const x=262+i*12, y=171+(i%2)*5;
  ctx.fillStyle='#978570';ctx.fillRect(x-1,y+7,10,2);
  ctx.fillStyle=WALK_SOFT_COLORS[item.id]||'#ead8a9';
  ctx.fillRect(x,y+1,8,6);ctx.fillRect(x+2,y-2,4,3);
  ctx.fillStyle='#fff4dd';ctx.fillRect(x+2,y+1,2,2);
 });
 ctx.restore();
}
function renderWalkCollection(){
 const el=$('walkCollection');if(!el)return;
 const gifts=pet.walkMemory?.souvenirs||[];
 el.textContent=gifts.length?`持ち帰った小さな宝物：${gifts.slice(-5).map(i=>i.name).join('、')}（ぜんぶで${gifts.length}個）`:
  'おみやげはまだありません。散歩の途中で、この子が拾ってくるかもしれません。';
}
function walkNarrate(text){if(walkSession){walkSession.message=text;$('walkNarration').textContent=text;}}
function renderWalkTargets(){
 const box=$('walkTargets');box.replaceChildren();
 if(!walkSession)return;
 const location=WALK_DESTINATIONS[walkSession.location];
 location.targets.forEach(t=>{
  const btn=document.createElement('button');btn.type='button';btn.dataset.walkTarget=t.id;
  const memory=pet.walkMemory.locations[walkSession.location].targetMemory?.[t.id];
  btn.textContent=`↗ ${t.label}へ誘う${memory?.favoriteNoted?' ♡':''}`;
  btn.disabled=walkSession.stage==='approach'||walkSession.stage==='explore';
  btn.addEventListener('click',()=>inviteWalkTarget(t.id));box.appendChild(btn);
 });
 renderWalkImpressions();
}
function openWalk(locationId){
 cancelLittleGestures();
 if(onboardingActive||placingType||!WALK_DESTINATIONS[locationId])return;
 if(walkSession)endWalk(false);
 pet.walkMemory=normalizeWalkMemory(pet.walkMemory);
 const place=WALK_DESTINATIONS[locationId],memory=pet.walkMemory.locations[locationId];
 memory.visits++;pet.walkMemory.totalWalks++;
 walkSession={location:locationId,x:160,targetX:160,face:1,action:'idle',stage:'idle',target:null,
  invited:false,nextDecision:Date.now()+2400,stageUntil:0,lastReact:0,lastInput:0,souvenir:null,
  petReaction:null,gesture:null,nearPlayer:false,message:'',lastExplore:0,exploreBehavior:null,exploreStart:0};
 $('walkScene').style.backgroundImage=`url("assets/walks/${place.image}")`;
 $('walkTitle').textContent=place.label;
 const weather=weatherForTime();
 $('walkWeather').textContent=`${SEASONS[weather.season].name}・${WEATHER_NAMES[weather.weather]}のお散歩`;
 $('walkSession').hidden=false;$('walkLauncher').hidden=true;
 $('page-home').classList.add('walk-active');
 walkNarrate(`${place.label}にやってきました。${pet.name}は初めての景色を、ゆっくり見回しています。`);
 renderWalkTargets();
 recordMoment(`walk_${locationId}`,`${pet.name}と${place.label}へ出かけました。辺りを見回し、少しずつ歩き始めました。`,
  'この日、本当に訪れた場所を記録しました。');
 if(memory.visits>=3)walkNarrate(`${pet.name}は${place.label}の景色を覚えているのか、少し落ち着いた様子で歩き始めました。`);
 renderWalkCollection();openAppTab('home');save();
}
function endWalk(announce=true){
 if(!walkSession)return;
 walkSession.gesture=null;
 const place=WALK_DESTINATIONS[walkSession.location].label;
 const gift=walkSession.souvenir?.name;
 walkSession=null;
 $('walkSession').hidden=true;$('walkLauncher').hidden=false;$('page-home').classList.remove('walk-active');
 if(announce){
  const message=gift?`${place}から帰ってきました。${pet.name}が持ち帰った${gift}は、おへやの宝物になりました。`:
   `${place}から帰ってきました。${pet.name}はおへやでいつもどおり過ごしています。`;
  $('roomCaption').textContent=message;addLog(message);
 }
 pet.action='idle';pet.targetX=pet.x;pet.actionUntil=0;pet.nextDecision=Date.now()+1700;
 renderWalkCollection();renderUI();save();
}
function walkBias(target){
 const wm=pet.walkMemory.locations[walkSession.location];
 const seen=wm.explored[target.id]||0;
 const thisTarget=wm.targetMemory?.[target.id];
 const fave=(target.tags||[]).includes(pet.favorite)?20:0;
  return 8+pet.curiosity*.33+Math.min(15,seen*2)+fave+wm.affinity*.30+(thisTarget?.affinity||0)*.55+Math.min(8,(thisTarget?.familiarity||0)*.6)-pet.caution*.08 + tendencyScores().cautiousExplorer*.08 + momentaryDisposition()*7;
}
function inviteWalkTarget(id){
 if(walkSession?.gesture){walkSession.gesture=null;walkSession.stage='idle';}
 if(!walkSession||!WALK_DESTINATIONS[walkSession.location].targets.some(t=>t.id===id))return;
 const w=walkSession,target=WALK_DESTINATIONS[w.location].targets.find(t=>t.id===id),now=Date.now();
 if(w.stage==='approach'||w.stage==='explore')return;
 if(now-w.lastInput<1100)return;w.lastInput=now;
 const memory=pet.walkMemory.locations[w.location];
 const targetMemory=memory.targetMemory[target.id];
 const mood=walkBias(target)+memory.familiarity*.20+pet.emotions.safety*.12-pet.tired*.25-pet.emotions.wariness*.17+(targetMemory?.affinity||0)*.30;
 const chance=clamp(.26+mood/140 + momentaryDisposition(now)*.09 - Math.max(0,tendencyScores().cautiousExplorer-55)*.0012,.16,.9);
 if(Math.random()<chance){
  beginWalkApproach(target,true);
  walkNarrate(`${pet.name}は一度こちらを見てから、${target.label}の方へ歩き始めました。`);
 }else{
  w.action=pet.tired>62?'sleep':'look';w.stage='idle';w.nextDecision=now+3400;
  w.petReaction={kind:pet.emotions.wariness>63?'shrink':'tilt',until:now+2200};
  walkNarrate(pet.tired>62?`${pet.name}は${target.label}を見ましたが、眠そうに目を閉じました。`:
   pet.caution>pet.curiosity?`${pet.name}は${target.label}を離れたところから眺めています。今は近づきたくないようです。`:
   `${pet.name}は${target.label}をちらりと見ましたが、別のことが気になるようです。`);
 }
 renderWalkTargets();
}
function beginWalkApproach(target,invited=false){
 const w=walkSession; if(!w)return;
 w.target=target;w.invited=invited;w.stage='approach';w.action='walk';w.exploreBehavior=null;w.targetX=clamp(target.x,45,275);
 w.nextDecision=Date.now()+18000;
 w.nearPlayer=false;
 renderWalkTargets();
}
function finishWalkExploration(now){
 const w=walkSession,target=w?.target;if(!w||!target)return;
 const memory=pet.walkMemory.locations[w.location],before=memory.explored[target.id]||0;
 const behavior=w.exploreBehavior||selectWalkBehavior(w,target,now),targetMemory=memory.targetMemory[target.id];
 memory.explored[target.id]=Math.min(9999,before+1);
 targetMemory.familiarity=clamp(targetMemory.familiarity+1,0,9999);
 targetMemory.behaviorCounts[behavior.id]=clamp((targetMemory.behaviorCounts[behavior.id]||0)+1,0,9999);
 targetMemory.lastBehavior=behavior.id;targetMemory.lastAt=now;
 if(behavior.valence<0)targetMemory.wary++;
 else if(behavior.valence>0)targetMemory.good++;
 const happy=(target.tags||[]).includes(pet.favorite);
 targetMemory.affinity=clamp(targetMemory.affinity+behavior.valence*.8+(happy?.65:0),-35,35);
 // 良い・苦手のどちらの記憶も、場所全体の好みとは独立。
 if(targetMemory.familiarity>=4&&targetMemory.good>=2&&targetMemory.affinity>=10&&!targetMemory.favoriteNoted){
  targetMemory.favoriteNoted=true;
  recordMoment(`walk_v20_${w.location}_${target.id}_favorite`,
   `${pet.name}は${target.label}に何度も近づき、今日もまた足を止めました。`,
   '繰り返し訪れたことと、そこで見せた反応から、気に入っているのかもしれません。',
   {title:`${target.label}が気になるみたい`});
 }
 if(targetMemory.familiarity>=4&&targetMemory.wary>=2&&targetMemory.affinity<=-9&&!targetMemory.cautiousNoted){
  targetMemory.cautiousNoted=true;
  recordMoment(`walk_v20_${w.location}_${target.id}_cautious`,
   `${pet.name}は${target.label}に興味を持ちながら、今日も慎重に距離を取っています。`,
   '苦手と決まったわけではありません。慣れることで反応が変わることもあります。',
   {title:`${target.label}は少しどきどきする？`});
 }
 memory.familiarity=clamp(memory.familiarity+2.0,0,100);
 const match=(target.tags||[]).includes(pet.favorite);
 memory.affinity=clamp(memory.affinity+(match?1.35:.25)-(pet.emotions.wariness>78?.8:0),-35,35);
 if(!w.invited&&tendencyScores().cautiousExplorer>=52&&pet.caution>=55)
   observePersonality('cautiousExplorer',`${pet.name}はお散歩先で少しずつ${target.label}へ近づき、確かめました。`,now);
 if(!w.invited&&target.souvenir&&tendencyScores().collector>=48)
   observePersonality('collector',`${pet.name}は${target.label}を自分から見つけて、じっと調べました。`,now);
 const place=WALK_DESTINATIONS[w.location].label;
 if(before===0){
  const recorded=recordMoment(`walk_${w.location}_${target.id}`,`${pet.name}は${place}で${target.label}を見つけました。${behavior.caption}`, 
   w.invited?'一緒に見てみようと誘った先で起きた出来事です。':'誰にも誘われず、自分で近づいた出来事です。',
   {title:`${place}で${target.label}を見つけた日`});
  if(recorded)awardBondPoints(`walk_first_${w.location}_${target.id}`,5);
 }
 if(behavior.motive==='cautious'&&behavior.valence<0){
  pet.emotions.wariness=clamp(pet.emotions.wariness+5);
  w.nearPlayer=true;w.petReaction={kind:'shrink',until:now+2300};
  walkNarrate(`${pet.name}は${target.label}を前に少し驚きました。そっとこちらをうかがっています。なでてあげられます。`);
 }else{
  walkNarrate(`${pet.name}は${target.label}のそばで、${behavior.caption}`);
 }
 // 持ち帰るかどうかは、この子の気質と気分。1回につき1個だけ。
 if(!w.souvenir&&target.souvenir && Math.random()<clamp(.20+(match?.22:0)+(pet.attachment-50)/260+targetMemory.affinity/180+(behavior.motive==='collector'?.13:0),.09,.68)){
  const gift={id:target.itemId,name:target.souvenir,location:w.location,at:now};
  w.souvenir=gift;pet.walkMemory.souvenirs.push(gift);
  pet.walkMemory.souvenirs=pet.walkMemory.souvenirs.slice(-30);
  walkNarrate(`${pet.name}は${target.souvenir}を見つけ、そっと持ち上げました。おうちに持って帰るつもりみたい！`);
  recordMoment(`walk_${w.location}_souvenir`,`${pet.name}は${place}で${target.souvenir}を拾い、おみやげにしました。`,
   'この散歩で拾ったものです。おうちに小さな宝物として残ります。',
   {title:`${place}から初めてのおみやげ`});
  renderWalkCollection();
 }
 if(behavior.notable){
  recordMoment(`walk_v20_${w.location}_${target.id}_${behavior.id}`,
   `${pet.name}は${place}で${behavior.caption}`,
   w.invited?'一緒に見に行こうと誘ったときの出来事です。':'自分から気になるものを調べていたときの出来事です。',
   {title:`${target.label}で見せた、初めてのしぐさ`});
 }
 if(!memory.favoriteNoted&&memory.visits>=3&&memory.familiarity>=13&&memory.affinity>=8){
  memory.favoriteNoted=true;
  recordMoment(`walk_${w.location}_favorite`,`${pet.name}は何度も${place}へ出かけ、慣れ親しんだ様子で歩くようになりました。`,
   '訪問の回数だけでなく、その場所で過ごした経験から記録しています。',
   {title:`${place}がなじみの場所になった日`});
 }
 if(w.invited)awardBondPoints('walk_invite',3);
 w.target=null;w.exploreBehavior=null;w.invited=false;w.stage='idle';w.action='idle';w.nextDecision=now+3500+Math.random()*3000;
 renderWalkTargets();save();
}
function strokeWalkPet(mode='tap'){
 if(walkSession?.gesture){walkSession.gesture=null;walkSession.stage='idle';}
 const w=walkSession;if(!w)return;
 const now=Date.now();if(now-w.lastReact<1100)return;
 w.exploreBehavior=null;w.target=null;
 w.lastReact=now;
 const m=pet.pettingMemory,e=pet.emotions;
 m.attempts++;m.lastPetAt=now;
 const acceptance=pettingPreference()+e.safety*.13+(w.nearPlayer?20:0)-e.wariness*.18;
 const decline=(pet.caution>70&&e.wariness>68&&Math.random()<.58)||(acceptance<8&&Math.random()<.56);
 if(decline){
  m.declined++;m.familiarity=clamp(m.familiarity+.6);
  w.petReaction={kind:'shrink',until:now+2700};w.targetX=clamp(w.x+((w.x<160)?-12:12),45,275);
  w.action='walk';w.stage='idle';w.nextDecision=now+3500;
  walkNarrate(`${pet.name}は体を少し縮め、そっと離れました。今は景色を見る方が好きなようです。`);
 }else{
  m.accepted++;m.familiarity=clamp(m.familiarity+(mode==='stroke'?3:2));
  m.affinity=clamp(m.affinity+1,-30,35);if(mode==='stroke')m.strokes++;
  adjustEmotion({safety:3,connection:2,wariness:-2});rememberSharedExperience('calmTogether');
  awardBondPoints('petting',6);w.petReaction={kind:'cuddle',until:now+3000};
  w.nearPlayer=true;w.action='idle';w.stage='idle';w.nextDecision=now+3200;
  walkNarrate(`${pet.name}はお散歩の途中でも、なでられるとふわっと体を伸ばしました。`);
  recordMoment('walk_petting',`${pet.name}をお散歩中にそっとなでました。体をふわっと伸ばして応えてくれました。`,
   '外の景色を眺めながら一緒に過ごしたときのふれあいです。');
  if(m.accepted===1)recordMoment('first_petting',`${pet.name}を初めてなでたのは、お散歩の途中でした。`,
   '初めて実際になでられた日の記録です。');
 }
 renderPettingHint();save();
}
function decideWalkAutonomy(now){
 const w=walkSession;if(!w)return;
 // 探索ばかり続かず、眺めたり小さく動いたりする時間を作ります。
 if(Math.random()<.27){const id=selectLittleGesture(now,'walk');if(beginLittleGesture(id,now,'walk'))return;}
 const memory=pet.walkMemory.locations[w.location];
 const waveRisk=w.location==='sea'&&pet.caution>75;
 const quiet=clamp(.36+pet.tired*.0025+pet.caution*.001-(pet.activity-50)*.001+tendencyScores().relaxed*.0008-momentaryDisposition(now)*.075,.22,.67);
 if(Math.random()<quiet){
  if(Math.random()<.44){w.action='walk';w.stage='wander';w.targetX=clamp(w.x+(Math.random()-.5)*125,45,275);
    walkNarrate(`${pet.name}は${WALK_DESTINATIONS[w.location].label}を、ゆっくり歩いています。`);}
  else{w.action=pet.tired>64?'sleep':'idle';w.stage='idle';
    walkNarrate(pet.tired>64?`${pet.name}は少し疲れたのか、しばらくじっとしています。`:
      `${pet.name}は立ち止まって、景色をぼんやり眺めています。`);}
  w.nextDecision=now+6500+Math.random()*4000;return;
 }
 if(Math.random()<clamp((.09+pet.sociability*.002+eSafety()/450-(waveRisk?.04:0))*personalityFactor('affectionate',.7,1.5),.07,.38)){
  w.action='walk';w.stage='come';w.targetX=174;w.nextDecision=now+6500;
  walkNarrate(`${pet.name}は景色から目を離して、こちらに近づいてきました。`);return;
 }
 const targets=WALK_DESTINATIONS[w.location].targets;
 const targetId=weightedChoice(targets.map(t=>({id:t.id,weight:Math.max(3,walkBias(t)+(memory.explored[t.id]||0)*1.2)})));
 const target=targets.find(t=>t.id===targetId);
 beginWalkApproach(target,false);
 walkNarrate(`${pet.name}は${target.label}が気になったようで、自分から近づいていきました。`);
}
function eSafety(){return pet.emotions.safety||0;}
function updateWalkSession(now,dt,time){
 const w=walkSession;if(!w)return;
 if(w.gesture && now>=w.gesture.until){
   w.gesture=null;w.stage='idle';w.action='idle';w.nextDecision=now+1500+Math.random()*1800;
 }

 if(w.petReaction?.until<now)w.petReaction=null;
 if(w.stage==='approach'||w.stage==='wander'||w.stage==='come'||(w.action==='walk'&&Math.abs(w.targetX-w.x)>2)){
  const dx=w.targetX-w.x;
  if(Math.abs(dx)>0.5){w.x+=Math.sign(dx)*Math.min(Math.abs(dx),dt*35);w.face=dx>0?1:-1;}
  if(Math.abs(w.targetX-w.x)<3){
   w.x=w.targetX;
   if(w.stage==='approach'){
    w.stage='explore';w.exploreStart=now;
    w.exploreBehavior=selectWalkBehavior(w,w.target,now);
    w.action=w.exploreBehavior.sprite;
    w.stageUntil=now+w.exploreBehavior.duration;
    walkNarrate(`${pet.name}は${w.target.label}のそばに来ました。${w.exploreBehavior.caption}`);
   }else if(w.stage==='come'){
    w.stage='idle';w.action='idle';w.nearPlayer=true;w.nextDecision=now+6500;
    walkNarrate(`${pet.name}は自分からこちらへやってきて、そばで落ち着いています。なでてあげられます。`);
    recordMoment('walk_comfort',`${pet.name}がお散歩中に自分からこちらへ近づいてきました。`,
     'プレイヤーからの誘いではなく、自分の意思で近寄ってきた出来事です。');
   }else if(w.stage==='wander'){w.stage='idle';w.action='idle';}
  }
 }
 if(w.stage==='explore'&&now>=w.stageUntil)finishWalkExploration(now);
 if((w.stage==='idle'||w.stage==='wander')&&now>=w.nextDecision)decideWalkAutonomy(now);
 drawWalk(time);
}
function drawWalkBehaviorEffect(w,time){
 // 既存スプライトの上へ控えめなドット粒子を重ねる。新しい素材の読み込みは不要。
 const b=w.exploreBehavior;if(!b)return;
 const t=Math.max(0,(Date.now()-w.exploreStart)/1000);
 const ctx=walkCtx,px=w.x,py=102;
 ctx.save();ctx.imageSmoothingEnabled=false;
 const dot=(x,y,color,size=3)=>{ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),size,size);};
 if(['petal','leaf','sand','dust','rain','splash','wave'].includes(b.effect)){
  const palettes={petal:['#dca3b4','#f8d6d9'],leaf:['#bd976a','#d4bd77'],sand:['#e4caa4','#f4ddba'],dust:['#d3b99b','#dfcfb0'],rain:['#b2d1e0','#e4eff2'],splash:['#9ad1e8','#eff8fa'],wave:['#91bfcf','#d2e6e7']};
  const colors=palettes[b.effect];
  for(let i=0;i<5;i++){
   const drift=Math.sin(t*2.2+i*1.9)*7;
   const x=px-26+i*12+drift;
   const y=py+Math.cos(t*2+i)*5+(i%2)*8;
   dot(x,y,colors[i%2],i%2?2:3);
  }
 }else if(b.effect==='spark'){
  for(let i=0;i<3;i++){
    const x=px-22+i*19,y=py-12+Math.sin(t*3+i)*9;
    dot(x,y,'#f6e5ad',3);dot(x+4,y+2,'#fff8df',2);
  }
 }else if(b.effect==='heart'){
  dot(px+25,py-9,'#da9fb0',5);dot(px+30,py-7,'#efbdc7',4);dot(px+28,py-1,'#cf899d',4);
 }else if(b.effect==='peek'){
  dot(px-32,py+15,'#98795e',7);dot(px-32,py+22,'#b3906f',7);
 }else if(b.effect==='calm'){
  dot(px+28,py-15,'#c9d6c3',4);dot(px+33,py-22,'#e1e9db',3);
 }
 ctx.restore();
}
function drawWalk(time){
 if(!walkSession)return;const w=walkSession,background=walkBackground[w.location];
 walkCtx.clearRect(0,0,320,200);walkCtx.imageSmoothingEnabled=false;
 if(!background?.naturalWidth){walkCtx.fillStyle='#c4d9c8';walkCtx.fillRect(0,0,320,200);}
 // 背景はCSSのピクセルアート。天候の粒子は透過キャンバスに重ねます。
 const wx=weatherForTime();
 if(wx.weather==='rain'||wx.weather==='snow'){
  const count=wx.weather==='rain'?24:15;
  for(let i=0;i<count;i++){
   const px=(i*71+Math.floor(time/(wx.weather==='rain'?34:95)))%320;
   const py=(i*43+Math.floor(time/(wx.weather==='rain'?47:120)))%135;
   walkCtx.fillStyle=wx.weather==='rain'?'#b1d6d5b8':'#fffaf0df';
   walkCtx.fillRect(px,py,wx.weather==='rain'?1:3,wx.weather==='rain'?5:3);
  }
 }
 let sprite=spriteSheets[pet.palette]||spriteSheets['薄い水色'];
 const kind=w.petReaction?.kind;
 let action=w.action;
 if(kind==='cuddle')action='happy';if(kind==='shrink')action='wary';
 let row=SPRITE_ACTIONS.indexOf(action)>=0?SPRITE_ACTIONS.indexOf(action):0;
 if(w.gesture){const alternate=gestureSprite(w.gesture.id,pet.palette,sprite,row);sprite=alternate.sheet;row=alternate.row;}
 const frame=Math.floor(time/(action==='walk'?160:330))%4;
 const bounce=(action==='walk'?Math.abs(Math.sin(time/165))*2:0);
 const stretch=kind==='cuddle'?1.16:kind==='shrink'?.93:1;
 const pose=w.gesture?littleGesturePose(w.gesture.id,Date.now()-w.gesture.start,w.gesture.duration,w.face):
  (w.stage==='explore'&&w.exploreBehavior&&LITTLE_GESTURES[w.exploreBehavior.pose])?
   littleGesturePose(w.exploreBehavior.pose,Date.now()-w.exploreStart,w.exploreBehavior.duration,w.face):
   {angle:0,sx:1,sy:1,lift:0,dx:0};
 walkCtx.save();walkCtx.translate(Math.round(w.x+pose.dx),Math.round(136-bounce-pose.lift));
 walkCtx.rotate(pose.angle);
 if(w.face<0)walkCtx.scale(-1,1);
 walkCtx.scale(stretch*pose.sx,(kind==='cuddle'?.90:1)*pose.sy);
 if(sprite?.naturalWidth)walkCtx.drawImage(sprite,frame*SPRITE_W,row*SPRITE_H,SPRITE_W,SPRITE_H,-48,-47,96,80);
 const hat=headwearSprites[pet.wardrobe?.equipped];
 if(hat?.naturalWidth)walkCtx.drawImage(hat,-32,-84,64,56);
 walkCtx.restore();
 if(w.stage==='explore'&&w.exploreBehavior)drawWalkBehaviorEffect(w,time);
 if(kind==='cuddle'){
  walkCtx.fillStyle='#e4a0ad';walkCtx.fillRect(w.x+30,88,6,4);walkCtx.fillRect(w.x+28,92,10,4);walkCtx.fillRect(w.x+31,96,4,4);
 }
 if(w.souvenir){walkCtx.fillStyle='#e8d8a7';walkCtx.fillRect(292,175,10,8);walkCtx.fillStyle='#927b67';walkCtx.fillRect(291,183,12,2);}
}
let walkPointer=null;
walkCanvas.addEventListener('pointerdown',event=>{
 if(!walkSession||!event.isPrimary||event.pointerType==='mouse'&&event.button!==0)return;
 const rect=walkCanvas.getBoundingClientRect(),point={x:(event.clientX-rect.left)/rect.width*320,y:(event.clientY-rect.top)/rect.height*200};
 const nearPet=((point.x-walkSession.x)/45)**2+((point.y-132)/35)**2<1.2;
 walkPointer={id:event.pointerId,nearPet,point,last:point,distance:0};
 if(nearPet){try{walkCanvas.setPointerCapture(event.pointerId);}catch(e){}event.preventDefault();}
});
walkCanvas.addEventListener('pointermove',event=>{
 if(!walkPointer||walkPointer.id!==event.pointerId)return;
 const rect=walkCanvas.getBoundingClientRect(),p={x:(event.clientX-rect.left)/rect.width*320,y:(event.clientY-rect.top)/rect.height*200};
 walkPointer.distance+=Math.hypot(p.x-walkPointer.last.x,p.y-walkPointer.last.y);walkPointer.last=p;
});
walkCanvas.addEventListener('pointerup',event=>{
 if(!walkPointer||walkPointer.id!==event.pointerId||!walkSession)return;
 const pointer=walkPointer;walkPointer=null;
 if(pointer.nearPet){strokeWalkPet(pointer.distance>12?'stroke':'tap');event.preventDefault();return;}
 if(pointer.distance>14)return;
 const targets=WALK_DESTINATIONS[walkSession.location].targets;
 const closest=targets.map(t=>({t,d:Math.hypot(t.x-pointer.point.x,(t.y-pointer.point.y)*.75)})).sort((a,b)=>a.d-b.d)[0];
 if(closest?.d<44)inviteWalkTarget(closest.t.id);
});
walkCanvas.addEventListener('pointercancel',()=>{walkPointer=null;});
walkCanvas.addEventListener('keydown',event=>{
 if(event.key==='Enter'||event.key===' '){event.preventDefault();strokeWalkPet('tap');}
 if(event.key==='Escape'){event.preventDefault();endWalk();}
});
document.querySelectorAll('[data-walk-place]').forEach(button=>button.addEventListener('click',()=>openWalk(button.dataset.walkPlace)));
$('walkReturnBtn').addEventListener('click',()=>endWalk());
$('walkPetBtn').addEventListener('click',()=>strokeWalkPet('tap'));
$('walkObserveBtn').addEventListener('click',()=>{
 if(!walkSession)return;
 const w=walkSession;
 const label=w.target?WALK_DESTINATIONS[w.location].targets.find(t=>t.id===w.target.id)?.label:null;
 walkNarrate(w.gesture?`${pet.name}は${LITTLE_GESTURES[w.gesture.id].caption}`:w.stage==='approach'&&label?`${pet.name}は${label}へ向かって、のんびり歩いています。`:
  w.stage==='explore'&&label?`${pet.name}は${label}のそばで${w.exploreBehavior?.caption||'何かを調べています。'}`: 
  `${pet.name}は今の景色を自分のペースで楽しんでいます。`);
});

// —— v9: 一度きりの5ステップの出会い ——
const introCanvas=$('introCanvas');
const introContext=introCanvas.getContext('2d');
function drawIntroScene(time) {
  introContext.clearRect(0,0,320,200);
  introContext.imageSmoothingEnabled=false;
  drawWeatherInWindow(time,introContext);
  const cushion=objectSprites.cushion;
  if(cushion?.complete && cushion.naturalWidth) introContext.drawImage(cushion,205,114,62,45);
  // 最初の部屋には小さな食器がある。描画するだけでペットの状態には影響しない。
  const c=introContext;
  c.fillStyle='#786e63';c.fillRect(44,165,34,5);
  c.fillStyle='#ad9b8b';c.fillRect(40,157,42,8);
  c.fillStyle='#d7c7b1';c.fillRect(45,156,32,3);
  if(introStep===0) return; // 最初は本当に誰もいない
  const image=spriteSheets[pet.palette]||spriteSheets['薄い水色'];
  if(!image?.complete || !image.naturalWidth) return;
  const action=introStep===1?'look':introStep===3 && introChoice==='approach' && pet.caution>55?'wary':introStep===3 && introChoice==='food'?'sniff':'idle';
  const row=Math.max(0,SPRITE_ACTIONS.indexOf(action));
  const frame=Math.floor(time/380)%4;
  const x=introStep===1?276:introStep===2?224:introStep===3?205:160;
  const offset=introStep===1?14:0;
  const bob=Math.sin(time/480)*(introStep===4?1.8:0.8);
  c.save();c.translate(Math.round(x+offset),Math.round(134+bob));
  c.drawImage(image,frame*SPRITE_W,row*SPRITE_H,SPRITE_W,SPRITE_H,-48,-47,96,80);
  c.restore();
}
function renderIntro() {
  const titles=['誰もいない部屋','不思議な訪問者','一匹との出会い','はじめての交流','一緒の暮らしが始まる'];
  const descriptions=[
    '窓辺に光が差しています。クッションと小さな食器だけがある、静かな部屋です。',
    '……ことり。部屋の隅から小さな物音。見慣れない生き物が、こちらをじっと見ています。',
    '目の前の一匹には、生まれつきの性格や好きなもの、日々の生活リズムがあります。でも、まだ何もわかりません。',
    'どんなふうに接してみますか？ どの選択でも「失敗」にはなりません。',
    introPreviewOriginalPet?'これは演出のお試しです。元のペットや思い出は変わりません。':'この子と暮らす準備ができました。名前はあとからいつでも変更できます。'
  ];
  $('introStepLabel').textContent=`STEP ${introStep+1} / 5`;
  $('introTitle').textContent=titles[introStep];
  $('introDescription').textContent=descriptions[introStep];
  $('introSceneCaption').textContent=introStep===0?'しんとした部屋':
    introStep===1?'……何かが、動きました。':introStep===2?'どんな子なのでしょう？':
    introStep===3?(introReactionText||'小さな生き物がこちらを見ています。'):'これから少しずつ、知っていきましょう。';
  $('introChoices').hidden=introStep!==3 || !!introChoice;
  $('introNameGroup').hidden=introStep!==4 || !!introPreviewOriginalPet;
  $('introNextBtn').disabled=introStep===3 && !introChoice;
  $('introNextBtn').textContent=introStep===4 && introPreviewOriginalPet?'いつもの部屋に戻る':
    ['部屋を見回す','そっと様子を見る','はじめての交流へ','名前をつけに進む','一緒に暮らし始める'][introStep];
  $('introFootnote').textContent=introPreviewOriginalPet?
    'これはお試しです。いつもの子の記録や名前は変わりません。':
    'この子の性格や好みは、数字では表示されません。';
}
function beginIntro() {
  cancelLittleGestures();
  openAppTab('home',{scroll:false});
  onboardingActive=true;
  introStep=0;introChoice=null;introReactionText='';introMeetingRecord=null;
  $('introNameInput').value='';
  $('onboarding').hidden=false;
  document.body.classList.add('intro-active');
  renderIntro();
}
function chooseIntroGreeting(choice) {
  if(introStep!==3||introChoice) return;
  introChoice=choice;
  const cautious=pet.caution>58 || pet.emotions.wariness>48;
  const curious=pet.curiosity>57;
  if(choice==='observe') {
    introReactionText=cautious?'遠くからじっと見つめていましたが、少し体の力を抜きました。':
      curious?'少しずつ近づいてきて、こちらを観察し始めました。':'ゆっくりまばたきして、部屋の様子を見ています。';
    adjustEmotion({safety:3,wariness:-3,interest:1});
  } else if(choice==='food') {
    introReactionText=cautious?'食器のそばまでは来ず、少し離れて匂いを確かめています。':
      curious?'食器の方へ近づき、気になるように何度も覗き込んでいます。':'食べ物を一度見てから、そばに座りました。';
    adjustEmotion({interest:4,wariness:-1,safety:1});
  } else {
    introReactionText=cautious?'体を縮めて一歩だけ下がりました。こちらが静かにしていると、また顔を向けました。':
      curious?'首をかしげるように体を傾けて、こちらへ近づいてきました。':'その場で静かにこちらを見つめています。';
    adjustEmotion({interest:2,wariness:cautious?2:-1,connection:1});
  }
  introMeetingRecord={choice,observation:introReactionText};
  renderIntro();
}
function finishIntro() {
  if(introPreviewOriginalPet){
    pet=introPreviewOriginalPet;introPreviewOriginalPet=null;beginWearSession();
    onboardingActive=false;
    $('onboarding').hidden=true;
    document.body.classList.remove('intro-active');
    pet.action='idle';pet.targetX=pet.x;pet.actionUntil=0;pet.nextDecision=Date.now()+1200;
    $('roomCaption').textContent=`${pet.name}がいつもの部屋で待っています。`;
    renderUI();
    return;
  }
  const name=$('introNameInput').value.trim();
  if(name) pet.name=name.slice(0,12);
  onboardingActive=false;
  $('onboarding').hidden=true;
  document.body.classList.remove('intro-active');
  pet.lastRealTime=Date.now();pet.dayStarted=Date.now();
  pet.action='idle';pet.actionUntil=0;pet.nextDecision=Date.now()+1800;
  $('roomCaption').textContent=`${pet.name}は部屋にやってきました。これからどんな暮らしが始まるのでしょう？`;
  if(introMeetingRecord){
    const choices={observe:'そっと見守る',food:'食べ物を置く',approach:'そっと近づく'};
    recordMoment('first_meeting',`${pet.name}と出会い、「${choices[introMeetingRecord.choice]}」を選びました。${introMeetingRecord.observation}`,
      '出会った日の最初の反応です。これからの性格や好みは、暮らしの中で少しずつ見つけていきます。');
  }
  renderUI();save();
}
// —— v14: タブの操作。矢印キーで隣のタブにも移動できます。——
document.querySelectorAll('[data-app-tab]').forEach(button=>{
  button.addEventListener('click',()=>openAppTab(button.dataset.appTab));
  button.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();
    let index=APP_TABS.indexOf(button.dataset.appTab);
    if(event.key==='ArrowLeft')index=(index+APP_TABS.length-1)%APP_TABS.length;
    if(event.key==='ArrowRight')index=(index+1)%APP_TABS.length;
    if(event.key==='Home')index=0;
    if(event.key==='End')index=APP_TABS.length-1;
    openAppTab(APP_TABS[index],{focus:true});
  });
});
document.querySelectorAll('[data-open-app-tab]').forEach(button=>{
  button.addEventListener('click',()=>openAppTab(button.dataset.openAppTab));
});
$('quickPointsBtn').addEventListener('click',()=>openAppTab('fashion'));
$('cancelPlaceHomeBtn').addEventListener('click',()=>{placingType=null;updateItemTray();});
$('introPreviewBtn').addEventListener('click',()=>{
  if(onboardingActive) return;
  save();
  introPreviewOriginalPet=pet;
  const originalTheme=pet.roomTheme;
  pet=newPet();pet.roomTheme=originalTheme;normalizePet();beginWearSession();
  applyRoomTheme();
  reaction=null;objectVisit=null;placeVisit=null;socialVisit=null;roomSpecialVisit=null;memoryInvitation=null;pettingBeg=null;petPointer=null;
  placingType=null;interactionUntil=0;
  beginIntro();
});
$('introNextBtn').addEventListener('click',()=>{
  if(!onboardingActive) return;
  if(introStep===3 && !introChoice) return;
  if(introStep===4){finishIntro();return;}
  introStep++;
  renderIntro();
});
document.querySelectorAll('[data-intro-choice]').forEach(button=>{
  button.addEventListener('click',()=>chooseIntroGreeting(button.dataset.introChoice));
});

$('autoHeadwearToggle').addEventListener('change',event=>{
  pet.fashionMemory.autoChoose=!!event.target.checked;
  setWardrobeMessage(event.target.checked?'この子が好きな飾りを、ときどき自分で選べるようにしました。':
    '自分で頭飾りを変える機能をオフにしました。今のおめかしはそのままです。');
  save();
});
$('headwearChoices').addEventListener('click',event=>{
  const button=event.target.closest('[data-headwear]');
  if(button&&!button.disabled) chooseHeadwear(button.dataset.headwear);
});
document.querySelectorAll('[data-room-theme]').forEach(btn=>btn.addEventListener('click',()=>selectRoomTheme(btn.dataset.roomTheme)));
buildRoomItemTray();
document.querySelectorAll('[data-place-item]').forEach(btn=>btn.addEventListener('click',()=>selectPlaceItem(btn.dataset.placeItem)));
$('cancelPlaceBtn').addEventListener('click',()=>{placingType=null;updateItemTray();});
$('inspectRoomBtn').addEventListener('click',()=>{
  roomSummaryVisible=true;
  const text=roomTraceSummary();
  renderTraceUI();
  $('roomCaption').textContent=text;
});
$('tidyRoomBtn').addEventListener('click',tidyRoom);
function rename() {
  $('nameInput').value = pet.name;
  $('nameDialog').showModal();
}
$('observeBtn').addEventListener('click', observe);
$('callBtn').addEventListener('click', callPet);
$('foodBtn').addEventListener('click', offerFood);
$('playBtn').addEventListener('click', invitePlay);
$('petBtn').addEventListener('click', approachPet);
$('strokePetBtn').addEventListener('click',()=>strokePet('tap'));
$('renameBtn').addEventListener('click', rename);
$('favoriteStoryBtn').addEventListener('click', openFavoriteStory);
$('nameForm').addEventListener('submit', event => {
  if (event.submitter && event.submitter.value === 'save') {
    const name = $('nameInput').value.trim();
    if (name) pet.name = name;
    renderUI(); save();
  }
});
$('resetBtn').addEventListener('click', () => {
  if (!confirm('この子との記録を消して、新しい出会いから始めますか？')) return;
  localStorage.removeItem(SAVE_KEY);
  pet=newPet();normalizePet();beginWearSession();
  discovered=new Set();reaction=null;objectVisit=null;placeVisit=null;secretVisit=null;
  socialVisit=null;roomSpecialVisit=null;memoryInvitation=null;pettingBeg=null;petPointer=null;placingType=null;
  roomSummaryVisible=false;journalFilter='all';journalCategory='all';
  interactionUntil=0;
  $('discoveryText').textContent='ペットの行動を観察すると、少しずつこの子のことがわかります。';
  $('roomCaption').textContent='部屋の隅で、小さな物音がしました。';
  renderUI();beginIntro();
});

// 長時間閉じていた間は、経過時間から少数の「日常の痕跡」を再現。
// ブラウザを閉じたままJSが動き続けるわけではありません。
function simulateOfflineTraces(hours) {
  if(hours<0.5 || !pet.roomItems.length) return [];
  const count=hours>=12 ? 3 : hours>=4 ? 2 : 1;
  const events=[];
  const choices=[...pet.roomItems];
  for(let i=0;i<count;i++){
    const eligible=choices.filter(item =>
      item.id==='ball' || item.id==='cushion' ||
      (item.id==='pebble'&&pet.roomTraces.stones.length<5) ||
      (item.id==='plant'&&pet.roomTraces.leaves.length<4));
    if(!eligible.length) break;
    const weights=eligible.map(item=>({id:item.id,weight:Math.max(1,(item.id==='cushion' ? 38+pet.tired*0.4 :
       item.id==='ball' ? 25+pet.activity*0.3 : item.id==='pebble' ? 15+pet.attachment*0.25 : 20+pet.curiosity*0.2) +
       (placePreference(item.id)-22)*0.55)}));
    const id=weightedChoice(weights);
    if(addRoomTrace(id,{offline:true})) events.push(id);
    const index=choices.findIndex(i=>i.id===id);
    if(index>=0) choices.splice(index,1); // 同じ不在期間中は多様な痕跡を優先
  }
  return events;
}
function applyElapsedTime(now=Date.now()) {
  const hours=clamp((now-pet.lastRealTime)/3600000,0,48);
  if(hours<=0) return;
  pet.hunger=clamp(pet.hunger+Math.min(hours*3,30));
  pet.tired=clamp(pet.tired+Math.min(hours*2,20));
  pet.emotions.wariness=clamp(pet.emotions.wariness-Math.min(hours*1.5,12));
  pet.emotions.interest=clamp(pet.emotions.interest+Math.min(hours*1.2,10));
  const events=simulateOfflineTraces(hours);
  if(events.length){
    // 描写は一文にまとめる。見ていない間の重要な発見や好感度は進めない。
    const hint=pet.roomTraces.lastNote;
    pet.roomTraces.lastNote=`しばらく留守にしている間に、部屋の様子が変わりました。${hint.replace('留守の間に、','')}`;
    pet.roomTraces.lastAt=now;
    pet.logs.unshift('留守中に、部屋のどこかが少し変わっていました。');
    pet.logs=pet.logs.slice(0,8);
    $('roomCaption').textContent='部屋のどこかに、暮らしの痕跡が残っています。';
  }
  if(now-pet.dayStarted>=86400000){
    const passedDays=Math.floor((now-pet.dayStarted)/86400000);
    pet.day+=passedDays;pet.dayStarted+=passedDays*86400000;
  }
  pet.lastRealTime=now;
}
window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange',()=>{
  if(onboardingActive) return;
  if(document.hidden){save();return;}
  applyElapsedTime();
  renderUI();save();
});
if(!onboardingActive) {
  applyElapsedTime();
  $('roomCaption').textContent=`${pet.name}は今日も、この部屋で自分のペースで過ごしています。`;
}
renderUI();
updateItemTray();
if(onboardingActive) beginIntro();
else save();
requestAnimationFrame(tick);
