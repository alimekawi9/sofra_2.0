'use client'

import { use } from 'react'

/** Next 15 supplies a Promise; accepting a value also keeps isolated component tests ergonomic. */
export function useUnwrappedParams<T>(params: Promise<T> | T): T {
  return typeof (params as Promise<T>)?.then === 'function' ? use(params as Promise<T>) : params as T
}
