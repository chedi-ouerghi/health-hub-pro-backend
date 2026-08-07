import { Module } from "@nestjs/common";
import { PatientsService } from "./patients.service";
import { PatientsController } from "./patients.controller";
import { MedicationsModule } from "../medications/medications.module";
import { VitalsModule } from "../vitals/vitals.module";

@Module({
  imports: [MedicationsModule, VitalsModule],
  controllers: [PatientsController],
  providers: [PatientsService],
  exports: [PatientsService],
})
export class PatientsModule {}
