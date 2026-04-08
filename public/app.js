// I-REP HUD — app.js v4
'use strict';

const SERVER=(location.hostname==='localhost'||location.hostname==='127.0.0.1')?'http://localhost:3000':window.location.origin;
let CATALOG=[], RUBROS=[], CART=[], MET={}, IMG_MAP={};
let cartFiltered=[], cartPage=0, cartIdCtr=0, currentItem=null, searchTimer=null;
const CART_PG = 50;
let activeRubro=null, shelfSort='urgency', shelfLinea='', shelfItems=[];
// kanban removed v3.0
let cartSortField = '', cartSortDir = 1; // 1=asc, -1=desc
let streak = JSON.parse(localStorage.getItem('irep_streak')||'{"days":0,"lastScore":0,"lastDate":""}');
let COTIZACION=[], COT_CLIENTE='', COT_AUTO='', COT_NOMBRE='I-REP Repuestos';

const ACHS = [
  {id:'s75', icon:'🟢', name:'Stock 75%',    check:g=>g.pct_stk>=75},
  {id:'s80', icon:'💚', name:'Stock 80%',    check:g=>g.pct_stk>=80},
  {id:'r100',icon:'🏆', name:'100 Rubros',   check:g=>g.rubros_activos>=100},
  {id:'r200',icon:'🥇', name:'200 Rubros',   check:g=>g.rubros_activos>=200},
  {id:'sc80',icon:'⭐', name:'Score 80',     check:g=>g.score_ponderado>=80},
  {id:'sc90',icon:'🌟', name:'Score 90',     check:g=>g.score_ponderado>=90},
  {id:'f50', icon:'🔥', name:'50 Completos', check:g=>g.rubros_full>=50},
  {id:'f100',icon:'💯', name:'100 Completos',check:g=>g.rubros_full>=100},
];

window.addEventListener('DOMContentLoaded', async () => {
  setLd('Conectando con Google Sheets…');
  try {
    setLd('Cargando catálogo…');
    await loadData();
    setLd('Cargando carrito…');
    await loadProceso();
    loadImages().catch(e => console.warn('[images]', e.message));
  } catch(e) {
    console.warn('[irep] offline:', e.message);
    CATALOG=window._CAT||[]; RUBROS=window._RUB||[]; MET=window._MET||{};
    let id=0; CART=(window._PROC||[]).map(p=>({...p,_id:id++,estado:calcE(p)}));
    if(CATALOG.length===0){
      setLd('Sin conexión — verificá que node server.js esté corriendo');
      document.querySelector('#loader .ld-dots').style.display='none';
      return;
    }
    notify('Modo sin conexión','warn');
  }
  setLd('Iniciando…');
  hideLd(); initUI(); updateStreak();
  document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeDP(); });
  setTimeout(()=>{ if(typeof loadNovedades==='function') loadNovedades(); }, 1500);
  // Lazy load ventas.js after UI is ready
  if(!window._VS){
    setTimeout(()=>{
      const s=document.createElement('script'); s.src='ventas.js';
      s.onload=()=>console.log('[ventas] loaded'); document.head.appendChild(s);
    }, 800);
  }
});

async function loadData(force=false){
  const r=await fetch(SERVER+'/api/data'+(force?'?refresh=1':''),{signal:AbortSignal.timeout(8000)});
  if(!r.ok) throw new Error('HTTP '+r.status);
  const d=await r.json();
  CATALOG=d.catalog||[]; RUBROS=d.rubros||[]; MET=d.met||window._MET||{}; if(d.max)window._MAX=d.max; setSyncTs(d.ts);
}
async function loadProceso(){
  const r=await fetch(SERVER+'/api/proceso',{signal:AbortSignal.timeout(8000)});
  if(!r.ok) throw new Error('HTTP '+r.status);
  let id=0; const d=await r.json();
  CART=(d.proceso||[]).map(p=>({...p,_id:id++}));
}
async function loadImages(){
  const r=await fetch(SERVER+'/api/images',{signal:AbortSignal.timeout(45000)});
  if(!r.ok) return;
  const d=await r.json();
  if(d.ok&&d.map){ IMG_MAP=d.map; console.log('[images] '+d.count+' loaded'); injectImages(); }
}
function imgUrl(path){ return path?(IMG_MAP[path]||''):''; }
function injectImages(){
  document.querySelectorAll('.dp-trigger[data-code]').forEach(card=>{
    const item=CATALOG.find(x=>x.c===card.dataset.code);
    if(!item||!item.img) return;
    const url=imgUrl(item.img); if(!url) return;
    let wrap=card.querySelector('.card-img');
    if(!wrap){
      wrap=document.createElement('div'); wrap.className='card-img';
      const img=document.createElement('img'); img.loading='lazy'; img.alt='';
      img.onerror=()=>{wrap.style.display='none';};
      wrap.appendChild(img); card.insertBefore(wrap,card.firstChild);
    }
    const img=wrap.querySelector('img'); if(img&&!img.src) img.src=url;
  });
}
function calcE(p){ return (p.ecA||p.ecB)?'camino':(p.pedido||p.fecha)?'pedido':'pendiente'; }
function setSyncTs(ts){ const el=document.getElementById('syncTs'); if(el&&ts) el.textContent=new Date(ts).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}); }
async function forceRefresh(){
  document.getElementById('loader').style.display='flex';
  document.getElementById('app').style.display='none';
  setLd('Actualizando...');
  try{ await Promise.all([loadData(true),loadProceso()]); notify('Actualizado','ok'); }
  catch(e){ notify('Error: '+e.message,'warn'); }
  hideLd(); renderHUD(); renderCatalog(); updateGlobals(); updateBadge();
}
function setLd(m){ document.getElementById('ldMsg').textContent=m; }
function hideLd(){ document.getElementById('loader').style.display='none'; document.getElementById('app').style.display='flex'; }

function updateStreak(){
  const g=MET.global||{}, score=g.score_ponderado||0, today=new Date().toISOString().slice(0,10);
  if(streak.lastDate!==today){
    if(score>streak.lastScore) streak.days++;
    else if(score<streak.lastScore) streak.days=0;
    streak.lastScore=score; streak.lastDate=today;
    localStorage.setItem('irep_streak',JSON.stringify(streak));
  }
  const el=document.getElementById('streakBadge');
  if(el) el.textContent=streak.days>0?'🔥 '+streak.days+'d racha':'—';
}

function initUI(){
  const rs=[...new Set(CATALOG.map(x=>x.r).filter(Boolean))].sort();
  ['rubroF','rkRubroF'].forEach(id=>{
    const s=document.getElementById(id); if(!s) return;
    s.innerHTML='<option value="">Todos los rubros</option>'+rs.map(r=>'<option value="'+r+'">'+r+'</option>').join('');
  });
  renderHUD(); renderCatalog(); updateGlobals(); updateBadge();
}
function goPage(id,btn){
  document.querySelectorAll('.tb-tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.page').forEach(p=>{p.style.display='none';p.classList.remove('active');});
  const pg=document.getElementById('p-'+id); if(!pg) return;
  pg.style.display='flex'; pg.classList.add('active');
  if(id==='carrito') renderCart();

  if(id==='cotizador') renderCotizador();
  if(id==='analytics'){ if(typeof renderAnalytics==='function') renderAnalytics(); }
  if(id==='novedades'){  if(typeof renderNovedades==='function') renderNovedades(); }
  if(id==='cap'){ if(!_capData&&typeof loadCap==='function') loadCap(); else if(typeof renderCap==='function') renderCap(); }
  if(id==='motor'){
    const mc=document.getElementById('motorContainer');
    if(mc) mc.innerHTML='<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:16px;color:var(--muted)">'
      +'<div style="width:40px;height:40px;border:3px solid var(--b);border-top-color:var(--cyan);border-radius:50%;animation:spin 1s linear infinite"></div>'
      +'<div style="font-size:12px">Cargando motor de decisión...</div></div>';
    if(!window._MOTOR){
      const s=document.createElement('script'); s.src='motor.js';
      s.onload=()=>setTimeout(renderMotor,50);
      document.head.appendChild(s);
    } else { setTimeout(renderMotor,20); }
  }
  closeDP();
}
function goPageCot(btn){ goPage('cotizador',btn); }
function updateGlobals(){
  const tot=CATALOG.reduce((a,x)=>a+x.stk,0);
  document.getElementById('hdrStock').textContent=tot.toLocaleString('es-AR');
  document.getElementById('hdrAlerta').textContent=CATALOG.filter(x=>x.stk===0).length.toLocaleString('es-AR');
  const g=MET.global||{};
  document.getElementById('tbScore').textContent=(g.score_ponderado||0)+'%';
}

// HUD
function renderHUD(){
  const g=MET.global||{}, rubros=MET.rubros||[], scorePct=g.score_ponderado||0;
  document.getElementById('hudScoreNum').textContent=scorePct+'%';
  document.getElementById('hudScoreSub').textContent=(g.con_stk||0).toLocaleString('es-AR')+' con stock de '+(g.total||0).toLocaleString('es-AR');
  document.getElementById('hudRing').style.strokeDashoffset=138-138*(scorePct/100);
  document.getElementById('hudM1').textContent=(g.pct_stk||0)+'%';
  document.getElementById('hudM1bar').style.width=(g.pct_stk||0)+'%';
  document.getElementById('hudM2').textContent=(g.rubros_activos||0)+'/'+(g.rubros_total||0);
  document.getElementById('hudM2bar').style.width=Math.round((g.rubros_activos||0)/(g.rubros_total||1)*100)+'%';
  document.getElementById('hudM3').textContent=scorePct+'%';
  document.getElementById('hudM3bar').style.width=scorePct+'%';
  document.getElementById('hudM4').textContent=(g.rubros_full||0);
  document.getElementById('hudM4bar').style.width=Math.round((g.rubros_full||0)/(g.rubros_total||1)*100)+'%';
  document.getElementById('achieveStrip').innerHTML=ACHS.map(a=>{
    const ok=a.check(g);
    return '<div class="ach '+(ok?'unlocked':'locked')+'" title="'+a.name+'">'
      +'<div class="ach-icon">'+a.icon+'</div>'
      +'<div class="ach-info"><div class="ach-name">'+a.name+'</div></div>'
      +'</div>';
  }).join('');
  renderMissions(); renderUrgencyList(rubros);
  shelfItems=CATALOG.filter(x=>x.r).map(x=>{const rb=rubros.find(r=>r.r===x.r)||{}; return {...x,urgency:rb.urgency||0};});
  renderShelf();
}

function getMissionItems(){
  return CATALOG.filter(x=>x.rnk>0&&(x.stk===0||x.stk<=2))
    .map(x=>({...x,urg:x.stk===0?x.rnk:x.rnk*0.4}))
    .sort((a,b)=>b.urg-a.urg).slice(0,10);
}
function calcProjectedScore(items){
  const g=MET.global||{}, totalRnk=g.total_ventas||64435;
  const coveredRnk=Math.round((g.score_ponderado||77.2)/100*totalRnk);
  const additional=items.filter(x=>x.stk===0).reduce((a,x)=>a+x.rnk,0);
  return Math.min(100,Math.round((coveredRnk+additional)/totalRnk*1000)/10);
}
function renderMissions(){
  const mp=document.getElementById('missionPanel'); if(!mp) return;
  const items=getMissionItems(), projected=calcProjectedScore(items);
  const current=(MET.global||{}).score_ponderado||77.2;
  const delta=Math.round((projected-current)*10)/10;
  const cartSet=new Set(CART.map(c=>c.c));
  const pending=items.filter(x=>!cartSet.has(x.c)).length;
  const deltaHtml=delta>0?'<span class="impact-delta pos">+'+delta+'%</span>':'';
  const listHtml=items.map((item,i)=>{
    const done=cartSet.has(item.c);
    const urgPct=items[0].urg>0?Math.min(100,Math.round(item.urg/items[0].urg*100)):0;
    return '<div class="mission-item '+(done?'done':'')+'" data-code="'+item.c+'">'
      +'<div class="mission-rank">'+(done?'✓':(i+1))+'</div>'
      +'<div class="mission-info">'
      +'<div class="mission-code">'+item.c+'</div>'
      +'<div class="mission-desc">'+(item.d?item.d.slice(0,46):'')+'</div>'
      +'<div class="mission-urg-bar"><div class="mission-urg-fill" style="width:'+urgPct+'%"></div></div>'
      +'</div>'
      +'<div class="mission-meta">'
      +'<div class="mission-stk '+(item.stk===0?'zero':'')+'">'+( item.stk===0?'SIN STK':item.stk+' u.')+'</div>'
      +'<div class="mission-rnk">▲'+item.rnk+'</div>'
      +'</div>'
      +'<button class="mission-btn '+(done?'done':'')+'" data-tc="'+item.c+'" onclick="missionAdd(this)">'+(done?'✓':'+ Pedir')+'</button>'
      +'</div>';
  }).join('');
  mp.innerHTML='<div class="mission-header">'
    +'<div class="mission-title"><span>🎯</span><span>Misión del día</span><span class="mission-badge">'+pending+' pendientes</span></div>'
    +'<div class="mission-impact"><span class="impact-label">Si reponés estos:</span>'
    +'<span class="impact-score">'+current+'% → <strong>'+projected+'%</strong></span>'+deltaHtml+'</div></div>'
    +'<div class="mission-list">'+listHtml+'</div>';
}
function missionAdd(btn){ toggleCart(btn.dataset.tc); renderMissions(); }

function renderUrgencyList(rubros){
  const all=[...rubros].sort((a,b)=>b.urgency-a.urgency);
  document.getElementById('urgCount').textContent=all.filter(r=>r.sin>0).length+' con faltantes';
  document.getElementById('urgencyList').innerHTML=all.map(rb=>{
    const pct=rb.pct;
    const col=pct===100?'var(--green)':pct===0?'var(--red)':pct<50?'var(--orange)':pct<80?'var(--amber)':'var(--cyan)';
    const bg=pct===100?'rgba(52,211,153,.12)':pct===0?'rgba(248,113,113,.15)':pct<50?'rgba(251,146,60,.12)':pct<80?'rgba(251,191,36,.1)':'rgba(34,211,238,.08)';
    return '<div class="urg-item '+(activeRubro===rb.r?'active-rubro':'')+'" data-rubro="'+rb.r+'" onclick="urgClick(this)">'
      +'<div class="urg-badge" style="background:'+bg+';color:'+col+'">'+Math.round(pct)+'%</div>'
      +'<div class="urg-info"><div class="urg-name">'+rb.r+'</div>'
      +'<div class="urg-meta">'+rb.con+'/'+rb.total+(rb.urgency>0?' · ▲'+rb.urgency:'')+'</div></div>'
      +'<div class="urg-pct-bar"><div class="mini-bar"><div class="mini-fill" style="width:'+pct+'%;background:'+col+'"></div></div></div>'
      +'</div>';
  }).join('');
}
function urgClick(el){
  const rb=el.dataset.rubro;
  activeRubro=activeRubro===rb?null:rb;
  document.querySelectorAll('.urg-item').forEach(e=>e.classList.toggle('active-rubro',e.dataset.rubro===activeRubro));
  renderShelf();
}

function toggleLinea(){
  const btn=document.getElementById('lineaBtn');
  const lineas=(MET.lineas||[]).map(l=>l.ln).filter(l=>l&&l!=='SIN LÍNEA');
  if(!shelfLinea){ shelfLinea=lineas[0]||''; }
  else { const idx=lineas.indexOf(shelfLinea); shelfLinea=idx>=lineas.length-1?'':lineas[idx+1]; }
  btn.textContent='Línea: '+(shelfLinea||'todas'); btn.classList.toggle('active',!!shelfLinea); renderShelf();
}
function cycleSort(){
  const sorts=['urgency','rnk','stk_asc','stk_desc'];
  const labels={urgency:'▼ Urgente',rnk:'▼ Ventas',stk_asc:'▲ Menos stock',stk_desc:'▼ Más stock'};
  const idx=sorts.indexOf(shelfSort); shelfSort=sorts[(idx+1)%sorts.length];
  document.getElementById('sortBtn').textContent=labels[shelfSort]; renderShelf();
}
function filterShelf(){ renderShelf(); }
function renderShelf(){
  const q=(document.getElementById('shelfSearch').value||'').trim().toUpperCase();
  let pool=[...shelfItems];
  if(activeRubro) pool=pool.filter(x=>x.r===activeRubro);
  if(shelfLinea)  pool=pool.filter(x=>x.ln&&x.ln.includes(shelfLinea));
  if(q)           pool=pool.filter(x=>(x.c+x.d+x.r).toUpperCase().includes(q));
  if(shelfSort==='urgency')    pool.sort((a,b)=>(a.stk===0&&b.stk>0?-1:b.stk===0&&a.stk>0?1:0)||(b.urgency-a.urgency)||(b.rnk-a.rnk));
  else if(shelfSort==='rnk')   pool.sort((a,b)=>b.rnk-a.rnk);
  else if(shelfSort==='stk_asc') pool.sort((a,b)=>a.stk-b.stk);
  else pool.sort((a,b)=>b.stk-a.stk);
  document.getElementById('shelfCount').textContent=pool.length.toLocaleString('es-AR')+' artículos';
  if(!activeRubro&&!q){ renderShelfByLine(pool); }
  else { document.getElementById('shelfGrid').innerHTML=pool.slice(0,300).map(item=>shelfCell(item)).join(''); }
}
function shelfCell(item){
  const cls=item.stk===0?(item.rnk>50?'critical':'empty'):item.stk<=2?'low':'full';
  const stk=item.stk===0?'0':item.stk>99?'99+':String(item.stk);
  const lbl=item.r.length>8?item.r.slice(0,8)+'…':item.r;
  const rnkShow=item.rnk>0?'▲'+(item.rnk>999?Math.round(item.rnk/1000)+'k':item.rnk):'';
  const c=item.stk===0?'var(--red)':item.stk<=2?'var(--amber)':'var(--green)';
  return '<div class="shelf-cell '+cls+' dp-trigger" data-code="'+item.c+'">'
    +'<div class="sc-stk" style="color:'+c+'">'+stk+'</div>'
    +'<div class="sc-lbl">'+lbl+'</div>'
    +(rnkShow?'<div class="sc-rnk">'+rnkShow+'</div>':'')+'</div>';
}
function renderShelfByLine(pool){
  const groups={};
  pool.forEach(item=>{
    const lns=item.ln?item.ln.split(',').map(l=>l.trim()).filter(Boolean):['SIN LÍNEA'];
    lns.forEach(ln=>{ if(!groups[ln]) groups[ln]=[]; groups[ln].push(item); });
  });
  const sorted=Object.entries(groups).sort((a,b)=>b[1].filter(x=>x.stk===0).length-a[1].filter(x=>x.stk===0).length);
  document.getElementById('shelfGrid').innerHTML=sorted.slice(0,12).map(([ln,items])=>{
    const zeroCount=items.filter(x=>x.stk===0).length;
    const pct=Math.round((items.filter(x=>x.stk>0).length/items.length)*100);
    const pctColor=pct===100?'var(--green)':pct<50?'var(--red)':pct<80?'var(--amber)':'var(--cyan)';
    return '<div class="shelf-pasillo">'
      +'<div class="pasillo-header" onclick="togglePasillo(this)">'
      +'<span class="pasillo-icon">▼</span><span class="pasillo-name">'+ln+'</span>'
      +'<span class="pasillo-pct" style="color:'+pctColor+'">'+pct+'%</span>'
      +'<span class="pasillo-count">'+items.length+' art.</span>'
      +(zeroCount>0?'<span class="pasillo-alert">⚠ '+zeroCount+' sin stock</span>':'')
      +'</div>'
      +'<div class="pasillo-grid">'+items.slice(0,80).map(item=>shelfCell(item)).join('')+'</div>'
      +'</div>';
  }).join('');
}
function togglePasillo(header){
  const grid=header.nextElementSibling, icon=header.querySelector('.pasillo-icon');
  const collapsed=grid.style.display==='none';
  grid.style.display=collapsed?'':'none'; icon.textContent=collapsed?'▼':'▶';
}

// Search engine
function norm(s){ return s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9]/g,' ').replace(/\s+/g,' ').trim(); }
function toks(s){ return norm(s).split(' ').filter(t=>t.length>1); }
function bigrams(s){ const n=norm(s),o=new Set(); for(let i=0;i<n.length-1;i++) o.add(n[i]+n[i+1]); return o; }
function bigramSim(a,b){ const ba=bigrams(a),bb=bigrams(b); let c=0; ba.forEach(g=>{ if(bb.has(g)) c++; }); return c*2/(ba.size+bb.size||1); }
function scoreItem(item,ts,raw){
  const hay=norm(item.c+' '+item.d+' '+item.r+' '+item.m+' '+item.mo);
  const hayW=new Set(toks(hay)); let matched=0,score=0;
  for(const t of ts){
    if(hay.includes(t)){ score+=t.length*3; matched++; }
    else { let best=0; for(const hw of hayW){ if(Math.abs(hw.length-t.length)<=2) best=Math.max(best,bigramSim(t,hw)); } if(best>0.62){ score+=t.length*best; matched+=0.6; } }
  }
  if(matched<ts.length*0.9) return 0;
  if(norm(item.c).includes(norm(raw))) score+=50;
  score+=Math.log1p(item.rnk)*0.8; return score;
}
function onSearch(){ clearTimeout(searchTimer); searchTimer=setTimeout(renderCatalog,160); }
function renderCatalog(){
  const q=document.getElementById('searchInput').value.trim();
  const rF=document.getElementById('rubroF').value, sF=document.getElementById('stockF').value;
  let pool=CATALOG;
  if(rF) pool=pool.filter(x=>x.r===rF);
  if(sF==='pos')  pool=pool.filter(x=>x.stk>0);
  if(sF==='zero') pool=pool.filter(x=>x.stk===0);
  if(q.length>=2){
    const ts2=toks(q);
    if(ts2.length>0) pool=pool.map(item=>{ const sc=scoreItem(item,ts2,q); return sc>0?{item,sc}:null; }).filter(Boolean).sort((a,b)=>b.sc-a.sc).map(x=>x.item);
  }
  document.getElementById('searchMeta').textContent=pool.length.toLocaleString('es-AR')+' resultados';
  const grid=document.getElementById('catalogGrid');
  if(!pool.length){ grid.innerHTML='<div class="empty" style="grid-column:1/-1"><div class="empty-icon">🔍</div>Sin resultados</div>'; return; }
  const cs=new Set(CART.map(c=>c.c));
  grid.innerHTML=pool.slice(0,120).map(item=>cardH(item,cs)).join('');
}
function scCls(s){ return s===0?'sp0':s<=2?'sp1':s<=10?'sp2':'sp3'; }
function scLbl(s){ return s===0?'0 u.':'✓ '+s; }
function cardH(item,cs){
  const MAX=window._MAX||1, pct=item.rnk>0?Math.min(100,Math.round(item.rnk/MAX*100)):0, inC=cs.has(item.c);
  const mvs=[...new Set((item.rev||[]).map(r=>r.mv).filter(Boolean))].slice(0,2).join(', ');
  const imgPath=item.img?imgUrl(item.img):'';
  const stkColor=item.stk===0?'var(--red)':item.stk<=2?'var(--amber)':'var(--green)';
  return '<div class="card '+(inC?'in-cart':'')+' dp-trigger" data-code="'+item.c+'">'
    +(imgPath?'<div class="card-img"><img src="'+imgPath+'" alt="" loading="lazy" onerror="this.parentElement.style.display=\'none\'"></div>':'')
    +'<div class="card-top"><div class="card-code">'+item.c+'</div><div class="sp '+scCls(item.stk)+'" style="color:'+stkColor+'">'+scLbl(item.stk)+'</div></div>'
    +'<div class="card-desc">'+(item.d||'')+'</div>'
    +'<div class="card-tags">'+(item.r?'<span class="tag rub">'+item.r+'</span>':'')+(item.m?'<span class="tag mar">'+item.m+'</span>':'')+(mvs?'<span class="tag">'+mvs+'</span>':'')+'</div>'
    +(item.rnk>0?'<div class="rnk-row"><span class="rnk-val">▲'+item.rnk+'</span><div class="rnk-bar"><div class="rnk-fill" style="width:'+pct+'%"></div></div></div>':'')
    +'<div class="card-btn-row">'
    +(inC?'<button class="btn-incart tc-trigger" data-tc="'+item.c+'"><span class="btn-icon">✓</span> En carrito</button>':'<button class="btn-add tc-trigger" data-tc="'+item.c+'"><span class="btn-icon">＋</span> Agregar</button>')
    +'<button class="btn-cot" onclick="event.stopPropagation();addToCot(\''+item.c+'\')" title="Cotizar">💰</button>'
    +'</div></div>';
}

// Detail panel
function openDP(code){
  const item=CATALOG.find(x=>x.c===code); if(!item) return;
  currentItem=item;
  document.getElementById('dpCode').textContent=item.c;
  document.getElementById('dpTitle').textContent=item.d||'—';
  const inC=CART.some(c=>c.c===item.c);
  const btn=document.getElementById('dpBtn');
  btn.textContent=inC?'✓ Ya en carrito':'+ Agregar al carrito'; btn.style.background=inC?'var(--b2)':'';
  const marcas=[...new Set((item.rev||[]).map(r=>r.mv).filter(Boolean))].join(', ');
  const precio=item.p?'$ '+Math.round(item.p).toLocaleString('es-AR'):'—';
  const imgPath=item.img?imgUrl(item.img):'';
  const revRows=(item.rev||[]).slice(0,25).map(rr=>{
    const sc3=rr.stk>5?'sok':rr.stk>0?'slow':'sno';
    return '<tr><td><span class="rev-code">'+rr.k+'</span></td><td style="font-size:10px;color:var(--muted)">'+(rr.mv||'—')+'</td><td style="font-size:10px;color:var(--muted)">'+(rr.mr||'—')+'</td><td class="'+sc3+'">'+rr.stk+'</td><td style="color:var(--amber);font-family:var(--mono);font-size:9px">'+(rr.rnk>0?'▲'+rr.rnk:'—')+'</td></tr>';
  }).join('');
  document.getElementById('dpBody').innerHTML=
    (imgPath?'<div class="dp-img-wrap"><img src="'+imgPath+'" alt="" onerror="this.parentElement.style.display=\'none\'"></div>':'')
    +'<div><div class="dp-sec">Resumen</div>'
    +'<div class="dp-kv"><span>Stock total</span><span style="color:'+(item.stk===0?'var(--red)':item.stk<=2?'var(--amber)':'var(--green)')+'">'+item.stk+' u.</span></div>'
    +'<div class="dp-kv"><span>Ventas totales</span><span style="color:var(--amber)">'+(item.rnk>0?item.rnk:'—')+'</span></div>'
    +'<div class="dp-kv"><span>Precio ref.</span><span>'+precio+'</span></div>'
    +'<div class="dp-kv"><span>Rubro</span><span>'+(item.r||'—')+'</span></div>'
    +'<div class="dp-kv"><span>Línea</span><span>'+(item.ln||'—')+'</span></div>'
    +'<div class="dp-kv"><span>Marca vehículo</span><span>'+(marcas||'—')+'</span></div></div>'
    +((item.rev||[]).length?'<div><div class="dp-sec">Variantes NETEGIA ('+item.rev.length+')</div><div style="overflow-x:auto"><table class="rev-tbl"><thead><tr><th>Cód. NETEGIA</th><th>Veh.</th><th>Rep.</th><th>Stock</th><th>Vend.</th></tr></thead><tbody>'+revRows+'</tbody></table></div></div>':'');
  document.getElementById('dp').classList.add('open');
}
function closeDP(){ document.getElementById('dp').classList.remove('open'); currentItem=null; }
function addFromDP(){ if(!currentItem) return; toggleCart(currentItem.c); closeDP(); }

document.addEventListener('click',function(e){
  const tc=e.target.closest('.tc-trigger');
  if(tc&&tc.dataset.tc){ e.stopPropagation(); toggleCart(tc.dataset.tc); return; }
  const dp=e.target.closest('.dp-trigger');
  if(dp&&dp.dataset.code&&!e.target.closest('.tc-trigger')&&!e.target.closest('.btn-cot')){ openDP(dp.dataset.code); return; }
});

// Cart
function toggleCart(code){
  const idx=CART.findIndex(c=>c.c===code);
  if(idx>=0){ CART.splice(idx,1); notify('Removido del carrito'); }
  else {
    const item=CATALOG.find(x=>x.c===code); if(!item) return;
    CART.push({_id:cartIdCtr++,_row:null,c:item.c,d:item.d,m:item.m,mo:item.mo,r:item.r,img:item.img||'',qty:'1',prov:'',pedido:'FALSE',ecA:'',ecB:'',fecha:''});
    fetch(SERVER+'/api/proceso/append',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({c:item.c,d:item.d,m:item.m,mo:item.mo,r:item.r,img:item.img||'',qty:'1'})})
      .then(r=>r.json()).then(d=>{ if(d.ok&&d.row){ const ci=CART.find(x=>x.c===item.c); if(ci) ci._row=d.row; } }).catch(()=>{});
    notify('Agregado al carrito','ok');
  }
  updateBadge(); renderCatalog();
}
function updateBadge(){ const b=document.getElementById('cartBadge'); b.textContent=CART.length; b.style.display=CART.length>0?'':'none'; }
function cartSort(field){
  if(cartSortField===field){ cartSortDir*=-1; }
  else { cartSortField=field; cartSortDir=-1; }
  // Update sort arrows in thead
  ['art','rnk','stk','rhy','cov','prov','estado','dias'].forEach(f=>{
    const el=document.getElementById('sa-'+f);
    if(!el)return;
    if(cartSortField===f){ el.textContent=''; el.className='sa '+(cartSortDir===-1?'desc':'asc'); }
    else { el.textContent='↕'; el.className='sa'; }
  });
  renderCart();
}


// ── CART FUZZY SEARCH ─────────────────────────────────────────
function cartMatchesQuery(r, query) {
  if (!query) return true;
  const terms = norm(query).split(' ').filter(t => t.length > 0);
  if (!terms.length) return true;
  const cat = CATALOG.find(x => x.c === r.c) || {};
  const revCodes = (cat.rev || []).map(rv => rv.k).join(' ');
  const hay = norm([r.c, r.d||'', r.r||'', r.prov||'', revCodes].join(' '));
  return terms.every(t => {
    if (hay.includes(t)) return true;                          // exact / prefix
    const words = hay.split(' ').filter(w => w.length > 1);
    return words.some(w => w.startsWith(t) || bigramSim(t,w) > 0.5); // prefix OR fuzzy
  });
}


function chipFilter(btn,val){
  document.getElementById('cartEstadoF').value=val;
  document.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));
  btn.classList.add('active');
  cartPage=0; renderCart();
}
function renderCart(){
  const eF=document.getElementById('cartEstadoF').value;
  const sQ=(document.getElementById('cartSearch').value||'').trim().toUpperCase();
  const counts={pendiente:0,pedido:0,camino:0};
  CART.forEach(r=>{
    if(r.ecA||r.ecB) counts.camino++;
    else if(r.pedido==='TRUE'||r.pedido===true) counts.pedido++;
    else counts.pendiente++;
  });
  renderScoreImpact();
  document.getElementById('cartStats').innerHTML=[
    {l:'Total',v:CART.length,c:'',e:''},
    {l:'Pendiente',v:counts.pendiente,c:'amber',e:'pendiente'},
    {l:'Pedido',v:counts.pedido,c:'cyan',e:'pedido'},
    {l:'En camino',v:counts.camino,c:'purple',e:'camino'},
    {l:'Recibidos',v:counts.recibido,c:'green',e:'recibido'},
  ].map(s=>'<div class="stat-card" onclick="filterByEstado(\''+s.e+'\')" style="cursor:pointer"><div class="stat-val '+s.c+'">'+s.v+'</div><div class="stat-lbl">'+s.l+'</div></div>').join('');
  cartFiltered=CART.filter(r=>{
    if(eF){
      const enCamino=!!(r.ecA||r.ecB);
      const pedido=(r.pedido==='TRUE'||r.pedido===true)&&!enCamino;
      const pendiente=!pedido&&!enCamino;
      if(eF==='camino'&&!enCamino) return false;
      if(eF==='pedido'&&!pedido) return false;
      if(eF==='pendiente'&&!pendiente) return false;
    }
    if(sQ&&!cartMatchesQuery(r,sQ)) return false;
    return true;
  });
  // Apply sort
  if(cartSortField){
    const estadoOrder={pendiente:0,pedido:1,camino:2,recibido:3};
    cartFiltered.sort((a,b)=>{
      let va=0, vb=0;
      const ca=CATALOG.find(x=>x.c===a.c)||{};
      const cb=CATALOG.find(x=>x.c===b.c)||{};
      const vsa=(window._VS||{})[a.c]||{};
      const vsb=(window._VS||{})[b.c]||{};
      if(cartSortField==='rnk'){       va=ca.rnk||0;              vb=cb.rnk||0; }
      else if(cartSortField==='stk'){  va=ca.stk??999;             vb=cb.stk??999; }
      else if(cartSortField==='rhy'){  va=vsa.rhy||0;              vb=vsb.rhy||0; }
      else if(cartSortField==='cov'){
        const ra=CATALOG.find(x=>x.c===a.c)||{}, rb=CATALOG.find(x=>x.c===b.c)||{};
        const rha=vsa.rhy||0, rhb=vsb.rhy||0;
        va=rha>0?(ra.stk||0)/rha:999; vb=rhb>0?(rb.stk||0)/rhb:999;
      }
      else if(cartSortField==='estado'){va=estadoOrder[a.estado]??0;vb=estadoOrder[b.estado]??0; }
      else if(cartSortField==='prov'){ va=(a.prov||'').toLowerCase();vb=(b.prov||'').toLowerCase(); return va<vb?-cartSortDir:va>vb?cartSortDir:0; }
      else if(cartSortField==='art'){  va=(a.r||a.c).toLowerCase();  vb=(b.r||b.c).toLowerCase(); return va<vb?-cartSortDir:va>vb?cartSortDir:0; }
      else if(cartSortField==='dias'){ va=daysAgo(a.fecha)??-1;    vb=daysAgo(b.fecha)??-1; }
      return (va-vb)*cartSortDir;
    });
  }
  const total=Math.max(1,Math.ceil(cartFiltered.length/CART_PG));
  if(cartPage>=total) cartPage=0;
  document.getElementById('cartSub').textContent=CART.length+' artículos · '+cartFiltered.length+' visibles';
  renderCartTable();
}
function filterByEstado(e){ const sel=document.getElementById('cartEstadoF'); sel.value=(sel.value===e||!e)?'':e; cartPage=0; renderCart(); }
function renderScoreImpact(){
  const g=MET.global||{}, totalRnk=g.total_ventas||64435, current=g.score_ponderado||77.2;
  const coveredRnk=Math.round(current/100*totalRnk);
  const zeroInCart=CART.map(c=>CATALOG.find(x=>x.c===c.c)).filter(x=>x&&x.stk===0);
  const additional=zeroInCart.reduce((a,x)=>a+x.rnk,0);
  const projected=Math.min(100,Math.round((coveredRnk+additional)/totalRnk*1000)/10);
  const delta=Math.round((projected-current)*10)/10;
  const el=document.getElementById('scoreImpactPanel'); if(!el) return;
  el.innerHTML='<div class="impact-panel">'
    +'<div class="impact-left"><div class="impact-title">📈 Impacto proyectado</div>'
    +'<div class="impact-desc">Si recibís los '+zeroInCart.length+' artículos sin stock:</div></div>'
    +'<div class="impact-right"><div class="impact-numbers">'
    +'<span class="impact-from">'+current+'%</span><span class="impact-arrow">→</span>'
    +'<span class="impact-to">'+projected+'%</span>'
    +(delta>0?'<span class="impact-gain">+'+delta+'%</span>':'<span class="impact-zero">sin impacto aún</span>')
    +'</div><div class="impact-bar-wrap"><div class="impact-bar-bg">'
    +'<div class="impact-bar-cur" style="width:'+current+'%"></div>'
    +'<div class="impact-bar-proj" style="width:'+Math.max(current,projected)+'%;opacity:.35"></div>'
    +'</div></div></div></div>';
}

const KCOLS=[
  {id:'pendiente',label:'📋 Pendiente',desc:'Sin enviar',   color:'var(--amber)'},
  {id:'pedido',   label:'📤 Pedido',   desc:'Al proveedor', color:'var(--cyan)'},
  {id:'camino',   label:'🚚 En camino',desc:'En tránsito',  color:'var(--purple)'},
  {id:'recibido', label:'✅ Recibido', desc:'En depósito',  color:'var(--green)'},
];
function renderCartTable(){
  const start=cartPage*CART_PG, page=cartFiltered.slice(start,start+CART_PG);
  const total=Math.ceil(cartFiltered.length/CART_PG);
  if(!page.length){
    document.getElementById('cartBody').innerHTML='<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--muted)">Sin artículos</td></tr>';
    document.getElementById('cartPager').innerHTML=''; return;
  }
  document.getElementById('cartBody').innerHTML=page.map(r=>cartRow(r)).join('');
  if(total<=1){ document.getElementById('cartPager').innerHTML=''; return; }
  document.getElementById('cartPager').innerHTML='<div class="pager">'
    +'<button class="pager-btn" onclick="cartGo(0)" '+(cartPage===0?'disabled':'')+'>«</button>'
    +'<button class="pager-btn" onclick="cartGo('+(cartPage-1)+')" '+(cartPage===0?'disabled':'')+'>‹</button>'
    +'<span class="pager-info">'+(cartPage+1)+' / '+total+'</span>'
    +'<button class="pager-btn" onclick="cartGo('+(cartPage+1)+')" '+(cartPage>=total-1?'disabled':'')+'>›</button>'
    +'<button class="pager-btn" onclick="cartGo('+(total-1)+')" '+(cartPage>=total-1?'disabled':'')+'>»</button>'
    +'</div>';
}
function cartRow(r){
  const cat=CATALOG.find(x=>x.c===r.c)||{};
  const stk=cat.stk!=null?cat.stk:null;
  const rnk=cat.rnk||0;
  const vs=(window._VS||{})[r.c]||{};
  const rhy=vs.rhy||0;
  const cov=rhy>0&&stk!==null?Math.round(stk/rhy*10)/10:null;
  const covColor=cov===null?'var(--muted)':cov<1?'var(--red)':cov<2?'var(--amber)':'var(--green)';
  const covTxt=cov===null?'—':cov+'m';

  const stkColor=stk===0?"var(--red)":stk===null?"var(--muted)":stk<=2?"var(--amber)":stk<=10?"var(--cyan)":"var(--green)";
  const stkTxt=stk===null?"—":stk===0?"✕ 0":"✓ "+stk;
  const urgScore=rnk>0&&stk!==null?Math.min(100,Math.round(rnk/(Math.max(stk,0.5)*8))):0;
  const urgColor=urgScore>75?"var(--red)":urgScore>45?"var(--amber)":urgScore>20?"var(--cyan)":"var(--green)";

  // Determine visual state from Sheet fields
  const enCamino=!!(r.ecA||r.ecB);
  const isPedido=(r.pedido==="TRUE"||r.pedido===true)&&!enCamino;
  const stateColor=enCamino?"var(--purple)":isPedido?"var(--cyan)":"var(--amber)";
  const stateLabel=enCamino?"🚚 En camino":isPedido?"📤 Pedido":"📋 Sin pedir";

  const imgPath=cat.img?imgUrl(cat.img):"";
  const imgCell=imgPath
    ? "<td class=\"ct-img\"><img src=\""+imgPath+"\" alt=\"\"></td>"
    : "<td class=\"ct-img-empty\"></td>";

  const dias=daysAgo(r.fecha);
  const db=dias===null?"":dias>14?"<span class=\"days-late\">"+dias+"d</span>":dias>7?"<span class=\"days-warn\">"+dias+"d</span>":"<span class=\"days-ok\">"+dias+"d</span>";

  // PEDIDO checkbox (TRUE/FALSE)
  const pedidoCheck="<input type=\"checkbox\" "+(r.pedido==="TRUE"||r.pedido===true?"checked":"")+
    " data-id=\""+r._id+"\" data-f=\"pedido\" onchange=\"updCiCheck(this)\" onclick=\"event.stopPropagation()\">";

  return "<tr class=\"cr\" data-id=\""+r._id+"\" onclick=\"openCartStats('"+r.c+"')\" style=\"cursor:pointer\">"
    +imgCell
    +"<td class=\"ct-art\">"
    +"<div class=\"ct-code\">"+r.c+"</div>"
    +"<div class=\"ct-desc\">"+(r.d||"—")+"</div>"
    +"<div class=\"ct-rubro\">"+(r.r||"")+"</div>"
    +"</td>"
    +"<td class=\"ct-num\" style=\"color:var(--amber)\">"+(rnk>0?"▲"+rnk:"—")+"</td>"
    +"<td class=\"ct-num\" style=\"color:"+stkColor+"\">"+stkTxt+"</td>"
    +"<td class=\"ct-num\" style=\"color:var(--muted)\">"+(rhy>0?rhy+"/m":"—")+"</td>"+"<td class=\"ct-num\" style=\"color:"+covColor+"\">"+covTxt+"</td>"
    +"<td class=\"ct-urg\"><div class=\"ub\"><div class=\"ub-fill\" style=\"width:"+urgScore+"%;background:"+urgColor+"\"></div></div></td>"
    +"<td onclick=\"event.stopPropagation()\"><input class=\"qty-in\" type=\"number\" min=\"1\" value=\""+( r.qty||1)+"\" data-id=\""+r._id+"\" data-f=\"qty\" oninput=\"updCi(this)\"></td>"
    +"<td onclick=\"event.stopPropagation()\">"+pedidoCheck+"<span style=\"font-size:9px;color:"+stateColor+";margin-left:4px\">"+stateLabel+"</span></td>"
    +"<td onclick=\"event.stopPropagation()\" style=\"white-space:nowrap\"><input class=\"txt-in\" value=\""+( r.ecA||"")+"\" placeholder=\"Cód. fabricante A\" data-id=\""+r._id+"\" data-f=\"ecA\" onchange=\"updCi(this)\"><button onclick=\"event.stopPropagation();pasteToInput(this.previousElementSibling)\" title=\"Pegar código\" style=\"padding:2px 5px;margin-left:2px;background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.2);border-radius:3px;color:#22d3ee;font-size:10px;cursor:pointer;vertical-align:middle\">📋</button></td>"
    +"<td onclick=\"event.stopPropagation()\" style=\"white-space:nowrap\"><input class=\"txt-in\" value=\""+( r.ecB||"")+"\" placeholder=\"Cód. fabricante B\" data-id=\""+r._id+"\" data-f=\"ecB\" onchange=\"updCi(this)\"><button onclick=\"event.stopPropagation();pasteToInput(this.previousElementSibling)\" title=\"Pegar código\" style=\"padding:2px 5px;margin-left:2px;background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.2);border-radius:3px;color:#22d3ee;font-size:10px;cursor:pointer;vertical-align:middle\">📋</button></td>"
    +"<td onclick=\"event.stopPropagation()\"><input type=\"date\" class=\"date-in\" value=\""+normDate(r.fecha||"")+"\" data-id=\""+r._id+"\" data-f=\"fecha\" onchange=\"updCi(this)\"></td>"
    +"<td>"+db+"</td>"
    +"<td onclick=\"event.stopPropagation()\"><button class=\"db\" data-id=\""+r._id+"\" onclick=\"event.stopPropagation();rmCi(this)\">✕</button></td>"
    +"</tr>";
}

function updCi(el){ updC(+el.dataset.id,el.dataset.f,el.value); }
function updCiCheck(el){ updC(+el.dataset.id,el.dataset.f,el.checked?'TRUE':'FALSE'); }
function rmCi(el){ rmC(+el.dataset.id); }
function cartGo(p){ cartPage=Math.max(0,Math.min(p,Math.ceil(cartFiltered.length/CART_PG)-1)); renderCartTable(); document.getElementById('p-carrito').scrollTo(0,0); }
function updC(id,campo,val){
  const r=CART.find(r=>r._id===id); if(!r) return;
  r[campo]=val;
  // Auto-set fecha when pedido becomes TRUE
  if(campo==='pedido'&&val==='TRUE'&&!r.fecha) r.fecha=new Date().toISOString().slice(0,10);
  if(r._row){
    // For fecha field: convert YYYY-MM-DD → DD/MM/YYYY for Sheet
    let writeVal=val;
    if(campo==='fecha'&&val&&/^\d{4}-\d{2}-\d{2}$/.test(val)){
      const p=val.split('-'); writeVal=p[2]+'/'+p[1]+'/'+p[0];
    }
    fetch(SERVER+'/api/proceso/update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:r.c,campo,valor:writeVal})})
      .then(res=>res.json()).then(d=>{
        if(d.ok){
          // Flash green on the row to confirm save
          const row=document.querySelector('tr.cr[data-id="'+id+'"]') || document.querySelector('[data-id="'+id+'"]')?.closest('tr');
          if(row){ row.style.transition='background .15s'; row.style.background='rgba(52,211,153,.18)'; setTimeout(()=>row.style.background='',700); }
        }
      }).catch(()=>{});
  }
  updateBadge();
}
function rmC(id){
  const r=CART.find(r=>r._id===id);
  if(!r){ CART.splice(CART.findIndex(x=>x._id===id),1); updateBadge(); renderCart(); return; }
  // Delete from sheet by code (reliable - doesn't depend on row number)
  fetch(SERVER+'/api/proceso/delete',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({code:r.c})
  }).then(d=>d.json()).then(d=>{
    if(d.ok) console.log('[delete]',r.c, d.skipped?'(no estaba en Sheet)':'eliminado del Sheet');
    else console.warn('[delete] Error:',d.error);
  }).catch(()=>{});
  CART.splice(CART.findIndex(x=>x._id===id),1);
  updateBadge(); renderCart(); notify('Removido del carrito');
}
function normDate(d){
  if(!d) return '';
  d = String(d).trim();
  // Already YYYY-MM-DD
  if(/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  // DD/MM/YYYY or D/M/YYYY (Spanish format from Sheet)
  const m1=d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m1) return m1[3]+'-'+m1[2].padStart(2,'0')+'-'+m1[1].padStart(2,'0');
  // DD/MM/YY
  const m2=d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if(m2) return '20'+m2[3]+'-'+m2[2].padStart(2,'0')+'-'+m2[1].padStart(2,'0');
  // Excel serial number (days since 1900-01-01)
  if(/^\d{5}$/.test(d)){
    const dt=new Date((parseInt(d)-25569)*86400000);
    return dt.toISOString().slice(0,10);
  }
  // ISO timestamp 2026-04-06T00:00:00...
  if(d.length>10 && d.includes('T')) return d.slice(0,10);
  return '';
}
function daysAgo(d){ if(!d) return null; const x=new Date(normDate(d)); return isNaN(x)?null:Math.floor((Date.now()-x)/86400000); }
function exportCart(){
  const header='Codigo,Descripcion,Rubro,Cantidad,Proveedor,Estado,FechaPedido,Dias';
  const rows=CART.map(r=>[r.c,'"'+(r.d||'').replace(/"/g,"'")+'"',r.r,r.qty,r.prov,r.estado,r.fecha||'',daysAgo(r.fecha)||''].join(','));
  const a=document.createElement('a');
  a.href='data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent([header,...rows].join('\n'));
  a.download='compras_irep_'+new Date().toISOString().slice(0,10)+'.csv'; a.click(); notify('CSV exportado','ok');
}

// Cart stats panel
function openCartStats(irepCode){
  const item=CATALOG.find(x=>x.c===irepCode); if(!item) return;
  const vs=(window._VS||{})[irepCode]||{};
  const stock=item.stk, rhy=vs.rhy||0, l3=vs.l3||0, p3=vs.p3||0, trend=vs.tr||'stable', ls=vs.ls||[];
  const restock=Math.max(1,Math.ceil(rhy*2));
  const urgency=stock===0?'critical':stock<rhy?'low':'ok';
  const trendIcon=trend==='up'?'📈':trend==='down'?'📉':'➡️';
  const trendColor=trend==='up'?'var(--green)':trend==='down'?'var(--red)':'var(--muted)';
  const urgColor=urgency==='critical'?'var(--red)':urgency==='low'?'var(--amber)':'var(--green)';
  const salesRows=ls.length
    ? ls.map(s=>'<tr><td style="font-family:var(--mono);font-size:10px;color:var(--muted)">'+s[0]+'</td><td style="font-family:var(--mono);font-size:11px;font-weight:600;text-align:right">'+s[1]+' u.</td><td style="font-size:10px;color:var(--muted)">'+(s[2]||'')+'</td></tr>').join('')
    : '<tr><td colspan="3" style="color:var(--muted);text-align:center;padding:8px">Sin ventas registradas</td></tr>';
  const byMonth={}; ls.forEach(s=>{ const m=s[0].slice(0,7); byMonth[m]=(byMonth[m]||0)+s[1]; });
  const months=Object.entries(byMonth).sort((a,b)=>a[0]<b[0]?-1:1).slice(-6);
  const maxVal=Math.max(...months.map(m=>m[1]),1);
  const monthBars=months.map(([m,v])=>'<div class="vel-bar-wrap" title="'+m+': '+v+' u."><div class="vel-bar-fill" style="height:'+Math.round(v/maxVal*100)+'%"></div><div class="vel-bar-lbl">'+m.slice(5)+'</div></div>').join('');
  const revRows=(item.rev||[]).map(rr=>'<div class="csp-rev-row"><span class="csp-rev-code">'+rr.k+'</span><span class="csp-rev-stk '+(rr.stk>5?'ok':rr.stk>0?'low':'zero')+'">'+rr.stk+' u.</span><span class="csp-rev-rnk">'+(rr.rnk>0?'▲'+rr.rnk:'')+'</span></div>').join('');
  const panel=document.getElementById('cartStatsPanel'); if(!panel) return;
  panel.innerHTML='<div class="csp-header"><div class="csp-code">'+item.c+'</div><div class="csp-desc">'+(item.d?item.d.slice(0,60):'—')+'</div><button class="csp-close" onclick="closeCartStats()">✕</button></div>'
    +'<div class="csp-body">'
    +'<div class="csp-section"><div class="csp-sec-lbl">Decisión de compra</div>'
    +'<div class="csp-decision"><div class="csp-rec"><div class="csp-rec-num" style="color:'+urgColor+'">'+restock+'</div><div class="csp-rec-lbl">unidades sugeridas</div><div class="csp-rec-sub">(cobertura 2 meses)</div></div>'
    +'<div class="csp-divider"></div><div class="csp-kpi-grid">'
    +'<div class="csp-kpi"><div class="csp-kpi-val" style="color:'+urgColor+'">'+stock+'</div><div class="csp-kpi-lbl">stock actual</div></div>'
    +'<div class="csp-kpi"><div class="csp-kpi-val" style="color:var(--cyan)">'+rhy+'</div><div class="csp-kpi-lbl">u./mes</div></div>'
    +'<div class="csp-kpi"><div class="csp-kpi-val">'+l3+'</div><div class="csp-kpi-lbl">vendidos 90d</div></div>'
    +'<div class="csp-kpi"><div class="csp-kpi-val" style="color:'+trendColor+'">'+trendIcon+'</div><div class="csp-kpi-lbl">tendencia</div></div>'
    +'</div></div>'
    +'<button class="csp-apply-btn" onclick="applyRestock(\''+irepCode+'\','+restock+')">Aplicar cantidad sugerida: '+restock+' u.</button></div>'
    +(monthBars?'<div class="csp-section"><div class="csp-sec-lbl">Velocidad — últimos 6 meses</div><div class="vel-chart">'+monthBars+'</div>'
      +'<div class="csp-trend-row"><span>Últimos 3m: <strong>'+l3+' u.</strong></span><span>Anterior: <strong>'+p3+' u.</strong></span><span style="color:'+trendColor+'">'+(trend==='up'?'▲ Acelerando':trend==='down'?'▼ Desacelerando':'→ Estable')+'</span></div></div>':'')
    +'<div class="csp-section"><div class="csp-sec-lbl">Últimas ventas ('+ls.length+')</div><table class="csp-table"><thead><tr><th>Fecha</th><th>Cant.</th><th>Cód. NETEGIA</th></tr></thead><tbody>'+salesRows+'</tbody></table></div>'
    +(revRows?'<div class="csp-section"><div class="csp-sec-lbl">Variantes NETEGIA</div>'+revRows+'</div>':'')
    +'</div>';
  panel.classList.add('open');
}
function closeCartStats(){ const p=document.getElementById('cartStatsPanel'); if(p) p.classList.remove('open'); }
function applyRestock(code,qty){
  const row=CART.find(r=>r.c===code); if(!row) return;
  row.qty=String(qty);
  const input=document.querySelector('input.qty-in[data-id="'+row._id+'"]');
  if(input) input.value=qty;
  if(row._row) fetch(SERVER+'/api/proceso/update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({_row:row._row,campo:'qty',valor:String(qty)})}).catch(()=>{});
  notify('Cantidad actualizada: '+qty+' u.','ok');
}

// Cotizador
function addToCot(code){
  const item=CATALOG.find(x=>x.c===code); if(!item) return;
  const existing=COTIZACION.find(r=>r.code===code);
  if(existing){ existing.qty++; } else { COTIZACION.push({code,desc:item.d||'',qty:1,price:item.p?Math.round(item.p):0}); }
  updateCotBadge(); renderCotizador(); notify('Agregado a cotización','ok');
}
function updateCotBadge(){ const b=document.getElementById('cotBadge'); if(b){ b.textContent=COTIZACION.length; b.style.display=COTIZACION.length>0?'':'none'; } }
function renderCotizador(){
  const cont=document.getElementById('cotContainer'); if(!cont) return;
  const total=COTIZACION.reduce((a,r)=>a+(r.qty*r.price),0), hasItems=COTIZACION.length>0, dis=hasItems?'':' disabled';
  const itemsHtml=!hasItems?'<div class="cot-empty">Agregá artículos desde el catálogo con el botón 💰</div>'
    :COTIZACION.map((r,i)=>'<div class="cot-item-row">'
      +'<div class="cot-item-left"><div class="cot-item-code">'+r.code+'</div><div class="cot-item-desc">'+r.desc.slice(0,55)+'</div></div>'
      +'<div class="cot-item-controls">'
      +'<input class="cot-num" type="number" min="1" value="'+r.qty+'" onchange="cotUpdateQty('+i+',this.value)">'
      +'<span class="cot-x">×</span>'
      +'<span class="cot-price-wrap">$<input class="cot-price" type="number" min="0" value="'+r.price+'" onchange="cotUpdatePrice('+i+',this.value)"></span>'
      +'<span class="cot-sub">= $'+(r.qty*r.price).toLocaleString('es-AR')+'</span>'
      +'<button class="cot-del" onclick="cotRemove('+i+')">✕</button>'
      +'</div></div>').join('');
  const totalHtml=hasItems?'<div class="cot-total-row"><span class="cot-total-lbl">Total</span><span class="cot-total-val">$'+total.toLocaleString('es-AR')+'</span></div>':'';
  cont.innerHTML='<div class="cot-layout"><div class="cot-editor">'
    +'<div class="cot-editor-header"><div class="cot-field-row">'
    +'<input class="cot-input" id="cotCliente" placeholder="Cliente / Nombre" value="'+COT_CLIENTE+'" oninput="COT_CLIENTE=this.value;refreshPreview()">'
    +'<input class="cot-input" id="cotAuto" placeholder="Vehículo" value="'+COT_AUTO+'" oninput="COT_AUTO=this.value;refreshPreview()">'
    +'</div></div>'
    +'<div class="cot-items-list">'+itemsHtml+'</div>'
    +totalHtml
    +'<div class="cot-actions">'
    +'<button class="cot-btn primary" onclick="captureCot()"'+dis+'>📸 Captura WhatsApp</button>'
    +'<button class="cot-btn secondary" onclick="copyTextCot()"'+dis+'>📋 Copiar texto</button>'
    +'<button class="cot-btn danger" onclick="clearCot()"'+dis+'>🗑 Limpiar</button>'
    +'</div></div>'
    +'<div class="cot-preview-wrap"><div class="cot-preview-label">Vista previa</div>'
    +'<div class="cot-preview-frame"><div class="cot-card" id="cotCard">'+buildCotCard()+'</div></div>'
    +'</div></div>';
}
function buildCotCard(){
  const total=COTIZACION.reduce((a,r)=>a+(r.qty*r.price),0);
  const fecha=new Date().toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'});
  const bodyHtml=!COTIZACION.length?'<div class="cotc-empty">Sin artículos</div>'
    :'<table class="cotc-table"><thead><tr><th>Descripción</th><th>Cant</th><th>Precio</th><th>Total</th></tr></thead><tbody>'
    +COTIZACION.map(r=>'<tr><td><div class="cotc-item-code">'+r.code+'</div><div class="cotc-item-desc">'+r.desc.slice(0,50)+'</div></td><td class="cotc-center">'+r.qty+'</td><td class="cotc-right">$'+r.price.toLocaleString('es-AR')+'</td><td class="cotc-right cotc-sub">$'+(r.qty*r.price).toLocaleString('es-AR')+'</td></tr>').join('')
    +'</tbody></table><div class="cotc-total-row"><span>TOTAL</span><span class="cotc-total-num">$'+total.toLocaleString('es-AR')+'</span></div>';
  return '<div class="cotc-header"><div class="cotc-brand">'+COT_NOMBRE+'</div>'
    +'<div class="cotc-meta">'+(COT_CLIENTE?'<div class="cotc-cliente">'+COT_CLIENTE+'</div>':'')+(COT_AUTO?'<div class="cotc-auto">🚗 '+COT_AUTO+'</div>':'')+'<div class="cotc-fecha">'+fecha+'</div></div></div>'
    +'<div class="cotc-divider"></div>'+bodyHtml
    +'<div class="cotc-footer">I-REP Repuestos · Cotización sin validez fiscal</div>';
}
function refreshPreview(){ const c=document.getElementById('cotCard'); if(c) c.innerHTML=buildCotCard(); }
function cotUpdateQty(i,v){ COTIZACION[i].qty=Math.max(1,parseInt(v)||1); renderCotizador(); }
function cotUpdatePrice(i,v){ COTIZACION[i].price=Math.max(0,parseInt(v)||0); renderCotizador(); }
function cotRemove(i){ COTIZACION.splice(i,1); updateCotBadge(); renderCotizador(); }
function clearCot(){ if(!confirm('Borrar la cotización?')) return; COTIZACION=[]; updateCotBadge(); renderCotizador(); }
function captureCot(){
  const card=document.getElementById('cotCard'); if(!card) return;
  if(!window.html2canvas){
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    s.onload=()=>doCapture(card); document.head.appendChild(s);
  } else { doCapture(card); }
}
function doCapture(card){
  notify('Generando imagen...');
  html2canvas(card,{scale:3,backgroundColor:'#ffffff',useCORS:true}).then(canvas=>{
    const link=document.createElement('a');
    link.download='cotizacion_irep_'+new Date().toISOString().slice(0,10)+'.png';
    link.href=canvas.toDataURL('image/png'); link.click(); notify('Imagen descargada','ok');
  }).catch(e=>notify('Error: '+e.message,'warn'));
}
function copyTextCot(){
  const fecha=new Date().toLocaleDateString('es-AR');
  const total=COTIZACION.reduce((a,r)=>a+(r.qty*r.price),0);
  let text='*'+COT_NOMBRE+' — Cotización*\n';
  if(COT_CLIENTE) text+='Cliente: '+COT_CLIENTE+'\n';
  if(COT_AUTO)    text+='Vehículo: '+COT_AUTO+'\n';
  text+='Fecha: '+fecha+'\n\n';
  COTIZACION.forEach(r=>{ text+='• '+r.code+' — '+r.desc.slice(0,40)+'\n  '+r.qty+' u. × $'+r.price.toLocaleString('es-AR')+' = *$'+(r.qty*r.price).toLocaleString('es-AR')+'*\n'; });
  text+='\n*TOTAL: $'+total.toLocaleString('es-AR')+'*';
  navigator.clipboard.writeText(text).then(()=>notify('Copiado al portapapeles','ok'));
}

// Ranking

function notify(m,type=''){
  const n=document.getElementById('notif'); n.textContent=m; n.className=type?type:''; n.classList.add('show');
  setTimeout(()=>n.classList.remove('show'),2200);
}
function toggleHelp(id){ const el=document.getElementById(id); if(el) el.classList.toggle('visible'); }



// ── MOTOR SEARCH ──────────────────────────────────────────────
let _motorSearchTimer = null;
function motorSearchDebounce(val) {
  clearTimeout(_motorSearchTimer);
  const v = val.trim();
  // Single char: wait longer to avoid searching on every keystroke
  const delay = v.length <= 1 ? 600 : v.length <= 3 ? 350 : 200;
  _motorSearchTimer = setTimeout(() => {
    motorSearch = v;
    renderMotor();
  }, delay);
}

function motorMatchesQuery(item, query) {
  if (!query) return true;
  const terms = norm(query).split(' ').filter(t => t.length > 0);
  if (!terms.length) return true;
  const hay = norm([item.c, item.d||'', item.r||''].join(' '));
  return terms.every(t => {
    if (hay.includes(t)) return true;
    const words = hay.split(' ').filter(w => w.length > 1);
    return words.some(w => w.startsWith(t) || bigramSim(t,w) > 0.5);
  });
}

// MOTOR DE REPOSICIÓN
// ══════════════════════════════════════════════════════════════

let motorSearch='', motorSelected=null, motorSelected2=new Set(), motorScoreMin=0, motorRubro='';
let motorActiveQuads=new Set(['U','A','O','S']);

const QMETA={
  U:{label:'🔴 Urgente',   color:'#f87171',bg:'rgba(248,113,113,.12)',desc:'Alta rotación · bajo stock → reponer YA'},
  A:{label:'🟡 Analizar',  color:'#fbbf24',bg:'rgba(251,191,36,.12)', desc:'Baja rotación · bajo stock → evaluar'},
  O:{label:'🟢 OK',        color:'#34d399',bg:'rgba(52,211,153,.12)', desc:'Alta rotación · buen stock → mantener'},
  S:{label:'⚫ Sobrestock',color:'#94a3b8',bg:'rgba(148,163,184,.1)', desc:'Baja rotación · alto stock → revisar'},
};

function getFiltered(){
  const M=window._MOTOR||[];
  return M.filter(x=>motorActiveQuads.has(x.quad)&&x.score>=motorScoreMin&&(!motorRubro||x.r===motorRubro)&&motorMatchesQuery(x,motorSearch));
}

function renderMotor(){
  const cont=document.getElementById('motorContainer');
  if(!cont) return;
  const M=window._MOTOR||[];
  if(!M.length){cont.innerHTML='<div style="padding:40px;text-align:center;color:var(--muted)">Cargando...</div>';return;}
  const countsFilt={U:0,A:0,O:0,S:0};
  M.filter(x=>!motorRubro||x.r===motorRubro).forEach(x=>countsFilt[x.quad]++);
  const cartSet=new Set(CART.map(c=>c.c));
  const filtered=getFiltered();
  const allRubros=[...new Set(M.map(x=>x.r).filter(Boolean))].sort();

  const modeBtns=['U','A','O','S'].map(q=>{
    const m=QMETA[q],act=motorActiveQuads.has(q);
    return "<button onclick=\"toggleMotorQuad('"+q+"')\" style=\"padding:4px 12px;border-radius:10px;font-size:10px;font-weight:600;cursor:pointer;white-space:nowrap;border:1px solid "+(act?m.color:"var(--b)")+";background:"+(act?m.bg:"transparent")+";color:"+(act?m.color:"var(--muted)")+";\">"+m.label+" <span style=\"opacity:.6;font-size:9px\">"+countsFilt[q]+"</span></button>";
  }).join('');

  const rubroSel='<select onchange="motorRubro=this.value;renderMotor()" style="background:var(--s2);border:1px solid var(--b);border-radius:4px;color:var(--text);font-size:10px;padding:3px 6px;outline:none;max-width:160px"><option value="">Todos los rubros</option>'+allRubros.map(r=>'<option value="'+r+'"'+(motorRubro===r?' selected':'')+'>'+r+'</option>').join('')+'</select>';

  cont.innerHTML=
    '<div style="padding:6px 12px;border-bottom:1px solid var(--b);display:flex;align-items:center;gap:8px;flex-shrink:0;background:var(--s1);flex-wrap:wrap">'
    +'<div style="display:flex;gap:5px;flex-wrap:wrap">'+modeBtns+'</div>'
    +'<div style="width:1px;height:16px;background:var(--b);flex-shrink:0"></div>'
    +rubroSel
    +'<input placeholder="Buscar..." oninput="motorSearchDebounce(this.value)" value="'+motorSearch+'" style="background:transparent;border:none;color:var(--text);font-size:11px;outline:none;width:110px">'
    +'<div style="display:flex;align-items:center;gap:4px">'
    +'<span style="font-size:9px;color:var(--muted)">score≥</span>'
    +'<input type="range" min="0" max="90" step="5" value="'+motorScoreMin+'" oninput="motorScoreMin=+this.value;renderMotorListOnly();" style="width:60px;accent-color:#22d3ee">'
    +'<span style="font-size:9px;color:#22d3ee;font-family:monospace;width:18px">'+motorScoreMin+'</span>'
    +'</div>'
    +'<span style="font-size:10px;color:var(--muted);font-family:monospace;margin-left:auto">'+filtered.length+' artículos'+(motorRubro?' · '+motorRubro:'')+'</span>'
    +"<button onclick=\"motorToggleHelp()\" style=\"padding:2px 8px;border-radius:4px;background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.2);color:#22d3ee;font-size:10px;cursor:pointer\">?</button>"
    +'</div>'
    +'<div id="motorHelp" style="display:none;padding:10px 14px;background:rgba(15,23,42,.95);border-bottom:1px solid var(--b);font-size:11px;flex-shrink:0">'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 20px">'
    +'<div><span style="color:#f87171;font-weight:700">🔴 URGENTE</span> — Alta rotación + poco stock. <strong>Comprar ya.</strong> Abajo a la derecha del mapa.</div>'
    +'<div><span style="color:#34d399;font-weight:700">🟢 OK</span> — Alta rotación + buen stock. Sin acción. Arriba a la derecha.</div>'
    +'<div><span style="color:#fbbf24;font-weight:700">🟡 ANALIZAR</span> — Poca rotación + poco stock. Evaluar si conviene reponer. Abajo izquierda.</div>'
    +'<div><span style="color:#94a3b8;font-weight:700">⚫ SOBRESTOCK</span> — Poca rotación + mucho stock. Revisar compras. Arriba izquierda.</div>'
    +'</div>'
    +'<div style="margin-top:6px;color:var(--muted);font-size:10px">Eje X → rotación (u/mes) · Eje Y ↑ stock · Tamaño = score · Los botones de cuadrante son filtros ON/OFF de la lista y el mapa</div>'
    +'</div>'
    +'<div style="display:flex;overflow:hidden;height:calc(100vh - 130px)">'
    +'<div style="flex:1;padding:10px;min-width:0;display:flex;flex-direction:column;overflow:hidden">'
    +'<canvas id="motorCanvas" style="width:100%;flex:1;display:block;border:1px solid var(--b);border-radius:6px;cursor:crosshair"></canvas>'
    +'</div>'
    +'<div style="width:290px;flex-shrink:0;border-left:1px solid var(--b);display:flex;flex-direction:column;overflow:hidden">'
    +'<div style="padding:4px 10px;border-bottom:1px solid var(--b);font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);flex-shrink:0">Ranking · mostrando '+Math.min(80,filtered.filter(x=>!cartSet.has(x.c)).length)+' de '+filtered.length+'</div>'
    +'<div id="motorListScroll" style="flex:1;overflow-y:auto">'+buildMotorList(filtered,cartSet)+'</div>'
    +'</div></div>'
    +'<div id="motorTooltip" style="position:fixed;background:var(--s1);border:1px solid var(--b);border-radius:6px;padding:8px 12px;font-size:11px;pointer-events:none;z-index:500;min-width:180px;display:none"></div>';

  // Limit canvas items for performance - max 800 dim + all highlighted
  const allForCanvas=M.filter(x=>!motorRubro||x.r===motorRubro);
  // Setup ResizeObserver after initial draw
  setTimeout(()=>{
    const cv2=document.getElementById('motorCanvas');
    if(!cv2) return;
    if(cv2._ro) cv2._ro.disconnect();
    let roTimeout;
    const ro2=new ResizeObserver(()=>{
      clearTimeout(roTimeout);
      roTimeout=setTimeout(()=>{
        const M2=window._MOTOR||[],cs2=new Set(CART.map(c=>c.c));
        drawMotorCanvas(M2.filter(x=>!motorRubro||x.r===motorRubro),getFiltered(),cs2);
      },150);
    });
    ro2.observe(cv2); cv2._ro=ro2;
  },300);
  // Draw canvas after layout settles - use longer delay
  setTimeout(()=>{
    const cv=document.getElementById('motorCanvas');
    if(cv&&cv.clientWidth>10&&cv.clientHeight>10){
      drawMotorCanvas(allForCanvas,filtered,cartSet);
    } else {
      setTimeout(()=>drawMotorCanvas(allForCanvas,filtered,cartSet),200);
    }
  },80);
}

function buildMotorList(filtered,cartSet){
  // Limit to 80 items to avoid UI freeze
  const PAGE_SIZE=80;
  const notInCart=filtered.filter(x=>!cartSet.has(x.c)).slice(0,PAGE_SIZE);
  const inCartItems=filtered.filter(x=>cartSet.has(x.c));
  const selCount=motorSelected2.size;
  function row(item){
    const inCart=cartSet.has(item.c),sel2=motorSelected2.has(item.c),selDP=motorSelected===item.c;
    const sc=item.score,scColor=sc>70?"#f87171":sc>45?"#fbbf24":sc>25?"#22d3ee":"#64748b";
    const stkColor=item.stk===0?"#f87171":item.stk<=2?"#fbbf24":"#34d399";
    const qColor=(QMETA[item.quad]||{}).color||"#64748b";
    const bg=selDP?"rgba(34,211,238,.08)":sel2?"rgba(167,139,250,.08)":"transparent";
    const bl=selDP?"#22d3ee":sel2?"#a78bfa":qColor+"33";
    const ql=((QMETA[item.quad]||{}).label||"").split(" ")[0];
    const covStr=item.cov!=null&&item.cov<999?"<span style=\"color:"+(item.cov<1?"#f87171":item.cov<2?"#fbbf24":"#64748b")+"\">" +item.cov+"m</span>":"";
    const trStr=item.tr==="up"?"<span style=\"color:#34d399\">↑</span>":item.tr==="down"?"<span style=\"color:#f87171\">↓</span>":"";
    const novStr=item.nov?"<span style=\"color:#a78bfa\">★</span>":"";
    return "<div data-code=\""+item.c+"\" class=\"m-row\""
      +" onclick=\"motorRowClick(event,'"+item.c+"')\""
      +" onmouseenter=\"motorRowHover('"+item.c+"')\""
      +" onmouseleave=\"motorRowUnhover()\""
      +" style=\"display:flex;align-items:center;gap:5px;padding:4px 8px 4px 6px;border-bottom:1px solid rgba(255,255,255,.04);cursor:pointer;background:"+bg+";border-left:2px solid "+bl+";\">"
      +"<div onclick=\"event.stopPropagation();motorToggleSel('"+item.c+"')\" style=\"width:14px;height:14px;border-radius:2px;border:1px solid "+(sel2?"#a78bfa":"rgba(255,255,255,.15)")+";background:"+(sel2?"rgba(167,139,250,.3)":"transparent")+";display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:pointer;\">"+(sel2?"<span style=\"font-size:9px;color:#a78bfa\">✓</span>":"")+"</div>"
      +"<div style=\"width:24px;height:24px;border-radius:50%;background:rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:"+scColor+";flex-shrink:0\">"+sc+"</div>"
      +"<div style=\"flex:1;min-width:0\">"
      +"<div style=\"font-family:monospace;font-size:9px;color:#22d3ee;line-height:1.2\">"+item.c+" <span style=\"color:"+qColor+";font-size:8px\">"+ql+"</span></div>"
      +"<div style=\"font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.3\">"+item.d+"</div>"
      +"<div style=\"display:flex;gap:5px;font-size:9px;font-family:monospace;line-height:1.2\">"
      +"<span style=\"color:#fbbf24\">▲"+item.rnk+"</span><span style=\"color:#22d3ee\">"+item.rhy+"/m</span>"
      +"<span style=\"color:"+stkColor+"\">"+item.stk+"u</span>"
      +covStr+trStr+novStr
      +"</div></div>"
      +"<button onclick=\"event.stopPropagation();motorAdd('"+item.c+"')\" style=\"padding:2px 6px;border-radius:3px;font-size:10px;cursor:pointer;flex-shrink:0;border:1px solid "+(inCart?"rgba(52,211,153,.4)":"rgba(96,165,250,.25)")+";background:"+(inCart?"rgba(52,211,153,.1)":"rgba(96,165,250,.08)")+";color:"+(inCart?"#34d399":"#60a5fa")+";\">"
      +(inCart?"✓":"+")
      +"</button></div>";
  }
  const bulk=selCount>0?'<div style="padding:6px 10px;background:rgba(167,139,250,.1);border-bottom:1px solid rgba(167,139,250,.2);display:flex;align-items:center;gap:8px"><span style="font-size:10px;color:#a78bfa">'+selCount+' selec.</span><button onclick="motorAddSelected()" style="padding:3px 10px;border-radius:4px;background:rgba(96,165,250,.15);border:1px solid rgba(96,165,250,.3);color:#60a5fa;font-size:10px;cursor:pointer">+ Agregar</button><button onclick="motorClearSel()" style="padding:3px 8px;border-radius:4px;background:transparent;border:1px solid rgba(255,255,255,.1);color:var(--muted);font-size:10px;cursor:pointer">✕</button></div>':'';
  return bulk
    +(notInCart.length?'<div style="padding:3px 8px;font-size:9px;text-transform:uppercase;letter-spacing:.8px;color:#94a3b8;background:rgba(0,0,0,.2)">Sin pedir ('+notInCart.length+')</div>'+notInCart.map(row).join(''):'')
    +(inCartItems.length?'<div style="padding:3px 8px;font-size:9px;text-transform:uppercase;letter-spacing:.8px;color:#34d399;background:rgba(0,0,0,.2)">En carrito ('+inCartItems.length+')</div>'+inCartItems.map(row).join(''):'')
    ||'<div style="padding:20px;text-align:center;color:var(--muted);font-size:11px">Sin artículos</div>';
}

function drawMotorCanvas(allItems,highlighted,cartSet){
  const canvas=document.getElementById('motorCanvas');
  if(!canvas) return;
  const W=canvas.clientWidth||canvas.offsetWidth, H=canvas.clientHeight||canvas.offsetHeight;
  if(!W||!H) return;
  const dpr=window.devicePixelRatio||1;
  canvas.width=W*dpr; canvas.height=H*dpr;
  const ctx=canvas.getContext('2d'); ctx.scale(dpr,dpr);
  const PAD=30,plotW=W-PAD*2,plotH=H-PAD*2;
  // Fill canvas background
  ctx.fillStyle='#0f172a';
  ctx.fillRect(0,0,W,H);
  // Quadrant backgrounds
  [[0,0,'rgba(148,163,184,.04)'],[1,0,'rgba(52,211,153,.04)'],[0,1,'rgba(251,191,36,.04)'],[1,1,'rgba(248,113,113,.07)']].forEach(([qx,qy,c])=>{ctx.fillStyle=c;ctx.fillRect(PAD+qx*plotW/2,PAD+qy*plotH/2,plotW/2,plotH/2);});
  // Dividers
  ctx.strokeStyle='rgba(255,255,255,.07)';ctx.setLineDash([3,4]);ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(PAD+plotW/2,PAD);ctx.lineTo(PAD+plotW/2,PAD+plotH);ctx.stroke();
  ctx.beginPath();ctx.moveTo(PAD,PAD+plotH/2);ctx.lineTo(PAD+plotW,PAD+plotH/2);ctx.stroke();
  ctx.setLineDash([]);
  // Labels
  ctx.font='10px sans-serif';ctx.textAlign='center';
  ctx.fillStyle='rgba(148,163,184,.22)';ctx.fillText('⚫ SOBRESTOCK',PAD+plotW*0.25,PAD+plotH*0.08);
  ctx.fillStyle='rgba(52,211,153,.22)'; ctx.fillText('🟢 OK',         PAD+plotW*0.75,PAD+plotH*0.08);
  ctx.fillStyle='rgba(251,191,36,.22)'; ctx.fillText('🟡 ANALIZAR',  PAD+plotW*0.25,PAD+plotH*0.94);
  ctx.fillStyle='rgba(248,113,113,.28)';ctx.fillText('🔴 URGENTE',   PAD+plotW*0.75,PAD+plotH*0.94);
  ctx.fillStyle='rgba(255,255,255,.2)';ctx.font='8px monospace';
  ctx.fillText('← Baja rotación  ·  Alta rotación →',PAD+plotW/2,H-4);
  ctx.save();ctx.translate(10,PAD+plotH/2);ctx.rotate(-Math.PI/2);ctx.fillText('↑ Más stock  ·  Menos stock ↓',0,0);ctx.restore();
  // Scale (use all motor items for consistent axes)
  const M=window._MOTOR||[];
  const maxRhy=Math.max(...M.map(x=>x.rhy),0.1),maxStk=Math.max(...M.map(x=>x.stk),1);
  const logR=v=>Math.log1p(v)/Math.log1p(maxRhy),logS=v=>Math.log1p(v)/Math.log1p(maxStk);
  const hlSet=new Set(highlighted.map(x=>x.c));
  const hitMap=[];
  // Dim background dots — sample for performance if many items
  const dimItems=allItems.filter(x=>!hlSet.has(x.c));
  const step=dimItems.length>1000?Math.ceil(dimItems.length/600):1;
  ctx.beginPath();
  for(let i=0;i<dimItems.length;i+=step){
    const item=dimItems[i];
    const px=PAD+logR(item.rhy)*plotW,py=PAD+plotH-logS(item.stk)*plotH;
    ctx.moveTo(px+1.5,py);ctx.arc(px,py,1.5,0,Math.PI*2);
  }
  ctx.fillStyle='rgba(255,255,255,.06)';ctx.fill();
  // Highlighted items colored
  highlighted.forEach(item=>{
    const px=PAD+logR(item.rhy)*plotW,py=PAD+plotH-logS(item.stk)*plotH;
    const r=Math.max(3,Math.min(9,2.5+item.score/18));
    const inCart=cartSet.has(item.c),isSel=motorSelected===item.c;
    const col=QMETA[item.quad]?.color||'#64748b';
    const alpha=isSel?1:inCart?.92:.7;
    ctx.beginPath();ctx.arc(px,py,r,0,Math.PI*2);
    ctx.fillStyle=col+(Math.round(alpha*255).toString(16).padStart(2,'0'));ctx.fill();
    if(inCart||isSel){ctx.beginPath();ctx.arc(px,py,r+1.5,0,Math.PI*2);ctx.strokeStyle=isSel?'#22d3ee':'rgba(255,255,255,.7)';ctx.lineWidth=1.5;ctx.stroke();}
    hitMap.push({code:item.c,px,py,r:r+5});
  });
  canvas._hitMap=hitMap;
  canvas.onmousemove=function(e){
    const rect=canvas.getBoundingClientRect(),mx=e.clientX-rect.left,my=e.clientY-rect.top;
    const hit=(canvas._hitMap||[]).find(p=>Math.hypot(p.px-mx,p.py-my)<=p.r);
    canvas.style.cursor=hit?'pointer':'crosshair';
    const tip=document.getElementById('motorTooltip');
    if(hit&&tip){
      const item=(window._MOTOR||[]).find(x=>x.c===hit.code);if(!item)return;
      const stkC=item.stk===0?'#f87171':item.stk<=2?'#fbbf24':'#34d399';
      const qC=QMETA[item.quad]?.color||'#64748b';
      tip.innerHTML='<div style="font-family:monospace;font-size:10px;color:#22d3ee;margin-bottom:2px">'+item.c+' <span style="color:'+qC+'">'+QMETA[item.quad]?.label+'</span></div>'
        +'<div style="font-size:10px;color:var(--muted);margin-bottom:5px">'+item.d+'</div>'
        +'<div style="display:flex;gap:8px;font-size:10px;font-family:monospace">'
        +'<span style="color:#fbbf24">▲'+item.rnk+'</span><span style="color:#22d3ee">'+item.rhy+'/m</span>'
        +'<span style="color:'+stkC+'">stk:'+item.stk+'</span>'
        +(item.cov<999?'<span style="color:'+(item.cov<1?'#f87171':item.cov<2?'#fbbf24':'#94a3b8')+'">cob:'+item.cov+'m</span>':'')
        +'<span style="color:#fbbf24">sc:'+item.score+'</span></div>';
      tip.style.display='block';tip.style.left=(e.clientX+14)+'px';tip.style.top=(e.clientY-55)+'px';
    } else if(tip) tip.style.display='none';
  };
  canvas.onmouseleave=()=>{const t=document.getElementById('motorTooltip');if(t)t.style.display='none';};
  canvas.onclick=function(e){
    const rect=canvas.getBoundingClientRect(),mx=e.clientX-rect.left,my=e.clientY-rect.top;
    const hit=(canvas._hitMap||[]).find(p=>Math.hypot(p.px-mx,p.py-my)<=p.r);
    if(hit)selectMotorItem(hit.code);
  };
}

function toggleMotorQuad(q){
  if(motorActiveQuads.has(q)){if(motorActiveQuads.size>1)motorActiveQuads.delete(q);}
  else motorActiveQuads.add(q);
  const M=window._MOTOR||[],cartSet=new Set(CART.map(c=>c.c));
  // Limit canvas items for performance - max 800 dim + all highlighted
  const allForCanvas=M.filter(x=>!motorRubro||x.r===motorRubro);
  drawMotorCanvas(allForCanvas,getFiltered(),cartSet);
  renderMotorListOnly();
  // Update button styles without full re-render
  document.querySelectorAll('#motorContainer button').forEach(btn=>{
    const m=btn.getAttribute('onclick')||'';
    const q2=m.match(/toggleMotorQuad\('(\w)'\)/)?.[1];
    if(!q2)return;
    const meta=QMETA[q2],act=motorActiveQuads.has(q2);
    btn.style.borderColor=act?meta.color:'var(--b)';
    btn.style.background=act?meta.bg:'transparent';
    btn.style.color=act?meta.color:'var(--muted)';
  });
}

function selectMotorItem(code){
  motorSelected=motorSelected===code?null:code;
  if(motorSelected)openDP(code);
  const M=window._MOTOR||[],cartSet=new Set(CART.map(c=>c.c));
  drawMotorCanvas(M.filter(x=>!motorRubro||x.r===motorRubro),getFiltered(),cartSet);
  renderMotorListOnly();
}
function motorAdd(code){
  const s=document.getElementById('motorListScroll'),st=s?s.scrollTop:0;
  toggleCart(code);renderMotorListOnly();
  const s2=document.getElementById('motorListScroll');if(s2)s2.scrollTop=st;
}
function motorRowClick(e,code){selectMotorItem(code);}
function motorToggleSel(code){if(motorSelected2.has(code))motorSelected2.delete(code);else motorSelected2.add(code);renderMotorListOnly();}
function motorAddSelected(){
  const s=document.getElementById('motorListScroll'),st=s?s.scrollTop:0;
  const codes=[...motorSelected2],n=codes.length;
  codes.forEach(code=>{if(!CART.some(c=>c.c===code))toggleCart(code);});
  motorSelected2.clear();renderMotorListOnly();
  const s2=document.getElementById('motorListScroll');if(s2)s2.scrollTop=st;
  notify(n+' artículos agregados','ok');
}
function motorClearSel(){motorSelected2.clear();renderMotorListOnly();}
function motorRowHover(code){
  const canvas=document.getElementById('motorCanvas');if(!canvas||!canvas._hitMap)return;
  const hit=canvas._hitMap.find(p=>p.code===code);if(!hit)return;
  const ctx=canvas.getContext('2d');
  ctx.save();ctx.beginPath();ctx.arc(hit.px,hit.py,hit.r+3,0,Math.PI*2);
  ctx.strokeStyle='rgba(255,255,255,.85)';ctx.lineWidth=2;ctx.stroke();ctx.restore();
}
function motorRowUnhover(){
  const M=window._MOTOR||[],cartSet=new Set(CART.map(c=>c.c));
  drawMotorCanvas(M.filter(x=>!motorRubro||x.r===motorRubro),getFiltered(),cartSet);
}
function renderMotorListOnly(){
  const cartSet=new Set(CART.map(c=>c.c)),filtered=getFiltered();
  const lc=document.getElementById('motorListScroll');if(!lc)return;
  const st=lc.scrollTop;lc.innerHTML=buildMotorList(filtered,cartSet);lc.scrollTop=st;
}

function motorToggleHelp(){var h=document.getElementById('motorHelp');if(h)h.style.display=h.style.display==='none'?'block':'none';}

function pasteToInput(input){
  if(!input) return;
  navigator.clipboard.readText().then(text=>{
    text = text.trim();
    input.value = text;
    input.dispatchEvent(new Event('change', {bubbles:true}));
    input.focus();
    // Flash cyan to confirm
    input.style.transition='border-color .15s';
    input.style.borderColor='var(--cyan)';
    setTimeout(()=>input.style.borderColor='',800);
  }).catch(()=>{
    // Fallback: focus input and let user paste manually
    input.focus();
    notify('Usá Ctrl+V para pegar','');
  });
}
