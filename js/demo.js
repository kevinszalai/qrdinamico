/* Módulo Gestión: modo demo (vista de muestra sin Firebase configurado) */
const DEMO_QRS = [
  { id:"d1", nombre:"Flyer evento LADEVI", tipo:"url", activo:true, escaneos:132,
    destino:{ url:"https://universal-assistance.com/ladevi2026" } },
  { id:"d2", nombre:"Tarjeta Kevin Szalai", tipo:"vcard", activo:true, escaneos:47,
    destino:{ nombre:"Kevin Szalai", telefono:"+54 9 11 5607 5594", email:"kevinszalai@hotmail.com", org:"Tresna" } },
  { id:"d3", nombre:"WiFi oficina Villa Crespo", tipo:"wifi", activo:false, escaneos:9,
    destino:{ ssid:"Tresna_Studio", password:"clave-segura-01", seguridad:"WPA" } },
  { id:"d4", nombre:"Menú mostrador", tipo:"url", activo:true, escaneos:301,
    destino:{ url:"https://tresna.app/menu" } }
];

function enterDemoMode(){
  document.getElementById("setupView").classList.add("hidden");
  document.getElementById("dashView").classList.remove("hidden");
  document.getElementById("userEmail").textContent = "demo@tresna.app";
  document.getElementById("logoutBtn").textContent = "salir de la demo";
  document.getElementById("logoutBtn").onclick = ()=> location.reload();
  document.getElementById("newQrBtn").onclick = ()=> alert("Esto es una vista de muestra. Conectá tu Firebase para crear QRs de verdad.");

  const grid = document.getElementById("qrGrid");
  const empty = document.getElementById("emptyState");
  empty.classList.add("hidden");
  grid.innerHTML = "";

  DEMO_QRS.forEach(d=>{
    const el = document.createElement("div");
    el.className = "card";
    const destinoTexto = d.tipo==="url" ? d.destino.url
      : d.tipo==="vcard" ? `${d.destino.nombre} · ${d.destino.telefono||""}`
      : `Red: ${d.destino.ssid}`;
    el.innerHTML = `
      <div class="card-top">
        <span class="tag ${d.tipo}">${d.tipo}</span>
        <span class="status-dot ${d.activo?'on':''}" title="${d.activo?'activo':'pausado'}"></span>
      </div>
      <h3>${d.nombre}</h3>
      <div class="dest">${destinoTexto}</div>
      <div class="card-stats"><div>escaneos <b>${d.escaneos}</b></div></div>
      <div class="card-actions">
        <button class="btn small ghost" data-act="view">Ver QR</button>
        <button class="btn small ghost" data-act="edit">Editar</button>
        <button class="btn small ghost" data-act="toggle">${d.activo?'Pausar':'Activar'}</button>
        <button class="btn small danger" data-act="delete">Borrar</button>
      </div>
    `;
    const demoAlert = ()=> alert("Esto es una vista de muestra. Conectá tu Firebase para editar de verdad.");
    el.querySelector('[data-act="edit"]').onclick = demoAlert;
    el.querySelector('[data-act="toggle"]').onclick = demoAlert;
    el.querySelector('[data-act="delete"]').onclick = demoAlert;
    el.querySelector('[data-act="view"]').onclick = ()=>{
      document.getElementById("detailTitle").textContent = d.nombre;
      const link = `${BASE_URL}?r=${d.id}`;
      document.getElementById("detailLink").textContent = link;
      const holder = document.getElementById("qrcanvas");
      holder.innerHTML = "";
      new QRCode(holder, { text: link, width:220, height:220, colorDark:"#14171B", colorLight:"#ffffff", correctLevel: QRCode.CorrectLevel.M });
      document.getElementById("detailOverlay").classList.remove("hidden");
    };
    grid.appendChild(el);
  });
}
