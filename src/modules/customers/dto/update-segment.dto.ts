import { PartialType } from '@nestjs/mapped-types';
import { CreateSegmentDto } from './create-segment.dto.js';

export class UpdateSegmentDto extends PartialType(CreateSegmentDto) {}
