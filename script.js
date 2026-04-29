/**
 * Configurador de Tartas Profesional - Versión Final con Gestión de Selectores
 */

const APP = (() => {
    // ── Referencias al DOM ──
    const refs = {
        inputDiametro: document.getElementById('inputDiametro'),
        textareaDesc: document.getElementById('textareaDesc'),
        charCount: document.getElementById('charCount'),
        alturaLabel: document.getElementById('alturaLabel'),
        btnGenerar: document.getElementById('btnGenerar'),
        btnCopiar: document.getElementById('btnCopiar'),
        btnDescargar: document.getElementById('btnDescargar'),
        btnWhatsApp: document.getElementById('btnWhatsApp'),
        btnAjustes: document.getElementById('btnAjustes'),
        contenedorSel: document.getElementById('selectores-dinamicos'),
        placeholder: document.getElementById('placeholder'),
        loader: document.getElementById('loader'),
        fotoMarco: document.getElementById('fotoMarco'),
        foto: document.getElementById('foto'),
        errorMsg: document.getElementById('errorMsg'),
        toast: document.getElementById('toast'),
        modalOverlay: document.getElementById('modalOverlay'),
        modalBody: document.getElementById('modalBody'),
        btnCerrarModal: document.getElementById('btnCerrarModal'),
        btnCancelar: document.getElementById('btnCancelar'),
        btnGuardar: document.getElementById('btnGuardar'),
        btnAddSelector: document.getElementById('btnAddSelector'),
        listaAjustesSel: document.getElementById('lista-ajustes-selectores'),
    };

    // ── Estado ──
    let config = {
        diamMin: 20,
        diamMax: 40,
        altMin: 10,
        altMax: 20,
        tiendaWhatsApp: '34600000000',
    };

    let selectores = [
        {
            id: 'frosting',
            etiqueta: 'Cobertura',
            opciones: ['Fondant', 'Buttercream', 'Ganache', 'Nata']
        },
        {
            id: 'flavor',
            etiqueta: 'Sabor',
            opciones: ['Vainilla', 'Chocolate', 'Red Velvet', 'Zanahoria']
        }
    ];

    let toastTimer = null;

    // ── Inicialización ──
    function init() {
        // Cargar de localStorage si existe
        const savedConfig = localStorage.getItem('tarta_config');
        const savedSel = localStorage.getItem('tarta_selectores');
        if (savedConfig) config = JSON.parse(savedConfig);
        if (savedSel) selectores = JSON.parse(savedSel);

        renderSelectores();
        setupEventListeners();
        actualizarAltura();
    }

    function setupEventListeners() {
        refs.inputDiametro.addEventListener('input', actualizarAltura);
        refs.textareaDesc.addEventListener('input', actualizarCharCount);
        refs.btnGenerar.addEventListener('click', generarImagen);
        refs.btnCopiar.addEventListener('click', copiarPrompt);
        refs.btnDescargar.addEventListener('click', descargarImagen);
        refs.btnWhatsApp.addEventListener('click', enviarWhatsApp);
        
        refs.btnAjustes.addEventListener('click', abrirModal);
        refs.btnCerrarModal.addEventListener('click', cerrarModal);
        refs.btnCancelar.addEventListener('click', cerrarModal);
        refs.btnGuardar.addEventListener('click', guardarAjustes);
        refs.btnAddSelector.addEventListener('click', añadirNuevoSelector);
    }

    // ── Lógica de Panel ──
    function actualizarAltura() {
        const d = parseInt(refs.inputDiametro.value, 10) || config.diamMin;
        const ratio = (d - config.diamMin) / (config.diamMax - config.diamMin || 1);
        const h = config.altMin + ratio * (config.altMax - config.altMin);
        refs.alturaLabel.textContent = `Altura estimada: ${h.toFixed(1)} cm`;
    }

    function actualizarCharCount() {
        const len = refs.textareaDesc.value.length;
        refs.charCount.textContent = `${len} / 300`;
    }

    function renderSelectores() {
        refs.contenedorSel.innerHTML = '';
        selectores.forEach((sel) => {
            const div = document.createElement('div');
            div.className = 'field';
            div.innerHTML = `
                <label>${sel.etiqueta}</label>
                <select id="sel_${sel.id}">
                    ${sel.opciones.map(o => `<option value="${o}">${o}</option>`).join('')}
                </select>
            `;
            refs.contenedorSel.appendChild(div);
        });
    }

    // ── Acciones ──
    function crearPrompt() {
        const d = refs.inputDiametro.value;
        const desc = refs.textareaDesc.value.trim();
        const detalles = selectores.map(sel => {
            const el = document.getElementById(`sel_${sel.id}`);
            return `${sel.etiqueta}: ${el.value}`;
        }).join(', ');

        return `Professional food photography of a round cake, ${d}cm diameter, ${detalles}. ${desc}. High resolution, studio lighting, plain background, 8k.`;
    }

    async function generarImagen() {
        const prompt = crearPrompt();
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true&seed=${Math.floor(Math.random() * 1000000)}`;

        setVista('loading');
        refs.btnGenerar.disabled = true;

        const img = new Image();
        img.onload = () => {
            refs.foto.src = url;
            setVista('image');
            refs.btnGenerar.disabled = false;
            refs.btnDescargar.disabled = false;
        };
        img.onerror = () => {
            setVista('error');
            refs.btnGenerar.disabled = false;
        };
        img.src = url;
    }

    async function descargarImagen() {
        try {
            const response = await fetch(refs.foto.src);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `tarta-${Date.now()}.jpg`;
            a.click();
            window.URL.revokeObjectURL(url);
            mostrarToast('✓ Descargada');
        } catch (e) { mostrarToast('Error al descargar'); }
    }

    function copiarPrompt() {
        navigator.clipboard.writeText(crearPrompt()).then(() => mostrarToast('✓ Copiado'));
    }

    function enviarWhatsApp() {
        let msg = `¡Hola! Encargo de tarta:\n- Diámetro: ${refs.inputDiametro.value} cm\n`;
        selectores.forEach(sel => {
            msg += `- ${sel.etiqueta}: ${document.getElementById(`sel_${sel.id}`).value}\n`;
        });
        if (refs.textareaDesc.value) msg += `- Notas: ${refs.textareaDesc.value}\n`;
        window.open(`https://wa.me/${config.tiendaWhatsApp}?text=${encodeURIComponent(msg)}`, '_blank');
    }

    // ── Gestión de Ajustes (Modal) ──
    function abrirModal() {
        document.getElementById('adj_whatsapp').value = config.tiendaWhatsApp;
        document.getElementById('adj_diamMin').value = config.diamMin;
        document.getElementById('adj_diamMax').value = config.diamMax;
        renderAjustesSelectores();
        refs.modalOverlay.classList.add('open');
    }

    function cerrarModal() { refs.modalOverlay.classList.remove('open'); }

    function renderAjustesSelectores() {
        refs.listaAjustesSel.innerHTML = '';
        selectores.forEach((sel, index) => {
            const div = document.createElement('div');
            div.className = 'selector-item';
            div.innerHTML = `
                <div class="selector-item-header">
                    <input type="text" value="${sel.etiqueta}" onchange="APP.updateSelectorName(${index}, this.value)" placeholder="Nombre (ej: Relleno)">
                    <button class="btn" onclick="APP.eliminarSelector(${index})" style="background:none; color:var(--error); padding:0 5px;">✕</button>
                </div>
                <div class="opciones-list" id="opts-${index}">
                    ${sel.opciones.map((opt, optIdx) => `
                        <span class="opcion-tag">${opt} <button onclick="APP.eliminarOpcion(${index}, ${optIdx})">✕</button></span>
                    `).join('')}
                    <input type="text" placeholder="+ Añadir opción" onkeydown="if(event.key==='Enter') APP.añadirOpcion(${index}, this)">
                </div>
            `;
            refs.listaAjustesSel.appendChild(div);
        });
    }

    function añadirNuevoSelector() {
        selectores.push({ id: 'sel_' + Date.now(), etiqueta: 'Nuevo Campo', opciones: ['Opción 1'] });
        renderAjustesSelectores();
    }

    function guardarAjustes() {
        config.tiendaWhatsApp = document.getElementById('adj_whatsapp').value;
        config.diamMin = parseInt(document.getElementById('adj_diamMin').value);
        config.diamMax = parseInt(document.getElementById('adj_diamMax').value);
        
        localStorage.setItem('tarta_config', JSON.stringify(config));
        localStorage.setItem('tarta_selectores', JSON.stringify(selectores));
        
        refs.inputDiametro.min = config.diamMin;
        refs.inputDiametro.max = config.diamMax;
        document.getElementById('labelDiametro').textContent = `Diámetro (${config.diamMin} – ${config.diamMax} cm)`;
        
        renderSelectores();
        cerrarModal();
        actualizarAltura();
        mostrarToast('✓ Ajustes guardados');
    }

    // ── Helpers UI ──
    function setVista(estado) {
        refs.placeholder.style.display = estado === 'placeholder' ? 'block' : 'none';
        refs.loader.style.display = estado === 'loading' ? 'flex' : 'none';
        refs.fotoMarco.classList.toggle('visible', estado === 'image');
        refs.errorMsg.style.display = estado === 'error' ? 'block' : 'none';
    }

    function mostrarToast(msg) {
        refs.toast.textContent = msg;
        refs.toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => refs.toast.classList.remove('show'), 2000);
    }

    // Exponer funciones para los onclick del modal
    window.APP = {
        eliminarSelector: (idx) => { selectores.splice(idx, 1); renderAjustesSelectores(); },
        updateSelectorName: (idx, val) => { selectores[idx].etiqueta = val; },
        eliminarOpcion: (sIdx, oIdx) => { selectores[sIdx].opciones.splice(oIdx, 1); renderAjustesSelectores(); },
        añadirOpcion: (idx, input) => {
            if (input.value.trim()) {
                selectores[idx].opciones.push(input.value.trim());
                input.value = '';
                renderAjustesSelectores();
            }
        }
    };

    return { init };
})();

document.addEventListener('DOMContentLoaded', APP.init);
