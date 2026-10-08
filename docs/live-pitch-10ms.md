# Entonación en directo: 10 ms

Captura, F0 y STFT pasan de 30 a 10 ms (100 ventanas/s). Se mantienen 2048 muestras por ventana acústica, ventana visual inicial de 5 s y selector 0,5/2/3/5/8/10 s. No se modifica Praat final ni velocidad del habla.

La confirmación de inicio/salto conserva un mínimo temporal de 30 ms: aumentar la frecuencia no debe convertir dos ventanas solapadas de 10 ms en confirmación prematura. La recuperación de candidatos cercanos conserva su ruta de alta periodicidad. Los nulls y silencios no se rellenan.

Validación: 153 pruebas JS y 12 Python pasan. Se verifican cadencia real a 44,1/48 kHz, bloques de captura íntegros y cola parcial, sincronía F0/STFT, zoom durante la grabación, WAV final, armónicos y ruido. El almacenamiento del espectrograma aumenta hasta ~12.000 columnas/120 s y ~1,54 MB de valores, antes ~4.000 columnas a 30 ms. Los diagnósticos continúan limitados a 6.500 valores por serie y 100 eventos recientes.

Comparación offline del mismo PCM mediante scripts/benchmark-pr32-update.py (27 casos públicos/sintéticos): cobertura relativa a Praat en lectura masculina 63,3 % (20 ms original), 55,1 % (control 30 ms), 56,1 % (10 ms actual); femenina 73,7 %, 66,0 %, 70,1 %. La configuración actual incluye recuperación/energía adaptativa y confirmación temporal: no es una comparación aislada de cadencia. No supera globalmente al original de 20 ms. Cero aceptaciones en regiones Praat-null estables de estas lecturas, silencio y ruido probados. Tono débil sintético: cobertura conocida 100 %. CPU P90 offline ~0,13–0,21 ms/ventana en los ejemplos examinados; se procesa hasta tres veces más frecuentemente que a 30 ms.

La prueba Python conserva el presupuesto anterior de discrepancia en transiciones en tiempo (30 ms), equivalente a hasta tres ventanas de 10 ms; no incrementa el tiempo tolerado. Mantiene cero aceptaciones en regiones null estables, <50 cents P90 en centros medidos y cero discrepancias de octava en lecturas.

No se ha medido latencia ni fluidez visual con micrófono real en navegador. La mayor frecuencia proporciona más puntos reales, no garantiza resolver cortes ni aumenta por sí sola la precisión. El retardo visual configurado de 100 ms continúa igual. El documento pr32-live-update.md y su JSON conservan la comparación histórica a 30 ms.
