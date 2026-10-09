# Prueba A/B de motores de F0

## Cómo probar

Entonación → Ajustes para el profesional → Motor de directo: A (actual) o B (YIN local experimental). Elegir antes de grabar; el selector se bloquea durante captura/procesamiento. Activar diagnóstico antes para ver motor, ventanas detectadas, rechazos, CPU por ventana, antigüedad de los resultados, cola y bloques saltados. Repetir la misma frase y vocal con A/B, manteniendo micrófono, rango, distancia y volumen. Los dos intentos de la app son intentos de grabación, no nombres de motor.

El motor activo aparece en la fuente de la curva provisional; el diagnóstico identifica engine=current/yin. Tras finalizar, el gráfico de resultados se recalcula con Praat, por lo que no se debe utilizar esa curva final como comparación de motores en directo. El registro de diagnóstico conserva el motor de directo y su comparación con Praat. El audio completo se guarda igual; para comparar idéntico PCM offline usar el script descrito abajo.

## Motor B

Implementación propia de YIN en JavaScript, no aubio ni su yinfast, no pYIN y sin modelo neuronal. Se implementan diferencia cuadrática con soporte fijo, normalización por media acumulativa (CMNDF), primer mínimo bajo 0,15 y refinamiento parabólico. Para reducir CPU se usa decimación a ≤16 kHz precedida de FIR de 31 coeficientes, ventana Blackman y corte 0,4/factor. FIR centrado dentro de la ventana disponible, bordes extendidos; no requiere audio futuro fuera de ella. Es una variante práctica, no una reproducción certificada de todas las etapas de refinamiento del artículo original. Se utilizan buffers reutilizados.

Misma captura/ventana acústica que A: 2048 muestras, ~5 ms de hop, centros iguales con STFT. El RMS y clipping provienen del audio original. Misma puerta energética adaptativa, límites personalizados, confirmación inicial 30 ms, saltos 40 ms y recuperación. Claridad de B=1-CMNDF: NO es probabilidad clínica ni magnitud calibrada equivalente a claridad NSDF. B no incorpora la segunda vía filtrada NSDF de A. Conserva nulls y no inventa puntos.

Todo ocurre en el worker local. Sin claves, servicios, coste por minuto, WASM ni nuevas dependencias. Descarga adicional solo del módulo JS, unos pocos KB. Requiere navegador con micrófono HTTPS, AudioWorklet y workers ES modules, como el motor actual. Errores siguen visibles y preservan audio; se puede volver a A para la siguiente grabación, sin fallback silencioso.

## Resultados del banco

191 pruebas JS y 12 Python pasan localmente; pruebas incluyen elección B a través del cliente/worker/controlador, bloqueo y desbloqueo de selector, fuente provisional correcta, WAV íntegro y análisis final Praat independiente; tonos 55–950 Hz a 44,1/48 kHz, armónicos, silencio/ruido y sincronía.

Reproducir con python scripts/benchmark-yin-ab.py SALIDA.json, después de instalar requirements.txt. Banco de 19 casos públicos/sintéticos, incluidos dos extractos humanos en inglés y copias de ganancia baja. Ambos motores procesan exactamente las mismas muestras (hash publicado) con rango común 75–600 Hz contra las mismas referencias Praat. Mediciones: docs/yin-ab-measurements.json.

| Lectura | A actual | B YIN |
|---|---:|---:|
| Masculina | 61,1 % | 47,7 % |
| Femenina | 73,2 % | 64,7 % |
| Masculina, ganancia baja | 58,5 % | 41,5 % |
| Femenina, ganancia baja | 65,4 % | 56,8 % |

Cobertura relativa a Praat, no sensibilidad clínica. B no supera a A en estas lecturas. CPU P90 offline aproximada: A 0,24–0,30 ms/ventana; B 0,14–0,18 en los ejemplos mostrados. No equivale a retraso de micrófono ni FPS. Una señal con F0=150 Hz y tercer armónico muy dominante es seguida por B cerca de 450 Hz (~1910 cents de discrepancia): no se debe interpretar el contador de octavas=0 como ausencia de todos los errores armónicos. A conserva la F0 correcta en ese caso. Silencio y ruido no periódico del banco no generan voz. Más cobertura no se considera automáticamente más precisión.

No se ha realizado prueba de micrófono real en navegador ni validación en español, infancia o voz patológica. PR experimental para comparación manual, sin diagnóstico ni promesa de mejora.

Referencia: de Cheveigné y Kawahara (2002), YIN, a fundamental frequency estimator for speech and music, DOI 10.1121/1.1458024. https://labrosa.ee.columbia.edu/doc/yin.html
