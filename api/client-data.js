const { head } = require('@vercel/blob');

const SNAPSHOT_PATH = 'uadel-snapshot.json';
const STORE_ID = process.env.BLOB_READ_WRITE_TOKEN_STORE_ID;

module.exports = async (req, res) => {
  try {
    if (!STORE_ID) {
      res.status(500).json({ error: 'Falta configurar Vercel Blob (variable BLOB_READ_WRITE_TOKEN_STORE_ID).' });
      return;
    }

    let meta;
    try {
      meta = await head(SNAPSHOT_PATH, { storeId: STORE_ID });
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
};
