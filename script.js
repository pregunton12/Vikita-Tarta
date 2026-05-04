/**
 * Configurador de Tartas Profesional - Versión Final Corregida
 * Soluciona problemas de prompt, generación de imágenes y compatibilidad con servidores.
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
        groqApiKey: '',
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
        try {
            const savedConfig = localStorage.getItem('tarta_config');
            const savedSel = localStorage.getItem('tarta_selectores');
            if (savedConfig) config = JSON.parse(savedConfig);
            if (savedSel) selectores = JSON.parse(savedSel);
        } catch (e) {
            console.error("Error cargando configuración:", e);
        }

        renderSelectores();
        setupEventListeners();
        actualizarAltura();
    }

    function setupEventListeners() {
        if (refs.inputDiametro) refs.inputDiametro.addEventListener('input', actualizarAltura);
        if (refs.textareaDesc) refs.textareaDesc.addEventListener('input', actualizarCharCount);
        if (refs.btnGenerar) refs.btnGenerar.addEventListener('click', generarImagen);
        if (refs.btnCopiar) refs.btnCopiar.addEventListener('click', copiarPrompt);
        if (refs.btnDescargar) refs.btnDescargar.addEventListener('click', descargarImagen);
        if (refs.btnWhatsApp) refs.btnWhatsApp.addEventListener('click', enviarWhatsApp);
        
        if (refs.btnAjustes) refs.btnAjustes.addEventListener('click', abrirModal);
        if (refs.btnCerrarModal) refs.btnCerrarModal.addEventListener('click', cerrarModal);
        if (refs.btnCancelar) refs.btnCancelar.addEventListener('click', cerrarModal);
        if (refs.btnGuardar) refs.btnGuardar.addEventListener('click', guardarAjustes);
        if (refs.btnAddSelector) refs.btnAddSelector.addEventListener('click', añadirNuevoSelector);

        // Toggle mostrar/ocultar API key
        document.addEventListener('click', (e) => {
            if (e.target.id === 'btnToggleKey') {
                const input = document.getElementById('adj_groqApiKey');
                if (input) input.type = input.type === 'password' ? 'text' : 'password';
            }
        });
    }

    // ── Lógica de Panel ──
    function actualizarAltura() {
        const d = parseInt(refs.inputDiametro.value, 10) || config.diamMin;
        const ratio = (d - config.diamMin) / (config.diamMax - config.diamMin || 1);
        const h = config.altMin + ratio * (config.altMax - config.altMin);
        if (refs.alturaLabel) refs.alturaLabel.textContent = `Altura estimada: ${h.toFixed(1)} cm`;
        const labelDiam = document.getElementById('labelDiametro');
        if (labelDiam) labelDiam.textContent = `Diámetro (${config.diamMin} – ${config.diamMax} cm)`;
    }

    function actualizarCharCount() {
        const len = refs.textareaDesc.value.length;
        if (refs.charCount) refs.charCount.textContent = `${len} / 300`;
    }

    function renderSelectores() {
        if (!refs.contenedorSel) return;
        refs.contenedorSel.innerHTML = '';
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
            refs.contenedorSel.appendChild(div);
        });
    }

    // ── Acciones ──
    let ultimoPromptEnriquecido = null; // Caché para no llamar la API dos veces

    function crearPromptBase() {
        const d = refs.inputDiametro ? refs.inputDiametro.value : config.diamMin;
        const desc = refs.textareaDesc ? refs.textareaDesc.value.trim() : "";

        const detalles = selectores.map(sel => {
            const el = document.getElementById(`sel_${sel.id}`);
            const valor = el ? el.value : (sel.opciones[0] || "");
            return `${sel.etiqueta}: ${valor}`;
        }).filter(item => item !== "").join(', ');

        const descPart = desc ? `. ${desc}` : '';
        return `Tarta redonda, ${d}cm de diámetro, ${detalles}${descPart}.`.replace(/\s+/g, ' ').trim();
    }

    async function enriquecerPrompt(promptBase) {
        if (!config.groqApiKey) throw new Error('Sin API key');

        const systemPrompt = `You are an expert AI image prompt engineer specializing in professional food photography.
Your task is to take a basic cake description and transform it into a highly detailed, professional image generation prompt in English.

Rules:
- Always write in English regardless of the input language
- Expand every ingredient/decoration detail with vivid, sensory descriptions (textures, colors, finishes, techniques)
- Add professional photography details: lighting setup, camera angle, lens type, depth of field
- Add food styling details: plating, garnishes, surface, props if relevant
- End with technical quality tags: ultra-high resolution, 8k, hyper-photorealistic, microscopically detailed, crisp focus, breathtaking depth of field, perfect composition, culinary masterpiece, magazine-quality
- Output ONLY the final prompt, no explanations, no quotes, no preamble`;

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${config.groqApiKey}`
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                max_tokens: 1000,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: `Transform this cake description into a professional image generation prompt: "${promptBase}"` }
                ]
            })
        });

        if (!response.ok) throw new Error(`Groq API error: ${response.status}`);
        const data = await response.json();
        return data.choices?.[0]?.message?.content?.trim() || promptBase;
    }

    function setLoaderText(texto) {
        const loaderText = refs.loader ? refs.loader.querySelector('.loader-text') : null;
        if (loaderText) loaderText.textContent = texto;
    }

    async function generarImagen() {
        ultimoPromptEnriquecido = null;
        setVista('loading');
        setLoaderText('Preparando prompt...');
        if (refs.btnGenerar) refs.btnGenerar.disabled = true;

        let prompt;
        try {
            const base = crearPromptBase();
            prompt = await enriquecerPrompt(base);
            ultimoPromptEnriquecido = prompt;
        } catch (e) {
            console.error("Error enriqueciendo prompt:", e);
            prompt = crearPromptBase();
            ultimoPromptEnriquecido = prompt;
            mostrarToast('⚠ Prompt simplificado (sin API)');
        }

        setLoaderText('Generando imagen...');
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true&seed=${Date.now()}`;

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            if (refs.foto) refs.foto.src = url;
            setVista('image');
            if (refs.btnGenerar) refs.btnGenerar.disabled = false;
            if (refs.btnDescargar) refs.btnDescargar.disabled = false;
        };
        img.onerror = () => {
            setVista('error');
            if (refs.btnGenerar) refs.btnGenerar.disabled = false;
        };
        img.src = url;
    }

    async function descargarImagen() {
        if (!refs.foto || !refs.foto.src) return;
        try {
            const response = await fetch(refs.foto.src);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `tarta-${Date.now()}.jpg`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            mostrarToast('✓ Descargada');
        } catch (e) { 
            console.error("Error descargando imagen:", e);
            mostrarToast('Error al descargar'); 
        }
    }

    async function copiarPrompt() {
        let prompt = ultimoPromptEnriquecido;

        if (!prompt) {
            // Nunca se generó imagen: enriquecer ahora
            mostrarToast('Enriqueciendo prompt...');
            try {
                prompt = await enriquecerPrompt(crearPromptBase());
                ultimoPromptEnriquecido = prompt;
            } catch (e) {
                prompt = crearPromptBase();
            }
        }

        const escribir = (p) => {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(p).then(() => mostrarToast('✓ Copiado'));
            } else {
                const textArea = document.createElement("textarea");
                textArea.value = p;
                document.body.appendChild(textArea);
                textArea.select();
                try { document.execCommand('copy'); mostrarToast('✓ Copiado'); }
                catch (err) { console.error('Error al copiar:', err); }
                document.body.removeChild(textArea);
            }
        };
        escribir(prompt);
    }

    function enviarWhatsApp() {
        let msg = `¡Hola! Encargo de tarta:\n- Diámetro: ${refs.inputDiametro.value} cm\n`;
        selectores.forEach(sel => {
            const el = document.getElementById(`sel_${sel.id}`);
            const valor = el ? el.value : (sel.opciones[0] || "");
            msg += `- ${sel.etiqueta}: ${valor}\n`;
        });
        if (refs.textareaDesc && refs.textareaDesc.value) msg += `- Notas: ${refs.textareaDesc.value}\n`;
        window.open(`https://wa.me/${config.tiendaWhatsApp}?text=${encodeURIComponent(msg)}`, '_blank');
    }

    // ── Gestión de Ajustes (Modal) ──
    function abrirModal() {
        const wa = document.getElementById('adj_whatsapp');
        const min = document.getElementById('adj_diamMin');
        const max = document.getElementById('adj_diamMax');
        const apikey = document.getElementById('adj_groqApiKey');
        
        if (wa) wa.value = config.tiendaWhatsApp;
        if (min) min.value = config.diamMin;
        if (max) max.value = config.diamMax;
        if (apikey) apikey.value = config.groqApiKey || '';
        
        renderAjustesSelectores();
        if (refs.modalOverlay) refs.modalOverlay.classList.add('open');
    }

    function cerrarModal() { 
        if (refs.modalOverlay) refs.modalOverlay.classList.remove('open'); 
    }

    function renderAjustesSelectores() {
        if (!refs.listaAjustesSel) return;
        refs.listaAjustesSel.innerHTML = '';
        selectores.forEach((sel, index) => {
            const div = document.createElement('div');
            div.className = 'selector-item';
            div.style.background = '#f9f9f9';
            div.style.padding = '10px';
            div.style.borderRadius = '8px';
            div.style.marginBottom = '10px';
            div.innerHTML = `
                <div class="selector-item-header" style="display:flex; gap:10px; margin-bottom:10px;">
                    <input type="text" value="${sel.etiqueta}" onchange="APP.updateSelectorName(${index}, this.value)" placeholder="Nombre (ej: Relleno)" style="flex:1; padding:8px; border:1px solid #ddd; border-radius:4px;">
                    <button class="btn" onclick="APP.eliminarSelector(${index})" style="background:none; border:none; color:red; cursor:pointer; font-size:1.2rem;">✕</button>
                </div>
                <div class="opciones-list" id="opts-${index}">
                    ${sel.opciones.map((opt, optIdx) => `
                        <span class="opcion-tag" style="display:inline-flex; align-items:center; background:#eee; padding:4px 8px; border-radius:4px; margin:2px; font-size:0.8rem;">
                            ${opt} 
                            <button onclick="APP.eliminarOpcion(${index}, ${optIdx})" style="border:none; background:none; color:red; margin-left:5px; cursor:pointer;">✕</button>
                        </span>
                    `).join('')}
                    <input type="text" placeholder="+ Añadir opción (Enter)" style="margin-top:10px; padding:8px; width:100%; border:1px solid #ddd; border-radius:4px;" onkeydown="if(event.key==='Enter') APP.añadirOpcion(${index}, this)">
                </div>
            `;
            refs.listaAjustesSel.appendChild(div);
        });
    }

    function añadirNuevoSelector() {
        selectores.push({ id: 's' + Date.now(), etiqueta: 'Nuevo Campo', opciones: ['Opción 1'] });
        renderAjustesSelectores();
    }

    function guardarAjustes() {
        const wa = document.getElementById('adj_whatsapp');
        const min = document.getElementById('adj_diamMin');
        const max = document.getElementById('adj_diamMax');

        if (wa) config.tiendaWhatsApp = wa.value;
        if (min) config.diamMin = parseInt(min.value) || 20;
        if (max) config.diamMax = parseInt(max.value) || 40;
        const apikey = document.getElementById('adj_groqApiKey');
        if (apikey) config.groqApiKey = apikey.value.trim();
        
        try {
            localStorage.setItem('tarta_config', JSON.stringify(config));
            localStorage.setItem('tarta_selectores', JSON.stringify(selectores));
        } catch (e) {
            console.error("Error guardando configuración:", e);
        }
        
        if (refs.inputDiametro) {
            refs.inputDiametro.min = config.diamMin;
            refs.inputDiametro.max = config.diamMax;
            const current = parseInt(refs.inputDiametro.value);
            if (current < config.diamMin) refs.inputDiametro.value = config.diamMin;
            if (current > config.diamMax) refs.inputDiametro.value = config.diamMax;
        }
        
        renderSelectores();
        actualizarAltura();
        cerrarModal();
        mostrarToast('✓ Ajustes guardados');
    }

    // ── Helpers UI ──
    function setVista(estado) {
        if (refs.placeholder) refs.placeholder.style.display = estado === 'placeholder' ? 'block' : 'none';
        if (refs.loader) refs.loader.style.display = estado === 'loading' ? 'flex' : 'none';
        if (refs.fotoMarco) refs.fotoMarco.classList.toggle('visible', estado === 'image');
        if (refs.errorMsg) refs.errorMsg.style.display = estado === 'error' ? 'block' : 'none';
    }

    function mostrarToast(msg) {
        if (!refs.toast) return;
        refs.toast.textContent = msg;
        refs.toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => refs.toast.classList.remove('show'), 2000);
    }

    return {
        init,
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
})();

document.addEventListener('DOMContentLoaded', APP.init);
