// app.js

// Global Error Handlers to prevent container crashes
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

import { createBot, createProvider, createFlow, addKeyword, EVENTS } from '@bot-whatsapp/bot'
import BaileysProvider from '@bot-whatsapp/provider/baileys'
import MockAdapter from '@bot-whatsapp/database/mock'
import { downloadMediaMessage } from '@whiskeysockets/baileys'
import { GoogleSpreadsheet } from 'google-spreadsheet'
import { JWT } from 'google-auth-library'
import { Storage } from '@google-cloud/storage'
import fs from 'fs'
import http from 'http'
import qrcode from 'qrcode'
import path, { dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// --- Environment Variables ---
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_TITLE = process.env.SHEET_TITLE;
const NUMERO_TEST = process.env.NUMERO_TEST;
const NUMERO_ADMIN_FONTANA = process.env.NUMERO_ADMIN_FONTANA;
const NUMERO_ADMIN_IBARRETA = process.env.NUMERO_ADMIN_IBARRETA;

// --- Flows Definition ---

const flowLlamarPersona = addKeyword(['llamar_persona', 'llamar', 'contacto', 'agente', 'hablar con alguien', 'otras consultas'])
    .addAnswer(['Perfecto! Lo derivamos con una persona de atención para resolver sus dudas.','\nPor favor haga clic en el siguiente link:\n📞 https://bit.ly/4l1iOvh'])
    .addAnswer('¿Hay algo más en lo que pueda ayudarte?\nEscribe *MENU* para volver al inicio.', { delay: 1000 }, (ctx, { gotoFlow }) => {
        if (ctx.body.toUpperCase().includes('MENU')) return gotoFlow(flowPrincipal);
    });


const flowInformarPago = addKeyword(['_informar_pago_'])
    .addAnswer(
        'Por favor, ingresa tu DNI/CUIT y tu Nombre y Apellido.',
        { capture: true },
        async (ctx, { state, gotoFlow }) => {
            await state.update({ customerInfo: ctx.body, mediaFiles: [] });
            return gotoFlow(flowCargaArchivo);
        }
    );

const flowCargaArchivo = addKeyword(['_carga_archivo_'])
    .addAnswer(
        'Gracias. Ahora, por favor, carga el archivo con el recibo de pago realizado y escribe *LISTO* cuando ya culmines de enviar el archivo.',
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

                const newFile = {
                    base64, mimeType, fileName,
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
        (ctx, { flowDynamic }) => { flowDynamic('Recuerda incluir tu número de cliente en la referencia.'); }
    )
    .addAnswer('¿Hay algo más en lo que pueda ayudarte?\nEscribe *MENU* para volver al inicio.', { delay: 1000 }, (ctx, { gotoFlow }) => {
        if (ctx.body.toUpperCase().includes('MENU')) return gotoFlow(flowPrincipal);
    });

const flowConsultarPrecios = addKeyword(['consultar_precios', 'precios', 'planes', 'costo'])
    .addAnswer('¡Claro! Aquí están nuestros planes y precios más recientes:', null, async (ctx, { flowDynamic, state }) => {
        try {
            const myState = state.getMyState();
            const zonaSeleccionada = myState?.zona;

            if (!zonaSeleccionada) {
              await flowDynamic('Primero debes elegir una zona (Fontana o Ibarreta). Escribe *MENU* para volver al inicio.');
              return;
            }

            const planes = await getPreciosFromGoogleSheet();
            if (planes.length === 0) {
                await flowDynamic('Lo siento, no pude obtener la información de los planes en este momento. Por favor, intenta de nuevo más tarde.');
                return;
            }

            const planesFiltrados = planes.filter(plan => plan.zona && plan.zona.toLowerCase() === zonaSeleccionada.toLowerCase());
            if (planesFiltrados.length === 0) {
                 await flowDynamic(`Lo siento, no encontré planes para la zona de ${zonaSeleccionada}.`);
                 return;
            }

            let mensajeFinal = `*Planes para ${zonaSeleccionada.toUpperCase()}*\n\n`;
            planesFiltrados.forEach(plan => {
                mensajeFinal += `  - Tipo de servicio: ${plan.tipoDeServicio}\n    Precio: ${plan.precio}\n`;
            });

            await flowDynamic(mensajeFinal.trim());
        } catch (error) {
            console.error('Error en el flujo de precios:', error);
            await flowDynamic('Ocurrió un error al procesar tu solicitud. Por favor, intenta de nuevo más tarde.');
        }
    })
    .addAnswer('Si deseas contratar alguno de estos planes o tienes otras dudas, contáctanos directamente.', { delay: 1000 })
    .addAnswer('¿Hay algo más en lo que pueda ayudarte?\nEscribe *MENU* para volver al inicio.', { delay: 1000 }, (ctx, { gotoFlow }) => {
        if (ctx.body.toUpperCase().includes('MENU')) return gotoFlow(flowPrincipal);
    });

const flowOtrasConsultas = addKeyword(['otras_consultas'])
    .addAnswer('Perfecto! Lo derivamos con una persona de atención para resolver sus dudas.', null, (ctx, { flowDynamic }) => {
        flowDynamic('Por favor haga clic en el siguiente link: 📞 https://bit.ly/4l1iOvh');
    })
    .addAnswer('¿Hay algo más en lo que pueda ayudarte?\nEscribe *MENU* para volver al inicio.', { delay: 1000 }, (ctx, { gotoFlow }) => {
        if (ctx.body.toUpperCase().includes('MENU')) return gotoFlow(flowPrincipal);
    });

const flowServicioTecnico = addKeyword(['tecnico', 'problema', 'no tengo internet', 'soporte'])
    .addAnswer('¡Importante! Antes de continuar, por favor, realiza estos pasos:')
    .addAnswer('• Reinicia tu router o equipo.\n• Verifica los cables y la alimentación eléctrica.\n• Confirma que realizaste estos pasos.', { delay: 1000 })
    .addAnswer('¿Ya realizaste estos pasos? (Sí/No)', { capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        if (ctx.body.toUpperCase().includes('SI')) return gotoFlow(flowLlamarPersona);
        return fallBack('Es fundamental que realices estos pasos para poder diagnosticar tu problema. Escribe *MENU* para volver al inicio.');
    });

const flowAtencionAdministrativaFontana = addKeyword(['atencion_administrativa_fontana'])
    .addAnswer('¿En qué puedo ayudarte con Atención Administrativa en Fontana?', { delay: 500 })
    .addAnswer('1️⃣ Informar un Pago\n2️⃣ Conocer Medios de Pago\n3️⃣ Consultar Precios de los Servicios\n4️⃣ Otras Consultas', { capture: true }, async (ctx, { gotoFlow, state }) => {
        if (ctx.body.includes('1')) { await state.update({ adminNumber: NUMERO_ADMIN_FONTANA }); return gotoFlow(flowInformarPago); }
        if (ctx.body.includes('2')) return gotoFlow(flowMediosPago);
        if (ctx.body.includes('3')) { await state.update({ zona: 'Fontana' }); return gotoFlow(flowConsultarPrecios); }
        if (ctx.body.includes('4')) return gotoFlow(flowOtrasConsultas);
    });

const flowAtencionAdministrativaIbarreta = addKeyword(['atencion_administrativa_ibarreta'])
    .addAnswer('¿En qué puedo ayudarte con Atención Administrativa en Ibarreta?', { delay: 500 })
    .addAnswer('1️⃣ Informar un Pago\n2️⃣ Conocer Medios de Pago\n3️⃣ Consultar Precios de los Servicios\n4️⃣ Otras Consultas', { capture: true }, async (ctx, { gotoFlow, state }) => {
        if (ctx.body.includes('1')) { await state.update({ adminNumber: NUMERO_ADMIN_IBARRETA }); return gotoFlow(flowInformarPago); }
        if (ctx.body.includes('2')) return gotoFlow(flowMediosPago);
        if (ctx.body.includes('3')) { await state.update({ zona: 'Ibarreta' }); return gotoFlow(flowConsultarPrecios); }
        if (ctx.body.includes('4')) return gotoFlow(flowOtrasConsultas);
    });

const flowOtraZona = addKeyword(['otra_zona'])
    .addAnswer('Actualmente, nuestros servicios de internet se concentran en Fontana e Ibarreta.')
    .addAnswer('Por favor, contáctanos directamente si deseas consultar la disponibilidad en otra zona: *[Número de Contacto para Otras Zonas]*')
    .addAnswer('¿Hay algo más en lo que pueda ayudarte?\nEscribe *MENU* para volver al inicio.', { delay: 1000 }, (ctx, { gotoFlow }) => {
        if (ctx.body.toUpperCase().includes('MENU')) return gotoFlow(flowPrincipal);
    });

const flowPrincipal = addKeyword(['hola', 'ole', 'alo', 'buenos dias', 'buenas tardes', 'buenas noches', 'menu', EVENTS.WELCOME])
    .addAction(async (ctx) => {
        const userPhone = ctx.from;
        const dateTime = new Date().toLocaleString('es-ES', { timeZone: 'America/Argentina/Buenos_Aires' });
        console.log(`[NUEVA INTERACCIÓN] De: ${userPhone} a las ${dateTime}`);
    })
    .addAnswer('¡Hola! Soy el ChatBot Vanguard. ¿En qué zona necesitas ayuda con tu servicio de internet?', { delay: 500 })
    .addAnswer('Por favor, elige una opción:', { delay: 500 })
    .addAnswer('1️⃣ Servicio de Internet en Fontana\n2️⃣ Servicio de Internet en Ibarreta\n3️⃣ Otra Zona', { capture: true }, (ctx, { gotoFlow }) => {
        if (ctx.body.includes('1')) return gotoFlow(flowAtencionAdministrativaFontana);
        if (ctx.body.includes('2')) return gotoFlow(flowAtencionAdministrativaIbarreta);
        if (ctx.body.includes('3')) return gotoFlow(flowOtraZona);
    });

// --- Helper Functions ---

const getPreciosFromGoogleSheet = async () => {
    try {
        const creds_path = path.join(__dirname, 'creds.json');
        const creds_data = fs.existsSync(creds_path) ? fs.readFileSync(creds_path, 'utf8') : process.env.CREDS_JSON;
        if (!creds_data) throw new Error('creds.json not found');
        const creds = JSON.parse(creds_data);

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
        return rows.map(row => ({
            tipoDeServicio: row.get('Tipo de Servicio'),
            zona: row.get('Zona'),
            precio: row.get('Precio')
        }));
    } catch (error) {
        console.error('Error al leer la hoja de cálculo:', error);
        return [];
    }
};

// --- Main Execution ---

const main = async () => {
    // -- GCS & Session Setup --
    const GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME;
    const SESSION_FILE_NAME = 'baileys_store.json';
    const TMP_DIR = '/tmp';
    const LOCAL_SESSION_PATH = path.join(TMP_DIR, SESSION_FILE_NAME);

    const storage = new Storage();
    const bucket = storage.bucket(GCS_BUCKET_NAME);

    let qrCodeDataUrl = null;
    let botStatus = 'Initializing...';

    const uploadSession = async () => {
        try {
            const files = fs.readdirSync(TMP_DIR).filter(f => /baileys|auth|session/i.test(f));
            for (const f of files) {
                const localPath = path.join(TMP_DIR, f);
                if (fs.existsSync(localPath)) {
                    await bucket.upload(localPath, { destination: f });
                    console.log(`[GCS] Uploaded session file: ${f}`);
                }
            }
        } catch (err) { console.error('[GCS] Error uploading session files:', err); }
    };

    const debouncedUpload = (() => {
        let timeout;
        return () => { clearTimeout(timeout); timeout = setTimeout(uploadSession, 2000); };
    })();

    try {
        console.log('[GCS] Checking for session files...');
        const [files] = await bucket.getFiles({ prefix: 'baileys_store' });
        if (files.length > 0) {
            console.log('[GCS] Session file found, downloading...');
            await files[0].download({ destination: LOCAL_SESSION_PATH });
            console.log('[GCS] Session downloaded.');
        } else {
            console.log('[GCS] No session file found.');
        }
    } catch (err) { console.error('[GCS] Error downloading session:', err); }

    let watcherStarted = false;
    const startTmpWatcher = () => {
      if (watcherStarted) return;
      try {
        fs.watch(TMP_DIR, (eventType, filename) => {
          if (!filename) return;
          if ((eventType === 'change' || eventType === 'rename') && /baileys|auth|session/i.test(filename)) {
            console.log(`[GCS] Session file ${filename} ${eventType} -> scheduling upload`);
            debouncedUpload();
          }
        });
        watcherStarted = true;
        console.log('[FS] Watcher on /tmp started.');
      } catch (err) {
        console.error('[FS] Error starting /tmp watcher:', err);
      }
    };

    // -- Bot Creation --
    const adapterDB = new MockAdapter();
    const adapterFlow = createFlow([
        flowLlamarPersona, flowConsultarPrecios, flowMediosPago, flowInformarPago,
        flowCargaArchivo, flowServicioTecnico, flowAtencionAdministrativaFontana,
        flowAtencionAdministrativaIbarreta, flowOtrasConsultas, flowOtraZona, flowPrincipal
    ]);
    const adapterProvider = createProvider(BaileysProvider, {
        store: { path: TMP_DIR }
    });

    createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    });

    startTmpWatcher();

    // -- Event Listeners & Web Server --
    adapterProvider.on('qr', (qr) => {
        botStatus = 'QR Generated. Please scan.';
        console.log(`[QR] ${botStatus}`);
        qrcode.toDataURL(qr, (err, url) => {
            if (!err) qrCodeDataUrl = url;
        });
    });

    adapterProvider.on('ready', () => {
        botStatus = 'Bot is ready and connected!';
        qrCodeDataUrl = null;
        console.log(`[STATUS] ${botStatus}`);
    });

    adapterProvider.on('auth_failure', (error) => {
        botStatus = `Authentication Failure: ${error}`;
        console.log(`[STATUS] ${botStatus}`);
    });

    const port = process.env.PORT || 8080;
    http.createServer((req, res) => {
        if (req.url === '/healthz') {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            return res.end('ok');
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        if (qrCodeDataUrl) {
            res.end(`<div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;"><h1>Scan QR Code</h1><img src="${qrCodeDataUrl}" alt="QR Code"></div>`);
        } else {
            res.end(`<h1>Bot Status</h1><p>${botStatus}</p>`);
        }
    }).listen(port, () => {
        console.log(`[SERVER] Web server listening on port ${port}`);
    });

    process.on('SIGTERM', async () => {
        console.log('[SYSTEM] SIGTERM received. Uploading final session...');
        await uploadSession();
        process.exit(0);
    });
};

main();