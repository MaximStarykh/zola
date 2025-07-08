/**
 * Gets the weather for a given city.
 * @param city The city to get the weather for.
 * @returns A string describing the weather.
 */
export async function getWeather({ city }: { city: string }): Promise<string> {
  // In a real implementation, you would call a weather API here.
  return `The weather in ${city} is sunny.`;
}

/**
 * Searches the documentation for a given query.
 * @param query The query to search for.
 * @returns A string with the search results.
 */
export async function searchDocs({ query }: { query: string }): Promise<string> {
  // In a real implementation, you would search your documentation here.
  return `Search results for "${query}" would be displayed here.`;
}

export const FUNCTIONS = { getWeather, searchDocs };
