// ══════════════════════════════════════════════════════════════
// ANALYTICS MODULE — I-REP v3.0
// ══════════════════════════════════════════════════════════════

let anaView = 'overview';   // overview | vendors | clients | articles | rubros
let anaMonth = '';           // filter by month
let anaSearch = '';

// ── FORMAT HELPERS ────────────────────────────────────────────
function fmtARS(n) {
  if (!n && n !== 0) return '—';
  if (Math.abs(n) >= 1e9) return '$' + (n/1e9).toFixed(1) + 'B';
  if (Math.abs(n) >= 1e6) return '$' + (n/1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e3) return '$' + (n/1e3).toFixed(0) + 'K';
  return '$' + Math.round(n).toLocaleString('es-AR');
}
function fmtNum(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1e6) return (n/1e6).toFixed(1)+'M';
  if (n >= 1e3) return (n/1e3).toFixed(1)+'K';
  return Math.round(n).toLocaleString('es-AR');
}
function fmtPct(n) { return n != null ? Math.round(n)+'%' : '—'; }
function fmtDate(d) { if(!d) return '—'; return d.split('-').reverse().join('/'); }

// ── SPARKLINE ─────────────────────────────────────────────────
function sparkline(data, color, w=80, h=24) {
  if (!data || !data.length) return '';
  const max = Math.max(...data, 1);
  const pts = data.map((v,i) => {
    const x = i / (data.length-1) * w;
    const y = h - (v/max) * (h-2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="flex-shrink:0">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>
    <circle cx="${(data.length-1)/(data.length-1)*w}" cy="${h-(data[data.length-1]/max)*(h-2)-1}" r="2" fill="${color}"/>
  </svg>`;
}

// ── MINI BAR ──────────────────────────────────────────────────
function miniBar(val, max, color, w=100) {
  const pct = max > 0 ? Math.min(100, val/max*100) : 0;
  return `<div style="width:${w}px;height:5px;background:rgba(255,255,255,.08);border-radius:3px;overflow:hidden;flex-shrink:0">
    <div style="width:${pct}%;height:100%;background:${color};border-radius:3px;transition:width .3s"></div>
  </div>`;
}

// ── MAIN RENDER ───────────────────────────────────────────────
function renderAnalytics() {
  const cont = document.getElementById('anaContainer');
  if (!cont) return;
  const ANA = window._ANA;
  if (!ANA) {
    cont.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;gap:16px;color:var(--muted)">'
      + '<div style="width:40px;height:40px;border:3px solid var(--b);border-top-color:var(--cyan);border-radius:50%;animation:spin 1s linear infinite"></div>'
      + '<div>Cargando datos de ventas...</div></div>';
    if (!window._anaLoading) {
      window._anaLoading = true;
      fetch(SERVER+'/api/analytics')
        .then(r=>r.json())
        .then(d=>{
          if(d.ok){ window.ANA=d; window._anaLoading=false; renderAnalytics(); }
          else { window._anaLoading=false; console.warn('[analytics]',d.error); }
        })
        .catch(e=>{ window._anaLoading=false; console.warn('[analytics]',e.message); });
    }
    return;
  }

  const S = ANA.summary;
  const months = S.months || [];

  // Nav tabs
  const navTabs = [
    {id:'overview', label:'📊 Resumen'},
    {id:'vendors',  label:'👤 Vendedores'},
    {id:'clients',  label:'🏪 Clientes'},
    {id:'articles', label:'📦 Artículos'},
    {id:'rubros',   label:'🗂 Rubros'},
  ].map(t => '<button onclick="anaView=\''+t.id+'\';renderAnalyticsContent()" style="'
    +'padding:5px 14px;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid '
    +(anaView===t.id?'var(--cyan)':'var(--b)')+';background:'
    +(anaView===t.id?'rgba(232,24,14,.12)':'transparent')+';color:'
    +(anaView===t.id?'var(--cyan)':'var(--muted)')+';">'
    +t.label+'</button>').join('');

  // Month filter
  const monthOpts = '<option value="">Todos los meses</option>'
    + months.map(m => '<option value="'+m+'"'+(anaMonth===m?' selected':'')+'>'+m+'</option>').join('');

  cont.innerHTML = '<div style="display:flex;flex-direction:column;height:100%;overflow:hidden">'
    // Header
    + '<div style="padding:8px 14px;border-bottom:1px solid var(--b);display:flex;align-items:center;gap:10px;flex-shrink:0;background:var(--s1);flex-wrap:wrap">'
    + '<div style="display:flex;gap:6px;flex-wrap:wrap">'+navTabs+'</div>'
    + '<div style="width:1px;height:18px;background:var(--b);flex-shrink:0"></div>'
    + '<select onchange="anaMonth=this.value;renderAnalyticsContent()" style="background:var(--s2);border:1px solid var(--b);border-radius:4px;color:var(--text);font-size:10px;padding:3px 6px;outline:none">'+monthOpts+'</select>'
    + '<input placeholder="Buscar..." oninput="anaSearch=this.value;renderAnalyticsContent()" value="'+anaSearch+'" style="background:transparent;border:none;color:var(--text);font-size:11px;outline:none;width:120px">'
    + '<span style="margin-left:auto;font-size:10px;color:var(--muted);font-family:monospace">'+fmtDate(S.date_from)+' → '+fmtDate(S.date_to)+'</span>'
    + '</div>'
    // Content area
    + '<div id="anaContent" style="flex:1;overflow-y:auto;padding:16px"></div>'
    + '</div>';

  renderAnalyticsContent();
}

function renderAnalyticsContent() {
  const el = document.getElementById('anaContent');
  if (!el) return;
  const ANA = window._ANA;
  if (!ANA) return;
  switch (anaView) {
    case 'overview':  el.innerHTML = buildOverview(ANA); break;
    case 'vendors':   el.innerHTML = buildVendors(ANA); break;
    case 'clients':   el.innerHTML = buildClients(ANA); break;
    case 'articles':  el.innerHTML = buildArticles(ANA); break;
    case 'rubros':    el.innerHTML = buildRubros(ANA); break;
  }
}

// ── OVERVIEW ──────────────────────────────────────────────────
function buildOverview(ANA) {
  const S = ANA.summary;
  const months = S.months;

  // Filter by month if set
  const revData = months.map(m => S.rev_by_month[m] || 0);
  const qtyData = months.map(m => S.qty_by_month[m] || 0);
  const maxRev  = Math.max(...revData, 1);
  const maxQty  = Math.max(...qtyData, 1);

  // KPI cards
  const kpis = [
    {label:'Ingresos totales',   val: fmtARS(S.total_rev),    sub: S.months.length+' meses',     color:'var(--cyan)'},
    {label:'Unidades vendidas',  val: fmtNum(S.total_qty),    sub: 'Transacciones: '+fmtNum(S.total_tx), color:'var(--amber)'},
    {label:'Ticket promedio',    val: fmtARS(S.avg_ticket),   sub: 'por transacción',             color:'var(--purple)'},
    {label:'Margen estimado',    val: fmtPct(S.avg_margin),   sub: 'mediana (donde hay costo)',   color:'var(--green)'},
    {label:'Clientes únicos',    val: fmtNum(S.n_clients),    sub: 'con al menos 1 compra',      color:'var(--amber)'},
    {label:'Artículos vendidos', val: fmtNum(S.n_articles),   sub: 'códigos IREP distintos',     color:'var(--cyan)'},
  ];

  const kpiHtml = kpis.map(k =>
    '<div style="background:var(--s2);border:1px solid var(--b);border-radius:10px;padding:14px 16px;min-width:150px;flex:1">'
    +'<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">'+k.label+'</div>'
    +'<div style="font-size:22px;font-weight:700;color:'+k.color+';font-family:var(--mono)">'+k.val+'</div>'
    +'<div style="font-size:10px;color:var(--muted);margin-top:3px">'+k.sub+'</div>'
    +'</div>'
  ).join('');

  // Revenue by month chart (bar)
  const maxH = 80;
  const barW = Math.max(12, Math.floor(580 / months.length) - 2);
  const barsHtml = months.map((m, i) => {
    const h = Math.max(2, Math.round(revData[i]/maxRev*maxH));
    const isLast3 = i >= months.length - 3;
    const label = m.slice(2); // "24-01"
    const tip = m+': '+fmtARS(revData[i]);
    return '<div style="display:flex;flex-direction:column;align-items:center;gap:3px;cursor:default" title="'+tip+'">'
      +'<div style="font-size:8px;color:var(--muted);font-family:monospace">'+fmtARS(revData[i]).replace('$','')+'</div>'
      +'<div style="width:'+barW+'px;height:'+h+'px;background:'+(isLast3?'var(--cyan)':'rgba(232,24,14,.5)')+';border-radius:2px 2px 0 0;transition:all .2s;"></div>'
      +'<div style="font-size:8px;color:var(--muted);writing-mode:vertical-rl;transform:rotate(180deg);max-height:30px;overflow:hidden">'+label+'</div>'
      +'</div>';
  }).join('');

  // Top rubros pie-like list
  const topRubros = ANA.rubros.slice(0, 8);
  const maxRubroRev = topRubros[0]?.rev || 1;
  const rubrosHtml = topRubros.map((r, i) => {
    const colors = ['var(--cyan)','var(--amber)','var(--green)','var(--purple)','var(--red)',
                    'var(--orange)','var(--pink)','var(--muted)'];
    return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.04)">'
      +'<div style="width:8px;height:8px;border-radius:2px;background:'+colors[i]+';flex-shrink:0"></div>'
      +'<div style="flex:1;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+r.r+'</div>'
      +'<div style="font-size:10px;font-family:monospace;color:var(--amber)">'+fmtARS(r.rev)+'</div>'
      +'<div style="width:80px">'+miniBar(r.rev, maxRubroRev, colors[i], 80)+'</div>'
      +'</div>';
  }).join('');

  // Top vendors quick view
  const vendHtml = ANA.vendors.slice(0,4).map(vd => {
    const sparkData = (S.months || []).map(m => vd.by_month[m] || 0);
    return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04)">'
      +'<div style="flex:1;min-width:0">'
      +'<div style="font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+vd.n+'</div>'
      +'<div style="font-size:10px;color:var(--muted)">'+fmtNum(vd.tx)+' transacciones · '+vd.clients+' clientes</div>'
      +'</div>'
      +sparkline(sparkData,'var(--cyan)',80,22)
      +'<div style="font-size:13px;font-weight:700;color:var(--cyan);font-family:monospace;min-width:60px;text-align:right">'+fmtARS(vd.rev)+'</div>'
      +'</div>';
  }).join('');

  // DOW analysis
  const dowHtml = ANA.dow.map(d => {
    const maxDow = Math.max(...ANA.dow.map(x=>x.rev));
    const h = Math.max(4, Math.round(d.rev/maxDow*50));
    return '<div style="display:flex;flex-direction:column;align-items:center;gap:4px">'
      +'<div style="font-size:9px;color:var(--muted);font-family:monospace">'+fmtARS(d.rev).replace('$','')+'</div>'
      +'<div style="width:28px;height:'+h+'px;background:var(--amber);border-radius:3px 3px 0 0" title="'+d.d+': '+fmtARS(d.rev)+'"></div>'
      +'<div style="font-size:10px;color:var(--text)">'+d.d+'</div>'
      +'</div>';
  }).join('');

  return '<div style="display:flex;flex-direction:column;gap:16px">'
    // KPI row
    + '<div style="display:flex;gap:10px;flex-wrap:wrap">'+kpiHtml+'</div>'
    // Charts row
    + '<div style="display:grid;grid-template-columns:2fr 1fr;gap:16px">'
    // Revenue chart
    + '<div style="background:var(--s2);border:1px solid var(--b);border-radius:10px;padding:16px">'
    + '<div style="font-size:11px;font-weight:700;color:var(--text);margin-bottom:12px">📈 Ingresos por mes</div>'
    + '<div style="display:flex;align-items:flex-end;gap:2px;height:110px;overflow-x:auto">'+barsHtml+'</div>'
    + '</div>'
    // Top rubros
    + '<div style="background:var(--s2);border:1px solid var(--b);border-radius:10px;padding:16px">'
    + '<div style="font-size:11px;font-weight:700;color:var(--text);margin-bottom:8px">🗂 Top rubros</div>'
    + rubrosHtml
    + '</div>'
    + '</div>'
    // Second row
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">'
    // Top vendors
    + '<div style="background:var(--s2);border:1px solid var(--b);border-radius:10px;padding:16px">'
    + '<div style="font-size:11px;font-weight:700;color:var(--text);margin-bottom:8px">👤 Vendedores</div>'
    + vendHtml
    + '<button onclick="anaView=\'vendors\';renderAnalyticsContent()" style="margin-top:10px;font-size:10px;color:var(--cyan);background:transparent;border:none;cursor:pointer;padding:0">Ver todos →</button>'
    + '</div>'
    // DOW
    + '<div style="background:var(--s2);border:1px solid var(--b);border-radius:10px;padding:16px">'
    + '<div style="font-size:11px;font-weight:700;color:var(--text);margin-bottom:12px">📅 Ventas por día de semana</div>'
    + '<div style="display:flex;align-items:flex-end;justify-content:space-around;height:80px">'+dowHtml+'</div>'
    + '</div>'
    + '</div>'
    + '</div>';
}

// ── VENDORS ───────────────────────────────────────────────────
function buildVendors(ANA) {
  const vendors = ANA.vendors;
  const months = ANA.summary.months;
  const maxRev = Math.max(...vendors.map(v=>v.rev), 1);

  return '<div style="display:flex;flex-direction:column;gap:12px">'
    + vendors.map(vd => {
      const sparkData = months.map(m => vd.by_month[m] || 0);
      const share = (vd.rev / ANA.summary.total_rev * 100).toFixed(1);
      const byMonthBars = months.slice(-12).map(m => {
        const val = vd.by_month[m] || 0;
        const maxM = Math.max(...months.slice(-12).map(mm => vd.by_month[mm]||0), 1);
        const h = Math.max(2, Math.round(val/maxM*30));
        return '<div style="width:8px;height:'+h+'px;background:var(--cyan);border-radius:1px 1px 0 0;opacity:.8" title="'+m+': '+fmtARS(val)+'"></div>';
      }).join('');
      return '<div style="background:var(--s2);border:1px solid var(--b);border-radius:10px;padding:16px">'
        +'<div style="display:flex;align-items:flex-start;gap:14px">'
        +'<div style="width:40px;height:40px;border-radius:50%;background:rgba(232,24,14,.15);border:2px solid var(--cyan);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">👤</div>'
        +'<div style="flex:1;min-width:0">'
        +'<div style="font-size:14px;font-weight:700;color:var(--text)">'+vd.n+'</div>'
        +'<div style="display:flex;gap:16px;margin-top:8px;flex-wrap:wrap">'
        +'<div><div style="font-size:18px;font-weight:700;color:var(--cyan);font-family:monospace">'+fmtARS(vd.rev)+'</div><div style="font-size:9px;color:var(--muted)">INGRESOS ('+share+'% total)</div></div>'
        +'<div><div style="font-size:18px;font-weight:700;color:var(--amber);font-family:monospace">'+fmtNum(vd.qty)+'</div><div style="font-size:9px;color:var(--muted)">UNIDADES</div></div>'
        +'<div><div style="font-size:18px;font-weight:700;color:var(--purple);font-family:monospace">'+fmtNum(vd.tx)+'</div><div style="font-size:9px;color:var(--muted)">TRANSACCIONES</div></div>'
        +'<div><div style="font-size:18px;font-weight:700;color:var(--green);font-family:monospace">'+fmtNum(vd.clients)+'</div><div style="font-size:9px;color:var(--muted)">CLIENTES</div></div>'
        +'<div><div style="font-size:18px;font-weight:700;color:var(--text);font-family:monospace">'+fmtARS(vd.avg_ticket)+'</div><div style="font-size:9px;color:var(--muted)">TICKET PROM.</div></div>'
        +'</div>'
        +'<div style="margin-top:10px">'
        +'<div style="font-size:9px;color:var(--muted);margin-bottom:4px">Últimos 12 meses</div>'
        +'<div style="display:flex;align-items:flex-end;gap:2px;height:34px">'+byMonthBars+'</div>'
        +'</div>'
        +'</div>'
        +'</div></div>';
    }).join('')
    + '</div>';
}

// ── CLIENTS ───────────────────────────────────────────────────
function buildClients(ANA) {
  let clients = ANA.clients;
  if (anaSearch) {
    const q = anaSearch.toUpperCase();
    clients = clients.filter(c => c.n.toUpperCase().includes(q));
  }
  const maxRev = clients[0]?.rev || 1;

  return '<div style="font-size:10px;color:var(--muted);margin-bottom:10px">Top 100 clientes por ingresos totales · '+clients.length+' visibles</div>'
    + '<div style="display:flex;flex-direction:column;gap:6px">'
    + clients.slice(0, 50).map((c, i) => {
      const rfm_score = c.tx > 10 ? 'VIP' : c.tx > 5 ? 'Regular' : 'Ocasional';
      const rfm_color = c.tx > 10 ? 'var(--cyan)' : c.tx > 5 ? 'var(--amber)' : 'var(--muted)';
      const days_since = Math.floor((new Date() - new Date(c.last)) / 86400000);
      return '<div style="background:var(--s2);border:1px solid var(--b);border-radius:8px;padding:10px 14px;display:flex;align-items:center;gap:12px">'
        +'<div style="font-size:12px;font-weight:700;color:var(--muted);font-family:monospace;width:24px;text-align:right;flex-shrink:0">'+(i+1)+'</div>'
        +'<div style="flex:1;min-width:0">'
        +'<div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+c.n+'</div>'
        +'<div style="display:flex;gap:10px;margin-top:3px;font-size:10px;color:var(--muted)">'
        +'<span>'+fmtNum(c.tx)+' compras</span>'
        +'<span>'+fmtNum(c.articles)+' artículos</span>'
        +'<span>Último: '+fmtDate(c.last)+(days_since > 90 ? ' <span style="color:var(--red)">⚠ '+days_since+'d</span>' : '')+'</span>'
        +'</div>'
        +'</div>'
        +'<div style="text-align:right;flex-shrink:0">'
        +'<div style="font-size:14px;font-weight:700;color:var(--cyan);font-family:monospace">'+fmtARS(c.rev)+'</div>'
        +'<div style="font-size:9px;color:'+rfm_color+';font-weight:600">'+rfm_score+'</div>'
        +'</div>'
        +'<div style="width:80px;flex-shrink:0">'+miniBar(c.rev, maxRev, 'var(--cyan)', 80)+'</div>'
        +'</div>';
    }).join('')
    + '</div>';
}

// ── ARTICLES ──────────────────────────────────────────────────
function buildArticles(ANA) {
  let arts = ANA.articles;
  if (anaSearch) {
    const q = anaSearch.toUpperCase();
    arts = arts.filter(a => a.c.toUpperCase().includes(q));
  }
  if (anaMonth) {
    arts = arts.filter(a => a.by_month && a.by_month[anaMonth]);
    arts.sort((a,b) => (b.by_month[anaMonth]?.r||0) - (a.by_month[anaMonth]?.r||0));
  }
  const maxRev = arts[0]?.rev || 1;

  return '<div style="font-size:10px;color:var(--muted);margin-bottom:10px">'+arts.length+' artículos con datos de ventas</div>'
    + '<table style="width:100%;border-collapse:collapse;font-size:11px">'
    + '<thead><tr style="background:var(--s2)">'
    + '<th style="padding:8px;text-align:left;color:var(--muted);font-size:9px;text-transform:uppercase">#</th>'
    + '<th style="padding:8px;text-align:left;color:var(--muted);font-size:9px;text-transform:uppercase">Código IREP</th>'
    + '<th style="padding:8px;text-align:right;color:var(--muted);font-size:9px;text-transform:uppercase">Unidades</th>'
    + '<th style="padding:8px;text-align:right;color:var(--muted);font-size:9px;text-transform:uppercase">Ingresos</th>'
    + '<th style="padding:8px;text-align:right;color:var(--muted);font-size:9px;text-transform:uppercase">Precio prom.</th>'
    + '<th style="padding:8px;text-align:right;color:var(--muted);font-size:9px;text-transform:uppercase">Margen</th>'
    + '<th style="padding:8px;text-align:right;color:var(--muted);font-size:9px;text-transform:uppercase">Clientes</th>'
    + '<th style="padding:8px;text-align:right;color:var(--muted);font-size:9px;text-transform:uppercase">Últ. venta</th>'
    + '<th style="padding:8px;text-align:left;color:var(--muted);font-size:9px;text-transform:uppercase">Tendencia</th>'
    + '</tr></thead>'
    + '<tbody>'
    + arts.slice(0, 80).map((a, i) => {
      const months12 = (ANA.summary.months||[]).slice(-12);
      const spark = months12.map(m => a.by_month[m]?.q || 0);
      const marginColor = a.margin == null ? 'var(--muted)' : a.margin > 50 ? 'var(--green)' : a.margin > 25 ? 'var(--amber)' : 'var(--red)';
      const cat = CATALOG ? CATALOG.find(x => x.c === a.c) : null;
      const stkColor = cat ? (cat.stk===0?'var(--red)':cat.stk<=2?'var(--amber)':'var(--green)') : 'var(--muted)';
      const rowBg = i%2===0?'var(--s2)':'transparent';
      return '<tr style="border-bottom:1px solid rgba(255,255,255,.04);background:'+rowBg+'">'
        +'<td style="padding:7px 8px;color:var(--muted);font-family:monospace">'+(i+1)+'</td>'
        +'<td style="padding:7px 8px">'
        +'<div style="font-family:monospace;font-size:10px;color:var(--cyan)">'+a.c+'</div>'
        +(cat ? '<div style="font-size:9px;color:var(--muted);margin-top:1px">stk: <span style="color:'+stkColor+'">'+cat.stk+'u</span></div>' : '')
        +'</td>'
        +'<td style="padding:7px 8px;text-align:right;font-family:monospace;color:var(--amber)">'+fmtNum(a.qty)+'</td>'
        +'<td style="padding:7px 8px;text-align:right;font-family:monospace;color:var(--cyan)">'+fmtARS(a.rev)+'</td>'
        +'<td style="padding:7px 8px;text-align:right;font-family:monospace">'+fmtARS(a.avg_p)+'</td>'
        +'<td style="padding:7px 8px;text-align:right;font-weight:700;color:'+marginColor+'">'+fmtPct(a.margin)+'</td>'
        +'<td style="padding:7px 8px;text-align:right;color:var(--muted)">'+a.clients+'</td>'
        +'<td style="padding:7px 8px;text-align:right;font-size:10px;color:var(--muted)">'+fmtDate(a.last_sale)+'</td>'
        +'<td style="padding:7px 8px">'+sparkline(spark,'var(--cyan)',60,18)+'</td>'
        +'</tr>';
    }).join('')
    + '</tbody></table>';
}

// ── RUBROS ────────────────────────────────────────────────────
function buildRubros(ANA) {
  let rubros = ANA.rubros;
  if (anaSearch) {
    const q = anaSearch.toUpperCase();
    rubros = rubros.filter(r => r.r.toUpperCase().includes(q));
  }
  const maxRev = rubros[0]?.rev || 1;

  return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px">'
    + rubros.map((r, i) => {
      const colors = ['var(--cyan)','var(--amber)','var(--green)','var(--purple)',
                      'var(--red)','var(--orange)','var(--pink)'];
      const color = colors[i % colors.length];
      const share = (r.rev / ANA.summary.total_rev * 100).toFixed(1);
      const margin_est = r.profit > 0 ? (r.profit/r.rev*100).toFixed(0) : null;
      return '<div style="background:var(--s2);border:1px solid var(--b);border-radius:8px;padding:12px">'
        +'<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px">'
        +'<div style="font-size:11px;font-weight:700;color:var(--text);line-height:1.3">'+r.r+'</div>'
        +'<div style="font-size:10px;color:'+color+';font-weight:700;white-space:nowrap">'+share+'%</div>'
        +'</div>'
        +'<div style="margin-bottom:8px">'+miniBar(r.rev, maxRev, color, '100%')+'</div>'
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">'
        +'<div><div style="font-size:14px;font-weight:700;color:'+color+';font-family:monospace">'+fmtARS(r.rev)+'</div><div style="font-size:9px;color:var(--muted)">ingresos</div></div>'
        +'<div><div style="font-size:14px;font-weight:700;color:var(--amber);font-family:monospace">'+fmtNum(r.qty)+'</div><div style="font-size:9px;color:var(--muted)">unidades</div></div>'
        +'<div><div style="font-size:12px;font-weight:600;color:var(--text);font-family:monospace">'+fmtNum(r.arts)+'</div><div style="font-size:9px;color:var(--muted)">artículos</div></div>'
        +(margin_est ? '<div><div style="font-size:12px;font-weight:600;color:var(--green);font-family:monospace">'+margin_est+'%</div><div style="font-size:9px;color:var(--muted)">margen estimado</div></div>' : '')
        +'</div>'
        +'</div>';
    }).join('')
    + '</div>';
}
