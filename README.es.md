# 🕷️🏷️ bskrape: Web scraping aplicado  
[![en](https://img.shields.io/badge/lang-en-blue.svg)](https://github.com/viccc287/bskrape/blob/main/README.md)

> **Nota**: ¡Este proyecto nació de pura curiosidad y ganas de aprender sobre web scraping!  

> **Nota 2**: El código no es perfecto... pero funciona para mis objetivos iniciales: obtener las ofertas relevantes del súper.

## 🎯 ¿Qué es?  

Este proyecto es mi espacio para experimentar con web scraping y tiene estas características:  

- **Scraping real**: Por ahora funciona con Bodega Aurrera.  
- **Cazador de ofertas**: bskrape encuentra productos en liquidación (terminados en 01, 02 y 03) y descuentos de más del 40 %.  
- **Código de Walmart**: Incluí código para Walmart, pero está desactivado (los atrapabots me ganaron).  
- **Datos a tu gusto**: Exporta en JSON o CSV, como prefieras.  
- **Búsqueda local**: Filtra por código postal.  
- **Logs en vivo**: Para ver qué está pasando en tiempo real.  

> *¿Y por qué "bskrape"? "b" de bodega, y "skrape" pues... ya te imaginarás.*  

## 🌐 Cómo empezar  

Tienes dos opciones:  

### Opción 1: Usa el servidor que ya está listo (¡la forma rápida! 🚀)  
Hay un servidor funcionando desde el 22/10/2024. Pero ojo:  
- Puede caerse en cualquier momento (¡hey, es un proyecto de aprendizaje!).  
- La primera vez tarda como 10 segundos en despertar (solo dale refresh).  
- Solo conecta tu frontend a la API y listo.  
- **Importante**: El servidor usa un proxy residencial que pagué yo, pero la cuota puede acabarse pronto (¡a menos que alguien done 😄).  

### Opción 2: Móntalo tú mismo (para tener todo el control 🛠️)  
Si prefieres correr tu propio servidor:  
1. Clona el repo.  
2. Configura el backend en el puerto 4000.  
3. Conecta tu frontend a `localhost:4000`.  
4. **Importante**: NECESITAS un proxy residencial para evitar bloqueos. Puedes conseguir uno en [Data Impulse](https://app.dataimpulse.com/sign-in).  

## 🔍 Endpoints de la API  

```markdown
GET  /scrape           # Inicia el scraping  
GET  /get-categories   # Trae las categorías de la tienda  
GET  /logs             # Mira los logs en vivo  
GET  /ping             # Revisa si el servidor está vivo  
GET  /proxy-status     # Checa cómo va el proxy  
```

## 🚀 Variables de entorno necesarias para el backend
 
   ```bash
   PORT=4000  
   PROXY_URL=tu_url_de_proxy_residencial  # Necesario para que no te detecten... 
   PROXY_USERNAME=tu_usuario  
   PROXY_PASSWORD=tu_contraseña  
   ```
## 🧪 La parte técnica  

- Hecho con Node.js, Express y Puppeteer.  
- Necesitas un proxy residencial para evitar bloqueos (te recomiendo [Data Impulse](https://app.dataimpulse.com/sign-in)).  
- Maneja JSON y CSV.  
- Sistema de logs en tiempo real.  

## ⚠️ Cosas a tener en cuenta  

- **Sobre el proxy**: El servidor usa un proxy residencial que pagué yo, pero es temporal. Si lo vas a usar en serio, mejor consigue tu propio proxy.  
- **El código de Walmart**: Está desactivado porque detectan bots, pero lo dejé por si quieres aprender con él.  
- **El servidor**: Como es un proyecto de aprendizaje, puede tener sus momentos de descanso.  

## 🤝 ¿Quieres contribuir?  

¿Tienes ideas, encontraste un bug o quieres mejorarlo? ¡Manda tu pull request! Es un proyecto para aprender, así que aprendamos juntos.  

## 📜 Licencia  

Licencia MIT - ¡úsalo para aprender!  

## 🙏 Agradecimientos  

Gracias especiales a:  
- La gente de Puppeteer por sus herramientas.  
- La comunidad de Node.js.  
- Todos los que usan esto para aprender sobre web scraping.
- Render por el hosting con Docker.

---

*¡Recuerda que esto es para aprender!* 🚀  