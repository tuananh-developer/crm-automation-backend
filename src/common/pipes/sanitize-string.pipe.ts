import { Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class SanitizeStringPipe implements PipeTransform {
  transform(value: unknown): unknown {
    return this.sanitizeValue(value);
  }

  private sanitizeValue(value: unknown): unknown {
    if (typeof value === 'string') {
      return value.replace(/<[^>]*>?/gm, '').trim();
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeValue(item));
    }

    if (
      value !== null &&
      typeof value === 'object' &&
      !(value instanceof Date) &&
      !ArrayBuffer.isView(value)
    ) {
      return Object.entries(value).reduce<Record<string, unknown>>(
        (acc, [key, val]) => {
          acc[key] = this.sanitizeValue(val);
          return acc;
        },
        {},
      );
    }

    return value;
  }
}
