// Cartera Diaria · aplicación (oficina, cobrador y cliente)
import { MODO_DEMO, backendDemo, backendFirebase, numeroRecibo, numeroPrestamo, correoCliente, estadoEmpresa, ms } from './backend.js';
import { REGISTRO_ABIERTO, DIAS_PRUEBA, SOPORTE, PLANES_SUSCRIPCION } from './config.js';

/* ===================== Utilidades ===================== */
const $=s=>document.querySelector(s);
const uid=()=>Math.random().toString(36).slice(2,9);
const pad=n=>String(n).padStart(2,'0');
const iso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parse=s=>{const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)};
const addDays=(s,n)=>{const d=parse(s);d.setDate(d.getDate()+n);return iso(d)};
const addMonths=(s,n)=>{const d=parse(s);d.setMonth(d.getMonth()+n);return iso(d)};
const diff=(a,b)=>Math.round((parse(b)-parse(a))/864e5);
const hoy=()=>iso(new Date());
const hora=()=>{const d=new Date();return `${pad(d.getHours())}:${pad(d.getMinutes())}`};
const DIAS=['dom','lun','mar','mié','jue','vie','sáb'];
const MESES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const MESESL=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const fcorta=s=>{const d=parse(s);return `${d.getDate()} ${MESES[d.getMonth()]}`};
const flarga=s=>{const d=parse(s);return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`};
const $$=n=>'$ '+Math.round(n||0).toLocaleString('es-CO');
const cmp=n=>n>=1e6?'$ '+(n/1e6).toLocaleString('es-CO',{maximumFractionDigits:1})+' M':n>=1e3?'$ '+Math.round(n/1e3)+' mil':'$ '+Math.round(n);
const pct=n=>(n*100).toLocaleString('es-CO',{maximumFractionDigits:2})+' %';
const pe=n=>Number(n).toLocaleString('es-CO',{maximumFractionDigits:2})+' %';
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const num=v=>Number(String(v).replace(/[^\d.,-]/g,'').replace(/\./g,'').replace(',','.'))||0;
const dec=v=>num(String(v).replace('.',','));
const r50=n=>Math.round(n/50)*50;
const sum=(a,f=x=>x)=>a.reduce((s,x)=>s+f(x),0);
const mesDe=s=>s.slice(0,7);


/* ===================== Motor de préstamos ===================== */
const FRECS={diaria:'Diaria',semanal:'Semanal',quincenal:'Quincenal',mensual:'Mensual'};
const FRECP={diaria:'diarias',semanal:'semanales',quincenal:'quincenales',mensual:'mensuales'};
const METODOS={frances:'Tasa mensual sobre saldo (cuota fija)',mensual:'Tasa mensual sobre el capital (interés fijo)',fijo:'Porcentaje fijo sobre el préstamo'};
const MODALIDADES={consumo:['Consumo y ordinario',19.49],bajo:['Consumo de bajo monto',44.58],prodMayor:['Productivo de mayor monto',27.92],
  prodRural:['Productivo rural',21.76],prodUrbano:['Productivo urbano',38.61],popRural:['Popular productivo rural',44.80],popUrbano:['Popular productivo urbano',58.75],otra:['Otra · escribir el valor',null]};
const usuraDe=k=>MODALIDADES[k]&&MODALIDADES[k][1]!=null?Math.round(MODALIDADES[k][1]*1.5*100)/100:null;
const mensualDe=ea=>(Math.pow(1+ea/100,1/12)-1)*100;
function cuotasPorMes(frec,domingos){return {diaria:domingos?30:26,semanal:30/7,quincenal:2,mensual:1}[frec]}
function fechasCuotas(inicio,frec,n,domingos){
  const out=[];let d=inicio;
  for(let k=1;k<=n;k++){
    if(frec==='diaria'){d=addDays(d,1);if(!domingos&&parse(d).getDay()===0)d=addDays(d,1);out.push(d);continue}
    let f=frec==='semanal'?addDays(inicio,7*k):frec==='quincenal'?addDays(inicio,15*k):addMonths(inicio,k);
    if(!domingos&&parse(f).getDay()===0)f=addDays(f,1);
    out.push(f);
  }
  return out;
}
function tasaEA(P,cuota,fechas,inicio){
  const d=fechas.map(f=>Math.max(1,diff(inicio,f)));
  if(cuota*fechas.length<=P)return 0;
  let r=0.001;
  for(let it=0;it<200;it++){
    let f=-P,fp=0;
    for(const di of d){const v=cuota*Math.pow(1+r,-di);f+=v;fp+=-di*v/(1+r)}
    const nr=r-f/fp;if(!isFinite(nr))break;
    r=Math.max(nr,-0.5);if(Math.abs(f)<1e-6)break;
  }
  return Math.pow(1+r,365)-1;
}
function simular(plan,P,inicio){
  const n=Math.max(1,Math.round(plan.cuotas)),t=plan.tasa/100,cpm=cuotasPorMes(plan.frecuencia,plan.domingos);
  let cuota;
  if(plan.metodo==='fijo')cuota=P*(1+t)/n;
  else if(plan.metodo==='mensual')cuota=P*(1+t*n/cpm)/n;
  else{const i=Math.pow(1+t,1/cpm)-1;cuota=i===0?P/n:P*i/(1-Math.pow(1+i,-n))}
  const r=S.config.redondeo||1;cuota=Math.max(r,Math.round(cuota/r)*r);
  const fechas=fechasCuotas(inicio,plan.frecuencia,n,plan.domingos);
  const total=cuota*n;
  return {n,cuota,total,interes:total-P,fechas,fin:fechas[n-1],ea:tasaEA(P,cuota,fechas,inicio)};
}
const vivos=l=>l.pagos.filter(p=>!p.anulado);
const abonos=l=>vivos(l).filter(p=>p.tipo!=='recargo');
const recargos=l=>vivos(l).filter(p=>p.tipo==='recargo');
const ratioInt=l=>(l.cuota*l.n-l.monto)/(l.cuota*l.n);
const interesDe=(l,p)=>p.tipo==='recargo'?p.monto:p.monto*ratioInt(l);
function comisionDe(k,pagos){const pc=(k.comision||0)/100;return sum(pagos,({l,p})=>p.tipo==='renovacion'?0:(k.comBase==='interes'?interesDe(l,p):p.monto)*pc)}
const pagosDe=(filtro)=>S.prestamos.flatMap(l=>vivos(l).filter(p=>filtro(p,l)).map(p=>({l,p})));
const baseTxt=k=>k.comBase==='interes'?'de los intereses':'de lo recaudado';
function estado(l,T=hoy()){
  const total=l.cuota*l.n,ab=abonos(l);
  const pagado=sum(ab,p=>p.monto);
  const pagoHoy=sum(ab.filter(p=>p.fecha===T&&p.tipo!=='renovacion'),p=>p.monto);
  const saldo=Math.max(0,total-pagado);
  const venc=l.fechas.filter(f=>f<=T).length;
  const vencAntes=l.fechas.filter(f=>f<T).length;
  const deudaVencida=Math.max(0,Math.min(total,vencAntes*l.cuota)-pagado);
  const aCobrarInicio=Math.max(0,Math.min(total,venc*l.cuota)-(pagado-pagoHoy));
  const cub=Math.min(l.n,Math.floor(pagado/l.cuota+1e-9));
  const dias=deudaVencida>0?diff(l.fechas[cub],T):0;
  const est=saldo<=0?'pagado':dias>0?'mora':'aldia';
  const noPagoHoy=(l.novedades||[]).find(v=>v.fecha===T);
  let ruta='pendiente';
  if(aCobrarInicio>0&&pagoHoy>=aCobrarInicio)ruta='pago';else if(pagoHoy>0)ruta='abono';else if(noPagoHoy)ruta='nopago';
  const enRuta=(saldo>0&&(l.fechas.includes(T)||deudaVencida>0))||pagoHoy>0||!!noPagoHoy;
  const m=S.config.mora;let recargo=0,diasCobro=0;
  if(m.activo&&dias>m.gracia&&saldo>0){
    diasCobro=dias-m.gracia;
    const porDia=m.tipo==='fijo'?m.valor:l.cuota*m.valor/100;
    const pagados=sum(recargos(l).filter(p=>p.fecha>=l.fechas[cub]),p=>p.monto);
    recargo=Math.max(0,r50(diasCobro*porDia-pagados));
  }
  return {total,pagado,saldo,cub,parcial:pagado-cub*l.cuota,venc,deudaVencida,aCobrarInicio,dias,est,pagoHoy,noPagoHoy,ruta,enRuta,recargo,diasCobro,
          interes:total-l.monto,sugerido:Math.min(saldo,Math.max(l.cuota,deudaVencida+(l.fechas.includes(T)?l.cuota:0)-pagoHoy))};
}
function revisar(ea){const c=S.config,e=ea*100+1e-9;return {sobreLimite:e>c.limiteEA,sobreUsura:e>c.usuraEA,bloq:c.bloquear&&e>c.limiteEA}}
const chipEstado=e=>e.est==='pagado'?'<span class="chip c-mut">Pagado</span>':e.est==='mora'?`<span class="chip c-bad">${e.dias} ${e.dias===1?'día':'días'} de atraso</span>`:'<span class="chip c-ok">Al día</span>';
const chipRuta={pago:'<span class="chip c-ok">Pagó</span>',abono:'<span class="chip c-warn">Abonó</span>',nopago:'<span class="chip c-bad">No pagó</span>',pendiente:'<span class="chip c-pen">Pendiente</span>'};
const chipUsura=ea=>{const r=revisar(ea);return r.sobreUsura?`<span class="chip c-bad">${pct(ea)} EA · supera la usura</span>`:r.sobreLimite?`<span class="chip c-warn">${pct(ea)} EA · supera tu límite</span>`:`<span class="chip c-ok">${pct(ea)} EA</span>`};
function notasTasa(ea){
  const c=S.config,r=revisar(ea),out=[];
  if(r.bloq)out.push(`<div class="note bad">Este préstamo cobra ${pct(ea)} efectivo anual y el límite del negocio es ${pe(c.limiteEA)}. Baja la tasa o alarga el plazo para poder registrarlo.</div>`);
  else if(r.sobreLimite)out.push(`<div class="note warn">Supera el límite del negocio (${pe(c.limiteEA)}). Está permitido porque el bloqueo está apagado en los ajustes.</div>`);
  if(r.sobreUsura)out.push(`<div class="note bad">Cobra ${pct(ea)} EA, por encima de la usura legal de ${pe(c.usuraEA)} (${esc(MODALIDADES[c.modalidad]?.[0]||'')}). Cobrar por encima de la usura es delito en Colombia (art. 305 del Código Penal).</div>`);
  if(!out.length)out.push(`<div class="note ok">${pct(ea)} EA: dentro del límite del negocio (${pe(c.limiteEA)}) y de la usura legal (${pe(c.usuraEA)}).</div>`);
  return `<div class="stack" style="gap:8px;margin-top:10px">${out.join('')}</div>`;
}


/* ===================== Datos ===================== */
let S=null,B=null,ME=null,AUTH=null,RED={pendientes:0},CARGA='arrancando';
const CONFIG_INICIAL={empresa:'Mi negocio',usuraEA:29.24,limiteEA:29.24,modalidad:'consumo',usuraRef:'Superfinanciera · septiembre 2026',bloquear:true,redondeo:50,
  mora:{activo:true,tipo:'fijo',valor:500,gracia:1},
  mensaje:'Hola {nombre}, le saluda {empresa}. Su cuota de hoy es {cuota}. Tiene {atraso} pendientes. Saldo total: {saldo}. ¡Gracias!'};
const PLANES_INICIALES=[
  {nombre:'Diario 30 cuotas',metodo:'frances',tasa:1.8,frecuencia:'diaria',cuotas:30,domingos:false},
  {nombre:'Diario 60 cuotas',metodo:'frances',tasa:1.8,frecuencia:'diaria',cuotas:60,domingos:false},
  {nombre:'Semanal 8 cuotas',metodo:'frances',tasa:1.8,frecuencia:'semanal',cuotas:8,domingos:false}];
const iniciales=n=>String(n||'').trim().split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase()||'CB';
function datosPrestamo({clienteId,cobradorId,plan,monto,inicio,descontado=0,renuevaDe=null,numero,entregadoPor='oficina'}){
  const sim=simular(plan,monto,inicio);
  return {numero:numero||numeroPrestamo(),clienteId,cobradorId,cobradorNombre:cob(cobradorId).nombre,planNombre:plan.nombre,metodo:plan.metodo,tasa:plan.tasa,frecuencia:plan.frecuencia,domingos:plan.domingos,
    n:sim.n,monto,inicio,cuota:sim.cuota,fechas:sim.fechas,ea:sim.ea,descontado,renuevaDe,entregadoPor};
}
// Datos de ejemplo para el modo demostración
function demo(){
  const T=hoy();
  const s={tenant:null,config:{...CONFIG_INICIAL,empresa:'Cartera Diaria'},
    planes:[...PLANES_INICIALES.map((p,i)=>({id:'p'+(i+1),...p})),{id:'p4',nombre:'Tradicional 20 % en 24 cuotas',metodo:'fijo',tasa:20,frecuencia:'diaria',cuotas:24,domingos:false}],
    cobradores:[
      {id:'k1',nombre:'Andrés Pérez',telefono:'310 555 0142',ruta:'Centro · La Esperanza',comision:20,comBase:'interes',codigo:'AP'},
      {id:'k2',nombre:'Yuliana Martínez',telefono:'315 555 0187',ruta:'Norte · Villa del Sol',comision:2,comBase:'recaudo',codigo:'YM'}],
    clientes:[],prestamos:[],pagos:[],visitas:[],gastos:[],bases:[],solicitudes:[],bitacora:[],usuarios:[]};
  s.tenant={id:'demo',nombre:s.config.empresa,codigo:'DEMO01',plan:{nombre:'Demostración',maxCobradores:0,maxPrestamos:0},config:s.config};
  const Sprev=S;S=s;
  const C=[
    ['Marta Lucía Rojas','43.512.884','Tienda Doña Marta','Cra 12 # 8-40','La Esperanza','k1'],
    ['Jhon Fredy Cárdenas','98.765.221','Venta de arepas','Cll 9 # 14-22','Centro','k1'],
    ['Luz Dary Gómez','32.110.457','Peluquería Luz','Cll 7 # 10-15','Centro','k1'],
    ['Óscar Iván Muñoz','1.036.448.910','Taller de motos','Cra 15 # 5-60','La Esperanza','k1'],
    ['Sandra Milena Ortiz','52.884.301','Frutería La Mona','Plaza de mercado, local 23','Centro','k1'],
    ['Wilson Arley Quintero','71.334.590','Cacharrería El Paisa','Cll 30 # 2-11','Villa del Sol','k2'],
    ['Diana Patricia Ruiz','39.442.118','Venta de minutos','Cra 3 # 28-04','Villa del Sol','k2'],
    ['Héctor Fabio Largo','16.220.775','Carro de jugos','Parque principal','Norte','k2'],
    ['Paola Andrea Salazar','1.017.203.664','Miscelánea Paola','Cll 32 # 5-18','Norte','k2'],
    ['Nelson Enrique Duque','79.901.346','Zapatería Duque','Cra 4 # 31-09','Villa del Sol','k2']];
  C.forEach((c,i)=>s.clientes.push({id:'c'+(i+1),nombre:c[0],cedula:c[1],negocio:c[2],direccion:c[3],barrio:c[4],cobradorId:c[5],telefono:'3'+(10+i)+' 555 0'+(100+i*7),referencia:'',orden:i%5+1}));
  const P=id=>s.planes.find(p=>p.id===id);
  let seq=100,rec=1000;
  const crear=o=>{const l={id:'P-'+(++seq),...datosPrestamo({...o,numero:'P-'+seq}),pagos:[],novedades:[]};s.prestamos.push(l);return l};
  const pago=(l,f,h,monto,tipo='cuota')=>l.pagos.push({id:'g'+(++rec),n:'OF-'+rec,prestamoId:l.id,clienteId:l.clienteId,rutaId:l.cobradorId,cobradorId:l.cobradorId,fecha:f,hora:h,monto,tipo,anulado:false});
  const cerrarSaldo=(l,h)=>{const e=estado(l);if(e.saldo>0&&l.fechas[l.n-1]<T)pago(l,l.fechas[l.n-1],h,e.saldo)};
  const simPagos=(l,comp,i)=>{
    l.fechas.forEach((f,k)=>{
      if(f>T)return;
      const esHoy=f===T,h=`${pad(8+(i+k)%6)}:${pad((k*7+i*11)%60)}`;
      if(comp==='mora'&&diff(f,T)<=4){if(esHoy)return;l.novedades.push({id:'v'+(++rec),prestamoId:l.id,rutaId:l.cobradorId,fecha:f,hora:'10:00',motivo:k%2?'Cerrado':'No tenía plata'});return}
      if(comp==='tarde'&&(k===9||k===10))return;
      let m=l.cuota;
      if(comp==='tarde'&&k===11){m=l.cuota*3;pago(l,f,h,1000,'recargo')}
      if(comp==='abona'&&k%3===1)m=r50(l.cuota/2);
      if(esHoy&&i%2===0)return;
      pago(l,f,h,m);
    });
  };
  s.clientes.forEach((c,i)=>{
    const l1=crear({clienteId:c.id,cobradorId:c.cobradorId,plan:P('p1'),monto:[300000,200000,500000,250000,150000,400000,200000,150000,300000,250000][i],inicio:addDays(T,-172+i*5)});
    simPagos(l1,i%4===1?'tarde':'bueno',i);cerrarSaldo(l1,'11:20');
    const l2=crear({clienteId:c.id,cobradorId:c.cobradorId,plan:i%2===0?P('p3'):P('p1'),monto:[400000,300000,600000,300000,200000,500000,300000,200000,400000,300000][i],inicio:addDays(T,-118+i*4)});
    simPagos(l2,i%3===2?'tarde':'bueno',i);cerrarSaldo(l2,'09:40');
  });
  [['c1','p1',500000,20,'bueno'],['c2','p1',300000,14,'mora'],['c3','p2',1000000,25,'abona'],['c4','p1',400000,9,'bueno'],
   ['c5','p1',200000,3,'bueno'],['c6','p2',800000,30,'bueno'],['c7','p1',300000,18,'mora'],['c8','p1',150000,11,'abona'],
   ['c9','p3',600000,22,'bueno'],['c10','p1',250000,6,'bueno']].forEach(([cid,pid,monto,atras,comp],i)=>{
    const c=s.clientes.find(x=>x.id===cid);
    simPagos(crear({clienteId:cid,cobradorId:c.cobradorId,plan:P(pid),monto,inicio:addDays(T,-atras)}),comp,i);
  });
  s.prestamos.forEach(l=>{s.pagos.push(...l.pagos);s.visitas.push(...l.novedades);delete l.pagos;delete l.novedades});
  s.gastos=[{id:'ga1',fecha:T,cobradorId:'k1',concepto:'Gasolina moto',monto:8000},{id:'ga2',fecha:T,cobradorId:'k2',concepto:'Gasolina moto',monto:7000},
            {id:'ga3',fecha:addDays(T,-1),cobradorId:null,concepto:'Papelería y pagarés',monto:12000}];
  s.bases=[{id:'b1',fecha:T,cobradorId:'k1',monto:200000},{id:'b2',fecha:T,cobradorId:'k2',monto:150000}];
  s.solicitudes=[{id:'s1',clienteId:'c4',monto:600000,planId:'p2',fecha:addDays(T,-1),estado:'pendiente',nota:'Para surtir el taller'},
                 {id:'s2',clienteId:'c9',monto:300000,planId:'p1',fecha:T,estado:'pendiente',nota:''},
                 {id:'s3',clienteId:'c2',monto:500000,planId:'p1',fecha:addDays(T,-6),estado:'rechazada',nota:'Tiene cuotas atrasadas'}];
  s.bitacora=[{id:'bt2',t:T+' 07:32',quien:'Administración',accion:'Entregó base de $ 150.000 a Yuliana Martínez'},{id:'bt1',t:T+' 07:30',quien:'Administración',accion:'Entregó base de $ 200.000 a Andrés Pérez'}];
  S=Sprev;
  return s;
}

/* ===================== Estado de la interfaz ===================== */
const UIKEY='cartera-diaria-ui';
const UI={role:'admin',tab:'resumen',filtro:'activos',buscar:'',cobradorId:null,ctab:'ruta',clienteId:null,cltab:'prestamo',cajaFecha:hoy(),confirmar:null,tema:'auto',authTab:'personal'};
try{Object.assign(UI,JSON.parse(localStorage.getItem(UIKEY)||'{}'))}catch(e){}
UI.cajaFecha=hoy();UI.confirmar=null;UI.buscar='';
function saveUI(){try{localStorage.setItem(UIKEY,JSON.stringify({role:UI.role,tab:UI.tab,cobradorId:UI.cobradorId,clienteId:UI.clienteId,tema:UI.tema,ctab:UI.ctab,cltab:UI.cltab,authTab:UI.authTab}))}catch(e){}}
const hostTheme=document.documentElement.getAttribute('data-theme');
function aplicarTema(){
  const r=document.documentElement;
  if(UI.tema==='auto'){if(hostTheme)r.setAttribute('data-theme',hostTheme);else r.removeAttribute('data-theme')}else r.setAttribute('data-theme',UI.tema);
  $('#btnTema').textContent={auto:'Tema: Auto',light:'Tema: Claro',dark:'Tema: Oscuro'}[UI.tema];
}
const cli=id=>S.clientes.find(c=>c.id===id)||{nombre:'—',telefono:'',cedula:''};
const cob=id=>S.cobradores.find(c=>c.id===id)||{nombre:id?'Cobrador':'Oficina',comision:0};
const nomCob=(id,l)=>S.cobradores.find(c=>c.id===id)?.nombre||(l&&l.cobradorNombre)||(id?'Cobrador':'Oficina');
const prest=id=>S.prestamos.find(l=>l.id===id);
const planDe=id=>S.planes.find(p=>p.id===id);
const esAdmin=()=>ME&&ME.rol==='admin';
function quienSoy(){if(UI.role==='cobrador')return cob(UI.cobradorId).nombre;if(UI.role==='cliente')return cli(UI.clienteId).nombre;return ME?.nombre||'Administración'}
function codigoQuien(){if(UI.role==='cobrador'){const k=cob(UI.cobradorId);return k.codigo||iniciales(k.nombre)}return UI.role==='cliente'?'CL':'OF'}
const log=accion=>B.log(accion,quienSoy());
const luego=fn=>setTimeout(fn,160);
function limitePlan(tipo){
  const p=S.tenant?.plan;if(!p)return null;
  if(tipo==='cobradores'&&p.maxCobradores&&S.cobradores.length>=p.maxCobradores)return `Tu plan ${p.nombre} permite ${p.maxCobradores} cobradores.`;
  if(tipo==='prestamos'&&p.maxPrestamos){const act=S.prestamos.filter(l=>estado(l).saldo>0).length;if(act>=p.maxPrestamos)return `Tu plan ${p.nombre} permite ${p.maxPrestamos} préstamos activos.`}
  return null;
}

/* ===================== Gráficas (SVG propio) ===================== */
let CHARTS=[];
const chart=cfg=>{const id='ch'+CHARTS.length;CHARTS.push({id,cfg});return `<div class="viz" id="${id}"></div>`};
function niceStep(x){const p=Math.pow(10,Math.floor(Math.log10(x||1))),f=x/p;return (f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:10)*p}
const NS='http://www.w3.org/2000/svg';
function el(tag,attrs,parent){const e=document.createElementNS(NS,tag);for(const k in attrs)e.setAttribute(k,attrs[k]);if(parent)parent.appendChild(e);return e}
function drawBars(box,cfg){
  box.innerHTML='';
  const W=Math.max(260,box.clientWidth),H=cfg.h||210,m={l:58,r:6,t:10,b:24};
  const pw=W-m.l-m.r,ph=H-m.t-m.b,n=cfg.labels.length;
  const tot=i=>sum(cfg.series,s=>s.values[i]||0);
  const maxV=Math.max(1,...cfg.labels.map((_,i)=>tot(i)));
  const step=niceStep(maxV/4),top=Math.ceil(maxV/step)*step;
  const y=v=>m.t+ph-(v/top)*ph;
  const svg=el('svg',{viewBox:`0 0 ${W} ${H}`,height:H,role:'img','aria-label':cfg.title||''},box);
  for(let v=0;v<=top+1e-6;v+=step){
    el('line',{x1:m.l,x2:W-m.r,y1:y(v),y2:y(v),stroke:v===0?'var(--axis)':'var(--grid)','stroke-width':1},svg);
    const t=el('text',{x:m.l-8,y:y(v)+4,'text-anchor':'end'},svg);t.textContent=cmp(v);
  }
  const band=pw/n,bw=Math.min(24,band*0.62);
  const hl=el('rect',{x:0,y:m.t,width:band,height:ph,fill:'var(--surface2)',opacity:0},svg);
  const g=el('g',{},svg);
  cfg.labels.forEach((lab,i)=>{
    const cx=m.l+band*i+band/2;let base=0;
    const vals=cfg.series.map(s=>s.values[i]||0);
    const lastIdx=vals.reduce((a,v,k)=>v>0?k:a,-1);
    vals.forEach((v,k)=>{
      if(v<=0)return;
      let y0=y(base);const y1=y(base+v);if(base>0)y0-=2;
      const h=y0-y1;base+=v;if(h<=0.5)return;
      const x=cx-bw/2,r=Math.min(4,h,bw/2);
      const d=k===lastIdx?`M${x},${y0}V${y1+r}Q${x},${y1} ${x+r},${y1}H${x+bw-r}Q${x+bw},${y1} ${x+bw},${y1+r}V${y0}Z`:`M${x},${y0}V${y1}H${x+bw}V${y0}Z`;
      el('path',{d,fill:`var(${cfg.series[k].color})`},g);
    });
  });
  const every=Math.max(1,Math.ceil(n/(pw/(cfg.labelW||30))));
  cfg.labels.forEach((lab,i)=>{if(i%every&&i!==cfg.marca)return;const t=el('text',{x:m.l+band*i+band/2,y:H-6,'text-anchor':'middle'},svg);t.textContent=lab;
    if(cfg.marca===i){t.setAttribute('font-weight','800');t.style.fill='var(--ink)'}});
  const tip=$('#tip');
  const show=(i,px,py)=>{
    hl.setAttribute('x',m.l+band*i);hl.setAttribute('opacity',1);
    tip.innerHTML='';const th=document.createElement('div');th.className='th';th.textContent=cfg.full?cfg.full[i]:cfg.labels[i];tip.appendChild(th);
    cfg.series.forEach(s=>{const v=s.values[i]||0;if(!v&&cfg.skipZero)return;const r=document.createElement('div');r.className='tr';
      const sp=document.createElement('span');const k=document.createElement('i');k.className='key';k.style.background=`var(${s.color})`;sp.appendChild(k);sp.appendChild(document.createTextNode(s.name));
      const b=document.createElement('b');b.textContent=$$(v);r.appendChild(sp);r.appendChild(b);tip.appendChild(r)});
    if(cfg.series.length>1&&!cfg.skipZero){const r=document.createElement('div');r.className='tr';r.style.cssText='border-top:1px solid var(--line);margin-top:4px;padding-top:4px';
      const sp=document.createElement('span');sp.textContent='Total';const b=document.createElement('b');b.textContent=$$(tot(i));r.appendChild(sp);r.appendChild(b);tip.appendChild(r)}
    tip.hidden=false;const tw=tip.offsetWidth,th2=tip.offsetHeight;
    let lx=px+14,ly=py-th2-10;if(lx+tw>innerWidth-8)lx=px-tw-14;if(ly<8)ly=py+14;
    tip.style.left=Math.max(8,lx)+'px';tip.style.top=ly+'px';
  };
  const hide=()=>{tip.hidden=true;hl.setAttribute('opacity',0)};
  cfg.labels.forEach((lab,i)=>{
    const r=el('rect',{x:m.l+band*i,y:m.t,width:band,height:ph,fill:'transparent',tabindex:0,'aria-label':`${cfg.full?cfg.full[i]:lab}: ${$$(tot(i))}`},svg);
    r.addEventListener('pointermove',ev=>show(i,ev.clientX,ev.clientY));
    r.addEventListener('pointerleave',hide);
    r.addEventListener('focus',()=>{const b=r.getBoundingClientRect();show(i,b.left+b.width/2,b.top+40)});
    r.addEventListener('blur',hide);
  });
}
function dibujar(){CHARTS.forEach(({id,cfg})=>{const b=document.getElementById(id);if(b)drawBars(b,cfg)})}
let rz;addEventListener('resize',()=>{clearTimeout(rz);rz=setTimeout(dibujar,120)});
const vlegend=series=>`<div class="vlegend">${series.map(s=>`<span><i style="background:var(${s.color})"></i>${esc(s.name)}</span>`).join('')}</div>`;
function tablaDatos(cfg){
  return `<details class="tbl"><summary>Ver en tabla</summary><div class="tablewrap"><table class="compact"><thead><tr><th>${esc(cfg.col||'Fecha')}</th>${cfg.series.map(s=>`<th class="n">${esc(s.name)}</th>`).join('')}${cfg.series.length>1?'<th class="n">Total</th>':''}</tr></thead><tbody>
  ${cfg.labels.map((l,i)=>`<tr><td>${esc(cfg.full?cfg.full[i]:l)}</td>${cfg.series.map(s=>`<td class="n">${$$(s.values[i]||0)}</td>`).join('')}${cfg.series.length>1?`<td class="n"><b>${$$(sum(cfg.series,s=>s.values[i]||0))}</b></td>`:''}</tr>`).join('')}</tbody></table></div></details>`;
}


/* ===================== Cálculos de reportes ===================== */
function totales(filtroCob,T=hoy()){
  let porCobrar=0,recaudo=0,mora=0,calle=0,enMora=0,activos=0,meta=0,capital=0;
  S.prestamos.filter(l=>!filtroCob||l.cobradorId===filtroCob).forEach(l=>{
    const e=estado(l,T);
    recaudo+=e.pagoHoy;meta+=e.aCobrarInicio;
    if(e.saldo>0){activos++;calle+=e.saldo;capital+=e.saldo*(l.monto/e.total);porCobrar+=Math.max(0,e.aCobrarInicio-e.pagoHoy)}
    if(e.est==='mora'){mora+=e.deudaVencida;enMora++}
  });
  return {porCobrar,recaudo,mora,calle,enMora,activos,meta,capital};
}
function recaudoDia(d,cobId){return sum(S.prestamos,l=>sum(abonos(l).filter(p=>p.fecha===d&&p.tipo!=='renovacion'&&(!cobId||p.cobradorId===cobId)),p=>p.monto))}
function recargoDia(d,cobId){return sum(S.prestamos,l=>sum(recargos(l).filter(p=>p.fecha===d&&(!cobId||p.cobradorId===cobId)),p=>p.monto))}
function programadoDia(d){return sum(S.prestamos,l=>{if(!l.fechas.includes(d))return 0;const e=estado(l);return e.saldo>0?Math.min(l.cuota,e.saldo):0})}
function porMes(meses){
  const R={};meses.forEach(k=>R[k]={capital:0,interes:0,recargos:0,prestado:0,gastos:0,comision:0,recaudo:0});
  S.prestamos.forEach(l=>{
    const ratio=(l.cuota*l.n-l.monto)/(l.cuota*l.n);
    const km=mesDe(l.inicio);if(R[km])R[km].prestado+=l.monto;
    vivos(l).forEach(p=>{const r=R[mesDe(p.fecha)];if(!r)return;
      if(p.tipo==='recargo')r.recargos+=p.monto;else{r.interes+=p.monto*ratio;r.capital+=p.monto*(1-ratio);if(p.tipo!=='renovacion')r.recaudo+=p.monto}
      r.comision+=comisionDe(cob(p.cobradorId),[{l,p}]);});
  });
  S.gastos.forEach(g=>{const r=R[mesDe(g.fecha)];if(r)r.gastos+=g.monto});
  return R;
}
function antiguedad(){
  const B=[{n:'Al día',c:'--st-good',v:0,q:0},{n:'1 a 7 días',c:'--st-warn',v:0,q:0},{n:'8 a 30 días',c:'--st-serious',v:0,q:0},{n:'Más de 30 días',c:'--st-crit',v:0,q:0}];
  S.prestamos.forEach(l=>{const e=estado(l);if(e.saldo<=0)return;const b=e.dias<=0?B[0]:e.dias<=7?B[1]:e.dias<=30?B[2]:B[3];b.v+=e.saldo;b.q++});
  return B;
}


/* ===================== Mensajes (WhatsApp) ===================== */
function telWa(t){const d=String(t||'').replace(/\D/g,'');return d.length===10?'57'+d:d}
function mensajeCobro(l){const e=estado(l),c=cli(l.clienteId);
  return S.config.mensaje.replace(/\{nombre\}/g,c.nombre.split(' ')[0]).replace(/\{empresa\}/g,S.config.empresa).replace(/\{cuota\}/g,$$(l.cuota))
    .replace(/\{atraso\}/g,e.deudaVencida>0?$$(e.deudaVencida)+' en cuotas atrasadas':'$ 0').replace(/\{saldo\}/g,$$(e.saldo))}
function textoRecibo(l,pg){
  const e=estado(l),c=cli(l.clienteId);
  const L=['================================',S.config.empresa.toUpperCase(),`RECIBO DE PAGO N.º ${pg.map(p=>p.n).join(', ')}`,'================================',
    `Fecha:    ${fcorta(pg[0].fecha)} ${parse(pg[0].fecha).getFullYear()} ${pg[0].hora}`,`Cliente:  ${c.nombre}`,`Cédula:   ${c.cedula||''}`,`Préstamo: ${l.num}`,'--------------------------------'];
  pg.forEach(p=>L.push(`${(p.tipo==='recargo'?'Recargo por mora':p.tipo==='renovacion'?'Renovación':'Abono a cuota').padEnd(18)}${$$(p.monto).padStart(14)}`));
  L.push('--------------------------------',`Cuotas pagadas:  ${e.cub} de ${l.n}`,`Saldo pendiente: ${$$(e.saldo)}`,`Cobrador: ${nomCob(pg[0].cobradorId,l)}`,'','Gracias por su pago.');
  return L.join('\n');
}
async function copiar(texto,okMsg){
  try{await navigator.clipboard.writeText(texto);toast(okMsg||'Copiado')}
  catch(e){const t=$('#copyArea');if(t){t.hidden=false;t.value=texto;t.select()}toast('Selecciona el texto y cópialo')}
}
function waLink(tel,texto){const n=telWa(tel);return n?`https://wa.me/${n}?text=${encodeURIComponent(texto)}`:''}


/* ===================== Iconos ===================== */
const IC={
  resumen:'<path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z"/>',
  prestamos:'<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v.01M18 15v.01"/>',
  solicitudes:'<path d="M5 4h10l4 4v12H5z"/><path d="M14 4v5h5M9 13h6M9 17h4"/>',
  clientes:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.7 3 2.4 3.5 5.2"/>',
  cobradores:'<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  caja:'<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M3 11h18M8 4h8l2 3H6z"/>',
  reportes:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  config:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  bitacora:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  ruta:'<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H16a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h7.5"/>',
  cuadre:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h2M14 11h2M8 15h2M14 15h2"/>',
  pagos:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  solicitar:'<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>'
};
const ico=k=>`<svg viewBox="0 0 24 24" aria-hidden="true">${IC[k]}</svg>`;


/* ===================== Administración ===================== */
const ADMIN_TABS=[['resumen','Resumen'],['prestamos','Préstamos'],['solicitudes','Solicitudes'],['clientes','Clientes'],['cobradores','Cobradores'],['caja','Caja y cuadre'],['reportes','Reportes'],['config','Intereses y ajustes'],['bitacora','Bitácora']];
function vAdmin(){
  const pend=S.solicitudes.filter(s=>s.estado==='pendiente').length;
  const t=ADMIN_TABS.map(([k,n])=>`<button role="tab" aria-selected="${UI.tab===k}" data-a="tab" data-v="${k}">${ico(k)}<span>${n}</span>${k==='solicitudes'&&pend?`<span class="badge">${pend}</span>`:''}</button>`).join('');
  const body={resumen:vResumen,prestamos:vPrestamos,solicitudes:vSolicitudes,clientes:vClientes,cobradores:vCobradores,caja:vCaja,reportes:vReportes,config:vConfig,bitacora:vBitacora}[UI.tab]();
  return `<div class="admin"><nav class="side" role="tablist" aria-label="Secciones"><div class="sidehead">Oficina</div>${t}</nav><div style="min-width:0">${body}</div></div>`;
}
function alertasTasa(){
  const T=hoy(),cfg=S.config;
  const planesMal=S.planes.filter(p=>{const r=revisar(simular(p,500000,T).ea);return r.sobreLimite||r.sobreUsura});
  return (cfg.limiteEA>cfg.usuraEA?`<div class="note bad"><b>Tu límite de tasa (${pe(cfg.limiteEA)}) está por encima de la usura legal (${pe(cfg.usuraEA)}).</b> Los préstamos en ese rango se pueden registrar, pero quedan marcados en rojo. <button class="btn sm" data-a="tab" data-v="config">Revisar</button></div>`:'')+
    (planesMal.length?`<div class="note warn"><b>Atención:</b> ${planesMal.length===1?'el plan':'los planes'} ${planesMal.map(p=>'«'+esc(p.nombre)+'»').join(', ')} ${planesMal.length===1?'supera':'superan'} el límite del negocio o la usura.${cfg.bloquear?' El sistema no deja prestar con planes que superen el límite.':''} <button class="btn sm" data-a="tab" data-v="config">Revisar planes</button></div>`:'');
}
function vResumen(){
  const T=hoy(),t=totales();
  const dias=[...Array(21)].map((_,i)=>addDays(T,i-13));
  const real=dias.map(d=>d<=T?recaudoDia(d):0);
  const prog=dias.map(d=>d<T?0:d===T?t.porCobrar:programadoDia(d));
  const cfg1={title:'Recaudo diario',labels:dias.map(d=>String(parse(d).getDate())),full:dias.map(d=>flarga(d)+(d===T?' (hoy)':'')),marca:13,skipZero:true,
    series:[{name:'Recaudado',color:'--s1',values:real},{name:'Por cobrar',color:'--s1-soft',values:prog}]};
  const B=antiguedad(),totB=sum(B,b=>b.v)||1;
  const pend=S.solicitudes.filter(s=>s.estado==='pendiente');
  const mesAct=porMes([mesDe(T)])[mesDe(T)];
  const morosos=S.prestamos.map(l=>({l,e:estado(l)})).filter(x=>x.e.est==='mora').sort((a,b)=>b.e.dias-a.e.dias);
  const av=t.meta?t.recaudo/t.meta:0;
  const porCob=S.cobradores.map(k=>{const x=totales(k.id);const g=sum(S.gastos.filter(g=>g.fecha===T&&g.cobradorId===k.id),g=>g.monto);const a=x.meta?x.recaudo/x.meta:0;
    return `<tr><td><b>${esc(k.nombre)}</b><div class="small muted">${esc(k.ruta)}</div></td><td class="n">${x.activos}</td><td class="n">${$$(x.meta)}</td><td class="n">${$$(x.recaudo)}</td>
      <td><div class="row" style="gap:8px;flex-wrap:nowrap"><div class="bar" style="flex:1"><i style="width:${Math.min(100,a*100)}%"></i></div><span class="small num">${Math.round(a*100)} %</span></div></td><td class="n">${$$(g)}</td></tr>`}).join('');
  return `<div class="stack">
    <div class="row between"><div><h2>${flarga(T).replace(/^./,c=>c.toUpperCase())}</h2><div class="muted">${t.activos} préstamos activos · ${S.clientes.length} clientes · ${S.cobradores.length} cobradores</div></div>
      <button class="btn pri" data-a="nuevoPrestamo">+ Nuevo préstamo</button></div>
    ${alertasTasa()}
    ${pend.length?`<div class="note info"><b>${pend.length} ${pend.length===1?'solicitud':'solicitudes'} de préstamo por revisar.</b> <button class="btn sm" data-a="tab" data-v="solicitudes">Ver solicitudes</button></div>`:''}
    <div class="kpis">
      <div class="kpi"><div class="label">Recaudado hoy</div><div class="v">${$$(t.recaudo)}</div><div class="s">${Math.round(av*100)} % de ${$$(t.meta)} programado</div><div class="meter"><i style="width:${Math.min(100,av*100)}%"></i></div></div>
      <div class="kpi"><div class="label">Falta por cobrar hoy</div><div class="v">${$$(t.porCobrar)}</div><div class="s">incluye cuotas atrasadas</div></div>
      <div class="kpi"><div class="label">Cartera en mora</div><div class="v" style="color:var(--bad)">${$$(t.mora)}</div><div class="s">${t.enMora} ${t.enMora===1?'préstamo atrasado':'préstamos atrasados'}</div></div>
      <div class="kpi"><div class="label">Saldo en la calle</div><div class="v">${$$(t.calle)}</div><div class="s">${$$(t.capital)} es capital</div></div>
      <div class="kpi"><div class="label">Ganancia del mes</div><div class="v" style="color:${mesAct.interes+mesAct.recargos-mesAct.gastos-mesAct.comision<0?'var(--bad)':'var(--ok)'}">${$$(mesAct.interes+mesAct.recargos-mesAct.gastos-mesAct.comision)}</div><div class="s">intereses y recargos menos gastos y comisiones</div></div>
    </div>
    <div class="grid2">
      <div class="panel"><div class="row between" style="margin-bottom:6px"><h3 style="margin:0">Recaudo diario</h3><span class="small muted">últimos 14 días y próximos 7</span></div>
        ${vlegend(cfg1.series)}${chart(cfg1)}${tablaDatos(cfg1)}</div>
      <div class="panel"><h3>Cartera por días de atraso</h3>
        <div class="aging" role="img" aria-label="Distribución del saldo por días de atraso">${B.filter(b=>b.v>0).map(b=>`<i style="background:var(${b.c});flex:${b.v/totB}" title="${b.n}: ${$$(b.v)}"></i>`).join('')}</div>
        <div style="margin-top:10px">${B.map(b=>`<div class="agrow"><span class="dot" style="background:var(${b.c})"></span><span>${b.n} <span class="small muted">· ${b.q} ${b.q===1?'préstamo':'préstamos'}</span></span><b class="num">${$$(b.v)}</b><span class="small muted num" style="min-width:44px;text-align:right">${Math.round(b.v/totB*100)} %</span></div>`).join('')}</div>
      </div>
    </div>
    <div class="grid2">
      <div class="panel"><h3>Clientes en mora</h3>${morosos.length?`<div class="list">${morosos.map(({l,e})=>`<button class="item" data-a="verPrestamo" data-v="${l.id}"><span class="ord">${e.dias}</span><span><span class="t">${esc(cli(l.clienteId).nombre)}</span><div class="small muted">${esc(nomCob(l.cobradorId,l))} · debe ${$$(e.deudaVencida)}${e.recargo?' + recargo '+$$(e.recargo):''}</div></span><span class="r">${chipEstado(e)}</span></button>`).join('')}</div>`:'<div class="empty">Nadie está atrasado.</div>'}</div>
      <div class="panel" style="padding:0;overflow:hidden"><h3 style="padding:16px 16px 0">Cobradores hoy</h3><div style="overflow-x:auto;margin-top:10px"><table><thead><tr><th>Cobrador</th><th class="n">Préstamos</th><th class="n">Programado</th><th class="n">Recogido</th><th>Avance</th><th class="n">Gastos</th></tr></thead><tbody>${porCob}</tbody></table></div></div>
    </div>
  </div>`;
}
function vPrestamos(){
  const q=UI.buscar.toLowerCase();
  const rows=S.prestamos.map(l=>({l,e:estado(l),c:cli(l.clienteId)}))
    .filter(x=>UI.filtro==='todos'||(UI.filtro==='activos'?x.e.est!=='pagado':x.e.est===UI.filtro))
    .filter(x=>!q||x.c.nombre.toLowerCase().includes(q)||x.c.cedula.includes(q)||x.l.num.toLowerCase().includes(q))
    .sort((a,b)=>b.l.inicio.localeCompare(a.l.inicio));
  const f=[['activos','Activos'],['mora','En mora'],['aldia','Al día'],['pagado','Pagados'],['todos','Todos']].map(([k,n])=>`<button class="btn sm ${UI.filtro===k?'pri':''}" data-a="filtro" data-v="${k}">${n}</button>`).join('');
  return `<div class="stack">
    <div class="row between"><h2>Préstamos</h2><button class="btn pri" data-a="nuevoPrestamo">+ Nuevo préstamo</button></div>
    <div class="row">${f}<div class="f" style="margin-left:auto;min-width:220px;flex:1;max-width:320px"><input id="buscar" placeholder="Buscar por nombre, cédula o número" value="${esc(UI.buscar)}" aria-label="Buscar"></div></div>
    <div class="tablewrap"><table><thead><tr><th>Cliente</th><th>Plan</th><th class="n">Prestado</th><th class="n">Cuota</th><th>Avance</th><th class="n">Saldo</th><th>Estado</th><th>Tasa</th></tr></thead><tbody>
    ${rows.map(({l,e,c})=>`<tr class="click" data-a="verPrestamo" data-v="${l.id}"><td><b>${esc(c.nombre)}</b><div class="small muted">${l.num} · ${esc(nomCob(l.cobradorId,l))} · desde ${fcorta(l.inicio)}${l.renuevaDe?' · renovación':''}</div></td><td class="small">${esc(l.planNombre)}</td>
      <td class="n">${$$(l.monto)}</td><td class="n">${$$(l.cuota)}</td><td><div class="row" style="gap:8px;flex-wrap:nowrap"><div class="bar" style="flex:1"><i style="width:${e.pagado/e.total*100}%"></i></div><span class="small num">${e.cub}/${l.n}</span></div></td>
      <td class="n">${$$(e.saldo)}</td><td>${chipEstado(e)}</td><td class="small num">${pct(l.ea)}</td></tr>`).join('')||'<tr><td colspan="8" class="empty">No hay préstamos con ese filtro.</td></tr>'}
    </tbody></table></div></div>`;
}
function vSolicitudes(){
  const pend=S.solicitudes.filter(s=>s.estado==='pendiente'),resto=S.solicitudes.filter(s=>s.estado!=='pendiente');
  const card=s=>{const c=cli(s.clienteId),p=planDe(s.planId),act=S.prestamos.filter(l=>l.clienteId===s.clienteId).map(l=>estado(l)).filter(e=>e.saldo>0);
    const hist=S.prestamos.filter(l=>l.clienteId===s.clienteId&&estado(l).saldo<=0).length;const peor=act.find(e=>e.est==='mora');
    return `<div class="panel stack" style="gap:12px"><div class="row between"><div><h3 style="margin:0">${esc(c.nombre)}</h3><div class="small muted">Pidió el ${fcorta(s.fecha)} · ${esc(c.negocio||'')}</div></div><b class="num" style="font-family:var(--display);font-size:22px">${$$(s.monto)}</b></div>
      <div class="kv"><div><span>Plan pedido</span><b>${p?esc(p.nombre):'—'}</b></div><div><span>Préstamos pagados</span><b>${hist}</b></div><div><span>Saldo actual</span><b>${$$(sum(act,e=>e.saldo))}</b></div><div><span>Comportamiento</span><b>${peor?`<span style="color:var(--bad)">${peor.dias} días de atraso</span>`:act.length?'Al día':'Sin deuda'}</b></div></div>
      ${s.nota?`<div class="small">«${esc(s.nota)}»</div>`:''}
      <div class="row"><button class="btn pri" data-a="aprobarSol" data-v="${s.id}">Aprobar y prestar</button><button class="btn bad" data-a="rechazarSol" data-v="${s.id}">${UI.confirmar==='sol'+s.id?'Confirmar rechazo':'Rechazar'}</button></div></div>`};
  return `<div class="stack"><h2>Solicitudes de préstamo</h2><p class="muted" style="margin:0">Los clientes piden desde su app. Revisa el historial de pago antes de aprobar.</p>
    ${pend.length?`<div class="grid2">${pend.map(card).join('')}</div>`:'<div class="panel empty">No hay solicitudes pendientes.</div>'}
    ${resto.length?`<div><h3 style="margin-bottom:10px">Ya revisadas</h3><div class="tablewrap"><table class="compact"><tbody>${resto.map(s=>`<tr><td>${fcorta(s.fecha)}</td><td>${esc(cli(s.clienteId).nombre)}</td><td class="n">${$$(s.monto)}</td><td>${s.estado==='aprobada'?'<span class="chip c-ok">Aprobada</span>':'<span class="chip c-bad">Rechazada</span>'}</td></tr>`).join('')}</tbody></table></div></div>`:''}</div>`;
}
function vClientes(){
  const rows=S.clientes.map(c=>{const ls=S.prestamos.filter(l=>l.clienteId===c.id).map(l=>estado(l));const act=ls.filter(e=>e.saldo>0);
    const peor=act.find(e=>e.est==='mora')||act[0];
    return `<tr class="click" data-a="editCliente" data-v="${c.id}"><td><b>${esc(c.nombre)}</b><div class="small muted">C.C. ${esc(c.cedula)}</div></td><td>${esc(c.negocio)}<div class="small muted">${esc(c.direccion)} · ${esc(c.barrio)}</div></td><td class="num">${esc(c.telefono)}</td><td>${esc(cob(c.cobradorId).nombre)}</td><td class="n">${ls.length}</td><td class="n">${$$(sum(act,e=>e.saldo))}</td><td>${peor?chipEstado(peor):'<span class="chip c-mut">Sin préstamo</span>'}</td></tr>`}).join('');
  return `<div class="stack"><div class="row between"><h2>Clientes</h2><button class="btn pri" data-a="editCliente">+ Nuevo cliente</button></div>
    <div class="tablewrap"><table><thead><tr><th>Cliente</th><th>Negocio y dirección</th><th>Celular</th><th>Cobrador</th><th class="n">Préstamos</th><th class="n">Saldo</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}
function vCobradores(){
  const mes=mesDe(hoy());
  const rows=S.cobradores.map(k=>{const x=totales(k.id);const n=S.clientes.filter(c=>c.cobradorId===k.id).length;
    const pm=pagosDe((p)=>p.cobradorId===k.id&&mesDe(p.fecha)===mes&&p.tipo!=='renovacion');
    return `<tr class="click" data-a="editCobrador" data-v="${k.id}"><td><b>${esc(k.nombre)}</b><div class="small muted num">${esc(k.telefono)}</div></td><td>${esc(k.ruta)}</td><td class="n">${n}</td><td class="n">${$$(x.calle)}</td><td class="n">${$$(x.mora)}</td><td class="n">${$$(sum(pm,x=>x.p.monto))}</td><td class="n">${$$(comisionDe(k,pm))}<div class="small muted">${pe(k.comision||0)} ${baseTxt(k)}</div></td></tr>`}).join('');
  return `<div class="stack"><div class="row between"><h2>Cobradores y rutas</h2><button class="btn pri" data-a="editCobrador">+ Nuevo cobrador</button></div>
    <div class="tablewrap"><table><thead><tr><th>Nombre</th><th>Ruta</th><th class="n">Clientes</th><th class="n">Cartera</th><th class="n">En mora</th><th class="n">Recaudo del mes</th><th class="n">Comisión del mes</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}
function cuadre(k,d){
  const id=k.id;
  const base=sum(S.bases.filter(b=>b.fecha===d&&b.cobradorId===id),b=>b.monto);
  const rec=recaudoDia(d,id),recg=recargoDia(d,id);
  const g=sum(S.gastos.filter(g=>g.fecha===d&&g.cobradorId===id),g=>g.monto);
  const pres=sum(S.prestamos.filter(l=>l.inicio===d&&l.entregadoPor===id),l=>l.monto-(l.descontado||0));
  const com=comisionDe(k,pagosDe(p=>p.fecha===d&&p.cobradorId===id));
  return {base,rec,recg,g,pres,com,entregar:base+rec+recg-pres-g};
}
function vCaja(){
  const d=UI.cajaFecha;
  const filas=S.cobradores.map(k=>({k,...cuadre(k,d)}));
  const gOfi=sum(S.gastos.filter(g=>g.fecha===d&&!g.cobradorId),g=>g.monto);
  const tot={rec:sum(filas,f=>f.rec+f.recg),pres:sum(S.prestamos.filter(l=>l.inicio===d),l=>l.monto-(l.descontado||0)),g:sum(filas,f=>f.g)+gOfi,com:sum(filas,f=>f.com)};
  const gastos=S.gastos.filter(g=>g.fecha===d),bases=S.bases.filter(b=>b.fecha===d);
  return `<div class="stack">
    <div class="row between"><h2>Caja y cuadre</h2><div class="row"><div class="f"><input type="date" id="cajaFecha" value="${d}" aria-label="Fecha"></div><button class="btn" data-a="nuevaBase">+ Entregar base</button><button class="btn" data-a="nuevoGasto">+ Gasto</button></div></div>
    <div class="kpis"><div class="kpi"><div class="label">Entró</div><div class="v">${$$(tot.rec)}</div><div class="s">cuotas y recargos</div></div><div class="kpi"><div class="label">Salió en préstamos</div><div class="v">${$$(tot.pres)}</div><div class="s">efectivo entregado</div></div>
    <div class="kpi"><div class="label">Gastos</div><div class="v">${$$(tot.g)}</div></div><div class="kpi"><div class="label">Comisiones</div><div class="v">${$$(tot.com)}</div></div>
    <div class="kpi"><div class="label">Movimiento neto</div><div class="v" style="color:${tot.rec-tot.g-tot.pres<0?'var(--bad)':'var(--ok)'}">${$$(tot.rec-tot.g-tot.pres)}</div></div></div>
    <div><h3 style="margin-bottom:10px">Liquidación por cobrador</h3><div class="tablewrap"><table><thead><tr><th>Cobrador</th><th class="n">Base</th><th class="n">+ Recogió</th><th class="n">− Prestó</th><th class="n">− Gastos</th><th class="n">= Debe entregar</th><th class="n">Su comisión</th></tr></thead><tbody>
      ${filas.map(f=>`<tr><td><b>${esc(f.k.nombre)}</b><div class="small muted">${esc(f.k.ruta)}</div></td><td class="n">${$$(f.base)}</td><td class="n">${$$(f.rec+f.recg)}</td><td class="n">${$$(f.pres)}</td><td class="n">${$$(f.g)}</td><td class="n"><b>${$$(f.entregar)}</b></td><td class="n">${$$(f.com)}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="grid2">
      <div><h3 style="margin-bottom:10px">Bases entregadas</h3><div class="tablewrap"><table class="compact"><tbody>${bases.map(b=>`<tr><td>${esc(cob(b.cobradorId).nombre)}</td><td class="n">${$$(b.monto)}</td><td class="n"><button class="btn sm bad" data-a="borrarBase" data-v="${b.id}">${UI.confirmar===b.id?'Confirmar':'Quitar'}</button></td></tr>`).join('')||'<tr><td class="empty">Sin bases este día.</td></tr>'}</tbody></table></div></div>
      <div><h3 style="margin-bottom:10px">Gastos</h3><div class="tablewrap"><table class="compact"><tbody>${gastos.map(g=>`<tr><td>${esc(g.concepto)}<div class="small muted">${esc(cob(g.cobradorId).nombre)}</div></td><td class="n">${$$(g.monto)}</td><td class="n"><button class="btn sm bad" data-a="borrarGasto" data-v="${g.id}">${UI.confirmar===g.id?'Confirmar':'Quitar'}</button></td></tr>`).join('')||'<tr><td class="empty">Sin gastos este día.</td></tr>'}</tbody></table></div></div>
    </div></div>`;
}
function vReportes(){
  const T=hoy(),meses=[...Array(6)].map((_,i)=>mesDe(addMonths(T.slice(0,8)+'01',i-5)));
  const R=porMes(meses);
  const lab=meses.map(k=>MESES[Number(k.slice(5))-1]),full=meses.map(k=>MESESL[Number(k.slice(5))-1]+' '+k.slice(0,4));
  const cfg={title:'Intereses y recargos por mes',labels:lab,full,labelW:36,col:'Mes',h:230,
    series:[{name:'Intereses',color:'--s1',values:meses.map(k=>R[k].interes)},{name:'Recargos por mora',color:'--s2',values:meses.map(k=>R[k].recargos)}]};
  const cfg2={title:'Capital prestado por mes',labels:lab,full,labelW:36,col:'Mes',h:190,series:[{name:'Prestado',color:'--s1',values:meses.map(k=>R[k].prestado)}]};
  const cfg3={title:'Capital recuperado por mes',labels:lab,full,labelW:36,col:'Mes',h:190,series:[{name:'Capital recuperado',color:'--s1',values:meses.map(k=>R[k].capital)}]};
  const mesAct=mesDe(T);
  const porCob=S.cobradores.map(k=>{
    const pr=S.prestamos.filter(l=>l.cobradorId===k.id);const es=pr.map(l=>estado(l)).filter(e=>e.saldo>0);
    const pm=pagosDe((p,l)=>l.cobradorId===k.id&&mesDe(p.fecha)===mesAct&&p.tipo!=='renovacion');const rec=sum(pm,x=>x.p.monto);
    const calle=sum(es,e=>e.saldo),mora=sum(es.filter(e=>e.est==='mora'),e=>e.deudaVencida);
    return `<tr><td><b>${esc(k.nombre)}</b></td><td class="n">${$$(rec)}</td><td class="n">${$$(comisionDe(k,pm))}</td><td class="n">${$$(calle)}</td><td class="n">${calle?(Math.round(mora/calle*1000)/10).toLocaleString('es-CO'):0} %</td></tr>`}).join('');
  return `<div class="stack"><h2>Reportes</h2>
    <div class="panel"><div class="row between" style="margin-bottom:6px"><h3 style="margin:0">Ganancia bruta por mes</h3><span class="small muted">intereses y recargos cobrados, antes de gastos y comisiones</span></div>
      ${vlegend(cfg.series)}${chart(cfg)}${tablaDatos(cfg)}</div>
    <div class="grid2">
      <div class="panel"><h3>Capital prestado</h3>${chart(cfg2)}${tablaDatos(cfg2)}</div>
      <div class="panel"><h3>Capital recuperado</h3>${chart(cfg3)}${tablaDatos(cfg3)}</div>
    </div>
    <div><h3 style="margin-bottom:10px">Resultado por mes</h3><div class="tablewrap"><table><thead><tr><th>Mes</th><th class="n">Prestado</th><th class="n">Recaudado</th><th class="n">Intereses</th><th class="n">Recargos</th><th class="n">Gastos</th><th class="n">Comisiones</th><th class="n">Ganancia</th></tr></thead><tbody>
      ${meses.slice().reverse().map(k=>{const r=R[k],gan=r.interes+r.recargos-r.gastos-r.comision;return `<tr><td>${MESESL[Number(k.slice(5))-1]} ${k.slice(0,4)}${k===mesAct?' <span class="chip c-pen">en curso</span>':''}</td><td class="n">${$$(r.prestado)}</td><td class="n">${$$(r.recaudo+r.recargos)}</td><td class="n">${$$(r.interes)}</td><td class="n">${$$(r.recargos)}</td><td class="n">${$$(r.gastos)}</td><td class="n">${$$(r.comision)}</td><td class="n"><b style="color:${gan<0?'var(--bad)':'var(--ok)'}">${$$(gan)}</b></td></tr>`}).join('')}</tbody></table></div>
      <p class="small muted">Los intereses de cada pago se calculan en proporción al interés total del préstamo. La ganancia no descuenta préstamos que no se recuperen.</p></div>
    <div><h3 style="margin-bottom:10px">Cobradores este mes</h3><div class="tablewrap"><table><thead><tr><th>Cobrador</th><th class="n">Recaudó</th><th class="n">Comisión</th><th class="n">Cartera</th><th class="n">Índice de mora</th></tr></thead><tbody>${porCob}</tbody></table></div></div>
  </div>`;
}
function vConfig(){
  const c=S.config,T=hoy(),m=c.mora;
  const planes=S.planes.map(p=>{const s=simular(p,500000,T);
    return `<tr><td><b>${esc(p.nombre)}</b><div class="small muted">${METODOS[p.metodo]}</div></td><td class="num">${pe(p.tasa)}${p.metodo==='fijo'?' total':' mensual'}</td><td>${FRECS[p.frecuencia]} · ${p.cuotas} cuotas${p.frecuencia==='diaria'?(p.domingos?' · con domingos':' · sin domingos'):''}</td>
      <td class="n">${$$(s.cuota)}</td><td class="n">${$$(s.total)}</td><td>${chipUsura(s.ea)}</td><td class="n"><button class="btn sm" data-a="editPlan" data-v="${p.id}">Editar</button></td></tr>`}).join('');
  return `<div class="stack">
    <h2>Intereses y ajustes</h2>
    ${vEmpresa()}
    <form class="stack" data-form="config" id="fCfg">
    <div class="panel stack"><h3 style="margin:0">Límite de tasa del negocio</h3>
        <div class="form">
          <div class="f"><label for="cfEmp">Nombre del negocio</label><input id="cfEmp" name="empresa" value="${esc(c.empresa)}"></div>
          <div class="f"><label for="cfRed">Redondear cuotas a</label><select id="cfRed" name="redondeo">${[1,50,100,500].map(v=>`<option value="${v}" ${c.redondeo==v?'selected':''}>${v===1?'Sin redondeo':$$(v)}</option>`).join('')}</select></div>
        </div>
        <div class="sim" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));align-items:start">
          <div class="f"><label for="cfLim">Límite del negocio (% efectivo anual)</label><input id="cfLim" name="limiteEA" inputmode="decimal" value="${String(c.limiteEA).replace('.',',')}"><span class="small muted" id="cfLimEq"></span></div>
          <div class="f"><label for="cfMod">Tipo de crédito para la usura</label><select id="cfMod" name="modalidad">${Object.entries(MODALIDADES).map(([k,[n]])=>`<option value="${k}" ${c.modalidad===k?'selected':''}>${n}${usuraDe(k)?' · '+pe(usuraDe(k)):''}</option>`).join('')}</select></div>
          <div class="f"><label for="cfUs">Usura legal (% efectivo anual)</label><input id="cfUs" name="usuraEA" inputmode="decimal" value="${String(c.usuraEA).replace('.',',')}"><span class="small muted" id="cfUsEq"></span></div>
        </div>
        <div class="row"><button type="button" class="btn sm" data-a="limIgualUsura">Usar la usura legal como límite</button><div class="f" style="flex:1;min-width:200px"><input id="cfRef" name="usuraRef" value="${esc(c.usuraRef)}" aria-label="Referencia de la tasa"></div></div>
        <label class="check"><input type="checkbox" name="bloquear" id="cfBl" ${c.bloquear?'checked':''}> No dejar registrar préstamos que superen el límite del negocio</label>
        <div id="cfAviso"></div>
        <div class="note info">El límite del negocio lo decides tú: con él se revisa cada plan y cada préstamo. La usura legal es la referencia de la Superintendencia Financiera (1,5 veces el interés bancario corriente) y cambia cada mes; los valores precargados son los de septiembre de 2026. Los préstamos que la superen siempre quedan marcados en rojo. Entre particulares suele aplicar la de consumo y ordinario; las demás modalidades tienen condiciones propias, así que confírmalo con tu abogado o contador.</div>
    </div>
    <div class="panel stack"><h3 style="margin:0">Recargo por mora</h3>
      <label class="check"><input type="checkbox" name="moraActivo" id="cfMa" ${m.activo?'checked':''}> Sugerir un recargo cuando el cliente se atrasa</label>
      <div class="form">
        <div class="f"><label for="cfMt">Cómo se calcula</label><select id="cfMt" name="moraTipo"><option value="fijo" ${m.tipo==='fijo'?'selected':''}>Valor fijo por día de atraso</option><option value="pct" ${m.tipo==='pct'?'selected':''}>Porcentaje de la cuota por día</option></select></div>
        <div class="f"><label for="cfMv">Valor por día ($ o %)</label><input id="cfMv" name="moraValor" inputmode="decimal" value="${String(m.valor).replace('.',',')}"></div>
        <div class="f"><label for="cfMg">Días de gracia</label><input id="cfMg" name="moraGracia" inputmode="numeric" value="${m.gracia}"></div>
      </div>
      <p class="small muted" style="margin:0">El cobrador ve el recargo sugerido y decide si lo cobra. Los recargos también cuentan en el costo del crédito, así que los intereses de mora tampoco pueden pasar la usura.</p>
    </div>
    <div class="panel stack"><h3 style="margin:0">Mensaje de cobro por WhatsApp</h3>
      <div class="f"><label for="cfMsg">Texto. Puedes usar {nombre}, {empresa}, {cuota}, {atraso} y {saldo}</label><textarea id="cfMsg" name="mensaje">${esc(c.mensaje)}</textarea></div>
    </div>
    <div><button class="btn pri">Guardar ajustes</button></div>
    </form>
    <div class="panel"><div class="row between" style="margin-bottom:10px"><h3 style="margin:0">Planes de préstamo</h3><button class="btn pri sm" data-a="editPlan">+ Nuevo plan</button></div>
      <p class="small muted" style="margin:0 0 10px">Ejemplo con un préstamo de $ 500.000 que se entrega hoy. La tasa efectiva anual se calcula con las fechas reales de cada cuota.</p>
      <div class="tablewrap"><table><thead><tr><th>Plan</th><th>Interés</th><th>Forma de pago</th><th class="n">Cuota</th><th class="n">Total a pagar</th><th>Tasa efectiva</th><th></th></tr></thead><tbody>${planes}</tbody></table></div></div>
    ${B.demo?`<div class="panel"><h3>Datos de ejemplo</h3><p class="small muted" style="margin:0 0 10px">En el modo demostración los datos se guardan en este navegador. Puedes volver a cargar los clientes y préstamos de ejemplo.</p>
      <button class="btn bad" data-a="reset">${UI.confirmar==='reset'?'Confirmar: borrar todo y recargar ejemplo':'Restablecer datos de ejemplo'}</button></div>`:''}
  </div>`;
}
function vBitacora(){
  return `<div class="stack"><h2>Bitácora</h2><p class="muted" style="margin:0">Quién hizo qué y cuándo: pagos, préstamos, anulaciones, bases y cambios de tasas.</p>
    <div class="tablewrap"><table class="compact"><thead><tr><th>Fecha y hora</th><th>Quién</th><th>Qué hizo</th></tr></thead><tbody>
    ${S.bitacora.map(b=>`<tr><td class="small num" style="white-space:nowrap">${fcorta(b.t.slice(0,10))} ${b.t.slice(11)}</td><td>${esc(b.quien)}</td><td>${esc(b.accion)}</td></tr>`).join('')||'<tr><td class="empty" colspan="3">Sin movimientos.</td></tr>'}</tbody></table></div></div>`;
}

function vEmpresa(){
  const t=S.tenant||{},p=t.plan||{},act=S.prestamos.filter(l=>estado(l).saldo>0).length;
  const lim=(n,max)=>max?`${n} de ${max}`:`${n} (sin límite)`;
  return `<div class="panel"><h3>Tu empresa</h3><div class="kv">
    <div><span>Código para los clientes</span><b style="font-size:20px;letter-spacing:.12em">${esc(t.codigo||'—')}</b></div>
    <div><span>Plan</span><b>${esc(p.nombre||'—')}</b></div>
    <div><span>Cobradores</span><b>${lim(S.cobradores.length,p.maxCobradores)}</b></div>
    <div><span>Préstamos activos</span><b>${lim(act,p.maxPrestamos)}</b></div></div>
    <p class="small muted" style="margin:10px 0 0">Los clientes entran a su app con este código, su cédula y el PIN que les asignes en su ficha.</p></div>`;
}

/* ===================== Ventanas ===================== */
function abrir(html){$('#sheet').innerHTML=html;$('#modal').hidden=false;$('#tip').hidden=true;const i=$('#sheet input:not([type=checkbox]),#sheet select');if(i&&matchMedia('(min-width:700px)').matches)i.focus()}
function cerrar(){$('#modal').hidden=true;ultimo=null}
const head=(t,s='')=>`<div class="head"><div><h2>${t}</h2>${s?`<div class="muted small">${s}</div>`:''}</div><button class="x" data-a="cerrar" aria-label="Cerrar">×</button></div>`;

function fNuevoPrestamo(clienteId,opts={}){
  const ren=opts.renuevaDe?prest(opts.renuevaDe):null;
  if(ren)clienteId=ren.clienteId;
  const opCli=S.clientes.map(c=>`<option value="${c.id}" ${c.id===clienteId?'selected':''}>${esc(c.nombre)} · ${esc(c.cedula)}</option>`).join('');
  abrir(`${head(ren?'Renovar préstamo':'Nuevo préstamo',ren?`Se descuenta el saldo del préstamo ${ren.num}`:'Revisa la simulación antes de entregar el dinero')}
    <form class="stack" data-form="prestamo" id="fPrest" data-ren="${ren?ren.id:''}" data-sol="${opts.sol||''}">
      <div class="form">
        <div class="f full"><label for="npCli">Cliente</label><select id="npCli" name="clienteId" ${ren?'disabled':''}>${opCli}</select></div>
        <div class="f"><label for="npPlan">Plan</label><select id="npPlan" name="planId">${S.planes.map(p=>`<option value="${p.id}" ${p.id===opts.planId?'selected':''}>${esc(p.nombre)}</option>`).join('')}</select></div>
        <div class="f"><label for="npMonto">Valor del préstamo</label><input id="npMonto" name="monto" inputmode="numeric" value="${(opts.monto||(ren?Math.max(ren.monto,500000):300000)).toLocaleString('es-CO')}"></div>
        <div class="f"><label for="npIni">Fecha de entrega</label><input id="npIni" name="inicio" type="date" value="${hoy()}"></div>
        <div class="f"><label for="npCob">Cobrador</label><select id="npCob" name="cobradorId">${S.cobradores.map(k=>`<option value="${k.id}">${esc(k.nombre)}</option>`).join('')}</select></div>
        <div class="f"><label for="npEnt">Quién entrega el dinero</label><select id="npEnt" name="entregadoPor"><option value="oficina">La oficina</option>${S.cobradores.map(k=>`<option value="${k.id}">${esc(k.nombre)} (de su base)</option>`).join('')}</select></div>
      </div>
      <div id="npSim"></div>
      <div class="row"><button class="btn pri" id="npOk">${ren?'Renovar préstamo':'Registrar préstamo'}</button><button type="button" class="btn" data-a="cerrar">Cancelar</button></div>
    </form>`);
  const sync=()=>{const c=cli($('#npCli').value);if(c.cobradorId)$('#npCob').value=c.cobradorId};
  $('#npCli').onchange=()=>{sync();simNP()};sync();simNP();
}
function simNP(){
  const f=$('#fPrest');if(!f)return;
  const plan=planDe(f.planId.value),P=num(f.monto.value),ini=f.inicio.value||hoy(),ren=f.dataset.ren?prest(f.dataset.ren):null;
  const saldoRen=ren?estado(ren).saldo:0;
  if(!plan||P<=0){$('#npSim').innerHTML='<div class="note bad">Escribe un valor a prestar.</div>';$('#npOk').disabled=true;return}
  const s=simular(plan,P,ini),rv=revisar(s.ea);
  const act=S.prestamos.filter(l=>l.clienteId===f.clienteId.value&&l!==ren).map(l=>estado(l)).filter(e=>e.saldo>0);
  const faltaRen=ren&&P<=saldoRen;
  $('#npSim').innerHTML=`<div class="sim"><div><span class="label">Cuota</span><b>${$$(s.cuota)}</b></div><div><span class="label">Cuotas</span><b>${s.n} ${FRECP[plan.frecuencia]}</b></div>
    <div><span class="label">Total a pagar</span><b>${$$(s.total)}</b></div><div><span class="label">Interés</span><b>${$$(s.interes)}</b></div><div><span class="label">Última cuota</span><b>${fcorta(s.fin)}</b></div><div><span class="label">Tasa efectiva</span><b>${pct(s.ea)}</b></div></div>
    ${ren?`<div class="sim" style="margin-top:10px"><div><span class="label">Nuevo préstamo</span><b>${$$(P)}</b></div><div><span class="label">− Saldo anterior</span><b>${$$(saldoRen)}</b></div><div><span class="label">= Entregar en efectivo</span><b>${$$(Math.max(0,P-saldoRen))}</b></div></div>`:''}
    ${faltaRen?'<div class="note bad" style="margin-top:10px">El nuevo préstamo debe ser mayor que el saldo que se descuenta.</div>':''}
    ${notasTasa(s.ea)}
    ${act.length?`<div style="margin-top:8px" class="note info">Este cliente ya tiene ${act.length===1?'un préstamo activo':act.length+' préstamos activos'} con saldo de ${$$(sum(act,e=>e.saldo))}.</div>`:''}`;
  $('#npOk').disabled=rv.bloq||faltaRen;
}
function fVerPrestamo(id){
  const l=prest(id),e=estado(l),c=cli(l.clienteId);
  abrir(`${head(esc(c.nombre),`${l.num} · ${esc(l.planNombre)} · ${esc(nomCob(l.cobradorId,l))}${l.renuevaDe?' · renueva '+(prest(l.renuevaDe)?.num||''):''}`)}
    <div class="stack">
      <div class="row">${chipEstado(e)} ${chipUsura(l.ea)} ${e.recargo?`<span class="chip c-warn">Recargo sugerido ${$$(e.recargo)}</span>`:''}</div>
      <div class="kv"><div><span>Prestado</span><b>${$$(l.monto)}</b></div><div><span>Cuota</span><b>${$$(l.cuota)}</b></div><div><span>Total a pagar</span><b>${$$(e.total)}</b></div>
        <div><span>Pagado</span><b>${$$(e.pagado)}</b></div><div><span>Saldo</span><b>${$$(e.saldo)}</b></div><div><span>Termina</span><b>${fcorta(l.fechas[l.n-1])}</b></div></div>
      ${e.saldo>0?`<div class="row"><button class="btn" data-a="renovar" data-v="${l.id}">Renovar préstamo</button>${accionesMensaje(l)}</div>`:''}
      ${e.saldo>0&&esAdmin()&&S.cobradores.length>1?`<div class="row" style="align-items:flex-end"><div class="f" style="flex:1;min-width:180px"><label for="reasig">Cobrador de este préstamo</label><select id="reasig">${S.cobradores.map(k=>`<option value="${k.id}" ${k.id===l.cobradorId?'selected':''}>${esc(k.nombre)}</option>`).join('')}</select></div><button class="btn" data-a="reasignar" data-v="${l.id}">Cambiar cobrador</button></div>`:''}
      <div><div class="row between" style="margin-bottom:8px"><h3>Tarjeta de cobro</h3><span class="small muted num">${e.cub} de ${l.n} cuotas</span></div>${tarjeta(l,e)}</div>
      ${e.saldo>0?fPago(l,e,'admin'):''}
      <div><h3 style="margin-bottom:8px">Pagos y novedades</h3>${historial(l,true)}</div>
    </div>`);
}
function accionesMensaje(l){
  const wa=waLink(cli(l.clienteId).telefono,mensajeCobro(l));
  return `<button class="btn" data-a="copiarMsg" data-v="${l.id}">Copiar recordatorio</button>${wa?`<a class="btn" href="${wa}" target="_blank" rel="noopener">Abrir WhatsApp</a>`:''}<textarea id="copyArea" hidden readonly style="width:100%;min-height:80px"></textarea>`;
}
function tarjeta(l,e,T=hoy()){
  const cells=l.fechas.map((f,k)=>{let cl='';if(k<e.cub)cl='pag';else if(k===e.cub&&e.parcial>0)cl='par';else if(f<T)cl='ven';
    if(f===T)cl+=' hoy';return `<div class="cell ${cl}" title="${flarga(f)}"><b>${k+1}</b>${fcorta(f)}</div>`}).join('');
  return `<div class="tarjeta">${cells}</div><div class="legend" style="margin-top:8px"><span><i style="background:var(--pen-soft)"></i>Pagada</span><span><i style="background:var(--bad-soft)"></i>Atrasada</span><span><i style="border:2px solid var(--pen)"></i>Hoy</span><span><i style="border:1px solid var(--line)"></i>Por venir</span></div>`;
}
function historial(l,admin){
  const ev=[...l.pagos.map(p=>({f:p.fecha,h:p.hora,p,t:`<b>${$$(p.monto)}</b> ${p.tipo==='recargo'?'recargo por mora':p.tipo==='renovacion'?'descontado por renovación':'abono'} · recibo ${p.n||''} · ${esc(nomCob(p.cobradorId,l))}${p.anulado?' · anulado':''}`})),
            ...(l.novedades||[]).map(v=>({f:v.fecha,h:v.hora||'',t:`No pagó · ${esc(v.motivo)}`,k:'bad'}))].sort((a,b)=>(b.f+b.h).localeCompare(a.f+a.h));
  return ev.length?`<div class="tablewrap"><table class="compact"><tbody>${ev.map(x=>`<tr class="${x.p&&x.p.anulado?'anulado':''}"><td class="small num" style="white-space:nowrap">${fcorta(x.f)} ${x.h}</td><td style="color:${x.k==='bad'?'var(--bad)':'inherit'}">${x.t}</td>
    <td class="n">${x.p&&!x.p.anulado?`<button class="btn sm" data-a="verRecibo" data-v="${l.id}" data-p="${x.p.id}">Recibo</button>${admin&&x.p.tipo!=='renovacion'?` <button class="btn sm bad" data-a="anular" data-v="${l.id}" data-p="${x.p.id}">${UI.confirmar==='an'+x.p.id?'Confirmar':'Anular'}</button>`:''}`:''}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Todavía no hay pagos.</div>';
}
function fPago(l,e,quien){
  return `<form class="panel stack" data-form="pago" data-v="${l.id}" data-quien="${quien}">
    <h3 style="margin:0">Registrar pago</h3>
    ${e.deudaVencida>0?`<div class="note bad">Atrasado ${$$(e.deudaVencida)} (${e.dias} ${e.dias===1?'día':'días'}).</div>`:''}
    ${e.recargo?`<label class="check note warn"><input type="checkbox" name="conRecargo" id="rc-${l.num}"> Cobrar también recargo por mora de ${$$(e.recargo)} (${e.diasCobro} ${e.diasCobro===1?'día':'días'})</label>`:''}
    <div class="row">
      <button type="button" class="btn ok" data-a="pagoRapido" data-v="${l.id}" data-m="${Math.min(l.cuota,e.saldo)}">Pagó la cuota · ${$$(Math.min(l.cuota,e.saldo))}</button>
      ${e.sugerido>l.cuota?`<button type="button" class="btn" data-a="pagoRapido" data-v="${l.id}" data-m="${e.sugerido}">Se puso al día · ${$$(e.sugerido)}</button>`:''}
    </div>
    <div class="row" style="align-items:flex-end"><div class="f" style="flex:1;min-width:140px"><label for="pm-${l.num}">Otro valor (abono)</label><input id="pm-${l.num}" name="monto" inputmode="numeric" placeholder="$ 0"></div><button class="btn pri">Registrar abono</button></div>
    <div class="row" style="align-items:flex-end"><div class="f" style="flex:1;min-width:140px"><label for="nm-${l.num}">Si no pagó, motivo</label><select id="nm-${l.num}" name="motivo"><option>No tenía plata</option><option>Cerrado</option><option>No estaba</option><option>Pidió volver más tarde</option><option>Se negó a pagar</option></select></div><button type="button" class="btn bad" data-a="noPago" data-v="${l.id}">Marcar no pagó</button></div>
  </form>`;
}
function fRecibo(l,pg){
  const txt=textoRecibo(l,pg),wa=waLink(cli(l.clienteId).telefono,txt);
  abrir(`${head('Recibo de pago',`${esc(cli(l.clienteId).nombre)} · ${esc(cli(l.clienteId).telefono||'')}`)}
    <div class="stack"><div class="ticket">${esc(txt)}</div>
    <div class="row" style="justify-content:center"><button class="btn pri" data-a="copiarRecibo">Copiar para WhatsApp</button>${wa?`<a class="btn" href="${wa}" target="_blank" rel="noopener">Abrir WhatsApp</a>`:''}<button class="btn" data-a="cerrar">Listo</button></div>
    <textarea id="copyArea" hidden readonly style="width:100%;min-height:120px"></textarea>
    <p class="small muted" style="text-align:center;margin:0">En la versión instalada este recibo también se imprime en impresoras térmicas Bluetooth de 58 mm.</p></div>`);
  $('#sheet').dataset.recibo=txt;
}
function fCliente(id){
  const c=id?cli(id):{nombre:'',cedula:'',telefono:'',negocio:'',direccion:'',barrio:'',referencia:'',cobradorId:S.cobradores[0]?.id};
  const ls=id?S.prestamos.filter(l=>l.clienteId===id):[];
  const pagados=ls.filter(l=>estado(l).saldo<=0).length,enMora=ls.filter(l=>estado(l).est==='mora').length;
  abrir(`${head(id?esc(c.nombre):'Nuevo cliente',id?`${pagados} ${pagados===1?'préstamo pagado':'préstamos pagados'}${enMora?' · '+enMora+' en mora':''}`:'')}
    <form class="stack" data-form="cliente" data-v="${id||''}"><div class="form">
      ${[['nombre','Nombre completo'],['cedula','Cédula'],['telefono','Celular'],['negocio','Negocio o actividad'],['direccion','Dirección de cobro'],['barrio','Barrio'],['referencia','Referencia o fiador']].map(([k,n])=>`<div class="f"><label for="cl-${k}">${n}</label><input id="cl-${k}" name="${k}" value="${esc(c[k])}" ${k==='nombre'||k==='cedula'?'required':''}></div>`).join('')}
      <div class="f"><label for="cl-cob">Cobrador</label><select id="cl-cob" name="cobradorId">${S.cobradores.map(k=>`<option value="${k.id}" ${k.id===c.cobradorId?'selected':''}>${esc(k.nombre)}</option>`).join('')}</select></div>
      <div class="f"><label for="cl-ord">Orden en la ruta</label><input id="cl-ord" name="orden" inputmode="numeric" value="${c.orden||''}"></div>
    </div>
    <div class="row"><button class="btn pri">Guardar cliente</button>${id?`<button type="button" class="btn" data-a="nuevoPrestamo" data-v="${id}">Prestarle</button>`:''}</div></form>
    ${id?accesoCliente(id):''}
    ${ls.length?`<div style="margin-top:16px"><h3 style="margin-bottom:8px">Historial de préstamos</h3><div class="list">${ls.slice().reverse().map(l=>{const e=estado(l);return `<button class="item" data-a="verPrestamo" data-v="${l.id}"><span class="ord">${l.n}</span><span><span class="t">${$$(l.monto)}</span><div class="small muted">${l.num} · ${fcorta(l.inicio)} · ${esc(l.planNombre)}</div></span><span class="r">${chipEstado(e)}</span></button>`}).join('')}</div></div>`:''}`);
}
function fCobrador(id){
  const k=id?cob(id):{nombre:'',telefono:'',ruta:'',comision:5};
  abrir(`${head(id?esc(k.nombre):'Nuevo cobrador')}<form class="stack" data-form="cobrador" data-v="${id||''}"><div class="form">
    <div class="f"><label for="kb-n">Nombre</label><input id="kb-n" name="nombre" value="${esc(k.nombre)}" required></div>
    <div class="f"><label for="kb-t">Celular</label><input id="kb-t" name="telefono" value="${esc(k.telefono)}"></div>
    <div class="f"><label for="kb-r">Ruta o zona</label><input id="kb-r" name="ruta" value="${esc(k.ruta)}"></div>
    <div class="f"><label for="kb-c">Comisión (%)</label><input id="kb-c" name="comision" inputmode="decimal" value="${String(k.comision||0).replace('.',',')}"></div>
    <div class="f"><label for="kb-b">Se calcula sobre</label><select id="kb-b" name="comBase"><option value="recaudo" ${k.comBase!=='interes'?'selected':''}>Todo lo recaudado</option><option value="interes" ${k.comBase==='interes'?'selected':''}>Solo intereses y recargos cobrados</option></select></div></div>
    <div><button class="btn pri">Guardar</button></div></form>${id?accesoCobrador(id):''}`);
}
function fPlan(id){
  const p=id?planDe(id):{nombre:'',metodo:'frances',tasa:1.8,frecuencia:'diaria',cuotas:30,domingos:false};
  abrir(`${head(id?'Editar plan':'Nuevo plan','Los préstamos ya entregados conservan las condiciones con que se hicieron')}
    <form class="stack" data-form="plan" id="fPlan" data-v="${id||''}"><div class="form">
      <div class="f full"><label for="pl-n">Nombre del plan</label><input id="pl-n" name="nombre" value="${esc(p.nombre)}" required placeholder="Ej. Diario 30 cuotas"></div>
      <div class="f full"><label for="pl-m">Cómo se calcula el interés</label><select id="pl-m" name="metodo">${Object.entries(METODOS).map(([k,n])=>`<option value="${k}" ${p.metodo===k?'selected':''}>${n}</option>`).join('')}</select></div>
      <div class="f"><label for="pl-t" id="pl-tl">Tasa (%)</label><input id="pl-t" name="tasa" inputmode="decimal" value="${String(p.tasa).replace('.',',')}"></div>
      <div class="f"><label for="pl-f">Frecuencia de pago</label><select id="pl-f" name="frecuencia">${Object.entries(FRECS).map(([k,n])=>`<option value="${k}" ${p.frecuencia===k?'selected':''}>${n}</option>`).join('')}</select></div>
      <div class="f"><label for="pl-c">Número de cuotas</label><input id="pl-c" name="cuotas" inputmode="numeric" value="${p.cuotas}"></div>
      <label class="check f"><input type="checkbox" id="pl-d" name="domingos" ${p.domingos?'checked':''}> Cobrar los domingos</label>
    </div>
    <div id="plSim"></div>
    <div class="row"><button class="btn pri">Guardar plan</button>${id?`<button type="button" class="btn bad" data-a="borrarPlan" data-v="${id}">${UI.confirmar==='plan'+id?'Confirmar eliminar':'Eliminar plan'}</button>`:''}</div></form>`);
  simPlan();
}
function leerPlan(f){return {nombre:f.nombre.value.trim(),metodo:f.metodo.value,tasa:dec(f.tasa.value),frecuencia:f.frecuencia.value,cuotas:Math.max(1,parseInt(f.cuotas.value)||1),domingos:f.domingos.checked}}
function simPlan(){
  const f=$('#fPlan');if(!f)return;const p=leerPlan(f);
  $('#pl-tl').textContent=p.metodo==='fijo'?'Porcentaje sobre el préstamo (%)':'Tasa mensual (%)';
  const s=simular(p,500000,hoy()),rv=revisar(s.ea);
  $('#plSim').innerHTML=`<div class="sim"><div><span class="label">Con $ 500.000</span><b>${$$(s.cuota)} × ${s.n}</b></div><div><span class="label">Total</span><b>${$$(s.total)}</b></div><div><span class="label">Termina</span><b>${fcorta(s.fin)}</b></div><div><span class="label">Tasa efectiva</span><b>${pct(s.ea)}</b></div></div>
   ${notasTasa(s.ea)}${rv.bloq?'<div class="small muted" style="margin-top:6px">Puedes guardar el plan, pero el sistema no dejará prestar con él mientras supere el límite.</div>':''}`;
}
function fGasto(cobradorId,fecha){
  abrir(`${head('Registrar gasto')}<form class="stack" data-form="gasto"><div class="form">
    <div class="f"><label for="g-c">Concepto</label><input id="g-c" name="concepto" required placeholder="Gasolina, almuerzo, papelería…"></div>
    <div class="f"><label for="g-m">Valor</label><input id="g-m" name="monto" inputmode="numeric" required></div>
    <div class="f"><label for="g-q">Quién</label><select id="g-q" name="cobradorId"><option value="">Oficina</option>${S.cobradores.map(k=>`<option value="${k.id}" ${k.id===cobradorId?'selected':''}>${esc(k.nombre)}</option>`).join('')}</select></div>
    <div class="f"><label for="g-f">Fecha</label><input id="g-f" type="date" name="fecha" value="${fecha||hoy()}"></div></div>
    <div><button class="btn pri">Guardar gasto</button></div></form>`);
}
function fBase(){
  abrir(`${head('Entregar base','Dinero que sale con el cobrador para prestar y dar vueltas')}<form class="stack" data-form="base"><div class="form">
    <div class="f"><label for="b-q">Cobrador</label><select id="b-q" name="cobradorId">${S.cobradores.map(k=>`<option value="${k.id}">${esc(k.nombre)}</option>`).join('')}</select></div>
    <div class="f"><label for="b-m">Valor</label><input id="b-m" name="monto" inputmode="numeric" required></div>
    <div class="f"><label for="b-f">Fecha</label><input id="b-f" type="date" name="fecha" value="${UI.cajaFecha}"></div></div>
    <div><button class="btn pri">Registrar base</button></div></form>`);
}

function accesoCobrador(id){
  if(B.demo)return `<div class="panel" style="margin-top:16px"><h3>Acceso a la app</h3><p class="small muted" style="margin:0">Cuando conectes la app a Firebase, aquí le creas al cobrador su usuario y contraseña.</p></div>`;
  const u=S.usuarios.find(x=>x.cobradorId===id&&x.activo);
  return `<div class="panel stack" style="margin-top:16px"><h3 style="margin:0">Acceso a la app</h3>${u?`<p style="margin:0">Entra con <b>${esc(u.email)}</b>. Si olvida la contraseña, en la pantalla de ingreso toca «Olvidé mi contraseña».</p><div><button class="btn bad" data-a="desactivar" data-v="${u.id}">Desactivar acceso</button></div>`:
    `<p class="small muted" style="margin:0">Crea el usuario con que el cobrador entra desde su celular. Solo verá su ruta, sus clientes y su cuadre.</p>
    <div class="form"><div class="f"><label for="acc-c">Correo</label><input id="acc-c" type="email" value="${esc(cob(id).email||'')}"></div><div class="f"><label for="acc-p">Contraseña inicial</label><input id="acc-p" type="text" minlength="6" placeholder="Mínimo 6 caracteres"></div></div>
    <div><button class="btn pri" data-a="crearAccesoCob" data-v="${id}">Crear acceso</button></div>`}</div>`;
}
function accesoCliente(id){
  if(B.demo)return `<div class="panel" style="margin-top:16px"><h3>App del cliente</h3><p class="small muted" style="margin:0">Cuando conectes la app a Firebase, aquí le activas al cliente su app con un PIN.</p></div>`;
  const u=S.usuarios.find(x=>x.clienteId===id&&x.activo),c=cli(id);
  return `<div class="panel stack" style="margin-top:16px"><h3 style="margin:0">App del cliente</h3>${u?`<p style="margin:0">Activa. Entra con el código <b>${esc(S.tenant.codigo)}</b>, su cédula y su PIN.</p><div><button class="btn bad" data-a="desactivar" data-v="${u.id}">Desactivar app</button></div>`:
    S.usuarios.some(x=>x.clienteId===id)?`<p class="small muted" style="margin:0">La app de este cliente fue desactivada. Por ahora no se puede volver a crear con la misma cédula; se habilitará cuando el proyecto pase al plan Blaze de Firebase.</p>`:
    `<p class="small muted" style="margin:0">El cliente verá su saldo, su tarjeta, sus recibos y podrá pedir préstamos. Entra con el código <b>${esc(S.tenant.codigo)}</b>, su cédula (${esc(c.cedula||'falta')}) y este PIN.</p>
    <div class="row" style="align-items:flex-end"><div class="f" style="flex:1;min-width:160px"><label for="acc-pin">PIN de 6 números</label><input id="acc-pin" inputmode="numeric" maxlength="6" value="${String(Math.floor(100000+Math.random()*900000))}"></div><button class="btn pri" data-a="crearAccesoCli" data-v="${id}">Activar app del cliente</button></div>`}</div>`;
}

/* ===================== Cobrador ===================== */
function vCobrador(){
  const k=cob(UI.cobradorId),T=hoy();
  const login=!esAdmin()?'':`<div class="login"><div class="f"><label for="selCob">Ver como (vista previa de la oficina)</label><select id="selCob">${S.cobradores.map(x=>`<option value="${x.id}" ${x.id===UI.cobradorId?'selected':''}>${esc(x.nombre)}</option>`).join('')}</select></div></div>`;
  const items=S.prestamos.filter(l=>l.cobradorId===UI.cobradorId).map(l=>({l,e:estado(l,T),c:cli(l.clienteId)})).filter(x=>x.e.enRuta)
    .sort((a,b)=>{const d=x=>x.e.ruta==='pendiente'?0:1;return d(a)-d(b)||(a.c.orden||0)-(b.c.orden||0)});
  const x=totales(UI.cobradorId),q=cuadre(k,T);
  const pend=items.filter(i=>i.e.ruta==='pendiente').length;
  let body='';
  if(UI.ctab==='ruta'){
    body=items.length?`<div class="list">${items.map(({l,e,c},i)=>`<button class="item ${e.ruta==='pendiente'?'':'done'}" data-a="cobrar" data-v="${l.id}">
      <span class="ord">${i+1}</span><span><span class="t">${esc(c.nombre)}</span><div class="small muted">${esc(c.negocio)} · ${esc(c.direccion)}</div></span>
      <span class="r"><b class="num">${$$(e.ruta==='pendiente'?e.aCobrarInicio:e.pagoHoy)}</b>${e.ruta==='pendiente'&&e.dias>0?`<span class="chip c-bad">${e.dias} d atraso</span>`:chipRuta[e.ruta]}</span></button>`).join('')}</div>`:'<div class="empty">No tienes cobros para hoy.</div>';
  }else if(UI.ctab==='clientes'){
    const cs=S.clientes.filter(c=>c.cobradorId===UI.cobradorId).sort((a,b)=>(a.orden||0)-(b.orden||0));
    body=`<div class="list">${cs.map(c=>{const ls=S.prestamos.filter(l=>l.clienteId===c.id).map(l=>({l,e:estado(l)})).filter(y=>y.e.saldo>0);
      return `<button class="item" ${ls[0]?`data-a="cobrar" data-v="${ls[0].l.id}"`:''}><span class="ord">${c.orden||''}</span><span><span class="t">${esc(c.nombre)}</span><div class="small muted">${esc(c.telefono)} · ${esc(c.barrio)}</div></span><span class="r">${ls[0]?`<b class="num">${$$(ls[0].e.saldo)}</b>${chipEstado(ls[0].e)}`:'<span class="chip c-mut">Sin saldo</span>'}</span></button>`}).join('')}</div>`;
  }else{
    const pagosHoy=S.prestamos.filter(l=>l.cobradorId===UI.cobradorId).flatMap(l=>vivos(l).filter(p=>p.fecha===T&&p.tipo!=='renovacion').map(p=>({...p,c:cli(l.clienteId).nombre}))).sort((a,b)=>a.hora.localeCompare(b.hora));
    const gast=S.gastos.filter(g=>g.fecha===T&&g.cobradorId===UI.cobradorId);
    const fila=(a,b,st='')=>`<div class="agrow" style="grid-template-columns:1fr auto">${a}<b class="num" style="${st}">${b}</b></div>`;
    body=`<div class="stack"><div class="panel"><h3>Liquidación de hoy</h3>
      ${fila('<span>Base recibida</span>',$$(q.base))}${fila('<span>+ Recogido (cuotas y recargos)</span>',$$(q.rec+q.recg))}${fila('<span>− Préstamos entregados</span>',$$(q.pres))}${fila('<span>− Gastos</span>',$$(q.g))}
      ${fila('<b>Debe entregar a la oficina</b>',$$(q.entregar),'font-size:18px')}${fila(`<span class="muted">Su comisión de hoy (${pe(k.comision||0)} ${baseTxt(k)})</span>`,$$(q.com),'color:var(--ok)')}</div>
      <div class="row between"><h3>Gastos de hoy</h3><button class="btn sm" data-a="nuevoGasto" data-v="${UI.cobradorId}">+ Gasto</button></div>
      ${gast.length?`<div class="tablewrap"><table class="compact"><tbody>${gast.map(g=>`<tr><td>${esc(g.concepto)}</td><td class="n">${$$(g.monto)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Sin gastos.</div>'}
      <h3>Pagos recibidos hoy</h3>${pagosHoy.length?`<div class="tablewrap"><table class="compact"><tbody>${pagosHoy.map(p=>`<tr><td class="small num">${p.hora}</td><td>${esc(p.c)}${p.tipo==='recargo'?' <span class="small muted">· recargo</span>':''}</td><td class="n">${$$(p.monto)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Aún no hay pagos.</div>'}</div>`;
  }
  const av=x.meta?x.recaudo/x.meta:0;
  return `<div class="phone">${login}
    <div class="hero"><div class="row between"><span>${esc(k.nombre)} · ${esc(k.ruta)}</span><span class="num">${fcorta(T)}</span></div>
      <div class="big" style="margin-top:8px">${$$(x.recaudo)}</div><div class="small">recogido de ${$$(x.meta)} programado</div>
      <div class="prog"><i style="width:${Math.min(100,av*100)}%"></i></div>
      <div class="row between"><span>${items.length-pend} de ${items.length} visitados</span><span>${pend} pendientes</span></div></div>
    <h3 class="sect">${{ruta:'Ruta de hoy',clientes:'Mis clientes',cuadre:'Cuadre del día'}[UI.ctab]}</h3>
    ${body}</div>`;
}
function fCobrar(id){
  const l=prest(id),e=estado(l),c=cli(l.clienteId);
  abrir(`${head(esc(c.nombre),`${esc(c.negocio)} · ${esc(c.direccion)} · ${esc(c.telefono)}`)}
    <div class="stack"><div class="row">${chipEstado(e)} ${e.ruta!=='pendiente'?chipRuta[e.ruta]:''}</div>
    <div class="kv"><div><span>Cuota</span><b>${$$(l.cuota)}</b></div><div><span>Saldo</span><b>${$$(e.saldo)}</b></div><div><span>Cuotas</span><b>${e.cub} de ${l.n}</b></div></div>
    ${e.saldo>0?fPago(l,e,'cobrador'):'<div class="note ok">Este préstamo ya está pagado.</div>'}
    ${e.saldo>0?`<div class="row">${accionesMensaje(l)}</div>`:''}
    <details><summary class="label" style="cursor:pointer">Ver tarjeta y pagos</summary><div class="stack" style="margin-top:10px">${tarjeta(l,e)}${historial(l,false)}</div></details></div>`);
}


/* ===================== Cliente ===================== */
function vCliente(){
  const c=cli(UI.clienteId),T=hoy();
  const login=!esAdmin()?'':`<div class="login"><div class="f"><label for="selCli">Ver como (vista previa de la oficina)</label><select id="selCli">${S.clientes.map(x=>`<option value="${x.id}" ${x.id===UI.clienteId?'selected':''}>${esc(x.nombre)}</option>`).join('')}</select></div></div>`;
  const ls=S.prestamos.filter(l=>l.clienteId===UI.clienteId).map(l=>({l,e:estado(l,T)}));
  const act=ls.filter(x=>x.e.saldo>0),pag=ls.filter(x=>x.e.saldo<=0);
  let body='';
  if(UI.cltab==='prestamo'){
    body=act.length?act.map(({l,e})=>{const prox=l.fechas[e.cub];
      return `<div class="stack" style="margin-top:16px">
      <div class="hero"><div class="row between"><span>Préstamo ${l.num} · ${$$(l.monto)}</span>${e.est==='mora'?`<span class="chip" style="background:var(--bad-soft);color:var(--bad)">Atrasado ${e.dias} ${e.dias===1?'día':'días'}</span>`:'<span class="chip" style="background:rgba(255,255,255,.2);color:inherit">Al día</span>'}</div>
        <div class="small" style="margin-top:10px">Te falta pagar</div><div class="big">${$$(e.saldo)}</div>
        <div class="prog"><i style="width:${e.pagado/e.total*100}%"></i></div>
        <div class="row between"><span>${e.cub} de ${l.n} cuotas pagadas</span><span>Termina ${fcorta(l.fechas[l.n-1])}</span></div></div>
      <div class="kv"><div><span>Tu cuota</span><b>${$$(l.cuota)}</b></div><div><span>Próximo pago</span><b>${prox?(prox===T?'Hoy':fcorta(prox)):'—'}</b></div>${e.deudaVencida>0?`<div><span>Para ponerte al día</span><b style="color:var(--bad)">${$$(e.deudaVencida)}</b></div>`:''}<div><span>Tu cobrador</span><b>${esc(nomCob(l.cobradorId,l))}</b></div></div>
      <div class="panel"><h3>Tu tarjeta</h3>${tarjeta(l,e)}</div>
      <div class="panel"><h3>Condiciones del préstamo</h3><div class="kv"><div><span>Recibiste</span><b>${$$(l.monto)}</b></div><div><span>Pagas en total</span><b>${$$(e.total)}</b></div><div><span>Intereses</span><b>${$$(e.interes)}</b></div><div><span>Tasa efectiva anual</span><b>${pct(l.ea)}</b></div></div></div></div>`}).join(''):
      `<div class="panel" style="margin-top:16px"><h3>No tienes préstamos activos</h3><p class="muted" style="margin:0 0 12px">Puedes pedir uno nuevo desde aquí.</p><button class="btn pri" data-a="cltab" data-v="solicitar">Solicitar préstamo</button></div>`;
    if(pag.length)body+=`<h3 class="sect">Préstamos pagados</h3><div class="list">${pag.map(({l})=>`<div class="item"><span class="ord">✓</span><span><span class="t">${$$(l.monto)}</span><div class="small muted">${fcorta(l.inicio)} – ${fcorta(l.fechas[l.n-1])}</div></span><span class="r"><span class="chip c-ok">Pagado</span></span></div>`).join('')}</div>`;
  }else if(UI.cltab==='pagos'){
    const todos=ls.flatMap(({l})=>vivos(l).map(p=>({p,l}))).sort((a,b)=>(b.p.fecha+b.p.hora).localeCompare(a.p.fecha+a.p.hora));
    body=`<h3 class="sect">Tus pagos</h3>${todos.length?`<div class="tablewrap"><table class="compact"><tbody>${todos.slice(0,60).map(({p,l})=>`<tr><td class="small num" style="white-space:nowrap">${fcorta(p.fecha)} ${p.hora}</td><td><b>${$$(p.monto)}</b><div class="small muted">${p.tipo==='recargo'?'Recargo':p.tipo==='renovacion'?'Renovación':'Cuota'} · recibo ${p.n}</div></td><td class="n"><button class="btn sm" data-a="verRecibo" data-v="${l.id}" data-p="${p.id}">Recibo</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Aún no hay pagos.</div>'}`;
  }else{
    const mias=S.solicitudes.filter(s=>s.clienteId===UI.clienteId);
    const ok=S.planes.filter(p=>!revisar(simular(p,500000,T).ea).bloq);
    body=`<h3 class="sect">Solicitar un préstamo</h3>
      <form class="panel stack" data-form="solicitud" id="fSol">
        <div class="f"><label for="so-m">¿Cuánto necesitas?</label><input id="so-m" name="monto" inputmode="numeric" value="300.000"></div>
        <div class="f"><label for="so-p">¿Cómo quieres pagar?</label><select id="so-p" name="planId">${ok.map(p=>`<option value="${p.id}">${esc(p.nombre)}</option>`).join('')}</select></div>
        <div class="f"><label for="so-n">¿Para qué es? (opcional)</label><input id="so-n" name="nota" placeholder="Ej. surtir el negocio"></div>
        <div id="soSim"></div>
        <button class="btn pri block">Enviar solicitud</button>
        <p class="small muted" style="margin:0">La oficina revisa tu historial y te confirma. Nadie te va a pedir dinero por adelantado para aprobarte.</p>
      </form>
      ${mias.length?`<h3 class="sect">Tus solicitudes</h3><div class="list">${mias.slice().reverse().map(s=>`<div class="item"><span class="ord">${s.estado==='aprobada'?'✓':s.estado==='rechazada'?'×':'…'}</span><span><span class="t">${$$(s.monto)}</span><div class="small muted">${fcorta(s.fecha)}</div></span><span class="r">${s.estado==='pendiente'?'<span class="chip c-pen">En revisión</span>':s.estado==='aprobada'?'<span class="chip c-ok">Aprobada</span>':'<span class="chip c-bad">No aprobada</span>'}</span></div>`).join('')}</div>`:''}`;
  }
  return `<div class="phone">${login}<div style="margin-top:18px"><div class="label">Hola</div><h2>${esc(c.nombre.split(' ')[0])}</h2></div>${body}</div>`;
}
function simSol(){const f=$('#fSol');if(!f)return;const p=planDe(f.planId.value),P=num(f.monto.value);if(!p||P<=0){$('#soSim').innerHTML='';return}
  const s=simular(p,P,hoy());$('#soSim').innerHTML=`<div class="sim"><div><span class="label">Cuota</span><b>${$$(s.cuota)}</b></div><div><span class="label">Cuotas</span><b>${s.n} ${FRECP[p.frecuencia]}</b></div><div><span class="label">Total</span><b>${$$(s.total)}</b></div></div>`}


/* ===================== Plataforma (dueño de la app) ===================== */
const PLAT={emps:[],uso:{},contactos:{},filtro:'todas',buscar:'',unsub:null,pedidos:{}};
const fMs=v=>{const m=ms(v);return m?fcorta(iso(new Date(m)))+' '+new Date(m).getFullYear():'—'};
function haceCuanto(v){const m=ms(v);if(!m)return 'Nunca';const h=(Date.now()-m)/36e5;if(h<1)return 'Hace minutos';if(h<24)return `Hace ${Math.floor(h)} h`;const d=Math.floor(h/24);return d===1?'Ayer':`Hace ${d} días`}
function chipEmpresa(e){const x=estadoEmpresa(e,DIAS_PRUEBA);
  return x.estado==='activa'?'<span class="chip c-ok">Activa</span>':x.estado==='suspendida'?'<span class="chip c-bad">Suspendida</span>':x.estado==='vencida'?'<span class="chip c-bad">Prueba vencida</span>':`<span class="chip ${x.dias<=7?'c-warn':'c-pen'}">Prueba · ${x.dias} ${x.dias===1?'día':'días'}</span>`}
const limTxt=p=>p?`${p.maxCobradores||'∞'} cobr. · ${p.maxPrestamos||'∞'} prést.`:'—';
const precioPlan=nombre=>(PLANES_SUSCRIPCION.find(p=>p.nombre===nombre)||{}).precio||0;
function escucharPlataforma(){
  if(PLAT.unsub)return;
  PLAT.unsub=B.escucharEmpresas(list=>{PLAT.emps=list;
    list.forEach(e=>{
      if(!PLAT.pedidos[e.id]){PLAT.pedidos[e.id]=1;
        B.usoEmpresa(e.id).then(u=>{PLAT.uso[e.id]=u;if(UI.role==='plataforma')render()}).catch(()=>{});
        B.contactoEmpresa(e).then(c=>{PLAT.contactos[e.id]=c;if(UI.role==='plataforma')render()}).catch(()=>{});}
    });
    if(UI.role==='plataforma')render()});
}
function dejarPlataforma(){if(PLAT.unsub){PLAT.unsub();PLAT.unsub=null}}
function vPlataforma(){
  escucharPlataforma();
  const filas=PLAT.emps.map(e=>({e,x:estadoEmpresa(e,DIAS_PRUEBA),c:PLAT.contactos[e.id]||e.contacto,u:PLAT.uso[e.id]}));
  const n=k=>filas.filter(f=>f.x.estado===k).length;
  const porVencer=filas.filter(f=>f.x.estado==='prueba'&&f.x.dias<=7).length;
  const ingreso=sum(filas.filter(f=>f.x.estado==='activa'),f=>precioPlan(f.e.plan?.nombre));
  const q=PLAT.buscar.toLowerCase();
  const vis=filas.filter(f=>PLAT.filtro==='todas'||(PLAT.filtro==='bloqueadas'?!f.x.opera:PLAT.filtro==='porvencer'?(f.x.estado==='prueba'&&f.x.dias<=7):f.x.estado===PLAT.filtro))
    .filter(f=>!q||(f.e.nombre||'').toLowerCase().includes(q)||(f.e.codigo||'').toLowerCase().includes(q)||(f.c?.email||'').toLowerCase().includes(q))
    .sort((a,b)=>(ms(b.e.creado)||0)-(ms(a.e.creado)||0));
  const chips=[['todas','Todas'],['prueba','En prueba'],['porvencer','Vencen pronto'],['activa','Activas'],['bloqueadas','Bloqueadas']].map(([k,t])=>`<button class="btn sm ${PLAT.filtro===k?'pri':''}" data-a="platFiltro" data-v="${k}">${t}</button>`).join('');
  return `<div class="admin" style="grid-template-columns:minmax(0,1fr)"><div class="stack">
    <div class="row between"><div><h2>Panel de plataforma</h2><div class="muted">Todas las empresas que usan Cartera Diaria. Solo tú ves esta sección.</div></div>
      ${ME?`<button class="btn" data-a="role" data-v="${ME.rol}">Volver a mi empresa</button>`:''}</div>
    <div class="kpis">
      <div class="kpi"><div class="label">Empresas</div><div class="v">${filas.length}</div><div class="s">registradas</div></div>
      <div class="kpi"><div class="label">Activas</div><div class="v" style="color:var(--ok)">${n('activa')}</div><div class="s">pagando</div></div>
      <div class="kpi"><div class="label">En prueba</div><div class="v">${n('prueba')}</div><div class="s">${porVencer} ${porVencer===1?'vence':'vencen'} en 7 días o menos</div></div>
      <div class="kpi"><div class="label">Bloqueadas</div><div class="v" style="color:var(--bad)">${n('suspendida')+n('vencida')}</div><div class="s">${n('suspendida')} suspendidas · ${n('vencida')} con prueba vencida</div></div>
      <div class="kpi"><div class="label">Ingreso mensual</div><div class="v">${$$(ingreso)}</div><div class="s">según el plan de las activas</div></div>
    </div>
    <div class="row">${chips}<div class="f" style="margin-left:auto;min-width:220px;flex:1;max-width:320px"><input id="platBuscar" placeholder="Buscar empresa, código o correo" value="${esc(PLAT.buscar)}" aria-label="Buscar empresa"></div></div>
    <div class="tablewrap"><table><thead><tr><th>Empresa</th><th>Estado</th><th>Plan</th><th class="n">Uso</th><th>Creada</th><th>Último acceso</th><th></th></tr></thead><tbody>
    ${vis.map(({e,x,c,u})=>`<tr class="click" data-a="verEmpresa" data-v="${e.id}"><td><b>${esc(e.nombre||'(sin nombre)')}</b><div class="small muted">${esc(e.codigo||'')}${c?` · ${esc(c.nombre||'')} · ${esc(c.email||'')}`:''}</div>${e.notaPlataforma?`<div class="small" style="color:var(--warn)">${esc(e.notaPlataforma)}</div>`:''}</td>
      <td>${chipEmpresa(e)}</td><td>${esc(e.plan?.nombre||'—')}<div class="small muted">${limTxt(e.plan)}</div></td>
      <td class="n">${u?`${u.cobradores} cobr.<div class="small muted">${u.prestamos} préstamos</div>`:'<span class="muted">…</span>'}</td>
      <td class="small">${fMs(e.creado)}</td><td class="small">${haceCuanto(e.ultimoAcceso)}</td><td class="n"><button class="btn sm">Gestionar</button></td></tr>`).join('')||`<tr><td colspan="7" class="empty">${PLAT.emps.length?'Ninguna empresa coincide.':'Cargando empresas…'}</td></tr>`}
    </tbody></table></div>
    <p class="small muted" style="margin:0">El uso cuenta cobradores y préstamos registrados (activos y pagados). Por privacidad, desde aquí no se ven clientes ni pagos de las empresas.</p>
  </div></div>`;
}
function fEmpresa(id){
  const e=PLAT.emps.find(x=>x.id===id);if(!e)return;
  const x=estadoEmpresa(e,DIAS_PRUEBA),c=PLAT.contactos[id]||e.contacto,u=PLAT.uso[id];
  const base=Math.max(Date.now(),x.hasta||0);
  abrir(`${head(esc(e.nombre||'Empresa'),`Código ${esc(e.codigo||'')} · creada el ${fMs(e.creado)}`)}
    <div class="stack">
      <div class="row">${chipEmpresa(e)} ${x.hasta?`<span class="small muted">Prueba hasta el ${fMs(x.hasta)}</span>`:''}</div>
      <div class="kv"><div><span>Contacto</span><b>${esc(c?.nombre||'—')}</b><small class="muted" style="display:block;overflow-wrap:anywhere">${esc(c?.email||'')}</small></div>
        <div><span>Plan</span><b>${esc(e.plan?.nombre||'—')}</b><small class="muted" style="display:block">${limTxt(e.plan)}</small></div>
        <div><span>Uso</span><b>${u?`${u.cobradores} cobradores`:'…'}</b><small class="muted" style="display:block">${u?u.prestamos+' préstamos':''}</small></div>
        <div><span>Último acceso</span><b>${haceCuanto(e.ultimoAcceso)}</b></div></div>
      <div class="panel stack"><h3 style="margin:0">Estado</h3>
        <div class="row">
          <button class="btn ok" data-a="empEstado" data-v="${id}" data-e="activa" ${x.estado==='activa'?'disabled':''}>Activar</button>
          <button class="btn bad" data-a="empEstado" data-v="${id}" data-e="suspendida" ${x.estado==='suspendida'?'disabled':''}>${UI.confirmar==='susp'+id?'Confirmar suspensión':'Suspender'}</button>
        </div>
        <p class="small muted" style="margin:0">Al suspender, la oficina, los cobradores y los clientes de esa empresa ven un aviso y no pueden trabajar. Sus datos no se borran; al activarla, todo vuelve como estaba.</p></div>
      <div class="panel stack"><h3 style="margin:0">Periodo de prueba</h3>
        <div class="row">${[7,15,30].map(d=>`<button class="btn" data-a="empExtender" data-v="${id}" data-d="${d}">+${d} días</button>`).join('')}</div>
        <p class="small muted" style="margin:0">Deja la empresa en prueba y corre la fecha de vencimiento a partir de ${x.hasta&&x.hasta>Date.now()?'la fecha actual de vencimiento':'hoy'}. Por ejemplo, +15 días: hasta el ${fMs(base+15*864e5)}.</p></div>
      <div class="panel stack"><h3 style="margin:0">Plan de suscripción</h3>
        <div class="row" style="align-items:flex-end"><div class="f" style="flex:1;min-width:200px"><label for="empPlanSel">Plan</label><select id="empPlanSel">${PLANES_SUSCRIPCION.map((p,i)=>`<option value="${i}" ${e.plan?.nombre===p.nombre?'selected':''}>${esc(p.nombre)} · ${limTxt(p)}${p.precio?' · '+$$(p.precio)+'/mes':''}</option>`).join('')}</select></div>
        <button class="btn pri" data-a="empPlan" data-v="${id}">Aplicar plan</button></div></div>
      <div class="panel stack"><h3 style="margin:0">Nota interna</h3>
        <div class="f"><label for="empNota">Solo tú la ves (por ejemplo: pagó hasta octubre, pidió factura)</label><textarea id="empNota">${esc(e.notaPlataforma||'')}</textarea></div>
        <div><button class="btn" data-a="empNota" data-v="${id}">Guardar nota</button></div></div>
    </div>`);
}
function vBloqueada(x){
  const t=S.tenant||{},wa=telWa(SOPORTE.telefono);
  const titulo=x.estado==='suspendida'?'La cuenta está suspendida':'Terminó el periodo de prueba';
  const cuerpo=esAdmin()?`Tus datos están guardados y no se ha borrado nada. Para seguir usando Cartera Diaria con ${esc(t.nombre||'tu empresa')}, comunícate con nosotros:`
    :`La cuenta de ${esc(t.nombre||'la empresa')} está pausada. Habla con la oficina para más información.`;
  return `<div class="auth"><div class="panel stack"><h2>${titulo}</h2><p style="margin:0">${cuerpo}</p>
    ${esAdmin()?`<div class="kv"><div><span>${esc(SOPORTE.nombre)}</span><b style="user-select:all">${esc(SOPORTE.telefono)}</b></div><div><span>Correo</span><b style="user-select:all;overflow-wrap:anywhere">${esc(SOPORTE.correo)}</b></div></div>
      <div class="row">${wa?`<a class="btn pri" href="https://wa.me/${wa}?text=${encodeURIComponent('Hola, quiero activar Cartera Diaria para '+(t.nombre||'mi empresa')+' (código '+(t.codigo||'')+').')}" target="_blank" rel="noopener">Escribir por WhatsApp</a>`:''}</div>`:''}
    <div class="row">${B.esSuper?'<button class="btn" data-a="role" data-v="plataforma">Panel de plataforma</button>':''}<button class="btn" data-a="salir">Salir</button></div></div></div>`;
}
function bannerPrueba(){
  if(!esAdmin()||!S.tenant)return '';
  const x=estadoEmpresa(S.tenant,DIAS_PRUEBA);if(x.estado!=='prueba')return '';
  return `<div class="note ${x.dias<=7?'warn':'info'} demo">Estás en el periodo de prueba: te ${x.dias===1?'queda 1 día':'quedan '+x.dias+' días'}. Para activar tu plan escribe a ${esc(SOPORTE.nombre)} al ${esc(SOPORTE.telefono)} o a ${esc(SOPORTE.correo)}.</div>`;
}

/* ===================== Ingreso ===================== */
const ERRORES={'auth/invalid-credential':'El correo o la contraseña no coinciden.','auth/wrong-password':'El correo o la contraseña no coinciden.','auth/user-not-found':'No hay una cuenta con esos datos.',
  'auth/email-already-in-use':'Ya existe una cuenta con ese correo.','auth/weak-password':'La contraseña debe tener al menos 6 caracteres.','auth/invalid-email':'Revisa el correo: no parece válido.',
  'auth/network-request-failed':'No hay conexión a internet. Inténtalo de nuevo cuando tengas señal.','auth/too-many-requests':'Demasiados intentos. Espera unos minutos y vuelve a intentar.',
  'permission-denied':'No tienes permiso para hacer eso.','unavailable':'No hay conexión con el servidor.'};
const traducir=e=>ERRORES[e?.code]||e?.message||'Ocurrió un error inesperado.';
function vIngreso(){
  if(CARGA==='error')return `<div class="auth"><div class="panel stack"><h2>No se pudo abrir la app</h2><p class="muted">Revisa tu conexión a internet la primera vez que abres la app. Después funciona sin señal.</p><button class="btn pri" data-a="recargar">Intentar de nuevo</button></div></div>`;
  if(CARGA!=='listo')return `<div class="auth"><div class="panel empty">Cargando…</div></div>`;
  if(AUTH&&AUTH.user&&AUTH.inactivo)return `<div class="auth"><div class="panel stack"><h2>Tu acceso está desactivado</h2><p class="muted" style="margin:0">Habla con la oficina para que lo vuelvan a activar.</p><button class="btn" data-a="salir">Salir</button></div></div>`;
  if(AUTH&&AUTH.user&&!AUTH.me)return `<div class="auth"><form class="panel stack" data-form="registro"><h2>Crea tu empresa</h2><p class="muted" style="margin:0">Entraste como ${esc(AUTH.user.email)}, pero tu cuenta todavía no pertenece a ninguna empresa.</p>
    <div class="f"><label for="rg-e">Nombre del negocio</label><input id="rg-e" name="empresa" required></div>
    <div class="f"><label for="rg-n">Tu nombre</label><input id="rg-n" name="nombre" required></div>
    ${compromiso()}<div id="authErr"></div><button class="btn pri block">Crear empresa</button><button type="button" class="btn" data-a="salir">Salir</button></form></div>`;
  if(!REGISTRO_ABIERTO&&UI.authTab==='registro')UI.authTab='personal';
  const tabs=[['personal','Oficina y cobradores'],['cliente','Soy cliente'],...(REGISTRO_ABIERTO?[['registro','Crear empresa']]:[])].map(([k,n])=>`<button type="button" role="tab" aria-selected="${UI.authTab===k}" data-a="authTab" data-v="${k}">${n}</button>`).join('');
  let form='';
  if(UI.authTab==='personal')form=`<form class="stack" data-form="entrar">
      <div class="f"><label for="in-c">Correo</label><input id="in-c" name="correo" type="email" autocomplete="username" required></div>
      <div class="f"><label for="in-p">Contraseña</label><input id="in-p" name="clave" type="password" autocomplete="current-password" required></div>
      <div id="authErr"></div><button class="btn pri block">Entrar</button>
      <button type="button" class="btn sm" data-a="recuperar" style="align-self:center">Olvidé mi contraseña</button></form>`;
  else if(UI.authTab==='cliente')form=`<form class="stack" data-form="entrarCliente">
      <div class="f"><label for="ic-k">Código de la empresa</label><input id="ic-k" name="codigo" autocapitalize="characters" maxlength="6" required placeholder="Te lo da tu cobrador"></div>
      <div class="f"><label for="ic-c">Tu cédula</label><input id="ic-c" name="cedula" inputmode="numeric" required></div>
      <div class="f"><label for="ic-p">PIN de 6 dígitos</label><input id="ic-p" name="pin" type="password" inputmode="numeric" maxlength="6" autocomplete="current-password" required></div>
      <div id="authErr"></div><button class="btn pri block">Ver mi préstamo</button></form>`;
  else form=`<form class="stack" data-form="registro">
      <div class="f"><label for="rg-e">Nombre del negocio</label><input id="rg-e" name="empresa" required></div>
      <div class="f"><label for="rg-n">Tu nombre</label><input id="rg-n" name="nombre" required></div>
      <div class="f"><label for="rg-c">Correo</label><input id="rg-c" name="correo" type="email" autocomplete="username" required></div>
      <div class="f"><label for="rg-p">Contraseña (mínimo 6 caracteres)</label><input id="rg-p" name="clave" type="password" minlength="6" autocomplete="new-password" required></div>
      ${compromiso()}<div id="authErr"></div><button class="btn pri block">Crear empresa</button></form>`;
  return `<div class="auth"><div class="authhead"><div class="logo big" aria-hidden="true">${LOGO}</div><h1>Cartera Diaria</h1><p class="muted">Control de préstamos diarios, rutas de cobro y caja.</p></div>
    <div class="panel stack"><div class="subtabs" role="tablist">${tabs}</div>${form}</div></div>`;
}
const compromiso=()=>`<label class="check small" style="font-weight:500;align-items:flex-start"><input type="checkbox" name="acepto" required style="margin-top:3px"> Me comprometo a prestar dentro de la ley colombiana, incluido el límite de la tasa de usura, y a cobrar sin amenazas ni intimidación.</label>`;
const LOGO='<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v16M13 13l1.5 1.5L17 12"/></svg>';

/* ===================== Render y eventos ===================== */
function bnav(){
  const n=$('#bnav');
  const items=!ME||!S?null:UI.role==='cobrador'?[['ruta','Ruta'],['clientes','Clientes'],['cuadre','Cuadre']]:UI.role==='cliente'?[['prestamo','Mi préstamo','prestamos'],['pagos','Pagos'],['solicitar','Solicitar']]:null;
  document.body.classList.toggle('conbarra',!!items);
  if(!items){n.hidden=true;return}
  const cur=UI.role==='cobrador'?UI.ctab:UI.cltab,act=UI.role==='cobrador'?'ctab':'cltab';
  n.hidden=false;n.innerHTML=`<div role="tablist">${items.map(([k,t,ic])=>`<button role="tab" aria-selected="${cur===k}" data-a="${act}" data-v="${k}">${ico(ic||k)}${t}</button>`).join('')}</div>`;
}
function cabecera(){
  const seg=$('#segRol'),listo=ME&&S&&S.config,opera=!listo||estadoEmpresa(S.tenant,DIAS_PRUEBA).opera;
  seg.hidden=!(listo&&esAdmin()&&opera&&UI.role!=='plataforma');
  const bp=$('#btnPlat');bp.hidden=!(B&&B.esSuper&&(ME||B.demo));bp.setAttribute('aria-pressed',UI.role==='plataforma');bp.classList.toggle('pri',UI.role==='plataforma');
  seg.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===UI.role));
  $('#empresa').textContent=listo&&UI.role!=='plataforma'?(S.config.empresa||'Cartera Diaria'):'Cartera Diaria';
  $('#subtitulo').textContent=UI.role==='plataforma'?(ME?'Panel de plataforma':'Dueño de la plataforma'):!listo?'Control de préstamos':B&&B.demo?'Modo demostración':`${ME.nombre||''} · ${{admin:'Oficina',cobrador:'Cobrador',cliente:'Cliente'}[ME.rol]}`;
  $('#btnSalir').hidden=!(B&&!B.demo&&AUTH&&AUTH.user);
  const red=$('#red');
  if(!navigator.onLine){red.hidden=false;red.className='chip c-warn';red.textContent='Sin conexión'+(RED.pendientes?` · ${RED.pendientes} por enviar`:'')}
  else if(RED.pendientes){red.hidden=false;red.className='chip c-pen';red.textContent=`${RED.pendientes} por enviar`}
  else red.hidden=true;
  $('#btnInstalar').hidden=!instalar;
}
function render(){
  cabecera();
  CHARTS=[];$('#tip').hidden=true;
  if(UI.role!=='plataforma')dejarPlataforma();
  if(UI.role==='plataforma'&&B&&B.esSuper&&AUTH){const y0=scrollY;$('#app').innerHTML=vPlataforma();bnav();scrollTo(0,y0);
    const pb=$('#platBuscar');if(pb)pb.oninput=()=>{PLAT.buscar=pb.value;const pos=pb.selectionStart;render();const nb=$('#platBuscar');nb.focus();nb.setSelectionRange(pos,pos)};return}
  if(!ME||!S||!S.config){$('#app').innerHTML=vIngreso();bnav();return}
  const est=estadoEmpresa(S.tenant,DIAS_PRUEBA);
  if(!est.opera){$('#app').innerHTML=vBloqueada(est);bnav();return}
  if(UI.role==='cobrador'&&!S.cobradores.some(k=>k.id===UI.cobradorId))UI.cobradorId=S.cobradores[0]?.id||null;
  if(UI.role==='cliente'&&!S.clientes.some(c=>c.id===UI.clienteId))UI.clienteId=S.clientes[0]?.id||null;
  const y=scrollY;
  const aviso=(B.demo?`<div class="note info demo">Modo demostración: los datos de ejemplo quedan solo en este navegador. Para usarla de verdad, conecta la app a Firebase (ver LEEME.md).</div>`:'')+(UI.role==='admin'?bannerPrueba():'');
  $('#app').innerHTML=aviso+(UI.role==='admin'?vAdmin():UI.role==='cobrador'?(UI.cobradorId?vCobrador():'<div class="phone empty">Todavía no hay cobradores.</div>'):(UI.clienteId?vCliente():'<div class="phone empty">Todavía no hay clientes.</div>'));
  bnav();dibujar();
  scrollTo(0,y);
  const b=$('#buscar');if(b)b.oninput=()=>{UI.buscar=b.value;const pos=b.selectionStart;render();const nb=$('#buscar');nb.focus();nb.setSelectionRange(pos,pos)};
  const cf=$('#cajaFecha');if(cf)cf.onchange=()=>{UI.cajaFecha=cf.value||hoy();render()};
  const sc=$('#selCob');if(sc)sc.onchange=()=>{UI.cobradorId=sc.value;saveUI();render()};
  const sl=$('#selCli');if(sl)sl.onchange=()=>{UI.clienteId=sl.value;saveUI();render()};
  saveUI();cfSync();simSol();
}
let toastT;
function toast(msg,undo){
  const t=$('#toast');t.innerHTML=`<span>${msg}</span>${undo?'<button id="undo">Deshacer</button>':''}`;t.hidden=false;
  if(undo)$('#undo').onclick=()=>{undo();t.hidden=true};
  clearTimeout(toastT);toastT=setTimeout(()=>t.hidden=true,6000);
}
let ultimo=null;
function pagar(id,monto,quien,conRecargo){
  const l=prest(id),e=estado(l);monto=Math.min(monto,e.saldo);
  if(monto<=0){toast('Escribe un valor mayor que cero.');return}
  const cobId=UI.role==='cobrador'?UI.cobradorId:l.cobradorId,T=hoy(),h=hora(),cod=codigoQuien();
  const base={prestamoId:l.id,clienteId:l.clienteId,rutaId:l.cobradorId,cobradorId:cobId,fecha:T,hora:h};
  const nuevos=[];
  if(conRecargo&&e.recargo>0)nuevos.push({...base,n:numeroRecibo(cod),monto:e.recargo,tipo:'recargo'});
  nuevos.push({...base,n:numeroRecibo(cod),monto,tipo:'cuota'});
  const hechos=B.pagar(nuevos);
  log(`Registró pago de ${$$(sum(nuevos,p=>p.monto))} de ${cli(l.clienteId).nombre} (${l.num})`);
  const lPost={...l,pagos:[...l.pagos.filter(p=>!hechos.some(x=>x.id===p.id)),...hechos]};
  fRecibo(lPost,hechos);ultimo=null;
  toast(`${$$(sum(nuevos,p=>p.monto))} registrado${estado(lPost).saldo<=0?' · ¡préstamo pagado!':''}`,()=>{hechos.forEach(p=>B.anular(p));log(`Deshizo el pago de ${cli(l.clienteId).nombre} (${l.num})`);cerrar()});
}
async function accion(fn,okMsg){try{await fn();if(okMsg)toast(okMsg)}catch(e){toast(traducir(e))}}
function errAuth(e){const d=$('#authErr');if(d)d.innerHTML=`<div class="note bad">${esc(traducir(e))}</div>`;document.querySelectorAll('form button').forEach(b=>b.disabled=false)}

document.addEventListener('click',ev=>{
  if(ev.target.id==='modal'){cerrar();return}
  const a=ev.target.closest('[data-a]');if(!a)return;
  const v=a.dataset.v,act=a.dataset.a;
  if(!['borrarGasto','borrarBase','reset','borrarPlan','anular','rechazarSol','copiarRecibo','copiarMsg','limIgualUsura','desactivar','empEstado'].includes(act))UI.confirmar=null;
  switch(act){
    case 'plataforma':UI.role=UI.role==='plataforma'?(ME?ME.rol:'plataforma'):'plataforma';cerrar();render();scrollTo(0,0);break;
    case 'platFiltro':PLAT.filtro=v;render();break;
    case 'verEmpresa':ultimo=()=>fEmpresa(v);ultimo();break;
    case 'empEstado':{const e=PLAT.emps.find(x=>x.id===v),nuevo=a.dataset.e;
      if(nuevo==='suspendida'&&UI.confirmar!=='susp'+v){UI.confirmar='susp'+v;fEmpresa(v);break}
      UI.confirmar=null;a.disabled=true;accion(async()=>{await B.actualizarEmpresa(v,{estado:nuevo});luego(()=>fEmpresa(v))},nuevo==='activa'?`${esc(e.nombre)} quedó activa`:`${esc(e.nombre)} quedó suspendida`);break}
    case 'empExtender':{const e=PLAT.emps.find(x=>x.id===v),x=estadoEmpresa(e,DIAS_PRUEBA),dias=Number(a.dataset.d);
      const hasta=Math.max(Date.now(),x.estado==='prueba'||x.estado==='vencida'?(x.hasta||0):0)+dias*864e5;
      a.disabled=true;accion(async()=>{await B.actualizarEmpresa(v,{estado:'prueba',pruebaHasta:hasta});luego(()=>fEmpresa(v))},`Prueba de ${esc(e.nombre)} hasta el ${fMs(hasta)}`);break}
    case 'empPlan':{const e=PLAT.emps.find(x=>x.id===v),p=PLANES_SUSCRIPCION[Number($('#empPlanSel').value)];
      a.disabled=true;accion(async()=>{await B.actualizarEmpresa(v,{plan:{nombre:p.nombre,maxCobradores:p.maxCobradores,maxPrestamos:p.maxPrestamos}});luego(()=>fEmpresa(v))},`${esc(e.nombre)} ahora tiene el plan ${esc(p.nombre)}`);break}
    case 'empNota':{const txt=$('#empNota').value.trim();accion(async()=>{await B.actualizarEmpresa(v,{notaPlataforma:txt})},'Nota guardada');break}
    case 'role':UI.role=v;if(v==='cobrador'&&!UI.cobradorId)UI.cobradorId=S.cobradores[0]?.id;if(v==='cliente'&&!UI.clienteId)UI.clienteId=S.clientes[0]?.id;cerrar();render();scrollTo(0,0);break;
    case 'tema':UI.tema={auto:'light',light:'dark',dark:'auto'}[UI.tema];aplicarTema();saveUI();dibujar();break;
    case 'authTab':UI.authTab=v;render();break;
    case 'salir':cerrar();B.salir();break;
    case 'recargar':location.reload();break;
    case 'instalar':if(instalar){instalar.prompt();instalar=null;cabecera()}break;
    case 'recuperar':{const c=$('#in-c')?.value;if(!c){errAuth({message:'Escribe tu correo y vuelve a tocar «Olvidé mi contraseña».'});break}
      B.recuperar(c).then(()=>{$('#authErr').innerHTML='<div class="note ok">Te enviamos un correo para cambiar la contraseña.</div>'}).catch(errAuth);break}
    case 'tab':UI.tab=v;cerrar();render();scrollTo(0,0);break;
    case 'ctab':UI.ctab=v;render();scrollTo(0,0);break;
    case 'cltab':UI.cltab=v;render();scrollTo(0,0);break;
    case 'filtro':UI.filtro=v;render();break;
    case 'cerrar':cerrar();break;
    case 'nuevoPrestamo':ultimo=null;fNuevoPrestamo(v);break;
    case 'renovar':ultimo=null;fNuevoPrestamo(null,{renuevaDe:v});break;
    case 'verPrestamo':ultimo=()=>fVerPrestamo(v);ultimo();break;
    case 'cobrar':ultimo=()=>fCobrar(v);ultimo();break;
    case 'editCliente':ultimo=null;fCliente(v);break;
    case 'editCobrador':ultimo=null;fCobrador(v);break;
    case 'editPlan':ultimo=null;fPlan(v);break;
    case 'nuevoGasto':ultimo=null;fGasto(v,UI.role==='admin'?UI.cajaFecha:hoy());break;
    case 'nuevaBase':ultimo=null;fBase();break;
    case 'pagoRapido':{const f=a.closest('form');pagar(v,Number(a.dataset.m),f.dataset.quien,f.conRecargo&&f.conRecargo.checked);break}
    case 'noPago':{const l=prest(v),f=a.closest('form');
      B.visita({prestamoId:l.id,clienteId:l.clienteId,rutaId:l.cobradorId,cobradorId:UI.role==='cobrador'?UI.cobradorId:l.cobradorId,fecha:hoy(),hora:hora(),motivo:f.motivo.value});
      log(`Visitó a ${cli(l.clienteId).nombre}: no pagó (${f.motivo.value})`);toast(`Visita registrada: ${esc(cli(l.clienteId).nombre)} no pagó`);cerrar();break}
    case 'verRecibo':{const l=prest(v),p=l.pagos.find(x=>x.id===a.dataset.p);fRecibo(l,[p]);ultimo=null;break}
    case 'copiarRecibo':copiar($('#sheet').dataset.recibo,'Recibo copiado. Pégalo en WhatsApp.');break;
    case 'copiarMsg':copiar(mensajeCobro(prest(v)),'Recordatorio copiado. Pégalo en WhatsApp.');break;
    case 'anular':{const pid=a.dataset.p;if(UI.confirmar==='an'+pid){const l=prest(v),p=l.pagos.find(x=>x.id===pid);B.anular(p);UI.confirmar=null;log(`Anuló el recibo ${p.n} de ${$$(p.monto)} (${l.num})`);toast('Pago anulado');ultimo=()=>fVerPrestamo(v);luego(ultimo)}else{UI.confirmar='an'+pid;fVerPrestamo(v);ultimo=()=>fVerPrestamo(v)}break}
    case 'reasignar':{const l=prest(v),k=$('#reasig').value;if(!k||k===l.cobradorId)break;B.reasignar([l.id],k,cob(k).nombre);log(`Pasó ${l.num} de ${nomCob(l.cobradorId,l)} a ${cob(k).nombre}`);toast(`Ahora lo cobra ${esc(cob(k).nombre)}`);ultimo=()=>fVerPrestamo(v);luego(ultimo);break}
    case 'aprobarSol':{const s=S.solicitudes.find(x=>x.id===v);ultimo=null;fNuevoPrestamo(s.clienteId,{monto:s.monto,planId:s.planId,sol:s.id});break}
    case 'rechazarSol':{if(UI.confirmar==='sol'+v){const s=S.solicitudes.find(x=>x.id===v);B.guardar('solicitudes',v,{estado:'rechazada'});UI.confirmar=null;log(`Rechazó la solicitud de ${cli(s.clienteId).nombre} por ${$$(s.monto)}`);toast('Solicitud rechazada')}else{UI.confirmar='sol'+v;render()}break}
    case 'borrarGasto':if(UI.confirmar===v){const g=S.gastos.find(x=>x.id===v);B.borrar('gastos',v);UI.confirmar=null;log(`Quitó el gasto «${g.concepto}» de ${$$(g.monto)}`);toast('Gasto eliminado')}else{UI.confirmar=v;render()}break;
    case 'borrarBase':if(UI.confirmar===v){const b=S.bases.find(x=>x.id===v);B.borrar('bases',v);UI.confirmar=null;log(`Quitó la base de ${$$(b.monto)} de ${cob(b.cobradorId).nombre}`);toast('Base eliminada')}else{UI.confirmar=v;render()}break;
    case 'borrarPlan':if(UI.confirmar==='plan'+v){const p=planDe(v);B.borrar('planes',v);UI.confirmar=null;log(`Eliminó el plan «${p.nombre}»`);cerrar();toast('Plan eliminado')}else{UI.confirmar='plan'+v;fPlan(v)}break;
    case 'reset':if(UI.confirmar==='reset'){B.restablecer();UI.confirmar=null;toast('Datos de ejemplo restablecidos')}else{UI.confirmar='reset';render()}break;
    case 'limIgualUsura':$('#cfLim').value=$('#cfUs').value;cfSync();break;
    case 'crearAccesoCob':{const k=cob(v),correo=$('#acc-c').value.trim(),clave=$('#acc-p').value;
      if(!correo||clave.length<6){toast('Escribe el correo y una contraseña de al menos 6 caracteres.');break}
      a.disabled=true;accion(async()=>{await B.crearAcceso({correo,clave,rol:'cobrador',cobradorId:v,nombre:k.nombre});B.guardar('cobradores',v,{email:correo});log(`Creó el acceso de ${k.nombre} (${correo})`);luego(()=>fCobrador(v))},`Listo: ${esc(k.nombre)} ya puede entrar con ${esc(correo)}`).finally(()=>a.disabled=false);break}
    case 'crearAccesoCli':{const c=cli(v),pin=$('#acc-pin').value.trim();
      if(!/^\d{6}$/.test(pin)){toast('El PIN debe tener 6 números.');break}
      if(!String(c.cedula).replace(/\D/g,'')){toast('El cliente necesita cédula para tener app.');break}
      a.disabled=true;accion(async()=>{await B.crearAcceso({correo:correoCliente(c.cedula,S.tenant.codigo),clave:pin,rol:'cliente',clienteId:v,nombre:c.nombre});B.guardar('clientes',v,{app:true});log(`Activó la app de ${c.nombre}`);luego(()=>fCliente(v))},`Listo: ${esc(c.nombre)} ya puede entrar a su app`).finally(()=>a.disabled=false);break}
    case 'desactivar':{if(UI.confirmar!=='des'+v){UI.confirmar='des'+v;a.textContent='Confirmar desactivar';break}
      const u=S.usuarios.find(x=>x.id===v);UI.confirmar=null;accion(async()=>{await B.desactivarAcceso(v);log(`Desactivó el acceso de ${u?.nombre||''}`);cerrar()},'Acceso desactivado');break}
  }
});
function cfSync(){
  const f=$('#fCfg');if(!f)return;
  const L=dec(f.limiteEA.value),U=dec(f.usuraEA.value);
  $('#cfLimEq').textContent=L?`Equivale a ${pe(mensualDe(L))} mensual`:'Escribe el límite';
  $('#cfUsEq').textContent=U?`Equivale a ${pe(mensualDe(U))} mensual`:'';
  $('#cfAviso').innerHTML=L&&U&&L>U?`<div class="note bad">Tu límite (${pe(L)}) está por encima de la usura legal (${pe(U)}). El sistema dejará registrar préstamos entre ${pe(U)} y ${pe(L)}, pero cobrar por encima de la usura es delito en Colombia (art. 305 del Código Penal).</div>`:L&&U?`<div class="note ok">Tu límite queda ${L<U?'por debajo de':'igual a'} la usura legal.</div>`:'';
}
document.addEventListener('input',ev=>{if(ev.target.closest('#fPrest'))simNP();if(ev.target.closest('#fPlan'))simPlan();if(ev.target.closest('#fCfg'))cfSync();if(ev.target.closest('#fSol'))simSol()});
document.addEventListener('change',ev=>{if(ev.target.closest('#fPrest'))simNP();if(ev.target.closest('#fPlan'))simPlan();if(ev.target.closest('#fSol'))simSol();
  if(ev.target.id==='cfMod'){const u=usuraDe(ev.target.value);if(u!=null)$('#cfUs').value=String(u).replace('.',',');else $('#cfUs').focus()}
  if(ev.target.closest('#fCfg'))cfSync()});
document.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&!$('#modal').hidden)cerrar()});
document.addEventListener('submit',ev=>{
  const f=ev.target;if(!f.dataset.form)return;ev.preventDefault();
  const t=f.dataset.form,v=f.dataset.v;
  // ---- Ingreso ----
  if(t==='entrar'||t==='entrarCliente'||t==='registro'){
    f.querySelectorAll('button').forEach(b=>b.disabled=true);$('#authErr').innerHTML='';
    const p=t==='entrar'?B.entrar(f.correo.value,f.clave.value)
      :t==='entrarCliente'?B.entrarCliente(f.codigo.value,f.cedula.value,f.pin.value)
      :B.registrarEmpresa({empresa:f.empresa.value.trim(),nombre:f.nombre.value.trim(),correo:f.correo?f.correo.value:'',clave:f.clave?f.clave.value:''});
    p.catch(errAuth);return;
  }
  if(t==='config'){
    const antes=`${S.config.limiteEA}/${S.config.usuraEA}`;
    const cfg={...S.config,empresa:f.empresa.value.trim()||'Mi negocio',usuraEA:dec(f.usuraEA.value)||S.config.usuraEA,limiteEA:dec(f.limiteEA.value)||S.config.limiteEA,modalidad:f.modalidad.value,
      usuraRef:f.usuraRef.value,redondeo:Number(f.redondeo.value),bloquear:f.bloquear.checked,mensaje:f.mensaje.value,
      mora:{activo:f.moraActivo.checked,tipo:f.moraTipo.value,valor:dec(f.moraValor.value),gracia:Math.max(0,parseInt(f.moraGracia.value)||0)}};
    B.guardarConfig(cfg);
    log(antes!==`${cfg.limiteEA}/${cfg.usuraEA}`?`Cambió el límite a ${pe(cfg.limiteEA)} y la usura a ${pe(cfg.usuraEA)}`:'Actualizó los ajustes');
    toast('Ajustes guardados')}
  if(t==='prestamo'){
    const plan=planDe(f.planId.value),P=num(f.monto.value),ini=f.inicio.value||hoy(),s=simular(plan,P,ini);
    if(revisar(s.ea).bloq)return;
    const ren=f.dataset.ren?prest(f.dataset.ren):null,saldoRen=ren?estado(ren).saldo:0;
    if(ren&&P<=saldoRen)return;
    if(!ren){const lim=limitePlan('prestamos');if(lim){toast(lim+' Escríbenos para ampliarlo.');return}}
    const clienteId=ren?ren.clienteId:f.clienteId.value,cobradorId=f.cobradorId.value;
    const datos=datosPrestamo({clienteId,cobradorId,plan,monto:P,inicio:ini,descontado:saldoRen,renuevaDe:ren?ren.id:null,entregadoPor:f.entregadoPor.value});
    const pagoRenovacion=ren?{prestamoId:ren.id,clienteId:ren.clienteId,rutaId:ren.cobradorId,cobradorId:ren.cobradorId,fecha:ini,hora:hora(),monto:saldoRen,tipo:'renovacion',n:numeroRecibo('OF')}:null;
    B.crearPrestamo(datos,{pagoRenovacion,solicitudId:f.dataset.sol||null});
    log(ren?`Renovó ${ren.num} con ${datos.numero} por ${$$(P)} (entregó ${$$(P-saldoRen)})`:`Prestó ${$$(P)} a ${cli(clienteId).nombre} (${datos.numero})`);
    cerrar();toast(ren?`Renovado: entregar ${$$(P-saldoRen)} en efectivo`:`Préstamo de ${$$(P)} registrado`);
  }
  if(t==='pago')pagar(v,num(f.monto.value),f.dataset.quien,f.conRecargo&&f.conRecargo.checked);
  if(t==='cliente'){const d=Object.fromEntries(new FormData(f));d.orden=parseInt(d.orden)||0;
    if(!v)d.orden=d.orden||S.clientes.filter(c=>c.cobradorId===d.cobradorId).length+1;
    const antes=v?cli(v).cobradorId:null;
    B.guardar('clientes',v||null,d);
    let extra='';
    if(v&&antes&&antes!==d.cobradorId){const ids=S.prestamos.filter(l=>l.clienteId===v&&estado(l).saldo>0).map(l=>l.id);if(ids.length){B.reasignar(ids,d.cobradorId,cob(d.cobradorId).nombre);extra=` y sus ${ids.length===1?'préstamo pasó':ids.length+' préstamos pasaron'} a ${cob(d.cobradorId).nombre}`}}
    log(`${v?'Actualizó':'Creó'} el cliente ${d.nombre}${extra}`);cerrar();toast('Cliente guardado'+esc(extra))}
  if(t==='cobrador'){const d=Object.fromEntries(new FormData(f));d.comision=dec(d.comision);
    if(!v){const lim=limitePlan('cobradores');if(lim){toast(lim+' Escríbenos para ampliarlo.');return}d.codigo=iniciales(d.nombre)}
    B.guardar('cobradores',v||null,d);log(`${v?'Actualizó':'Creó'} el cobrador ${d.nombre}`);cerrar();toast('Cobrador guardado')}
  if(t==='plan'){const p=leerPlan(f);if(!p.nombre)return;B.guardar('planes',v||null,p);log(`${v?'Editó':'Creó'} el plan «${p.nombre}» (${pe(p.tasa)})`);cerrar();toast('Plan guardado')}
  if(t==='gasto'){const m=num(f.monto.value);if(m<=0)return;const cobradorId=UI.role==='cobrador'?UI.cobradorId:(f.cobradorId.value||null);
    const g={fecha:f.fecha.value||hoy(),cobradorId,concepto:f.concepto.value.trim(),monto:m};B.guardar('gastos',null,g);log(`Registró gasto «${g.concepto}» de ${$$(m)}`);cerrar();toast('Gasto guardado')}
  if(t==='base'){const m=num(f.monto.value);if(m<=0)return;B.guardar('bases',null,{fecha:f.fecha.value||hoy(),cobradorId:f.cobradorId.value,monto:m});log(`Entregó base de ${$$(m)} a ${cob(f.cobradorId.value).nombre}`);cerrar();toast('Base registrada')}
  if(t==='solicitud'){const m=num(f.monto.value);if(m<=0)return;B.guardar('solicitudes',null,{clienteId:UI.clienteId,monto:m,planId:f.planId.value,fecha:hoy(),estado:'pendiente',nota:f.nota.value.trim()});log(`Solicitó un préstamo de ${$$(m)}`);toast('Solicitud enviada. La oficina te confirmará.')}
});

/* ===================== Arranque ===================== */
let instalar=null;
addEventListener('beforeinstallprompt',e=>{e.preventDefault();instalar=e;cabecera()});
addEventListener('online',()=>cabecera());addEventListener('offline',()=>cabecera());
if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
function onData(nuevo,meta){S=nuevo;RED=meta||{pendientes:0};const ae=document.activeElement;if(ae&&/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)&&ae.closest('#app form'))return cabecera();render()}
function onAuth(info){
  AUTH=info;ME=info&&info.me&&!info.inactivo?info.me:null;CARGA='listo';$('#toast').hidden=true;
  if(ME&&ME.rol==='admin'&&!(B&&B.demo))UI.role='admin';
  if(info&&info.super&&!ME)UI.role='plataforma';
  if(UI.role==='plataforma'&&!(info&&info.super)&&!(B&&B.demo))UI.role=ME?ME.rol:'admin';
  if(!info){dejarPlataforma();PLAT.emps=[];PLAT.uso={};PLAT.contactos={};PLAT.pedidos={}}
  if(ME&&ME.rol!=='admin'){UI.role=ME.rol;if(ME.rol==='cobrador')UI.cobradorId=ME.cobradorId;if(ME.rol==='cliente')UI.clienteId=ME.clienteId}
  if(!ME){S=S&&B&&B.demo?S:null;cerrar();if(UI.authTab==='registro'&&info===null)UI.authTab='personal'}
  render();
}
function onError(e,que){console.error(que,e);toast(`No se pudo ${esc(que)}: ${esc(traducir(e))}`)}
aplicarTema();render();
(async()=>{
  try{
    B=MODO_DEMO?backendDemo({generar:demo,onData,onAuth}):await backendFirebase({onData,onAuth,onError,configInicial:CONFIG_INICIAL,planesIniciales:PLANES_INICIALES});
  }catch(e){console.error(e);CARGA='error';render()}
})();
