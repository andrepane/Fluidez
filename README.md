# Fluidez+

Web estática para grabar → estimar velocidad/transcribir en directo → detener → reprocesar automáticamente el audio completo.

## Ejecutar

Servir la carpeta por HTTPS (GitHub Pages) o en localhost: `python3 -m http.server 8000`. No abrir mediante file://.

El directo usa SpeechRecognition cuando está disponible (Chrome/Edge). El servicio del navegador puede procesar audio fuera del dispositivo. Si falla, continúa la grabación y se indica que no hay estimación disponible.

El análisis final usa un worker, Transformers.js 2.17.2 y Xenova/whisper-base multilingüe cuantizado, descargados de jsDelivr/Hugging Face. La inferencia es local: no se envía el audio a esos hosts. Primera descarga de modelos necesaria; el rendimiento depende del equipo. No requiere claves ni API de pago. El audio permanece en memoria hasta cerrar la pestaña; descargarlo para conservarlo.

## Medidas

- Directo: palabras provisionales / tiempo transcurrido × 60; incluye silencios y puede llegar con retraso. No es velocidad instantánea.
- Final: recuento del texto obtenido de una segunda transcripción del audio completo / duración decodificada × 60.
- Tramos: intervalos seleccionables de 10, 15 (predeterminado) o 30 s, último intervalo con su duración real. Cada palabra se asigna por el punto medio de sus tiempos. Si hay palabras sin tiempos válidos o el total no concuerda, no se muestra el gráfico temporal.
- Actividad: RMS en marcos de 20 ms, umbral basado en percentiles 10/95 con suelo de 0.003, unión de huecos menores de 150 ms. Pausas internas de al menos 500 ms. Silencio incluye extremos; el número de pausas no los incluye.

La actividad es acústica estimada, no tiempo de habla clínicamente validado. Ruido, respiraciones, voces ajenas o grabaciones débiles pueden afectar resultados. Final significa procesamiento terminado, no exactitud garantizada. No diagnostica ni establece baremos. No se estiman sílabas contando vocales.

## Comprobaciones

`node --test tests/analysis.test.mjs`

Probar en navegador: permisos denegados, silencio, dos grabaciones consecutivas, carga de audio, falla de red/modelo, reprocesamiento y audio descargable. La velocidad provisional nunca sustituye los resultados finales cuando falla Whisper.

## Patrón temporal y comparación

Media acumulada y velocidad reciente de los últimos 15 segundos durante la grabación. SpeechRecognition no aporta tiempos acústicos de palabra: la reciente utiliza cuándo llega o se revisa el texto. Puede mostrar saltos por retrasos del servicio y no debe interpretarse como una velocidad instantánea exacta. No se reutiliza para el gráfico final.

Cada audio válido se envía al motor final incluso si el detector acústico devuelve cero. El recuento final es independiente de ese detector. En silencio, Whisper puede producir palabras espurias; no se garantiza exactitud clínica.

Selecciona muestra A o B antes de grabar/importar. Se conservan dos audios y sus resultados solo en memoria; volver a grabar en la misma posición la sustituye. Cambiar el intervalo recalcula ambos gráficos desde los tiempos originales sin retranscribir ni suavizar. Comparación con los mismos ejes, en tiempo real transcurrido, sin estirar grabaciones ni rellenar el final de la corta como silencio. No indica mejoría/empeoramiento.

Pulsa una barra o una fila para saltar y reproducir ese tramo; se detiene al alcanzar su final (limitado por la frecuencia de eventos del reproductor). Los botones de cada fila permiten hacerlo mediante teclado.

Pruebas: `node --test tests/*.test.mjs`. Incluye flujo con adaptadores controlados (no sustituye prueba de micrófono/Whisper real).


## Modo Terapia / Biofeedback
El logopeda fija un rango objetivo para la tarea (por defecto 120–150 ppm, sin valor normativo). El medidor usa la velocidad reciente provisional del reconocimiento del navegador, no la media acumulada. Incluye pausas; recepción tardía de texto o revisiones pueden producir saltos. Si el directo no está disponible no se simula feedback.

Al detener se conserva un resumen provisional del feedback observado mientras Whisper trabaja. Porcentajes sobre tiempo total, con tiempo sin estimación explícito. No se reconstruye retrospectivamente el feedback que ya vio el paciente. Al terminar Whisper, el resumen se sustituye por clasificación de los intervalos finales de 10/15/30 s, con objetivo guardado por muestra. Las dos fuentes y resoluciones son distintas y pueden discrepar. El mayor periodo en objetivo suma intervalos consecutivos clasificados: no demuestra estabilidad dentro de ellos. Sin timestamps completos no se inventan porcentajes finales ni distribución; se indica tiempo no evaluable.

Los detalles técnicos quedan en desplegables; comparación y escucha por tramos se mantienen. Las muestras y objetivos solo duran esta pestaña. No incluye diagnóstico, baremos ni eficacia clínica validada.

Pruebas del flujo con adaptadores deterministas: inicio, feedback, parada, resumen antes de resolver worker, actualización final y objetivo inválido. No equivalen a prueba de micrófono, reconocimiento real o validez clínica en navegador.

## Referencias seleccionables y pantalla de práctica
Se han sustituido los límites arbitrarios iniciales por referencias descriptivas seleccionables de Carlo (2007), *Speech rate of non-stuttering Spanish-speaking adults*, tabla 5, tasa de comunicación (incluye pausas). Estudio de 60 adultos de 21–30 años de Puerto Rico. P10–P90 redondeados: conversación 120–187 ppm (119,65–187,00 originales), lectura 120–161 (119,59–160,75), descripción de imágenes 67–158 (66,53–158,04). No se usa mínimo/máximo observado como normalidad ni se inventa un intervalo diagnóstico. Estos percentiles describen el 80 % central de esa muestra, no toda el habla sana ni la población española. No se extrapolan a niños, mayores, otras tareas, articulación sin pausas o ventanas de 15 s. El estudio cuenta palabras previstas; ASR y repeticiones pueden diferir.
Fuente: https://www.researchgate.net/publication/276411717_SPEECH_RATE_OF_NON-STUTTERING_SPANISH-SPEAKING_ADULTS
Complemento sobre diferencias dialectales/tareas: https://www.benjamins.com/catalog/sic.20013.san (Santiago y colaboradores, 2022). No se usa para derivar límites ppm.

Por defecto se precarga conversación adulta como punto de partida editable. Seleccionar niño/adolescente elimina el objetivo y desactiva las referencias adultas: exige un objetivo personalizado antes de grabar. Fuera del objetivo no significa alteración; dentro no acredita salud, inteligibilidad ni eficacia terapéutica.

Controles de grabación al lado del medidor, resumen oculto hasta existir datos, comparación plegada y línea temporal sin textos solapados, con leyenda/tiempos accesibles. No se suavizan ni alteran mediciones para mejorar apariencia. Se mantienen directos/finales claramente separados.

## Estado del medidor y falta de actualizaciones
El medidor solo da indicaciones mientras se graba. Al detener, oculta el marcador y remite al resumen provisional/final; no conserva un valor de directo como si fuera una medición actual ni lo sustituye por una media final de diferente significado.
Si el reconocimiento no entrega una actualización durante más de 5 segundos, el marcador se oculta y se muestra espera de texto: no podemos distinguir una pausa de un retraso del servicio. Es un criterio técnico de frescura, no un umbral clínico ni una estimación acústica. Ese tiempo pasa a no evaluable en el resumen provisional; puede reducir cobertura en personas con pausas largas o servicios lentos. El resumen final mantiene sus intervalos Whisper y los rangos objetivo no se alteran para compensar posibles errores de reconocimiento.
Estas correcciones no validan el recuento ASR, sus marcas temporales o la precisión del feedback durante habla rápida. El audio de prueba aportado se pudo decodificar (29,58 s); no se verificó independientemente su transcripción ni los recuentos por tramos. El audio no se incorpora al repositorio.


## Pausas probables en directo
El micrófono se monitoriza localmente con Web Audio, sin reproducirlo por los altavoces. Un gate conservador de baja energía neutraliza el medidor después de 0,8 s de señal RMS baja (<0,006), y reactiva al superar 0,009. Son parámetros técnicos experimentales, no umbrales de voz validados. El muestreo del gate ocurre con el reloj de UI (~250 ms); no es segmentación acústica exhaustiva. Ruido puede impedir detectar pausas y voz débil puede producir falsos positivos. Si no funciona Web Audio, se avisa y se conserva la comprobación de frescura del reconocimiento.

Durante una pausa probable no se indica lento ni se invita a acelerar. Al retomar, se reinicia el origen de la ventana reciente y se esperan texto nuevo y al menos 3 s. No se arrastran las palabras anteriores a la pausa al recuento reciente. Sigue siendo velocidad por tiempos de llegada en una ventana corrida (hasta 15 s), incluyendo pequeñas pausas dentro de ella; NO velocidad articulatoria sin silencios. Texto atrasado puede seguir asignándose al momento equivocado. Ninguna de estas modificaciones valida los objetivos poblacionales para ventanas cortas.

El resumen muestra media GLOBAL con pausas y una tarjeta separada de pausas/silencio estimados del audio final. Las proporciones finales por intervalos Whisper aún incluyen pausas, explícitamente; no se ha inventado un reparto final de tiempo articulatorio. Las pausas probables del directo son neutrales/no evaluables en el resumen provisional. Pruebas deterministas de pausa larga, espera y retorno: no equivalen a validación de VAD en micrófono real.

## Vista del paciente y resumen de la práctica
Antes de empezar: configuración del logopeda con rango editable, tarea, muestra A/B y opciones. Las referencias adultas quedan dentro de una ayuda plegada. Durante la grabación se ocultan configuración, cabecera y área profesional completas (incluidos elementos abiertos). Solo aparecen objetivo, medidor, mensaje breve, aviso discreto de estimación, cronómetro y Terminar. Los mensajes son “Buen ritmo”, “Un poco más despacio” y “Puedes acelerar un poco”; pausas probables/falta de datos mantienen neutralidad, sin una instrucción de velocidad.

Al pulsar Terminar se captura y muestra el resumen provisional sin esperar siquiera a decodificar el audio. Muestra segundos dentro/por encima/por debajo, mayor periodo estimado y banda temporal. Tiempo sin estimación queda explícito. Se conserva esta instantánea después de Whisper: describe el feedback observado, no una validación retrospectiva. Para audios importados sin directo se mantiene el resumen derivado del final, identificado con su fuente.

Whisper continúa después de detener; transcripción final, recuento, media global, acústica, gráficos/tablas y A/B se actualizan dentro de Detalles para el profesional. Media y pausas dejan la vista principal. Mientras se procesa no se pueden iniciar otros análisis/grabaciones; el resumen sigue disponible. El worker sigue funcionando como antes, no se promete una reducción del tiempo de inferencia.

El marcador conserva los valores estimados existentes. Movimiento visual breve (~220 ms), sin suavizado de datos ni corrección ficticia de precisión. Callbacks con texto idéntico no renuevan la frescura. Persisten latencia, texto recibido por bloques, revisiones, omisiones, referencias no validadas para ventanas cortas y límites del gate de energía. No equivale a velocidad articulatoria. Tests verifican separación de estados y persistencia del resumen, no precisión clínica ni navegador real.

## Tarjeta de procesamiento final
Al pulsar Terminar se muestra inmediatamente una tarjeta central en lugar de la práctica/resumen. El resumen provisional se conserva y vuelve a verse al finalizar; no se modifica ni recalcula para esta presentación. La tarjeta también se usa en importaciones y reintentos. Fases: preparar audio, transcribir (incluye preparar/descargar modelo), calcular velocidad y pausas, generar resultados. Paso X de 4 indica fase, no porcentaje global ni tiempo restante.

La barra es indeterminada durante decodificación, inferencia y cálculos. Los callbacks existentes de descarga aportan porcentaje real POR ARCHIVO, identificado expresamente; puede reiniciarse al pasar a otro archivo y no representa progreso total. No se simula avance de la inferencia. A los 20 s aparece “Seguimos procesando…”; no implica detección de salud del worker ni una predicción de finalización. Se mantiene el timeout existente de 15 minutos de transcripción y la conservación del audio/reintento en caso de error. Respeta movimiento reducido y anuncia cambios de fase sin anunciar continuamente porcentajes. Las fases breves pueden durar solo un instante. Se conservan motores, modelos y fórmulas; la actividad acústica se calcula después de transcribir para corresponder con la fase visible, con los mismos datos y algoritmo.

Validación: 32 pruebas automáticas de cálculo/flujo, incluidas aparición inmediata, porcentaje de archivo frente a inferencia indeterminada, mensaje de espera, salida a resultados/error y audio conservado. No sustituye una revisión visual de navegador real.

## Evitar descenso ficticio entre respuestas del directo
La velocidad reciente se calcula en el instante de llegada del último texto diferente, usando la misma ventana/recuento, y se conserva entre callbacks hasta el límite de frescura existente de 5 s. El reloj de UI ya no aumenta el denominador ni expulsa palabras de la ventana mientras espera ASR. Pausa probable neutraliza igualmente; al retomar exige datos nuevos. Texto idéntico no renueva frescura y, al caducar, se ocultan marcador y ppm reciente. La interfaz identifica el dato como última estimación recibida, no velocidad instantánea continua. El resumen provisional registra el feedback mostrado, incluida esa retención breve.

Esto corrige un mecanismo reproducible de descenso del medidor sin nueva información; no demuestra que sea la única causa de una bajada observada. Si ASR omite palabras, la siguiente estimación seguirá siendo baja. Persiste el sesgo por recepción en bloques, revisiones y reinicios del navegador; no se infiere recuento acústico ni se inventan palabras. Análisis final y referencias intactos. 34 pruebas pasan, incluidas esperas sin caída, caducidad, callbacks idénticos, pausa/reanudación y entrega por bloques durante 40 s. Tests controlados, no validación con micrófono real.

## Experimento de directo A/B con Deepgram

**Motor A** conserva SpeechRecognition y sigue predeterminado. **Motor B** usa Deepgram Nova-3 con español explícito (`language=es`) y streaming WebSocket real. Elegir antes de grabar en «Motor de directo · experimento A/B». No sustituye producción ni modifica Whisper, modelos finales, fórmulas finales o objetivos. A/B de motores es independiente de muestra A/B. En GitHub Pages B informa de proxy ausente; A continúa disponible.

### Configuración local (sin clave en frontend)
1. Instalar Node.js 22 o posterior y descargar/clonar esta rama del repositorio.
2. En la carpeta del repositorio ejecutar `npm ci --prefix experimental-proxy`.
3. Configurar `DEEPGRAM_API_KEY` solo en el entorno del proceso servidor. No añadirla a archivos del repo, URL, HTML ni almacenamiento del navegador.
   - PowerShell: `$env:DEEPGRAM_API_KEY = [System.Net.NetworkCredential]::new('', (Read-Host 'Clave Deepgram' -AsSecureString)).Password`
   - Bash: `read -sr DEEPGRAM_API_KEY; export DEEPGRAM_API_KEY` (introducir la clave sin eco).
4. Ejecutar `npm start --prefix experimental-proxy` y abrir **http://127.0.0.1:8787** en Chrome/Edge con micrófono permitido.
5. Elegir B. Sin clave/credito/conexión o AudioWorklet se informa del error; volver a A antes de iniciar otra práctica. No hay sustitución de motor silenciosa ni reconexión que cambie el origen de los timestamps.

El proxy Node/ws sirve solo los assets públicos permitidos, escucha exclusivamente en loopback, valida Host/Origin, admite una conexión a la vez y limita la sesión a cinco minutos. La clave solo viaja en el header Authorization proxy→Deepgram sobre WSS; no se devuelve al navegador, no se registra audio/transcripción/clave. `/experimental/config` devuelve solo un booleano. .env/node_modules ignorados. No es un backend público de producción: no exponer el puerto mediante túnel ni cambiar el bind. Para uso remoto harían falta HTTPS/WSS, autenticación de usuarios y control de coste por usuario en un despliegue separado; GitHub Pages no puede ejecutar este servidor.

### Audio, respuestas y ppm
Web Audio/AudioWorklet captura mono PCM linear16 a la frecuencia real del AudioContext; bloques ~100 ms, sin remuestreo ni audio por altavoces. El servidor negocia `sample_rate` con Deepgram (16/22,05/24/32/44,1/48/96 kHz). MediaRecorder conserva el audio completo como antes para Whisper. Al detener se intenta vaciar el último bloque PCM (máximo 300 ms para el flush, sin bloquear Whisper) y enviar CloseStream; cierre local forzado tras dos segundos si el servicio no cierra. La instantánea del feedback ya visto se conserva: resultados tardíos no la reescriben.

Streaming v1: `model=nova-3`, `language=es`, `encoding=linear16`, `channels=1`, `interim_results=true`, `endpointing=300`, `utterance_end_ms=1000`, `vad_events=true`, `punctuate=true`, `smart_format=false`. Sin diarización/redacción/add-ons ni formato de números que fusione palabras. Endpointing es un ajuste técnico, no un umbral clínico. Modelo de servicio actualizado por Deepgram, no revisión de pesos fijada por nosotros.

Results incluye `start`, `duration`, `is_final`, `speech_final`, transcript y words (`word`, `start`, `end`, confidence…). SpeechStarted/UtteranceEnd aportan eventos de actividad/final probable. Para cada rango, el parcial se reemplaza; al finalizar se conserva una sola copia indexada por comienzo del rango. El siguiente parcial se agrega tras los tramos finalizados, sin sumar cada callback como nuevas palabras. Duplicados finales del mismo rango no aumentan recuento. Palabras provisionales y timestamps pueden cambiar. Recuento aplica la misma separación lexical de la app a texto/palabras; no cuenta sílabas.

PPM recientes: palabras con punto medio temporal dentro de los últimos hasta 15 s, divididas por duración real de la ventana ×60, cortada por la última reanudación acústica; mínimo tres segundos. Origen temporal = final del rango procesado `start+duration`, no hora de llegada ni velocidad articulatoria. Incluye pausas breves. Sin timestamps válidos/concordancia de texto no ofrece ppm. Se mantiene hasta nueva respuesta, se neutraliza si audio analizado tiene más de 5 s de antigüedad; el gate acústico existente neutraliza pausas. Eventos de pausa Deepgram SOLO en diagnóstico: no alteran métricas clínicas ni detector final. Si la cola en navegador/proxy supera ~1 s de PCM, B cierra/desactiva feedback con error visible, manteniendo grabación; no descarta fragmentos silenciosamente ni acumula una cola ilimitada. No garantiza latencia máxima de 1 s del servicio: buffering interno/red/ASR pueden retrasar resultados sin incrementar bufferedAmount.

### Diagnóstico y comparación
Desplegable opcional accesible durante práctica: motor, conexión/estado, ppm, texto, recuento, intervalo entre resultados aceptados, errores y eventos de pausa. Actividad→primer marcador se aproxima desde gate RMS hasta primera estimación del tramo; no mide demora por palabra y puede confundir ruido con habla. En B también mide recepción menos fin del rango de audio; no es la antigüedad de todas las palabras ni separa red/captura/ASR. En A no hay timestamps acústicos. Reloj UI ~250 ms impone su propia resolución. Estados: conectando, conectado/escuchando, parcial/final del directo, esperando habla, error y desconectado. “Final del directo” no es análisis final Whisper ni validación.

Para comparar: misma tarea/texto conocido, duración, rango, micrófono y equipo; grabar una repetición con A y otra con B, abrir diagnóstico y observar cambios deliberados de ritmo y pausas. Anotar demora, cadencia, saltos/estabilidad del marcador, texto omitido/repetido y eventos de pausa. Repeticiones no son idéntico audio ni ensayo controlado. El conteo automático no es referencia de exactitud. No se afirma ventaja de Deepgram hasta prueba real con micrófono y muestras de referencia.

### Coste y privacidad
Verificado 6/10/2026: Nova-3 streaming monolingüe Pay As You Go anuncia **US$0,0048/min** promocional (precio regular publicado US$0,0077/min), sin add-ons. Aproximadamente US$0,048 por 10 min o US$0,48 por 100 min a tarifa promocional; facturación real según cuenta, audio transmitido, reglas/cambios de precio. El crédito inicial anunciado de US$200 es de bienvenida, **no una cuota gratis mensual**. Consultar dashboard antes de probar. Fuente: https://deepgram.com/pricing

B envía voz al proxy local y a `api.deepgram.com` (servicio externo, no procesamiento local ni endpoint europeo en esta PR). Probar inicialmente con tu propia voz o material autorizado; no se activa B sin elección explícita. Clave no incluida: hace falta crear cuenta, crédito y configurarla en tu proceso local para probar servicio real.

### Validación realizada
`node --test tests/*.test.mjs` (41 pruebas sin dependencias del proxy).
`npm ci --prefix experimental-proxy` y `node --test tests/*.test.mjs experimental-proxy/proxy.test.mjs` (43 pruebas en total).
Incluyen revisión parcial/final, duplicados, tiempos ausentes, pausa/reanudación, transmisión PCM/flush tras transferencia, falta de clave y vuelta a A, backpressure, Whisper final independiente, origen rechazado, archivos privados inaccesibles y relay local con upstream simulado. Sintaxis y git diff --check pasan. **No hay prueba de Deepgram real ni de navegador/micrófono real:** no se proporcionó clave; Playwright no encontró Chromium instalado. No se inventan benchmarks ni latencia observada del servicio.

Fuentes de protocolo/modelo:
https://developers.deepgram.com/reference/speech-to-text/listen-streaming
https://developers.deepgram.com/docs/understand-endpointing-interim-results/
https://developers.deepgram.com/docs/models-languages-overview
https://developers.deepgram.com/docs/encoding
