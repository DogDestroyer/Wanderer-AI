import { test, expect } from '@playwright/test'
import { hotelDeepLink, flightDeepLink } from '../src/lib/deeplinks'

// Pure unit tests — no browser. Assert URL construction (host + encoded params).

test.describe('hotelDeepLink', () => {
  test('Agoda (default) prefills property, dates, guests', () => {
    const url = hotelDeepLink({
      query: 'Park Hotel Tokyo',
      checkIn: '2026-06-16',
      checkOut: '2026-06-20',
      adults: 2,
    })
    const u = new URL(url)
    expect(u.host).toBe('www.agoda.com')
    expect(u.pathname).toBe('/search')
    expect(u.searchParams.get('textToSearch')).toBe('Park Hotel Tokyo')
    expect(u.searchParams.get('checkIn')).toBe('2026-06-16')
    expect(u.searchParams.get('checkOut')).toBe('2026-06-20')
    expect(u.searchParams.get('adults')).toBe('2')
    expect(u.searchParams.get('rooms')).toBe('1')
    // Spaces must be URL-encoded, not raw.
    expect(url).not.toContain('Park Hotel')
    expect(url).toContain('Park+Hotel+Tokyo')
  })

  test('Trip.com provider uses its hotel list params', () => {
    const url = hotelDeepLink({
      query: 'Tokyo',
      checkIn: '2026-06-16',
      checkOut: '2026-06-20',
      adults: 3,
      provider: 'tripcom',
    })
    const u = new URL(url)
    expect(u.host).toBe('www.trip.com')
    expect(u.pathname).toBe('/hotels/list')
    expect(u.searchParams.get('keyword')).toBe('Tokyo')
    expect(u.searchParams.get('checkin')).toBe('2026-06-16')
    expect(u.searchParams.get('checkout')).toBe('2026-06-20')
    expect(u.searchParams.get('adult')).toBe('3')
  })

  test('defaults to 2 adults and trims ISO timestamps to dates', () => {
    const url = hotelDeepLink({
      query: 'Hotel X',
      checkIn: '2026-06-16T00:00:00.000Z',
      checkOut: '2026-06-20T00:00:00.000Z',
    })
    const u = new URL(url)
    expect(u.searchParams.get('adults')).toBe('2')
    expect(u.searchParams.get('checkIn')).toBe('2026-06-16')
    expect(u.searchParams.get('checkOut')).toBe('2026-06-20')
  })
})

test.describe('flightDeepLink', () => {
  test('one-way prefills route, date, guests', () => {
    const url = flightDeepLink({
      originCode: 'sin',
      destinationCode: 'tyo',
      departDate: '2026-06-16',
      adults: 2,
    })
    const u = new URL(url)
    expect(u.host).toBe('www.trip.com')
    expect(u.searchParams.get('dcity')).toBe('SIN') // upper-cased
    expect(u.searchParams.get('acity')).toBe('TYO')
    expect(u.searchParams.get('ddate')).toBe('2026-06-16')
    expect(u.searchParams.get('triptype')).toBe('ow')
    expect(u.searchParams.get('quantity')).toBe('2')
    expect(u.searchParams.has('rdate')).toBe(false)
  })

  test('round-trip includes return date and triptype rt', () => {
    const url = flightDeepLink({
      originCode: 'SIN',
      destinationCode: 'TYO',
      departDate: '2026-06-16',
      returnDate: '2026-06-23',
    })
    const u = new URL(url)
    expect(u.searchParams.get('triptype')).toBe('rt')
    expect(u.searchParams.get('rdate')).toBe('2026-06-23')
  })
})
