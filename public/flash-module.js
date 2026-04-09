// ══════════════════════════════════════════════════════════════
// FLASH VENTAS 360 — I-REP v3.0
// Producto dominante · sin imagen = sin card · premium dark
// ══════════════════════════════════════════════════════════════

const FLASH_HIST_KEY = 'irep_flash_history_v1';
const FLASH_CATS = {
  U: { label:'URGENCIA',    color:'#ef4444', bg:'rgba(239,68,68,.15)',  icon:'🔴', tag:'STOCK LIMITADO'  },
  L: { label:'LIQUIDACIÓN', color:'#f97316', bg:'rgba(249,115,22,.15)', icon:'🟠', tag:'OFERTA ESPECIAL' },
  O: { label:'OPORTUNIDAD', color:'#eab308', bg:'rgba(234,179,8,.15)',  icon:'🟡', tag:'OPORTUNIDAD'     },
  G: { label:'GANCHO',      color:'#22c55e', bg:'rgba(34,197,94,.15)',  icon:'🟢', tag:'MÁS VENDIDO'     },
};
const FLASH_MIX = { U:2, L:3, O:3, G:2 };
let _flashProducts=null, _flashView='selector';

// ── HISTORIAL ─────────────────────────────────────────────────
function flashGetHist(){
  try{ return JSON.parse(localStorage.getItem(FLASH_HIST_KEY)||'[]').filter(e=>e.ts>Date.now()-7*86400000); }
  catch{ return []; }
}
function flashSaveHist(codes){
  const h=flashGetHist();
  h.push({ts:Date.now(),date:new Date().toISOString().slice(0,10),codes});
  localStorage.setItem(FLASH_HIST_KEY,JSON.stringify(h.slice(-30)));
}
function flashRecentCodes(days=5){
  const cutoff=Date.now()-days*86400000, s=new Set();
  flashGetHist().filter(e=>e.ts>cutoff).forEach(e=>e.codes.forEach(c=>s.add(c)));
  return s;
}

// ── CLASIFICACIÓN + SCORE ─────────────────────────────────────
function flashClassify(item){
  const cov=item.cov||999, rhy=item.rhy||0, stk=item.stk||0;
  if(cov<1.5&&rhy>0) return 'U';
  if(cov>10&&stk>5)  return 'L';
  if(rhy>3&&cov>=2&&cov<8) return 'G';
  return 'O';
}
function flashScore(item,maxRhy,maxRnk){
  const rhy_n=maxRhy>0?(item.rhy||0)/maxRhy:0;
  const rnk_n=maxRnk>0?(item.rnk||0)/maxRnk:0;
  const stk_n=Math.min(1,(item.stk||0)/50);
  const urgency=(item.cov||999)<2?1:0;
  const trend=item.tr==='up'?0.1:item.tr==='down'?-0.1:0;
  return(rhy_n*0.4)+(rnk_n*0.2)-(stk_n*0.2)+(urgency*0.2)+trend;
}

// ── SELECT — solo productos con imagen ───────────────────────
function flashSelectProducts(){
  const motor=window._MOTOR||[];
  if(!motor.length) return [];
  // If IMG_MAP not loaded yet, trigger load and return empty (will re-render on load)
  if(!window.IMG_MAP||Object.keys(window.IMG_MAP).length===0){
    if(typeof loadImages==='function'){
      loadImages().then(()=>{ _flashProducts=null; renderFlash(); });
    }
    return [];
  }
  const recent=flashRecentCodes(5);
  const maxRhy=Math.max(...motor.map(x=>x.rhy||0),1);
  const maxRnk=Math.max(...motor.map(x=>x.rnk||0),1);

  const scored=motor
    .filter(x=>{
      if(!x.rnk||!x.d||x.d.length<3) return false;
      if(recent.has(x.c)) return false;
      // CRÍTICO: solo con imagen
      const imgUrl=(window.IMG_MAP&&window.IMG_MAP[x.img])||null;
      x._imgUrl=imgUrl;
      return !!imgUrl;
    })
    .map(x=>({...x, cat:flashClassify(x), score:flashScore(x,maxRhy,maxRnk)}))
    .sort((a,b)=>b.score-a.score);

  const bycat={U:[],L:[],O:[],G:[]};
  scored.forEach(x=>bycat[x.cat].push(x));
  const selected=[],used=new Set();
  Object.entries(FLASH_MIX).forEach(([cat,min])=>{
    bycat[cat].slice(0,min).forEach(x=>{ if(!used.has(x.c)){selected.push(x);used.add(x.c);} });
  });
  scored.filter(x=>!used.has(x.c)).slice(0,10-selected.length).forEach(x=>{selected.push(x);used.add(x.c);});
  const o={U:0,G:1,O:2,L:3};
  return selected.sort((a,b)=>(o[a.cat]-o[b.cat])||(b.score-a.score));
}

// ── RENDER ────────────────────────────────────────────────────
function renderFlash(){
  const cont=document.getElementById('flashContainer');
  if(!cont) return;
  if(!window._MOTOR){
    cont.innerHTML=`<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:16px;color:var(--muted)">
      <div style="width:44px;height:44px;border:3px solid var(--b);border-top-color:var(--cyan);border-radius:50%;animation:spin 1s linear infinite"></div>
      <div style="font-size:12px">Cargando motor…</div></div>`;
    return;
  }
  if(_flashView==='selector') renderFlashSelector(cont);
  else renderFlashPreview(cont);
}

function renderFlashSelector(cont){
  _flashProducts=flashSelectProducts();
  const today=new Date().toISOString().slice(0,10);
  if(!_flashProducts||_flashProducts.length===0){
    const imgCount=Object.keys(window.IMG_MAP||{}).length;
    cont.innerHTML='<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:16px;color:var(--muted)">'
      +(imgCount===0
        ?'<div style="width:44px;height:44px;border:3px solid var(--b);border-top-color:var(--cyan);border-radius:50%;animation:spin 1s linear infinite"></div><div style="font-size:12px">Cargando imágenes ('+Object.keys(window.IMG_MAP||{}).length+'/14328)…</div>'
        :'<div style="font-size:24px">📭</div><div style="font-size:12px">Sin productos disponibles</div><button onclick="flashRegenerate()" style="padding:6px 16px;border-radius:6px;background:rgba(232,24,14,.15);border:1px solid var(--cyan);color:var(--cyan);font-size:11px;cursor:pointer">↺ Reintentar</button>')
      +'</div>';
    return;
  }
  const catCounts={U:0,L:0,O:0,G:0};
  _flashProducts.forEach(p=>catCounts[p.cat]++);

  const summary=Object.entries(FLASH_CATS).map(([k,v])=>
    `<div style="display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;background:${v.bg};border:1px solid ${v.color}44">
      <span>${v.icon}</span><div>
      <div style="font-size:11px;font-weight:700;color:${v.color}">${catCounts[k]}</div>
      <div style="font-size:9px;color:var(--muted)">${v.label}</div></div></div>`
  ).join('');

  const cards=_flashProducts.map((p,i)=>{
    const cat=FLASH_CATS[p.cat];
    return`<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;border:1px solid var(--b);background:var(--s2);margin-bottom:6px">
      <div style="font-size:11px;font-weight:700;color:var(--muted);width:18px;text-align:center">${i+1}</div>
      <img src="${p._imgUrl}" style="width:44px;height:44px;object-fit:contain;border-radius:6px" onerror="this.src=''">
      <div style="flex:1;min-width:0">
        <div style="font-size:11px;font-weight:700;line-height:1.3;margin-bottom:2px">${flashShortDesc(p.d)}</div>
        <div style="font-size:9px;color:var(--muted);font-family:monospace">${p.c}</div>
        <div style="display:flex;gap:5px;margin-top:3px;flex-wrap:wrap">
          <span style="font-size:9px;padding:1px 6px;border-radius:10px;background:${cat.bg};color:${cat.color};font-weight:700">${cat.icon} ${cat.label}</span>
          <span style="font-size:9px;color:var(--muted)">📦 ${p.stk}u · ↻ ${p.rhy}/mes</span>
        </div>
      </div>
      <button onclick="flashRemoveProduct('${p.c}')" style="padding:4px 8px;border-radius:4px;font-size:10px;border:1px solid var(--b);background:transparent;color:var(--muted);cursor:pointer">✕</button>
    </div>`;
  }).join('');

  const sinImg=((window._MOTOR||[]).length-_flashProducts.length);
  cont.innerHTML=`<div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
    <div style="padding:12px 16px;border-bottom:1px solid var(--b);background:var(--s1);flex-shrink:0">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div>
          <div style="font-size:14px;font-weight:700">⚡ Flash Ventas 360</div>
          <div style="font-size:10px;color:var(--muted)">${today} · ${_flashProducts.length} productos con imagen · ${sinImg} descartados sin imagen</div>
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="flashRegenerate()" style="padding:6px 12px;border-radius:7px;font-size:11px;border:1px solid var(--b);background:transparent;color:var(--muted);cursor:pointer">↺ Regenerar</button>
          <button onclick="_flashView='preview';renderFlash()" style="padding:6px 16px;border-radius:7px;font-size:11px;font-weight:700;border:none;background:var(--cyan);color:#fff;cursor:pointer">👁 Vista previa →</button>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${summary}</div>
    </div>
    <div style="flex:1;overflow-y:auto;padding:12px 16px">
      <div style="font-size:10px;color:var(--muted);margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Solo productos con imagen real · ✕ para quitar</div>
      ${cards}
    </div>
  </div>`;
}

function renderFlashPreview(cont){
  const today=new Date().toISOString().slice(0,10).replace(/-/g,'');
  cont.innerHTML=`<div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
    <div style="padding:12px 16px;border-bottom:1px solid var(--b);background:var(--s1);flex-shrink:0;display:flex;align-items:center;gap:10px">
      <button onclick="_flashView='selector';renderFlash()" style="padding:6px 12px;border-radius:7px;font-size:11px;border:1px solid var(--b);background:transparent;color:var(--muted);cursor:pointer">← Volver</button>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:700">Vista previa · ${_flashProducts.length} imágenes</div>
        <div style="font-size:10px;color:var(--muted)">1080×1920px · WhatsApp Story</div>
      </div>
      <button id="flashDownloadBtn" onclick="flashDownloadAll()" style="padding:8px 18px;border-radius:7px;font-size:12px;font-weight:700;border:none;background:#25d366;color:#fff;cursor:pointer">⬇ Descargar todo</button>
    </div>
    <div style="flex:1;overflow-y:auto;padding:16px">
      <div style="display:flex;flex-wrap:wrap;gap:14px" id="flashPreviews"></div>
    </div>
  </div>`;

  const container=document.getElementById('flashPreviews');
  _flashProducts.forEach((p,i)=>{
    setTimeout(()=>{
      const wrap=document.createElement('div');
      wrap.style.cssText='display:flex;flex-direction:column;align-items:center;gap:8px';
      const canvas=document.createElement('canvas');
      canvas.width=216; canvas.height=384;
      canvas.style.cssText='border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.6);cursor:pointer';
      canvas.title='Click para descargar individualmente';
      canvas.onclick=()=>flashDownloadOne(p,i+1,today);
      drawFlashCard(canvas,p,216,384);
      const label=document.createElement('div');
      label.style.cssText='font-size:9px;color:var(--muted);text-align:center;max-width:180px;line-height:1.3';
      label.textContent=flashShortDesc(p.d);
      wrap.appendChild(canvas); wrap.appendChild(label);
      container.appendChild(wrap);
    },i*70);
  });
}

// ── CANVAS DRAW ───────────────────────────────────────────────
function drawFlashCard(canvas,product,W,H){
  const ctx=canvas.getContext('2d');
  const cat=FLASH_CATS[product.cat];
  const s=W/1080;

  // ── BACKGROUND ──
  const bg=ctx.createLinearGradient(0,0,W,H);
  bg.addColorStop(0,'#080c18');
  bg.addColorStop(0.45,'#0f1520');
  bg.addColorStop(1,'#090d15');
  ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);

  // Metallic sheen diagonal
  const sheen=ctx.createLinearGradient(0,0,W,H*0.5);
  sheen.addColorStop(0,'rgba(255,255,255,.04)');
  sheen.addColorStop(0.5,'rgba(255,255,255,.07)');
  sheen.addColorStop(1,'rgba(255,255,255,.01)');
  ctx.fillStyle=sheen; ctx.fillRect(0,0,W,H*0.5);

  // Watermark
  ctx.save(); ctx.globalAlpha=0.03;
  ctx.font=`bold ${55*s}px -apple-system,sans-serif`;
  ctx.fillStyle='#fff'; ctx.textAlign='center';
  for(let row=0;row<7;row++){
    ctx.save(); ctx.translate(W/2,row*(H/6));
    ctx.rotate(-0.28); ctx.fillText('INTERNACIONAL',0,0); ctx.restore();
  }
  ctx.restore();

  // ── RED ACCENT LINES ──
  ctx.fillStyle='#e8180e'; ctx.fillRect(0,0,W,4*s);
  ctx.fillStyle='#e8180e'; ctx.fillRect(0,H-4*s,W,4*s);

  // ── HEADER ──
  ctx.textAlign='center';
  ctx.font=`bold ${24*s}px -apple-system,sans-serif`;
  ctx.fillStyle='#fff';
  ctx.fillText('INTERNACIONAL',W/2,38*s);
  ctx.font=`${12*s}px -apple-system,sans-serif`;
  ctx.fillStyle='rgba(255,255,255,.4)';
  ctx.fillText('Repuestos del Automotor',W/2,54*s);

  // Red line separator
  ctx.fillStyle='#e8180e'; ctx.fillRect(W/2-80*s,63*s,160*s,2*s);

  // ── CATEGORY BADGE ──
  const bW=220*s,bH=30*s,bX=W/2-bW/2,bY=72*s;
  ctx.fillStyle=cat.bg;
  frr(ctx,bX,bY,bW,bH,15*s); ctx.fill();
  ctx.strokeStyle=cat.color+'99'; ctx.lineWidth=1*s;
  frr(ctx,bX,bY,bW,bH,15*s); ctx.stroke();
  ctx.font=`bold ${12*s}px -apple-system,sans-serif`;
  ctx.fillStyle=cat.color; ctx.textAlign='center';
  ctx.fillText(`${cat.icon}  ${cat.tag}`,W/2,bY+20*s);

  // ── PRODUCT IMAGE — DOMINANTE (60-70% del alto) ──
  const imgAreaY=112*s;
  const imgAreaH=H*0.62; // 62% del alto total
  const imgAreaX=20*s;
  const imgAreaW=W-40*s;

  // Glow halo behind product
  const halo=ctx.createRadialGradient(W/2,imgAreaY+imgAreaH*0.45,imgAreaH*0.05,W/2,imgAreaY+imgAreaH*0.45,imgAreaH*0.55);
  halo.addColorStop(0,'rgba(255,255,255,.08)');
  halo.addColorStop(0.6,'rgba(255,255,255,.03)');
  halo.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=halo; ctx.fillRect(imgAreaX,imgAreaY,imgAreaW,imgAreaH);

  // Load and draw product image — fills the full area
  const imgSrc=product._imgUrl||product.img;
  if(imgSrc){
    const img=new Image();
    img.crossOrigin='anonymous';
    img.onload=()=>{
      ctx.save();
      // Clip to image area with slight rounding
      frr(ctx,imgAreaX,imgAreaY,imgAreaW,imgAreaH,16*s); ctx.clip();

      // Fit image — fill 75-80% of the area maintaining aspect ratio
      const ar=img.width/img.height;
      const maxW=imgAreaW*0.88, maxH=imgAreaH*0.88;
      let dw,dh;
      if(ar>1){ dw=maxW; dh=maxW/ar; }
      else { dh=maxH; dw=maxH*ar; }
      // Ensure it doesn't exceed bounds
      if(dw>maxW){ dw=maxW; dh=dw/ar; }
      if(dh>maxH){ dh=maxH; dw=dh*ar; }

      const dx=imgAreaX+(imgAreaW-dw)/2;
      const dy=imgAreaY+(imgAreaH-dh)/2;

      // Drop shadow behind product
      ctx.shadowColor='rgba(0,0,0,.6)';
      ctx.shadowBlur=40*s;
      ctx.shadowOffsetY=10*s;
      ctx.drawImage(img,dx,dy,dw,dh);
      ctx.shadowBlur=0; ctx.shadowOffsetY=0;
      ctx.restore();

      // Bottom gradient fade (product blends into info block)
      const fade=ctx.createLinearGradient(0,imgAreaY+imgAreaH*0.55,0,imgAreaY+imgAreaH);
      fade.addColorStop(0,'rgba(9,13,21,0)');
      fade.addColorStop(1,'rgba(9,13,21,.85)');
      ctx.fillStyle=fade;
      ctx.fillRect(imgAreaX,imgAreaY+imgAreaH*0.55,imgAreaW,imgAreaH*0.45);
    };
    img.onerror=()=>{
      // Show error message on canvas
      ctx.font=`bold ${16*s}px sans-serif`;
      ctx.fillStyle='rgba(239,68,68,.8)'; ctx.textAlign='center';
      ctx.fillText('⚠ Sin imagen de producto',W/2,imgAreaY+imgAreaH/2);
    };
    img.src=imgSrc;
  }

  // ── INFO BLOCK (zona inferior) ──
  const infoY=imgAreaY+imgAreaH+8*s;
  const infoH=H-infoY-8*s;

  // Info background glass
  ctx.fillStyle='rgba(255,255,255,.03)';
  frr(ctx,20*s,infoY-20*s,W-40*s,infoH+10*s,16*s); ctx.fill();

  // Product name — bold, uppercase, max 2 lines
  const desc=flashShortDesc(product.d);
  ctx.font=`bold ${30*s}px -apple-system,sans-serif`;
  ctx.fillStyle='#ffffff'; ctx.textAlign='center';
  flashWrap(ctx,desc,W/2,infoY+20*s,W-80*s,36*s,`bold ${30*s}px -apple-system,sans-serif`);

  // Rubro in red
  ctx.font=`bold ${14*s}px -apple-system,sans-serif`;
  ctx.fillStyle='#e8180e'; ctx.textAlign='center';
  ctx.fillText(product.r.toUpperCase(),W/2,infoY+78*s);

  // Code
  ctx.font=`${12*s}px monospace`;
  ctx.fillStyle='rgba(255,255,255,.3)'; ctx.textAlign='center';
  ctx.fillText('COD: '+product.c,W/2,infoY+96*s);

  // Stats chips
  const statY=infoY+114*s;
  const stats=[];
  if(product.stk>0) stats.push(`📦 ${product.stk} UNID.`);
  if(product.rhy>0) stats.push(`🔄 ${product.rhy}/MES`);
  if(product.p>0)   stats.push(`💲 $${Math.round(product.p).toLocaleString('es-AR')}`);
  const nS=Math.min(stats.length,3);
  if(nS>0){
    const chipW=(W-60*s)/nS-8*s, chipH=38*s;
    stats.slice(0,3).forEach((st,i)=>{
      const cx=30*s+i*(chipW+8*s);
      ctx.fillStyle='rgba(255,255,255,.07)';
      frr(ctx,cx,statY,chipW,chipH,8*s); ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,.1)'; ctx.lineWidth=1*s;
      frr(ctx,cx,statY,chipW,chipH,8*s); ctx.stroke();
      ctx.font=`bold ${11*s}px -apple-system,sans-serif`;
      ctx.fillStyle='#fff'; ctx.textAlign='center';
      ctx.fillText(st,cx+chipW/2,statY+24*s);
    });
  }

  // CTA Button
  const ctaY=infoY+162*s, ctaW=W-80*s, ctaH=62*s, ctaX=40*s;
  ctx.shadowColor='rgba(37,211,102,.5)'; ctx.shadowBlur=18*s;
  const ctaG=ctx.createLinearGradient(ctaX,ctaY,ctaX+ctaW,ctaY);
  ctaG.addColorStop(0,'#25d366'); ctaG.addColorStop(1,'#128c7e');
  ctx.fillStyle=ctaG; frr(ctx,ctaX,ctaY,ctaW,ctaH,31*s); ctx.fill();
  ctx.shadowBlur=0;
  ctx.font=`bold ${20*s}px -apple-system,sans-serif`;
  ctx.fillStyle='#fff'; ctx.textAlign='center';
  ctx.fillText('📱 CONSULTANOS POR WHATSAPP',W/2,ctaY+40*s);

  // Quality badges
  const qY=infoY+238*s;
  ['✓ GARANTÍA','★ CALIDAD','⚡ ENVÍOS'].forEach((b,i)=>{
    ctx.font=`bold ${10*s}px -apple-system,sans-serif`;
    ctx.fillStyle='rgba(255,255,255,.4)'; ctx.textAlign='center';
    ctx.fillText(b,W/2+(i-1)*240*s,qY);
  });
}

// ── CANVAS HELPERS ────────────────────────────────────────────
function frr(ctx,x,y,w,h,r){
  ctx.beginPath(); ctx.moveTo(x+r,y);
  ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r);
  ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
  ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
  ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r); ctx.closePath();
}
function flashWrap(ctx,text,x,y,maxW,lineH,font){
  ctx.font=font;
  const words=text.split(' '); let line=''; let cy=y;
  for(let i=0;i<words.length;i++){
    const test=line+(line?' ':'')+words[i];
    if(ctx.measureText(test).width>maxW&&line){
      ctx.fillText(line,x,cy); line=words[i]; cy+=lineH;
    } else line=test;
  }
  if(line) ctx.fillText(line,x,cy);
}
function flashShortDesc(desc){
  if(!desc) return '';
  let d=desc.replace(/\s*[-–]\s*\d+.*$/,'').replace(/\s+(APTA PARA|PARA|CON|DE|DEL).*$/i,'').trim();
  if(d.length>50) d=d.slice(0,48)+'…';
  return d.toUpperCase();
}

// ── DOWNLOAD ─────────────────────────────────────────────────
function flashDownloadOne(product,num,dateStr){
  const c=document.createElement('canvas'); c.width=1080; c.height=1920;
  drawFlashCard(c,product,1080,1920);
  setTimeout(()=>{ const a=document.createElement('a'); a.download=`ESTADO_${dateStr}_${String(num).padStart(2,'0')}.png`; a.href=c.toDataURL('image/png',1.0); a.click(); },1000);
}
async function flashDownloadAll(){
  const btn=document.getElementById('flashDownloadBtn');
  if(btn){btn.textContent='⏳ Generando…';btn.disabled=true;}
  const today=new Date().toISOString().slice(0,10).replace(/-/g,'');
  flashSaveHist(_flashProducts.map(p=>p.c));
  for(let i=0;i<_flashProducts.length;i++){
    const p=_flashProducts[i];
    if(btn) btn.textContent=`⏳ ${i+1}/${_flashProducts.length}…`;
    await new Promise(resolve=>{
      const c=document.createElement('canvas'); c.width=1080; c.height=1920;
      drawFlashCard(c,p,1080,1920);
      setTimeout(()=>{ const a=document.createElement('a'); a.download=`ESTADO_${today}_${String(i+1).padStart(2,'0')}.png`; a.href=c.toDataURL('image/png',1.0); a.click(); setTimeout(resolve,500); },1000);
    });
  }
  if(btn){btn.textContent='✅ Descargados';btn.disabled=false;}
  notify(`${_flashProducts.length} estados descargados`,'ok');
}
function flashRemoveProduct(code){ _flashProducts=_flashProducts.filter(p=>p.c!==code); renderFlashSelector(document.getElementById('flashContainer')); }
function flashRegenerate(){ _flashProducts=flashSelectProducts(); renderFlashSelector(document.getElementById('flashContainer')); notify('Regenerado','ok'); }
