export const PREVIEW_INVITATION_KEY = 'sofra-preview-invitation'
export type PreviewInvitationTheme = 'arabesque' | 'pomegranate' | 'summer-tile'
export interface PreviewInvitationState { title?: string; dateTime?: string; location?: string; placeId?: string; latitude?: number; longitude?: number; venueName?: string; theme: PreviewInvitationTheme; imageDataUrl?: string; imageName?: string }
export const DEFAULT_PREVIEW_INVITATION: PreviewInvitationState = { theme: 'arabesque' }
export function readPreviewInvitation(): PreviewInvitationState { if(typeof window==='undefined')return DEFAULT_PREVIEW_INVITATION;try{return{...DEFAULT_PREVIEW_INVITATION,...JSON.parse(sessionStorage.getItem(PREVIEW_INVITATION_KEY)??'{}')}}catch{return DEFAULT_PREVIEW_INVITATION} }
export function writePreviewInvitation(state: PreviewInvitationState){sessionStorage.setItem(PREVIEW_INVITATION_KEY,JSON.stringify(state));updatePreviewSession({role:'host',activeSofra:'laylas-sofra'})}
import {updatePreviewSession} from './preview-session'
