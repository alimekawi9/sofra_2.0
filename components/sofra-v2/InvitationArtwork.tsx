'use client'

import Image from 'next/image'
import {ChangeEvent,useEffect,useState} from 'react'
import {readPreviewInvitation,writePreviewInvitation} from './invitation-preview-state'
import {DEFAULT_EVENT_IMAGE_PATH} from '@/lib/event-images'

export function InvitationArtwork({className='',editable=false}:{className?:string;editable?:boolean}){
  const[image,setImage]=useState<string>()
  useEffect(()=>setImage(readPreviewInvitation().imageDataUrl),[])
  function chooseImage(event:ChangeEvent<HTMLInputElement>){const file=event.target.files?.[0];if(!file||!file.type.startsWith('image/')||file.size>5*1024*1024)return;const reader=new FileReader();reader.onload=()=>{const imageDataUrl=String(reader.result);writePreviewInvitation({...readPreviewInvitation(),imageDataUrl,imageName:file.name});setImage(imageDataUrl)};reader.readAsDataURL(file)}
  function removeImage(){const current=readPreviewInvitation();writePreviewInvitation({...current,imageDataUrl:undefined,imageName:undefined});setImage(undefined)}
  return <div className={`sv2-invitation-artwork-wrap ${className}`.trim()}>{image?<div className="sv2-invitation-artwork sv2-invitation-photo"><img src={image} alt="Host-selected invitation inspiration"/></div>:<div className="sv2-invitation-artwork sv2-invitation-photo sv2-event-default-cover" aria-hidden="true"><Image src={DEFAULT_EVENT_IMAGE_PATH} alt="" width={1125} height={1401}/></div>}{editable&&<div className="sv2-artwork-controls"><label>CHANGE IMAGE<input aria-label="Change event header image" type="file" accept="image/*" onChange={chooseImage}/></label>{image&&<button type="button" onClick={removeImage}>REMOVE IMAGE</button>}</div>}</div>
}
