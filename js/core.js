/* Módulo Core: helpers compartidos (matriz decorativa, carga de scripts, parseo de Firestore REST, mensajes de error) */

const CODIGOS_PAIS = [
  { cod:"+54", pais:"Argentina" },
  { cod:"+598", pais:"Uruguay" },
  { cod:"+56", pais:"Chile" },
  { cod:"+595", pais:"Paraguay" },
  { cod:"+591", pais:"Bolivia" },
  { cod:"+51", pais:"Perú" },
  { cod:"+57", pais:"Colombia" },
  { cod:"+58", pais:"Venezuela" },
  { cod:"+593", pais:"Ecuador" },
  { cod:"+52", pais:"México" },
  { cod:"+34", pais:"España" },
  { cod:"+1", pais:"Estados Unidos" },
  { cod:"+55", pais:"Brasil" },
];

function opcionesCodigoPais(seleccionado){
  return CODIGOS_PAIS.map(c=>
    `<option value="${c.cod}" ${c.cod===seleccionado?"selected":""}>${c.cod} ${c.pais}</option>`
  ).join("");
}

// Separa "+54 11 5555-5555" en { cod:"+54", numero:"11 5555-5555" }.
// Si no reconoce el código, deja Argentina por default y el texto completo en el número.
function separarCodigoTelefono(valor){
  valor = (valor || "").trim();
  const match = CODIGOS_PAIS
    .slice().sort((a,b)=> b.cod.length - a.cod.length)
    .find(c=> valor.startsWith(c.cod));
  if(match){
    return { cod: match.cod, numero: valor.slice(match.cod.length).trim() };
  }
  return { cod: "+54", numero: valor };
}

function paintMatrix(el){
  if(!el) return;
  el.innerHTML = "";
  const cells = 25;
  const active = new Set();
  while(active.size < 14){ active.add(Math.floor(Math.random()*cells)); }
  for(let i=0;i<cells;i++){
    const s = document.createElement("span");
    if(active.has(i)){
      s.style.animationDelay = (Math.random()*0.9)+"s";
    } else {
      s.style.background = "transparent";
    }
    el.appendChild(s);
  }
}
paintMatrix(document.getElementById("headMatrix"));
paintMatrix(document.getElementById("authMatrix"));
paintMatrix(document.getElementById("setupMatrix"));

// wiring del modal de detalle (compartido entre demo y modo real)
document.getElementById("detailClose").onclick = ()=> document.getElementById("detailOverlay").classList.add("hidden");
document.getElementById("copyLinkBtn").onclick = ()=>{
  navigator.clipboard.writeText(document.getElementById("detailLink").textContent);
  const b = document.getElementById("copyLinkBtn");
  const old = b.textContent; b.textContent = "¡Copiado!";
  setTimeout(()=> b.textContent = old, 1200);
};
document.getElementById("downloadBtn").onclick = ()=>{
  const img = document.querySelector("#qrcanvas img") || document.querySelector("#qrcanvas canvas");
  const a = document.createElement("a");
  a.download = "qr.png";
  a.href = img.tagName === "CANVAS" ? img.toDataURL("image/png") : img.src;
  a.click();
};

function loadScript(src){
  return new Promise((resolve, reject)=>{
    const s = document.createElement("script");
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}


function parseFirestoreValue(v){
  if(v.stringValue !== undefined) return v.stringValue;
  if(v.booleanValue !== undefined) return v.booleanValue;
  if(v.integerValue !== undefined) return parseInt(v.integerValue,10);
  if(v.doubleValue !== undefined) return v.doubleValue;
  if(v.mapValue !== undefined) return parseFirestoreDoc(v.mapValue);
  if(v.nullValue !== undefined) return null;
  if(v.arrayValue !== undefined) return (v.arrayValue.values||[]).map(parseFirestoreValue);
  return null;
}
function parseFirestoreDoc(doc){
  const out = {};
  const fields = doc.fields || {};
  for(const key in fields){ out[key] = parseFirestoreValue(fields[key]); }
  return out;
}


function traducirError(code){
  const map = {
    "auth/email-already-in-use":"Ese email ya tiene una cuenta.",
    "auth/invalid-email":"El email no es válido.",
    "auth/weak-password":"La contraseña necesita al menos 6 caracteres.",
    "auth/user-not-found":"No existe una cuenta con ese email.",
    "auth/wrong-password":"Contraseña incorrecta.",
    "auth/invalid-credential":"Email o contraseña incorrectos.",
    "auth/unauthorized-domain":"Este dominio no está autorizado en Firebase todavía. Agregalo en Authentication → Configuración → Dominios autorizados.",
    "auth/popup-closed-by-user":"Cerraste la ventana antes de terminar.",
    "auth/popup-blocked":"El navegador bloqueó la ventana emergente. Permitila e intentá de nuevo."
  };
  return map[code] || "Ocurrió un error. Probá de nuevo.";
}
