/* Módulo Gestión: panel del usuario (CRUD de QR, planes, cupones) */
async function bootDashboard(){
  try{
    await loadScript("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
    await Promise.all([
      loadScript("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"),
      loadScript("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"),
      loadScript("https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js")
    ]);
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    initDashboard();
  }catch(e){
    document.body.innerHTML = `<div class="redirectwrap"><b style="color:var(--signal);">No se pudo cargar la app</b><p style="color:var(--ink-soft); font-size:13px; margin-top:6px;">Revisá tu conexión y recargá la página.</p></div>`;
  }
}


function initDashboard(){
  const homeView = document.getElementById("homeView");
  const authView = document.getElementById("authView");
  const dashView = document.getElementById("dashView");
  let currentPlan = null;
  let qrCount = 0;

  // Si volvemos de Mercado Pago con una suscripción recién creada, avisamos
  const volviendoDePago = new URLSearchParams(window.location.search).has("preapproval_id");
  if(volviendoDePago){
    document.getElementById("proBanner").classList.remove("hidden");
  }

  auth.onAuthStateChanged(user=>{
    if(user){
      homeView.classList.add("hidden");
      authView.classList.add("hidden");
      dashView.classList.remove("hidden");
      document.getElementById("userEmail").textContent = user.email;
      loadQrs(user.uid);
      watchPlan(user.uid);
    } else {
      dashView.classList.add("hidden");
    }
  });

  let planPromptShown = false;
  function watchPlan(uid){
    db.collection("usuarios").doc(uid).onSnapshot(doc=>{
      const planId = (doc.exists && PLANES[doc.data().plan]) ? doc.data().plan : null;
      currentPlan = planId;
      const badge = document.getElementById("planBadge");
      if(planId){
        const p = PLANES[planId];
        badge.textContent = `Plan ${p.nombre} · ${p.limite ? "hasta "+p.limite : "ilimitados"}`;
        badge.classList.add("pro");
        document.getElementById("proBanner").classList.add("hidden");
      } else {
        badge.textContent = "Sin plan";
        badge.classList.remove("pro");
        // Recién registrado (o todavía sin pagar): le mostramos los planes directo,
        // salvo que esté esperando la confirmación de un pago recién hecho.
        if(!planPromptShown && !volviendoDePago){
          planPromptShown = true;
          const planElegido = sessionStorage.getItem("planElegido");
          if(planElegido && PLANES[planElegido]){
            sessionStorage.removeItem("planElegido");
            iniciarPago(planElegido, null);
          } else {
            abrirPlanes();
          }
        }
      }
    });
  }

  const PRECIOS_BASE = { starter: 4999, pro: 9999, negocio: 19999 };
  let cuponActivo = null;

  function resetPreciosVisuales(){
    document.getElementById("priceStarter").innerHTML = `$${PRECIOS_BASE.starter.toLocaleString("es-AR")}<span>/mes</span>`;
    document.getElementById("pricePro").innerHTML = `$${PRECIOS_BASE.pro.toLocaleString("es-AR")}<span>/mes</span>`;
    document.getElementById("priceNegocio").innerHTML = `$${PRECIOS_BASE.negocio.toLocaleString("es-AR")}<span>/mes</span>`;
  }

  function abrirPlanes(){
    document.getElementById("plansErr").textContent = "";
    document.getElementById("cuponInput").value = "";
    document.getElementById("cuponMsg").textContent = "";
    cuponActivo = null;
    resetPreciosVisuales();
    document.getElementById("plansOverlay").classList.remove("hidden");
  }
  document.getElementById("upgradeBtn").onclick = abrirPlanes;
  document.getElementById("plansClose").onclick = ()=> document.getElementById("plansOverlay").classList.add("hidden");

  document.getElementById("cuponAplicarBtn").onclick = async ()=>{
    const codigo = document.getElementById("cuponInput").value.trim();
    const msgEl = document.getElementById("cuponMsg");
    if(!codigo){ msgEl.textContent = ""; return; }
    msgEl.textContent = "Revisando…";
    resetPreciosVisuales();
    let algunoValido = false;
    for(const planId of Object.keys(PRECIOS_BASE)){
      try{
        const res = await fetch(`${FUNCTIONS_URL}/validarCupon`, {
          method: "POST",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify({ codigo, plan: planId })
        });
        const data = await res.json();
        if(data.valido){
          algunoValido = true;
          const el = document.getElementById(planId === "starter" ? "priceStarter" : planId === "pro" ? "pricePro" : "priceNegocio");
          el.innerHTML = `<span style="text-decoration:line-through; font-size:15px; color:var(--ink-soft); font-weight:400;">$${data.precioBase.toLocaleString("es-AR")}</span> $${data.precioFinal.toLocaleString("es-AR")}<span>/mes</span>`;
        }
      }catch(e){ /* seguimos con los otros planes */ }
    }
    if(algunoValido){
      cuponActivo = codigo;
      msgEl.textContent = "¡Cupón aplicado! Se descuenta en el plan que elijas.";
    } else {
      cuponActivo = null;
      msgEl.textContent = "Ese cupón no es válido o ya venció.";
    }
  };

  async function iniciarPago(planId, btn){
    const errEl = document.getElementById("plansErr");
    errEl.textContent = "";
    const original = btn ? btn.textContent : null;
    if(btn) btn.textContent = "Un segundo…";
    try{
      const res = await fetch(`${FUNCTIONS_URL}/crearSuscripcion`, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ uid: auth.currentUser.uid, email: auth.currentUser.email, plan: planId, cupon: cuponActivo })
      });
      const data = await res.json();
      if(data.init_point){
        window.location.href = data.init_point;
      } else if(data.gratis){
        document.getElementById("plansOverlay").classList.add("hidden");
        alert("¡Listo! Tu plan quedó activado gratis por el cupón.");
      } else {
        errEl.textContent = "No se pudo iniciar el pago. Probá de nuevo en un momento.";
        if(btn) btn.textContent = original;
      }
    }catch(e){
      errEl.textContent = "No se pudo conectar con Mercado Pago. Probá de nuevo.";
      if(btn) btn.textContent = original;
    }
  }

  document.querySelectorAll("#plansOverlay [data-plan]").forEach(btn=>{
    btn.onclick = ()=> iniciarPago(btn.dataset.plan, btn);
  });

  document.getElementById("logoutBtn").onclick = ()=> auth.signOut();

  /* ---------- CRUD ---------- */
  const grid = document.getElementById("qrGrid");
  const empty = document.getElementById("emptyState");
  let currentType = "url";
  let editingId = null;

  function loadQrs(uid){
    db.collection("qrs").where("ownerId","==",uid)
      .onSnapshot(snap=>{
        grid.innerHTML = "";
        qrCount = snap.size;
        if(snap.empty){ empty.classList.remove("hidden"); return; }
        empty.classList.add("hidden");
        const docs = snap.docs.slice().sort((a,b)=>{
          const ta = a.data().creado ? a.data().creado.toMillis() : 0;
          const tb = b.data().creado ? b.data().creado.toMillis() : 0;
          return tb - ta;
        });
        docs.forEach(doc=> grid.appendChild(renderCard(doc.id, doc.data())));
      }, err=>{
        console.error(err);
        empty.classList.remove("hidden");
        empty.innerHTML = `<b>No se pudieron cargar tus QRs</b>${err.message}`;
      });
  }

  function destinoPreview(d){
    switch(d.tipo){
      case "url": return d.destino.url;
      case "vcard": return `${d.destino.nombre} · ${d.destino.telefono||""}`;
      case "wifi": return `Red: ${d.destino.ssid}`;
      case "texto": return d.destino.contenido;
      case "email": return d.destino.email;
      case "telefono": return d.destino.numero;
      case "sms": return `${d.destino.numero} · ${d.destino.mensaje||""}`;
      case "ubicacion": return `${d.destino.lat}, ${d.destino.lng}`;
      default: return "";
    }
  }

  function renderCard(id, d){
    const el = document.createElement("div");
    el.className = "card";
    const destinoTexto = destinoPreview(d);
    el.innerHTML = `
      <div class="card-top">
        <span class="tag ${d.tipo}">${d.tipo}</span>
        <span class="status-dot ${d.activo!==false?'on':''}" title="${d.activo!==false?'activo':'pausado'}"></span>
      </div>
      <h3>${d.nombre||"Sin nombre"}</h3>
      <div class="dest">${destinoTexto}</div>
      <div class="card-stats">
        <div>escaneos <b>${d.escaneos||0}</b></div>
      </div>
      <div class="card-actions">
        <button class="btn small ghost" data-act="view">Ver QR</button>
        <button class="btn small ghost" data-act="edit">Editar</button>
        <button class="btn small ghost" data-act="toggle">${d.activo!==false?'Pausar':'Activar'}</button>
        <button class="btn small danger" data-act="delete">Borrar</button>
      </div>
    `;
    el.querySelector('[data-act="view"]').onclick = ()=> openDetail(id, d);
    el.querySelector('[data-act="edit"]').onclick = ()=> openModal(d, id);
    el.querySelector('[data-act="toggle"]').onclick = ()=> db.collection("qrs").doc(id).update({activo: d.activo===false});
    el.querySelector('[data-act="delete"]').onclick = ()=>{
      if(confirm("¿Borrar este QR? Los códigos ya impresos dejarán de funcionar.")){
        db.collection("qrs").doc(id).delete();
      }
    };
    return el;
  }

  /* ---------- modal crear/editar ---------- */
  const overlay = document.getElementById("modalOverlay");
  document.getElementById("newQrBtn").onclick = ()=>{
    const limite = currentPlan ? PLANES[currentPlan].limite : 0;
    const sinPlan = !currentPlan;
    const alTope = limite !== null && qrCount >= limite;
    if(sinPlan || alTope){
      document.getElementById("plansErr").textContent = sinPlan
        ? "Los QR dinámicos necesitan un plan pago."
        : `Llegaste al límite de tu plan actual (${limite} QR). Pasate a uno más grande:`;
      document.getElementById("plansOverlay").classList.remove("hidden");
      return;
    }
    openModal();
  };
  document.getElementById("modalCancel").onclick = closeModal;

  document.querySelectorAll(".typebtn[data-type]").forEach(b=>{
    b.onclick = ()=>{
      document.querySelectorAll(".typebtn[data-type]").forEach(x=>x.classList.remove("active"));
      b.classList.add("active");
      currentType = b.dataset.type;
      ["url","vcard","wifi","texto","email","telefono","sms","ubicacion"].forEach(t=>{
        document.getElementById("fields-"+t).classList.toggle("hidden", t!==currentType);
      });
    };
  });

  function openModal(existing, id){
    editingId = id || null;
    document.getElementById("modalTitle").textContent = existing ? "Editar QR" : "Nuevo QR";
    document.getElementById("modalErr").textContent = "";
    currentType = existing ? existing.tipo : "url";
    document.querySelectorAll(".typebtn[data-type]").forEach(b=> b.classList.toggle("active", b.dataset.type===currentType));
    ["url","vcard","wifi","texto","email","telefono","sms","ubicacion"].forEach(t=> document.getElementById("fields-"+t).classList.toggle("hidden", t!==currentType));

    document.getElementById("fNombre").value = existing?.nombre || "";
    document.getElementById("fUrl").value = existing?.destino?.url || "";
    document.getElementById("fVName").value = existing?.destino?.nombre || "";
    document.getElementById("fVPhone").value = existing?.destino?.telefono || "";
    document.getElementById("fVEmail").value = existing?.destino?.email || "";
    document.getElementById("fVOrg").value = existing?.destino?.org || "";
    document.getElementById("fWSsid").value = existing?.destino?.ssid || "";
    document.getElementById("fWPass").value = existing?.destino?.password || "";
    document.getElementById("fWSec").value = existing?.destino?.seguridad || "WPA";
    document.getElementById("fTexto").value = existing?.destino?.contenido || "";
    document.getElementById("fEmail").value = existing?.destino?.email || "";
    document.getElementById("fEmailAsunto").value = existing?.destino?.asunto || "";
    document.getElementById("fEmailMensaje").value = existing?.destino?.mensaje || "";
    document.getElementById("fTelefono").value = existing?.destino?.numero || "";
    document.getElementById("fSmsNumero").value = existing?.destino?.numero || "";
    document.getElementById("fSmsMensaje").value = existing?.destino?.mensaje || "";
    document.getElementById("fLat").value = existing?.destino?.lat || "";
    document.getElementById("fLng").value = existing?.destino?.lng || "";

    overlay.classList.remove("hidden");
  }
  function closeModal(){ overlay.classList.add("hidden"); editingId = null; }

  document.getElementById("modalSave").onclick = async ()=>{
    const nombre = document.getElementById("fNombre").value.trim();
    const errEl = document.getElementById("modalErr");
    if(!nombre){ errEl.textContent = "Ponele un nombre interno al QR."; return; }

    let destino = {};
    if(currentType === "url"){
      let url = document.getElementById("fUrl").value.trim();
      if(!url){ errEl.textContent = "Falta la URL de destino."; return; }
      if(!/^https?:\/\//i.test(url)){ url = "https://" + url; }
      destino = { url };
    } else if(currentType === "vcard"){
      const nombreV = document.getElementById("fVName").value.trim();
      if(!nombreV){ errEl.textContent = "Falta el nombre del contacto."; return; }
      destino = {
        nombre: nombreV,
        telefono: document.getElementById("fVPhone").value.trim(),
        email: document.getElementById("fVEmail").value.trim(),
        org: document.getElementById("fVOrg").value.trim()
      };
    } else if(currentType === "wifi"){
      const ssid = document.getElementById("fWSsid").value.trim();
      if(!ssid){ errEl.textContent = "Falta el nombre de la red."; return; }
      destino = {
        ssid,
        password: document.getElementById("fWPass").value,
        seguridad: document.getElementById("fWSec").value
      };
    } else if(currentType === "texto"){
      const contenido = document.getElementById("fTexto").value.trim();
      if(!contenido){ errEl.textContent = "Falta el contenido del texto."; return; }
      destino = { contenido };
    } else if(currentType === "email"){
      const email = document.getElementById("fEmail").value.trim();
      if(!email){ errEl.textContent = "Falta el email de destino."; return; }
      destino = {
        email,
        asunto: document.getElementById("fEmailAsunto").value.trim(),
        mensaje: document.getElementById("fEmailMensaje").value.trim()
      };
    } else if(currentType === "telefono"){
      const numero = document.getElementById("fTelefono").value.trim();
      if(!numero){ errEl.textContent = "Falta el número de teléfono."; return; }
      destino = { numero };
    } else if(currentType === "sms"){
      const numero = document.getElementById("fSmsNumero").value.trim();
      if(!numero){ errEl.textContent = "Falta el número de teléfono."; return; }
      destino = { numero, mensaje: document.getElementById("fSmsMensaje").value.trim() };
    } else if(currentType === "ubicacion"){
      const lat = document.getElementById("fLat").value.trim();
      const lng = document.getElementById("fLng").value.trim();
      if(!lat || !lng){ errEl.textContent = "Faltan las coordenadas."; return; }
      destino = { lat, lng };
    }

    const uid = auth.currentUser.uid;
    try{
      if(editingId){
        await db.collection("qrs").doc(editingId).update({ nombre, tipo: currentType, destino });
        closeModal();
      } else {
        const docRef = await db.collection("qrs").add({
          nombre, tipo: currentType, destino,
          ownerId: uid, activo: true, escaneos: 0,
          creado: firebase.firestore.FieldValue.serverTimestamp()
        });
        closeModal();
        const snap = await docRef.get();
        openDetail(docRef.id, snap.data());
      }
    }catch(e){
      errEl.textContent = "Error al guardar: " + e.message;
    }
  };

  /* ---------- detalle / QR visual ---------- */
  const detailOverlay = document.getElementById("detailOverlay");
  let currentQrLink = "";

  function openDetail(id, d){
    document.getElementById("detailTitle").textContent = d.nombre || "Tu QR";
    currentQrLink = `${BASE_URL}?r=${id}`;
    document.getElementById("detailLink").textContent = currentQrLink;
    const holder = document.getElementById("qrcanvas");
    holder.innerHTML = "";
    new QRCode(holder, {
      text: currentQrLink,
      width: 220, height: 220,
      colorDark: "#14171B",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M
    });
    detailOverlay.classList.remove("hidden");
  }
}

