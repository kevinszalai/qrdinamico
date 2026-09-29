const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });
const fetch = require("node-fetch");

admin.initializeApp();
const db = admin.firestore();

// Se configura con: firebase functions:config:set mercadopago.token="TU_ACCESS_TOKEN"
const MP_TOKEN = functions.config().mercadopago.token;
const BASE_URL = "https://kevinszalai.github.io/qrdinamico/";

// El panel de admin sólo deja entrar a esta cuenta puntual.
// Creála una vez en Firebase Console → Authentication → Add user,
// con este mismo email y la contraseña que quieras usar.
const ADMIN_EMAIL = "kevinszalai@admin.qrtresna.local";

const PLANES = {
  starter: { nombre: "Starter", precio: 4999, limite: 5 },
  pro: { nombre: "Pro", precio: 9999, limite: 20 },
  negocio: { nombre: "Negocio", precio: 19999, limite: null }, // null = ilimitado
};

const MS_POR_MES = 30 * 24 * 60 * 60 * 1000;

// ---------- Helpers ----------
async function getDecodedToken(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  try {
    return await admin.auth().verifyIdToken(token);
  } catch (e) {
    return null;
  }
}

async function requireAdmin(req, res) {
  const decoded = await getDecodedToken(req);
  if (!decoded || decoded.email !== ADMIN_EMAIL) {
    res.status(403).json({ error: "No autorizado" });
    return null;
  }
  return decoded;
}

async function buscarCupon(codigo) {
  if (!codigo) return null;
  const doc = await db.collection("cupones").doc(codigo.trim().toUpperCase()).get();
  if (!doc.exists) return null;
  const c = doc.data();
  if (c.activo === false) return null;
  return { id: doc.id, ...c };
}

function cuponAplicaAlPlan(cupon, plan) {
  if (!cupon.planes || cupon.planes === "todos") return true;
  return Array.isArray(cupon.planes) && cupon.planes.includes(plan);
}

function calcularPrecioConCupon(precioBase, cupon) {
  if (!cupon) return precioBase;
  if (cupon.tipo === "free") return 0;
  if (cupon.tipo === "porcentaje") return Math.max(0, Math.round(precioBase * (1 - cupon.valor / 100)));
  if (cupon.tipo === "monto") return Math.max(0, precioBase - cupon.valor);
  return precioBase;
}

// =========================================================
// SUSCRIPCIONES
// =========================================================

/**
 * El panel llama a esta función cuando el usuario elige un plan (con o sin cupón).
 * Crea una suscripción recurrente en Mercado Pago y devuelve el link de pago,
 * o si el cupón es 100% gratis, activa el plan directo sin pasar por MP.
 */
exports.crearSuscripcion = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { uid, email, plan, cupon: codigoCupon } = req.body || {};
      if (!uid || !email || !PLANES[plan]) {
        return res.status(400).json({ error: "Falta uid, email o el plan no es válido" });
      }
      const { nombre, precio } = PLANES[plan];

      let cupon = await buscarCupon(codigoCupon);
      if (cupon && !cuponAplicaAlPlan(cupon, plan)) cupon = null;

      const precioFinal = calcularPrecioConCupon(precio, cupon);

      // Cupón 100% gratis: activamos el plan directo, sin pasar por Mercado Pago
      if (cupon && precioFinal === 0) {
        const hasta = admin.firestore.Timestamp.fromMillis(
          Date.now() + (cupon.duracionMeses || 1) * MS_POR_MES
        );
        await db.collection("usuarios").doc(uid).set(
          {
            email,
            plan,
            planGratisPorCupon: true,
            cuponAplicado: cupon.id,
            gratisHasta: hasta,
          },
          { merge: true }
        );
        return res.json({ gratis: true, hasta: hasta.toDate().toISOString() });
      }

      const mpRes = await fetch("https://api.mercadopago.com/preapproval", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${MP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason: `QR Tresna - Plan ${nombre}`,
          auto_recurring: {
            frequency: 1,
            frequency_type: "months",
            transaction_amount: precioFinal,
            currency_id: "ARS",
          },
          back_url: BASE_URL,
          payer_email: email,
          // Guardamos uid Y plan acá para no depender de otra escritura antes del webhook
          external_reference: `${uid}|${plan}`,
        }),
      });

      const data = await mpRes.json();
      if (!mpRes.ok) {
        console.error("Error de Mercado Pago:", data);
        return res.status(500).json({ error: "No se pudo crear la suscripción", detalle: data });
      }

      const update = {
        email,
        planSolicitado: plan,
        mpPreapprovalId: data.id,
        mpStatus: data.status || "pending",
      };
      if (cupon) {
        update.cuponAplicado = cupon.id;
        update.precioConCupon = precioFinal;
        update.precioNormal = precio;
        update.descuentoHasta = admin.firestore.Timestamp.fromMillis(
          Date.now() + (cupon.duracionMeses || 1) * MS_POR_MES
        );
      }
      await db.collection("usuarios").doc(uid).set(update, { merge: true });

      res.json({ init_point: data.init_point });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });
});

/**
 * El panel llama a esta función para mostrar el precio con descuento
 * ANTES de que el usuario confirme el pago (no aplica nada todavía).
 */
exports.validarCupon = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { codigo, plan } = req.body || {};
      if (!codigo || !PLANES[plan]) return res.json({ valido: false });
      const cupon = await buscarCupon(codigo);
      if (!cupon) return res.json({ valido: false, motivo: "Cupón inválido o vencido" });
      if (!cuponAplicaAlPlan(cupon, plan)) {
        return res.json({ valido: false, motivo: "Este cupón no aplica a este plan" });
      }
      const precioBase = PLANES[plan].precio;
      const precioFinal = calcularPrecioConCupon(precioBase, cupon);
      res.json({
        valido: true,
        tipo: cupon.tipo,
        valor: cupon.valor,
        duracionMeses: cupon.duracionMeses || 1,
        precioBase,
        precioFinal,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ valido: false });
    }
  });
});

/**
 * Mercado Pago llama a esta URL cada vez que cambia el estado de una suscripción.
 * Configurarla en: Panel de MP → Tu app → Webhooks → URL de notificación.
 */
exports.webhookMP = functions.https.onRequest(async (req, res) => {
  try {
    const topic = req.query.type || req.query.topic;
    const id = req.query["data.id"] || req.query.id;

    if (topic === "preapproval" && id) {
      const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${id}`, {
        headers: { "Authorization": `Bearer ${MP_TOKEN}` },
      });
      const sub = await mpRes.json();
      const [uid, planSolicitado] = (sub.external_reference || "").split("|");

      if (uid) {
        const plan = sub.status === "authorized" ? (planSolicitado || "starter") : "gratis";
        await db.collection("usuarios").doc(uid).set(
          {
            plan,
            mpStatus: sub.status,
            mpPreapprovalId: sub.id,
          },
          { merge: true }
        );
      }
    }
    res.status(200).send("ok");
  } catch (e) {
    console.error(e);
    // Igual respondemos 200: si no, Mercado Pago reintenta en loop.
    res.status(200).send("ok");
  }
});

// =========================================================
// ADMIN
// =========================================================

/**
 * Estadísticas para el panel de administrador: usuarios, QRs, planes contratados.
 * Sólo responde si el token pertenece a ADMIN_EMAIL.
 */
exports.adminStats = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    const decoded = await requireAdmin(req, res);
    if (!decoded) return;
    try {
      const q = (req.query.q || "").toLowerCase();

      // Todos los usuarios registrados en Firebase Auth (paginado de a 1000)
      let allUsers = [];
      let pageToken;
      do {
        const result = await admin.auth().listUsers(1000, pageToken);
        allUsers = allUsers.concat(result.users);
        pageToken = result.pageToken;
      } while (pageToken);

      const usuariosSnap = await db.collection("usuarios").get();
      const datosPorUid = {};
      usuariosSnap.forEach((doc) => { datosPorUid[doc.id] = doc.data(); });

      const qrsSnap = await db.collection("qrs").get();
      const qrsPorUsuario = {};
      qrsSnap.forEach((doc) => {
        const ownerId = doc.data().ownerId;
        qrsPorUsuario[ownerId] = (qrsPorUsuario[ownerId] || 0) + 1;
      });

      const porPlan = {};
      const usuarios = [];
      allUsers.forEach((u) => {
        const datos = datosPorUid[u.uid] || {};
        const planKey = datos.plan || "sin_plan";
        porPlan[planKey] = (porPlan[planKey] || 0) + 1;
        const email = u.email || "";
        if (q && !email.toLowerCase().includes(q)) return;
        usuarios.push({
          uid: u.uid,
          email,
          plan: datos.plan || null,
          cuponAplicado: datos.cuponAplicado || null,
          qrs: qrsPorUsuario[u.uid] || 0,
          creado: u.metadata.creationTime,
        });
      });

      usuarios.sort((a, b) => new Date(b.creado) - new Date(a.creado));

      res.json({
        totalUsuarios: allUsers.length,
        totalQrs: qrsSnap.size,
        porPlan,
        usuarios,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });
});

/**
 * Lista, crea/edita y borra cupones. Sólo accesible para ADMIN_EMAIL.
 */
exports.listarCupones = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    const decoded = await requireAdmin(req, res);
    if (!decoded) return;
    try {
      const snap = await db.collection("cupones").get();
      const cupones = [];
      snap.forEach((doc) => cupones.push({ id: doc.id, ...doc.data() }));
      res.json({ cupones });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
});

exports.guardarCupon = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    const decoded = await requireAdmin(req, res);
    if (!decoded) return;
    try {
      const { codigo, tipo, valor, planes, duracionMeses, activo } = req.body || {};
      if (!codigo || !tipo) return res.status(400).json({ error: "Falta código o tipo" });
      const id = codigo.trim().toUpperCase();
      await db.collection("cupones").doc(id).set(
        {
          tipo, // "porcentaje" | "monto" | "free"
          valor: tipo === "free" ? 0 : Number(valor) || 0,
          planes: planes === "todos" ? "todos" : (Array.isArray(planes) ? planes : []),
          duracionMeses: Number(duracionMeses) || 1,
          activo: activo !== false,
          creado: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      res.json({ ok: true, id });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
});

exports.eliminarCupon = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    const decoded = await requireAdmin(req, res);
    if (!decoded) return;
    try {
      const { codigo } = req.body || {};
      if (!codigo) return res.status(400).json({ error: "Falta código" });
      await db.collection("cupones").doc(codigo.trim().toUpperCase()).delete();
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
});

// =========================================================
// TAREA PROGRAMADA: revierte descuentos vencidos (corre 1 vez por día)
// =========================================================
exports.revisarDescuentosVencidos = functions.pubsub.schedule("every 24 hours").onRun(async () => {
  const ahora = admin.firestore.Timestamp.now();

  // 1) Suscripciones pagas con descuento vencido → vuelven al precio normal en Mercado Pago
  const conDescuento = await db.collection("usuarios").where("descuentoHasta", "<=", ahora).get();
  for (const doc of conDescuento.docs) {
    const d = doc.data();
    if (d.mpPreapprovalId && d.precioNormal) {
      try {
        await fetch(`https://api.mercadopago.com/preapproval/${d.mpPreapprovalId}`, {
          method: "PUT",
          headers: {
            "Authorization": `Bearer ${MP_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ auto_recurring: { transaction_amount: d.precioNormal } }),
        });
      } catch (e) {
        console.error("No se pudo revertir el precio de", doc.id, e);
      }
    }
    await doc.ref.update({
      descuentoHasta: admin.firestore.FieldValue.delete(),
      precioConCupon: admin.firestore.FieldValue.delete(),
    });
  }

  // 2) Planes 100% gratis por cupón que ya vencieron → se les quita el plan
  const gratisVencidos = await db.collection("usuarios").where("gratisHasta", "<=", ahora).get();
  for (const doc of gratisVencidos.docs) {
    await doc.ref.update({
      plan: admin.firestore.FieldValue.delete(),
      planGratisPorCupon: admin.firestore.FieldValue.delete(),
      gratisHasta: admin.firestore.FieldValue.delete(),
    });
  }

  return null;
});
