'use client'

import {ChangeEvent,DragEvent,useState} from 'react'
import {useRouter} from 'next/navigation'
import {HostLocationAutocomplete,PreviewPlace} from './HostLocationAutocomplete'
import {sv2Display,sv2Sans} from './fonts'
import {DEFAULT_PREVIEW_INVITATION,PreviewInvitationTheme,readPreviewInvitation,writePreviewInvitation} from './invitation-preview-state'
import {PreviewBottomNav} from './PreviewBottomNav'

const THEMES:ReadonlyArray<{value:PreviewInvitationTheme;label:string}>=[
  {value:'arabesque',label:'Golden arabesque'},
  {value:'pomegranate',label:'Pomegranate evening'},
  {value:'summer-tile',label:'Summer tile'},
]

export function HostPreview({editMode=false}:{editMode?:boolean}){
  const router=useRouter()
  const existing=editMode?readPreviewInvitation():DEFAULT_PREVIEW_INVITATION
  const[title,setTitle]=useState(existing.title??'')
  const[dateTime,setDateTime]=useState(existing.dateTime??'')
  const[location,setLocation]=useState(existing.location??'')
  const[dressCode,setDressCode]=useState(existing.dressCode??'')
  const[place,setPlace]=useState<PreviewPlace|null>(existing.placeId?{placeId:existing.placeId,latitude:existing.latitude,longitude:existing.longitude,venueName:existing.venueName,displayName:existing.venueName??existing.location??'',formattedAddress:existing.location??''}:null)
  const[theme,setTheme]=useState<PreviewInvitationTheme>(existing.theme)
  const[imageDataUrl,setImageDataUrl]=useState(existing.imageDataUrl)
  const[imageName,setImageName]=useState(existing.imageName)
  const[imageError,setImageError]=useState('')
  const[formError,setFormError]=useState('')

  function chooseImage(file?:File){
    if(!file)return
    if(!file.type.startsWith('image/')){setImageError('Choose an image file.');return}
    if(file.size>5*1024*1024){setImageError('Choose an image smaller than 5 MB.');return}
    const reader=new FileReader()
    reader.onload=()=>{setImageDataUrl(String(reader.result));setImageName(file.name);setImageError('')}
    reader.onerror=()=>setImageError('That image could not be previewed.')
    reader.readAsDataURL(file)
  }

  function save(){
    if(!title.trim()||!dateTime||!location.trim()){
      setFormError('Add an event name, date and time, and location before publishing.')
      return
    }
    writePreviewInvitation({title:title.trim(),dateTime,location:location.trim(),dressCode:dressCode.trim(),placeId:place?.placeId,latitude:place?.latitude,longitude:place?.longitude,venueName:place?.venueName,theme,imageDataUrl,imageName})
    router.push('/design-preview/events/demo?role=host')
  }

  return <div className={`sv2-root sv2-device-page sv2-app-page ${sv2Display.variable} ${sv2Sans.variable}`}>
    <main className="sv2-device-shell sv2-app-shell sv2-host-shell">
      <p className="sv2-event-kicker">{editMode?'EDIT YOUR GATHERING':'HOST A GATHERING'}</p>
      <h1>{editMode?'Edit your Sofra':'Create a Sofra'}</h1>
      <form noValidate onSubmit={event=>{event.preventDefault();save()}}>
        <label>Event name<input name="eventName" required value={title} onChange={event=>setTitle(event.target.value)} placeholder="Friday at Layla's"/></label>
        <label>Date and time<input name="dateTime" required value={dateTime} onChange={event=>setDateTime(event.target.value)} type="datetime-local"/></label>
        <label>Location<HostLocationAutocomplete value={location} onChange={setLocation} onPlaceSelect={setPlace}/></label>
        {place&&<input type="hidden" name="placeData" value={JSON.stringify(place)}/>}
        <label>Dress code<input name="dressCode" value={dressCode} onChange={event=>setDressCode(event.target.value)} placeholder="A touch of red"/></label>
        <fieldset className="sv2-invitation-image-field">
          <legend>INVITATION IMAGE <span>OPTIONAL</span></legend>
          {imageDataUrl?<div className="sv2-upload-preview"><img src={imageDataUrl} alt="Selected invitation inspiration preview"/><div><label className="sv2-upload-replace">REPLACE<input type="file" accept="image/*" onChange={(event:ChangeEvent<HTMLInputElement>)=>chooseImage(event.target.files?.[0])}/></label><button type="button" onClick={()=>{setImageDataUrl(undefined);setImageName(undefined)}}>REMOVE</button></div></div>:<label className="sv2-upload-drop" onDragOver={event=>event.preventDefault()} onDrop={(event:DragEvent<HTMLLabelElement>)=>{event.preventDefault();chooseImage(event.dataTransfer.files?.[0])}}><span>＋</span><strong>Choose an inspiration image</strong><small>or drop one here · image files up to 5 MB</small><input aria-label="Choose invitation image" type="file" accept="image/*" onChange={(event:ChangeEvent<HTMLInputElement>)=>chooseImage(event.target.files?.[0])}/></label>}
          {imageError&&<p role="alert">{imageError}</p>}
        </fieldset>
        <fieldset className="sv2-theme-picker"><legend>INVITATION THEME</legend><div>{THEMES.map(option=><label key={option.value} className={`sv2-theme-card sv2-theme-card-${option.value}`}><input type="radio" name="theme" value={option.value} checked={theme===option.value} onChange={()=>setTheme(option.value)}/><span aria-hidden="true"/><strong>{option.label}</strong></label>)}</div></fieldset>
        {formError&&<p className="sv2-host-form-error" role="alert">{formError}</p>}
        <button type="submit">{editMode?'UPDATE INVITE':'PUBLISH INVITE'}</button>
      </form>
      <PreviewBottomNav current="host"/>
    </main>
  </div>
}
