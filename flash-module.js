// ══════════════════════════════════════════════════════════════
// FLASH VENTAS 360 — I-REP v1.0
// Generador automático de estados de WhatsApp
// ══════════════════════════════════════════════════════════════

const FLASH_HIST_KEY = 'irep_flash_history_v1';
const FLASH_CATS = {
  U: { label: 'URGENCIA',    color: '#ef4444', bg: '#fef2f2', icon: '🔴' },
  L: { label: 'LIQUIDACIÓN', color: '#f97316', bg: '#fff7ed', icon: '🟠' },
  O: { label: 'OPORTUNIDAD', color: '#eab308', bg: '#fefce8', icon: '🟡' },
  G: { label: 'GANCHO',      color: '#22c55e', bg: '#f0fdf4', icon: '🟢' },
};
const FLASH_MIX = { U:2, L:3, O:3, G:2 }; // minimum per category
let _flashProducts = null, _flashSelected = [], _flashView = 'selector';

// ── HISTORIAL ─────────────────────────────────────────────────
function flashGetHist() {
  try {
    const h = JSON.parse(localStorage.getItem(FLASH_HIST_KEY) || '[]');
    const cutoff = Date.now() - 7 * 86400000;
    return h.filter(e => e.ts > cutoff);
  } catch { return []; }
}
function flashSaveHist(codes) {
  const h = flashGetHist();
  h.push({ ts: Date.now(), date: new Date().toISOString().slice(0,10), codes });
  localStorage.setItem(FLASH_HIST_KEY, JSON.stringify(h.slice(-30)));
}
function flashRecentCodes(days = 5) {
  const cutoff = Date.now() - days * 86400000;
  const recent = new Set();
  flashGetHist().filter(e => e.ts > cutoff).forEach(e => e.codes.forEach(c => recent.add(c)));
  return recent;
}

// ── CLASIFICACIÓN ─────────────────────────────────────────────
function flashClassify(item) {
  const cov = item.cov || 999;
  const rhy = item.rhy || 0;
  const stk = item.stk || 0;
  const rnk = item.rnk || 0;

  if (cov < 1.5 && rhy > 0)           return 'U'; // URGENCIA: se acaba
  if (cov > 10 && stk > 5)            return 'L'; // LIQUIDACIÓN: sobrestock
  if (rhy > 3 && cov >= 2 && cov < 8) return 'G'; // GANCHO: alta rotación
  return 'O';                                       // OPORTUNIDAD: el resto
}

// ── SCORE ─────────────────────────────────────────────────────
function flashScore(item, maxRhy, maxRnk) {
  const rhy_n  = maxRhy > 0 ? (item.rhy || 0) / maxRhy : 0;
  const rnk_n  = maxRnk > 0 ? (item.rnk || 0) / maxRnk : 0;
  const stk_n  = Math.min(1, (item.stk || 0) / 50);
  const urgency = (item.cov || 999) < 2 ? 1 : 0;
  const trend   = item.tr === 'up' ? 0.1 : item.tr === 'down' ? -0.1 : 0;
  return (rhy_n * 0.4) + (rnk_n * 0.2) - (stk_n * 0.2) + (urgency * 0.2) + trend;
}

// ── SELECT PRODUCTS ───────────────────────────────────────────
function flashSelectProducts() {
  const motor = window._MOTOR || [];
  if (!motor.length) return [];

  const recent = flashRecentCodes(5);
  const maxRhy = Math.max(...motor.map(x => x.rhy || 0), 1);
  const maxRnk = Math.max(...motor.map(x => x.rnk || 0), 1);

  // Score and classify all eligible products
  const scored = motor
    .filter(x => x.stk >= 0 && x.rnk > 0 && !recent.has(x.c) && x.d && x.d.length > 3)
    .map(x => ({
      ...x,
      cat:   flashClassify(x),
      score: flashScore(x, maxRhy, maxRnk),
      img:   (window.IMG_MAP && window.IMG_MAP[x.img]) || null,
    }))
    .sort((a, b) => b.score - a.score);

  // Guaranteed mix
  const bycat = { U:[], L:[], O:[], G:[] };
  scored.forEach(x => bycat[x.cat].push(x));

  const selected = [];
  const usedCodes = new Set();

  // Take minimum per category
  Object.entries(FLASH_MIX).forEach(([cat, min]) => {
    bycat[cat].slice(0, min).forEach(x => {
      if (!usedCodes.has(x.c)) { selected.push(x); usedCodes.add(x.c); }
    });
  });

  // Fill to 10 with top scored remaining
  scored.filter(x => !usedCodes.has(x.c)).slice(0, 10 - selected.length).forEach(x => {
    selected.push(x); usedCodes.add(x.c);
  });

  // Sort final selection by category then score
  const catOrder = { U:0, G:1, O:2, L:3 };
  return selected.sort((a, b) => (catOrder[a.cat] - catOrder[b.cat]) || (b.score - a.score));
}

// ── RENDER MAIN ───────────────────────────────────────────────
function renderFlash() {
  const cont = document.getElementById('flashContainer');
  if (!cont) return;

  if (!window._MOTOR) {
    cont.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:16px;color:var(--muted)">
      <div style="width:44px;height:44px;border:3px solid var(--b);border-top-color:var(--cyan);border-radius:50%;animation:spin 1s linear infinite"></div>
      <div style="font-size:12px;font-family:var(--mono)">Cargando datos del motor…</div>
      <button onclick="fetch(SERVER+'/api/motor').then(r=>r.json()).then(d=>{if(d.ok){window._MOTOR=d.motor;renderFlash();}})" style="padding:6px 16px;border-radius:6px;background:rgba(232,24,14,.15);border:1px solid var(--cyan);color:var(--cyan);font-size:11px;cursor:pointer">Cargar Motor</button>
    </div>`;
    return;
  }

  if (_flashView === 'selector') renderFlashSelector(cont);
  else if (_flashView === 'preview') renderFlashPreview(cont);
}

// ── SELECTOR VIEW ─────────────────────────────────────────────
function renderFlashSelector(cont) {
  _flashProducts = flashSelectProducts();
  const hist = flashGetHist();
  const today = new Date().toISOString().slice(0,10);
  const todayHist = hist.find(h => h.date === today);

  const catCounts = { U:0, L:0, O:0, G:0 };
  _flashProducts.forEach(p => catCounts[p.cat]++);

  const summaryBar = Object.entries(FLASH_CATS).map(([k,v]) =>
    `<div style="display:flex;align-items:center;gap:5px;padding:6px 12px;border-radius:8px;background:${v.bg};border:1px solid ${v.color}22">
      <span style="font-size:13px">${v.icon}</span>
      <div>
        <div style="font-size:11px;font-weight:700;color:${v.color}">${catCounts[k]}</div>
        <div style="font-size:9px;color:#666">${v.label}</div>
      </div>
    </div>`
  ).join('');

  const cards = _flashProducts.map((p, i) => {
    const cat = FLASH_CATS[p.cat];
    const desc = flashShortDesc(p.d);
    const imgHtml = p.img
      ? `<img src="${p.img}" style="width:48px;height:48px;object-fit:contain;border-radius:6px" onerror="this.style.display='none'">`
      : `<div style="width:48px;height:48px;border-radius:6px;background:#f0f0f0;display:flex;align-items:center;justify-content:center;font-size:20px">${cat.icon}</div>`;

    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;border:1px solid #e5e7eb;background:#fff;margin-bottom:6px">
      <div style="font-size:11px;font-weight:700;color:#9ca3af;width:18px;text-align:center">${i+1}</div>
      ${imgHtml}
      <div style="flex:1;min-width:0">
        <div style="font-size:11px;font-weight:700;color:#111;line-height:1.3;margin-bottom:2px">${desc}</div>
        <div style="font-size:9px;color:#6b7280;font-family:monospace">${p.c}</div>
        <div style="display:flex;gap:6px;margin-top:3px;flex-wrap:wrap">
          <span style="font-size:9px;padding:1px 6px;border-radius:10px;background:${cat.bg};color:${cat.color};font-weight:700">${cat.icon} ${cat.label}</span>
          <span style="font-size:9px;color:#6b7280">📦 ${p.stk}u</span>
          <span style="font-size:9px;color:#6b7280">↻ ${p.rhy}/mes</span>
          ${p.cov < 999 ? `<span style="font-size:9px;color:#6b7280">⏱ ${p.cov}m cob.</span>` : ''}
        </div>
      </div>
      <button onclick="flashRemoveProduct('${p.c}')" style="padding:4px 8px;border-radius:4px;font-size:10px;border:1px solid #e5e7eb;background:transparent;color:#9ca3af;cursor:pointer">✕</button>
    </div>`;
  }).join('');

  cont.innerHTML = `<div style="display:flex;flex-direction:column;height:100%;overflow:hidden;background:#f9fafb">
    <div style="padding:12px 16px;border-bottom:1px solid #e5e7eb;background:#fff;flex-shrink:0">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div>
          <div style="font-size:14px;font-weight:700;color:#111">⚡ Flash Ventas 360</div>
          <div style="font-size:10px;color:#6b7280">${today} · ${_flashProducts.length} productos seleccionados automáticamente</div>
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="flashRegenerate()" style="padding:6px 12px;border-radius:7px;font-size:11px;font-weight:600;border:1px solid #e5e7eb;background:#fff;color:#374151;cursor:pointer">↺ Regenerar</button>
          <button onclick="_flashView='preview';renderFlash()" style="padding:6px 16px;border-radius:7px;font-size:11px;font-weight:700;border:none;background:#111;color:#fff;cursor:pointer">👁 Vista previa →</button>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${summaryBar}</div>
    </div>
    <div style="flex:1;overflow-y:auto;padding:12px 16px">
      <div style="font-size:10px;color:#6b7280;margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Productos de hoy · clickeá ✕ para quitar uno</div>
      ${cards}
    </div>
    ${todayHist ? `<div style="padding:8px 16px;border-top:1px solid #e5e7eb;background:#fffbeb;font-size:10px;color:#92400e">⚠ Ya generaste estados hoy (${todayHist.codes.length} productos). Podés regenerar con nuevos productos.</div>` : ''}
  </div>`;
}

// ── PREVIEW + GENERATE ────────────────────────────────────────
function renderFlashPreview(cont) {
  const today = new Date().toISOString().slice(0,10).replace(/-/g,'');

  cont.innerHTML = `<div style="display:flex;flex-direction:column;height:100%;overflow:hidden;background:#f9fafb">
    <div style="padding:12px 16px;border-bottom:1px solid #e5e7eb;background:#fff;flex-shrink:0;display:flex;align-items:center;gap:10px">
      <button onclick="_flashView='selector';renderFlash()" style="padding:6px 12px;border-radius:7px;font-size:11px;border:1px solid #e5e7eb;background:#fff;color:#374151;cursor:pointer">← Volver</button>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:700;color:#111">Vista previa de estados</div>
        <div style="font-size:10px;color:#6b7280">${_flashProducts.length} imágenes · 1080×1920px · formato WhatsApp</div>
      </div>
      <button id="flashDownloadBtn" onclick="flashDownloadAll()" style="padding:8px 18px;border-radius:7px;font-size:12px;font-weight:700;border:none;background:#111;color:#fff;cursor:pointer">⬇ Descargar todo</button>
    </div>
    <div style="flex:1;overflow-y:auto;padding:16px">
      <div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:flex-start" id="flashPreviews"></div>
    </div>
  </div>`;

  // Generate previews progressively
  const container = document.getElementById('flashPreviews');
  _flashProducts.forEach((p, i) => {
    setTimeout(() => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px';
      const canvas = document.createElement('canvas');
      canvas.width = 270; canvas.height = 480; // preview size (1/4)
      canvas.style.cssText = 'border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,.15);cursor:pointer';
      canvas.title = 'Click para descargar individualmente';
      canvas.onclick = () => flashDownloadOne(p, i+1, today);
      drawFlashCard(canvas, p, 270, 480);
      const label = document.createElement('div');
      label.style.cssText = 'font-size:10px;color:#6b7280;text-align:center;max-width:200px;line-height:1.3';
      label.textContent = flashShortDesc(p.d);
      wrap.appendChild(canvas);
      wrap.appendChild(label);
      container.appendChild(wrap);
    }, i * 80);
  });
}

// ── CANVAS DRAW ───────────────────────────────────────────────
function drawFlashCard(canvas, product, W, H) {
  const ctx = canvas.getContext('2d');
  const cat = FLASH_CATS[product.cat];
  const scale = W / 1080;

  // Background gradient — neutral, clean
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(1, '#f8f8f8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Top accent bar
  ctx.fillStyle = cat.color;
  ctx.fillRect(0, 0, W, 6 * scale);

  // Category badge
  const badgeY = 28 * scale;
  const badgeX = W / 2;
  ctx.fillStyle = cat.bg;
  roundRect(ctx, badgeX - 70*scale, badgeY, 140*scale, 28*scale, 14*scale);
  ctx.fill();
  ctx.font = `bold ${11*scale}px -apple-system,sans-serif`;
  ctx.fillStyle = cat.color;
  ctx.textAlign = 'center';
  ctx.fillText(`${cat.icon}  ${cat.label}`, badgeX, badgeY + 18*scale);

  // LOGO / BRAND area
  ctx.font = `bold ${18*scale}px -apple-system,sans-serif`;
  ctx.fillStyle = '#1a1a1a';
  ctx.textAlign = 'center';
  ctx.fillText('INTERNACIONAL', W/2, 85*scale);
  ctx.font = `${10*scale}px -apple-system,sans-serif`;
  ctx.fillStyle = '#9ca3af';
  ctx.fillText('Repuestos del Automotor', W/2, 102*scale);

  // Divider
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1 * scale;
  ctx.beginPath();
  ctx.moveTo(80*scale, 115*scale);
  ctx.lineTo(W - 80*scale, 115*scale);
  ctx.stroke();

  // Product image area — centered square
  const imgY = 130*scale, imgSize = 480*scale;
  const imgX = (W - imgSize) / 2;

  // Image background circle/glow
  ctx.fillStyle = '#f5f5f5';
  roundRect(ctx, imgX, imgY, imgSize, imgSize, 24*scale);
  ctx.fill();

  // Draw image if available
  const imgSrc = product.img;
  if (imgSrc) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.save();
      roundRect(ctx, imgX, imgY, imgSize, imgSize, 24*scale);
      ctx.clip();
      // Fit image maintaining aspect ratio
      const ar = img.width / img.height;
      let dw = imgSize, dh = imgSize;
      if (ar > 1) dh = imgSize / ar; else dw = imgSize * ar;
      ctx.drawImage(img, imgX + (imgSize-dw)/2, imgY + (imgSize-dh)/2, dw, dh);
      ctx.restore();
      // Add subtle shadow overlay at bottom
      const shadow = ctx.createLinearGradient(0, imgY + imgSize*0.6, 0, imgY + imgSize);
      shadow.addColorStop(0, 'rgba(255,255,255,0)');
      shadow.addColorStop(1, 'rgba(248,248,248,0.6)');
      ctx.fillStyle = shadow;
      ctx.fillRect(imgX, imgY + imgSize*0.6, imgSize, imgSize*0.4);
    };
    img.onerror = () => drawFlashPlaceholder(ctx, imgX, imgY, imgSize, cat.icon, scale);
    img.src = imgSrc;
  } else {
    drawFlashPlaceholder(ctx, imgX, imgY, imgSize, cat.icon, scale);
  }

  // Product description
  const descY = 650*scale;
  const desc = flashShortDesc(product.d);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#111111';
  wrapText(ctx, desc, W/2, descY, W - 80*scale, 38*scale, `bold ${28*scale}px -apple-system,sans-serif`);

  // Product code
  ctx.font = `${16*scale}px 'SF Mono',monospace,sans-serif`;
  ctx.fillStyle = '#9ca3af';
  ctx.textAlign = 'center';
  ctx.fillText(product.c, W/2, 780*scale);

  // Stats bar
  const statsY = 840*scale;
  const stats = [];
  if (product.stk > 0)  stats.push({ icon: '📦', val: `${product.stk} en stock` });
  if (product.rhy > 0)  stats.push({ icon: '🔄', val: `${product.rhy}/mes` });
  if (product.p > 0)    stats.push({ icon: '💲', val: `$${Math.round(product.p).toLocaleString('es-AR')}` });

  stats.slice(0,3).forEach((s, i) => {
    const x = W/2 + (i - (stats.length-1)/2) * 220*scale;
    ctx.fillStyle = '#f3f4f6';
    roundRect(ctx, x - 90*scale, statsY, 180*scale, 52*scale, 10*scale);
    ctx.fill();
    ctx.font = `${15*scale}px -apple-system,sans-serif`;
    ctx.fillStyle = '#374151';
    ctx.textAlign = 'center';
    ctx.fillText(s.icon + ' ' + s.val, x, statsY + 32*scale);
  });

  // Rubro tag
  ctx.font = `${14*scale}px -apple-system,sans-serif`;
  ctx.fillStyle = '#d1d5db';
  ctx.textAlign = 'center';
  ctx.fillText(product.r, W/2, 940*scale);

  // Bottom divider
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1*scale;
  ctx.beginPath();
  ctx.moveTo(80*scale, 960*scale);
  ctx.lineTo(W - 80*scale, 960*scale);
  ctx.stroke();

  // CTA area
  ctx.font = `bold ${22*scale}px -apple-system,sans-serif`;
  ctx.fillStyle = '#111';
  ctx.textAlign = 'center';
  ctx.fillText('📞 Consultanos hoy', W/2, 1020*scale);
  ctx.font = `${15*scale}px -apple-system,sans-serif`;
  ctx.fillStyle = '#6b7280';
  ctx.fillText('Envíos • Stock disponible • Garantía', W/2, 1048*scale);

  // Bottom watermark
  ctx.font = `${12*scale}px -apple-system,sans-serif`;
  ctx.fillStyle = '#d1d5db';
  ctx.textAlign = 'center';
  const dateStr = new Date().toLocaleDateString('es-AR', {day:'2-digit',month:'long',year:'numeric'});
  ctx.fillText(dateStr, W/2, H - 20*scale);
}

function drawFlashPlaceholder(ctx, x, y, size, icon, scale) {
  ctx.font = `${size*0.35}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#d1d5db';
  ctx.fillText(icon, x + size/2, y + size/2 + size*0.12);
}

// ── HELPERS ───────────────────────────────────────────────────
function flashShortDesc(desc) {
  if (!desc) return '';
  // Remove technical suffixes, keep first meaningful part
  let d = desc.replace(/\s*[-–]\s*\d+.*$/, '').trim();
  d = d.replace(/\s+(APTA PARA|PARA|CON|DE|DEL).*$/i, '').trim();
  if (d.length > 60) d = d.slice(0, 58) + '…';
  return d;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, x, y, maxW, lineH, font) {
  ctx.font = font;
  const words = text.split(' ');
  let line = '';
  let currentY = y;
  for (let i = 0; i < words.length; i++) {
    const test = line + (line ? ' ' : '') + words[i];
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, currentY);
      line = words[i];
      currentY += lineH;
    } else { line = test; }
  }
  if (line) ctx.fillText(line, x, currentY);
}

// ── DOWNLOAD ─────────────────────────────────────────────────
function flashDownloadOne(product, num, dateStr) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080; canvas.height = 1920;
  drawFlashCard(canvas, product, 1080, 1920);
  // Wait for images to load
  setTimeout(() => {
    const link = document.createElement('a');
    link.download = `ESTADO_${dateStr}_${String(num).padStart(2,'0')}_${product.c}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, 600);
}

async function flashDownloadAll() {
  const btn = document.getElementById('flashDownloadBtn');
  if (btn) { btn.textContent = '⏳ Generando…'; btn.disabled = true; }

  const today = new Date().toISOString().slice(0,10).replace(/-/g,'');
  flashSaveHist(_flashProducts.map(p => p.c));

  // Download one by one with delay (browser allows sequential downloads)
  for (let i = 0; i < _flashProducts.length; i++) {
    const p = _flashProducts[i];
    if (btn) btn.textContent = `⏳ ${i+1}/${_flashProducts.length}…`;
    await new Promise(resolve => {
      const canvas = document.createElement('canvas');
      canvas.width = 1080; canvas.height = 1920;
      drawFlashCard(canvas, p, 1080, 1920);
      setTimeout(() => {
        const link = document.createElement('a');
        link.download = `ESTADO_${today}_${String(i+1).padStart(2,'0')}.png`;
        link.href = canvas.toDataURL('image/png', 1.0);
        link.click();
        setTimeout(resolve, 400);
      }, 700);
    });
  }

  if (btn) { btn.textContent = '✅ Descargado'; btn.disabled = false; }
  notify(`${_flashProducts.length} estados descargados`, 'ok');
}

// ── ACTIONS ───────────────────────────────────────────────────
function flashRemoveProduct(code) {
  _flashProducts = _flashProducts.filter(p => p.c !== code);
  renderFlashSelector(document.getElementById('flashContainer'));
}

function flashRegenerate() {
  // Temporarily extend history exclusion to force new products
  _flashProducts = flashSelectProducts();
  renderFlashSelector(document.getElementById('flashContainer'));
  notify('Productos regenerados', 'ok');
}
