/**
 * Configurador de Tartas Profesional · v4
 * Adaptado para PC y móvil — accesible, seguro y responsivo.
 */
(() => {
    'use strict';

    // ── Referencias DOM ──
    const $ = (id) => document.getElementById(id);
    const refs = {
        inputDiametro: $('inputDiametro'),
        labelDiametro: $('labelDiametro'),
        textareaDesc: $('textareaDesc'),
        charCount: $('charCount'),
        alturaLabel: $('alturaLabel'),
        btnGenerar: $('btnGenerar'),
        btnCopiar: $('btnCopiar'),
        btnDescargar: $('btnDescargar'),
        btnWhatsApp: $('btnWhatsApp'),
        btnAjustes: $('btnAjustes'),
        contenedorSel: $('selectores-dinamicos'),
        placeholder: $('placeholder'),
        loader: $('loader'),
        btnCancelar2: $('btnCancelar2'),
        fotoMarco: $('fotoMarco'),
        foto: $('foto'),
        errorMsg: $('errorMsg'),
        toast: $('toast'),
        modalOverlay: $('modalOverlay'),
        btnCerrarModal: $('btnCerrarModal'),
        btnCancelar: $('btnCancelar'),
        btnGuardar: $('btnGuardar'),
        btnAddSelector: $('btnAddSelector'),
        listaAjustesSel: $('lista-ajustes-selectores'),
        adj_whatsapp: $('adj_whatsapp'),
        adj_diamMin: $('adj_diamMin'),
        adj_diamMax: $('adj_diamMax'),
        historial: $('historial'),
        historialList: $('historialList'),
    };

    // ── Estado ──
    const DEFAULT_CONFIG = {
        diamMin: 20, diamMax: 40,
        altMin: 10, altMax: 20,
        tiendaWhatsApp: '34600000000',
    };
    const DEFAULT_SELECTORES = [
        { id: 'frosting', etiqueta: 'Cobertura', opciones: ['Fondant', 'Buttercream', 'Ganache', 'Nata'] },
        { id: 'flavor',   etiqueta: 'Sabor',     opciones: ['Vainilla', 'Chocolate', 'Red Velvet', 'Zanahoria'] },
    ];

    let config = { ...DEFAULT_CONFIG };
    let selectores = JSON.parse(JSON.stringify(DEFAULT_SELECTORES));
    let editSelectores = []; // copia de trabajo del modal
    let toastTimer = null;
    let currentImageController = null; // para cancelar generación
    let lastFocus = null;
    let historial = []; // [{src, prompt, ts}]
    const HIST_MAX = 5;

    // ── Persistencia ──
    function load() {
        try {
            const c = localStorage.getItem('tarta_config');
            const s = localStorage.getItem('tarta_selectores');
            const h = localStorage.getItem('tarta_historial');
            if (c) config = { ...DEFAULT_CONFIG, ...JSON.parse(c) };
            if (s) selectores = JSON.parse(s);
            if (h) historial = JSON.parse(h);
        } catch (e) { console.warn('Error cargando configuración:', e); }
    }
    function persist() {
        try {
            localStorage.setItem('tarta_config', JSON.stringify(config));
            localStorage.setItem('tarta_selectores', JSON.stringify(selectores));
            localStorage.setItem('tarta_historial', JSON.stringify(historial));
        } catch (e) { console.warn('Error guardando:', e); }
    }

    // ── Inicialización ──
    function init() {
        load();
        applyConfigToInputs();
        renderSelectores();
        renderHistorial();
        bindEvents();
        actualizarAltura();
        actualizarCharCount();
    }

    function applyConfigToInputs() {
        if (refs.inputDiametro) {
            refs.inputDiametro.min = config.diamMin;
            refs.inputDiametro.max = config.diamMax;
            const v = parseInt(refs.inputDiametro.value, 10);
            if (isNaN(v) || v < config.diamMin || v > config.diamMax) {
                refs.inputDiametro.value = Math.round((config.diamMin + config.diamMax) / 2);
            }
        }
    }

    // ── Eventos ──
    function bindEvents() {
        refs.inputDiametro?.addEventListener('input', actualizarAltura);
        refs.textareaDesc?.addEventListener('input', actualizarCharCount);
        refs.btnGenerar?.addEventListener('click', generarImagen);
        refs.btnCopiar?.addEventListener('click', copiarPrompt);
        refs.btnDescargar?.addEventListener('click', descargarImagen);
        refs.btnWhatsApp?.addEventListener('click', enviarWhatsApp);
        refs.btnCancelar2?.addEventListener('click', cancelarGeneracion);

        refs.btnAjustes?.addEventListener('click', abrirModal);
        refs.btnCerrarModal?.addEventListener('click', cerrarModal);
        refs.btnCancelar?.addEventListener('click', cerrarModal);
        refs.btnGuardar?.addEventListener('click', guardarAjustes);
        refs.btnAddSelector?.addEventListener('click', addSelectorEdit);

        // Cierre del modal al hacer clic en backdrop
        refs.modalOverlay?.addEventListener('click', (e) => {
            if (e.target === refs.modalOverlay) cerrarModal();
        });

        // Delegación de eventos en la lista del modal (en lugar de onclick inline)
        refs.listaAjustesSel?.addEventListener('click', handleListaClick);
        refs.listaAjustesSel?.addEventListener('input', handleListaInput);
        refs.listaAjustesSel?.addEventListener('keydown', handleListaKeydown);

        // Atajos de teclado (PC)
        document.addEventListener('keydown', handleKeyboard);

        // Gestos: swipe-down sobre el modal en móvil para cerrarlo
        bindSwipeToClose();

        // Click en historial
        refs.historialList?.addEventListener('click', (e) => {
            const img = e.target.closest('img[data-idx]');
            if (img) restaurarHistorial(parseInt(img.dataset.idx, 10));
        });
    }

    // ── UI: Altura y contadores ──
    function actualizarAltura() {
        const d = parseInt(refs.inputDiametro?.value, 10) || config.diamMin;
        const range = (config.diamMax - config.diamMin) || 1;
        const ratio = Math.max(0, Math.min(1, (d - config.diamMin) / range));
        const h = config.altMin + ratio * (config.altMax - config.altMin);
        if (refs.alturaLabel) refs.alturaLabel.textContent = `Altura estimada: ${h.toFixed(1)} cm`;
        if (refs.labelDiametro) refs.labelDiametro.textContent = `Diámetro (${config.diamMin} – ${config.diamMax} cm)`;
    }

    function actualizarCharCount() {
        const len = refs.textareaDesc?.value.length || 0;
        if (refs.charCount) refs.charCount.textContent = `${len} / 300`;
    }

    // ── Render: Selectores del panel ──
    function renderSelectores() {
        if (!refs.contenedorSel) return;
        refs.contenedorSel.replaceChildren();
        selectores.forEach((sel) => {
            const div = document.createElement('div');
            div.className = 'field';
            const label = document.createElement('label');
            label.htmlFor = `sel_${sel.id}`;
            label.textContent = sel.etiqueta;
            const select = document.createElement('select');
            select.id = `sel_${sel.id}`;
            sel.opciones.forEach(opt => {
                const o = document.createElement('option');
                o.value = opt; o.textContent = opt;
                select.appendChild(o);
            });
            div.appendChild(label);
            div.appendChild(select);
            refs.contenedorSel.appendChild(div);
        });
    }

    // ── Construcción del prompt ──
    function crearPrompt() {
        const d = refs.inputDiametro?.value || config.diamMin;
        const desc = refs.textareaDesc?.value.trim() || '';
        const detalles = selectores.map(sel => {
            const el = $(`sel_${sel.id}`);
            const valor = el ? el.value : (sel.opciones[0] || '');
            return valor ? `${sel.etiqueta}: ${valor}` : '';
        }).filter(Boolean).join(', ');

        const partes = [
            'Professional food photography of a round cake',
            `${d}cm diameter`,
            detalles,
            desc,
            'High resolution, studio lighting, plain background, 8k',
        ].filter(Boolean);

        return partes.join('. ').replace(/\s+/g, ' ').trim();
    }

    // ── Generación de imagen ──
    function generarImagen() {
        const prompt = crearPrompt();
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true&seed=${Date.now()}`;

        cancelarGeneracion(); // por si había una en curso
        setVista('loading');
        if (refs.btnGenerar) refs.btnGenerar.disabled = true;

        const ctrl = { cancelled: false };
        currentImageController = ctrl;

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            if (ctrl.cancelled) return;
            if (refs.foto) {
                refs.foto.src = url;
                refs.foto.alt = `Tarta generada: ${prompt.slice(0, 80)}…`;
            }
            setVista('image');
            if (refs.btnGenerar) refs.btnGenerar.disabled = false;
            if (refs.btnDescargar) refs.btnDescargar.disabled = false;
            agregarHistorial({ src: url, prompt, ts: Date.now() });
            currentImageController = null;
        };
        img.onerror = () => {
            if (ctrl.cancelled) return;
            setVista('error');
            if (refs.btnGenerar) refs.btnGenerar.disabled = false;
            currentImageController = null;
        };
        img.src = url;
    }

    function cancelarGeneracion() {
        if (currentImageController) {
            currentImageController.cancelled = true;
            currentImageController = null;
            if (refs.btnGenerar) refs.btnGenerar.disabled = false;
            // Si no hay imagen previa, vuelve al placeholder
            if (!refs.foto?.src) setVista('placeholder');
            else setVista('image');
        }
    }

    // ── Historial ──
    function agregarHistorial(item) {
        // evita duplicados consecutivos del mismo prompt
        if (historial[0]?.prompt === item.prompt) historial[0] = item;
        else historial.unshift(item);
        historial = historial.slice(0, HIST_MAX);
        persist();
        renderHistorial();
    }

    function renderHistorial() {
        if (!refs.historial || !refs.historialList) return;
        refs.historialList.replaceChildren();
        if (!historial.length) { refs.historial.hidden = true; return; }
        refs.historial.hidden = false;
        historial.forEach((it, idx) => {
            const img = document.createElement('img');
            img.src = it.src;
            img.alt = `Generación reciente ${idx + 1}`;
            img.dataset.idx = String(idx);
            img.loading = 'lazy';
            img.tabIndex = 0;
            refs.historialList.appendChild(img);
        });
    }

    function restaurarHistorial(idx) {
        const it = historial[idx];
        if (!it || !refs.foto) return;
        refs.foto.src = it.src;
        refs.foto.alt = `Tarta restaurada: ${it.prompt.slice(0, 80)}…`;
        setVista('image');
        if (refs.btnDescargar) refs.btnDescargar.disabled = false;
    }

    // ── Descargar / Copiar / WhatsApp ──
    async function descargarImagen() {
        if (!refs.foto?.src) return;
        try {
            const response = await fetch(refs.foto.src);
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const blob = await response.blob();
            const objUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = objUrl;
            a.download = `tarta-${Date.now()}.jpg`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(objUrl);
            mostrarToast('✓ Imagen descargada');
        } catch (e) {
            console.error('Error descargando:', e);
            // Fallback: abrir en nueva pestaña
            window.open(refs.foto.src, '_blank', 'noopener');
            mostrarToast('Abierta en nueva pestaña');
        }
    }

    async function copiarPrompt() {
        const prompt = crearPrompt();
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(prompt);
            } else {
                const ta = document.createElement('textarea');
                ta.value = prompt;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                ta.remove();
            }
            mostrarToast('✓ Prompt copiado');
        } catch (e) {
            console.error('Error al copiar:', e);
            mostrarToast('No se pudo copiar');
        }
    }

    function enviarWhatsApp() {
        const lines = [`¡Hola! Encargo de tarta:`, `- Diámetro: ${refs.inputDiametro?.value || ''} cm`];
        selectores.forEach(sel => {
            const el = $(`sel_${sel.id}`);
            const valor = el ? el.value : (sel.opciones[0] || '');
            lines.push(`- ${sel.etiqueta}: ${valor}`);
        });
        if (refs.textareaDesc?.value) lines.push(`- Notas: ${refs.textareaDesc.value}`);
        const msg = lines.join('\n');
        const phone = String(config.tiendaWhatsApp || '').replace(/\D/g, '');
        if (!phone) { mostrarToast('Configura el WhatsApp en ajustes'); return; }
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
    }

    // ── Modal de ajustes ──
    function abrirModal() {
        lastFocus = document.activeElement;
        editSelectores = JSON.parse(JSON.stringify(selectores));
        if (refs.adj_whatsapp) refs.adj_whatsapp.value = config.tiendaWhatsApp;
        if (refs.adj_diamMin) refs.adj_diamMin.value = config.diamMin;
        if (refs.adj_diamMax) refs.adj_diamMax.value = config.diamMax;
        renderEditSelectores();
        if (refs.modalOverlay) {
            refs.modalOverlay.hidden = false;
            // forzar reflow para que la transición se aplique
            void refs.modalOverlay.offsetWidth;
            refs.modalOverlay.classList.add('open');
            document.body.style.overflow = 'hidden';
            // foco
            setTimeout(() => refs.btnCerrarModal?.focus(), 50);
        }
    }

    function cerrarModal() {
        if (!refs.modalOverlay) return;
        refs.modalOverlay.classList.remove('open');
        document.body.style.overflow = '';
        setTimeout(() => {
            refs.modalOverlay.hidden = true;
            lastFocus?.focus();
        }, 280);
    }

    function renderEditSelectores() {
        if (!refs.listaAjustesSel) return;
        refs.listaAjustesSel.replaceChildren();
        editSelectores.forEach((sel, sIdx) => {
            const item = document.createElement('div');
            item.className = 'selector-item';
            item.dataset.sIdx = String(sIdx);

            const header = document.createElement('div');
            header.className = 'selector-item-header';
            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.value = sel.etiqueta;
            nameInput.placeholder = 'Nombre del campo (ej: Relleno)';
            nameInput.dataset.action = 'rename';
            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'btn-eliminar-sel';
            delBtn.textContent = '✕';
            delBtn.setAttribute('aria-label', `Eliminar campo ${sel.etiqueta}`);
            delBtn.dataset.action = 'del-sel';
            header.appendChild(nameInput);
            header.appendChild(delBtn);

            const opts = document.createElement('div');
            opts.className = 'opciones-list';
            sel.opciones.forEach((opt, oIdx) => {
                const tag = document.createElement('span');
                tag.className = 'opcion-tag';
                tag.textContent = opt + ' ';
                const x = document.createElement('button');
                x.type = 'button';
                x.textContent = '✕';
                x.setAttribute('aria-label', `Eliminar opción ${opt}`);
                x.dataset.action = 'del-opt';
                x.dataset.oIdx = String(oIdx);
                tag.appendChild(x);
                opts.appendChild(tag);
            });
            const optInput = document.createElement('input');
            optInput.type = 'text';
            optInput.placeholder = '+ Añadir opción (Enter)';
            optInput.className = 'opcion-input';
            optInput.dataset.action = 'add-opt';
            opts.appendChild(optInput);

            item.appendChild(header);
            item.appendChild(opts);
            refs.listaAjustesSel.appendChild(item);
        });
    }

    function getSidx(target) {
        const it = target.closest('.selector-item');
        return it ? parseInt(it.dataset.sIdx, 10) : -1;
    }

    function handleListaClick(e) {
        const t = e.target;
        const action = t.dataset?.action;
        const sIdx = getSidx(t);
        if (sIdx < 0) return;
        if (action === 'del-sel') {
            editSelectores.splice(sIdx, 1);
            renderEditSelectores();
        } else if (action === 'del-opt') {
            const oIdx = parseInt(t.dataset.oIdx, 10);
            editSelectores[sIdx].opciones.splice(oIdx, 1);
            renderEditSelectores();
        }
    }

    function handleListaInput(e) {
        const t = e.target;
        if (t.dataset?.action === 'rename') {
            const sIdx = getSidx(t);
            if (sIdx >= 0) editSelectores[sIdx].etiqueta = t.value;
        }
    }

    function handleListaKeydown(e) {
        const t = e.target;
        if (t.dataset?.action === 'add-opt' && e.key === 'Enter') {
            e.preventDefault();
            const sIdx = getSidx(t);
            const val = t.value.trim();
            if (val && sIdx >= 0) {
                editSelectores[sIdx].opciones.push(val);
                renderEditSelectores();
                // refoco en el nuevo input del mismo selector
                setTimeout(() => {
                    const newItem = refs.listaAjustesSel.querySelector(`.selector-item[data-s-idx="${sIdx}"] [data-action="add-opt"]`);
                    newItem?.focus();
                }, 0);
            }
        }
    }

    function addSelectorEdit() {
        editSelectores.push({
            id: 's' + Date.now(),
            etiqueta: 'Nuevo campo',
            opciones: ['Opción 1'],
        });
        renderEditSelectores();
    }

    function guardarAjustes() {
        const wa = (refs.adj_whatsapp?.value || '').trim();
        const min = parseInt(refs.adj_diamMin?.value, 10);
        const max = parseInt(refs.adj_diamMax?.value, 10);

        if (wa) config.tiendaWhatsApp = wa;
        if (!isNaN(min) && min > 0) config.diamMin = min;
        if (!isNaN(max) && max > config.diamMin) config.diamMax = max;
        // Limpiar selectores con etiqueta vacía
        selectores = editSelectores
            .map(s => ({ ...s, etiqueta: (s.etiqueta || '').trim() || 'Campo' }))
            .filter(s => Array.isArray(s.opciones) && s.opciones.length);

        persist();
        applyConfigToInputs();
        renderSelectores();
        actualizarAltura();
        cerrarModal();
        mostrarToast('✓ Ajustes guardados');
    }

    // ── Vista (placeholder/loader/imagen/error) ──
    function setVista(estado) {
        if (refs.placeholder) refs.placeholder.style.display = estado === 'placeholder' ? 'flex' : 'none';
        if (refs.loader) refs.loader.classList.toggle('active', estado === 'loading');
        if (refs.fotoMarco) refs.fotoMarco.classList.toggle('visible', estado === 'image');
        if (refs.errorMsg) refs.errorMsg.classList.toggle('visible', estado === 'error');
    }

    // ── Toast ──
    function mostrarToast(msg) {
        if (!refs.toast) return;
        refs.toast.textContent = msg;
        refs.toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => refs.toast.classList.remove('show'), 2200);
    }

    // ── Atajos de teclado (PC) ──
    function handleKeyboard(e) {
        // Escape: cierra modal
        if (e.key === 'Escape' && refs.modalOverlay && !refs.modalOverlay.hidden) {
            cerrarModal();
            return;
        }
        // No interferir mientras se escribe en campos de texto (excepto atajos con Ctrl/Cmd)
        const inField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
        const mod = e.ctrlKey || e.metaKey;

        if (mod && (e.key === 'g' || e.key === 'G')) {
            e.preventDefault();
            if (!refs.btnGenerar?.disabled) refs.btnGenerar.click();
        } else if (mod && (e.key === 's' || e.key === 'S')) {
            e.preventDefault();
            if (!refs.btnDescargar?.disabled) refs.btnDescargar.click();
        } else if (mod && e.shiftKey && (e.key === 'c' || e.key === 'C')) {
            e.preventDefault();
            refs.btnCopiar?.click();
        } else if (!inField && (e.key === 's' || e.key === 'S') && !mod) {
            // Tecla S abre ajustes (solo cuando no se está escribiendo)
            e.preventDefault();
            refs.btnAjustes?.click();
        }
    }

    // ── Swipe-down para cerrar modal en móvil ──
    function bindSwipeToClose() {
        const modal = refs.modalOverlay?.querySelector('.modal');
        const handle = refs.modalOverlay?.querySelector('.modal-drag-handle');
        if (!modal || !handle) return;

        let startY = 0, currentY = 0, dragging = false;

        const onStart = (e) => {
            const t = e.touches ? e.touches[0] : e;
            startY = t.clientY;
            dragging = true;
            modal.style.transition = 'none';
        };
        const onMove = (e) => {
            if (!dragging) return;
            const t = e.touches ? e.touches[0] : e;
            currentY = t.clientY - startY;
            if (currentY > 0) modal.style.transform = `translateY(${currentY}px)`;
        };
        const onEnd = () => {
            if (!dragging) return;
            dragging = false;
            modal.style.transition = '';
            if (currentY > 100) {
                cerrarModal();
            } else {
                modal.style.transform = '';
            }
            currentY = 0;
        };

        handle.addEventListener('touchstart', onStart, { passive: true });
        handle.addEventListener('touchmove', onMove, { passive: true });
        handle.addEventListener('touchend', onEnd);
        handle.addEventListener('mousedown', onStart);
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
    }

    // ── Arranque ──
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
