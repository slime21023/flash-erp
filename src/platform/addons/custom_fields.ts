import { DomainError } from '@platform/fp/domain_error.js'
import { err, ok } from '@platform/fp/result.js'
import type { Result } from '@platform/fp/result.js'

export type CustomFieldType = 'string' | 'number' | 'boolean' | 'date' | 'json'

export interface CustomFieldDefinition {
  readonly name: string
  readonly label: string
  readonly type: CustomFieldType
  readonly required?: boolean
  readonly allowedValues?: readonly any[]
}

export class InvalidCustomFieldError extends DomainError {
  readonly code = 'INVALID_CUSTOM_FIELD'

  constructor(
    public readonly fieldName: string,
    public readonly reason: string
  ) {
    super(`Custom field '${fieldName}' is invalid: ${reason}`)
  }
}

export class CustomFieldsEngine {
  private readonly schemas = new Map<string, CustomFieldDefinition[]>()

  registerFields(targetEntity: string, fields: readonly CustomFieldDefinition[]): void {
    const existing = this.schemas.get(targetEntity) ?? []
    this.schemas.set(targetEntity, [...existing, ...fields])
  }

  getFields(targetEntity: string): readonly CustomFieldDefinition[] {
    return this.schemas.get(targetEntity) ?? []
  }

  validate(
    targetEntity: string,
    rawValues: unknown
  ): Result<Record<string, any>, InvalidCustomFieldError> {
    const definitions = this.getFields(targetEntity)
    if (definitions.length === 0) {
      if (rawValues === null || rawValues === undefined) {
        return ok({})
      }
      if (typeof rawValues === 'object' && !Array.isArray(rawValues)) {
        return ok(rawValues as Record<string, any>)
      }
      return err(new InvalidCustomFieldError('customFields', 'must be an object'))
    }

    if (rawValues === null || rawValues === undefined) {
      rawValues = {}
    }

    if (typeof rawValues !== 'object' || Array.isArray(rawValues)) {
      return err(new InvalidCustomFieldError('customFields', 'must be an object'))
    }

    const input = rawValues as Record<string, any>
    const validated: Record<string, any> = {}

    for (const def of definitions) {
      const val = input[def.name]

      if (val === undefined || val === null || val === '') {
        if (def.required) {
          return err(new InvalidCustomFieldError(def.name, 'is required'))
        }
        continue
      }

      switch (def.type) {
        case 'string':
          if (typeof val !== 'string') {
            return err(new InvalidCustomFieldError(def.name, 'must be a string'))
          }
          break
        case 'number':
          if (typeof val !== 'number' || Number.isNaN(val)) {
            return err(new InvalidCustomFieldError(def.name, 'must be a valid number'))
          }
          break
        case 'boolean':
          if (typeof val !== 'boolean') {
            return err(new InvalidCustomFieldError(def.name, 'must be a boolean'))
          }
          break
        case 'date':
          if (typeof val !== 'string' || Number.isNaN(Date.parse(val))) {
            return err(new InvalidCustomFieldError(def.name, 'must be a valid ISO date string'))
          }
          break
        case 'json':
          if (typeof val !== 'object') {
            return err(new InvalidCustomFieldError(def.name, 'must be a valid JSON object/array'))
          }
          break
      }

      if (def.allowedValues && def.allowedValues.length > 0) {
        if (!def.allowedValues.includes(val)) {
          return err(
            new InvalidCustomFieldError(
              def.name,
              `value must be one of: ${def.allowedValues.join(', ')}`
            )
          )
        }
      }

      validated[def.name] = val
    }

    // Preserve any other undeclared keys cleanly
    for (const [k, v] of Object.entries(input)) {
      if (!(k in validated)) {
        validated[k] = v
      }
    }

    return ok(validated)
  }
}
