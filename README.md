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
