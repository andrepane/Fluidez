# Entonación: ventana de 5 segundos y detección más tolerante

## Comportamiento
La vista en directo muestra 5 segundos en vez de 3. A igual ancho, el desplazamiento horizontal es un 40 % más lento, pero el tiempo sigue siendo real: no se acumula audio pendiente ni se añade un retardo. Una palabra de un segundo ocupa una quinta parte del ancho. La curva y el espectrograma comparten el mismo eje temporal; los resultados finales siguen mostrando toda la muestra.

El umbral mínimo de periodicidad pasa de 0.85 a 0.80. Es una tolerancia del algoritmo, no una probabilidad de exactitud. Se conserva la búsqueda acotada de la PR anterior, el RMS mínimo de 0.0005, selector relativo 0.98, rechazo de clipping, confirmación de cambios grandes, ventanas de 2048 muestras, salto de 20 ms y retardo visual ya existente de 100 ms. No se rellenan huecos y el silencio sigue produciendo valores null. No cambia el análisis final Praat ni los motores de velocidad.

## Prueba controlada
`node scripts/benchmark-tolerant-pitch.mjs DIRECTORIO SALIDA.json` compara el mismo PCM mediante el mismo motor acotado: únicamente cambia 0.85→0.80. El directorio se genera con `scripts/benchmark-live-f0.py:make_bank`. El banco existente contiene 19 señales, incluidas dos lecturas humanas inglesas públicas, sus derivados de ganancia y señales sintéticas. Licencias y atribución en `tests/fixtures/README.md`. Resultados completos en `tolerant-live-pitch-measurements.json`.

Praat es una estimación de referencia, no verdad clínica. Cobertura: detección en directo en los tiempos donde Praat estima tono, sobre su rejilla de 10 ms, admitiendo el punto de directo más próximo a medio salto y excluyendo 100 ms en ambos extremos.

| Señal | Cobertura 0.85 → 0.80 | Directo donde Praat no estima tono, antes → después | P90 diferencia en cents, antes → después |
| --- | --- | --- | --- |
| Lectura masculina | 50.5 % → 63.3 % | 0 → 2 | 33.4 → 39.4 |
| Lectura femenina | 63.3 % → 73.7 % | 1 → 1 | 37.3 → 42.5 |
| Masculina, ganancia ×0.02 | 46.8 % → 58.1 % | 0 → 0 | 30.3 → 37.8 |
| Femenina, ganancia ×0.02 | 54.8 % → 59.3 % | 0 → 0 | 38.6 → 42.5 |
| Sílabas sintéticas cortas | 72.7 % → 90.9 % | 0 → 0 | 0.92 → 0.45 |

No hay desacuerdos de octava en este banco con ninguna de estas configuraciones. Ruido aislado y silencio mantienen cero detecciones. Los huecos de silencio introducidos siguen siendo huecos. Más cobertura no demuestra mayor exactitud: aumenta la diferencia P90 en las lecturas sobre conjuntos de puntos aceptados distintos y aparecen dos ventanas adicionales con Praat-null en la lectura masculina. Tampoco se descarta que otros ruidos periódicos, música o ventiladores produzcan una curva; las pruebas de ruido son limitadas.

## Pruebas y límites
134 pruebas JavaScript y 12 Python pasan. Incluyen señal ruidosa, silencio, clipping, búsqueda fuera de rango, confirmación de saltos, PCM inalterado, flujo captura→Praat, worker separado y geometría de 5 segundos a intervalos reales de 20 ms. La geometría confirma el desplazamiento un 40 % menor sin modificar el reloj de audio.

La regresión previa exigía como máximo una ventana Praat-null por lectura y falla con las dos nuevas ventanas masculinas. Para este ajuste autorizado se utiliza un límite técnico de 1 % de ventanas Praat-null en este banco fijo; no es una especificidad clínica ni justifica errores en otras grabaciones. Se mantiene cero detecciones para ruido aislado y silencio.

Las pruebas son locales/Node, no validación de micrófono o fluidez visual en navegador real. No hay vocal humana sostenida del usuario, ni validación clínica, infantil o con voces patológicas.

## Cómo probar
En el preview, abrir Entonación y sostener /a/, /i/, /u/ con voz cómoda, dejando pausas. Observar la ventana de 5 s y la franja sincronizada. Activar diagnóstico antes de grabar permite revisar el umbral 0.80, rechazos y la comparación del mismo audio con Praat al terminar. Comprobar también una pausa real y ruido de la habitación. Si aparece tono durante esos periodos, registrar el WAV y revisar antes de afirmar una mejora.

Los scripts históricos fijan el umbral anterior 0.85 y solo ejecutan su CLI al invocarlos directamente: importar sus funciones para esta comparación no debe lanzar otros benchmarks ni sobrescribir salidas.
