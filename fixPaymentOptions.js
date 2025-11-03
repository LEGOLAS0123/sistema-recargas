const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // necesario en Render
});

(async () => {
  const client = await pool.connect();
  try {
    console.log('Buscando planes con paymentOptions inválido...');

    // Actualiza todos los paymentOptions nulos, vacíos o 'undefined'
    const result = await client.query(`
      UPDATE plans
      SET paymentOptions = '[]'
      WHERE paymentOptions IS NULL OR paymentOptions = '' OR paymentOptions = 'undefined'
      RETURNING id, name;
    `);

    if (result.rowCount === 0) {
      console.log('No se encontraron paymentOptions inválidos.');
    } else {
      console.log(`Se limpiaron ${result.rowCount} planes:`);
      result.rows.forEach(r => console.log(`- ${r.id} | ${r.name}`));
    }

  } catch (err) {
    console.error('Error limpiando paymentOptions:', err.message);
  } finally {
    client.release();
    pool.end();
  }
})();
