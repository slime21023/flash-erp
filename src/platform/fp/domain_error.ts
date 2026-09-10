export abstract class DomainError extends Error {
  abstract readonly code: string
  readonly kind = 'DOMAIN_ERROR'

  protected constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = this.constructor.name
    Object.setPrototypeOf(this, new.target.prototype)
  }
}
