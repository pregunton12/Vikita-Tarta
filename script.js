/**
 * Configurador de Tartas - Script Principal
 * Aplicación web para configurar tartas y generar imágenes mediante IA.
 *
 * Características:
 *  - Configuración persistente en localStorage con validación robusta.
 *  - Generación de prompts en inglés mejorados con IA y traducción de respaldo.
 *  - Galería de hasta 10 imágenes con generación en segundo plano.
 *  - Tokens anti-condición de carrera para peticiones concurrentes.
 *  - Modal de ajustes accesible con foco atrapado y restaurado.
 *  - Cancelación limpia de imágenes y peticiones HTTP en curso.
 */

const APP = (() => {
    'use strict';

    // ════════════════════════════════════════════════════════════════════
    // CONSTANTES
    // ════════════════════════════════════════════════════════════════════

    const STORAGE_KEY = 'configurador_tartas_v7';
    const STORAGE_VERSION = 7;
    const MAX_IMAGENES = 10;

    const ETIQUETAS_VACIAS = new Set(['', 'nada', 'ninguna', 'ninguno', 'none', '-', '—']);

    const MAX_DESC = 300;
    const WARN_DESC = 270;
    const TOAST_MS = 3000;

    const TRANSLATE_URL = 'https://api.mymemory.translated.net/get';
    const TRANSLATE_PAIR = 'es|en';
    const TRANSLATE_TIMEOUT_MS = 12000;

    const ENHANCE_URL = 'https://text.pollinations.ai/';
    const ENHANCE_TIMEOUT_MS = 30000;

    // Carga de imagen: reintentos generosos con espera progresiva.
    // Pollinations es gratuito y a veces se satura, por eso insistimos.
    const IMG_MAX_INTENTOS = 5;
    const IMG_BG_MAX_INTENTOS = 4;
    const IMG_TIMEOUT_MS = 60000;
    const IMG_RETRY_DELAYS_MS = [1000, 2000, 3500, 5500, 8000];

    // Proveedor de generación de imágenes
    const PROVIDER_POLLINATIONS = 'pollinations';
    const PROVIDER_OPENAI = 'openai';

    const POLLINATIONS_MODELOS = ['flux', 'turbo', 'flux-realism'];
    const OPENAI_MODELOS = ['gpt-image-1', 'dall-e-3'];

    const OPENAI_URL = 'https://api.openai.com/v1/images/generations';

    const DEFAULT_IMG_CONFIG = {
        provider: PROVIDER_POLLINATIONS,
        pollinationsModel: 'flux',
        openaiKey: '',
        openaiModel: 'gpt-image-1',
    };
    const ENHANCE_SYSTEM = [
        'You are an expert prompt engineer for AI image generators specialized in food and cake photography.',
        'Given a short brief about a cake (in Spanish or English), produce ONE single rich, hyper-detailed English prompt for an AI image generator.',
        'Strict rules:',
        '- Output ONLY the prompt text. No preamble, no quotes, no markdown, no explanations, no line breaks.',
        '- ONE single paragraph, between 90 and 160 words.',
        '- Start with: "Professional food photography of".',
        '- Mention the exact dimensions provided (diameter and height in cm).',
        '- Incorporate every concrete detail in the brief (theme, decorations, occasion, colors, character, style, etc.) and translate them to English if they are in Spanish.',
        '- Add vivid sensory details appropriate to the theme: textures (fondant sheen, sugar sparkle, crumb), color palette specifics, and decoration materials (fondant, sugar paste, edible glitter, sugar pearls, edible flowers, isomalt, etc.).',
        '- Add professional photography details: softbox studio lighting, slightly elevated eye-level perspective, macro lens, shallow depth of field, soft shadows, plain cream-colored seamless studio backdrop.',
        '- End with: "ultra-photorealistic, hyper-detailed, 8k resolution".',
    ].join(' ');

    // ════════════════════════════════════════════════════════════════════
    // REFERENCIAS AL DOM
    // ════════════════════════════════════════════════════════════════════

    const refs = {
        inputDiametro: document.getElementById('inputDiametro'),
        labelDiametro: document.getElementById('labelDiametro'),
        textareaDesc: document.getElementById('textareaDesc'),
        charCount: document.getElementById('charCount'),
        alturaLabel: document.getElementById('alturaLabel'),
        btnGenerar: document.getElementById('btnGenerar'),
        btnCopiar: document.getElementById('btnCopiar'),
        btnGuardarImagen: document.getElementById('btnGuardarImagen'),
        btnAjustes: document.getElementById('btnAjustes'),
        contenedorSel: document.getElementById('selectores-dinamicos'),

        placeholder: document.getElementById('placeholder'),
        loader: document.getElementById('loader'),
        loaderText: document.querySelector('#loader .loader-text'),
        galeria: document.getElementById('galeria'),
        fotoMarco: document.getElementById('fotoMarco'),
        foto: document.getElementById('foto'),
        btnPrev: document.getElementById('btnPrev'),
        btnNext: document.getElementById('btnNext'),
        contador: document.getElementById('contador'),
        btnReiniciar: document.getElementById('btnReiniciar'),
        errorMsg: document.getElementById('errorMsg'),

        toast: document.getElementById('toast'),

        modalOverlay: document.getElementById('modalOverlay'),
        modalDialog: document.querySelector('#modalOverlay .modal'),
        modalBody: document.getElementById('modalBody'),
        btnCerrarModal: document.getElementById('btnCerrarModal'),
        btnCancelar: document.getElementById('btnCancelar'),
        btnGuardar: document.getElementById('btnGuardar'),
    };

    // Validar referencias críticas
    for (const [key, el] of Object.entries(refs)) {
        if (!el) console.warn(`Elemento no encontrado en el DOM: ${key}`);
    }

    // ════════════════════════════════════════════════════════════════════
    // ESTADO
    // ════════════════════════════════════════════════════════════════════

    const DEFAULT_CONFIG = { diamMin: 20, diamMax: 40, altMin: 10, altMax: 20 };

    // Los IDs son simples (sin prefijo) y se prefijan solo al construir el DOM.
    const DEFAULT_SELECTORES = [
        {
            id: 'frosting_type',
            etiqueta: 'Tipo de cobertura',
            opciones: [
                { label: 'Nada' },
                { label: 'Cubierta de fondant liso' },
                { label: 'Cubierta de buttercream' },
                { label: 'Cubierta de ganache de chocolate' },
            ],
        },
        {
            id: 'decoration',
            etiqueta: 'Decoración',
            opciones: [
                { label: 'Nada' },
                { label: 'Decorada con flores comestibles frescas' },
                { label: 'Decorada con frutas frescas y bayas' },
                { label: 'Decorada con virutas y rizos de chocolate' },
            ],
        },
    ];

    let config = { ...DEFAULT_CONFIG };
    let selectores = clone(DEFAULT_SELECTORES);
    let imgConfig = { ...DEFAULT_IMG_CONFIG };

    let snapSelectores = null;
    let snapConfig = null;
    let snapImgConfig = null;
    let toastTimer = null;

    // Galería de imágenes generadas
    let imagenes = [];   // [{ url, prompt }]
    let imagenIdx = 0;
    let urlPintada = '';  // Última URL pintada en el <img>, para evitar relecturas de .src

    // Tokens de cancelación
    let requestToken = 0;        // Petición principal "Generar"
    let backgroundToken = 0;     // Rellenado en segundo plano
    let copyToken = 0;           // Petición de "Copiar prompt"
    let generandoEnBackground = false;

    // AbortController activo para cancelar fetches al iniciar una nueva
    // petición principal o al reiniciar la galería.
    let activeFetchAbort = null;

    // Para devolver el foco al cerrar el modal
    let lastFocusedBeforeModal = null;

    // Contador para generar IDs únicos sin colisiones por timestamp
    let nextSelectorCounter = 1;

    // ════════════════════════════════════════════════════════════════════
    // UTILIDADES
    // ════════════════════════════════════════════════════════════════════

    function clone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = String(text ?? '');
        return div.innerHTML;
    }

    /**
     * Sanea un ID para que sea seguro como atributo HTML id y como
     * argumento de getElementById/querySelector (solo letras, números,
     * guion y guion bajo).
     */
    function sanitizeId(text) {
        const s = String(text ?? '').replace(/[^A-Za-z0-9_-]/g, '_');
        return s || `id_${nextSelectorCounter++}`;
    }

    function selectorDomId(id) {
        return `sel_${sanitizeId(id)}`;
    }

    function generarSelectorId() {
        // Combina contador, timestamp y aleatorio para evitar cualquier colisión.
        return `sel_${Date.now().toString(36)}_${(nextSelectorCounter++).toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function esEtiquetaVacia(label) {
        return ETIQUETAS_VACIAS.has((label || '').trim().toLowerCase());
    }

    function calcularAltura(diametro) {
        const range = config.diamMax - config.diamMin;
        if (range <= 0) return config.altMin;
        const ratio = clamp((diametro - config.diamMin) / range, 0, 1);
        return config.altMin + ratio * (config.altMax - config.altMin);
    }

    function mostrarToast(mensaje, duracion = TOAST_MS) {
        if (!refs.toast) return;
        refs.toast.textContent = mensaje;
        refs.toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => refs.toast.classList.remove('show'), duracion);
    }

    function setVista(estado) {
        if (refs.placeholder) refs.placeholder.style.display = estado === 'placeholder' ? 'flex' : 'none';
        if (refs.loader) refs.loader.style.display = estado === 'loading' ? 'flex' : 'none';
        if (refs.galeria) refs.galeria.classList.toggle('visible', estado === 'image');
        if (refs.errorMsg) refs.errorMsg.style.display = estado === 'error' ? 'block' : 'none';
    }

    function setLoaderText(txt) {
        if (refs.loaderText) refs.loaderText.textContent = txt;
    }

    /**
     * Crea un fetch con timeout y opcionalmente vinculado a un AbortController
     * externo. Devuelve la respuesta o lanza un error.
     */
    async function fetchConTimeout(url, options = {}, timeoutMs = 15000, externalSignal = null) {
        const ctrl = new AbortController();
        const timeoutId = setTimeout(() => ctrl.abort(), timeoutMs);

        const onExternalAbort = () => ctrl.abort();
        if (externalSignal) {
            if (externalSignal.aborted) ctrl.abort();
            else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
        }

        try {
            return await fetch(url, { ...options, signal: ctrl.signal });
        } finally {
            clearTimeout(timeoutId);
            if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
        }
    }

    // ════════════════════════════════════════════════════════════════════
    // PERSISTENCIA
    // ════════════════════════════════════════════════════════════════════

    function validarConfig(c) {
        if (!c || typeof c !== 'object') return null;
        const out = { ...DEFAULT_CONFIG };
        for (const k of ['diamMin', 'diamMax', 'altMin', 'altMax']) {
            const n = Number(c[k]);
            if (Number.isFinite(n) && n > 0) out[k] = n;
        }
        if (out.diamMin >= out.diamMax) return null;
        if (out.altMin >= out.altMax) return null;
        return out;
    }

    function validarImgConfig(c) {
        if (!c || typeof c !== 'object') return null;
        const out = { ...DEFAULT_IMG_CONFIG };
        if (c.provider === PROVIDER_OPENAI || c.provider === PROVIDER_POLLINATIONS) {
            out.provider = c.provider;
        }
        if (typeof c.pollinationsModel === 'string' && POLLINATIONS_MODELOS.includes(c.pollinationsModel)) {
            out.pollinationsModel = c.pollinationsModel;
        }
        if (typeof c.openaiModel === 'string' && OPENAI_MODELOS.includes(c.openaiModel)) {
            out.openaiModel = c.openaiModel;
        }
        if (typeof c.openaiKey === 'string') {
            out.openaiKey = c.openaiKey.trim();
        }
        return out;
    }

    function validarSelectores(arr) {
        if (!Array.isArray(arr)) return null;
        const limpios = [];
        for (const s of arr) {
            if (!s || typeof s !== 'object') continue;
            const id = typeof s.id === 'string' && s.id.trim() ? s.id.trim() : generarSelectorId();
            const etiqueta = typeof s.etiqueta === 'string' && s.etiqueta.trim()
                ? s.etiqueta.trim()
                : 'Sin nombre';
            const opciones = Array.isArray(s.opciones)
                ? s.opciones
                    .map((o) => {
                        if (!o || typeof o !== 'object') return null;
                        const label = typeof o.label === 'string' ? o.label : '';
                        return label.trim() ? { label } : null;
                    })
                    .filter(Boolean)
                : [];
            if (opciones.length === 0) continue;
            limpios.push({ id, etiqueta, opciones });
        }
        return limpios.length > 0 ? limpios : null;
    }

    function cargarDeStorage() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const data = JSON.parse(raw);
            if (!data || typeof data !== 'object') return;

            const cfg = validarConfig(data.config);
            if (cfg) config = cfg;

            const sels = validarSelectores(data.selectores);
            if (sels) selectores = sels;

            const ic = validarImgConfig(data.imgConfig);
            if (ic) imgConfig = ic;
        } catch (err) {
            console.warn('No se pudo leer la configuración guardada:', err);
        }
    }

    function guardarEnStorage() {
        try {
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({ version: STORAGE_VERSION, config, selectores, imgConfig })
            );
        } catch (err) {
            console.warn('No se pudo guardar la configuración:', err);
        }
    }

    // ════════════════════════════════════════════════════════════════════
    // RENDERIZADO DE SELECTORES (panel principal)
    // ════════════════════════════════════════════════════════════════════

    function renderSelectores() {
        refs.contenedorSel.innerHTML = '';
        if (selectores.length === 0) return;

        selectores.forEach((sel) => {
            const domId = selectorDomId(sel.id);
            const div = document.createElement('div');
            div.className = 'field';

            const label = document.createElement('label');
            label.htmlFor = domId;
            label.textContent = sel.etiqueta;

            const select = document.createElement('select');
            select.id = domId;
            select.dataset.selectorId = sel.id;

            for (const op of sel.opciones) {
                const opt = document.createElement('option');
                opt.value = op.label;
                opt.textContent = op.label;
                select.appendChild(opt);
            }

            div.appendChild(label);
            div.appendChild(select);
            refs.contenedorSel.appendChild(div);
        });
    }

    // ════════════════════════════════════════════════════════════════════
    // DIÁMETRO Y ALTURA
    // ════════════════════════════════════════════════════════════════════

    function aplicarConfigDiametro() {
        refs.inputDiametro.min = config.diamMin;
        refs.inputDiametro.max = config.diamMax;

        if (refs.labelDiametro) {
            refs.labelDiametro.textContent = `Diámetro (${config.diamMin} – ${config.diamMax} cm)`;
        }

        const v = parseFloat(refs.inputDiametro.value);
        if (isNaN(v) || v < config.diamMin) refs.inputDiametro.value = config.diamMin;
        else if (v > config.diamMax) refs.inputDiametro.value = config.diamMax;

        actualizarAltura();
    }

    function actualizarAltura() {
        const d = parseFloat(refs.inputDiametro.value);
        if (!isNaN(d)) {
            refs.alturaLabel.textContent = `Altura estimada: ${calcularAltura(d).toFixed(1)} cm`;
        }
    }

    // ════════════════════════════════════════════════════════════════════
    // CONTEO DE CARACTERES
    // ════════════════════════════════════════════════════════════════════

    function actualizarCharCount() {
        const len = refs.textareaDesc.value.length;
        refs.charCount.textContent = `${len} / ${MAX_DESC}`;
        refs.charCount.classList.toggle('warn', len > WARN_DESC);
    }

    // ════════════════════════════════════════════════════════════════════
    // TRADUCCIÓN ES → EN (con caché y fallback por elemento)
    // ════════════════════════════════════════════════════════════════════

    const translationCache = new Map();

    async function traducirTexto(texto, signal = null) {
        const key = (texto || '').trim();
        if (!key) return '';
        if (translationCache.has(key)) return translationCache.get(key);

        const url = `${TRANSLATE_URL}?q=${encodeURIComponent(key)}&langpair=${TRANSLATE_PAIR}`;
        const res = await fetchConTimeout(url, {}, TRANSLATE_TIMEOUT_MS, signal);
        if (!res.ok) throw new Error(`Traducción HTTP ${res.status}`);
        const data = await res.json();

        const traducido =
            (data && data.responseData && data.responseData.translatedText) || key;
        const limpio = /^MYMEMORY WARNING|^PLEASE SELECT/i.test(traducido) ? key : traducido;

        translationCache.set(key, limpio);
        return limpio;
    }

    /**
     * Traduce varios textos con tolerancia a fallos individuales.
     * Si una traducción falla se conserva el texto original.
     */
    async function traducirVarios(textos, signal = null) {
        const resultados = await Promise.allSettled(
            textos.map((t) => traducirTexto(t, signal))
        );
        return resultados.map((r, i) =>
            r.status === 'fulfilled' ? r.value : textos[i]
        );
    }

    // ════════════════════════════════════════════════════════════════════
    // GENERACIÓN DE PROMPT
    // ════════════════════════════════════════════════════════════════════

    /**
     * Llama al servicio de Pollinations para expandir un brief breve en
     * un prompt de fotografía profesional muy detallado en inglés.
     */
    async function mejorarPromptIA(brief, signal = null) {
        const res = await fetchConTimeout(
            ENHANCE_URL,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'openai',
                    private: true,
                    messages: [
                        { role: 'system', content: ENHANCE_SYSTEM },
                        { role: 'user', content: brief },
                    ],
                }),
            },
            ENHANCE_TIMEOUT_MS,
            signal
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = (await res.text()).trim();
        if (!text) throw new Error('Respuesta vacía');
        return text.replace(/^[`"'\s]+|[`"'\s]+$/g, '').replace(/\s+/g, ' ');
    }

    /**
     * Modo simple de respaldo: traduce los textos al inglés y monta el
     * prompt con plantilla fija.
     */
    async function crearPromptSimple(d, h, desc, extrasEs, signal = null) {
        const aTraducir = [...extrasEs];
        if (desc) aTraducir.push(desc);

        const traducidos = aTraducir.length
            ? await traducirVarios(aTraducir, signal)
            : [];

        const extrasEn = traducidos
            .slice(0, extrasEs.length)
            .map((v) => (v.endsWith('.') ? v : v + '.'));
        const descEn = desc ? traducidos[traducidos.length - 1] : '';

        return [
            'Professional food photography of a completely round cake.',
            `Diameter ${d}cm, height ${h.toFixed(1)}cm.`,
            ...extrasEn,
            descEn ? descEn + '.' : '',
            'Highly realistic, 8k, professional studio lighting, soft shadows, plain cream colored background.',
        ]
            .filter(Boolean)
            .join(' ');
    }

    /**
     * Construye el prompt en inglés. Intenta mejorarlo con IA; si falla,
     * cae al modo simple sin avisar al usuario.
     */
    async function crearPrompt(signal = null) {
        const dRaw = parseFloat(refs.inputDiametro.value);
        const d = clamp(isNaN(dRaw) ? config.diamMin : dRaw, config.diamMin, config.diamMax);
        const h = calcularAltura(d);
        const desc = refs.textareaDesc.value.trim().replace(/\s+/g, ' ');

        const extrasEs = selectores
            .map((sel) => {
                const el = document.getElementById(selectorDomId(sel.id));
                return el ? el.value.trim() : '';
            })
            .filter((v) => v && !esEtiquetaVacia(v));

        const briefPartes = [
            `Tarta perfectamente redonda. Diámetro: ${d} cm. Altura: ${h.toFixed(1)} cm.`,
        ];
        if (extrasEs.length) {
            briefPartes.push(`Opciones seleccionadas: ${extrasEs.join('; ')}.`);
        }
        if (desc) {
            briefPartes.push(`Descripción del cliente: ${desc}`);
        }
        const brief = briefPartes.join(' ');

        try {
            return await mejorarPromptIA(brief, signal);
        } catch (err) {
            if (err && err.name === 'AbortError') throw err;
            console.warn('La mejora con IA falló, se usa modo simple:', err);
            return await crearPromptSimple(d, h, desc, extrasEs, signal);
        }
    }

    // ════════════════════════════════════════════════════════════════════
    // CARGA DE IMAGEN (con reintentos y cancelación limpia)
    // ════════════════════════════════════════════════════════════════════

    function construirUrlPollinations(prompt) {
        const seed = Math.floor(Math.random() * 1_000_000_000);
        const model = imgConfig.pollinationsModel || 'flux';
        return (
            `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
            `?width=1024&height=1024&nologo=true&seed=${seed}` +
            `&model=${encodeURIComponent(model)}`
        );
    }

    /**
     * Precarga una URL de imagen en un objeto Image y resuelve cuando
     * está lista. Permite cancelación por AbortSignal y aplica timeout.
     */
    function precargarImagen(url, signal) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            let done = false;

            const timeoutId = setTimeout(() => {
                if (done) return;
                done = true;
                img.onload = img.onerror = null;
                try { img.src = ''; } catch { /* noop */ }
                reject(new Error('timeout'));
            }, IMG_TIMEOUT_MS);

            const onAbort = () => {
                if (done) return;
                done = true;
                clearTimeout(timeoutId);
                img.onload = img.onerror = null;
                try { img.src = ''; } catch { /* noop */ }
                reject(new Error('cancelado'));
            };
            if (signal) {
                if (signal.aborted) { onAbort(); return; }
                signal.addEventListener('abort', onAbort, { once: true });
            }

            img.onload = () => {
                if (done) return;
                done = true;
                clearTimeout(timeoutId);
                if (signal) signal.removeEventListener('abort', onAbort);
                resolve();
            };
            img.onerror = () => {
                if (done) return;
                done = true;
                clearTimeout(timeoutId);
                if (signal) signal.removeEventListener('abort', onAbort);
                reject(new Error('error de imagen'));
            };
            img.src = url;
        });
    }

    /**
     * Genera una imagen usando Pollinations (gratuito).
     */
    async function obtenerUrlPollinations(prompt, signal) {
        const url = construirUrlPollinations(prompt);
        await precargarImagen(url, signal);
        return url;
    }

    /**
     * Genera una imagen llamando a la API oficial de OpenAI.
     * Devuelve una data URL (base64) o una URL HTTPS.
     */
    async function obtenerUrlOpenAI(prompt, signal) {
        if (!imgConfig.openaiKey) {
            const e = new Error('Falta la API key de OpenAI');
            e.code = 'OPENAI_NO_KEY';
            throw e;
        }
        const body = {
            model: imgConfig.openaiModel,
            prompt,
            size: '1024x1024',
            n: 1,
        };
        if (imgConfig.openaiModel === 'dall-e-3') {
            body.response_format = 'b64_json';
            body.quality = 'hd';
        }

        const res = await fetchConTimeout(
            OPENAI_URL,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${imgConfig.openaiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            },
            IMG_TIMEOUT_MS,
            signal
        );

        if (!res.ok) {
            let detail = '';
            try {
                const j = await res.json();
                detail = (j && j.error && j.error.message) || '';
            } catch { /* noop */ }
            const e = new Error(`OpenAI HTTP ${res.status}${detail ? ': ' + detail : ''}`);
            if (res.status === 401 || res.status === 403) e.code = 'OPENAI_AUTH';
            else if (res.status === 429) e.code = 'OPENAI_RATE';
            throw e;
        }

        const data = await res.json();
        const item = data && data.data && data.data[0];
        if (!item) throw new Error('OpenAI: respuesta vacía');
        if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
        if (item.url) return item.url;
        throw new Error('OpenAI: sin imagen en la respuesta');
    }

    /**
     * Selecciona el proveedor activo y obtiene la URL de la imagen.
     */
    async function obtenerUrlImagen(prompt, signal) {
        if (imgConfig.provider === PROVIDER_OPENAI && imgConfig.openaiKey) {
            return obtenerUrlOpenAI(prompt, signal);
        }
        return obtenerUrlPollinations(prompt, signal);
    }

    /**
     * Bucle de reintentos genérico. No reintenta errores de
     * autenticación de OpenAI (no se arreglan reintentando).
     */
    async function cargarImagenConReintentos(prompt, maxIntentos, seguir, onIntento) {
        let ultimoError = null;
        for (let intento = 1; intento <= maxIntentos; intento++) {
            if (!seguir()) throw new Error('cancelado');
            if (onIntento) onIntento(intento);

            const ctrl = new AbortController();
            try {
                const url = await obtenerUrlImagen(prompt, ctrl.signal);
                if (!seguir()) throw new Error('cancelado');
                return url;
            } catch (err) {
                ultimoError = err;
                if (err && (err.message === 'cancelado' || (err.name === 'AbortError'))) {
                    throw err;
                }
                if (err && (err.code === 'OPENAI_AUTH' || err.code === 'OPENAI_NO_KEY')) {
                    throw err;
                }
                if (!seguir()) throw new Error('cancelado');
                if (intento < maxIntentos) {
                    const delay = IMG_RETRY_DELAYS_MS[Math.min(intento - 1, IMG_RETRY_DELAYS_MS.length - 1)] || 1000;
                    await new Promise((r) => setTimeout(r, delay));
                }
            }
        }
        throw ultimoError || new Error('error de imagen');
    }

    // ════════════════════════════════════════════════════════════════════
    // GENERACIÓN PRINCIPAL
    // ════════════════════════════════════════════════════════════════════

    function abortarFetchActivo() {
        if (activeFetchAbort) {
            try { activeFetchAbort.abort(); } catch { /* noop */ }
            activeFetchAbort = null;
        }
    }

    async function generar() {
        if (imagenes.length >= MAX_IMAGENES) {
            mostrarToast(`Máximo ${MAX_IMAGENES} imágenes. Pulsa "Reiniciar galería" para continuar.`);
            return;
        }

        const myToken = ++requestToken;
        // Cancelar rellenado en segundo plano y cualquier fetch activo
        backgroundToken++;
        generandoEnBackground = false;
        abortarFetchActivo();

        const ctrl = new AbortController();
        activeFetchAbort = ctrl;

        setVista('loading');
        setLoaderText('Preparando prompt...');
        refs.btnGenerar.disabled = true;
        refs.btnCopiar.disabled = true;

        let prompt;
        try {
            prompt = await crearPrompt(ctrl.signal);
        } catch (err) {
            if (myToken !== requestToken) return;
            if (err && err.name !== 'AbortError') console.error(err);
            setVista(imagenes.length ? 'image' : 'error');
            refs.btnCopiar.disabled = false;
            renderGaleria();
            if (!err || err.name !== 'AbortError') {
                mostrarToast('Error preparando el prompt');
            }
            return;
        }
        if (myToken !== requestToken) return;

        setLoaderText('Generando imagen...');

        try {
            const url = await cargarImagenConReintentos(
                prompt,
                IMG_MAX_INTENTOS,
                () => myToken === requestToken,
                (intento) => {
                    if (intento > 1) setLoaderText(`Reintentando (${intento}/${IMG_MAX_INTENTOS})...`);
                }
            );
            if (myToken !== requestToken) return;

            imagenes.push({ url, prompt });
            imagenIdx = imagenes.length - 1;
            // Marcamos el flag antes de renderizar para que el botón
            // "Generar" no parpadee como habilitado.
            generandoEnBackground = imagenes.length < MAX_IMAGENES;
            setVista('image');
            refs.btnCopiar.disabled = false;
            renderGaleria();

            if (imagenes.length < MAX_IMAGENES) {
                rellenarEnSegundoPlano(prompt);
            } else {
                generandoEnBackground = false;
            }
        } catch (err) {
            if (myToken !== requestToken) return;
            if (err && err.message !== 'cancelado') console.error(err);
            if (imagenes.length) {
                setVista('image');
            } else {
                refs.foto.removeAttribute('src');
                urlPintada = '';
                setVista('error');
            }
            refs.btnCopiar.disabled = false;
            renderGaleria();
            if (!err || err.message !== 'cancelado') {
                let msg = 'El servicio de imágenes está saturado. Inténtalo de nuevo en unos segundos.';
                if (err && err.code === 'OPENAI_NO_KEY') {
                    msg = 'Falta la API key de OpenAI. Añádela en Ajustes.';
                } else if (err && err.code === 'OPENAI_AUTH') {
                    msg = 'API key de OpenAI inválida o sin permisos. Revísala en Ajustes.';
                } else if (err && err.code === 'OPENAI_RATE') {
                    msg = 'OpenAI: límite de uso alcanzado. Espera un momento o revisa tu cuenta.';
                } else if (err && /OpenAI/.test(err.message || '')) {
                    msg = err.message;
                }
                mostrarToast(msg);
            }
        } finally {
            if (activeFetchAbort === ctrl) activeFetchAbort = null;
        }
    }

    /**
     * Genera, una a una, las imágenes restantes hasta llegar a MAX_IMAGENES
     * usando el mismo prompt y semillas distintas.
     */
    async function rellenarEnSegundoPlano(prompt) {
        const miToken = ++backgroundToken;
        generandoEnBackground = true;
        renderGaleria();

        await new Promise((r) => setTimeout(r, 400));
        if (miToken !== backgroundToken) return;

        let fallosSeguidos = 0;
        while (imagenes.length < MAX_IMAGENES) {
            if (miToken !== backgroundToken) return;
            try {
                const url = await cargarImagenConReintentos(
                    prompt,
                    IMG_BG_MAX_INTENTOS,
                    () => miToken === backgroundToken
                );
                if (miToken !== backgroundToken) return;
                imagenes.push({ url, prompt });
                fallosSeguidos = 0;
                renderGaleria();
                await new Promise((r) => setTimeout(r, 250));
            } catch (err) {
                if (miToken !== backgroundToken) return;
                fallosSeguidos++;
                if (fallosSeguidos >= 3) {
                    console.warn('Rellenado en segundo plano detenido por errores repetidos.');
                    break;
                }
                await new Promise((r) => setTimeout(r, 1500));
            }
        }

        if (miToken === backgroundToken) {
            generandoEnBackground = false;
            renderGaleria();
        }
    }

    // ════════════════════════════════════════════════════════════════════
    // GALERÍA DE IMÁGENES
    // ════════════════════════════════════════════════════════════════════

    function renderGaleria() {
        const total = imagenes.length;
        if (total === 0) {
            refs.foto.removeAttribute('src');
            urlPintada = '';
            refs.btnPrev.hidden = true;
            refs.btnNext.hidden = true;
            refs.contador.hidden = true;
            refs.btnReiniciar.hidden = true;
            refs.btnGuardarImagen.disabled = true;
            refs.btnGenerar.disabled = false;
            return;
        }

        if (imagenIdx < 0) imagenIdx = 0;
        if (imagenIdx >= total) imagenIdx = total - 1;

        const actual = imagenes[imagenIdx];
        if (urlPintada !== actual.url) {
            refs.foto.src = actual.url;
            urlPintada = actual.url;
        }

        const hayVarias = total > 1 || generandoEnBackground;
        refs.btnPrev.hidden = !hayVarias;
        refs.btnNext.hidden = !hayVarias;
        refs.btnPrev.disabled = imagenIdx === 0;
        refs.btnNext.disabled = imagenIdx >= total - 1;

        refs.contador.hidden = total <= 1 && !generandoEnBackground;
        const sufijo = generandoEnBackground ? ' • generando…' : '';
        refs.contador.textContent = `${imagenIdx + 1} / ${total}${sufijo}`;

        const llegoAlMax = total >= MAX_IMAGENES;
        refs.btnReiniciar.hidden = !llegoAlMax;
        refs.btnGenerar.disabled = llegoAlMax || generandoEnBackground;
        refs.btnGuardarImagen.disabled = false;
    }

    function prevImagen() {
        if (imagenIdx > 0) {
            imagenIdx--;
            renderGaleria();
        }
    }

    function nextImagen() {
        if (imagenIdx < imagenes.length - 1) {
            imagenIdx++;
            renderGaleria();
        }
    }

    function reiniciarGaleria() {
        backgroundToken++;
        requestToken++;
        generandoEnBackground = false;
        abortarFetchActivo();
        imagenes = [];
        imagenIdx = 0;
        urlPintada = '';
        renderGaleria();
        setVista('placeholder');
    }

    async function guardarImagenActual() {
        if (!imagenes.length) return;
        const actual = imagenes[imagenIdx];
        const textoOriginal = refs.btnGuardarImagen.textContent;
        refs.btnGuardarImagen.disabled = true;
        refs.btnGuardarImagen.textContent = 'Descargando...';
        try {
            const res = await fetch(actual.url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            const objectUrl = URL.createObjectURL(blob);
            const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const a = document.createElement('a');
            a.href = objectUrl;
            a.download = `tarta-${ts}.jpg`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
            mostrarToast('✓ Imagen guardada');
        } catch (err) {
            console.error('Error al guardar la imagen:', err);
            mostrarToast('No se pudo guardar la imagen');
        } finally {
            refs.btnGuardarImagen.disabled = false;
            refs.btnGuardarImagen.textContent = textoOriginal;
        }
    }

    // ════════════════════════════════════════════════════════════════════
    // COPIAR PROMPT
    // ════════════════════════════════════════════════════════════════════

    async function copiar() {
        const myToken = ++copyToken;
        const textoOriginal = refs.btnCopiar.textContent;
        refs.btnCopiar.disabled = true;
        refs.btnCopiar.textContent = 'Preparando...';

        let prompt;
        try {
            prompt = await crearPrompt();
        } catch (err) {
            if (myToken !== copyToken) return;
            console.error(err);
            mostrarToast('Error preparando el prompt');
            refs.btnCopiar.disabled = false;
            refs.btnCopiar.textContent = textoOriginal;
            return;
        }

        if (myToken !== copyToken) return;
        refs.btnCopiar.disabled = false;
        refs.btnCopiar.textContent = textoOriginal;

        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            try {
                await navigator.clipboard.writeText(prompt);
                if (myToken !== copyToken) return;
                mostrarToast('✓ Prompt copiado al portapapeles');
                return;
            } catch (err) {
                console.warn('Clipboard API falló, usando fallback:', err);
            }
        }

        if (myToken !== copyToken) return;

        // Fallback para contextos sin permisos o navegadores antiguos
        const ta = document.createElement('textarea');
        ta.value = prompt;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
            const ok = document.execCommand('copy');
            mostrarToast(ok ? '✓ Prompt copiado' : 'No se pudo copiar');
        } catch (err) {
            console.error('Error al copiar:', err);
            mostrarToast('No se pudo copiar');
        } finally {
            document.body.removeChild(ta);
        }
    }

    // ════════════════════════════════════════════════════════════════════
    // MODAL DE AJUSTES
    // ════════════════════════════════════════════════════════════════════

    function abrirModal() {
        snapSelectores = clone(selectores);
        snapConfig = { ...config };
        snapImgConfig = { ...imgConfig };
        lastFocusedBeforeModal = document.activeElement;

        renderModal();
        refs.modalOverlay.hidden = false;
        refs.modalOverlay.classList.add('open');

        requestAnimationFrame(() => {
            if (refs.modalDialog) refs.modalDialog.focus();
        });

        document.addEventListener('keydown', onKeyDownModal);
    }

    function cerrarModal(restaurar = false) {
        if (restaurar) {
            if (snapSelectores) selectores = snapSelectores;
            if (snapConfig) config = snapConfig;
            if (snapImgConfig) imgConfig = snapImgConfig;
        }
        snapSelectores = null;
        snapConfig = null;
        snapImgConfig = null;

        refs.modalOverlay.classList.remove('open');
        refs.modalOverlay.hidden = true;
        document.removeEventListener('keydown', onKeyDownModal);

        if (lastFocusedBeforeModal && typeof lastFocusedBeforeModal.focus === 'function') {
            lastFocusedBeforeModal.focus();
        }
        lastFocusedBeforeModal = null;
    }

    function onKeyDownModal(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            cerrarModal(true);
            return;
        }
        if (e.key === 'Tab') trapFocus(e);
    }

    function trapFocus(e) {
        const focusables = refs.modalDialog.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }

    function renderModal() {
        refs.modalBody.innerHTML = '';

        // Sección de Diámetro y Altura
        const secMedidas = document.createElement('div');
        secMedidas.className = 'ajuste-seccion';
        secMedidas.innerHTML = `
            <div class="selector-nombre-fila" style="border-bottom:none;padding-bottom:0">
                <strong style="font-size:.92rem">Diámetro y Altura</strong>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div class="field">
                    <label for="cfg_diamMin">Diám. mínimo (cm)</label>
                    <input type="number" id="cfg_diamMin" value="${config.diamMin}" min="1" max="200" step="1">
                </div>
                <div class="field">
                    <label for="cfg_diamMax">Diám. máximo (cm)</label>
                    <input type="number" id="cfg_diamMax" value="${config.diamMax}" min="1" max="200" step="1">
                </div>
                <div class="field">
                    <label for="cfg_altMin">Altura mínima (cm)</label>
                    <input type="number" id="cfg_altMin" value="${config.altMin}" min="0.5" max="200" step="0.5">
                </div>
                <div class="field">
                    <label for="cfg_altMax">Altura máxima (cm)</label>
                    <input type="number" id="cfg_altMax" value="${config.altMax}" min="0.5" max="200" step="0.5">
                </div>
            </div>
            <small style="color:var(--muted);font-size:.75rem">
                La altura se calcula proporcionalmente entre estos valores según el diámetro elegido.
            </small>
        `;
        refs.modalBody.appendChild(secMedidas);

        // Sección de proveedor de imagen
        const secImg = document.createElement('div');
        secImg.className = 'ajuste-seccion';
        secImg.innerHTML = `
            <div class="selector-nombre-fila" style="border-bottom:none;padding-bottom:0">
                <strong style="font-size:.92rem">Proveedor de imagen</strong>
            </div>
            <div class="field">
                <label for="cfg_provider">Servicio</label>
                <select id="cfg_provider">
                    <option value="${PROVIDER_POLLINATIONS}">Pollinations (gratis)</option>
                    <option value="${PROVIDER_OPENAI}">OpenAI (de pago, mejor calidad)</option>
                </select>
            </div>
            <div id="cfg_pollinations_box" class="field" style="margin-top:8px">
                <label for="cfg_pollinations_model">Modelo de Pollinations</label>
                <select id="cfg_pollinations_model">
                    ${POLLINATIONS_MODELOS.map((m) => `<option value="${m}">${m}</option>`).join('')}
                </select>
            </div>
            <div id="cfg_openai_box" style="margin-top:8px;display:none">
                <div class="field">
                    <label for="cfg_openai_key">API key de OpenAI</label>
                    <input type="password" id="cfg_openai_key" autocomplete="off" spellcheck="false"
                        placeholder="sk-..." value="">
                    <small style="color:var(--muted);font-size:.72rem;display:block;margin-top:4px">
                        Se guarda solo en este navegador (localStorage). No se envía a ningún sitio salvo OpenAI.
                    </small>
                </div>
                <div class="field" style="margin-top:8px">
                    <label for="cfg_openai_model">Modelo de OpenAI</label>
                    <select id="cfg_openai_model">
                        <option value="gpt-image-1">gpt-image-1 (más nuevo, mejor calidad)</option>
                        <option value="dall-e-3">dall-e-3 (clásico, sin verificación de cuenta)</option>
                    </select>
                </div>
            </div>
        `;
        refs.modalBody.appendChild(secImg);

        // Inicializar valores y comportamiento
        const selProv = secImg.querySelector('#cfg_provider');
        const selPolModel = secImg.querySelector('#cfg_pollinations_model');
        const inpKey = secImg.querySelector('#cfg_openai_key');
        const selOAModel = secImg.querySelector('#cfg_openai_model');
        const boxPol = secImg.querySelector('#cfg_pollinations_box');
        const boxOA = secImg.querySelector('#cfg_openai_box');

        selProv.value = imgConfig.provider;
        selPolModel.value = imgConfig.pollinationsModel;
        selOAModel.value = imgConfig.openaiModel;
        inpKey.value = imgConfig.openaiKey || '';

        const sincronizarVista = () => {
            const esOA = selProv.value === PROVIDER_OPENAI;
            boxPol.style.display = esOA ? 'none' : '';
            boxOA.style.display = esOA ? '' : 'none';
        };
        sincronizarVista();
        selProv.addEventListener('change', sincronizarVista);

        // Secciones de selectores
        selectores.forEach((sel, si) => {
            const sec = document.createElement('div');
            sec.className = 'ajuste-seccion';

            const nombreFila = document.createElement('div');
            nombreFila.className = 'selector-nombre-fila';

            const inpNombre = document.createElement('input');
            inpNombre.type = 'text';
            inpNombre.value = sel.etiqueta;
            inpNombre.placeholder = 'Nombre del selector';
            inpNombre.setAttribute('aria-label', 'Nombre del selector');
            inpNombre.addEventListener('input', (e) => {
                selectores[si].etiqueta = e.target.value;
            });

            const btnDelSel = document.createElement('button');
            btnDelSel.className = 'btn-icon danger';
            btnDelSel.type = 'button';
            btnDelSel.title = 'Eliminar este desplegable';
            btnDelSel.setAttribute('aria-label', 'Eliminar este desplegable');
            btnDelSel.textContent = '🗑';
            btnDelSel.addEventListener('click', () => {
                selectores.splice(si, 1);
                renderModal();
            });

            nombreFila.append(inpNombre, btnDelSel);
            sec.appendChild(nombreFila);

            const colHead = document.createElement('div');
            colHead.className = 'col-headers';
            colHead.innerHTML = `
                <span>Opción</span>
                <span></span>
                <span></span>
                <span></span>
            `;
            sec.appendChild(colHead);

            const lista = document.createElement('div');
            sel.opciones.forEach((op, oi) =>
                lista.appendChild(crearFilaOpcion(si, oi, op, sel.opciones.length))
            );
            sec.appendChild(lista);

            const btnAddOp = document.createElement('button');
            btnAddOp.className = 'btn-add-opcion';
            btnAddOp.type = 'button';
            btnAddOp.textContent = '+ Añadir opción';
            btnAddOp.addEventListener('click', () => {
                selectores[si].opciones.push({ label: 'Nueva opción' });
                renderModal();
            });
            sec.appendChild(btnAddOp);

            refs.modalBody.appendChild(sec);
        });

        // Botón nuevo selector
        const btnNuevo = document.createElement('button');
        btnNuevo.className = 'btn-add-selector';
        btnNuevo.type = 'button';
        btnNuevo.textContent = '＋ Añadir nuevo desplegable';
        btnNuevo.addEventListener('click', () => {
            selectores.push({
                id: generarSelectorId(),
                etiqueta: 'Nuevo desplegable',
                opciones: [
                    { label: 'Opción 1' },
                    { label: 'Opción 2' },
                ],
            });
            renderModal();
        });
        refs.modalBody.appendChild(btnNuevo);
    }

    function crearFilaOpcion(si, oi, op, total) {
        const fila = document.createElement('div');
        fila.className = 'opcion-fila';

        const inpLabel = document.createElement('input');
        inpLabel.type = 'text';
        inpLabel.value = op.label;
        inpLabel.placeholder = 'Texto de la opción';
        inpLabel.setAttribute('aria-label', 'Texto de la opción');
        inpLabel.addEventListener('input', (e) => {
            selectores[si].opciones[oi].label = e.target.value;
        });

        const btnUp = makeIconButton('↑', 'Subir', oi === 0, () => {
            if (oi > 0) {
                const arr = selectores[si].opciones;
                [arr[oi - 1], arr[oi]] = [arr[oi], arr[oi - 1]];
                renderModal();
            }
        });

        const btnDown = makeIconButton('↓', 'Bajar', oi === total - 1, () => {
            const arr = selectores[si].opciones;
            if (oi < arr.length - 1) {
                [arr[oi + 1], arr[oi]] = [arr[oi], arr[oi + 1]];
                renderModal();
            }
        });

        const btnDel = makeIconButton('✕', 'Eliminar', false, () => {
            if (total <= 1) {
                mostrarToast('El selector debe tener al menos una opción');
                return;
            }
            selectores[si].opciones.splice(oi, 1);
            renderModal();
        }, 'danger');

        fila.append(inpLabel, btnUp, btnDown, btnDel);
        return fila;
    }

    function makeIconButton(text, title, disabled, onClick, extraClass = '') {
        const btn = document.createElement('button');
        btn.className = 'btn-icon' + (extraClass ? ' ' + extraClass : '');
        btn.type = 'button';
        btn.title = title;
        btn.setAttribute('aria-label', title);
        btn.textContent = text;
        btn.disabled = disabled;
        btn.addEventListener('click', onClick);
        return btn;
    }

    function guardarAjustes() {
        const diamMin = parseFloat(document.getElementById('cfg_diamMin').value);
        const diamMax = parseFloat(document.getElementById('cfg_diamMax').value);
        const altMin = parseFloat(document.getElementById('cfg_altMin').value);
        const altMax = parseFloat(document.getElementById('cfg_altMax').value);

        if ([diamMin, diamMax, altMin, altMax].some((n) => isNaN(n))) {
            mostrarToast('Rellena todos los campos de diámetro y altura');
            return;
        }
        if (diamMin <= 0 || altMin <= 0) {
            mostrarToast('Los valores mínimos deben ser mayores que 0');
            return;
        }
        if (diamMin >= diamMax) {
            mostrarToast('El diámetro mínimo debe ser menor que el máximo');
            return;
        }
        if (altMin >= altMax) {
            mostrarToast('La altura mínima debe ser menor que la máxima');
            return;
        }

        for (const sel of selectores) {
            if (!sel.etiqueta || !sel.etiqueta.trim()) {
                mostrarToast('Un selector no tiene nombre');
                return;
            }
            if (!Array.isArray(sel.opciones) || sel.opciones.length === 0) {
                mostrarToast(`El selector "${sel.etiqueta}" debe tener al menos una opción`);
                return;
            }
            for (const op of sel.opciones) {
                if (!op.label || !op.label.trim()) {
                    mostrarToast('Hay opciones sin texto');
                    return;
                }
            }
        }

        // Capturar configuración del proveedor de imagen
        const provVal = document.getElementById('cfg_provider').value;
        const polModelVal = document.getElementById('cfg_pollinations_model').value;
        const oaKeyVal = document.getElementById('cfg_openai_key').value.trim();
        const oaModelVal = document.getElementById('cfg_openai_model').value;

        if (provVal === PROVIDER_OPENAI && !oaKeyVal) {
            mostrarToast('Para usar OpenAI necesitas pegar tu API key');
            return;
        }

        const nuevoImg = {
            provider: provVal === PROVIDER_OPENAI ? PROVIDER_OPENAI : PROVIDER_POLLINATIONS,
            pollinationsModel: POLLINATIONS_MODELOS.includes(polModelVal) ? polModelVal : 'flux',
            openaiKey: oaKeyVal,
            openaiModel: OPENAI_MODELOS.includes(oaModelVal) ? oaModelVal : 'gpt-image-1',
        };

        config = { diamMin, diamMax, altMin, altMax };
        imgConfig = nuevoImg;

        snapSelectores = null;
        snapConfig = null;
        snapImgConfig = null;

        cerrarModal(false);
        renderSelectores();
        aplicarConfigDiametro();
        guardarEnStorage();
        mostrarToast('✓ Ajustes guardados');
    }

    // ════════════════════════════════════════════════════════════════════
    // EVENTOS
    // ════════════════════════════════════════════════════════════════════

    function inicializarEventos() {
        refs.inputDiametro.addEventListener('input', actualizarAltura);
        refs.inputDiametro.addEventListener('change', () => {
            const v = parseFloat(refs.inputDiametro.value);
            if (isNaN(v)) {
                refs.inputDiametro.value = config.diamMin;
            } else {
                refs.inputDiametro.value = clamp(v, config.diamMin, config.diamMax);
            }
            actualizarAltura();
        });

        refs.textareaDesc.addEventListener('input', actualizarCharCount);
        refs.btnGenerar.addEventListener('click', generar);
        refs.btnCopiar.addEventListener('click', copiar);
        refs.btnGuardarImagen.addEventListener('click', guardarImagenActual);
        refs.btnPrev.addEventListener('click', prevImagen);
        refs.btnNext.addEventListener('click', nextImagen);
        refs.btnReiniciar.addEventListener('click', reiniciarGaleria);
        refs.btnAjustes.addEventListener('click', abrirModal);
        refs.btnCerrarModal.addEventListener('click', () => cerrarModal(true));
        refs.btnCancelar.addEventListener('click', () => cerrarModal(true));
        refs.btnGuardar.addEventListener('click', guardarAjustes);

        refs.modalOverlay.addEventListener('click', (e) => {
            if (e.target === refs.modalOverlay) cerrarModal(true);
        });
    }

    // ════════════════════════════════════════════════════════════════════
    // INICIALIZACIÓN
    // ════════════════════════════════════════════════════════════════════

    function init() {
        cargarDeStorage();
        actualizarAltura();
        actualizarCharCount();
        renderSelectores();
        aplicarConfigDiametro();
        setVista('placeholder');
        inicializarEventos();
    }

    return { init };
})();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => APP.init());
} else {
    APP.init();
}
