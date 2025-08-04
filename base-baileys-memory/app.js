// app.js
// Modificacion funcional- > luego de la correccion de errores de compilacion
// Modificado por: Nervill
// Fecha: 2024-01-15
// Version: 1.0.0.BETA-20240115-v0.1

// --- Inicio de Adiciones para Gemini y dotenv ---
require('dotenv').config(); // Cargar variables de entorno desde .env
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fetch = require('node-fetch'); // Necesario para descargar la imagen/documento desde la URL de Baileys

// Configura tu API Key de Gemini usando la variable de entorno
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
    console.error("ERROR: La variable de entorno GEMINI_API_KEY no está definida.");
    console.error("Por favor, crea un archivo .env en la raíz de tu proyecto con GEMINI_API_KEY=TU_API_KEY");
    process.exit(1); // Sale de la aplicación si no hay API Key
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
console.log("Gemini API Key cargada y GoogleGenerativeAI inicializado.");
// --- Fin de Adiciones para Gemini y dotenv ---


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

// Nuevo flujo para confirmar datos de pago después del OCR
const flowConfirmarPago = addKeyword(EVENTS.ACTION)
    .addAnswer(
        async (ctx, { flowDynamic, state }) => {
            const extractedDniCuit = state.get('extractedDniCuit');
            const extractedNombre = state.get('extractedNombre');
            
            const dniCuitDisplay = extractedDniCuit === 'No encontrado' ? 'No pudimos extraerlo' : extractedDniCuit;
            const nombreDisplay = extractedNombre === 'No encontrado' ? 'No pudimos extraerlo' : extractedNombre;

            await flowDynamic([
                `Hemos detectado la siguiente información en tu comprobante:`,
                `*DNI/CUIT:* ${dniCuitDisplay}`,
                `*Nombre:* ${nombreDisplay}`,
                `\n¿Es esta información correcta? Responde *SÍ* para confirmar o *NO* para ingresarlos manualmente.`
            ]);
        },
        {
            capture: true
        },
        async (ctx, { gotoFlow, fallBack, state, flowDynamic, provider }) => {
            console.log(`[DEBUG - flowConfirmarPago] Entrada con ctx.body: ${ctx.body}`);
            const adminTargetNumber = NUMERO_ADMIN_PAGOS;
            const messageBody = ctx.body ? ctx.body.toUpperCase().trim() : '';

            const extractedDniCuit = state.get('extractedDniCuit');
            const extractedNombre = state.get('extractedNombre');
            const originalRemoteJid = state.get('originalRemoteJid');
            const originalPushName = state.get('originalPushName');
            const originalRawBody = state.get('originalRawBody');
            const originalFileUrl = state.get('originalFileUrl');
            const originalMimeType = state.get('originalMimeType');
            const originalFileName = state.get('originalFileName'); // Asegurarse de tener el nombre del archivo

            if (messageBody.includes('MENU')) {
                await flowDynamic('De acuerdo, volviendo al menú principal.');
                await state.update({
                    extractedDniCuit: undefined,
                    extractedNombre: undefined,
                    originalRemoteJid: undefined,
                    originalPushName: undefined,
                    originalRawBody: undefined,
                    originalFileUrl: undefined,
                    originalMimeType: undefined,
                    originalFileName: undefined
                });
                return gotoFlow(flowPrincipal);
            }

            if (messageBody.includes('SÍ') || messageBody.includes('SI') || messageBody.includes('CORRECTO')) {
                const finalAdminMessage = `✅ [PAGO CONFIRMADO POR USUARIO - OCR]\n` +
                                           `De: ${originalPushName || 'Usuario Desconocido'} (${originalRemoteJid || 'N/A'})\n\n` +
                                           `Datos de comprobante confirmados:\n` +
                                           `DNI/CUIT: ${extractedDniCuit || 'No encontrado'}\n` +
                                           `Nombre: ${extractedNombre || 'No encontrado'}\n\n` +
                                           `Texto original adjunto: ${originalRawBody || 'N/A'}`;

                await provider.vendor.sendMessage(adminTargetNumber, { text: finalAdminMessage });
                console.log(`[INFO] Datos de pago confirmados y reenviados a ${adminTargetNumber}`);

                if (originalFileUrl && originalMimeType) {
                    try {
                        if (originalMimeType.includes('image')) {
                            await provider.vendor.sendMessage(adminTargetNumber, { image: { url: originalFileUrl }, caption: `[IMAGEN ORIGINAL ADJUNTA] De ${originalPushName || 'Usuario'} (${originalRemoteJid || 'N/A'})` });
                        } else if (originalMimeType.includes('pdf')) {
                            // Usamos originalFileName si está disponible, si no, un nombre genérico
                            const fileNameToUse = originalFileName || 'comprobante_pago.pdf'; 
                            await provider.vendor.sendMessage(adminTargetNumber, { document: { url: originalFileUrl }, mimetype: originalMimeType, fileName: fileNameToUse, caption: `[PDF ORIGINAL ADJUNTO] De ${originalPushName || 'Usuario'} (${originalRemoteJid || 'N/A'})` });
                        } else if (originalMimeType.includes('video')) {
                             await provider.vendor.sendMessage(adminTargetNumber, { video: { url: originalFileUrl }, caption: `[VIDEO ORIGINAL ADJUNTO] De ${originalPushName || 'Usuario'} (${originalRemoteJid || 'N/A'})` });
                        }
                    } catch (e) {
                        console.error('[ERROR] Error al reenviar archivo original después de confirmación:', e);
                        await provider.vendor.sendMessage(adminTargetNumber, { text: `[ERROR REENVÍO ARCHIVO] Fallo al reenviar archivo original de ${originalPushName || 'Usuario'} (${originalRemoteJid || 'N/A'}) después de confirmación. Error: ${e.message}` });
                    }
                }

                await flowDynamic('¡Gracias por confirmar! Tu información de pago ha sido registrada. En breve la verificaremos y actualizaremos tu estado. Puedes escribir *MENU* para explorar otras opciones o iniciar una nueva consulta.');
                
                await state.update({
                    extractedDniCuit: undefined,
                    extractedNombre: undefined,
                    originalRemoteJid: undefined, // Limpiar estos al finalizar el proceso exitosamente
                    originalPushName: undefined,
                    originalRawBody: undefined,
                    originalFileUrl: undefined,
                    originalMimeType: undefined,
                    originalFileName: undefined // Limpiar también el nombre del archivo
                });
                return gotoFlow(flowPrincipal);

            } else if (messageBody.includes('NO') || messageBody.includes('INCORRECTO')) {
                console.log(`[INFO] Usuario rechazó OCR. Redirigiendo a flowEntradaManualPago.`);
                await state.update({ // Limpiar estado de OCR antes de ir a manual
                    extractedDniCuit: undefined,
                    extractedNombre: undefined,
                    // Mantenemos los 'originalRemoteJid', etc. para que flowEntradaManualPago sepa quién es el usuario original
                });
                return gotoFlow(flowEntradaManualPago); // REDIRECCION A NUEVO FLUJO MANUAL
            } else {
                return fallBack('No entendí tu respuesta. Por favor, responde *SÍ* o *NO*.');
            }
        }
    );

const flowEntradaManualPago = addKeyword(EVENTS.ACTION) // Se activa por acción interna
    .addAnswer(
        'Por favor, ingresa el DNI o CUIT y el nombre completo del titular del servicio en un solo mensaje.',
        {
            capture: true // Espera la entrada manual del usuario
        },
        async (ctx, { flowDynamic, gotoFlow, state, provider }) => {
            const adminTargetNumber = NUMERO_ADMIN_PAGOS;
            const remoteJid = await state.get('originalRemoteJid') || ctx.from; // Usamos el JID original o el actual
            const pushName = await state.get('originalPushName') || ctx.pushName;
            const manualText = ctx.body;

            console.log(`[DEBUG - flowEntradaManualPago] Recibido: "${manualText}"`);

            if (manualText.toUpperCase().includes('MENU')) {
                await flowDynamic('De acuerdo, volviendo al menú principal.');
                await state.update({ manualData: undefined }); // Limpiar datos manuales si vuelve a menú
                return gotoFlow(flowPrincipal);
            }

            const messageForAdmin = `📝 [PAGO MANUAL - DATOS RECIBIDOS]\n` +
                                     `De: ${pushName} (${remoteJid})\n\n` +
                                     `Datos ingresados manualmente:\n${manualText}\n\n` +
                                     `Esperando "LISTO" del usuario.`;

            await provider.vendor.sendMessage(adminTargetNumber, { text: messageForAdmin });
            console.log(`[INFO] Datos manuales reenviados a ${adminTargetNumber}.`);

            // Guarda el texto manual para futuras referencias si es necesario
            await state.update({ manualData: (await state.get('manualData') || '') + '\n' + manualText });

            await flowDynamic('¡Gracias! Hemos registrado tus datos. Ahora, por favor, escribe *LISTO* cuando hayas terminado de enviar toda la información (incluyendo el comprobante si no lo enviaste antes).');
            // Mantenemos el flujo activo aquí, esperando el LISTO
            // No hacemos gotoFlow ni return fallBack() para permanecer en este capture.
        }
    )
    .addAnswer(
        // Este `addAnswer` con `LISTO` es crucial para finalizar el ingreso manual
        'Si ya enviaste toda la información, escribe *LISTO*.',
        {
            capture: true, // Captura el "LISTO"
            // Opcional: idle para volver al menú si el usuario no responde
            idle: 120000, 
            handleIdle: async (ctx, { flowDynamic, gotoFlow, state }) => {
                await flowDynamic('Parece que no has respondido. Regresando al menú principal. Puedes escribir *MENU* en cualquier momento.');
                await state.update({ manualData: undefined });
                // Limpiar todos los estados de contexto al volver al menú principal por inactividad.
                await state.update({
                    originalRemoteJid: undefined,
                    originalPushName: undefined,
                    originalRawBody: undefined,
                    originalFileUrl: undefined,
                    originalMimeType: undefined,
                    originalFileName: undefined
                });
                return gotoFlow(flowPrincipal);
            },
        },
        async (ctx, { flowDynamic, gotoFlow, state, provider, fallBack }) => { // <--- CORRECCIÓN: AQUI SE AÑADE fallBack
            const messageBody = ctx.body ? ctx.body.toUpperCase().trim() : '';
            const adminTargetNumber = NUMERO_ADMIN_PAGOS;
            const remoteJid = await state.get('originalRemoteJid') || ctx.from;
            const pushName = await state.get('originalPushName') || ctx.pushName;

            if (messageBody.includes('MENU')) {
                await flowDynamic('De acuerdo, volviendo al menú principal.');
                await state.update({ manualData: undefined });
                // Limpiar todos los estados de contexto al volver al menú principal.
                await state.update({
                    originalRemoteJid: undefined,
                    originalPushName: undefined,
                    originalRawBody: undefined,
                    originalFileUrl: undefined,
                    originalMimeType: undefined,
                    originalFileName: undefined
                });
                return gotoFlow(flowPrincipal);
            }

            if (messageBody.includes('LISTO')) {
                const finalManualAdminMessage = `✅ [PAGO MANUAL - FINALIZADO POR USUARIO]\n` +
                                                 `De: ${pushName} (${remoteJid})\n\n` +
                                                 `Datos manuales recolectados:\n${await state.get('manualData') || 'No se ingresaron datos manuales específicos.'}`;
                
                await provider.vendor.sendMessage(adminTargetNumber, { text: finalManualAdminMessage });
                console.log(`[INFO] Proceso de pago manual finalizado por ${remoteJid}.`);

                await flowDynamic('¡Gracias por informarnos tu pago! En breve lo verificaremos y actualizaremos tu estado. Puedes escribir *MENU* para explorar otras opciones o iniciar una nueva consulta.');
                await state.update({ manualData: undefined }); // Limpiar el estado de datos manuales
                // Limpiar todos los estados de contexto al finalizar el proceso exitosamente.
                await state.update({
                    originalRemoteJid: undefined,
                    originalPushName: undefined,
                    originalRawBody: undefined,
                    originalFileUrl: undefined,
                    originalMimeType: undefined,
                    originalFileName: undefined
                });
                return gotoFlow(flowPrincipal);
            } else {
                return fallBack('No entendí tu respuesta. Por favor, escribe *LISTO* si ya terminaste de enviar tu información, o *MENU* para volver al inicio.');
            }
        }
    );

// Flujo para "Informar un Pago"
const flowInformarPago = addKeyword(['informar_pago', 'ya pague', 'reportar pago'])
    .addAnswer(
        'Para informar tu pago, por favor, envíanos una captura del comprobante de transferencia junto con el nombre y DNI o CUIT del titular del servicio. Cuando hayas enviado todo, puedes escribir *LISTO* para finalizar.',
        {
            delay: 500,
            capture: true // Este capture espera tanto media como texto inicial
        },
        async (ctx, { gotoFlow, flowDynamic, fallBack, provider, state }) => {
            console.log(`[DEBUG - flowInformarPago] ctx recibido (completo):`, JSON.stringify(ctx, null, 2));
            
            const adminTargetNumber = NUMERO_ADMIN_PAGOS;
            
            // --- CORRECCIÓN: Detección de media más robusta usando propiedades exactas de Baileys ---
            let isMedia = false;
            let mediaTypeKey = null; // Para saber qué tipo de media se encontró
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
            // --- FIN CORRECCIÓN ---

            const remoteJid = ctx.from;
            const messageBody = ctx.body ? ctx.body.toUpperCase().trim() : '';
            const rawBody = ctx.body || '';

            console.log(`[DEBUG - flowInformarPago] isMedia: ${isMedia} (detected as: ${mediaTypeKey}), messageBody: "${messageBody}", rawBody: "${rawBody}"`);

            await state.update({
                originalRemoteJid: remoteJid,
                originalPushName: ctx.pushName,
                originalRawBody: rawBody, // Guardamos el body original también aquí
            });

            // Manejo de comandos especiales (MENU siempre debe ser una opción)
            if (messageBody.includes('MENU')) {
                await flowDynamic('De acuerdo, volviendo al menú principal.');
                await state.update({ manualData: undefined }); 
                return gotoFlow(flowPrincipal);
            }
            
            if (messageBody.includes('LISTO')) {
                await flowDynamic('Por favor, primero envía tu comprobante o los datos manualmente, luego escribe *LISTO*.');
                return fallBack(); 
            }

            // Procesamiento de media con Gemini (OCR)
            if (isMedia) {
                console.log(`[INFO] Media recibida de ${remoteJid}. Intentando procesar con Gemini.`);
                try {
                    // --- CORRECCIÓN: Acceder a mimetype, fileUrl y fileName de forma segura ---
                    let mimeType;
                    let fileUrl;
                    let fileName; 
                    const mediaMessage = ctx.message[mediaTypeKey]; // Esto será ctx.message.imageMessage, ctx.message.documentMessage, etc.

                    if (mediaMessage) {
                        mimeType = mediaMessage.mimetype;
                        fileUrl = mediaMessage.url;
                        if (mediaTypeKey === 'documentMessage') {
                            fileName = mediaMessage.fileName;
                        }
                    }
                    // --- FIN CORRECCIÓN ---

                    console.log(`[DEBUG] Tipo de MIME detectado: ${mimeType}, URL del archivo: ${fileUrl}`);

                    if (!fileUrl || !mimeType || (!mimeType.includes('image/jpeg') && !mimeType.includes('image/png') && !mimeType.includes('application/pdf'))) {
                        await flowDynamic('Tipo de archivo no soportado para OCR. Por favor, envía una imagen (JPG/PNG) o un documento PDF. Puedes escribir los datos de DNI/CUIT y nombre directamente si lo prefieres. Cuando hayas enviado todo, escribe *LISTO*.');
                        console.log(`[ERROR] Tipo de archivo no soportado para OCR: ${mimeType} de ${remoteJid}`);
                        
                        const fallbackCaption = `[FALLO IA - TIPO NO SOPORTADO] Comprobante de ${ctx.pushName || 'Usuario'} (${remoteJid}). Tipo: ${mimeType}\nTexto original: ${rawBody || 'N/A'}`;
                        
                        // Reenvío del archivo original si es posible
                        if (mediaTypeKey === 'imageMessage' && ctx.message.imageMessage) {
                            await provider.vendor.sendMessage(adminTargetNumber, { image: { url: ctx.message.imageMessage.url }, caption: fallbackCaption });
                        } else if (mediaTypeKey === 'documentMessage' && ctx.message.documentMessage) {
                            await provider.vendor.sendMessage(adminTargetNumber, { document: { url: ctx.message.documentMessage.url }, mimetype: ctx.message.documentMessage.mimetype, fileName: ctx.message.documentMessage.fileName, caption: fallbackCaption });
                        } else if (mediaTypeKey === 'videoMessage' && ctx.message.videoMessage) {
                            await provider.vendor.sendMessage(adminTargetNumber, { video: { url: ctx.message.videoMessage.url }, caption: fallbackCaption });
                        } else {
                            // Si por alguna razón no se pudo reenviar como media, al menos notificar al admin
                            await provider.vendor.sendMessage(adminTargetNumber, { text: fallbackCaption + '\n[No se pudo reenviar el archivo original por error interno]' });
                        }
                        return; // Mantiene el `capture` activo para que el usuario pueda intentar de nuevo o ingresar texto
                    }
                    
                    console.log(`[INFO] Descargando archivo desde URL: ${fileUrl}`);
                    const response = await fetch(fileUrl);
                    if (!response.ok) {
                        throw new Error(`Error al descargar el archivo: ${response.status} ${response.statusText}`);
                    }
                    const arrayBuffer = await response.arrayBuffer();
                    const base64Data = Buffer.from(arrayBuffer).toString("base64");

                    const fileData = {
                        inlineData: {
                            data: base64Data,
                            mimeType: mimeType
                        },
                    };

                    const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });

                    const prompt = `Extrae el DNI (Documento Nacional de Identidad) o CUIT (Código Único de Identificación Tributaria) y el nombre completo del titular del comprobante/documento adjunto.
                                    Si encuentras ambos DNI y CUIT, lista ambos. Si no encuentras alguno, indica "No encontrado".
                                    Formato de salida (crucial para parsing):
                                    DNI: [valor_DNI]
                                    CUIT: [valor_CUIT]
                                    Nombre: [valor_Nombre_Completo]`;

                    console.log(`[INFO] Enviando archivo a Gemini para procesamiento OCR.`);
                    const result = await model.generateContent([prompt, fileData]);
                    const textFromGemini = result.response.text();

                    console.log(`[INFO] Respuesta de Gemini para OCR (${remoteJid}):\n${textFromGemini}`);

                    const dniMatch = textFromGemini.match(/DNI:\s*([^\n]+)/i);
                    const cuitMatch = textFromGemini.match(/CUIT:\s*([^\n]+)/i);
                    const nombreMatch = textFromGemini.match(/Nombre:\s*([^\n]+)/i);

                    let extractedDni = dniMatch && dniMatch[1] ? dniMatch[1].trim() : 'No encontrado';
                    let extractedCuit = cuitMatch && cuitMatch[1] ? cuitMatch[1].trim() : 'No encontrado';
                    let extractedNombre = nombreMatch && nombreMatch[1] ? nombreMatch[1].trim() : 'No encontrado';

                    let extractedDniCuit = 'No encontrado';
                    if (extractedDni !== 'No encontrado' && extractedCuit !== 'No encontrado') {
                        extractedDniCuit = `${extractedDni} / ${extractedCuit}`;
                    } else if (extractedDni !== 'No encontrado') {
                        extractedDniCuit = extractedDni;
                    } else if (extractedCuit !== 'No encontrado') {
                        extractedDniCuit = extractedCuit;
                    }

                    console.log(`[DEBUG] Datos extraídos: DNI/CUIT: "${extractedDniCuit}", Nombre: "${extractedNombre}"`);

                    if (extractedDniCuit === 'No encontrado' && extractedNombre === 'No encontrado') {
                        await flowDynamic('No pude extraer el DNI/CUIT o el nombre del comprobante. Por favor, asegúrate de que la imagen sea clara y legible. Redirigiendo para que puedas escribir los datos manualmente.');
                        console.log(`[WARN] Gemini no pudo extraer datos de ${remoteJid}. Redirigiendo a entrada manual.`);
                        const fallbackCaption = `[FALLO IA - DATOS NO EXTRAÍDOS] Comprobante de ${ctx.pushName || 'Usuario'} (${remoteJid}). AI no pudo extraer datos.\nTexto original: ${rawBody || 'N/A'}`;
                        
                        // Reenvío del archivo original si es posible
                        if (mediaTypeKey === 'imageMessage' && ctx.message.imageMessage) {
                            await provider.vendor.sendMessage(adminTargetNumber, { image: { url: ctx.message.imageMessage.url }, caption: fallbackCaption });
                        } else if (mediaTypeKey === 'documentMessage' && ctx.message.documentMessage) {
                            await provider.vendor.sendMessage(adminTargetNumber, { document: { url: ctx.message.documentMessage.url }, mimetype: ctx.message.documentMessage.mimetype, fileName: ctx.message.documentMessage.fileName, caption: fallbackCaption });
                        }
                        return gotoFlow(flowEntradaManualPago); 
                    }

                    await state.update({
                        extractedDniCuit: extractedDniCuit,
                        extractedNombre: extractedNombre,
                        originalFileUrl: fileUrl,
                        originalMimeType: mimeType,
                        originalFileName: fileName // Guardamos el nombre del archivo para PDFs
                    });

                    console.log(`[INFO] Datos extraídos y guardados en estado. Dirigiendo a flowConfirmarPago para ${remoteJid}`);
                    return gotoFlow(flowConfirmarPago);

                } catch (e) {
                    console.error('[ERROR] Error al procesar con Gemini o al reenviar (TRY BLOCK):', e);
                    await flowDynamic('Hubo un problema al procesar tu comprobante con IA. Por favor, intenta de nuevo con otra imagen o te redirigiré para que puedas escribir los datos manualmente.');
                    
                    try {
                        const fallbackCaption = `[FALLO IA - REQUERIR REVISIÓN MANUAL] Fallo al procesar comprobante de ${ctx.pushName || 'Usuario'} (${remoteJid}). Error: ${e.message}\nTexto original: ${rawBody || 'N/A'}`;
                        if (mediaTypeKey === 'imageMessage' && ctx.message.imageMessage) {
                            await provider.vendor.sendMessage(adminTargetNumber, { image: { url: ctx.message.imageMessage.url }, caption: fallbackCaption });
                        } else if (mediaTypeKey === 'documentMessage' && ctx.message.documentMessage) {
                            await provider.vendor.sendMessage(adminTargetNumber, { document: { url: ctx.message.documentMessage.url }, mimetype: ctx.message.documentMessage.mimetype, fileName: ctx.message.documentMessage.fileName, caption: fallbackCaption });
                        } else {
                            await provider.vendor.sendMessage(adminTargetNumber, { text: `[FALLO IA - SIN ARCHIVO] Fallo al procesar de ${ctx.pushName || 'Usuario'} (${remoteJid}). Error: ${e.message}\nTexto original: ${rawBody || 'N/A'}` });
                        }
                        console.log(`[WARN] Comprobante original reenviado como FALLBACK a ${adminTargetNumber} debido a error de IA.`);
                    } catch (fallbackError) {
                        console.error('[ERROR] Error al reenviar el fallback de comprobante (CATCH BLOCK):', fallbackError);
                    }
                    return gotoFlow(flowEntradaManualPago); 
                }
            }
            // Procesamiento de texto (DNI/CUIT u otra información) si NO es media
            else if (ctx.body && ctx.body.length > 0) {
                console.log(`[INFO] Texto recibido de ${remoteJid}. Redirigiendo para entrada manual.`);
                await flowDynamic('De acuerdo, has iniciado el proceso de ingreso manual de datos. Por favor, escribe tu DNI/CUIT y nombre completo.');
                return gotoFlow(flowEntradaManualPago);
            }
            // Fallback para entradas no válidas (ni media, ni texto, ni comandos reconocidos)
            else {
                console.log(`[WARN] Entrada no reconocida de ${remoteJid}. Activando fallBack.`);
                return fallBack('No entendí tu respuesta. Por favor, envía una *captura o archivo* de tu comprobante, o escribe tus datos de DNI/CUIT y nombre. Cuando hayas enviado todo, escribe *LISTO*. También puedes escribir *MENU* para volver al inicio.');
            }
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
        flowEntradaManualPago, // <-- AÑADE ESTE NUEVO FLUJO AQUÍ
        flowInformarPago,
        flowConfirmarPago,
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