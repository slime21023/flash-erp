import vine from '@vinejs/vine'

export const createAccountValidator = vine.compile(
  vine.object({
    id: vine.string().trim().minLength(1).maxLength(64),
    companyId: vine.string().trim().minLength(1).maxLength(64),
    code: vine.string().trim().minLength(1).maxLength(32),
    name: vine.string().trim().minLength(1).maxLength(160),
    normalBalance: vine.enum(['DEBIT', 'CREDIT'] as const),
  })
)
