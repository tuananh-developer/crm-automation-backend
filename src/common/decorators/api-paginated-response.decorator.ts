import { applyDecorators, type Type } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { PaginationMetaDto } from '../dto/pagination-meta.dto.js';

export function ApiPaginatedResponse(
  itemDto: Type<unknown>,
  description?: string,
) {
  return applyDecorators(
    ApiExtraModels(PaginationMetaDto, itemDto),
    ApiResponse({
      status: 200,
      description,
      schema: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: { $ref: getSchemaPath(itemDto) },
          },
          meta: {
            $ref: getSchemaPath(PaginationMetaDto),
          },
        },
        required: ['data', 'meta'],
      },
    }),
  );
}
