import { Controller, Get, Patch, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { InvoicesService } from './invoices.service';
import { FilterInvoicesDto } from './dto/invoices.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ParseCuidPipe } from '../../common/pipes/parse-uuid.pipe';

@ApiTags('Invoices')
@ApiBearerAuth()
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get('me')
  @ApiOperation({ summary: 'List my invoices (patient/doctor) or all invoices (admin)' })
  findMine(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Query() filter: FilterInvoicesDto,
  ) {
    return this.invoicesService.findMine(userId, role, filter);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single invoice' })
  @ApiParam({ name: 'id' })
  findOne(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Param('id', ParseCuidPipe) id: string,
  ) {
    return this.invoicesService.findOne(userId, role, id);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Patch(':id/mark-paid')
  @ApiOperation({ summary: 'Mark invoice as paid (Admin only)' })
  @ApiParam({ name: 'id' })
  markPaid(@Param('id', ParseCuidPipe) id: string) {
    return this.invoicesService.markPaid(id);
  }
}
