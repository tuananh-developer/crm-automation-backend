import { SanitizeStringPipe } from './sanitize-string.pipe.js';

describe('SanitizeStringPipe', () => {
  let pipe: SanitizeStringPipe;

  beforeEach(() => {
    pipe = new SanitizeStringPipe();
  });

  it('should strip HTML tags from strings', () => {
    expect(pipe.transform('<script>alert("xss")</script>hello')).toBe(
      'alert("xss")hello',
    );
    expect(pipe.transform('<b>bold</b> text')).toBe('bold text');
  });

  it('should strip HTML tags inside nested objects', () => {
    const input = {
      bio: '<p>Software Engineer</p>',
      notes: '<span class="test">Some note</span>',
    };
    expect(pipe.transform(input)).toEqual({
      bio: 'Software Engineer',
      notes: 'Some note',
    });
  });

  it('should strip HTML tags inside arrays', () => {
    const input = ['<a href="test">link</a>', 'clean'];
    expect(pipe.transform(input)).toEqual(['link', 'clean']);
  });

  it('should preserve non-string values', () => {
    expect(pipe.transform(100)).toBe(100);
    expect(pipe.transform(null)).toBeNull();
    expect(pipe.transform(undefined)).toBeUndefined();
  });
});
