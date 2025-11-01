const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
// CAMBIO CLAVE PARA RENDER: Usa el puerto que Render asigna, o 3000 para local.
const PORT = process.env.PORT || 3000; 

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// NUEVO: Configurar Content Security Policy para Render
app.use((req, res, next) => {
    res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; img-src 'self' data:;"
    );
    next();
});

// NUEVO: Redirigir la ruta principal a la app del usuario
app.get('/', (req, res) => {
    res.redirect('/user/');
});

// --- CONFIGURACIÓN ---
// CAMBIA ESTO por tu número de soporte real
const SUPPORT_NUMBER = '+1-809-555-1234'; 
let adminClients = []; // Para las conexiones de notificación

// --- Funciones de ayuda para leer/escribir archivos ---
const readFile = async (file) => {
    try {
        const data = await fs.readFile(file, 'utf-8');
        if (!data) {
            console.log(`[AVISO] El archivo ${file} está vacío. Devolviendo array vacío.`);
            return [];
        }
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`[AVISO] El archivo ${file} no existe. Devolviendo array vacío.`);
            return []; 
        }
        if (error instanceof SyntaxError) {
            console.error(`[ERROR] Error de sintaxis en el archivo ${file}. Contenido: "${data}"`);
            return []; 
        }
        console.error(`[ERROR] Fallo crítico al leer el archivo ${file}:`, error);
        throw error;
    }
};
const writeFile = async (file, data) => {
    await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
};

// --- Rutas para el USUARIO ---
app.get('/api/support-info', (req, res) => {
    res.json({ supportNumber: SUPPORT_NUMBER });
});

// VERSIÓN DE PRUEBA - SIN LEER ARCHIVOS
// VERSIÓN FINAL - Usando readFile robusto
app.get('/api/plans', async (req, res) => {
    console.log("[DEBUG] Ruta /api/plans alcanzada. Iniciando...");
    try {
        console.log("[DEBUG] Llamando a readFile para PLANS_FILE...");
        const plans = await readFile(PLANS_FILE);
        console.log("[DEBUG] readFile para planes tuvo éxito. Datos recibidos:", plans);
        res.json(plans);
        console.log("[DEBUG] Respuesta JSON para planes enviada correctamente.");
    } catch (error) {
        console.error("[DEBUG] ERROR en la ruta /api/plans:", error);
        res.status(500).json({ message: 'Error al leer los planes.' });
    }
});

app.post('/api/transactions', async (req, res) => {
    try {
        const { planId, phoneNumber, paymentOption } = req.body;
        const transactions = await readFile(TRANSACTIONS_FILE);
        const newTransaction = {
            id: Date.now().toString(),
            planId,
            phoneNumber,
            paymentOption,
            status: 'PENDING_PAYMENT',
            createdAt: new Date().toISOString(),
            proofText: null,
        };
        transactions.push(newTransaction);
        await writeFile(TRANSACTIONS_FILE, transactions);
        notifyAdmins('NEW_TRANSACTION', newTransaction);
        res.status(201).json(newTransaction);
    } catch (error) {
        res.status(500).json({ message: 'Error al crear la transacción.' });
    }
});

app.post('/api/transactions/:id/proof', async (req, res) => {
    try {
        const { id } = req.params;
        const { proofText } = req.body;
        let transactions = await readFile(TRANSACTIONS_FILE);
        const transactionIndex = transactions.findIndex(t => t.id === id);
        if (transactionIndex === -1) return res.status(404).json({ message: 'Transacción no encontrada.' });
        transactions[transactionIndex].status = 'PENDING_VERIFICATION';
        transactions[transactionIndex].proofText = proofText;
        await writeFile(TRANSACTIONS_FILE, transactions);
        notifyAdmins('PROOF_SUBMITTED', transactions[transactionIndex]);
        res.json({ message: 'Comprobante recibido.' });
    } catch (error) {
        res.status(500).json({ message: 'Error al enviar el comprobante.' });
    }
});

// --- Rutas para el ADMINISTRADOR ---
const ADMIN_USER = 'gustacarmen91@gmail.com';
const ADMIN_PASS = 'Legolas*/21';

app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USER && password === ADMIN_PASS) {
        res.json({ success: true, message: 'Login exitoso.' });
    } else {
        res.status(401).json({ success: false, message: 'Credenciales incorrectas.' });
    }
});

// --- RUTA PARA LISTAR TRANSACCIONES (LA QUE FALTABA) ---
app.get('/api/admin/transactions', async (req, res) => {
    try {
        const transactions = await readFile(TRANSACTIONS_FILE);
        transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json(transactions);
    } catch (error) {
        res.status(500).json({ message: 'Error al leer las transacciones.' });
    }
});

app.post('/api/admin/transactions/:id/process', async (req, res) => {
    try {
        const { id } = req.params;
        let transactions = await readFile(TRANSACTIONS_FILE);
        const transactionIndex = transactions.findIndex(t => t.id === id);
        if (transactionIndex === -1) return res.status(404).json({ message: 'Transacción no encontrada.' });
        console.log(`>> SIMULACIÓN: Recargando ${transactions[transactionIndex].paymentOption.amount} ${transactions[transactionIndex].paymentOption.currency} al ${transactions[transactionIndex].phoneNumber}. ¡ÉXITO!`);
        transactions[transactionIndex].status = 'COMPLETED';
        transactions[transactionIndex].processedAt = new Date().toISOString();
        await writeFile(TRANSACTIONS_FILE, transactions);
        res.json({ message: 'Recarga procesada con éxito.' });
    } catch (error) {
        res.status(500).json({ message: 'Error al procesar la recarga.' });
    }
});

// Rutas CRUD para planes
app.get('/api/admin/plans', async (req, res) => {
    try {
        const plans = await readFile(PLANS_FILE);
        res.json(plans);
    } catch (error) {
        res.status(500).json({ message: 'Error al leer los planes.' });
    }
});

app.post('/api/admin/plans', async (req, res) => {
    try {
        const plans = await readFile(PLANS_FILE);
        const newPlan = { ...req.body, id: Date.now().toString() };
        plans.push(newPlan);
        await writeFile(PLANS_FILE, plans);
        res.status(201).json(newPlan);
    } catch (error) {
        res.status(500).json({ message: 'Error al crear el plan.' });
    }
});

app.put('/api/admin/plans/:id', async (req, res) => {
    try {
        const { id } = req.params;
        let plans = await readFile(PLANS_FILE);
        const planIndex = plans.findIndex(p => p.id === id);
        if (planIndex === -1) return res.status(404).json({ message: 'Plan no encontrado.' });
        plans[planIndex] = { ...plans[planIndex], ...req.body };
        await writeFile(PLANS_FILE, plans);
        res.json(plans[planIndex]);
    } catch (error) {
        res.status(500).json({ message: 'Error al actualizar el plan.' });
    }
});

app.delete('/api/admin/plans/:id', async (req, res) => {
    try {
        const { id } = req.params;
        let plans = await readFile(PLANS_FILE);
        const newPlans = plans.filter(p => p.id !== id);
        if (plans.length === newPlans.length) return res.status(404).json({ message: 'Plan no encontrado.' });
        await writeFile(PLANS_FILE, newPlans);
        res.json({ message: 'Plan eliminado.' });
    } catch (error) {
        res.status(500).json({ message: 'Error al eliminar el plan.' });
    }
});

// --- Sistema de Notificaciones SSE para Admin ---
app.get('/api/admin/notifications-stream', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });
    const clientId = Date.now();
    const newClient = { id: clientId, res };
    adminClients.push(newClient);
    console.log(`Admin client connected: ${clientId}`);
    newClient.res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Conectado a las notificaciones' })}\n\n`);
    req.on('close', () => {
        adminClients = adminClients.filter(client => client.id !== clientId);
        console.log(`Admin client disconnected: ${clientId}`);
    });
});

function notifyAdmins(eventType, data) {
    const message = JSON.stringify({ type: eventType, payload: data });
    adminClients.forEach(client => client.res.write(`data: ${message}\n\n`));
}

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`============================================`);
    console.log(`¡SERVIDOR INICIADO CORRECTAMENTE!`);
    console.log(`Escuchando en el puerto: ${PORT}`);
    console.log(`============================================`);
});