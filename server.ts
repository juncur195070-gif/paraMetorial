import { metorial, z } from '@metorial/mcp-server-sdk';

/**
 * MCP Server Doctoc-Carla — Asistente IA para plataforma medica Doctoc
 * Integra: Doctoc API (citas, pacientes, org) + Unipile/Telegram (mensajeria)
 */

interface Config {
  DOCTOC_API_TOKEN: string;
  DOCTOC_ORG_ID: string;
  DOCTOC_API_URL: string;
  UNIPILE_DSN: string;
  UNIPILE_API_KEY: string;
}

metorial.createServer<Config>(
  {
    name: 'mcp-doctoc-carla',
    version: '1.0.0',
  },
  async (server, config) => {
    // ── Defaults ──
    const DOCTOC_BASE =
      config?.DOCTOC_API_URL ||
      'https://us-central1-doctoc-platform.cloudfunctions.net';
    const DOCTOC_TOKEN = config?.DOCTOC_API_TOKEN || '';
    const DOCTOC_ORG = config?.DOCTOC_ORG_ID || '';
    const UNIPILE_DSN = config?.UNIPILE_DSN || '';
    const UNIPILE_KEY = config?.UNIPILE_API_KEY || '';

    // ── Helpers ──────────────────────────────────────────────────────────────

    async function doctocRequest(endpoint: string, body: Record<string, any> = {}): Promise<any> {
      const url = `${DOCTOC_BASE}/${endpoint}`;
      const payload = { ...body, orgID: DOCTOC_ORG };
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${DOCTOC_TOKEN}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Doctoc ${endpoint} (${res.status}): ${txt}`);
      }
      return res.json();
    }

    async function unipileGet(path: string, params?: Record<string, string>): Promise<any> {
      let url = `${UNIPILE_DSN}/api/v1${path}`;
      if (params) {
        const qs = new URLSearchParams(params).toString();
        url += `?${qs}`;
      }
      const res = await fetch(url, {
        headers: { 'X-API-KEY': UNIPILE_KEY, Accept: 'application/json' },
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Unipile GET ${path} (${res.status}): ${txt}`);
      }
      return res.json();
    }

    async function unipilePostMessage(chatId: string, text: string): Promise<any> {
      const url = `${UNIPILE_DSN}/api/v1/chats/${chatId}/messages`;
      const form = new FormData();
      form.append('text', text);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'X-API-KEY': UNIPILE_KEY },
        body: form,
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Unipile POST message (${res.status}): ${txt}`);
      }
      return res.json();
    }

    function ok(data: any) {
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    }

    function err(msg: string) {
      return { content: [{ type: 'text' as const, text: `Error: ${msg}` }], isError: true };
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TOOL 1 — Ping (verificacion basica)
    // ═════════════════════════════════════════════════════════════════════════

    server.registerTool(
      'ping',
      {
        title: 'Ping',
        description: 'Verifica que el servidor MCP esta activo y responde correctamente',
        inputSchema: {},
      },
      async () => ok({ status: 'ok', server: 'mcp-doctoc-carla', tools: 30, timestamp: new Date().toISOString() }),
    );

    // ═════════════════════════════════════════════════════════════════════════
    // ORGANIZACION — 4 tools
    // ═════════════════════════════════════════════════════════════════════════

    server.registerTool(
      'get_org_basic_info',
      {
        title: 'Informacion de la organizacion',
        description: 'Obtiene informacion basica de la clinica (nombre, direccion, contacto)',
        inputSchema: {},
      },
      async () => {
        try {
          const data = await doctocRequest('getOrganizationInfoAPI', { sections: ['basic'] });
          return ok(data);
        } catch (e: any) {
          return err(e.message);
        }
      },
    );

    server.registerTool(
      'get_org_locations',
      {
        title: 'Sedes de la organizacion',
        description: 'Lista las sedes/sucursales de la clinica',
        inputSchema: {},
      },
      async () => {
        try {
          const data = await doctocRequest('getOrganizationInfoAPI', { sections: ['sedes'] });
          return ok(data);
        } catch (e: any) {
          return err(e.message);
        }
      },
    );

    server.registerTool(
      'get_org_specialties',
      {
        title: 'Especialidades de la organizacion',
        description: 'Lista las especialidades medicas disponibles en la clinica',
        inputSchema: {},
      },
      async () => {
        try {
          const data = await doctocRequest('getOrganizationInfoAPI', { sections: ['specialties'] });
          return ok(data);
        } catch (e: any) {
          return err(e.message);
        }
      },
    );

    server.registerTool(
      'get_org_users',
      {
        title: 'Usuarios de la organizacion',
        description: 'Lista los medicos y personal de la clinica',
        inputSchema: {},
      },
      async () => {
        try {
          const data = await doctocRequest('getOrganizationInfoAPI', { sections: ['users'] });
          return ok(data);
        } catch (e: any) {
          return err(e.message);
        }
      },
    );

    // ═════════════════════════════════════════════════════════════════════════
    // USUARIOS / MEDICOS — 4 tools
    // ═════════════════════════════════════════════════════════════════════════

    server.registerTool(
      'get_user_info',
      {
        title: 'Info del medico',
        description: 'Obtiene informacion basica y profesional de un medico por su uid',
        inputSchema: {
          uid: z.string().describe('UID del medico/usuario'),
        },
      },
      async ({ uid }) => {
        try {
          const data = await doctocRequest('getUserInfoAPI', { uid, sections: ['basic', 'professional'] });
          return ok(data);
        } catch (e: any) {
          return err(e.message);
        }
      },
    );

    server.registerTool(
      'get_user_calendar',
      {
        title: 'Calendario del medico',
        description: 'Obtiene la configuracion del calendario de un medico (horarios, disponibilidad)',
        inputSchema: {
          uid: z.string().describe('UID del medico'),
        },
      },
      async ({ uid }) => {
        try {
          const data = await doctocRequest('getUserInfoAPI', { uid, sections: ['calendarInfo'] });
          return ok(data);
        } catch (e: any) {
          return err(e.message);
        }
      },
    );

    server.registerTool(
      'get_appointment_types',
      {
        title: 'Tipos de cita',
        description: 'Lista todos los tipos de cita disponibles en la organizacion',
        inputSchema: {},
      },
      async () => {
        try {
          const data = await doctocRequest('getUserInfoAPI', { sections: ['tipos'] });
          return ok(data);
        } catch (e: any) {
          return err(e.message);
        }
      },
    );

    server.registerTool(
      'update_user_calendar',
      {
        title: 'Actualizar calendario',
        description: 'Actualiza la configuracion del calendario de un medico',
        inputSchema: {
          uid: z.string().describe('UID del medico'),
          calendarData: z.record(z.any()).describe('Datos del calendario a actualizar'),
        },
      },
      async ({ uid, calendarData }) => {
        try {
          const data = await doctocRequest('getUserInfoAPI', { uid, action: 'update', calendarData });
          return ok(data);
        } catch (e: any) {
          return err(e.message);
        }
      },
    );

    // ═════════════════════════════════════════════════════════════════════════
    // PACIENTES — 5 tools
    // ═════════════════════════════════════════════════════════════════════════

    server.registerTool(
      'get_all_patients',
      {
        title: 'Listar pacientes',
        description: 'Lista todos los pacientes de la organizacion (paginado)',
        inputSchema: {
          limit: z.number().optional().describe('Cantidad maxima de resultados (default 50)'),
          startAfter: z.string().optional().describe('ID del ultimo paciente para paginacion'),
        },
      },
      async ({ limit, startAfter }) => {
        try {
          const body: any = { action: 'getAll', limit: limit ?? 50 };
          if (startAfter) body.startAfter = startAfter;
          const data = await doctocRequest('managePatientsAPI', body);
          return ok(data);
        } catch (e: any) {
          return err(e.message);
        }
      },
    );

    server.registerTool(
      'search_patients',
      {
        title: 'Buscar pacientes',
        description: 'Busca pacientes por nombre, DNI, telefono, ID u otro identificador',
        inputSchema: {
          type: z.enum(['nombre', 'dni', 'telefono', 'id', 'pasaporte', 'cedula_identidad', 'carnet_extranjeria']).describe('Tipo de busqueda'),
          text: z.string().describe('Texto a buscar'),
          limit: z.number().optional().describe('Cantidad maxima de resultados'),
        },
      },
      async ({ type, text, limit }) => {
        try {
          const body: any = { action: 'search', type, text };
          if (limit) body.limit = limit;
          const data = await doctocRequest('managePatientsAPI', body);
          return ok(data);
        } catch (e: any) {
          return err(e.message);
        }
      },
    );

    server.registerTool(
      'create_patient',
      {
        title: 'Crear paciente',
        description: 'Registra un nuevo paciente en el sistema',
        inputSchema: {
          names: z.string().describe('Nombres del paciente'),
          surnames: z.string().describe('Apellidos del paciente'),
          dni: z.string().describe('DNI o documento de identidad'),
          birth_date: z.string().describe('Fecha de nacimiento (YYYY-MM-DD)'),
          gender: z.string().describe('Genero: masculino o femenino'),
          phone: z.string().optional().describe('Telefono del paciente'),
          mail: z.string().optional().describe('Email del paciente'),
        },
      },
      async (args) => {
        try {
          const data = await doctocRequest('managePatientsAPI', { action: 'create', ...args });
          return ok(data);
        } catch (e: any) {
          return err(e.message);
        }
      },
    );

    server.registerTool(
      'update_patient',
      {
        title: 'Actualizar paciente',
        description: 'Actualiza datos de un paciente existente',
        inputSchema: {
          patient_id: z.string().describe('ID del paciente'),
          names: z.string().optional().describe('Nombres'),
          surnames: z.string().optional().describe('Apellidos'),
          phone: z.string().optional().describe('Telefono'),
          mail: z.string().optional().describe('Email'),
          birth_date: z.string().optional().describe('Fecha de nacimiento (YYYY-MM-DD)'),
          gender: z.string().optional().describe('Genero'),
        },
      },
      async ({ patient_id, ...fields }) => {
        try {
          const data = await doctocRequest('managePatientsAPI', { action: 'update', patient_id, ...fields });
          return ok(data);
        } catch (e: any) {
          return err(e.message);
        }
      },
    );

    server.registerTool(
      'delete_patient',
      {
        title: 'Eliminar paciente',
        description: 'Elimina un paciente del sistema (irreversible)',
        inputSchema: {
          patient_id: z.string().describe('ID del paciente a eliminar'),
        },
      },
      async ({ patient_id }) => {
        try {
          const data = await doctocRequest('managePatientsAPI', { action: 'delete', patient_id });
          return ok(data);
        } catch (e: any) {
          return err(e.message);
        }
      },
    );

    // ═════════════════════════════════════════════════════════════════════════
    // CITAS MEDICAS — 8 tools
    // ═════════════════════════════════════════════════════════════════════════

    server.registerTool(
      'create_appointment',
      {
        title: 'Crear cita',
        description: 'Crea una nueva cita medica en el sistema',
        inputSchema: {
          dayKey: z.string().describe('Dia de la cita en formato DD-MM-YYYY'),
          scheduledStart: z.string().describe('Hora de inicio ISO 8601 (ej: 2025-02-10T09:00:00)'),
          scheduledEnd: z.string().describe('Hora de fin ISO 8601'),
          patient: z.string().describe('ID del paciente'),
          userId: z.string().describe('UID del medico'),
          type: z.string().describe('Nombre del tipo de cita'),
          typeId: z.string().optional().describe('ID del tipo de cita'),
          motive: z.string().describe('Motivo de la consulta'),
          status: z.string().optional().describe('Estado inicial (default: pending)'),
          locationId: z.string().optional().describe('ID de la sede'),
          category: z.string().optional().describe('Categoria de la cita'),
        },
      },
      async (args) => {
        try {
          const data = await doctocRequest('manageQuotesAPI', { action: 'create', ...args });
          return ok(data);
        } catch (e: any) {
          return err(e.message);
        }
      },
    );

    server.registerTool(
      'update_appointment',
      {
        title: 'Actualizar cita',
        description: 'Modifica una cita existente (horario, estado, medico, etc.)',
        inputSchema: {
          quoteID: z.string().describe('ID de la cita'),
          dayKey: z.string().describe('Dia de la cita (DD-MM-YYYY)'),
          oldDayKey: z.string().optional().describe('Dia original si se cambia de fecha'),
          scheduledStart: z.string().optional().describe('Nueva hora inicio ISO'),
          scheduledEnd: z.string().optional().describe('Nueva hora fin ISO'),
          patient: z.string().optional().describe('ID del paciente'),
          userId: z.string().optional().describe('UID del medico'),
          type: z.string().optional().describe('Tipo de cita'),
          motive: z.string().optional().describe('Motivo'),
          status: z.string().optional().describe('Nuevo estado'),
        },
      },
      async (args) => {
        try {
          const data = await doctocRequest('manageQuotesAPI', { action: 'update', ...args });
          return ok(data);
        } catch (e: any) {
          return err(e.message);
        }
      },
    );

    server.registerTool(
      'cancel_appointment',
      {
        title: 'Cancelar cita',
        description: 'Cancela una cita medica existente',
        inputSchema: {
          quoteID: z.string().describe('ID de la cita'),
          dayKey: z.string().describe('Dia de la cita (DD-MM-YYYY)'),
          userId: z.string().describe('UID del medico'),
          cancelReason: z.string().optional().describe('Razon de la cancelacion'),
        },
      },
      async (args) => {
        try {
          const data = await doctocRequest('manageQuotesAPI', { action: 'cancel', ...args });
          return ok(data);
        } catch (e: any) {
          return err(e.message);
        }
      },
    );

    server.registerTool(
      'get_patient_appointments',
      {
        title: 'Citas del paciente',
        description: 'Obtiene todas las citas de un paciente especifico',
        inputSchema: {
          patientID: z.string().describe('ID del paciente'),
        },
      },
      async ({ patientID }) => {
        try {
          const data = await doctocRequest('getPatientQuoteAPI', { patientID });
          return ok(data);
        } catch (e: any) {
          return err(e.message);
        }
      },
    );

    server.registerTool(
      'get_day_appointments',
      {
        title: 'Citas del dia',
        description: 'Lista todas las citas de un dia especifico. Puede filtrar por medico.',
        inputSchema: {
          dayKey: z.string().describe('Dia en formato DD-MM-YYYY'),
          userId: z.string().optional().describe('UID del medico para filtrar'),
          citaID: z.string().optional().describe('ID de una cita especifica'),
        },
      },
      async ({ dayKey, userId, citaID }) => {
        try {
          const body: any = { dayKey };
          if (userId) body.userId = userId;
          if (citaID) body.citaID = citaID;
          const data = await doctocRequest('getDayQuotesAPI', body);
          return ok(data);
        } catch (e: any) {
          return err(e.message);
        }
      },
    );

    server.registerTool(
      'get_busy_slots',
      {
        title: 'Horarios ocupados',
        description: 'Obtiene los rangos horarios ocupados de un dia (util para encontrar disponibilidad)',
        inputSchema: {
          dayKey: z.string().describe('Dia en formato DD-MM-YYYY'),
          userId: z.string().optional().describe('UID del medico'),
        },
      },
      async ({ dayKey, userId }) => {
        try {
          const body: any = { dayKey, format: 'busy_ranges' };
          if (userId) body.userId = userId;
          const data = await doctocRequest('getDayQuotesAPI', body);
          return ok(data);
        } catch (e: any) {
          return err(e.message);
        }
      },
    );

    server.registerTool(
      'get_user_day_appointments',
      {
        title: 'Citas del medico en un dia',
        description: 'Obtiene todas las citas de un medico especifico en un dia determinado',
        inputSchema: {
          dayKey: z.string().describe('Dia en formato DD-MM-YYYY'),
          userId: z.string().describe('UID del medico'),
        },
      },
      async ({ dayKey, userId }) => {
        try {
          const data = await doctocRequest('getDayQuotesAPI', { dayKey, userId });
          return ok(data);
        } catch (e: any) {
          return err(e.message);
        }
      },
    );

    // ═════════════════════════════════════════════════════════════════════════
    // PRECIOS — 3 tools
    // ═════════════════════════════════════════════════════════════════════════

    server.registerTool(
      'get_prices',
      {
        title: 'Listar precios',
        description: 'Obtiene la lista de precios de servicios medicos',
        inputSchema: {
          categoriaID: z.string().optional().describe('ID de categoria para filtrar'),
        },
      },
      async ({ categoriaID }) => {
        try {
          const body: any = { action: 'prices' };
          if (categoriaID) body.categoriaID = categoriaID;
          const data = await doctocRequest('getPricesAPI', body);
          return ok(data);
        } catch (e: any) {
          // Fallback: obtener precios desde tipos de cita
          try {
            const fallback = await doctocRequest('getUserInfoAPI', { sections: ['tipos'] });
            return ok({ source: 'appointment_types_fallback', data: fallback });
          } catch (e2: any) {
            return err(e.message);
          }
        }
      },
    );

    server.registerTool(
      'get_price_categories',
      {
        title: 'Categorias de precios',
        description: 'Lista las categorias de precios disponibles',
        inputSchema: {},
      },
      async () => {
        try {
          const data = await doctocRequest('getPricesAPI', { action: 'categories' });
          return ok(data);
        } catch (e: any) {
          return err(e.message);
        }
      },
    );

    server.registerTool(
      'get_prices_and_categories',
      {
        title: 'Precios y categorias',
        description: 'Obtiene precios y categorias juntos en una sola llamada',
        inputSchema: {},
      },
      async () => {
        try {
          const data = await doctocRequest('getPricesAPI', { action: 'both' });
          return ok(data);
        } catch (e: any) {
          return err(e.message);
        }
      },
    );

    // ═════════════════════════════════════════════════════════════════════════
    // PAGOS — 3 tools
    // ═════════════════════════════════════════════════════════════════════════

    server.registerTool(
      'create_payment',
      {
        title: 'Crear pago',
        description: 'Registra un nuevo pago/cobro en el sistema',
        inputSchema: {
          patient: z.string().describe('ID del paciente'),
          motive: z.string().describe('Motivo del pago'),
          time: z.string().describe('Fecha del pago (YYYY-MM-DD)'),
          moneda: z.string().describe('Moneda (PEN, USD, etc.)'),
          campos: z.array(z.object({
            name: z.string().describe('Nombre del servicio'),
            quantity: z.number().describe('Cantidad'),
            price: z.number().describe('Precio unitario'),
            subTotal: z.number().describe('Subtotal'),
          })).describe('Detalle de items'),
          pagos: z.array(z.object({
            method: z.string().describe('Metodo de pago (efectivo, tarjeta, etc.)'),
            amount: z.number().describe('Monto pagado'),
            moneda: z.string().describe('Moneda del pago'),
          })).describe('Detalle de pagos realizados'),
          person: z.string().describe('ID del usuario que registra'),
          sedeID: z.string().optional().describe('ID de la sede'),
          status: z.string().optional().describe('Estado del pago'),
        },
      },
      async (args) => {
        try {
          const data = await doctocRequest('managePaymentAPI', args);
          return ok(data);
        } catch (e: any) {
          return err(e.message);
        }
      },
    );

    server.registerTool(
      'get_patient_payments',
      {
        title: 'Pagos del paciente',
        description: 'Lista todos los pagos de un paciente',
        inputSchema: {
          patientID: z.string().describe('ID del paciente'),
        },
      },
      async ({ patientID }) => {
        try {
          const data = await doctocRequest('getPatientPaymentsAPI', { patientID });
          return ok(data);
        } catch (e: any) {
          return err(e.message);
        }
      },
    );

    server.registerTool(
      'get_day_payments',
      {
        title: 'Pagos del dia',
        description: 'Lista todos los pagos registrados en un dia',
        inputSchema: {
          date: z.string().describe('Fecha en formato YYYY-MM-DD'),
        },
      },
      async ({ date }) => {
        try {
          const data = await doctocRequest('getDayPaymentsAPI', { date });
          return ok(data);
        } catch (e: any) {
          return err(e.message);
        }
      },
    );

    // ═════════════════════════════════════════════════════════════════════════
    // TELEGRAM (via Unipile) — 3 tools
    // ═════════════════════════════════════════════════════════════════════════

    server.registerTool(
      'list_telegram_chats',
      {
        title: 'Listar chats de Telegram',
        description: 'Lista los chats de Telegram disponibles para encontrar el chat_id correcto',
        inputSchema: {
          limit: z.number().optional().describe('Cantidad de chats (default 10)'),
          cursor: z.string().optional().describe('Cursor para paginacion'),
        },
      },
      async ({ limit, cursor }) => {
        try {
          const params: Record<string, string> = {
            account_type: 'TELEGRAM',
            limit: String(limit ?? 10),
          };
          if (cursor) params.cursor = cursor;
          const data = await unipileGet('/chats', params);
          return ok(data);
        } catch (e: any) {
          return err(e.message);
        }
      },
    );

    server.registerTool(
      'read_telegram_messages',
      {
        title: 'Leer mensajes de Telegram',
        description: 'Lee los mensajes recientes de un chat de Telegram',
        inputSchema: {
          chat_id: z.string().describe('ID del chat de Telegram'),
          limit: z.number().optional().describe('Cantidad de mensajes (default 20)'),
        },
      },
      async ({ chat_id, limit }) => {
        try {
          const params: Record<string, string> = { limit: String(limit ?? 20) };
          const data = await unipileGet(`/chats/${chat_id}/messages`, params);
          return ok(data);
        } catch (e: any) {
          return err(e.message);
        }
      },
    );

    server.registerTool(
      'send_telegram_message',
      {
        title: 'Enviar mensaje por Telegram',
        description: 'Envia un mensaje de texto a un chat de Telegram via Unipile',
        inputSchema: {
          chat_id: z.string().describe('ID del chat de Telegram'),
          text: z.string().describe('Texto del mensaje a enviar'),
        },
      },
      async ({ chat_id, text }) => {
        try {
          const data = await unipilePostMessage(chat_id, text);
          return ok(data);
        } catch (e: any) {
          return err(e.message);
        }
      },
    );

    console.error('[mcp-doctoc-carla] 30 tools registrados en Metorial.');
  },
);
