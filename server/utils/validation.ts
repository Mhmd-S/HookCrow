// Validation utilities for API endpoints

export function validateUUID(id: string | undefined, fieldName: string = 'id'): string {
  if (!id) {
    throw createError({
      statusCode: 400,
      message: `${fieldName} is required`
    })
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(id)) {
    throw createError({
      statusCode: 400,
      message: `Invalid ${fieldName} format`
    })
  }

  return id
}

export function validateRequired<T>(value: T | undefined | null, fieldName: string): T {
  if (value === undefined || value === null || value === '') {
    throw createError({
      statusCode: 400,
      message: `${fieldName} is required`
    })
  }
  return value
}

export function validateString(value: unknown, fieldName: string, options?: { maxLength?: number; minLength?: number }): string {
  if (typeof value !== 'string') {
    throw createError({
      statusCode: 400,
      message: `${fieldName} must be a string`
    })
  }

  if (options?.minLength && value.length < options.minLength) {
    throw createError({
      statusCode: 400,
      message: `${fieldName} must be at least ${options.minLength} characters`
    })
  }

  if (options?.maxLength && value.length > options.maxLength) {
    throw createError({
      statusCode: 400,
      message: `${fieldName} must be at most ${options.maxLength} characters`
    })
  }

  return value
}

export function validateNumber(value: unknown, fieldName: string, options?: { min?: number; max?: number }): number {
  const num = typeof value === 'string' ? parseFloat(value) : value

  if (typeof num !== 'number' || isNaN(num)) {
    throw createError({
      statusCode: 400,
      message: `${fieldName} must be a number`
    })
  }

  if (options?.min !== undefined && num < options.min) {
    throw createError({
      statusCode: 400,
      message: `${fieldName} must be at least ${options.min}`
    })
  }

  if (options?.max !== undefined && num > options.max) {
    throw createError({
      statusCode: 400,
      message: `${fieldName} must be at most ${options.max}`
    })
  }

  return num
}

export function validateEnum<T extends string>(value: unknown, fieldName: string, allowedValues: readonly T[]): T {
  if (!allowedValues.includes(value as T)) {
    throw createError({
      statusCode: 400,
      message: `${fieldName} must be one of: ${allowedValues.join(', ')}`
    })
  }
  return value as T
}

export function validateArray<T>(value: unknown, fieldName: string): T[] {
  if (!Array.isArray(value)) {
    throw createError({
      statusCode: 400,
      message: `${fieldName} must be an array`
    })
  }
  return value as T[]
}

export function sanitizeString(value: string): string {
  // Basic XSS prevention - strip HTML tags
  return value.replace(/<[^>]*>/g, '').trim()
}
