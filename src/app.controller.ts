import { Controller, Get, Optional, ServiceUnavailableException } from '@nestjs/common'
import { Public } from '@platform/security/index.js'
import { DataSource } from 'typeorm'

@Controller()
export class AppController {
  constructor(@Optional() private readonly dataSource?: DataSource) {}

  @Get()
  @Public()
  getHealth() {
    return {
      service: 'flash-erp',
      status: 'ok',
    }
  }

  @Get('health')
  @Public()
  health() {
    return this.getHealth()
  }

  @Get('ready')
  @Public()
  async readiness() {
    if (!this.dataSource?.isInitialized) {
      throw new ServiceUnavailableException({
        service: 'flash-erp',
        status: 'not_ready',
        database: 'unavailable',
      })
    }

    try {
      await this.dataSource.query('SELECT 1')
      return { service: 'flash-erp', status: 'ready', database: 'ok' }
    } catch {
      throw new ServiceUnavailableException({
        service: 'flash-erp',
        status: 'not_ready',
        database: 'unavailable',
      })
    }
  }
}
