/**
 * Colosseum Forum Agent - Automated forum engagement for ClaudeCraft
 * 
 * This agent monitors the Colosseum Agent Hackathon forum and:
 * 1. Posts thoughtful comments on interesting projects
 * 2. Responds to comments on our own post
 * 3. Discovers integration opportunities
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import Anthropic from '@anthropic-ai/sdk';

// Configuration
const COLOSSEUM_API_KEY = process.env.COLOSSEUM_API_KEY || '';
const FORUM_CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_COMMENTS_PER_CYCLE = 2;
const OUR_AGENT_ID = 42;
const OUR_POST_ID = 240; // ClaudeCraft's forum post

// Track which posts we've commented on
const commentedPostsPath = path.join(__dirname, '../data/commented-posts.json');

interface ForumPost {
  id: number;
  agentId: number;
  agentName: string;
  title: string;
  body: string;
  score: number;
  commentCount: number;
  tags: string[];
  createdAt: string;
}

interface ForumComment {
  id: number;
  postId: number;
  agentId: number;
  agentName: string;
  body: string;
  createdAt: string;
}

// Load commented posts tracking
function loadCommentedPosts(): Set<number> {
  try {
    const data = fs.readFileSync(commentedPostsPath, 'utf-8');
    return new Set(JSON.parse(data));
  } catch {
    return new Set();
  }
}

// Save commented posts
function saveCommentedPosts(posts: Set<number>): void {
  const dir = path.dirname(commentedPostsPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(commentedPostsPath, JSON.stringify(Array.from(posts)));
}

// Make HTTPS request to Colosseum API
function colosseumRequest(
  method: string,
  endpoint: string,
  body?: object
): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'agents.colosseum.com',
      port: 443,
      path: `/api${endpoint}`,
      method,
      headers: {
        'Authorization': `Bearer ${COLOSSEUM_API_KEY}`,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ raw: data, status: res.statusCode });
        }
      });
    });

    req.on('error', reject);
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Fetch recent forum posts
async function fetchRecentPosts(): Promise<ForumPost[]> {
  try {
    const result = await colosseumRequest('GET', '/forum/posts?limit=30');
    return result.posts || [];
  } catch (error) {
    console.error('[Colosseum] Failed to fetch posts:', error);
    return [];
  }
}

// Fetch comments on a post
async function fetchPostComments(postId: number): Promise<ForumComment[]> {
  try {
    const result = await colosseumRequest('GET', `/forum/posts/${postId}/comments`);
    return result.comments || [];
  } catch (error) {
    console.error(`[Colosseum] Failed to fetch comments for post ${postId}:`, error);
    return [];
  }
}

// Post a comment
async function postComment(postId: number, body: string): Promise<boolean> {
  try {
    const result = await colosseumRequest('POST', `/forum/posts/${postId}/comments`, { body });
    if (result.comment?.id) {
      console.log(`[Colosseum] ✅ Posted comment ${result.comment.id} on post ${postId}`);
      return true;
    }
    console.error('[Colosseum] Comment post failed:', result);
    return false;
  } catch (error) {
    console.error('[Colosseum] Failed to post comment:', error);
    return false;
  }
}

// Generate a comment using Claude
async function generateComment(post: ForumPost): Promise<string | null> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    console.error('[Colosseum] No ANTHROPIC_API_KEY for comment generation');
    return null;
  }

  const client = new Anthropic({ apiKey: anthropicKey });

  const prompt = `You are ClaudeCraft, an AI agent building a Minecraft platform where AI agents play, build, and compete in PvP arena matches with token wagers on Solana.

Another agent posted this on the Colosseum hackathon forum:

Title: ${post.title}
Agent: ${post.agentName}
Content:
${post.body.slice(0, 2000)}

Write a friendly, casual comment (3-5 sentences max) that:
1. Acknowledges something cool about their project
2. Suggests how it could connect with gaming/entertainment agents like ClaudeCraft
3. Ends with a question or invitation to collaborate

Keep the tone casual but genuine. No corporate speak. Sign off with "— ClaudeCraft"

Comment:`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }]
    });

    const text = response.content[0];
    if (text.type === 'text') {
      return text.text.trim();
    }
    return null;
  } catch (error) {
    console.error('[Colosseum] Claude API error:', error);
    return null;
  }
}

// Check for new comments on our post and respond
async function checkOurPostComments(): Promise<void> {
  try {
    const comments = await fetchPostComments(OUR_POST_ID);
    const ourComments = comments.filter(c => c.agentId === OUR_AGENT_ID);
    const otherComments = comments.filter(c => c.agentId !== OUR_AGENT_ID);

    // Find comments we haven't replied to (simple heuristic: if their comment is newer than our last)
    const ourLatest = ourComments.length > 0 
      ? new Date(ourComments[ourComments.length - 1].createdAt).getTime()
      : 0;

    const newComments = otherComments.filter(c => 
      new Date(c.createdAt).getTime() > ourLatest
    );

    if (newComments.length > 0) {
      console.log(`[Colosseum] 📨 ${newComments.length} new comments on our post`);
      // Could auto-reply here if desired
    }
  } catch (error) {
    console.error('[Colosseum] Failed to check our post comments:', error);
  }
}

// Find interesting posts to comment on
function selectPostsToComment(posts: ForumPost[], alreadyCommented: Set<number>): ForumPost[] {
  // Filter out our own posts and already-commented posts
  const candidates = posts.filter(p => 
    p.agentId !== OUR_AGENT_ID && 
    !alreadyCommented.has(p.id)
  );

  // Prioritize:
  // 1. Posts with interesting tags (ai, gaming, infra)
  // 2. Posts with fewer comments (more visibility for our comment)
  // 3. Recent posts
  const scored = candidates.map(p => {
    let score = 0;
    if (p.tags.includes('ai')) score += 2;
    if (p.tags.includes('consumer')) score += 3;
    if (p.tags.includes('infra')) score += 2;
    if (p.commentCount < 5) score += 2;
    if (p.commentCount < 10) score += 1;
    return { post: p, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_COMMENTS_PER_CYCLE).map(s => s.post);
}

// Main forum engagement cycle
async function forumEngagementCycle(): Promise<void> {
  if (!COLOSSEUM_API_KEY) {
    console.log('[Colosseum] No API key configured, skipping forum engagement');
    return;
  }

  console.log('[Colosseum] 💬 Running forum engagement cycle...');

  // Load tracking data
  const commentedPosts = loadCommentedPosts();

  // Check for comments on our post
  await checkOurPostComments();

  // Fetch recent posts
  const posts = await fetchRecentPosts();
  if (posts.length === 0) {
    console.log('[Colosseum] No posts found');
    return;
  }

  // Select posts to comment on
  const toComment = selectPostsToComment(posts, commentedPosts);
  
  if (toComment.length === 0) {
    console.log('[Colosseum] Already commented on all visible posts');
    return;
  }

  console.log(`[Colosseum] 🎯 Selected ${toComment.length} posts to engage with`);

  // Generate and post comments
  for (const post of toComment) {
    // Check for pre-written comment first
    const prewrittenPath = path.join(__dirname, `../data/comments/${post.agentName.toLowerCase().replace(/[^a-z0-9]/g, '-')}.json`);
    let comment: string | null = null;

    if (fs.existsSync(prewrittenPath)) {
      try {
        const prewritten = JSON.parse(fs.readFileSync(prewrittenPath, 'utf-8'));
        comment = prewritten.body;
        console.log(`[Colosseum] 📝 Using prewritten comment for ${post.agentName}`);
      } catch {
        // Fall through to generation
      }
    }

    // Generate comment if no prewritten one
    if (!comment) {
      comment = await generateComment(post);
    }

    if (comment) {
      const success = await postComment(post.id, comment);
      if (success) {
        commentedPosts.add(post.id);
        saveCommentedPosts(commentedPosts);
      }
      // Rate limit between comments
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

// Start the forum agent
export function startColosseumAgent(): void {
  console.log('[Colosseum] 🏛️ Starting Colosseum forum agent');
  
  // Initial run after 2 minutes
  setTimeout(() => {
    forumEngagementCycle().catch(console.error);
  }, 2 * 60 * 1000);

  // Regular interval
  setInterval(() => {
    forumEngagementCycle().catch(console.error);
  }, FORUM_CHECK_INTERVAL_MS);
}

// Export for manual testing
export { forumEngagementCycle, fetchRecentPosts, postComment };
