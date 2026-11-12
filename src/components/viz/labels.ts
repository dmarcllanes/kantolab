export function temperatureWord(t: number): string {
  return t <= 0.3 ? 'precise' : t <= 0.8 ? 'balanced' : 'creative'
}
