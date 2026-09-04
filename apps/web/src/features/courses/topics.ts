/**
 * The comparison form of a topic list: title and hours, in sequence.
 *
 * Shared by the form (which stamps it into a hidden field when the page loads)
 * and the action (which compares the submission against it). It lives outside
 * the action module because a "use server" file may only export async
 * functions — a sync helper there fails the build.
 */
export function serialiseTopics(
  topics: ReadonlyArray<{ title: string; durationHours?: number | null }>,
): string {
  return JSON.stringify(topics.map((topic) => [topic.title, topic.durationHours ?? null]));
}
