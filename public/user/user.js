document.addEventListener('DOMContentLoaded', () => {
    // IMPORTANTE: Usa la URL de producción para Render.
    const API_URL = 'https://sistema-recargas.onrender.com/api'; 
    
    const mainContent = document.getElementById('main-content');
    const params = new URLSearchParams(window.location.search);
    const planId = params.get('plan');
    const SUPPORT_PHONE_NUMBER = '19896216522';
    let plan;

    // NUEVO: Configurar el botón de soporte de WhatsApp al cargar la página
    const supportBtn = document.getElementById('btn-support');
    if (supportBtn) {
        supportBtn.href = `https://wa.me/${SUPPORT_PHONE_NUMBER}`;
    }

    function showPlansList() {
        mainContent.innerHTML = '<h2>Selecciona un Plan de Recarga</h2><p>Cargando planes...</p>';
        fetch(`${API_URL}/plans`)
            .then(res => res.json())
            .then(plans => {
                if (plans.length === 0) {
                    mainContent.innerHTML = '<p>No hay planes disponibles en este momento.</p>';
                    return;
                }
                let html = '<div class="plans-grid">';
                plans.forEach(p => {
                    html += `
                        <div class="plan-card">
                            <h3>${p.name}</h3>
                            <p>${p.description || 'Recarga rápida y segura.'}</p>
                            <div class="price-tag">Desde ${p.paymentOptions[0].amount} ${p.paymentOptions[0].currency}</div>
                            <button onclick="location.href='?plan=${p.id}'">Recargar Ahora</button>
                        </div>
                    `;
                });
                html += '</div>';
                mainContent.innerHTML = html;
            })
            .catch(error => {
                console.error('Error al cargar los planes:', error);
                mainContent.innerHTML = '<p>Ocurrió un error al cargar los planes. Por favor, intenta de nuevo más tarde.</p>';
            });
    }

    function showPaymentForm(planData) {
        // CORRECCIÓN: Asignamos el plan recibido a la variable 'plan' del scope superior
        plan = planData;

        let paymentOptionsHtml = '';
        plan.paymentOptions.forEach(option => {
            paymentOptionsHtml += `
                <div class="payment-option">
                    <input type="radio" id="option-${option.id}" name="paymentOption" value="${option.id}" required>
                    <label for="option-${option.id}">
                        <strong>${option.method}</strong> - ${option.amount} ${option.currency}
                    </label>
                    ${option.link ? `<a href="${option.link}" target="_blank" rel="noopener noreferrer" class="payment-link">Pagar aquí</a>` : ''}
                    ${option.destinationDetails ? `<p class="destination-details">${option.destinationDetails.replace(/\n/g, '<br>')}</p>` : ''}
                </div>
            `;
        });

        mainContent.innerHTML = `
            <div class="form-container">
                <button onclick="location.href='/'" class="back-button">← Volver a los planes</button>
                <h2>Completar Recarga</h2>
                <form id="payment-form">
                    <div class="form-group">
                        <label for="phoneNumber">Número de la cuenta a recargar</label>
                        <input type="tel" id="phoneNumber" name="phoneNumber" placeholder="+53 5xxxxxxx" required>
                    </div>
                    <h3>Selecciona un método de pago</h3>
                    <div class="payment-options-list">
                        ${paymentOptionsHtml}
                    </div>
                    <div class="form-group">
                        <label for="proofText">Número de Referencia, ID de Transacción o Captura de Pago</label>
                        <textarea id="proofText" name="proofText" rows="4" placeholder="Pega aquí el comprobante de pago..." required></textarea>
                    </div>
                    <button type="submit">Enviar Solicitud de Recarga</button>
                </form>
                <div id="form-message"></div>
            </div>
        `;

        document.getElementById('payment-form').addEventListener('submit', handlePaymentSubmit);
    }

    function handlePaymentSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);
        const messageDiv = document.getElementById('form-message');

        const selectedOptionId = formData.get('paymentOption');
        
        // --- MEJORA: Comprobar si se seleccionó una opción de pago ---
        if (!selectedOptionId) {
            messageDiv.textContent = 'Por favor, selecciona un método de pago.';
            messageDiv.className = 'message error';
            return; // Detener la ejecución aquí
        }

        const selectedOption = plan.paymentOptions.find(opt => opt.id == selectedOptionId);

        // --- MEJORA: Comprobar si se encontró la opción ---
        if (!selectedOption) {
            messageDiv.textContent = 'Hubo un error con el método de pago seleccionado. Intenta de nuevo.';
            messageDiv.className = 'message error';
            return; // Detener la ejecución aquí
        }

        const payload = {
            phoneNumber: formData.get('phoneNumber'),
            proofText: formData.get('proofText'),
            paymentOption: selectedOption
        };

        fetch(`${API_URL}/transactions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                messageDiv.textContent = '¡Solicitud enviada! Te notificaremos cuando sea procesada.';
                messageDiv.className = 'message success';
                form.reset();
            } else {
                messageDiv.textContent = data.message || 'Ocurrió un error al enviar la solicitud.';
                messageDiv.className = 'message error';
            }
        })
        .catch(error => {
            console.error('Error al enviar la solicitud:', error);
            messageDiv.textContent = 'Error de conexión. Por favor, intenta de nuevo.';
            messageDiv.className = 'message error';
        });
    }

    if (planId) {
        fetch(`${API_URL}/plans/${planId}`)
            .then(res => {
                 // --- MEJORA: Comprobar si la respuesta es correcta antes de convertirla a JSON ---
                if (!res.ok) {
                    throw new Error(`Error ${res.status}: Plan no encontrado.`);
                }
                return res.json();
            })
            .then(planData => {
                if (planData) { showPaymentForm(planData); }
                else { mainContent.innerHTML = '<p>Plan no encontrado.</p>'; }
            })
            .catch(error => {
                console.error('Error al cargar el plan:', error);
                mainContent.innerHTML = `<p>Error: No se pudo cargar el plan solicitado. Es posible que no exista. <a href="/">Volver a la lista de planes</a></p>`;
            });
    } else {
        showPlansList();
    }
});