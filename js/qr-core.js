/* Módulo Core: redirect rápido (lo que ve alguien que escanea un QR) */
async function fastRedirect(id){
  document.getElementById("redirectView").classList.remove("hidden");
  const content = document.getElementById("redirectContent");
  const spinner = document.getElementById("redirectSpinner");
  const projectId = firebaseConfig.projectId;
  const docPath = `projects/${projectId}/databases/(default)/documents/qrs/${id}`;

  try{
    const res = await fetch(`https://firestore.googleapis.com/v1/${docPath}`);
    if(res.status === 404){
      spinner.classList.add("hidden");
      content.innerHTML = `<b class="display" style="font-size:18px;">Este código no existe</b>`;
      return;
    }
    const data = parseFirestoreDoc(await res.json());

    if(data.activo === false){
      spinner.classList.add("hidden");
      content.innerHTML = `<b class="display" style="font-size:18px;">Este código ya no está activo</b>
        <p style="color:var(--ink-soft); font-size:13px; margin-top:6px;">Consultá con quien lo compartió.</p>`;
      return;
    }

    // suma el escaneo en paralelo, sin retrasar el redirect
    fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      keepalive: true,
      body: JSON.stringify({ writes: [{ transform: {
        document: docPath,
        fieldTransforms: [{ fieldPath: "escaneos", increment: { integerValue: "1" } }]
      }}]})
    }).catch(()=>{});

    if(data.tipo === "url"){
      window.location.replace(data.destino.url);
      return;
    }
    if(data.tipo === "vcard"){
      spinner.classList.add("hidden");
      const d = data.destino;
      const vcf = `BEGIN:VCARD\nVERSION:3.0\nFN:${d.nombre||""}\nORG:${d.org||""}\nTEL:${d.telefono||""}\nEMAIL:${d.email||""}\nEND:VCARD`;
      const blob = new Blob([vcf], {type:"text/vcard"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${d.nombre||"contacto"}.vcf`; a.click();
      content.innerHTML = `<b class="display" style="font-size:18px;">${d.nombre||"Contacto"}</b>
        <p style="color:var(--ink-soft); font-size:13px; margin-top:6px;">Se descargó el contacto. Abrilo para guardarlo.</p>`;
      return;
    }
    if(data.tipo === "wifi"){
      spinner.classList.add("hidden");
      const d = data.destino;
      content.innerHTML = `<div class="wifidone">
        <b class="display" style="font-size:18px;">Conectate a ${d.ssid}</b>
        <p style="color:var(--ink-soft); font-size:13px; margin-top:4px;">Seguridad: ${d.seguridad}</p>
        ${d.seguridad!=="nopass" ? `<div class="pass">${d.password}</div>` : ""}
      </div>`;
      return;
    }
    if(data.tipo === "texto"){
      spinner.classList.add("hidden");
      content.innerHTML = `<div style="max-width:360px;"><p style="font-size:16px; line-height:1.5; white-space:pre-wrap;">${data.destino.contenido}</p></div>`;
      return;
    }
    if(data.tipo === "email"){
      const d = data.destino;
      const params = new URLSearchParams();
      if(d.asunto) params.set("subject", d.asunto);
      if(d.mensaje) params.set("body", d.mensaje);
      const qs = params.toString();
      window.location.replace(`mailto:${d.email}${qs ? "?"+qs : ""}`);
      return;
    }
    if(data.tipo === "telefono"){
      window.location.replace(`tel:${data.destino.numero}`);
      return;
    }
    if(data.tipo === "sms"){
      const d = data.destino;
      window.location.replace(`sms:${d.numero}${d.mensaje ? "?body="+encodeURIComponent(d.mensaje) : ""}`);
      return;
    }
    if(data.tipo === "ubicacion"){
      const d = data.destino;
      window.location.replace(`https://www.google.com/maps?q=${d.lat},${d.lng}`);
      return;
    }
  }catch(e){
    spinner.classList.add("hidden");
    content.innerHTML = `<b style="color:var(--signal);">Error al cargar el código</b>
      <p style="color:var(--ink-soft); font-size:13px; margin-top:6px;">${e.message}</p>`;
  }
}

