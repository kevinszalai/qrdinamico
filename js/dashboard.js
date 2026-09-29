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
    if(user && user.email === ADMIN_EMAIL){
      // Es la cuenta de admin pero entró sin ?admin=1: la mandamos al panel correcto
      window.location.search = "?admin=1";
      return;
    }
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

  function actualizarVisibilidadDash(){
    const sinPlan = !currentPlan;
    document.getElementById("welcomeScreen").classList.toggle("hidden", !sinPlan);
    document.getElementById("dashContent").classList.toggle("hidden", sinPlan);
  }

  function watchPlan(uid){
    db.collection("usuarios").doc(uid).onSnapshot(doc=>{
      const planId = (doc.exists && PLANES[doc.data().plan]) ? doc.data().plan : null;
      currentPlan = planId;
      const badge = document.getElementById("planBadge");
      const miSuscripcionBtn = document.getElementById("miSuscripcionBtn");
      if(planId){
        const p = PLANES[planId];
        badge.textContent = `Plan ${p.nombre} · ${p.limite ? "hasta "+p.limite : "ilimitados"}`;
        badge.classList.add("pro");
        miSuscripcionBtn.classList.remove("hidden");
        document.getElementById("proBanner").classList.add("hidden");
      } else {
        badge.textContent = "Sin plan";
        badge.classList.remove("pro");
        miSuscripcionBtn.classList.add("hidden");
        // Recién registrado (o todavía sin pagar): si vino de la Home con un plan
        // ya elegido, lo mandamos directo a pagar; si no, le mostramos la bienvenida.
        if(!planPromptShown && !volviendoDePago){
          planPromptShown = true;
          const planElegido = sessionStorage.getItem("planElegido");
          if(planElegido && PLANES[planElegido]){
            sessionStorage.removeItem("planElegido");
            iniciarPago(planElegido, null, "welcomeErr");
          }
        }
      }
      actualizarVisibilidadDash();
    }, err=>{
      // Si falla el permiso (o cualquier otro motivo), no mostramos un error feo:
      // tratamos a la persona como "sin plan todavía" y la mandamos a elegir uno.
      console.error("No se pudo leer el plan del usuario:", err);
      currentPlan = null;
      document.getElementById("planBadge").textContent = "Sin plan";
      document.getElementById("planBadge").classList.remove("pro");
      document.getElementById("miSuscripcionBtn").classList.add("hidden");
      actualizarVisibilidadDash();
    });
  }

  const PRECIOS_BASE = { starter: 4999, pro: 9999, negocio: 19999 };
  let cuponActivo = null;

  function resetPreciosVisuales(){
    const valores = {
      priceStarter: PRECIOS_BASE.starter, pricePro: PRECIOS_BASE.pro, priceNegocio: PRECIOS_BASE.negocio,
      welcomePriceStarter: PRECIOS_BASE.starter, welcomePricePro: PRECIOS_BASE.pro, welcomePriceNegocio: PRECIOS_BASE.negocio
    };
    Object.entries(valores).forEach(([id, precio])=>{
      const el = document.getElementById(id);
      if(el) el.innerHTML = `$${precio.toLocaleString("es-AR")}<span>/mes</span>`;
    });
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

  async function aplicarCupon(codigoInputId, msgId){
    const codigo = document.getElementById(codigoInputId).value.trim();
    const msgEl = document.getElementById(msgId);
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
          const base = planId === "starter" ? "Starter" : planId === "pro" ? "Pro" : "Negocio";
          const html = `<span style="text-decoration:line-through; font-size:15px; color:var(--ink-soft); font-weight:400;">$${data.precioBase.toLocaleString("es-AR")}</span> $${data.precioFinal.toLocaleString("es-AR")}<span>/mes</span>`;
          const el1 = document.getElementById("price"+base);
          const el2 = document.getElementById("welcomePrice"+base);
          if(el1) el1.innerHTML = html;
          if(el2) el2.innerHTML = html;
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
  }
  document.getElementById("cuponAplicarBtn").onclick = ()=> aplicarCupon("cuponInput", "cuponMsg");
  document.getElementById("welcomeCuponBtn").onclick = ()=> aplicarCupon("welcomeCuponInput", "welcomeCuponMsg");

  async function iniciarPago(planId, btn, errElId){
    const errEl = document.getElementById(errElId || "plansErr");
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
      } else if(data.cambiado){
        document.getElementById("plansOverlay").classList.add("hidden");
        alert(`¡Listo! Ya estás en el plan ${PLANES[data.plan].nombre}. Se ajusta en tu próxima factura de Mercado Pago, no te cobra dos veces.`);
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
    btn.onclick = ()=> iniciarPago(btn.dataset.plan, btn, "plansErr");
  });
  document.querySelectorAll("#welcomeScreen [data-welcomeplan]").forEach(btn=>{
    btn.onclick = ()=> iniciarPago(btn.dataset.welcomeplan, btn, "welcomeErr");
  });

  document.getElementById("logoutBtn").onclick = ()=>{
    auth.signOut().finally(()=>{ window.location.href = BASE_URL; });
  };

  /* ---------- Mi suscripción ---------- */
  document.getElementById("miSuscripcionBtn").onclick = async ()=>{
    const infoEl = document.getElementById("suscripcionInfo");
    const errEl = document.getElementById("suscripcionErr");
    errEl.textContent = "";
    infoEl.innerHTML = `<p class="sub">Cargando…</p>`;
    document.getElementById("suscripcionOverlay").classList.remove("hidden");
    try{
      const token = await auth.currentUser.getIdToken();
      const res = await fetch(`${FUNCTIONS_URL}/miSuscripcion`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      const p = PLANES[data.plan];
      if(!p){
        infoEl.innerHTML = `<p class="sub">No tenés un plan activo.</p>`;
        document.getElementById("cancelarSuscripcionBtn").classList.add("hidden");
        return;
      }
      document.getElementById("cancelarSuscripcionBtn").classList.remove("hidden");
      const precio = data.precioConCupon || PRECIOS_BASE[data.plan];
      const proximoPagoTxt = data.proximoPago
        ? new Date(data.proximoPago).toLocaleDateString("es-AR", { day:"numeric", month:"long", year:"numeric" })
        : null;
      infoEl.innerHTML = `
        <p style="font-size:16px; font-weight:600; margin-bottom:4px;">Plan ${p.nombre}</p>
        <p class="sub" style="margin-bottom:2px;">$${precio.toLocaleString("es-AR")}/mes · hasta ${p.limite || "QR ilimitados"}${p.limite ? " QR dinámicos" : ""}</p>
        ${data.cuponAplicado ? `<p class="sub" style="margin-bottom:2px;">Cupón aplicado: ${data.cuponAplicado}</p>` : ""}
        ${proximoPagoTxt ? `<p class="sub" style="margin-bottom:2px;"><b style="color:var(--ink);">Próximo pago:</b> ${proximoPagoTxt} (fecha aproximada)</p>` : ""}
        <p class="sub" style="margin-top:10px;">Se renueva automáticamente todos los meses a través de Mercado Pago, hasta que la canceles.</p>
        <button class="btn ghost small" id="cambiarPlanBtn" style="margin-top:10px;">Subir o bajar de plan</button>
      `;
      document.getElementById("cambiarPlanBtn").onclick = ()=>{
        document.getElementById("suscripcionOverlay").classList.add("hidden");
        abrirPlanes();
      };
    }catch(e){
      infoEl.innerHTML = "";
      errEl.textContent = "No se pudo cargar tu suscripción. Probá de nuevo.";
    }
  };
  document.getElementById("suscripcionClose").onclick = ()=> document.getElementById("suscripcionOverlay").classList.add("hidden");

  document.getElementById("cancelarSuscripcionBtn").onclick = async ()=>{
    if(!confirm("¿Seguro que querés cancelar tu suscripción?\n\nOJO: tus QR dinámicos van a dejar de funcionar (van a quedar pausados) apenas se cancele — quien los escanee no va a llegar a ningún lado hasta que reactives un plan.")) return;
    const errEl = document.getElementById("suscripcionErr");
    const btn = document.getElementById("cancelarSuscripcionBtn");
    const original = btn.textContent;
    btn.textContent = "Cancelando…";
    errEl.textContent = "";
    try{
      const token = await auth.currentUser.getIdToken();
      const res = await fetch(`${FUNCTIONS_URL}/cancelarSuscripcion`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      if(data.ok){
        document.getElementById("suscripcionOverlay").classList.add("hidden");
        alert(`Tu suscripción fue cancelada. ${data.qrsPausados ? `${data.qrsPausados} QR quedaron pausados.` : ""}`);
      } else {
        errEl.textContent = data.error || "No se pudo cancelar. Probá de nuevo.";
      }
    }catch(e){
      errEl.textContent = "No se pudo conectar. Probá de nuevo.";
    }
    btn.textContent = original;
  };

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
      actualizarPreview();
    };
  });

  // ---- vista previa en vivo ----
  function leerDestinoFormulario(){
    switch(currentType){
      case "url": return { url: document.getElementById("fUrl").value.trim() };
      case "vcard": {
        const telNum = document.getElementById("fVPhone").value.trim();
        return {
          nombre: document.getElementById("fVName").value.trim(),
          telefono: telNum ? `${document.getElementById("fVPhoneCod").value} ${telNum}` : "",
          email: document.getElementById("fVEmail").value.trim(),
          org: document.getElementById("fVOrg").value.trim()
        };
      }
      case "wifi": return {
        ssid: document.getElementById("fWSsid").value.trim(),
        password: document.getElementById("fWPass").value,
        seguridad: document.getElementById("fWSec").value
      };
      case "texto": return { contenido: document.getElementById("fTexto").value.trim() };
      case "email": return {
        email: document.getElementById("fEmail").value.trim(),
        asunto: document.getElementById("fEmailAsunto").value.trim(),
        mensaje: document.getElementById("fEmailMensaje").value.trim()
      };
      case "telefono": {
        const num = document.getElementById("fTelefono").value.trim();
        return { numero: num ? `${document.getElementById("fTelefonoCod").value} ${num}` : "" };
      }
      case "sms": {
        const num = document.getElementById("fSmsNumero").value.trim();
        return {
          numero: num ? `${document.getElementById("fSmsNumeroCod").value} ${num}` : "",
          mensaje: document.getElementById("fSmsMensaje").value.trim()
        };
      }
      case "ubicacion": return {
        lat: document.getElementById("fLat").value.trim(),
        lng: document.getElementById("fLng").value.trim()
      };
      default: return {};
    }
  }

  function textoQrPreview(tipo, d){
    switch(tipo){
      case "url": return d.url ? (/^https?:\/\//i.test(d.url) ? d.url : "https://"+d.url) : "";
      case "vcard": return d.nombre ? `BEGIN:VCARD\nVERSION:3.0\nFN:${d.nombre}\nORG:${d.org||""}\nTEL:${d.telefono||""}\nEMAIL:${d.email||""}\nEND:VCARD` : "";
      case "wifi": return d.ssid ? `WIFI:T:${d.seguridad==="nopass"?"nopass":d.seguridad};S:${d.ssid};P:${d.password||""};;` : "";
      case "texto": return d.contenido || "";
      case "email": return d.email ? `mailto:${d.email}` : "";
      case "telefono": return d.numero ? `tel:${d.numero}` : "";
      case "sms": return d.numero ? `sms:${d.numero}` : "";
      case "ubicacion": return (d.lat && d.lng) ? `geo:${d.lat},${d.lng}` : "";
      default: return "";
    }
  }

  let previewDebounce;
  function actualizarPreview(){
    clearTimeout(previewDebounce);
    previewDebounce = setTimeout(async ()=>{
      const tagEl = document.getElementById("previewTag");
      tagEl.textContent = currentType;
      tagEl.className = "tag " + currentType;
      document.getElementById("previewNombre").textContent = document.getElementById("fNombre").value.trim() || "Sin nombre";

      const d = leerDestinoFormulario();
      document.getElementById("previewDest").textContent = destinoPreview({ tipo: currentType, destino: d }) || "Completá los datos…";

      const texto = textoQrPreview(currentType, d);
      const holder = document.getElementById("previewQrHolder");
      if(!texto){
        holder.innerHTML = '<span style="font-size:11px; color:var(--ink-soft); text-align:center; padding:10px;">Completá los datos para ver el QR</span>';
        return;
      }
      if(typeof QRCode === "undefined"){
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js");
      }
      holder.innerHTML = "";
      new QRCode(holder, { text: texto, width:150, height:150, colorDark:"#14171B", colorLight:"#ffffff", correctLevel: QRCode.CorrectLevel.M });
    }, 250);
  }
  document.querySelector(".modal-form").addEventListener("input", actualizarPreview);
  document.querySelector(".modal-form").addEventListener("change", actualizarPreview);

  function openModal(existing, id){
    editingId = id || null;
    document.getElementById("modalTitle").textContent = existing ? "Editar QR" : "Nuevo QR";
    document.getElementById("modalErr").textContent = "";
    currentType = existing ? existing.tipo : "url";
    document.querySelectorAll(".typebtn[data-type]").forEach(b=> b.classList.toggle("active", b.dataset.type===currentType));
    ["url","vcard","wifi","texto","email","telefono","sms","ubicacion"].forEach(t=> document.getElementById("fields-"+t).classList.toggle("hidden", t!==currentType));

    ["fVPhoneCod","fTelefonoCod","fSmsNumeroCod"].forEach(id=>{
      const sel = document.getElementById(id);
      if(!sel.options.length){ sel.innerHTML = opcionesCodigoPais("+54"); }
    });

    const telV = separarCodigoTelefono(existing?.destino?.telefono);
    const telT = separarCodigoTelefono(existing?.tipo === "telefono" ? existing?.destino?.numero : null);
    const telS = separarCodigoTelefono(existing?.tipo === "sms" ? existing?.destino?.numero : null);

    document.getElementById("fNombre").value = existing?.nombre || "";
    document.getElementById("fUrl").value = existing?.destino?.url || "";
    document.getElementById("fVName").value = existing?.destino?.nombre || "";
    document.getElementById("fVPhoneCod").value = telV.cod;
    document.getElementById("fVPhone").value = existing?.destino?.telefono ? telV.numero : "";
    document.getElementById("fVEmail").value = existing?.destino?.email || "";
    document.getElementById("fVOrg").value = existing?.destino?.org || "";
    document.getElementById("fWSsid").value = existing?.destino?.ssid || "";
    document.getElementById("fWPass").value = existing?.destino?.password || "";
    document.getElementById("fWSec").value = existing?.destino?.seguridad || "WPA";
    document.getElementById("fTexto").value = existing?.destino?.contenido || "";
    document.getElementById("fEmail").value = existing?.destino?.email || "";
    document.getElementById("fEmailAsunto").value = existing?.destino?.asunto || "";
    document.getElementById("fEmailMensaje").value = existing?.destino?.mensaje || "";
    document.getElementById("fTelefonoCod").value = telT.cod;
    document.getElementById("fTelefono").value = (existing?.tipo === "telefono" && existing?.destino?.numero) ? telT.numero : "";
    document.getElementById("fSmsNumeroCod").value = telS.cod;
    document.getElementById("fSmsNumero").value = (existing?.tipo === "sms" && existing?.destino?.numero) ? telS.numero : "";
    document.getElementById("fSmsMensaje").value = existing?.destino?.mensaje || "";
    document.getElementById("fLat").value = existing?.destino?.lat || "";
    document.getElementById("fLng").value = existing?.destino?.lng || "";

    overlay.classList.remove("hidden");
    actualizarPreview();
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
      const telVNum = document.getElementById("fVPhone").value.trim();
      destino = {
        nombre: nombreV,
        telefono: telVNum ? `${document.getElementById("fVPhoneCod").value} ${telVNum}` : "",
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
      destino = { numero: `${document.getElementById("fTelefonoCod").value} ${numero}` };
    } else if(currentType === "sms"){
      const numero = document.getElementById("fSmsNumero").value.trim();
      if(!numero){ errEl.textContent = "Falta el número de teléfono."; return; }
      destino = { numero: `${document.getElementById("fSmsNumeroCod").value} ${numero}`, mensaje: document.getElementById("fSmsMensaje").value.trim() };
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

