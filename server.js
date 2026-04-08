/**
 * I-REP SERVER — servidor local Node.js
 * Lee datos desde Google Sheets y expone endpoints para el frontend.
 * Escritura: solo hoja "Proceso de compras".
 *
 * USO:
 *   npm install
 *   node server.js
 *
 * Luego abrir: http://localhost:3000
 */

const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');
const path    = require('path');
const fs      = require('fs');
const { GoogleAuth } = require('google-auth-library');

const app  = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// ──────────────────────────────────────────────
// CONFIGURACIÓN
// ──────────────────────────────────────────────

// ── SERVICE ACCOUNT AUTH ──────────────────────────────────────
const SCOPES     = ['https://www.googleapis.com/auth/spreadsheets'];
const CREDS_PATH = path.join(__dirname, 'credentials.json');
let _authClient  = null;

async function getAuthClient() {
  if (_authClient) return _authClient;
  // Railway/cloud: credentials from environment variable
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    const { GoogleAuth } = require('google-auth-library');
    const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
    _authClient = new GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
    return _authClient;
  }
  if (!fs.existsSync(CREDS_PATH)) throw new Error('credentials.json no encontrado');
  const auth = new GoogleAuth({ keyFile: CREDS_PATH, scopes: SCOPES });
  _authClient = await auth.getClient();
  console.log('[auth] Service Account autenticado OK');
  return _authClient;
}

async function sheetsRequest(method, url, body=null) {
  const client  = await getAuthClient();
  const headers = await client.getRequestHeaders();
  headers['Content-Type'] = 'application/json';
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(url, opts);
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error?.message || 'Sheets API error ' + resp.status);
  return data;
}

const CONFIG = {
  GOOGLE_API_KEY : 'AIzaSyCfl0H5PUBE1p8sjllbyuz-whBXI15lI-U',
  SHEET_ID       : '1iJ1uFFqL5bTMGgLY1TXUuoObwa9MY0yJ9sYhuSJ5mE4',

  // GIDs de cada hoja
  SHEETS: {
    INDICE         : 1207495591,
    REV            : 114064955,
    STOCK          : 561328589,
    RANKING        : 1022986274,
    PROCESO        : 1660800280,   // Proceso de compras — única hoja con escritura
    RUBROS1        : 487405109,
    CAP_MANUAL     : 689017910,    // Capitalización manual por rubro
  },

  // Nombres de hoja (necesarios para escritura via Sheets API v4)
  SHEET_NAMES: {
    PROCESO    : 'Proceso de compras',
    CAP_MANUAL : 'CAP_MANUAL',
  },

  // GitHub (para deploy del HTML)
  GITHUB_TOKEN  : process.env.GITHUB_TOKEN,
  GITHUB_USER   : 'geronimoak',
  GITHUB_REPO   : 'repuestos',
  GITHUB_BRANCH : 'main',
  GITHUB_FILE   : 'index.html',
};

// ──────────────────────────────────────────────
// HELPERS — Google Sheets
// ──────────────────────────────────────────────

/** Lee un rango de una hoja via Sheets API v4 (pública, solo API key) */
async function readSheet(sheetName, range = '') {
  const r    = range ? `${sheetName}!${range}` : sheetName;
  const url  = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${encodeURIComponent(r)}?key=${CONFIG.GOOGLE_API_KEY}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Sheets API error (${resp.status}): ${err}`);
  }
  const data = await resp.json();
  return data.values || [];
}

/** Convierte array de arrays (con cabecera en fila 0) a array de objetos */
function toObjects(rows) {
  if (rows.length < 1) return [];
  const headers = rows[0];
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] != null ? row[i] : ''; });
    return obj;
  });
}

function clean(v) {
  const s = String(v ?? '').trim();
  return s === 'undefined' ? '' : s;
}

function toNum(v) {
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

// ──────────────────────────────────────────────
// CACHÉ en memoria (TTL 60s para datos pesados)
// ──────────────────────────────────────────────
const cache = { data: null, ts: 0 };
const CACHE_TTL = 300_000; // 5 minutos — stock actualizado cada 5min

// ──────────────────────────────────────────────
// BUILDER — construye el catálogo enriquecido
// ──────────────────────────────────────────────
async function buildCatalog() {
  console.log('[sheets] Leyendo hojas...');

  const [indiceRaw, revRaw, stockRaw, rankingRaw, rubroRaw] = await Promise.all([
    readSheet('INDICE'),
    readSheet('REV'),
    readSheet('STOCK'),
    readSheet('RANKING'),
    readSheet('RUBROS1'),
  ]);

  const indice  = toObjects(indiceRaw);
  const rev     = toObjects(revRaw);
  const stock   = toObjects(stockRaw);
  const ranking = toObjects(rankingRaw);
  const rubros  = toObjects(rubroRaw).map(r => clean(r['NOMBRE'])).filter(Boolean);

  // Diccionarios de lookup
  const stockDict   = {};
  stock.forEach(r => { const k = clean(r['Código']); if (k) stockDict[k] = toNum(r['Cantidad Disponible']); });

  const rankingDict = {};
  ranking.forEach(r => { const k = clean(r['Cod Articulo']); if (k) rankingDict[k] = (rankingDict[k] || 0) + toNum(r['Cantidad']); });
  console.log(`[sheets] ranking: ${ranking.length} rows, ${Object.values(rankingDict).filter(v=>v>0).length} with qty>0`);

  // REV agrupado por Codigo_Equivalente (clave IREP)
  const revByIrep = {};
  rev.forEach(r => {
    const ik = clean(r['Codigo_Equivalente']);
    const rk = clean(r['Código']);
    if (!ik || !rk) return;
    if (!revByIrep[ik]) revByIrep[ik] = [];
    revByIrep[ik].push({
      k  : rk,
      mv : clean(r['MARCA']),
      mr : clean(r['Marca']),
      p  : toNum(r['PRECIO INTERNACIONAL']),
      img: clean(r['IMAGEN']),
    });
  });

  // Construir catálogo
  const catalog = [];
  indice.forEach(row => {
    const ik = clean(row['Codigo']);
    if (!ik) return;

    const revRows = revByIrep[ik] || [];
    const stk     = revRows.reduce((acc, rr) => acc + (stockDict[rr.k] || 0), 0);
    const rnk     = revRows.reduce((acc, rr) => acc + (rankingDict[rr.k] || 0), 0);

    let img = clean(row['IMAGEN']);
    let p   = 0;
    revRows.forEach(rr => {
      if (!img && rr.img) img = rr.img;
      if (!p   && rr.p)   p   = rr.p;
    });

    catalog.push({
      c  : ik,
      d  : clean(row['Descripcion']),
      r  : clean(row['RUBRO']),
      m  : clean(row['Marca']),
      mo : clean(row['Modelo']),
      ln : clean(row['LINEA']),
      img,
      stk,
      rnk,
      p  : Math.round(p * 100) / 100,
      rev: revRows.map(rr => ({ k: rr.k, mv: rr.mv, mr: rr.mr, p: rr.p, stk: stockDict[rr.k] || 0, rnk: rankingDict[rr.k] || 0 })),
    });
  });

  catalog.sort((a, b) => b.rnk - a.rnk);
  
  // Compute MET (global metrics) server-side
  const totalItems = catalog.length;
  const withStock  = catalog.filter(x => x.stk > 0).length;
  const maxRnk     = Math.max(...catalog.map(x => x.rnk), 1);
  
  // Group by rubro for MET
  const rubroMap = {};
  catalog.forEach(item => {
    const r = item.r;
    if (!r) return;
    if (!rubroMap[r]) rubroMap[r] = { total:0, con:0, rubros:0, ln:'' };
    rubroMap[r].total++;
    if (item.stk > 0) rubroMap[r].con++;
    rubroMap[r].ln = item.ln || '';
  });
  
  // Compute rubros list with pct
  const rubrosArr = Object.entries(rubroMap).map(([r, d]) => ({
    r, total: d.total, con: d.con,
    pct: Math.round(d.con / d.total * 100),
  }));

  // Score ponderado: weighted average by total items per rubro
  const totalWeighted = rubrosArr.reduce((s, r) => s + r.total, 0);
  const scorePonderado = totalWeighted > 0
    ? Math.round(rubrosArr.reduce((s, r) => s + r.pct * r.total, 0) / totalWeighted * 10) / 10
    : 0;

  const rubrosActivos = rubrosArr.filter(r => r.con > 0).length;
  const rubrosCompletos = rubrosArr.filter(r => r.pct === 100).length;

  const met = {
    global: {
      total: totalItems,
      con: withStock,
      con_stk: withStock,
      pct: Math.round(withStock / totalItems * 1000) / 10,
      pct_stk: Math.round(withStock / totalItems * 1000) / 10,
      score_ponderado: scorePonderado,
      rubros_activos: rubrosActivos,
      rubros_total: rubrosArr.length,
      rubros_completos: rubrosCompletos,
    },
    rubros: rubrosArr,
    lineas: [],
  };

  console.log(`[sheets] Catálogo: ${catalog.length} items | Stock>0: ${withStock}`);
  return { catalog, rubros, met, max: maxRnk };
}

async function buildProceso() {
  const rows = toObjects(await readSheet('Proceso de compras'));
  return rows
    .filter(r => clean(r['Codigo']))
    .map((r, i) => ({
      _row  : i + 2, // fila real en el sheet (fila 1 = cabecera)
      c     : clean(r['Codigo']),
      d     : clean(r['Descripcion']),
      m     : clean(r['Marca']),
      mo    : clean(r['Modelo']),
      r     : clean(r['RUBRO']),
      qty   : clean(r['Cantidad a comprar']) || '1',
      prov  : clean(r['PROVEDOR']),
      pedido: clean(r['PEDIDO']),
      ecA   : clean(r['EN CAMINO: A']),
      ecB   : clean(r['EN CAMINO: B']),
      fecha : clean(r['📅PEDIDO']),
    }));
}

// ──────────────────────────────────────────────
// ENDPOINTS
// ──────────────────────────────────────────────

/** GET /api/data — catálogo completo (cacheado) */
app.get('/api/data', async (req, res) => {
  try {
    const now = Date.now();
    if (!cache.data || now - cache.ts > CACHE_TTL || req.query.refresh) {
      cache.data = await buildCatalog();
      cache.ts   = now;
    }
    res.json({ ok: true, ts: cache.ts, ...cache.data });
  } catch (e) {
    console.error('[/api/data]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** GET /api/proceso — carrito de compras (siempre fresco) */
app.get('/api/proceso', async (req, res) => {
  try {
    const proceso = await buildProceso();
    res.json({ ok: true, proceso });
  } catch (e) {
    console.error('[/api/proceso]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * POST /api/proceso/append — agregar fila al carrito
 * Body: { c, d, m, mo, r, qty, prov }
 *
 * NOTA: escritura requiere OAuth2. Por ahora devuelve la fila
 * formateada lista para pegar en el Sheet manualmente o via
 * el script de sincronización.
 * Para habilitar escritura real: ver README — sección OAuth2.
 */
app.post('/api/proceso/append', async (req, res) => {
  try {
    const b = req.body;
    // 13 columnas exactas: A=Codigo B=Descripcion C=Marca D=Modelo E=MOTOR
    // F=RUBRO G=IMAGEN H=Cantidad I=PROVEEDOR J=PEDIDO K=CAMINO_A L=CAMINO_B M=FECHA
    const row = [
      clean(b.c),        // A Codigo
      clean(b.d),        // B Descripcion
      clean(b.m),        // C Marca
      clean(b.mo),       // D Modelo
      '',                // E MOTOR
      clean(b.r),        // F RUBRO
      clean(b.img)||'',  // G IMAGEN (ruta desde INDICE)
      clean(b.qty)||'1', // H Cantidad a comprar
      clean(b.prov)||'', // I PROVEEDOR
      'FALSE',           // J PEDIDO
      '',                // K EN CAMINO: A
      '',                // L EN CAMINO: B
      '',                // M FECHA PEDIDO
    ];

    // Step 1: find last non-empty row in column A to avoid offset issues
    const colAUrl = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${encodeURIComponent("'Proceso de compras'!A:A")}?key=${CONFIG.GOOGLE_API_KEY}`;
    const colAResp = await fetch(colAUrl);
    const colAData = await colAResp.json();
    const lastRow = (colAData.values || []).length;
    const targetRow = lastRow + 1;

    // Step 2: write explicitly to A{targetRow}:M{targetRow}
    const range = `'Proceso de compras'!A${targetRow}:M${targetRow}`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
    await sheetsRequest('PUT', url, { values: [row] });

    console.log('[append] Nueva fila en Proceso de compras:', row[0], '→ fila', targetRow);
    res.json({ ok: true, row: targetRow, message: 'Fila agregada: ' + row[0] });
  } catch (e) {
    console.error('[append]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** POST /api/proceso/update — actualizar estado de una fila
 *  Body: { _row, campo, valor }
 *  Mismo aviso sobre OAuth2 que en append.
 */
app.post('/api/proceso/update', async (req, res) => {
  try {
    const { code, campo, valor } = req.body;
    if (!code) return res.status(400).json({ ok: false, error: 'Falta code' });

    const COL_MAP = { qty:'H', prov:'I', pedido:'J', ecA:'K', ecB:'L', fecha:'M' };
    const col = COL_MAP[campo];
    if (!col) return res.json({ ok: true, skipped: true, campo });

    // Find row by searching column A for the code (reliable regardless of row shifts)
    const colAUrl = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${encodeURIComponent("'Proceso de compras'!A:A")}?key=${CONFIG.GOOGLE_API_KEY}`;
    const colAResp = await fetch(colAUrl);
    const colAData = await colAResp.json();
    const values = colAData.values || [];
    const rowIndex = values.findIndex(row => row[0] && row[0].trim() === code.trim());
    if (rowIndex === -1) {
      console.warn('[update] Código no encontrado:', code);
      return res.json({ ok: false, error: 'Código no encontrado: ' + code });
    }
    const rowNum = rowIndex + 1;
    const range = "'Proceso de compras'!" + col + rowNum;
    const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + CONFIG.SHEET_ID + '/values/' + encodeURIComponent(range) + '?valueInputOption=USER_ENTERED';
    await sheetsRequest('PUT', url, { values: [[valor]] });
    console.log('[update]', code, '→', range, '=', valor);
    res.json({ ok: true, row: rowNum });
  } catch(e) {
    console.error('[update]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** POST /api/proceso/delete — eliminar fila por código IREP
 *  Body: { code }  — busca el código en columna A y elimina esa fila
 */
app.post('/api/proceso/delete', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ ok: false, error: 'Falta code' });

    // 1. Get all values of column A to find the row number
    const colAUrl = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${encodeURIComponent("'Proceso de compras'!A:A")}?key=${CONFIG.GOOGLE_API_KEY}`;
    const colAResp = await fetch(colAUrl);
    const colAData = await colAResp.json();
    const values = colAData.values || [];

    // Find the row index (0-based) where column A matches the code
    const rowIndex = values.findIndex(row => row[0] && row[0].trim() === code.trim());
    if (rowIndex === -1) {
      console.warn('[delete] Código no encontrado en hoja:', code);
      return res.json({ ok: true, skipped: true, message: 'Código no encontrado en Sheet' });
    }

    // 2. Delete that row using batchUpdate
    const sheetId = CONFIG.SHEETS.PROCESO;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}:batchUpdate`;
    await sheetsRequest('POST', url, {
      requests: [{
        deleteDimension: {
          range: {
            sheetId,
            dimension: 'ROWS',
            startIndex: rowIndex,   // 0-indexed
            endIndex: rowIndex + 1,
          }
        }
      }]
    });
    console.log('[delete] Eliminado:', code, '→ fila', rowIndex + 1);
    res.json({ ok: true, deletedRow: rowIndex + 1 });
  } catch(e) {
    console.error('[delete]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});


// ── /api/analytics — Ventas analytics en tiempo real (caché 1h) ──
const anaCache = { data: null, ts: 0 };
const ANA_TTL  = 3600_000;

app.get('/api/analytics', async (req, res) => {
  try {
    const force = req.query.refresh === '1';
    if (!force && anaCache.data && Date.now() - anaCache.ts < ANA_TTL)
      return res.json({ ok: true, ...anaCache.data, cached: true });

    console.log('[analytics] Building from Sheets...');
    const t0 = Date.now();

    const ventasUrl = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${encodeURIComponent('VENTAS')}?key=${CONFIG.GOOGLE_API_KEY}`;
    const revUrl    = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${encodeURIComponent('REV!A:E')}?key=${CONFIG.GOOGLE_API_KEY}`;
    const [vR, rR]  = await Promise.all([fetch(ventasUrl), fetch(revUrl)]);
    const [vD, rD]  = await Promise.all([vR.json(), rR.json()]);

    const ventasRows = vD.values || [];
    const revRows    = rD.values || [];

    const rev2irep = {};
    for (let i = 1; i < revRows.length; i++) {
      const [cod,,,,equiv] = revRows[i];
      if (cod && equiv && equiv.trim()) rev2irep[cod.trim()] = equiv.trim();
    }

    const cleanNum = s => parseFloat((s||'0').replace(',','.')) || 0;
    const rows = [];
    const lastCostByCod = {};

    for (let i = 1; i < ventasRows.length; i++) {
      const [fecha, cliente, vendedor, cod_art, desc, cant, precio, costo] = ventasRows[i];
      if (!fecha || !cod_art) continue;
      const qty = cleanNum(cant); if (qty <= 0) continue;
      const pr  = cleanNum(precio);
      const co  = cleanNum(costo);
      const dt  = new Date(fecha);
      if (isNaN(dt)) continue;
      const cod = cod_art.trim();
      if (co > 0) lastCostByCod[cod] = { c: co, d: fecha.slice(0,10) };
      const cf = lastCostByCod[cod] || { c: 0, d: '' };
      const margin = (cf.c > 0 && pr > 0 && pr > cf.c * 0.1)
        ? Math.min(95, Math.max(0, (pr - cf.c) / pr * 100)) : null;
      rows.push({
        fecha: dt, mes: dt.toISOString().slice(0,7),
        month: dt.getMonth()+1, dow: dt.getDay(),
        cliente: (cliente||'').trim(), vendedor: (vendedor||'').trim(),
        cod, irep: rev2irep[cod]||null,
        rubro: rev2irep[cod] ? rev2irep[cod].split('-').slice(0,-1).join('-') : null,
        qty, precio: pr, costo_f: cf.c, revenue: qty*pr,
        margin, profit: cf.c>0 ? Math.max(0,(pr-cf.c)*qty) : 0,
      });
    }

    console.log(`[analytics] ${rows.length} rows in ${Date.now()-t0}ms`);
    const months = [...new Set(rows.map(r=>r.mes))].sort();
    const last3=months.slice(-3), prev3=months.slice(-6,-3), last6=months.slice(-6), last12=months.slice(-12);
    const totalRev = rows.reduce((a,r)=>a+r.revenue,0);
    const sum = (arr,k) => arr.reduce((a,r)=>a+(r[k]||0),0);
    const median = arr => { if(!arr.length) return null; const s=[...arr].sort((a,b)=>a-b); return s[Math.floor(s.length/2)]; };
    const groupBy = (arr,k) => arr.reduce((acc,r)=>{ const v=r[k]; if(!v) return acc; if(!acc[v]) acc[v]=[]; acc[v].push(r); return acc; },{});

    const revByMes={}, qtyByMes={}, profByMes={};
    months.forEach(m=>{ const g=rows.filter(r=>r.mes===m); revByMes[m]=Math.round(sum(g,'revenue')); qtyByMes[m]=Math.round(sum(g,'qty')); profByMes[m]=Math.round(sum(g,'profit')); });

    const margins = rows.filter(r=>r.margin!=null).map(r=>r.margin).sort((a,b)=>a-b);
    const summary = {
      total_rev: Math.round(totalRev), total_qty: Math.round(sum(rows,'qty')),
      total_tx: rows.length, total_profit: Math.round(sum(rows,'profit')),
      avg_margin: margins.length ? Math.round(median(margins)*10)/10 : 0,
      avg_ticket: Math.round(totalRev/rows.length),
      n_clients: new Set(rows.map(r=>r.cliente)).size,
      n_articles: new Set(rows.filter(r=>r.irep).map(r=>r.irep)).size,
      n_rubros: new Set(rows.filter(r=>r.rubro).map(r=>r.rubro)).size,
      date_from: rows[0]?.fecha.toISOString().slice(0,10),
      date_to: rows[rows.length-1]?.fecha.toISOString().slice(0,10),
      months, rev_by_month: revByMes, qty_by_month: qtyByMes, profit_by_month: profByMes,
      rev_last3: Math.round(sum(rows.filter(r=>last3.includes(r.mes)),'revenue')),
      rev_prev3: Math.round(sum(rows.filter(r=>prev3.includes(r.mes)),'revenue')),
      trend_3m: prev3.length ? Math.round((sum(rows.filter(r=>last3.includes(r.mes)),'revenue')/Math.max(sum(rows.filter(r=>prev3.includes(r.mes)),'revenue'),1)-1)*1000)/10 : 0,
      peak_month: (() => { const mn=['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']; const bm={}; rows.forEach(r=>{ bm[r.month]=(bm[r.month]||0)+r.revenue; }); return mn[Object.entries(bm).sort((a,b)=>b[1]-a[1])[0][0]]; })(),
      low_month: (() => { const mn=['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']; const bm={}; rows.forEach(r=>{ bm[r.month]=(bm[r.month]||0)+r.revenue; }); return mn[Object.entries(bm).sort((a,b)=>a[1]-b[1])[0][0]]; })(),
    };

    const vendorGroups = groupBy(rows,'vendedor');
    const vendors = Object.entries(vendorGroups).map(([n,g])=>{ const l3=sum(g.filter(r=>last3.includes(r.mes)),'revenue'), p3=sum(g.filter(r=>prev3.includes(r.mes)),'revenue'); const vm={}; months.forEach(m=>{ vm[m]=Math.round(sum(g.filter(r=>r.mes===m),'revenue')); }); const mg=median(g.filter(r=>r.margin!=null).map(r=>r.margin)); return { n, rev:Math.round(sum(g,'revenue')), qty:Math.round(sum(g,'qty')), tx:g.length, clients:new Set(g.map(r=>r.cliente)).size, articles:new Set(g.filter(r=>r.irep).map(r=>r.irep)).size, avg_ticket:Math.round(sum(g,'revenue')/g.length), margin:mg?Math.round(mg*10)/10:null, profit:Math.round(sum(g,'profit')), trend:p3>0?Math.round((l3/p3-1)*1000)/10:0, by_month:vm }; }).sort((a,b)=>b.rev-a.rev);

    const clientGroups = groupBy(rows,'cliente');
    let clients = Object.entries(clientGroups).map(([n,g])=>{ const rev_c=sum(g,'revenue'); const lastDate=g.length?new Date(Math.max(...g.map(r=>+r.fecha))):new Date(); const days_since=Math.floor((new Date()-lastDate)/86400000); const span=Math.max((lastDate-(g.length?new Date(Math.min(...g.map(r=>+r.fecha))):new Date()))/2592000000,1); const freq=g.length/span; const r_s=days_since<=30?3:days_since<=90?2:1, f_s=freq>=2?3:freq>=0.5?2:1, m_s=rev_c>=totalRev*0.001?3:rev_c>=totalRev*0.0001?2:1; return { n, rev:Math.round(rev_c), qty:Math.round(sum(g,'qty')), tx:g.length, rfm:r_s*100+f_s*10+m_s, days_since, last:lastDate.toISOString().slice(0,10), first:(g.length?new Date(Math.min(...g.map(r=>+r.fecha))):new Date()).toISOString().slice(0,10), articles:new Set(g.filter(r=>r.irep).map(r=>r.irep)).size, avg_ticket:Math.round(sum(g,'revenue')/g.length), at_risk:days_since>90&&rev_c>totalRev*0.001 }; }).sort((a,b)=>b.rev-a.rev);
    let cumRev=0; clients=clients.map(c=>{ cumRev+=c.rev; return {...c, abc:cumRev<=totalRev*0.7?'A':cumRev<=totalRev*0.9?'B':'C'}; });

    const irepGroups = groupBy(rows.filter(r=>r.irep),'irep');
    const articles = Object.entries(irepGroups).map(([irep,g])=>{ const l3=sum(g.filter(r=>last3.includes(r.mes)),'revenue'), p3=sum(g.filter(r=>prev3.includes(r.mes)),'revenue'); const bm={}; last12.forEach(m=>{ const gm=g.filter(r=>r.mes===m); if(gm.length) bm[m]={q:Math.round(sum(gm,'qty')),r:Math.round(sum(gm,'revenue'))}; }); const mg=median(g.filter(r=>r.margin!=null).map(r=>r.margin)); return { c:irep, qty:Math.round(sum(g,'qty')), rev:Math.round(sum(g,'revenue')), tx:g.length, avg_p:Math.round(sum(g,'revenue')/Math.max(sum(g,'qty'),1)), margin:mg?Math.round(mg*10)/10:null, profit:Math.round(sum(g,'profit')), clients:new Set(g.map(r=>r.cliente)).size, last_sale:g.length?new Date(Math.max(...g.map(r=>+r.fecha))).toISOString().slice(0,10):"", months_active:new Set(g.map(r=>r.mes)).size, trend:p3>0?Math.round((l3/p3-1)*1000)/10:l3>0?100:0, by_month:bm }; }).sort((a,b)=>b.rev-a.rev);

    const rubroGroups = groupBy(rows.filter(r=>r.rubro),'rubro');
    const rubros = Object.entries(rubroGroups).map(([r2,g])=>{ const l3=sum(g.filter(r=>last3.includes(r.mes)),'revenue'), p3=sum(g.filter(r=>prev3.includes(r.mes)),'revenue'); const bm={}; months.slice(-12).forEach(m=>{ bm[m]=Math.round(sum(g.filter(r=>r.mes===m),'revenue')); }); const mg=median(g.filter(r=>r.margin!=null).map(r=>r.margin)); return { r:r2, rev:Math.round(sum(g,'revenue')), qty:Math.round(sum(g,'qty')), tx:g.length, profit:Math.round(sum(g,'profit')), arts:new Set(g.filter(r=>r.irep).map(r=>r.irep)).size, clients:new Set(g.map(r=>r.cliente)).size, margin:mg?Math.round(mg*10)/10:null, trend:p3>0?Math.round((l3/p3-1)*1000)/10:0, by_month:bm }; }).sort((a,b)=>b.rev-a.rev);

    const dowL=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    const dow=[0,1,2,3,4,5,6].map(d=>{ const g=rows.filter(r=>r.dow===d); return { d:dowL[d], rev:Math.round(sum(g,'revenue')), qty:Math.round(sum(g,'qty')), tx:g.length }; });

    const sold6m=new Set(rows.filter(r=>last6.includes(r.mes)&&r.irep).map(r=>r.irep));
    const sold2m=new Set(rows.filter(r=>months.slice(-2).includes(r.mes)&&r.irep).map(r=>r.irep));
    const quiebreSet=[...sold6m].filter(c=>!sold2m.has(c));
    const alerts = {
      at_risk_clients: clients.filter(c=>c.at_risk).slice(0,20),
      quiebre: articles.filter(a=>quiebreSet.includes(a.c)).slice(0,30),
      rising: articles.filter(a=>a.trend>50&&a.rev>300000).sort((a,b)=>b.trend-a.trend).slice(0,20),
      high_margin: articles.filter(a=>a.margin&&a.margin>70&&a.qty>10).sort((a,b)=>b.margin-a.margin).slice(0,20),
    };

    const result = { summary, vendors, clients:clients.slice(0,150), articles:articles.slice(0,600), rubros, dow, alerts, built_at:new Date().toISOString() };
    anaCache.data = result; anaCache.ts = Date.now();
    console.log(`[analytics] Done in ${Date.now()-t0}ms`);
    res.json({ ok:true, ...result });
  } catch(e) {
    console.error('[analytics]', e.message);
    res.status(500).json({ ok:false, error:e.message });
  }
});

// ── /api/novedades — Eventos detectados automáticamente ──────
const novCache = { data: null, ts: 0 };
const NOV_TTL  = 1800_000; // 30 min

app.get('/api/novedades', async (req, res) => {
  try {
    const force = req.query.refresh === '1';
    if (!force && novCache.data && Date.now() - novCache.ts < NOV_TTL)
      return res.json({ ok:true, events: novCache.data, cached:true });

    console.log('[novedades] Computing events...');
    const t0 = Date.now();

    // Reuse analytics data if fresh, otherwise compute from Sheets
    let ana = anaCache.data;
    if (!ana || Date.now() - anaCache.ts > ANA_TTL) {
      // Fetch minimal data needed
      const ventasUrl = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${encodeURIComponent('VENTAS')}?key=${CONFIG.GOOGLE_API_KEY}`;
      const revUrl    = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${encodeURIComponent('REV!A:E')}?key=${CONFIG.GOOGLE_API_KEY}`;
      const [vR,rR]   = await Promise.all([fetch(ventasUrl),fetch(revUrl)]);
      const [vD,rD]   = await Promise.all([vR.json(),rR.json()]);
      const revRows   = rD.values||[];
      const rev2irep  = {};
      for (let i=1;i<revRows.length;i++){ const [cod,,,,eq]=revRows[i]; if(cod&&eq&&eq.trim()) rev2irep[cod.trim()]=eq.trim(); }
      const cleanNum  = s=>parseFloat((s||'0').replace(',','.'))||0;
      const rows=[]; const lastCostByCod={};
      for (let i=1;i<(vD.values||[]).length;i++){
        const [fecha,cliente,vendedor,cod_art,desc,cant,precio,costo]=(vD.values||[])[i];
        if(!fecha||!cod_art) continue;
        const qty=cleanNum(cant); if(qty<=0) continue;
        const pr=cleanNum(precio), co=cleanNum(costo), dt=new Date(fecha);
        if(isNaN(dt)) continue;
        const cod=cod_art.trim();
        if(co>0) lastCostByCod[cod]={c:co,d:fecha.slice(0,10)};
        const cf=lastCostByCod[cod]||{c:0,d:''};
        const margin=(cf.c>0&&pr>0&&pr>cf.c*0.1)?Math.min(95,Math.max(0,(pr-cf.c)/pr*100)):null;
        rows.push({ fecha:dt, mes:dt.toISOString().slice(0,7), cliente:(cliente||'').trim(), vendedor:(vendedor||'').trim(), cod, irep:rev2irep[cod]||null, rubro:rev2irep[cod]?rev2irep[cod].split('-').slice(0,-1).join('-'):null, qty, precio:pr, costo_f:cf.c, revenue:qty*pr, margin, profit:cf.c>0?Math.max(0,(pr-cf.c)*qty):0 });
      }
      const months=[...new Set(rows.map(r=>r.mes))].sort();
      const last3=months.slice(-3),prev3=months.slice(-6,-3),last6=months.slice(-6);
      const totalRev=rows.reduce((a,r)=>a+r.revenue,0);
      const sum=(arr,k)=>arr.reduce((a,r)=>a+(r[k]||0),0);
      const groupBy=(arr,k)=>arr.reduce((acc,r)=>{ const v=r[k]; if(!v) return acc; if(!acc[v]) acc[v]=[]; acc[v].push(r); return acc; },{});
      const median=arr=>{ if(!arr.length) return null; const s=[...arr].sort((a,b)=>a-b); return s[Math.floor(s.length/2)]; };
      const irepGroups=groupBy(rows.filter(r=>r.irep),'irep');
      const articles=Object.entries(irepGroups).map(([irep,g])=>{ const l3=sum(g.filter(r=>last3.includes(r.mes)),'revenue'),p3=sum(g.filter(r=>prev3.includes(r.mes)),'revenue'); const mg=median(g.filter(r=>r.margin!=null).map(r=>r.margin)); return { c:irep, qty:Math.round(sum(g,'qty')), rev:Math.round(sum(g,'revenue')), tx:g.length, avg_p:Math.round(sum(g,'revenue')/Math.max(sum(g,'qty'),1)), margin:mg?Math.round(mg*10)/10:null, clients:new Set(g.map(r=>r.cliente)).size, last_sale:g.length?new Date(Math.max(...g.map(r=>+r.fecha))).toISOString().slice(0,10):"", months_active:new Set(g.map(r=>r.mes)).size, trend:p3>0?Math.round((l3/p3-1)*1000)/10:l3>0?100:0, prev_qty:Math.round(sum(g.filter(r=>r.mes<months[months.length-1]),'qty')), by_precio:g.map(r=>r.precio).filter(p=>p>0), hist_avg_p:Math.round(sum(g.filter(r=>r.mes<months[months.length-1]),'precio')/Math.max(g.filter(r=>r.mes<months[months.length-1]).length,1)) }; }).sort((a,b)=>b.rev-a.rev);
      const clientGroups=groupBy(rows,'cliente');
      const clientList=Object.entries(clientGroups).map(([n,g])=>{ const rev_c=sum(g,'revenue'); const lastDate=g.length?new Date(Math.max(...g.map(r=>+r.fecha))):new Date(); const _prevArr=g.filter(r=>r.mes<months[months.length-1]); const prevDate=_prevArr.length?new Date(Math.max(..._prevArr.map(r=>+r.fecha))):new Date(0); const days_since=Math.floor((new Date()-lastDate)/86400000); return { n, rev:Math.round(rev_c), tx:g.length, days_since, last:lastDate.toISOString().slice(0,10), prev_last:prevDate.toISOString().slice(0,10), gap_days:prevDate>new Date(0)?Math.floor((lastDate-prevDate)/86400000):0, at_risk:days_since>90&&rev_c>totalRev*0.001, abc:rev_c>=totalRev*0.007?'A':rev_c>=totalRev*0.001?'B':'C' }; });
      const rubroGroups=groupBy(rows.filter(r=>r.rubro),'rubro');
      const rubroList=Object.entries(rubroGroups).map(([r2,g])=>{ const l3=sum(g.filter(r=>last3.includes(r.mes)),'revenue'),histAvg=g.filter(r=>!last3.includes(r.mes)).reduce((a,r)=>a+r.revenue,0)/Math.max(months.length-3,1); return { r:r2, rev:Math.round(sum(g,'revenue')), l3:Math.round(l3), histAvg:Math.round(histAvg), ratio:histAvg>0?Math.round(l3/histAvg*10)/10:0 }; });
      const vendorGroups=groupBy(rows,'vendedor');
      const vendorList=Object.entries(vendorGroups).map(([n,g])=>{ const days=[...new Set(g.map(r=>r.fecha.toISOString().slice(0,10)))].sort(); let streak=1,maxS=1; for(let i=1;i<days.length;i++){ const diff=(new Date(days[i])-new Date(days[i-1]))/86400000; if(diff===1){streak++;maxS=Math.max(maxS,streak);}else streak=1; } return { n, streak:maxS }; });
      const sold6m=new Set(rows.filter(r=>last6.includes(r.mes)&&r.irep).map(r=>r.irep));
      const sold2m=new Set(rows.filter(r=>months.slice(-2).includes(r.mes)&&r.irep).map(r=>r.irep));

      ana = { articles, clientList, rubroList, vendorList, sold6m:[...sold6m], sold2m:[...sold2m], months, totalRev, _raw:true };
    }

    const events = [];
    const now = new Date();
    const mkId = (type, key) => `${type}__${key.replace(/[^a-zA-Z0-9-_]/g,'_')}`;

    const arts      = ana._raw ? ana.articles      : (ana.articles||[]);
    const clients2  = ana._raw ? ana.clientList     : (ana.clients||[]);
    const rubros2   = ana._raw ? ana.rubroList      : (ana.rubros||[]);
    const vendors2  = ana._raw ? ana.vendorList     : [];
    const sold6mSet = ana._raw ? new Set(ana.sold6m): new Set((ana.alerts?.quiebre||[]).map(a=>a.c));
    const sold2mSet = ana._raw ? new Set(ana.sold2m): new Set();
    const months2   = ana._raw ? ana.months         : (ana.summary?.months||[]);

    // 1. QUIEBRE DE STOCK — vendido en 6m, no en últimos 2m
    const quiebreArts = arts.filter(a => sold6mSet.has(a.c) && !sold2mSet.has(a.c) && a.qty >= 5);
    quiebreArts.slice(0,15).forEach(a => {
      events.push({ id:mkId('quiebre',a.c), type:'quiebre', urgency:'high', icon:'🚨',
        title:`Posible quiebre: ${a.c}`,
        body:`Sin ventas en los últimos 2 meses. Historial: ${a.qty} unidades en ${a.months_active} meses activo. ${a.clients} clientes distintos lo compraban.`,
        meta:{ code:a.c, qty:a.qty, clients:a.clients, last_sale:a.last_sale },
        actions:['carrito','motor'], ts:now.toISOString() });
    });

    // 2. CLIENTE EN RIESGO — alto valor, sin comprar >90 días
    const riskClients = clients2.filter(c => c.at_risk || (c.days_since>90 && c.abc==='A'));
    riskClients.slice(0,10).forEach(c => {
      events.push({ id:mkId('riesgo_cliente',c.n), type:'cliente_riesgo', urgency:'high', icon:'🏪',
        title:`Cliente ${c.abc} en riesgo: ${c.n}`,
        body:`${c.days_since} días sin comprar. Historial: $${(c.rev/1e6).toFixed(1)}M. Clasificación ${c.abc}. Solía comprar con regularidad.`,
        meta:{ client:c.n, days_since:c.days_since, rev:c.rev, abc:c.abc },
        actions:['analytics'], ts:now.toISOString() });
    });

    // 3. ANOMALÍA DE PRECIO — venta >1.8× o <0.4× el histórico
    arts.filter(a => a.hist_avg_p && a.hist_avg_p > 1000 && a.avg_p > 0).forEach(a => {
      const ratio = a.avg_p / a.hist_avg_p;
      if (ratio > 1.8 || ratio < 0.4) {
        events.push({ id:mkId('precio',a.c), type:'precio', urgency:'medium', icon:'💰',
          title:`Anomalía de precio: ${a.c}`,
          body:`Precio reciente $${a.avg_p.toLocaleString()} vs histórico $${a.hist_avg_p.toLocaleString()} (${ratio.toFixed(1)}×). Verificar si es ajuste de lista o error de carga.`,
          meta:{ code:a.c, ratio:Math.round(ratio*10)/10, current:a.avg_p, historical:a.hist_avg_p },
          actions:['analytics'], ts:now.toISOString() });
      }
    });

    // 4. HITO DE VENTAS — artículo cruzó umbral acumulado
    const milestones = [50,100,200,500,1000];
    arts.forEach(a => {
      const prev = a.prev_qty || 0;
      milestones.forEach(m => {
        if (prev < m && a.qty >= m) {
          events.push({ id:mkId('hito',`${a.c}_${m}`), type:'hito', urgency:'low', icon:'🏆',
            title:`Hito: ${a.c} cruzó las ${m} unidades`,
            body:`Alcanzó ${a.qty} unidades vendidas históricas. Activo en ${a.months_active} meses con ${a.clients} clientes distintos.`,
            meta:{ code:a.c, milestone:m, qty:a.qty, clients:a.clients },
            actions:['analytics'], ts:now.toISOString() });
        }
      });
    });

    // 5. RUBRO EN ACELERACIÓN — >1.8× su promedio histórico
    rubros2.filter(r => r.ratio >= 1.8 && r.l3 > 200000).forEach(r => {
      events.push({ id:mkId('rubro_accel',r.r), type:'rubro_accel', urgency:'medium', icon:'💡',
        title:`Rubro en aceleración: ${r.r}`,
        body:`Ingresó ${r.ratio}× su promedio mensual histórico este trimestre ($${(r.l3/1e6).toFixed(1)}M vs avg $${(r.histAvg/1e6).toFixed(1)}M/mes). Verificar stock en todos los artículos del rubro.`,
        meta:{ rubro:r.r, ratio:r.ratio, l3:r.l3, histAvg:r.histAvg },
        actions:['analytics','motor'], ts:now.toISOString() });
    });

    // 6. CLIENTE VOLVIÓ — sin comprar >60 días, compró en el último mes
    clients2.filter(c => c.gap_days > 60 && months2.length && c.last.startsWith(months2[months2.length-1])).forEach(c => {
      events.push({ id:mkId('cliente_volvio',c.n), type:'cliente_volvio', urgency:'low', icon:'🔁',
        title:`Cliente volvió: ${c.n}`,
        body:`Compró después de ${c.gap_days} días inactivo. Historial total: $${(c.rev/1e6).toFixed(1)}M. Buena señal para retención.`,
        meta:{ client:c.n, gap:c.gap_days, rev:c.rev },
        actions:[], ts:now.toISOString() });
    });

    // 7. ARTÍCULO EN CRECIMIENTO — tendencia >50%
    arts.filter(a => a.trend > 50 && a.rev > 300000).slice(0,10).forEach(a => {
      events.push({ id:mkId('crecimiento',a.c), type:'crecimiento', urgency:'medium', icon:'🚀',
        title:`Artículo en crecimiento: ${a.c}`,
        body:`Tendencia +${a.trend}% vs período anterior. Ingresos: $${(a.rev/1e6).toFixed(1)}M con ${a.clients} clientes. Asegurar stock.`,
        meta:{ code:a.c, trend:a.trend, rev:a.rev },
        actions:['carrito','motor'], ts:now.toISOString() });
    });

    // 8. ALTA RENTABILIDAD — margen >70% con volumen real
    arts.filter(a => a.margin && a.margin > 70 && a.qty > 10).slice(0,8).forEach(a => {
      events.push({ id:mkId('margen_alto',a.c), type:'margen_alto', urgency:'low', icon:'💎',
        title:`Alta rentabilidad: ${a.c}`,
        body:`Margen del ${a.margin}% con ${a.qty} unidades vendidas. Candidato a destacar en cotizaciones y sugerencias al mostrador.`,
        meta:{ code:a.c, margin:a.margin, qty:a.qty, rev:a.rev },
        actions:['cotizador'], ts:now.toISOString() });
    });

    // 9. ARTÍCULO NUEVO — primera venta reciente
    arts.filter(a => a.months_active <= 2 && a.qty >= 1).slice(0,8).forEach(a => {
      events.push({ id:mkId('nuevo',a.c), type:'nuevo', urgency:'low', icon:'🆕',
        title:`Artículo nuevo en catálogo: ${a.c}`,
        body:`Primera venta registrada. ${a.qty} unidades con ${a.clients} clientes. Considerar agregar a selección destacada.`,
        meta:{ code:a.c, qty:a.qty, clients:a.clients },
        actions:['catalogo'], ts:now.toISOString() });
    });

    // 10. RACHA DE VENDEDOR
    vendors2.filter(v => v.streak >= 10).forEach(v => {
      events.push({ id:mkId('racha',v.n), type:'racha', urgency:'low', icon:'🏅',
        title:`Racha de ${v.n}: ${v.streak} días consecutivos vendiendo`,
        body:`Récord de días consecutivos sin interrupciones. Excelente consistencia operativa.`,
        meta:{ vendor:v.n, streak:v.streak },
        actions:[], ts:now.toISOString() });
    });

    // Sort: high first, then medium, then low
    const urgOrd = { high:0, medium:1, low:2 };
    events.sort((a,b) => urgOrd[a.urgency]-urgOrd[b.urgency]);

    novCache.data = events; novCache.ts = Date.now();
    console.log(`[novedades] ${events.length} events in ${Date.now()-t0}ms`);
    res.json({ ok:true, events, count:events.length, built_at:new Date().toISOString() });
  } catch(e) {
    console.error('[novedades]', e.message);
    res.status(500).json({ ok:false, error:e.message });
  }
});


// ── /api/capitalizacion — Stock valorizado a costo real/estimado ─
const capCache = { data: null, ts: 0 };
const CAP_TTL  = 3600_000;

app.get('/api/capitalizacion', async (req, res) => {
  try {
    const force = req.query.refresh === '1';
    if (!force && capCache.data && Date.now() - capCache.ts < CAP_TTL)
      return res.json({ ok: true, ...capCache.data, cached: true });

    console.log('[cap] Building stock valuation...');
    const t0 = Date.now();

    // Read REV (stock + price + irep mapping)
    const revUrl = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${encodeURIComponent('REV!A:J')}?key=${CONFIG.GOOGLE_API_KEY}`;
    // Read VENTAS (for cost extraction)
    const ventasUrl = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${encodeURIComponent('VENTAS')}?key=${CONFIG.GOOGLE_API_KEY}`;

    const [revR, ventasR] = await Promise.all([fetch(revUrl), fetch(ventasUrl)]);
    const [revD, ventasD] = await Promise.all([revR.json(), ventasR.json()]);

    const revRows    = revD.values || [];
    const ventasRows = ventasD.values || [];

    const cleanNum = s => parseFloat((s||'0').replace(',','.')) || 0;

    // Build REV data: cod → { stk, precio, irep, rubro }
    // REV cols: Código, Descripción, Cantidad Disponible, Equivalencia, Codigo_Equivalente, RUBRO, IMAGEN, PRECIO INTERNACIONAL, MARCA, Marca
    const revMap = {};
    const revToIrep = {};
    for (let i = 1; i < revRows.length; i++) {
      const r = revRows[i];
      const cod   = (r[0]||'').trim();
      const stk   = cleanNum(r[2]);
      const irep  = ((r[3]||r[4])||'').trim();
      const rubro = (r[5]||'').trim();
      const precio= cleanNum(r[7]);
      if (!cod) continue;
      if (irep) revToIrep[cod] = irep;
      if (!revMap[irep]) revMap[irep] = { stk:0, precio:0, rubro, codes:0 };
      revMap[irep].stk   += stk;
      revMap[irep].precio = revMap[irep].precio || precio;
      revMap[irep].codes++;
    }

    // Extract last known cost per REV cod from VENTAS (fill-forward)
    const lastCostByCod = {};
    const ventasRows_sorted = [...ventasRows.slice(1)].sort((a,b) => new Date(a[0]) - new Date(b[0]));
    for (const r of ventasRows_sorted) {
      const [fecha,,, cod_art,,,, costo] = r;
      const co = cleanNum(costo);
      const cod = (cod_art||'').trim();
      if (co > 0 && cod) lastCostByCod[cod] = { c: co, d: (fecha||'').slice(0,10) };
    }

    // Map cost to IREP (best/most recent)
    const irepCost = {};
    for (const [revCod, irep] of Object.entries(revToIrep)) {
      if (lastCostByCod[revCod]) {
        const e = lastCostByCod[revCod];
        if (!irepCost[irep] || e.d > irepCost[irep].d) irepCost[irep] = e;
      }
    }

    // Monthly rhythm per IREP from VENTAS
    const months = new Set();
    const irepQty = {};
    for (const r of ventasRows.slice(1)) {
      const [fecha,,, cod_art,,cant] = r;
      if (!fecha||!cod_art) continue;
      const dt = new Date(fecha); if (isNaN(dt)) continue;
      const mes = dt.toISOString().slice(0,7);
      months.add(mes);
      const irep = revToIrep[(cod_art||'').trim()];
      if (!irep) continue;
      if (!irepQty[irep]) irepQty[irep] = { sold12m:0, soldAll:0 };
      irepQty[irep].soldAll += cleanNum(cant);
      const ageMonths = (new Date() - dt) / 2592000000;
      if (ageMonths <= 12) irepQty[irep].sold12m += cleanNum(cant);
    }
    const totalMonths = Math.max(months.size, 1);

    // Build article list
    const articles = [];
    for (const [irep, data] of Object.entries(revMap)) {
      if (data.stk <= 0) continue;
      const costEntry = irepCost[irep];
      const costo     = costEntry ? costEntry.c : 0;
      const precio    = data.precio;
      const stk       = data.stk;

      let valor_costo;
      let fuente;
      if (costo > 0) {
        valor_costo = stk * costo; fuente = 'real';
      } else if (precio > 0) {
        valor_costo = stk * precio / 1.20; fuente = 'estimado';
      } else {
        valor_costo = 0; fuente = 'sin_precio';
      }

      const valor_venta = precio > 0 ? stk * precio : 0;
      const margen = (costo > 0 && precio > 0 && precio > costo * 0.1)
        ? Math.min(95, Math.max(0, (precio - costo) / precio * 100)) : null;

      const qData  = irepQty[irep];
      const rhy    = qData ? Math.round(qData.soldAll / totalMonths * 10) / 10 : 0;
      const cob    = rhy > 0 ? Math.round(stk / rhy * 10) / 10 : null;
      const rubro  = irep.split('-').slice(0,-1).join('-') || data.rubro;

      articles.push({
        c: irep, rubro, stk: Math.round(stk),
        costo: Math.round(costo), precio: precio > 0 ? Math.round(precio) : null,
        valor_costo: Math.round(valor_costo),
        valor_venta: valor_venta > 0 ? Math.round(valor_venta) : null,
        fuente, margen: margen != null ? Math.round(margen * 10) / 10 : null,
        cost_date: costEntry ? costEntry.d : '',
        rhy, cob_meses: cob,
      });
    }

    articles.sort((a, b) => b.valor_costo - a.valor_costo);

    // Rubro aggregation
    const rubroMap = {};
    for (const a of articles) {
      if (!rubroMap[a.rubro]) rubroMap[a.rubro] = { stk:0, valor_costo:0, valor_venta:0, arts:0, arts_real:0, arts_est:0, arts_sin:0, margins:[], cobs:[] };
      const R = rubroMap[a.rubro];
      R.stk        += a.stk;
      R.valor_costo+= a.valor_costo;
      R.valor_venta+= (a.valor_venta||0);
      R.arts++;
      if (a.fuente==='real')      R.arts_real++;
      else if (a.fuente==='estimado') R.arts_est++;
      else R.arts_sin++;
      if (a.margen != null)  R.margins.push(a.margen);
      if (a.cob_meses != null) R.cobs.push(a.cob_meses);
    }

    const totalCosto = articles.reduce((s,a)=>s+a.valor_costo,0);
    const totalVenta = articles.reduce((s,a)=>s+(a.valor_venta||0),0);
    const median = arr => { if(!arr.length) return null; const s=[...arr].sort((a,b)=>a-b); return Math.round(s[Math.floor(s.length/2)]*10)/10; };

    const rubros = Object.entries(rubroMap).map(([r, d]) => ({
      rubro: r, stk_total: Math.round(d.stk),
      valor_costo: Math.round(d.valor_costo), valor_venta: Math.round(d.valor_venta),
      arts: d.arts, arts_real: d.arts_real, arts_est: d.arts_est, arts_sin: d.arts_sin,
      margen_med: median(d.margins), cob_med: median(d.cobs),
      share_pct: totalCosto > 0 ? Math.round(d.valor_costo/totalCosto*1000)/10 : 0,
    })).sort((a,b) => b.valor_costo - a.valor_costo);

    const withPrice = articles.filter(a=>a.fuente!=='sin_precio');
    const allMargins = articles.filter(a=>a.margen!=null).map(a=>a.margen).sort((a,b)=>a-b);
    const inmovArts  = articles.filter(a=>a.rhy===0).length;
    const inmovVal   = articles.filter(a=>a.rhy===0).reduce((s,a)=>s+a.valor_costo,0);

    const summary = {
      total_costo: Math.round(totalCosto), total_venta: Math.round(totalVenta),
      total_arts: articles.length,
      arts_real: articles.filter(a=>a.fuente==='real').length,
      arts_est:  articles.filter(a=>a.fuente==='estimado').length,
      arts_sin:  articles.filter(a=>a.fuente==='sin_precio').length,
      cobertura_pct: Math.round(withPrice.length/Math.max(articles.length,1)*1000)/10,
      margen_promedio: allMargins.length ? Math.round(allMargins[Math.floor(allMargins.length/2)]*10)/10 : 0,
      inmovilizado_val: Math.round(inmovVal), inmovilizado_arts: inmovArts,
      rotacion_promedio: median(articles.filter(a=>a.cob_meses!=null).map(a=>a.cob_meses)),
      generado: new Date().toISOString(),
    };

    const result = { summary, rubros, articles: articles.slice(0,300) };
    capCache.data = result; capCache.ts = Date.now();
    console.log(`[cap] ${articles.length} articles, $${(totalCosto/1e6).toFixed(1)}M in ${Date.now()-t0}ms`);
    res.json({ ok: true, ...result });
  } catch(e) {
    console.error('[cap]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});



// ── /api/ventas — Estadísticas de ventas por artículo IREP ──
// Reemplaza ventas.js estático. Caché 1h.
const ventasCache = { data: null, ts: 0 };
const VENTAS_TTL  = 3600_000;

app.get('/api/ventas', async (req, res) => {
  try {
    const force = req.query.refresh === '1';
    if (!force && ventasCache.data && Date.now() - ventasCache.ts < VENTAS_TTL)
      return res.json({ ok: true, vs: ventasCache.data, cached: true });

    console.log('[ventas] Building from Sheets...');
    const t0 = Date.now();

    // Need REV for mapping REV-code → IREP
    const [ventasRaw, revRaw] = await Promise.all([
      readSheet('VENTAS'),
      readSheet('REV'),
    ]);

    const revRows = toObjects(revRaw);
    const rev2irep = {};
    revRows.forEach(r => {
      const revCod  = clean(r['Código']);
      const irepCod = clean(r['Codigo_Equivalente']) || clean(r['Equivalencia']);
      if (revCod && irepCod) rev2irep[revCod] = irepCod;
    });

    const ventasRows = toObjects(ventasRaw);
    const now  = new Date();
    const months = new Set();
    const byIrep = {};

    ventasRows.forEach(row => {
      const cod  = clean(row['Cod Articulo']);
      const irep = cod ? rev2irep[cod] : null;
      if (!irep) return;
      const qty  = toNum(row['Cantidad']);
      if (qty <= 0) return;
      const dt   = new Date(row['Fecha']);
      if (isNaN(dt)) return;
      const mes  = dt.toISOString().slice(0, 7);
      months.add(mes);

      if (!byIrep[irep]) byIrep[irep] = { tot: 0, l3: 0, p3: 0, ls: [], byMonth: {} };
      byIrep[irep].tot += qty;

      // Monthly breakdown
      byIrep[irep].byMonth[mes] = (byIrep[irep].byMonth[mes] || 0) + qty;

      // Last sales list (keep last 5)
      if (byIrep[irep].ls.length < 8)
        byIrep[irep].ls.push([dt.toISOString().slice(0,10), qty, clean(row['Descripcion'])]);
    });

    const allMonths = [...months].sort();
    const totalMonths = Math.max(allMonths.length, 1);
    const last3  = new Set(allMonths.slice(-3));
    const prev3  = new Set(allMonths.slice(-6, -3));

    const vs = {};
    Object.entries(byIrep).forEach(([irep, d]) => {
      d.l3 = [...last3].reduce((s, m) => s + (d.byMonth[m] || 0), 0);
      d.p3 = [...prev3].reduce((s, m) => s + (d.byMonth[m] || 0), 0);
      const rhy = Math.round(d.tot / totalMonths * 10) / 10;
      const tr  = d.l3 > d.p3 * 1.1 ? 'up' : d.l3 < d.p3 * 0.9 ? 'down' : 'flat';
      // Sort last sales by date desc
      d.ls.sort((a, b) => b[0].localeCompare(a[0]));
      vs[irep] = { tot: Math.round(d.tot), l3: Math.round(d.l3), p3: Math.round(d.p3), rhy, tr, ls: d.ls.slice(0, 5) };
    });

    ventasCache.data = vs;
    ventasCache.ts   = Date.now();
    console.log(`[ventas] ${Object.keys(vs).length} articles in ${Date.now()-t0}ms`);
    res.json({ ok: true, vs });
  } catch(e) {
    console.error('[ventas]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── /api/motor — Motor de decisión (score + cuadrantes) ──────
// Reemplaza motor.js estático. Caché 1h.
const motorApiCache = { data: null, ts: 0 };
const MOTOR_TTL     = 3600_000;

app.get('/api/motor', async (req, res) => {
  try {
    const force = req.query.refresh === '1';
    if (!force && motorApiCache.data && Date.now() - motorApiCache.ts < MOTOR_TTL)
      return res.json({ ok: true, motor: motorApiCache.data, cached: true });

    console.log('[motor] Building from Sheets...');
    const t0 = Date.now();

    // Fetch catalog and ventas in parallel (use cached if available)
    let catData = cache.data;
    if (!catData) { catData = await buildCatalog(); cache.data = catData; cache.ts = Date.now(); }

    let vsData = ventasCache.data;
    if (!vsData) {
      // Build ventas inline
      const [ventasRaw, revRaw] = await Promise.all([readSheet('VENTAS'), readSheet('REV')]);
      const rev2irep = {};
      toObjects(revRaw).forEach(r => {
        const rc = clean(r['Código']), ic = clean(r['Codigo_Equivalente'])||clean(r['Equivalencia']);
        if (rc && ic) rev2irep[rc] = ic;
      });
      const byIrep = {};
      const months = new Set();
      toObjects(ventasRaw).forEach(row => {
        const cod = clean(row['Cod Articulo']), irep = cod ? rev2irep[cod] : null;
        if (!irep) return;
        const qty = toNum(row['Cantidad']); if (qty <= 0) return;
        const dt = new Date(row['Fecha']); if (isNaN(dt)) return;
        const mes = dt.toISOString().slice(0,7); months.add(mes);
        if (!byIrep[irep]) byIrep[irep] = { tot:0, l3:0, p3:0, byMonth:{} };
        byIrep[irep].tot += qty; byIrep[irep].byMonth[mes] = (byIrep[irep].byMonth[mes]||0)+qty;
      });
      const allMonths=[...months].sort(), totalMonths=Math.max(allMonths.length,1);
      const last3=new Set(allMonths.slice(-3)), prev3=new Set(allMonths.slice(-6,-3));
      vsData={};
      Object.entries(byIrep).forEach(([irep,d])=>{
        const l3=[...last3].reduce((s,m)=>s+(d.byMonth[m]||0),0);
        const p3=[...prev3].reduce((s,m)=>s+(d.byMonth[m]||0),0);
        const rhy=Math.round(d.tot/totalMonths*10)/10;
        const tr=l3>p3*1.1?'up':l3<p3*0.9?'down':'flat';
        vsData[irep]={tot:Math.round(d.tot),l3:Math.round(l3),p3:Math.round(p3),rhy,tr,ls:[]};
      });
      ventasCache.data=vsData; ventasCache.ts=Date.now();
    }

    const { catalog } = catData;
    const maxRnk = Math.max(...catalog.map(x => x.rnk), 1);
    const now = new Date();

    const motor = catalog
      .filter(item => item.rnk > 0 || (vsData[item.c] && vsData[item.c].rhy > 0))
      .map(item => {
        const vs  = vsData[item.c] || { tot:0, l3:0, p3:0, rhy:0, tr:'flat', ls:[] };
        const stk = item.stk;
        const rhy = Math.max(vs.rhy, (item.rnk / 26) * 0.6); // effective rhythm
        const rhy_r = vs.rhy;
        const rhy_h = Math.round(item.rnk / 26 * 10) / 10;
        const cov  = rhy > 0 ? Math.round(stk / rhy * 10) / 10 : 999;

        // Score: urgency 0-100
        let score = 0;
        if (rhy > 0) {
          const demandScore = Math.min(50, Math.round(rhy / (maxRnk/26) * 50));
          const covScore    = cov === 999 ? 0 : cov < 1 ? 50 : cov < 2 ? 35 : cov < 4 ? 20 : cov < 8 ? 10 : 0;
          score = Math.min(100, demandScore + covScore);
        }

        // Quadrant
        const hiDemand = rhy >= 1;
        const hiStock  = cov >= 2;
        const quad = hiDemand && !hiStock ? 'U'   // Urgente
                   : hiDemand && hiStock  ? 'O'   // OK
                   : !hiDemand && !hiStock? 'A'   // Analizar
                   :                        'S';  // Sobrestock

        // Days since last sale
        const lastSale = vs.ls && vs.ls[0] ? new Date(vs.ls[0][0]) : null;
        const days = lastSale ? Math.floor((now - lastSale) / 86400000) : 999;

        // Novelty: new article (first sale in last 3 months)
        const nov = vs.l3 > 0 && vs.tot <= vs.l3 + vs.p3 ? 1 : 0;

        return {
          c: item.c, d: item.d, r: item.r,
          stk, rnk: item.rnk,
          rhy: Math.round(rhy * 10) / 10,
          rhy_r, rhy_h,
          l3: vs.l3, p3: vs.p3,
          tr: vs.tr, cov, score, quad, days, nov,
          img: item.img || '',
        };
      })
      .sort((a, b) => b.score - a.score);

    motorApiCache.data = motor;
    motorApiCache.ts   = Date.now();
    console.log(`[motor] ${motor.length} articles, scores computed in ${Date.now()-t0}ms`);
    res.json({ ok: true, motor });
  } catch(e) {
    console.error('[motor]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── /api/cap-manual/get — Leer precios manuales ──────────────
app.get('/api/cap-manual', async (req, res) => {
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${encodeURIComponent("'CAP_MANUAL'!A:B")}?key=${CONFIG.GOOGLE_API_KEY}`;
    const r   = await fetch(url);
    const d   = await r.json();
    const rows = (d.values || []).slice(1); // skip header
    const data = {};
    rows.forEach(([rubro, precio]) => {
      if (rubro && precio) {
        const p = parseFloat(String(precio).replace(',', '.'));
        if (!isNaN(p) && p > 0) data[rubro.trim()] = p;
      }
    });
    res.json({ ok: true, data });
  } catch(e) {
    console.error('[cap-manual/get]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── /api/cap-manual/set — Guardar precio manual de un rubro ──
app.post('/api/cap-manual/set', async (req, res) => {
  try {
    const { rubro, precio } = req.body;
    if (!rubro) return res.status(400).json({ ok: false, error: 'Falta rubro' });

    // Read current data to find existing row
    const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${encodeURIComponent("'CAP_MANUAL'!A:A")}?key=${CONFIG.GOOGLE_API_KEY}`;
    const readR   = await fetch(readUrl);
    const readD   = await readR.json();
    const rows    = readD.values || [];

    // Find row index (1-based, row 1 = header)
    const rowIdx = rows.findIndex((r, i) => i > 0 && r[0] && r[0].trim() === rubro.trim());

    if (precio === null || precio === '' || precio === 0) {
      // DELETE: clear the row if it exists
      if (rowIdx > 0) {
        const rowNum = rowIdx + 1;
        const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${encodeURIComponent("'CAP_MANUAL'!A"+rowNum+":B"+rowNum)}:clear`;
        await sheetsRequest('POST', clearUrl, {});
        console.log(`[cap-manual] Deleted: ${rubro} row ${rowNum}`);
      }
      return res.json({ ok: true, action: 'deleted' });
    }

    const val = parseFloat(String(precio).replace(',', '.'));
    if (isNaN(val) || val <= 0) return res.status(400).json({ ok: false, error: 'Precio inválido' });

    if (rowIdx > 0) {
      // UPDATE existing row
      const rowNum = rowIdx + 1;
      const range  = encodeURIComponent(`'CAP_MANUAL'!A${rowNum}:B${rowNum}`);
      const url    = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${range}?valueInputOption=USER_ENTERED`;
      await sheetsRequest('PUT', url, { values: [[rubro.trim(), val]] });
      console.log(`[cap-manual] Updated: ${rubro} = ${val}`);
    } else {
      // APPEND new row
      const range = encodeURIComponent("'CAP_MANUAL'!A:B");
      const url   = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
      await sheetsRequest('POST', url, { values: [[rubro.trim(), val]] });
      console.log(`[cap-manual] Added: ${rubro} = ${val}`);
    }

    res.json({ ok: true, action: rowIdx > 0 ? 'updated' : 'added', rubro, precio: val });
  } catch(e) {
    console.error('[cap-manual/set]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── IMAGE MAP ─────────────────────────────────────────────────
const DRIVE_FOLDERS = {
  'INDICE_Images':       '1P28HBNnTM00_frni0-GTMSj2048HRBtN',
  'REVTEC_HOJA1_Images': '1DPCmzwcUEcuugOmZIGv6PP6xN6Xy_jL9',
};
const imgCache = { map: null, ts: 0 };
const IMG_TTL  = 3600_000; // 1 hora

async function fetchFolderImages(folderName, folderId) {
  const map = {};
  let pageToken = null;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'nextPageToken,files(id,name)',
      pageSize: '1000',
      key: CONFIG.GOOGLE_API_KEY,
    });
    if (pageToken) params.set('pageToken', pageToken);
    const resp = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`);
    if (!resp.ok) throw new Error(`Drive API ${resp.status}`);
    const data = await resp.json();
    for (const f of (data.files || [])) {
      map[`${folderName}/${f.name}`] = `https://lh3.googleusercontent.com/d/${f.id}`;
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  console.log(`[drive] ${folderName}: ${Object.keys(map).length} images`);
  return map;
}

async function buildImageMap() {
  const results = await Promise.all(
    Object.entries(DRIVE_FOLDERS).map(([name, id]) => fetchFolderImages(name, id))
  );
  return Object.assign({}, ...results);
}

app.get('/api/images', async (req, res) => {
  try {
    const now = Date.now();
    if (!imgCache.map || now - imgCache.ts > IMG_TTL || req.query.refresh) {
      console.log('[images] Fetching image map from Drive...');
      imgCache.map = await buildImageMap();
      imgCache.ts  = now;
      console.log(`[images] Total: ${Object.keys(imgCache.map).length} images`);
    }
    res.json({ ok: true, count: Object.keys(imgCache.map).length, map: imgCache.map });
  } catch(e) {
    console.error('[/api/images]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});


app.get('/api/status', (req, res) => {
  res.json({
    ok      : true,
    server  : 'I-REP Server v1.0',
    sheetId : CONFIG.SHEET_ID,
    cache   : { age: Math.round((Date.now() - cache.ts) / 1000) + 's', items: cache.data?.catalog?.length || 0 },
    time    : new Date().toISOString(),
  });
});

/** Servir el frontend */
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  const f = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(f)) res.sendFile(f);
  else res.send('<h2>Copiá irep_online.html a la carpeta public/ y renombralo index.html</h2>');
});

// ──────────────────────────────────────────────
// START
// ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('  ██╗      ██████╗ ███████╗██████╗ ');
  console.log('  ██║      ██╔══██╗██╔════╝██╔══██╗');
  console.log('  ██║█████╗██████╔╝█████╗  ██████╔╝');
  console.log('  ██║╚════╝██╔══██╗██╔══╝  ██╔═══╝ ');
  console.log('  ██║      ██║  ██║███████╗██║     ');
  console.log('  ╚═╝      ╚═╝  ╚═╝╚══════╝╚═╝     ');
  console.log('');
  console.log(`  Servidor corriendo en http://localhost:${PORT}`);
  console.log(`  Sheet: ${CONFIG.SHEET_ID.slice(0,16)}...`);
  console.log('');
  console.log('  Endpoints:');
  console.log(`    GET  /api/status    — estado del servidor`);
  console.log(`    GET  /api/data      — catálogo completo (caché 60s)`);
  console.log(`    GET  /api/data?refresh — forzar recarga`);
  console.log(`    GET  /api/proceso   — carrito de compras (live)`);
  console.log(`    POST /api/proceso/append  — agregar al carrito`);
  console.log(`    POST /api/proceso/update  — actualizar campo`);
  console.log('');
  console.log('  ⚠  Escritura requiere OAuth2 (ver README.md)');
  console.log('');
});
