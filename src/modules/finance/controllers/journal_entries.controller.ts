import { Body, Controller, Get, Headers, Param, Post, Query, Res } from '@nestjs/common'
import type { Response } from 'express'
import { err, ok } from '@platform/fp/index.js'
import type { Result } from '@platform/fp/index.js'
import { Money } from '@platform/kernel/index.js'
import { ResultPresenter } from '@platform/http/index.js'
import { RequirePermission } from '@platform/security/index.js'
import { FinanceContract, JournalEntryPersistenceError } from '../contracts/index.js'
import type { CreateJournalEntryDraftInput, JournalLine } from '../contracts/index.js'
import { CreateJournalEntryDraftDto } from '../dto/create_journal_entry.dto.js'
import { ReverseJournalEntryDto } from '../dto/reverse_journal_entry.dto.js'

@Controller('finance')
export class JournalEntriesController {
  constructor(private readonly finance: FinanceContract) {}

  @RequirePermission('finance.journal.create')
  @Post('journal-entries')
  async store(@Body() dto: CreateJournalEntryDraftDto, @Res() res: Response) {
    const input = JournalEntriesController.toDraftInput(dto)
    if (input.isErr) {
      return ResultPresenter.handle(res, input)
    }

    const result = await this.finance.createDraft(input.value)
    return ResultPresenter.handle(res, result, { successStatus: 201 })
  }

  @RequirePermission('finance.voucher.post')
  @Post('journal-entries/:id/post')
  async post(
    @Param('id') id: string,
    @Headers('x-request-id') requestId: string | undefined,
    @Res() res: Response
  ) {
    const result = await this.finance.postDraft(
      id,
      requestId ? { requestId: requestId.trim() } : undefined
    )
    return ResultPresenter.handle(res, result)
  }

  @RequirePermission('finance.journal.reverse')
  @Post('journal-entries/:id/reverse')
  async reverse(
    @Param('id') id: string,
    @Body() dto: ReverseJournalEntryDto,
    @Headers('x-request-id') requestId: string | undefined,
    @Res() res: Response
  ) {
    const result = await this.finance.reverse(
      id,
      dto,
      requestId ? { requestId: requestId.trim() } : undefined
    )
    return ResultPresenter.handle(res, result, { successStatus: 201 })
  }

  @Get('general-ledger')
  async ledger(
    @Query('companyId') companyId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: Response
  ) {
    const result = await this.finance.ledger(companyId || '', from || '', to || '')
    return ResultPresenter.handle(res, result)
  }

  @Get('trial-balance')
  async trialBalance(
    @Query('companyId') companyId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: Response
  ) {
    const result = await this.finance.trialBalance(companyId || '', from || '', to || '')
    return ResultPresenter.handle(res, result)
  }

  private static toDraftInput(
    payload: CreateJournalEntryDraftDto
  ): Result<CreateJournalEntryDraftInput, JournalEntryPersistenceError> {
    const lines: JournalLine[] = []
    for (const line of payload.lines) {
      const debit = Money.fromMinorUnits(BigInt(line.debitMinorUnits), payload.currency)
      const credit = Money.fromMinorUnits(BigInt(line.creditMinorUnits), payload.currency)
      if (debit.isErr || credit.isErr) {
        return err(new JournalEntryPersistenceError('Journal line amount is invalid'))
      }
      lines.push({
        accountId: line.accountId,
        debit: debit.value,
        credit: credit.value,
        ...(line.memo ? { memo: line.memo } : {}),
      })
    }
    return ok({
      id: payload.id,
      companyId: payload.companyId,
      number: payload.number,
      accountingDate: payload.accountingDate,
      lines,
      ...(payload.memo ? { memo: payload.memo } : {}),
    })
  }
}
