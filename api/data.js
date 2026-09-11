const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.SHEET_ID;
const RUBROS = ['Automotriz', 'Financiera', 'Logística', 'Energía'];
const ESTADOS = [
  'Nuevo', 'Rebotado', 'Contactado', 'En conversación', 'Reunión agendada',
  'Propuesta enviada', 'Interesado', 'No interesado', 'Cerrado - Ganado', 'Cerrado - Perdido'
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
  // returns "YYYY-MM"
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
  // If the value was pasted with surrounding quotes, strip them
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  // Convert literal \n (backslash-n as text) into real newlines
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

module.exports = async (req, res) => {
  try {
    if (!SPREADSHEET_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      res.status(500).json({ error: 'Faltan variables de entorno en el servidor.' });
      return;
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

    // Map Empresa -> Industria for the join used by "Cerrados por Industria"
    const empresaIndustria = {};
    contactos.forEach(r => {
      const empresa = r[cIdx['Empresa']];
      const industria = r[cIdx['Industria']];
      if (empresa && industria && !(empresa in empresaIndustria)) {
        empresaIndustria[empresa] = industria;
      }
    });

    // ---- Resumen general ----
    const total = contactos.length;
    const conEmail = contactos.filter(r => r[cIdx['Email']]).length;
    const conTelefono = contactos.filter(r => r[cIdx['Teléfono']]).length;
    const conLinkedIn = contactos.filter(r => r[cIdx['LinkedIn']]).length;

    // ---- Avance por rubro ----
    const porRubro = RUBROS.map(rubro => {
      const sub = contactos.filter(r => r[cIdx['Industria']] === rubro);
      const conDato = sub.filter(r => r[cIdx['Email']] || r[cIdx['Teléfono']]).length;
      const reuniones = sub.filter(r => r[cIdx['Estado']] === 'Reunión agendada').length;
      const ganados = sub.filter(r => r[cIdx['Estado']] === 'Cerrado - Ganado').length;
      return { rubro, total: sub.length, conDato, reuniones, ganados };
    });

    // ---- Contactos por estado ----
    const porEstado = ESTADOS.map(estado => ({
      estado,
      cantidad: contactos.filter(r => r[cIdx['Estado']] === estado).length,
    }));

    // ---- Contactos agregados por mes (Fecha de Alta) ----
    const altasPorMesMap = {};
    contactos.forEach(r => {
      const fecha = r[cIdx['Fecha de Alta']];
      if (!fecha) return;
      const key = monthKey(fecha);
      if (!key) return;
      altasPorMesMap[key] = (altasPorMesMap[key] || 0) + 1;
    });

    // ---- Log: envíos por mes + KPIs de envíos ----
    const envMonthly = {}; // key -> { envios, entregados, rebotados, interesados, reuniones, ganados, perdidos }
    const industriaMonthly = {}; // rubro -> { key -> { ganados, perdidos } }
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
      if (resultado === 'Respondió - Interesado') m.interesados += 1;
      if (resultado === 'Reunión agendada') m.reuniones += 1;
      if (resultado === 'Cerrado - Ganado') m.ganados += 1;
      if (resultado === 'Cerrado - Perdido') m.perdidos += 1;

      const industria = empresaIndustria[empresa];
      if (industria && RUBROS.includes(industria)) {
        if (!industriaMonthly[industria][key]) industriaMonthly[industria][key] = { ganados: 0, perdidos: 0 };
        if (resultado === 'Cerrado - Ganado') industriaMonthly[industria][key].ganados += 1;
        if (resultado === 'Cerrado - Perdido') industriaMonthly[industria][key].perdidos += 1;
      }
    });

    // Oportunidades abiertas (aproximado, acumulado total, no por mes)
    const totalInteresados = log.filter(r => r[lIdx['Resultado']] === 'Respondió - Interesado').length;
    const totalReuniones = log.filter(r => r[lIdx['Resultado']] === 'Reunión agendada').length;
    const totalGanados = log.filter(r => r[lIdx['Resultado']] === 'Cerrado - Ganado').length;
    const totalPerdidos = log.filter(r => r[lIdx['Resultado']] === 'Cerrado - Perdido').length;
    const oportunidadesAbiertas = Math.max(0, totalInteresados + totalReuniones - totalGanados - totalPerdidos);

    // Build sorted list of all months present in either dataset
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
        const v = industriaMonthly[rubro][k] || { ganados: 0, perdidos: 0 };
        row[rubro] = v;
      });
      return row;
    });

    res.status(200).json({
      generadoAl: new Date().toISOString(),
      resumen: { total, conEmail, conTelefono, conLinkedIn },
      porRubro,
      porEstado,
      altasPorMes,
      enviosPorMes,
      cerradosPorIndustriaPorMes,
      oportunidadesAbiertas,
      meses: allMonthKeys.map(k => ({ key: k, label: monthLabel(k) })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al leer los datos.', detail: String(err && err.message || err) });
  }
};
