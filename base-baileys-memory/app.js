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
const flowLlamarPersona = addKeyword(['llamar_persona', 'llamar', 'contacto', 'agente', 'hablar con alguien', 'otras consultas']) // Añadimos 'otras consultas'
    .addAnswer('Perfecto! Lo derivamos con una persona de atención para evacuar sus dudas.')
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
            // Para evitar bucles, el fallBack no debería ser recursivo indefinidamente.
            // Mensaje más claro para entradas no válidas.
            return fallBack('No entendí tu respuesta. Si deseas explorar otras opciones, escribe *MENU* para volver al inicio.');
        },
        []
    );


// Flujo para "Informar un Pago"
const flowInformarPago = addKeyword(['informar_pago', 'ya pague', 'reportar pago'])
    .addAnswer(
        'Para informar tu pago, por favor, envíanos una captura del comprobante de transferencia junto con el nombre y DNI o CUIT del titular del servicio. Cuando hayas enviado todo, puedes escribir *LISTO* para finalizar.',
        {
            delay: 500,
            capture: true // Este capture espera tanto media como texto
        },
        async (ctx, { gotoFlow, flowDynamic, fallBack, provider }) => {
            const adminTargetNumber = NUMERO_ADMIN_FONTANA; // O NUMERO_ADMIN_IBARRETA
            const isMedia = ctx.message && (ctx.message.image || ctx.message.document || ctx.message.video);
            const remoteJid = ctx.from;

            // **IMPORTANTE: Nueva verificación para ctx.body**
            // Si ctx.body no existe (es undefined), lo tratamos como una cadena vacía para evitar errores.
            const messageBody = ctx.body ? ctx.body.toUpperCase().trim() : '';

            // 1. Manejo de "MENU" para salir rápidamente
            if (messageBody.includes('MENU')) {
                await flowDynamic('De acuerdo, volviendo al menú principal.');
                return gotoFlow(flowPrincipal);
            }

            // 2. Manejo del comando "LISTO"
            if (messageBody.includes('LISTO') || messageBody.includes('TERMINAR') || messageBody.includes('FINALIZAR')) {
                await flowDynamic('¡Gracias! Hemos recibido la información de tu pago. En breve lo verificaremos y actualizaremos tu estado. Cualquier duda adicional, puedes volver a iniciar el flujo o contactar a atención al cliente.');
                return gotoFlow(flowPrincipal); // Finaliza el flujo y vuelve al menú principal
            }

            // 3. Procesamiento de media (comprobantes)
            if (isMedia) {
                try {
                    // Determina el tipo de archivo y lo reenvía
                    if (ctx.message.image) {
                        await provider.vendor.sendMessage(adminTargetNumber, {
                            image: { url: ctx.message.image.url },
                            caption: `Comprobante (IMG) de ${ctx.pushName} (${remoteJid}). Info: ${ctx.body || 'Sin texto adicional'}`
                        });
                    } else if (ctx.message.document) {
                        await provider.vendor.sendMessage(adminTargetNumber, {
                            document: { url: ctx.message.document.url },
                            mimetype: ctx.message.document.mimetype,
                            fileName: ctx.message.document.fileName,
                            caption: `Comprobante (DOC) de ${ctx.pushName} (${remoteJid}). Info: ${ctx.body || 'Sin texto adicional'}`
                        });
                    } else if (ctx.message.video) {
                        await provider.vendor.sendMessage(adminTargetNumber, {
                            video: { url: ctx.message.video.url },
                            caption: `Comprobante (VIDEO) de ${ctx.pushName} (${remoteJid}). Info: ${ctx.body || 'Sin texto adicional'}`
                        });
                    }
                    console.log(`Comprobante reenviado a ${adminTargetNumber}`);
                    await flowDynamic('¡Comprobante recibido! Por favor, envía el nombre y DNI/CUIT si aún no lo has hecho. Cuando hayas enviado toda la información, escribe *LISTO*.');
                    return; // Permite seguir esperando más inputs en este mismo addAnswer
                } catch (e) {
                    console.error('Error al reenviar comprobante:', e);
                    await flowDynamic('Hubo un problema al procesar tu comprobante. Por favor, inténtalo de nuevo o comunícate directamente con soporte. Puedes escribir *MENU* para volver al inicio.');
                    return; // Mantiene el flujo esperando para reintentar o salir
                }
            }
            // 4. Procesamiento de texto (DNI/CUIT u otra información)
            // Se ejecuta solo si NO es media y SI hay algún texto (después de manejar "MENU" y "LISTO")
            else if (ctx.body && ctx.body.length > 0) {
                await provider.vendor.sendMessage(adminTargetNumber, {
                    text: `Información de pago recibida de ${ctx.pushName} (${remoteJid}): ${ctx.body}.`
                });
                console.log(`Información de pago reenviada a ${adminTargetNumber}`);
                await flowDynamic('¡Información recibida! Por favor, envía la captura del comprobante si aún no lo has hecho. Cuando hayas enviado toda la información, escribe *LISTO*.');
                return; // Permite seguir esperando más inputs en este mismo addAnswer
            }
            // 5. Fallback para entradas no válidas (ni media, ni texto, ni MENU/LISTO)
            else {
                return fallBack('No entendí tu respuesta. Por favor, envía una *captura o archivo* de tu comprobante y el nombre y DNI o CUIT. Cuando hayas enviado todo, escribe *LISTO*. También puedes escribir *MENU* para volver al inicio.');
            }
        }
    );


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
        '• Pagar en el local de Fontana: *Av. San Martín 1628*\n',
        null,
        async (ctx, { flowDynamic }) => {
            await flowDynamic('Recuerda incluir tu número de cliente en la referencia.');
        }
    )
    .addAnswer('¿Hay algo más en lo que pueda ayudarte?\nEscribe *MENU* para volver al inicio.', { delay: 1000, capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        // Manejo de "MENU" al inicio del callback para que siempre sea una opción.
        if (ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }
        return fallBack('No entendí tu respuesta. Si deseas explorar otras opciones, escribe *MENU* para volver al inicio.'); // Mensaje más claro
    });

// Flujo para "Consultar precios de los servicios"
const flowConsultarPrecios = addKeyword(['consultar_precios', 'precios', 'planes', 'costo'])
    .addAnswer('Para consultar nuestros planes y precios, visita nuestra página web: [Link a la Página de Precios]')
    .addAnswer('También puedes contactarnos directamente al *[Número de Ventas]* para una atención personalizada.')
    .addAnswer('¿Hay algo más en lo que pueda ayudarte?\nEscribe *MENU* para volver al inicio.', { delay: 1000, capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        // Manejo de "MENU" al inicio del callback para que siempre sea una opción.
        if (ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }
        return fallBack('No entendí tu respuesta. Si deseas explorar otras opciones, escribe *MENU* para volver al inicio.'); // Mensaje más claro
    });

// Flujo para "Otras Consultas" (Modificación para asegurar el retorno al menú)
const flowOtrasConsultas = addKeyword(['otras_consultas', '4', '4️⃣'])
    .addAnswer('Perfecto! Lo derivamos con una persona de atención para evacuar sus dudas.', null, async (ctx, { flowDynamic }) => {
        // Enviar el link de contacto
        await flowDynamic('Por favor haga clic en el siguiente link: 📞 https://bit.ly/4l1iOvh');
    })
    .addAnswer(
        '¿Hay algo más en lo que pueda ayudarte?\nEscribe *MENU* para volver al inicio.', // Más explícito el "MENU"
        {
            delay: 1000, // Retraso antes de enviar este mensaje.
            capture: true, // Aquí el bot espera una respuesta.
            idle: 120000, // Se mantiene el idle.
            handleIdle: async (ctx, { flowDynamic, gotoFlow }) => {
                // Este bloque se ejecuta SI el usuario NO RESPONDE en 2 minutos.
                await flowDynamic('Parece que no has respondido. Regresando al menú principal. Puedes escribir *MENU* en cualquier momento.'); // Mensaje más claro
                return gotoFlow(flowPrincipal); // Vuelve al menú principal.
            },
        },
        async (ctx, { gotoFlow, fallBack }) => {
            // Manejo de "MENU" al inicio del callback para que siempre sea una opción.
            if (ctx.body.toUpperCase().includes('MENU')) {
                return gotoFlow(flowPrincipal);
            }
            // Si la respuesta no es "MENU", le pedimos que use "MENU".
            // Para evitar el bucle de "no entendí", el fallBack debe ser cauteloso.
            return fallBack('No entendí tu respuesta. Si deseas explorar otras opciones, escribe *MENU* para volver al inicio.'); // Mensaje más claro
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
        // Manejo de "MENU" al inicio del callback para que siempre sea una opción.
        if (ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }

        if (ctx.body.toLowerCase().includes('si') || ctx.body.toLowerCase().includes('sí')) {
            return gotoFlow(flowLlamarPersona);
        } else if (ctx.body.toLowerCase().includes('no')) {
            // Aseguramos que, incluso en 'no', se le dé la opción de MENU
            return fallBack('Es fundamental que realices estos pasos para poder diagnosticar tu problema. Por favor, intenta de nuevo cuando los hayas completado. Si aún así no puedes, podemos conectarte con un agente. Escribe *MENU* para volver al inicio.');
        } else {
            return fallBack('No entendí tu respuesta. Por favor, responde "Sí" o "No". Escribe *MENU* para volver al inicio.');
        }
    });

// Flujo para "Atención Administrativa"
const flowAtencionAdministrativa = addKeyword(['administrativa', 'factura', 'pagos', 'planes', 'administracion'])
    .addAnswer('¿En qué puedo ayudarte con Atención Administrativa?', { delay: 500 })
    .addAnswer('1️⃣ Informar un Pago\n2️⃣ Conocer Medios de Pago\n3️⃣ Consultar Precios de los Servicios\n4️⃣ Otras Consultas', { capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        // Manejo de "MENU" al inicio del callback para que siempre sea una opción.
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
        // Manejo de "MENU" al inicio del callback para que siempre sea una opción.
        if (ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }
        return fallBack('No entendí tu respuesta. Si deseas explorar otras opciones, escribe *MENU* para volver al inicio.'); // Mensaje más claro
    });

// Flujo para "Servicio de Internet en Ibarreta"
const flowServicioIbarra = addKeyword(['Ibarreta', '2', '2️⃣'])
    .addAnswer('Entendido, servicio en Ibarreta. ¿Necesitas atención administrativa o soporte técnico?', { delay: 500 })
    .addAnswer('1️⃣ Atención Administrativa\n2️⃣ Servicio Técnico', { capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        // Manejo de "MENU" al inicio del callback para que siempre sea una opción.
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
        // Manejo de "MENU" al inicio del callback para que siempre sea una opción.
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

// Añadimos 'MENU' como un keyword principal para que siempre redirija al inicio si se escribe.
const flowPrincipal = addKeyword(['hola', 'ole', 'alo', 'buenos dias', 'buenas tardes', 'buenas noches', 'menu', EVENTS.WELCOME])
    .addAnswer(
        null,
        null,
        async (ctx, { flowDynamic }) => {
            const name = ctx.pushName || 'cliente';
            await flowDynamic(`¡Hola ${name}! Soy el ChatBot Vanguard. ¿En qué zona necesitas ayuda con tu servicio de internet?`);
        },
        [],
    )
    .addAnswer('Por favor, elige una opción:', { delay: 500 })
    .addAnswer('1️⃣ Servicio de Internet en Fontana\n2️⃣ Servicio de Internet en Ibarreta\n3️⃣ Otra Zona', { capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        // En flowPrincipal, 'MENU' ya es un keyword principal, así que no es estrictamente necesario aquí,
        // pero lo dejo para consistencia y seguridad si el usuario está en este `capture`.
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
        // El fallBack aquí también menciona MENU
        return fallBack('No entendí tu respuesta. Por favor, elige una opción válida (1, 2 o 3, o los emojis 1️⃣, 2️⃣, 3️⃣). Escribe *MENU* para volver al inicio.');
    })
    // Este último addAnswer en flowPrincipal actúa como un fallback general si nada más coincide con los addKeyword
    // o con el capture del paso anterior.
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