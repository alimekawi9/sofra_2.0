'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { QuestionnaireEditor } from '@/components/sofra-v2/QuestionnaireEditor'
import { DEFAULT_QUESTIONNAIRE, validateQuestionnaire, type QuestionnaireConfig } from '@/lib/questionnaire'
import '@/components/sofra-v2/sofra-v2.css'

export default function HostQuestionnairePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const supabase = createClient()
  const uidRef = useRef<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [eventTitle, setEventTitle] = useState('')
  const [config, setConfig] = useState<QuestionnaireConfig>(DEFAULT_QUESTIONNAIRE)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    async function load() {
      const stored = localStorage.getItem('sofra_user_id')
      if (!stored) { router.push('/login'); return }
      uidRef.current = stored

      const { data: ev, error: fetchError } = await supabase
        .from('events')
        .select('host_id,title')
        .eq('id', params.id)
        .single()

      if (fetchError || !ev) {
        setLoadError("Couldn't load this event. Try again.")
        setLoading(false)
        return
      }

      if (ev.host_id !== stored) {
        router.replace('/events/' + params.id)
        return
      }

      setEventTitle(ev.title ?? '')

      const { data: questionnaireRow } = await supabase
        .from('event_questionnaires')
        .select('config')
        .eq('event_id', params.id)
        .maybeSingle()

      if (questionnaireRow?.config?.questions?.length) {
        setConfig(questionnaireRow.config as QuestionnaireConfig)
      }

      setLoading(false)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (saving) return
    const errors = validateQuestionnaire(config)
    setValidationErrors(errors)
    if (errors.length > 0) return

    setSaving(true)
    setSaveError('')

    const { error: upsertError } = await supabase.from('event_questionnaires').upsert(
      { event_id: params.id, config, updated_at: new Date().toISOString() },
      { onConflict: 'event_id' }
    )

    setSaving(false)
    if (upsertError) {
      setSaveError('Could not save the questionnaire. Try again.')
      return
    }

    router.push('/host/' + params.id + '/edit')
  }

  async function handleReset() {
    if (resetting) return
    const confirmed = window.confirm('Reset this event’s questionnaire to the Sofra defaults? Any customization will be lost.')
    if (!confirmed) return

    setResetting(true)
    setSaveError('')

    const { error: deleteError } = await supabase
      .from('event_questionnaires')
      .delete()
      .eq('event_id', params.id)

    setResetting(false)
    if (deleteError) {
      setSaveError('Could not reset the questionnaire. Try again.')
      return
    }

    setConfig(DEFAULT_QUESTIONNAIRE)
    setValidationErrors([])
  }

  return (
    <QuestionnaireEditor
      loading={loading}
      loadError={loadError}
      backHref={'/host/' + params.id + '/edit'}
      eventTitle={eventTitle}
      config={config}
      onChange={setConfig}
      onSave={handleSave}
      saving={saving}
      saveError={saveError}
      validationErrors={validationErrors}
      onReset={handleReset}
      resetting={resetting}
    />
  )
}
