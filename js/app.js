'use strict';
/* ===== Konstanta & State (sesi hanya di memori, bukan di URL — aman untuk iframe) ===== */
const SA='Super Admin',AD='Admin',KS='Kasir',MG='Management';
const ALLP=[100,200,500,1000,2000,5000,10000,20000,50000,100000];
const MENU=[['dashboard','Dashboard','home',[SA,AD,KS,MG]],['kasir','Kasir','cart',[SA,KS]],['shift','Shift & Kas','clock',[SA,KS]],['riwayat','Riwayat','receipt',[SA,AD,KS]],['stok','Produk & Stok','box',[SA,AD]],['master','Master Data','list',[SA,AD]],['laporan','Laporan','chart',[SA,AD,KS,MG]],['pengaturan','Pengaturan','sliders',[SA,AD,KS,MG]]];
const S={token:null,user:null,cfg:null,skema:{},pecahan:[],page:null,vis:[],pos:null,cart:{},member:null,reward:null,holds:[],paid:{},pay:false,open:false,cache:{}};

/* ===== Helper umum ===== */
const $=(s,r)=>(r||document).querySelector(s);
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rp=n=>{n=Math.round(Number(n)||0);return (n<0?'-':'')+'Rp'+Math.abs(n).toLocaleString('id-ID')};
const num=v=>Number(v)||0;
const ic=n=>`<svg class="i" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const ymd=d=>{d=d||new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const lsGet=k=>{try{return localStorage.getItem(k)}catch(e){return null}};
const lsSet=(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}};
function toast(m,t){const e=document.createElement('div');e.className='toast '+(t||'');e.textContent=m;$('#toasts').appendChild(e);setTimeout(()=>e.remove(),3200)}
let _busy=0;function busy(n){_busy+=n;$('#busy').style.display=_busy>0?'block':'none'}
function view(h){const a=$('#app');a.innerHTML='<div class="fade">'+h+'</div>'}
const skel=()=>'<div class="skel"></div><div class="skel"></div><div class="skel" style="height:180px"></div>';

/* ===== Jaringan REST: timeout, retry, idempotensi, telemetri (gas-pro-api + gas-instant-ux-pro) ===== */
const BACA=['bootstrap','boot','crud.list','pos.data','shift.status','trx.list','trx.detail','void.list','stok.ringkas','stok.kartu','dash','lap','log.list','batch'];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const rid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,10);
const sget=k=>{try{return sessionStorage.getItem(k)}catch(e){return null}},sset=(k,v)=>{try{sessionStorage.setItem(k,v)}catch(e){}},sdel=k=>{try{sessionStorage.removeItem(k)}catch(e){}};
const hsh=t=>{let h=0;for(let i=0;i<t.length;i++)h=(h*31+t.charCodeAt(i))|0;return h};
const Perf={log:[],catat(a,total,server){this.log.push({total:total,server:server||0});if(this.log.length>30)this.log.shift()},
  html(){if(!this.log.length)return '<p class="mu">Belum ada data.</p>';const n=this.log.length,avg=k=>Math.round(this.log.reduce((s,x)=>s+x[k],0)/n),t=avg('total'),sv=avg('server');
    return `<div class="row"><span>Respons total</span><b>${t} ms</b></div><div class="row"><span>Waktu server (GAS)</span><b>${sv} ms</b></div><div class="row"><span>Jaringan + redirect</span><b>${Math.max(0,t-sv)} ms</b></div><p class="mu">Rata-rata ${n} panggilan terakhir.</p>`}};
/* Cache lokal per pengguna (SWR). Dibersihkan saat keluar dan setelah setiap aksi tulis. */
const Store={p(){return 'pos:v1:'+(S.user?S.user.id:'x')+':'},
  get(k){try{const v=localStorage.getItem(this.p()+k);return v?JSON.parse(v):null}catch(e){return null}},
  set(k,v){try{localStorage.setItem(this.p()+k,JSON.stringify(v))}catch(e){}},
  clear(){try{const p=this.p();Object.keys(localStorage).forEach(k=>{if(k.indexOf(p)===0)localStorage.removeItem(k)})}catch(e){}}};
async function kirim(body,tulis){
  let err;
  for(let i=0;i<3;i++){
    const ac=new AbortController(),to=setTimeout(()=>ac.abort(),tulis?90000:25000),t0=performance.now();
    try{
      // text/plain WAJIB agar tidak memicu preflight CORS yang ditolak GAS
      const res=await fetch(GAS_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body),signal:ac.signal,redirect:'follow'});
      clearTimeout(to);if(res.status>=500||res.status===429)throw new Error('HTTP '+res.status);
      const j=await res.json();Perf.catat(body.action,performance.now()-t0,j.ms);return j;
    }catch(e){clearTimeout(to);err=e;if(i<2)await sleep(700*(i+1))}   // aksi tulis diulang dengan reqId yang SAMA
  }
  throw err;
}
/** Panggil backend. Mengembalikan data, atau null bila gagal (pesan sudah tampil sebagai toast). */
async function api(aksi,p,opt){
  opt=opt||{};const tulis=BACA.indexOf(aksi)<0&&aksi!=='login',body={action:aksi,token:S.token,data:p||{}};
  if(tulis)body.reqId=rid();
  if(!opt.quiet)busy(1);
  try{
    const r=await kirim(body,tulis);
    if(r&&r.success){if(tulis)Store.clear();return r.data}
    if(r&&r.message==='SESI_HABIS'){keluar('Sesi berakhir, silakan masuk lagi.');return null}
    toast(r&&r.message||'Terjadi kesalahan','er');return null;
  }catch(e){toast(navigator.onLine?'Koneksi ke server gagal. Periksa jaringan atau GAS_URL, lalu coba lagi.':'Anda sedang offline.','er');return null}
  finally{if(!opt.quiet)busy(-1)}
}
/** Stale-While-Revalidate: tampilkan cache seketika, segarkan di latar belakang bila sudah basi. */
async function swr(aksi,data,cb,ttl){
  const k='swr:'+aksi+'|'+JSON.stringify(data||{}),c=Store.get(k);let last=null;
  if(c){cb(c.v);last=c.h;if(Date.now()-c.t<(ttl||60000))return}
  const r=await api(aksi,data,{quiet:!!c});if(r===null)return;
  const h=hsh(JSON.stringify(r));Store.set(k,{v:r,t:Date.now(),h:h});if(h!==last)cb(r);
}

/* ===== Modal (pratinjau/form), tanpa tab baru ===== */
function modal(judul,body,o){
  o=o||{};const r=$('#mroot');
  r.innerHTML=`<div class="modal ${o.wide?'wide':''}"><header><h3>${esc(judul)}</h3><button class="ib" data-a="mtutup" aria-label="Tutup">${ic('x')}</button></header><div class="mb">${body}</div>${o.foot?`<footer>${o.foot}</footer>`:''}</div>`;
  r.classList.add('on');S.onClose=o.onClose||null;return r;
}
function mtutup(){const r=$('#mroot');r.classList.remove('on');r.innerHTML='';if(S.onClose){const f=S.onClose;S.onClose=null;f()}}

/* ===== Aksi (delegasi klik; data-a="nama") ===== */
const AKSI={};
document.addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(b&&AKSI[b.dataset.a]){AKSI[b.dataset.a](b.dataset,b,e)}else if(e.target.id==='mroot')mtutup();});
AKSI.mtutup=mtutup;
AKSI.tema=()=>{const t=document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark';document.documentElement.setAttribute('data-theme',t);lsSet('pos_theme',t)};
AKSI.keluar=()=>keluar();
AKSI.nav=d=>navigateTo(d.p);

/* ===== Login / Sesi / Boot ===== */
function loginHtml(){return `<div class="lg-hero"><div class="logo">${ic('store')}</div><h1>Kasir<br>Toko</h1><p>Kasir cepat, stok FIFO akurat, laporan siap cetak.</p><ul><li>${ic('cart')}Bayar dengan klik pecahan uang</li><li>${ic('box')}Stok keluar otomatis per batch (FIFO)</li><li>${ic('doc')}Laporan PDF dan Excel</li></ul></div>
<div class="lg-form"><div class="logo" style="margin-bottom:14px">${ic('store')}</div><h2 style="font-size:28px;font-weight:800">Selamat datang</h2><p class="mu" style="margin:4px 0 20px">Masuk dengan akun Anda.</p>
<form id="fLogin" autocomplete="on"><div class="fg"><label class="lbl" for="lu">Username</label><input class="inp" id="lu" autocomplete="username" autocapitalize="none" required></div>
<div class="fg pw"><label class="lbl" for="lp">Password</label><input class="inp" id="lp" type="password" autocomplete="current-password" required><button type="button" class="eye" data-a="mata" aria-label="Tampilkan password">${ic('eye')}</button></div>
<button class="btn blk" type="submit" id="bLogin">Masuk</button></form><p class="mu ct" style="margin-top:16px">Lupa password? Hubungi Super Admin.</p></div>`}
AKSI.mata=()=>{const e=$('#lp');e.type=e.type==='password'?'text':'password'};
function tampilLogin(msg){
  Store.clear();sdel('pos_tok');try{history.replaceState(null,'',location.pathname+location.search)}catch(e){}
  S.token=null;S.user=null;S.pos=null;S.cart={};S.member=null;S.holds=[];
  $('#shell').style.display='none';const l=$('#login');l.style.display='grid';l.innerHTML=loginHtml();
  $('#fLogin').addEventListener('submit',async ev=>{ev.preventDefault();const b=$('#bLogin');b.disabled=true;
    const d=await api('login',{username:$('#lu').value,password:$('#lp').value});b.disabled=false;
    if(!d)return;S.token=d.token;sset('pos_tok',d.token);mulai(d)});
  if(msg)toast(msg,'er');
}
function keluar(msg){tampilLogin(msg)}
/** Mulai aplikasi dari bootstrap (hasil login ATAU pemulihan sesi): satu panggilan untuk layar pertama. */
function mulai(d){
  const b=d.boot;S.user=b.user;S.cfg=b.cfg;S.skema=b.skema;S.pecahan=b.pecahan;S.shift=b.shift;S.pos=d.pos||null;
  S.vis=MENU.filter(m=>m[3].indexOf(S.user.peran)>-1);
  $('#login').style.display='none';$('#shell').style.display='block';
  const h=halamanHash();render(h||'dashboard');if(!h)try{history.replaceState(null,'','#/'+S.page)}catch(e){}
}
async function pulihSesi(){
  const t=sget('pos_tok');if(!t)return false;S.token=t;
  const l=$('#login');l.style.display='grid';l.innerHTML='<div style="padding:40px;max-width:420px;margin:auto;width:100%"><div class="skel"></div><div class="skel"></div></div>';
  const d=await api('bootstrap',{},{quiet:true});if(!d)return false;mulai(d);return true;
}

/* ===== Router SPA ===== */
const PAGES={};
function navHtml(){
  const v=S.vis,more=v.length>5,main=more?v.slice(0,4):v;
  const b=m=>`<button class="nv ${S.page===m[0]?'on':''}" data-a="nav" data-p="${m[0]}" aria-label="${m[1]}">${ic(m[2])}<span>${m[1]}</span></button>`;
  $('#bnav').innerHTML=main.map(b).join('')+(more?`<button class="nv ${S.page==='lainnya'?'on':''}" data-a="nav" data-p="lainnya" aria-label="Lainnya">${ic('menu')}<span>Lainnya</span></button>`:'');
  $('#side').innerHTML=`<div class="brand"><div class="logo">${ic('store')}</div><div><b>${esc(S.cfg.toko.nama)}</b><div class="mu">Kasir &amp; stok FIFO</div></div></div><div class="snav">`+v.map(b).join('')+`</div><div class="ucard"><div class="av" style="--h:${hue(S.user.nama)}">${esc(S.user.nama.trim().charAt(0).toUpperCase())}</div><div><b>${esc(S.user.nama)}</b><div class="mu">${esc(S.user.peran)}</div></div><button class="ib" data-a="keluar" aria-label="Keluar">${ic('out')}</button></div>`;
}
function halamanHash(){const h=(location.hash||'').replace(/^#\/?/,'');return PAGES[h]?h:''}
function render(p){document.body.style.overflow='';
  if(p!=='lainnya'&&!S.vis.some(m=>m[0]===p))p='dashboard';
  S.page=p;S.open=false;S.pay=false;navHtml();
  const m=MENU.find(x=>x[0]===p);$('#ttl').textContent=p==='lainnya'?'Lainnya':m?m[1]:'';
  window.scrollTo(0,0);PAGES[p]();
}
function navigateTo(p){if(location.hash==='#/'+p)render(p);else location.hash='#/'+p}
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if($('#mroot').classList.contains('on'))mtutup();else if(S.open){S.open=false;S.pay=false;renderPos()}});
window.addEventListener('hashchange',()=>{if(S.user)render(halamanHash()||'dashboard')});
PAGES.lainnya=()=>view('<div class="card">'+S.vis.slice(4).map(m=>`<button class="li" data-a="nav" data-p="${m[0]}"><span class="row gap">${ic(m[2])}<b>${m[1]}</b></span></button>`).join('')+'</div>');

/* ===== Komponen form ===== */
function fieldHtml(f,v,id){
  const [k,l,t,req,,opt]=f,val=v==null?'':v,i=id+'_'+k,lb=`<label class="lbl" for="${i}">${esc(l)}${req?' *':''}</label>`;
  if(t==='b')return `<div class="fg"><label class="chk"><input type="checkbox" id="${i}" ${val===true||val==='TRUE'?'checked':''}><span>${esc(l)}</span></label></div>`;
  if(t==='s')return `<div class="fg">${lb}<select class="inp" id="${i}">${opt.map(o=>`<option ${o==val?'selected':''}>${esc(o)}</option>`).join('')}</select></div>`;
  if(t==='P')return `<div class="fg">${lb}<select class="inp" id="${i}"><option value="">— tidak ada —</option>${(S.cache.produk||[]).map(p=>`<option value="${p.id}" ${p.id==val?'selected':''}>${esc(p.nama)}</option>`).join('')}</select></div>`;
  if(t==='a')return `<div class="fg full">${lb}<textarea class="inp" id="${i}">${esc(val)}</textarea></div>`;
  const ty=t==='n'?'number':t==='d'?'date':t==='p'?'password':'text';
  return `<div class="fg">${lb}<input class="inp" id="${i}" type="${ty}" ${t==='n'?'inputmode="decimal" min="0" step="any"':''} value="${esc(val)}" ${t==='p'?'autocomplete="new-password"':''}></div>`;
}
function readFields(fs,id){const o={};fs.forEach(f=>{const e=$('#'+id+'_'+f[0]);if(!e)return;o[f[0]]=f[2]==='b'?e.checked:e.value});return o}
async function needProduk(){if(!S.cache.produk){const r=await api('crud.list',{sheet:'Produk'},{quiet:true});S.cache.produk=r||[]}}

/* ===== CRUD generik berbasis skema dari server ===== */
function crudView(sheet,el,judul){swr('crud.list',{sheet},rows=>{if(document.body.contains(el))crudDraw(sheet,el,judul,rows)})}
function crudDraw(sheet,el,judul,rows){
  const sk=S.skema[sheet],cols=sk.f.filter(f=>f[4]);
  const fmt=(f,v)=>f[2]==='n'&&/^h_|nominal|nilai/.test(f[0])&&f[0]!=='nilai'?rp(v):f[2]==='b'?(v===true||v==='TRUE'?'Ya':'-'):esc(v);
  const draw=q=>{
    const L=rows.filter(r=>!q||JSON.stringify(r).toLowerCase().indexOf(q.toLowerCase())>-1);
    $('#cb_'+sheet).innerHTML=`<div class="tw"><table><thead><tr>${cols.map(f=>`<th class="${f[2]==='n'?'n':''}">${esc(f[1])}</th>`).join('')}<th></th></tr></thead><tbody>${L.map(r=>`<tr>${cols.map(f=>`<td class="${f[2]==='n'?'n':''}">${f[0]==='status'?`<span class="badge ${r.status==='Aktif'?'ok':'wr'}">${esc(r.status)}</span>`:fmt(f,r[f[0]])}</td>`).join('')}<td class="n">${sk.w&&(sheet!=='Member'||S.user.peran!==KS)?`<button class="btn soft sm" data-a="cEdit" data-s="${sheet}" data-id="${r.id}" aria-label="Ubah">${ic('edit')}</button> <button class="btn dng sm" data-a="cDel" data-s="${sheet}" data-id="${r.id}" aria-label="Hapus">${ic('trash')}</button>`:''}</td></tr>`).join('')||`<tr><td colspan="${cols.length+1}" class="mu ct">Belum ada data.</td></tr>`}</tbody></table></div>`};
  el.innerHTML=`<div class="card"><div class="row wrap gap" style="margin-bottom:10px"><input class="inp" id="cq_${sheet}" placeholder="Cari..." style="flex:1;min-width:160px" aria-label="Cari">${sk.w?`<button class="btn" data-a="cAdd" data-s="${sheet}">${ic('plus')} Tambah</button>`:''}</div><div id="cb_${sheet}"></div></div>`;
  draw('');$('#cq_'+sheet).addEventListener('input',e=>draw(e.target.value));
  S.crud=S.crud||{};S.crud[sheet]={rows:rows,reload:()=>crudView(sheet,el,judul)};
}
async function cForm(sheet,row){
  const fs=S.skema[sheet].f.filter(f=>f[2]!=='r');if(fs.some(f=>f[2]==='P'))await needProduk();
  modal((row?'Ubah ':'Tambah ')+sheet.replace('_',' '),`<div class="fgrid">${fs.map(f=>fieldHtml(f,row?row[f[0]]:(f[2]==='s'?f[5][0]:''),'cf')).join('')}</div>`,{foot:`<button class="btn ghost" data-a="mtutup">Batal</button><button class="btn" data-a="cSave" data-s="${sheet}" data-id="${row?row.id:''}">Simpan</button>`});
}
AKSI.cAdd=d=>cForm(d.s,null);
AKSI.cEdit=d=>cForm(d.s,S.crud[d.s].rows.find(r=>r.id===d.id));
AKSI.cDel=async d=>{if(!confirm('Nonaktifkan / hapus data ini?'))return;const r=await api('crud.hapus',{sheet:d.s,id:d.id});if(r){toast('Berhasil','ok');S.cache={};S.crud[d.s].reload()}};
AKSI.cSave=async(d,b)=>{
  const fs=S.skema[d.s].f.filter(f=>f[2]!=='r'),data=readFields(fs,'cf');if(d.id)data.id=d.id;
  for(const f of fs){if(f[3]&&f[2]!=='p'&&String(data[f[0]]).trim()===''){toast(f[1]+' wajib diisi','er');return}}
  b.disabled=true;const r=await api('crud.simpan',{sheet:d.s,data:data});b.disabled=false;if(!r)return;
  mtutup();toast(r.peringatan||'Tersimpan',r.peringatan?'er':'ok');S.cache={};if(S.pos&&d.s==='Member'&&!d.id)S.pos=null;
  if(S.onMemberBaru&&d.s==='Member'){S.onMemberBaru(r);S.onMemberBaru=null}else S.crud[d.s]&&S.crud[d.s].reload();
};

/* ===== Input pecahan (buka/tutup shift) ===== */
function pecahanInput(id,init){init=init||{};return `<div class="fgrid">${S.pecahan.slice().sort((a,b)=>a-b).map(d=>`<div class="fg row"><label class="lbl money" for="${id}${d}"><span class="rpw">${uang(d)}</span><span>Rp ${d.toLocaleString('id-ID')}</span></label><input class="inp" style="max-width:110px;text-align:center" type="number" min="0" inputmode="numeric" id="${id}${d}" data-pi="${id}" value="${init[d]||0}"></div>`).join('')}</div>`}
function bacaPecahan(id){const o={};S.pecahan.forEach(d=>{const n=Math.floor(num($('#'+id+d).value));if(n>0)o[d]=n});return o}
const totalPecahan=m=>Object.keys(m).reduce((a,k)=>a+num(k)*m[k],0);
function pecahKembali(n,stok){const ds=ALLP.slice().reverse(),memo={};const f=(i,s)=>{if(s===0)return{};if(i>=ds.length)return null;const k=i+'_'+s;if(k in memo)return memo[k];const d=ds[i],mx=Math.min(Math.floor(s/d),stok[d]||0);let res=null;for(let c=mx;c>=0;c--){const r=f(i+1,s-c*d);if(r){res=Object.assign({},r);if(c)res[d]=c;break}}return memo[k]=res};return f(0,n)}
/* ===== Gambar uang Rupiah (SVG vektor, warna per pecahan) ===== */
const FF='Plus Jakarta Sans,system-ui,sans-serif';
const NOTE={100000:['#f0646f','#b3202e'],50000:['#62a3f5','#2a56a8'],20000:['#67d492','#2b8550'],10000:['#b08ae6','#6a3aa6'],5000:['#dbab70','#8f5d26'],2000:['#b9c1cc','#68737f']};
const GOLD=['#f7de8e','#b98a2a'],SILV=['#f1f4f8','#8f99a8'];
const COIN={1000:{r:29,o:GOLD,i:SILV},500:{r:27,o:SILV,i:GOLD},200:{r:24,o:['#e9edf2','#85909f'],i:null},100:{r:21,o:['#e1e6ed','#7d8898'],i:null}};
const gr=(id,a)=>`<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a[0]}"/><stop offset="1" stop-color="${a[1]}"/></linearGradient>`;
function rupiahSprite(){
  let o='<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>';
  Object.keys(NOTE).forEach(k=>{const d=Number(k),c=NOTE[k],t=d.toLocaleString('id-ID'),fs=t.length>6?16:t.length>5?18:20;
    o+=gr('rpg-'+d,c)+`<symbol id="rp-${d}" viewBox="0 0 128 64"><rect x="1" y="1" width="126" height="62" rx="9" fill="url(#rpg-${d})" stroke="${c[1]}" stroke-width="2"/><rect x="6" y="6" width="116" height="52" rx="6" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1.5"/><path d="M6 46Q30 32 54 46T102 46T150 46" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="2"/><path d="M6 54Q30 40 54 54T102 54" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="2"/><circle cx="30" cy="32" r="16" fill="#fff" fill-opacity=".2" stroke="#fff" stroke-opacity=".55" stroke-width="2"/><circle cx="30" cy="32" r="9" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.5"/><text x="120" y="20" text-anchor="end" font-size="9" font-weight="700" fill="#fff" font-family="${FF}">Rp</text><text x="120" y="46" text-anchor="end" font-size="${fs}" font-weight="800" fill="#fff" stroke="rgba(0,0,0,.28)" stroke-width="2.2" paint-order="stroke" font-family="${FF}">${t}</text></symbol>`});
  Object.keys(COIN).forEach(k=>{const d=Number(k),c=COIN[k];
    o+=gr('rpg-'+d,c.o)+(c.i?gr('rpi-'+d,c.i):'')+`<symbol id="rp-${d}" viewBox="0 0 64 64"><circle cx="32" cy="32" r="${c.r}" fill="url(#rpg-${d})" stroke="${c.o[1]}" stroke-width="2"/><circle cx="32" cy="32" r="${c.r-4}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.5"/>${c.i?`<circle cx="32" cy="32" r="${c.r-8}" fill="url(#rpi-${d})" stroke="${c.i[1]}" stroke-width="1"/>`:''}<text x="32" y="${d>=1000?37:d>=500?37:36}" text-anchor="middle" font-size="${d>=1000?13:15}" font-weight="800" fill="#3a4150" font-family="${FF}">${d}</text></symbol>`});
  return o+'</defs></svg>';
}
/** Gambar uang untuk satu pecahan (kertas 2rb–100rb, koin 100–1000). */
function uang(d){const k=d<=1000;return `<svg class="rp ${k?'koin':'kertas'}" viewBox="${k?'0 0 64 64':'0 0 128 64'}" role="img" aria-label="Rp ${Number(d).toLocaleString('id-ID')}"><use href="#rp-${d}"/></svg>`}
function kembaliChips(m){return Object.keys(m||{}).map(Number).sort((a,b)=>b-a).map(d=>`<span class="kc" title="Rp ${d.toLocaleString('id-ID')}">${uang(d)}<b>×${m[d]}</b></span>`).join('')}
const pecahTeks=m=>Object.keys(m).map(Number).sort((a,b)=>b-a).map(k=>m[k]+'×'+k.toLocaleString('id-ID'));

/* ===== STRUK & PRINTER ===== */
function printerCfg(){let c=Object.assign({},S.cfg.printer);try{const l=JSON.parse(lsGet('pos_printer')||'null');if(l)c=Object.assign(c,l)}catch(e){}return c}
function fmtTgl(s,f){const m=String(s).match(/(\d{4})-(\d\d)-(\d\d)[ T]?(\d\d)?:?(\d\d)?/);if(!m)return s;return (f||'dd/MM/yyyy HH:mm').replace('yyyy',m[1]).replace('MM',m[2]).replace('dd',m[3]).replace('HH',m[4]||'00').replace('mm',m[5]||'00')}
function bungkus(t,w){const o=[];t=String(t);while(t.length>w){o.push(t.slice(0,w));t=t.slice(w)}o.push(t);return o}
/** Susun baris struk (satu sumber untuk pratinjau, browser print, dan ESC/POS) */
function strukLines(s,pc,st){
  st=st||S.cfg.struk;pc=pc||printerCfg();const W=Number(pc.lebar)===80?48:32,h=st.header,sh=st.show,f=st.format,L=[];
  const cA=f.align==='kiri'?'l':'c',T=(t,a,b)=>L.push({t:t,a:a||'l',b:b?1:0}),LR=(a,b,bold)=>{const r=String(b);T(String(a).slice(0,Math.max(1,W-r.length-1)).padEnd(W-r.length)+r,'l',bold)},SEP=()=>T('-'.repeat(W));
  bungkus(h.nama,W).forEach(x=>T(x,cA,1));if(h.alamat)bungkus(h.alamat,W).forEach(x=>T(x,cA));if(h.telp)T(h.telp,cA);
  String(h.tambahan||'').split('\n').filter(Boolean).forEach(x=>bungkus(x,W).forEach(y=>T(y,cA)));SEP();
  if(sh.no)T('No   : '+s.no);if(sh.tanggal)T('Tgl  : '+fmtTgl(s.tanggal,f.tgl));if(sh.kasir)T('Kasir: '+s.kasir);if(sh.member&&s.member_nama)T('Member: '+s.member_nama);
  if(sh.no||sh.tanggal||sh.kasir||(sh.member&&s.member_nama))SEP();
  s.items.forEach(i=>{bungkus(i.nama,W).forEach(x=>T(x));LR('  '+i.qty+' x '+(i.gratis?'GRATIS':num(i.harga).toLocaleString('id-ID'))+(sh.tipe&&i.tipe==='Grosir'?' (Grosir)':''),(i.gratis?0:i.qty*i.harga).toLocaleString('id-ID'));if(sh.diskon_item&&i.diskon_item)LR('  Diskon','-'+num(i.diskon_item).toLocaleString('id-ID'))});
  SEP();LR('Subtotal',rp(s.subtotal));if(s.diskon)LR('Diskon','-'+rp(s.diskon));if(s.reward_pot)LR('Potongan reward','-'+rp(s.reward_pot));
  if(sh.diskon_bulat&&s.diskon_bulat)LR('Diskon pembulatan','-'+rp(s.diskon_bulat));if(sh.infak&&s.infak)LR('Infak','+'+rp(s.infak));
  LR('TOTAL',rp(s.total),f.bold_total);
  if(sh.bayar){LR('Bayar',rp(s.bayar));LR('Kembali',rp(s.kembalian))}
  if(sh.pecahan&&s.kembalian&&Object.keys(s.kembali_pecahan||{}).length){T('Rincian kembalian:');pecahTeks(s.kembali_pecahan).forEach(x=>T('  '+x))}
  if(sh.poin&&s.member_nama){SEP();LR('Poin didapat',s.poin_dapat);if(s.poin_pakai)LR('Poin dipakai',s.poin_pakai);LR('Saldo poin',s.poin_saldo)}
  SEP();String(st.footer||'').split('\n').filter(Boolean).forEach(x=>bungkus(x,W).forEach(y=>T(y,'c')));
  if(sh.qr&&s.no)L.push({qr:s.no});
  return L;
}
function strukHtml(L,pc){const W=Number(pc.lebar)===80?48:32;return `<div class="struk" style="width:${W+2}ch;max-width:100%">${L.map(l=>l.qr?`<div style="text-align:center">[QR: ${esc(l.qr)}]</div>`:`<div style="text-align:${l.a==='c'?'center':l.a==='r'?'right':'left'};font-weight:${l.b?700:400}">${esc(l.t)||' '}</div>`).join('')}</div>`}
function escpos(L,pc){
  const o=[],P=(...b)=>b.forEach(x=>o.push(x)),txt=s=>{for(const ch of s){const c=ch.charCodeAt(0);o.push(c<128?c:63)}};
  P(0x1b,0x40);
  for(let c=0;c<Math.max(1,Number(pc.salinan)||1);c++){
    for(let i=0;i<(Number(pc.margin_atas)||0);i++)P(0x0a);
    L.forEach(l=>{
      if(l.qr){P(0x1b,0x61,1);const n=l.qr.length+3;P(0x1d,0x28,0x6b,4,0,0x31,0x41,0x32,0,0x1d,0x28,0x6b,3,0,0x31,0x43,5,0x1d,0x28,0x6b,3,0,0x31,0x45,0x31,0x1d,0x28,0x6b,n&255,n>>8,0x31,0x50,0x30);txt(l.qr);P(0x1d,0x28,0x6b,3,0,0x31,0x51,0x30,0x0a);return}
      P(0x1b,0x61,l.a==='c'?1:l.a==='r'?2:0,0x1b,0x45,l.b?1:0);txt(l.t);P(0x0a)});
    P(0x1b,0x45,0,0x1b,0x61,0);for(let i=0;i<(Number(pc.margin_bawah)||0);i++)P(0x0a);
    if(pc.laci&&c===0)P(0x1b,0x70,0,25,250);
    if(pc.cutter)P(0x1d,0x56,pc.potong==='full'?65:66,0);
  }
  return o;
}
function b64(bytes){let s='';for(let i=0;i<bytes.length;i+=8000)s+=String.fromCharCode.apply(null,bytes.slice(i,i+8000));return btoa(s)}
function cetakBrowser(L,pc){
  const w=Number(pc.lebar)===80?80:58,f=document.createElement('iframe');f.style.cssText='position:fixed;width:0;height:0;border:0;right:0;bottom:0';document.body.appendChild(f);
  const logo=S.cfg.struk.header.logo&&pc.logo&&S.cfg.toko.logo?`<div style="text-align:center"><img src="${esc(S.cfg.toko.logo)}" style="max-width:${w-16}mm"></div>`:'';
  const one=`<div style="padding-top:${Number(pc.margin_atas)||0}mm;padding-bottom:${Number(pc.margin_bawah)||0}mm;page-break-after:always">${logo}${L.map(l=>l.qr?`<div style="text-align:center">${esc(l.qr)}</div>`:`<div style="text-align:${l.a==='c'?'center':'left'};font-weight:${l.b?700:400};white-space:pre">${esc(l.t)||'&nbsp;'}</div>`).join('')}</div>`;
  f.contentDocument.open();f.contentDocument.write(`<html><head><style>@page{size:${w}mm auto;margin:0}body{margin:0;width:${w}mm;padding:0 2mm;font:${w===80?12:10}px/1.3 "Courier New",monospace;color:#000}</style></head><body>${one.repeat(Math.max(1,Number(pc.salinan)||1))}</body></html>`);f.contentDocument.close();
  setTimeout(()=>{try{f.contentWindow.focus();f.contentWindow.print()}catch(e){toast('Gagal membuka dialog cetak','er')}setTimeout(()=>f.remove(),4000)},300);
}
function cetakStruk(s,pcOverride,stOverride){
  const pc=pcOverride||printerCfg(),L=strukLines(s,pc,stOverride);
  if(pc.metode==='rawbt'){try{const a=document.createElement('a');a.href='rawbt:base64,'+b64(escpos(L,pc));a.click();return}catch(e){toast('RawBT gagal, memakai dialog cetak browser','er')}}
  cetakBrowser(L,pc);
}
async function tampilStruk(s,baru,extra){
  S.strukAktif=s;const pc=printerCfg();
  modal(baru?'Transaksi selesai':'Struk '+s.no,`${baru?`<div class="chg ct" style="margin-bottom:12px">${ic('check')} Pembayaran berhasil · Kembalian ${rp(s.kembalian)}${s.kembalian?`<div class="chips" style="justify-content:center">${kembaliChips(s.kembali_pecahan)}</div>`:''}</div>`:''}${strukHtml(strukLines(s,pc),pc)}`,{foot:`${extra||''}<button class="btn ghost" data-a="mtutup">Tutup</button><button class="btn" data-a="cetak">${ic('printer')} Cetak</button>`});
}
AKSI.cetak=()=>cetakStruk(S.strukAktif);
const STRUK_CONTOH={no:'TRX20260101-0001',tanggal:'2026-01-01 10:30:00',kasir:'Kasir 1',member_nama:'M0001 Bu Sari',items:[{nama:'Beras Premium 5 kg',qty:3,harga:64000,tipe:'Grosir',diskon_item:0},{nama:'Mie Instan Goreng',qty:2,harga:3400,tipe:'Eceran',diskon_item:340}],subtotal:198800,diskon:340,reward_pot:0,diskon_bulat:60,infak:0,total:198400,bayar:200000,kembalian:1600,kembali_pecahan:{1000:1,500:1,100:1},poin_dapat:19,poin_pakai:0,poin_saldo:69};

/* ===================== HALAMAN ===================== */
const tabsHtml=(list,cur,a)=>`<div class="tabs" role="tablist">${list.map(t=>`<button role="tab" class="${t[0]===cur?'on':''}" data-a="${a}" data-t="${t[0]}">${esc(t[1])}</button>`).join('')}</div>`;

/* ---------- Dashboard ---------- */
PAGES.dashboard=()=>{view(skel());swr('dash',{},drawDash)};
function drawDash(d){if(S.page!=='dashboard')return;
  const jam=new Date().getHours(),sapa=jam<11?'pagi':jam<15?'siang':jam<19?'sore':'malam',mx=Math.max(1,...d.trend.map(x=>x.v)),tm=Math.max(1,d.top[0]?d.top[0].qty:1),tot=(d.member+d.umum)||1;
  const kp=[['chart',rp(d.hari.omzet),'Omzet hari ini',''],d.hari.laba!==null?['doc',rp(d.hari.laba),'Laba kotor hari ini','g']:['receipt',d.hari.trx,'Transaksi hari ini','g'],['heart',rp(d.hari.infak),'Infak hari ini',''],d.menipis!==null?['box',d.menipis,'Produk menipis','w']:['receipt',d.bulan.trx,'Transaksi bulan ini','w']];
  view(`<div class="hero"><h2>Selamat ${sapa}, ${esc(S.user.nama)}</h2><p>${d.hari.trx} transaksi hari ini · bulan ini ${rp(d.bulan.omzet)} (${d.bulan.trx} transaksi).</p>${S.vis.some(m=>m[0]==='kasir')?`<button class="btn" data-a="nav" data-p="kasir">${ic('cart')} Buka kasir</button>`:`<button class="btn" data-a="nav" data-p="laporan">${ic('chart')} Lihat laporan</button>`}</div>
  <div class="kpis">${kp.map(k=>`<div class="card kpi ${k[3]}"><div class="ic">${ic(k[0])}</div><div><b>${k[1]}</b><span class="mu">${k[2]}</span></div></div>`).join('')}</div>
  <div class="two"><div class="card"><h3>Tren penjualan 7 hari</h3><div class="bars" role="img" aria-label="Grafik penjualan 7 hari">${d.trend.map(x=>`<div><span class="mu">${x.v?Math.round(x.v/1000)+'rb':'0'}</span><i style="height:${Math.max(2,x.v/mx*100*.78)}%"></i><span>${x.tgl}</span></div>`).join('')}</div></div>
  <div class="card"><h3>Produk terlaris bulan ini</h3>${d.top.map(x=>`<div class="pr"><div class="row"><span>${esc(x.nama)}</span><b>${x.qty}</b></div><div class="t"><i style="width:${x.qty/tm*100}%"></i></div></div>`).join('')||'<p class="mu">Belum ada penjualan bulan ini.</p>'}
  <div class="pr"><div class="row"><span>Member</span><b>${d.member}</b></div><div class="t"><i style="width:${d.member/tot*100}%"></i></div><div class="row mu"><span>Umum</span><b>${d.umum}</b></div></div></div></div>
  <div class="card"><h3>Insight AI</h3><div class="ai">${d.insight.map(t=>`<p>• ${esc(t)}</p>`).join('')}</div></div>`);
};

/* ---------- Shift & kas ---------- */
function bukaShiftView(){
  view(`<div class="card"><h3>Buka shift</h3><p class="mu">Masukkan modal awal laci per pecahan.</p>${pecahanInput('mb')}<div class="row"><b>Total modal</b><b id="mbTot">Rp0</b></div><button class="btn blk" data-a="bukaShift" style="margin-top:12px">Buka shift</button></div>`);
}
AKSI.bukaShift=async()=>{const r=await api('shift.buka',{modal:bacaPecahan('mb')});if(r){S.shift=r;S.pos=null;toast('Shift dibuka','ok');navigateTo('kasir')}};
document.addEventListener('input',e=>{const t=e.target;if(t.dataset&&t.dataset.pi){const el=$('#'+t.dataset.pi+'Tot');if(el)el.textContent=rp(totalPecahan(bacaPecahan(t.dataset.pi)))}if(t.closest&&t.closest('[data-live]')&&S.live)S.live()});
PAGES.shift=async()=>{
  view(skel());const d=await api('shift.status');if(!d)return;if(!d.shift)return bukaShiftView();
  const k=d.shift.kas,tot=totalPecahan(k);
  view(`<div class="card"><div class="row wrap"><div><h3>Shift aktif</h3><p class="mu">Dibuka ${esc(d.shift.buka)} · modal ${rp(d.shift.modal)}</p></div><button class="btn dng" data-a="tutupForm">Tutup shift</button></div></div>
  <div class="card"><div class="row"><h3>Stok uang kembalian</h3><b>${rp(tot)}</b></div><div class="kasgrid">${ALLP.slice().reverse().filter(p=>S.pecahan.indexOf(p)>-1||k[p]).map(p=>{const q=k[p]||0,low=q<d.min;return `<div class="kt ${low?'low':''}"><span class="rpw">${uang(p)}</span><b>×${q}</b><span class="mu">${rp(q*p)}</span>${low?'<span class="badge wr">Di bawah minimum</span>':'<span class="badge ok">Aman</span>'}</div>`}).join('')}</div></div>`);
};
AKSI.tutupForm=()=>modal('Tutup shift',`<p class="mu">Hitung uang fisik di laci per pecahan.</p>${pecahanInput('tf')}<div class="row"><b>Total fisik</b><b id="tfTot">Rp0</b></div><div class="fg" style="margin-top:12px"><label class="lbl" for="tfKet">Catatan</label><input class="inp" id="tfKet"></div>`,{foot:`<button class="btn ghost" data-a="mtutup">Batal</button><button class="btn dng" data-a="tutupShift">Tutup shift</button>`});
AKSI.tutupShift=async()=>{const r=await api('shift.tutup',{fisik:bacaPecahan('tf'),ket:$('#tfKet').value});if(!r)return;S.pos=null;S.shift=null;
  modal('Shift ditutup',`<div class="grid"><div class="row"><span>Kas sistem</span><b>${rp(r.sistem)}</b></div><div class="row"><span>Kas fisik</span><b>${rp(r.fisik)}</b></div><div class="row"><span>Selisih</span><span class="badge ${r.selisih===0?'ok':'er'}">${rp(r.selisih)}</span></div><div class="row"><span>Transaksi</span><b>${r.transaksi}</b></div><div class="row"><span>Omzet shift</span><b>${rp(r.omzet)}</b></div></div>`,{foot:`<button class="btn" data-a="mtutup">Selesai</button>`,onClose:()=>navigateTo('shift')})};

/* ---------- Kasir ---------- */
const bulat=t=>{const x=t%100;return x<50?{bayar:t-x,diskon:x,infak:0}:{bayar:t+100-x,diskon:0,infak:100-x}};
function rebuildPM(){S.PM={};S.pos.produk.forEach(p=>{S.PM[p.id]=p})}
function hitung(){
  const m=S.member,L=[];let sub=0;
  Object.keys(S.cart).forEach(id=>{const p=S.PM[id];if(!p)return;const q=S.cart[id],g=p.min>0&&q>=p.min,h=g?(m?p.gm:p.gu):(m?p.em:p.eu);L.push({p:p,q:q,h:h,g:g,d:0});sub+=q*h});
  S.pos.diskon.filter(d=>d.cakupan==='produk').forEach(d=>L.forEach(l=>{if(l.p.id!==d.target)return;const k=l.h*l.q,pot=d.jenis==='persen'?Math.round(k*d.nilai/100):d.nilai*l.q;l.d+=Math.min(pot,k-l.d)}));
  const dI=L.reduce((a,l)=>a+l.d,0),base=sub-dI;let dT=0;
  S.pos.diskon.filter(d=>d.cakupan==='transaksi'||(d.cakupan==='member'&&m)).forEach(d=>{const pot=d.jenis==='persen'?Math.round((base-dT)*d.nilai/100):d.nilai;dT+=Math.min(pot,base-dT)});
  let rw=0,gratis=null;const R=S.reward;
  if(R&&m){const b2=base-dT;if(R.jenis==='nominal')rw=Math.min(R.nilai,b2);else if(R.jenis==='persen')rw=Math.round(b2*R.nilai/100);else gratis=S.PM[R.produk_id]}
  const tot=Math.max(0,sub-dI-dT-rw);return{L:L,sub:sub,dI:dI,dT:dT,rw:rw,gratis:gratis,tot:tot,r:bulat(Math.round(tot))};
}
const jml=()=>Object.keys(S.cart).reduce((a,k)=>a+S.cart[k],0);
function hue(t){let h=0;for(let i=0;i<t.length;i++)h=(h*31+t.charCodeAt(i))%360;return h}
PAGES.kasir=async()=>{
  if(!S.pos){view(skel());const d=await api('pos.data');if(!d)return;S.pos=d}
  if(!S.pos.shift)return bukaShiftView();
  rebuildPM();
  view(`<div class="kasir"><div class="sbox"><span class="sic">${ic('search')}</span><label class="lbl" for="q" style="position:absolute;left:-9999px">Cari produk</label><input class="inp" id="q" type="search" enterkeyhint="search" placeholder="Cari produk atau kode…" autocomplete="off"><button class="sx" id="qx" data-a="qClear" aria-label="Hapus pencarian" hidden>${ic('x')}</button><button class="scanb" data-a="scan" aria-label="Scan barcode">${ic('scan')}</button></div>
  <div class="chiprow"><button class="chipb" data-a="pilihMember" id="bMem"></button><span id="holdBar"></span></div><div id="res"></div>
  <div class="cart" id="cart" role="dialog" aria-modal="true" aria-label="Keranjang"></div></div><button class="btn cbar" id="cb" data-a="cartBuka"></button>`);
  const q=$('#q');q.addEventListener('input',()=>{$('#qx').hidden=!q.value;listPos()});q.addEventListener('keydown',e=>{if(e.key==='Enter')qEnter()});
  renderPos();
};
const emptyPos=()=>`<div class="empty"><div class="eic">${ic('search')}</div><h3>Siap melayani pelanggan</h3><p class="mu">Ketik nama atau kode produk untuk mencari, atau scan barcode.</p><div class="tips"><span>${ic('search')} Ketik nama / kode</span><span>${ic('scan')} Scan barcode</span><span>${ic('check')} Enter = tambah cepat</span></div></div>`;
function resRow(p){
  const n=S.cart[p.id]||0,qq=Math.max(n,1),g=p.min>0&&qq>=p.min,h=g?(S.member?p.gm:p.gu):(S.member?p.em:p.eu),habis=p.stok<=0;
  const ctl=n?`<div class="qty"><button data-a="qty" data-id="${p.id}" data-d="-1" aria-label="Kurangi">${ic('minus')}</button><span>${n}</span><button data-a="qty" data-id="${p.id}" data-d="1" aria-label="Tambah" ${n>=p.stok?'disabled':''}>${ic('plus')}</button></div>`:`<button class="btn sm addb" data-a="add" data-id="${p.id}" ${habis?'disabled':''} aria-label="Tambah ${esc(p.nama)}">${ic('plus')} Tambah</button>`;
  return `<div class="res ${habis?'hab':''}"><div class="av" style="--h:${hue(p.nama)}">${esc(p.nama.trim().charAt(0).toUpperCase())}</div><div class="rmain"><b>${esc(p.nama)}</b><div class="mu">${esc(p.kode)} · ${habis?'Stok habis':'Stok '+p.stok}</div>${p.min?`<span class="badge ${g?'ok':''}">Grosir ≥${p.min}</span>`:''}</div><div class="rprice"><b>${rp(h)}</b>${ctl}</div></div>`;
}
function cariProduk(q){q=q.trim().toLowerCase();return q?S.pos.produk.filter(p=>(p.nama+' '+p.kode).toLowerCase().indexOf(q)>-1):[]}
function listPos(){
  const el=$('#res'),qi=$('#q');if(!el||!qi)return;const raw=qi.value.trim();
  if(!raw){el.innerHTML=emptyPos();return}
  const L=cariProduk(raw);
  el.innerHTML=L.length?`<div class="mu" style="margin:10px 4px">${L.length} produk ditemukan${L.length>30?' (30 teratas)':''}</div>${L.slice(0,30).map(resRow).join('')}`:`<div class="empty"><div class="eic">${ic('search')}</div><h3>Tidak ditemukan</h3><p class="mu">Tidak ada produk untuk “${esc(raw)}”. Coba kata kunci atau kode lain.</p></div>`;
}
function qEnter(){
  const qi=$('#q'),raw=qi.value.trim();if(!raw)return;
  let one=S.pos.produk.filter(p=>p.kode.toLowerCase()===raw.toLowerCase());if(one.length!==1)one=cariProduk(raw);
  if(one.length===1){AKSI.add({id:one[0].id});qi.value='';$('#qx').hidden=true;listPos()}else toast(one.length?'Pilih produk dari daftar':'Produk tidak ditemukan','er');
}
AKSI.qClear=()=>{const q=$('#q');q.value='';$('#qx').hidden=true;listPos();q.focus()};
function bump(){const b=$('#cb');if(b){b.classList.remove('bump');void b.offsetWidth;b.classList.add('bump')}}
function renderPos(){
  if(S.page!=='kasir')return;
  listPos();const h=hitung();
  $('#bMem').innerHTML=`${ic('user')}<span>${S.member?esc(S.member.nama)+' · '+S.member.poin+' poin':'Pelanggan umum'}</span>`;
  $('#holdBar').innerHTML=S.holds.length?`<button class="chipb" data-a="holdList">${ic('pause')}<span>Ditahan (${S.holds.length})</span></button>`:'';
  const c=$('#cart');c.className='cart'+(S.open?' open':'');$('#dim').className='dim'+(S.open?' on':'');c.innerHTML=cartHtml(h);
  document.body.style.overflow=S.open?'hidden':'';
  const b=$('#cb'),n=jml();b.innerHTML=`<span class="cbl"><span class="cbi">${ic('cart')}${n?`<i>${n}</i>`:''}</span><span><b>${n?'Lihat keranjang':'Keranjang kosong'}</b><small>${n} item</small></span></span><b class="cbt">${rp(h.r.bayar)}</b>`;b.disabled=!n;
}
function cartHtml(h){
  let o=`<div class="grab"></div><div class="row"><h3>${S.pay?'Pembayaran':'Keranjang'}</h3><button class="ib" data-a="cartTutup" aria-label="Tutup">${ic('x')}</button></div><button class="mchip" data-a="pilihMember">${ic('user')}<span>${S.member?esc(S.member.nama)+' · '+S.member.poin+' poin':'Pelanggan umum'}</span><em>Ubah</em></button>`;
  if(!h.L.length)return o+'<p class="mu ct" style="padding:24px 0">Keranjang kosong. Ketuk produk untuk menambah.</p>';
  if(!S.pay){
    o+=h.L.map(l=>`<div class="ci"><div><b style="font-size:14px">${esc(l.p.nama)}</b><div class="mu">${rp(l.h)}${l.g?' · grosir':''}${l.d?' · diskon '+rp(l.d):''}</div></div><div class="qty"><button data-a="qty" data-id="${l.p.id}" data-d="-1" aria-label="Kurangi">${ic('minus')}</button><span>${l.q}</span><button data-a="qty" data-id="${l.p.id}" data-d="1" aria-label="Tambah">${ic('plus')}</button></div></div>`).join('');
    if(S.member){const rs=S.pos.reward.filter(r=>r.poin<=S.member.poin);if(rs.length)o+=`<div class="fg" style="margin-top:10px"><label class="lbl" for="rwSel">Tukar reward (saldo ${S.member.poin} poin)</label><select class="inp" id="rwSel" data-a-ch="reward"><option value="">— tidak —</option>${rs.map(r=>`<option value="${r.id}" ${S.reward&&S.reward.id===r.id?'selected':''}>${esc(r.nama)} (${r.poin} poin)</option>`).join('')}</select></div>`}
    o+=`<div class="row" style="margin-top:10px"><span class="mu">Subtotal</span><b>${rp(h.sub)}</b></div>${h.dI+h.dT?`<div class="row"><span class="mu">Diskon</span><b>-${rp(h.dI+h.dT)}</b></div>`:''}${h.rw?`<div class="row"><span class="mu">Reward</span><b>-${rp(h.rw)}</b></div>`:''}${h.gratis?`<div class="row"><span class="mu">Gratis</span><b>${esc(h.gratis.nama)}</b></div>`:''}
    <div class="row"><span class="mu">Total (dibulatkan)</span><span class="tot">${rp(h.r.bayar)}</span></div><div class="row gap" style="margin-top:10px"><button class="btn ghost" data-a="tahan">${ic('pause')} Tahan</button><button class="btn" style="flex:1;min-height:52px" data-a="bayarMulai">Bayar</button></div>`;return o;
  }
  const pd=totalPecahan(S.paid),kb=pd-h.r.bayar,kas=S.pos.shift.kas,st={};ALLP.forEach(d=>{st[d]=(kas[d]||0)+(S.paid[d]||0)});const kp=kb>0?pecahKembali(kb,st):{};
  o+=`<div class="row" style="margin-top:6px"><span class="mu">Subtotal</span><span>${rp(h.sub)}</span></div>${h.dI+h.dT+h.rw?`<div class="row"><span class="mu">Diskon/reward</span><span>-${rp(h.dI+h.dT+h.rw)}</span></div>`:''}${h.r.diskon?`<div class="row"><span class="mu">Diskon pembulatan</span><span class="badge wr">-${rp(h.r.diskon)}</span></div>`:''}${h.r.infak?`<div class="row"><span class="mu">Infak</span><span class="badge ok">+${rp(h.r.infak)}</span></div>`:''}
  <div class="row"><span class="mu">Total bayar</span><span class="tot">${rp(h.r.bayar)}</span></div><div class="row" style="margin-top:10px"><span class="mu">Uang diterima</span><b style="font-size:20px">${rp(pd)}</b></div><div class="row gap" style="justify-content:flex-start;margin-top:8px"><button class="btn soft sm" data-a="uangPas">Uang pas</button><button class="btn ghost sm" data-a="payReset">Reset</button></div>
  <div class="dn">${S.pecahan.slice().sort((a,b)=>a-b).map(d=>`<button data-a="pay" data-d="${d}" aria-label="Tambah ${d}">${uang(d)}${S.paid[d]?`<span class="badge">${S.paid[d]}</span>`:''}</button>`).join('')}</div>`;
  if(pd>=h.r.bayar){o+=kp?`<div class="chg">Kembalian ${rp(kb)}${kb?`<div class="chips">${kembaliChips(kp)}</div>`:''}</div>`:`<div class="chg bad">Kembalian ${rp(kb)} — stok pecahan laci tidak cukup. Minta uang pas atau pecahan lebih kecil.</div>`}else o+=`<div class="mu">Kurang ${rp(h.r.bayar-pd)}</div>`;
  o+=`<button class="btn blk" style="margin-top:12px" data-a="selesai" ${pd<h.r.bayar||!kp?'disabled':''}>Selesai & cetak struk</button><button class="btn ghost blk" style="margin-top:8px;min-height:44px" data-a="bayarKembali">Kembali ke keranjang</button>`;return o;
}
document.addEventListener('change',e=>{if(e.target.dataset&&e.target.dataset.aCh==='reward'){S.reward=S.pos.reward.find(r=>r.id===e.target.value)||null;renderPos()}});
$('#dim').addEventListener('click',()=>{S.open=false;renderPos()});
AKSI.add=d=>{const p=S.PM[d.id],q=(S.cart[d.id]||0)+1;if(q>p.stok)return toast('Stok '+p.nama+' hanya '+p.stok,'er');S.cart[d.id]=q;S.paid={};renderPos();bump()};
AKSI.qty=d=>{const p=S.PM[d.id],q=(S.cart[d.id]||0)+Number(d.d);if(q>p.stok)return toast('Stok tidak cukup','er');if(q<=0)delete S.cart[d.id];else S.cart[d.id]=q;S.paid={};renderPos()};
AKSI.cartBuka=()=>{S.open=true;renderPos()};AKSI.cartTutup=()=>{S.open=false;S.pay=false;renderPos()};
AKSI.bayarMulai=()=>{S.pay=true;S.paid={};renderPos()};AKSI.bayarKembali=()=>{S.pay=false;renderPos()};
AKSI.pay=d=>{S.paid[d.d]=(S.paid[d.d]||0)+1;renderPos()};AKSI.payReset=()=>{S.paid={};renderPos()};
AKSI.uangPas=()=>{let s=hitung().r.bayar;S.paid={};S.pecahan.slice().sort((a,b)=>b-a).forEach(d=>{const n=Math.floor(s/d);if(n){S.paid[d]=n;s-=n*d}});renderPos()};
AKSI.tahan=()=>{if(!jml())return;S.holds.push({cart:S.cart,member:S.member,reward:S.reward,t:new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})});S.cart={};S.reward=null;S.open=false;toast('Transaksi ditahan');renderPos()};
AKSI.holdList=()=>modal('Transaksi ditahan',S.holds.map((h,i)=>`<div class="li"><span>${h.t} · ${Object.keys(h.cart).length} produk${h.member?' · '+esc(h.member.nama):''}</span><span class="row gap"><button class="btn soft sm" data-a="holdPulih" data-i="${i}">Lanjutkan</button><button class="btn dng sm" data-a="holdHapus" data-i="${i}" aria-label="Hapus">${ic('trash')}</button></span></div>`).join('')||'<p class="mu">Tidak ada.</p>');
AKSI.holdPulih=d=>{if(jml())return toast('Selesaikan atau tahan keranjang saat ini dulu','er');const h=S.holds.splice(Number(d.i),1)[0];S.cart=h.cart;S.member=h.member;S.reward=h.reward;mtutup();renderPos()};
AKSI.holdHapus=d=>{S.holds.splice(Number(d.i),1);mtutup();renderPos()};
AKSI.pilihMember=()=>{
  modal('Pilih pelanggan',`<button class="btn ghost blk" data-a="setMember" data-id="">Pelanggan Umum</button><div class="fg" style="margin-top:12px"><label class="lbl" for="mq">Cari member (nama / kode / HP)</label><input class="inp" id="mq" autocomplete="off"></div><div id="mList"></div>`,{foot:`<button class="btn soft" data-a="memberBaru">${ic('plus')} Member baru</button>`});
  const draw=()=>{const q=$('#mq').value.toLowerCase();$('#mList').innerHTML=S.pos.member.filter(m=>!q||(m.nama+m.kode+m.hp).toLowerCase().indexOf(q)>-1).slice(0,30).map(m=>`<button class="li" data-a="setMember" data-id="${m.id}"><span><b>${esc(m.nama)}</b><div class="mu">${esc(m.kode)} · ${esc(m.hp)}</div></span><span class="badge">${m.poin} poin</span></button>`).join('')||'<p class="mu">Tidak ditemukan.</p>'};
  $('#mq').addEventListener('input',draw);draw();
};
AKSI.setMember=d=>{S.member=d.id?S.pos.member.find(m=>m.id===d.id):null;S.reward=null;S.paid={};mtutup();renderPos()};
AKSI.memberBaru=()=>{S.onMemberBaru=async r=>{const d=await api('pos.data');if(!d)return;S.pos=d;rebuildPM();S.member=d.member.find(m=>m.id===r.id)||null;S.reward=null;renderPos()};cForm('Member',null)};
AKSI.selesai=async(d,b)=>{
  const h=hitung();b.disabled=true;
  const r=await api('trx.simpan',{items:Object.keys(S.cart).map(k=>({pid:k,qty:S.cart[k]})),member_id:S.member?S.member.id:'',reward_id:S.reward?S.reward.id:'',bayar:S.paid});
  if(!r){b.disabled=false;return}
  S.pos.shift.kas=r.kas;h.L.forEach(l=>{l.p.stok-=l.q});if(h.gratis)h.gratis.stok-=1;
  if(S.member){S.member.poin=r.struk.poin_saldo}
  S.cart={};S.paid={};S.reward=null;S.pay=false;S.open=false;renderPos();tampilStruk(r.struk,true);
};
AKSI.scan=async()=>{
  if(!('BarcodeDetector' in window))return toast('Scan kamera belum didukung browser ini. Ketik kode di kolom cari.','er');
  modal('Scan barcode','<video id="vid" autoplay playsinline muted style="width:100%;border-radius:12px;background:#000"></video><p class="mu ct">Arahkan kamera ke barcode produk.</p>',{onClose:stopScan});
  try{S.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});const v=$('#vid');v.srcObject=S.stream;const det=new BarcodeDetector();let kunci=false;
    S.scanT=setInterval(async()=>{if(kunci)return;try{const r=await det.detect(v);if(!r.length)return;kunci=true;const p=S.pos.produk.find(x=>x.kode===r[0].rawValue);if(p){AKSI.add({id:p.id})}else toast('Kode tidak dikenal: '+r[0].rawValue,'er');setTimeout(()=>{kunci=false},1500)}catch(e){}},600)}
  catch(e){toast('Kamera tidak dapat diakses (izin kamera / iframe).','er')}
};
function stopScan(){clearInterval(S.scanT);if(S.stream){S.stream.getTracks().forEach(t=>t.stop());S.stream=null}}

/* ---------- Riwayat & Void ---------- */
PAGES.riwayat=()=>{S.rw=S.rw||{tab:'trx',dari:ymd(),sampai:ymd(),q:''};drawRw()};
function drawRw(){
  const r=S.rw;view(tabsHtml([['trx','Transaksi'],['void','Pengajuan void']],r.tab,'rwTab')+'<div id="rwBody"></div>');
  if(r.tab==='trx'){
    $('#rwBody').innerHTML=`<div class="card"><div class="fgrid"><div class="fg"><label class="lbl" for="rd">Dari</label><input class="inp" type="date" id="rd" value="${r.dari}"></div><div class="fg"><label class="lbl" for="rs">Sampai</label><input class="inp" type="date" id="rs" value="${r.sampai}"></div></div><div class="row gap"><input class="inp" id="rq" placeholder="Cari no / member / kasir" value="${esc(r.q)}"><button class="btn" data-a="rwCari">Tampilkan</button></div></div><div class="card" id="rwList"></div>`;rwLoad();
  }else rwVoid();
}
AKSI.rwTab=d=>{S.rw.tab=d.t;drawRw()};
AKSI.rwCari=()=>{S.rw.dari=$('#rd').value;S.rw.sampai=$('#rs').value;S.rw.q=$('#rq').value;rwLoad()};
async function rwLoad(){
  const L=await api('trx.list',{dari:S.rw.dari,sampai:S.rw.sampai,q:S.rw.q});if(!L)return;
  $('#rwList').innerHTML=L.map(t=>`<button class="li" data-a="rwDetail" data-id="${t.id}"><span><b>${esc(t.no)}</b><div class="mu">${esc(t.tanggal)} · ${esc(t.kasir)}${t.member?' · '+esc(t.member):''}</div></span><span class="rt"><b>${rp(t.total)}</b><div>${t.status==='Void'?'<span class="badge er">Void</span>':t.void_menunggu?'<span class="badge wr">Void diajukan</span>':'<span class="badge ok">Selesai</span>'}</div></span></button>`).join('')||'<p class="mu ct">Tidak ada transaksi.</p>';
}
AKSI.rwDetail=async d=>{const s=await api('trx.detail',{id:d.id});if(!s)return;const ok=s.status==='Selesai'&&[KS,SA].indexOf(S.user.peran)>-1;tampilStruk(s,false,ok?`<button class="btn dng" data-a="voidForm" data-id="${s.id}">Ajukan void</button>`:'')};
AKSI.voidForm=d=>modal('Ajukan void',`<div class="fg"><label class="lbl" for="vAlasan">Alasan *</label><textarea class="inp" id="vAlasan"></textarea></div><p class="mu">Admin/Super Admin akan menyetujui. Stok, kas pecahan, dan poin dikembalikan otomatis saat disetujui.</p>`,{foot:`<button class="btn ghost" data-a="mtutup">Batal</button><button class="btn dng" data-a="voidKirim" data-id="${d.id}">Kirim pengajuan</button>`});
AKSI.voidKirim=async d=>{const r=await api('void.ajukan',{trx_id:d.id,alasan:$('#vAlasan').value});if(r){mtutup();toast('Pengajuan void terkirim','ok');drawRw()}};
async function rwVoid(){
  $('#rwBody').innerHTML='<div class="card" id="vList"></div>';const L=await api('void.list',{});if(!L)return;const adm=[SA,AD].indexOf(S.user.peran)>-1;
  $('#vList').innerHTML=L.map(v=>`<div class="li"><span><b>${esc(v.no)}</b> <span class="badge ${v.status==='Disetujui'?'ok':v.status==='Ditolak'?'er':'wr'}">${esc(v.status)}</span><div class="mu">${esc(v.pengaju)} · ${esc(v.tanggal)}<br>${esc(v.alasan)}</div></span>${adm&&v.status==='Menunggu'?`<span class="row gap"><button class="btn sm" data-a="voidProses" data-id="${v.id}" data-s="1">Setujui</button><button class="btn dng sm" data-a="voidProses" data-id="${v.id}" data-s="0">Tolak</button></span>`:''}</div>`).join('')||'<p class="mu ct">Belum ada pengajuan.</p>';
}
AKSI.voidProses=async d=>{if(d.s==='1'&&!confirm('Setujui void? Stok, kas, dan poin akan dikembalikan.'))return;const r=await api('void.proses',{id:d.id,setuju:d.s==='1'});if(r){toast('Diproses','ok');S.pos=null;rwVoid()}};

/* ---------- Produk & Stok ---------- */
PAGES.stok=()=>{S.tab=S.tab||'ring';drawStok()};
function drawStok(){view(tabsHtml([['ring','Stok & FIFO'],['prod','Produk & harga']],S.tab,'stTab')+'<div id="stBody"></div>');if(S.tab==='ring')stRing();else crudView('Produk',$('#stBody'))}
AKSI.stTab=d=>{S.tab=d.t;drawStok()};
function stRing(){swr('stok.ringkas',{},drawRing)}
function drawRing(L){if(!$('#stBody'))return;S.stokL=L;const nilai=L.reduce((a,x)=>a+x.nilai,0);
  $('#stBody').innerHTML=`<div class="kpis"><div class="card kpi"><div class="ic">${ic('box')}</div><div><b>${rp(nilai)}</b><span class="mu">Nilai persediaan (FIFO)</span></div></div><div class="card kpi w"><div class="ic">${ic('clock')}</div><div><b>${L.filter(x=>x.menipis&&x.status==='Aktif').length}</b><span class="mu">Stok menipis</span></div></div></div><div class="card"><div class="row" style="margin-bottom:8px"><h3>Posisi stok</h3><button class="btn" data-a="masuk" data-id="">${ic('plus')} Stok masuk</button></div><div class="tw"><table><thead><tr><th>Produk</th><th class="n">Stok</th><th class="n">Min</th><th class="n">Nilai</th><th class="n">Saran restock</th><th>Status</th><th></th></tr></thead><tbody>${L.map(x=>`<tr><td>${esc(x.nama)}</td><td class="n">${x.stok}</td><td class="n">${x.min}</td><td class="n">${rp(x.nilai)}</td><td class="n">${x.saran?'+'+x.saran:'-'}</td><td>${x.kedaluwarsa?'<span class="badge er">Kedaluwarsa dekat</span>':x.menipis?'<span class="badge wr">Menipis</span>':'<span class="badge ok">Aman</span>'}</td><td class="n"><button class="btn soft sm" data-a="masuk" data-id="${x.id}">Masuk</button> <button class="btn ghost sm" data-a="opname" data-id="${x.id}">Opname</button> <button class="btn ghost sm" data-a="kartu" data-id="${x.id}">Kartu</button></td></tr>`).join('')}</tbody></table></div></div>`;
}
AKSI.masuk=async d=>{
  const sup=await api('crud.list',{sheet:'Supplier'},{quiet:true})||[];
  modal('Stok masuk (batch baru)',`<div class="fgrid"><div class="fg full"><label class="lbl" for="smP">Produk *</label><select class="inp" id="smP">${S.stokL.map(x=>`<option value="${x.id}" ${x.id===d.id?'selected':''}>${esc(x.nama)}</option>`).join('')}</select></div><div class="fg"><label class="lbl" for="smQ">Qty *</label><input class="inp" id="smQ" type="number" min="1" inputmode="numeric"></div><div class="fg"><label class="lbl" for="smH">Harga beli / satuan *</label><input class="inp" id="smH" type="number" min="0" inputmode="numeric"></div><div class="fg"><label class="lbl" for="smS">Supplier</label><select class="inp" id="smS"><option value="">—</option>${sup.map(s=>`<option value="${s.id}">${esc(s.nama)}</option>`).join('')}</select></div><div class="fg"><label class="lbl" for="smT">Tanggal masuk</label><input class="inp" id="smT" type="date" value="${ymd()}"></div><div class="fg"><label class="lbl" for="smE">Kedaluwarsa (opsional)</label><input class="inp" id="smE" type="date"></div></div>`,{foot:`<button class="btn ghost" data-a="mtutup">Batal</button><button class="btn" data-a="masukSimpan">Simpan</button>`});
};
AKSI.masukSimpan=async()=>{const r=await api('stok.masuk',{produk_id:$('#smP').value,qty:$('#smQ').value,harga_beli:$('#smH').value,supplier_id:$('#smS').value,tgl:$('#smT').value,kedaluwarsa:$('#smE').value});if(r){mtutup();toast(r.peringatan||'Stok masuk tersimpan',r.peringatan?'er':'ok');stRing()}};
AKSI.opname=d=>{const x=S.stokL.find(s=>s.id===d.id);modal('Stok opname — '+x.nama,`<p class="mu">Stok sistem: <b>${x.stok}</b></p><div class="fg"><label class="lbl" for="opF">Stok fisik *</label><input class="inp" id="opF" type="number" min="0" inputmode="numeric" value="${x.stok}"></div><div class="fg"><label class="lbl" for="opK">Keterangan</label><input class="inp" id="opK"></div>`,{foot:`<button class="btn ghost" data-a="mtutup">Batal</button><button class="btn" data-a="opnameSimpan" data-id="${x.id}">Simpan penyesuaian</button>`})};
AKSI.opnameSimpan=async d=>{const r=await api('stok.opname',{produk_id:d.id,fisik:$('#opF').value,ket:$('#opK').value});if(r){mtutup();toast('Selisih '+r.selisih,'ok');stRing()}};
AKSI.kartu=async d=>{const L=await api('stok.kartu',{produk_id:d.id});if(!L)return;modal('Kartu stok',`<div class="tw"><table><thead><tr><th>Waktu</th><th>Jenis</th><th class="n">Qty</th><th>Oleh</th></tr></thead><tbody>${L.map(m=>`<tr><td>${esc(m.tanggal)}</td><td>${esc(m.jenis)}</td><td class="n">${m.qty>0?'+':''}${m.qty}</td><td>${esc(m.oleh)}</td></tr>`).join('')||'<tr><td colspan="4" class="mu ct">Belum ada mutasi.</td></tr>'}</tbody></table></div>`,{wide:true})};

/* ---------- Master data ---------- */
const MASTER=[['Member','Member'],['Diskon','Diskon'],['Reward','Reward'],['Supplier','Supplier'],['Kategori','Kategori'],['Satuan','Satuan'],['Biaya_Operasional','Biaya operasional']];
PAGES.master=async()=>{await needProduk();const T=MASTER.filter(t=>S.skema[t[0]]);S.mt=T.some(t=>t[0]===S.mt)?S.mt:T[0][0];view(tabsHtml(T,S.mt,'mTab')+'<div id="mBody"></div>');crudView(S.mt,$('#mBody'))};
AKSI.mTab=d=>{S.mt=d.t;PAGES.master()};

/* ---------- Laporan ---------- */
const LAP=[['penjualan','Penjualan'],['labarugi','Laba rugi'],['kas','Kas'],['infak','Infak'],['persediaan','Persediaan'],['poin','Poin & reward'],['kasir','Rekap per kasir']];
PAGES.laporan=()=>{
  const jenis=S.user.peran===KS?LAP.filter(l=>l[0]==='kasir'):LAP;S.lp=S.lp||{jenis:jenis[0][0],dari:ymd(),sampai:ymd()};if(!jenis.some(j=>j[0]===S.lp.jenis))S.lp.jenis=jenis[0][0];
  view(`<div class="card"><div class="fgrid"><div class="fg full"><label class="lbl" for="lj">Jenis laporan</label><select class="inp" id="lj">${jenis.map(j=>`<option value="${j[0]}" ${S.lp.jenis===j[0]?'selected':''}>${j[1]}</option>`).join('')}</select></div><div class="fg"><label class="lbl" for="ld">Dari</label><input class="inp" type="date" id="ld" value="${S.lp.dari}"></div><div class="fg"><label class="lbl" for="ls">Sampai</label><input class="inp" type="date" id="ls" value="${S.lp.sampai}"></div></div>
  <div class="row wrap gap"><span class="row gap"><button class="btn soft sm" data-a="lpPer" data-p="hari">Hari ini</button><button class="btn soft sm" data-a="lpPer" data-p="minggu">7 hari</button><button class="btn soft sm" data-a="lpPer" data-p="bulan">Bulan ini</button></span><button class="btn" data-a="lpTampil">Tampilkan</button></div></div><div id="lpOut"></div>`);
};
AKSI.lpPer=d=>{const n=new Date(),a=d.p==='hari'?n:d.p==='minggu'?new Date(n-6*864e5):new Date(n.getFullYear(),n.getMonth(),1);$('#ld').value=ymd(a);$('#ls').value=ymd(n)};
function lapBody(L,raw){
  const fm=(v,t)=>typeof v==='string'?esc(v):raw?v:t==='rp'?rp(v):t==='n'?num(v).toLocaleString('id-ID'):esc(v);
  return (L.ringkasan.length?`<table><tbody>${L.ringkasan.map(r=>`<tr><td>${esc(r[0])}</td><td class="n"><b>${fm(r[1],r[2])}</b></td></tr>`).join('')}</tbody></table>`:'')+L.bagian.map(b=>`<h4>${esc(b.judul)}</h4><div class="tw"><table><thead><tr>${b.kolom.map(k=>`<th class="${k[1]!=='s'?'n':''}">${esc(k[0])}</th>`).join('')}</tr></thead><tbody>${b.baris.map(r=>`<tr>${r.map((v,i)=>`<td class="${b.kolom[i][1]!=='s'?'n':''}">${fm(v,b.kolom[i][1])}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${b.kolom.length}" class="mu ct">Tidak ada data.</td></tr>`}</tbody></table></div>`).join('');
}
AKSI.lpTampil=async()=>{
  S.lp={jenis:$('#lj').value,dari:$('#ld').value,sampai:$('#ls').value};const L=await api('lap',S.lp);if(!L)return;S.lapData=L;
  $('#lpOut').innerHTML=`<div class="card lap"><div class="row wrap gap"><div><h3>${esc(L.judul)}</h3><div class="mu">${esc(L.periode)}</div></div><span class="row gap"><button class="btn soft sm" data-a="lapPdf">${ic('doc')} Cetak PDF</button><button class="btn ghost sm" data-a="lapXls">${ic('chart')} Ekspor Excel</button></span></div>${lapBody(L)}</div>`;
};
const CSS_CETAK='body{font:12px/1.4 Arial,sans-serif;color:#111;margin:18mm 14mm}h1{font-size:18px;margin:0}h2{font-size:15px;margin:10px 0 2px}h4{margin:14px 0 4px}table{border-collapse:collapse;width:100%;margin-bottom:6px}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left}th{background:#eef3fb}.n{text-align:right}.kop{border-bottom:2px solid #222;padding-bottom:6px;margin-bottom:8px}.tw{overflow:visible}';
const lapDoc=(L,raw)=>`<html><head><meta charset="utf-8"><style>${CSS_CETAK}</style></head><body><div class="kop"><h1>${esc(L.toko)}</h1><div>${esc(L.alamat)}</div></div><h2>${esc(L.judul)}</h2><div>Periode: ${esc(L.periode)}</div>${lapBody(L,raw)}</body></html>`;
AKSI.lapPdf=()=>{modal('Pratinjau PDF','<iframe id="pdfF" style="width:100%;height:60vh;border:1px solid var(--bd);border-radius:8px;background:#fff"></iframe><p class="mu">Pilih “Simpan sebagai PDF” pada dialog cetak.</p>',{wide:true,foot:`<button class="btn ghost" data-a="mtutup">Tutup</button><button class="btn" data-a="lapCetak">${ic('printer')} Cetak / Simpan PDF</button>`});$('#pdfF').srcdoc=lapDoc(S.lapData)};
AKSI.lapCetak=()=>{const w=$('#pdfF').contentWindow;w.focus();w.print()};
AKSI.lapXls=()=>{const L=S.lapData,b=new Blob(['\ufeff'+lapDoc(L,true)],{type:'application/vnd.ms-excel'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=L.judul.replace(/\W+/g,'_')+'_'+ymd()+'.xls';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500);toast('Excel diunduh','ok')};

/* ---------- Pengaturan ---------- */
const SET_TABS=[['toko','Toko',[SA,AD]],['struk','Isi struk',[SA]],['printer','Printer',[SA,AD,KS,MG]],['poin','Poin & kas',[SA,AD]],['users','Pengguna',[SA]],['log','Log',[SA]],['akun','Akun',[SA,AD,KS,MG]]];
PAGES.pengaturan=()=>{const T=SET_TABS.filter(t=>t[2].indexOf(S.user.peran)>-1);S.sTab=T.some(t=>t[0]===S.sTab)?S.sTab:T[0][0];S.live=null;view(tabsHtml(T,S.sTab,'sTab')+'<div id="sBody"></div>');SET[S.sTab]($('#sBody'))};
AKSI.sTab=d=>{S.sTab=d.t;PAGES.pengaturan()};
const tx=(id,l,v,t)=>`<div class="fg"><label class="lbl" for="${id}">${l}</label><input class="inp" id="${id}" type="${t||'text'}" value="${esc(v)}"></div>`;
const ck=(id,l,v)=>`<div class="fg"><label class="chk"><input type="checkbox" id="${id}" ${v?'checked':''}><span>${l}</span></label></div>`;
const sel=(id,l,v,o)=>`<div class="fg"><label class="lbl" for="${id}">${l}</label><select class="inp" id="${id}">${o.map(x=>`<option value="${x[0]}" ${String(x[0])===String(v)?'selected':''}>${x[1]}</option>`).join('')}</select></div>`;
const SET={};
SET.toko=el=>{const t=S.cfg.toko;el.innerHTML=`<div class="card"><h3>Identitas toko</h3><div class="fgrid">${tx('tk_nama','Nama toko',t.nama)}${tx('tk_telp','Telepon / WA',t.telp)}<div class="full">${tx('tk_alamat','Alamat',t.alamat)}${tx('tk_logo','URL logo (opsional)',t.logo)}</div></div><h3 style="margin:8px 0">Pecahan uang aktif</h3><div class="fgrid">${ALLP.map(p=>ck('tk_p'+p,p.toLocaleString('id-ID'),t.pecahan.indexOf(p)>-1)).join('')}</div><button class="btn" data-a="simpanToko">Simpan</button></div>`};
AKSI.simpanToko=async()=>{const r=await api('cfg.simpan',{key:'toko',value:{nama:$('#tk_nama').value,telp:$('#tk_telp').value,alamat:$('#tk_alamat').value,logo:$('#tk_logo').value,pecahan:ALLP.filter(p=>$('#tk_p'+p).checked)}});if(r){S.cfg.toko=r;S.pecahan=r.pecahan;navHtml();toast('Tersimpan','ok')}};
const SHOW=[['no','Nomor transaksi'],['tanggal','Tanggal & jam'],['kasir','Nama kasir'],['member','Nama/kode member'],['tipe','Tipe harga (grosir)'],['diskon_item','Diskon per item'],['diskon_bulat','Diskon pembulatan'],['infak','Infak'],['bayar','Nominal bayar & kembalian'],['pecahan','Rincian kembalian per pecahan'],['poin','Poin didapat/dipakai/saldo'],['qr','QR nomor transaksi (ESC/POS)']];
function readStruk(){const o={header:{nama:$('#sk_nama').value,alamat:$('#sk_alamat').value,telp:$('#sk_telp').value,logo:$('#sk_logo').checked,tambahan:$('#sk_tambahan').value},footer:$('#sk_footer').value,show:{},format:{align:$('#sk_align').value,bold_total:$('#sk_bold').checked,prefix:$('#sk_prefix').value||'TRX',digit:Number($('#sk_digit').value)||4,tgl:$('#sk_tgl').value}};SHOW.forEach(s=>{o.show[s[0]]=$('#sk_s_'+s[0]).checked});return o}
SET.struk=el=>{const st=S.cfg.struk,h=st.header;
  el.innerHTML=`<div class="two"><div class="card" data-live="1"><h3>Header</h3><div class="fgrid">${tx('sk_nama','Nama toko',h.nama)}${tx('sk_telp','Telepon / WA',h.telp)}</div>${tx('sk_alamat','Alamat',h.alamat)}${ck('sk_logo','Tampilkan logo',h.logo)}<div class="fg"><label class="lbl" for="sk_tambahan">Teks tambahan (slogan / NPWP)</label><textarea class="inp" id="sk_tambahan">${esc(h.tambahan)}</textarea></div>
  <h3 style="margin:8px 0">Footer</h3><div class="fg"><label class="lbl" for="sk_footer">Teks footer (beberapa baris)</label><textarea class="inp" id="sk_footer">${esc(st.footer)}</textarea></div>
  <h3 style="margin:8px 0">Elemen ditampilkan</h3><div class="fgrid">${SHOW.map(s=>ck('sk_s_'+s[0],s[1],st.show[s[0]])).join('')}</div>
  <h3 style="margin:8px 0">Format</h3><div class="fgrid">${sel('sk_align','Perataan header',st.format.align,[['tengah','Tengah'],['kiri','Kiri']])}${ck('sk_bold','Total tebal',st.format.bold_total)}${tx('sk_prefix','Awalan nomor',st.format.prefix)}${tx('sk_digit','Digit urutan',st.format.digit,'number')}${sel('sk_tgl','Format tanggal',st.format.tgl,[['dd/MM/yyyy HH:mm','31/12/2026 14:05'],['yyyy-MM-dd HH:mm','2026-12-31 14:05'],['dd/MM/yyyy','31/12/2026']])}</div>
  <div class="row gap"><button class="btn" data-a="simpanStruk">Simpan</button><button class="btn ghost" data-a="tesStruk">${ic('printer')} Tes cetak</button></div></div>
  <div class="card"><h3>Pratinjau langsung</h3><div id="skPrev"></div></div></div>`;
  S.live=()=>{const pc=printerCfg();$('#skPrev').innerHTML=strukHtml(strukLines(STRUK_CONTOH,pc,readStruk()),pc)};S.live();
};
AKSI.simpanStruk=async()=>{const r=await api('cfg.simpan',{key:'struk',value:readStruk()});if(r){S.cfg.struk=r;toast('Pengaturan struk tersimpan & dicatat di log','ok')}};
AKSI.tesStruk=()=>cetakStruk(STRUK_CONTOH,null,readStruk());
function readPrinter(){return{lebar:Number($('#pr_lebar').value),cutter:$('#pr_cutter').checked,potong:$('#pr_potong').value,metode:$('#pr_metode').value,salinan:Number($('#pr_salinan').value)||1,margin_atas:Number($('#pr_ma').value)||0,margin_bawah:Number($('#pr_mb').value)||0,logo:$('#pr_logo').checked,laci:$('#pr_laci').checked}}
SET.printer=el=>{const p=printerCfg(),adm=[SA,AD].indexOf(S.user.peran)>-1;
  el.innerHTML=`<div class="two"><div class="card" data-live="1"><h3>Printer thermal (perangkat ini)</h3><div class="fgrid">${sel('pr_lebar','Lebar kertas',p.lebar,[[58,'58 mm (32 karakter)'],[80,'80 mm (48 karakter)']])}${sel('pr_metode','Metode cetak',p.metode,[['browser','Dialog print browser'],['rawbt','ESC/POS langsung (RawBT)']])}${sel('pr_potong','Mode potong',p.potong,[['partial','Sebagian (partial)'],['full','Penuh (full)']])}${tx('pr_salinan','Jumlah salinan',p.salinan,'number')}${tx('pr_ma','Margin atas (baris)',p.margin_atas,'number')}${tx('pr_mb','Margin bawah (baris)',p.margin_bawah,'number')}</div>${ck('pr_cutter','Auto cutter aktif (hanya bila printer punya cutter)',p.cutter)}${ck('pr_logo','Cetak logo (mode browser)',p.logo)}${ck('pr_laci','Buka laci uang (bila didukung)',p.laci)}
  <p class="mu">Mode dialog browser: cutter mengikuti driver printer (“cut after print”). Mode RawBT: perintah potong dikirim otomatis.</p><div class="row wrap gap"><button class="btn" data-a="prSimpan">Simpan di perangkat ini</button><button class="btn ghost" data-a="prReset">Reset ke bawaan</button>${adm?`<button class="btn soft" data-a="prGlobal">Jadikan bawaan global</button>`:''}<button class="btn ghost" data-a="prTes">${ic('printer')} Tes cetak</button></div></div><div class="card"><h3>Pratinjau</h3><div id="prPrev"></div></div></div>`;
  S.live=()=>{const pc=readPrinter();$('#prPrev').innerHTML=strukHtml(strukLines(STRUK_CONTOH,pc),pc)};S.live();
};
AKSI.prSimpan=()=>{lsSet('pos_printer',JSON.stringify(readPrinter()));toast('Tersimpan di perangkat ini','ok')};
AKSI.prReset=()=>{try{localStorage.removeItem('pos_printer')}catch(e){}toast('Kembali ke bawaan');SET.printer($('#sBody'))};
AKSI.prGlobal=async()=>{const r=await api('cfg.simpan',{key:'printer',value:readPrinter()});if(r){S.cfg.printer=r;toast('Bawaan global diperbarui','ok')}};
AKSI.prTes=()=>cetakStruk(STRUK_CONTOH,readPrinter());
SET.poin=el=>{const p=S.cfg.poin;el.innerHTML=`<div class="card"><h3>Program poin</h3>${ck('po_aktif','Program poin aktif',p.aktif)}<div class="fgrid">${tx('po_rp','Rupiah per 1 poin',p.rupiah_per_poin,'number')}${sel('po_dasar','Dasar perhitungan',p.dasar,[['setelah','Total setelah diskon'],['sebelum','Total sebelum diskon']])}${tx('po_exp','Masa berlaku poin (hari, 0 = tanpa kedaluwarsa)',p.kedaluwarsa_hari,'number')}${tx('po_kas','Batas minimum stok per pecahan (lembar)',S.cfg.kas.min,'number')}</div><p class="mu">Produk tertentu dikecualikan dari poin lewat Master Produk (“Dikecualikan dari poin”).</p><button class="btn" data-a="simpanPoin">Simpan</button></div>`};
AKSI.simpanPoin=async()=>{const a=await api('cfg.simpan',{key:'poin',value:{aktif:$('#po_aktif').checked,rupiah_per_poin:Number($('#po_rp').value),dasar:$('#po_dasar').value,kedaluwarsa_hari:Number($('#po_exp').value)||0}});const b=await api('cfg.simpan',{key:'kas',value:{min:Number($('#po_kas').value)||0}});if(a&&b){S.cfg.poin=a;S.cfg.kas=b;toast('Tersimpan','ok')}};
SET.users=el=>crudView('Users',el);
SET.log=async el=>{const L=await api('log.list');if(!L)return;el.innerHTML=`<div class="card"><div class="tw"><table><thead><tr><th>Waktu</th><th>User</th><th>Aksi</th><th>Detail</th></tr></thead><tbody>${L.map(l=>`<tr><td>${esc(l.waktu)}</td><td>${esc(l.user)}</td><td><span class="badge ${/DITOLAK|GAGAL/.test(l.aksi)?'er':''}">${esc(l.aksi)}</span></td><td>${esc(l.detail)}</td></tr>`).join('')}</tbody></table></div></div>`};
SET.akun=el=>{el.innerHTML=`<div class="card"><h3>${esc(S.user.nama)}</h3><p class="mu">${esc(S.user.username)} · ${esc(S.user.peran)}</p><div class="fgrid">${tx('ak_lama','Password lama','','password')}${tx('ak_baru','Password baru (min. 6)','','password')}</div><button class="btn" data-a="gantiSandi">Ganti password</button></div><div class="card"><h3>Kecepatan koneksi</h3>${Perf.html()}</div>`};
AKSI.gantiSandi=async()=>{const r=await api('akun.sandi',{lama:$('#ak_lama').value,baru:$('#ak_baru').value});if(r){toast('Password diganti','ok');$('#ak_lama').value='';$('#ak_baru').value=''}};

/* ===== Mulai ===== */
document.body.insertAdjacentHTML('afterbegin',rupiahSprite());
addEventListener('offline',()=>{$('#offline').hidden=false});
addEventListener('online',()=>{$('#offline').hidden=true;toast('Kembali online','ok')});
if(!navigator.onLine)$('#offline').hidden=false;
(async()=>{
  try{fetch(GAS_URL+'?action=ping',{mode:'no-cors'}).catch(()=>{})}catch(e){}   // bangunkan GAS (cold start) selagi pengguna mengetik
  if(!(await pulihSesi())&&!$('#fLogin'))tampilLogin();
})();
