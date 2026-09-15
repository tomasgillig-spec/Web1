import { head } from '@vercel/blob';

const SNAPSHOT_PATH = 'uadel-snapshot.json';
const TOKEN = process.env.BLOB_READ_WRITE_TOKEN
  || process.env.BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN;

export default async function handler(req, res) {
  try {
    if (!TOKEN) {
      res.status(500).json({
        error: 'Falta el token de Vercel Blob (probé BLOB_READ_WRITE_TOKEN y ' +
               'BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN, ninguna existe).',
      });
      return;
    }

    let meta;
    try {
      meta = await head(SNAPSHOT_PATH, { token: TOKEN });
    } catch (e) {
      res.status(404).json({
        error: 'Todavía no se publicó ningún snapshot. Desde el tablero interno, ' +
               'apretar "Publicar snapshot ahora".',
      });
      return;
    }

    const blobResp = await fetch(meta.url);
    if (!blobResp.ok) {
      res.status(502).json({ error: 'No se pudo leer el snapshot guardado.' });
      return;
    }
    const snapshot = await blobResp.json();
    res.status(200).json(snapshot);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al leer el snapshot.', detail: String(err && err.message || err) });
  }
}
