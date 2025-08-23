// app.js
// Modificacion funcional- > luego de la correccion de errores de compilacion
// Modificado por: Nervill
// Fecha: 2024-01-15
// Version: 2.0.0.BETA-20240115-v0.2 (Externalized texts)

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

// --- Configuración ---
const SPREADSHEET_ID = '1x071H-KoQ7eM8xNpyNDLA7yJ_evG1wfQRnHOeFLvdNY';
const PRICES_SHEET_TITLE = 'ChatBot-Precios';
const TEXT_SHEET_TITLE = 'Setup-Texto';
let BOT_TEXTS = {};
let creds = {};
try {
    const creds_path = path.join(__dirname, 'creds.json');
    const data = fs.readFileSync(creds_path, 'utf8');
    creds = JSON.parse(data);
} catch (err) {
    console.error("Error reading or parsing creds.json:", err);
}

// --- Constantes ---
const NUMERO_ADMIN_FONTANA = '5491140638555@s.whatsapp.net';
const NUMERO_ADMIN_IBARRETA = '5491140638555@s.whatsapp.net';
const NUMERO_TEST = '5491161726168@s.whatsapp.net';


// --- Funciones de Utilidad ---

/**
 * Verifica si la hora actual se encuentra dentro del horario comercial en Argentina.
 */
const isWithinBusinessHours = () => {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    const day = now.getDay(); // Domingo: 0, Lunes: 1, ..., Sábado: 6
    const hour = now.getHours();
    const minutes = now.getMinutes();
    const totalMinutes = hour * 60 + minutes;

    // Lunes a Viernes (1 a 5)
    if (day >= 1 && day <= 5) {
        const morningStart = 8 * 60;
        const morningEnd = 12 * 60 + 30;
        const afternoonStart = 16 * 60;
        const afternoonEnd = 20 * 60;
        if (
            (totalMinutes >= morningStart && totalMinutes <= morningEnd) ||
            (totalMinutes >= afternoonStart && totalMinutes <= afternoonEnd)
        ) {
            return true;
        }
    }
    // Sábado (6)
    if (day === 6) {
        const saturdayStart = 9 * 60;
        const saturdayEnd = 12 * 60;
        if (totalMinutes >= saturdayStart && totalMinutes <= saturdayEnd) {
            return true;
        }
    }
    return false;
};

/**
 * Carga los precios desde la hoja de cálculo.
 */
const getPreciosFromGoogleSheet = async () => {
    try {
        const serviceAccountAuth = new JWT({ email: creds.client_email, key: creds.private_key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
        const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
        await doc.loadInfo();
        const sheet = doc.sheetsByTitle[PRICES_SHEET_TITLE];
        if (!sheet) {
            console.error(`Error: No se encontró la hoja con el título "${PRICES_SHEET_TITLE}"`);
            return [];
        }
        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
        const month = now.getMonth();
        const year = now.getFullYear().toString().slice(-2);
        const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
        const priceColumnName = `${monthNames[month]}- ${year}`;
        const rows = await sheet.getRows();
        const planes = rows.map((row) => ({
            tipoDeServicio: row.get('Planes') || row._rawData[0],
            zona: row.get('Zona'),
            precio: row.get(priceColumnName),
            rowNumber: row.rowNumber
        })).filter(plan => plan.tipoDeServicio && plan.precio);
        return planes;
    } catch (error) {
        console.error('Error al leer la hoja de cálculo de precios:', error);
        return [];
    }
};

/**
 * Carga todos los textos estáticos del bot desde la hoja de cálculo.
 */
const loadTextsFromSheet = async () => {
    try {
        const serviceAccountAuth = new JWT({ email: creds.client_email, key: creds.private_key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
        const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
        await doc.loadInfo();
        const sheet = doc.sheetsByTitle[TEXT_SHEET_TITLE];
        if (!sheet) {
            console.error(`Error: No se encontró la hoja con el título "${TEXT_SHEET_TITLE}"`);
            process.exit(1);
        }
        const rows = await sheet.getRows();
        const textData = {};
        rows.forEach(row => {
            const id = row.get('ID_TEXTO');
            let text = row.get('TEXTO');
            if (id && text) {
                // Normalizar saltos de línea y eliminar comillas innecesarias
                text = text.trim();
                if (text.startsWith('"') && text.endsWith('"')) {
                    text = text.slice(1, -1);
                }
                text = text
                    .replace(/\r\n/g, '\n')
                    .replace(/\\n/g, '\n')
                    .replace(/<br>/gi, '\n');
                textData[id] = text;
            }
        });
        BOT_TEXTS = textData;
        console.log('✅ Textos del bot cargados correctamente.');
    } catch (error) {
        console.error('Error fatal al cargar los textos del bot:', error);
        process.exit(1);
    }
};


/**
 * Obtiene un texto y reemplaza las variables.
 */
const getText = (key, variables = {}) => {
    let text = BOT_TEXTS[key];
    if (!text) {
        console.error(`Error: No se encontró el texto para la clave "${key}"`);
        return `Error: Texto no encontrado para la clave: ${key}`;
    }
    for (const variable in variables) {
        const placeholder = new RegExp(`%${variable}%`, 'g');
        text = text.replace(placeholder, variables[variable]);
    }
    return text;
};

// Cargar textos antes de definir los flujos del bot
await loadTextsFromSheet();

// Envía el aviso de fuera de horario junto con el horario de atención
const sendOutOfHoursMessage = async (flowDynamic) => {
    await flowDynamic(getText('aviso_fuera_de_horario'));
    await flowDynamic(getText('horario_atencion'));
};

// --- Flujos del Bot ---

// Flujo para "Llama a una persona" (general, usado también para servicio técnico)
const flowLlamarPersona = addKeyword(['llamar_persona', 'llamar', 'contacto', 'agente', 'hablar con alguien', 'otras consultas'])
    .addAction(async (ctx, { flowDynamic }) => {
        if (!isWithinBusinessHours()) {
            await sendOutOfHoursMessage(flowDynamic);
        }
    })
    .addAnswer(getText('derivacion_generica'))
    .addAnswer(getText('pregunta_algo_mas'), { delay: 1000, capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        if (ctx.body && typeof ctx.body === 'string' && ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }
        return fallBack(getText('fallback_generico'));
    });

const flowPideNombre = addKeyword('__PIDE_NOMBRE__')
    .addAnswer(getText('pago_pedir_nombre'), { capture: true }, async (ctx, { state, gotoFlow }) => {
        const myState = state.getMyState();
        await state.update({ customerInfo: `DNI/CUIT: ${myState.dni}, Nombre y Apellido: ${ctx.body}`, mediaFiles: [] });
        return gotoFlow(flowCargaArchivo);
    });

const flowInformarPago = addKeyword(['_informar_pago_'])
    .addAnswer(getText('pago_pedir_dni_cuit'), { capture: true }, async (ctx, { state, gotoFlow, fallBack }) => {
        const dni = ctx.body.replace(/\D/g, '');
        if (!/^(\d{7,8}|\d{11})$/.test(dni)) {
            return fallBack(getText('pago_error_dni_cuit'));
        }
        await state.update({ dni: dni });
        return gotoFlow(flowPideNombre);
    });

const flowCargaArchivo = addKeyword(['_carga_archivo_'])
    .addAnswer(getText('pago_pedir_comprobante'), { capture: true }, async (ctx, { provider, state, endFlow, fallBack }) => {
        const { customerInfo, mediaFiles } = state.getMyState();
        const messageBody = (ctx.body && typeof ctx.body === 'string') ? ctx.body.toUpperCase().trim() : '';

        if (messageBody === 'LISTO') {
            const remoteJid = ctx.from;
            const pushName = ctx.pushName || 'Usuario Desconocido';
            const adminTextMessage = `📄 [NUEVO PAGO REPORTADO]\n\nDe: ${pushName} (${remoteJid})\n\nDatos del cliente: ${customerInfo}`;
            await provider.vendor.sendMessage(NUMERO_TEST, { text: adminTextMessage });

            for (const file of mediaFiles) {
                const buffer = Buffer.from(file.base64, 'base64');
                await provider.vendor.sendMessage(NUMERO_TEST, {
                    [file.type]: buffer,
                    mimetype: file.mimeType,
                    fileName: file.fileName,
                    caption: file.caption
                });
            }
            return endFlow(getText('pago_confirmacion_final'));
        }

        const isMedia = ctx.message?.imageMessage || ctx.message?.documentMessage || ctx.message?.videoMessage;
        if (isMedia) {
            const remoteJid = ctx.from;
            const pushName = ctx.pushName || 'Usuario Desconocido';
            const buffer = await downloadMediaMessage(ctx, 'buffer', {}, provider.vendor);
            const base64 = buffer.toString('base64');
            const mediaMessage = ctx.message.imageMessage || ctx.message.documentMessage || ctx.message.videoMessage;
            const mimeType = mediaMessage.mimetype;
            const fileName = mediaMessage.fileName || 'recibo';
            let fileType;
            if (mimeType.includes('image')) fileType = 'image';
            else if (mimeType.includes('pdf')) fileType = 'document';
            else if (mimeType.includes('video')) fileType = 'video';

            const newFile = { base64, mimeType, fileName, caption: `[RECIBO DE PAGO] De ${pushName} (${remoteJid})`, type: fileType };
            const updatedMediaFiles = [...(mediaFiles || []), newFile];
            await state.update({ mediaFiles: updatedMediaFiles });
            return fallBack(getText('pago_archivo_recibido'));
        }

        return fallBack(getText('pago_error_archivo'));
    });

const flowMediosPagoFontana = addKeyword('__MEDIOS_PAGO_FONTANA__')
    .addAnswer(getText('medios_pago_fontana'))
    .addAnswer(getText('pregunta_algo_mas'), { delay: 1000, capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        if (ctx.body && typeof ctx.body === 'string' && ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }
        return fallBack(getText('fallback_generico'));
    });

const flowMediosPagoIbarreta = addKeyword('__MEDIOS_PAGO_IBARRETA__')
    .addAnswer(getText('medios_pago_ibarreta'))
    .addAnswer(getText('pregunta_algo_mas'), { delay: 1000, capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        if (ctx.body && typeof ctx.body === 'string' && ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }
        return fallBack(getText('fallback_generico'));
    });

const flowConsultarPrecios_Part2 = addKeyword('__CONSULTAR_PRECIOS_PART2__')
    .addAnswer(getText('pregunta_algo_mas'), { capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        if (ctx.body && typeof ctx.body === 'string' && ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }
        return fallBack(getText('fallback_generico'));
    });

const flowConsultarPrecios = addKeyword(['consultar_precios', 'precios', 'planes', 'costo'])
    .addAnswer(getText('precios_intro'), null, async (ctx, { flowDynamic, state, gotoFlow }) => {
        try {
            const myState = state.getMyState();
            const zonaSeleccionada = myState.zona;
            const lowerCaseZona = zonaSeleccionada.toLowerCase();
            const todosLosPlanes = await getPreciosFromGoogleSheet();

            if (todosLosPlanes.length === 0) {
                await flowDynamic(getText('precios_error_fetch'));
                return gotoFlow(flowEnd);
            }

            const planesFiltrados = todosLosPlanes.filter(plan =>
                plan.rowNumber <= 56 &&
                ((plan.zona && plan.zona.toLowerCase() === lowerCaseZona) || !plan.zona)
            );

            if (planesFiltrados.length === 0) {
                await flowDynamic(getText('precios_no_encontrados', { zonaSeleccionada }));
                return gotoFlow(flowEnd);
            }

            const planesDeZona = planesFiltrados.filter(p => p.zona);
            const planesGenerales = planesFiltrados.filter(p => !p.zona);
            let mensajeFinal = '';

            if (planesDeZona.length > 0) {
                mensajeFinal += getText('precios_titulo_zona', { zonaSeleccionada: zonaSeleccionada.toUpperCase() }) + '\n';
                planesDeZona.forEach(plan => {
                    mensajeFinal += `• ${plan.tipoDeServicio}: *${plan.precio}*\n`;
                });
            }
            if (planesGenerales.length > 0) {
                mensajeFinal += `\n` + getText('precios_titulo_adicionales') + `\n`;
                planesGenerales.forEach(plan => {
                    mensajeFinal += `• ${plan.tipoDeServicio}: *${plan.precio}*\n`;
                });
            }
            await flowDynamic(mensajeFinal.trim());
            await flowDynamic(getText('precios_disclaimer'));
            await flowDynamic(getText('precios_link_contratar'));
        } catch (error) {
            console.error('Error en el flujo de precios:', error);
            await flowDynamic(getText('precios_error_fetch'));
        }
        return gotoFlow(flowConsultarPrecios_Part2);
    });

const flowOtrasConsultas = addKeyword(['otras_consultas'])
    .addAction(async (ctx, { flowDynamic }) => {
        if (!isWithinBusinessHours()) {
            await sendOutOfHoursMessage(flowDynamic);
        }
    })
    .addAnswer(getText('derivacion_generica'))
    .addAnswer(getText('pregunta_algo_mas'), { delay: 1000, capture: true, idle: 120000, handleIdle: async (ctx, { flowDynamic, gotoFlow }) => {
        await flowDynamic(getText('aviso_inactividad'));
        return gotoFlow(flowPrincipal);
    }}, async (ctx, { gotoFlow, fallBack }) => {
        if (ctx.body && typeof ctx.body === 'string' && ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }
        return fallBack(getText('fallback_generico'));
    });

const flowServicioTecnico = addKeyword(['tecnico', 'problema', 'no tengo internet', 'soporte'])
    .addAnswer(getText('tecnico_aviso_pasos'))
    .addAnswer(getText('tecnico_lista_pasos'), { delay: 1000 })
    .addAnswer(getText('tecnico_pregunta_pasos'), { capture: true }, async (ctx, { gotoFlow, fallBack, flowDynamic }) => {
        if (ctx.body && typeof ctx.body === 'string' && ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }
        if (ctx.body && typeof ctx.body === 'string' && (ctx.body.toLowerCase().includes('si') || ctx.body.toLowerCase().includes('sí'))) {
            if (isWithinBusinessHours()) {
                await flowDynamic(getText('tecnico_derivacion_fontana'));
            } else {
                await sendOutOfHoursMessage(flowDynamic);
            }
            return gotoFlow(flowEnd);
        } else if (ctx.body && typeof ctx.body === 'string' && ctx.body.toLowerCase().includes('no')) {
            return fallBack(getText('tecnico_error_no_pasos'));
        } else {
            return fallBack(getText('tecnico_fallback_si_no'));
        }
    });

const flowAtencionAdministrativaFontana = addKeyword(['atencion_administrativa_fontana'])
    .addAnswer(getText('menu_admin_fontana_pregunta'), { delay: 500 })
    .addAnswer(getText('menu_admin_opciones'), { capture: true }, async (ctx, { gotoFlow, fallBack, state }) => {
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
            return gotoFlow(flowServicioTecnico);
        }
        return fallBack(getText('fallback_menu_admin'));
    });

const flowServicioTecnicoIbarreta = addKeyword('__SERVICIO_TECNICO_IBARRETA__')
    .addAnswer(getText('tecnico_aviso_pasos'))
    .addAnswer(getText('tecnico_lista_pasos').replace('Reinicia', 'Reiniciá').replace('Verifica', 'Verificá'))
    .addAnswer(getText('tecnico_pregunta_pasos'), { capture: true }, async (ctx, { gotoFlow, fallBack, flowDynamic }) => {
        if (ctx.body && typeof ctx.body === 'string' && ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }
        if (ctx.body && typeof ctx.body === 'string' && (ctx.body.toLowerCase().includes('si') || ctx.body.toLowerCase().includes('sí'))) {
            if (isWithinBusinessHours()) {
                await flowDynamic(getText('tecnico_derivacion_ibarreta'));
            } else {
                await sendOutOfHoursMessage(flowDynamic);
            }
            return gotoFlow(flowEnd);
        } else if (ctx.body && typeof ctx.body === 'string' && ctx.body.toLowerCase().includes('no')) {
            return fallBack(getText('tecnico_error_no_pasos'));
        } else {
            return fallBack(getText('tecnico_fallback_si_no'));
        }
    });

const flowAtencionAdministrativaIbarreta = addKeyword(['atencion_administrativa_ibarreta'])
    .addAnswer(getText('menu_admin_ibarreta_pregunta'), { delay: 500 })
    .addAnswer(getText('menu_admin_opciones'), { capture: true }, async (ctx, { gotoFlow, fallBack, state }) => {
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
        return fallBack(getText('fallback_menu_admin'));
    });

const flowOtraZona = addKeyword(['otra_zona'])
    .addAnswer(getText('otra_zona_info'))
    .addAnswer(getText('otra_zona_contacto'))
    .addAnswer(getText('pregunta_algo_mas'), { delay: 1000, capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        if (ctx.body && typeof ctx.body === 'string' && ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }
        return fallBack(getText('fallback_generico'));
    });

const flowEnd = addKeyword('__FLOW_END__')
    .addAnswer(getText('pregunta_algo_mas'), { capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        if (ctx.body && typeof ctx.body === 'string' && ctx.body.toUpperCase().includes('MENU')) {
            return gotoFlow(flowPrincipal);
        }
        return fallBack(getText('fallback_generico'));
    });

const flowPrincipal = addKeyword(['hola', 'ole', 'alo', 'buenos dias', 'buenas tardes', 'buenas noches', 'menu', EVENTS.WELCOME])
    .addAction(async (ctx) => {
        const userPhone = ctx.from;
        const dateTime = new Date().toLocaleString('es-ES', { timeZone: 'America/Argentina/Buenos_Aires' });
        console.log(`[NUEVA INTERACCIÓN] De: ${userPhone} a las ${dateTime}`);
    })
    .addAnswer(getText('saludo_inicial'), { delay: 500 })
    .addAnswer(getText('menu_principal_pregunta'), { delay: 500 })
    .addAnswer(getText('menu_principal_opciones'), { capture: true }, async (ctx, { gotoFlow, fallBack }) => {
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
        return fallBack(getText('fallback_menu_principal'));
    })
    .addAnswer(getText('error_solicitud_generico'), { delay: 1500 });

// --- Función Principal ---
const main = async () => {
    const adapterDB = new MockAdapter();
    const adapterFlow = createFlow([
        flowCargaArchivo,
        flowLlamarPersona,
        flowConsultarPrecios,
        flowConsultarPrecios_Part2,
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