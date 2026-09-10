import { Controller, Get } from '@nestjs/common'
import { Public } from '@platform/security/index.js'

@Controller()
export class AppController {
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
}
