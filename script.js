/**
 * Configurador de Tartas Profesional - Versión Reparada (Funciones Globales)
 */

// --- ESTADO GLOBAL ---
let config = {
    diamMin: 20,
    diamMax: 40,
    altMin: 10,
    altMax: 20,
    tiendaWhatsApp: '34600000000',
};

let selectores = [
    { id: 'frosting', etiqueta: 'Cobertura', opciones: ['Fondant', 'Buttercream', 'Ganache', 'Nata'] },
    { id: 'flavor', etiqueta: 'Sabor', opciones: ['Vainilla', 'Chocolate', 'Red Velvet', 'Zanahoria'] }
];

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    const savedConfig = localStorage.getItem('tarta_config');
    const savedSel = localStorage.getItem('tarta_selectores');
    if (savedConfig) config = JSON.parse(savedConfig);
    if (savedSel) selectores = JSON.parse(savedSel);

    renderSelectores();
    actualizarAltura();
    
    // Eventos básicos
    document.getElementById('inputDiametro').addEventListener('input', actualizarAltura);
    document.getElementById('textareaDesc').addEventListener('input', actualizarCharCount);
    document.getElementById('btnGenerar').addEventListener('click', generarImagen);
    document.getElementById('btnCopiar').addEventListener('click', copiarPrompt);
    document.getElementById('btnDescargar').addEventListener('click', descargarImagen);
    document.getElementById('btnWhatsApp').addEventListener('click', enviarWhatsApp);
    document.getElementById('btnAjustes').addEventListener('click', abrirModal);
    document.getElementById('btnCerrarModal').addEventListener('click', cerrarModal);
    document.getElementById('btnCancelar').addEventListener('click', cerrarModal);
    document.getElementById('btnGuardar').addEventListener('click', guardarAjustes);
    document.getElementById('btnAddSelector').addEventListener('click', añadirNuevoSelector);
});

// --- FUNCIONES DE PANEL ---
function actualizarAltura() {
    const input = document.getElementById('inputDiametro');
    const d = parseInt(input.value, 10) || config.diamMin;
    const ratio = (d - config.diamMin) / (config.diamMax - config.diamMin || 1);
    const h = config.altMin + ratio * (config.altMax - config.altMin);
    document.getElementById('alturaLabel').textContent = `Altura estimada: ${h.toFixed(1)} cm`;
    document.getElementById('labelDiametro').textContent = `Diámetro (${config.diamMin} – ${config.diamMax} cm)`;
}

function actualizarCharCount() {
    const len = document.getElementById('textareaDesc').value.length;
    document.getElementById('charCount').textContent = `${len} / 300`;
}

function renderSelectores() {
    const contenedor = document.getElementById('selectores-dinamicos');
    contenedor.innerHTML = '';
    selectores.forEach((sel) => {
        const div = document.createElement('div');
        div.className = 'field';
        div.style.marginTop = '10px';
        div.innerHTML = `
            <label>${sel.etiqueta}</label>
            <select id="sel_${sel.id}">
                ${sel.opciones.map(o => `<option value="${o}">${o}</option>`).join('')}
            </select>
        `;
        contenedor.appendChild(div);
    });
}

// --- ACCIONES ---
function crearPrompt() {
    const d = document.getElementById('inputDiametro').value;
    const desc = document.getElementById('textareaDesc').value.trim();
    const detalles = selectores.map(sel => {
        const el = document.getElementById(`sel_${sel.id}`);
        return `${sel.etiqueta}: ${el.value}`;
    }).join(', ');
    return `Professional food photography of a round cake, ${d}cm diameter, ${detalles}. ${desc}. High resolution, studio lighting, plain background, 8k.`;
}

function generarImagen() {
    const prompt = crearPrompt();
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true&seed=${Date.now()}`;
    
    setVista('loading');
    document.getElementById('btnGenerar').disabled = true;

    const img = new Image();
    img.onload = () => {
        document.getElementById('foto').src = url;
        setVista('image');
        document.getElementById('btnGenerar').disabled = false;
        document.getElementById('btnDescargar').disabled = false;
    };
    img.onerror = () => {
        setVista('error');
        document.getElementById('btnGenerar').disabled = false;
    };
    img.src = url;
}

async function descargarImagen() {
    try {
        const response = await fetch(document.getElementById('foto').src);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `tarta-${Date.now()}.jpg`; a.click();
        window.URL.revokeObjectURL(url);
        mostrarToast('✓ Descargada');
    } catch (e) { mostrarToast('Error al descargar'); }
}

function copiarPrompt() {
    const p = crearPrompt();
    const el = document.createElement('textarea');
    el.value = p; document.body.appendChild(el); el.select();
    document.execCommand('copy'); document.body.removeChild(el);
    mostrarToast('✓ Copiado');
}

function enviarWhatsApp() {
    let msg = `¡Hola! Encargo de tarta:\n- Diámetro: ${document.getElementById('inputDiametro').value} cm\n`;
    selectores.forEach(sel => {
        msg += `- ${sel.etiqueta}: ${document.getElementById(`sel_${sel.id}`).value}\n`;
    });
    if (document.getElementById('textareaDesc').value) msg += `- Notas: ${document.getElementById('textareaDesc').value}\n`;
    window.open(`https://wa.me/${config.tiendaWhatsApp}?text=${encodeURIComponent(msg)}`, '_blank');
}

// --- GESTIÓN DE AJUSTES (MODAL) ---
function abrirModal() {
    document.getElementById('adj_whatsapp').value = config.tiendaWhatsApp;
    document.getElementById('adj_diamMin').value = config.diamMin;
    document.getElementById('adj_diamMax').value = config.diamMax;
    renderAjustesSelectores();
    document.getElementById('modalOverlay').classList.add('open');
}

function cerrarModal() { document.getElementById('modalOverlay').classList.remove('open'); }

function renderAjustesSelectores() {
    const lista = document.getElementById('lista-ajustes-selectores');
    lista.innerHTML = '';
    selectores.forEach((sel, index) => {
        const div = document.createElement('div');
        div.className = 'selector-item';
        div.style.background = '#f9f9f9';
        div.style.padding = '10px';
        div.style.borderRadius = '8px';
        div.style.marginBottom = '10px';
        div.innerHTML = `
            <div style="display:flex; gap:10px; margin-bottom:10px;">
                <input type="text" value="${sel.etiqueta}" onchange="updateSelectorName(${index}, this.value)" style="flex:1;">
                <button onclick="eliminarSelector(${index})" style="background:none; border:none; color:red; cursor:pointer; font-size:1.2rem;">✕</button>
            </div>
            <div id="opts-${index}">
                ${sel.opciones.map((opt, optIdx) => `
                    <span style="display:inline-flex; align-items:center; background:#eee; padding:4px 8px; border-radius:4px; margin:2px; font-size:0.8rem;">
                        ${opt} 
                        <button onclick="eliminarOpcion(${index}, ${optIdx})" style="border:none; background:none; color:red; margin-left:5px; cursor:pointer;">✕</button>
                    </span>
                `).join('')}
                <input type="text" placeholder="+ Opción (Enter)" style="margin-top:10px; padding:8px; width:100%;" onkeydown="if(event.key==='Enter') añadirOpcion(${index}, this)">
            </div>
        `;
        lista.appendChild(div);
    });
}

// Funciones globales para el modal
window.updateSelectorName = (idx, val) => { selectores[idx].etiqueta = val; };
window.eliminarSelector = (idx) => { selectores.splice(idx, 1); renderAjustesSelectores(); };
window.eliminarOpcion = (sIdx, oIdx) => { selectores[sIdx].opciones.splice(oIdx, 1); renderAjustesSelectores(); };
window.añadirOpcion = (idx, input) => {
    if (input.value.trim()) {
        selectores[idx].opciones.push(input.value.trim());
        input.value = '';
        renderAjustesSelectores();
    }
};

function añadirNuevoSelector() {
    selectores.push({ id: 's' + Date.now(), etiqueta: 'Nuevo Campo', opciones: ['Opción 1'] });
    renderAjustesSelectores();
}

function guardarAjustes() {
    config.tiendaWhatsApp = document.getElementById('adj_whatsapp').value;
    config.diamMin = parseInt(document.getElementById('adj_diamMin').value) || 20;
    config.diamMax = parseInt(document.getElementById('adj_diamMax').value) || 40;
    
    localStorage.setItem('tarta_config', JSON.stringify(config));
    localStorage.setItem('tarta_selectores', JSON.stringify(selectores));
    
    renderSelectores();
    actualizarAltura();
    cerrarModal();
    mostrarToast('✓ Ajustes guardados');
}

// --- HELPERS UI ---
function setVista(estado) {
    document.getElementById('placeholder').style.display = estado === 'placeholder' ? 'block' : 'none';
    document.getElementById('loader').style.display = estado === 'loading' ? 'flex' : 'none';
    document.getElementById('fotoMarco').classList.toggle('visible', estado === 'image');
    document.getElementById('errorMsg').style.display = estado === 'error' ? 'block' : 'none';
}

function mostrarToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2000);
}
