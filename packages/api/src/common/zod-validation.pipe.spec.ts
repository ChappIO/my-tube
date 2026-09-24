import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe.js';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(z.object({ name: z.string().min(1) }));

  it('returns the parsed value', () => {
    expect(pipe.transform({ name: 'x', extra: true })).toEqual({ name: 'x' });
  });

  it('throws a 400 with the issues', () => {
    expect(() => pipe.transform({ name: '' })).toThrow(BadRequestException);
  });
});
