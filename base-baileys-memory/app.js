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
const NUMERO_TEST = '5491161726168@s.whatsapp.net';

// ----------------------------------------------------
// FLUJOS FINALES / HOJAS DEL ÁRBOL
// ----------------------------------------------------

// Flujo para "Llama a una persona" (general, usado también para servicio técnico)
const flowLlamarPersona = addKeyword(['llamar_persona', 'llamar', 'contacto', 'agente', 'hablar con alguien', 'otras consultas'])
    .addAnswer(['Perfecto! Lo derivamos con una persona de atención para resolver sus dudas.','\nPor favor haga clic en el siguiente link:\n📞 https://bit.ly/4l1iOvh'])
    .addAnswer('¿Hay algo más en lo que pueda ayudarte?\nEscribe *MENU* para volver al inicio.', { delay: 1000, capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        if (ctx.body && typeof ctx.body === 'string' && ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }
        return fallBack('No entendí tu respuesta. Si deseas explorar otras opciones, escribe *MENU* para volver al inicio.');
    });


const flowInformarPago = addKeyword(['_informar_pago_'])
    .addAnswer(
        'Por favor, ingresa tu DNI/CUIT y tu Nombre y Apellido.',
        { capture: true },
        async (ctx, { state, fallBack }) => {
            await state.update({ customerInfo: ctx.body, mediaFiles: [] });
            return fallBack('Gracias. Ahora, por favor, carga el archivo con el recibo de pago realizado y escribe *LISTO* cuando ya culmines de enviar el archivo.');
        }
    )
    .addAnswer(
        'Puedes cargar más archivos si lo necesitas. Cuando termines, escribe *LISTO*.',
        { capture: true },
        async (ctx, { provider, state, endFlow, fallBack }) => {
            const { customerInfo, mediaFiles } = state.getMyState();
            const messageBody = (ctx.body && typeof ctx.body === 'string') ? ctx.body.toUpperCase().trim() : '';

            if (messageBody === 'LISTO') {
                const remoteJid = ctx.from;
                const pushName = ctx.pushName || 'Usuario Desconocido';

                const adminTextMessage = `📄 [NUEVO PAGO REPORTADO]\n\nDe: ${pushName} (${remoteJid})\n\nDatos del cliente: ${customerInfo}`;
                await provider.vendor.sendMessage(NUMERO_TEST, { text: adminTextMessage });

                for (const file of mediaFiles) {
                    if (file.mimeType.includes('image')) {
                        await provider.vendor.sendMessage(NUMERO_TEST, { image: { url: file.url }, caption: file.caption });
                    } else if (file.mimeType.includes('pdf')) {
                        await provider.vendor.sendMessage(NUMERO_TEST, { document: { url: file.url }, mimetype: file.mimeType, fileName: file.fileName, caption: file.caption });
                    } else if (file.mimeType.includes('video')) {
                        await provider.vendor.sendMessage(NUMERO_TEST, { video: { url: file.url }, caption: file.caption });
                    }
                }

                return endFlow('Muchas gracias, de inmediato nuestro equipo procesará la información enviada.\n\nSi necesita algo más escriba *MENU*.');
            }

            const isMedia = ctx.message?.imageMessage || ctx.message?.documentMessage || ctx.message?.videoMessage;
            if (isMedia) {
                const remoteJid = ctx.from;
                const pushName = ctx.pushName || 'Usuario Desconocido';
                const mediaMessage = ctx.message.imageMessage || ctx.message.documentMessage || ctx.message.videoMessage;

                const newFile = {
                    url: mediaMessage.url,
                    mimeType: mediaMessage.mimetype,
                    fileName: mediaMessage.fileName || 'recibo',
                    caption: `[RECIBO DE PAGO] De ${pushName} (${remoteJid})`
                };

                const updatedMediaFiles = [...(mediaFiles || []), newFile];
                await state.update({ mediaFiles: updatedMediaFiles });

                return fallBack('Recibido. Puedes enviar más archivos o escribir *LISTO* para finalizar.');
            }

            return fallBack('Lo siento, no pude procesar tu mensaje. Por favor, envía un archivo o escribe *LISTO* para terminar.');
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
        if (ctx.body && typeof ctx.body === 'string' && ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }
        return fallBack('No entendí tu respuesta. Si deseas explorar otras opciones, escribe *MENU* para volver al inicio.');
    });

// Flujo para "Consultar precios de los servicios"
const flowConsultarPrecios = addKeyword(['consultar_precios', 'precios', 'planes', 'costo'])
    .addAnswer('Para consultar nuestros planes y precios, visita nuestra página web: [Link a la Página de Precios]')
    .addAnswer('También puedes contactarnos directamente al *[Número de Ventas]* para una atención personalizada.')
    .addAnswer('¿Hay algo más en lo que pueda ayudarte?\nEscribe *MENU* para volver al inicio.', { delay: 1000, capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        if (ctx.body && typeof ctx.body === 'string' && ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }
        return fallBack('No entendí tu respuesta. Si deseas explorar otras opciones, escribe *MENU* para volver al inicio.');
    });

// Flujo para "Otras Consultas" (Modificación para asegurar el retorno al menú)
const flowOtrasConsultas = addKeyword(['otras_consultas'])
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
            if (ctx.body && typeof ctx.body === 'string' && ctx.body.toUpperCase().includes('MENU')) {
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
        if (ctx.body && typeof ctx.body === 'string' && ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }

        if (ctx.body && typeof ctx.body === 'string' && (ctx.body.toLowerCase().includes('si') || ctx.body.toLowerCase().includes('sí'))) {
            return gotoFlow(flowLlamarPersona);
        } else if (ctx.body && typeof ctx.body === 'string' && ctx.body.toLowerCase().includes('no')) {
            return fallBack('Es fundamental que realices estos pasos para poder diagnosticar tu problema. Por favor, intenta de nuevo cuando los hayas completado. Si aún así no puedes, podemos conectarte con un agente. Escribe *MENU* para volver al inicio.');
        } else {
            return fallBack('No entendí tu respuesta. Por favor, responde "Sí" o "No". Escribe *MENU* para volver al inicio.');
        }
    });

const flowAtencionAdministrativaFontana = addKeyword(['atencion_administrativa_fontana'])
    .addAnswer('¿En qué puedo ayudarte con Atención Administrativa en Fontana?', { delay: 500 })
    .addAnswer('1️⃣ Informar un Pago\n2️⃣ Conocer Medios de Pago\n3️⃣ Consultar Precios de los Servicios\n4️⃣ Otras Consultas', { capture: true }, async (ctx, { gotoFlow, fallBack, state }) => {
        if (ctx.body && typeof ctx.body === 'string' && ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }

        if (ctx.body && typeof ctx.body === 'string' && (ctx.body.includes('1') || ctx.body.toLowerCase().includes('informar') || ctx.body.includes('1️⃣'))) {
            await state.update({ adminNumber: NUMERO_ADMIN_FONTANA });
            return gotoFlow(flowInformarPago);
        }
        if (ctx.body && typeof ctx.body === 'string' && (ctx.body.includes('2') || ctx.body.toLowerCase().includes('medios') || ctx.body.includes('2️⃣'))) {
            return gotoFlow(flowMediosPago);
        }
        if (ctx.body && typeof ctx.body === 'string' && (ctx.body.includes('3') || ctx.body.toLowerCase().includes('precios') || ctx.body.toLowerCase().includes('planes') || ctx.body.includes('3️⃣'))) {
            return gotoFlow(flowConsultarPrecios);
        }
        if (ctx.body && typeof ctx.body === 'string' && (ctx.body.includes('4') || ctx.body.toLowerCase().includes('otras') || ctx.body.includes('4️⃣'))) {
            return gotoFlow(flowOtrasConsultas);
        }
        // Cambio aquí: si no se reconoce la respuesta, se mantiene en el flujo.
        return fallBack('No entendí tu respuesta. Por favor, elige una opción válida (1, 2, 3 o 4, o los emojis 1️⃣, 2️⃣, 3️⃣, 4️⃣). Escribe *MENU* para volver al inicio.');
    });

const flowAtencionAdministrativaIbarreta = addKeyword(['atencion_administrativa_ibarreta'])
    .addAnswer('¿En qué puedo ayudarte con Atención Administrativa en Ibarreta?', { delay: 500 })
    .addAnswer('1️⃣ Informar un Pago\n2️⃣ Conocer Medios de Pago\n3️⃣ Consultar Precios de los Servicios\n4️⃣ Otras Consultas', { capture: true }, async (ctx, { gotoFlow, fallBack, state }) => {
        if (ctx.body && typeof ctx.body === 'string' && ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }

        if (ctx.body && typeof ctx.body === 'string' && (ctx.body.includes('1') || ctx.body.toLowerCase().includes('informar') || ctx.body.includes('1️⃣'))) {
            await state.update({ adminNumber: NUMERO_ADMIN_IBARRETA });
            return gotoFlow(flowInformarPago);
        }
        if (ctx.body && typeof ctx.body === 'string' && (ctx.body.includes('2') || ctx.body.toLowerCase().includes('medios') || ctx.body.includes('2️⃣'))) {
            return gotoFlow(flowMediosPago);
        }
        if (ctx.body && typeof ctx.body === 'string' && (ctx.body.includes('3') || ctx.body.toLowerCase().includes('precios') || ctx.body.toLowerCase().includes('planes') || ctx.body.includes('3️⃣'))) {
            return gotoFlow(flowConsultarPrecios);
        }
        if (ctx.body && typeof ctx.body === 'string' && (ctx.body.includes('4') || ctx.body.toLowerCase().includes('otras') || ctx.body.includes('4️⃣'))) {
            return gotoFlow(flowOtrasConsultas);
        }
        return fallBack('No entendí tu respuesta. Por favor, elige una opción válida (1, 2, 3 o 4, o los emojis 1️⃣, 2️⃣, 3️⃣, 4️⃣). Escribe *MENU* para volver al inicio.');
    });

const flowOtraZona = addKeyword(['otra_zona'])
    .addAnswer('Actualmente, nuestros servicios de internet se concentran en Fontana e Ibarreta.')
    .addAnswer('Por favor, contáctanos directamente si deseas consultar la disponibilidad en otra zona: *[Número de Contacto para Otras Zonas]*')
    .addAnswer('¿Hay algo más en lo que pueda ayudarte?\nEscribe *MENU* para volver al inicio.', { delay: 1000, capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        if (ctx.body && typeof ctx.body === 'string' && ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }
        return fallBack('No entendí tu respuesta. Si deseas explorar otras opciones, escribe *MENU* para volver al inicio.');
    });


// ----------------------------------------------------
// FLUJO PRINCIPAL (Punto de entrada del bot)
// ----------------------------------------------------

const flowPrincipal = addKeyword(['hola', 'ole', 'alo', 'buenos dias', 'buenas tardes', 'buenas noches', 'menu', EVENTS.WELCOME])
    .addAnswer('¡Hola! Soy el ChatBot Vanguard. ¿En qué zona necesitas ayuda con tu servicio de internet?', { delay: 500 })
    .addAnswer('Por favor, elige una opción:', { delay: 500 })
    .addAnswer('1️⃣ Servicio de Internet en Fontana\n2️⃣ Servicio de Internet en Ibarreta\n3️⃣ Otra Zona', { capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        if (ctx.body && typeof ctx.body === 'string' && ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }

        if (ctx.body && typeof ctx.body === 'string' && (ctx.body.includes('1') || ctx.body.toLowerCase().includes('fontana') || ctx.body.includes('1️⃣'))) {
            return gotoFlow(flowAtencionAdministrativaFontana);
        }
        if (ctx.body && typeof ctx.body === 'string' && (ctx.body.includes('2') || ctx.body.toLowerCase().includes('ibarret') || ctx.body.includes('2️⃣'))) {
            return gotoFlow(flowAtencionAdministrativaIbarreta);
        }
        if (ctx.body && typeof ctx.body === 'string' && (ctx.body.includes('3') || ctx.body.toLowerCase().includes('otra') || ctx.body.includes('3️⃣'))) {
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
        flowLlamarPersona,
        flowConsultarPrecios,
        flowMediosPago,
        flowInformarPago,
        flowCargaArchivo,
        flowServicioTecnico,
        flowAtencionAdministrativaFontana,
        flowAtencionAdministrativaIbarreta,
        flowOtrasConsultas,
        flowOtraZona,
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