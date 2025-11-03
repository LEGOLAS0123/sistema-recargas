const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { Pool } = require('pg'); // Usamos PostgreSQL

require('dotenv').config(); // Cargar variables de entorno

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// --- CONFIGURACIÓN DE ARCHIVOS ESTÁTICOS Y RUTAS ---
app.use('/user', express.static(path.join(__dirname, 'public', 'user')));
app.use('/admin', express.static(path.join(__dirname, 'public', 'admin')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'user', 'index.html'));
});
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

// --- CONFIGURACIÓN DE LA BASE DE DATOS ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Función para inicializar la base de datos
async function initializeDatabase() {
    const client = await pool.connect();
    try {
        // Crear tablas si no existen
        await client.query(`
            CREATE TABLE IF NOT EXISTS plans (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                paymentOptions TEXT NOT NULL
            )
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS transactions (
                id TEXT PRIMARY KEY,
                phoneNumber TEXT NOT NULL,
                proofText TEXT,
                status TEXT NOT NULL,
                paymentOption TEXT NOT NULL,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // --- LIMPIEZA AUTOMÁTICA DE paymentOptions ---
        const result = await client.query(`
            UPDATE plans
            SET paymentOptions = '[]'
            WHERE paymentOptions IS NULL OR paymentOptions = '' OR paymentOptions = 'undefined'
            RETURNING id, name
        `);

        if (result.rowCount > 0) {
            console.log(`Se limpiaron ${result.rowCount} planes con paymentOptions inválidos:`);
            result.rows.forEach(r => console.log(`- ${r.id} | ${r.name}`));
        } else {
            console.log('No se encontraron paymentOptions inválidos.');
        }

    } catch (err) {
        console.error('Error inicializando la base de datos:', err.message);
    } finally {
        client.release();
    }
}

// Inicializar DB al arrancar la app
initializeDatabase().catch(console.error);

// --- ENDPOINTS DE LA API ---
// Aquí agregas tus endpoints tal como los tenías antes
// Ejemplo de endpoint /api/plans
app.get('/api/plans', async (req, res) => {
    const client = await pool.connect();
    try {
        const { rows } = await client.query('SELECT * FROM plans');
        const plans = rows.map(r => {
            let paymentOptions = [];
            try {
                if (r.paymentOptions) paymentOptions = JSON.parse(r.paymentOptions);
            } catch {
                paymentOptions = [];
            }
            return { ...r, paymentOptions };
        });
        res.json(plans);
    } catch (err) {
        console.error('Error obteniendo planes:', err.message);
        res.status(500).json({ error: 'Ocurrió un error al obtener los planes' });
    } finally {
        client.release();
    }
});

// Aquí irían tus demás endpoints admin, transactions, etc.

// --- INICIAR SERVIDOR ---
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
