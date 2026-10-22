'use strict';

// ちいさな同居人 v4 — 家具・おもちゃ・自律的な探索と学習
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
const initialRoomItems = () => [{id:'ball', x:100}, {id:'cushion', x:242}];
const initialObjectMemory = () => Object.fromEntries(Object.keys(ROOM_ITEM_TYPES).map(id=>[id,{familiarity:0, affinity:0, visits:0, lastUsed:0}]));

function newPet() {
  const sociability = 20 + Math.floor(Math.random() * 65);
  const caution = 20 + Math.floor(Math.random() * 65);
  const curiosity = 25 + Math.floor(Math.random() * 65);
  const comfort = 45 + Math.random() * 15;
  return {
    name: rand(names), palette: rand(palettes),
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
    foodCount: 0, playCount: 0, roomItems: initialRoomItems(), objectMemory: initialObjectMemory(), discoveries: [],
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

let pet = loadPet() || newPet();
let discovered = new Set(Array.isArray(pet.discoveries) ? pet.discoveries : []);
let lastFrame = 0;
let nextSaveAt = Date.now() + 15000;
let thoughtTimer = null;
let interactionUntil = 0;
let reaction = null; // 画面上の短いリアクションは保存しない
let objectVisit = null; // 自律的な家具への移動・交流（再起動時はリセット）
let placingType = null; // プレイヤーが設置しようとしている家具
let previewX = 160;
const objectSprites = {};
for (const [type, info] of Object.entries(ROOM_ITEM_TYPES)) {
  const image = new Image();
  image.src = `assets/items/${info.sprite}`;
  image.onerror = () => console.warn(`アイテム画像を読み込めません: ${info.sprite}`);
  objectSprites[type] = image;
}

function normalizePet() {
  // 旧バージョンのセーブデータへの、破壊しない追加・補完
  pet.curiosity = clamp(Number.isFinite(pet.curiosity) ? pet.curiosity : 55);
  pet.sociability = clamp(Number.isFinite(pet.sociability) ? pet.sociability : 50);
  pet.caution = clamp(Number.isFinite(pet.caution) ? pet.caution : 50);
  pet.activity = clamp(Number.isFinite(pet.activity) ? pet.activity : 55);
  pet.attachment = clamp(Number.isFinite(pet.attachment) ? pet.attachment : 50);
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
  pet.day = Math.max(1, Number.isFinite(pet.day) ? pet.day : 1);
  pet.dayStarted = Number.isFinite(pet.dayStarted) ? pet.dayStarted : Date.now();
  pet.action = 'idle';
  pet.mood = 'calm';
  pet.actionUntil = 0;
  pet.nextDecision = Date.now() + 1800;
}
normalizePet();

function save() {
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
function addLog(text) {
  pet.logs.unshift(text);
  pet.logs = pet.logs.slice(0, 8);
  renderLog();
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
  $('discoveryCount').textContent = `${discovered.size}件`;
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
  $('petNameHeading').textContent = pet.name;
  $('dayLabel').textContent = `${pet.day}日目`;
  $('petIntro').textContent = '仕草を眺めて、この子のことを知っていきましょう。';
  $('sleepSignal').textContent = pet.tired > 72 ? 'まばたきがゆっくりになっている' : pet.tired > 45 ? 'ときどき、うとうとしている' : '目を開けて辺りを見ている';
  $('moodSignal').textContent = visibleMood();
  $('discoveryCount').textContent = `${discovered.size}件`;
  renderLog();
  updateItemTray();
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
  ctx.restore();
  if (active && reaction.kind === 'hop') {
    // 喜びは文字のラベルでなく、小さなピクセルのきらめきでも表す。
    ctx.fillStyle = '#d6aa67';
    const flicker = Math.floor(time / 230) % 2;
    ctx.fillRect(Math.round(pet.x - 47), 83 - flicker * 3, 3, 3);
    ctx.fillRect(Math.round(pet.x + 43), 89 + flicker * 2, 3, 3);
  }
}
function drawRoomItems(time) {
  for (const item of pet.roomItems) {
    const info = ROOM_ITEM_TYPES[item.id], img = objectSprites[item.id];
    if (!info || !img || !img.complete || !img.naturalWidth) continue;
    const focus = objectVisit && objectVisit.id === item.id && objectVisit.stage === 'interact';
    const bounce = focus && item.id === 'ball' ? Math.abs(Math.sin(time/170))*5 : 0;
    const sway = focus && item.id === 'plant' ? Math.sin(time/250)*0.05 : 0;
    ctx.save();
    ctx.translate(Math.round(item.x), 164 - bounce);
    ctx.rotate(sway);
    ctx.drawImage(img,-info.w/2,-info.h,info.w,info.h);
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

// 家具との交流はプレイヤーが命令するのではなく、その子の気分・個性・経験で選ぶ。
function itemAttraction(item, now) {
  const info=ROOM_ITEM_TYPES[item.id], memory=pet.objectMemory[item.id], e=pet.emotions;
  if (now-memory.lastUsed < 22000) return 0; // 同じものを連続で調べない
  let score=14+pet.curiosity*0.16 + e.interest*0.12 + memory.affinity*0.75 + Math.min(16,memory.familiarity*0.14);
  if (info.tags.includes(pet.favorite)) score+=32;
  if (item.id==='cushion') score+=pet.tired*0.45 + (100-pet.activity)*0.1;
  if (item.id==='ball') score+=pet.activity*0.14 + e.connection*0.08;
  if (item.id==='pebble' && pet.quirk==='小さなものを集める') score+=22;
  if (item.id==='plant' && pet.quirk==='窓辺を気にする') score+=15;
  if (memory.visits===0) score+=pet.curiosity*0.17 - pet.caution*0.13;
  if (e.wariness>65 && memory.visits===0) score-=20;
  return Math.max(3,score);
}
function beginObjectVisit(item, now) {
  const info=ROOM_ITEM_TYPES[item.id];
  const side=pet.x > item.x ? 1 : -1;
  const target=clamp(item.x + side * info.approach,45,275);
  const duration=Math.max(1650,Math.abs(target-pet.x)/38*1000 + 900);
  objectVisit={id:item.id,stage:'approach',until:now+duration+600};
  startAction('walk',duration,'curious',target);
  pet.nextDecision=now+duration+900;
  $('roomCaption').textContent=`${pet.name}は${info.label}のほうへ、ゆっくり近づいています。`;
}
function interactWithObject(now) {
  if (!objectVisit || objectVisit.stage!=='approach') return;
  const item=pet.roomItems.find(i=>i.id===objectVisit.id);
  if (!item) {objectVisit=null;return;}
  const memory=pet.objectMemory[item.id], e=pet.emotions, label=ROOM_ITEM_TYPES[item.id].label;
  const hesitant=e.wariness>64 && memory.familiarity<35 && Math.random()<0.58;
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
    action=pet.tired>42?'sleep':'idle';mood='calm';duration=pet.tired>42?7500:4300;thought=action==='sleep'?'すぅ…':'…♪';
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
  objectVisit.stage='interact'; objectVisit.until=now+duration;
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
function chooseAutonomousAction(now) {
  if (now < pet.actionUntil || now < pet.nextDecision) return;
  if (pet.tired > 78) {
    startAction('sleep', 8500 + Math.random() * 5000, 'calm');
    $('roomCaption').textContent = `${pet.name}は体を丸めて、ゆっくり目を閉じました。`;
    return;
  }
  if (pet.hunger > 83) {
    startAction('sniff', 3600, 'curious');
    $('roomCaption').textContent = `${pet.name}は食べ物のありそうな場所を探しています。`;
    return;
  }
  // 家具やおもちゃは、一定の確率で自発的に訪ねる。
  if (pet.roomItems.length && Math.random() < 0.63 && startAutonomousItemAction(now)) return;
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
  // 実時間の進行（画面を閉じている間の変化は起動時に別途計算）
  if (pet.action === 'sleep') pet.tired = clamp(pet.tired - dt * 1.5);
  else pet.tired = clamp(pet.tired + dt * (0.025 + pet.activity * 0.0004));
  pet.hunger = clamp(pet.hunger + dt * 0.017);
  const e = pet.emotions;
  e.interest = clamp(e.interest + dt * (pet.curiosity * 0.0009 - 0.017));
  e.wariness = clamp(e.wariness - dt * (e.safety > 55 ? 0.032 : 0.014));
  e.connection = clamp(e.connection + dt * 0.006);

  if (reaction && now >= reaction.until) reaction = null;
  if (now >= pet.actionUntil && pet.action !== 'idle') {
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
  drawPet(timestamp);
  if (now >= nextSaveAt) { save(); nextSaveAt = now + 15000; }
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
  // 観察はペットの行動を邪魔しないし、毎回ログを増やさない。
}
function callPet() {
  if (!canInteract()) return;
  if (pet.action === 'sleep') {
    performReaction({action:'sleep',kind:'sway',duration:2500,mood:'calm',gesture:'まぶたを少し動かしている',caption:`${pet.name}は寝返りを打ち、また眠っています。`,thought:'すぅ…'});
    return;
  }
  const e = pet.emotions;
  const hesitation = pet.caution*0.43 + e.wariness*0.68 - e.safety*0.35;
  const approaching = e.connection*0.65 + pet.sociability*0.34 + e.safety*0.22;
  if (hesitation > 48 && Math.random() < 0.7) {
    adjustEmotion({wariness: 3, interest: 2});
    recordReaction('recoil');
    performReaction({action:'walk',kind:'recoil',duration:3100,mood:'wary',destination:pet.x + (pet.x < 160 ? -26 : 26),gesture:'体を縮めて、一歩だけ下がっている',caption:`${pet.name}はこちらを見たあと、一歩だけ離れました。`,thought:'…？',log:`${pet.name}は声に気づき、少し距離をとりました。`});
  } else if (approaching > 70 && Math.random() < 0.72) {
    adjustEmotion({connection:2,safety:2,wariness:-3});
    recordReaction('call');
    performReaction({action:'walk',kind:'lean',duration:3900,mood:'happy',destination:pet.x + (pet.x < 160 ? 31 : -31),gesture:'こちらへ少し近づき、体を傾けている',caption:`${pet.name}は声を聞くと、こちらへ寄ってきました。`,thought:'♪',log:`${pet.name}は呼び声を聞いて、自分から近づいてきました。`});
  } else {
    adjustEmotion({interest:4,connection:1,wariness:-1});
    recordReaction('call');
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
    adjustEmotion({safety:2,wariness:-2,interest:-3});
    performReaction({action:'eat',kind:'sway',duration:4700,mood:'happy',gesture:'食べ物に体を寄せ、小さく揺れている',caption:`${pet.name}は食べ物をそっとつついてから、食べ始めました。`,thought:'もぐ…',log:`${pet.name}は置いた食べ物を食べました。`});
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
  if (!canInteract()) return;
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
    recordReaction('play');
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
    performReaction({action:'idle',kind:'lean',duration:3500,mood:'happy',gesture:'身を寄せるように、体を傾けている',caption:`${pet.name}は逃げずに、そっと体を寄せてきました。`,thought:'…♪',log:`${pet.name}は安心したように、そばでじっとしています。`});
  } else {
    adjustEmotion({safety:3,wariness:-2,connection:1});
    recordReaction('near');
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
}
function selectPlaceItem(type) {
  placingType=placingType===type?null:type;
  previewX=(pet.roomItems.find(i=>i.id===type)||{}).x || 160;
  updateItemTray();
}
function placeSelectedItem(x) {
  if (!placingType) return;
  const id=placingType;
  const pos=clamp(Math.round(x),36,284);
  const exists=pet.roomItems.find(i=>i.id===id);
  if (exists) exists.x=pos;
  else pet.roomItems.push({id,x:pos});
  if (objectVisit && objectVisit.id===id) {
    objectVisit=null;pet.action='idle';pet.actionUntil=0;pet.targetX=pet.x;
  }
  placingType=null;
  updateItemTray();
  $('roomCaption').textContent=`${ROOM_ITEM_TYPES[id].label}を置きました。${pet.name}が興味を持つか、見守ってみましょう。`;
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
document.querySelectorAll('[data-place-item]').forEach(btn=>btn.addEventListener('click',()=>selectPlaceItem(btn.dataset.placeItem)));
$('cancelPlaceBtn').addEventListener('click',()=>{placingType=null;updateItemTray();});
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
  pet = newPet();
  normalizePet();
  discovered = new Set();
  reaction = null;
  objectVisit=null; placingType=null;
  interactionUntil = 0;
  $('discoveryText').textContent = 'ペットの行動を観察すると、少しずつこの子のことがわかります。';
  $('roomCaption').textContent = '部屋の隅で、小さな物音がしました。';
  showThought('…？');
  renderUI(); save();
});

// アプリが開かれていない時間も穏やかに経過させる。大切な交流は発生させない。
const elapsedHours = clamp((Date.now() - pet.lastRealTime) / 3600000, 0, 48);
pet.hunger = clamp(pet.hunger + Math.min(elapsedHours*3, 30));
pet.tired = clamp(pet.tired + Math.min(elapsedHours*2, 20));
pet.emotions.wariness = clamp(pet.emotions.wariness - Math.min(elapsedHours*1.5, 12));
pet.emotions.interest = clamp(pet.emotions.interest + Math.min(elapsedHours*1.2, 10));
if (Date.now() - pet.dayStarted >= 86400000) {
  const passedDays = Math.floor((Date.now() - pet.dayStarted) / 86400000);
  pet.day += passedDays;
  pet.dayStarted += passedDays * 86400000;
}
window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
renderUI();
updateItemTray();
save();
requestAnimationFrame(tick);
