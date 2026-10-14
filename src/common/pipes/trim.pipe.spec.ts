import { TrimPipe } from './trim.pipe.js';

describe('TrimPipe', () => {
  let pipe: TrimPipe;

  beforeEach(() => {
    pipe = new TrimPipe();
  });

  it('should trim string values', () => {
    expect(pipe.transform('  hello world  ')).toBe('hello world');
  });

  it('should trim string values inside objects', () => {
    const input = {
      name: '  Alice  ',
      nested: {
        company: '  Acme Corp  ',
      },
    };
    expect(pipe.transform(input)).toEqual({
      name: 'Alice',
      nested: {
        company: 'Acme Corp',
      },
    });
  });

  it('should trim strings inside arrays', () => {
    const input = ['  foo  ', '  bar  ', 123];
    expect(pipe.transform(input)).toEqual(['foo', 'bar', 123]);
  });

  it('should preserve non-string primitives', () => {
    expect(pipe.transform(42)).toBe(42);
    expect(pipe.transform(true)).toBe(true);
    expect(pipe.transform(null)).toBeNull();
    expect(pipe.transform(undefined)).toBeUndefined();
  });

  it('should preserve Date objects', () => {
    const date = new Date();
    expect(pipe.transform(date)).toBe(date);
  });
});
