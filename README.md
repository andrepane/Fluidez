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
