import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const config = window.APP_CONFIG || {};
const rawUrl = (config.supabaseUrl || '').trim();
const supabaseUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : rawUrl ? `https://${rawUrl}.supabase.co` : '';
const db = supabaseUrl && config.supabaseAnonKey ? createClient(supabaseUrl, config.supabaseAnonKey) : null;
const photonUrl = config.photonBaseUrl || 'https://photon.komoot.io/api/';
const $ = (selector, root = document) => root.querySelector(selector);
const nearParis = new Set(['92','93','94','77','78','91','95']);
const departmentNames = {'75':'Paris','92':'Hauts-de-Seine','93':'Seine-Saint-Denis','94':'Val-de-Marne','77':'Seine-et-Marne','78':'Yvelines','91':'Essonne','95':'Val-d’Oise'};
const demoPlaces = [
  {id:'demo-1',name:'La Verrière des Arts',address:'18 rue des Fossés Saint-Jacques, 75005 Paris',lat:48.8432,lng:2.3432,capacity:6,kind:'Café',days:['Mar','Jeu','Sam'],note:'Grande table au fond, prises à disposition. Consommation appréciée.',department:'75',area:'center',contact:''},
  {id:'demo-2',name:'Bibliothèque Buffon',address:'15 rue Buffon, 75005 Paris',lat:48.8439,lng:2.3594,capacity:8,kind:'Bibliothèque',days:['Lun','Mer','Ven'],note:'Espaces de travail en groupe au premier étage.',department:'75',area:'south',contact:''},
  {id:'demo-3',name:'Le Local Partagé',address:'7 rue de la Roquette, 75011 Paris',lat:48.8558,lng:2.3727,capacity:4,kind:'Salle associative',days:['Mer','Sam'],note:'Ambiance calme et solidaire. Bienvenue aux nouvelles têtes !',department:'75',area:'east',contact:''},
  {id:'demo-4',name:'Café des Écoles',address:'32 rue Monge, 75005 Paris',lat:48.8445,lng:2.3518,capacity:4,kind:'Café',days:['Mar','Jeu'],note:'Plutôt en après-midi, petite salle à l’étage.',department:'75',area:'center',contact:''},
  {id:'demo-5',name:'Maison des Étudiant·es',address:'12 rue de l’Abbaye, 75006 Paris',lat:48.8511,lng:2.3336,capacity:12,kind:'Salle associative',days:['Lun','Jeu','Ven'],note:'Salle lumineuse, tableau blanc et accès PMR.',department:'75',area:'south',contact:''},
  {id:'demo-6',name:'La Petite Fabrique',address:'45 rue du Faubourg Saint-Antoine, 75011 Paris',lat:48.8512,lng:2.3793,capacity:5,kind:'Café',days:['Mer','Sam','Dim'],note:'Tables partagées, accueil chaleureux.',department:'75',area:'east',contact:''}
];
const demoProfiles = [
  {id:'demo-profile-1',nickname:'Samira',age:21,gender:'F',study:'Licence de psychologie',area:'Paris 5e',department:'75',days:['Mar','Jeu','Sam'],subjects:{'Statistiques':3,'Neuropsychologie':2,'Méthodologie':4},groups:[],needs:'Petit groupe, pauses régulières.',contact:''},
  {id:'demo-profile-2',nickname:'Noé',age:23,gender:'Non renseigné',study:'L2 Histoire',area:'Paris 11e',department:'75',days:['Lun','Mer'],subjects:{'Histoire contemporaine':4,'Anglais':3},groups:['under-25'],needs:'',contact:''}
];

let places = [...demoPlaces], profiles = [...demoProfiles], markers = new Map();
let searchMarker = null, searchTimer = null, placeTimer = null, searchAbort = null, placeAbort = null;
const photonCache = new Map();
let selectedHostResult = null, currentUserId = null, ownProfile = null, editingProfileId = null, detailPlace = null, currentAttendances = [];
let demoAttendances = [];
let pendingHostAfterProfile = false, pendingAttendanceAfterProfile = false;
let cachedOwnProfileId = localStorage.getItem('revise-own-profile-id');
const map = L.map('map', {scrollWheelZoom:false}).setView([48.8525,2.354],13);
const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
tiles.on('tileerror', () => { $('#map-warning').hidden = false; });
const markerIcon = L.divIcon({className:'place-marker-wrap',html:'<span class="place-marker">⌂</span>',iconSize:[42,42],iconAnchor:[21,40]});
const hostDialog = $('#host-dialog'), profileDialog = $('#profile-dialog');
const defaultSubjects = ['Statistiques','Anglais','Méthodologie'];
function hasRecoverableProfileId() { return Boolean(cachedOwnProfileId&&!/^(?:demo-|local-)/.test(cachedOwnProfileId)); }

function toast(message) {
  const node = $('#toast'); node.textContent = message; node.classList.add('show');
  setTimeout(() => node.classList.remove('show'), 4200);
}
function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function openDialog(dialog) { dialog.showModal(); }
function daysText(days = []) { return days?.length ? days.join(' · ') : 'À confirmer'; }
function normalizedText(value = '') { return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }
function featureDepartment(properties = {}, fallback = '') {
  const bareCode=String(fallback).trim();
  if (departmentNames[bareCode]) return bareCode;
  const postcode = String(properties.postcode || fallback).match(/\b(75|77|78|91|92|93|94|95)\d{3}\b/);
  if (postcode) return postcode[1];
  const text = normalizedText([properties.department,properties.county,properties.state,properties.city,fallback].join(' '));
  for (const [code,name] of Object.entries(departmentNames)) if (text.includes(normalizedText(name))) return code;
  if (/\bparis\b/.test(text) || /\b(?:750\d\d|751\d\d)\b/.test(text)) return '75';
  if (/\b(?:5e|5eme|5er|75005)\b/.test(text)) return '75';
  return '';
}
function placeDepartment(place) {
  const explicit = String(place.department || '');
  if (departmentNames[explicit]) return explicit;
  return featureDepartment({}, place.address || '');
}
function photonAddress(properties = {}) {
  const street = [properties.housenumber,properties.street].filter(Boolean).join(' ');
  return [street,properties.postcode,properties.city,properties.county,properties.country].filter(Boolean).join(', ');
}
function featureData(feature) {
  const props = feature.properties || {};
  return {name:props.name || props.street || 'Lieu public',address:photonAddress(props),lat:Number(feature.geometry.coordinates[1]),lng:Number(feature.geometry.coordinates[0]),department:featureDepartment(props),osmId:props.osm_id,osmType:props.osm_type};
}
function visiblePlaces() {
  const q = normalizedText($('#search-input').value.trim()), scope = $('#area-select').value, department = $('#department-select').value;
  return places.filter(place => {
    const dept = placeDepartment(place);
    const scopeOk = scope === 'all' || (scope === '75' && dept === '75') || (scope === 'around' && nearParis.has(dept));
    const deptOk = scope !== 'around' || department === 'all' || dept === department;
    const textOk = !q || normalizedText(`${place.name} ${place.address} ${place.kind} ${place.note || ''}`).includes(q);
    return scopeOk && deptOk && textOk;
  });
}
function groupLabel(group) {
  return ({'chosen-non-mixity':'Non-mixité choisie','under-25':'Moins de 25 ans','international':'Étudiant·es internationaux·ales'}[group] || group);
}
function renderPlaces() {
  const list = $('#place-list'), shown = visiblePlaces();
  $('#map-count').textContent = `${shown.length} lieu${shown.length > 1 ? 'x' : ''}`;
  list.innerHTML = shown.length ? shown.map(place => `<button class="place-card" data-place="${escapeHtml(place.id)}"><span class="place-type-icon">${place.kind === 'Bibliothèque' ? '▤' : place.kind === 'Café' ? '☕' : '⌂'}</span><span class="place-card-copy"><b>${escapeHtml(place.name)}</b><small>${escapeHtml(place.address)}</small><span class="place-meta">👥 ${place.capacity} places <i>·</i> 📅 ${escapeHtml(daysText(place.days))}</span></span><span class="card-arrow">↗</span></button>`).join('') : '<div class="empty-state">Aucun lieu avec ces filtres. Essaie une autre zone ou propose le tien ✨</div>';
  for (const [id,marker] of markers) {
    if (shown.some(item => String(item.id) === id)) marker.addTo(map);
    else marker.remove();
  }
  list.querySelectorAll('[data-place]').forEach(button => button.addEventListener('click', () => showPlaceDetails(places.find(p => String(p.id) === button.dataset.place))));
}
function buildMarkers() {
  for (const marker of markers.values()) marker.remove(); markers.clear();
  places.filter(place => Number.isFinite(Number(place.lat)) && Number.isFinite(Number(place.lng))).forEach(place => {
    const marker = L.marker([Number(place.lat),Number(place.lng)],{icon:markerIcon}).addTo(map);
    marker.on('click', () => showPlaceDetails(place)); markers.set(String(place.id),marker);
  });
  if (markers.size > 1) map.fitBounds(L.featureGroup([...markers.values()]).getBounds().pad(.15));
  else if (markers.size === 1) map.setView(markers.values().next().value.getLatLng(),14);
  renderPlaces();
}
function syncOwnProfile() {
  ownProfile = profiles.find(profile => currentUserId && String(profile.owner_id) === String(currentUserId)) || (!db ? profiles.find(profile => String(profile.id) === cachedOwnProfileId) : null) || null;
  $('#open-own-profile').hidden = false;
  $('#open-own-profile').textContent = 'Ma fiche';
  $('#open-profile-top').textContent = ownProfile ? 'Modifier ma fiche' : hasRecoverableProfileId() ? 'Retrouver ma fiche ↗' : 'Créer mon profil ↗';
}
async function loadShared() {
  if (!db) { document.body.classList.add('demo-mode'); syncOwnProfile(); buildMarkers(); return; }
  try {
    const {data:{session}} = await db.auth.getSession();
    currentUserId = session?.user?.id || null;
    const placesResult = await db.from('places').select('*').eq('published',true).order('created_at',{ascending:false});
    if (placesResult.error) throw placesResult.error;
    places = placesResult.data.map(p => ({...p,days:p.days || [],department:placeDepartment(p)}));
    profiles = [];
    ownProfile = null;
    if (currentUserId) {
      const {data,error}=await db.from('profiles').select('*').eq('owner_id',currentUserId).limit(1).maybeSingle();
      if(error)throw error;
      if(data){profiles.push(data);ownProfile=data;localStorage.setItem('revise-own-profile-id',String(data.id));cachedOwnProfileId=String(data.id);}
    }
    syncOwnProfile(); buildMarkers(); document.body.classList.remove('demo-mode');
  } catch (error) {
    console.error(error); document.body.classList.add('demo-mode');
    syncOwnProfile(); buildMarkers();
    toast('Base partagée à mettre à jour : exécute le nouveau schema.sql dans Supabase.');
  }
}
async function ensureAnonymousUser() {
  if (!db) return null;
  const {data:{session}} = await db.auth.getSession();
  if (session?.user) { currentUserId = session.user.id; return currentUserId; }
  const {data,error} = await db.auth.signInAnonymously();
  if (error) throw error;
  currentUserId = data.user.id; return currentUserId;
}
async function refreshOwnProfile() {
  if(!db){syncOwnProfile();return ownProfile;}
  try {
    const owner=await ensureAnonymousUser();
    let {data,error}=await db.from('profiles').select('*').eq('owner_id',owner).limit(1).maybeSingle();
    if(error)throw error;
    if(!data&&hasRecoverableProfileId()){const result=await db.from('profiles').select('*').eq('id',cachedOwnProfileId).eq('owner_id',owner).maybeSingle();if(result.error)throw result.error;data=result.data;}
    if(data){ownProfile=data;cacheProfile(data);localStorage.setItem('revise-own-profile-id',String(data.id));cachedOwnProfileId=String(data.id);}
    syncOwnProfile();return ownProfile;
  } catch(error){console.error(error);toast('Je n’arrive pas à charger ta fiche. Vérifie la connexion et la migration Supabase.');return undefined;}
}
function showProfileRecoveryMessage() {
  toast('Une fiche existe déjà, mais sa session anonyme n’est pas reconnue. Ne la recrée pas : réutilise la session du navigateur qui l’a créée. Si ses données ont été effacées, cette session ne peut pas être récupérée automatiquement.');
}
async function openMyProfile() {
  const profile=ownProfile||await refreshOwnProfile();
  if(profile){showProfileDetails(profile);return;}
  if(profile===undefined)return;
  if(hasRecoverableProfileId()){showProfileRecoveryMessage();return;}
  toast('Aucune fiche n’est rattachée à la session active. Pour en créer une, utilise « Créer mon profil ».');
}
async function openProfileEditor() {
  const profile=ownProfile||await refreshOwnProfile();
  if(profile){fillProfileForm(profile);openDialog(profileDialog);return;}
  if(profile===undefined)return;
  if(hasRecoverableProfileId()){showProfileRecoveryMessage();return;}
  fillProfileForm(null);openDialog(profileDialog);
}

function renderAutocomplete(container,features,onChoose) {
  container.innerHTML = features.length ? features.map((feature,index) => {
    const item = featureData(feature), detail = item.address || feature.properties?.osm_value || 'Lieu public OpenStreetMap';
    return `<button type="button" class="autocomplete-option" role="option" data-result-index="${index}"><b>${escapeHtml(item.name)}</b><small>${escapeHtml(detail)}</small></button>`;
  }).join('') : '<div class="autocomplete-empty">Aucun lieu trouvé</div>';
  container.hidden = false;
  container.querySelectorAll('[data-result-index]').forEach(button => button.addEventListener('click',() => onChoose(features[Number(button.dataset.resultIndex)])));
}
async function photonSearch(query,signal) {
  const cacheKey=normalizedText(query);
  const cached=photonCache.get(cacheKey);
  if(cached && cached.expires>Date.now())return cached.features;
  const url = new URL(photonUrl);
  url.searchParams.set('q',query); url.searchParams.set('limit','6'); url.searchParams.set('lang','fr');
  url.searchParams.set('lat',String(map.getCenter().lat)); url.searchParams.set('lon',String(map.getCenter().lng));
  const response = await fetch(url,{signal,headers:{'Accept':'application/json'}});
  if (!response.ok) throw new Error(`Photon ${response.status}`);
  const features=(await response.json()).features || [];
  photonCache.set(cacheKey,{features,expires:Date.now()+60000});
  return features;
}
function attachAutocomplete(input,container,onChoose,kind) {
  input.addEventListener('input',() => {
    if (kind === 'place') selectedHostResult = null;
    clearTimeout(kind === 'main' ? searchTimer : placeTimer);
    if (kind === 'main') { renderPlaces(); if (searchAbort) searchAbort.abort(); }
    else if (placeAbort) placeAbort.abort();
    const query = input.value.trim();
    if (query.length < 3) { container.hidden = true; return; }
    const timer = setTimeout(async () => {
      const controller = new AbortController();
      if (kind === 'main') searchAbort = controller; else placeAbort = controller;
      try { renderAutocomplete(container,await photonSearch(query,controller.signal),onChoose); }
      catch (error) { if (error.name !== 'AbortError') { container.innerHTML = '<div class="autocomplete-empty">Recherche temporairement indisponible</div>'; container.hidden = false; } }
    },450);
    if (kind === 'main') searchTimer = timer; else placeTimer = timer;
  });
}
async function proposePublicPlace(feature) {
  const item = featureData(feature), form = $('#host-form');
  form.reset();
  selectedHostResult = item;
  form.elements.name.value = item.name;
  $('#place-address').value = item.address;
  form.elements.lat.value = item.lat; form.elements.lng.value = item.lng; form.elements.department.value = item.department;
  $('#place-suggestions').hidden = true;
  const profile=ownProfile||await refreshOwnProfile();
  if(profile===undefined)return;
  if(!profile){if(hasRecoverableProfileId()){showProfileRecoveryMessage();return;}pendingHostAfterProfile=true;toast('Crée ta fiche avant de proposer un lieu.');fillProfileForm(null);openDialog(profileDialog);return;}
  pendingHostAfterProfile=false;openDialog(hostDialog);
}
function showPublicResult(feature) {
  const item = featureData(feature);
  if (searchMarker) searchMarker.remove();
  searchMarker = L.marker([item.lat,item.lng],{icon:markerIcon}).addTo(map);
  const popup = `<b>${escapeHtml(item.name)}</b><br><small>${escapeHtml(item.address || 'Lieu public OpenStreetMap')}</small><br><button class="popup-propose" type="button">Proposer ce lieu pour réviser</button>`;
  searchMarker.bindPopup(popup).openPopup();
  searchMarker.once('popupopen',event => event.popup.getElement().querySelector('.popup-propose')?.addEventListener('click',() => proposePublicPlace(feature)));
  map.flyTo([item.lat,item.lng],16,{duration:.5});
  $('#search-suggestions').hidden = true; $('#search-input').value = item.name;
}
function setupSearch() {
  attachAutocomplete($('#search-input'),$('#search-suggestions'),showPublicResult,'main');
  attachAutocomplete($('#place-address'),$('#place-suggestions'),feature => {
    const item=featureData(feature); selectedHostResult=item;
    $('#host-form').elements.name.value=item.name; $('#place-address').value=item.address;
    $('#host-form').elements.lat.value=item.lat; $('#host-form').elements.lng.value=item.lng; $('#host-form').elements.department.value=item.department;
    $('#place-suggestions').hidden=true;
  },'place');
  document.addEventListener('click',event => {
    if (!event.target.closest('.autocomplete-wrap')) { $('#search-suggestions').hidden=true; $('#place-suggestions').hidden=true; }
  });
  $('#search-button').addEventListener('click',renderPlaces);
  $('#search-input').addEventListener('keydown',event => { if (event.key==='Enter') { event.preventDefault(); $('#search-suggestions').hidden=true; renderPlaces(); } });
  $('#area-select').addEventListener('change',() => { $('#department-filter').hidden=$('#area-select').value!=='around'; renderPlaces(); });
  $('#department-select').addEventListener('change',renderPlaces);
}

function showPlaceDetails(place) {
  if (!place) return;
  detailPlace=place;
  const detail=$('#place-detail-content');
  detail.innerHTML=`<div class="eyebrow">${escapeHtml(place.kind || 'LIEU DE RÉVISION')}</div><h2>${escapeHtml(place.name)}</h2><p class="detail-address">${escapeHtml(place.address)}</p><div class="detail-facts"><span>👥 ${Number(place.capacity)} places</span><span>📅 ${escapeHtml(daysText(place.days))}</span>${placeDepartment(place)?`<span>📍 ${escapeHtml(placeDepartment(place))} · ${escapeHtml(departmentNames[placeDepartment(place)])}</span>`:''}</div><div id="place-owner" class="place-owner"></div><p class="detail-note">${escapeHtml(place.note || 'Pas de précision renseignée.')}</p>${place.contact?`<button class="button button-outline detail-contact" type="button" data-copy="${escapeHtml(place.contact)}">Contacter le lieu · ${escapeHtml(place.contact)}</button>`:'<p class="field-help">Le lieu n’a pas renseigné de contact public.</p>'}<hr><h3>Signaler ta présence</h3><label class="date-label">Choisir une date<input id="attendance-date" type="date" min="${new Date().toISOString().slice(0,10)}" value="${new Date(Date.now()+86400000).toISOString().slice(0,10)}"></label><div id="attendance-summary" class="attendance-summary"></div><button id="attendance-action" class="button button-coral modal-submit" type="button">Je serai présent·e ce jour-là</button><p class="privacy-note">Les présences à cette date et les fiches des inscrit·es sont visibles aux personnes qui consultent ce lieu.</p>`;
  detail.querySelector('[data-copy]')?.addEventListener('click',event=>copyContact(event.currentTarget.dataset.copy));
  detail.querySelector('#attendance-date').addEventListener('change',renderAttendance);
  detail.querySelector('#attendance-action').addEventListener('click',toggleAttendance);
  openDialog($('#place-detail-dialog')); renderAttendance(); loadPlaceOwnerProfile(place);
}
function cacheProfile(profile) {
  if(!profile)return;
  const index=profiles.findIndex(item=>String(item.id)===String(profile.id));
  if(index<0)profiles.push(profile);else profiles[index]=profile;
}
async function loadPlaceOwnerProfile(place) {
  const slot=$('#place-owner');
  if(!place?.owner_id){slot.innerHTML='<p class="owner-profile-missing">La fiche de la personne qui a proposé ce lieu n’est pas reliée à cette entrée.</p>';return;}
  try {
    let profile;
    if(db){const {data,error}=await db.from('profiles').select('*').eq('owner_id',place.owner_id).maybeSingle();if(error)throw error;profile=data;}
    else profile=profiles.find(item=>item.owner_id===place.owner_id);
    if(!profile){slot.innerHTML='<p class="owner-profile-missing">Fiche de la personne qui a proposé ce lieu indisponible.</p>';return;}
    cacheProfile(profile);
    slot.innerHTML=`<button type="button" class="profile-context-link" data-owner-profile="${escapeHtml(profile.id)}"><span class="profile-context-avatar">${escapeHtml(profile.nickname.slice(0,1).toUpperCase())}</span><span><b>Voir la fiche de ${escapeHtml(profile.nickname)}</b><small>${Number(profile.age)||'Âge non renseigné'}${Number(profile.age)?' ans':''} · ${escapeHtml(profile.study||profile.area||'Étudiant·e')}</small></span><span>↗</span></button>`;
    slot.querySelector('[data-owner-profile]').addEventListener('click',()=>showProfileDetails(profile));
  } catch(error){console.error(error);slot.innerHTML='<p class="owner-profile-missing">Fiche non chargée. La migration Supabase doit être à jour.</p>';}
}
async function renderAttendance() {
  if (!detailPlace) return;
  const date=$('#attendance-date')?.value;if(!date)return;
  const summary=$('#attendance-summary'),action=$('#attendance-action');
  try {
    if (db && !String(detailPlace.id).startsWith('demo-')) {
      const {data,error}=await db.from('place_attendance').select('id,profile_id,meeting_date,owner_id').eq('place_id',detailPlace.id).eq('meeting_date',date);
      if(error)throw error; currentAttendances=data||[];
    } else currentAttendances=demoAttendances.filter(row=>String(row.place_id)===String(detailPlace.id)&&row.meeting_date===date);
    if(db&&currentAttendances.length){
      const ids=[...new Set(currentAttendances.map(row=>row.profile_id))];
      const {data,error}=await db.from('profiles').select('*').in('id',ids);if(error)throw error;(data||[]).forEach(cacheProfile);
    }
    const attendees=currentAttendances.map(row=>({row,profile:profiles.find(profile=>String(profile.id)===String(row.profile_id))}));
    const attending=currentAttendances.some(row=>ownProfile&&String(row.profile_id)===String(ownProfile.id));
    summary.innerHTML=`<b>${currentAttendances.length} / ${Number(detailPlace.capacity)} place${Number(detailPlace.capacity)>1?'s':''} réservée${Number(detailPlace.capacity)>1?'s':''}</b>${attendees.length?`<div class="attendee-links">${attendees.map(({row,profile})=>profile?`<button type="button" data-attendee-profile="${escapeHtml(profile.id)}">${escapeHtml(profile.nickname)}${Number(profile.age)?`, ${Number(profile.age)} ans`:''} ↗</button>`:'<span>Présence confirmée</span>').join('')}</div>`:'<small>Pas encore de présence signalée.</small>'}`;
    summary.querySelectorAll('[data-attendee-profile]').forEach(button=>button.addEventListener('click',()=>showProfileDetails(profiles.find(profile=>String(profile.id)===button.dataset.attendeeProfile))));
    const available=placeAvailableOn(date,detailPlace);
    action.textContent=attending?'Annuler ma présence':available?'Je serai présent·e ce jour-là':'Lieu non disponible ce jour-là'; action.dataset.attending=String(attending);
    action.disabled=!attending&&(!available||currentAttendances.length>=Number(detailPlace.capacity));
  } catch(error) { console.error(error); summary.textContent='Présences indisponibles : exécute la migration Supabase de schema.sql.'; action.disabled=true; }
}
function placeAvailableOn(date,place) {
  if(!date||!place?.days?.length)return false;
  const dayIndex=new Date(`${date}T12:00:00`).getDay(),days=['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  return place.days.includes(days[dayIndex]);
}
async function toggleAttendance() {
  if (!ownProfile) {
    const profile=await refreshOwnProfile();
    if(profile===undefined)return;
    if(!profile){if(hasRecoverableProfileId()){showProfileRecoveryMessage();return;}pendingAttendanceAfterProfile=true;toast('Crée ta fiche une seule fois ; ta présence sera enregistrée ensuite.');fillProfileForm(null);openDialog(profileDialog);return;}
  }
  const date=$('#attendance-date').value;
  const existing=currentAttendances.find(row=>String(row.profile_id)===String(ownProfile.id));
  if (!existing&&!placeAvailableOn(date,detailPlace)) { toast(detailPlace.days?.length?`Ce lieu indique plutôt : ${daysText(detailPlace.days)}.`:'Ce lieu n’a pas indiqué de jours disponibles.'); return; }
  try {
    if (db && !String(detailPlace.id).startsWith('demo-')) {
      const owner=await ensureAnonymousUser();
      if (existing) {
        const {error}=await db.from('place_attendance').delete().eq('id',existing.id);if(error)throw error;
      } else {
        const {error}=await db.from('place_attendance').insert({place_id:detailPlace.id,profile_id:ownProfile.id,meeting_date:date,owner_id:owner});if(error)throw error;
      }
    } else if(existing) demoAttendances=demoAttendances.filter(row=>row!==existing);
    else demoAttendances.push({id:`attendance-${Date.now()}`,place_id:detailPlace.id,profile_id:ownProfile.id,meeting_date:date});
    await renderAttendance();
  } catch(error) { console.error(error); toast('Impossible d’enregistrer : vérifie que la migration Supabase est appliquée.'); }
}
function showProfileDetails(profile) {
  if (!profile) return;
  const isOwn=Boolean(ownProfile && String(profile.id)===String(ownProfile.id));
  const subjects=Object.entries(profile.subjects||{}).map(([name,level])=>`<span>${escapeHtml(name)} · ${Number(level)}/5</span>`).join('');
  $('#profile-detail-content').innerHTML=`<div class="eyebrow">${isOwn?'MA FICHE':'FICHE ÉTUDIANT·E'}</div><h2>${escapeHtml(profile.nickname)}</h2><p class="detail-address">${Number(profile.age)||'Âge non renseigné'}${Number(profile.age)?' ans':''} · ${escapeHtml(profile.gender||'Non renseigné')} · ${escapeHtml(profile.study||'Formation non renseignée')}</p><div class="detail-facts"><span>📍 ${escapeHtml(profile.area||'Zone non renseignée')}</span><span>${escapeHtml(profile.department||'Département non renseigné')} · ${escapeHtml(departmentNames[profile.department]||'')}</span><span>📅 ${escapeHtml(daysText(profile.days))}</span></div><h3>Matières</h3><div class="detail-subjects">${subjects||'<span>Aucune matière renseignée</span>'}</div>${(profile.groups||[]).length?`<div class="profile-tags">${profile.groups.map(g=>`<i>${escapeHtml(groupLabel(g))}</i>`).join('')}</div>`:''}${profile.needs?`<p class="detail-note">${escapeHtml(profile.needs)}</p>`:''}${profile.contact?`<button class="button button-outline detail-contact" type="button" data-copy="${escapeHtml(profile.contact)}">Copier le contact · ${escapeHtml(profile.contact)}</button>`:''}${isOwn?'<div class="detail-actions"><button class="button button-outline" id="edit-own-profile">Modifier ma fiche</button><button class="text-button danger-text" id="delete-own-profile">Supprimer ma fiche</button></div>':''}`;
  $('#profile-detail-content').querySelector('[data-copy]')?.addEventListener('click',event=>copyContact(event.currentTarget.dataset.copy));
  $('#edit-own-profile')?.addEventListener('click',()=>{ $('#profile-detail-dialog').close(); fillProfileForm(ownProfile); openDialog(profileDialog); });
  $('#delete-own-profile')?.addEventListener('click',deleteOwnProfile);
  openDialog($('#profile-detail-dialog'));
}
function fillProfileForm(profile) {
  const form=$('#profile-form'); editingProfileId=profile?.id||null;
  form.reset();
  $('#profile-form-title').textContent=profile?'Modifier ma fiche':'Les révisions, à ta façon.';
  $('#profile-submit').innerHTML=profile?'Enregistrer ma fiche <span>→</span>':'Créer ma fiche <span>→</span>';
  for(const name of ['nickname','age','gender','study','department','area','needs','contact']) form.elements[name].value=profile?.[name]??'';
  form.querySelectorAll('[name="days"]').forEach(input=>input.checked=(profile?.days||[]).includes(input.value));
  form.querySelectorAll('[name="groups"]').forEach(input=>input.checked=(profile?.groups||[]).includes(input.value));
  $('#subject-fields').innerHTML='';
  const subjects=Object.entries(profile?.subjects||Object.fromEntries(defaultSubjects.map(name=>[name,3])));
  subjects.forEach(([name,level])=>addSubjectField(name,Number(level)));
}
function addSubjectField(name='',level=3) {
  const row=document.createElement('div');row.className='subject-input-row';
  const radioName=`level-${crypto.randomUUID()}`;
  row.innerHTML=`<input class="subject-name" maxlength="50" aria-label="Nom de la matière" value="${escapeHtml(name)}" placeholder="Matière"><div class="level-picker" role="group" aria-label="Niveau de maîtrise">${[1,2,3,4,5].map(n=>`<label title="${n}/5"><input type="radio" name="${radioName}" value="${n}" ${n===level?'checked':''}><span>${n}</span></label>`).join('')}</div><button type="button" class="remove-subject" aria-label="Retirer cette matière">×</button>`;
  row.querySelector('.remove-subject').addEventListener('click',()=>row.remove());$('#subject-fields').append(row);
}
async function copyContact(contact) { try { await navigator.clipboard.writeText(contact); toast('Contact copié.'); } catch { toast(`Contact : ${contact}`); } }

function wireDialogs() {
  ['#open-host-intro','#open-host-map','#open-host-panel'].forEach(selector=>$(selector).addEventListener('click',startHostProposal));
  $('#open-profile-top').addEventListener('click',openProfileEditor);
  $('#open-profile-main').addEventListener('click',openProfileEditor);
  $('#open-own-profile').addEventListener('click',openMyProfile);
  document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();}));
  $('#locate-button').addEventListener('click',()=>{
    if(!navigator.geolocation){toast('La géolocalisation n’est pas disponible.');return;}
    navigator.geolocation.getCurrentPosition(position=>{map.flyTo([position.coords.latitude,position.coords.longitude],13);L.circleMarker([position.coords.latitude,position.coords.longitude],{radius:8,color:'#fff',weight:3,fillColor:'#76a88b',fillOpacity:1}).addTo(map).bindPopup('Ta position').openPopup();},()=>toast('Position non partagée. Tu peux explorer la carte manuellement.'),{timeout:8000});
  });
}
async function startHostProposal() {
  selectedHostResult=null;$('#host-form').reset();
  const profile=ownProfile||await refreshOwnProfile();
  if(profile===undefined)return;
  if(!profile){if(hasRecoverableProfileId()){showProfileRecoveryMessage();return;}pendingHostAfterProfile=true;toast('Crée ta fiche une seule fois avant de proposer un lieu.');fillProfileForm(null);openDialog(profileDialog);return;}
  pendingHostAfterProfile=false;openDialog(hostDialog);
}

$('#host-form').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget,fd=new FormData(form),address=String(fd.get('address')).trim();
  if(!ownProfile){hostDialog.close();startHostProposal();return;}
  if(!fd.getAll('days').length){toast('Indique au moins un jour de disponibilité.');return;}
  const item=selectedHostResult;
  if(!item || item.address!==address){toast('Choisis un lieu ou une adresse dans les suggestions pour placer le repère.');$('#place-address').focus();return;}
  if(!item){toast('Lieu introuvable. Ajoute un nom de rue, la ville et le code postal.');return;}
  const place={name:String(fd.get('name')).trim()||item.name,address:item.address||address,lat:item.lat,lng:item.lng,department:item.department||String(fd.get('department')||''),capacity:Number(fd.get('capacity')),kind:String(fd.get('kind')),days:fd.getAll('days'),note:String(fd.get('note')).trim(),contact:String(fd.get('contact')).trim(),published:true,area:item.department==='75'?'center':''};
  try {
    if(db){place.owner_id=await ensureAnonymousUser();const {data,error}=await db.from('places').insert(place).select('*').single();if(error)throw error;Object.assign(place,data);}
    else place.id=`demo-place-${Date.now()}`;
    places.unshift(place);buildMarkers();hostDialog.close();form.reset();selectedHostResult=null;map.flyTo([place.lat,place.lng],15);toast(db?'Lieu publié.':'Lieu ajouté en mode démo, non partagé.');
  } catch(error){console.error(error);toast(db?'Publication refusée. Vérifie que la migration Supabase est appliquée.':'Impossible d’ajouter ce lieu.');}
});

$('#profile-form').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget,fd=new FormData(form),subjects={};
  $('#subject-fields').querySelectorAll('.subject-input-row').forEach(row=>{const name=row.querySelector('.subject-name').value.trim(),level=Number(row.querySelector('input:checked')?.value||3);if(name)subjects[name]=level;});
  const profile={nickname:String(fd.get('nickname')).trim(),age:Number(fd.get('age')),gender:String(fd.get('gender')),study:String(fd.get('study')).trim(),department:String(fd.get('department')),area:String(fd.get('area')).trim(),days:fd.getAll('days'),subjects,groups:fd.getAll('groups'),needs:String(fd.get('needs')).trim(),contact:String(fd.get('contact')).trim(),published:true};
  try {
    if(db){profile.owner_id=await ensureAnonymousUser();let result;if(editingProfileId)result=await db.from('profiles').update(profile).eq('id',editingProfileId).select('*').single();else result=await db.from('profiles').insert(profile).select('*').single();if(result.error)throw result.error;Object.assign(profile,result.data);}
    else profile.id=editingProfileId||`demo-profile-${Date.now()}`;
    if(editingProfileId)profiles=profiles.map(item=>String(item.id)===String(profile.id)?profile:item);else profiles.unshift(profile);
    localStorage.setItem('revise-own-profile-id',String(profile.id));cachedOwnProfileId=String(profile.id);ownProfile=profile;currentUserId=profile.owner_id||currentUserId;syncOwnProfile();renderPlaces();profileDialog.close();editingProfileId=null;toast(db?'Fiche enregistrée.':'Fiche ajoutée en mode démo, non partagée.');
    if(pendingHostAfterProfile){pendingHostAfterProfile=false;openDialog(hostDialog);return;}
    if(pendingAttendanceAfterProfile){pendingAttendanceAfterProfile=false;await toggleAttendance();return;}
    showProfileDetails(ownProfile);
  } catch(error){console.error(error);toast(db?'Impossible d’enregistrer ta fiche. Active la connexion anonyme et exécute la migration Supabase.':'Impossible d’enregistrer la fiche.');}
});
$('#custom-subject').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();const value=event.target.value.trim();if(value){addSubjectField(value);event.target.value='';}}});

async function deleteOwnProfile() {
  if(!ownProfile||!confirm('Supprimer définitivement ta fiche et tes présences ?'))return;
  try {
    if(db){const {error}=await db.from('profiles').delete().eq('id',ownProfile.id);if(error)throw error;}
    profiles=profiles.filter(profile=>String(profile.id)!==String(ownProfile.id));demoAttendances=demoAttendances.filter(row=>String(row.profile_id)!==String(ownProfile.id));
    localStorage.removeItem('revise-own-profile-id');cachedOwnProfileId=null;ownProfile=null;syncOwnProfile();renderPlaces();$('#profile-detail-dialog').close();
    if(detailPlace)await renderAttendance();toast('Ta fiche a été supprimée.');
  } catch(error){console.error(error);toast('Suppression impossible. Vérifie la migration Supabase.');}
}

wireDialogs();setupSearch();defaultSubjects.forEach(subject=>addSubjectField(subject,3));
$('#area-select').addEventListener('change',()=>{$('#department-filter').hidden=$('#area-select').value!=='around';renderPlaces();});
loadShared();
