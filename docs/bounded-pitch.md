# Directo: búsqueda acotada de periodicidad

## Problema reproducido
Pitchy 4.1.0 calcula NSDF y elige el primer pico que alcanza el 98 % del máximo de todos los picos de la ventana. Algunos picos tardíos, con menos pares de muestras, pueden superar al correspondiente a la periodicidad real. El tracker rechazaba después la frecuencia seleccionada por estar fuera del rango, perdiendo una ventana con señal periódica.

No afirmamos que esta sea la única causa de los cortes observados por el usuario: no disponemos de su WAV. También pueden intervenir clipping, señal aperiódica, límites, fallos de captura o carga del navegador.

## Cambio
`bounded-pitch.mjs` mantiene la autocorrelación FFT exportada de Pitchy. Calcula NSDF, extrae máximos de lóbulos positivos posteriores al lóbulo inicial, interpola cada máximo con una parábola y selecciona únicamente candidatos dentro de los límites configurados. Un pico exterior ya no determina el umbral relativo ni oculta un candidato interior.

Se conservan 2048 muestras, salto de 20 ms, selector relativo 0.98, periodicidad mínima 0.85, RMS mínimo 0.0005, rechazo del límite digital, confirmación de grandes saltos y memoria de 60 ms. No hay interpolación temporal de ausencias, reducción del umbral para ganar continuidad ni cambios en Praat, espectrograma o zoom de 3 segundos. Cada punto procede de una ventana de audio real, sin audio futuro. El motor permanece en el worker.

La implementación es local, sin dependencias nuevas. Método de referencia: McLeod y Wyvill, *A smarter way to find pitch* (2005), https://quod.lib.umich.edu/i/icmc/bbp2372.2005.107/1/--smarter-way-to-find-pitch?page=root;size=75;view=text. Se reutiliza el módulo vendorizado y su licencia existentes; no se copia código del artículo.

## Comparación reproducible
Generar el banco con `scripts/benchmark-live-f0.py:make_bank` y ejecutar `node scripts/benchmark-bounded-pitch.mjs DIRECTORIO SALIDA.json`. `previousLive` reproduce la configuración exacta anterior a esta PR. El banco tiene 19 audios: dos lecturas humanas públicas, derivados de ganancia y señales sintéticas. Licencias y atribución: `tests/fixtures/README.md`.

Praat es otra estimación, no una anotación verdadera. Se compara sobre su rejilla de 10 ms con el punto de directo más próximo a una distancia máxima de medio salto; se excluyen 100 ms en los extremos. Cobertura significa coincidencia de detección en ventanas donde Praat estima F0, no exactitud clínica.

| Señal | Cobertura antes → después | Cortes hacia null antes → después |
| --- | --- | --- |
| Tono 180 Hz + ruido, SNR 10 dB | 74.7 % → 100 % | 23 → 0 |
| Modulación rápida sintética | 60 % → 100 % | 15 → 0 |
| Lectura masculina pública | 41.7 % → 50.5 % | 36 → 30 |
| Lectura femenina pública | 59.1 % → 63.3 % | 28 → 27 |

En el banco no aumentaron las detecciones en ventanas Praat-null: una sigue presente en la lectura femenina. Ruido aislado y silencio producen cero puntos aceptados. Los silencios introducidos en señales periódicas conservan sus huecos. El caso de armónico fuerte conserva 150 Hz y no pasa a 450 Hz.

La diferencia P90 frente a Praat sube ligeramente en las lecturas (29.6→33.4 cents masculina, 33.9→37.3 femenina), con conjuntos de puntos aceptados diferentes; no afirmamos una mejora de precisión. CPU P90 del detector en Node en esta máquina: aproximadamente 0.13–0.21 ms por ventana; no mide latencia de micrófono ni rendimiento del navegador. Resultados completos: `bounded-pitch-measurements.json`.

No hay una vocal humana sostenida del usuario en el banco. Los tests de señal sostenida con ruido a 44.1/48 kHz son regresiones sintéticas, no validación de una vocal real. No hay validación con niños, disfonía ni habla clínica. A frecuencias de muestreo muy altas, la ventana de 2048 muestras contiene menos ciclos y puede limitar la detección grave.

## Prueba con tu misma grabación
1. En Entonación → Ajustes para el profesional, activar diagnóstico antes de grabar.
2. Sostener /a/, /i/, /u/ unos 5 segundos cada una, con pausas claras. Usar voz cómoda y evitar saturar el micrófono.
3. Terminar. El WAV completo se conserva y se analiza por Praat de forma independiente.
4. El registro incorpora `sameAudioComparison`: ventanas detectadas por ambos, ausencias en directo donde Praat estima tono, directo donde Praat no estima tono y diferencias de frecuencia. Es concordancia entre algoritmos, no prueba clínica.
5. El registro también identifica rechazos por energía, periodicidad, límite digital y confirmación; muestra fallos de captura y cola. Si Praat falla, se conserva el diagnóstico disponible sin inventar una comparación.

El diagnóstico continúa siendo opcional y local, sin guardado persistente. Praat recibe el audio por el endpoint existente como antes. La pantalla del paciente no cambia. La comparación A/B del banco usa exactamente el mismo PCM; dos grabaciones nuevas con micrófono no son una comparación controlada del detector.

## Validación
129 pruebas JavaScript y 12 Python pasan. Incluyen worker real separado, conservación del PCM, silencios, armónico fuerte, rango, continuidad sobre señal sostenida ruidosa, dos frecuencias de muestreo y flujo diagnóstico→Praat sobre la misma muestra. Falta comprobar en navegador real con micrófono, especialmente la grabación que originó esta incidencia.
