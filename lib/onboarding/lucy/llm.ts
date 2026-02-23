import { LUCY_CONVERSATIONAL_SYSTEM_PROMPT } from "@/lib/onboarding/lucy/systemPrompt";
import type { LucyMessage } from "@/lib/onboarding/lucy/types";

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
};

function isConversationalLlmEnabled(): boolean {
  const enabled = process.env.LUCY_LLM_ENABLED?.trim().toLowerCase();
  return enabled === "1" || enabled === "true" || enabled === "yes" || enabled === "on";
}

function resolveModel(): string {
  return process.env.LUCY_LLM_MODEL?.trim() || "gpt-4.1-mini";
}

function buildHistory(messages: LucyMessage[]): string {
  const relevant = messages.slice(-12);
  return relevant
    .map((message) => `${message.role === "assistant" ? "Lucy" : "User"}: ${message.content}`)
    .join("\n");
}

function extractOutputText(payload: OpenAIResponse): string | null {
  if (payload.output_text && payload.output_text.trim().length > 0) {
    return payload.output_text.trim();
  }
  const chunks = payload.output?.flatMap((item) => item.content ?? []) ?? [];
  const text = chunks
    .map((chunk) => (chunk.type === "output_text" || chunk.type === "text" ? chunk.text ?? "" : ""))
    .join("")
    .trim();
  return text.length > 0 ? text : null;
}

export async function maybeGenerateLucyAssistantMessage(input: {
  messages: LucyMessage[];
  draft: string;
  intent: string;
  uncoveredFields: string[];
}): Promise<string | null> {
  if (!isConversationalLlmEnabled()) return null;
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const history = buildHistory(input.messages);
  const model = resolveModel();
  const prompt = [
    "Conversation history:",
    history || "(no prior history)",
    "",
    `Intent: ${input.intent}`,
    `Uncovered fields: ${input.uncoveredFields.join(", ") || "none"}`,
    "",
    `Draft reply: ${input.draft}`,
    "",
    "Rewrite the draft to sound natural, warm, and concise. Keep meaning and intent intact. Return only the message."
  ].join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: LUCY_CONVERSATIONAL_SYSTEM_PROMPT }]
          },
          {
            role: "user",
            content: [{ type: "input_text", text: prompt }]
          }
        ],
        max_output_tokens: 140,
        temperature: 0.6
      })
    });

    if (!response.ok) return null;
    const payload = (await response.json()) as OpenAIResponse;
    const text = extractOutputText(payload);
    if (!text) return null;
    return text.slice(0, 320);
  } catch {
    return null;
  }
}

