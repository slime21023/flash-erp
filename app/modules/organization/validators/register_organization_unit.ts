import vine from '@vinejs/vine'

export const registerOrganizationUnitValidator = vine.compile(
  vine.object({
    id: vine.string().trim().minLength(1).maxLength(64),
    code: vine.string().trim().minLength(1).maxLength(64),
    name: vine.string().trim().minLength(1).maxLength(160),
    kind: vine.enum(['COMPANY', 'PLANT', 'WAREHOUSE'] as const),
    parentId: vine
      .union([
        vine.union.if(
          (value) => typeof value === 'string',
          vine.string().trim().minLength(1).maxLength(64)
        ),
        vine.union.else(vine.literal(null)),
      ])
      .optional(),
  })
)
