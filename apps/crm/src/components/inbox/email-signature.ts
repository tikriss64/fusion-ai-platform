// Firma corporativa de VaciadoDePisos.cat / ZAFIRO LANCER S.L.
// Usada en todos los correos salientes (nuevos y respuestas).

const LOGO_URL = "https://vaciadodepisos.cat/imagenes/logo/logo-Vaciadodepisoscat80x80.webp";

export const SIGNATURE_HTML = `
<br><br>
<table style="border-top:1px solid #e0e0e0;padding-top:16px;font-family:Arial,sans-serif;font-size:12px;color:#555;max-width:480px;">
  <tr>
    <td style="padding-right:16px;vertical-align:top;">
      <img src="${LOGO_URL}" alt="VaciadoDePisos.cat" width="60" height="60" style="border-radius:6px;display:block;">
    </td>
    <td style="vertical-align:top;">
      <div style="font-weight:700;font-size:14px;color:#2B638D;">VaciadoDePisos.cat</div>
      <div style="color:#444;margin:2px 0;">ZAFIRO LANCER S.L. &mdash; CIF: B13704903</div>
      <div style="color:#666;">C/ Torreta 8, local 7 &mdash; 08810 Sant Pere de Ribes, Barcelona</div>
      <div style="margin-top:4px;">
        <span>📞 688 30 41 43</span> &nbsp;|&nbsp;
        <a href="mailto:vaciarpisos1978@gmail.com" style="color:#2B638D;">vaciarpisos1978@gmail.com</a> &nbsp;|&nbsp;
        <a href="https://vaciadodepisos.cat" style="color:#2B638D;">vaciadodepisos.cat</a>
      </div>
      <div style="margin-top:8px;font-size:10px;color:#999;border-top:1px solid #eee;padding-top:6px;">
        Este mensaje y sus adjuntos son confidenciales y están dirigidos exclusivamente a su destinatario.
        Si lo ha recibido por error, le rogamos que lo elimine y nos lo comunique.
        ZAFIRO LANCER S.L. está inscrita en el Registro Mercantil de Barcelona.
        <a href="https://vaciadodepisos.cat/aviso-legal.html" style="color:#999;">Aviso Legal</a>
      </div>
    </td>
  </tr>
</table>`;

export const SIGNATURE_TEXT = `

--
VaciadoDePisos.cat | ZAFIRO LANCER S.L. (CIF: B13704903)
C/ Torreta 8, local 7 — 08810 Sant Pere de Ribes, Barcelona
Tel: 688 30 41 43 | vaciarpisos1978@gmail.com | https://vaciadodepisos.cat

Este mensaje es confidencial y está dirigido exclusivamente a su destinatario.
ZAFIRO LANCER S.L. — Inscrita en el Registro Mercantil de Barcelona.`;

// Plantillas para nuevos correos
export interface EmailTemplate {
  id: string;
  label: string;
  subject: string;
  body: string;
}

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: "blank",
    label: "En blanco",
    subject: "",
    body: "",
  },
  {
    id: "reply",
    label: "Respuesta simple",
    subject: "",
    body: "Estimado/a [Nombre],\n\nGracias por su mensaje. \n\nQuedo a su disposición para cualquier consulta.\n\nAtentamente,\nMartín",
  },
  {
    id: "quote",
    label: "Presupuesto",
    subject: "Presupuesto — Vaciado de piso",
    body: "Estimado/a [Nombre],\n\nTras valorar el servicio solicitado, le presentamos el siguiente presupuesto:\n\nDESCRIPCIÓN DEL SERVICIO:\n- [Describir el trabajo a realizar]\n\nIMPORTE: [Precio] EUR (IVA incluido)\n\nPLAZO DE EJECUCIÓN: [X días hábiles desde la aprobación]\n\nINCLUYE:\n- Mano de obra y transporte\n- Gestión de residuos según normativa vigente\n- Vaciado y limpieza del inmueble\n\nEste presupuesto tiene una validez de 30 días.\n\nPara aceptar, responda a este correo o llámenos al 688 30 41 43.\n\nAtentamente,\nMartín",
  },
  {
    id: "invoice_reminder",
    label: "Recordatorio de pago",
    subject: "Recordatorio de pago — Factura pendiente",
    body: "Estimado/a [Nombre],\n\nNos ponemos en contacto con usted para recordarle que tenemos pendiente el pago de la siguiente factura:\n\nFactura n.º: [Número]\nFecha de emisión: [Fecha]\nImporte: [Cantidad] EUR\nVencimiento: [Fecha vencimiento]\n\nPuede realizar el pago mediante:\n- Transferencia bancaria a: [IBAN]\n- Bizum al: 688 30 41 43\n\nSi ya ha realizado el pago, por favor ignore este mensaje.\n\nAtentamente,\nMartín",
  },
  {
    id: "job_confirm",
    label: "Confirmación de trabajo",
    subject: "Confirmación — Trabajo realizado",
    body: "Estimado/a [Nombre],\n\nLe confirmamos que el trabajo ha sido realizado correctamente en la fecha acordada.\n\nRESUMEN DEL SERVICIO:\n- Inmueble: [Dirección]\n- Fecha de ejecución: [Fecha]\n- Servicio realizado: [Descripción]\n\nHa sido un placer trabajar con usted. Quedamos a su disposición para futuros servicios.\n\nAtentamente,\nMartín",
  },
  {
    id: "appointment",
    label: "Confirmación de cita",
    subject: "Confirmación de visita",
    body: "Estimado/a [Nombre],\n\nLe confirmamos su cita:\n\nFecha: [Día y hora]\nDirección: [Dirección del inmueble]\nContacto: 688 30 41 43\n\nSi necesita modificar la cita, le rogamos que nos lo comunique con la mayor antelación posible.\n\nAtentamente,\nMartín",
  },
  {
    id: "followup",
    label: "Seguimiento",
    subject: "Seguimiento — [Asunto previo]",
    body: "Estimado/a [Nombre],\n\nMe pongo en contacto con usted para hacer seguimiento de nuestra conversación anterior.\n\n¿Ha tenido oportunidad de revisar nuestra propuesta? Quedo a su disposición para resolver cualquier duda o concretar los próximos pasos.\n\nAtentamente,\nMartín",
  },
  {
    id: "info_request",
    label: "Solicitud de información",
    subject: "Solicitud de información — Vaciado de piso",
    body: "Estimado/a [Nombre],\n\nPara poder ofrecerle el mejor servicio y elaborar un presupuesto ajustado a sus necesidades, le agradecería que nos facilitara la siguiente información:\n\n- Dirección del inmueble\n- Superficie aproximada (m²) o número de habitaciones\n- Estado actual (amueblado, semivacío...)\n- Fecha estimada en que necesita el servicio\n- ¿Dispone de ascensor?\n- ¿Hay algún objeto de valor que desee conservar?\n\nCon estos datos le enviaremos un presupuesto en menos de 24 horas.\n\nAtentamente,\nMartín",
  },
];
