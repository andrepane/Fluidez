# Evidencia filtrada de F0 y cadencia de 5 ms

## Problema y cambio

Una F0 inferior a 75 Hz quedaba fuera del rango inicial, independientemente del volumen. Se amplía la búsqueda inicial a 50–1000 Hz; no es un baremo ni garantiza cubrir toda voz humana. Los límites personalizados siguen disponibles. El análisis final recibe los límites elegidos y conserva su motor independiente Praat/Parselmouth.

Se analiza cada ~5 ms (redondeo a muestras: 240 a 48 kHz, 221 a 44,1 kHz, 5,011 ms). Captura, F0 y STFT comparten cadencia y centros. Se conserva la ventana acústica de 2048 muestras (42,7/46,4 ms), ventana visual inicial 5 s y selector. Más puntos no garantizan exactitud.

## Armónicos y selección

No se añaden sonidos ni armónicos artificiales. NSDF ya examina la repetición conjunta de los componentes de la voz. Se añade una segunda estimación con filtrado pasa-bajo a 1200 Hz, biquad Butterworth de segundo orden en ida/vuelta, únicamente sobre copias de la ventana. Es evidencia experimental inspirada en el uso de filtrado para F0; no es el filtro gaussiano ni el algoritmo de Praat.

La segunda vía solo puede ganar cuando su periodicidad ≥0,85, la NSDF del audio ORIGINAL en su periodo ≥0,70, y el candidato original no supera 0,80 o el filtrado mejora la periodicidad más de 0,02. Su claridad se limita a min(claridad filtrada, soporte original +0,10). Pasa después por los mismos controles RMS, clipping, rango, confirmación y recuperación. Esto permite recuperar señal periódica con ruido sin confiar únicamente en una copia filtrada. No es detección biológica de voz: música y ruido periódico pueden pasar.

No hay suavizado de medidas ni puentes sobre null. Confirmación inicial mínima 30 ms, saltos grandes 40 ms: las pruebas a 5 ms descubrieron un falso armónico de transición al mantener solo 30 ms en saltos. El retraso visual de 100 ms se conserva. PCM, STFT, WAV y final no reciben el filtrado.

## Evidencia reproducible y límites

Ejecutar python scripts/benchmark-pitch5-update.py SALIDA.json. 27 casos públicos/sintéticos, mismo PCM por variante, controles 10 ms previo / 5 ms sin filtro / nueva vía. El banco mantiene 75–600 Hz para comparación con sus referencias Praat; el rango nuevo 50–1000 se prueba separadamente con señales conocidas. docs/pitch5-measurements.json conserva hashes, configuraciones y métricas. No contiene pacientes.

| Lectura | 10 ms anterior | Solo 5 ms | 5 ms + evidencia |
|---|---:|---:|---:|
| Masculina | 56,1 % | 56,5 % | 61,1 % |
| Femenina | 70,1 % | 69,9 % | 73,2 % |
| Masculina, ganancia baja | 51,6 % | 51,6 % | 58,5 % |
| Femenina, ganancia baja | 61,4 % | 61,0 % | 65,4 % |

Cobertura relativa a Praat, no sensibilidad clínica. Conjuntos aceptados diferentes: no se deduce mayor exactitud de cobertura o P90. Lecturas completas nuevas: P90 en centros medidos ~29,2/33,0 cents, sin desacuerdos de octava ni aceptación en regiones Praat-null estables. En tono rápido P90 aumenta de ~12 a ~22,5 cents; no hay mejora universal. La configuración original a 20 ms de la prueba anterior aún alcanzaba 63,3/73,7 % en estas lecturas.

Pruebas sintéticas de tres componentes con segundo armónico dominante, 55–950 Hz a 44,1/48 kHz: cobertura limpia >95 % y error <20 cents. En señal sintética con ruido, 60–700 Hz, la segunda vía obtiene >70 % de cobertura donde la vía sin filtrado no acepta puntos; 950 Hz con ruido fuerte sigue siendo difícil (~14 % en el ejemplo exploratorio). No son grabaciones infantiles ni prueba de la voz del usuario. No se garantiza detectar fonación aperiódica o disfonía.

Silencio y ruido no periódico probados permanecen sin F0; huecos reales permanecen null. El caso de ventilador a 50 Hz del banco se evalúa fuera del rango de comparación (75–600) y NO prueba rechazo con el rango inicial nuevo: una máquina periódica dentro de 50–1000 puede dibujar una curva.

## Coste, latencia y pruebas

177 pruebas JavaScript +12 Python pasan localmente. Incluyen rangos, armónicos, ruido, PCM íntegro, 5 ms reales, sincronía STFT, zoom, WAV, silencios y regresión Praat. El presupuesto previo de discrepancias transitorias se mantiene en tiempo (30 ms), ahora hasta seis puntos de 5 ms; cero en regiones null estables, <50 cents P90 y cero errores de octava en lecturas.

CPU P90 offline de ejemplos ~0,40–0,43 ms/ventana, frente a ~0,19–0,23 en la mayoría de controles a 10 ms. Hay hasta cuatro veces más trabajo F0 por segundo contando la segunda vía y la frecuencia doble, más STFT. No son FPS ni latencia real del navegador. Espectrograma: hasta ~24.000 columnas/120 s, ~3,07 MB de valores y raster adicional. Cola de análisis sigue acotada; equipos lentos pueden saltarse análisis, sin perder PCM grabado. El diagnóstico mantiene 100 eventos y hasta 6500 valores por serie (aprox. primeros 32,5 s a 5 ms).

No se ha realizado prueba con micrófono real en navegador. Probar vocales graves/agudas, cambios auténticos, silencios y ruido; confirmar WAV y Praat al terminar. No se afirma que los saltos del usuario estén resueltos.

## Fuentes

Praat: https://www.fon.hum.uva.nl/praat/manual/how_to_choose_a_pitch_analysis_method.html y https://praat.org/manual/Intro_4_2__Configuring_the_pitch_contour.html. Fundamentan la relación entre rango, periodos y ventana y la utilidad del filtrado frente a ruido/armónicos dominantes; no validan esta implementación.
