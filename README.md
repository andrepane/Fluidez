# Fluidez+

Web estática para grabar → estimar velocidad/transcribir en directo → detener → reprocesar automáticamente el audio completo.

## Ejecutar

Servir la carpeta por HTTPS (GitHub Pages) o en localhost: `python3 -m http.server 8000`. No abrir mediante file://.

El directo usa SpeechRecognition cuando está disponible (Chrome/Edge). El servicio del navegador puede procesar audio fuera del dispositivo. Si falla, continúa la grabación y se indica que no hay estimación disponible.

El análisis final usa un worker, Transformers.js 2.17.2 y Xenova/whisper-base multilingüe cuantizado, descargados de jsDelivr/Hugging Face. La inferencia es local: no se envía el audio a esos hosts. Primera descarga de modelos necesaria; el rendimiento depende del equipo. No requiere claves ni API de pago. El audio permanece en memoria hasta cerrar la pestaña; descargarlo para conservarlo.

## Medidas

- Directo: palabras provisionales / tiempo transcurrido × 60; incluye silencios y puede llegar con retraso. No es velocidad instantánea.
- Final: recuento del texto obtenido de una segunda transcripción del audio completo / duración decodificada × 60.
- Tramos: intervalos de 30 s, último intervalo con su duración real. Cada palabra se asigna por el punto medio de sus tiempos. Si hay palabras sin tiempos válidos o el total no concuerda, no se muestra el gráfico temporal.
- Actividad: RMS en marcos de 20 ms, umbral basado en percentiles 10/95 con suelo de 0.003, unión de huecos menores de 150 ms. Pausas internas de al menos 500 ms. Silencio incluye extremos; el número de pausas no los incluye.

La actividad es acústica estimada, no tiempo de habla clínicamente validado. Ruido, respiraciones, voces ajenas o grabaciones débiles pueden afectar resultados. Final significa procesamiento terminado, no exactitud garantizada. No diagnostica ni establece baremos. No se estiman sílabas contando vocales.

## Comprobaciones

`node --test tests/analysis.test.mjs`

Probar en navegador: permisos denegados, silencio, dos grabaciones consecutivas, carga de audio, falla de red/modelo, reprocesamiento y audio descargable. La velocidad provisional nunca sustituye los resultados finales cuando falla Whisper.
