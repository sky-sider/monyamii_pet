'use strict';

// ちいさな同居人 v14 — 画面整理。v13以前のゲームデータとセーブキーは変更しません。
// 数値は内部でのみ扱います。プレイヤーには仕草と行動で伝えます。
const SAVE_KEY = 'mofuri-pet-save-v1'; // v1 / v2 のセーブデータを引き継ぐ
const canvas = document.getElementById('petCanvas');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);
const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, v));
const rand = (items) => items[Math.floor(Math.random() * items.length)];
const palettes = ['クリーム', '薄い水色', '淡い桃色', '灰色', '薄茶色', 'ミント'];
const quirkList = ['小さなものを集める', '窓辺を気にする', '寝る前にくるくる回る', 'クッションの端を調べる', '気になるものをつつく'];
const likes = ['丸いもの', '光るもの', '柔らかいもの', '葉っぱ', '小さな石'];
const names = ['モフリ', 'ポム', 'ルル', 'ネム', 'トト', 'ミミ', 'ピノ', 'ムク'];
const ROOM_ITEM_TYPES = {
  ball:    {label:'毛糸玉',    sprite:'ball.png',    tags:['丸いもの','柔らかいもの'], w:36, h:36, approach:23},
  cushion: {label:'クッション', sprite:'cushion.png', tags:['柔らかいもの'], w:62, h:45, approach:3},
  pebble:  {label:'きらきら小石',sprite:'pebble.png',  tags:['丸いもの','光るもの','小さな石'], w:39, h:39, approach:23},
  plant:   {label:'鉢植え',    sprite:'plant.png',   tags:['葉っぱ'], w:54, h:56, approach:32}
};
// 背景だけを模様替え。既存の家具座標・習慣・ペットの記憶は保持する。
const ROOM_THEMES = Object.freeze({
  western: {label:'洋風',file:'western.png'},
  japanese: {label:'和風',file:'japanese.png'},
  cute: {label:'可愛い',file:'cute.png'},
  cyber: {label:'サイバー',file:'cyber.png'}
});
const DEFAULT_ROOM_THEME = 'western';
function validRoomTheme(id) { return Object.prototype.hasOwnProperty.call(ROOM_THEMES,id) ? id : DEFAULT_ROOM_THEME; }
// —— v14: 必要な画面にだけ移動する。ゲーム内の状態は切り替えません ——
const APP_TABS=['home','room','fashion','notes'];
let activeAppTab='home';
function openAppTab(tab,{focus=false,scroll=true}={}){
  if(!APP_TABS.includes(tab))return;
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
  yarn_play: {category:'object',label:'毛糸玉で遊んだ日'},
  yarn_self: {category:'object',label:'自分で毛糸玉を選んだ日'},
  food_first: {category:'interaction',label:'食べ物を受け取った日'},
  call_response: {category:'interaction',label:'呼び声に応えた日'},
  welcome_close: {category:'interaction',label:'そばで安心してくれた日'},
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
const MOMENT_CATEGORIES = {interaction:'交流',object:'ものとの出会い',world:'季節とおへや',fashion:'おめかし',secret:'ひみつの習性'};
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
  if(source.lastRewards&&typeof source.lastRewards==='object') for(const key of ['observe','call','food','play','approach','invitation']) {
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
    foodCount: 0, playCount: 0, wardrobe:newWardrobe(), fashionMemory:newFashionMemory(), secretMemory:newSecretMemory(), bondMemory:newBondMemory(), worldMemory:newWorldMemory(), roomItems: initialRoomItems(), objectMemory: initialObjectMemory(), roomTraces: initialRoomTraces(), placeMemory: newPlaceMemory(), placeJournal: newPlaceJournal(), momentJournal: newMomentJournal(), discoveries: [],
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
  renderInvitationButton();
  renderWardrobe();
  renderSecretHint();
  refreshTodayHighlight();
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
function spriteAction() {
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
  const image = spriteSheets[pet.palette] || spriteSheets['薄い水色'];
  if (!image || !image.complete || !image.naturalWidth) return;
  const action = spriteAction();
  const row = SPRITE_ACTIONS.indexOf(action);
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
    } else if (reaction.kind === 'spin') {
      angle = (elapsed / 600) * Math.PI * 2 * envelope;
      squashX = 0.93 + Math.abs(Math.cos(elapsed / 200)) * 0.07;
    }
  }
  if (action === 'walk') lift += Math.abs(Math.sin(time / 150)) * 1.6;
  if (action === 'sleep') squashY *= 0.96 + Math.sin(time / 580) * 0.02;

  ctx.save();
  ctx.translate(Math.round(pet.x), Math.round(136 - lift));
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
    const bounce = focus && item.id === 'ball' ? Math.abs(Math.sin(time/170))*5 : 0;
    const sway = focus && item.id === 'plant' ? Math.sin(time/250)*0.05 : 0;
    ctx.save();
    ctx.translate(Math.round(item.x), 164 - bounce);
    ctx.rotate(sway);
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
    ctx.restore();
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
    ['secret','ひみつの習性',momentEntries.filter(e=>MOMENT_DEFINITIONS[e.key]?.category==='secret').length]];
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
  const keys=['cushion',...Object.keys(FREE_PLACES)].filter(placeAvailable);
  const choice=keys.map(key=>({id:key,weight:Math.max(1,placePreference(key,now) +
    (key==='cushion'?25:0) + pet.placeMemory.spots[key].rests*2.5)}));
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
  if (info.tags.includes(pet.favorite)) score+=32;
  // 何度も安心して過ごした家具を、自然と選び直すようになる。
  score+=Math.max(-14,Math.min(38,(placePreference(item.id,now)-22)*0.65));
  if (item.id==='cushion') score+=pet.tired*0.45 + (100-pet.activity)*0.1;
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
    : item.id==='plant' && action==='sniff' ? 'sniff' : '';
  if(traceBehavior) addRoomTrace(item.id,{behavior:traceBehavior});
  if(item.id==='ball' && action==='play') rememberYarnPlay({spontaneous:true});
  objectVisit.stage='interact'; objectVisit.until=now+duration;
  // 遠くから見るだけでは居場所として学ばない。実際に近くで過ごした経験を記録。
  if(!hesitant && !(item.id==='ball'&&action==='look')) rememberPlace(item.id,action==='sleep'?'rest':'linger',now,
    item.id==='cushion' ? (action==='sleep' ? `${pet.name}はクッションでうとうとし始めました` : `${pet.name}はクッションでゆっくり過ごしました`) :
    item.id==='ball' ? `${pet.name}は毛糸玉を自分で選び、転がして遊びました` :
    item.id==='pebble' ? (action==='collect'?`${pet.name}は小石をころころ動かして、そのそばで過ごしました`:`${pet.name}は小石のきらめきを眺めました`) :
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
  if(socialVisit || objectVisit || placeVisit || reaction || pet.tired>70) return false;
  if(Math.abs(pet.x-160)<38 || pet.emotions.wariness>76) return false;
  const learnedCompany=Math.min(24,memoryCount('answeredCall')*4+memoryCount('calmTogether')*3);
  const chance=clamp((pet.sociability*0.38+pet.emotions.connection*0.48+pet.emotions.safety*0.22-pet.emotions.wariness*0.25+learnedCompany)/240,0.06,0.36);
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
    renderUI();save();
  }else if(socialVisit.stage==='resting' && now>=socialVisit.until){
    socialVisit=null;
  }
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
  const chance=clamp(0.10+memoryCount('sharedYarn')*0.048+(pet.emotions.connection-45)*0.0015,0.09,0.34);
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
  if (now < pet.actionUntil || now < pet.nextDecision) return;
  // 目的地へ移動している途中は、他の行動を選んで中断しない。
  if (memoryInvitation || socialVisit || roomSpecialVisit || (objectVisit && objectVisit.stage==='approach') || (placeVisit && placeVisit.stage==='approach')) return;
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
  // 家具だけでなく、窓辺・部屋の隅も日常の居場所として自分で選びます。
  // 好みが定着すると、同じ場所へ戻る傾向が少しずつ強まります。
  if(Math.random()<(activeHours?0.25:0.37) && startAutonomousFreePlace(now)) return;
  if (pet.roomItems.length && Math.random() < (activeHours?0.66:0.46) && startAutonomousItemAction(now)) return;
  const e = pet.emotions;
  const selected = weightedChoice([
    {id:'walk', weight: 18 + pet.activity * 0.27 + e.interest * 0.12},
    {id:'look', weight: 8 + pet.curiosity * 0.23 + e.interest * 0.2},
    {id:'idle', weight: 18 + (100-pet.activity)*0.15 + e.safety*0.06},
    {id:'collect', weight: 8 + pet.attachment * 0.17 + e.interest*0.08},
    {id:'sniff', weight: 4 + pet.hunger*0.12}
  ]);
  if (selected === 'walk') {
    const target = clamp(pet.x + (Math.random() < 0.5 ? -1 : 1) * (36 + Math.random()*44), 45, 275);
    startAction('walk', 2600 + Math.random()*1900, 'curious', target);
    $('roomCaption').textContent = `${pet.name}は部屋の中をてくてく歩いています。`;
  } else if (selected === 'look') {
    startAction('look', 2600 + Math.random()*1200, 'curious');
    $('roomCaption').textContent = `${pet.name}は立ち止まり、何かをじっと見つめています。`;
    if (pet.curiosity > 60) discover('curiosity', `${pet.name}は気になるものを見つけると、じっと観察するようです。`);
  } else if (selected === 'collect') {
    startAction('collect', 3300, 'happy');
    $('roomCaption').textContent = `${pet.name}は床の小さなものをつついています。`;
    discover('collector', `${pet.name}には小さなものを集める習性があるようです。`);
  } else if (selected === 'sniff') {
    startAction('sniff', 2700, 'curious');
    $('roomCaption').textContent = `${pet.name}は何かの匂いを確かめているみたい。`;
  } else {
    startAction('idle', 2800 + Math.random()*1700, 'calm');
    $('roomCaption').textContent = `${pet.name}はその場で、ぼんやりしています。`;
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

  if (reaction && now >= reaction.until) reaction = null;
  if (now >= pet.actionUntil && pet.action !== 'idle' && !secretVisit &&
      !(objectVisit && objectVisit.stage==='approach') && !(placeVisit && placeVisit.stage==='approach') && !(socialVisit && socialVisit.stage==='approach') && !(roomSpecialVisit && roomSpecialVisit.stage==='approach')) {
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
  if (pet.action === 'sleep') description = `${pet.name}は静かに眠っています。体がゆっくり上下しています。`;
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


function updateItemTray() {
  document.querySelectorAll('[data-place-item]').forEach(btn=>{
    const id=btn.dataset.placeItem;
    const placed=pet.roomItems.some(item=>item.id===id);
    btn.classList.toggle('selected',placingType===id);
    btn.setAttribute('aria-pressed',String(placingType===id));
    const sub=btn.querySelector('.item-sub');
    if (sub) sub.textContent=placingType===id?'場所を選択中':placed?'移動できる':'配置する';
  });
  canvas.classList.toggle('placement-active',!!placingType);
  const hint=$('placeHint');
  hint.textContent=placingType ? `${ROOM_ITEM_TYPES[placingType].label}を置く場所を画面をタップすると、その横位置の床に置かれます。PCなら矢印キーとEnterでも配置できます。` : 'アイテムを選ぶと、床の左右の位置に置いたり、移動させたりできます。';
  $('cancelPlaceBtn').hidden=!placingType;
  const banner=$('placementBanner');
  if(banner) banner.hidden=!placingType;
  const bannerText=$('placementBannerText');
  if(bannerText&&placingType) bannerText.textContent=`${ROOM_ITEM_TYPES[placingType].label}を床の好きな位置に置いてください。`;
}
function selectPlaceItem(type) {
  placingType=placingType===type?null:type;
  previewX=(pet.roomItems.find(i=>i.id===type)||{}).x || 160;
  updateItemTray();
  if(placingType){openAppTab('home');}
}
function placeSelectedItem(x) {
  if (!placingType) return;
  const id=placingType;
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
function pointToX(event) {
  const rect=canvas.getBoundingClientRect();
  return clamp((event.clientX-rect.left)/rect.width*canvas.width,36,284);
}
canvas.addEventListener('pointermove',event=>{if(placingType) previewX=pointToX(event);});
canvas.addEventListener('click',event=>{
  if (placingType) { placeSelectedItem(pointToX(event));return; }
  const x=pointToX(event);
  const near=pet.roomItems.find(item=>Math.abs(item.x-x)<25);
  if (near) {
    const m=pet.objectMemory[near.id], label=ROOM_ITEM_TYPES[near.id].label;
    $('roomCaption').textContent=m.visits>0 ? `${label}には、これまでに${pet.name}が近づいた形跡があります。` : `${label}があります。${pet.name}はどんな反応をするでしょう？`;
  }
});
canvas.addEventListener('keydown',event=>{
  if (!placingType) return;
  if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
    event.preventDefault();previewX=clamp(previewX+(event.key==='ArrowLeft'?-10:10),36,284);
  } else if(event.key==='Enter'||event.key===' '){event.preventDefault();placeSelectedItem(previewX);}
  else if(event.key==='Escape'){placingType=null;updateItemTray();}
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
  reaction=null;objectVisit=null;placeVisit=null;socialVisit=null;roomSpecialVisit=null;memoryInvitation=null;
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
  socialVisit=null;roomSpecialVisit=null;memoryInvitation=null;placingType=null;
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
