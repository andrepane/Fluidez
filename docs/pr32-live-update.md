# PR #32: cadencia, zoom y recuperación de F0

## Auditoría y configuración
La rama auditada fue `work/tolerant-five-second-intonation`, commit `58fd87f0c784c339442e0565c414924bb9b80423`. Ya estimaba F0 cada **20 ms**, no 60 ms. La captura enviaba bloques de 20 ms y el espectrograma también usaba 20 ms. Había 2048 muestras por ventana acústica y el worker analizaba PCM original sin cambiar su ganancia. La frecuencia real del AudioContext se conservaba.

| Parámetro | Antes de esta actualización | Ahora |
| --- | --- | --- |
| Captura, F0 y espectrograma | 20 ms, unas 50 oportunidades/s | 30 ms, unas 33 oportunidades/s |
| Ventana acústica | 2048 muestras | 2048 muestras |
| Ventana visual | 5 s fija | 0,5 / 2 / 3 / 5 / 8 / 10 s; inicial 5 s |
| Periodicidad mínima | 0,80 | 0,80 |
| Selector relativo entre picos | 0,98 | 0,98 |
| RMS de aceptación general | 0,0005 | 0,0005 |
| Rama de voz débil | No | Periodicidad ≥0,92 y RMS ≥máximo(0,00005, 3 × ruido estimado), sin exceder el umbral general |
| Memoria normal tras rechazos | 60 ms | 60 ms |
| Recuperación adicional | No | Candidato actual ≥0,92, a menos de 2 semitonos del anterior y dentro de 150 ms |
| Confirmación de inicios / saltos grandes | Dos candidatos próximos | Se conserva |
| Retardo visual configurado | 100 ms | 100 ms |

30 ms reduce la densidad frente a la rama anterior; no se presenta como aumento de frecuencia ni como mejora automática de precisión. A 48 kHz las ventanas duran 42,67 ms y se solapan 12,67 ms; a 44,1 kHz duran 46,44 ms y se solapan 16,44 ms. No se duplican puntos ni se cambia la frecuencia de muestreo. El worklet conserva todas las muestras y el último bloque parcial al detener. La cola limitada del worker puede omitir análisis bajo sobrecarga, como antes: queda diagnosticado y no elimina muestras del WAV.

## Ventana visual
El selector aparece discretamente encima de la curva y sigue visible durante la grabación. Cambiarlo modifica solo los límites temporales de dibujo. No se reinician captura, tracker, audio, reloj, intentos ni análisis. Curva y espectrograma reciben el mismo begin/end/reveal. El desplazamiento permanece continuo a velocidad real. El margen de tiempo futuro se reduce proporcionalmente para las ventanas cortas: en 0,5 s ya no reserva 0,25 s vacíos.

Las etiquetas usan dos decimales en 0,5 s y reducen su número cuando el ancho es pequeño, manteniendo extremos y evitando superposición. Esto no inventa estimaciones entre ventanas. El trazado suave existente sigue usando soporte medido y separando nulls. Al terminar se oculta el selector de directo y los resultados vuelven a la duración completa.

## Intensidad adaptativa y recuperación
`AdaptiveEnergyGate` guarda como máximo 60 RMS recientes de ventanas con periodicidad <0,55, sin clipping. Usa el percentil 20 con un límite inferior para estimar el fondo, evitando que un golpe aislado determine el umbral. El criterio solo permite rebajar el rechazo energético de candidatos con periodicidad ≥0,92; el resto sigue necesitando RMS ≥0,0005. No se normaliza el audio. No es un VAD validado, una clasificación de voz ni una medida de intensidad en dB SPL.

El ruido estimado puede quedar desactualizado o mal representado. Una máquina, música u otra persona que produzcan un tono periódico dentro del rango pueden dibujar F0. No podemos garantizar la distinción voz/ventilador a partir de periodicidad y RMS. La prueba de ventilador sintético cubre solo un tono de 50 Hz con ruido, fuera del rango inicial de 75–600 Hz; no valida todos los ventiladores.

Después de un rechazo se sigue devolviendo null. La nueva recuperación solo acepta el **candidato acústico actual** si se parece al último aceptado, tiene periodicidad alta y reaparece pronto. No copia el tono anterior ni une silencios o consonantes sordas. Clipping/fuera de rango invalidan la memoria de recuperación; un salto de octava y una pausa larga siguen requiriendo confirmación.

## Diagnóstico profesional
Se reutiliza el registro local opcional: ventanas, aceptadas, rechazo energético/periodicidad/rango/clipping, confirmación de inicio o salto, recuperaciones, umbral energético de cada evento reciente, RMS de fondo, cadencia y CPU. `recoveryMs` mide desde la primera ventana rechazada hasta la siguiente aceptada: **incluye el hueco**, no equivale a retraso del marcador tras empezar a hablar. La frecuencia fuera de rango se filtra antes de seleccionar candidato; el contador del tracker no cuenta todos los picos descartados por la búsqueda.

La comparación posterior con Praat usa el salto real de 30 ms. Además compara cada ventana medida con el punto Praat más cercano a como máximo 5 ms. Los desacuerdos de octava de esa comparación son diferencias entre estimadores, no errores clínicos confirmados. Los datos no aparecen en la pantalla del paciente ni se guardan de forma persistente. No hay transmisión nueva; el análisis final utiliza el endpoint Praat existente.

## Comparación reproducible: mismo PCM
Ejecutar `python scripts/benchmark-pr32-update.py SALIDA.json`. Crea el banco existente de 19 audios y añade ocho señales de baja intensidad, ruido, golpes y huecos conocidos. Son 27 pruebas públicas/sintéticas, incluidas dos lecturas humanas inglesas y derivados de ganancia. Licencias en `tests/fixtures/README.md`; no hay pacientes en este banco. `pr32-live-update-measurements.json` conserva SHA-256 del PCM, configuración y resultados.

Se comparan cuatro variantes: PR #32 anterior (20 ms), solo 30 ms, 30 ms con recuperación y 30 ms con recuperación + intensidad adaptativa. Los filtros nuevos están desactivados en el motor anterior; el detector y sus límites son idénticos. Las grabaciones no se regeneran entre variantes.

| Prueba | Antes, 20 ms | Nueva, 30 ms | Qué permite concluir |
| --- | --- | --- | --- |
| Tono periódico RMS inferior al límite anterior | 0 % de cobertura conocida | 100 % | Recupera señal débil con evidencia periódica |
| Tono débil tras ruido de fondo leve | 0 % de cobertura conocida | 100 % | La rama adaptativa funciona en este caso controlado |
| Hueco de periodicidad de 60 ms; disponibilidad causal tras volver | 60 ms | 50 ms | Mejora de 10 ms frente a la rama original; 30 ms frente al control a 30 ms sin recuperación (80→50 ms) |
| Hueco seguido de cambio de octava | 60 ms | 80 ms | No evita la confirmación del salto; la cadencia menor también penaliza |
| Lectura masculina: cobertura sobre tiempos Praat-voiced | 63,3 % | 55,7 % | Pérdida de cobertura; no hay mejora global demostrada |
| Lectura femenina: cobertura sobre tiempos Praat-voiced | 73,7 % | 66,0 % | Pérdida de cobertura; no hay mejora global demostrada |
| Ruido débil aislado, silencio, golpes y tono de 50 Hz probados | 0 detecciones | 0 detecciones | No aparecen falsos tonos en estas señales concretas |

La reducción de cobertura en lecturas ya aparece con el control que cambia únicamente a 30 ms. La recuperación aporta una mejora pequeña respecto a ese control. El criterio energético no cambia los resultados de esas lecturas, que no están por debajo de su umbral, y sí recupera los tonos sintéticos débiles.

En el descenso sintético de intensidad, Praat devuelve null durante parte de una fonación conocida; el nuevo motor acepta correctamente 180 Hz allí. Por eso **no se considera automáticamente falsa toda detección donde Praat devuelve null**. Se informan por separado desacuerdos, regiones sintéticas periódicas conocidas y regiones no periódicas conocidas.

Para cobertura se conserva una rejilla de referencia de 10 ms; una estimación de 30 ms puede corresponder a varios tiempos de esa rejilla. Para error de frecuencia y prueba de rechazos se evalúa también cada centro real de ventana con referencia a ±5 ms. En las lecturas, esa segunda medida tiene P90 de 26,9 cents masculina y 28,1 femenina, con cero desacuerdos de octava y cero aceptaciones en regiones Praat-null alejadas más de 50 ms de una región Praat-voiced. Hay una aceptación masculina en una transición. Los conjuntos aceptados cambian: los P90 menores no demuestran mayor exactitud. Se conserva también la comparación sobre tiempos de referencia comunes, cuyos P90 suben, y todas las discrepancias de la rejilla amplia.

Las pruebas existentes se ajustan a los recuentos esperables con 30 ms. La regresión de frecuencia usa ahora los centros medidos, evitando atribuir diferencias temporales de hasta 15 ms a error tonal. Conserva <50 cents P90 y como máximo una aceptación por lectura cuando Praat no estima tono; añade cero en regiones null estables. No se han relajado esos límites para hacer pasar los cambios.

También se comprobó localmente una grabación de 29,58 s aportada antes. Sin etiquetas de voz/silencio ni F0 verdadera, la cobertura frente a Praat baja de 42,7 % a 36,7 %. Hay desacuerdos no triviales con ambos motores. No se publica ese audio, su hash ni sus resultados individuales en el repositorio. No se considera validación de /a/, /m/, lectura o habla espontánea: su tarea no está anotada.

## Latencia y rendimiento
En la ejecución Node registrada: CPU P90 de F0 entre aproximadamente 0,13 y 0,25 ms por ventana; máximo observado alrededor de 2,1 ms. Es procesamiento offline en esta máquina, no latencia de micrófono o FPS del navegador.

La disponibilidad causal de la prueba de recuperación se calcula con los timestamps y final de cada ventana (centro + 2048/(2 × sampleRate)); no incluye transporte, cola, render ni hardware. Se mantiene el retardo visual de 100 ms. Hay captura cada 30 ms con cuantización adicional del bloque de audio del navegador, que no se ha medido con micrófono real.

## Pruebas y pendientes
153 pruebas JavaScript y 12 Python pasan. Incluyen cadencia real 30 ms en 44,1/48 kHz, ventanas acústicas intactas, timestamps F0/STFT idénticos, PCM sin cambios, copia transferible, worker separado, ventanas cortas con señal, ruido, clipping, saltos, recuperación, diagnóstico, seis escalas durante la misma captura, etiquetas alineadas y WAV completo al terminar. Sintaxis ES modules y Python comprobada; el frontend es estático y no tiene paso de compilación/bundling adicional.

Falta validar el flujo y el feedback en navegador real con micrófono. Los tests DOM usan un entorno controlado y no sustituyen esa prueba. No hay /a/ ni /m/ humanas sostenidas anotadas disponibles en los archivos locales; tampoco validación infantil, de voz patológica o de acentos españoles. No se afirma que los cortes del usuario estén resueltos ni que esta configuración supere globalmente a 20 ms. Se mantiene 30 ms como prueba solicitada, pendiente de decisión del usuario.

## Prueba personal
1. Abrir la preview de esta misma PR → Entonación.
2. Comprobar que el selector muestra 5 s inicialmente.
3. Durante una vocal o /m/ cómoda, probar 0,5 → 2 → 3 → 5 → 8 → 10 s, sin detener. Curva y espectrograma deben ampliarse juntos.
4. Alternar voz suave, voz habitual y pausas reales; no elevar la ganancia hasta saturar.
5. Si interesa, activar diagnóstico **antes** de iniciar otra grabación. Revisar umbral adaptativo, rechazos y comparación posterior con Praat.
6. Terminar: el WAV y la curva final deben conservar toda la duración. Reproducción, importación, dos intentos y comparación siguen disponibles.
7. Comprobar ruido ambiental sin voz. Si dibuja tono, guardar el WAV para analizar el caso; no asumir que la curva implica voz humana.
