import { expect, type Page } from '@playwright/test'

// Drive the new-trip wizard to the point of generation. Skips every structured
// step and uses the free-text note as the message (passed verbatim to the
// agent), so callers can trigger a real or mocked generation exactly as the old
// hero textarea did — e.g. driveWizardToBuild(page, '9 days in Tokyo').
export async function driveWizardToBuild(page: Page, note = '') {
  await expect(page.getByTestId('wizard')).toBeVisible({ timeout: 15_000 })
  for (let i = 0; i < 7; i++) {
    await page.getByRole('button', { name: 'Skip this step' }).click()
  }
  // Wait for the notes step's own button before filling: the step-slide
  // transition can lag the rapid skips, and filling early would hit a previous
  // step's field.
  await expect(page.getByRole('button', { name: 'Build my trip' })).toBeVisible({ timeout: 10_000 })
  if (note) await page.getByRole('textbox').fill(note)
  await page.getByRole('button', { name: 'Build my trip' }).click()
}

// Drive the wizard with concrete answers (a strong, deterministic prompt) for
// tests that need a real generation to actually produce a trip.
export async function driveWizardConcrete(
  page: Page,
  { country = 'Japan', city = 'Tokyo', days = 5, note = '' }: { country?: string; city?: string; days?: number; note?: string } = {},
) {
  await expect(page.getByTestId('wizard')).toBeVisible({ timeout: 15_000 })
  // Step 1 — country (animated pill → force click)
  await page.locator('button.wander-pill').filter({ hasText: country }).click({ force: true })
  await page.getByRole('button', { name: 'Continue' }).click()
  // Step 2 — city
  await page.getByRole('button', { name: city, exact: true }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  // Step 3 — days (stepper-only; default 7 → adjust to target)
  const diff = days - 7
  for (let i = 0; i < Math.abs(diff); i++) {
    await page.getByRole('button', { name: diff > 0 ? 'Increase' : 'Decrease' }).click()
  }
  await page.getByRole('button', { name: 'Continue' }).click()
  // Skip steps 4–7 (dates, people, budget, interests)
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Skip this step' }).click()
  // Step 8 — notes → build (wait for the notes step to settle first)
  await expect(page.getByRole('button', { name: 'Build my trip' })).toBeVisible({ timeout: 10_000 })
  if (note) await page.getByRole('textbox').fill(note)
  await page.getByRole('button', { name: 'Build my trip' }).click()
}
