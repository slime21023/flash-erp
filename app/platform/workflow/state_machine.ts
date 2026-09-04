import { DomainError, err, ok } from '#platform/fp/index'
import type { Result } from '#platform/fp/index'

export type Transition<State extends string, Event extends string> = Readonly<{
  from: State
  event: Event
  to: State
}>

export class InvalidTransitionError<
  State extends string,
  Event extends string,
> extends DomainError {
  readonly code = 'INVALID_STATE_TRANSITION'

  constructor(
    readonly state: State,
    readonly event: Event
  ) {
    super(`Cannot apply ${event} while the workflow is in ${state}`)
  }
}

export class StateMachine<State extends string, Event extends string> {
  readonly #state: State
  readonly #transitions: readonly Transition<State, Event>[]
  readonly #terminalStates: readonly State[]

  constructor(
    state: State,
    transitions: readonly Transition<State, Event>[],
    terminalStates: readonly State[] = []
  ) {
    this.#state = state
    this.#transitions = Object.freeze([...transitions])
    this.#terminalStates = Object.freeze([...terminalStates])
    Object.freeze(this)
  }

  get state(): State {
    return this.#state
  }

  get isTerminal(): boolean {
    return this.#terminalStates.includes(this.#state)
  }

  canTransition(event: Event): boolean {
    return (
      !this.isTerminal &&
      this.#transitions.some(
        (transition) => transition.from === this.#state && transition.event === event
      )
    )
  }

  transition(
    event: Event
  ): Result<StateMachine<State, Event>, InvalidTransitionError<State, Event>> {
    if (!this.canTransition(event)) {
      return err(new InvalidTransitionError(this.#state, event))
    }

    const transition = this.#transitions.find(
      (candidate) => candidate.from === this.#state && candidate.event === event
    )
    if (!transition) {
      return err(new InvalidTransitionError(this.#state, event))
    }

    return ok(new StateMachine(transition.to, this.#transitions, this.#terminalStates))
  }
}
