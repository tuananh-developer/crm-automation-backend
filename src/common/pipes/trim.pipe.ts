import { Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class TrimPipe implements PipeTransform {
  transform(value: unknown): unknown {
    return this.trimValue(value);
  }

  private trimValue(value: unknown): unknown {
    if (typeof value === 'string') {
      return value.trim();
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.trimValue(item));
    }

    if (
      value !== null &&
      typeof value === 'object' &&
      !(value instanceof Date) &&
      !ArrayBuffer.isView(value)
    ) {
      return Object.entries(value).reduce<Record<string, unknown>>(
        (acc, [key, val]) => {
          acc[key] = this.trimValue(val);
          return acc;
        },
        {},
      );
    }

    return value;
  }
}
