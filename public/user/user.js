document.addEventListener('DOMContentLoaded', () => {
    // IMPORTANTE: Reemplaza esta URL con la de tu aplicación en Render
    const API_URL = 'https://sistema-recargas.onrender.com/api'; 
    const mainContent = document.getElementById('main-content');

    let selectedPlan = null;
    let currentTransaction = null;

    fetchSupportInfo();
    loadPlansView();

    function fetchSupportInfo() {
        fetch(`${API_URL}/support-info`)
            .then(res => res.json())
            .then(data => {
                const supportLink = document.getElementById('support-link');
                if (supportLink) {
                    supportLink.href = `tel:${data.supportNumber}`;
                }
            })
            .catch(error => console.error('No se pudo cargar el número de soporte:', error));
    }

    function loadPlansView() {
        mainContent.innerHTML = '<div id="loading-message">Cargando planes...</div>';
        fetch(`${API_URL}/plans`)
            .then(res => res.json())
            .then(plans => {
                if (plans.length === 0) { mainContent.innerHTML = '<p>No hay planes disponibles.</p>'; return; }
                renderPlans(plans);
            })
            .catch(error => {
                console.error('Error al cargar planes:', error);
                mainContent.innerHTML = '<p class="message error">Error al cargar los planes.</p>';
            });
    }

    function renderPlans(plans) {
        mainContent.innerHTML = '<h2>Selecciona un Plan</h2>';
        const container = document.createElement('div');
        plans.forEach(plan => {
            const card = document.createElement('div');
            card.className = 'plan-card';
            card.innerHTML = `
                <h3>${plan.name}</h3>
                <p>${plan.description || ''}</p>
                <button class="btn-select-plan" data-plan='${JSON.stringify(plan)}'>Ver Opciones de Pago</button>
            `;
            container.appendChild(card);
        });
        mainContent.appendChild(container);
        document.querySelectorAll('.btn-select-plan').forEach(btn => {
            btn.addEventListener('click', () => {
                selectedPlan = JSON.parse(btn.dataset.plan);
                loadPaymentMethodsView();
            });
        });
    }

    function loadPaymentMethodsView() {
        mainContent.innerHTML = `
            <h2>Opciones de Pago</h2>
            <p>Plan: <strong>${selectedPlan.name}</strong></p>
            <div id="methods-container"></div>
            <button id="btn-back-to-plans">Volver</button>
        `;
        const container = document.getElementById('methods-container');
        selectedPlan.paymentOptions.forEach(option => {
            const card = document.createElement('div');
            card.className = 'payment-method-card';
            let icon = option.method.includes('QVPay') ? '💳' : option.method.includes('PayPal') ? '🌐' : '🏦';
            card.innerHTML = `
                <div class="method-info">
                    <span class="method-icon">${icon}</span>
                    <div>
                        <h4>${option.method}</h4>
                        <p class="method-price">${option.amount} ${option.currency}</p>
                    </div>
                </div>
                <button class="btn-select-method" data-method='${JSON.stringify(option)}'>Pagar con este método</button>
            `;
            container.appendChild(card);
        });
        document.querySelectorAll('.btn-select-method').forEach(btn => {
            btn.addEventListener('click', () => {
                const paymentOption = JSON.parse(btn.dataset.method);
                showInstructionsView(paymentOption);
            });
        });
        document.getElementById('btn-back-to-plans').addEventListener('click', loadPlansView);
    }

    function showInstructionsView(paymentOption) {
    let specificInstructions = '';

    // Añadir instrucciones específicas si existen
    if (paymentOption.method === 'Transferencia Bancaria' && paymentOption.cardNumber) {
        specificInstructions = `<p><strong>Número de Tarjeta a transferir:</strong> ${paymentOption.cardNumber}</p>`;
    } else if (paymentOption.method === 'USDT' && paymentOption.walletAddress) {
        specificInstructions = `<p><strong>Dirección de Wallet (TRC-20):</strong> <code>${paymentOption.walletAddress}</code></p>`;
    }

    mainContent.innerHTML = `
        <h2>Instrucciones de Pago</h2>
        <p><strong>Método:</strong> ${paymentOption.method}</p>
        <p><strong>Monto:</strong> ${paymentOption.amount} ${paymentOption.currency}</p>
        ${paymentOption.link ? `<p><strong>Enlace:</strong> <a href="${paymentOption.link}" target="_blank">${paymentOption.link}</a></p>` : ''}
        ${specificInstructions}
        <p>Realiza el pago y pega el comprobante.</p>
        <div class="form-group">
            <label for="proof-text">Comprobante de Pago:</label>
            <textarea id="proof-text" rows="4" placeholder="Pega aquí el mensaje de confirmación..."></textarea>
        </div>
        <div class="form-group">
            <label for="phone-number">Tu Número de Teléfono:</label>
            <input type="tel" id="phone-number" placeholder="Ej: 809-555-1234" required>
        </div>
        <button id="btn-submit-proof">Enviar Comprobante</button>
        <button id="btn-back-to-methods">Volver</button>
    `;
    document.getElementById('btn-submit-proof').addEventListener('click', () => handleSubmitProof(paymentOption));
    document.getElementById('btn-back-to-methods').addEventListener('click', loadPaymentMethodsView);
}

    function handleSubmitProof(paymentOption) {
        const proofText = document.getElementById('proof-text').value;
        const phoneNumber = document.getElementById('phone-number').value;
        if (!proofText || !phoneNumber) { alert('Completa todos los campos.'); return; }
        const submitBtn = document.getElementById('btn-submit-proof');
        submitBtn.disabled = true; submitBtn.textContent = 'Enviando...';
        
        fetch(`${API_URL}/transactions`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ planId: selectedPlan.id, phoneNumber, paymentOption })
        })
        .then(res => res.json())
        .then(transaction => {
            currentTransaction = transaction;
            return fetch(`${API_URL}/transactions/${transaction.id}/proof`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ proofText })
            });
        })
        .then(res => res.json())
        .then(() => showStatusView('COMPLETED', '¡Comprobante recibido! Te notificaremos cuando se procese.'))
        .catch(error => { console.error('Error:', error); showStatusView('FAILED', 'Hubo un error.'); })
        .finally(() => { submitBtn.disabled = false; submitBtn.textContent = 'Enviar Comprobante'; });
    }

    function showStatusView(status, message) {
        mainContent.innerHTML = `
            <h2>Estado de tu Solicitud</h2>
            <div class="message ${status === 'COMPLETED' ? 'info' : 'error'}">${message}</div>
            <button id="btn-new-request">Hacer una nueva recarga</button>
        `;
        document.getElementById('btn-new-request').addEventListener('click', loadPlansView);
    }
});