const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- Archivos estáticos ---
app.use('/user', express.static(path.join(__dirname, 'public', 'user')));
app.use('/admin', express.static(path.join(__dirname, 'public', 'admin')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'user', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html')));

// --- Configurar PostgreSQL ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Inicializar tablas
(async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        paymentOptions TEXT NOT NULL
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        phoneNumber TEXT NOT NULL,
        proofText TEXT,
        status TEXT NOT NULL,
        paymentOption TEXT NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Tablas PostgreSQL listas');
  } catch (err) {
    console.error('Error inicializando tablas:', err.message);
  } finally {
    client.release();
  }
})();

// --- ENDPOINTS DE PLANES ---

// Obtener todos los planes (usuario)
app.get('/api/plans', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM plans ORDER BY name ASC');
    const plans = rows.map(r => {
      let paymentOptions = [];
      try { paymentOptions = JSON.parse(r.paymentOptions); } catch { paymentOptions = []; }
      return { ...r, paymentOptions };
    });
    res.json(plans);
  } catch (err) {
    console.error('Error obteniendo planes:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Obtener plan por ID
app.get('/api/plans/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT * FROM plans WHERE id=$1', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Plan no encontrado' });
    let paymentOptions = [];
    try { paymentOptions = JSON.parse(rows[0].paymentOptions); } catch { paymentOptions = []; }
    res.json({ ...rows[0], paymentOptions });
  } catch (err) {
    console.error('Error obteniendo plan:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Admin: obtener todos los planes
app.get('/api/admin/plans', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM plans ORDER BY name ASC');
    const plans = rows.map(r => {
      let paymentOptions = [];
      try { paymentOptions = JSON.parse(r.paymentOptions); } catch { paymentOptions = []; }
      return { ...r, paymentOptions };
    });
    res.json(plans);
  } catch (err) {
    console.error('Error obteniendo planes admin:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Admin: crear plan
app.post('/api/admin/plans', async (req, res) => {
  const { name, description, paymentOptions } = req.body;
  if (!name || !paymentOptions) return res.status(400).json({ error: 'Datos incompletos' });
  try {
    const id = uuidv4();
    await pool.query(
      'INSERT INTO plans (id, name, description, paymentOptions) VALUES ($1,$2,$3,$4)',
      [id, name, description || '', JSON.stringify(paymentOptions)]
    );
    res.json({ success: true, id });
  } catch (err) {
    console.error('Error creando plan:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: actualizar plan
app.put('/api/admin/plans/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, paymentOptions } = req.body;
  try {
    const result = await pool.query(
      'UPDATE plans SET name=$1, description=$2, paymentOptions=$3 WHERE id=$4',
      [name, description || '', JSON.stringify(paymentOptions), id]
    );
    res.json({ success: result.rowCount > 0 });
  } catch (err) {
    console.error('Error actualizando plan:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: eliminar plan
app.delete('/api/admin/plans/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM plans WHERE id=$1', [id]);
    res.json({ success: result.rowCount > 0 });
  } catch (err) {
    console.error('Error eliminando plan:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- ENDPOINTS DE TRANSACCIONES ---

// Crear transacción (usuario)
app.post('/api/transactions', async (req, res) => {
  const { phoneNumber, proofText, paymentOption } = req.body;
  if (!phoneNumber || !paymentOption) return res.status(400).json({ error: 'Datos incompletos' });
  try {
    const id = uuidv4();
    await pool.query(
      'INSERT INTO transactions (id, phoneNumber, proofText, status, paymentOption) VALUES ($1,$2,$3,$4,$5)',
      [id, phoneNumber, proofText || '', 'PENDING_VERIFICATION', paymentOption]
    );
    res.json({ success: true, id });
  } catch (err) {
    console.error('Error creando transacción:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: ver todas las transacciones
app.get('/api/admin/transactions', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM transactions ORDER BY createdAt DESC');
    res.json(rows);
  } catch (err) {
    console.error('Error obteniendo transacciones:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Admin: procesar transacción
app.post('/api/admin/transactions/:id/process', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!['COMPLETED', 'REJECTED'].includes(status)) return res.status(400).json({ error: 'Estado inválido' });
  try {
    const result = await pool.query('UPDATE transactions SET status=$1 WHERE id=$2', [status, id]);
    res.json({ success: result.rowCount > 0 });
  } catch (err) {
    console.error('Error procesando transacción:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- ENDPOINTS ADMIN AUXILIARES ---

// Login admin simple
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === '1234') res.json({ success: true });
  else res.status(401).json({ success: false, message: 'Credenciales inválidas' });
});

// Estadísticas
app.get('/api/admin/stats', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT status, COUNT(*) AS count FROM transactions GROUP BY status');
    res.json(rows);
  } catch (err) {
    console.error('Error obteniendo stats:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Reset estadísticas
app.post('/api/admin/reset-stats', async (req, res) => {
  const { confirmation } = req.body;
  if (!confirmation) return res.status(400).json({ success: false, message: 'Confirmación requerida' });
  try {
    await pool.query('DELETE FROM transactions');
    res.json({ success: true, message: 'Todas las estadísticas reiniciadas' });
  } catch (err) {
    console.error('Error reiniciando stats:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- SSE: notifications-stream básico ---
app.get('/api/admin/notifications-stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });

  const sendNotification = (msg) => res.write(`data: ${JSON.stringify(msg)}\n\n`);

  // Enviar notificación de ejemplo cada 10 seg
  const interval = setInterval(() => {
    sendNotification({ message: 'Ping de notificación', timestamp: new Date() });
  }, 10000);

  req.on('close', () => clearInterval(interval));
});

// --- Iniciar servidor ---
app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
