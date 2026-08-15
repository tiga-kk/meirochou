import type { XPost } from "./x-post-types";

export const SALE_MENTION_KEYWORDS = [
  "完売",
  "売り切れ",
  "売切れ",
  "頒布終了",
] as const;

/** Finds sale-related substrings after Japanese compatibility normalization. */
export function detectSaleMentions(posts: readonly XPost[]): {
  readonly matchedPosts: readonly XPost[];
  readonly matchedKeywords: readonly string[];
} {
  const matchedPosts: XPost[] = [];
  const matchedKeywords = new Set<string>();
  for (const post of posts) {
    const text = post.text.normalize("NFKC");
    const keywords = SALE_MENTION_KEYWORDS.filter((keyword) => text.includes(keyword));
    if (keywords.length === 0) continue;
    matchedPosts.push(post);
    for (const keyword of keywords) matchedKeywords.add(keyword);
  }
  return { matchedPosts, matchedKeywords: [...matchedKeywords] };
}
