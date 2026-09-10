import assert from 'node:assert/strict'
import fc from 'fast-check'
import { StateMachine } from '@platform/workflow/index.js'
import { test } from 'vitest'

type State = 'DRAFT' | 'SUBMITTED' | 'CLOSED' | 'VOID'
type Event = 'SUBMIT' | 'CLOSE' | 'VOID'

const transitions = [
  { from: 'DRAFT', event: 'SUBMIT', to: 'SUBMITTED' },
  { from: 'DRAFT', event: 'VOID', to: 'VOID' },
  { from: 'SUBMITTED', event: 'CLOSE', to: 'CLOSED' },
  { from: 'SUBMITTED', event: 'VOID', to: 'VOID' },
] as const

test('terminal workflow states cannot transition', () => {
  fc.assert(
    fc.property(
      fc.array(fc.constantFrom<Event>('SUBMIT', 'CLOSE', 'VOID'), { minLength: 1, maxLength: 20 }),
      (events) => {
        let machine = new StateMachine<State, Event>('DRAFT', transitions, ['CLOSED', 'VOID'])

        for (const event of events) {
          const result = machine.transition(event)
          if (result.isOk) {
            machine = result.value
          }
        }

        if (machine.isTerminal) {
          for (const event of ['SUBMIT', 'CLOSE', 'VOID'] as const) {
            assert.equal(machine.transition(event).isErr, true)
          }
        }
      }
    ),
    { numRuns: 1000 }
  )
})

test('state transitions return a new machine', () => {
  const machine = new StateMachine<State, Event>('DRAFT', transitions, ['CLOSED', 'VOID'])
  const result = machine.transition('SUBMIT')

  assert.equal(result.isOk, true)
  if (result.isOk) {
    assert.equal(machine.state, 'DRAFT')
    assert.equal(result.value.state, 'SUBMITTED')
    assert.notEqual(result.value, machine)
  }
})
