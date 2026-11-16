# Facebook Publisher

Aplicación web de un solo archivo para compartir una publicación de Facebook en muchos grupos en minutos, sin poner en riesgo la cuenta.

**Abrir la app:** https://arlizheredia.github.io/facebook-publisher/

## Funciones

- **Publicar:** URL de origen con limpieza de parámetros de rastreo, editor con negrita y cursiva Unicode, emojis, hashtags, variables (`{grupo}`, `{fecha}`, `{enlace}`), plantillas, imágenes, vídeo y audio (con conversión de audio a vídeo) y vista previa.
- **Grupos:** alta, edición, borrado, activación, etiquetas, notas o normas, acciones masivas, importación y exportación, y un marcador (*bookmarklet*) que captura todos tus grupos desde Facebook.
- **Publicación asistida:** copia el texto y abre cada grupo en una ventana lateral; tú pegas y publicas. Incluye pausas entre grupos, atajos de teclado y reanudación.
- **Historial**, **Centro de Ayuda** integrado, tema claro, oscuro o del sistema, y copia de seguridad.

## ¿Por qué no publica de forma automática?

Meta retiró en abril de 2024 la API de publicación en grupos, y automatizar publicaciones incumple sus condiciones y provoca bloqueos de cuenta. La app automatiza todo lo demás y deja el clic de «Publicar» en manos de la persona. Los detalles están en el Centro de Ayuda, en el artículo «Cómo funciona».

## Privacidad

Sin servidor: los datos se guardan en el `localStorage` del navegador y nunca se piden credenciales de Facebook.

## Tests

```bash
node tests/publicacion.test.mjs [URL_PUBLICACION] [URL_GRUPO]
```

Prueba de extremo a extremo con Chrome sin interfaz (solo necesita Node 18+ y Chrome; `CHROME=/ruta` si no está en el `PATH`). Recorre todo el flujo: reconoce la publicación y el grupo, pasa la comprobación de seguridad, copia el texto y abre el grupo correcto, lo registra en el historial con la pausa y el bloqueo de 24 h, y verifica con el marcador que la publicación aparece en el grupo, incluidos los casos negativos.

**No accede a Facebook ni usa ninguna cuenta:** las peticiones a `www.facebook.com` se interceptan y se responden con un grupo simulado. Para comprobar una publicación real, usa **Historial → Verificar** en la app con tu sesión de Facebook (ver «Verificar que una publicación aparece en el grupo» en el Centro de Ayuda).
