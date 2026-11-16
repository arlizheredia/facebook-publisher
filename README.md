# Facebook Publisher

Aplicación web de un solo archivo para compartir una publicación de Facebook en muchos grupos en minutos, sin poner en riesgo la cuenta.

**Abrir la app:** https://arlizheredia.github.io/facebook-publisher/

## Funciones

- **Publicar:** URL de origen con limpieza de parámetros de rastreo, editor con negrita y cursiva Unicode, emojis, hashtags, variables (`{grupo}`, `{fecha}`, `{enlace}`), plantillas, imágenes, vídeo y audio (con conversión de audio a vídeo) y vista previa.
- **Grupos:** alta, edición, borrado, activación, etiquetas, notas o normas, acciones masivas, importación y exportación, y un marcador (*bookmarklet*) que captura todos tus grupos desde Facebook.
- **Publicación asistida:** copia el texto y abre cada grupo en una ventana lateral; tú pegas y publicas. Incluye pausas entre grupos, atajos de teclado y reanudación.
- **Informe diario** de difusión a partir del Historial: resumen profesional editable, con copia, PDF y Word.
- **Historial**, **Centro de Ayuda** integrado, tema claro, oscuro o del sistema, y copia de seguridad.

## Publicación automática (extensión de Chrome)

Con la extensión de [`extension/`](extension/) (descarga: [facebook-publisher-extension.zip](https://arlizheredia.github.io/facebook-publisher/facebook-publisher-extension.zip)), un clic en **Comenzar publicación automática** publica en todos los grupos seleccionados el texto, los archivos y la URL. La extensión usa la sesión de Facebook que ya tienes abierta en Chrome; la app aplica los límites de seguridad (pausas, máximos por hora y día, 24 h por grupo) y todo se detiene si Facebook muestra un aviso.

Instalación: descomprime el .zip, abre `chrome://extensions`, activa el *Modo de desarrollador*, pulsa **Cargar descomprimida** y elige la carpeta. La primera vez usa el **modo prueba** (prepara la publicación sin pulsar «Publicar»).

> Las condiciones de Facebook no permiten publicar de forma automatizada: puede haber bloqueos temporales o restricciones de la cuenta. Empieza con pocos grupos y límites bajos.

## Privacidad

Sin servidor: los datos se guardan en el `localStorage` del navegador y nunca se piden credenciales de Facebook.

## Tests

```bash
node tests/publicacion.test.mjs [URL_PUBLICACION] [URL_GRUPO]   # modo asistido + verificación
node tests/automatico.test.mjs  [URL_PUBLICACION] [URL_GRUPO]   # publicación automática con la extensión
```

Prueba de extremo a extremo con Chrome sin interfaz (solo necesita Node 18+ y Chrome; `CHROME=/ruta` si no está en el `PATH`). Recorre todo el flujo: reconoce la publicación y el grupo, pasa la comprobación de seguridad, copia el texto y abre el grupo correcto, lo registra en el historial con la pausa y el bloqueo de 24 h, y verifica con el marcador que la publicación aparece en el grupo, incluidos los casos negativos.

**No accede a Facebook ni usa ninguna cuenta:** las peticiones a `www.facebook.com` se interceptan y se responden con un grupo simulado. Para comprobar una publicación real, usa **Historial → Verificar** en la app con tu sesión de Facebook (ver «Verificar que una publicación aparece en el grupo» en el Centro de Ayuda).
