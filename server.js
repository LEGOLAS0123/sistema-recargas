const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Archivos estáticos
app.use('/user', express.static(path.join(__dirname, 'public', 'user')));
app.use('/admin', express.static(path.join(__dirname, 'public', 'admin')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'user', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html')));

// --- Configurar PostgreSQL ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // necesario en Render
});

// Inicializar tablas si no existen
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

// --- Endpoints de la API ---

// Obtener todos los planes
app.get('/api/plans', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM plans');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener un plan por ID
app.get('/api/plans/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT * FROM plans WHERE id=$1', [id]);
    res.json(rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Obtener todos los planes
app.get('/api/admin/plans', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM plans');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Crear un plan
app.post('/api/admin/plans', async (req, res) => {
  const { name, description, paymentOptions } = req.body;
  if (!name || !paymentOptions) return res.status(400).json({ error: 'Datos incompletos' });

  const id = uuidv4();
  try {
    await pool.query(
      'INSERT INTO plans (id, name, description, paymentOptions) VALUES ($1, $2, $3, $4)',
      [id, name, description, paymentOptions]
    );
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Editar un plan
app.put('/api/admin/plans/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, paymentOptions } = req.body;
  try {
    const result = await pool.query(
      'UPDATE plans SET name=$1, description=$2, paymentOptions=$3 WHERE id=$4',
      [name, description, paymentOptions, id]
    );
    res.json({ success: result.rowCount > 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Eliminar un plan
app.delete('/api/admin/plans/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM plans WHERE id=$1', [id]);
    res.json({ success: result.rowCount > 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crear transacción (usuario)
app.post('/api/transactions', async (req, res) => {
  const { phoneNumber, proofText, paymentOption } = req.body;
  if (!phoneNumber || !paymentOption) return res.status(400).json({ error: 'Datos incompletos' });

  const id = uuidv4();
  try {
    await pool.query(
      'INSERT INTO transactions (id, phoneNumber, proofText, status, paymentOption) VALUES ($1,$2,$3,$4,$5)',
      [id, phoneNumber, proofText || '', 'PENDING_VERIFICATION', paymentOption]
    );
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Ver todas las transacciones
app.get('/api/admin/transactions', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM transactions ORDER BY createdAt DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Procesar transacción
app.post('/api/admin/transactions/:id/process', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!['COMPLETED', 'REJECTED'].includes(status)) return res.status(400).json({ error: 'Estado inválido' });

  try {
    const result = await pool.query('UPDATE transactions SET status=$1 WHERE id=$2', [status, id]);
    res.json({ success: result.rowCount > 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Login simple
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === '1234') res.json({ success: true });
  else res.status(401).json({ success: false, message: 'Credenciales inválidas' });
});

// Admin: Estadísticas
app.get('/api/admin/stats', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT status, COUNT(*) AS count FROM transactions GROUP BY status');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Reiniciar estadísticas
app.post('/api/admin/reset-stats', async (req, res) => {
  const { confirmation } = req.body;
  if (!confirmation) return res.status(400).json({ success: false, message: 'Confirmación requerida' });

  try {
    await pool.query('DELETE FROM transactions');
    res.json({ success: true, message: 'Todas las estadísticas reiniciadas' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- Iniciar servidor ---
app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
