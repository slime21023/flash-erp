import { Controller, Get, Res } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'
import { ResultPresenter } from '@platform/http/result_presenter.js'
import { Public } from '@platform/security/index.js'
import { AddonRegistry } from './registry.js'

@ApiTags('System')
@Controller('api/system')
export class AddonsController {
  constructor(private readonly registry: AddonRegistry) {}

  @Get('modules')
  @Public()
  @ApiOperation({
    summary: '取得已註冊模組清單與依賴拓撲 (Module Manifests & Dependency Topology)',
  })
  @ApiResponse({ status: 200, description: '成功返回所有模組清單與拓撲排序結果' })
  getModules(@Res() res: Response) {
    const topologicalResult = this.registry.resolveDependencies()
    return ResultPresenter.handle(
      res,
      topologicalResult.map((ordered) => ({
        total: ordered.length,
        modules: ordered,
        all: this.registry.getAllManifests(),
      }))
    )
  }
}
