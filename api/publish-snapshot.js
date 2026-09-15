import { put } from '@vercel/blob';
import { computeAggregates } from '../lib/aggregate.js';

const SNAPSHOT_PATH = 'uadel-snapshot.json';
const DIAS_ENTRE_ACTUALIZACIONES = 15;
const TOKEN = process.env.BLOB_READ_WRITE_TOKEN
  || process.env.BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido. Usar POST.' });
    return;
  }

  try {
    if (!TOKEN) {
      res.status(500).json({
        error: 'Falta el token de Vercel Blob (probé BLOB_READ_WRITE_TOKEN y ' +
               'BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN, ninguna existe). ' +
               'Revisar el nombre exacto en Settings → Environment Variables.',
      });
      return;
    }

    const data = await computeAggregates();
    const publicadoAl = new Date().toISOString();
    const proxima = new Date();
    proxima.setDate(proxima.getDate() + DIAS_ENTRE_ACTUALIZACIONES);

    const snapshot = {
      ...data,
      publicadoAl,
      proximaActualizacionSugerida: proxima.toISOString(),
    };

    await put(SNAPSHOT_PATH, JSON.stringify(snapshot), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      token: TOKEN,
    });

    res.status(200).json({ ok: true, publicadoAl, proximaActualizacionSugerida: snapshot.proximaActualizacionSugerida });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo publicar el snapshot.', detail: String(err && err.message || err) });
  }
}
