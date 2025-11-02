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
app.get('/api/plans', (req, res) => {
    db.all("SELECT * FROM plans", [], (err, rows) => {
        if (err) { res.status(500).json({ message: "Error al obtener los planes." }); return; }
        const plans = rows.map(row => ({ ...row, paymentOptions: JSON.parse(row.paymentOptions) }));
        res.json(plans);
    });
});

app.get('/api/plans/:id', (req, res) => {
    const { id } = req.params;
    db.get("SELECT * FROM plans WHERE id = ?", [id], (err, row) => {
        if (err) { res.status(500).json({ message: "Error al obtener el plan." }); return; }
        if (row) { const plan = { ...row, paymentOptions: JSON.parse(row.paymentOptions) }; res.json(plan); }
        else { res.status(404).json({ message: "Plan no encontrado." }); }
    });
});

app.get('/api/admin/plans', (req, res) => {
    db.all("SELECT * FROM plans", [], (err, rows) => {
        if (err) { res.status(500).json({ message: "Error al obtener los planes." }); return; }
        const plans = rows.map(row => ({ ...row, paymentOptions: JSON.parse(row.paymentOptions) }));
        res.json(plans);
    });
});

app.post('/api/admin/plans', (req, res) => {
    const { name, description, paymentOptions } = req.body;
    const newPlan = { id: uuidv4(), name, description, paymentOptions: JSON.stringify(paymentOptions) };
    db.run(`INSERT INTO plans (id, name, description, paymentOptions) VALUES (?, ?, ?, ?)`,
        [newPlan.id, newPlan.name, newPlan.description, newPlan.paymentOptions],
        function(err) {
            if (err) { res.status(500).json({ message: "Error al crear el plan." }); return; }
            res.status(201).json({ ...newPlan, paymentOptions: JSON.parse(newPlan.paymentOptions) });
        }
    );
});

app.put('/api/admin/plans/:id', (req, res) => {
    const { id } = req.params;
    const { name, description, paymentOptions } = req.body;
    const updatedPaymentOptions = JSON.stringify(paymentOptions);
    db.run(`UPDATE plans SET name = ?, description = ?, paymentOptions = ? WHERE id = ?`,
        [name, description, updatedPaymentOptions, id],
        function(err) {
            if (err) { res.status(500).json({ message: "Error al actualizar el plan." }); return; }
            if (this.changes === 0) { res.status(404).json({ message: "Plan no encontrado." }); }
            else { res.json({ id, name, description, paymentOptions }); }
        }
    );
});

app.delete('/api/admin/plans/:id', (req, res) => {
    const { id } = req.params;
    db.run(`DELETE FROM plans WHERE id = ?`, [id], function(err) {
        if (err) { res.status(500).json({ message: "Error al eliminar el plan." }); return; }
        if (this.changes === 0) { res.status(404).json({ message: "Plan no encontrado." }); }
        else { res.json({ message: "Plan eliminado correctamente." }); }
    });
});

app.post('/api/transactions', (req, res) => {
    const { phoneNumber, proofText, paymentOption } = req.body;
    const newTransaction = { id: uuidv4(), phoneNumber, proofText, status: 'PENDING_VERIFICATION', paymentOption: JSON.stringify(paymentOption) };
    db.run(`INSERT INTO transactions (id, phoneNumber, proofText, status, paymentOption) VALUES (?, ?, ?, ?, ?)`,
        [newTransaction.id, newTransaction.phoneNumber, newTransaction.proofText, newTransaction.status, newTransaction.paymentOption],
        function(err) {
            if (err) { res.status(500).json({ message: "Error al crear la transacción." }); return; }
            res.status(201).json({ success: true, message: "Solicitud de recarga recibida.", transactionId: newTransaction.id });
        }
    );
});

app.get('/api/admin/transactions', (req, res) => {
    db.all("SELECT * FROM transactions ORDER BY createdAt DESC", [], (err, rows) => {
        if (err) { res.status(500).json({ message: "Error al obtener las transacciones." }); return; }
        const transactions = rows.map(row => ({ ...row, paymentOption: JSON.parse(row.paymentOption) }));
        res.json(transactions);
    });
});

app.post('/api/admin/transactions/:id/process', (req, res) => {
    const { id } = req.params;
    db.run(`UPDATE transactions SET status = 'COMPLETED' WHERE id = ?`, [id], function(err) {
        if (err) { res.status(500).json({ message: "Error al procesar la transacción." }); return; }
        if (this.changes === 0) { res.status(404).json({ message: "Transacción no encontrada." }); }
        else { res.json({ message: "Recarga procesada y marcada como completada." }); }
    });
});

app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    const ADMIN_USER = process.env.ADMIN_USER || 'admin';
    const ADMIN_PASS = process.env.ADMIN_PASS || 'password';
    if (username === ADMIN_USER && password === ADMIN_PASS) { res.json({ success: true }); }
    else { res.status(401).json({ success: false, message: 'Credenciales incorrectas.' }); }
});

app.get('/api/admin/notifications-stream', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    res.write('data: {"type": "connected"}\n\n');
    const checkInterval = setInterval(() => {
        db.get("SELECT id, phoneNumber, status, paymentOption FROM transactions WHERE status = 'PENDING_VERIFICATION' ORDER BY createdAt DESC LIMIT 1", [], (err, row) => {
            if (row) { res.write(`data: ${JSON.stringify({ type: 'new_transaction', payload: row })}\n\n`); }
        });
    }, 5000);
    req.on('close', () => clearInterval(checkInterval));
});

// Endpoint de Estadísticas para el Admin
app.get('/api/admin/stats', (req, res) => {
    const stats = { totalRevenue: 0, totalTransactions: 0, pendingTransactions: 0, revenueByMethod: {} };
    db.all("SELECT paymentOption FROM transactions WHERE status = 'COMPLETED'", [], (err, rows) => {
        if (err) { return res.status(500).json({ message: "Error al calcular estadísticas de ingresos." }); }
        rows.forEach(row => {
            const option = JSON.parse(row.paymentOption);
            const amount = parseFloat(option.amount);
            const method = option.method;
            stats.totalRevenue += amount;
            stats.totalTransactions++;
            if (stats.revenueByMethod[method]) { stats.revenueByMethod[method] += amount; }
            else { stats.revenueByMethod[method] = amount; }
        });
        db.get("SELECT COUNT(*) as count FROM transactions WHERE status = 'PENDING_VERIFICATION'", [], (err, row) => {
            if (err) { return res.status(500).json({ message: "Error al calcular transacciones pendientes." }); }
            stats.pendingTransactions = row.count;
            res.json(stats);
        });
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});