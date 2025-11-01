document.addEventListener('DOMContentLoaded', () => {
    // IMPORTANTE: Reemplaza esta URL con la de tu aplicación en Render
    const API_URL = 'https://sistema-recargas.onrender.com/api'; 
    const mainContent = document.getElementById('main-content');
    let eventSource;

    if (localStorage.getItem('adminLoggedIn')) {
        showDashboard();
    } else {
        showLogin();
    }

    function showLogin() {
        mainContent.innerHTML = `
            <div class="form-container">
                <h2>Iniciar Sesión</h2>
                <form id="login-form">
                    <div class="form-group"><label for="username">Usuario</label><input type="email" id="username" required></div>
                    <div class="form-group"><label for="password">Contraseña</label><input type="password" id="password" required></div>
                    <button type="submit">Entrar</button>
                </form>
                <div id="login-message"></div>
            </div>
        `;
        document.getElementById('login-form').addEventListener('submit', handleLogin);
    }

    function handleLogin(e) {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const messageDiv = document.getElementById('login-message');
        fetch(`${API_URL}/admin/login`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) { localStorage.setItem('adminLoggedIn', 'true'); showDashboard(); }
            else { messageDiv.textContent = data.message; messageDiv.className = 'message error'; }
        })
        .catch(error => { messageDiv.textContent = 'Error de conexión.'; messageDiv.className = 'message error'; });
    }

    function showDashboard() {
        document.getElementById('btn-logout').style.display = 'block';
        mainContent.innerHTML = `
            <nav>
                <button id="nav-transactions" class="active">Transacciones</button>
                <button id="nav-plans">Gestionar Planes</button>
            </nav>
            <div id="dashboard-content"></div>
        `;
        
        if ('Notification' in window) {
            if (Notification.permission === 'default') {
                Notification.requestPermission().then(p => { if (p === 'granted') startNotifications(); });
            } else if (Notification.permission === 'granted') { startNotifications(); }
        }

        document.getElementById('nav-transactions').addEventListener('click', () => {
            document.getElementById('notification-badge').style.display = 'none';
            showTransactionsView();
        });
        document.getElementById('nav-plans').addEventListener('click', showPlansView);
        document.getElementById('btn-logout').addEventListener('click', () => {
            if(eventSource) eventSource.close();
            localStorage.removeItem('adminLoggedIn');
            location.reload();
        });
        showTransactionsView();
    }

    function startNotifications() {
        if (eventSource) eventSource.close();
        eventSource = new EventSource(`${API_URL}/admin/notifications-stream`);
        eventSource.onmessage = function(event) {
            const notification = JSON.parse(event.data);
            if (Notification.permission === 'granted') {
                new Notification('Nueva Actividad', {
                    body: notification.payload.status === 'PENDING_PAYMENT' 
                        ? `Nueva solicitud de ${notification.payload.paymentOption.amount} ${notification.payload.paymentOption.currency}` 
                        : `Comprobante recibido para ${notification.payload.phoneNumber}`,
                    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📱</text></svg>'
                });
            }
            document.getElementById('notification-badge').style.display = 'inline-block';
            if (document.getElementById('nav-transactions').classList.contains('active')) {
                showTransactionsView();
            }
        };
        eventSource.onerror = function(err) { console.error("Error en EventSource:", err); eventSource.close(); setTimeout(startNotifications, 5000); };
    }

    function showTransactionsView() {
        setActiveNav('nav-transactions');
        const content = document.getElementById('dashboard-content');
        content.innerHTML = '<h2>Transacciones Pendientes</h2><p>Cargando...</p>';
        fetch(`${API_URL}/admin/transactions`).then(res => res.json()).then(transactions => {
            const pending = transactions.filter(t => t.status === 'PENDING_VERIFICATION');
            renderTransactionsTable(pending, 'pending');
        });
    }

    function renderTransactionsTable(transactions, type) {
        const content = document.getElementById('dashboard-content');
        if (transactions.length === 0) { content.innerHTML = `<h2>Transacciones ${type === 'pending' ? 'Pendientes' : 'Todas'}</h2><p>No hay transacciones.</p>`; return; }
        let html = `<h2>Transacciones ${type === 'pending' ? 'Pendientes' : 'Todas'}</h2>`;
        html += `<table><thead><tr><th>ID</th><th>Teléfono</th><th>Monto</th><th>Comprobante</th><th>Estado</th><th>Acción</th></tr></thead><tbody>`;
        transactions.forEach(t => {
            html += `<tr>
                <td>${t.id}</td><td>${t.phoneNumber}</td><td>${t.paymentOption.amount} ${t.paymentOption.currency}</td>
                <td style="max-width:200px; word-wrap:break-word;">${t.proofText || 'N/A'}</td>
                <td class="status-${t.status.toLowerCase()}">${t.status}</td>
                <td>${t.status === 'PENDING_VERIFICATION' ? `<button class="btn-action btn-process" data-id="${t.id}">Procesar</button>` : '-'}</td>
            </tr>`;
        });
        html += `</tbody></table>`;
        content.innerHTML = html;
        document.querySelectorAll('.btn-process').forEach(btn => {
            btn.addEventListener('click', () => handleProcessTransaction(btn.dataset.id));
        });
    }

    function handleProcessTransaction(id) {
        if (!confirm('¿Has verificado el pago y quieres procesar esta recarga?')) return;
        fetch(`${API_URL}/admin/transactions/${id}/process`, { method: 'POST' })
            .then(res => res.json()).then(data => { alert(data.message); showTransactionsView(); })
            .catch(error => { console.error('Error al procesar:', error); alert('Error al procesar.'); });
    }

    function showPlansView() {
        setActiveNav('nav-plans');
        const content = document.getElementById('dashboard-content');
        content.innerHTML = `<h2>Gestionar Planes</h2><button id="btn-add-plan">+ Añadir Nuevo Plan</button><div id="plans-list-container"><p>Cargando...</p></div>`;
        document.getElementById('btn-add-plan').addEventListener('click', () => showPlanForm());
        loadPlansList();
    }

    function loadPlansList() {
        fetch(`${API_URL}/admin/plans`).then(res => res.json()).then(plans => {
            const container = document.getElementById('plans-list-container');
            container.innerHTML = ''; // Limpiar contenido anterior
            if (plans.length === 0) { container.innerHTML = '<p>No hay planes creados.</p>'; return; }
            let listElement = document.createElement('ul');
            listElement.className = 'dynamic-list';
            plans.forEach(plan => {
                let listItem = document.createElement('li');
                let infoDiv = document.createElement('div');
                infoDiv.innerHTML = `<strong>${plan.name}</strong> - ${plan.description || 'Sin descripción'}<br><small>${plan.paymentOptions.length} método(s) de pago</small>`;
                let actionsDiv = document.createElement('div');
                let editButton = document.createElement('button');
                editButton.className = 'btn-action';
                editButton.textContent = 'Editar';
                editButton.dataset.planId = plan.id;
                editButton.addEventListener('click', () => showPlanForm(plan.id));
                let deleteButton = document.createElement('button');
                deleteButton.className = 'btn-action btn-delete';
                deleteButton.textContent = 'Eliminar';
                deleteButton.dataset.planId = plan.id;
                deleteButton.addEventListener('click', () => handleDeletePlan(plan.id));
                actionsDiv.appendChild(editButton);
                actionsDiv.appendChild(deleteButton);
                listItem.appendChild(infoDiv);
                listItem.appendChild(actionsDiv);
                listElement.appendChild(listItem);
            });
            container.appendChild(listElement);
        });
    }
    
    function showPlanForm(planId = null) {
        const isEditing = planId !== null;
        const content = document.getElementById('dashboard-content');
        
        content.innerHTML = `
            <div class="form-container">
                <h2>${isEditing ? 'Editar Plan' : 'Añadir Nuevo Plan'}</h2>
                <form id="plan-form">
                    <input type="hidden" id="plan-id" value="${planId || ''}">
                    <div class="form-group">
                        <label for="plan-name">Nombre del Plan</label>
                        <input type="text" id="plan-name" required>
                    </div>
                    <div class="form-group">
                        <label for="plan-description">Descripción (Opcional)</label>
                        <textarea id="plan-description"></textarea>
                    </div>
                    
                    <h3>Opciones de Pago</h3>
                    <div id="payment-options-container"></div>
                    <button type="button" id="btn-add-payment-option">+ Añadir Método de Pago</button>
                    
                    <div style="margin-top: 20px;">
                        <button type="submit" class="btn-action">${isEditing ? 'Guardar Cambios' : 'Crear Plan'}</button>
                        <button type="button" onclick="showPlansView()" style="background:var(--secondary-color);">Cancelar</button>
                    </div>
                </form>
            </div>
        `;

        document.getElementById('plan-form').addEventListener('submit', handlePlanSubmit);
        document.getElementById('btn-add-payment-option').addEventListener('click', addPaymentOptionField);

        if (isEditing) {
            fetch(`${API_URL}/admin/plans`).then(res => res.json()).then(plans => {
                const plan = plans.find(p => p.id === planId);
                if (plan) {
                    document.getElementById('plan-name').value = plan.name;
                    document.getElementById('plan-description').value = plan.description || '';
                    plan.paymentOptions.forEach(option => addPaymentOptionField(option));
                }
            });
        } else {
            addPaymentOptionField();
        }
    }

    function addPaymentOptionField(optionData = {}) {
        const container = document.getElementById('payment-options-container');
        const optionDiv = document.createElement('div');
        optionDiv.className = 'payment-option-form';
        
        optionDiv.innerHTML = `
            <hr>
            <div class="form-group">
                <label>Método de Pago</label>
                <select name="payment-method" class="payment-method" required>
                    <option value="QVPay" ${optionData.method === 'QVPay' ? 'selected' : ''}>QVPay</option>
                    <option value="PayPal" ${optionData.method === 'PayPal' ? 'selected' : ''}>PayPal</option>
                    <option value="Transferencia Bancaria" ${optionData.method === 'Transferencia Bancaria' ? 'selected' : ''}>Transferencia Bancaria</option>
                    <option value="Zelle" ${optionData.method === 'Zelle' ? 'selected' : ''}>Zelle</option>
                    <option value="USDT" ${optionData.method === 'USDT' ? 'selected' : ''}>USDT (BEP-20)</option>
                </select>
            </div>
            <div class="form-group">
                <label>Monto</label>
                <input type="number" name="payment-amount" class="payment-amount" value="${optionData.amount || ''}" required>
            </div>
            <div class="form-group">
                <label>Moneda</label>
                <select name="payment-currency" class="payment-currency" required>
                    <option value="CUP" ${optionData.currency === 'CUP' ? 'selected' : ''}>CUP</option>
                    <option value="USD" ${optionData.currency === 'USD' ? 'selected' : ''}>USD</option>
                    <option value="USDT" ${optionData.currency === 'USDT' ? 'selected' : ''}>USDT</option>
                </select>
            </div>
            <div class="form-group">
                <label>Enlace de Pago (si aplica)</label>
                <input type="url" name="payment-link" class="payment-link" value="${optionData.link || ''}">
            </div>

            <!-- CAMPO UNIVERSAL PARA INSTRUCCIONES DE DESTINO -->
            <div class="form-group">
                <label>Instrucciones de Destino</label>
                <textarea name="payment-destination" class="payment-destination" rows="3" placeholder="Ej: Número de cuenta: 123456789. Titular: Tu Nombre. Banco: Tu Banco.">${optionData.destinationDetails || ''}</textarea>
            </div>

            <button type="button" class="btn-action btn-delete" onclick="this.parentElement.remove()">Eliminar Opción</button>
        `;
        container.appendChild(optionDiv);
    }

    function handlePlanSubmit(e) {
        e.preventDefault();
        const planId = document.getElementById('plan-id').value;
        const isEditing = planId !== '';
        
        const planData = {
            name: document.getElementById('plan-name').value,
            description: document.getElementById('plan-description').value,
            paymentOptions: []
        };

        const paymentOptionsForms = document.querySelectorAll('.payment-option-form');
        paymentOptionsForms.forEach(form => {
            const option = {
                method: form.querySelector('.payment-method').value,
                amount: parseFloat(form.querySelector('.payment-amount').value),
                currency: form.querySelector('.payment-currency').value,
                link: form.querySelector('.payment-link').value,
                destinationDetails: form.querySelector('.payment-destination').value
            };
            planData.paymentOptions.push(option);
        });

        const url = isEditing ? `${API_URL}/admin/plans/${planId}` : `${API_URL}/admin/plans`;
        const method = isEditing ? 'PUT' : 'POST';

        fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(planData)
        })
        .then(res => res.json())
        .then(data => {
            alert(isEditing ? 'Plan actualizado con éxito.' : 'Plan creado con éxito.');
            loadPlansList();
        })
        .catch(error => {
            console.error('Error al guardar el plan:', error);
            alert('Hubo un error al guardar el plan.');
        });
    }

    function handleDeletePlan(planId) {
        if (!confirm('¿Estás seguro de que quieres eliminar este plan?')) return;
        fetch(`${API_URL}/admin/plans/${planId}`, { method: 'DELETE' })
            .then(res => res.json()).then(data => { alert(data.message); loadPlansList(); });
    }

    function setActiveNav(activeId) {
        document.querySelectorAll('nav button').forEach(btn => btn.classList.remove('active'));
        document.getElementById(activeId).classList.add('active');
    }
});