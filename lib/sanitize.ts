// Simple HTML sanitization for server-side use
// This is a basic implementation - consider using a more robust solution in production
export function sanitizeUserInput(input: string): string {
  if (!input) return '';
  
  // Basic HTML entity encoding
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}
