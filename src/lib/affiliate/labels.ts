// Display labels only. Stored content types and API payloads retain their original values.
export function contentTypeLabel(type: string): string {
  return type === 'Demonstrasi' ? 'Demonstration' : type === 'Perbandingan' ? 'Comparison' : type;
}
