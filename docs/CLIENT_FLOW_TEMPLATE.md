# Especificación del Flujo para WhatsApp Bot

Este documento es un **template** para que un nuevo cliente describa el comportamiento deseado de su ChatBot de WhatsApp con flujo estático. Con la información completada aquí se puede crear un nuevo proyecto basado en este repositorio.

## 1. Datos Generales
- **Nombre del Cliente:**
- **Persona de Contacto:**
- **WhatsApp / Teléfono de Soporte:**
- **Zona(s) donde brinda el servicio:**

## 2. Textos del Bot
Los textos que el bot enviará se gestionan desde una hoja de Google Sheets llamada `Setup-Texto`. Cada fila representa un mensaje identificable por una clave (`ID_TEXTO`).

| ID_TEXTO | TEXTO |
|----------|-------|
| saludo_inicial | ¡Hola! Soy el ChatBot ... |
| horario_atencion | Nuestro horario de atención es de lunes a viernes de 08:00 a 12:30 y de 16:00 a 20:00, y los sábados de 09:00 a 12:00. No hay atención los domingos. |
| tecnico_derivacion_fontana | ¡Perfecto! Lo derivamos con una persona de soporte técnico para evacuar sus dudas. Por favor haga clic en el siguiente link: https://bit.ly/4l1iOvh |
| precios_link_contratar | Si deseas contratar alguno de estos planes por favor haz clic en el siguiente link 📞 https://bit.ly/4l1iOvh |
| ... | ... |

**Instrucciones:**
1. Realiza una copia de [nuestra hoja base](https://docs.google.com) y renómbrala con el nombre de tu proyecto.
2. En la pestaña `Setup-Texto` completa o modifica los mensajes según tus necesidades.
3. No cambies los nombres de las columnas.

## 3. Definición del Flujo
Describe los menús y las transiciones entre mensajes. Se sugiere utilizar una segunda pestaña en la misma hoja con el nombre `Setup-Flujo` y las siguientes columnas:

| ID_PASO | ID_TEXTO_A_ENVIAR | OPCIONES_DEL_USUARIO | SIGUIENTE_PASO | NOTAS |
|--------|-------------------|----------------------|----------------|-------|
| inicio | saludo_inicial | 1: Fontana, 2: Ibarreta, 3: Otra Zona | menu_principal | Mensaje de bienvenida |
| menu_principal | menu_principal_pregunta | 1,2,3 | menu_fontana, menu_ibarreta, otra_zona | |
| ... | ... | ... | ... | |

- **ID_PASO:** identificador único del estado del flujo.
- **ID_TEXTO_A_ENVIAR:** clave que debe existir en `Setup-Texto`.
- **OPCIONES_DEL_USUARIO:** qué puede escribir el usuario para avanzar.
- **SIGUIENTE_PASO:** destino de cada opción; usar `ID_PASO` de la columna anterior.
- **NOTAS:** aclaraciones para los desarrolladores.

## 4. Mensajes Especiales
- **Errores / Fallbacks:** 
  - Texto cuando el usuario ingresa una opción inválida.
  - Texto cuando el usuario está inactivo por mucho tiempo.
- **Derivaciones a humanos:** incluir los enlaces o números de contacto.

## 5. Recursos Adicionales
- Enlaces a logos, imágenes u otros recursos que deba enviar el bot.

## 6. Registro de Interacciones
Si deseas llevar estadísticas de uso, crea una pestaña adicional llamada `bot-registros` en la hoja de cálculo y asegúrate de que la primera fila contenga las columnas:

| Fecha | Telefono | Flujo |

El bot agregará automáticamente una fila por cada paso que realice el usuario.

## 7. Aprobación
> Firma y fecha del cliente indicando que la información es correcta y puede implementarse.

---

Una vez completado este documento y la hoja de cálculo, el equipo técnico puede clonar este repositorio, configurar las credenciales necesarias y desplegar el nuevo bot.
