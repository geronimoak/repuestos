// ══════════════════════════════════════════════════════════════
// FLASH VENTAS 360 — I-REP v2.0
// Estética automotriz premium · fondo oscuro · rojo acento
// ══════════════════════════════════════════════════════════════

const FLASH_HIST_KEY = 'irep_flash_history_v1';
const FLASH_CATS = {
  U: { label: 'URGENCIA',    color: '#ef4444', bg: 'rgba(239,68,68,.15)',    icon: '🔴', tag: 'STOCK LIMITADO'   },
  L: { label: 'LIQUIDACIÓN', color: '#f97316', bg: 'rgba(249,115,22,.15)',   icon: '🟠', tag: 'OFERTA ESPECIAL'  },
  O: { label: 'OPORTUNIDAD', color: '#eab308', bg: 'rgba(234,179,8,.15)',    icon: '🟡', tag: 'BUENA RELACIÓN'   },
  G: { label: 'GANCHO',      color: '#22c55e', bg: 'rgba(34,197,94,.15)',    icon: '🟢', tag: 'MÁS VENDIDO'      },
};
const FLASH_MIX = { U:2, L:3, O:3, G:2 };
let _flashProducts = null, _flashSelected = [], _flashView = 'selector';

// ── HISTORIAL ─────────────────────────────────────────────────
function flashGetHist(){
  try{ const h=JSON.parse(localStorage.getItem(FLASH_HIST_KEY)||'[]');
    return h.filter(e=>e.ts>Date.now()-7*86400000); }catch{ return []; }
}
function flashSaveHist(codes){
  const h=flashGetHist();
  h.push({ts:Date.now(),date:new Date().toISOString().slice(0,10),codes});
  localStorage.setItem(FLASH_HIST_KEY,JSON.stringify(h.slice(-30)));
}
function flashRecentCodes(days=5){
  const cutoff=Date.now()-days*86400000, recent=new Set();
  flashGetHist().filter(e=>e.ts>cutoff).forEach(e=>e.codes.forEach(c=>recent.add(c)));
  return recent;
}

// ── CLASIFICACIÓN ─────────────────────────────────────────────
function flashClassify(item){
  const cov=item.cov||999,rhy=item.rhy||0,stk=item.stk||0;
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

function flashSelectProducts(){
  const motor=window._MOTOR||[];
  if(!motor.length) return [];
  const recent=flashRecentCodes(5);
  const maxRhy=Math.max(...motor.map(x=>x.rhy||0),1);
  const maxRnk=Math.max(...motor.map(x=>x.rnk||0),1);
  const scored=motor
    .filter(x=>x.stk>=0&&x.rnk>0&&!recent.has(x.c)&&x.d&&x.d.length>3)
    .map(x=>({...x,cat:flashClassify(x),score:flashScore(x,maxRhy,maxRnk),
      img:(window.IMG_MAP&&window.IMG_MAP[x.img])||null}))
    .sort((a,b)=>b.score-a.score);
  const bycat={U:[],L:[],O:[],G:[]};
  scored.forEach(x=>bycat[x.cat].push(x));
  const selected=[],usedCodes=new Set();
  Object.entries(FLASH_MIX).forEach(([cat,min])=>{
    bycat[cat].slice(0,min).forEach(x=>{if(!usedCodes.has(x.c)){selected.push(x);usedCodes.add(x.c);}});
  });
  scored.filter(x=>!usedCodes.has(x.c)).slice(0,10-selected.length).forEach(x=>{selected.push(x);usedCodes.add(x.c);});
  const catOrder={U:0,G:1,O:2,L:3};
  return selected.sort((a,b)=>(catOrder[a.cat]-catOrder[b.cat])||(b.score-a.score));
}

// ── RENDER MAIN ───────────────────────────────────────────────
function renderFlash(){
  const cont=document.getElementById('flashContainer');
  if(!cont) return;
  if(!window._MOTOR){
    cont.innerHTML=`<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:16px;color:var(--muted)">
      <div style="width:44px;height:44px;border:3px solid var(--b);border-top-color:var(--cyan);border-radius:50%;animation:spin 1s linear infinite"></div>
      <div style="font-size:12px">Cargando motor de decisión…</div></div>`;
    return;
  }
  if(_flashView==='selector') renderFlashSelector(cont);
  else renderFlashPreview(cont);
}

// ── SELECTOR ─────────────────────────────────────────────────
function renderFlashSelector(cont){
  _flashProducts=flashSelectProducts();
  const today=new Date().toISOString().slice(0,10);
  const catCounts={U:0,L:0,O:0,G:0};
  _flashProducts.forEach(p=>catCounts[p.cat]++);

  const summaryBar=Object.entries(FLASH_CATS).map(([k,v])=>
    `<div style="display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;background:${v.bg};border:1px solid ${v.color}44">
      <span>${v.icon}</span>
      <div><div style="font-size:11px;font-weight:700;color:${v.color}">${catCounts[k]}</div>
      <div style="font-size:9px;color:var(--muted)">${v.label}</div></div></div>`
  ).join('');

  const cards=_flashProducts.map((p,i)=>{
    const cat=FLASH_CATS[p.cat];
    const desc=flashShortDesc(p.d);
    const imgHtml=p.img
      ?`<img src="${p.img}" style="width:44px;height:44px;object-fit:contain;border-radius:6px" onerror="this.style.display='none'">`
      :`<div style="width:44px;height:44px;border-radius:6px;background:rgba(255,255,255,.05);display:flex;align-items:center;justify-content:center;font-size:18px">${cat.icon}</div>`;
    return`<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;border:1px solid var(--b);background:var(--s2);margin-bottom:6px">
      <div style="font-size:11px;font-weight:700;color:var(--muted);width:18px;text-align:center">${i+1}</div>
      ${imgHtml}
      <div style="flex:1;min-width:0">
        <div style="font-size:11px;font-weight:700;line-height:1.3;margin-bottom:2px">${desc}</div>
        <div style="font-size:9px;color:var(--muted);font-family:monospace">${p.c}</div>
        <div style="display:flex;gap:5px;margin-top:3px;flex-wrap:wrap">
          <span style="font-size:9px;padding:1px 6px;border-radius:10px;background:${cat.bg};color:${cat.color};font-weight:700">${cat.icon} ${cat.label}</span>
          <span style="font-size:9px;color:var(--muted)">📦 ${p.stk}u</span>
          <span style="font-size:9px;color:var(--muted)">↻ ${p.rhy}/mes</span>
        </div>
      </div>
      <button onclick="flashRemoveProduct('${p.c}')" style="padding:4px 8px;border-radius:4px;font-size:10px;border:1px solid var(--b);background:transparent;color:var(--muted);cursor:pointer">✕</button>
    </div>`;
  }).join('');

  cont.innerHTML=`<div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
    <div style="padding:12px 16px;border-bottom:1px solid var(--b);background:var(--s1);flex-shrink:0">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div>
          <div style="font-size:14px;font-weight:700">⚡ Flash Ventas 360</div>
          <div style="font-size:10px;color:var(--muted)">${today} · ${_flashProducts.length} productos · estética automotriz premium</div>
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="flashRegenerate()" style="padding:6px 12px;border-radius:7px;font-size:11px;border:1px solid var(--b);background:transparent;color:var(--muted);cursor:pointer">↺ Regenerar</button>
          <button onclick="_flashView='preview';renderFlash()" style="padding:6px 16px;border-radius:7px;font-size:11px;font-weight:700;border:none;background:var(--cyan);color:#fff;cursor:pointer">👁 Vista previa →</button>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${summaryBar}</div>
    </div>
    <div style="flex:1;overflow-y:auto;padding:12px 16px">
      <div style="font-size:10px;color:var(--muted);margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Selección del día · ✕ para quitar · ↺ para regenerar</div>
      ${cards}
    </div>
  </div>`;
}

// ── PREVIEW ───────────────────────────────────────────────────
function renderFlashPreview(cont){
  const today=new Date().toISOString().slice(0,10).replace(/-/g,'');
  cont.innerHTML=`<div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
    <div style="padding:12px 16px;border-bottom:1px solid var(--b);background:var(--s1);flex-shrink:0;display:flex;align-items:center;gap:10px">
      <button onclick="_flashView='selector';renderFlash()" style="padding:6px 12px;border-radius:7px;font-size:11px;border:1px solid var(--b);background:transparent;color:var(--muted);cursor:pointer">← Volver</button>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:700">Vista previa · estética premium</div>
        <div style="font-size:10px;color:var(--muted)">${_flashProducts.length} imágenes · 1080×1920px · formato WhatsApp</div>
      </div>
      <button id="flashDownloadBtn" onclick="flashDownloadAll()" style="padding:8px 18px;border-radius:7px;font-size:12px;font-weight:700;border:none;background:#25d366;color:#fff;cursor:pointer">⬇ Descargar todo</button>
    </div>
    <div style="flex:1;overflow-y:auto;padding:16px">
      <div style="display:flex;flex-wrap:wrap;gap:14px;justify-content:flex-start" id="flashPreviews"></div>
    </div>
  </div>`;

  const container=document.getElementById('flashPreviews');
  _flashProducts.forEach((p,i)=>{
    setTimeout(()=>{
      const wrap=document.createElement('div');
      wrap.style.cssText='display:flex;flex-direction:column;align-items:center;gap:8px';
      const canvas=document.createElement('canvas');
      canvas.width=216; canvas.height=384;
      canvas.style.cssText='border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.5);cursor:pointer';
      canvas.title='Click para descargar';
      canvas.onclick=()=>flashDownloadOne(p,i+1,today);
      drawFlashCard(canvas,p,216,384);
      const label=document.createElement('div');
      label.style.cssText='font-size:9px;color:var(--muted);text-align:center;max-width:180px;line-height:1.3';
      label.textContent=flashShortDesc(p.d);
      wrap.appendChild(canvas); wrap.appendChild(label);
      container.appendChild(wrap);
    },i*60);
  });
}

// ── CANVAS PREMIUM ────────────────────────────────────────────
function drawFlashCard(canvas,product,W,H){
  const ctx=canvas.getContext('2d');
  const cat=FLASH_CATS[product.cat];
  const s=W/1080; // scale factor

  // ── BACKGROUND: dark gradient automotriz ──
  const bgGrad=ctx.createLinearGradient(0,0,W,H);
  bgGrad.addColorStop(0,'#0a0e1a');
  bgGrad.addColorStop(0.5,'#111827');
  bgGrad.addColorStop(1,'#0d1117');
  ctx.fillStyle=bgGrad;
  ctx.fillRect(0,0,W,H);

  // Metallic diagonal sheen
  const sheen=ctx.createLinearGradient(0,0,W,H*0.6);
  sheen.addColorStop(0,'rgba(255,255,255,.03)');
  sheen.addColorStop(0.5,'rgba(255,255,255,.06)');
  sheen.addColorStop(1,'rgba(255,255,255,.01)');
  ctx.fillStyle=sheen;
  ctx.fillRect(0,0,W,H);

  // Background watermark text (brand repeated)
  ctx.save();
  ctx.globalAlpha=0.04;
  ctx.font=`bold ${60*s}px -apple-system,sans-serif`;
  ctx.fillStyle='#ffffff';
  ctx.textAlign='center';
  for(let row=0;row<6;row++){
    for(let col=0;col<3;col++){
      ctx.save();
      ctx.translate(col*(W/2),row*(H/5)+50*s);
      ctx.rotate(-0.3);
      ctx.fillText('INTERNACIONAL',0,0);
      ctx.restore();
    }
  }
  ctx.restore();

  // ── TOP RED ACCENT BAR ──
  ctx.fillStyle='#e8180e';
  ctx.fillRect(0,0,W,5*s);

  // Small red corner accent
  ctx.fillStyle='#e8180e';
  ctx.fillRect(0,0,40*s,2*s);
  ctx.fillRect(W-40*s,0,40*s,2*s);

  // ── HEADER: logo + brand ──
  ctx.textAlign='center';
  ctx.font=`bold ${22*s}px -apple-system,sans-serif`;
  ctx.fillStyle='#ffffff';
  ctx.fillText('INTERNACIONAL', W/2, 38*s);

  ctx.font=`${11*s}px -apple-system,sans-serif`;
  ctx.fillStyle='#9ca3af';
  ctx.fillText('Repuestos del Automotor', W/2, 53*s);

  // Thin separator line
  ctx.strokeStyle='rgba(255,255,255,.08)';
  ctx.lineWidth=1*s;
  ctx.beginPath(); ctx.moveTo(60*s,65*s); ctx.lineTo(W-60*s,65*s); ctx.stroke();

  // ── CATEGORY BADGE ──
  const badgeW=200*s, badgeH=32*s;
  const badgeX=W/2-badgeW/2, badgeY=76*s;
  ctx.fillStyle=cat.bg;
  flashRoundRect(ctx,badgeX,badgeY,badgeW,badgeH,16*s); ctx.fill();
  ctx.strokeStyle=cat.color+'88'; ctx.lineWidth=1*s;
  flashRoundRect(ctx,badgeX,badgeY,badgeW,badgeH,16*s); ctx.stroke();
  ctx.font=`bold ${12*s}px -apple-system,sans-serif`;
  ctx.fillStyle=cat.color;
  ctx.textAlign='center';
  ctx.fillText(`${cat.icon}  ${cat.tag}`, W/2, badgeY+21*s);

  // ── PRODUCT IMAGE CARD (glass effect) ──
  const cardX=60*s, cardY=120*s;
  const cardW=W-120*s, cardH=460*s;

  // Glass card background
  ctx.fillStyle='rgba(255,255,255,.04)';
  flashRoundRect(ctx,cardX,cardY,cardW,cardH,20*s); ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,.08)'; ctx.lineWidth=1*s;
  flashRoundRect(ctx,cardX,cardY,cardW,cardH,20*s); ctx.stroke();

  // Inner glow at top of card
  const cardGlow=ctx.createLinearGradient(cardX,cardY,cardX,cardY+cardH*0.3);
  cardGlow.addColorStop(0,'rgba(255,255,255,.06)');
  cardGlow.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=cardGlow;
  flashRoundRect(ctx,cardX,cardY,cardW,cardH*0.3,20*s); ctx.fill();

  // Product image (centered in card)
  const imgPad=40*s;
  const imgX=cardX+imgPad, imgY=cardY+imgPad;
  const imgW=cardW-imgPad*2, imgH=cardH-imgPad*2;

  if(product.img){
    const img=new Image();
    img.crossOrigin='anonymous';
    img.onload=()=>{
      ctx.save();
      flashRoundRect(ctx,imgX,imgY,imgW,imgH,12*s); ctx.clip();
      const ar=img.width/img.height;
      let dw=imgW,dh=imgH;
      if(ar>1) dh=imgW/ar; else dw=imgH*ar;
      dw=Math.min(dw,imgW); dh=Math.min(dh,imgH);
      // Glow behind image
      ctx.shadowColor='rgba(255,255,255,.2)';
      ctx.shadowBlur=30*s;
      ctx.drawImage(img,imgX+(imgW-dw)/2,imgY+(imgH-dh)/2,dw,dh);
      ctx.shadowBlur=0;
      ctx.restore();
      // Bottom fade on image
      const fade=ctx.createLinearGradient(0,imgY+imgH*0.6,0,imgY+imgH);
      fade.addColorStop(0,'rgba(17,24,39,0)');
      fade.addColorStop(1,'rgba(17,24,39,.7)');
      ctx.fillStyle=fade; ctx.fillRect(imgX,imgY+imgH*0.6,imgW,imgH*0.4);
    };
    img.onerror=()=>flashDrawPlaceholder(ctx,cardX+cardW/2,cardY+cardH/2,cat.icon,s);
    img.src=product.img;
  } else {
    flashDrawPlaceholder(ctx,cardX+cardW/2,cardY+cardH/2,cat.icon,s);
  }

  // ── PRODUCT INFO BLOCK ──
  const infoY=600*s;

  // Product description
  const desc=flashShortDesc(product.d);
  ctx.textAlign='center';
  ctx.font=`bold ${32*s}px -apple-system,sans-serif`;
  ctx.fillStyle='#ffffff';
  flashWrapText(ctx,desc,W/2,infoY,W-80*s,40*s,`bold ${32*s}px -apple-system,sans-serif`);

  // Red accent under title
  ctx.fillStyle='#e8180e';
  ctx.fillRect(W/2-50*s,infoY+52*s,100*s,3*s);

  // Rubro / category
  ctx.font=`${15*s}px -apple-system,sans-serif`;
  ctx.fillStyle='#e8180e';
  ctx.textAlign='center';
  ctx.fillText(product.r.toUpperCase(), W/2, infoY+78*s);

  // Code
  ctx.font=`${13*s}px 'SF Mono',monospace,sans-serif`;
  ctx.fillStyle='rgba(255,255,255,.35)';
  ctx.fillText('COD: '+product.c, W/2, infoY+98*s);

  // ── STATS ROW ──
  const statsY=760*s;
  const statItems=[];
  if(product.stk>0)  statItems.push({icon:'📦',val:`${product.stk} UNID.`});
  if(product.rhy>0)  statItems.push({icon:'🔄',val:`${product.rhy}/MES`});
  if(product.p>0)    statItems.push({icon:'💲',val:`$${Math.round(product.p).toLocaleString('es-AR')}`});

  const nStats=Math.min(statItems.length,3);
  const statW=260*s, statH=60*s, statGap=20*s;
  const totalW=nStats*statW+(nStats-1)*statGap;
  const startX=(W-totalW)/2;

  statItems.slice(0,3).forEach((st,i)=>{
    const sx=startX+i*(statW+statGap);
    ctx.fillStyle='rgba(255,255,255,.06)';
    flashRoundRect(ctx,sx,statsY,statW,statH,10*s); ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.1)'; ctx.lineWidth=1*s;
    flashRoundRect(ctx,sx,statsY,statW,statH,10*s); ctx.stroke();
    ctx.font=`bold ${13*s}px -apple-system,sans-serif`;
    ctx.fillStyle='#ffffff'; ctx.textAlign='center';
    ctx.fillText(`${st.icon} ${st.val}`,sx+statW/2,statsY+37*s);
  });

  // ── CTA BUTTON (WhatsApp green) ──
  const ctaY=850*s, ctaW=700*s, ctaH=80*s;
  const ctaX=(W-ctaW)/2;
  const ctaGrad=ctx.createLinearGradient(ctaX,ctaY,ctaX+ctaW,ctaY);
  ctaGrad.addColorStop(0,'#25d366');
  ctaGrad.addColorStop(1,'#128c7e');
  ctx.fillStyle=ctaGrad;
  flashRoundRect(ctx,ctaX,ctaY,ctaW,ctaH,40*s); ctx.fill();

  // CTA shadow
  ctx.shadowColor='rgba(37,211,102,.4)';
  ctx.shadowBlur=20*s;
  ctx.fillStyle=ctaGrad;
  flashRoundRect(ctx,ctaX,ctaY,ctaW,ctaH,40*s); ctx.fill();
  ctx.shadowBlur=0;

  ctx.font=`bold ${22*s}px -apple-system,sans-serif`;
  ctx.fillStyle='#ffffff'; ctx.textAlign='center';
  ctx.fillText('📱 CONSULTANOS POR WHATSAPP', W/2, ctaY+50*s);

  // ── QUALITY BADGES ──
  const badgesY=960*s;
  const badges=['✓ GARANTÍA','★ CALIDAD','⚡ ENVÍOS'];
  badges.forEach((b,i)=>{
    const bx=(W/2)+(i-1)*280*s;
    ctx.font=`bold ${12*s}px -apple-system,sans-serif`;
    ctx.fillStyle='rgba(255,255,255,.5)'; ctx.textAlign='center';
    ctx.fillText(b,bx,badgesY);
  });

  // Separator
  ctx.strokeStyle='rgba(232,24,14,.3)'; ctx.lineWidth=1*s;
  ctx.beginPath(); ctx.moveTo(60*s,985*s); ctx.lineTo(W-60*s,985*s); ctx.stroke();

  // ── FOOTER ──
  ctx.font=`${11*s}px -apple-system,sans-serif`;
  ctx.fillStyle='rgba(255,255,255,.25)'; ctx.textAlign='center';
  const dateStr=new Date().toLocaleDateString('es-AR',{day:'2-digit',month:'long',year:'numeric'});
  ctx.fillText('Internacional Repuestos · '+dateStr, W/2, H-18*s);

  // Bottom red line
  ctx.fillStyle='#e8180e';
  ctx.fillRect(0,H-4*s,W,4*s);
}

function flashDrawPlaceholder(ctx,cx,cy,icon,s){
  ctx.font=`${120*s}px sans-serif`;
  ctx.textAlign='center'; ctx.fillStyle='rgba(255,255,255,.1)';
  ctx.fillText(icon,cx,cy+40*s);
}

// ── HELPERS ───────────────────────────────────────────────────
function flashShortDesc(desc){
  if(!desc) return '';
  let d=desc.replace(/\s*[-–]\s*\d+.*$/,'').trim();
  d=d.replace(/\s+(APTA PARA|PARA|CON|DE|DEL).*$/i,'').trim();
  if(d.length>55) d=d.slice(0,53)+'…';
  return d.toUpperCase();
}

function flashRoundRect(ctx,x,y,w,h,r){
  ctx.beginPath(); ctx.moveTo(x+r,y);
  ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r);
  ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
  ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
  ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r); ctx.closePath();
}

function flashWrapText(ctx,text,x,y,maxW,lineH,font){
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

// ── DOWNLOAD ─────────────────────────────────────────────────
function flashDownloadOne(product,num,dateStr){
  const canvas=document.createElement('canvas');
  canvas.width=1080; canvas.height=1920;
  drawFlashCard(canvas,product,1080,1920);
  setTimeout(()=>{
    const link=document.createElement('a');
    link.download=`ESTADO_${dateStr}_${String(num).padStart(2,'0')}.png`;
    link.href=canvas.toDataURL('image/png',1.0); link.click();
  },800);
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
      const canvas=document.createElement('canvas');
      canvas.width=1080; canvas.height=1920;
      drawFlashCard(canvas,p,1080,1920);
      setTimeout(()=>{
        const link=document.createElement('a');
        link.download=`ESTADO_${today}_${String(i+1).padStart(2,'0')}.png`;
        link.href=canvas.toDataURL('image/png',1.0); link.click();
        setTimeout(resolve,500);
      },900);
    });
  }
  if(btn){btn.textContent='✅ Descargados';btn.disabled=false;}
  notify(`${_flashProducts.length} estados descargados`,'ok');
}

function flashRemoveProduct(code){
  _flashProducts=_flashProducts.filter(p=>p.c!==code);
  renderFlashSelector(document.getElementById('flashContainer'));
}

function flashRegenerate(){
  _flashProducts=flashSelectProducts();
  renderFlashSelector(document.getElementById('flashContainer'));
  notify('Productos regenerados','ok');
}
