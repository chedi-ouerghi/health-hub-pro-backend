import { Controller, Get, Post, Patch, Param, Body, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiProduces } from '@nestjs/swagger';
import { Response } from 'express';
import { InvoicesService } from './invoices.service';
import { FilterInvoicesDto, CreateInvoiceDto } from './dto/invoices.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ParseCuidPipe } from '../../common/pipes/parse-uuid.pipe';

@ApiTags('Invoices')
@ApiBearerAuth()
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  // ── Internal creation (admin / system) ───────────────────────────────────────

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post()
  @ApiOperation({ summary: 'Internal: create an invoice linked to an appointment (Admin only)' })
  create(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Body() dto: CreateInvoiceDto,
  ) {
    return this.invoicesService.create(userId, role, dto);
  }

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

  @Get(':id/pdf')
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'Download an invoice as PDF (owner or admin)' })
  @ApiParam({ name: 'id' })
  async downloadPdf(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Param('id', ParseCuidPipe) id: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.invoicesService.generatePdf(userId, role, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.send(buffer);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Patch(':id/mark-paid')
  @ApiOperation({ summary: 'Mark invoice as paid (Admin only)' })
  @ApiParam({ name: 'id' })
  markPaid(@Param('id', ParseCuidPipe) id: string) {
    return this.invoicesService.markPaid(id);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Patch(':id/refund')
  @ApiOperation({ summary: 'Refund an invoice (Admin only)' })
  @ApiParam({ name: 'id' })
  refund(
    @CurrentUser('id') adminUserId: string,
    @Param('id', ParseCuidPipe) id: string,
  ) {
    return this.invoicesService.refund(adminUserId, id);
  }
}