import { computeAggregates } from '../lib/aggregate.js';

export default async function handler(req, res) {
  try {
    const data = await computeAggregates();
    res.status(200).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al leer los datos.', detail: String(err && err.message || err) });
  }
}
