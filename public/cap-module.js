// ══════════════════════════════════════════════════════════════
// CAPITALIZACIÓN — I-REP v3.0
// Stock valorizado a costo real / estimado
// ══════════════════════════════════════════════════════════════

let capView='overview', capSearch='', capFuente='all', _capData=null, _capLoading=false;
let _capManual={};

const fmtM=n=>{if(!n&&n!==0)return'—';if(Math.abs(n)>=1e9)return'$'+(n/1e9).toFixed(2)+'B';if(Math.abs(n)>=1e6)return'$'+(n/1e6).toFixed(1)+'M';if(Math.abs(n)>=1e3)return'$'+(n/1e3).toFixed(0)+'K';return'$'+Math.round(n).toLocaleString('es-AR');};
const fmtN=n=>{if(!n&&n!==0)return'—';return Math.round(n).toLocaleString('es-AR');};
const fmtP=n=>n!=null?Math.round(n)+'%':'—';

function fuenteBadge(f){
  if(f==='real')     return '<span style="display:inline-block;padding:1px 7px;border-radius:8px;font-size:9px;font-weight:700;background:rgba(52,211,153,.15);border:1px solid rgba(52,211,153,.3);color:#34d399">✓ costo real</span>';
  if(f==='estimado') return '<span style="display:inline-block;padding:1px 7px;border-radius:8px;font-size:9px;font-weight:700;background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.25);color:#fbbf24">~ estimado ÷1.2</span>';
  return '<span style="display:inline-block;padding:1px 7px;border-radius:8px;font-size:9px;background:rgba(255,255,255,.06);border:1px solid var(--b);color:var(--muted)">sin precio</span>';
}

function miniBar(pct,color){
  return`<div style="width:100%;height:5px;background:rgba(255,255,255,.07);border-radius:3px;overflow:hidden"><div style="width:${Math.min(100,pct||0).toFixed(1)}%;height:100%;background:${color};border-radius:3px"></div></div>`;
}


// ── MANUAL PRICES ─────────────────────────────────────────────
function loadCapManual(){
  return fetch(SERVER+'/api/cap-manual').then(r=>r.json())
    .then(d=>{ if(d.ok) _capManual=d.data||{}; }).catch(()=>{});
}
function saveCapManual(rubro,precio){
  var val=precio===''||precio===null?null:parseFloat(String(precio).replace(',','.'));
  fetch(SERVER+'/api/cap-manual/set',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({rubro:rubro,precio:val||null})
  }).then(function(r){return r.json();}).then(function(d){
    if(d.ok){
      if(val&&val>0) _capManual[rubro]=val; else delete _capManual[rubro];
      renderCapBody();
      notify('Guardado en Sheet','ok');
    } else notify('Error: '+(d.error||''),'warn');
  }).catch(function(){notify('Sin conexion','warn');});
}
function deleteCapManual(rubro){
  if(!confirm('Borrar precio manual de '+rubro+'?')) return;
  saveCapManual(rubro,null);
}

function loadCap(){
  _capLoading=true;
  const cont=document.getElementById('capContainer');
  if(cont) cont.innerHTML=`<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:16px;color:var(--muted)">
    <div style="width:44px;height:44px;border:3px solid var(--b);border-top-color:var(--cyan);border-radius:50%;animation:spin 1s linear infinite"></div>
    <div style="font-size:12px;font-family:var(--mono)">Calculando capitalización del stock…</div>
  </div>`;
  Promise.all([
    fetch(SERVER+'/api/capitalizacion').then(r=>r.json()),
    fetch(SERVER+'/api/cap-manual').then(r=>r.json()).catch(()=>({ok:false,data:{}})),
  ]).then(function(results){
    var capD=results[0], manD=results[1];
    if(capD.ok) _capData=capD;
    if(manD.ok) _capManual=manD.data||{};
    _capLoading=false;
    if(_capData) renderCap(); else capError('Error cargando datos');
  }).catch(function(e){ _capLoading=false; capError('Sin conexion: '+e.message); });
}

function capError(msg){
  const c=document.getElementById('capContainer');
  if(c) c.innerHTML=`<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;color:var(--red)">
    <div style="font-size:24px">⚠</div><div style="font-size:12px">${msg}</div>
    <button onclick="loadCap()" style="padding:6px 16px;border-radius:6px;background:rgba(232,24,14,.15);border:1px solid var(--cyan);color:var(--cyan);font-size:11px;cursor:pointer">Reintentar</button>
  </div>`;
}

function renderCap(){
  const cont=document.getElementById('capContainer');
  if(!cont) return;
  if(!_capData){ if(!_capLoading) loadCap(); return; }

  const D=_capData, S=D.summary;
  const tabs=[
    {id:'overview', l:'📊 Resumen'},
    {id:'rubros',   l:'🗂 Por rubro'},
    {id:'articles', l:'📦 Artículos'},
    {id:'alertas',  l:'⚠ Alertas'},
  ].map(t=>`<button onclick="capView='${t.id}';renderCapBody()" style="padding:4px 12px;border-radius:8px;font-size:10px;font-weight:600;cursor:pointer;border:1px solid ${capView===t.id?'var(--cyan)':'var(--b)'};background:${capView===t.id?'rgba(232,24,14,.12)':'transparent'};color:${capView===t.id?'var(--cyan)':'var(--muted)'}">${t.l}</button>`).join('');

  const fuentes=[
    {id:'all',       l:'Todos'},
    {id:'real',      l:'✓ Costo real'},
    {id:'estimado',  l:'~ Estimado'},
    {id:'sin_precio',l:'Sin precio'},
  ].map(f=>`<button onclick="capFuente='${f.id}';renderCapBody()" style="padding:3px 9px;border-radius:14px;font-size:10px;cursor:pointer;border:1px solid ${capFuente===f.id?'var(--cyan)':'var(--b)'};background:${capFuente===f.id?'rgba(232,24,14,.1)':'transparent'};color:${capFuente===f.id?'var(--cyan)':'var(--muted)'}">${f.l}</button>`).join('');

  const gen=S.generado?new Date(S.generado).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}):'—';

  cont.innerHTML=`<div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
    <div style="padding:7px 14px;border-bottom:1px solid var(--b);display:flex;align-items:center;gap:8px;flex-shrink:0;background:var(--s1);flex-wrap:wrap">
      <div style="display:flex;gap:5px">${tabs}</div>
      <div style="width:1px;height:16px;background:var(--b);flex-shrink:0"></div>
      <div style="display:flex;gap:4px">${fuentes}</div>
      <input placeholder="Buscar código/rubro…" oninput="capSearch=this.value;renderCapBody()" value="${capSearch}" style="background:transparent;border:none;color:var(--text);font-size:11px;outline:none;width:130px">
      <span style="margin-left:auto;font-size:10px;color:var(--muted);font-family:var(--mono)">generado ${gen}</span>
      <button onclick="loadCap()" style="padding:3px 8px;border-radius:4px;font-size:10px;border:1px solid var(--b);background:transparent;color:var(--muted);cursor:pointer">↺</button>
    </div>
    <div id="capBody" style="flex:1;overflow-y:auto;padding:14px"></div>
  </div>`;
  renderCapBody();
}

function renderCapBody(){
  const el=document.getElementById('capBody');
  if(!el||!_capData) return;
  switch(capView){
    case 'overview': el.innerHTML=buildCapOverview(_capData); break;
    case 'rubros':   el.innerHTML=buildCapRubros(_capData);   break;
    case 'articles': el.innerHTML=buildCapArticles(_capData); break;
    case 'alertas':  el.innerHTML=buildCapAlertas(_capData);  break;
  }
}

// ── OVERVIEW ─────────────────────────────────────────────────
function buildCapOverview(D){
  const S=D.summary;
  const tc=S.total_costo, tv=S.total_venta;
  const margen=tc>0?((tv-tc)/tv*100).toFixed(1):0;

  // KPI cards
  const kpis=[
    {l:'Capital a costo',    v:fmtM(tc),  s:S.arts_real+' costo real · '+S.arts_est+' estimado', c:'var(--cyan)'},
    {l:'Valor a precio venta',v:fmtM(tv), s:'precio de lista',                                    c:'var(--green)'},
    {l:'Margen implícito',   v:margen+'%',s:'sobre precio de venta',                               c:'var(--amber)'},
    {l:'Artículos con stock', v:fmtN(S.total_arts), s:'de '+fmtN(S.total_arts)+' en catálogo',    c:'var(--purple)'},
    {l:'Capital inmovilizado',v:fmtM(S.inmovilizado_val), s:fmtN(S.inmovilizado_arts)+' arts sin venta en 12m', c:'var(--red)'},
    {l:'Rotación mediana',    v:S.rotacion_promedio+'m', s:'meses de cobertura al ritmo actual',   c:'var(--muted)'},
  ];
  const kpiHtml=kpis.map(k=>`<div style="background:var(--s2);border:1px solid var(--b);border-radius:10px;padding:12px 16px;flex:1;min-width:140px">
    <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">${k.l}</div>
    <div style="font-size:20px;font-weight:700;color:${k.c};font-family:var(--mono);line-height:1.2">${k.v}</div>
    <div style="font-size:9px;color:var(--muted);margin-top:3px">${k.s}</div>
  </div>`).join('');

  // Cobertura de valuación
  const covPct=S.cobertura_pct||0;
  const covBar=`<div style="display:flex;align-items:center;gap:10px;margin-top:6px">
    <div style="flex:1;height:10px;background:rgba(255,255,255,.07);border-radius:5px;overflow:hidden;position:relative">
      <div style="position:absolute;left:0;top:0;height:100%;width:${(S.arts_real/S.total_arts*100).toFixed(1)}%;background:var(--green);border-radius:5px 0 0 5px"></div>
      <div style="position:absolute;left:${(S.arts_real/S.total_arts*100).toFixed(1)}%;top:0;height:100%;width:${(S.arts_est/S.total_arts*100).toFixed(1)}%;background:var(--amber)"></div>
    </div>
    <span style="font-size:10px;color:var(--muted);white-space:nowrap">${covPct}% con precio conocido</span>
  </div>
  <div style="display:flex;gap:14px;margin-top:8px;font-size:10px">
    <span><span style="color:var(--green)">■</span> Costo real: ${S.arts_real} arts</span>
    <span><span style="color:var(--amber)">■</span> Estimado ÷1.2: ${S.arts_est} arts</span>
    <span><span style="color:var(--muted)">■</span> Sin precio: ${S.arts_sin} arts</span>
  </div>`;

  // Top rubros mini chart
  const topR=D.rubros.slice(0,8);
  const maxR=topR[0]?.valor_costo||1;
  const colors=['var(--cyan)','var(--amber)','var(--green)','var(--purple)','var(--red)','var(--orange)','var(--pink)','var(--muted)'];
  const rubroMini=topR.map((r,i)=>`<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.04)">
    <div style="width:7px;height:7px;border-radius:2px;background:${colors[i]};flex-shrink:0"></div>
    <div style="flex:1;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.rubro}</div>
    <div style="font-size:10px;font-family:var(--mono);color:${colors[i]}">${fmtM(r.valor_costo)}</div>
    <div style="font-size:9px;color:var(--muted);width:30px;text-align:right">${r.share_pct||0}%</div>
    <div style="width:70px">${miniBar(r.valor_costo/maxR*100,colors[i])}</div>
  </div>`).join('');

  // Inmovilizado insight
  const inmovPct=tc>0?(S.inmovilizado_val/tc*100).toFixed(1):0;

  return`<div style="display:flex;flex-direction:column;gap:14px">
    <div style="display:flex;gap:8px;flex-wrap:wrap">${kpiHtml}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div style="background:var(--s2);border:1px solid var(--b);border-radius:10px;padding:14px">
        <div style="font-size:11px;font-weight:700;margin-bottom:10px">🗂 Top rubros por capital</div>
        ${rubroMini}
        <button onclick="capView='rubros';renderCapBody()" style="margin-top:10px;font-size:10px;color:var(--cyan);background:transparent;border:none;cursor:pointer;padding:0">Ver todos los rubros →</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div style="background:var(--s2);border:1px solid var(--b);border-radius:10px;padding:14px">
          <div style="font-size:11px;font-weight:700;margin-bottom:8px">📊 Cobertura de valuación</div>
          ${covBar}
          <div style="margin-top:10px;font-size:10px;color:var(--muted)">El ${covPct}% de los artículos tiene precio conocido para valuar. El resto aparece como $0 en el total.</div>
        </div>
        <div style="background:rgba(248,113,113,.07);border:1px solid rgba(248,113,113,.2);border-radius:10px;padding:14px">
          <div style="font-size:11px;font-weight:700;color:var(--red);margin-bottom:6px">⚠ Capital inmovilizado</div>
          <div style="font-size:22px;font-weight:700;color:var(--red);font-family:var(--mono)">${fmtM(S.inmovilizado_val)}</div>
          <div style="font-size:10px;color:var(--muted);margin-top:4px">${fmtN(S.inmovilizado_arts)} artículos con stock sin ventas en los últimos 12 meses (${inmovPct}% del capital total)</div>
          <button onclick="capView='alertas';renderCapBody()" style="margin-top:8px;font-size:10px;color:var(--red);background:transparent;border:none;cursor:pointer;padding:0">Ver artículos inmovilizados →</button>
        </div>
        <div style="background:rgba(52,211,153,.07);border:1px solid rgba(52,211,153,.2);border-radius:10px;padding:14px">
          <div style="font-size:11px;font-weight:700;color:var(--green);margin-bottom:4px">💰 Diferencial de valor</div>
          <div style="font-size:22px;font-weight:700;color:var(--green);font-family:var(--mono)">${fmtM(tv-tc)}</div>
          <div style="font-size:10px;color:var(--muted);margin-top:4px">Diferencia entre precio de venta y costo del stock actual. Utilidad potencial si se vende todo a lista.</div>
        </div>
      </div>
    </div>
  </div>`;
}

// ── RUBROS ────────────────────────────────────────────────────
function buildCapRubros(D){
  var rubros=D.rubros||[];
  if(capSearch){var q=capSearch.toUpperCase();rubros=rubros.filter(function(r){return r.rubro.toUpperCase().includes(q);});}
  var maxV=rubros[0]?rubros[0].valor_costo:1; if(!maxV) maxV=1;
  var colors=['var(--cyan)','var(--amber)','var(--green)','var(--purple)','var(--red)','var(--orange)','var(--pink)','var(--muted)'];

  var totalAuto  = rubros.reduce(function(s,r){return s+r.valor_costo;},0);
  var totalVenta = rubros.reduce(function(s,r){return s+(r.valor_venta||0);},0);
  var totalManual= rubros.reduce(function(s,r){var mp=_capManual[r.rubro]; return s+(mp&&mp>0?r.stk_total*mp:0);},0);
  var nManual    = Object.keys(_capManual).length;
  var nPendiente = rubros.filter(function(r){return r.valor_costo===0&&!_capManual[r.rubro];}).length;

  var totalsBar='<div style="display:flex;gap:10px;flex-wrap:wrap;padding:10px 0 14px;border-bottom:1px solid var(--b);margin-bottom:10px">'
    +'<div style="background:var(--s2);border:1px solid var(--b);border-radius:8px;padding:10px 16px;flex:1;min-width:130px">'
    +'<div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Capital automático</div>'
    +'<div style="font-size:20px;font-weight:700;color:var(--cyan);font-family:var(--mono)">'+fmtM(totalAuto)+'</div>'
    +'<div style="font-size:9px;color:var(--muted);margin-top:2px">precio real + estimado</div></div>'
    +'<div style="background:var(--s2);border:1px solid rgba(167,139,250,.3);border-radius:8px;padding:10px 16px;flex:1;min-width:130px">'
    +'<div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Capital manual</div>'
    +'<div style="font-size:20px;font-weight:700;color:var(--purple);font-family:var(--mono)">'+fmtM(totalManual)+'</div>'
    +'<div style="font-size:9px;color:var(--muted);margin-top:2px">'+nManual+' rubros con precio manual</div></div>'
    +'<div style="background:var(--s2);border:1px solid rgba(52,211,153,.3);border-radius:8px;padding:10px 16px;flex:1;min-width:130px">'
    +'<div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Valor de venta</div>'
    +'<div style="font-size:20px;font-weight:700;color:var(--green);font-family:var(--mono)">'+fmtM(totalVenta)+'</div>'
    +'<div style="font-size:9px;color:var(--muted);margin-top:2px">precio de lista</div></div>'
    +'<div style="background:var(--s2);border:1px solid rgba(251,191,36,.3);border-radius:8px;padding:10px 16px;flex:1;min-width:130px">'
    +'<div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Sin valuar</div>'
    +'<div style="font-size:20px;font-weight:700;color:var(--amber);font-family:var(--mono)">'+nPendiente+'</div>'
    +'<div style="font-size:9px;color:var(--muted);margin-top:2px">rubros sin precio auto ni manual</div></div>'
    +'</div>';

  var rows=rubros.map(function(r,i){
    var c=colors[i%colors.length];
    var bg=i%2===0?'var(--s2)':'transparent';
    var mp=_capManual[r.rubro]||'';
    var manualVal=mp>0?r.stk_total*mp:null;
    var inputId='cmi_'+r.rubro.replace(/[^a-z0-9]/gi,'_');
    return '<tr style="border-bottom:1px solid rgba(255,255,255,.04);background:'+bg+'">'
      +'<td style="padding:6px 9px;color:var(--muted);font-family:var(--mono)">'+(i+1)+'</td>'
      +'<td style="padding:6px 9px"><div style="display:flex;align-items:center;gap:6px">'
      +'<div style="width:6px;height:6px;border-radius:2px;background:'+c+';flex-shrink:0"></div>'
      +'<span style="font-weight:600">'+r.rubro+'</span></div></td>'
      +'<td style="padding:6px 9px;text-align:right;color:var(--muted)">'+r.arts+'</td>'
      +'<td style="padding:6px 9px;text-align:right;color:var(--amber);font-family:var(--mono);font-weight:600">'+fmtN(r.stk_total)+'u</td>'
      +'<td style="padding:6px 9px;text-align:right;font-weight:700;color:'+c+';font-family:var(--mono)">'+fmtM(r.valor_costo)+'</td>'
      +'<td style="padding:6px 9px;text-align:right;color:var(--green)">'+fmtP(r.margen_med)+'</td>'
      +'<td style="padding:6px 9px;min-width:90px"><div style="display:flex;align-items:center;gap:5px">'
      +'<div style="width:55px">'+miniBar(r.valor_costo/maxV*100,c)+'</div>'
      +'<span style="font-size:10px;color:var(--muted)">'+(r.share_pct||0)+'%</span></div></td>'
      // MANUAL PRICE COLUMN
      +'<td style="padding:4px 9px;text-align:center">'
      +'<div style="display:flex;align-items:center;gap:4px;justify-content:center">'
      +'<span style="font-size:10px;color:var(--muted)">$</span>'
      +'<input id="'+inputId+'" type="number" min="0" step="100" value="'+(mp||'')+'" placeholder="precio/u"'
      +' style="width:90px;padding:3px 6px;border-radius:4px;border:1px solid '+(mp?'rgba(167,139,250,.5)':'var(--b)')+';background:'+(mp?'rgba(167,139,250,.08)':'transparent')+';color:var(--text);font-family:var(--mono);font-size:11px;text-align:right;outline:none">'
      +'<button data-r="'+r.rubro+'" data-i="'+inputId+'" onclick="var el=this;saveCapManual(el.dataset.r,document.getElementById(el.dataset.i).value)"'
      +' style="padding:3px 9px;border-radius:4px;font-size:10px;font-weight:600;cursor:pointer;background:rgba(167,139,250,.15);border:1px solid rgba(167,139,250,.35);color:var(--purple);white-space:nowrap">'
      +(mp?'✓ Guardar':'Calcular')+'</button>'
      +(mp?'<button data-r="'+r.rubro+'" onclick="deleteCapManual(this.dataset.r)" title="Borrar precio manual" style="padding:3px 7px;border-radius:4px;font-size:10px;cursor:pointer;background:transparent;border:1px solid rgba(248,113,113,.3);color:var(--red)">✕</button>':'')
      +'</div></td>'
      // MANUAL VALUE
      +'<td style="padding:6px 9px;text-align:right;font-family:var(--mono);font-weight:700;color:'+(manualVal?'var(--purple)':'var(--muted)+')+'">'+(manualVal?fmtM(manualVal):'—')+'</td>'
      +'</tr>';
  }).join('');

  return '<div style="display:flex;flex-direction:column;gap:4px">'
    +'<div style="font-size:10px;color:var(--muted);margin-bottom:2px">'+rubros.length+' rubros · Escribí un precio promedio manual y hacé click en Calcular para guardarlo</div>'
    +totalsBar
    +'<table style="width:100%;border-collapse:collapse;font-size:11px">'
    +'<thead><tr style="background:var(--s2);position:sticky;top:0">'
    +'<th style="padding:7px 9px;text-align:left;font-size:9px;color:var(--muted);text-transform:uppercase">#</th>'
    +'<th style="padding:7px 9px;text-align:left;font-size:9px;color:var(--muted);text-transform:uppercase">Rubro</th>'
    +'<th style="padding:7px 9px;text-align:right;font-size:9px;color:var(--muted);text-transform:uppercase">Arts</th>'
    +'<th style="padding:7px 9px;text-align:right;font-size:9px;color:var(--muted);text-transform:uppercase">Stock</th>'
    +'<th style="padding:7px 9px;text-align:right;font-size:9px;color:var(--muted);text-transform:uppercase">Val. auto</th>'
    +'<th style="padding:7px 9px;text-align:right;font-size:9px;color:var(--muted);text-transform:uppercase">Margen</th>'
    +'<th style="padding:7px 9px;text-align:right;font-size:9px;color:var(--muted);text-transform:uppercase">% total</th>'
    +'<th style="padding:7px 9px;text-align:center;font-size:9px;color:var(--purple);text-transform:uppercase;min-width:220px">💜 Precio manual / u.</th>'
    +'<th style="padding:7px 9px;text-align:right;font-size:9px;color:var(--purple);text-transform:uppercase">Val. manual</th>'
    +'</tr></thead>'
    +'<tbody>'+rows+'</tbody>'
    +'</table></div>';
}

function buildCapArticles(D){
  let arts=D.articles||[];
  if(capSearch){const q=capSearch.toUpperCase();arts=arts.filter(a=>a.c.toUpperCase().includes(q)||a.rubro.toUpperCase().includes(q));}
  if(capFuente!=='all') arts=arts.filter(a=>a.fuente===capFuente);

  const maxV=arts[0]?.valor_costo||1;

  return`<div style="font-size:10px;color:var(--muted);margin-bottom:8px">${arts.length} artículos · ordenados por valor de capital</div>
  <table style="width:100%;border-collapse:collapse;font-size:11px">
    <thead><tr style="background:var(--s2);position:sticky;top:0">
      ${['#','Código IREP','Rubro','Stock','Costo unit.','Precio venta','Val. capital','Margen','Cobertura','Costo al','Fuente'].map(h=>`<th style="padding:6px 8px;text-align:left;font-size:9px;color:var(--muted);text-transform:uppercase;white-space:nowrap">${h}</th>`).join('')}
    </tr></thead>
    <tbody>
    ${arts.slice(0,100).map((a,i)=>{
      const bg=i%2===0?'var(--s2)':'transparent';
      const mColor=a.margen==null?'var(--muted)':a.margen>60?'var(--green)':a.margen>30?'var(--amber)':'var(--red)';
      const covColor=a.cob_meses==null?'var(--muted)':a.cob_meses<2?'var(--red)':a.cob_meses<6?'var(--amber)':'var(--green)';
      const cat=CATALOG?CATALOG.find(x=>x.c===a.c):null;
      return`<tr style="border-bottom:1px solid rgba(255,255,255,.04);background:${bg}">
        <td style="padding:5px 8px;color:var(--muted);font-family:var(--mono)">${i+1}</td>
        <td style="padding:5px 8px"><div style="font-family:var(--mono);font-size:10px;color:var(--cyan)">${a.c}</div>
          ${cat?`<div style="font-size:8px;color:var(--muted);margin-top:1px">${(cat.d||'').slice(0,35)}</div>`:''}
        </td>
        <td style="padding:5px 8px;font-size:9px;color:var(--muted)">${a.rubro}</td>
        <td style="padding:5px 8px;color:var(--amber);font-family:var(--mono)">${fmtN(a.stk)}u</td>
        <td style="padding:5px 8px;font-family:var(--mono)">${a.costo?fmtM(a.costo):'—'}</td>
        <td style="padding:5px 8px;font-family:var(--mono)">${a.precio?fmtM(a.precio):'—'}</td>
        <td style="padding:5px 8px;font-weight:700;color:var(--cyan);font-family:var(--mono)">${fmtM(a.valor_costo)}</td>
        <td style="padding:5px 8px;font-weight:700;color:${mColor}">${fmtP(a.margen)}</td>
        <td style="padding:5px 8px;color:${covColor}">${a.cob_meses!=null?a.cob_meses+'m':'—'}</td>
        <td style="padding:5px 8px;font-size:9px;color:var(--muted)">${a.cost_date||'—'}</td>
        <td style="padding:5px 8px">${fuenteBadge(a.fuente)}</td>
      </tr>`;
    }).join('')}
    </tbody>
  </table>`;
}

// ── ALERTAS ───────────────────────────────────────────────────
function buildCapAlertas(D){
  const arts=D.articles||[];

  // 1. Inmovilizado (no vendido en 12m, pero tiene stock y valor)
  // We flag based on rhy=0 as proxy for no recent sales
  const inmov=arts.filter(a=>a.rhy===0&&a.valor_costo>0).sort((a,b)=>b.valor_costo-a.valor_costo);
  const inmovTotal=inmov.reduce((s,a)=>s+a.valor_costo,0);

  // 2. Alta cobertura (>24 meses) — sobrestock
  const sobrestock=arts.filter(a=>a.cob_meses!=null&&a.cob_meses>24&&a.valor_costo>0).sort((a,b)=>b.valor_costo-a.valor_costo);

  // 3. Bajo stock pero alta rotación (cob < 1m)
  const urgente=arts.filter(a=>a.cob_meses!=null&&a.cob_meses<1&&a.rhy>0).sort((a,b)=>b.valor_costo-a.valor_costo);

  // 4. Sin precio conocido pero con stock
  const sinPrecio=arts.filter(a=>a.fuente==='sin_precio'&&a.stk>0).sort((a,b)=>b.stk-a.stk);

  function alertSection(title, subtitle, color, items, cols){
    if(!items.length) return '';
    return`<div style="background:var(--s2);border:1px solid ${color}33;border-left:2px solid ${color};border-radius:10px;padding:14px;margin-bottom:12px">
      <div style="font-size:12px;font-weight:700;color:${color};margin-bottom:3px">${title}</div>
      <div style="font-size:10px;color:var(--muted);margin-bottom:10px">${subtitle}</div>
      <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead><tr>${cols.map(c=>`<th style="padding:5px 8px;text-align:left;font-size:9px;color:var(--muted);text-transform:uppercase;border-bottom:1px solid var(--b)">${c}</th>`).join('')}</tr></thead>
        <tbody>${items.slice(0,20).map((a,i)=>{
          const cat=CATALOG?CATALOG.find(x=>x.c===a.c):null;
          return`<tr style="border-bottom:1px solid rgba(255,255,255,.04)">
            <td style="padding:5px 8px"><div style="font-family:var(--mono);font-size:10px;color:var(--cyan)">${a.c}</div>
              ${cat?`<div style="font-size:8px;color:var(--muted)">${(cat.d||'').slice(0,30)}</div>`:''}
            </td>
            <td style="padding:5px 8px;font-family:var(--mono);color:var(--amber)">${fmtN(a.stk)}u</td>
            <td style="padding:5px 8px;font-family:var(--mono);font-weight:700;color:${color}">${fmtM(a.valor_costo)}</td>
            ${a.cob_meses!=null?`<td style="padding:5px 8px;color:var(--muted)">${a.cob_meses}m cob.</td>`:''}
            ${a.rhy>0?`<td style="padding:5px 8px;color:var(--muted)">${a.rhy}/m</td>`:''}
            <td style="padding:5px 8px">${fuenteBadge(a.fuente)}</td>
            <td style="padding:5px 8px"><button onclick="toggleCart('${a.c}')" style="padding:3px 8px;border-radius:4px;font-size:9px;cursor:pointer;border:1px solid rgba(96,165,250,.3);background:rgba(96,165,250,.08);color:#60a5fa">+ Carrito</button></td>
          </tr>`;
        }).join('')}</tbody>
      </table>
      </div>
      ${items.length>20?`<div style="font-size:10px;color:var(--muted);margin-top:6px">+ ${items.length-20} más...</div>`:''}
    </div>`;
  }

  return`<div style="display:flex;flex-direction:column;gap:4px">
    <div style="background:rgba(232,24,14,.06);border:1px solid rgba(232,24,14,.15);border-radius:8px;padding:10px 14px;font-size:11px;color:var(--muted);margin-bottom:8px">
      💡 <strong style="color:var(--text)">Alertas de capitalización</strong> — identifican capital mal distribuido: artículos dormidos, sobrestock, y artículos urgentes que no tienen suficiente capital asignado.
    </div>
    ${alertSection('⚠ Capital inmovilizado',
      `${fmtN(inmov.length)} artículos con stock pero sin ventas en 12 meses · ${fmtM(inmovTotal)} en capital dormido`,
      'var(--red)', inmov, ['Artículo','Stock','Capital','','Fuente',''])}
    ${alertSection('📦 Sobrestock crítico (>24 meses cobertura)',
      `${fmtN(sobrestock.length)} artículos con más de 2 años de stock al ritmo actual`,
      'var(--amber)', sobrestock, ['Artículo','Stock','Capital','Cobertura','Ritmo','Fuente',''])}
    ${alertSection('🚨 Stock crítico (<1 mes cobertura)',
      `${fmtN(urgente.length)} artículos con menos de 1 mes de cobertura al ritmo de ventas`,
      'var(--green)', urgente, ['Artículo','Stock','Capital','Cobertura','Ritmo','Fuente',''])}
    ${alertSection('❓ Sin precio conocido',
      `${fmtN(sinPrecio.length)} artículos con stock que no tienen precio en lista ni costo en ventas — no están incluidos en el total`,
      'var(--muted)', sinPrecio, ['Artículo','Stock','Capital','','Fuente',''])}
  </div>`;
}
