# IbraMusic

Reproductor web con búsqueda de música, biblioteca local, playlists, letras sincronizadas y salas de escucha.

## Desarrollo

```sh
npm ci
npm run dev
```

Vite sirve el proyecto en el puerto 5174. Para probar la versión de producción y el modo instalable, ejecuta `npm run build` y después `npm run preview`. El service worker se registra en la compilación de producción. El navegador necesita cargar la web al menos una vez para poder abrirla sin conexión. Las descargas y los archivos locales se guardan en el navegador.

## Comprobaciones

```sh
npm test
npm run build
npm run lint:regression
```

`npm run lint` muestra todos los problemas pendientes. La comprobación de CI conserva las reglas y detecta aumentos por archivo y regla sobre la base de problemas registrados.

## Supabase y Vercel

La migración de `supabase/migrations` presupone que existen las tablas de la versión anterior de IbraMusic. Aplícala primero en un entorno de pruebas con cuentas distintas para propietario, colaborador y visitante. Ahí se definen la propiedad de los datos, la colaboración en playlists y el borrado de cuenta. La administración de destacados requiere el atributo booleano `ibramusic_admin` en `app_metadata` del usuario autorizado. Los enlaces de recuperación de contraseña deben dirigir a una URL permitida en la configuración de autenticación.

Vercel publica la carpeta `web-build`. La configuración de Vite ofrece proxies adicionales para desarrollo. Prueba reproducción, letras, búsqueda, importación y salas en la URL de previsualización antes de publicar.

## Audio en el navegador

Web Audio puede procesar archivos locales y fuentes que permiten su uso desde el origen de la aplicación. El audio del reproductor de YouTube se reproduce dentro de su iframe, fuera del alcance del ecualizador de IbraMusic. Las teclas multimedia dependen del soporte de Media Session del navegador y del sistema.
