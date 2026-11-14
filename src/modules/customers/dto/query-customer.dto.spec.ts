import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryCustomerDto } from './query-customer.dto.js';

describe('QueryCustomerDto validation', () => {
  it('parses "true" string as boolean true', async () => {
    const dto = plainToInstance(QueryCustomerDto, { isStrategic: 'true' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.isStrategic).toBe(true);
  });

  it('parses "false" string as boolean false (not truthy)', async () => {
    const dto = plainToInstance(QueryCustomerDto, { isStrategic: 'false' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.isStrategic).toBe(false);
  });

  it('parses "1" and "0" correctly', async () => {
    const dtoTrue = plainToInstance(QueryCustomerDto, { isStrategic: '1' });
    const errorsTrue = await validate(dtoTrue);
    expect(errorsTrue).toHaveLength(0);
    expect(dtoTrue.isStrategic).toBe(true);

    const dtoFalse = plainToInstance(QueryCustomerDto, { isStrategic: '0' });
    const errorsFalse = await validate(dtoFalse);
    expect(errorsFalse).toHaveLength(0);
    expect(dtoFalse.isStrategic).toBe(false);
  });

  it('accepts native boolean values', () => {
    const dtoTrue = plainToInstance(QueryCustomerDto, { isStrategic: true });
    expect(dtoTrue.isStrategic).toBe(true);

    const dtoFalse = plainToInstance(QueryCustomerDto, { isStrategic: false });
    expect(dtoFalse.isStrategic).toBe(false);
  });

  it('leaves isStrategic undefined when not provided', async () => {
    const dto = plainToInstance(QueryCustomerDto, { page: 1, limit: 10 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.isStrategic).toBeUndefined();
  });

  it('rejects invalid boolean string with validation error', async () => {
    const dto = plainToInstance(QueryCustomerDto, {
      isStrategic: 'not-a-bool',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('isStrategic');
  });
});
