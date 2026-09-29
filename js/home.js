/* Módulo Home: landing, auth UI y el generador de QR gratis sin cuenta */
function paintHeroMatrix(el){
  if(!el) return;
  el.innerHTML = "";
  const cells = 121;
  const active = new Set();
  while(active.size < 52){ active.add(Math.floor(Math.random()*cells)); }
  for(let i=0;i<cells;i++){
    const s = document.createElement("span");
    if(active.has(i)){
      s.style.animationDuration = (1.6 + Math.random()*2.2)+"s";
      s.style.animationDelay = (Math.random()*2)+"s";
    } else {
      s.style.background = "transparent";
      s.style.animation = "none";
    }
    el.appendChild(s);
  }
}


function leerHistorialGratis(){
  try{ return JSON.parse(localStorage.getItem("tresnaQrGratis") || "[]"); }
  catch(e){ return []; }
}
function guardarEnHistorialGratis(entry){
  try{
    const historial = leerHistorialGratis();
    historial.unshift(entry);
    localStorage.setItem("tresnaQrGratis", JSON.stringify(historial.slice(0, 10)));
  }catch(e){ /* localStorage puede fallar en modo privado, no rompemos el flujo por eso */ }
}
function etiquetaHistorial(entry){
  return entry.tipo === "url" ? entry.qrText : `Contacto: ${entry.qrText.match(/FN:(.*)/)?.[1] || ""}`;
}
async function pintarHistorialGratis(){
  const wrap = document.getElementById("staticHistoryWrap");
  const list = document.getElementById("staticHistoryList");
  const historial = leerHistorialGratis();
  if(historial.length === 0){ wrap.classList.add("hidden"); return; }
  wrap.classList.remove("hidden");
  list.innerHTML = "";
  if(typeof QRCode === "undefined"){
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js");
  }
  historial.forEach(entry=>{
    const row = document.createElement("div");
    row.className = "historyrow";
    row.innerHTML = `<span class="htxt">${etiquetaHistorial(entry)}</span><button class="btn small ghost">Descargar de nuevo</button>`;
    row.querySelector("button").onclick = ()=>{
      const tmp = document.createElement("div");
      new QRCode(tmp, { text: entry.qrText, width:220, height:220, colorDark:"#14171B", colorLight:"#ffffff", correctLevel: QRCode.CorrectLevel.M });
      setTimeout(()=>{
        const img = tmp.querySelector("img") || tmp.querySelector("canvas");
        const a = document.createElement("a");
        a.download = "qr.png";
        a.href = img.tagName === "CANVAS" ? img.toDataURL("image/png") : img.src;
        a.click();
      }, 50);
    };
    list.appendChild(row);
  });
}

function abrirQrGratis(){
  const overlay = document.getElementById("staticOverlay");
  document.getElementById("staticUrl").value = "";
  document.getElementById("staticVName").value = "";
  document.getElementById("staticVPhone").value = "";
  document.getElementById("staticVEmail").value = "";
  document.getElementById("staticVOrg").value = "";
  document.getElementById("staticResult").classList.add("hidden");
  document.getElementById("staticDownload").classList.add("hidden");
  overlay.classList.remove("hidden");
  pintarHistorialGratis();
}
document.getElementById("tryFreeBtn").onclick = abrirQrGratis;
document.getElementById("planGratisBtn").onclick = abrirQrGratis;
document.getElementById("staticClose").onclick = ()=> document.getElementById("staticOverlay").classList.add("hidden");

let staticType = "url";
document.querySelectorAll('[data-statictype]').forEach(b=>{
  b.onclick = ()=>{
    document.querySelectorAll('[data-statictype]').forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    staticType = b.dataset.statictype;
    document.getElementById("staticFields-url").classList.toggle("hidden", staticType!=="url");
    document.getElementById("staticFields-vcard").classList.toggle("hidden", staticType!=="vcard");
    document.getElementById("staticResult").classList.add("hidden");
    document.getElementById("staticDownload").classList.add("hidden");
  };
});

document.getElementById("staticGenBtn").onclick = async ()=>{
  let qrText = "";

  if(staticType === "url"){
    let url = document.getElementById("staticUrl").value.trim();
    if(!url) return;
    if(!/^https?:\/\//i.test(url)){ url = "https://" + url; }
    qrText = url;
  } else {
    const nombre = document.getElementById("staticVName").value.trim();
    if(!nombre) return;
    const telefono = document.getElementById("staticVPhone").value.trim();
    const email = document.getElementById("staticVEmail").value.trim();
    const org = document.getElementById("staticVOrg").value.trim();
    qrText = `BEGIN:VCARD\nVERSION:3.0\nFN:${nombre}\nORG:${org}\nTEL:${telefono}\nEMAIL:${email}\nEND:VCARD`;
  }

  if(typeof QRCode === "undefined"){
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js");
  }
  const holder = document.getElementById("staticQrCanvas");
  holder.innerHTML = "";
  new QRCode(holder, { text: qrText, width:220, height:220, colorDark:"#14171B", colorLight:"#ffffff", correctLevel: QRCode.CorrectLevel.M });
  document.getElementById("staticResult").classList.remove("hidden");

  guardarEnHistorialGratis({ tipo: staticType, qrText, fecha: Date.now() });
  pintarHistorialGratis();

  const dlBtn = document.getElementById("staticDownload");
  dlBtn.classList.remove("hidden");
  dlBtn.onclick = ()=>{
    const img = holder.querySelector("img") || holder.querySelector("canvas");
    const a = document.createElement("a");
    a.download = "qr.png";
    a.href = img.tagName === "CANVAS" ? img.toDataURL("image/png") : img.src;
    a.click();
  };
};


function wireAuthUI(){
  const homeView = document.getElementById("homeView");
  const authView = document.getElementById("authView");
  let isRegisterMode = false;

  function updateAuthLabels(){
    document.getElementById("authTitle").textContent = isRegisterMode ? "Crear cuenta" : "Iniciar sesión";
    document.getElementById("authSubmit").textContent = isRegisterMode ? "Crear cuenta" : "Entrar";
    document.getElementById("authSwitchLabel").textContent = isRegisterMode ? "¿Ya tenés cuenta?" : "¿No tenés cuenta?";
    document.getElementById("authSwitchBtn").textContent = isRegisterMode ? "Iniciar sesión" : "Crear una";
    document.getElementById("authErr").textContent = "";
  }
  function showAuth(registerMode){
    homeView.classList.add("hidden");
    authView.classList.remove("hidden");
    isRegisterMode = registerMode;
    updateAuthLabels();
  }

  document.getElementById("navLoginBtn").onclick = ()=> showAuth(false);
  document.getElementById("heroLoginBtn").onclick = ()=> showAuth(false);
  document.getElementById("footerLoginBtn").onclick = ()=> showAuth(false);
  document.getElementById("heroRegisterBtn").onclick = ()=> showAuth(true);
  document.querySelectorAll('[data-homeplan]').forEach(b=>{
    b.onclick = ()=>{
      sessionStorage.setItem("planElegido", b.dataset.homeplan);
      showAuth(true);
    };
  });
  document.getElementById("staticGoRegister").onclick = ()=>{
    document.getElementById("staticOverlay").classList.add("hidden");
    showAuth(true);
  };
  document.getElementById("backToHomeBtn").onclick = ()=>{
    authView.classList.add("hidden");
    homeView.classList.remove("hidden");
  };
  document.getElementById("authSwitchBtn").onclick = ()=>{
    isRegisterMode = !isRegisterMode;
    updateAuthLabels();
  };

  document.getElementById("authSubmit").onclick = async ()=>{
    const email = document.getElementById("authEmail").value.trim();
    const pass = document.getElementById("authPass").value;
    const errEl = document.getElementById("authErr");
    errEl.textContent = "";
    if(!auth){ errEl.textContent = "Un segundo, todavía estamos cargando…"; return; }
    if(!email || !pass){ errEl.textContent = "Completá email y contraseña."; return; }
    try{
      if(isRegisterMode){
        await auth.createUserWithEmailAndPassword(email, pass);
      } else {
        await auth.signInWithEmailAndPassword(email, pass);
      }
    }catch(e){
      errEl.textContent = traducirError(e.code);
    }
  };

  document.getElementById("googleBtn").onclick = async ()=>{
    const errEl = document.getElementById("authErr");
    errEl.textContent = "";
    if(!auth){ errEl.textContent = "Un segundo, todavía estamos cargando…"; return; }
    try{
      const provider = new firebase.auth.GoogleAuthProvider();
      await auth.signInWithPopup(provider);
    }catch(e){
      errEl.textContent = traducirError(e.code);
    }
  };
}

