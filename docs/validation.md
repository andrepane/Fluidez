# Comprobación antes de usar el piloto

No se han realizado nuevos benchmarks con micrófono real en esta PR. No se afirma mejora de latencia ni exactitud.

## Flujo en Preview

Configurar ambas variables y Firewall según README. Probar código incorrecto/ausente (sin emisión de token), correcto, permisos denegados, conexión interrumpida durante habla, silencio, voz baja y dos muestras consecutivas. Comprobar que el paciente solo ve el medidor y Terminar; que al detener aparece la tarjeta inmediatamente; que audio/resumen observado sobreviven al error del final; que A/B restaura tarea y objetivo y permite escuchar intervalos. Importar audio sin código y verificar que el análisis local funciona.

## Medición técnica sin cambiar motores

Utilizar voz propia/material autorizado, mismo micrófono, navegador, distancia y equipo. Registrar versión del navegador, CPU, duración, tarea, objetivo y descarga del modelo (primera vez frente a caché).

Para velocidad: lectura de texto conocido de 30–60 s, ritmo constante, otra repetición acelerando y otra desacelerando. Añadir una pausa deliberada de 5 s. Capturar pantalla/audio para comprobar cuándo cambia el marcador. Comparar recuento contra palabras realmente pronunciadas, incluyendo omisiones/repeticiones; el texto previsto no sustituye esa referencia.

Para análisis final: muestras de 30, 60 y 120 s, tres repeticiones por duración, medir desde Terminar hasta resultados con cronómetro/captura. Separar descarga inicial de inferencia en caché. Mantener Whisper Base para comparar futuras optimizaciones con el mismo material y las mismas métricas.

| Equipo/navegador | Muestra/tarea | Duración | Modelo en caché | Tiempo hasta resultados | Palabras referencia | Palabras automático | Pausa conocida/detectada | Observaciones |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |

La cadencia del diagnóstico no es latencia por palabra. La ventana de hasta 15 s incluye historia anterior y puede retrasar cambios aunque el servicio responda rápido. El mayor periodo en objetivo describe feedback estimado, no eficacia terapéutica.

No concluir fiabilidad clínica a partir de estas pruebas. Sirven para detectar errores y decidir la siguiente comparación; concordancia y utilidad clínica requieren un estudio diseñado para ello.
