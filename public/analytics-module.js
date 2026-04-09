// ══════════════════════════════════════════════════════════════
// STATS MODULE — I-REP v4.0
// Reescrito desde cero · datos en tiempo real · UI limpia
// ══════════════════════════════════════════════════════════════

let _anaView = 'resumen';
let _anaSearch = '';
let _anaMonthFilter = '';
let _anaData = null;
let _anaLoading = false;

// ── FORMAT HELPERS ────────────────────────────────────────────
const fmtM = n => {
  if (!n && n !== 0) return '—';
  if (Math.abs(n) >= 1e9) return '$' + (n/1e9).toFixed(2) + 'B';
  if (Math.abs(n) >= 1e6) return '$' + (n/1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e3) return '$' + (n/1e3).toFixed(0) + 'K';
  return '$' + Math.round(n).toLocaleString('es-AR');
};
const fmtN = n => {
  if (!n && n !== 0) return '—';
  return Math.round(n).toLocaleString('es-AR');
};
const fmtP  = n => n != null ? Math.round(n) + '%' : '—';
const fmtD  = d => d ? d.split('-').reverse().join('/') : '—';
const fmtMes = m => {
  const [y,mo] = (m||'').split('-');
  const names = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return `${names[+mo]||mo} ${(y||'').slice(2)}`;
};

// ── SPARKLINE SVG ─────────────────────────────────────────────
function spark(data, color='var(--cyan)', w=80, h=28) {
  if (!data || data.length < 2) return '';
  const vals = data.map(v => v || 0);
  const max = Math.max(...vals, 1);
  const pts = vals.map((v,i) => {
    const x = (i / (vals.length-1) * w).toFixed(1);
    const y = (h - 4 - (v/max) * (h-8)).toFixed(1);
    return `${x},${y}`;
  }).join(' ');
  const lx = ((vals.length-1)/(vals.length-1)*w).toFixed(1);
  const ly = (h - 4 - (vals[vals.length-1]/max)*(h-8)).toFixed(1);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="flex-shrink:0;overflow:visible">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${lx}" cy="${ly}" r="2.5" fill="${color}"/>
  </svg>`;
}

// ── BAR ───────────────────────────────────────────────────────
function bar(val, max, color, w=80) {
  const pct = max > 0 ? Math.min(100, val/max*100) : 0;
  return `<div style="width:${w}px;height:4px;background:rgba(255,255,255,.07);border-radius:2px;overflow:hidden;flex-shrink:0">
    <div style="width:${pct.toFixed(1)}%;height:100%;background:${color};border-radius:2px"></div>
  </div>`;
}

// ── TREND BADGE ───────────────────────────────────────────────
function trendBadge(val) {
  if (val == null) return '';
  const color = val > 10 ? 'var(--green)' : val < -10 ? 'var(--red)' : 'var(--muted)';
  const arrow = val > 0 ? '▲' : val < 0 ? '▼' : '→';
  return `<span style="font-size:10px;color:${color};font-weight:700">${arrow} ${Math.abs(val).toFixed(1)}%</span>`;
}

// ── LOAD ─────────────────────────────────────────────────────
function loadAnalytics(force = false) {
  if (_anaLoading) return;
  _anaLoading = true;
  const cont = document.getElementById('anaContainer');
  if (cont) cont.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:16px;color:var(--muted)">
    <div style="width:40px;height:40px;border:3px solid var(--b);border-top-color:var(--cyan);border-radius:50%;animation:spin 1s linear infinite"></div>
    <div style="font-size:12px;font-family:var(--mono)">Calculando estadísticas de ventas…</div>
    <div style="font-size:10px;color:var(--muted);opacity:.6">Procesando ${'>'}50.000 transacciones del Sheet</div>
  </div>`;
  fetch(SERVER + '/api/analytics' + (force ? '?refresh=1' : ''))
    .then(r => r.json())
    .then(d => {
      _anaLoading = false;
      if (d.ok) { window._ANA = d; _anaData = d; renderAnalytics(); }
      else showAnaError(d.error || 'Error del servidor');
    })
    .catch(e => { _anaLoading = false; showAnaError('Sin conexión: ' + e.message); });
}

function showAnaError(msg) {
  const c = document.getElementById('anaContainer');
  if (c) c.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;color:var(--red)">
    <div style="font-size:24px">⚠</div>
    <div style="font-size:12px">${msg}</div>
    <button onclick="loadAnalytics(true)" style="padding:6px 16px;border-radius:6px;background:rgba(232,24,14,.15);border:1px solid var(--cyan);color:var(--cyan);font-size:11px;cursor:pointer">Reintentar</button>
  </div>`;
}

// ── MAIN RENDER ───────────────────────────────────────────────
function renderAnalytics() {
  const cont = document.getElementById('anaContainer');
  if (!cont) return;
  const ANA = window._ANA || _anaData;
  if (!ANA) { if (!_anaLoading) loadAnalytics(); return; }
  _anaData = ANA;

  const S = ANA.summary;
  const hoy = new Date().toISOString().slice(0,10);
  const genTs = ANA.built_at ? new Date(ANA.built_at).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}) : '—';

  // ── TABS ──
  const tabs = [
    { id:'resumen',   icon:'📊', label:'Resumen'   },
    { id:'vendedores',icon:'👤', label:'Vendedores' },
    { id:'clientes',  icon:'🏪', label:'Clientes'   },
    { id:'articulos', icon:'📦', label:'Artículos'  },
    { id:'rubros',    icon:'🗂', label:'Rubros'     },
  ].map(t => `<button onclick="_anaView='${t.id}';anaRender()" style="padding:5px 12px;border-radius:7px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;border:1px solid ${_anaView===t.id?'var(--cyan)':'var(--b)'};background:${_anaView===t.id?'rgba(232,24,14,.1)':'transparent'};color:${_anaView===t.id?'var(--cyan)':'var(--muted)'}">${t.icon} ${t.label}</button>`).join('');

  // Month selector
  const months = (S.months || []).slice().reverse().slice(0,18).reverse();
  const monthOpts = ['<option value="">Todos los meses</option>',
    ...months.map(m=>`<option value="${m}" ${_anaMonthFilter===m?'selected':''}>${fmtMes(m)}</option>`)
  ].join('');

  cont.innerHTML = `<div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
    <div style="padding:8px 14px;border-bottom:1px solid var(--b);background:var(--s1);flex-shrink:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <div style="display:flex;gap:4px;flex-wrap:wrap">${tabs}</div>
      <select onchange="_anaMonthFilter=this.value;anaRender()" style="padding:4px 8px;border-radius:6px;border:1px solid var(--b);background:var(--s2);color:var(--text);font-size:11px">${monthOpts}</select>
      <input placeholder="Buscar…" value="${_anaSearch}" oninput="_anaSearch=this.value;anaRender()" style="padding:4px 8px;border-radius:6px;border:1px solid var(--b);background:transparent;color:var(--text);font-size:11px;width:130px;outline:none">
      <div style="margin-left:auto;display:flex;gap:6px;align-items:center">
        <span style="font-size:9px;color:var(--muted);font-family:var(--mono)">generado ${genTs}</span>
        <button onclick="loadAnalytics(true)" style="padding:4px 9px;border-radius:5px;font-size:10px;border:1px solid var(--b);background:transparent;color:var(--muted);cursor:pointer">↺</button>
      </div>
    </div>
    <div id="anaBody" style="flex:1;overflow-y:auto;padding:14px"></div>
  </div>`;
  anaRender();
}

function anaRender() {
  const el = document.getElementById('anaBody');
  if (!el || !_anaData) return;
  const ANA = _anaData;
  switch(_anaView) {
    case 'resumen':    el.innerHTML = anaResumen(ANA);    break;
    case 'vendedores': el.innerHTML = anaVendedores(ANA); break;
    case 'clientes':   el.innerHTML = anaClientes(ANA);   break;
    case 'articulos':  el.innerHTML = anaArticulos(ANA);  break;
    case 'rubros':     el.innerHTML = anaRubros(ANA);     break;
  }
}

// ── RESUMEN ───────────────────────────────────────────────────
function anaResumen(ANA) {
  const S = ANA.summary;
  const months = S.months || [];

  // KPI row
  const trend = S.trend_3m != null ? S.trend_3m : null;
  const kpis = [
    { l:'Ingresos totales',   v:fmtM(S.total_rev),   s:months.length+' meses',          c:'var(--cyan)' },
    { l:'Unidades vendidas',  v:fmtN(S.total_qty),   s:'Transacciones: '+fmtN(S.total_tx), c:'var(--amber)' },
    { l:'Ticket promedio',    v:fmtM(S.avg_ticket),  s:'por transacción',                c:'var(--purple)'},
    { l:'Margen estimado',    v:fmtP(S.avg_margin),  s:'mediana (donde hay costo)',      c:'var(--green)' },
    { l:'Clientes únicos',    v:fmtN(S.n_clients),   s:'con al menos 1 compra',          c:'var(--blue)'  },
    { l:'Artículos vendidos', v:fmtN(S.n_articles),  s:'códigos IREP distintos',         c:'var(--pink)'  },
  ];
  const kpiHtml = kpis.map(k => `<div style="background:var(--s2);border:1px solid var(--b);border-radius:10px;padding:12px 16px;flex:1;min-width:130px">
    <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">${k.l}</div>
    <div style="font-size:22px;font-weight:700;color:${k.c};font-family:var(--mono);line-height:1.2">${k.v}</div>
    <div style="font-size:9px;color:var(--muted);margin-top:2px">${k.s}</div>
  </div>`).join('');

  // Revenue chart
  const revData = months.map(m => S.rev_by_month[m] || 0);
  const maxRev = Math.max(...revData, 1);
  const barW = Math.max(8, Math.min(32, Math.floor(860 / months.length)));
  const chartBars = months.map((m, i) => {
    const v = revData[i];
    const pct = (v / maxRev * 100).toFixed(1);
    const isLast3 = i >= months.length - 3;
    const color = isLast3 ? 'var(--cyan)' : 'rgba(232,24,14,.4)';
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;flex:1;min-width:0">
      <div style="font-size:8px;color:var(--muted);white-space:nowrap;overflow:hidden;max-width:100%;text-overflow:ellipsis">${v>0?fmtM(v):''}</div>
      <div style="width:100%;height:${pct}%;background:${color};border-radius:3px 3px 0 0;min-height:${v>0?2:0}px;transition:height .3s"></div>
      <div style="font-size:8px;color:var(--muted);white-space:nowrap;transform:rotate(-45deg);transform-origin:top left;margin-top:6px">${fmtMes(m)}</div>
    </div>`;
  }).join('');

  // Trend summary
  const trendHtml = trend != null ? `
    <div style="background:${trend>0?'rgba(52,211,153,.08)':'rgba(248,113,113,.08)'};border:1px solid ${trend>0?'rgba(52,211,153,.2)':'rgba(248,113,113,.2)'};border-radius:8px;padding:10px 14px;display:flex;align-items:center;gap:10px">
      <div style="font-size:20px">${trend>0?'📈':'📉'}</div>
      <div>
        <div style="font-size:12px;font-weight:700;color:${trend>0?'var(--green)':'var(--red)'}">${trendBadge(trend)} vs trimestre anterior</div>
        <div style="font-size:10px;color:var(--muted)">Últimos 3 meses: ${fmtM(S.rev_last3)} · Previos: ${fmtM(S.rev_prev3)}</div>
      </div>
    </div>` : '';

  // Top rubros
  const topRubros = (ANA.rubros || []).slice(0,8);
  const maxRubroRev = topRubros[0]?.rev || 1;
  const colors = ['var(--cyan)','var(--amber)','var(--green)','var(--purple)','var(--red)','var(--orange)','var(--pink)','var(--muted)'];
  const rubroRows = topRubros.map((r,i) => `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.04)">
    <div style="width:7px;height:7px;border-radius:2px;background:${colors[i]};flex-shrink:0"></div>
    <div style="flex:1;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.r}</div>
    <div style="font-size:11px;font-family:var(--mono);color:${colors[i]};font-weight:600">${fmtM(r.rev)}</div>
    <div style="width:80px">${bar(r.rev,maxRubroRev,colors[i],80)}</div>
  </div>`).join('');

  // DOW chart
  const dow = ANA.dow || [];
  const maxDow = Math.max(...dow.map(d=>d.rev),1);
  const dowBars = dow.map(d => `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1">
    <div style="font-size:9px;color:var(--muted)">${d.rev>maxDow*0.5?fmtM(d.rev):''}</div>
    <div style="width:100%;height:${Math.max(4,(d.rev/maxDow*80)).toFixed(0)}px;background:${d.d==='Sáb'||d.d==='Dom'?'var(--amber)':'var(--cyan)'};border-radius:4px 4px 0 0;opacity:${d.rev>0?1:.2}"></div>
    <div style="font-size:10px;font-weight:600;color:var(--muted)">${d.d}</div>
  </div>`).join('');

  return `<div style="display:flex;flex-direction:column;gap:12px">
    <div style="display:flex;gap:8px;flex-wrap:wrap">${kpiHtml}</div>
    ${trendHtml}
    <div style="display:grid;grid-template-columns:1fr 280px;gap:12px">
      <div style="background:var(--s2);border:1px solid var(--b);border-radius:10px;padding:14px">
        <div style="font-size:11px;font-weight:700;margin-bottom:12px">📈 Ingresos por mes</div>
        <div style="display:flex;align-items:flex-end;gap:2px;height:100px;padding-bottom:20px">${chartBars}</div>
      </div>
      <div style="background:var(--s2);border:1px solid var(--b);border-radius:10px;padding:14px">
        <div style="font-size:11px;font-weight:700;margin-bottom:8px">📅 Ventas por día</div>
        <div style="display:flex;align-items:flex-end;gap:4px;height:80px;padding-bottom:16px">${dowBars}</div>
        <div style="font-size:9px;color:var(--muted);margin-top:4px">Pico: ${S.peak_month||'—'} · Bajo: ${S.low_month||'—'}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div style="background:var(--s2);border:1px solid var(--b);border-radius:10px;padding:14px">
        <div style="font-size:11px;font-weight:700;margin-bottom:10px">🗂 Top rubros</div>
        ${rubroRows}
        <button onclick="_anaView='rubros';anaRender()" style="margin-top:8px;font-size:10px;color:var(--cyan);background:transparent;border:none;cursor:pointer;padding:0">Ver todos →</button>
      </div>
      <div style="background:var(--s2);border:1px solid var(--b);border-radius:10px;padding:14px">
        <div style="font-size:11px;font-weight:700;margin-bottom:8px">⚠ Alertas</div>
        ${anaAlertasMini(ANA)}
      </div>
    </div>
  </div>`;
}

function anaAlertasMini(ANA) {
  const al = ANA.alerts || {};
  const items = [
    { icon:'🏪', label:'Clientes en riesgo', n:(al.at_risk_clients||[]).length, view:'clientes' },
    { icon:'🚨', label:'Posibles quiebres',   n:(al.quiebre||[]).length,         view:'articulos' },
    { icon:'🚀', label:'En crecimiento',       n:(al.rising||[]).length,          view:'articulos' },
    { icon:'💎', label:'Alta rentabilidad',    n:(al.high_margin||[]).length,     view:'articulos' },
  ];
  return items.map(it => `<div onclick="_anaView='${it.view}';anaRender()" style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.04);cursor:pointer">
    <span style="font-size:14px">${it.icon}</span>
    <div style="flex:1;font-size:11px">${it.label}</div>
    <div style="font-size:13px;font-weight:700;color:var(--cyan);font-family:var(--mono)">${it.n}</div>
  </div>`).join('');
}

// ── VENDEDORES ────────────────────────────────────────────────
function anaVendedores(ANA) {
  const vendors = ANA.vendors || [];
  const months = (ANA.summary.months || []).slice(-6);
  const maxRev = Math.max(...vendors.map(v=>v.rev), 1);

  return `<div style="display:flex;flex-direction:column;gap:8px">
    <div style="font-size:10px;color:var(--muted);margin-bottom:4px">${vendors.length} vendedores · ordenados por ingresos totales</div>
    ${vendors.map((v,i) => {
      const sparkData = months.map(m => v.by_month?.[m] || 0);
      const tColor = v.trend > 10 ? 'var(--green)' : v.trend < -10 ? 'var(--red)' : 'var(--muted)';
      return `<div style="background:var(--s2);border:1px solid var(--b);border-radius:10px;padding:12px 14px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <div style="width:28px;height:28px;border-radius:50%;background:var(--s3);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--cyan);flex-shrink:0">${i+1}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${v.n}</div>
            <div style="font-size:9px;color:var(--muted)">${fmtN(v.tx)} transacciones · ${fmtN(v.clients)} clientes</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:16px;font-weight:700;color:var(--cyan);font-family:var(--mono)">${fmtM(v.rev)}</div>
            <div style="font-size:10px;color:${tColor}">${trendBadge(v.trend)}</div>
          </div>
          ${spark(sparkData,'var(--cyan)',80,32)}
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <span style="font-size:9px;color:var(--muted)">Ticket prom: ${fmtM(v.avg_ticket)}</span>
          <span style="font-size:9px;color:var(--muted)">Margen: ${fmtP(v.margin)}</span>
          <span style="font-size:9px;color:var(--muted)">Artículos: ${fmtN(v.articles)}</span>
          <span style="font-size:9px;color:var(--muted)">Ganancia: ${fmtM(v.profit)}</span>
        </div>
        ${bar(v.rev,maxRev,'var(--cyan)',0)}
      </div>`;
    }).join('')}
  </div>`;
}

// ── CLIENTES ─────────────────────────────────────────────────
function anaClientes(ANA) {
  let clients = ANA.clients || [];
  if (_anaSearch) {
    const q = _anaSearch.toUpperCase();
    clients = clients.filter(c => c.n.toUpperCase().includes(q));
  }
  const maxRev = Math.max(...clients.map(c=>c.rev), 1);
  const abcColor = { A:'var(--green)', B:'var(--amber)', C:'var(--muted)' };

  return `<div style="display:flex;flex-direction:column;gap:4px">
    <div style="font-size:10px;color:var(--muted);margin-bottom:4px">${clients.length} clientes · ABC automático por ingresos</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead><tr style="background:var(--s2);position:sticky;top:0">
        ${['#','Cliente','ABC','Ingresos','Transacc.','Ticket','Último','Días','Artículos','Riesgo'].map(h=>
          `<th style="padding:7px 8px;text-align:left;font-size:9px;color:var(--muted);text-transform:uppercase;white-space:nowrap">${h}</th>`
        ).join('')}
      </tr></thead>
      <tbody>
      ${clients.slice(0,100).map((c,i) => {
        const riskColor = c.at_risk ? 'var(--red)' : 'transparent';
        return `<tr style="border-bottom:1px solid rgba(255,255,255,.04);background:${i%2===0?'var(--s2)':'transparent'}${c.at_risk?';border-left:2px solid var(--red)':''}">
          <td style="padding:6px 8px;color:var(--muted)">${i+1}</td>
          <td style="padding:6px 8px;font-weight:600;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.n}</td>
          <td style="padding:6px 8px"><span style="font-size:10px;font-weight:700;color:${abcColor[c.abc]||'var(--muted)'};background:${abcColor[c.abc]||'var(--muted)'}22;padding:2px 7px;border-radius:8px">${c.abc}</span></td>
          <td style="padding:6px 8px;font-family:var(--mono);font-weight:700;color:var(--cyan)">${fmtM(c.rev)}</td>
          <td style="padding:6px 8px;color:var(--muted)">${fmtN(c.tx)}</td>
          <td style="padding:6px 8px;color:var(--muted)">${fmtM(c.avg_ticket)}</td>
          <td style="padding:6px 8px;color:var(--muted);font-size:10px">${fmtD(c.last)}</td>
          <td style="padding:6px 8px;color:${c.days_since>90?'var(--red)':c.days_since>30?'var(--amber)':'var(--green)'};font-weight:600">${c.days_since}d</td>
          <td style="padding:6px 8px;color:var(--muted)">${fmtN(c.articles)}</td>
          <td style="padding:6px 8px">${c.at_risk?'<span style="font-size:9px;color:var(--red);font-weight:700">⚠ RIESGO</span>':''}</td>
        </tr>`;
      }).join('')}
      </tbody>
    </table>
    ${clients.length > 100 ? `<div style="font-size:10px;color:var(--muted);padding:8px">Mostrando 100 de ${clients.length} clientes. Usá la búsqueda para filtrar.</div>` : ''}
  </div>`;
}

// ── ARTÍCULOS ────────────────────────────────────────────────
function anaArticulos(ANA) {
  let arts = ANA.articles || [];
  if (_anaSearch) {
    const q = _anaSearch.toUpperCase();
    arts = arts.filter(a => a.c.toUpperCase().includes(q));
  }
  if (_anaMonthFilter) {
    arts = arts.filter(a => a.by_month && a.by_month[_anaMonthFilter]);
  }
  const maxRev = Math.max(...arts.map(a=>a.rev), 1);

  return `<div style="display:flex;flex-direction:column;gap:4px">
    <div style="font-size:10px;color:var(--muted);margin-bottom:4px">${arts.length} artículos · ordenados por ingresos</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead><tr style="background:var(--s2);position:sticky;top:0">
        ${['#','Código IREP','Unidades','Ingresos','Precio prom.','Margen','Clientes','Tendencia','Última venta','% total'].map(h=>
          `<th style="padding:7px 8px;text-align:left;font-size:9px;color:var(--muted);text-transform:uppercase;white-space:nowrap">${h}</th>`
        ).join('')}
      </tr></thead>
      <tbody>
      ${arts.slice(0,150).map((a,i) => {
        const mColor = a.margin != null ? (a.margin>60?'var(--green)':a.margin>30?'var(--amber)':'var(--red)') : 'var(--muted)';
        return `<tr style="border-bottom:1px solid rgba(255,255,255,.04);background:${i%2===0?'var(--s2)':'transparent'}">
          <td style="padding:5px 8px;color:var(--muted)">${i+1}</td>
          <td style="padding:5px 8px;font-family:var(--mono);font-size:10px;color:var(--cyan)">${a.c}</td>
          <td style="padding:5px 8px;color:var(--amber);font-weight:600">${fmtN(a.qty)}</td>
          <td style="padding:5px 8px;font-family:var(--mono);font-weight:700;color:var(--cyan)">${fmtM(a.rev)}</td>
          <td style="padding:5px 8px;color:var(--muted)">${fmtM(a.avg_p)}</td>
          <td style="padding:5px 8px;font-weight:700;color:${mColor}">${fmtP(a.margin)}</td>
          <td style="padding:5px 8px;color:var(--muted)">${fmtN(a.clients)}</td>
          <td style="padding:5px 8px">${trendBadge(a.trend)}</td>
          <td style="padding:5px 8px;font-size:10px;color:var(--muted)">${fmtD(a.last_sale)}</td>
          <td style="padding:5px 8px;min-width:80px">${bar(a.rev,maxRev,'var(--cyan)',70)}</td>
        </tr>`;
      }).join('')}
      </tbody>
    </table>
    ${arts.length > 150 ? `<div style="font-size:10px;color:var(--muted);padding:8px">Mostrando 150 de ${arts.length}. Usá la búsqueda para filtrar.</div>` : ''}
  </div>`;
}

// ── RUBROS ────────────────────────────────────────────────────
function anaRubros(ANA) {
  let rubros = ANA.rubros || [];
  if (_anaSearch) {
    const q = _anaSearch.toUpperCase();
    rubros = rubros.filter(r => r.r.toUpperCase().includes(q));
  }
  const maxRev = Math.max(...rubros.map(r=>r.rev), 1);
  const colors = ['var(--cyan)','var(--amber)','var(--green)','var(--purple)','var(--red)','var(--orange)','var(--pink)','var(--muted)'];

  return `<div style="display:flex;flex-direction:column;gap:4px">
    <div style="font-size:10px;color:var(--muted);margin-bottom:4px">${rubros.length} rubros · ordenados por ingresos</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead><tr style="background:var(--s2);position:sticky;top:0">
        ${['#','Rubro','Ingresos','Unidades','Tx','Margen','Clientes','Artículos','Tendencia','% total'].map(h=>
          `<th style="padding:7px 8px;text-align:left;font-size:9px;color:var(--muted);text-transform:uppercase;white-space:nowrap">${h}</th>`
        ).join('')}
      </tr></thead>
      <tbody>
      ${rubros.map((r,i) => {
        const c = colors[i % colors.length];
        return `<tr style="border-bottom:1px solid rgba(255,255,255,.04);background:${i%2===0?'var(--s2)':'transparent'}">
          <td style="padding:6px 8px;color:var(--muted)">${i+1}</td>
          <td style="padding:6px 8px"><div style="display:flex;align-items:center;gap:6px">
            <div style="width:6px;height:6px;border-radius:2px;background:${c};flex-shrink:0"></div>
            <span style="font-weight:600">${r.r}</span>
          </div></td>
          <td style="padding:6px 8px;font-family:var(--mono);font-weight:700;color:${c}">${fmtM(r.rev)}</td>
          <td style="padding:6px 8px;color:var(--amber)">${fmtN(r.qty)}</td>
          <td style="padding:6px 8px;color:var(--muted)">${fmtN(r.tx)}</td>
          <td style="padding:6px 8px;color:var(--green)">${fmtP(r.margin)}</td>
          <td style="padding:6px 8px;color:var(--muted)">${fmtN(r.clients)}</td>
          <td style="padding:6px 8px;color:var(--muted)">${fmtN(r.arts)}</td>
          <td style="padding:6px 8px">${trendBadge(r.trend)}</td>
          <td style="padding:6px 8px;min-width:90px"><div style="display:flex;align-items:center;gap:6px">
            ${bar(r.rev,maxRev,c,60)}
            <span style="font-size:9px;color:var(--muted)">${r.rev>0?(r.rev/maxRev*100).toFixed(1):'0'}%</span>
          </div></td>
        </tr>`;
      }).join('')}
      </tbody>
    </table>
  </div>`;
}
