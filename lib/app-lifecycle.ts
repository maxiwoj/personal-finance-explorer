// No runtime imports, so node --test can load it

// iOS reopens a suspended Home Screen app where it was left; after this long, it starts on /add
export const RESUME_TO_ADD_AFTER_MS = 5 * 60 * 1000

export function shouldResumeToAdd({ awayMs, pathname, standalone, unsavedInput }: {
  awayMs: number
  pathname: string
  standalone: boolean
  unsavedInput: boolean
}) {
  return standalone && !unsavedInput && awayMs > RESUME_TO_ADD_AFTER_MS && pathname !== '/add' && pathname !== '/login'
}
