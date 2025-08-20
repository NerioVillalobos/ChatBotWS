// app.js
// Modificacion funcional- > luego de la correccion de errores de compilacion
// Modificado por: Nervill
// Fecha: 2024-01-15
// Version: 1.0.0.BETA-20240115-v0.1

import botWhatsapp from '@bot-whatsapp/bot'
const { createBot, createProvider, createFlow, addKeyword, EVENTS } = botWhatsapp
import QRPortalWeb from '@bot-whatsapp/portal'
import BaileysProvider from '@bot-whatsapp/provider/baileys'
import MockAdapter from '@bot-whatsapp/database/mock'
import fetch from 'node-fetch'
import { downloadMediaMessage } from '@whiskeysockets/baileys'
import { GoogleSpreadsheet } from 'google-spreadsheet'
import { JWT } from 'google-auth-library'
import fs from 'fs'
import path, { dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * IMPORTANTE: Recuerda que los flujos se declaran de forma que los flujos "hijos"
 * (a los que se llega desde otro flujo) deben ser declarados ANTES del flujo "padre"
 * que los invoca.
 */

// Configuración de Google Sheets
const SPREADSHEET_ID = '1x071H-KoQ7eM8xNpyNDLA7yJ_evG1wfQRnHOeFLvdNY';
const SHEET_TITLE = 'ChatBot-Precios';
let creds = {};
try {
    const creds_path = path.join(__dirname, 'creds.json');
    const data = fs.readFileSync(creds_path, 'utf8');
    creds = JSON.parse(data);
} catch (err) {
    console.error("Error reading or parsing creds.json:", err);
}

/**
 * Verifica si la hora actual se encuentra dentro del horario comercial en Argentina.
 * Horario comercial:
 * - Lunes a Viernes: 07:00–12:29 y 16:00–23:59
 * - Sábados: 09:00–11:59
 * @returns {boolean} `true` si está dentro del horario comercial, `false` en caso contrario.
 */
const isWithinBusinessHours = () => {
    // Obtener la fecha y hora actual en la zona horaria de Argentina
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    const day = now.getDay(); // Domingo: 0, Lunes: 1, ..., Sábado: 6
    const hour = now.getHours();
    const minutes = now.getMinutes();
    const totalMinutes = hour * 60 + minutes;

    // Lunes a Viernes (1 a 5)
    if (day >= 1 && day <= 5) {
        const morningStart = 7 * 60; // 07:00
        const morningEnd = 12 * 60 + 29; // 12:29
        const afternoonStart = 16 * 60; // 16:00
        const afternoonEnd = 23 * 60 + 59; // 23:59

        if ((totalMinutes >= morningStart && totalMinutes <= morningEnd) || (totalMinutes >= afternoonStart && totalMinutes <= afternoonEnd)) {
            return true;
        }
    }

    // Sábado (6)
    if (day === 6) {
        const saturdayStart = 9 * 60; // 09:00
        const saturdayEnd = 11 * 60 + 59; // 11:59

        if (totalMinutes >= saturdayStart && totalMinutes <= saturdayEnd) {
            return true;
        }
    }

    // Domingo (0) y fuera de los rangos de L-S
    return false;
};

// Define los números de atención administrativa por localidad (NECESITAS REEMPLAZAR ESTOS VALORES)
const NUMERO_ADMIN_FONTANA = '5491140638555@s.whatsapp.net'; // Ejemplo: reemplazar con el número real de WhatsApp del admin de Fontana
const NUMERO_ADMIN_IBARRETA = '5491140638555@s.whatsapp.net'; // Ejemplo: reemplazar con el número real de WhatsApp del admin de Ibarreta
const NUMERO_TEST = '5491161726168@s.whatsapp.net';

// ----------------------------------------------------
// FLUJOS FINALES / HOJAS DEL ÁRBOL
// ----------------------------------------------------

// Flujo para "Llama a una persona" (general, usado también para servicio técnico)
const flowLlamarPersona = addKeyword(['llamar_persona', 'llamar', 'contacto', 'agente', 'hablar con alguien', 'otras consultas'])
    .addAction(async (ctx, { flowDynamic }) => {
        if (!isWithinBusinessHours()) {
            await flowDynamic('En el caso de que se encuentre fuera de horario de atención será respondido una vez que se encuentre disponible una persona en horario comercial.');
        }
    })
    .addAnswer(['Perfecto! Lo derivamos con una persona de atención para resolver sus dudas.','\nPor favor haga clic en el siguiente link:\n📞 https://bit.ly/4l1iOvh'])
    .addAnswer('¿Hay algo más en lo que pueda ayudarte?\nEscribe *MENU* para volver al inicio.', { delay: 1000, capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        if (ctx.body && typeof ctx.body === 'string' && ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }
        return fallBack('No entendí tu respuesta. Si deseas explorar otras opciones, escribe *MENU* para volver al inicio.');
    });


const flowPideNombre = addKeyword('__PIDE_NOMBRE__')
    .addAnswer(
        'Gracias. Ahora, ingresá tu Nombre y Apellido.',
        { capture: true },
        async (ctx, { state, gotoFlow }) => {
            const myState = state.getMyState();
            await state.update({ customerInfo: `DNI/CUIT: ${myState.dni}, Nombre y Apellido: ${ctx.body}`, mediaFiles: [] });
            return gotoFlow(flowCargaArchivo);
        }
    );

const flowInformarPago = addKeyword(['_informar_pago_'])
    .addAnswer(
        'Por favor, ingresá tu DNI o CUIT.',
        { capture: true },
        async (ctx, { state, gotoFlow, fallBack }) => {
            const dni = ctx.body.replace(/\D/g, ''); // Remove non-digits
            if (!/^(\d{7,8}|\d{11})$/.test(dni)) {
                return fallBack('El DNI o CUIT ingresado no es válido. Por favor, ingrésalo de nuevo. Debe tener 7 u 8 dígitos para DNI, u 11 para CUIT y contener solo números.');
            }
            await state.update({ dni: dni });
            return gotoFlow(flowPideNombre);
        }
    );

const flowCargaArchivo = addKeyword(['_carga_archivo_'])
    .addAnswer(
        '¡Gracias! Ahora, por favor, cargá el comprobante de pago recibido y escribí LISTO cuando termines.',
        { capture: true },
        async (ctx, { provider, state, endFlow, fallBack }) => {
            const { customerInfo, mediaFiles } = state.getMyState();
            const messageBody = (ctx.body && typeof ctx.body === 'string') ? ctx.body.toUpperCase().trim() : '';

            // Si el usuario escribe 'LISTO', procesar archivos guardados
            if (messageBody === 'LISTO') {
                const remoteJid = ctx.from;
                const pushName = ctx.pushName || 'Usuario Desconocido';

                const adminTextMessage = `📄 [NUEVO PAGO REPORTADO]\n\nDe: ${pushName} (${remoteJid})\n\nDatos del cliente: ${customerInfo}`;
                await provider.vendor.sendMessage(NUMERO_TEST, { text: adminTextMessage });

                // Enviar cada archivo guardado
                for (const file of mediaFiles) {
                    const buffer = Buffer.from(file.base64, 'base64');
                    await provider.vendor.sendMessage(NUMERO_TEST, {
                        [file.type]: buffer,
                        mimetype: file.mimeType,
                        fileName: file.fileName,
                        caption: file.caption
                    });
                }

                return endFlow('Muchas gracias, de inmediato nuestro equipo procesará la información enviada.\n\nSi necesita algo más escriba *MENU*.');
            }

            // Detectar si el mensaje es un archivo multimedia
            const isMedia = ctx.message?.imageMessage || ctx.message?.documentMessage || ctx.message?.videoMessage;
            if (isMedia) {
                const remoteJid = ctx.from;
                const pushName = ctx.pushName || 'Usuario Desconocido';
                
                // Descargar archivo usando Baileys
                const buffer = await downloadMediaMessage(ctx, 'buffer', {}, provider.vendor);
                const base64 = buffer.toString('base64');

                const mediaMessage = ctx.message.imageMessage || ctx.message.documentMessage || ctx.message.videoMessage;
                const mimeType = mediaMessage.mimetype;
                const fileName = mediaMessage.fileName || 'recibo';

                let fileType;
                if (mimeType.includes('image')) {
                    fileType = 'image';
                } else if (mimeType.includes('pdf')) {
                    fileType = 'document';
                } else if (mimeType.includes('video')) {
                    fileType = 'video';
                }

                const newFile = {
                    base64: base64,
                    mimeType: mimeType,
                    fileName: fileName,
                    caption: `[RECIBO DE PAGO] De ${pushName} (${remoteJid})`,
                    type: fileType
                };

                const updatedMediaFiles = [...(mediaFiles || []), newFile];
                await state.update({ mediaFiles: updatedMediaFiles });

                return fallBack('Recibido. Puedes enviar más archivos o escribir *LISTO* para finalizar.');
            }

            return fallBack('Lo siento, no pude procesar tu mensaje. Por favor, envía un archivo o escribe *LISTO* para terminar.');
        }
    );


const flowMediosPagoFontana = addKeyword('__MEDIOS_PAGO_FONTANA__')
    .addAnswer(
        [
            'Podés realizar tus pagos a través de los siguientes medios:',
            '• Transferencia bancaria:',
            'VANGUARD INTERNET SRL',
            'CUIT: 30716576376',
            'CBU: 0170304520000031123901',
            'ALIAS: VANGUARD.INTERNET',
            '• Pagar en el local de Fontana: Av. San Martín 1628',
            '',
            'Recordá incluir tu número de DNI en la referencia.'
        ].join('\n')
    )
    .addAnswer('¿Hay algo más en lo que pueda ayudarte?\nEscribe MENU para volver al inicio.', { delay: 1000, capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        if (ctx.body && typeof ctx.body === 'string' && ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }
        return fallBack('No entendí tu respuesta. Si deseas explorar otras opciones, escribe *MENU* para volver al inicio.');
    });

const flowMediosPagoIbarreta = addKeyword('__MEDIOS_PAGO_IBARRETA__')
    .addAnswer(
        [
            'Podés realizar tus pagos a través de los siguientes medios:',
            '• Transferencia bancaria:',
            'VANGUARD INTERNET SRL',
            'CUIT: 30716576376',
            'CBU: 0170304520000031123901',
            'ALIAS: VANGUARD.INTERNET',
            '• Pagar en el local de Ibarreta: Gral. San Martín 489',
            '',
            'Recordá incluir tu número de DNI en la referencia.'
        ].join('\n')
    )
    .addAnswer('¿Hay algo más en lo que pueda ayudarte?\nEscribe MENU para volver al inicio.', { delay: 1000, capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        if (ctx.body && typeof ctx.body === 'string' && ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }
        return fallBack('No entendí tu respuesta. Si deseas explorar otras opciones, escribe *MENU* para volver al inicio.');
    });

// Flujo para "Consultar precios de los servicios"
const flowConsultarPrecios = addKeyword(['consultar_precios', 'precios', 'planes', 'costo'])
    .addAnswer(
        '¡Claro! Aquí están nuestros planes y precios más recientes:',
        null,
        async (ctx, { flowDynamic, state, gotoFlow }) => {
            try {
                const myState = state.getMyState();
                const zonaSeleccionada = myState.zona;

                const planes = await getPreciosFromGoogleSheet();

                if (planes.length === 0) {
                    await flowDynamic('Lo siento, no pude obtener la información de los planes en este momento. Por favor, intenta de nuevo más tarde.');
                } else {
                    const planesFiltrados = planes.filter(plan => plan.zona.toLowerCase() === zonaSeleccionada.toLowerCase());

                    if (planesFiltrados.length === 0) {
                         await flowDynamic(`Lo siento, no encontré planes para la zona de ${zonaSeleccionada}.`);
                    } else {
                        let mensajeFinal = `*Planes para ${zonaSeleccionada.toUpperCase()}*\n\n`;
                        planesFiltrados.forEach(plan => {
                            mensajeFinal += `  - Tipo de servicio: ${plan.tipoDeServicio}\n    Precio: ${plan.precio}\n`;
                        });
                        await flowDynamic(mensajeFinal.trim());
                    }
                }
            } catch (error) {
                console.error('Error en el flujo de precios:', error);
                await flowDynamic('Ocurrió un error al procesar tu solicitud. Por favor, intenta de nuevo más tarde.');
            }
            
            await flowDynamic('Si deseas contratar alguno de estos planes o tienes otras dudas, contáctanos directamente 📞 https://bit.ly/4l1iOvh');
            return gotoFlow(flowEnd);
        }
    );

// Flujo para "Otras Consultas" (Modificación para asegurar el retorno al menú)
const flowOtrasConsultas = addKeyword(['otras_consultas'])
    .addAction(async (ctx, { flowDynamic }) => {
        if (!isWithinBusinessHours()) {
            await flowDynamic('En el caso de que se encuentre fuera de horario de atención será respondido una vez que se encuentre disponible una persona en horario comercial.');
        }
    })
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


    /**
 * Esta función se conecta a una Google Sheet y lee los datos
 * @returns {Promise<Array>} Un array de objetos con los datos de los planes
 */
const getPreciosFromGoogleSheet = async () => {
    try {
        const serviceAccountAuth = new JWT({
            email: creds.client_email,
            key: creds.private_key,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
        await doc.loadInfo();

        const sheet = doc.sheetsByTitle[SHEET_TITLE];
        if (!sheet) {
            console.error(`Error: No se encontró la hoja con el título "${SHEET_TITLE}"`);
            return [];
        }

        const rows = await sheet.getRows();
        const planes = rows.map((row) => ({
            tipoDeServicio: row.get('Tipo de Servicio'), // Mapea a la columna 'Tipo de Servicio'
            zona: row.get('Zona'),                     // Mapea a la columna 'Zona'
            precio: row.get('Precio')                       // Mapea a la columna 'Precio'
        }));

        return planes;
    } catch (error) {
        console.error('Error al leer la hoja de cálculo:', error);
        return [];
    }
};



// ----------------------------------------------------
// FLUJOS INTERMEDIOS
// ----------------------------------------------------

// Flujo para "Servicio Técnico"
const flowServicioTecnico = addKeyword(['tecnico', 'problema', 'no tengo internet', 'soporte'])
    .addAnswer('¡Importante! Antes de continuar, por favor, realiza estos pasos:')
    .addAnswer('• Reinicia tu router o equipo.\n• Verifica los cables y la alimentación eléctrica.\n• Confirma que realizaste estos pasos.', { delay: 1000 })
    .addAnswer('¿Ya realizaste estos pasos? (Sí/No)', { capture: true }, async (ctx, { gotoFlow, fallBack, flowDynamic }) => {
        if (ctx.body && typeof ctx.body === 'string' && ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }

        if (ctx.body && typeof ctx.body === 'string' && (ctx.body.toLowerCase().includes('si') || ctx.body.toLowerCase().includes('sí'))) {
            if (!isWithinBusinessHours()) {
                await flowDynamic('En el caso de que se encuentre fuera de horario de atención será respondido una vez que se encuentre disponible una persona en horario comercial.');
            }
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
            return gotoFlow(flowMediosPagoFontana);
        }
        if (ctx.body && typeof ctx.body === 'string' && (ctx.body.includes('3') || ctx.body.toLowerCase().includes('precios') || ctx.body.toLowerCase().includes('planes') || ctx.body.includes('3️⃣'))) {
            await state.update({ zona: 'Fontana' });
            return gotoFlow(flowConsultarPrecios);
        }
        if (ctx.body && typeof ctx.body === 'string' && (ctx.body.includes('4') || ctx.body.toLowerCase().includes('otras') || ctx.body.includes('4️⃣'))) {
            return gotoFlow(flowOtrasConsultas);
        }
        // Cambio aquí: si no se reconoce la respuesta, se mantiene en el flujo.
        return fallBack('No entendí tu respuesta. Por favor, elige una opción válida (1, 2, 3 o 4, o los emojis 1️⃣, 2️⃣, 3️⃣, 4️⃣). Escribe *MENU* para volver al inicio.');
    });

const flowServicioTecnicoIbarreta = addKeyword('__SERVICIO_TECNICO_IBARRETA__')
    .addAnswer('¡Importante! Antes de continuar, por favor, realiza estos pasos:')
    .addAnswer('• Reiniciá tu router o equipo.\n• Verificá el cable y la alimentación eléctrica.')
    .addAnswer('¿Confirmas que realizaste estos pasos? (Sí/No)', { capture: true }, async (ctx, { gotoFlow, fallBack, flowDynamic }) => {
        if (ctx.body && typeof ctx.body === 'string' && ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }

        if (ctx.body && typeof ctx.body === 'string' && (ctx.body.toLowerCase().includes('si') || ctx.body.toLowerCase().includes('sí'))) {
            if (!isWithinBusinessHours()) {
                await flowDynamic('En el caso de que se encuentre fuera de horario de atención será respondido una vez que se encuentre disponible una persona en horario comercial.');
            }
            await flowDynamic('¡Perfecto! Lo derivamos con una persona de soporte técnico para evacuar sus dudas. Por favor haga clic en el siguiente link: https://bit.ly/4l1iOvh');
            return gotoFlow(flowEnd);
        } else if (ctx.body && typeof ctx.body === 'string' && ctx.body.toLowerCase().includes('no')) {
            return fallBack('Es fundamental que realices estos pasos para poder diagnosticar tu problema. Por favor, intenta de nuevo cuando los hayas completado. Si aún así no puedes, podemos conectarte con un agente. Escribe *MENU* para volver al inicio.');
        } else {
            return fallBack('No entendí tu respuesta. Por favor, responde "Sí" o "No". Escribe *MENU* para volver al inicio.');
        }
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
            return gotoFlow(flowMediosPagoIbarreta);
        }
        if (ctx.body && typeof ctx.body === 'string' && (ctx.body.includes('3') || ctx.body.toLowerCase().includes('precios') || ctx.body.toLowerCase().includes('planes') || ctx.body.includes('3️⃣'))) {
            await state.update({ zona: 'Ibarreta' });
            return gotoFlow(flowConsultarPrecios);
        }
        if (ctx.body && typeof ctx.body === 'string' && (ctx.body.includes('4') || ctx.body.toLowerCase().includes('otras') || ctx.body.includes('4️⃣'))) {
            return gotoFlow(flowServicioTecnicoIbarreta);
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


const flowEnd = addKeyword('__FLOW_END__')
    .addAnswer('¿Hay algo más en lo que pueda ayudarte?\nEscribe MENU para volver al inicio.', { capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        if (ctx.body && typeof ctx.body === 'string' && ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }
        return fallBack('No entendí tu respuesta. Si deseas explorar otras opciones, escribe *MENU* para volver al inicio.');
    });

// ----------------------------------------------------
// FLUJO PRINCIPAL (Punto de entrada del bot)
// ----------------------------------------------------

const flowPrincipal = addKeyword(['hola', 'ole', 'alo', 'buenos dias', 'buenas tardes', 'buenas noches', 'menu', EVENTS.WELCOME])
    .addAction(async (ctx) => {
        const userPhone = ctx.from;
        const dateTime = new Date().toLocaleString('es-ES', { timeZone: 'America/Argentina/Buenos_Aires' });
        console.log(`[NUEVA INTERACCIÓN] De: ${userPhone} a las ${dateTime}`);
    })
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
        flowCargaArchivo,
        flowLlamarPersona,
        flowConsultarPrecios,
        flowMediosPagoFontana,
        flowMediosPagoIbarreta,
        flowPideNombre,
        flowInformarPago,
        flowServicioTecnico,
        flowServicioTecnicoIbarreta,
        flowAtencionAdministrativaFontana,
        flowAtencionAdministrativaIbarreta,
        flowOtrasConsultas,
        flowOtraZona,
        flowEnd,
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