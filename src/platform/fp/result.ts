export type Result<T, E> = Ok<T, E> | Err<T, E>

export class Ok<T, E = never> {
  readonly isOk = true as const
  readonly isErr = false as const

  constructor(readonly value: T) {}

  map<U>(transform: (value: T) => U): Result<U, E> {
    return ok(transform(this.value))
  }

  mapError<F>(_transform: (error: E) => F): Result<T, F> {
    return new Ok<T, F>(this.value)
  }

  andThen<U, F>(transform: (value: T) => Result<U, F>): Result<U, E | F> {
    return transform(this.value)
  }

  async andThenAsync<U, F>(
    transform: (value: T) => Promise<Result<U, F>>
  ): Promise<Result<U, E | F>> {
    return transform(this.value)
  }

  unwrapOr(_fallback: T): T {
    return this.value
  }

  unwrapOrElse(_fallback: (error: E) => T): T {
    return this.value
  }

  match<U>(handlers: { ok: (value: T) => U; err: (error: E) => U }): U {
    return handlers.ok(this.value)
  }

  isOkAnd(predicate: (value: T) => boolean): boolean {
    return predicate(this.value)
  }

  isErrAnd(_predicate: (error: E) => boolean): boolean {
    return false
  }
}

export class Err<T = never, E = unknown> {
  readonly isOk = false as const
  readonly isErr = true as const

  constructor(private readonly reason: E) {}

  get error(): E {
    return this.reason
  }

  map<U>(_transform: (value: T) => U): Result<U, E> {
    return new Err<U, E>(this.error)
  }

  mapError<F>(transform: (error: E) => F): Result<T, F> {
    return err(transform(this.error))
  }

  andThen<U, F>(_transform: (value: T) => Result<U, F>): Result<U, E | F> {
    return new Err<U, E>(this.error)
  }

  async andThenAsync<U, F>(
    _transform: (value: T) => Promise<Result<U, F>>
  ): Promise<Result<U, E | F>> {
    return new Err<U, E>(this.error)
  }

  unwrapOr<U>(fallback: U): U {
    return fallback
  }

  unwrapOrElse<U>(fallback: (error: E) => U): U {
    return fallback(this.error)
  }

  match<U>(handlers: { ok: (value: T) => U; err: (error: E) => U }): U {
    return handlers.err(this.error)
  }

  isOkAnd(_predicate: (value: T) => boolean): boolean {
    return false
  }

  isErrAnd(predicate: (error: E) => boolean): boolean {
    return predicate(this.error)
  }
}

export function ok<T>(value: T): Ok<T> {
  return new Ok(value)
}

export function err<E>(error: E): Err<never, E> {
  return new Err(error)
}

export function combine<T, E>(results: readonly Result<T, E>[]): Result<T[], E> {
  const values: T[] = []
  for (const result of results) {
    if (result.isErr) {
      return err(result.error)
    }
    values.push(result.value)
  }
  return ok(values)
}

export function fromThrowable<T, E>(fn: () => T, onError: (thrown: unknown) => E): Result<T, E> {
  try {
    return ok(fn())
  } catch (error) {
    return err(onError(error))
  }
}

export async function fromAsyncThrowable<T, E>(
  fn: () => Promise<T>,
  onError: (thrown: unknown) => E
): Promise<Result<T, E>> {
  try {
    const value = await fn()
    return ok(value)
  } catch (error) {
    return err(onError(error))
  }
}

export const Result = {
  ok,
  err,
  combine,
  fromThrowable,
  fromAsyncThrowable,
}
