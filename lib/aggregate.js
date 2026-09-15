import pkg from 'googleapis';
const { google } = pkg;

const SPREADSHEET_ID = process.env.SHEET_ID;
const RUBROS = ['Automotriz', 'Financiera', 'Logística', 'Energía'];
const ESTADOS = [
  'Nuevo', 'Enviado', 'Rebotado', 'Contactado', 'Oportunidad derivada',
  'Propuesta enviada', 'Cerrado - Ganado', 'Cerrado - Perdido'
];

function parseSheetDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  // Google Sheets (locale es-AR) returns dates as "DD/MM/YYYY" formatted text.
  // JS's native Date parser assumes MM/DD/YYYY for slash-separated strings,
  // which silently misreads e.g. "01/09/2026" (1 Sep) as 9 Jan. Parse explicitly.
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const year = parseInt(m[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(year, month - 1, day);
    }
  }
  // Fallback for ISO-like strings (YYYY-MM-DD) or other unambiguous formats
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function monthKey(date) {
  const d = parseSheetDate(date);
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key) {
  const [y, m] = key.split('-');
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${meses[parseInt(m, 10) - 1]}-${y}`;
}

async function getAuthClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_PRIVATE_KEY || '';

  key = key.trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  if (key.includes('\\n')) {
    key = key.replace(/\\n/g, '\n');
  }

  if (!key.includes('-----BEGIN PRIVATE KEY-----') || !key.includes('-----END PRIVATE KEY-----')) {
    throw new Error(
      'GOOGLE_PRIVATE_KEY no tiene el formato esperado (falta el encabezado/pie ' +
      '-----BEGIN PRIVATE KEY-----). Volvé a pegar el valor completo del campo ' +
      '"private_key" del JSON de la Service Account, tal cual está.'
    );
  }

  const auth = new google.auth.JWT(email, null, key, [
    'https://www.googleapis.com/auth/spreadsheets.readonly',
  ]);
  await auth.authorize();
  return auth;
}

/**
 * Reads both sheets and returns the aggregated KPI object.
 * Used by both api/data.js (live) and api/publish-snapshot.js (frozen copy
 * for the client view) — keep this the single source of truth for the math.
 */
async function computeAggregates() {
  if (!SPREADSHEET_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    const err = new Error('Faltan variables de entorno en el servidor.');
    err.isConfigError = true;
    throw err;
  }

  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const [contactosResp, logResp] = await Promise.all([
    sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "'Seguimiento de Contactos'!A1:O5000",
    }),
    sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "'Log de Envíos'!A1:H5000",
    }),
  ]);

  const contactosRows = contactosResp.data.values || [];
  const logRows = logResp.data.values || [];

  const cHeaders = contactosRows[0] || [];
  const cIdx = Object.fromEntries(cHeaders.map((h, i) => [h, i]));
  const contactos = contactosRows.slice(1).filter(r => r[cIdx['Empresa']]);

  const lHeaders = logRows[0] || [];
  const lIdx = Object.fromEntries(lHeaders.map((h, i) => [h, i]));
  const log = logRows.slice(1).filter(r => r[lIdx['Empresa']]);

  const empresaIndustria = {};
  contactos.forEach(r => {
    const empresa = r[cIdx['Empresa']];
    const industria = r[cIdx['Industria']];
    if (empresa && industria && !(empresa in empresaIndustria)) {
      empresaIndustria[empresa] = industria;
    }
  });

  const total = contactos.length;
  const conEmail = contactos.filter(r => r[cIdx['Email']]).length;
  const conTelefono = contactos.filter(r => r[cIdx['Teléfono']]).length;
  const conLinkedIn = contactos.filter(r => r[cIdx['LinkedIn']]).length;
  const empresasUnicas = new Set(contactos.map(r => r[cIdx['Empresa']]).filter(Boolean)).size;

  const porRubro = RUBROS.map(rubro => {
    const sub = contactos.filter(r => r[cIdx['Industria']] === rubro);
    const conDato = sub.filter(r => r[cIdx['Email']] || r[cIdx['Teléfono']]).length;
    const reuniones = sub.filter(r => r[cIdx['Estado']] === 'Oportunidad derivada').length;
    const ganados = sub.filter(r => r[cIdx['Estado']] === 'Cerrado - Ganado').length;
    return { rubro, total: sub.length, conDato, reuniones, ganados };
  });

  const porEstado = ESTADOS.map(estado => ({
    estado,
    cantidad: contactos.filter(r => r[cIdx['Estado']] === estado).length,
  }));

  const altasPorMesMap = {};
  contactos.forEach(r => {
    const fecha = r[cIdx['Fecha de Alta']];
    if (!fecha) return;
    const key = monthKey(fecha);
    if (!key) return;
    altasPorMesMap[key] = (altasPorMesMap[key] || 0) + 1;
  });

  const envMonthly = {};
  const industriaMonthly = {};
  RUBROS.forEach(r => (industriaMonthly[r] = {}));

  log.forEach(r => {
    const fecha = r[lIdx['Fecha']];
    const canal = r[lIdx['Canal']];
    const resultado = r[lIdx['Resultado']];
    const empresa = r[lIdx['Empresa']];
    const key = monthKey(fecha);
    if (!key) return;
    if (!envMonthly[key]) {
      envMonthly[key] = { envios: 0, entregados: 0, rebotados: 0, interesados: 0, reuniones: 0, ganados: 0, perdidos: 0 };
    }
    const m = envMonthly[key];
    m.envios += 1;
    if (resultado === 'Rebotado') m.rebotados += 1;
    if (canal === 'Email' && resultado !== 'Rebotado') m.entregados += 1;
    if (resultado === 'Contactado') m.interesados += 1;
    if (resultado === 'Oportunidad derivada') m.reuniones += 1;
    if (resultado === 'Cerrado - Ganado') m.ganados += 1;
    if (resultado === 'Cerrado - Perdido') m.perdidos += 1;

    const industria = empresaIndustria[empresa];
    if (industria && RUBROS.includes(industria)) {
      if (!industriaMonthly[industria][key]) {
        industriaMonthly[industria][key] = { ganados: 0, perdidos: 0, reunionAgendada: 0, propuestaEnviada: 0 };
      }
      if (resultado === 'Cerrado - Ganado') industriaMonthly[industria][key].ganados += 1;
      if (resultado === 'Cerrado - Perdido') industriaMonthly[industria][key].perdidos += 1;
      if (resultado === 'Oportunidad derivada') industriaMonthly[industria][key].reunionAgendada += 1;
      if (resultado === 'Propuesta enviada') industriaMonthly[industria][key].propuestaEnviada += 1;
    }
  });

  const totalInteresados = log.filter(r => r[lIdx['Resultado']] === 'Contactado').length;
  const totalReuniones = log.filter(r => r[lIdx['Resultado']] === 'Oportunidad derivada').length;
  const totalGanados = log.filter(r => r[lIdx['Resultado']] === 'Cerrado - Ganado').length;
  const totalPerdidos = log.filter(r => r[lIdx['Resultado']] === 'Cerrado - Perdido').length;
  const oportunidadesAbiertas = Math.max(0, totalInteresados + totalReuniones - totalGanados - totalPerdidos);

  const allMonthKeys = Array.from(new Set([...Object.keys(altasPorMesMap), ...Object.keys(envMonthly)])).sort();

  const altasPorMes = allMonthKeys.map(k => ({ mes: monthLabel(k), key: k, cantidad: altasPorMesMap[k] || 0 }));
  const enviosPorMes = allMonthKeys.map(k => ({
    mes: monthLabel(k),
    key: k,
    ...((envMonthly[k]) || { envios: 0, entregados: 0, rebotados: 0, interesados: 0, reuniones: 0, ganados: 0, perdidos: 0 }),
  }));

  const cerradosPorIndustriaPorMes = allMonthKeys.map(k => {
    const row = { mes: monthLabel(k), key: k };
    RUBROS.forEach(rubro => {
      const v = industriaMonthly[rubro][k] || { ganados: 0, perdidos: 0, reunionAgendada: 0, propuestaEnviada: 0 };
      row[rubro] = v;
    });
    return row;
  });

  return {
    generadoAl: new Date().toISOString(),
    resumen: { total, conEmail, conTelefono, conLinkedIn, empresasUnicas },
    porRubro,
    porEstado,
    altasPorMes,
    enviosPorMes,
    cerradosPorIndustriaPorMes,
    oportunidadesAbiertas,
    meses: allMonthKeys.map(k => ({ key: k, label: monthLabel(k) })),
  };
}

export { computeAggregates };
