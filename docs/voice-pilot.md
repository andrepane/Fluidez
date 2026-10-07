# Tono y entonación: prueba funcional

## Qué probar
En Objetivos → Entonación, elige tarea y límites de búsqueda. Grabar solicita micrófono, muestra Hz y curva local cada ~60 ms y conserva audio. Terminar muestra inmediatamente la curva/resumen provisional y envía PCM16 mono 16 kHz a `/api/voice-analysis`. Subir audio permite el mismo análisis final sin feedback previo. Máximo 120 s; importaciones máximo 20 MB. Escucha y descarga disponibles incluso si el servidor falla. Reintentar usa el mismo audio y parámetros. No se utiliza Deepgram ni se modifica Whisper/velocidad.

## Motores y reproducibilidad
- Directo: Pitchy **4.1.0**, McLeod Pitch Method, FFT.js **4.0.4**, bundle local 8.4 KiB. AudioContext a frecuencia nativa, ventanas 4096 muestras, actualización solicitada cada 60 ms. Claridad >=0.90 y RMS >=0.008; detecciones fuera del rango se descartan. No hay curva inventada ni interpolación entre huecos; tampoco corrección garantizada de saltos de octava. A 48 kHz cada ventana cubre ~85 ms; esto NO es latencia de feedback medida en navegador.
- Final: Parselmouth **0.4.7**, motor Praat **6.1.38**, **autocorrelación sin filtrar**, paso 10 ms, very_accurate=True, umbral de silencio .03, voicing .45, resto parámetros por defecto. No incorpora el método de autocorrelación filtrada del Praat actual. La versión/método se devuelven y muestran. Su igualdad con Praat se refiere a ese motor y esos parámetros, no a versiones distintas con métodos distintos.
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

## Comprobaciones de esta PR
69 pruebas JavaScript y 7 pruebas Python: tonos armónicos 100/200/400/700 Hz, silencio, pausa, PCM, HTTP real, validaciones, límite por instancia y flujo de interfaz con adaptadores de micrófono/AudioContext. Chromium se descargó, pero no pudo iniciarse por restricciones de sockets del entorno. No se ha probado visualmente ni con micrófono humano real. Tampoco se ha medido latencia real. Se detiene automáticamente alrededor de 119 segundos para dejar margen al cierre del contenedor de audio.
