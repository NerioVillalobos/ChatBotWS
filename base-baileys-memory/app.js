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

// Este es el número al que se reenviarán los pagos procesados por IA.
// ¡¡¡ASEGÚRATE DE QUE ESTE NÚMERO NO SEA EL MISMO DEL USUARIO QUE ESTÁ INTERACTUANDO CON EL BOT!!!
// Es decir, que no sea ctx.from.
const NUMERO_ADMIN_PAGOS = '5491140638555@s.whatsapp.net'; // Aquí defines tu número de pruebas/administrador para pagos


// ----------------------------------------------------
// FLUJOS FINALES / HOJAS DEL ÁRBOL
// ----------------------------------------------------

// Flujo para "Llama a una persona" (general, usado también para servicio técnico)
const flowLlamarPersona = addKeyword(['llamar_persona', 'llamar', 'contacto', 'agente', 'hablar con alguien', 'otras consultas']) // Añadimos 'otras consultas'
    .addAnswer('Perfecto! Lo derivamos con una persona de atención para resolver sus dudas.')
    .addAnswer('Por favor haga clic en el siguiente link:', null, async (ctx, { flowDynamic }) => {
        await flowDynamic('📞 https://bit.ly/4l1iOvh'); // Asegúrate de que este link sea el correcto
    })
    .addAnswer('Horario de atención: Lunes a Viernes de 9:00 AM a 6:00 PM.', { delay: 500 })
    .addAnswer(
        '¿Hay algo más en lo que pueda ayudarte?\nEscribe *MENU* para volver al inicio.', // Se hace más explícito el "MENU"
        {
            delay: 1000,
            capture: true,
            idle: 120000, // Se mantiene el idle por si funciona, pero el foco es el retorno manual.
            handleIdle: async (ctx, { flowDynamic, gotoFlow }) => {
                await flowDynamic('Parece que no has respondido. Regresando al menú principal. Puedes escribir *MENU* en cualquier momento.'); // Mensaje más claro
                return gotoFlow(flowPrincipal); // Asegura que el flujo se redirija después del idle.
            },
        },
        async (ctx, { gotoFlow, fallBack }) => {
            // Manejo de "MENU" al inicio del callback para que siempre sea una opción.
            if (ctx.body.toUpperCase().includes('MENU')) {
                return gotoFlow(flowPrincipal);
            }
            // Si el idle no se activa, este fallback debe atrapar la inactividad o entrada no esperada.
            return fallBack('No entendí tu respuesta. Si deseas explorar otras opciones, escribe *MENU* para volver al inicio.');
        },
        []
    );

// Flujo para "Informar un Pago"
const flowInformarPago = addKeyword(['informar_pago', 'ya pague', 'reportar pago'])
    .addAnswer(
        'Para informar un pago, por favor, envía la imagen o documento de tu comprobante. También puedes añadir un texto (DNI, nombre, etc.) junto al archivo y escribir *LISTO* cuando ya esté completada toda la información.',
        {
            capture: true,
        },
        async (ctx, { provider, state, fallBack }) => {
            // Este primer capture maneja la primera entrada (archivo o texto).
            const remoteJid = ctx.from;
            const pushName = ctx.pushName || 'Usuario Desconocido';

            // Guardamos el JID y el nombre del usuario en el estado para usarlo en los siguientes pasos
            await state.update({ customerJid: remoteJid, customerName: pushName });

            // Notifica al admin sobre el inicio del reporte de pago
            const initialAdminMessage = `📄 [INICIO DE REPORTE DE PAGO]\n\n` +
                                        `De: ${pushName} (${remoteJid})`;
            await provider.vendor.sendMessage(NUMERO_ADMIN_PAGOS, { text: initialAdminMessage });

            // Reenvía la información inicial
            await handleAndForwardMessage(ctx, provider, state);

            // Usamos fallBack para solicitar más información sin salir del flujo.
            return fallBack('Recibido. Puedes seguir enviando más información o archivos. Cuando termines, escribe *LISTO*.');
        }
    )
    .addAnswer(
        'Si no tienes más nada que enviar, por favor escribe la palabra *LISTO*',
        {
            capture: true,
        },
        async (ctx, { provider, state, gotoFlow, endFlow, fallBack }) => {
            const messageBody = (ctx.body || '').toUpperCase().trim();

            if (messageBody.includes('LISTO')) {
                // El usuario ha terminado de enviar información.

                // Notificación final al admin
                const { customerName, customerJid } = state.getMyState();
                const finalAdminMessage = `✅ [REPORTE DE PAGO FINALIZADO]\n\n` +
                                            `De: ${customerName} (${customerJid})\n\n`+
                                            `El usuario ha indicado que ha completado el envío de información.`;
                await provider.vendor.sendMessage(NUMERO_ADMIN_PAGOS, { text: finalAdminMessage });

                await state.clear(); // Limpiamos el estado al finalizar

                // Ahora, terminamos el flujo.
                return endFlow('¡Gracias! Hemos recibido tu información de pago. La verificaremos a la brevedad. Puedes escribir *MENU* para volver al inicio.');
            } else if (messageBody.includes('MENU')) {
                await state.clear();
                return gotoFlow(flowPrincipal);
            }

            // Si no es LISTO o MENU, el usuario está enviando más información.
            await handleAndForwardMessage(ctx, provider, state);

            // Usamos fallBack para mantener al usuario en este paso del flujo.
            return fallBack('Recibido. ¿Algo más? Cuando termines, escribe *LISTO*.');
        }
    );

// Función auxiliar para reenviar mensajes al admin
const handleAndForwardMessage = async (ctx, provider, state) => {
    const { customerName, customerJid } = state.getMyState();
    const adminTargetNumber = NUMERO_ADMIN_PAGOS;
    const messageBody = ctx.body || '';

    // Detección de media
    let isMedia = false;
    let mediaTypeKey = null;
    if (ctx.message) {
        if (ctx.message.imageMessage) {
            isMedia = true;
            mediaTypeKey = 'imageMessage';
        } else if (ctx.message.documentMessage) {
            isMedia = true;
            mediaTypeKey = 'documentMessage';
        } else if (ctx.message.videoMessage) {
            isMedia = true;
            mediaTypeKey = 'videoMessage';
        }
    }

    // Reenvío del texto si existe
    if (messageBody.length > 0) {
        const adminTextMessage = `💬 [Info de Pago Adicional]\n\n` +
                                 `De: ${customerName} (${customerJid})\n\n` +
                                 `Texto: ${messageBody}`;
        await provider.vendor.sendMessage(adminTargetNumber, { text: adminTextMessage });
        console.log(`[INFO] Texto de ${customerJid} reenviado a ${adminTargetNumber}`);
    }

    // Reenvío del archivo media si existe
    if (isMedia) {
        try {
            const mediaMessage = ctx.message[mediaTypeKey];
            const fileUrl = mediaMessage.url;
            const mimeType = mediaMessage.mimetype;
            const caption = `[ARCHIVO ADJUNTO] De ${customerName} (${customerJid})`;

            if (mediaTypeKey === 'imageMessage') {
                await provider.vendor.sendMessage(adminTargetNumber, { image: { url: fileUrl }, caption: messageBody ? `${caption}\n\nTexto: ${messageBody}` : caption });
            } else if (mediaTypeKey === 'documentMessage') {
                const fileName = mediaMessage.fileName || 'documento';
                await provider.vendor.sendMessage(adminTargetNumber, { document: { url: fileUrl }, mimetype: mimeType, fileName, caption: messageBody ? `${caption}\n\nTexto: ${messageBody}` : caption });
            } else if (mediaTypeKey === 'videoMessage') {
                await provider.vendor.sendMessage(adminTargetNumber, { video: { url: fileUrl }, caption: messageBody ? `${caption}\n\nTexto: ${messageBody}` : caption });
            }
            console.log(`[INFO] Archivo de ${customerJid} reenviado a ${adminTargetNumber}.`);
        } catch (e) {
            console.error('[ERROR] Error al reenviar archivo:', e);
            await provider.vendor.sendMessage(adminTargetNumber, { text: `[ERROR REENVÍO] Fallo al reenviar archivo de ${customerName} (${customerJid}).` });
        }
    }
};

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
            return gotoFlow(flowInformarPago);
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
        if (ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }

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
        flowLlamarPersona,
        flowConsultarPrecios,
        flowMediosPago,
        flowInformarPago,
        flowServicioTecnico,
        flowAtencionAdministrativa,
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
