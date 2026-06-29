// Contenido de ayuda en lenguaje humano, cercano y tranquilizador.
// Pensado para alguien que NO es de informática y se pone nervioso con tantas
// opciones. Tono: claro, simple, con un puntito de humor, pero serio y útil.
//
// Regla de oro al escribir aquí: nada de tecnicismos. Frases cortas. Siempre que
// algo asuste, añadir una nota "tranqui" diciendo que no se rompe nada / se deshace.

export type HelpItem = {
  title: string;
  body: string;
  emoji?: string;
  /** Nota verde tranquilizadora (reversible / no se borra / imposible romper). */
  tranqui?: string;
};

export type PageHelp = {
  /** Saludo breve y cálido al abrir la ayuda. */
  intro: string;
  items: HelpItem[];
};

export const PAGE_HELP: Record<string, PageHelp> = {
  // ─────────────────────────── LEADS ───────────────────────────
  leads: {
    intro:
      "Esta es tu bandeja de posibles clientes. Respira, que es más fácil de lo que parece 😊. Aquí te explico cada cosa sin prisa.",
    items: [
      {
        emoji: "📥",
        title: "¿Qué es esta página?",
        body: "Aquí aterrizan solas las personas que rellenan el formulario de tu web vaciadodepisos.cat interesadas en tus servicios. Cada tarjeta es una persona que quiere algo de ti. Tu trabajo es ir atendiéndolas una a una.",
        tranqui: "No hay que hacer nada complicado. Solo mirar y decidir: ¿le llamo, lo paso a cliente o lo descarto?",
      },
      {
        emoji: "🚦",
        title: "¿Qué significan las etiquetas de color? (🔴 🟡)",
        body: "Las pone un ayudante automático que lee cada mensaje por ti. 🔴 Urgente = esta persona tiene prisa o está molesta, mejor atiéndela cuanto antes. 🟡 Prioritario = importante, pero sin agobios. Sin etiqueta = puede esperar tranquilamente.",
        tranqui: "Tú no decides esto: se calcula solo. Es solo una ayuda para saber a quién llamar primero.",
      },
      {
        emoji: "✨",
        title: "¿Qué es el texto con la estrellita (✨)?",
        body: "Es un mini-resumen que te prepara el ayudante automático, para que entiendas de un vistazo qué quiere esa persona sin tener que leerte todo el mensaje.",
      },
      {
        emoji: "🤝",
        title: "Botón «Convertir» — ¿qué hace?",
        body: "Es para cuando un interesado se convierte en cliente de verdad. Al pulsarlo pasan dos cosas buenas a la vez: se crea su ficha de cliente, y además se te prepara un presupuesto en borrador con un precio ya estimado. Tú solo lo revisas.",
        tranqui: "No se envía nada a nadie. Solo se prepara todo para que tú lo mires con calma.",
      },
      {
        emoji: "📞",
        title: "Botón «Contactado» — ¿qué hace?",
        body: "Cuando ya hayas llamado o escrito a esa persona, pulsa aquí para acordarte de que «a este ya lo he tocado». Así deja de aparecer como pendiente y no te agobian los que aún no has contactado.",
        tranqui: "No se borra nada, solo cambia de color para tu control. Y si te equivocas, se vuelve atrás.",
      },
      {
        emoji: "🗑️",
        title: "Botón «Descartar» — ¿qué hace?",
        body: "Para los que no interesan: spam, alguien que se equivocó de empresa, o un servicio que no haces. Lo apartas de la lista para quitar ruido y centrarte en lo importante.",
        tranqui: "«Descartar» NO es borrar. Queda guardado por si te arrepientes, y lo recuperas con el botón «Reactivar».",
      },
      {
        emoji: "↩️",
        title: "Botón «Reactivar» — ¿qué hace?",
        body: "¿Descartaste a alguien sin querer, o al final sí te interesa? Pulsa aquí y vuelve a tu lista de pendientes como si nada hubiera pasado.",
      },
      {
        emoji: "🏷️",
        title: "¿Qué significan «Nuevo», «Contactado», «Convertido»…?",
        body: "Es el punto en el que está cada persona. «Nuevo» = acaba de llegar, aún no has hablado. «Contactado» = ya hablaste. «Convertido» = ya es cliente tuyo. «Descartado» = lo apartaste.",
      },
      {
        emoji: "➕",
        title: "Botón «Nuevo lead» — ¿para qué sirve?",
        body: "Para apuntar a mano a alguien que te ha contactado por otro sitio: una llamada, un WhatsApp, un conocido… Pulsas «Nuevo lead», rellenas sus datos y queda en la lista igual que los que entran por la web.",
        tranqui: "Solo el nombre es obligatorio; lo demás puedes dejarlo vacío. Y al guardarlo, el ayudante lo analiza y prioriza solo, como a los demás.",
      },
      {
        emoji: "🔎",
        title: "Los filtros de arriba — ¿qué hacen?",
        body: "Sirven para ver solo lo que te interesa en cada momento. Por ejemplo, enseñar solo los nuevos sin contactar. Si te lías, déjalo en «Todos» y verás la lista completa.",
        tranqui: "Cambiar un filtro no borra ni cambia nada: solo enseña u oculta. Imposible romper algo.",
      },
    ],
  },

  // ─────────────────────────── CLIENTES ───────────────────────────
  clientes: {
    intro: "Aquí está tu lista de clientes: la gente con la que ya trabajas o has trabajado. Tu agenda de contactos, vaya.",
    items: [
      {
        emoji: "👥",
        title: "¿Qué es esta página?",
        body: "Es tu listado de clientes. Cada fila es una persona o empresa con su ficha: teléfono, dirección, historial… Aquí no hay 'interesados' (eso son los Leads); aquí están los que ya son clientes de verdad.",
      },
      {
        emoji: "➕",
        title: "Botón «Nuevo cliente»",
        body: "Para dar de alta a un cliente a mano. Rellenas sus datos y queda guardado. (Normalmente no hace falta: cuando conviertes un lead, su ficha de cliente se crea sola.)",
        tranqui: "Solo el nombre es obligatorio. El resto lo completas cuando lo tengas.",
      },
      {
        emoji: "👆",
        title: "¿Cómo veo o edito un cliente?",
        body: "A la derecha de cada cliente hay tres botones: el ojo 👁 abre su ficha (con su historial de trabajos), el lápiz ✏️ edita sus datos, y la papelera 🗑️ lo elimina.",
        tranqui: "Mirar (ojo) o editar (lápiz) no rompe nada. Solo la papelera borra, y te pide confirmación antes.",
      },
      {
        emoji: "⭐",
        title: "¿Qué son las estrellas y «recurrente»?",
        body: "Las estrellas son una valoración tuya del cliente (lo bien o mal que fue). «Recurrente» marca a los que te llaman más de una vez. Te ayudan a saber a quién cuidar más.",
      },
      {
        emoji: "🏷️",
        title: "¿Qué son las etiquetas (tags)?",
        body: "Palabras tuyas para clasificar clientes a tu manera: «empresa», «urgente», «Gràcia»… Luego puedes filtrar por ellas. Las pones tú, como quieras.",
      },
    ],
  },

  // ─────────────────────────── PRESUPUESTOS ───────────────────────────
  quotes: {
    intro: "Aquí están tus presupuestos: las ofertas de precio que preparas para tus clientes. Tranquilo, te explico cada estado y botón.",
    items: [
      {
        emoji: "📄",
        title: "¿Qué es un presupuesto?",
        body: "Es la oferta de precio que le pasas a un cliente antes de hacer el trabajo. Aquí los creas, los envías y ves si te los aceptan.",
      },
      {
        emoji: "🤖",
        title: "¿Por qué aparecen presupuestos que yo no he hecho?",
        body: "Cuando conviertes un lead en cliente, un ayudante automático te prepara un presupuesto en BORRADOR con un precio estimado. Te ahorra el trabajo: solo tienes que revisarlo y, si te cuadra, enviarlo.",
        tranqui: "Está en borrador: no se ha enviado a nadie. Tú decides si lo cambias, lo envías o lo borras.",
      },
      {
        emoji: "🚦",
        title: "Los estados: Borrador, Enviado, Aceptado…",
        body: "«Borrador» = aún lo estás preparando, nadie lo ha visto. «Enviado» = ya se lo mandaste al cliente. «Aceptado» = ¡dijo que sí! «Rechazado» = dijo que no. «Facturado» = ya le hiciste la factura.",
      },
      {
        emoji: "✅",
        title: "¿Qué pasa si marco un presupuesto como «Aceptado»?",
        body: "Que un ayudante te crea automáticamente el trabajo en la Agenda (pendiente de ponerle fecha). Así no se te olvida hacerlo. El círculo se cierra solo: presupuesto aceptado → trabajo agendado.",
      },
      {
        emoji: "🧾",
        title: "Botón «Convertir a factura»",
        body: "Cuando el trabajo está hecho y toca cobrar, este botón crea la factura a partir del presupuesto, copiando todos los datos. No tienes que escribirlo otra vez.",
      },
      {
        emoji: "➕",
        title: "Botón «Nuevo presupuesto»",
        body: "Para crear uno desde cero: eliges cliente, añades los conceptos y precios, y listo. El total con IVA se calcula solo.",
        tranqui: "Puedes guardarlo como borrador y terminarlo más tarde. No hay prisa.",
      },
    ],
  },

  // ─────────────────────────── FACTURAS ───────────────────────────
  invoices: {
    intro: "Aquí están tus facturas: lo que cobras (o tienes que cobrar) a tus clientes. Te explico los estados y cómo va el dinero.",
    items: [
      {
        emoji: "🧾",
        title: "¿Qué es una factura?",
        body: "Es el documento de cobro que le das al cliente cuando el trabajo está hecho. Aquí las creas, las descargas en PDF y controlas cuáles están cobradas y cuáles no.",
      },
      {
        emoji: "🚦",
        title: "Los estados: Pendiente, Pagada, Parcial, Vencida",
        body: "«Pendiente» = emitida pero aún no cobrada. «Pagada» = ya cobraste. «Parcial» = te pagaron una parte. «Vencida» = pasó la fecha de pago y aún no has cobrado (¡ojo a esas!).",
      },
      {
        emoji: "🔴",
        title: "¿Quién me avisa de las facturas vencidas?",
        body: "Un ayudante automático las vigila cada hora. Si una se pasa de fecha sin cobrar, te crea una alerta roja en Mission Control para que no se te escape el dinero.",
      },
      {
        emoji: "➕",
        title: "Botón «Nueva factura»",
        body: "Para crear una factura desde cero. Aunque lo más cómodo es crearla desde un presupuesto aceptado (botón «Convertir a factura»), que copia todo solo.",
      },
      {
        emoji: "💶",
        title: "¿Cómo marco una factura como cobrada?",
        body: "Pulsa el ojo 👁 de la factura para abrirla y ahí registra el pago (el importe que te han pagado). Cuando lo pagado iguala el total, pasa a «Pagada» sola.",
        tranqui: "Si te equivocas en un pago, se puede corregir. Nada es definitivo.",
      },
    ],
  },

  // ─────────────────────────── AGENDA ───────────────────────────
  agenda: {
    intro: "Aquí está tu agenda de trabajos: los servicios que tienes que hacer, con su fecha, hora y equipo. Tu calendario de faena.",
    items: [
      {
        emoji: "🗓️",
        title: "¿Qué es esta página?",
        body: "Es tu lista de trabajos por hacer: vaciados, limpiezas… Cada uno con su cliente, dirección y, cuando lo decidas, su fecha y hora.",
      },
      {
        emoji: "🤖",
        title: "¿Por qué aparecen trabajos que yo no he creado?",
        body: "Cuando aceptas un presupuesto, un ayudante automático te crea aquí el trabajo (de momento «pendiente», sin fecha). Solo tienes que abrirlo y ponerle día y hora cuando lo tengas claro.",
      },
      {
        emoji: "🚦",
        title: "Los estados del trabajo",
        body: "«Pendiente» = aceptado pero sin fecha o sin empezar. «Confirmado» = con fecha cerrada. «En curso» = lo estás haciendo. «Completado» = terminado. «Cancelado» = anulado.",
      },
      {
        emoji: "⚠️",
        title: "¿Qué pasa si dos trabajos coinciden en fecha y hora?",
        body: "Un ayudante automático lo detecta y te avisa con una alerta de «conflicto de agenda» en Mission Control, para que no mandes dos equipos al mismo sitio a la vez.",
      },
      {
        emoji: "📸",
        title: "¿Para qué son las fotos antes/después?",
        body: "Para guardar el estado del piso antes y después del trabajo. Útil para mostrar al cliente, para tu archivo y por si hay alguna reclamación.",
      },
    ],
  },

  // ─────────────────────────── DASHBOARD ───────────────────────────
  dashboard: {
    intro: "Esta es tu pantalla de inicio: un vistazo rápido a cómo va tu negocio en números y gráficos. Sin agobios, solo para hacerte una idea.",
    items: [
      {
        emoji: "🏠",
        title: "¿Qué es el Dashboard?",
        body: "Tu resumen general: cuántos clientes tienes, presupuestos pendientes, dinero por cobrar, etc. Es el 'cómo voy' de un golpe de vista.",
      },
      {
        emoji: "🔢",
        title: "Las tarjetas de arriba con números",
        body: "Son tus indicadores clave: clientes, presupuestos pendientes, pendiente de cobro, total facturado… Pulsa una y te lleva a su sección.",
      },
      {
        emoji: "📊",
        title: "Los gráficos",
        body: "Te enseñan tendencias: facturación por mes, en qué estado están tus presupuestos, de dónde vienen tus leads… Para ver de un vistazo qué funciona.",
      },
      {
        emoji: "🆚",
        title: "¿En qué se diferencia de Mission Control?",
        body: "El Dashboard son TUS números (clientes, dinero…). Mission Control es el centro de los AYUDANTES automáticos: lo que han detectado, las alertas y los avisos. Uno es 'cómo va el negocio', el otro es 'qué han hecho los robots por mí'.",
      },
    ],
  },

  // ─────────────────────────── MISSION CONTROL ───────────────────────────
  "mission-control": {
    intro: "Este es tu centro de mando. Aquí ves de un vistazo lo que los ayudantes automáticos han detectado y hecho por ti. Tu copiloto.",
    items: [
      {
        emoji: "🛰️",
        title: "¿Qué es Mission Control?",
        body: "La pantalla donde tus ayudantes automáticos te 'reportan': qué riesgos hay, qué oportunidades, cuánto has ahorrado en IA y qué han ido haciendo. Tú solo miras y decides.",
      },
      {
        emoji: "💼",
        title: "El «Informe del CEO Agent»",
        body: "Un resumen del día preparado solo: cuántos leads, presupuestos y facturas, qué riesgos vigilar y qué oportunidades aprovechar. Como si tuvieras un director que te pone al día cada mañana.",
      },
      {
        emoji: "🔔",
        title: "Las «Alertas abiertas»",
        body: "Avisos de cosas que requieren tu atención: un cliente urgente, una factura vencida, un presupuesto sin respuesta… Pulsa cualquiera y te lleva directo a lo que la causó.",
        tranqui: "Las alertas no hacen nada solas: solo te avisan. Tú decides si actúas.",
      },
      {
        emoji: "💰",
        title: "La barra verde de ahorro",
        body: "Te enseña cuánto dinero te has ahorrado en inteligencia artificial gracias a que el sistema reutiliza respuestas en vez de pagar cada vez. Casi todo se hace gratis.",
      },
      {
        emoji: "📡",
        title: "La «Actividad de agentes»",
        body: "El registro en vivo de todo lo que hacen tus ayudantes: cada lead que clasifican, cada presupuesto que generan… La marca «0 tok» significa que lo hicieron sin gastar nada.",
      },
    ],
  },

  // ─────────────────────────── AJUSTES ───────────────────────────
  settings: {
    intro: "Aquí configuras tu empresa y la app. Lo dejas puesto una vez al principio y casi no vuelves. Te explico lo importante.",
    items: [
      {
        emoji: "🏢",
        title: "Datos de tu empresa",
        body: "Tu nombre fiscal, NIF/CIF, dirección, IBAN… Es importante rellenarlo porque son los datos que saldrán en tus facturas. Sin esto, las facturas quedan incompletas.",
        tranqui: "Lo pones una vez y se queda guardado. No hay que tocarlo más.",
      },
      {
        emoji: "🖼️",
        title: "Logo",
        body: "Sube el logo de tu empresa para que aparezca en los presupuestos y facturas en PDF. Le da un aspecto más profesional.",
      },
      {
        emoji: "💾",
        title: "Copia de seguridad",
        body: "Te permite descargar una copia de tus datos por si quieres tenerla a buen recaudo. Tranquilo: tus datos ya están guardados en la nube de forma segura; esto es un extra.",
      },
      {
        emoji: "🔑",
        title: "Las claves de IA (Groq, Gemini)",
        body: "Son las 'llaves' que permiten al asistente de voz/texto funcionar. Si alguien te las dio, las pegas aquí. Si no las tienes, no pasa nada: casi todo funciona igual sin ellas.",
        tranqui: "Estas claves son privadas. No las compartas con nadie.",
      },
    ],
  },
};
