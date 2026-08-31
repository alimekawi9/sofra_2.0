'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { QuestionnaireEditor } from '@/components/sofra-v2/QuestionnaireEditor'
import { DEFAULT_QUESTIONNAIRE, validateQuestionnaire, removedQuestionIds, type QuestionnaireConfig } from '@/lib/questionnaire'
import '@/components/sofra-v2/sofra-v2.css'
import { isEventManager } from '@/lib/event-access'

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

      if (!(await isEventManager(supabase, params.id, stored, ev.host_id))) {
        router.replace('/events/' + params.id)
        return
      }

      setEventTitle(ev.title ?? '')

      const { data: questionnaireRow } = await supabase
        .from('event_questionnaires')
        .select('config')
        .eq('event_id', params.id)
        .maybeSingle()

      if (questionnaireRow?.config?.questions) {
        setConfig(questionnaireRow.config as QuestionnaireConfig)
      }

      setLoading(false)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Best-effort: a question removed (or converted to a fresh id) from the
  // questionnaire leaves its old event_question_responses rows orphaned --
  // nothing in the config points to them anymore. Cleanup failure shouldn't
  // block the save/reset itself, just gets logged.
  async function cleanupRemovedQuestionResponses(oldConfig: QuestionnaireConfig | undefined, newConfig: QuestionnaireConfig) {
    if (!oldConfig?.questions) return
    const removedIds = removedQuestionIds(oldConfig, newConfig)
    if (removedIds.length === 0) return
    const { error } = await supabase
      .from('event_question_responses')
      .delete()
      .eq('event_id', params.id)
      .in('question_id', removedIds)
    if (error) console.error('Could not clean up orphaned questionnaire responses', error)
  }

  async function handleSave() {
    if (saving) return
    const errors = validateQuestionnaire(config)
    setValidationErrors(errors)
    if (errors.length > 0) return

    setSaving(true)
    setSaveError('')

    const { data: existingRow } = await supabase
      .from('event_questionnaires')
      .select('config')
      .eq('event_id', params.id)
      .maybeSingle()

    const { error: upsertError } = await supabase.from('event_questionnaires').upsert(
      { event_id: params.id, config, updated_at: new Date().toISOString() },
      { onConflict: 'event_id' }
    )

    if (upsertError) {
      setSaving(false)
      setSaveError('Could not save the questionnaire. Try again.')
      return
    }

    await cleanupRemovedQuestionResponses(existingRow?.config as QuestionnaireConfig | undefined, config)

    setSaving(false)
    const search = new URLSearchParams(window.location.search)
    if (search.get('onboarding') === '1') {
      const kitchenPlan = search.get('kitchenPlan')
      if (kitchenPlan === 'chef') router.push(`/events/${params.id}/table?kitchenShare=1`)
      else if (kitchenPlan === 'now') router.push(`/events/${params.id}/kitchen-setup`)
      else router.push(`/events/${params.id}`)
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

    if (deleteError) {
      setResetting(false)
      setSaveError('Could not reset the questionnaire. Try again.')
      return
    }

    await cleanupRemovedQuestionResponses(config, DEFAULT_QUESTIONNAIRE)

    setResetting(false)
    setConfig(DEFAULT_QUESTIONNAIRE)
    setValidationErrors([])
  }

  return (
    <QuestionnaireEditor
      loading={loading}
      loadError={loadError}
      backHref={typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('onboarding') === '1' ? '/events/' + params.id : '/host/' + params.id + '/edit'}
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
