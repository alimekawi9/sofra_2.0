export const PREVIEW_SESSION_KEY='sofra-connected-preview-session'
export type PreviewRole='guest'|'host'|null
export interface PreviewInventoryItem{name:string;tags:string[]}
export interface PreviewSession{phone:string;name:string;role:PreviewRole;rsvpStatus:'going'|'tentative'|'declined'|null;preferencesSubmitted:boolean;inventoryUpdated:boolean;activeSofra:string;profilePhoto?:string;sharedAlbumPhotos:string[];signatureInventory:PreviewInventoryItem[];pantryInventory:PreviewInventoryItem[]}
export const EMPTY_PREVIEW_SESSION:PreviewSession={phone:'',name:'',role:null,rsvpStatus:null,preferencesSubmitted:false,inventoryUpdated:false,activeSofra:'laylas-sofra',sharedAlbumPhotos:[],signatureInventory:[],pantryInventory:[]}
export function readPreviewSession():PreviewSession{if(typeof window==='undefined')return EMPTY_PREVIEW_SESSION;try{return{...EMPTY_PREVIEW_SESSION,...JSON.parse(localStorage.getItem(PREVIEW_SESSION_KEY)??'{}')}}catch{return EMPTY_PREVIEW_SESSION}}
export function updatePreviewSession(update:Partial<PreviewSession>){const next={...readPreviewSession(),...update};localStorage.setItem(PREVIEW_SESSION_KEY,JSON.stringify(next));return next}
export function resetPreviewSession(){localStorage.removeItem(PREVIEW_SESSION_KEY);sessionStorage.removeItem('sofra-preview-rsvp');sessionStorage.removeItem('sofra-preview-invitation')}
