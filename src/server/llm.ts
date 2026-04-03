import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";

// This module abstracts the LLM provider.
// Currently implements Gemini, but structured to allow Anthropic/DeepSeek.

export const tools: FunctionDeclaration[] = [
  {
    name: "read_file",
    description: "Read the contents of a file in the project.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: { type: Type.STRING, description: "Absolute path of the file." },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a file in the project.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: { type: Type.STRING, description: "Absolute path of the file." },
        content: { type: Type.STRING, description: "Content to write." },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "run_command",
    description: "Execute a shell command in the project sandbox.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        command: { type: Type.STRING, description: "Command to execute." },
      },
      required: ["command"],
    },
  },
];

export class LLMRouter {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  createChatSession(systemInstruction: string) {
    // In the future, check process.env.DEFAULT_LLM to route to Anthropic/DeepSeek
    return this.ai.chats.create({
      model: "gemini-3.1-pro-preview",
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: tools }],
      },
    });
  }
}
