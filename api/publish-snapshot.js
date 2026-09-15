const { put } = require('@vercel/blob');
const { computeAggregates } = require('../lib/aggregate');

const SNAPSHOT_PATH = 'uadel-snapshot.json';
const DIAS_ENTRE_ACTUALIZACIONES = 15;
const STORE_ID = process.env.BLOB_READ_WRITE_TOKEN_STORE_ID;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido. Usar POST.' });
    return;
  }

  try {
    if (!STORE_ID) {
      res.status(500).json({
        error: 'Falta configurar Vercel Blob (variable BLOB_READ_WRITE_TOKEN_STORE_ID). ' +
               'Ver README.md, sección de snapshot para el cliente.',
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
      storeId: STORE_ID,
    });

    res.status(200).json({ ok: true, publicadoAl, proximaActualizacionSugerida: snapshot.proximaActualizacionSugerida });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo publicar el snapshot.', detail: String(err && err.message || err) });
  }
};
