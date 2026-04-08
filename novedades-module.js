// ══════════════════════════════════════════════════════════════
// NOVEDADES MODULE — I-REP v3.0
// Feed de eventos inteligentes con persistencia de "vistos"
// ══════════════════════════════════════════════════════════════

const NOV_STORAGE_KEY = 'irep_novedades_seen_v1';
let _novData = null, _novLoading = false, _novFilter = 'all';

// ── PERSISTENCIA ─────────────────────────────────────────────
function novGetSeen() {
  try { return JSON.parse(localStorage.getItem(NOV_STORAGE_KEY) || '{}'); }
  catch { return {}; }
}
function novMarkSeen(id) {
  const seen = novGetSeen();
  seen[id] = Date.now();
  localStorage.setItem(NOV_STORAGE_KEY, JSON.stringify(seen));
}
function novMarkAllSeen() {
  if (!_novData) return;
  const seen = novGetSeen();
  _novData.forEach(e => { seen[e.id] = Date.now(); });
  localStorage.setItem(NOV_STORAGE_KEY, JSON.stringify(seen));
  renderNovedades();
  updateNovBadge();
}
function novRestore(id) {
  const seen = novGetSeen();
  delete seen[id];
  localStorage.setItem(NOV_STORAGE_KEY, JSON.stringify(seen));
  renderNovedadesContent();
}
function novClearAll() {
  // Keep seen, just purge old entries > 30 days
  const seen = novGetSeen();
  const cutoff = Date.now() - 30 * 86400000;
  Object.keys(seen).forEach(k => { if (seen[k] < cutoff) delete seen[k]; });
  localStorage.setItem(NOV_STORAGE_KEY, JSON.stringify(seen));
  renderNovedadesContent();
}

// ── BADGE ─────────────────────────────────────────────────────
function updateNovBadge() {
  const el = document.getElementById('novBadge');
  if (!el) return;
  const seen = novGetSeen();
  const unseen = (_novData || []).filter(e => !seen[e.id]).length;
  el.textContent = unseen;
  el.style.display = unseen > 0 ? 'inline-flex' : 'none';
}

// ── LOAD ─────────────────────────────────────────────────────
function loadNovedades(force = false) {
  _novLoading = true;
  const url = SERVER + '/api/novedades' + (force ? '?refresh=1' : '');
  return fetch(url)
    .then(r => r.json())
    .then(d => {
      if (d.ok) {
        _novData = d.events || [];
        _novLoading = false;
        updateNovBadge();
        renderNovedades();
      } else {
        _novLoading = false;
        showNovError(d.error || 'Error del servidor');
      }
    })
    .catch(e => { _novLoading = false; showNovError('Sin conexión: ' + e.message); });
}

function showNovError(msg) {
  const c = document.getElementById('novContainer');
  if (c) c.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;color:var(--red)">
    <div style="font-size:24px">⚠</div>
    <div style="font-size:12px">${msg}</div>
    <button onclick="loadNovedades(true)" style="padding:6px 16px;border-radius:6px;background:rgba(232,24,14,.15);border:1px solid var(--cyan);color:var(--cyan);font-size:11px;cursor:pointer">Reintentar</button>
  </div>`;
}

// ── MAIN RENDER ───────────────────────────────────────────────
function renderNovedades() {
  const cont = document.getElementById('novContainer');
  if (!cont) return;

  if (!_novData) {
    cont.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:16px;color:var(--muted)">
      <div style="width:44px;height:44px;border:3px solid var(--b);border-top-color:var(--cyan);border-radius:50%;animation:spin 1s linear infinite"></div>
      <div style="font-size:12px;font-family:var(--mono)">Calculando eventos desde ventas…</div>
    </div>`;
    if (!_novLoading) loadNovedades();
    return;
  }

  const seen = novGetSeen();
  const events = _novData;
  const unseen = events.filter(e => !seen[e.id]);
  const seenList = events.filter(e => seen[e.id]);

  // Counts by urgency for unread
  const counts = { high: 0, medium: 0, low: 0 };
  unseen.forEach(e => counts[e.urgency]++);

  // Filter chips
  const filterDefs = [
    { id: 'all',            label: 'Todas',          count: unseen.length },
    { id: 'quiebre',        label: '🚨 Quiebre',      count: unseen.filter(e=>e.type==='quiebre').length },
    { id: 'cliente_riesgo', label: '🏪 Clientes',     count: unseen.filter(e=>e.type==='cliente_riesgo').length },
    { id: 'precio',         label: '💰 Precios',      count: unseen.filter(e=>e.type==='precio').length },
    { id: 'crecimiento',    label: '🚀 Crecimiento',  count: unseen.filter(e=>e.type==='crecimiento').length },
    { id: 'hito',           label: '🏆 Logros',       count: unseen.filter(e=>e.type==='hito').length },
    { id: 'insight',        label: '💡 Insights',     count: unseen.filter(e=>['rubro_accel','margen_alto'].includes(e.type)).length },
  ].filter(f => f.id === 'all' || f.count > 0);

  const filtersHtml = filterDefs.map(f =>
    `<button onclick="_novFilter='${f.id}';renderNovedadesContent()" style="padding:4px 11px;border-radius:16px;font-size:10px;font-weight:600;cursor:pointer;white-space:nowrap;border:1px solid ${_novFilter===f.id?'var(--cyan)':'var(--b)'};background:${_novFilter===f.id?'rgba(232,24,14,.12)':'transparent'};color:${_novFilter===f.id?'var(--cyan)':'var(--muted)'}">${f.label}${f.count>0?' ('+f.count+')':''}</button>`
  ).join('');

  cont.innerHTML = `<div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
    <div style="padding:8px 14px;border-bottom:1px solid var(--b);display:flex;align-items:center;gap:10px;flex-shrink:0;background:var(--s1);flex-wrap:wrap">
      <div style="display:flex;gap:5px;flex-wrap:wrap">${filtersHtml}</div>
      <div style="margin-left:auto;display:flex;gap:6px">
        ${unseen.length > 0 ? `<button onclick="novMarkAllSeen()" style="padding:4px 10px;border-radius:6px;font-size:10px;font-weight:600;border:1px solid var(--b);background:transparent;color:var(--muted);cursor:pointer">✓ Marcar todo como visto</button>` : ''}
        <button onclick="loadNovedades(true)" title="Recalcular desde Sheets" style="padding:4px 10px;border-radius:6px;font-size:10px;font-weight:600;border:1px solid var(--b);background:transparent;color:var(--muted);cursor:pointer">↺ Actualizar</button>
      </div>
    </div>
    <div style="display:flex;gap:10px;padding:10px 14px;flex-shrink:0;flex-wrap:wrap">
      <div style="background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.2);border-radius:8px;padding:8px 14px;text-align:center">
        <div style="font-size:20px;font-weight:700;color:var(--red);font-family:var(--mono)">${counts.high}</div>
        <div style="font-size:9px;color:var(--muted)">URGENTES</div>
      </div>
      <div style="background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.2);border-radius:8px;padding:8px 14px;text-align:center">
        <div style="font-size:20px;font-weight:700;color:var(--amber);font-family:var(--mono)">${counts.medium}</div>
        <div style="font-size:9px;color:var(--muted)">ALERTAS</div>
      </div>
      <div style="background:rgba(52,211,153,.1);border:1px solid rgba(52,211,153,.2);border-radius:8px;padding:8px 14px;text-align:center">
        <div style="font-size:20px;font-weight:700;color:var(--green);font-family:var(--mono)">${counts.low}</div>
        <div style="font-size:9px;color:var(--muted)">INFO</div>
      </div>
      <div style="flex:1;min-width:200px;display:flex;align-items:center;padding:0 8px">
        <div style="font-size:10px;color:var(--muted);line-height:1.6">
          Eventos calculados en tiempo real · Se recalculan cada 30 min ·
          Los "vistos" se guardan en este navegador
        </div>
      </div>
    </div>
    <div id="novContent" style="flex:1;overflow-y:auto;padding:0 14px 14px"></div>
  </div>`;

  renderNovedadesContent();
}

function renderNovedadesContent() {
  const el = document.getElementById('novContent');
  if (!el || !_novData) return;
  const seen = novGetSeen();
  let events = _novData;

  // Apply type filter
  if (_novFilter !== 'all') {
    const typeMap = {
      'quiebre':        ['quiebre'],
      'cliente_riesgo': ['cliente_riesgo'],
      'precio':         ['precio'],
      'crecimiento':    ['crecimiento'],
      'hito':           ['hito'],
      'insight':        ['rubro_accel','margen_alto'],
    };
    const types = typeMap[_novFilter] || [_novFilter];
    events = events.filter(e => types.includes(e.type));
  }

  const unseen = events.filter(e => !seen[e.id]);
  const seenList = events.filter(e => seen[e.id]);

  if (unseen.length === 0 && seenList.length === 0) {
    el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--muted)">
      <div style="font-size:24px;margin-bottom:8px">✓</div>
      <div style="font-size:12px">Sin eventos en esta categoría</div>
    </div>`;
    return;
  }

  el.innerHTML = (unseen.length > 0
    ? `<div style="font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;padding:12px 2px 6px">Sin leer · ${unseen.length} eventos</div>`
      + unseen.map(e => novCard(e, false)).join('')
    : '')
    + (seenList.length > 0
      ? `<div style="font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;padding:16px 2px 6px;display:flex;align-items:center;justify-content:space-between">
          <span>Leídas · ${seenList.length}</span>
          <button onclick="novClearAll()" style="font-size:10px;color:var(--muted);background:transparent;border:none;cursor:pointer;text-transform:none;letter-spacing:0">Limpiar historial</button>
        </div>`
        + seenList.map(e => novCard(e, true)).join('')
      : '');
}

// ── EVENT CARD ────────────────────────────────────────────────
function novCard(e, isSeen) {
  const urgColor = e.urgency === 'high' ? 'var(--red)' : e.urgency === 'medium' ? 'var(--amber)' : 'var(--green)';
  const urgBg    = e.urgency === 'high' ? 'rgba(248,113,113,.06)' : e.urgency === 'medium' ? 'rgba(251,191,36,.06)' : 'transparent';
  const borderColor = e.urgency === 'high' ? 'rgba(248,113,113,.35)' : e.urgency === 'medium' ? 'rgba(251,191,36,.25)' : 'var(--b)';

  // Action buttons
  const actionBtns = (e.actions || []).map(a => {
    const defs = {
      'carrito':   ['+ Carrito',   `toggleCart('${e.meta?.code}');notify('Agregado al carrito','ok')`],
      'motor':     ['Ver Motor',   `goPage('motor');selectMotorItem('${e.meta?.code}')`],
      'analytics': ['Ver Analytics', `goPage('analytics')`],
      'cotizador': ['+ Cotizar',   `addToCot && addToCot('${e.meta?.code}')`],
      'catalogo':  ['Ver Catálogo', `goPage('catalog')`],
    };
    const [label, onclick] = defs[a] || [a, ''];
    return `<button onclick="event.stopPropagation();${onclick}" style="padding:4px 11px;border-radius:5px;font-size:10px;font-weight:600;cursor:pointer;border:1px solid rgba(96,165,250,.3);background:rgba(96,165,250,.08);color:#60a5fa">${label}</button>`;
  }).join('');

  const opacity = isSeen ? 'opacity:.5;' : '';
  const seenBtn = isSeen
    ? `<button onclick="novRestore('${e.id}')" style="padding:3px 8px;border-radius:4px;font-size:9px;cursor:pointer;border:1px solid var(--b);background:transparent;color:var(--muted)">Restaurar</button>`
    : `<button onclick="event.stopPropagation();novMarkSeen('${e.id}');updateNovBadge();renderNovedadesContent()" style="padding:4px 11px;border-radius:5px;font-size:10px;font-weight:600;cursor:pointer;border:1px solid var(--b);background:transparent;color:var(--muted)">✓ Visto</button>`;

  return `<div style="${opacity}background:${urgBg};border:0.5px solid ${borderColor};border-left:2px solid ${urgColor};border-radius:10px;margin-bottom:8px;overflow:hidden">
    <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 14px 10px">
      <div style="width:32px;height:32px;border-radius:8px;background:${urgBg};border:1px solid ${borderColor};display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">${e.icon}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600;margin-bottom:4px;line-height:1.3">${e.title}</div>
        <div style="font-size:11px;color:var(--muted);line-height:1.5">${e.body}</div>
      </div>
    </div>
    <div style="padding:0 14px 12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      ${actionBtns}
      <div style="margin-left:auto">${seenBtn}</div>
    </div>
  </div>`;
}
