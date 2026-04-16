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

type LlmChatMessage = {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
};

type ContextAwareModel = {
  readonly applyPromptTemplate: (
    history: readonly LlmChatMessage[],
  ) => Promise<string>;
  readonly countTokens: (inputString: string) => Promise<number>;
  readonly getModelInfo: () => Promise<{
    readonly contextLength: number;
    readonly maxContextLength: number;
  }>;
  readonly respond: (
    history: readonly LlmChatMessage[],
    opts: {
      readonly temperature: number;
      readonly maxTokens: number;
      readonly contextOverflowPolicy: "rollingWindow";
    },
  ) => Promise<{ readonly content?: string }>;
};

function normalizeChatHistory(
  messages: readonly VideoWatchChatMessage[] | undefined,
  question: string,
): VideoWatchChatMessage[] {
  const normalized =
    messages?.flatMap((message) => {
      const content = message.content.trim();
      if (!content) {
        return [];
      }

      return [
        {
          role: message.role,
          content,
        } satisfies VideoWatchChatMessage,
      ];
    }) ?? [];

  if (!normalized.length) {
    return [
      {
        role: "user",
        content: question,
      },
    ];
  }

  const latestMessage = normalized.at(-1);
  if (latestMessage?.role === "user" && latestMessage.content === question) {
    return normalized;
  }

  return [
    ...normalized,
    {
      role: "user",
      content: question,
    },
  ];
}

function trimTextToCharLimit(text: string, limit: number): string {
  if (text.length <= limit) {
    return text;
  }

  if (limit <= 1) {
    return text.slice(0, limit);
  }

  return `${text.slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
}

function extractSearchTerms(text: string): string[] {
  const uniqueTerms = new Set<string>();

  for (const token of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (token.length < 3 || CHAT_STOPWORDS.has(token)) {
      continue;
    }

    uniqueTerms.add(token);
  }

  return [...uniqueTerms];
}

function scoreTimelineLine(line: string, terms: readonly string[]): number {
  const normalized = line.toLowerCase();
  let score = 0;

  for (const term of terms) {
    if (normalized.includes(term)) {
      score += 1;
    }
  }

  return score;
}

function wantsEnumerateFullTimeline(queryText: string): boolean {
  const q = queryText.toLowerCase();
  return /\b(list|lists|series|chronolog|chronicle|timeline|every frame|each second|all events|full sequence|enumerate|step by step|second by second)\b/.test(
    q,
  );
}

function buildTimelineExcerpt(
  timelineText: string,
  queryText: string,
  lineLimit: number,
): string {
  const lines = timelineText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (!lines.length) {
    return "No timeline entries available.";
  }

  if (lines.length <= lineLimit) {
    return lines.join("\n");
  }

  const terms = extractSearchTerms(queryText);
  const selected = new Set<number>();
  const addIndex = (index: number) => {
    if (index < 0 || index >= lines.length || selected.size >= lineLimit) {
      return;
    }

    selected.add(index);
  };

  addIndex(0);
  addIndex(1);

  for (
    let index = Math.max(0, lines.length - 6);
    index < lines.length;
    index += 1
  ) {
    addIndex(index);
  }

  const scored = lines
    .map((line, index) => ({
      index,
      score: scoreTimelineLine(line, terms),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.index - right.index;
    });

  for (const entry of scored) {
    addIndex(entry.index);
    addIndex(entry.index - 1);
    addIndex(entry.index + 1);
  }

  for (
    let index = lines.length - 1;
    index >= 0 && selected.size < lineLimit;
    index -= 1
  ) {
    addIndex(index);
  }

  for (
    let index = 0;
    index < lines.length && selected.size < lineLimit;
    index += 1
  ) {
    addIndex(index);
  }

  const ordered = [...selected].sort((left, right) => left - right);
  const excerpt: string[] = [];
  let previousIndex = -1;

  for (const index of ordered) {
    if (previousIndex >= 0 && index - previousIndex > 1) {
      excerpt.push(`[${index - previousIndex - 1} timeline entries omitted]`);
    }

    excerpt.push(lines[index]);
    previousIndex = index;
  }

  return excerpt.join("\n");
}

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

  if (input.enumerateFullTimeline) {
    return `${base}\n\nInstruction: The user asked for a full timeline or ordered list. Answer using every line of the timeline excerpts above in chronological order, and do not stop mid-list unless you run out of evidence.`;
  }

  return `${base}\n\nInstruction: Give a direct answer to the user's question using the briefing and excerpts. Do not paste the entire briefing back unless they explicitly ask for a full recap. Prefer concrete actions and times over repeating appearance details.`;
}

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
    ...input.history.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    {
      role: "user",
      content: input.latestQuestion,
    },
  ];
}

async function countChatTokens(
  model: ContextAwareModel,
  history: readonly LlmChatMessage[],
): Promise<number> {
  const prompt = await model.applyPromptTemplate(history);
  return await model.countTokens(prompt);
}

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

  const queryText = conversation.map((message) => message.content).join("\n");
  const totalTimelineLines = summary.timelineText
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0).length;
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
  let fallbackChat = buildPromptMessages({
    evidenceBlock: buildVideoEvidenceBlock({
      summary,
      queryText,
      summaryCharLimit,
      timelineLineLimit,
      enumerateFullTimeline: fullTimelineAsk,
    }),
    history: priorHistory.slice(historyStartIndex),
    latestQuestion,
  });

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
      return {
        chat: candidateChat,
        maxTokens,
      };
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

    return {
      chat: fallbackChat,
      maxTokens,
    };
  }
}

export async function answerQuestionAboutVideo(input: {
  readonly jobId: string;
  readonly question: string;
  readonly messages?: readonly VideoWatchChatMessage[];
}): Promise<{ answer: string; modelKey: string }> {
  const summary = await readSummaryForJob(input.jobId);
  if (!summary) {
    throw new Error("Video analysis is not ready yet");
  }

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
  if (!answer) {
    throw new Error("LM Studio returned an empty answer");
  }

  return {
    answer,
    modelKey: resolvedSummaryModelKey,
  };
}
