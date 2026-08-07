'use client'
import Image from 'next/image'
import {useEffect,useState} from 'react'
import {readPreviewInvitation} from './invitation-preview-state'
export function InvitationArtwork({className=''}:{className?:string}){const[image,setImage]=useState<string>();useEffect(()=>setImage(readPreviewInvitation().imageDataUrl),[]);return image?<div className={`sv2-invitation-artwork sv2-invitation-photo ${className}`.trim()}><img src={image} alt="Host-selected invitation inspiration"/></div>:<div className={`sv2-invitation-artwork sv2-invitation-motif ${className}`.trim()} aria-hidden="true"><Image src="/design-preview/arabesque-ornament.png" alt="" width={1254} height={1254}/></div>}
