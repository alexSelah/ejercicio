document.addEventListener('DOMContentLoaded', () => {

    // --- REFERENCIAS DOM ---
    const els = {
        config: document.getElementById('configuracion'),
        timer: document.getElementById('temporizador'),
        lista: document.getElementById('lista-ejercicios'),
        barraProgresoContainer: document.getElementById('barra-progreso-container'),
        barraProgreso: document.getElementById('barra-progreso-relleno'),
        // MODAL IMPORT
        modal: document.getElementById('modal-importar'),
        txtImport: document.getElementById('texto-importar'),
        btnOpenImport: document.getElementById('btn-abrir-importar'),
        btnCloseImport: document.getElementById('btn-cerrar-modal'),
        btnProcessImport: document.getElementById('btn-procesar-importacion'),
        // NOTAS
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
            tabataRest: document.getElementById('audio-tabata-rest') // NUEVO REFERENCIA
        }
    };

    // --- ESTADO ---
    let rutina = [];
    let estadoApp = {
        activo: false,
        ejercicioIdx: 0,
        serieActual: 0,
        fase: 'ready',
        intervalo: null,
        tiempoRestante: 0,
        tiempoTranscurrido: 0,
        tabataRonda: 0
    };

    // --- PERSISTENCIA ---
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
            const data = JSON.parse(saved);
            rutina = data.rutina || [];
            els.inputs.descansoSeries.value = data.tSeries || "01:00";
            els.inputs.descansoEjer.value = data.tEjer || "02:00";
            renderRutina();
        } else {
            agregarEjercicio('Flexiones', 'normal', 3, 10);
        }
    }

    // --- GESTIÓN DE RUTINA ---
    function agregarEjercicio(nombre = "", tipo = "normal", series = 3, reps = 10, comentario = "") {
        if (!nombre) {
            nombre = prompt("Nombre del Ejercicio:", "Nuevo Ejercicio");
            if (!nombre) return;
            tipo = els.inputs.tipo.value;
        }

        let config = { id: Date.now() + Math.random(), nombre, tipo, series, reps, comentario };

        // Ajustes por defecto según tipo
        if (tipo === 'tabata' && series === 3) config.series = 8;
        if (tipo === 'piramide' && series === 3) config.series = 7;

        rutina.push(config);
        renderRutina();
        guardarDatos();
    }

    // --- LÓGICA DE IMPORTACIÓN ---
    function importarRutinaTexto() {
        const texto = els.txtImport.value.trim();
        if(!texto) return;

        const lineas = texto.split('\n');
        let importados = 0;

        if(confirm("¿Quieres borrar la rutina actual antes de importar? (Cancelar para añadir al final)")) {
            rutina = [];
        }

        lineas.forEach(linea => {
            linea = linea.trim();
            if(!linea || linea.startsWith('#')) return;

            let comentario = "";
            const matchComentario = linea.match(/\[(.*?)\]/);
            if(matchComentario) {
                comentario = matchComentario[1];
                linea = linea.replace(matchComentario[0], '');
            }

            const partes = linea.split(';');
            if(partes.length >= 2) {
                const tipoRaw = partes[0].trim().toLowerCase();
                const nombre = partes[1].trim();
                const series = parseInt(partes[2]) || 3;
                const reps = parseInt(partes[3]) || 10; 

                let tipo = 'normal';
                if(tipoRaw.includes('tabata')) tipo = 'tabata';
                else if(tipoRaw.includes('pirami')) tipo = 'piramide';
                else if(tipoRaw.includes('super')) tipo = 'superset';

                let config = { 
                    id: Date.now() + Math.random(), 
                    nombre, tipo, series, reps, comentario 
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
            }

            htmlContent += `<button class="btn-eliminar">X</button>`;
            item.innerHTML = htmlContent;

            const inputSeries = item.querySelector('.input-series');
            if(inputSeries) inputSeries.addEventListener('change', (e) => actualizarEjercicio(ej.id, 'series', parseInt(e.target.value)));

            const inputReps = item.querySelector('.input-reps');
            if(inputReps) inputReps.addEventListener('change', (e) => actualizarEjercicio(ej.id, 'reps', parseInt(e.target.value)));

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

    window.eliminarEjercicio = function(id) {
        rutina = rutina.filter(e => e.id !== id);
        renderRutina();
        guardarDatos();
    };

    // --- LÓGICA DEL TEMPORIZADOR ---

    function comenzarEntrenamiento() {
        if (rutina.length === 0) return alert("Añade ejercicios primero");
        guardarDatos();
        
        estadoApp = { ...estadoApp, activo: true, ejercicioIdx: 0, serieActual: 0, fase: 'ready' };

        els.config.classList.add('hidden');
        els.timer.classList.remove('hidden');
        els.barraProgresoContainer.classList.remove('hidden');
        
        prepararEntrenamiento();
    }

    function prepararEntrenamiento() {
        els.display.container.className = 'estado-descanso'; 
        els.display.label.textContent = "PREPÁRATE";
        els.display.header.textContent = rutina[0].nombre;
        els.display.progresoTexto.textContent = "COMIENZA EN...";
        els.display.detalleSerie.textContent = "¡Vamos!";
        els.display.detalleReps.textContent = "";
        
        actualizarProximoEjercicio();
        gestionarNotas(null); 

        els.btns.action.style.display = 'none'; 

        iniciarCuentaAtras(5, () => {
            cargarEjercicioActual();
        });
    }

    function cargarEjercicioActual() {
        const ej = rutina[estadoApp.ejercicioIdx];
        
        els.display.header.textContent = ej.nombre;
        els.display.progresoTexto.textContent = `EJERCICIO ${estadoApp.ejercicioIdx + 1} / ${rutina.length}`;
        
        const porcentaje = ((estadoApp.ejercicioIdx) / rutina.length) * 100;
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
        }
    }

    // --- FUNCIÓN DE NOTAS ---
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
            els.display.siguiente.textContent = `Siguiente: ${next.nombre}`;
        } else {
            els.display.siguiente.textContent = "Último ejercicio";
        }
    }

    // --- MODO NORMAL / SUPERSET ---
    function iniciarSerieNormal() {
        const ej = rutina[estadoApp.ejercicioIdx];
        estadoApp.fase = 'work';
        
        if (estadoApp.serieActual === 0) els.audio.ejercicio.play();
        else els.audio.serie.play();

        actualizarDisplayVisual('estado-trabajo', "¡A TRABAJAR!", `Serie ${estadoApp.serieActual + 1} de ${ej.series}`);
        els.display.detalleReps.textContent = `${ej.reps} Repeticiones`;
        
        iniciarCronometroProgresivo(); 

        els.btns.action.textContent = "¡HECHO! (Descansar)";
        els.btns.action.onclick = finalizarSerieNormal;
        els.btns.action.style.display = 'block';
    }

    function finalizarSerieNormal() {
        clearInterval(estadoApp.intervalo); 
        
        const ej = rutina[estadoApp.ejercicioIdx];
        if (estadoApp.serieActual >= ej.series - 1) {
            gestionarSiguientePaso(true);
        } else {
            iniciarDescanso(parsearTiempo(els.inputs.descansoSeries.value), false);
        }
    }

    // --- MODO PIRÁMIDE ---
    function iniciarPiramide() {
        const ej = rutina[estadoApp.ejercicioIdx];
        estadoApp.fase = 'work';
        els.audio.ejercicio.play();
        
        const duracionSegundos = ej.series * 60; 

        actualizarDisplayVisual('estado-trabajo', "PIRÁMIDE", `Bloque de ${ej.series} Minutos`);
        els.display.detalleReps.textContent = "Máximas reps posibles";

        els.btns.action.textContent = "Terminar Bloque >>";
        els.btns.action.onclick = () => {
            clearInterval(estadoApp.intervalo);
            gestionarSiguientePaso(true);
        };
        els.btns.action.style.display = 'block';

        iniciarCuentaAtras(duracionSegundos, () => {
             gestionarSiguientePaso(true);
        });
    }

    // --- MODO TABATA ---
    function iniciarTabata() {
        estadoApp.tabataRonda = 1;
        els.display.detalleReps.textContent = "20s ON / 10s OFF";
        loopTabata();
    }

    function loopTabata() {
        const ej = rutina[estadoApp.ejercicioIdx];
        if (estadoApp.tabataRonda > ej.series) {
            gestionarSiguientePaso(true);
            return;
        }

        // WORK 20s
        estadoApp.fase = 'tabata-work';
        els.audio.beep.play();
        actualizarDisplayVisual('estado-tabata-work', "INTENSIDAD", `Ronda ${estadoApp.tabataRonda} / ${ej.series}`);
        els.display.detalleReps.textContent = "¡Dale duro!";
        els.btns.action.style.display = 'none';
        
        iniciarCuentaAtras(20, () => {
            // REST 10s (AQUÍ SUENA EL NUEVO SONIDO)
            estadoApp.fase = 'tabata-rest';
            els.audio.tabataRest.play(); // <--- CAMBIO AQUÍ
            actualizarDisplayVisual('estado-tabata-rest', "RECUPERA", `Ronda ${estadoApp.tabataRonda} / ${ej.series}`);
            els.display.detalleReps.textContent = "Respira...";
            
            iniciarCuentaAtras(10, () => {
                estadoApp.tabataRonda++;
                loopTabata();
            });
        });
    }

    // --- UTILIDADES ---
    function iniciarCronometroProgresivo() {
        clearInterval(estadoApp.intervalo);
        estadoApp.tiempoTranscurrido = 0;
        actualizarRelojProgresivo();
        estadoApp.intervalo = setInterval(() => {
            estadoApp.tiempoTranscurrido++;
            actualizarRelojProgresivo();
        }, 1000);
    }

    function actualizarRelojProgresivo() {
        const min = Math.floor(estadoApp.tiempoTranscurrido / 60);
        const sec = estadoApp.tiempoTranscurrido % 60;
        els.display.main.textContent = `${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    }

    function iniciarDescanso(segundos, esCambioEjercicio) {
        estadoApp.fase = 'rest';
        els.audio.descanso.play(); 
        
        const textoTitulo = esCambioEjercicio ? "CAMBIO EJERCICIO" : "DESCANSO";
        actualizarDisplayVisual('estado-descanso', textoTitulo, "Recupera el aliento");
        els.display.detalleReps.textContent = "";

        if(!esCambioEjercicio) els.containerNotas.classList.add('hidden');

        els.btns.action.textContent = "Saltar Descanso >>";
        els.btns.action.onclick = () => {
            clearInterval(estadoApp.intervalo);
            siguientePaso(esCambioEjercicio);
        };
        els.btns.action.style.display = 'block';

        iniciarCuentaAtras(segundos, () => {
            siguientePaso(esCambioEjercicio);
        });
    }

    function iniciarCuentaAtras(segundos, callback) {
        clearInterval(estadoApp.intervalo);
        estadoApp.tiempoRestante = segundos;
        actualizarRelojCountdown();

        estadoApp.intervalo = setInterval(() => {
            estadoApp.tiempoRestante--;
            actualizarRelojCountdown();

            if (estadoApp.tiempoRestante <= 0) {
                clearInterval(estadoApp.intervalo);
                if (callback) callback();
            }
        }, 1000);
    }

    function gestionarSiguientePaso(esFinEjercicio) {
        if (estadoApp.ejercicioIdx < rutina.length - 1) {
            iniciarDescanso(parsearTiempo(els.inputs.descansoEjer.value), true);
        } else {
            finEntrenamiento();
        }
    }

    function siguientePaso(esCambioEjercicio) {
        if (esCambioEjercicio) {
            estadoApp.ejercicioIdx++;
            cargarEjercicioActual();
        } else {
            estadoApp.serieActual++;
            iniciarSerieNormal();
        }
    }

    function actualizarDisplayVisual(claseCss, label, detalleSerieText) {
        els.display.container.className = claseCss;
        els.display.label.textContent = label;
        if (detalleSerieText) els.display.detalleSerie.textContent = detalleSerieText;
    }

    function actualizarRelojCountdown() {
        const min = Math.floor(estadoApp.tiempoRestante / 60);
        const sec = estadoApp.tiempoRestante % 60;
        els.display.main.textContent = `${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    }

    function finEntrenamiento() {
        clearInterval(estadoApp.intervalo);
        els.barraProgreso.style.width = "100%";
        els.audio.serie.play(); 
        setTimeout(() => { alert("¡Entrenamiento Terminado! 💪"); location.reload(); }, 500);
    }

    function parsearTiempo(str) {
        const p = str.split(':');
        return (parseInt(p[0]) * 60) + parseInt(p[1]);
    }

    // --- EVENT LISTENERS ---
    els.btns.add.addEventListener('click', () => agregarEjercicio());
    els.btns.start.addEventListener('click', comenzarEntrenamiento);
    els.btns.stop.addEventListener('click', () => { if(confirm("¿Salir?")) location.reload(); });
    els.btns.reset.addEventListener('click', () => {
        if(confirm("¿Borrar configuración?")) { localStorage.removeItem('desencadenadoData'); location.reload(); }
    });

    els.btnOpenImport.addEventListener('click', () => els.modal.classList.remove('hidden'));
    els.btnCloseImport.addEventListener('click', () => els.modal.classList.add('hidden'));
    els.btnProcessImport.addEventListener('click', importarRutinaTexto);

    els.btnToggleNotas.addEventListener('click', () => {
        els.txtNotas.classList.toggle('hidden');
        if(els.txtNotas.classList.contains('hidden')) els.btnToggleNotas.textContent = "💡 Ver Notas Técnicas";
        else els.btnToggleNotas.textContent = "❌ Ocultar Notas";
    });

    // INIT
    cargarDatos();
});
