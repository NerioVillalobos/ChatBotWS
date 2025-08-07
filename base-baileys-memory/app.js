// app.js
// Modificacion funcional- > luego de la correccion de errores de compilacion
// Modificado por: Nervill
// Fecha: 2024-01-15
// Version: 1.0.0.BETA-20240115-v0.1

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
const flowLlamarPersona = addKeyword(['llamar_persona', 'llamar', 'contacto', 'agente', 'hablar con alguien', 'otras consultas'])
    .addAnswer(['Perfecto! Lo derivamos con una persona de atención para resolver sus dudas.','\nPor favor haga clic en el siguiente link:\n📞 https://bit.ly/4l1iOvh'])
    .addAnswer('¿Hay algo más en lo que pueda ayudarte?\nEscribe *MENU* para volver al inicio.', { delay: 1000, capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        if (ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }
        return fallBack('No entendí tu respuesta. Si deseas explorar otras opciones, escribe *MENU* para volver al inicio.');
    });


const flowInformarPagoFontana = addKeyword(['informar_pago_fontana'])
    .addAnswer(
        'Por favor, ingresa tu DNI/CUIT y tu Nombre y Apellido.',
        { capture: true },
        async (ctx, { state, gotoFlow }) => {
            await state.update({ customerInfo: ctx.body });
            return gotoFlow(flowCargaArchivoFontana);
        }
    );

const flowCargaArchivoFontana = addKeyword(['_CARGA_ARCHIVO_FONTANA_'])
    .addAnswer(
        'Gracias. Ahora, por favor, carga el archivo con el recibo de pago realizado y escribe *LISTO* cuando ya culmines de enviar el archivo.',
        { capture: true },
        async (ctx, { provider, state, endFlow, fallBack }) => {
            console.log('[flowCargaArchivoFontana] ctx.body:', ctx.body);
            const messageBody = (ctx.body || '').toUpperCase().trim();
            
            if (messageBody === 'LISTO') {
                const { customerInfo } = state.getMyState();
                const remoteJid = ctx.from;
                const pushName = ctx.pushName || 'Usuario Desconocido';
                const adminTextMessage = `📄 [NUEVO PAGO REPORTADO - FONTANA]\n\nDe: ${pushName} (${remoteJid})\n\nDatos del cliente: ${customerInfo}`;
                await provider.vendor.sendMessage(NUMERO_ADMIN_FONTANA, { text: adminTextMessage });
                return endFlow('Muchas gracias, de inmediato nuestro equipo procesará la información enviada.\n\nSi necesita algo más escriba *MENU*.');
            }

            const isMedia = ctx.message?.imageMessage || ctx.message?.documentMessage || ctx.message?.videoMessage;
            if (isMedia) {
                const remoteJid = ctx.from;
                const pushName = ctx.pushName || 'Usuario Desconocido';
                const mediaMessage = ctx.message.imageMessage || ctx.message.documentMessage || ctx.message.videoMessage;
                const fileUrl = mediaMessage.url;
                const mimeType = mediaMessage.mimetype;
                const caption = `[RECIBO DE PAGO - FONTANA] De ${pushName} (${remoteJid})`;

                if (mimeType.includes('image')) {
                    await provider.vendor.sendMessage(NUMERO_ADMIN_FONTANA, { image: { url: fileUrl }, caption });
                } else if (mimeType.includes('pdf')) {
                    const fileName = mediaMessage.fileName || 'recibo.pdf';
                    await provider.vendor.sendMessage(NUMERO_ADMIN_FONTANA, { document: { url: fileUrl }, mimetype: mimeType, fileName, caption });
                } else if (mimeType.includes('video')) {
                    await provider.vendor.sendMessage(NUMERO_ADMIN_FONTANA, { video: { url: fileUrl }, caption });
                }
                
                return fallBack('Recibido. Cuando termines, escribe *LISTO*.');
            }

            return fallBack('Lo siento, no pude procesar tu mensaje. Por favor, envía un archivo o escribe *LISTO* para terminar.');
        }
    );

const flowInformarPagoIbarreta = addKeyword(['informar_pago_ibarreta'])
    .addAnswer(
        'Por favor, ingresa tu DNI, CUIT o Nombre y Apellido.',
        {
            capture: true,
        },
        async (ctx, { state, gotoFlow }) => {
            await state.update({ customerInfo: ctx.body });
            return gotoFlow(flowCargaArchivoIbarreta);
        }
    )

const flowCargaArchivoIbarreta = addKeyword(['_CARGA_ARCHIVO_IBARRETA_'])
    .addAnswer(
        'Gracias. Ahora, por favor, carga el archivo con el recibo de pago realizado y escribe *LISTO* cuando ya culmines de enviar el archivo.',
        {
            capture: true,
        },
        async (ctx, { provider, state, endFlow, fallBack }) => {
            console.log('[flowCargaArchivoIbarreta] ctx.body:', ctx.body);
            const messageBody = (ctx.body || '').toUpperCase().trim();

            if (messageBody.includes('LISTO')) {
                const { customerInfo } = state.getMyState();
                const remoteJid = ctx.from;
                const pushName = ctx.pushName || 'Usuario Desconocido';

                const adminTextMessage = `📄 [NUEVO PAGO REPORTADO - IBARRETA]\n\n` +
                                         `De: ${pushName} (${remoteJid})\n\n` +
                                         `Datos del cliente: ${customerInfo}`;
                await provider.vendor.sendMessage(NUMERO_ADMIN_IBARRETA, { text: adminTextMessage });

                return endFlow('Muchas gracias, de inmediato nuestro equipo procesará la información enviada.\n\nSi necesita algo más escriba *MENU*.');
            }

            let isMedia = ctx.message?.imageMessage || ctx.message?.documentMessage || ctx.message?.videoMessage;
            if (isMedia) {
                const remoteJid = ctx.from;
                const pushName = ctx.pushName || 'Usuario Desconocido';
                const mediaMessage = ctx.message.imageMessage || ctx.message.documentMessage || ctx.message.videoMessage;
                const fileUrl = mediaMessage.url;
                const mimeType = mediaMessage.mimetype;
                const caption = `[RECIBO DE PAGO - IBARRETA] De ${pushName} (${remoteJid})`;

                if (mediaMessage.mimetype.includes('image')) {
                    await provider.vendor.sendMessage(NUMERO_ADMIN_IBARRETA, { image: { url: fileUrl }, caption });
                } else if (mediaMessage.mimetype.includes('pdf')) {
                    const fileName = mediaMessage.fileName || 'recibo.pdf';
                    await provider.vendor.sendMessage(NUMERO_ADMIN_IBARRETA, { document: { url: fileUrl }, mimetype: mimeType, fileName, caption });
                } else if (mediaMessage.mimetype.includes('video')) {
                    await provider.vendor.sendMessage(NUMERO_ADMIN_IBARRETA, { video: { url: fileUrl }, caption });
                }
            }

            return fallBack('Recibido. ¿Algo más? Cuando termines, escribe *LISTO*.');
        }
    );


// Flujo para "Conocer los medios de pago"
const flowMediosPago = addKeyword(['medios_pago', 'pagos', 'como pagar', 'donde pago'])
    .addAnswer('Puedes realizar tus pagos a través de los siguientes medios:', { delay: 500 })
    .addAnswer(
        '• Pago en línea: [Link al Portal de Pagos]\n' +
        '• Transferencia bancaria:\n' +
        '   *VANGUARD INTERNET SRL*\n' +
        '   CUIT: 30716576376\n' +
        '   CBU: 0170304520000031123901\n' +
        '   ALIAS: VANGUARD.INTERNET\n' +
        '• Pagar en el local de Fontana: *Av. San Martín 1628*\n',
        null,
        async (ctx, { flowDynamic }) => {
            await flowDynamic('Recuerda incluir tu número de cliente en la referencia.');
        }
    )
    .addAnswer('¿Hay algo más en lo que pueda ayudarte?\nEscribe *MENU* para volver al inicio.', { delay: 1000, capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        if (ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }
        return fallBack('No entendí tu respuesta. Si deseas explorar otras opciones, escribe *MENU* para volver al inicio.');
    });

// Flujo para "Consultar precios de los servicios"
const flowConsultarPrecios = addKeyword(['consultar_precios', 'precios', 'planes', 'costo'])
    .addAnswer('Para consultar nuestros planes y precios, visita nuestra página web: [Link a la Página de Precios]')
    .addAnswer('También puedes contactarnos directamente al *[Número de Ventas]* para una atención personalizada.')
    .addAnswer('¿Hay algo más en lo que pueda ayudarte?\nEscribe *MENU* para volver al inicio.', { delay: 1000, capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        if (ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }
        return fallBack('No entendí tu respuesta. Si deseas explorar otras opciones, escribe *MENU* para volver al inicio.');
    });

// Flujo para "Otras Consultas" (Modificación para asegurar el retorno al menú)
const flowOtrasConsultas = addKeyword(['otras_consultas', '4', '4️⃣'])
    .addAnswer('Perfecto! Lo derivamos con una persona de atención para resolver sus dudas.', null, async (ctx, { flowDynamic }) => {
        await flowDynamic('Por favor haga clic en el siguiente link: 📞 https://bit.ly/4l1iOvh');
    })
    .addAnswer(
        '¿Hay algo más en lo que pueda ayudarte?\nEscribe *MENU* para volver al inicio.',
        {
            delay: 1000,
            capture: true,
            idle: 120000,
            handleIdle: async (ctx, { flowDynamic, gotoFlow }) => {
                await flowDynamic('Parece que no has respondido. Regresando al menú principal. Puedes escribir *MENU* en cualquier momento.');
                return gotoFlow(flowPrincipal);
            },
        },
        async (ctx, { gotoFlow, fallBack }) => {
            if (ctx.body.toUpperCase().includes('MENU')) {
                return gotoFlow(flowPrincipal);
            }
            return fallBack('No entendí tu respuesta. Si deseas explorar otras opciones, escribe *MENU* para volver al inicio.');
        }
    );

// ----------------------------------------------------
// FLUJOS INTERMEDIOS
// ----------------------------------------------------

// Flujo para "Servicio Técnico"
const flowServicioTecnico = addKeyword(['tecnico', 'problema', 'no tengo internet', 'soporte'])
    .addAnswer('¡Importante! Antes de continuar, por favor, realiza estos pasos:')
    .addAnswer('• Reinicia tu router o equipo.\n• Verifica los cables y la alimentación eléctrica.\n• Confirma que realizaste estos pasos.', { delay: 1000 })
    .addAnswer('¿Ya realizaste estos pasos? (Sí/No)', { capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        if (ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }

        if (ctx.body.toLowerCase().includes('si') || ctx.body.toLowerCase().includes('sí')) {
            return gotoFlow(flowLlamarPersona);
        } else if (ctx.body.toLowerCase().includes('no')) {
            return fallBack('Es fundamental que realices estos pasos para poder diagnosticar tu problema. Por favor, intenta de nuevo cuando los hayas completado. Si aún así no puedes, podemos conectarte con un agente. Escribe *MENU* para volver al inicio.');
        } else {
            return fallBack('No entendí tu respuesta. Por favor, responde "Sí" o "No". Escribe *MENU* para volver al inicio.');
        }
    });

// Flujo para "Atención Administrativa"
const flowAtencionAdministrativa = addKeyword(['administrativa', 'factura', 'pagos', 'planes', 'administracion'])
    .addAnswer('¿En qué puedo ayudarte con Atención Administrativa?', { delay: 500 })
    .addAnswer('1️⃣ Informar un Pago\n2️⃣ Conocer Medios de Pago\n3️⃣ Consultar Precios de los Servicios\n4️⃣ Otras Consultas', { capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        if (ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }

        if (ctx.body.includes('1') || ctx.body.toLowerCase().includes('informar') || ctx.body.includes('1️⃣')) {
            // This is a bit of a trick. We need to know which location we are in.
            // We can't know that from here. So we will have to ask again.
            // A better solution would be to have separate administrative flows for each location.
            // For now, we will just go to the Fontana payment flow.
            return gotoFlow(flowInformarPagoFontana);
        }
        if (ctx.body.includes('2') || ctx.body.toLowerCase().includes('medios') || ctx.body.includes('2️⃣')) {
            return gotoFlow(flowMediosPago);
        }
        if (ctx.body.includes('3') || ctx.body.toLowerCase().includes('precios') || ctx.body.toLowerCase().includes('planes') || ctx.body.includes('3️⃣')) {
            return gotoFlow(flowConsultarPrecios);
        }
        if (ctx.body.includes('4') || ctx.body.toLowerCase().includes('otras') || ctx.body.includes('4️⃣')) {
            return gotoFlow(flowOtrasConsultas);
        }
        return fallBack('No entendí tu respuesta. Por favor, elige una opción válida (1, 2, 3 o 4, o los emojis 1️⃣, 2️⃣, 3️⃣, 4️⃣). Escribe *MENU* para volver al inicio.');
    });

// Flujo para "Otra Zona" (Zona no cubierta)
const flowOtraZona = addKeyword(['otra_zona', 'otro', 'otra', 'mi zona no esta'])
    .addAnswer('Actualmente, nuestros servicios de internet se concentran en Fontana e Ibarreta.')
    .addAnswer('Por favor, contáctanos directamente si deseas consultar la disponibilidad en otra zona: *[Número de Contacto para Otras Zonas]*')
    .addAnswer('¿Hay algo más en lo que pueda ayudarte?\nEscribe *MENU* para volver al inicio.', { delay: 1000, capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        if (ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }
        return fallBack('No entendí tu respuesta. Si deseas explorar otras opciones, escribe *MENU* para volver al inicio.');
    });

// Flujo para "Servicio de Internet en Ibarreta"
const flowServicioIbarra = addKeyword(['Ibarreta', '2', '2️⃣'])
    .addAnswer('Entendido, servicio en Ibarreta. ¿Necesitas atención administrativa o soporte técnico?', { delay: 500 })
    .addAnswer('1️⃣ Atención Administrativa\n2️⃣ Servicio Técnico', { capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        if (ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }

        if (ctx.body.includes('1') || ctx.body.toLowerCase().includes('administrativa') || ctx.body.includes('1️⃣')) {
            return gotoFlow(flowAtencionAdministrativaIbarreta);
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
        if (ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }

        if (ctx.body.includes('1') || ctx.body.toLowerCase().includes('administrativa') || ctx.body.includes('1️⃣')) {
            return gotoFlow(flowAtencionAdministrativaFontana);
        }
        if (ctx.body.includes('2') || ctx.body.toLowerCase().includes('tecnico') || ctx.body.includes('2️⃣')) {
            return gotoFlow(flowServicioTecnico);
        }
        return fallBack('No entendí tu respuesta. Por favor, elige una opción válida (1 o 2, o los emojis 1️⃣, 2️⃣). Escribe *MENU* para volver al inicio.');
    });

const flowAtencionAdministrativaFontana = addKeyword(['atencion_administrativa_fontana'])
    .addAnswer('¿En qué puedo ayudarte con Atención Administrativa en Fontana?', { delay: 500 })
    .addAnswer('1️⃣ Informar un Pago\n2️⃣ Conocer Medios de Pago\n3️⃣ Consultar Precios de los Servicios\n4️⃣ Otras Consultas', { capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        if (ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }

        if (ctx.body.includes('1') || ctx.body.toLowerCase().includes('informar') || ctx.body.includes('1️⃣')) {
            return gotoFlow(flowInformarPagoFontana);
        }
        if (ctx.body.includes('2') || ctx.body.toLowerCase().includes('medios') || ctx.body.includes('2️⃣')) {
            return gotoFlow(flowMediosPago);
        }
        if (ctx.body.includes('3') || ctx.body.toLowerCase().includes('precios') || ctx.body.toLowerCase().includes('planes') || ctx.body.includes('3️⃣')) {
            return gotoFlow(flowConsultarPrecios);
        }
        if (ctx.body.includes('4') || ctx.body.toLowerCase().includes('otras') || ctx.body.includes('4️⃣')) {
            return gotoFlow(flowOtrasConsultas);
        }
        // Cambio aquí: si no se reconoce la respuesta, se mantiene en el flujo.
        return fallBack('No entendí tu respuesta. Por favor, elige una opción válida (1, 2, 3 o 4, o los emojis 1️⃣, 2️⃣, 3️⃣, 4️⃣). Escribe *MENU* para volver al inicio.');
    });

const flowAtencionAdministrativaIbarreta = addKeyword(['atencion_administrativa_ibarreta'])
    .addAnswer('¿En qué puedo ayudarte con Atención Administrativa en Ibarreta?', { delay: 500 })
    .addAnswer('1️⃣ Informar un Pago\n2️⃣ Conocer Medios de Pago\n3️⃣ Consultar Precios de los Servicios\n4️⃣ Otras Consultas', { capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        if (ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }

        if (ctx.body.includes('1') || ctx.body.toLowerCase().includes('informar') || ctx.body.includes('1️⃣')) {
            return gotoFlow(flowInformarPagoIbarreta);
        }
        if (ctx.body.includes('2') || ctx.body.toLowerCase().includes('medios') || ctx.body.includes('2️⃣')) {
            return gotoFlow(flowMediosPago);
        }
        if (ctx.body.includes('3') || ctx.body.toLowerCase().includes('precios') || ctx.body.toLowerCase().includes('planes') || ctx.body.includes('3️⃣')) {
            return gotoFlow(flowConsultarPrecios);
        }
        if (ctx.body.includes('4') || ctx.body.toLowerCase().includes('otras') || ctx.body.includes('4️⃣')) {
            return gotoFlow(flowOtrasConsultas);
        }
        return fallBack('No entendí tu respuesta. Por favor, elige una opción válida (1, 2, 3 o 4, o los emojis 1️⃣, 2️⃣, 3️⃣, 4️⃣). Escribe *MENU* para volver al inicio.');
    });


// ----------------------------------------------------
// FLUJO PRINCIPAL (Punto de entrada del bot)
// ----------------------------------------------------

const flowPrincipal = addKeyword(['hola', 'ole', 'alo', 'buenos dias', 'buenas tardes', 'buenas noches', 'menu', EVENTS.WELCOME])
    .addAnswer('¡Hola! Soy el ChatBot Vanguard. ¿En qué zona necesitas ayuda con tu servicio de internet?', { delay: 500 })
    .addAnswer('Por favor, elige una opción:', { delay: 500 })
    .addAnswer('1️⃣ Servicio de Internet en Fontana\n2️⃣ Servicio de Internet en Ibarreta\n3️⃣ Otra Zona', { capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        if (ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }

        if (ctx.body.includes('1') || ctx.body.toLowerCase().includes('fontana') || ctx.body.includes('1️⃣')) {
            return gotoFlow(flowServicioFontana);
        }
        if (ctx.body.includes('2') || ctx.body.toLowerCase().includes('ibarret') || ctx.body.includes('2️⃣')) {
            return gotoFlow(flowServicioIbarra);
        }
        if (ctx.body.includes('3') || ctx.body.toLowerCase().includes('otra') || ctx.body.includes('3️⃣')) {
            return gotoFlow(flowOtraZona);
        }
        return fallBack('No entendí tu respuesta. Por favor, elige una opción válida (1, 2 o 3, o los emojis 1️⃣, 2️⃣, 3️⃣). Escribe *MENU* para volver al inicio.');
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
        flowCargaArchivoFontana,
        flowCargaArchivoIbarreta,
        flowLlamarPersona,
        flowConsultarPrecios,
        flowMediosPago,
        flowInformarPagoFontana,
        flowInformarPagoIbarreta,
        flowServicioTecnico,
        flowAtencionAdministrativaFontana,
        flowAtencionAdministrativaIbarreta,
        flowOtraZona,
        flowServicioIbarra,
        flowServicioFontana,
        flowOtrasConsultas,
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