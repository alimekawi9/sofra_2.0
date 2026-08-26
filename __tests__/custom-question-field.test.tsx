import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CustomQuestionField } from '@/components/sofra-v2/CustomQuestionField'
import { PreferencesReceipt } from '@/components/sofra-v2/PreferencesReceipt'

it('emits the complete ordered option list when a guest changes a ranking', async () => {
  const onChange = jest.fn()
  render(<CustomQuestionField question={{ id: 'rank', kind: 'custom', type: 'ranking', title: 'Rank these', order: 0, options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }] }} onChange={onChange} value={undefined} />)

  await userEvent.click(screen.getByRole('button', { name: 'Move B up' }))
  expect(onChange).toHaveBeenCalledWith(['b', 'a', 'c'])
})

it('keeps a ranking question at question number one ahead of canonical questions', () => {
  render(<PreferencesReceipt dietary={[]} onToggleDietary={() => {}} avoid={[]} onToggleAvoid={() => {}} proteinPreferences={[]} onToggleProtein={() => {}} proteinHintVisible={false} flavors={[]} onToggleFlavor={() => {}} flavorHintVisible={false} adventurousness={50} onAdventurousnessChange={() => {}} onSave={() => {}} questionOrders={{ dietary: 1 }} visibleCanonicalQuestions={['dietary']} extraContent={<div style={{ order: 0 }}><h3>RANK THE DATES</h3></div>} />)
  const ranking = screen.getByRole('heading', { name: 'RANK THE DATES' })
  const dietary = screen.getByRole('heading', { name: 'ANY LANE TO STAY IN?' })
  expect(getComputedStyle(ranking.parentElement!).order).toBe('0')
  expect(getComputedStyle(dietary.parentElement!).order).toBe('1')
})

it('lets a long choice use the full question width', () => {
  const longLabel = "No, I don't want this once in a lifetime moment to be enhanced or drunk."
  render(<CustomQuestionField question={{ id: 'choice', kind: 'custom', type: 'single', title: 'Choose', order: 0, options: [{ value: 'long', label: longLabel }] }} onChange={() => {}} value={undefined} />)
  expect(screen.getByText(longLabel).closest('label')).toHaveClass('sv2-checkbox-row-wide')
})

it('updates a custom survey slider continuously while it is dragged', () => {
  const onChange = jest.fn()
  render(<CustomQuestionField question={{ id: 'slider', kind: 'custom', type: 'slider', title: 'How much?', order: 0, sliderMinLabel: 'A little', sliderMaxLabel: 'A lot', sliderSteps: 5 }} onChange={onChange} value={3} />)

  fireEvent.input(screen.getByRole('slider', { name: 'How much?' }), { target: { value: '5' } })
  expect(onChange).toHaveBeenCalledWith(5)
})

it('updates the canonical adventurousness slider continuously while it is dragged', () => {
  const onAdventurousnessChange = jest.fn()
  render(<PreferencesReceipt dietary={[]} onToggleDietary={() => {}} avoid={[]} onToggleAvoid={() => {}} proteinPreferences={[]} onToggleProtein={() => {}} proteinHintVisible={false} flavors={[]} onToggleFlavor={() => {}} flavorHintVisible={false} adventurousness={50} onAdventurousnessChange={onAdventurousnessChange} onSave={() => {}} visibleCanonicalQuestions={['adventurousness']} />)

  fireEvent.input(screen.getByRole('slider', { name: 'Adventurousness' }), { target: { value: '82' } })
  expect(onAdventurousnessChange).toHaveBeenCalledWith(82)
})
