# Tono y entonación: prueba funcional

## Qué probar
En Objetivos → Entonación, elige tarea y límites de búsqueda. Grabar solicita micrófono, muestra Hz y curva local cada ~60 ms y conserva audio WAV sin compresión. Terminar muestra inmediatamente la curva/resumen provisional y envía PCM16 mono 16 kHz a `/api/voice-analysis`. Subir audio permite el mismo análisis final sin feedback previo. Máximo 120 s; importaciones máximo 20 MB. Escucha y descarga disponibles incluso si el servidor falla. Reintentar usa el mismo audio y parámetros. No se utiliza Deepgram ni se modifica Whisper/velocidad.

## Motores y reproducibilidad
- Directo: Pitchy **4.1.0**, McLeod Pitch Method, FFT.js **4.0.4**, bundle local 8.4 KiB. La captura PCM mono mediante AudioWorklet se utiliza tanto para WAV como para el directo. Bloques de ~60 ms con posición en muestras; análisis de ventanas 4096 muestras centradas temporalmente (48 kHz: ~85 ms de ventana). Se elimina la componente continua. `clarityThreshold=.98` para seleccionar candidatos; se exige claridad >=.95, RMS centrado >=.002, y <=1 % de muestras próximas al límite digital. Estas cifras no son probabilidades de acierto ni baremos.
- Inicio y cambios superiores a 7 semitonos necesitan dos observaciones compatibles (distancia <2 semitonos) antes de mostrarse. Los candidatos en espera quedan como huecos; no se dividen frecuencias ni se inventa interpolación. Tras huecos >250 ms se reinicia la continuidad. Eso puede omitir cambios reales muy breves; no elimina los errores de armónicos sostenidos. La modificación evita un error demostrado en una señal sintética (150 Hz + tercer armónico dominante de 450 Hz), pero NO garantiza ese resultado en todas las voces.
- Captura y finalización: el worklet conserva bloques y cola hasta la confirmación de flush. WAV16 a frecuencia nativa, sin compresión perceptual. Conversión a mono16kHz para servidor; no se promete que represente exactamente los floats originales, debido a cuantización/remuestreo. Límite de 119s controlado también por muestras, incluso si se retrasan los timers. Sin confirmación de cierre se permite descargar un WAV posiblemente incompleto, pero no se envía automáticamente. No hay fallback silencioso a MediaRecorder; sin AudioWorklet se ofrece subir audio. El marcador queda neutral cuando el audio recibido lleva más de 250 ms de antigüedad respecto al reloj de AudioContext.
- Final: Parselmouth **0.4.7**, motor Praat **6.1.38**, **autocorrelación sin filtrar**, paso 10 ms, very_accurate=True, umbral de silencio .03, voicing .45, resto parámetros por defecto. No incorpora el método de autocorrelación filtrada del Praat actual. Este refinamiento no cambia sus candidatos ni sus parámetros; añade periodicidad y proporción de muestras próximas al límite digital como metadatos técnicos, no índices clínicos. La versión/método se devuelven y muestran. Su igualdad con Praat se refiere a ese motor y esos parámetros, no a versiones distintas con métodos distintos.
- Resumen: mediana y percentiles 10–90 de ventanas con F0; proporción de ventanas detectadas. No es rango vocal máximo, tiempo efectivo de habla ni índice de calidad. No hay CPP, jitter, shimmer, HNR, baremos ni diagnóstico implementados.

## Activación Vercel
Vercel reconoce `api/voice-analysis.py` y las dependencias de `requirements.txt`. Se fija Python 3.12. En la configuración del proyecto, añadir **FLUIDEZ_VOICE_ENABLED=1** para Preview y redeployar. Si no está habilitado, devuelve 503 y mantiene el resumen provisional. No requiere API key ni instalar Praat en el equipo del usuario. No activar en producción sin revisar la prueba.

El software no cobra por minuto. Vercel ejecuta Python y puede consumir cuota o generar costes del plan: no se promete infraestructura gratuita ilimitada. La compilación/despliegue de las ruedas nativas debe verificarse en Preview; no se ha probado ese despliegue desde este entorno.

El endpoint limita PCM16 mono16kHz a 120s/4MB, dos análisis simultáneos por instancia y 5 solicitudes/IP/minuto por instancia. No son límites globales: antes de hacerlo público configurar límite persistente en Vercel Firewall para `/api/voice-analysis`. Origin no es autenticación. Las grabaciones de este módulo se envían al servidor, se procesan en memoria, no se escriben a disco ni a Firebase. El proveedor puede registrar metadatos HTTP según su configuración.

## Prueba local y automatizada
```
python3 -m pip install -r requirements.txt
python3 -m unittest discover -s tests -p 'test_voice*.py'
node --test tests/*.test.mjs
FLUIDEZ_VOICE_ENABLED=1 python3 tools/voice-preview.py
```
Abrir http://localhost:8765. Este servidor sirve la web y solo el endpoint de voz; no reemplaza Vercel ni proporciona Deepgram. Detener con Ctrl+C.

## Lo que todavía hay que comprobar
Micrófono real en Chrome/Edge/Safari, latencia real, frecuencias infantiles/agudas, voz irregular, ruido, errores de octava, importación de formatos soportados por cada navegador y cold-start de Vercel. Las pruebas con tonos armónicos y silencio verifican implementación, no precisión clínica. No se presenta la incorporación de Praat como validación de Fluidez+.

Pitchy/FFT se distribuyen con licencias en `vendor/`. Parselmouth/Praat son GPL; antes de distribuir binarios del backend deben cumplirse sus obligaciones de licencia/código fuente.

## Experiencia refinada
Configuración inicial con tarea y ajustes profesionales plegados. Durante la práctica se ocultan navegación/configuración/resultados, mostrando instrucción, tono, marcador relativo grave/agudo, curva de los últimos 8s, cronómetro y Terminar. La escala en directo se mantiene fija durante la muestra; no asigna normalidad. Resultados: curva completa en escala logarítmica ajustada a los valores detectados, reproducción al pulsar y cursor de audio, mediana, rango central y duración. La escala logarítmica da el mismo espacio a intervalos iguales en semitonos, no suaviza los datos. Flechas y Home/End permiten desplazarse por el audio. Fuentes y periodicidad se explican como datos técnicos.

En esta revisión pasan 76 pruebas JavaScript y 8 Python. Hay pruebas de WAV/timestamps/cola/límite por muestras, componente continua, señal débil, cambios reales y rechazo de saltos aislados, candidato armónico y reproducción del gráfico. La Preview solicita autenticación de Vercel en el navegador disponible, por lo que no se ha podido revisar visualmente allí ni probar micrófono humano. La mejora de fiabilidad es de captura/manejo de señal y de casos sintéticos concretos; no es precisión clínica validada.
