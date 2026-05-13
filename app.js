document.addEventListener('DOMContentLoaded', () => {

    // --- REFERENCIAS DOM ---
    const els = {
        config: document.getElementById('configuracion'),
        timer: document.getElementById('temporizador'),
        lista: document.getElementById('lista-ejercicios'),
        barraProgresoContainer: document.getElementById('barra-progreso-container'),
        barraProgreso: document.getElementById('barra-progreso-relleno'),
        modal: document.getElementById('modal-importar'),
        txtImport: document.getElementById('texto-importar'),
        btnOpenImport: document.getElementById('btn-abrir-importar'),
        btnCloseImport: document.getElementById('btn-cerrar-modal'),
        btnProcessImport: document.getElementById('btn-procesar-importacion'),
        containerNotas: document.getElementById('contenedor-notas'),
        btnToggleNotas: document.getElementById('btn-toggle-notas'),
        txtNotas: document.getElementById('texto-notas'),
        inputs: {
            descansoSeries: document.getElementById('descanso-series'),
            descansoEjer: document.getElementById('descanso-ejercicios'),
            tipo: document.getElementById('tipo-nuevo-ejercicio')
        },
        display: {
            container: document.getElementById('display-container'),
            main: document.getElementById('display-principal'),
            label: document.getElementById('timer-label'),
            header: document.getElementById('nombre-ejercicio-actual'),
            progresoTexto: document.getElementById('progreso-texto'),
            detalleSerie: document.getElementById('info-detalle'),
            detalleReps: document.getElementById('info-reps'),
            siguiente: document.getElementById('info-siguiente-ejercicio')
        },
        btns: {
            add: document.getElementById('btn-add-ejercicio'),
            start: document.getElementById('btn-comenzar'),
            action: document.getElementById('btn-accion'),
            stop: document.getElementById('btn-finalizar'),
            reset: document.getElementById('btn-reset-storage')
        },
        audio: {
            ejercicio: document.getElementById('audio-start-ejercicio'),
            descanso: document.getElementById('audio-start-descanso'),
            serie: document.getElementById('audio-start-serie'),
            beep: document.getElementById('audio-beep'),
            tabataRest: document.getElementById('audio-tabata-rest')
        }
    };

    // --- ESTADO ---
    let rutina = [];
    let wakeLock = null;
    let estadoApp = {
        activo: false,
        ejercicioIdx: 0,
        serieActual: 0,
        fase: 'ready',
        intervalo: null,
        tiempoRestante: 0,
        tiempoTranscurrido: 0,
        tabataRonda: 0,
        duracionFaseActual: 0
    };

    // ============================================================
    // WAKE LOCK — evita que la pantalla se apague durante rutina
    // ============================================================
    async function activarWakeLock() {
        if ('wakeLock' in navigator) {
            try {
                wakeLock = await navigator.wakeLock.request('screen');
            } catch (e) {
                console.warn('Wake Lock no disponible:', e);
            }
        }
    }

    async function liberarWakeLock() {
        if (wakeLock) {
            await wakeLock.release();
            wakeLock = null;
        }
    }

    // Reactivar Wake Lock si el usuario vuelve a la pestaña
    document.addEventListener('visibilitychange', async () => {
        if (wakeLock !== null && document.visibilityState === 'visible' && estadoApp.activo) {
            await activarWakeLock();
        }
    });

    // ============================================================
    // VIBRACIÓN HÁPTICA
    // ============================================================
    function vibrar(patron) {
        if ('vibrate' in navigator) {
            navigator.vibrate(patron);
        }
    }
    // Patrones:
    const VIB = {
        inicio: [100, 50, 100],       // doble pulso: nueva serie/ejercicio
        descanso: [300],              // pulso largo: a descansar
        beepFinal: [50],              // pulso corto: cuenta atrás final
        fin: [200, 100, 200, 100, 400] // patrón largo: entrenamiento terminado
    };

    // ============================================================
    // ARCO SVG ANIMADO
    // ============================================================
    // Inyectamos el SVG del arco en el display-container
    function inyectarArcoSVG() {
        const container = els.display.container;
        // Evitar duplicados
        if (container.querySelector('.arco-svg')) return;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'arco-svg');
        svg.setAttribute('viewBox', '0 0 260 260');
        svg.style.cssText = `
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            pointer-events: none;
            transform: rotate(-90deg);
        `;

        const R = 120;
        const CX = 130, CY = 130;
        const CIRC = 2 * Math.PI * R;

        // Pista de fondo (gris)
        const trackBg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        trackBg.setAttribute('cx', CX); trackBg.setAttribute('cy', CY); trackBg.setAttribute('r', R);
        trackBg.setAttribute('fill', 'none');
        trackBg.setAttribute('stroke', 'rgba(255,255,255,0.07)');
        trackBg.setAttribute('stroke-width', '8');
        svg.appendChild(trackBg);

        // Arco activo
        const arc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        arc.setAttribute('id', 'arco-activo');
        arc.setAttribute('cx', CX); arc.setAttribute('cy', CY); arc.setAttribute('r', R);
        arc.setAttribute('fill', 'none');
        arc.setAttribute('stroke', '#4CAF50');
        arc.setAttribute('stroke-width', '8');
        arc.setAttribute('stroke-linecap', 'round');
        arc.setAttribute('stroke-dasharray', CIRC);
        arc.setAttribute('stroke-dashoffset', CIRC); // empieza vacío
        arc.style.transition = 'stroke-dashoffset 1s linear, stroke 0.3s ease';
        svg.appendChild(arc);

        // El container necesita position:relative para que el SVG se superponga
        container.style.position = 'relative';
        container.insertBefore(svg, container.firstChild);
    }

    function actualizarArco(tiempoRestante, duracionTotal, color) {
        const arc = document.getElementById('arco-activo');
        if (!arc || duracionTotal <= 0) return;
        const R = 120;
        const CIRC = 2 * Math.PI * R;
        const progreso = tiempoRestante / duracionTotal;
        arc.setAttribute('stroke-dashoffset', CIRC * (1 - progreso));
        if (color) arc.setAttribute('stroke', color);
    }

    function resetArco() {
        const arc = document.getElementById('arco-activo');
        if (!arc) return;
        const R = 120;
        arc.setAttribute('stroke-dashoffset', 2 * Math.PI * R);
    }

    // ============================================================
    // PERSISTENCIA
    // ============================================================
    function guardarDatos() {
        const data = {
            rutina,
            tSeries: els.inputs.descansoSeries.value,
            tEjer: els.inputs.descansoEjer.value
        };
        localStorage.setItem('desencadenadoData', JSON.stringify(data));
    }

    function cargarDatos() {
        const saved = localStorage.getItem('desencadenadoData');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                rutina = data.rutina || [];
                els.inputs.descansoSeries.value = data.tSeries || "01:00";
                els.inputs.descansoEjer.value = data.tEjer || "02:00";
                renderRutina();
            } catch (e) {
                console.warn('Error cargando datos guardados, reseteando.');
                localStorage.removeItem('desencadenadoData');
                agregarEjercicio('Flexiones', 'normal', 3, 10);
            }
        } else {
            agregarEjercicio('Flexiones', 'normal', 3, 10);
        }
    }

    // ============================================================
    // VALIDACIÓN mm:ss
    // ============================================================
    function parsearTiempo(str) {
        if (!str || typeof str !== 'string') return 60;
        const partes = str.split(':');
        if (partes.length !== 2) return 60;
        const min = parseInt(partes[0]);
        const sec = parseInt(partes[1]);
        if (isNaN(min) || isNaN(sec) || sec > 59 || sec < 0 || min < 0) return 60;
        return (min * 60) + sec;
    }

    function validarInputTiempo(input) {
        const val = parsearTiempo(input.value);
        // Reformatear siempre como mm:ss
        const m = Math.floor(val / 60);
        const s = val % 60;
        input.value = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        return val;
    }

    // ============================================================
    // GESTIÓN DE RUTINA
    // ============================================================
    function agregarEjercicio(nombre = "", tipo = "normal", series = 3, reps = 10, comentario = "") {
        if (!nombre) {
            nombre = prompt("Nombre del Ejercicio:", "Nuevo Ejercicio");
            if (!nombre) return;
            tipo = els.inputs.tipo.value;
        }

        let config = { id: Date.now() + Math.random(), nombre, tipo, series, reps, comentario };

        if (tipo === 'tabata' && series === 3) config.series = 8;
        if (tipo === 'piramide' && series === 3) config.series = 7;
        // Regresiva: valor por defecto en segundos
        if (tipo === 'regresiva' && series === 3) config.series = 30;

        rutina.push(config);
        renderRutina();
        guardarDatos();
    }

    // ============================================================
    // IMPORTACIÓN
    // ============================================================
    function importarRutinaTexto() {
        const texto = els.txtImport.value.trim();
        if (!texto) return;

        const lineas = texto.split('\n');
        let importados = 0;

        if (confirm("¿Quieres borrar la rutina actual antes de importar? (Cancelar para añadir al final)")) {
            rutina = [];
        }

        lineas.forEach(linea => {
            linea = linea.trim();
            if (!linea || linea.startsWith('#')) return;

            let comentario = "";
            const matchComentario = linea.match(/\[(.*?)\]/);
            if (matchComentario) {
                comentario = matchComentario[1];
                linea = linea.replace(matchComentario[0], '');
            }

            const partes = linea.split(';');
            if (partes.length >= 2) {
                const tipoRaw = partes[0].trim().toLowerCase();
                const nombre = partes[1].trim();
                const series = parseInt(partes[2]) || 3;
                const reps = partes[3] ? partes[3].trim() : '10';

                let tipo = 'normal';
                if (tipoRaw.includes('tabata')) tipo = 'tabata';
                else if (tipoRaw.includes('pirami')) tipo = 'piramide';
                else if (tipoRaw.includes('super')) tipo = 'superset';
                else if (tipoRaw.includes('regresiva') || tipoRaw.includes('regresivo')) tipo = 'regresiva';

                let config = {
                    id: Date.now() + Math.random(),
                    nombre, tipo, series,
                    reps: reps === '-' ? 0 : (parseInt(reps) || 10),
                    comentario
                };
                rutina.push(config);
                importados++;
            }
        });

        renderRutina();
        guardarDatos();
        els.modal.classList.add('hidden');
        alert(`Se han importado ${importados} ejercicios.`);
    }

    // ============================================================
    // RENDER LISTA
    // ============================================================
    function renderRutina() {
        els.lista.innerHTML = '';

        rutina.forEach((ej, index) => {
            const item = document.createElement('div');
            item.className = `ejercicio-item type-${ej.tipo}`;

            const iconNota = ej.comentario ? '<span style="color:#FFC107; font-size:0.8em;">📝</span>' : '';

            let htmlContent = `
                <div class="ejercicio-info">
                    <h4>${index + 1}. ${ej.nombre} ${iconNota} <span>${ej.tipo}</span></h4>
                </div>
            `;

            if (ej.tipo === 'normal' || ej.tipo === 'superset') {
                htmlContent += `
                    <div class="mini-input-group">
                        <label>Series</label>
                        <input type="number" class="input-series" value="${ej.series}" min="1">
                    </div>
                    <div class="mini-input-group">
                        <label>Reps</label>
                        <input type="number" class="input-reps" value="${ej.reps}" min="1">
                    </div>
                `;
            } else if (ej.tipo === 'tabata') {
                htmlContent += `
                    <div class="mini-input-group">
                        <label>Rondas</label>
                        <input type="number" class="input-series" value="${ej.series}" min="1">
                    </div>
                    <div class="mini-input-group" style="opacity:0.5; align-self:center;">
                        <label>Segs</label>
                        <span style="font-size:0.8em; font-weight:bold;">20/10</span>
                    </div>
                `;
            } else if (ej.tipo === 'piramide') {
                htmlContent += `
                    <div class="mini-input-group">
                        <label>Minutos</label>
                        <input type="number" class="input-series" value="${ej.series}" min="1">
                    </div>
                    <div class="mini-input-group" style="opacity:0.5; align-self:center;">
                        <label>Modo</label>
                        <span style="font-size:0.8em;">Libre</span>
                    </div>
                `;
            } else if (ej.tipo === 'regresiva') {
                // NUEVO: muestra segundos configurables
                htmlContent += `
                    <div class="mini-input-group">
                        <label>Segs</label>
                        <input type="number" class="input-series" value="${ej.series}" min="5" max="600">
                    </div>
                    <div class="mini-input-group" style="opacity:0.5; align-self:center;">
                        <label>Reps</label>
                        <input type="number" class="input-reps" value="${ej.reps || 1}" min="1" title="Número de series">
                    </div>
                `;
            }

            htmlContent += `<button class="btn-eliminar">✕</button>`;
            item.innerHTML = htmlContent;

            const inputSeries = item.querySelector('.input-series');
            if (inputSeries) inputSeries.addEventListener('change', (e) => actualizarEjercicio(ej.id, 'series', parseInt(e.target.value)));

            const inputReps = item.querySelector('.input-reps');
            if (inputReps) inputReps.addEventListener('change', (e) => actualizarEjercicio(ej.id, 'reps', parseInt(e.target.value)));

            item.querySelector('.btn-eliminar').addEventListener('click', () => eliminarEjercicio(ej.id));
            els.lista.appendChild(item);
        });
    }

    function actualizarEjercicio(id, campo, valor) {
        const ej = rutina.find(e => e.id === id);
        if (ej) {
            ej[campo] = Math.max(1, valor || 1);
            guardarDatos();
        }
    }

    window.eliminarEjercicio = function (id) {
        rutina = rutina.filter(e => e.id !== id);
        renderRutina();
        guardarDatos();
    };

    // ============================================================
    // LÓGICA DEL TEMPORIZADOR
    // ============================================================
    function comenzarEntrenamiento() {
        if (rutina.length === 0) return alert("Añade ejercicios primero");
        // Validar tiempos antes de empezar
        validarInputTiempo(els.inputs.descansoSeries);
        validarInputTiempo(els.inputs.descansoEjer);
        guardarDatos();
        activarWakeLock();

        estadoApp = {
            activo: true,
            ejercicioIdx: 0,
            serieActual: 0,
            fase: 'ready',
            intervalo: null,
            tiempoRestante: 0,
            tiempoTranscurrido: 0,
            tabataRonda: 0,
            duracionFaseActual: 0
        };

        els.config.classList.add('hidden');
        els.timer.classList.remove('hidden');
        els.barraProgresoContainer.classList.remove('hidden');

        inyectarArcoSVG();
        prepararEntrenamiento();
    }

    function prepararEntrenamiento() {
        resetArco();
        actualizarDisplayVisual('estado-descanso', "PREPÁRATE", "¡Vamos!");
        els.display.header.textContent = rutina[0].nombre;
        els.display.progresoTexto.textContent = "COMIENZA EN...";
        els.display.detalleReps.textContent = "";
        actualizarProximoEjercicio();
        gestionarNotas(null);
        els.btns.action.style.display = 'none';

        iniciarCuentaAtras(5, '#607D8B', () => {
            cargarEjercicioActual();
        });
    }

    function cargarEjercicioActual() {
        const ej = rutina[estadoApp.ejercicioIdx];

        els.display.header.textContent = ej.nombre;
        els.display.progresoTexto.textContent = `EJERCICIO ${estadoApp.ejercicioIdx + 1} / ${rutina.length}`;

        const porcentaje = (estadoApp.ejercicioIdx / rutina.length) * 100;
        els.barraProgreso.style.width = `${porcentaje}%`;

        actualizarProximoEjercicio();
        gestionarNotas(ej.comentario);

        estadoApp.serieActual = 0;
        estadoApp.tabataRonda = 1;

        if (ej.tipo === 'normal' || ej.tipo === 'superset') {
            iniciarSerieNormal();
        } else if (ej.tipo === 'piramide') {
            iniciarPiramide();
        } else if (ej.tipo === 'tabata') {
            iniciarTabata();
        } else if (ej.tipo === 'regresiva') {
            iniciarRegresiva();
        }
    }

    // ============================================================
    // MODO NORMAL / SUPERSET
    // ============================================================
    function iniciarSerieNormal() {
        const ej = rutina[estadoApp.ejercicioIdx];
        estadoApp.fase = 'work';

        if (estadoApp.serieActual === 0) {
            els.audio.ejercicio.play().catch(() => {});
        } else {
            els.audio.serie.play().catch(() => {});
        }
        vibrar(VIB.inicio);

        actualizarDisplayVisual('estado-trabajo', "¡A TRABAJAR!", `Serie ${estadoApp.serieActual + 1} de ${ej.series}`);
        els.display.detalleReps.textContent = `${ej.reps} Repeticiones`;

        iniciarCronometroProgresivo();

        els.btns.action.textContent = estadoApp.serieActual >= ej.series - 1
            ? "✔ ¡Serie final! Siguiente ejercicio"
            : "✔ ¡Hecho! Descansar";
        els.btns.action.onclick = finalizarSerieNormal;
        els.btns.action.style.display = 'block';
    }

    function finalizarSerieNormal() {
        clearInterval(estadoApp.intervalo);
        const ej = rutina[estadoApp.ejercicioIdx];

        if (estadoApp.serieActual >= ej.series - 1) {
            // Era la última serie → descanso entre ejercicios o fin
            if (estadoApp.ejercicioIdx < rutina.length - 1) {
                iniciarDescanso(parsearTiempo(els.inputs.descansoEjer.value), true);
            } else {
                finEntrenamiento();
            }
        } else {
            // Hay más series → descanso entre series
            iniciarDescanso(parsearTiempo(els.inputs.descansoSeries.value), false);
        }
    }

    // ============================================================
    // MODO PIRÁMIDE
    // ============================================================
    function iniciarPiramide() {
        const ej = rutina[estadoApp.ejercicioIdx];
        estadoApp.fase = 'work';
        els.audio.ejercicio.play().catch(() => {});
        vibrar(VIB.inicio);

        const duracionSegundos = ej.series * 60;

        actualizarDisplayVisual('estado-trabajo', "PIRÁMIDE", `Bloque de ${ej.series} Minutos`);
        els.display.detalleReps.textContent = "Máximas reps posibles";

        els.btns.action.textContent = "⏭ Terminar bloque";
        els.btns.action.onclick = () => {
            clearInterval(estadoApp.intervalo);
            if (estadoApp.ejercicioIdx < rutina.length - 1) {
                iniciarDescanso(parsearTiempo(els.inputs.descansoEjer.value), true);
            } else {
                finEntrenamiento();
            }
        };
        els.btns.action.style.display = 'block';

        iniciarCuentaAtras(duracionSegundos, '#FFC107', () => {
            if (estadoApp.ejercicioIdx < rutina.length - 1) {
                iniciarDescanso(parsearTiempo(els.inputs.descansoEjer.value), true);
            } else {
                finEntrenamiento();
            }
        });
    }

    // ============================================================
    // MODO TABATA
    // ============================================================
    function iniciarTabata() {
        estadoApp.tabataRonda = 1;
        els.display.detalleReps.textContent = "20s ON / 10s OFF";
        loopTabata();
    }

    function loopTabata() {
        const ej = rutina[estadoApp.ejercicioIdx];
        if (estadoApp.tabataRonda > ej.series) {
            if (estadoApp.ejercicioIdx < rutina.length - 1) {
                iniciarDescanso(parsearTiempo(els.inputs.descansoEjer.value), true);
            } else {
                finEntrenamiento();
            }
            return;
        }

        estadoApp.fase = 'tabata-work';
        els.audio.beep.play().catch(() => {});
        vibrar(VIB.inicio);
        actualizarDisplayVisual('estado-tabata-work', "INTENSIDAD", `Ronda ${estadoApp.tabataRonda} / ${ej.series}`);
        els.display.detalleReps.textContent = "¡Dale duro!";
        els.btns.action.style.display = 'none';

        iniciarCuentaAtras(20, '#FF5722', () => {
            estadoApp.fase = 'tabata-rest';
            els.audio.tabataRest.play().catch(() => {});
            vibrar(VIB.descanso);
            actualizarDisplayVisual('estado-tabata-rest', "RECUPERA", `Ronda ${estadoApp.tabataRonda} / ${ej.series}`);
            els.display.detalleReps.textContent = "Respira...";

            iniciarCuentaAtras(10, '#FFC107', () => {
                estadoApp.tabataRonda++;
                loopTabata();
            });
        });
    }

    // ============================================================
    // MODO REGRESIVA ← NUEVO
    // ============================================================
    function iniciarRegresiva() {
        const ej = rutina[estadoApp.ejercicioIdx];
        estadoApp.fase = 'work';

        if (estadoApp.serieActual === 0) {
            els.audio.ejercicio.play().catch(() => {});
        } else {
            els.audio.serie.play().catch(() => {});
        }
        vibrar(VIB.inicio);

        const duracionSeg = ej.series; // en regresiva, "series" = segundos
        const numSeries = ej.reps || 1; // en regresiva, "reps" = cuántas veces repetir

        actualizarDisplayVisual('estado-trabajo', "¡AGUANTA!", `Serie ${estadoApp.serieActual + 1} de ${numSeries}`);
        els.display.detalleReps.textContent = `Cuenta atrás: ${duracionSeg}s`;

        els.btns.action.textContent = "⏭ Saltar";
        els.btns.action.onclick = () => {
            clearInterval(estadoApp.intervalo);
            finalizarRegresiva();
        };
        els.btns.action.style.display = 'block';

        iniciarCuentaAtras(duracionSeg, '#E91E63', () => {
            // Al acabar la cuenta, vibrar y pasar al siguiente paso
            vibrar(VIB.inicio);
            finalizarRegresiva();
        });
    }

    function finalizarRegresiva() {
        const ej = rutina[estadoApp.ejercicioIdx];
        const numSeries = ej.reps || 1;

        if (estadoApp.serieActual >= numSeries - 1) {
            // Fin de todas las series de este ejercicio
            if (estadoApp.ejercicioIdx < rutina.length - 1) {
                iniciarDescanso(parsearTiempo(els.inputs.descansoEjer.value), true);
            } else {
                finEntrenamiento();
            }
        } else {
            // Más series → descanso entre series
            estadoApp.serieActual++;
            iniciarDescanso(parsearTiempo(els.inputs.descansoSeries.value), false);
        }
    }

    // ============================================================
    // DESCANSO
    // ============================================================
    function iniciarDescanso(segundos, esCambioEjercicio) {
        estadoApp.fase = 'rest';
        els.audio.descanso.play().catch(() => {});
        vibrar(VIB.descanso);

        const textoTitulo = esCambioEjercicio ? "CAMBIO EJERCICIO" : "DESCANSO";
        actualizarDisplayVisual('estado-descanso', textoTitulo, "Recupera el aliento");
        els.display.detalleReps.textContent = "";

        if (!esCambioEjercicio) els.containerNotas.classList.add('hidden');

        els.btns.action.textContent = "⏭ Saltar descanso";
        els.btns.action.onclick = () => {
            clearInterval(estadoApp.intervalo);
            siguientePasoDespuesDescanso(esCambioEjercicio);
        };
        els.btns.action.style.display = 'block';

        iniciarCuentaAtras(segundos, '#007BFF', () => {
            siguientePasoDespuesDescanso(esCambioEjercicio);
        });
    }

    function siguientePasoDespuesDescanso(esCambioEjercicio) {
        if (esCambioEjercicio) {
            estadoApp.ejercicioIdx++;
            estadoApp.serieActual = 0;
            cargarEjercicioActual();
        } else {
            // Incrementamos serie ANTES de llamar al modo correspondiente
            estadoApp.serieActual++;
            const ej = rutina[estadoApp.ejercicioIdx];
            if (ej.tipo === 'regresiva') {
                iniciarRegresiva();
            } else {
                iniciarSerieNormal();
            }
        }
    }

    // ============================================================
    // CRONÓMETRO PROGRESIVO (para Normal/Superset — cuenta hacia arriba)
    // ============================================================
    function iniciarCronometroProgresivo() {
        clearInterval(estadoApp.intervalo);
        estadoApp.duracionFaseActual = 0;
        estadoApp.tiempoTranscurrido = 0;
        resetArco();
        actualizarRelojProgresivo();

        estadoApp.intervalo = setInterval(() => {
            estadoApp.tiempoTranscurrido++;
            actualizarRelojProgresivo();
        }, 1000);
    }

    function actualizarRelojProgresivo() {
        const min = Math.floor(estadoApp.tiempoTranscurrido / 60);
        const sec = estadoApp.tiempoTranscurrido % 60;
        els.display.main.textContent = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
        // Para progresivo no hay arco (no sabemos la duración), dejamos arco en 0
    }

    // ============================================================
    // CUENTA ATRÁS GENÉRICA con arco + beeps finales
    // ============================================================
    function iniciarCuentaAtras(segundos, colorArco, callback) {
        clearInterval(estadoApp.intervalo);
        estadoApp.tiempoRestante = segundos;
        estadoApp.duracionFaseActual = segundos;
        actualizarRelojCountdown();
        actualizarArco(segundos, segundos, colorArco);

        estadoApp.intervalo = setInterval(() => {
            estadoApp.tiempoRestante--;
            actualizarRelojCountdown();
            actualizarArco(estadoApp.tiempoRestante, estadoApp.duracionFaseActual, colorArco);

            // Beeps en los últimos 3 segundos
            if (estadoApp.tiempoRestante > 0 && estadoApp.tiempoRestante <= 3) {
                els.audio.beep.play().catch(() => {});
                vibrar(VIB.beepFinal);
            }

            if (estadoApp.tiempoRestante <= 0) {
                clearInterval(estadoApp.intervalo);
                resetArco();
                if (callback) callback();
            }
        }, 1000);
    }

    function actualizarRelojCountdown() {
        const t = Math.max(0, estadoApp.tiempoRestante);
        const min = Math.floor(t / 60);
        const sec = t % 60;
        els.display.main.textContent = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }

    // ============================================================
    // UTILIDADES DE DISPLAY
    // ============================================================
    function actualizarDisplayVisual(claseCss, label, detalleSerieText) {
        els.display.container.className = claseCss;
        // Mantener el SVG del arco (no lo borra al cambiar className)
        els.display.label.textContent = label;
        if (detalleSerieText) els.display.detalleSerie.textContent = detalleSerieText;
    }

    function gestionarNotas(comentario) {
        els.txtNotas.classList.add('hidden');
        els.btnToggleNotas.textContent = "💡 Ver Notas Técnicas";

        if (comentario && comentario.trim() !== "") {
            els.containerNotas.classList.remove('hidden');
            els.txtNotas.textContent = comentario;
        } else {
            els.containerNotas.classList.add('hidden');
            els.txtNotas.textContent = "";
        }
    }

    function actualizarProximoEjercicio() {
        if (estadoApp.ejercicioIdx < rutina.length - 1) {
            const next = rutina[estadoApp.ejercicioIdx + 1];
            els.display.siguiente.textContent = `Siguiente: ${next.nombre} (${next.tipo})`;
        } else {
            els.display.siguiente.textContent = "🏁 Último ejercicio";
        }
    }

    // ============================================================
    // FIN DE ENTRENAMIENTO
    // ============================================================
    function finEntrenamiento() {
        clearInterval(estadoApp.intervalo);
        liberarWakeLock();
        els.barraProgreso.style.width = "100%";
        vibrar(VIB.fin);
        els.audio.serie.play().catch(() => {});
        setTimeout(() => {
            alert("¡Entrenamiento completado! 💪🔥");
            location.reload();
        }, 600);
    }

    // ============================================================
    // EVENT LISTENERS
    // ============================================================
    els.btns.add.addEventListener('click', () => agregarEjercicio());
    els.btns.start.addEventListener('click', comenzarEntrenamiento);

    els.btns.stop.addEventListener('click', () => {
        if (confirm("¿Cancelar el entrenamiento y volver al inicio?")) {
            clearInterval(estadoApp.intervalo);
            liberarWakeLock();
            location.reload();
        }
    });

    els.btns.reset.addEventListener('click', () => {
        if (confirm("¿Borrar todos los datos guardados?")) {
            localStorage.removeItem('desencadenadoData');
            location.reload();
        }
    });

    els.btnOpenImport.addEventListener('click', () => els.modal.classList.remove('hidden'));
    els.btnCloseImport.addEventListener('click', () => els.modal.classList.add('hidden'));
    els.btnProcessImport.addEventListener('click', importarRutinaTexto);

    els.btnToggleNotas.addEventListener('click', () => {
        els.txtNotas.classList.toggle('hidden');
        els.btnToggleNotas.textContent = els.txtNotas.classList.contains('hidden')
            ? "💡 Ver Notas Técnicas"
            : "❌ Ocultar Notas";
    });

    // Validar inputs de tiempo al perder el foco
    els.inputs.descansoSeries.addEventListener('blur', () => validarInputTiempo(els.inputs.descansoSeries));
    els.inputs.descansoEjer.addEventListener('blur', () => validarInputTiempo(els.inputs.descansoEjer));

    // INIT
    cargarDatos();
});
