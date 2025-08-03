// app.js
const { createBot, createProvider, createFlow, addKeyword, EVENTS } = require('@bot-whatsapp/bot')

const QRPortalWeb = require('@bot-whatsapp/portal')
const BaileysProvider = require('@bot-whatsapp/provider/baileys')
const MockAdapter = require('@bot-whatsapp/database/mock')

/**
 * IMPORTANTE: Recuerda que los flujos se declaran de forma que los flujos "hijos"
 * (a los que se llega desde otro flujo) deben ser declarados ANTES del flujo "padre"
 * que los invoca.
 */

// Define los números de atención administrativa por localidad (NECESITAS REEMPLAZAR ESTOS VALORES)
const NUMERO_ADMIN_FONTANA = '5491140638555@s.whatsapp.net'; // Ejemplo: reemplazar con el número real de WhatsApp del admin de Fontana
const NUMERO_ADMIN_IBARRETA = '5491140638555@s.whatsapp.net'; // Ejemplo: reemplazar con el número real de WhatsApp del admin de Ibarreta

// ----------------------------------------------------
// FLUJOS FINALES / HOJAS DEL ÁRBOL
// ----------------------------------------------------

// Flujo para "Llama a una persona" (general, usado también para servicio técnico)
const flowLlamarPersona = addKeyword(['llamar_persona', 'llamar', 'contacto', 'agente', 'hablar con alguien', 'otras consultas']) // Añadimos 'otras consultas'
    .addAnswer('Perfecto! Lo derivamos con una persona de atención para evacuar sus dudas.')
    .addAnswer('Por favor haga clic en el siguiente link:', null, async (ctx, { flowDynamic }) => {
        await flowDynamic('📞 https://bit.ly/4l1iOvh'); // Asegúrate de que este link sea el correcto
    })
    .addAnswer('Horario de atención: Lunes a Viernes de 9:00 AM a 6:00 PM.', { delay: 500 })
    .addAnswer('¿Hay algo más en lo que pueda ayudarte?', { delay: 1000 }, async (ctx, { gotoFlow, fallBack }) => {
        if (ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }
        return fallBack('Si deseas explorar otras opciones, escribe *MENU* para volver al inicio.');
    }, [
        {
            delay: 120000, // 2 minutos
            keywords: [],
            async handler(ctx, { flowDynamic, gotoFlow }) {
                await flowDynamic('Parece que no has respondido. ¿Hay algo más en lo que pueda ayudarte? Recuerda que puedes escribir *MENU* para ver las opciones principales.');
            },
        },
    ]);

// Flujo para "Informar un Pago"
const flowInformarPago = addKeyword(['informar_pago', 'ya pague', 'reportar pago'])
    .addAnswer('Para informar tu pago, por favor, envíanos una captura del comprobante de transferencia junto con el nombre y DNI o CUIT del titular del servicio.')
    .addAnswer('En breve verificaremos tu pago y actualizaremos tu estado.', { capture: true }, async (ctx, { gotoFlow, flowDynamic, fallBack, provider }) => {
        // Verifica si el mensaje contiene archivos (imagen, documento, video)
        if (ctx.has
            || ctx.has
            || ctx.has
            || ctx.has
        ) {
            await flowDynamic('¡Muchas gracias!, recibimos su comprobante.');
            await flowDynamic('En breve verificaremos tu pago y actualizaremos el estado de tu servicio.');

            // Lógica para reenviar el mensaje a un número específico (admin de Fontana o Ibarreta)
            // Necesitamos saber de qué zona viene el usuario para reenviar al número correcto.
            // Esto es un poco complejo sin un estado persistente del usuario.
            // Por ahora, asumimos que estamos en el flujo de Fontana y lo enviamos a Fontana.
            // Para una solución más robusta, deberíamos guardar la "zona" del usuario en la base de datos (DBAdapter).

            // TEMPORAL: Reenviaremos al número de Fontana por defecto para el ejemplo.
            // En una aplicación real, usarías el estado del usuario (desde la DB)
            // para saber a qué número reenviar (Fontana o Ibarreta).
            try {
                // Obtener el tipo de mensaje original para reenviarlo correctamente
                const type = ctx.message.image ? 'image' : ctx.message.document ? 'document' : ctx.message.video ? 'video' : 'text';
                const remoteJid = ctx.from; // El ID del remitente original

                let adminTargetNumber;
                // Esto es una simplificación. Idealmente, la zona se guardaría en la DB del usuario.
                // Para este ejemplo, lo enviaremos al número de Fontana.
                // Si necesitas que esto sea dinámico según la zona elegida, tendríamos que
                // modificar la estructura de almacenamiento de datos del bot.
                adminTargetNumber = NUMERO_ADMIN_FONTANA; // O NUMERO_ADMIN_IBARRETA, dependiendo del origen del flujo


                if (type === 'image' && ctx.message.image) {
                     await provider.vendor.sendMessage(adminTargetNumber, { image: { url: ctx.message.image.url }, caption: `Comprobante de ${ctx.pushName} (${remoteJid}). DNI/CUIT: ${ctx.body}` });
                } else if (type === 'document' && ctx.message.document) {
                     await provider.vendor.sendMessage(adminTargetNumber, { document: { url: ctx.message.document.url }, mimetype: ctx.message.document.mimetype, fileName: ctx.message.document.fileName, caption: `Comprobante de ${ctx.pushName} (${remoteJid}). DNI/CUIT: ${ctx.body}` });
                }
                // Si es solo texto (el DNI/CUIT que acompañó al archivo)
                else if (ctx.body) {
                    await provider.vendor.sendMessage(adminTargetNumber, { text: `Comprobante de ${ctx.pushName} (${remoteJid}). DNI/CUIT/Nombre: ${ctx.body}` });
                }
                console.log(`Comprobante reenviado a ${adminTargetNumber}`);

            } catch (e) {
                console.error('Error al reenviar comprobante:', e);
                await flowDynamic('Hubo un problema al procesar tu comprobante. Por favor, inténtalo de nuevo o comunícate directamente con soporte.');
            }

            return gotoFlow(flowPrincipal); // Vuelve al menú principal después de procesar
        } else {
            // Si el usuario no envió un archivo
            return fallBack('Por favor, envía una *captura o archivo* de tu comprobante junto con el nombre y DNI o CUIT. Si no tienes el comprobante, puedes escribir *MENU* para volver al inicio.');
        }
    });


// Flujo para "Conocer los medios de pago"
const flowMediosPago = addKeyword(['medios_pago', 'pagos', 'como pagar', 'donde pago'])
    .addAnswer('Puedes realizar tus pagos a través de los siguientes medios:', { delay: 500 })
    .addAnswer(
        '• Pago en línea: [Link al Portal de Pagos]\n' +
        '• Transferencia bancaria:\n' +
        '  *VANGUARD INTERNET SRL*\n' +
        '  CUIT: 30716576376\n' +
        '  CBU: 0170304520000031123901\n' +
        '  ALIAS: VANGUARD.INTERNET\n' +
        '• Pagar en el local de Fontana: *Av. San Martín 1628*\n', // Lista de Puntos de Pago (se eliminó la lista genérica)
        null, // No hay media
        async (ctx, { flowDynamic }) => {
            await flowDynamic('Recuerda incluir tu número de cliente en la referencia.');
        }
    )
    .addAnswer('¿Hay algo más en lo que pueda ayudarte?', { delay: 1000 })
    .addAnswer('Escribe *MENU* para volver al inicio.', { capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        if (ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }
        return fallBack('Si deseas explorar otras opciones, escribe *MENU* para volver al inicio.');
    });

// Flujo para "Consultar precios de los servicios" (No hay cambios de código, solo se verifica el link)
const flowConsultarPrecios = addKeyword(['consultar_precios', 'precios', 'planes', 'costo'])
    .addAnswer('Para consultar nuestros planes y precios, visita nuestra página web: [Link a la Página de Precios]')
    .addAnswer('También puedes contactarnos directamente al *[Número de Ventas]* para una atención personalizada.')
    .addAnswer('¿Hay algo más en lo que pueda ayudarte?', { delay: 1000 })
    .addAnswer('Escribe *MENU* para volver al inicio.', { capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        if (ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }
        return fallBack('Si deseas explorar otras opciones, escribe *MENU* para volver al inicio.');
    });

// Flujo para "Otras Consultas" (NUEVO FLUJO)
const flowOtrasConsultas = addKeyword(['otras_consultas', '4', '4️⃣']) // Agregamos la keyword 4️⃣
    .addAnswer('Perfecto! Lo derivamos con una persona de atención para evacuar sus dudas.')
    .addAnswer('Por favor haga clic en el siguiente link:', null, async (ctx, { flowDynamic }) => {
        await flowDynamic('📞 https://bit.ly/4l1iOvh'); // Usa el mismo link de contacto que flowLlamarPersona
    })
    .addAnswer('Horario de atención: Lunes a Viernes de 9:00 AM a 6:00 PM.')
    .addAnswer('¿Hay algo más en lo que pueda ayudarte?', { delay: 1000 })
    .addAnswer('Escribe *MENU* para volver al inicio.', { capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        if (ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }
        return fallBack('Si deseas explorar otras opciones, escribe *MENU* para volver al inicio.');
    });


// ----------------------------------------------------
// FLUJOS INTERMEDIOS
// ----------------------------------------------------

// Flujo para "Servicio Técnico"
const flowServicioTecnico = addKeyword(['tecnico', 'problema', 'no tengo internet', 'soporte'])
    .addAnswer('¡Importante! Antes de continuar, por favor, realiza estos pasos:')
    .addAnswer('• Reinicia tu router o equipo.\n• Verifica los cables y la alimentación eléctrica.\n• Confirma que realizaste estos pasos.', { delay: 1000 })
    .addAnswer('¿Ya realizaste estos pasos? (Sí/No)', { capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        if (ctx.body.toLowerCase().includes('si') || ctx.body.toLowerCase().includes('sí')) {
            return gotoFlow(flowLlamarPersona); // Deriva a persona si ya intentó los pasos
        } else if (ctx.body.toLowerCase().includes('no')) {
            return fallBack('Es fundamental que realices estos pasos para poder diagnosticar tu problema. Por favor, intenta de nuevo cuando los hayas completado. Si aún así no puedes, podemos conectarte con un agente. Escribe *MENU* para volver al inicio.');
        } else {
            return fallBack('No entendí tu respuesta. Por favor, responde "Sí" o "No". Escribe *MENU* para volver al inicio.');
        }
    });

// Flujo para "Atención Administrativa"
const flowAtencionAdministrativa = addKeyword(['administrativa', 'factura', 'pagos', 'planes', 'administracion'])
    .addAnswer('¿En qué puedo ayudarte con Atención Administrativa?', { delay: 500 })
    // MODIFICADO: Agregamos la opción 4️⃣ para "Otras Consultas"
    .addAnswer('1️⃣ Informar un Pago\n2️⃣ Conocer Medios de Pago\n3️⃣ Consultar Precios de los Servicios\n4️⃣ Otras Consultas', { capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        if (ctx.body.includes('1') || ctx.body.toLowerCase().includes('informar') || ctx.body.includes('1️⃣')) {
            return gotoFlow(flowInformarPago);
        }
        if (ctx.body.includes('2') || ctx.body.toLowerCase().includes('medios') || ctx.body.includes('2️⃣')) {
            return gotoFlow(flowMediosPago);
        }
        if (ctx.body.includes('3') || ctx.body.toLowerCase().includes('precios') || ctx.body.toLowerCase().includes('planes') || ctx.body.includes('3️⃣')) {
            return gotoFlow(flowConsultarPrecios);
        }
        if (ctx.body.includes('4') || ctx.body.toLowerCase().includes('otras') || ctx.body.includes('4️⃣')) {
            return gotoFlow(flowOtrasConsultas); // NUEVO: Redirigimos al nuevo flujo
        }
        return fallBack('Por favor, elige una opción válida (1, 2, 3 o 4, o los emojis 1️⃣, 2️⃣, 3️⃣, 4️⃣). Escribe *MENU* para volver al inicio.');
    });

// Flujo para "Otra Zona" (Zona no cubierta)
const flowOtraZona = addKeyword(['otra_zona', 'otro', 'otra', 'mi zona no esta'])
    .addAnswer('Actualmente, nuestros servicios de internet se concentran en Fontana e Ibarreta.')
    .addAnswer('Por favor, contáctanos directamente si deseas consultar la disponibilidad en otra zona: *[Número de Contacto para Otras Zonas]*')
    .addAnswer('¿Hay algo más en lo que pueda ayudarte?', { delay: 1000 })
    .addAnswer('Escribe *MENU* para volver al inicio.', { capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        if (ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }
        return fallBack('Si deseas explorar otras opciones, escribe *MENU* para volver al inicio.');
    });

// Flujo para "Servicio de Internet en Ibarreta"
const flowServicioIbarra = addKeyword(['Ibarreta', '2', '2️⃣'])
    .addAnswer('Entendido, servicio en Ibarreta. ¿Necesitas atención administrativa o soporte técnico?', { delay: 500 })
    .addAnswer('1️⃣ Atención Administrativa\n2️⃣ Servicio Técnico', { capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        if (ctx.body.includes('1') || ctx.body.toLowerCase().includes('administrativa') || ctx.body.includes('1️⃣')) {
            return gotoFlow(flowAtencionAdministrativa);
        }
        if (ctx.body.includes('2') || ctx.body.toLowerCase().includes('tecnico') || ctx.body.includes('2️⃣')) {
            return gotoFlow(flowServicioTecnico);
        }
        return fallBack('No entendí tu respuesta. Por favor, elige una opción válida (1 o 2, o los emojis 1️⃣, 2️⃣). Escribe *MENU* para volver al inicio.');
    });

// Flujo para "Servicio de Internet en Fontana"
const flowServicioFontana = addKeyword(['fontana', '1', '1️⃣'])
    .addAnswer('Perfecto, servicio en Fontana. ¿Necesitas atención administrativa o soporte técnico?', { delay: 500 })
    .addAnswer('1️⃣ Atención Administrativa\n2️⃣ Servicio Técnico', { capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        if (ctx.body.includes('1') || ctx.body.toLowerCase().includes('administrativa') || ctx.body.includes('1️⃣')) {
            return gotoFlow(flowAtencionAdministrativa);
        }
        if (ctx.body.includes('2') || ctx.body.toLowerCase().includes('tecnico') || ctx.body.includes('2️⃣')) {
            return gotoFlow(flowServicioTecnico);
        }
        return fallBack('No entendí tu respuesta. Por favor, elige una opción válida (1 o 2, o los emojis 1️⃣, 2️⃣). Escribe *MENU* para volver al inicio.');
    });


// ----------------------------------------------------
// FLUJO PRINCIPAL (Punto de entrada del bot)
// ----------------------------------------------------

const flowPrincipal = addKeyword(['hola', 'ole', 'alo', 'buenos dias', 'buenas tardes', 'buenas noches', 'menu', EVENTS.WELCOME])
    .addAnswer(
        null, // Usamos null para que el mensaje sea generado en el handler
        null,
        async (ctx, { flowDynamic }) => {
            const name = ctx.pushName || 'cliente';
            await flowDynamic(`¡Hola ${name}! Soy el ChatBot Vanguard. ¿En qué zona necesitas ayuda con tu servicio de internet?`);
        },
        [],
    )
    .addAnswer('Por favor, elige una opción:', { delay: 500 })
    .addAnswer('1️⃣ Servicio de Internet en Fontana\n2️⃣ Servicio de Internet en Ibarreta\n3️⃣ Otra Zona', { capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        if (ctx.body.includes('1') || ctx.body.toLowerCase().includes('fontana') || ctx.body.includes('1️⃣')) {
            return gotoFlow(flowServicioFontana);
        }
        if (ctx.body.includes('2') || ctx.body.toLowerCase().includes('ibarret') || ctx.body.includes('2️⃣')) {
            return gotoFlow(flowServicioIbarra);
        }
        if (ctx.body.includes('3') || ctx.body.toLowerCase().includes('otra') || ctx.body.includes('3️⃣')) {
            return gotoFlow(flowOtraZona);
        }
        return fallBack('No entendí tu respuesta. Por favor, elige una opción válida (1, 2 o 3, o los emojis 1️⃣, 2️⃣, 3️⃣).');
    })
    .addAnswer(
        'Lo siento, no entendí tu solicitud. Por favor, utiliza las opciones del menú o escribe *MENU* para empezar de nuevo.',
        { delay: 1500 }
    );


// ----------------------------------------------------
// FUNCIÓN PRINCIPAL DE INICIO DEL BOT
// ----------------------------------------------------
const main = async () => {
    const adapterDB = new MockAdapter();

    const adapterFlow = createFlow([
        flowLlamarPersona,
        flowConsultarPrecios,
        flowMediosPago,
        flowInformarPago,
        flowServicioTecnico,
        flowAtencionAdministrativa,
        flowOtraZona,
        flowServicioIbarra,
        flowServicioFontana,
        flowOtrasConsultas, // Asegúrate de incluir el nuevo flujo aquí
        flowPrincipal
    ]);
    const adapterProvider = createProvider(BaileysProvider);

    createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    });

    QRPortalWeb();
};

main();