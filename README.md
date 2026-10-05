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
