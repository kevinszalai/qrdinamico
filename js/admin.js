/* Módulo Gestión: panel de administrador (stats, usuarios, cupones) */
async function bootAdmin(){
  try{
    await loadScript("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
    await Promise.all([
      loadScript("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"),
      loadScript("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js")
    ]);
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    initAdmin();
  }catch(e){
    document.body.innerHTML = `<div class="redirectwrap"><b style="color:var(--signal);">No se pudo cargar el panel</b></div>`;
  }
}

function initAdmin(){
  const loginView = document.getElementById("adminLoginView");
  const panelView = document.getElementById("adminView");

  auth.onAuthStateChanged(user=>{
    if(user && user.email === ADMIN_EMAIL){
      loginView.classList.add("hidden");
      panelView.classList.remove("hidden");
      cargarStats();
      cargarCupones();
    } else {
      panelView.classList.add("hidden");
      loginView.classList.remove("hidden");
      if(user && user.email !== ADMIN_EMAIL){
        auth.signOut(); // sesión de un usuario normal, no es la cuenta admin
      }
    }
  });

  document.getElementById("adminLoginBtn").onclick = async ()=>{
    const usuario = document.getElementById("adminUser").value.trim();
    const pass = document.getElementById("adminPass").value;
    const errEl = document.getElementById("adminLoginErr");
    errEl.textContent = "";
    if(!usuario || !pass){ errEl.textContent = "Completá usuario y contraseña."; return; }
    try{
      await auth.signInWithEmailAndPassword(`${usuario}@admin.qrtresna.local`, pass);
    }catch(e){
      errEl.textContent = "Usuario o contraseña incorrectos.";
    }
  };
  document.getElementById("adminLogoutBtn").onclick = ()=> auth.signOut();

  async function llamarAdmin(endpoint, opts){
    const token = await auth.currentUser.getIdToken();
    return fetch(`${FUNCTIONS_URL}/${endpoint}`, {
      ...opts,
      headers: { ...(opts?.headers||{}), "Authorization": `Bearer ${token}` }
    });
  }

  async function cargarStats(q){
    try{
      const res = await llamarAdmin(`adminStats${q ? "?q="+encodeURIComponent(q) : ""}`, { method:"GET" });
      const data = await res.json();
      document.getElementById("statUsuarios").textContent = data.totalUsuarios ?? "–";
      document.getElementById("statQrs").textContent = data.totalQrs ?? "–";
      const porPlanTxt = Object.entries(data.porPlan||{}).map(([k,v])=> `${k}: ${v}`).join(" · ");
      document.getElementById("statPorPlan").textContent = porPlanTxt || "–";

      const tbody = document.getElementById("adminUsuariosBody");
      tbody.innerHTML = "";
      (data.usuarios||[]).forEach(u=>{
        const tr = document.createElement("tr");
        const fecha = u.creado ? new Date(u.creado).toLocaleDateString("es-AR") : "–";
        tr.innerHTML = `<td>${u.email||"—"}</td><td>${u.plan||"sin plan"}</td><td>${u.qrs}</td><td>${u.cuponAplicado||"—"}</td><td>${fecha}</td>`;
        tbody.appendChild(tr);
      });
    }catch(e){
      console.error(e);
    }
  }

  let buscarTimeout;
  document.getElementById("adminBuscar").oninput = (e)=>{
    clearTimeout(buscarTimeout);
    buscarTimeout = setTimeout(()=> cargarStats(e.target.value.trim()), 350);
  };

  async function cargarCupones(){
    try{
      const res = await llamarAdmin("listarCupones", { method:"GET" });
      const data = await res.json();
      const tbody = document.getElementById("adminCuponesBody");
      tbody.innerHTML = "";
      (data.cupones||[]).forEach(c=>{
        const tr = document.createElement("tr");
        const valorTxt = c.tipo === "free" ? "—" : c.tipo === "porcentaje" ? `${c.valor}%` : `$${c.valor}`;
        const planesTxt = c.planes === "todos" ? "Todos" : (c.planes||[]).join(", ");
        tr.innerHTML = `<td>${c.id}</td><td>${c.tipo}</td><td>${valorTxt}</td><td>${planesTxt}</td><td>${c.duracionMeses} mes(es)</td><td>${c.activo!==false?"activo":"pausado"}</td><td><button data-cod="${c.id}">Borrar</button></td>`;
        tr.querySelector("button").onclick = async ()=>{
          if(!confirm(`¿Borrar el cupón ${c.id}?`)) return;
          await llamarAdmin("eliminarCupon", {
            method:"POST", headers:{"Content-Type":"application/json"},
            body: JSON.stringify({ codigo: c.id })
          });
          cargarCupones();
        };
        tbody.appendChild(tr);
      });
    }catch(e){
      console.error(e);
    }
  }

  const cuponModal = document.getElementById("cuponModalOverlay");
  document.getElementById("adminNuevoCuponBtn").onclick = ()=>{
    document.getElementById("cCodigo").value = "";
    document.getElementById("cTipo").value = "porcentaje";
    document.getElementById("cValor").value = "";
    document.getElementById("cPlanes").value = "todos";
    document.getElementById("cDuracion").value = "1";
    document.getElementById("cuponModalErr").textContent = "";
    document.getElementById("cValorWrap").style.display = "block";
    cuponModal.classList.remove("hidden");
  };
  document.getElementById("cuponModalCancel").onclick = ()=> cuponModal.classList.add("hidden");
  document.getElementById("cTipo").onchange = (e)=>{
    document.getElementById("cValorWrap").style.display = e.target.value === "free" ? "none" : "block";
  };
  document.getElementById("cuponModalGuardar").onclick = async ()=>{
    const codigo = document.getElementById("cCodigo").value.trim();
    const tipo = document.getElementById("cTipo").value;
    const valor = document.getElementById("cValor").value;
    const planesSel = document.getElementById("cPlanes").value;
    const duracionMeses = document.getElementById("cDuracion").value;
    const errEl = document.getElementById("cuponModalErr");
    if(!codigo){ errEl.textContent = "Falta el código del cupón."; return; }
    if(tipo !== "free" && !valor){ errEl.textContent = "Falta el valor del descuento."; return; }
    try{
      await llamarAdmin("guardarCupon", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          codigo, tipo, valor,
          planes: planesSel === "todos" ? "todos" : [planesSel],
          duracionMeses, activo: true
        })
      });
      cuponModal.classList.add("hidden");
      cargarCupones();
    }catch(e){
      errEl.textContent = "No se pudo guardar el cupón.";
    }
  };
}

