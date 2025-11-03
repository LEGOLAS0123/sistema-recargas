const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// --- CONFIGURACIÓN DE ARCHIVOS ESTÁTICOS Y RUTAS ---
app.use('/user', express.static(path.join(__dirname, 'public', 'user')));
app.use('/admin', express.static(path.join(__dirname, 'public', 'admin')));
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'user', 'index.html')); });
app.get('/admin', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html')); });

// --- CONFIGURACIÓN DE LA BASE DE DATOS ---
const db = new sqlite3.Database('./recargas.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) { console.error("Error al conectar con la base de datos:", err.message); }
    else { console.log('Conectado a la base de datos SQLite.'); initializeDatabase(); }
});

function initializeDatabase() {
    db.run(`CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, paymentOptions TEXT NOT NULL)`, (err) => { if (err) console.error("Error al crear la tabla 'plans':", err.message); });
    db.run(`CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY, phoneNumber TEXT NOT NULL, proofText TEXT, status TEXT NOT NULL, paymentOption TEXT NOT NULL, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP)`, (err) => { if (err) console.error("Error al crear la tabla 'transactions':", err.message); });
}

// --- ENDPOINTS DE LA API ---
app.get('/api/plans', (req, res) => { /* ... sin cambios ... */ });
app.get('/api/plans/:id', (req, res) => { /* ... sin cambios ... */ });
app.get('/api/admin/plans', (req, res) => { /* ... sin cambios ... */ });
app.post('/api/admin/plans', (req, res) => { /* ... sin cambios ... */ });
app.put('/api/admin/plans/:id', (req, res) => { /* ... sin cambios ... */ });
app.delete('/api/admin/plans/:id', (req, res) => { /* ... sin cambios ... */ });
app.post('/api/transactions', (req, res) => { /* ... sin cambios ... */ });
app.get('/api/admin/transactions', (req, res) => { /* ... sin cambios ... */ });
app.post('/api/admin/transactions/:id/process', (req, res) => { /* ... sin cambios ... */ });
app.post('/api/admin/login', (req, res) => { /* ... sin cambios ... */ });
app.get('/api/admin/notifications-stream', (req, res) => { /* ... sin cambios ... */ });

// Endpoint de Estadísticas para el Admin
app.get('/api/admin/stats', (req, res) => { /* ... sin cambios ... */ });

// --- NUEVO: Endpoint para Reiniciar Estadísticas ---
app.post('/api/admin/reset-stats', (req, res) => {
    const confirmation = req.body.confirmation || false;
    if (!confirmation) {
        return res.status(400).json({ success: false, message: 'La confirmación es requerida para esta acción.' });
    }

    // Primero, eliminamos todas las transacciones completadas
    db.run(`DELETE FROM transactions WHERE status = 'COMPLETED'`, (err) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error al eliminar transacciones completadas.' });
        }
        console.log('Todas las transacciones completadas han sido eliminadas.');

        // Luego, eliminamos todas las transacciones pendientes
        db.run(`DELETE FROM transactions WHERE status = 'PENDING_VERIFICATION'`, (err) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Error al eliminar transacciones pendientes.' });
            }
            console.log('Todas las transacciones pendientes han sido eliminadas.');

            // Finalmente, reiniciamos el contador de la tabla 'sqlite_sequence'
            db.run(`UPDATE sqlite_sequence SET seq = 0`, (err) => {
                if (err) {
                    return res.status(500).json({ success: false, message: 'Error al reiniciar el contador de la tabla.' });
                }
                console.log('Contador de la tabla de transacciones ha sido reiniciado.');
                res.json({ success: true, message: 'Todas las estadísticas han sido reiniciadas.' });
            });
        });
    });
});


// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});