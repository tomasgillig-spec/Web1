const { computeAggregates } = require('../lib/aggregate');

module.exports = async (req, res) => {
  try {
    const data = await computeAggregates();
    res.status(200).json(data);
  } catch (err) {
    console.error(err);
    const status = err.isConfigError ? 500 : 500;
    res.status(status).json({ error: 'Error al leer los datos.', detail: String(err && err.message || err) });
  }
};
