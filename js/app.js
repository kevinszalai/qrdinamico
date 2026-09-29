/* Arranque: decide qué vista mostrar (escaneo, admin, home/dashboard) */
const params = new URLSearchParams(window.location.search);
const scanId = params.get("r");

const esRutaAdmin = new URLSearchParams(window.location.search).get("admin") === "1";

if(!configOk){
  document.getElementById("setupView").classList.remove("hidden");
  document.getElementById("viewDemoBtn").onclick = ()=>{
    loadScript("https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js").then(enterDemoMode);
  };
} else if(esRutaAdmin){
  bootAdmin();
} else if(scanId){
  fastRedirect(scanId);
} else {
  document.getElementById("homeView").classList.remove("hidden");
  paintMatrix(document.getElementById("navMatrix"));
  paintHeroMatrix(document.getElementById("heroMatrix"));
  wireAuthUI();
  bootDashboard();
}

