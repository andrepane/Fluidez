# Fluidez+

Herramienta de práctica de velocidad y análisis temporal del habla. El logopeda configura un objetivo para la tarea; la app mide y visualiza, y el profesional interpreta. No diagnostica ni tiene métricas clínicamente validadas.

## Arquitectura actual

- Frontend estático (HTML/CSS/JS), servido por HTTPS.
- Directo: Deepgram Nova-3, español (`language=es`), conexión WebSocket del navegador con token temporal obtenido desde Vercel.
- Backend mínimo: `api/deepgram-token.js`. La clave de Deepgram solo permanece en el servidor.
- Captura: AudioWorklet envía PCM mono linear16, a la frecuencia del AudioContext, en bloques de aproximadamente 100 ms. MediaRecorder conserva además el audio completo.
- Final independiente: worker con Transformers.js 2.17.2 y Whisper Base multilingüe cuantizado, inferencia local CPU/WASM, un hilo. Primera descarga desde jsDelivr/Hugging Face. No hay aceleración GPU en main.
- Muestras A/B y resultados en memoria; recargar elimina todo. Descargar el audio para conservarlo.

SpeechRecognition ya no se inicia y no existe un selector de motores. El proxy local experimental fue sustituido por el endpoint de Vercel. Prosodia/voz no están implementadas en main; las propuestas de interfaz siguen en otra PR.

## Configurar Vercel antes de fusionar/desplegar

En Project → Settings → Environment Variables, configurar para Preview y Production:

1. `DEEPGRAM_API_KEY`: clave del proveedor con permisos para emitir tokens.
2. Volver a desplegar si se cambia la variable. La web permite grabar sin contraseña ni cuenta.

`FLUIDEZ_ACCESS_CODE` no se utiliza: si se creó previamente, puede eliminarse de Vercel. Sin API key el endpoint devuelve 503. No se devuelve la clave al navegador, solo un token temporal. El directo usa un servicio externo; la interfaz lo indica antes de grabar.

### Límites y coste

El endpoint es público, sin autenticación. La función incorpora un freno de diez solicitudes por minuto POR INSTANCIA, respuesta 429 y timeout de cuatro segundos al proveedor. En serverless ese contador no es global ni persistente.

**Configurar además Vercel Firewall**: Project → Firewall → Configure → New Rule; condición Request Path equals `/api/deepgram-token`; acción Rate Limit con ventana fija de 60 s y límite inicial de 10 solicitudes por IP, respuesta de bloqueo 429 (no solo Log). Guardar y publicar. Adaptar el límite si varios profesionales comparten IP. Esta PR no configura el dashboard ni afirma que esa regla ya esté activa.

El TTL de 60 s limita el tiempo para iniciar una conexión, NO la duración de un WebSocket ya abierto ni el gasto de una sesión. No existe una cuota global de minutos/gasto implementada. Revisar consumo y restricciones de la cuenta Deepgram. Firewall reduce solicitudes excesivas, pero no garantiza un presupuesto máximo. Para una prueba abierta, vigilar consumo y configurar restricciones en el proveedor; para escalado faltan cuotas persistentes y control de sesiones en servidor.

Fuentes: https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting y https://developers.deepgram.com/guides/fundamentals/token-based-authentication
Tarifa vigente de la cuenta: https://deepgram.com/pricing (no se fija un precio promocional en la app).

## Tarea y objetivo

Hay una única selección de tarea. Cambiarla propone su referencia adulta si existe; el objetivo siempre es editable. Cambiar el objetivo no cambia la tarea. Niño/adolescente vacía el objetivo y exige uno personalizado: cambios de tarea no rellenan referencias adultas. Tarea y objetivo se conservan por muestra y se restauran al seleccionar A/B. Son contexto descriptivo, no cambian los algoritmos.

Referencias Carlo (2007), tabla 5: P10–P90 redondeados de 60 adultos de 21–30 años de Puerto Rico: conversación 120–187 ppm, lectura 120–161, descripción 67–158. Incluyen pausas. No representan normalidad universal, España, niños ni ventanas de 15 s. Fuente: https://www.researchgate.net/publication/276411717_SPEECH_RATE_OF_NON-STUTTERING_SPANISH-SPEAKING_ADULTS

## Directo y resumen observado

Streaming v1: `model=nova-3`, `language=es`, `encoding=linear16`, `channels=1`, sample_rate real, `interim_results=true`, `endpointing=300`, `utterance_end_ms=1000`, `vad_events=true`, `punctuate=true`, `smart_format=false`.

Resultados con texto y palabras temporizadas. Parciales se reemplazan; finales se conservan por inicio de rango sin sumar cada revisión. PPM recientes = palabras cuyo punto medio cae en los últimos hasta 15 s / duración real de ventana ×60, mínimo 3 s, cortada por reanudación acústica. Incluye pausas breves; no es velocidad articulatoria. Sin tiempos coherentes no hay feedback inventado.

Se mantiene la última estimación mientras llega otra; más de 5 s de antigüedad neutraliza el marcador. Un gate RMS conservador neutraliza pausas probables tras 0,8 s con RMS <0,006; reactiva por encima de 0,009. Ruido/voz baja afectan al gate. No es VAD validado. Cola de envío mayor de aproximadamente 1 s de PCM desactiva feedback sin descartar audio silenciosamente. Fallo del directo durante grabación conserva audio para el final; fallo durante arranque impide iniciar y se informa.

Durante práctica se ocultan configuración, detalles profesionales y diagnóstico técnico. Al detener se conserva el feedback observado, incluyendo tiempo no evaluable. La tarjeta de procesamiento sustituye temporalmente el resumen y este vuelve al terminar. Whisper no reescribe retrospectivamente lo que vio el paciente. En importaciones sin directo el resumen procede de intervalos finales, identificado como tal.

Diagnóstico después de la práctica: cadencia, antigüedad del rango al recibirlo, texto y errores. Actividad→primer marcador es aproximación por RMS/reloj UI de 250 ms, no latencia por palabra. Los eventos de pausa del proveedor no cambian las métricas finales.

## Final y comparación

Whisper vuelve a analizar el audio entero con timestamps por palabra (ventanas de 30 s, solape de 5 s). Velocidad media: palabras del texto / duración total ×60. Intervalos de 10, 15 o 30 s, último tramo con duración real; asignación por punto medio de palabra. Si tiempos/recuento no concuerdan, no se inventa gráfico.

Actividad/silencio: RMS por marcos de 20 ms, umbral adaptativo con suelo 0,003, unión de huecos menores de 150 ms; pausas internas de al menos 0,5 s. Ruido, respiraciones o voces ajenas pueden afectar. Whisper puede producir palabras espurias en silencio. Cada audio válido se transcribe aunque actividad acústica sea cero.

Comparación A/B con mismos ejes; no estira ni rellena grabación corta. Pulsar barra/fila reproduce el tramo; precisión de parada depende de timeupdate. No interpreta mejoría. "Final" significa terminado, no más preciso ni clínicamente validado.

## Verificación

Node.js 22+: `node --test tests/*.test.mjs`. GitHub Actions ejecuta el mismo comando en push y PR. Tests deterministas del cálculo, captura PCM, Deepgram, interfaz/estados y endpoint con proveedor simulado: no miden exactitud clínica, rendimiento del servicio ni micrófono real.

Protocolo manual y hoja de medición reproducible: [docs/validation.md](docs/validation.md).


## Propuesta de pantalla de resultados

El análisis aparece directamente: contexto de la muestra, media global secundaria, gráfico temporal grande con banda del objetivo guardado, reproductor y tabla accesible de escucha. El cursor sigue los eventos del reproductor. La banda es un objetivo de tarea, no normalidad clínica. A/B mantiene ejes comunes e identifica tarea/objetivo propio. No se suavizan datos ni se cambian algoritmos. Sin timestamps coherentes se avisa y no se genera una curva ficticia.

El resumen del feedback observado conserva su fuente provisional, separado del gráfico final Whisper. Transcripción, pausas y mediciones quedan en detalles. No se añade exportación, almacenamiento ni nuevos módulos. Pendiente revisión visual en Preview de escritorio/móvil con audio real; pruebas deterministas no sustituyen esa comprobación.

## Guardar y abrir sesiones locales

Guardar sesión descarga un archivo `.fluidez.json` con audio (base64), tarea, objetivo, transcripción final/timestamps, actividad/pausas, feedback provisional observado, fecha y procedencia del análisis. No pide nombre de paciente ni crea una base de datos. El navegador decide la carpeta (habitualmente Descargas, o la que elijas si pregunta). No se envía el archivo a Firebase/nube/Deepgram. **El archivo contiene voz y texto sin cifrar**: conservarlo y compartirlo según corresponda.

Seleccionar A o B en configuración y pulsar Abrir sesión. Recupera resultados sin ejecutar Whisper ni llamar al proveedor; recalcula únicamente medias/barras desde datos guardados para el intervalo de visualización actual. Cargar A y B permite comparación entre días. Abrir en una posición ocupada sustituye esa muestra; si el archivo es inválido, la muestra actual permanece. Guardar antes de sustituir una muestra que quieras conservar.

El formato v1 registra appVersion `1.0.0-sessions`, analysisVersion `temporal-v1`, runtime y nombre del modelo. Son identificadores de implementación, no validación clínica ni un hash de pesos del proveedor. La procedencia se conserva al abrir/guardar; reanalizar crea resultados con la implementación actual. No demuestra autenticidad de un archivo editado ni coincidencia entre su audio y texto. Versiones futuras incompatibles se rechazan.

Límites iniciales: 50 MB de audio, 72 MB de archivo de sesión, 30 minutos de duración, JSON/versiones/datos acotados. Sin timestamps completos se conserva el recuento global sin inventar gráfico. También permite guardar solo resumen provisional tras fallo final, identificado como tal. No almacena resultados antes de terminar ni durante procesamiento. La codificación base64 aumenta tamaño aproximadamente un tercio; en equipos limitados puede tardar al guardar.

Verificación de esta PR: round trip de bytes y datos, guardado provisional, archivos/versiones inválidos, acústica incoherente, apertura A/B sin worker y protección de muestra ante error. Pendiente probar descarga/selector/reproducción del archivo recuperado en navegador real.
