import type {
  VideoWatchChatMessage,
  VideoWatchSummary,
} from "@/app/lib/video-watch-types";
import {
  CHAT_CONTEXT_BUFFER_TOKENS,
  CHAT_MAX_RESPONSE_TOKENS,
  CHAT_STOPWORDS,
  LIST_TIMELINE_LINE_CAP,
  MIN_CHAT_PROMPT_TOKENS,
  MIN_SUMMARY_CHAR_LIMIT,
  MIN_TIMELINE_LINE_LIMIT,
  SUMMARY_MODEL_KEY,
} from "./config";
import { readSummaryForJob } from "./jobs";
import { getClient, resolveModelKey } from "./llm-client";

// Types for chat message and LLM model interface
type LlmChatMessage = {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
};
type ContextAwareModel = {
  applyPromptTemplate: (history: readonly LlmChatMessage[]) => Promise<string>;
  countTokens: (inputString: string) => Promise<number>;
  getModelInfo: () => Promise<{
    contextLength: number;
    maxContextLength: number;
  }>;
  respond: (
    history: readonly LlmChatMessage[],
    opts: {
      temperature: number;
      maxTokens: number;
      contextOverflowPolicy: "rollingWindow";
    },
  ) => Promise<{ content?: string }>;
};

// Ensures chat history is consistent and most recent question is present
function normalizeChatHistory(
  messages: readonly VideoWatchChatMessage[] | undefined,
  question: string,
): VideoWatchChatMessage[] {
  const normalized =
    messages?.reduce<VideoWatchChatMessage[]>((arr, msg) => {
      const content = msg.content.trim();
      if (content) arr.push({ role: msg.role, content });
      return arr;
    }, []) ?? [];

  if (!normalized.length) return [{ role: "user", content: question }];

  const latest = normalized.at(-1);
  if (latest?.role === "user" && latest.content === question) return normalized;

  return [...normalized, { role: "user", content: question }];
}

// Trim text to char limit, using ellipsis if needed
function trimTextToCharLimit(text: string, limit: number): string {
  if (text.length <= limit) return text;
  if (limit <= 1) return text.slice(0, limit);
  return `${text.slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
}

// Extract search terms (≥3 chars, not stopwords)
function extractSearchTerms(text: string): string[] {
  const unique = new Set<string>();
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .forEach((token) => {
      if (token.length >= 3 && !CHAT_STOPWORDS.has(token)) unique.add(token);
    });
  return [...unique];
}

// Assign score to a timeline line based on query relevance
function scoreTimelineLine(line: string, terms: readonly string[]): number {
  const normalized = line.toLowerCase();
  return terms.reduce(
    (score, term) => (normalized.includes(term) ? score + 1 : score),
    0,
  );
}

// Is the question asking for a timeline/list?
function wantsEnumerateFullTimeline(queryText: string): boolean {
  return /\b(list|lists|series|chronolog|chronicle|timeline|every frame|each second|all events|full sequence|enumerate|step by step|second by second)\b/i.test(
    queryText,
  );
}

// Select relevant lines from the timeline, prioritizing around query terms and start/end
function buildTimelineExcerpt(
  timelineText: string,
  queryText: string,
  lineLimit: number,
): string {
  const lines = timelineText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (!lines.length) return "No timeline entries available.";
  if (lines.length <= lineLimit) return lines.join("\n");

  const terms = extractSearchTerms(queryText);
  const selected = new Set<number>();

  // Always include the start, next line, and most recent ~6 lines
  [0, 1].forEach((idx) => {
    selected.add(idx);
  });
  for (let i = Math.max(0, lines.length - 6); i < lines.length; i++)
    selected.add(i);

  // Score lines for relevance; select the highest-scoring and neighbours
  const scored = lines
    .map((line, idx) => ({ idx, score: scoreTimelineLine(line, terms) }))
    .filter((obj) => obj.score > 0)
    .sort((a, b) => b.score - a.score || a.idx - b.idx);

  for (const { idx } of scored) {
    if (selected.size >= lineLimit) break;
    [idx - 1, idx, idx + 1].forEach((i) => {
      if (i >= 0 && i < lines.length && selected.size < lineLimit)
        selected.add(i);
    });
  }

  // Fill selection with more lines as needed, favoring end and then start
  for (let i = lines.length - 1; i >= 0 && selected.size < lineLimit; i--)
    selected.add(i);
  for (let i = 0; i < lines.length && selected.size < lineLimit; i++)
    selected.add(i);

  // Build result and indicate omitted gaps
  const ordered = Array.from(selected).sort((a, b) => a - b);
  const excerpt: string[] = [];
  let prev = -1;
  for (const idx of ordered) {
    if (prev >= 0 && idx - prev > 1)
      excerpt.push(`[${idx - prev - 1} timeline entries omitted]`);
    excerpt.push(lines[idx]);
    prev = idx;
  }
  return excerpt.join("\n");
}

// Assembles the evidence block for LLM prompt
function buildVideoEvidenceBlock(input: {
  readonly summary: VideoWatchSummary;
  readonly queryText: string;
  readonly summaryCharLimit: number;
  readonly timelineLineLimit: number;
  readonly enumerateFullTimeline?: boolean;
}): string {
  const trimmedSummary = trimTextToCharLimit(
    input.summary.summaryText.trim(),
    input.summaryCharLimit,
  );
  const timelineExcerpt = buildTimelineExcerpt(
    input.summary.timelineText,
    input.queryText,
    input.timelineLineLimit,
  );

  const base = [
    "Video briefing (primary — answer from this first):",
    trimmedSummary || "No summary available.",
    "",
    "Timeline excerpts (compressed; use for timestamps and sequence):",
    timelineExcerpt,
  ].join("\n");

  return input.enumerateFullTimeline
    ? `${base}\n\nInstruction: The user asked for a full timeline or ordered list. Answer using every line of the timeline excerpts above in chronological order, and do not stop mid-list unless you run out of evidence.`
    : `${base}\n\nInstruction: Give a direct answer to the user's question using the briefing and excerpts. Do not paste the entire briefing back unless they explicitly ask for a full recap. Prefer concrete actions and times over repeating appearance details.`;
}

// Assembles chat prompt messages for LLM
function buildPromptMessages(input: {
  readonly evidenceBlock: string;
  readonly history: readonly VideoWatchChatMessage[];
  readonly latestQuestion: string;
}): LlmChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "You answer questions about analyzed CCTV footage using only the supplied evidence and chat history.",
        "Use earlier turns to resolve follow-up questions, but let the supplied video evidence overrule prior assistant guesses.",
        "Give direct answers: what happened, who did what, and when — not generic descriptions of how people look unless the question asks for appearance.",
        "Mention timestamps when the excerpts support them; say clearly when the evidence does not support a claim.",
        "",
        input.evidenceBlock,
      ].join("\n"),
    },
    ...input.history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: input.latestQuestion },
  ];
}

// Counts tokens in a chat prompt for budget control
async function countChatTokens(
  model: ContextAwareModel,
  history: readonly LlmChatMessage[],
): Promise<number> {
  const prompt = await model.applyPromptTemplate(history);
  return model.countTokens(prompt);
}

// Dynamically squeezes chat prompt to fit in token budget
async function buildChatPrompt(
  model: ContextAwareModel,
  summary: VideoWatchSummary,
  conversation: readonly VideoWatchChatMessage[],
): Promise<{ chat: LlmChatMessage[]; maxTokens: number }> {
  const latestQuestion = conversation.at(-1)?.content ?? "";
  const priorHistory = conversation.slice(0, -1);
  const modelInfo = await model.getModelInfo();

  const contextWindow = Math.max(
    MIN_CHAT_PROMPT_TOKENS + CHAT_CONTEXT_BUFFER_TOKENS,
    Math.min(modelInfo.contextLength, modelInfo.maxContextLength),
  );
  const maxTokens = Math.max(
    256,
    Math.min(CHAT_MAX_RESPONSE_TOKENS, Math.floor(contextWindow * 0.35)),
  );
  const promptBudget = Math.max(
    MIN_CHAT_PROMPT_TOKENS,
    contextWindow - maxTokens - CHAT_CONTEXT_BUFFER_TOKENS,
  );

  const queryText = conversation.map((m) => m.content).join("\n");
  const totalTimelineLines = summary.timelineText
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0).length;
  const fullTimelineAsk = wantsEnumerateFullTimeline(queryText);

  let timelineLineLimit = fullTimelineAsk
    ? Math.min(
        LIST_TIMELINE_LINE_CAP,
        Math.max(totalTimelineLines, MIN_TIMELINE_LINE_LIMIT),
      )
    : Math.max(MIN_TIMELINE_LINE_LIMIT, totalTimelineLines);

  let summaryCharLimit = Math.max(
    MIN_SUMMARY_CHAR_LIMIT,
    summary.summaryText.trim().length,
  );
  let historyStartIndex = 0;
  let fallbackChat: LlmChatMessage[] = [];

  // Reduce content step-wise: timeline, chat history, summary text
  while (true) {
    const evidenceBlock = buildVideoEvidenceBlock({
      summary,
      queryText,
      summaryCharLimit,
      timelineLineLimit,
      enumerateFullTimeline: fullTimelineAsk,
    });
    const candidateChat = buildPromptMessages({
      evidenceBlock,
      history: priorHistory.slice(historyStartIndex),
      latestQuestion,
    });

    fallbackChat = candidateChat;

    if ((await countChatTokens(model, candidateChat)) <= promptBudget) {
      return { chat: candidateChat, maxTokens };
    }

    if (timelineLineLimit > MIN_TIMELINE_LINE_LIMIT) {
      timelineLineLimit = Math.max(
        MIN_TIMELINE_LINE_LIMIT,
        Math.floor(timelineLineLimit * 0.7),
      );
      continue;
    }
    if (historyStartIndex < priorHistory.length) {
      historyStartIndex += 1;
      continue;
    }
    if (summaryCharLimit > MIN_SUMMARY_CHAR_LIMIT) {
      summaryCharLimit = Math.max(
        MIN_SUMMARY_CHAR_LIMIT,
        Math.floor(summaryCharLimit * 0.75),
      );
      continue;
    }
    return { chat: fallbackChat, maxTokens };
  }
}

// Main API: answers a question about a video using LLM and summary
export async function answerQuestionAboutVideo(input: {
  readonly jobId: string;
  readonly question: string;
  readonly messages?: readonly VideoWatchChatMessage[];
}): Promise<{ answer: string; modelKey: string }> {
  const summary = await readSummaryForJob(input.jobId);
  if (!summary) throw new Error("Video analysis is not ready yet");

  const resolvedSummaryModelKey = await resolveModelKey(SUMMARY_MODEL_KEY);
  const model = (await getClient().llm.model(
    resolvedSummaryModelKey,
  )) as ContextAwareModel;
  const conversation = normalizeChatHistory(input.messages, input.question);
  const prompt = await buildChatPrompt(model, summary, conversation);

  const response = await model.respond(prompt.chat, {
    temperature: 0.1,
    maxTokens: prompt.maxTokens,
    contextOverflowPolicy: "rollingWindow",
  });

  const answer = response?.content?.trim();
  if (!answer) throw new Error("LM Studio returned an empty answer");

  return { answer, modelKey: resolvedSummaryModelKey };
}
